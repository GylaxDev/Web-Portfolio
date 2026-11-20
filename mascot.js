/* =========================================================
   Mascot: a yellow lop-eared rabbit built from soft rounded blobs.
   Plain JavaScript and raw WebGL, no libraries. It waves, follows
   the cursor, can be picked up and thrown, has a dozen emotions,
   and works as a small guide for the page (tips, menu, tour).
   Colours come from the site's own tokens in styles.css.
   ========================================================= */
(() => {
    'use strict';

    const root = document.documentElement;
    const $ = (s, c = document) => c.querySelector(s);
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

    const TAU = Math.PI * 2;
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const rand = (a, b) => a + Math.random() * (b - a);
    const pick = (arr) => arr[(Math.random() * arr.length) | 0];
    const lerp = (a, b, t) => a + (b - a) * t;
    const store = {
        get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
        set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* storage can be blocked */ } }
    };

    /* ---------- Theme tokens ---------- */
    const cssVar = (n, fb) => (getComputedStyle(root).getPropertyValue(n).trim() || fb);
    const hex2rgb = (h) => {
        h = h.replace('#', '');
        if (h.length === 3) h = h.split('').map((c) => c + c).join('');
        const n = parseInt(h, 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    const AMBER = hex2rgb(cssVar('--amber', '#ffbe00'));
    const INK = hex2rgb(cssVar('--ink', '#141414'));
    const LO = [205, 124, 8];
    const HI = [255, 224, 104];
    const CORAL = [236, 106, 64];
    const PINK = [244, 124, 132];
    const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    const n3 = (c) => c.map((v) => v / 255);

    /* =========================================================
       Tiny matrix maths (column-major 4x4)
       ========================================================= */
    const I4 = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    function mul(a, b) {
        const o = new Float32Array(16);
        for (let c = 0; c < 4; c++) {
            for (let r = 0; r < 4; r++) {
                let s = 0;
                for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
                o[c * 4 + r] = s;
            }
        }
        return o;
    }
    const mT = (x, y, z) => { const m = I4(); m[12] = x; m[13] = y; m[14] = z; return m; };
    const mS = (x, y, z) => { const m = I4(); m[0] = x; m[5] = y; m[10] = z; return m; };
    const mZ = (a) => { const m = I4(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; };
    const mY = (a) => { const m = I4(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; };
    const mX = (a) => { const m = I4(), c = Math.cos(a), s = Math.sin(a); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; };
    function persp(fov, asp, n, f) {
        const t = 1 / Math.tan(fov / 2), m = new Float32Array(16);
        m[0] = t / asp; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = (2 * f * n) / (n - f);
        return m;
    }
    // A transform that also tracks its rotation-only part, for lighting
    class X {
        constructor(m = I4(), r = I4()) { this.m = m; this.r = r; }
        t(x, y, z) { return new X(mul(this.m, mT(x, y, z)), this.r); }
        s(x, y, z) { return new X(mul(this.m, mS(x, y, z)), this.r); }
        rot(R) { return new X(mul(this.m, R), mul(this.r, R)); }
    }
    const tp = (M, p) => [
        M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12],
        M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13],
        M[2] * p[0] + M[6] * p[1] + M[10] * p[2] + M[14]
    ];

    /* =========================================================
       Easing: cubic-bezier (same maths as CSS cubic-bezier()), plus a
       "glide" that carries a value from where it is to a new goal over a
       set time along such a curve. Poses and expressions use these, so a
       change of mood slides in instead of snapping or wobbling.
       ========================================================= */
    function bezier(x1, y1, x2, y2) {
        const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
        const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
        const X = (t) => ((ax * t + bx) * t + cx) * t;
        const Y = (t) => ((ay * t + by) * t + cy) * t;
        const dX = (t) => (3 * ax * t + 2 * bx) * t + cx;
        return (x) => {
            if (x <= 0) return 0;
            if (x >= 1) return 1;
            let t = x;
            for (let i = 0; i < 6; i++) {                    // Newton–Raphson
                const e = X(t) - x;
                if (Math.abs(e) < 1e-5) return Y(t);
                const d = dX(t);
                if (Math.abs(d) < 1e-6) break;
                t -= e / d;
            }
            let lo = 0, hi = 1; t = x;                       // bisection fallback
            for (let i = 0; i < 24; i++) {
                const e = X(t) - x;
                if (Math.abs(e) < 1e-5) break;
                if (e > 0) hi = t; else lo = t;
                t = (lo + hi) / 2;
            }
            return Y(t);
        };
    }
    const EASE = {
        standard: bezier(0.4, 0, 0.2, 1),      // calm in and out
        inOut: bezier(0.65, 0, 0.35, 1),       // symmetric, for blinks
        out: bezier(0.16, 1, 0.3, 1),          // fast start, long soft landing
        pop: bezier(0.34, 1.45, 0.64, 1)       // small overshoot, for things appearing
    };
    const glide = (v) => ({ from: v, to: v, cur: v, p: 1, dur: 0.3, ease: EASE.standard });
    function glideTo(g, goal, dur, ease, dt) {
        if (Math.abs(goal - g.to) > 1e-4) { g.from = g.cur; g.to = goal; g.p = 0; g.dur = dur; g.ease = ease; }
        if (g.p < 1) { g.p = Math.min(1, g.p + dt / g.dur); g.cur = g.from + (g.to - g.from) * g.ease(g.p); } else g.cur = g.to;
        return g.cur;
    }

    /* =========================================================
       Geometry: a rounded box. A capsule is the same thing with
       the radius equal to half the width.
       ========================================================= */
    function roundedBox(w, h, d, r, seg) {
        const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
        const F = [
            [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
            [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
            [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]]
        ];
        const v = [], idx = [];
        F.forEach(([n, U, V]) => {
            const base = v.length / 6;
            for (let j = 0; j <= seg; j++) {
                for (let i = 0; i <= seg; i++) {
                    const a = (i / seg) * 2 - 1, b = (j / seg) * 2 - 1;
                    const q = [0, 1, 2].map((k) => (n[k] + a * U[k] + b * V[k]) * [w / 2, h / 2, d / 2][k]);
                    const inner = [clamp(q[0], -hx, hx), clamp(q[1], -hy, hy), clamp(q[2], -hz, hz)];
                    let nn = [q[0] - inner[0], q[1] - inner[1], q[2] - inner[2]];
                    const l = Math.hypot(nn[0], nn[1], nn[2]) || 1;
                    nn = [nn[0] / l, nn[1] / l, nn[2] / l];
                    v.push(inner[0] + nn[0] * r, inner[1] + nn[1] * r, inner[2] + nn[2] * r, nn[0], nn[1], nn[2]);
                }
            }
            for (let j = 0; j < seg; j++) {
                for (let i = 0; i < seg; i++) {
                    const p = base + j * (seg + 1) + i;
                    idx.push(p, p + 1, p + seg + 1, p + 1, p + seg + 2, p + seg + 1);
                }
            }
        });
        return { v: new Float32Array(v), i: new Uint16Array(idx) };
    }

    // Squash a mesh in z (normals corrected). Turns a capsule into a flat, floppy paddle.
    function flatten(g, k) {
        for (let i = 0; i < g.v.length; i += 6) {
            g.v[i + 2] *= k;
            const nx = g.v[i + 3], ny = g.v[i + 4], nz = g.v[i + 5] / k, l = Math.hypot(nx, ny, nz) || 1;
            g.v[i + 3] = nx / l; g.v[i + 4] = ny / l; g.v[i + 5] = nz / l;
        }
        return g;
    }

    /* =========================================================
       Rabbit layout, measured from the flat design. Units are
       arbitrary, origin is the floor between the feet, y is up.
       Limbs hang from a pivot at their inner end; their angle is
       measured counter-clockwise from "straight down".
       ========================================================= */
    const CAP_R = 0.155;
    const HEAD = { w: 2.0, h: 1.5, d: 1.5, r: 0.72 };      // wide, squishy mochi head
    const BODY = { w: 0.8, h: 0.78, d: 0.62, r: 0.28 };    // tiny round body
    const BODY_Y = 0.6;
    const HEAD_POS = [0, 1.66, 0.02];
    const FOOT = { w: 0.42, h: 0.4, d: 0.58 };             // little oval feet
    const TAIL = { r: 0.2, pos: [0.42, 0.42, -0.26] };     // round cotton tail peeking out behind
    // Long flat ears that flop out and down. root = how far the ear is tucked into the head.
    const EAR = { len: 1.3, w: 0.62, d: 0.2, root: 0.22 };
    const EAR_DROOP = 0.55;   // rest angle below horizontal (radians); 1.57 would hang straight down
    const HALF_W = 1.75;      // half the width of the whole figure, ears included
    // Everything is mirrored around x = 0: each right limb is the left one with x flipped.
    const LIMB = {
        earL: { pivot: [-0.5, 0.45, -0.1] },
        earR: { pivot: [0.5, 0.45, -0.1] },
        armL: { pivot: [-0.4, 0.76, 0.06], axis: 0.1 },
        armR: { pivot: [0.4, 0.76, 0.06], axis: 0.1 },
        legL: { pivot: [-0.24, 0.23, 0.08], axis: 0.06 },
        legR: { pivot: [0.24, 0.23, 0.08], axis: 0.06 }
    };
    // Ear angles use the same convention as the limbs. A positive "spread" droops the ear further.
    const EAR_L = (spread) => Math.PI * 1.5 + EAR_DROOP + spread;
    const EAR_R = (spread) => Math.PI * 0.5 - EAR_DROOP - spread;
    const FACE_H = 320, FACE_W = Math.round(FACE_H * HEAD.w / HEAD.h), FACE_K = FACE_H / 256, FACE_CX = 128 * HEAD.w / HEAD.h;
    const TOP = 2.45;   // height of the top of the head
    const MID_Y = 1.22; // vertical centre of the whole figure

    /* =========================================================
       Emotions: eye shapes, mouth, ears and arms for each mood
       ========================================================= */
    const BASE = {
        eye: ['pill', 'pill'], ew: 1, sL: 1, sR: 1, lid: 0, lidA: 0,
        mw: 0.18, mo: 0.01, mc: 0.035, mu: 0, tongue: 0, blush: 0.6, ey: 0, my: 0, mx: 0,
        ear: [0, 0], roll: 0, arms: 'rest', bob: 1, look: null
    };
    const EMO = {
        happy: {},
        joy: { eye: ['arcUp', 'arcUp'], mw: 0.24, mo: 0.05, mc: 0.045, blush: 0.75, ear: [-0.1, -0.1], arms: 'cheer' },
        wink: { eye: ['pill', 'arcUp'], mw: 0.2, mo: 0.015, mc: 0.04, mx: 0.02, blush: 0.6 },
        surprised: { ew: 1.12, sL: 1.3, sR: 1.3, mw: 0.15, mo: 0.2, mu: 0.5, ear: [-0.35, -0.35], arms: 'shrug' },
        curious: { sL: 1.25, sR: 0.85, mw: 0.2, mo: 0.06, mx: 0.06, ear: [-0.3, 0.15], roll: 0.14 },
        thinking: { sL: 0.9, sR: 0.9, mw: 0.16, mo: 0.04, mc: -0.03, mx: -0.05, arms: 'think', look: [-0.6, -0.8], roll: -0.08, ear: [0.1, 0.1] },
        sad: { sL: 0.85, sR: 0.85, lid: 0.3, lidA: -0.45, mw: 0.3, mo: 0.07, mc: -0.12, my: 0.03, blush: 0.35, ear: [0.6, 0.6], arms: 'down', bob: 0.4, roll: -0.05 },
        love: { eye: ['heart', 'heart'], mw: 0.2, mo: 0.03, mc: 0.04, blush: 0.9, arms: 'love' },
        sleepy: { eye: ['arcDown', 'arcDown'], mw: 0.12, mo: 0.09, mu: 0.5, ear: [0.65, 0.65], arms: 'down', bob: 0.5, roll: -0.12 },
        dizzy: { eye: ['spiral', 'spiral'], mw: 0.22, mo: 0.07, arms: 'dizzy', ear: [0.3, 0.3] },
        grumpy: { sL: 0.8, sR: 0.8, lid: 0.38, lidA: 0.42, mw: 0.28, mo: 0.05, mc: -0.08, blush: 0.25, ear: [0.35, 0.35], arms: 'hips', bob: 0.5 },
        cheeky: { eye: ['arcUp', 'arcUp'], mw: 0.2, mo: 0.1, mc: 0.04, tongue: 1, blush: 0.7, mx: 0.02 }
    };
    Object.keys(EMO).forEach((k) => { EMO[k] = Object.assign({}, BASE, EMO[k]); });

    // Arm angles [left, right]; right arm is kept above pi to avoid wrapping
    const POSE = {
        rest: [-0.6, 0.6], down: [-0.3, 0.3], cheer: [-2.15, 2.15], held: [-2.3, 2.3],
        shrug: [-1.2, 1.2], think: [-0.2, 3.9], love: [-2.0, 2.0], dizzy: [-1.0, 1.0], hips: [-0.75, 0.75]
    };
    const NUM_KEYS = ['ew', 'sL', 'sR', 'lid', 'lidA', 'mw', 'mo', 'mc', 'mu', 'tongue', 'blush', 'ey', 'my', 'mx'];

    const FX_FOR = {
        joy: ['star'], love: ['heart', 'heart', 'heart'], dizzy: ['star', 'star'], sad: ['drop'],
        surprised: ['!'], curious: ['?'], thinking: ['...'], cheeky: ['star'], grumpy: ['!']
    };

    /* =========================================================
       Words
       ========================================================= */
    const HELLO = ['How can I help?', 'Where to?', 'Need a hand?', 'What are you looking for?'];
    const POKE_SAY = {
        head: ['Boop!', 'Hey, that is my head!', 'Hehe!'],
        body: ['Hehe, that tickles!', 'Careful, I am squishy.'],
        ear: ['Careful with the ears!', 'Ears are off limits... mostly.'],
        armR: ['High five!'], armL: ['Hello there!'],
        leg: ['Whoa!', 'Hop hop!']
    };
    const SECTIONS = [
        { sel: '#projects', key: 'projects', emo: 'joy', text: 'Flusher is the newest project here. UNEJ Maps is a fun one too.', chips: [{ label: 'Open Flusher', href: 'https://github.com/GylaxDev/Flusher', primary: true }] },
        { sel: '#wip', key: 'wip', emo: 'curious', text: 'Prodex and GAIA are still in the oven. Take a peek.' },
        { sel: '#skills', key: 'skills', emo: 'cheeky', text: 'There is a game right below the skills. Can you beat the stack?', chips: [{ label: 'Play Stack', go: '#stackGame', block: 'center', primary: true }] },
        { sel: '#explore', key: 'explore', emo: 'thinking', text: 'Security, design and mobile work lives here. Want to patch some bugs?', chips: [{ label: 'Play Patch the bugs', go: '#bugGame', block: 'center', primary: true }] },
        { sel: '#contact', key: 'contact', emo: 'love', text: 'Got an idea? Vincent would love to hear it.', chips: [{ label: 'Get in touch', href: 'https://wa.me/6289668265104', primary: true }] }
    ];
    const TOUR = [
        { go: '#projects', emo: 'joy', text: 'Projects first: Flusher, UNEJ Maps, Tugaskan and more.' },
        { go: '#wip', emo: 'curious', text: 'These two are still being built: Prodex and the GAIA 3D city.' },
        { go: '#skills', emo: 'happy', text: 'Skills: development, web, security and design. Plus a stacking game.' },
        { go: '#explore', emo: 'thinking', text: 'Security, design and mobile experiments. Another game hides here.' },
        { go: '#contact', emo: 'love', text: 'And this is where you say hello.' }
    ];

    /* =========================================================
       Shaders
       ========================================================= */
    const VS = `
attribute vec3 aPos; attribute vec3 aNor;
uniform mat4 uM; uniform mat4 uVP; uniform mat4 uR;
varying vec3 vN; varying vec3 vL; varying vec3 vNL; varying vec3 vW;
void main(){
  vec4 w = uM * vec4(aPos, 1.0);
  vW = w.xyz; vN = (uR * vec4(aNor, 0.0)).xyz; vL = aPos; vNL = aNor;
  gl_Position = uVP * w;
}`;
    const FS = `
precision mediump float;
uniform vec3 uLo; uniform vec3 uMid; uniform vec3 uHi; uniform vec3 uEye; uniform float uShade;
uniform sampler2D uFace; uniform float uHasFace; uniform vec2 uHead;
varying vec3 vN; varying vec3 vL; varying vec3 vNL; varying vec3 vW;
void main(){
  vec3 n = normalize(vN);
  vec3 L = normalize(vec3(-0.35, 0.65, 0.68));
  float d = dot(n, L);
  float lam = max(d, 0.0);
  // matte clay: wrapped diffuse over a wide ramp, no specular and no rim light
  float t = smoothstep(0.06, 0.96, clamp(d * 0.5 + 0.5, 0.0, 1.0));
  vec3 col = t < 0.62 ? mix(uLo, uMid, t / 0.62) : mix(uMid, uHi, (t - 0.62) / 0.38 * 0.6);
  col *= mix(0.9, 1.0, smoothstep(-0.95, 0.3, n.y));          // soft occlusion on undersides
  col *= 1.0 - uShade * smoothstep(0.1, 1.0, vNL.y);           // the big head shades what is under it
  if (uHasFace > 0.5) {
    vec2 uv = vec2(vL.x / uHead.x + 0.5, 0.5 - vL.y / uHead.y);
    float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
    vec4 f = texture2D(uFace, clamp(uv, 0.0, 1.0));
    float a = f.a * smoothstep(0.0, 0.35, vNL.z) * inside;
    vec3 ink = f.rgb * (0.9 + 0.1 * lam);
    col = mix(col, ink, a);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

    /* =========================================================
       Everything lives inside init() so nothing runs without WebGL
       ========================================================= */
    function init() {
        const cv = document.createElement('canvas');
        const gl = cv.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true });
        if (!gl) return;

        /* ---------- DOM ---------- */
        const wrap = document.createElement('div');
        wrap.className = 'mascot';
        wrap.innerHTML =
            '<div class="mascot-shadow" aria-hidden="true"></div>' +
            '<div class="mascot-fxs" aria-hidden="true"></div>' +
            '<button type="button" class="mascot-hit" aria-haspopup="true" aria-expanded="false" aria-controls="mascotBubble" aria-label="Rabbit helper. Press for help, or drag to pick it up."></button>' +
            '<div class="mascot-bubble" id="mascotBubble" role="group" aria-label="Rabbit helper">' +
            '<button type="button" class="mascot-x" aria-label="Close"><svg class="icon" aria-hidden="true"><use href="#i-x"/></svg></button>' +
            '<p class="mascot-text"></p><div class="mascot-chips"></div></div>';
        cv.className = 'mascot-canvas';
        cv.setAttribute('aria-hidden', 'true');
        wrap.insertBefore(cv, $('.mascot-fxs', wrap));
        document.body.appendChild(wrap);
        const shadowEl = $('.mascot-shadow', wrap);
        const fxBox = $('.mascot-fxs', wrap);
        const hit = $('.mascot-hit', wrap);
        const bubble = $('.mascot-bubble', wrap);
        const bText = $('.mascot-text', bubble);
        const bChips = $('.mascot-chips', bubble);
        const bClose = $('.mascot-x', bubble);
        const probe = document.createElement('div');
        probe.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none';
        document.body.appendChild(probe);

        /* ---------- GL setup ---------- */
        let prog, U, A, meshes, faceTex;
        const faceCv = document.createElement('canvas');
        faceCv.width = FACE_W; faceCv.height = FACE_H;
        const fctx = faceCv.getContext('2d');

        function compile(type, src) {
            const s = gl.createShader(type);
            gl.shaderSource(s, src); gl.compileShader(s);
            return s;
        }
        function buildGL() {
            prog = gl.createProgram();
            gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
            gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
            gl.linkProgram(prog);
            gl.useProgram(prog);
            U = {};
            ['uM', 'uVP', 'uR', 'uLo', 'uMid', 'uHi', 'uEye', 'uFace', 'uHasFace', 'uHead', 'uShade'].forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });
            A = { pos: gl.getAttribLocation(prog, 'aPos'), nor: gl.getAttribLocation(prog, 'aNor') };
            const mk = (g) => {
                const vb = gl.createBuffer(), ib = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, g.v, gl.STATIC_DRAW);
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, g.i, gl.STATIC_DRAW);
                return { vb, ib, n: g.i.length };
            };
            const cap = (axis) => mk(roundedBox(CAP_R * 2, axis + CAP_R * 2, CAP_R * 2, CAP_R, 16));
            // ear: a flat paddle, narrow at the root and wider toward the rounded tip
            const earGeo = () => {
                const g = flatten(roundedBox(EAR.w, EAR.len, EAR.w, EAR.w / 2, 18), EAR.d / EAR.w);
                for (let i = 0; i < g.v.length; i += 6) {
                    const t = clamp((EAR.len / 2 - g.v[i + 1]) / EAR.len / 0.6, 0, 1);
                    g.v[i] *= 0.5 + 0.5 * t * (2 - t);
                }
                return g;
            };
            meshes = {
                body: mk(roundedBox(BODY.w, BODY.h, BODY.d, BODY.r, 14)),
                head: mk(roundedBox(HEAD.w, HEAD.h, HEAD.d, HEAD.r, 20)),
                ear: mk(earGeo()), arm: cap(LIMB.armL.axis),
                leg: mk(roundedBox(FOOT.w, FOOT.h, FOOT.d, FOOT.h / 2, 12)),
                tail: mk(roundedBox(TAIL.r * 2, TAIL.r * 2, TAIL.r * 2, TAIL.r, 10))
            };
            faceTex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, faceTex);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.uniform3fv(U.uLo, n3(LO)); gl.uniform3fv(U.uMid, n3(AMBER)); gl.uniform3fv(U.uHi, n3(HI));
            gl.uniform1i(U.uFace, 0);
            gl.uniform2f(U.uHead, HEAD.w, HEAD.h);
            gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
            gl.clearColor(0, 0, 0, 0);
        }
        buildGL();
        let lost = false;
        cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });
        cv.addEventListener('webglcontextrestored', () => { buildGL(); lost = false; });

        /* ---------- Layout ---------- */
        let vw = 0, vh = 0, u = 50, S = 300, D = 12, VP = I4(), margin = 12;
        function layout() {
            vw = window.innerWidth; vh = window.innerHeight;
            u = clamp(vh * 0.068, 40, 62) * 1.18 * (vw < 600 ? 0.85 : 1);
            S = Math.round(u * 6.2);
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            cv.width = cv.height = Math.round(S * dpr);
            cv.style.width = cv.style.height = S + 'px';
            gl.viewport(0, 0, cv.width, cv.height);
            const fov = 2 * Math.atan(S / 2 / u / D);
            VP = mul(persp(fov, 1, 1, 40), mT(0, -MID_Y, -D));
            margin = 10 + probe.offsetHeight;
            hit.style.width = Math.round(2 * HALF_W * u) + 'px';
            hit.style.height = Math.round(TOP * u) + 'px';
            shadowEl.style.width = Math.round(2.3 * u) + 'px';
            shadowEl.style.height = Math.round(0.6 * u) + 'px';
        }
        const proj = (p) => {
            const m = VP;
            const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
            const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
            const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
            return [(x / w * 0.5 + 0.5) * S, (0.5 - y / w * 0.5) * S];
        };

        /* ---------- State ---------- */
        const spr = (k, c, x = 0) => ({ x, v: 0, t: x, k, c });
        const step = (s, dt) => { s.v += (s.k * (s.t - s.x) - s.c * s.v) * dt; s.x += s.v * dt; };
        const lag = () => ({ x: spr(140, 13), y: spr(140, 13) });
        // How far each loose part may drift from its rest spot (world units). Sized for the
        // chibi body: the head/body gap is tiny, so parts must never travel far.
        const LAG = {
            lagHead: { k: 0.5, x: 0.14, y: [-0.01, 0.16] }, lagBody: { k: 0.3, x: 0.08, y: [-0.02, 0.06] },
            lagArmL: { k: 0.9, x: 0.12, y: [-0.12, 0.12] }, lagArmR: { k: 0.9, x: 0.12, y: [-0.12, 0.12] },
            lagLegL: { k: 0.6, x: 0.07, y: [-0.06, 0.05] }, lagLegR: { k: 0.6, x: 0.07, y: [-0.06, 0.05] }
        };
        const LAG_IMPULSE = 0.2;
        const holdIn = (sp, lo, hi) => {
            if (sp.x < lo) { sp.x = lo; if (sp.v < 0) sp.v = 0; } else if (sp.x > hi) { sp.x = hi; if (sp.v > 0) sp.v = 0; }
        };

        const st = {
            x: 0, y: 0, vx: 0, vy: 0, held: false, grounded: false,
            lean: spr(120, 9), sx: spr(260, 17, 1), sy: spr(260, 17, 1),
            headYaw: spr(150, 14), headPitch: spr(150, 14), headRoll: spr(130, 10, 0), bodyYaw: spr(90, 11),
            armL: spr(200, 14, -0.45), armR: spr(200, 14, 0.45),
            legL: spr(180, 12, 0), legR: spr(180, 12, 0),
            earL: spr(110, 6.5, EAR_L(0)), earR: spr(110, 6.5, EAR_R(0)),
            lagHead: lag(), lagBody: lag(), lagArmL: lag(), lagArmR: lag(), lagLegL: lag(), lagLegR: lag()
        };
        const face = { open: [1, 1], eye: ['pill', 'pill'], eyeFrom: ['pill', 'pill'], eyeP: 1, shiftX: 0, shiftY: 0 };
        NUM_KEYS.forEach((k) => { face[k] = BASE[k]; });
        const fg = {};                                   // one glide per face number
        NUM_KEYS.forEach((k) => { fg[k] = glide(BASE[k]); });
        const gz = { aL: glide(-0.45), aR: glide(0.45), spread: glide(0), earL: glide(0), earR: glide(0), roll: glide(0) };
        st.qx = 1; st.qy = 1; st.gW = 0; st.hold = 0; st.holdV = 0;
        // Squash & stretch of the whole body: a timed bezier "press" followed by a springy rebound,
        // multiplied onto the physics stretch, so nothing ever jumps from one frame to the next.
        const sq = { t: 99, from: 0, to: 0, d1: 0.09, d2: 0.45, v: 0 };
        const REBOUND = bezier(0.3, 1.7, 0.55, 1);        // overshoots, then settles
        function squash(amount, d1, d2) { sq.from = sq.v; sq.to = amount; sq.t = 0; sq.d1 = d1 || 0.09; sq.d2 = d2 || 0.45; }
        function stepSquash(dt) {
            sq.t += dt;
            if (sq.t < sq.d1) sq.v = sq.from + (sq.to - sq.from) * EASE.standard(sq.t / sq.d1);
            else if (sq.t < sq.d1 + sq.d2) sq.v = sq.to * (1 - REBOUND((sq.t - sq.d1) / sq.d2));
            else sq.v = 0;
            st.qy = 1 - sq.v; st.qx = 1 + sq.v * 0.6;
        }
        const gw = {};                                   // on/off weights that fade motions in and out
        const W = (key, on, dt, dur) => glideTo(gw[key] || (gw[key] = glide(0)), on ? 1 : 0, dur || 0.3, EASE.standard, dt);

        let T = 0;                  // seconds
        let hidden = store.get('va-mascot-hidden') === '1';
        let quiet = store.get('va-mascot-quiet') === '1';
        let asleep = false, lastAct = 0, mood = 'happy', ov = null, ovUntil = 0, lastEmo = 'happy';
        let waveUntil = 0, blinkAt = 2, blinkT = -1, glanceAt = 4, actionAt = 10, zAt = 0, shake = 0;
        let ptr = { x: -999, y: -999, t: -99 }, look = { x: 0, y: 0 }, glance = { x: 0, y: 0 };
        let pokes = [], clickTimer = 0, tipTimer = 0, lastSection = null, suppressTip = 0;
        const shown = new Set();
        let mode = null, bTimer = 0, bw = 0, bh = 0, bOn = false;
        let down = null;

        const floorY = () => (hidden ? vh + 2.6 * u : vh - margin);
        const xmin = () => HALF_W * u + 4;
        const xmax = () => vw - HALF_W * u - 4;

        /* =========================================================
           Emotions
           ========================================================= */
        const curEmo = () => (hidden ? 'sleepy' : (T < ovUntil ? ov : (asleep ? 'sleepy' : mood)));
        function emote(name, ms = 2600) {
            if (!EMO[name]) return;
            ov = name; ovUntil = T + ms / 1000;
            if (name !== lastEmo) { (FX_FOR[name] || []).forEach((k, i) => setTimeout(() => fx(k), i * 160)); lastEmo = name; }
        }
        function fx(kind) {
            if (hidden) return;
            const el = document.createElement('span');
            el.className = 'mascot-fx mascot-fx-' + (kind.length > 1 && /^[a-z]/.test(kind) ? kind : 'txt');
            if (kind === 'heart') el.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 21s-8-5.2-8-11a4.6 4.6 0 0 1 8-3 4.6 4.6 0 0 1 8 3c0 5.800-8 11-8 11z"/></svg>';
            else if (kind === 'star') el.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 2l2.6 6.9 7.400.4-5.800 4.600 2 7.100L12 17l-6.200 4 2-7.100L2 9.300l7.400-.4z"/></svg>';
            else if (kind === 'drop') el.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 3c3 4.500 6 7.600 6 11a6 6 0 0 1-12 0c0-3.400 3-6.500 6-11z"/></svg>';
            else el.textContent = kind;
            const hx = st.x, hy = st.y - HEAD_POS[1] * u * st.sy.x * st.qy;
            el.style.left = Math.round(hx + rand(-0.2, 0.9) * u) + 'px';
            el.style.top = Math.round(hy - rand(0.45, 0.8) * u) + 'px';
            el.style.setProperty('--dx', Math.round(rand(-14, 22)) + 'px');
            fxBox.appendChild(el);
            el.addEventListener('animationend', () => el.remove());
            setTimeout(() => el.remove(), 2600);
        }
        function activity() {
            lastAct = T;
            if (asleep) { asleep = false; emote('surprised', 700); squash(-0.12, 0.08, 0.5); }
        }

        /* =========================================================
           Speech bubble
           ========================================================= */
        function mkChip(c) {
            const el = document.createElement(c.href ? 'a' : 'button');
            el.className = 'mascot-chip' + (c.primary ? ' is-primary' : '') + (c.quiet ? ' is-quiet' : '');
            el.textContent = c.label;
            if (c.href) { el.href = c.href; el.target = '_blank'; el.rel = 'noopener noreferrer'; } else el.type = 'button';
            el.addEventListener('click', () => {
                activity();
                if (c.go) { suppressTip = T + 5; goTo(c.go, c.block); emote(c.emo || 'happy', 2000); }
                if (c.fn) c.fn();
                if (!c.keep) hideBubble();
            });
            return el;
        }
        function show(o) {
            clearTimeout(bTimer);
            mode = o.mode || 'tip';
            bText.textContent = o.text;
            bText.setAttribute('aria-live', o.live ? 'polite' : 'off');
            bChips.replaceChildren(...(o.chips || []).map(mkChip));
            bubble.classList.toggle('has-chips', !!(o.chips && o.chips.length));
            bubble.classList.toggle('is-sticky', !!o.sticky);
            bubble.style.maxWidth = Math.min(280, vw - 16) + 'px';
            bw = bubble.offsetWidth; bh = bubble.offsetHeight;
            bubble.classList.add('is-on'); bOn = true;
            hit.setAttribute('aria-expanded', o.sticky ? 'true' : 'false');
            if (!o.sticky) { const ttl = o.ttl || 5200; bTimer = setTimeout(hideBubble, ttl); bubble._ttl = ttl; } else bubble._ttl = 0;
            if (o.emo) emote(o.emo, o.emoMs || 2600);
            if (o.focus) { const f = bChips.firstElementChild; if (f) f.focus(); }
        }
        function hideBubble() {
            clearTimeout(bTimer);
            bubble.classList.remove('is-on'); bOn = false; mode = null;
            hit.setAttribute('aria-expanded', 'false');
        }
        bubble.addEventListener('pointerenter', () => { if (bubble._ttl) clearTimeout(bTimer); });
        bubble.addEventListener('pointerleave', () => { if (bubble._ttl && bOn) bTimer = setTimeout(hideBubble, 2200); });
        bClose.addEventListener('click', () => { hideBubble(); hit.focus({ preventScroll: true }); });
        hit.addEventListener('keydown', () => hit.classList.remove('by-pointer'));
        document.addEventListener('keydown', (e) => {
            activity();
            if (e.key === 'Escape' && bOn) { const inside = bubble.contains(document.activeElement); hideBubble(); if (inside) hit.focus({ preventScroll: true }); }
        });
        document.addEventListener('pointerdown', (e) => {
            if (bOn && mode !== 'tip' && !bubble.contains(e.target) && !hit.contains(e.target)) hideBubble();
        });
        function quip(text, emo, ms) {
            if (hidden || mode === 'menu' || mode === 'tour' || mode === 'games') return;
            show({ text, emo, ttl: ms || 2400, emoMs: ms || 2400 });
        }

        function placeBubble() {
            const ax = st.x, ay = st.y - TOP * u * st.sy.x * st.qy - 4;
            let left, top, tx = -1;
            if (ay - bh - 12 >= 8) {
                left = clamp(ax - 34, 8, vw - bw - 8); top = ay - bh - 12; tx = clamp(ax - left, 22, bw - 22);
            } else {
                const right = vw - (st.x + HALF_W * u), leftRoom = st.x - HALF_W * u;
                left = (right >= bw + 12 || right >= leftRoom) ? st.x + HALF_W * u + 8 : st.x - HALF_W * u - bw - 8;
                left = clamp(left, 8, vw - bw - 8);
                top = clamp(st.y - 2.0 * u - bh / 2, 8, vh - bh - 8);
            }
            bubble.style.transform = `translate3d(${Math.round(left)}px,${Math.round(top)}px,0)`;
            bubble.style.setProperty('--tx', tx + 'px');
            bubble.classList.toggle('no-tail', tx < 0);
        }

        /* =========================================================
           Helping: navigation, menu, tour, tips
           ========================================================= */
        function goTo(sel, block) {
            const el = $(sel);
            if (el) el.scrollIntoView({ behavior: reduceMQ.matches ? 'auto' : 'smooth', block: block || 'start' });
        }
        function openMenu(kb) {
            activity();
            show({
                mode: 'menu', sticky: true, emo: 'happy', focus: kb, text: pick(HELLO),
                chips: [
                    { label: 'Take a tour', fn: () => tour(0), primary: true },
                    { label: 'Projects', go: '#projects', emo: 'joy' },
                    { label: 'What is new', go: '#wip', emo: 'curious' },
                    { label: 'Skills', go: '#skills' },
                    { label: 'Play a game', fn: showGames, keep: true },
                    { label: 'Contact', go: '#contact', emo: 'love' },
                    { label: 'Shard hint', fn: shardHint },
                    { label: quiet ? 'Tips: off' : 'Tips: on', fn: toggleQuiet, quiet: true },
                    { label: 'Hide me', fn: hideMascot, quiet: true }
                ]
            });
        }
        function showGames() {
            show({
                mode: 'games', sticky: true, emo: 'cheeky', text: 'Pick a game. Fair warning, I am competitive.',
                chips: [
                    { label: 'Stack the build', go: '#stackGame', block: 'center', primary: true },
                    { label: 'Patch the bugs', go: '#bugGame', block: 'center', primary: true },
                    { label: 'Back', fn: () => openMenu(false), keep: true, quiet: true }
                ]
            });
        }
        function tour(i) {
            if (i >= TOUR.length) { show({ text: 'That was the tour. Poke me any time you need me.', emo: 'happy', ttl: 4200 }); return; }
            const s = TOUR[i];
            suppressTip = T + 6;
            goTo(s.go);
            show({
                mode: 'tour', sticky: true, emo: s.emo, emoMs: 4000, text: s.text, live: true,
                chips: [{ label: i < TOUR.length - 1 ? 'Next' : 'Done', primary: true, keep: true, fn: () => tour(i + 1) }, { label: 'Stop', quiet: true }]
            });
        }
        function shardHint() {
            const c = $('.shard-count');
            const t = c ? c.textContent : '';
            const [f, tot] = t.split('/').map(Number);
            let text = 'Hidden amber shards are scattered around the page. Try the section headings, the skills cards, the contact box and the footer.';
            if (tot && f === tot) text = 'You already found every shard. Impressive.';
            else if (tot) text = f + ' of ' + tot + ' shards found. ' + text;
            show({ text, emo: 'thinking', ttl: 7000, live: true });
        }
        function toggleQuiet() {
            quiet = !quiet; store.set('va-mascot-quiet', quiet ? '1' : '0');
            show({ text: quiet ? 'Okay, I will stay quiet unless you poke me.' : 'Tips are back on.', emo: quiet ? 'sleepy' : 'happy', ttl: 2800, emoMs: 1600 });
        }
        function hideMascot() {
            hidden = true; store.set('va-mascot-hidden', '1');
            hideBubble(); st.vy = 200;
            hit.setAttribute('aria-label', 'Bring the rabbit helper back');
        }
        function unhide() {
            hidden = false; store.set('va-mascot-hidden', '0');
            hit.setAttribute('aria-label', 'Rabbit helper. Press for help, or drag to pick it up.');
            st.vy = -u * 22; st.grounded = false; waveUntil = T + 2.2;
            emote('surprised', 700);
            setTimeout(() => show({ text: 'Miss me? I am back.', emo: 'joy', ttl: 3000 }), 700);
        }
        function busy() { return st.held || !st.grounded || bOn || hidden || down; }

        function sectionTick() {
            let cur = null;
            for (const s of SECTIONS) {
                const el = $(s.sel);
                if (el && el.getBoundingClientRect().top <= vh * 0.5) cur = s;
            }
            if (cur === lastSection) return;
            lastSection = cur;
            clearTimeout(tipTimer);
            if (!cur) return;
            tipTimer = setTimeout(() => {
                if (quiet || shown.has(cur.key) || busy() || T < suppressTip || lastSection !== cur) return;
                shown.add(cur.key);
                show({ text: cur.text, chips: cur.chips, emo: cur.emo, ttl: 7000, emoMs: 3000 });
            }, 1100);
        }
        let scrollQueued = false;
        window.addEventListener('scroll', () => {
            activity();
            if (scrollQueued) return;
            scrollQueued = true;
            requestAnimationFrame(() => { scrollQueued = false; sectionTick(); });
        }, { passive: true });

        // React to found shards (toys.js bumps the counter)
        function watchShards() {
            const hud = $('.shard-hud');
            if (!hud) { setTimeout(watchShards, 800); return; }
            let was = false;
            new MutationObserver(() => {
                const bump = hud.classList.contains('is-bump');
                if (bump && !was) {
                    const done = hud.classList.contains('is-done');
                    const c = $('.shard-count', hud);
                    emote(done ? 'love' : 'joy', 2600);
                    st.vy = Math.min(st.vy, -u * 8); st.grounded = false;
                    if (!quiet) show({ text: done ? 'All the shards! You are the real deal.' : 'Shard found! ' + (c ? c.textContent : '') + ' so far.', ttl: 3200, emo: done ? 'love' : 'joy' });
                }
                was = bump;
            }).observe(hud, { attributes: true, attributeFilter: ['class'] });
        }

        /* =========================================================
           Poking and dragging
           ========================================================= */
        const PART_ORDER = ['head', 'armR', 'armL', 'body', 'earL', 'earR', 'legL', 'legR'];
        let hitParts = {};
        function partAt(cx, cy) {
            const r = cv.getBoundingClientRect();
            const px = cx - r.left, py = cy - r.top;
            for (const name of PART_ORDER) {
                const h = hitParts[name];
                if (!h) continue;
                const [a, b, rad] = h;
                const dx = b[0] - a[0], dy = b[1] - a[1];
                const l2 = dx * dx + dy * dy;
                const t = l2 ? clamp(((px - a[0]) * dx + (py - a[1]) * dy) / l2, 0, 1) : 0;
                if (Math.hypot(px - (a[0] + dx * t), py - (a[1] + dy * t)) <= rad) return name;
            }
            return 'body';
        }
        function poke(cx, cy) {
            activity();
            const part = partAt(cx, cy);
            pokes = pokes.filter((t) => T - t < 2.6); pokes.push(T);
            const n = pokes.length;
            squash(0.16, 0.07, 0.45);
            clearTimeout(clickTimer);
            if (hidden) { unhide(); return; }
            if (bOn && mode !== 'tip') { hideBubble(); return; }
            if (n >= 7) { emote('grumpy', 3200); quip('Okay okay, that is enough!', 'grumpy', 2600); pokes = []; return; }
            if (n >= 4) { emote('dizzy', 1800); quip('Whoa, everything is spinning...', 'dizzy', 2000); return; }
            if (part.startsWith('ear')) { st[part].v += 8; emote('curious', 1600); }
            else if (part === 'armR') { waveUntil = T + 1.6; emote('joy', 1600); }
            else if (part.startsWith('leg')) { st.vy = -u * 9; st.grounded = false; emote('surprised', 900); }
            else if (part === 'head') { st.earL.v += 6; st.earR.v -= 6; emote('surprised', 700); setTimeout(() => emote('joy', 1400), 650); }
            else emote('joy', 1600);
            const key = part.startsWith('ear') ? 'ear' : part.startsWith('leg') ? 'leg' : part;
            if (n === 1) {
                clickTimer = setTimeout(() => openMenu(false), 380);
            } else {
                quip(pick(POKE_SAY[key] || POKE_SAY.body), null, 1800);
            }
        }

        hit.addEventListener('pointerdown', (e) => {
            if (e.button > 0) return;
            hit.classList.add('by-pointer');
            activity();
            try { hit.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            down = { id: e.pointerId, sx: e.clientX, sy: e.clientY, gx: e.clientX - st.x, gy: e.clientY - st.y, moved: false, t0: T };
        });
        hit.addEventListener('pointermove', (e) => {
            if (!down || e.pointerId !== down.id) return;
            if (!down.moved && Math.hypot(e.clientX - down.sx, e.clientY - down.sy) > 6 && !hidden) {
                down.moved = true; st.held = true; shake = 0;
                clearTimeout(clickTimer); hideBubble();
                hit.classList.add('is-held');
                emote('surprised', 700);
                setTimeout(() => { if (st.held && curEmo() === 'surprised') emote('joy', 6000); }, 650);
            }
        });
        const release = (e, cancelled) => {
            if (!down || e.pointerId !== down.id) return;
            const d = down; down = null;
            hit.classList.remove('is-held');
            try { hit.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            if (st.held) {
                st.held = false; st.grounded = false;
                const cap = u * 42;
                st.vx = clamp(st.vx, -cap, cap); st.vy = clamp(st.vy, -cap, cap);
                if (T < ovUntil && ov === 'dizzy') ovUntil = T + 1.5; else emote('joy', 1200);
            } else if (!cancelled && !d.moved) {
                poke(e.clientX, e.clientY);
            }
        };
        hit.addEventListener('pointerup', (e) => release(e, false));
        hit.addEventListener('pointercancel', (e) => release(e, true));
        hit.addEventListener('contextmenu', (e) => e.preventDefault());
        hit.addEventListener('click', (e) => {
            if (e.detail !== 0) return;               // pointer clicks are handled above
            if (hidden) { unhide(); return; }
            if (bOn && mode !== 'tip') hideBubble(); else openMenu(true);
        });
        window.addEventListener('pointermove', (e) => {
            if (down && st.held && e.pointerId === down.id) { ptr.x = e.clientX; ptr.y = e.clientY; }
            if (e.pointerType === 'touch' && !st.held) return;
            ptr.x = e.clientX; ptr.y = e.clientY; ptr.t = T;
            if (T - lastAct > 0.3) activity(); else lastAct = T;
        }, { passive: true });

        /* =========================================================
           Face painter (2D canvas used as a texture)
           ========================================================= */
        function rrect(c, x, y, w, h, r) {
            r = Math.min(r, w / 2, h / 2);
            c.beginPath();
            c.moveTo(x + r, y);
            c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
            c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r);
            c.closePath();
        }
        function drawEye(c, type, cx, cy, w, h, open, side, f) {
            const ink = css(INK);
            c.fillStyle = ink; c.strokeStyle = ink; c.lineCap = 'round'; c.lineJoin = 'round';
            if (type === 'pill' || type === 'round') {
                const hh = Math.max(3, h * open);
                c.save();
                if (f.lid > 0.01 || Math.abs(f.lidA) > 0.01) {
                    const inner = -side, lidY = cy - hh / 2 + f.lid * hh, k = Math.tan(f.lidA) * inner;
                    c.beginPath();
                    c.moveTo(cx - 80, lidY + k * -80); c.lineTo(cx + 80, lidY + k * 80);
                    c.lineTo(cx + 80, cy + 120); c.lineTo(cx - 80, cy + 120); c.closePath(); c.clip();
                }
                if (type === 'round') { c.beginPath(); c.ellipse(cx, cy, w * 0.78, hh * 0.38, 0, 0, TAU); c.fill(); }
                else { rrect(c, cx - w / 2, cy - hh / 2, w, hh, w / 2); c.fill(); }
                c.restore();
            } else if (type === 'arcUp') {
                c.lineWidth = w * 0.78;
                c.beginPath(); c.moveTo(cx - w * 0.9, cy + h * 0.1); c.quadraticCurveTo(cx, cy - h * 0.36, cx + w * 0.9, cy + h * 0.1); c.stroke();
            } else if (type === 'arcDown') {
                c.lineWidth = w * 0.6;
                c.beginPath(); c.moveTo(cx - w * 0.95, cy - h * 0.04); c.quadraticCurveTo(cx, cy + h * 0.24, cx + w * 0.95, cy - h * 0.04); c.stroke();
            } else if (type === 'heart') {
                const s = h * 0.62 * (0.92 + 0.08 * Math.sin(T * 7));
                c.fillStyle = css(CORAL);
                c.beginPath(); c.moveTo(cx, cy + s * 0.4);
                c.bezierCurveTo(cx - s * 0.98, cy - s * 0.05, cx - s * 0.55, cy - s * 0.65, cx, cy - s * 0.22);
                c.bezierCurveTo(cx + s * 0.55, cy - s * 0.65, cx + s * 0.98, cy - s * 0.05, cx, cy + s * 0.4);
                c.fill();
            } else if (type === 'spiral') {
                const R = h * 0.34;
                c.lineWidth = 5; c.beginPath();
                for (let a = 0; a <= TAU * 2.4; a += 0.2) {
                    const r = R * a / (TAU * 2.4), an = a + T * 6 * side;
                    const x = cx + r * Math.cos(an), y = cy + r * Math.sin(an);
                    if (a === 0) c.moveTo(x, y); else c.lineTo(x, y);
                }
                c.stroke();
            }
        }
        // Swapping eye shapes: the old one shrinks and fades while the new one pops in
        function drawEyeMix(c, cx, cy, w, h, i, side, f) {
            const cur = f.eye[i], prev = f.eyeFrom[i];
            if (f.eyeP >= 1 || cur === prev) { drawEye(c, cur, cx, cy, w, h, f.open[i], side, f); return; }
            const a = EASE.standard(f.eyeP), pop = EASE.pop(f.eyeP);
            const layer = (type, alpha, sc) => {
                c.save(); c.globalAlpha = clamp(alpha, 0, 1);
                c.translate(cx, cy); c.scale(sc, sc); c.translate(-cx, -cy);
                drawEye(c, type, cx, cy, w, h, f.open[i], side, f);
                c.restore();
            };
            layer(prev, 1 - a, 1 - 0.35 * a);
            layer(cur, a, 0.65 + 0.35 * pop);
        }
        function paintFace(t) {
            const c = fctx, f = face;
            c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, FACE_W, FACE_H); c.setTransform(FACE_K, 0, 0, FACE_K, 0, 0);
            const sx = f.shiftX, sy = f.shiftY;
            const ex = 86, ey = 148 + f.ey * 256 + sy;
            const w = 36 * f.ew, hL = 52 * f.sL, hR = 52 * f.sR;
            // blush
            if (f.blush > 0.02) {
                c.fillStyle = css(PINK, 0.62 * f.blush);
                [-1, 1].forEach((s) => { c.beginPath(); c.ellipse(FACE_CX + s * 124 + sx * 0.5, 182 + sy * 0.5, 28, 16, 0, 0, TAU); c.fill(); });
            }
            drawEyeMix(c, FACE_CX - ex + sx, ey, w, hL, 0, -1, f);
            drawEyeMix(c, FACE_CX + ex + sx, ey, w, hR, 1, 1, f);
            // mouth
            const mx = FACE_CX + f.mx * 256 + sx * 0.4, mt = 190 + f.my * 256 + sy * 0.4;
            const hw = f.mw * 128, op = Math.max(2, f.mo * 256), cur = f.mc * 256, up = clamp(f.mu, 0, 1);
            const N = 28, top = [], bot = [];
            for (let i = 0; i <= N; i++) {
                const x = -1 + (2 * i) / N, q = 1 - x * x, e = Math.sqrt(Math.max(0, q));
                const base = mt + cur * q;
                top.push([mx + x * hw, base - up * op * e]);
                bot.push([mx + x * hw, base + (1 - up) * op * e]);
            }
            const path = () => {
                c.beginPath(); c.moveTo(top[0][0], top[0][1]);
                top.forEach((p) => c.lineTo(p[0], p[1]));
                for (let i = N; i >= 0; i--) c.lineTo(bot[i][0], bot[i][1]);
                c.closePath();
            };
            c.fillStyle = css(INK); c.strokeStyle = css(INK); c.lineWidth = 5; c.lineJoin = 'round';
            path(); c.fill(); c.stroke();
            if (f.tongue > 0.03) {
                c.save(); path(); c.clip();
                c.fillStyle = css(CORAL, clamp(f.tongue, 0, 1));
                c.beginPath(); c.ellipse(mx + hw * 0.18, mt + op * 0.95, hw * 0.52, op * 0.5, 0, 0, TAU); c.fill();
                c.restore();
            }
            gl.bindTexture(gl.TEXTURE_2D, faceTex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, faceCv);
        }

        /* =========================================================
           Update: behaviour, physics, springs
           ========================================================= */
        let prevVx = 0, prevVy = 0, wobT = 0;
        function updateFace(dt, e, t) {
            const slow = reduceMQ.matches;
            const dur = slow ? 0.01 : 0.34;
            const emo = curEmo();
            const wobD = W('wobDizzy', emo === 'dizzy', dt), wobS = W('wobSleepy', emo === 'sleepy', dt);
            NUM_KEYS.forEach((key) => {
                let v = glideTo(fg[key], e[key], dur, EASE.standard, dt);
                if (key === 'mc') v += 0.07 * Math.sin(t * 7) * wobD;
                if (key === 'mo') v += 0.03 * Math.sin(t * 2.2) * wobS;
                face[key] = v;
            });
            // eye shape changes crossfade; if one is interrupted, start from whichever was showing more
            if (e.eye[0] !== face.eye[0] || e.eye[1] !== face.eye[1]) {
                face.eyeFrom = face.eyeP < 0.5 ? face.eyeFrom : face.eye;
                face.eye = e.eye; face.eyeP = 0;
            }
            if (face.eyeP < 1) face.eyeP = Math.min(1, face.eyeP + dt / (slow ? 0.01 : 0.28));
            // blink: quick eased close, slightly slower eased open
            let want = [1, 1];
            if (blinkT >= 0) {
                blinkT += dt / 0.22;
                const p = Math.min(blinkT, 1);
                const closed = p < 0.4 ? EASE.inOut(p / 0.4) : 1 - EASE.out((p - 0.4) / 0.6);
                const v = 1 - closed;
                if (face.eye[0] === 'pill' || face.eye[0] === 'round') want[0] = v;
                if (face.eye[1] === 'pill' || face.eye[1] === 'round') want[1] = v;
                if (blinkT >= 1) blinkT = -1;
            }
            face.open[0] = want[0]; face.open[1] = want[1];
            // where the eyes look
            const lk = e.look || [look.x, look.y];
            face.shiftX = lerp(face.shiftX, lk[0] * 9, 1 - Math.exp(-dt * 10));
            face.shiftY = lerp(face.shiftY, lk[1] * 8, 1 - Math.exp(-dt * 10));
            paintFace(t);
        }

        function update(dt) {
            T += dt;
            const reduce = reduceMQ.matches;
            const emoName = curEmo(), e = EMO[emoName];
            const F = floorY();
            const flat = vh - margin;

            /* ----- behaviour ----- */
            if (!asleep && !hidden && !busy() && T - lastAct > 50) { asleep = true; zAt = T + 1; }
            if (asleep && T > zAt) { fx('z'); zAt = T + 2.4; }
            if (T > blinkAt) { blinkAt = T + rand(2.4, 5.2); if (blinkT < 0) blinkT = 0; }
            if (!asleep && !hidden && !reduce && !busy()) {
                if (T > glanceAt) { glanceAt = T + rand(2.5, 6); glance.x = rand(-0.8, 0.8); glance.y = rand(-0.5, 0.3); }
                if (T > actionAt) {
                    actionAt = T + rand(9, 16);
                    const a = pick(['wave', 'ears', 'ears', 'hop', 'wink']);
                    if (a === 'wave') waveUntil = T + 2.4;
                    else if (a === 'ears') { st.earL.v += 6; st.earR.v -= 6; }
                    else if (a === 'hop') { st.vy = -u * 10; st.grounded = false; }
                    else emote('wink', 900);
                }
            }

            /* ----- look target ----- */
            const headX = st.x, headY = st.y - HEAD_POS[1] * u;
            if (T - ptr.t < 4 || st.held) {
                look.x = clamp((ptr.x - headX) / (u * 5), -1, 1);
                look.y = clamp((ptr.y - headY) / (u * 5), -1, 1);
            } else if (!reduce) { look.x = lerp(look.x, glance.x, 1 - Math.exp(-dt * 2)); look.y = lerp(look.y, glance.y, 1 - Math.exp(-dt * 2)); }
            else { look.x *= 0.95; look.y *= 0.95; }
            const lk = e.look || [look.x, look.y];

            /* ----- root physics ----- */
            const g = 40 * u;
            if (st.held) {
                const tx = clamp(ptr.x - down.gx, xmin(), xmax());
                const ty = clamp(ptr.y - down.gy, TOP * u + 6, flat);
                const k = 420, c = 36;
                st.vx += (k * (tx - st.x) - c * st.vx) * dt; st.vy += (k * (ty - st.y) - c * st.vy) * dt;
                st.x += st.vx * dt; st.y += st.vy * dt;
                st.grounded = false; st.hold = 0;
                shake = Math.max(0, shake + Math.abs(st.vx) * dt - 900 * dt);
                if (shake > 1800 && ov !== 'dizzy') { emote('dizzy', 2200); quip('Dizzy... so dizzy...', 'dizzy', 2200); }
            } else {
                if (st.hold > 0 && st.vy < -1) st.hold = 0;           // something launched it mid-landing
                const planted = st.hold > 0;
                if (!st.grounded && !planted) st.vy += g * dt;
                st.x += st.vx * dt;
                if (!planted) st.y += st.vy * dt;
                if (st.x < xmin()) { st.x = xmin(); st.vx = Math.abs(st.vx) * 0.5; }
                if (st.x > xmax()) { st.x = xmax(); st.vx = -Math.abs(st.vx) * 0.5; }
                if (st.y - TOP * u < 4) { st.y = TOP * u + 4; st.vy = Math.abs(st.vy) * 0.3; }
                if (planted) {
                    // in contact with the floor while the squash presses, then push off
                    st.hold -= dt; st.y = F; st.vy = 0; st.grounded = true;
                    if (st.hold <= 0) { st.hold = 0; if (st.holdV >= u * 3) { st.vy = -st.holdV; st.grounded = false; } }
                } else if (st.y >= F) {
                    const imp = st.vy;
                    st.y = F;
                    if (imp > u * 3 && !hidden) {
                        const s = clamp(imp / (u * 28), 0, 0.2);
                        const d1 = 0.07 + s * 0.3;                    // harder hits stay pressed a little longer
                        squash(s, d1, 0.34 + s * 1.2);
                        if (imp > u * 24) { emote('dizzy', 1800); quip('Whoa, that was a big one!', 'dizzy', 2000); }
                        else if (imp > u * 9) emote('joy', 1400);
                        const out = imp * 0.34;
                        st.vy = 0; st.grounded = true;
                        if (out >= u * 3) { st.hold = d1; st.holdV = out; }   // bounce again after the press
                    } else { st.vy = 0; st.grounded = true; }
                } else if (st.y < F - 1) st.grounded = false;
                if (st.grounded) st.vx *= Math.exp(-9 * dt);
            }
            if (st.grounded && !st.held && st.y > flat && !hidden) st.y = flat;

            // acceleration drives the loose parts
            const dVx = (st.vx - prevVx) / u, dVy = (st.vy - prevVy) / u;
            prevVx = st.vx; prevVy = st.vy;
            const cdx = clamp(dVx, -30, 30), cdy = clamp(dVy, -30, 30);
            Object.keys(LAG).forEach((k) => {
                st[k].x.v -= cdx * LAG[k].k * LAG_IMPULSE; st[k].y.v += cdy * LAG[k].k * LAG_IMPULSE;
            });
            st.armL.v -= Math.cos(st.armL.x) * cdx * 0.5; st.armR.v -= Math.cos(st.armR.x) * cdx * 0.5;
            // floppy ears lag behind sideways and vertical movement
            const flap = (a) => -Math.cos(a) * cdx + Math.sin(a) * cdy;
            st.earL.v += flap(st.earL.x) * 0.45; st.earR.v += flap(st.earR.x) * 0.45;

            /* ----- targets ----- */
            const fl = st.held || !st.grounded;
            st.lean.t = clamp(-st.vx * 0.00045, -0.5, 0.5) * (fl ? 1 : 0.4);
            const stretch = fl ? clamp(Math.abs(st.vy) / (u * 70), 0, 0.14) : 0;
            st.sx.t = 1 - stretch * 0.5; st.sy.t = 1 + stretch;
            st.headYaw.t = lk[0] * 0.5; st.headPitch.t = lk[1] * 0.3;
            const gd = reduce ? 0.01 : 0.38;
            st.headRoll.t = glideTo(gz.roll, e.roll, gd, EASE.standard, dt) + (fl ? st.lean.x * 0.6 : 0) * W('flying', fl, dt);
            st.bodyYaw.t = lk[0] * 0.18;

            let pose = st.held ? 'held' : e.arms;
            const waving = T < waveUntil && !st.held;
            const arms = POSE[pose];
            // base pose glides along a bezier; the wiggles are layered on top and faded in/out
            let bL = arms[0], bR = arms[1];
            if (waving) { bR = 2.1; bL = -0.35; }
            const wRest = W('rest', pose === 'rest' && !waving, dt), wWave = W('wave', waving, dt);
            const wDizzy = W('dizzy', pose === 'dizzy', dt), wHeld = W('held', st.held, dt);
            const wJoy = W('joy', emoName === 'joy' && !st.held, dt);
            const sway = reduce ? 0 : 1;
            const swR = Math.sin(T * 1.4) * 0.07 * sway * wRest;
            const heldShakeL = Math.sin(T * 14) * 0.3 * (1 + Math.abs(st.vx) / (u * 14)) * wHeld;
            const heldShakeR = Math.sin(T * 14 + 2) * 0.3 * (1 + Math.abs(st.vx) / (u * 14)) * wHeld;
            const aL = glideTo(gz.aL, bL, gd, EASE.standard, dt) - swR
                + Math.sin(T * 3) * 0.3 * wDizzy + heldShakeL + Math.sin(T * 9) * 0.18 * wJoy;
            const aR = glideTo(gz.aR, bR, gd, EASE.standard, dt) + swR
                + Math.sin(T * 11) * 0.34 * wWave + Math.sin(T * 3 + 1) * 0.3 * wDizzy + heldShakeR + Math.sin(T * 9 + 1) * 0.18 * wJoy;
            st.armL.t = aL; st.armR.t = aR;

            // legs: mirrored spread glides between grounded / thrown / held
            const spread = glideTo(gz.spread, fl ? (st.held ? 0.2 : 0.45) : 0, reduce ? 0.01 : 0.3, EASE.out, dt);
            const wLegHeld = W('legHeld', fl && st.held, dt);
            const sw = clamp(-st.vx / (u * 22), -0.7, 0.7) * wLegHeld;
            const kick = Math.sin(T * 6) * 0.14 * wLegHeld;
            const jig = reduce ? 0 : Math.sin(T * 9) * 0.12 * W('joyLeg', emoName === 'joy' && !fl, dt);
            st.legL.t = -spread + sw - kick - jig;
            st.legR.t = spread + sw + kick + jig;

            const earSway = reduce ? 0 : Math.sin(T * 1.8) * 0.035;
            st.earL.t = EAR_L(glideTo(gz.earL, e.ear[0], gd, EASE.standard, dt)) + earSway;
            st.earR.t = EAR_R(glideTo(gz.earR, e.ear[1], gd, EASE.standard, dt)) - earSway;

            /* ----- integrate springs (two sub-steps for stability) ----- */
            const sub = dt / 2;
            for (let i = 0; i < 2; i++) {
                ['lean', 'sx', 'sy', 'headYaw', 'headPitch', 'headRoll', 'bodyYaw', 'armL', 'armR', 'legL', 'legR', 'earL', 'earR'].forEach((k) => step(st[k], sub));
                ['lagHead', 'lagBody', 'lagArmL', 'lagArmR', 'lagLegL', 'lagLegR'].forEach((k) => { step(st[k].x, sub); step(st[k].y, sub); holdIn(st[k].x, -LAG[k].x, LAG[k].x); holdIn(st[k].y, LAG[k].y[0], LAG[k].y[1]); });
            }

            stepSquash(dt);
            st.gW = W('grounded', st.grounded && !st.held && st.hold <= 0, dt, 0.4);
            updateFace(dt, e, T);
            draw(e, reduce);

            /* ----- DOM ----- */
            const cx = st.x, cy = st.y - MID_Y * u;
            cv.style.transform = `translate3d(${Math.round(cx - S / 2)}px,${Math.round(cy - S / 2)}px,0)`;
            hit.style.transform = `translate3d(${Math.round(st.x - HALF_W * u)}px,${Math.round(st.y - TOP * u * st.sy.x * st.qy)}px,0)`;
            hit.style.height = Math.round(TOP * u * st.sy.x * st.qy) + 'px';
            const air = clamp((flat - st.y) / (4 * u), 0, 1);
            shadowEl.style.transform = `translate3d(${Math.round(st.x - 1.15 * u)}px,${Math.round(flat - 0.3 * u)}px,0) scale(${(1 - air * 0.5).toFixed(3)})`;
            shadowEl.style.opacity = hidden ? 0 : (0.5 - air * 0.35).toFixed(3);
            if (bOn) placeBubble();
        }

        /* =========================================================
           Draw
           ========================================================= */
        function drawPart(mesh, M, withFace, shade) {
            gl.uniform1f(U.uShade, shade || 0);
            gl.uniformMatrix4fv(U.uM, false, M.m);
            gl.uniformMatrix4fv(U.uR, false, M.r);
            gl.uniform1f(U.uHasFace, withFace ? 1 : 0);
            gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vb);
            gl.enableVertexAttribArray(A.pos); gl.vertexAttribPointer(A.pos, 3, gl.FLOAT, false, 24, 0);
            gl.enableVertexAttribArray(A.nor); gl.vertexAttribPointer(A.nor, 3, gl.FLOAT, false, 24, 12);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib);
            gl.drawElements(gl.TRIANGLES, mesh.n, gl.UNSIGNED_SHORT, 0);
        }
        function draw(e, reduce) {
            if (lost) return;
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.uniformMatrix4fv(U.uVP, false, VP);
            gl.uniform3f(U.uEye, 0, MID_Y, D);
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, faceTex);

            const sy = st.sy.x * st.qy, sx = st.sx.x * st.qx;
            const breathe = reduce ? 0 : Math.sin(T * 1.7) * 0.012;
            const bob = reduce ? 0 : (Math.sin(T * 2.1) * 0.03 * e.bob + (curEmo() === 'joy' ? Math.abs(Math.sin(T * 8)) * 0.07 : 0)) * st.gW;
            const R0 = new X().rot(mZ(st.lean.x)).s(sx, sy, sx);
            const G = R0.t(0, BODY_Y, 0).rot(mY(st.bodyYaw.x)).t(0, -BODY_Y, 0);
            const hp = HEAD_POS, lh = st.lagHead, lb = st.lagBody;
            hitParts = {};
            const reg = (name, M, a, b, rad) => { hitParts[name] = [proj(tp(M.m, a)), proj(tp(M.m, b)), rad * u * 1.1]; };

            // body
            const bodyX = G.t(lb.x.x, BODY_Y + bob * 0.6 + lb.y.x, 0).s(1, 1 + breathe, 1 + breathe);
            drawPart(meshes.body, bodyX, false, 0.12);
            reg('body', bodyX, [0, 0, 0.3], [0, 0, 0.3], 0.42);

            // head and ears
            const headX = G.t(hp[0] + lh.x.x, hp[1] + bob + lh.y.x, hp[2]).rot(mZ(st.headRoll.x)).rot(mY(st.headYaw.x)).rot(mX(st.headPitch.x));
            drawPart(meshes.head, headX, true);
            reg('head', headX, [0, 0, 0.3], [0, 0, 0.3], 0.8);
            [['earL', LIMB.earL], ['earR', LIMB.earR]].forEach(([n, L]) => {
                const M = headX.t(L.pivot[0], L.pivot[1], L.pivot[2]).rot(mZ(st[n].x)).t(0, -(EAR.len / 2 - EAR.root), 0);
                drawPart(meshes.ear, M, false);
                const h = EAR.len / 2 - EAR.w / 2;
                reg(n, M, [0, h, 0], [0, -h, 0], EAR.w * 0.65);
            });

            // cotton tail behind the body
            const tw = reduce ? 0 : Math.sin(T * 2.6) * 0.012;
            drawPart(meshes.tail, G.t(TAIL.pos[0] + lb.x.x + tw, TAIL.pos[1] + bob * 0.6 + lb.y.x, TAIL.pos[2]), false, 0.2);

            // arms and legs hang from a pivot at their inner end
            const limb = (n, L, mesh, lagk, extraY) => {
                const lg = st[lagk];
                const M = G.t(L.pivot[0] + lg.x.x, L.pivot[1] + (extraY || 0) + lg.y.x, L.pivot[2]).rot(mZ(st[n].x)).t(0, -L.axis / 2, 0);
                drawPart(mesh, M, false, n.startsWith('arm') ? 0.08 : 0);
                reg(n, M, [0, L.axis / 2, 0], [0, -L.axis / 2, 0], CAP_R * 1.3);
            };
            limb('armL', LIMB.armL, meshes.arm, 'lagArmL', bob * 0.7);
            limb('armR', LIMB.armR, meshes.arm, 'lagArmR', bob * 0.7);
            limb('legL', LIMB.legL, meshes.leg, 'lagLegL', 0);
            limb('legR', LIMB.legR, meshes.leg, 'lagLegR', 0);
        }

        /* =========================================================
           Boot
           ========================================================= */
        layout();
        let resizeQ = 0;
        window.addEventListener('resize', () => {
            cancelAnimationFrame(resizeQ);
            resizeQ = requestAnimationFrame(() => {
                layout();
                st.x = clamp(st.x, xmin(), xmax());
                if (st.grounded) st.y = floorY();
                if (bOn) { bw = bubble.offsetWidth; bh = bubble.offsetHeight; }
            });
        });

        const reduce0 = reduceMQ.matches;
        st.x = clamp(24 + 1.15 * u, xmin(), xmax());
        const first = store.get('va-mascot-seen') !== '1';
        if (hidden) {
            st.y = floorY(); st.grounded = true;
            hit.setAttribute('aria-label', 'Bring the rabbit helper back');
        } else if (reduce0) {
            st.y = floorY(); st.grounded = true;
        } else {
            st.y = floorY() + 3.6 * u; st.vy = -Math.sqrt(2 * 40 * u * (3.6 * u + 1.2 * u)); st.grounded = false;
        }
        lastAct = 0;
        document.addEventListener('visibilitychange', () => { if (!document.hidden) { last = performance.now(); } });

        let last = performance.now(), slow = 0;
        function frame(now) {
            requestAnimationFrame(frame);
            if (document.hidden) { last = now; return; }
            let dt = (now - last) / 1000; last = now;
            dt = Math.min(dt, 1 / 30);
            // an idle sleeper only needs a gentle frame rate
            if (asleep && st.grounded && !st.held && !bOn) { slow += dt; if (slow < 1 / 20) return; dt = slow; slow = 0; }
            update(dt);
        }
        requestAnimationFrame((t) => { last = t; requestAnimationFrame(frame); });

        // greeting
        if (!hidden) {
            setTimeout(() => {
                if (busy()) return;
                waveUntil = T + 2.6;
                shown.add('hello');
                show({
                    text: first ? 'Hi! I am the helper here. Poke me any time and I will show you around.' : 'Welcome back!',
                    chips: first ? [{ label: 'Show me around', fn: () => tour(0), primary: true, keep: true }, { label: 'Maybe later', quiet: true }] : null,
                    emo: 'joy', ttl: first ? 9000 : 3200, emoMs: 2200
                });
                store.set('va-mascot-seen', '1');
                lastSection = null; sectionTick();
            }, reduce0 ? 900 : 1700);
        } else { lastSection = null; sectionTick(); }
        watchShards();

        /* ---------- Small public API ---------- */
        window.mascot = {
            emote: (name, ms) => emote(name, ms),
            say: (text, emo, ttl) => show({ text: String(text), emo, ttl: ttl || 4000 }),
            wave: (s) => { waveUntil = T + (s || 2.4); },
            hop: () => { if (!hidden) { st.vy = -u * 11; st.grounded = false; } },
            hide: hideMascot,
            show: () => { if (hidden) unhide(); },
            emotions: Object.keys(EMO)
        };
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();