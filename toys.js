/* =========================================================
   Playful extras: 3D toys, small games and hidden shards.
   Plain JavaScript, no libraries. A tiny canvas 3D renderer
   (flat-shaded polyhedra, painter's algorithm) drives the toys,
   and every colour is read from the site's own CSS tokens.
   ========================================================= */
(() => {
    'use strict';

    const root = document.documentElement;
    const $ = (s, c = document) => c.querySelector(s);
    const $$ = (s, c = document) => [...c.querySelectorAll(s)];
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
    const hoverMQ = window.matchMedia('(hover: hover) and (pointer: fine)');

    const TAU = Math.PI * 2;
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const rand = (a, b) => a + Math.random() * (b - a);
    const pick = (arr) => arr[(Math.random() * arr.length) | 0];
    const store = {
        get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
        set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* storage can be blocked */ } }
    };

    /* ---------- Theme tokens, straight from styles.css ---------- */
    const cssVar = (n, fb) => (getComputedStyle(root).getPropertyValue(n).trim() || fb);
    const hex2rgb = (h) => {
        h = h.replace('#', '');
        if (h.length === 3) h = h.split('').map((c) => c + c).join('');
        const n = parseInt(h, 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    const AMBER = hex2rgb(cssVar('--amber', '#ffbe00'));
    const INK = cssVar('--ink', '#141414');
    const rgb = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
    const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

    /* =========================================================
       Tiny 3D maths: 3x3 rotation matrices as flat arrays
       ========================================================= */
    const I3 = () => [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const mul = (a, b) => {
        const r = new Array(9);
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
            }
        }
        return r;
    };
    const transpose = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
    const apply = (m, v) => [
        m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
        m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
        m[6] * v[0] + m[7] * v[1] + m[8] * v[2]
    ];
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    const rotAxis = (x, y, z, a) => {
        const n = Math.hypot(x, y, z) || 1;
        x /= n; y /= n; z /= n;
        const c = Math.cos(a), s = Math.sin(a), t = 1 - c;
        return [
            t * x * x + c, t * x * y - s * z, t * x * z + s * y,
            t * x * y + s * z, t * y * y + c, t * y * z - s * x,
            t * x * z - s * y, t * y * z + s * x, t * z * z + c
        ];
    };
    // Keep the matrix a true rotation after many small multiplications
    const ortho = (m) => {
        let x = norm([m[0], m[1], m[2]]);
        let z = norm(cross(x, [m[3], m[4], m[5]]));
        let y = cross(z, x);
        return [x[0], x[1], x[2], y[0], y[1], y[2], z[0], z[1], z[2]];
    };
    const randomRot = () => ortho(mul(rotAxis(rand(-1, 1), rand(-1, 1), rand(-1, 1), rand(0, TAU)), I3()));
    const axisAngle = (m) => {
        const th = Math.acos(clamp((m[0] + m[4] + m[8] - 1) / 2, -1, 1));
        const ax = [m[7] - m[5], m[2] - m[6], m[3] - m[1]];
        const s = Math.hypot(ax[0], ax[1], ax[2]);
        if (s < 1e-5) return th < 1 ? { axis: [0, 1, 0], th: 0 } : { axis: [0, 1, 0], th: Math.PI };
        return { axis: [ax[0] / s, ax[1] / s, ax[2] / s], th };
    };
    const alignZ = (n) => {
        if (n[2] > 0.9999) return I3();
        if (n[2] < -0.9999) return rotAxis(0, 1, 0, Math.PI);
        const ax = cross(n, [0, 0, 1]);
        return rotAxis(ax[0], ax[1], ax[2], Math.acos(n[2]));
    };

    /* =========================================================
       Meshes. A face is { p: points, n: normal, c: centre }.
       ========================================================= */
    function solid(verts, radius = 1) {
        verts = verts.map((v) => { const n = norm(v); return [n[0] * radius, n[1] * radius, n[2] * radius]; });
        const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        let edge = Infinity;
        for (let i = 0; i < verts.length; i++) for (let j = i + 1; j < verts.length; j++) edge = Math.min(edge, dist(verts[i], verts[j]));
        const faces = [];
        for (let i = 0; i < verts.length; i++) {
            for (let j = i + 1; j < verts.length; j++) {
                for (let k = j + 1; k < verts.length; k++) {
                    const a = verts[i]; let b = verts[j]; let c = verts[k];
                    if (dist(a, b) > edge * 1.01 || dist(b, c) > edge * 1.01 || dist(a, c) > edge * 1.01) continue;
                    let n = norm(cross(sub(b, a), sub(c, a)));
                    const ctr = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
                    if (dot(n, ctr) < 0) { n = [-n[0], -n[1], -n[2]]; const t = b; b = c; c = t; }
                    faces.push({ p: [a, b, c], n, c: ctr });
                }
            }
        }
        return { faces, rad: radius };
    }

    const PHI = (1 + Math.sqrt(5)) / 2;
    const octaMesh = () => solid([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]);
    const tetraMesh = () => solid([[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]]);
    const icosaMesh = () => {
        const v = [];
        [-1, 1].forEach((a) => [-1, 1].forEach((b) => {
            v.push([0, a, b * PHI], [a, b * PHI, 0], [b * PHI, 0, a]);
        }));
        return solid(v);
    };

    // Cube with a die value on every face
    function cubeMesh(h = 0.62) {
        const defs = [
            { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], val: 1 },
            { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], val: 2 },
            { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], val: 3 },
            { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], val: 4 },
            { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], val: 5 },
            { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], val: 6 }
        ];
        const faces = defs.map((f) => {
            const c = f.n.map((x) => x * h);
            const P = (a, b) => [
                c[0] + f.u[0] * h * a + f.v[0] * h * b,
                c[1] + f.u[1] * h * a + f.v[1] * h * b,
                c[2] + f.u[2] * h * a + f.v[2] * h * b
            ];
            return { p: [P(-1, -1), P(1, -1), P(1, 1), P(-1, 1)], n: f.n, c, u: f.u, v: f.v, val: f.val, h };
        });
        return { faces, rad: h * Math.sqrt(3) };
    }

    // A donut lying flat on the XZ plane
    function torusMesh(N = 36, M = 16, R = 1, r = 0.38, scale = 0.78) {
        const pt = (th, ph) => [
            (R + r * Math.cos(ph)) * Math.cos(th) * scale,
            r * Math.sin(ph) * scale,
            (R + r * Math.cos(ph)) * Math.sin(th) * scale
        ];
        const faces = [];
        for (let i = 0; i < N; i++) {
            for (let j = 0; j < M; j++) {
                const t0 = (i / N) * TAU, t1 = ((i + 1) / N) * TAU, p0 = (j / M) * TAU, p1 = ((j + 1) / M) * TAU;
                const tm = (t0 + t1) / 2, pm = (p0 + p1) / 2;
                faces.push({
                    p: [pt(t0, p0), pt(t1, p0), pt(t1, p1), pt(t0, p1)],
                    n: [Math.cos(pm) * Math.cos(tm), Math.sin(pm), Math.cos(pm) * Math.sin(tm)],
                    c: pt(tm, pm)
                });
            }
        }
        return { faces, rad: (R + r) * scale, smooth: true };
    }

    const MESH = { cube: cubeMesh(), octa: octaMesh(), tetra: tetraMesh(), icosa: icosaMesh() };
    MESH.torus = torusMesh();
    MESH.torusLo = torusMesh(24, 12);

    const PIPS = {
        1: [[0, 0]],
        2: [[-0.5, 0.5], [0.5, -0.5]],
        3: [[-0.5, 0.5], [0, 0], [0.5, -0.5]],
        4: [[-0.5, 0.5], [0.5, 0.5], [-0.5, -0.5], [0.5, -0.5]],
        5: [[-0.5, 0.5], [0.5, 0.5], [0, 0], [-0.5, -0.5], [0.5, -0.5]],
        6: [[-0.5, 0.55], [0.5, 0.55], [-0.5, 0], [0.5, 0], [-0.5, -0.55], [0.5, -0.55]]
    };

    /* =========================================================
       Renderer: flat shading, three palettes from the brand
       ========================================================= */
    const CAM = 4.2;
    const LIGHT = norm([-0.35, 0.65, 0.68]);
    const RAMPS = {
        amber: { lo: [112, 58, 6], mid: AMBER, hi: [255, 233, 150], edge: 'rgba(20,20,20,.28)' },
        graphite: { lo: [20, 20, 21], mid: [58, 58, 60], hi: [132, 132, 134], edge: rgb(AMBER, 0.5) }
    };
    const shade = (ramp, t) => (t < 0.62 ? mix(ramp.lo, ramp.mid, t / 0.62) : mix(ramp.mid, ramp.hi, (t - 0.62) / 0.38));

    function drawMesh(ctx, mesh, R, cx, cy, S, style, o = {}) {
        const list = [];
        for (const f of mesh.faces) {
            const n = apply(R, f.n);
            const c = apply(R, f.c);
            const vis = n[0] * -c[0] + n[1] * -c[1] + n[2] * (CAM - c[2]) > 0;
            if (!vis && style !== 'glass') continue;
            list.push({ f, n, c, vis });
        }
        list.sort((a, b) => a.c[2] - b.c[2]);

        const P = (q) => { const k = CAM / (CAM - q[2]); return [cx + q[0] * S * k, cy - q[1] * S * k]; };
        const round = Math.max(1, S * (o.soft === undefined ? 0.07 : o.soft));
        const ramp = RAMPS[style];

        ctx.lineJoin = 'round';
        for (const it of list) {
            const pts = it.f.p.map((p) => P(apply(R, p)));
            const lam = Math.max(0, dot(it.n, LIGHT));
            ctx.beginPath();
            ctx.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
            ctx.closePath();

            if (style === 'glass') {
                ctx.fillStyle = it.vis ? `rgba(255,255,255,${0.1 + 0.2 * lam})` : 'rgba(255,255,255,.04)';
                ctx.fill();
                ctx.lineWidth = 1.2;
                ctx.strokeStyle = it.vis ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.22)';
                ctx.stroke();
                continue;
            }

            const col = rgb(shade(ramp, 0.2 + 0.8 * lam));
            if (!mesh.smooth) {
                // rounded corners: stroke with the fill colour
                ctx.lineWidth = round;
                ctx.strokeStyle = col;
                ctx.stroke();
            } else {
                ctx.lineWidth = 1;
                ctx.strokeStyle = col;
                ctx.stroke();
            }
            ctx.fillStyle = col;
            ctx.fill();
            if (!mesh.smooth) {
                ctx.lineWidth = 1;
                ctx.strokeStyle = ramp.edge;
                ctx.stroke();
            }

            if (o.pips && it.f.val && it.vis) {
                const cR = it.c, uR = apply(R, it.f.u), vR = apply(R, it.f.v), h = it.f.h;
                const pc = P(cR);
                const pu = P([cR[0] + uR[0] * h, cR[1] + uR[1] * h, cR[2] + uR[2] * h]);
                const pv = P([cR[0] + vR[0] * h, cR[1] + vR[1] * h, cR[2] + vR[2] * h]);
                ctx.save();
                ctx.transform(pu[0] - pc[0], pu[1] - pc[1], pv[0] - pc[0], pv[1] - pc[1], pc[0], pc[1]);
                ctx.fillStyle = INK;
                ctx.globalAlpha = 0.92;
                for (const [px, py] of PIPS[it.f.val]) {
                    ctx.beginPath();
                    ctx.arc(px, py, 0.15, 0, TAU);
                    ctx.fill();
                }
                ctx.restore();
            }
        }
    }

    function fit(cv) {
        const w = cv.clientWidth, h = cv.clientHeight;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const pw = Math.max(1, Math.round(w * dpr)), ph = Math.max(1, Math.round(h * dpr));
        if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
        return { w, h, dpr };
    }

    /* =========================================================
       One animation loop for everything, and only for what is on screen
       ========================================================= */
    const tickers = new Set();
    let raf = 0, lastT = 0;

    function wake() { if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(loop); } }
    function loop(t) {
        raf = 0;
        const dt = Math.min(0.05, Math.max(0, (t - lastT) / 1000));
        lastT = t;
        let more = false;
        for (const k of tickers) if (k.visible && k.step(dt)) more = true;
        if (more) raf = requestAnimationFrame(loop);
    }
    function watch(el, ticker) {
        tickers.add(ticker);
        if (!('IntersectionObserver' in window)) { ticker.visible = true; ticker.dirty = true; wake(); return; }
        ticker.visible = false;
        new IntersectionObserver((entries) => {
            for (const e of entries) {
                ticker.visible = e.isIntersecting;
                if (e.isIntersecting) { ticker.dirty = true; if (ticker.onEnter) ticker.onEnter(); wake(); }
            }
        }, { rootMargin: '80px' }).observe(el);
    }

    /* =========================================================
       Toy3D: a draggable, throwable 3D object on its own canvas
       ========================================================= */
    class Toy3D {
        constructor(canvas, o) {
            this.cv = canvas;
            this.ctx = canvas.getContext('2d');
            this.mesh = o.mesh;
            this.style = o.style || 'amber';
            this.R = o.R || randomRot();
            this.idle = o.idle || [0.2, 0.5];
            this.scale = o.scale || 0.3;
            this.glow = !!o.glow;
            this.pips = !!o.pips;
            this.onTap = o.onTap || null;
            this.w = [this.idle[0], this.idle[1]];
            this.anim = null;
            this.hold = 0;
            this.dragging = false;
            this.dirty = true;
            this.visible = false;
            new ResizeObserver(() => { this.dirty = true; wake(); }).observe(canvas);
            if (o.drag !== false) this.bind();
            watch(canvas, this);
        }

        rotate(a, b) {
            this.R = ortho(mul(mul(rotAxis(0, 1, 0, b), rotAxis(1, 0, 0, a)), this.R));
        }

        bind() {
            const cv = this.cv;
            let id = null, lx = 0, ly = 0, lt = 0, sx = 0, sy = 0, st = 0;
            const K = 0.014;

            cv.addEventListener('pointerdown', (e) => {
                if (e.button > 0) return;
                id = e.pointerId;
                try { cv.setPointerCapture(id); } catch (err) { /* ignore */ }
                this.dragging = true;
                this.anim = null;
                lx = sx = e.clientX; ly = sy = e.clientY;
                lt = st = performance.now();
                this.w = [0, 0];
                cv.classList.add('is-grabbing');
                wake();
            });
            cv.addEventListener('pointermove', (e) => {
                if (!this.dragging || e.pointerId !== id) return;
                const now = performance.now();
                const dx = e.clientX - lx, dy = e.clientY - ly;
                const dt = Math.max(0.008, (now - lt) / 1000);
                this.rotate(dy * K, dx * K);
                this.w = [this.w[0] * 0.4 + ((dy * K) / dt) * 0.6, this.w[1] * 0.4 + ((dx * K) / dt) * 0.6];
                lx = e.clientX; ly = e.clientY; lt = now;
                this.dirty = true;
                wake();
            });
            const end = (e) => {
                if (!this.dragging || e.pointerId !== id) return;
                this.dragging = false;
                cv.classList.remove('is-grabbing');
                const now = performance.now();
                const moved = Math.hypot(e.clientX - sx, e.clientY - sy);
                if (e.type === 'pointerup' && moved < 6 && now - st < 400 && this.onTap) this.onTap();
                if (now - lt > 90) this.w = [0, 0];
                else this.w = [clamp(this.w[0], -14, 14), clamp(this.w[1], -14, 14)];
                wake();
            };
            cv.addEventListener('pointerup', end);
            cv.addEventListener('pointercancel', end);
        }

        // Spin to a given orientation, with extra turns on the way
        spinTo(T, dur = 1.25) {
            const rel = axisAngle(mul(T, transpose(this.R)));
            this.anim = {
                t: 0, dur, T, R0: this.R, axis: rel.axis, th: rel.th,
                extraAxis: norm([rand(-1, 1), rand(-1, 1), rand(-0.4, 0.4)]),
                extra: TAU * (reduceMQ.matches ? 0 : 2)
            };
            wake();
        }

        step(dt) {
            let moving = false;
            const a = this.anim;
            if (a) {
                a.t = Math.min(1, a.t + dt / (reduceMQ.matches ? 0.35 : a.dur));
                const e = 1 - Math.pow(1 - a.t, 3);
                this.R = ortho(mul(rotAxis(a.extraAxis[0], a.extraAxis[1], a.extraAxis[2], a.extra * e), mul(rotAxis(a.axis[0], a.axis[1], a.axis[2], a.th * e), a.R0)));
                if (a.t >= 1) { this.R = a.T; this.anim = null; this.w = [0, 0]; this.hold = 2.6; }
                moving = true;
            } else if (!this.dragging) {
                if (this.hold > 0) this.hold -= dt;
                const idle = reduceMQ.matches || this.hold > 0 ? [0, 0] : this.idle;
                const k = 1 - Math.exp(-dt * 1.4);
                this.w[0] += (idle[0] - this.w[0]) * k;
                this.w[1] += (idle[1] - this.w[1]) * k;
                if (Math.abs(this.w[0]) > 0.002 || Math.abs(this.w[1]) > 0.002) {
                    this.rotate(this.w[0] * dt, this.w[1] * dt);
                    moving = true;
                } else if (this.hold > 0) moving = true;
            }
            if (moving || this.dirty || this.dragging) { this.draw(); this.dirty = false; }
            return moving || this.dragging;
        }

        draw() {
            const { w, h, dpr } = fit(this.cv);
            if (!w || !h) return;
            const c = this.ctx;
            c.setTransform(dpr, 0, 0, dpr, 0, 0);
            c.clearRect(0, 0, w, h);
            const S = Math.min(w, h) * this.scale;
            if (this.glow) {
                const g = c.createRadialGradient(w / 2, h / 2, S * 0.2, w / 2, h / 2, S * 1.8);
                g.addColorStop(0, rgb(AMBER, 0.2));
                g.addColorStop(1, rgb(AMBER, 0));
                c.fillStyle = g;
                c.fillRect(0, 0, w, h);
            }
            drawMesh(c, this.mesh, this.R, w / 2, h / 2, S, this.style, { pips: this.pips });
        }
    }

    /* =========================================================
       Hero toys: a die that rolls your tools, and a glass icosahedron
       ========================================================= */
    const TILT = mul(rotAxis(0, 1, 0, -0.55), rotAxis(1, 0, 0, 0.5));
    const DIE_LANGS = ['C#', 'C++', 'Python', 'JavaScript', 'Kotlin', 'Dart'];

    function initHeroToys() {
        const dieCv = $('#dieCanvas');
        const icoCv = $('#icoCanvas');

        if (dieCv) {
            const cap = $('#dieCap');
            let rolling = false;
            const die = new Toy3D(dieCv, {
                mesh: MESH.cube, style: 'amber', pips: true, scale: 0.35, glow: true,
                R: mul(TILT, mul(rotAxis(0, 0, 1, 0.2), I3())), idle: [0.05, 0.22],
                onTap: () => roll()
            });
            function roll() {
                if (rolling) return;
                rolling = true;
                const val = 1 + ((Math.random() * 6) | 0);
                const face = MESH.cube.faces.find((f) => f.val === val);
                const A = mul(rotAxis(0, 0, 1, ((Math.random() * 4) | 0) * (Math.PI / 2)), alignZ(face.n));
                die.spinTo(mul(TILT, A), 1.3);
                if (cap) cap.textContent = 'Rolling...';
                setTimeout(() => {
                    rolling = false;
                    if (cap) {
                        cap.textContent = '';
                        const b = document.createElement('b');
                        b.textContent = String(val);
                        cap.append('Rolled ', b, ' · ' + DIE_LANGS[val - 1]);
                    }
                }, reduceMQ.matches ? 350 : 1300);
            }
            dieCv.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); roll(); }
            });
        }

        if (icoCv) {
            const styles = ['glass', 'amber', 'graphite'];
            let si = 0;
            const ico = new Toy3D(icoCv, {
                mesh: MESH.icosa, style: 'glass', scale: 0.34, glow: false, idle: [0.18, 0.42],
                onTap: () => { si = (si + 1) % styles.length; ico.style = styles[si]; ico.dirty = true; wake(); }
            });
        }
    }

    /* =========================================================
       Physics playground (banner and the celebration)
       ========================================================= */
    const KINDS = ['cube', 'octa', 'tetra', 'icosa', 'torusLo'];
    const STYLES = ['graphite', 'graphite', 'glass', 'amber', 'glass'];
    const easeBack = (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

    class World {
        constructor(cv, o = {}) {
            this.cv = cv;
            this.ctx = cv.getContext('2d');
            this.bodies = [];
            this.max = o.max || 28;
            this.life = o.life || 0;
            this.g = o.g || 2100;
            this.onChange = o.onChange || null;
            this.onEmpty = o.onEmpty || null;
            this.visible = !!o.alwaysOn;
            this.dirty = true;
            this.W = 0; this.H = 0;
            tickers.add(this);
            if (!o.alwaysOn) watch(o.watchEl || cv, this);
        }

        spawn(x, y, o = {}) {
            const alive = this.bodies.filter((b) => !b.dying);
            if (alive.length >= this.max) alive[0].dying = true;
            this.bodies.push({
                x, y,
                vx: o.vx !== undefined ? o.vx : rand(-280, 280),
                vy: o.vy !== undefined ? o.vy : rand(-980, -560),
                r: o.r || rand(26, 42),
                mesh: MESH[o.kind || pick(KINDS)],
                R: randomRot(),
                w: [rand(-4, 4), rand(-5, 5)],
                style: o.style || pick(STYLES),
                k: 0, age: 0, dying: false, nt: 0, on: false
            });
            if (this.onChange) this.onChange();
            this.dirty = true;
            wake();
        }

        clear() {
            this.bodies.forEach((b) => { b.dying = true; });
            if (this.onChange) this.onChange();
            wake();
        }

        nudge(x, y, vx, vy) {
            const sp = Math.hypot(vx, vy);
            if (sp < 40) return;
            const now = performance.now();
            let hit = false;
            for (const b of this.bodies) {
                if (b.dying || now < b.nt) continue;
                const dx = b.x - x, dy = b.y - y, d = Math.hypot(dx, dy);
                if (d < b.r + 26) {
                    const nx = d ? dx / d : 0, ny = d ? dy / d : -1;
                    const push = Math.min(900, sp * 0.45 + 140);
                    b.vx += nx * push;
                    b.vy += ny * push - 180;
                    b.w[1] += nx * 6; b.w[0] += ny * 6;
                    b.nt = now + 120;
                    hit = true;
                }
            }
            if (hit) wake();
        }

        step(dt) {
            const { w: W, h: H } = fit(this.cv);
            this.W = W; this.H = H;
            const bodies = this.bodies;
            if (!bodies.length) {
                if (this.dirty) { this.draw(); this.dirty = false; }
                return false;
            }
            const sub = 2, h = dt / sub;
            for (let s = 0; s < sub; s++) {
                for (const b of bodies) {
                    b.vy += this.g * h;
                    b.x += b.vx * h;
                    b.y += b.vy * h;
                    if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.6; }
                    if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * 0.6; }
                    b.on = false;
                    if (b.y > H - b.r) {
                        b.y = H - b.r;
                        b.vy = Math.abs(b.vy) > 140 ? -b.vy * 0.5 : 0;
                        b.vx *= 1 - Math.min(1, 3.2 * h);
                        b.on = true;
                    }
                }
                for (let i = 0; i < bodies.length; i++) {
                    for (let j = i + 1; j < bodies.length; j++) {
                        const a = bodies[i], c = bodies[j];
                        const dx = c.x - a.x, dy = c.y - a.y, min = a.r + c.r;
                        if (Math.abs(dx) > min || Math.abs(dy) > min) continue;
                        const d = Math.hypot(dx, dy);
                        if (d >= min || d < 0.001) continue;
                        const nx = dx / d, ny = dy / d, ov = min - d;
                        a.x -= nx * ov / 2; a.y -= ny * ov / 2;
                        c.x += nx * ov / 2; c.y += ny * ov / 2;
                        const vn = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
                        if (vn < 0) {
                            const imp = (-(1 + 0.35) * vn) / 2;
                            a.vx -= imp * nx; a.vy -= imp * ny;
                            c.vx += imp * nx; c.vy += imp * ny;
                        }
                    }
                }
            }

            let active = false;
            for (let i = bodies.length - 1; i >= 0; i--) {
                const b = bodies[i];
                b.age += dt;
                if (this.life && b.age > this.life) b.dying = true;
                if (b.dying) b.k -= dt * 4;
                else if (b.k < 1) b.k = Math.min(1, b.k + dt * 4.5);
                if (b.k <= 0 && b.dying) { bodies.splice(i, 1); if (this.onChange) this.onChange(); continue; }
                const speed = Math.hypot(b.vx, b.vy);
                const damp = Math.exp(-dt * (speed < 30 ? 2.4 : b.on ? 1.2 : 0.3));
                b.w[0] *= damp; b.w[1] *= damp;
                if (Math.abs(b.w[0]) > 0.01 || Math.abs(b.w[1]) > 0.01) {
                    b.R = ortho(mul(mul(rotAxis(0, 1, 0, b.w[1] * dt), rotAxis(1, 0, 0, b.w[0] * dt)), b.R));
                }
                if (speed > 8 || !b.on || Math.abs(b.w[0]) > 0.05 || Math.abs(b.w[1]) > 0.05 || b.k < 1 || b.dying) active = true;
            }
            this.draw();
            this.dirty = false;
            if (!bodies.length && this.onEmpty) this.onEmpty();
            return active;
        }

        draw() {
            const { w, h, dpr } = fit(this.cv);
            const c = this.ctx;
            c.setTransform(dpr, 0, 0, dpr, 0, 0);
            c.clearRect(0, 0, w, h);
            for (const b of this.bodies) {
                const k = b.dying ? Math.max(0, b.k) : easeBack(Math.min(1, b.k));
                if (k <= 0) continue;
                c.globalAlpha = b.dying ? Math.max(0, b.k) : 1;
                drawMesh(c, b.mesh, b.R, b.x, b.y, b.r * 0.78 * k, b.style, { soft: 0.08 });
            }
            c.globalAlpha = 1;
        }
    }

    function initStageToys() {
        const stage = $('.stage');
        const cv = $('#stageToys');
        if (!stage || !cv) return;
        const ui = $('#stageUi');
        const hint = $('#stageHint');
        const clear = $('#stageClear');

        const sync = () => {
            const n = world.bodies.filter((b) => !b.dying).length;
            if (clear) clear.hidden = n === 0;
            if (ui) ui.classList.toggle('is-solo', n === 0);
        };
        const world = new World(cv, { max: 26, watchEl: stage, onChange: sync });
        if (hint) hint.textContent = hoverMQ.matches ? 'Click anywhere to drop a toy, hover to nudge' : 'Tap anywhere to drop a toy';

        stage.addEventListener('click', (e) => {
            if (e.target.closest('a, button')) return;
            const r = stage.getBoundingClientRect();
            world.spawn(e.clientX - r.left, e.clientY - r.top, { vy: rand(-700, -260) });
        });
        if (clear) clear.addEventListener('click', () => world.clear());

        let px = 0, py = 0, pt = 0;
        stage.addEventListener('pointermove', (e) => {
            if (e.pointerType === 'touch') return;
            const r = stage.getBoundingClientRect();
            const x = e.clientX - r.left, y = e.clientY - r.top, now = performance.now();
            const dt = Math.max(0.008, (now - pt) / 1000);
            if (pt) world.nudge(x, y, (x - px) / dt, (y - py) / dt);
            px = x; py = y; pt = now;
        });

        // A little demo the first time the banner scrolls into view
        let shown = false;
        world.onEnter = () => {
            if (shown || reduceMQ.matches) return;
            shown = true;
            const w = world.W || stage.clientWidth;
            [0.32, 0.5, 0.68].forEach((f, i) => setTimeout(() => world.spawn(w * f, stage.clientHeight * 0.55, { vy: rand(-820, -520), vx: rand(-120, 120) }), 350 + i * 260));
        };
    }

    // Confetti of toys when every shard is found
    let cele = null;
    function celebrate() {
        if (reduceMQ.matches) return;
        if (!cele) {
            const cv = document.createElement('canvas');
            cv.className = 'celebrate';
            cv.setAttribute('aria-hidden', 'true');
            document.body.appendChild(cv);
            const w = new World(cv, {
                max: 60, life: 5, alwaysOn: true, g: 1500,
                onEmpty: () => { cv.remove(); tickers.delete(w); cele = null; }
            });
            cele = w;
        }
        const w = cele;
        for (let i = 0; i < 34; i++) {
            setTimeout(() => {
                if (cele === w) w.spawn(rand(30, (w.cv.clientWidth || window.innerWidth) - 30), -40, { vx: rand(-220, 220), vy: rand(0, 260), r: rand(16, 30) });
            }, i * 65);
        }
    }

    /* =========================================================
       Contact toy: a donut orbiting the ring
       ========================================================= */
    function initCtaToy() {
        const cv = $('#ctaToy');
        if (!cv) return;
        const t = new Toy3D(cv, {
            mesh: MESH.torus, style: 'amber', scale: 0.33, glow: true,
            R: mul(rotAxis(1, 0, 0, 1.05), rotAxis(0, 0, 1, 0.4)), idle: [0.28, 0.32]
        });
        void t;
    }

    /* =========================================================
       Game 1: Stack. Time each drop, build the tallest tower.
       ========================================================= */
    function initStack() {
        const box = $('#stackGame');
        if (!box) return;
        const cv = $('canvas', box);
        const ctx = cv.getContext('2d');
        const elScore = $('[data-stack="score"]', box);
        const elBest = $('[data-stack="best"]', box);
        const elCombo = $('[data-stack="combo"]', box);
        const overlay = $('.play-overlay', box);
        const ovTitle = $('h4', overlay);
        const ovText = $('p', overlay);

        const COS = Math.cos(Math.PI / 6), SIN = 0.5;
        const BH = 0.2, BASE = 1.1, AMP = 1.45;
        const g = { mode: 'ready', blocks: [], falling: [], fx: [], cur: null, phase: 0, speed: 2, score: 0, combo: 0, camY: 0, camYT: 0, camX: 0, camXT: 0, visible: false, dirty: true };
        let best = parseInt(store.get('va-stack-best'), 10) || 0;
        elBest.textContent = String(best);

        function lvlColor(l) {
            const a = 0.5 + 0.5 * Math.sin(l * 0.45);
            const b = 0.5 + 0.5 * Math.sin(l * 0.45 + 1.3);
            return { h: 36 + 14 * a, l: 50 + 8 * b };
        }

        function reset() {
            g.blocks = [{ x: 0, z: 0, w: BASE, d: BASE, y: BH, lvl: 0 }];
            g.falling = []; g.fx = []; g.cur = null;
            g.score = 0; g.combo = 0; g.camY = 0; g.camYT = 0; g.camX = 0; g.camXT = 0;
            g.mode = 'ready';
            hud();
            overlay.classList.remove('is-off');
            ovTitle.textContent = 'Stack the build';
            ovText.textContent = 'Click, tap or press Space to drop each block. Line it up.';
            g.dirty = true; wake();
        }
        function hud() {
            elScore.textContent = String(g.score);
            elBest.textContent = String(best);
            elCombo.textContent = g.combo > 1 ? 'x' + g.combo : '-';
        }
        function spawn() {
            const top = g.blocks[g.blocks.length - 1];
            const lvl = top.lvl + 1;
            const axis = lvl % 2 ? 'x' : 'z';
            g.cur = { x: top.x, z: top.z, w: top.w, d: top.d, y: top.y + BH, lvl, axis };
            g.phase = -Math.PI / 2;
            g.speed = Math.min(4.6, 1.9 + lvl * 0.085);
            g.cur[axis] = top[axis] + AMP * Math.sin(g.phase);
        }
        function start() {
            g.mode = 'play';
            overlay.classList.add('is-off');
            spawn();
            wake();
        }
        function over() {
            g.mode = 'over';
            const fresh = g.score > best;
            if (fresh) { best = g.score; store.set('va-stack-best', String(best)); }
            hud();
            ovTitle.textContent = fresh && g.score > 0 ? 'New best: ' + g.score : 'Tower height: ' + g.score;
            ovText.textContent = 'Click, tap or press Space to try again.';
            setTimeout(() => { if (g.mode === 'over') overlay.classList.remove('is-off'); }, 650);
        }
        function drop() {
            const top = g.blocks[g.blocks.length - 1];
            const cur = g.cur;
            const ax = cur.axis, len = ax === 'x' ? 'w' : 'd';
            const L = top[len], tc = top[ax], delta = cur[ax] - tc;
            const lo = Math.max(tc - L / 2, cur[ax] - L / 2), hi = Math.min(tc + L / 2, cur[ax] + L / 2);
            if (hi - lo <= 0.0001) {
                g.falling.push({ ...cur, vy: 0, vx: 0 });
                g.cur = null;
                over();
                return;
            }
            const nb = { ...cur };
            if (Math.abs(delta) < 0.05) {
                nb[ax] = tc;
                g.combo++;
                g.fx.push({ x: nb.x, z: nb.z, w: nb.w, d: nb.d, y: nb.y, t: 0 });
                if (g.combo >= 3) nb[len] = Math.min(BASE, nb[len] + 0.05);
            } else {
                g.combo = 0;
                nb[len] = hi - lo;
                nb[ax] = (lo + hi) / 2;
                const a = delta > 0 ? hi : cur[ax] - L / 2;
                const b = delta > 0 ? cur[ax] + L / 2 : lo;
                g.falling.push({ ...cur, [ax]: (a + b) / 2, [len]: b - a, vy: 0, vx: Math.sign(delta) * 0.5 });
            }
            g.blocks.push(nb);
            g.score++;
            g.camYT = Math.max(0, nb.lvl * BH - 0.7);
            hud();
            spawn();
        }
        function act() {
            if (g.mode === 'ready') start();
            else if (g.mode === 'over') { reset(); start(); }
            else if (g.mode === 'play' && g.cur) drop();
            g.dirty = true; wake();
        }

        let mouseDown = false;
        box.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse') { if (e.button !== 0) return; mouseDown = true; act(); }
        });
        box.addEventListener('click', () => { if (mouseDown) { mouseDown = false; return; } act(); });
        box.addEventListener('keydown', (e) => {
            if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); act(); }
        });

        g.step = function (dt) {
            const top = g.blocks[g.blocks.length - 1];
            let anim = false;
            if (g.mode === 'play' && g.cur) {
                g.phase += dt * g.speed;
                g.cur[g.cur.axis] = top[g.cur.axis] + AMP * Math.sin(g.phase);
                anim = true;
            }
            const k = 1 - Math.exp(-dt * 4.5);
            const tx = (top.x - top.z) * COS;
            g.camXT = tx;
            g.camY += (g.camYT - g.camY) * k;
            g.camX += (g.camXT - g.camX) * k;
            if (Math.abs(g.camYT - g.camY) > 0.001 || Math.abs(g.camXT - g.camX) > 0.001) anim = true;
            for (let i = g.falling.length - 1; i >= 0; i--) {
                const f = g.falling[i];
                f.vy -= 14 * dt; f.y += f.vy * dt;
                f.x += (f.axis === 'x' ? f.vx : 0) * dt; f.z += (f.axis === 'z' ? f.vx : 0) * dt;
                if (f.y < top.y - 4.5) g.falling.splice(i, 1);
            }
            if (g.falling.length) anim = true;
            for (let i = g.fx.length - 1; i >= 0; i--) {
                g.fx[i].t += dt * 2.4;
                if (g.fx[i].t >= 1) g.fx.splice(i, 1);
            }
            if (g.fx.length) anim = true;
            if (anim || g.dirty) { draw(); g.dirty = false; }
            return anim;
        };

        function draw() {
            const { w, h, dpr } = fit(cv);
            if (!w || !h) return;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, w, h);
            const U = Math.min(w * 0.27, h * 0.36);
            const X = (x, z) => w / 2 + ((x - z) * COS - g.camX) * U;
            const Y = (x, y, z) => h * 0.8 + (x + z) * SIN * U - (y - g.camY) * U;

            // soft ground shadow under the base
            const base = g.blocks[0];
            ctx.fillStyle = 'rgba(0,0,0,.28)';
            ctx.beginPath();
            ctx.ellipse(X(base.x, base.z), Y(base.x, 0, base.z) + 4, U * 1.15, U * 0.5, 0, 0, TAU);
            ctx.fill();

            const poly = (pts, fill) => {
                ctx.beginPath();
                ctx.moveTo(pts[0][0], pts[0][1]);
                for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
                ctx.closePath();
                ctx.fillStyle = fill;
                ctx.strokeStyle = fill;
                ctx.lineWidth = 1.5;
                ctx.lineJoin = 'round';
                ctx.stroke();
                ctx.fill();
                ctx.lineWidth = 1;
                ctx.strokeStyle = 'rgba(20,20,20,.28)';
                ctx.stroke();
            };
            const block = (b, alpha = 1) => {
                const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
                const yt = b.y, yb = b.y - BH;
                const A = [X(x0, z0), Y(x0, yt, z0)], B = [X(x1, z0), Y(x1, yt, z0)];
                const C = [X(x1, z1), Y(x1, yt, z1)], D = [X(x0, z1), Y(x0, yt, z1)];
                const Cb = [X(x1, z1), Y(x1, yb, z1)], Db = [X(x0, z1), Y(x0, yb, z1)], Bb = [X(x1, z0), Y(x1, yb, z0)];
                let top, left, right;
                if (b.lvl === 0) { top = '#4c4c4e'; left = '#363637'; right = '#262627'; }
                else {
                    const c = lvlColor(b.lvl);
                    top = `hsl(${c.h},100%,${c.l + 6}%)`;
                    left = `hsl(${c.h},96%,${c.l - 6}%)`;
                    right = `hsl(${c.h},92%,${c.l - 18}%)`;
                }
                ctx.globalAlpha = alpha;
                poly([D, C, Cb, Db], left);
                poly([C, B, Bb, Cb], right);
                poly([A, B, C, D], top);
                ctx.globalAlpha = 1;
            };

            g.blocks.forEach((b) => block(b));
            if (g.cur) block(g.cur);
            g.falling.forEach((f) => block(f, clamp(1 - (top0(f) - f.y) / 3, 0, 1)));
            function top0() { return g.blocks[g.blocks.length - 1].y; }

            for (const f of g.fx) {
                const s = 1 + f.t * 0.4, hw = (f.w * s) / 2, hd = (f.d * s) / 2;
                ctx.strokeStyle = `rgba(255,255,255,${1 - f.t})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(X(f.x - hw, f.z - hd), Y(f.x - hw, f.y, f.z - hd));
                ctx.lineTo(X(f.x + hw, f.z - hd), Y(f.x + hw, f.y, f.z - hd));
                ctx.lineTo(X(f.x + hw, f.z + hd), Y(f.x + hw, f.y, f.z + hd));
                ctx.lineTo(X(f.x - hw, f.z + hd), Y(f.x - hw, f.y, f.z + hd));
                ctx.closePath();
                ctx.stroke();
            }
        }

        new ResizeObserver(() => { g.dirty = true; wake(); }).observe(cv);
        watch(box, g);
        reset();
    }

    /* =========================================================
       Game 2: Patch the bugs. A security-flavoured whack-a-mole.
       ========================================================= */
    function initBugs() {
        const box = $('#bugGame');
        if (!box) return;
        const grid = $('.bug-grid', box);
        const elScore = $('[data-bug="score"]', box);
        const elTime = $('[data-bug="time"]', box);
        const elBest = $('[data-bug="best"]', box);
        const overlay = $('.play-overlay', box);
        const ovTitle = $('h4', overlay);
        const ovText = $('p', overlay);
        const ovBtn = $('button', overlay);

        const TYPES = {
            bug: { pts: 1, icon: '#i-bug', label: 'bug' },
            crit: { pts: 3, icon: '#i-bug', label: 'critical bug' },
            fw: { pts: -2, icon: '#i-shield-check', label: 'firewall, do not hit' }
        };
        const holes = [];
        for (let i = 0; i < 9; i++) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'hole';
            b.setAttribute('aria-label', 'Hole ' + (i + 1));
            b.innerHTML = '<span class="critter"><svg class="icon" aria-hidden="true"><use href="#i-bug"/></svg></span>';
            b.addEventListener('click', () => hit(i));
            grid.appendChild(b);
            holes.push({ el: b, use: $('use', b), type: null, ttl: 0 });
        }

        const g = { mode: 'idle', t: 30, el: 0, score: 0, spawnIn: 0, visible: false, dirty: false };
        let best = parseInt(store.get('va-bug-best'), 10) || 0;
        elBest.textContent = String(best);

        function setHole(i, type) {
            const h = holes[i];
            h.type = type;
            h.el.classList.remove('t-bug', 't-crit', 't-fw', 'is-hit', 'is-up');
            if (type) {
                h.use.setAttribute('href', TYPES[type].icon);
                h.el.classList.add('t-' + type, 'is-up');
                h.el.setAttribute('aria-label', 'Hole ' + (i + 1) + ': ' + TYPES[type].label);
            } else {
                h.el.setAttribute('aria-label', 'Hole ' + (i + 1));
            }
        }
        function pop(i, text, neg) {
            const s = document.createElement('span');
            s.className = 'pop' + (neg ? ' neg' : '');
            s.textContent = text;
            holes[i].el.appendChild(s);
            setTimeout(() => s.remove(), 750);
        }
        function hit(i) {
            const h = holes[i];
            if (g.mode !== 'run' || !h.type) return;
            const t = TYPES[h.type];
            g.score = Math.max(0, g.score + t.pts);
            pop(i, (t.pts > 0 ? '+' : '') + t.pts, t.pts < 0);
            h.type = null; h.ttl = 0;
            h.el.classList.add('is-hit');
            h.el.classList.remove('is-up');
            setTimeout(() => { if (!h.type) h.el.classList.remove('is-hit', 't-bug', 't-crit', 't-fw'); }, 160);
            elScore.textContent = String(g.score);
        }
        function spawn() {
            const free = holes.map((h, i) => (h.type ? -1 : i)).filter((i) => i >= 0);
            if (!free.length) return;
            const i = pick(free);
            const roll = Math.random();
            const type = g.el < 4 ? (roll < 0.85 ? 'bug' : 'crit') : roll < 0.62 ? 'bug' : roll < 0.8 ? 'crit' : 'fw';
            setHole(i, type);
            const life = clamp(1.3 - g.el * 0.017, 0.58, 1.3);
            holes[i].ttl = type === 'crit' ? life * 0.8 : life;
        }
        function start() {
            holes.forEach((_, i) => setHole(i, null));
            g.mode = 'run'; g.t = 30; g.el = 0; g.score = 0; g.spawnIn = 0.3;
            elScore.textContent = '0'; elTime.textContent = '30';
            overlay.classList.add('is-off');
            wake();
        }
        function end() {
            g.mode = 'over';
            holes.forEach((_, i) => setHole(i, null));
            const fresh = g.score > best;
            if (fresh) { best = g.score; store.set('va-bug-best', String(best)); }
            elBest.textContent = String(best);
            elTime.textContent = '0';
            ovTitle.textContent = fresh && g.score > 0 ? 'New best: ' + g.score : 'Patched: ' + g.score;
            ovText.textContent = g.score >= 30 ? 'Clean release. Ship it.' : g.score >= 15 ? 'Solid patch cycle.' : 'Plenty of bugs left. Run it again?';
            ovBtn.textContent = 'Play again';
            overlay.classList.remove('is-off');
        }
        ovBtn.addEventListener('click', start);

        g.step = function (dt) {
            if (g.mode !== 'run') return false;
            g.t -= dt; g.el += dt;
            elTime.textContent = String(Math.max(0, Math.ceil(g.t)));
            if (g.t <= 0) { end(); return false; }
            g.spawnIn -= dt;
            if (g.spawnIn <= 0) {
                spawn();
                if (g.el > 14 && Math.random() < 0.35) spawn();
                g.spawnIn = clamp(0.8 - g.el * 0.012, 0.34, 0.8);
            }
            holes.forEach((h, i) => {
                if (!h.type) return;
                h.ttl -= dt;
                if (h.ttl <= 0) setHole(i, null);
            });
            return true;
        };
        watch(box, g);
    }

    /* =========================================================
       Hidden shards: seven small gems scattered around the page
       ========================================================= */
    const SHARD_SPOTS = [
        { at: '.stack', css: 'right:9%;top:46px' },
        { at: '#projects .sec-head', css: 'left:62%;top:28%', head: true },
        { at: '#wip .sec-head', css: 'left:58%;top:22%', head: true },
        { at: '.skill:nth-child(3)', css: 'right:12px;top:12px' },
        { at: '#explore .sec-head', css: 'left:64%;top:26%', head: true },
        { at: '.cta', css: 'right:34%;top:6%' },
        { at: '.footer', css: 'right:6px;top:16px' }
    ];

    function initShards() {
        const KEY = 'va-shards';
        const total = SHARD_SPOTS.length;
        let found = new Set();
        try { found = new Set(JSON.parse(store.get(KEY) || '[]')); } catch (e) { found = new Set(); }

        const hud = document.createElement('button');
        hud.type = 'button';
        hud.className = 'shard-hud';
        hud.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-gem"/></svg><span class="shard-count"></span><span class="shard-label">shards</span><span class="shard-tip" role="tooltip">' + total + ' shards are hidden around this page. Find them all.</span>';
        document.body.appendChild(hud);
        const count = $('.shard-count', hud);

        function paint(bump) {
            count.textContent = found.size + '/' + total;
            hud.setAttribute('aria-label', 'Hidden shards: ' + found.size + ' of ' + total + ' found');
            hud.classList.toggle('is-done', found.size === total);
            $('.shard-label', hud).textContent = found.size === total ? 'all found' : 'shards';
            if (bump) { hud.classList.remove('is-bump'); void hud.offsetWidth; hud.classList.add('is-bump'); }
        }
        paint(false);
        hud.addEventListener('click', () => {
            if (found.size === total) celebrate();
            else { hud.classList.add('show-tip'); setTimeout(() => hud.classList.remove('show-tip'), 2600); }
        });

        SHARD_SPOTS.forEach((spot, idx) => {
            if (found.has(idx)) return;
            const host = $(spot.at);
            if (!host) return;
            if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'shard' + (spot.head ? ' shard-head' : '');
            btn.style.cssText = spot.css;
            btn.setAttribute('aria-label', 'Collect hidden shard');
            const cv = document.createElement('canvas');
            btn.appendChild(cv);
            host.appendChild(btn);
            new Toy3D(cv, { mesh: MESH.octa, style: 'amber', scale: 0.3, glow: true, drag: false, R: mul(rotAxis(1, 0, 0, 0.5), I3()), idle: [0, 1.5] });
            btn.addEventListener('click', () => collect(idx, btn, cv));
        });

        function collect(idx, btn, cv) {
            if (found.has(idx)) return;
            found.add(idx);
            store.set(KEY, JSON.stringify([...found]));
            const r = btn.getBoundingClientRect();
            const hr = hud.getBoundingClientRect();
            const ghost = document.createElement('canvas');
            ghost.width = cv.width; ghost.height = cv.height;
            ghost.getContext('2d').drawImage(cv, 0, 0);
            ghost.className = 'shard-ghost';
            ghost.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
            document.body.appendChild(ghost);
            btn.remove();
            const dx = hr.left + 24 - (r.left + r.width / 2), dy = hr.top + hr.height / 2 - (r.top + r.height / 2);
            const done = () => { ghost.remove(); paint(true); if (found.size === total) celebrate(); };
            if (reduceMQ.matches || !ghost.animate) { done(); return; }
            ghost.animate(
                [{ transform: 'translate(0,0) scale(1)', opacity: 1 },
                 { transform: `translate(${dx * 0.5}px,${dy * 0.5 - 60}px) scale(1.5)`, opacity: 1, offset: 0.35 },
                 { transform: `translate(${dx}px,${dy}px) scale(.3)`, opacity: 0.4 }],
                { duration: 780, easing: 'cubic-bezier(.5,0,.2,1)', fill: 'forwards' }
            ).onfinish = done;
        }
    }

    /* =========================================================
       Small touches: 3D card tilt and spinning skill icons
       ========================================================= */
    function initTilt() {
        $$('.tag-icon').forEach((el) => {
            el.addEventListener('click', () => {
                el.classList.remove('is-spin');
                void el.offsetWidth;
                el.classList.add('is-spin');
            });
            el.addEventListener('animationend', () => el.classList.remove('is-spin'));
        });

        if (!hoverMQ.matches || reduceMQ.matches) return;
        $$('.project, .wip-card, .tile, .skill').forEach((card) => {
            card.classList.add('tilt');
            const wide = card.classList.contains('wip-card');
            const maxY = wide ? 2.2 : 5, maxX = wide ? 1.6 : 3.5;
            card.addEventListener('pointermove', (e) => {
                if (e.pointerType !== 'mouse') return;
                const r = card.getBoundingClientRect();
                const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
                card.style.setProperty('--ry', ((px - 0.5) * 2 * maxY).toFixed(2) + 'deg');
                card.style.setProperty('--rx', ((0.5 - py) * 2 * maxX).toFixed(2) + 'deg');
                card.style.setProperty('--gx', (px * 100).toFixed(1) + '%');
                card.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
            });
            card.addEventListener('pointerleave', () => {
                card.style.setProperty('--rx', '0deg');
                card.style.setProperty('--ry', '0deg');
            });
        });
    }

    /* ---------- Go ---------- */
    initHeroToys();
    initStageToys();
    initCtaToy();
    initStack();
    initBugs();
    initShards();
    initTilt();
})();
