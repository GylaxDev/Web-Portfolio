/* fx.js — a field of dashes floating on a simulated water surface. A real height field (wave equation)
   runs underneath: the pointer presses a soft crater into it (hold = convex bulge), and moving through it
   drags a wake that rolls outward and rebounds like brushing water. Every dash springs along the local slope,
   so it leans, slides and overshoots instead of following a fixed formula. Idle: slow drops + a gentle swell.
   Footer: dots resolve into the VA monogram.
   Plus: circle pointer, magnetic buttons, card tilt, scroll progress. Original code, no dependencies. */
(() => {
'use strict';
const root = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const fine = matchMedia('(hover: hover) and (pointer: fine)');
const wide = matchMedia('(min-width: 735px)');
const lite = matchMedia('(pointer: coarse), (max-width: 734px)');   // phones/tablets: the wave runs at 30 fps with a cheaper text mask

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const hash = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };

/* ---------- theme-aware colours ---------- */
const NL = 8;                                     // brightness / thickness levels
/* brand palette (the same hues as the VA monogram wash): gold, amber, sage, mint, kept dim so the dots sit behind the scene */
const PAL_DARK  = [[231, 196, 124], [233, 163, 95], [92, 154, 132], [168, 214, 198]];
const PAL_LIGHT = [[168, 124, 40], [196, 108, 44], [47, 93, 78], [60, 140, 120]];
const NP = PAL_DARK.length;
const SAT = 0.5;                                  // 1 = full brand colour, 0 = grey
const soften = (c, g) => c.map(v => Math.round(g + (v - g) * SAT));
let paused = 0;                                    // >0 while the sidebar or a phone theme fade wants the field still
let dark = true, base = '', LC = [];
function theme() {
  dark = root.getAttribute('data-theme') !== 'light';
  const b = dark ? [242, 241, 237] : [20, 20, 19], pal = (dark ? PAL_DARK : PAL_LIGHT).map(c => soften(c, dark ? 150 : 90));
  base = b.join(',');
  const lo = dark ? 0.06 : 0.07, span = dark ? 0.2 : 0.2;      // dimmer than before (was 0.13 + 0.52)
  LC = [];
  for (let p = 0; p < NP; p++) for (let l = 0; l < NL; l++)
    LC.push(`rgba(${pal[p].join(',')},${(lo + span * l / (NL - 1)).toFixed(3)})`);
}
theme();
new MutationObserver(() => { theme(); if (reduce.matches || paused) frame(0, 0); })
  .observe(root, { attributes: true, attributeFilter: ['data-theme'] });

/* ---------- canvas ---------- */
const cv = document.createElement('canvas');
cv.id = 'fx';
cv.setAttribute('aria-hidden', 'true');
document.body.prepend(cv);
const ctx = cv.getContext('2d');
let W = 0, H = 0, dpr = 1;
let RC = 120;                               // crater radius around the pointer
let N = 0, gx = null, gy = null, gj = null;            // rest positions of the dots (jittered hex grid)
let sg = null, lv = null, lvN = null, sp = null, pal = null;   // segment endpoints, per-(colour,level) index lists, speck list, per-dot palette index
let ox = null, oy = null, ovx = null, ovy = null;  // per-dot spring: offset + velocity
let ssx = null, ssy = null, ssh = null;            // per-dot smoothed surface slope + height
let PITCH = 42;                                    // dot spacing of the lattice (set in buildGrid)
const CELL = 14;                                   // water simulation resolution (px per cell)
let GW = 0, GH = 0, hf = null, hv = null, hgx = null, hgy = null;   // height, velocity, slope

function buildGrid() {
  const big = wide.matches, pitch = big ? 42 : 34, rowH = pitch * 0.866;
  PITCH = pitch;
  const cols = Math.ceil(W / pitch) + 2, rows = Math.ceil(H / rowH) + 2;
  N = cols * rows;
  gx = new Float32Array(N); gy = new Float32Array(N); gj = new Float32Array(N);
  sg = new Float32Array(N * 4); sp = new Int32Array(N);
  lv = Array.from({ length: NP * NL }, () => new Int32Array(N)); lvN = new Int32Array(NP * NL); pal = new Uint8Array(N);
  ox = new Float32Array(N); oy = new Float32Array(N); ovx = new Float32Array(N); ovy = new Float32Array(N);
  ssx = new Float32Array(N); ssy = new Float32Array(N); ssh = new Float32Array(N);
  GW = Math.ceil(W / CELL) + 2; GH = Math.ceil(H / CELL) + 2;
  hf = new Float32Array(GW * GH); hv = new Float32Array(GW * GH);
  hgx = new Float32Array(GW * GH); hgy = new Float32Array(GW * GH);
  let k = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++, k++) {
    gx[k] = (c - 1 + (r & 1 ? 0.5 : 0)) * pitch + 0;
    gy[k] = (r - 1) * rowH + 0;
    gj[k] = 1;
    /* brand colour per dot: slow drifting regions (like contour bands) with a little scatter */
    const fld = 0.5 + 0.25 * Math.sin(gx[k] * 0.0026 + gy[k] * 0.0019) + 0.25 * Math.sin(gy[k] * 0.0041 - gx[k] * 0.0013 + 1.7);
    pal[k] = clamp(Math.floor((fld + (hash(c, r) - 0.5) * 0.35) * NP), 0, NP - 1);
  }
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 1.5);   // capped: the canvas only holds tiny dots
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  RC = wide.matches ? 420 : 220;
  buildGrid();
  if (reduce.matches) frame(0, 0);
}

/* ---------- VA monogram as a lookup mask ---------- */
const MW = 137 * 4, MH = 89 * 4;
let mask = null;
(function buildMask() {
  const el = document.querySelector('.brand path');
  const d = el && el.getAttribute('d');
  if (!d || !window.Path2D) return;
  const c = document.createElement('canvas');
  c.width = MW; c.height = MH;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.scale(4, 4);
  x.fill(new Path2D(d), 'evenodd');
  const data = x.getImageData(0, 0, MW, MH).data;
  mask = new Uint8Array(MW * MH);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] > 128 ? 1 : 0;
})();
const inVA = (u, v) => mask && u >= 0 && u < 1 && v >= 0 && v < 1 && mask[((v * MH) | 0) * MW + ((u * MW) | 0)] === 1;

/* ---------- state ---------- */
let mx = -9999, my = -9999;           // raw pointer (for ring / magnets)
let gtx = -9999, gty = -9999;         // field target: last pointer / tap position
let cx = -9999, cy = -9999;           // eased pointer
let fx0 = 0, fy0 = 0;                 // focus of the ring: the pointer, or a slowly wandering ghost when idle
let gA = 0, active = false;           // crater strength, pointer present
let pressed = false, amp = 0;         // holding the pointer flips the crater into a bulge (amp eases between them)
let lastDrop = 0;
let px = 0, py = 0, tpx = 0, tpy = 0; // parallax for CSS
let morph = 0;
const markEl = document.querySelector('.end .vmark');

/* text map: coarse grid of where copy sits, so ripples recede behind it instead of cutting through it */
const TC = 24, TEXT_SEL = 'h1,h2,h3,h4,p,li,figcaption,dt,dd,summary,label,blockquote,.cta,.cta2,.hgo,.chip,.tags li,header.site nav a';
let tmEls = null, tmElsT = 0, lastScrollT = 0;
let tm = null, tmW = 0, tmH = 0, tmDirty = true, tmLast = -1e9;
function buildTextMask() {
  tmW = Math.ceil(W / TC); tmH = Math.ceil(H / TC);
  if (!tm || tm.length !== tmW * tmH) tm = new Uint8Array(tmW * tmH); else tm.fill(0);
  const now = performance.now();
  if (!tmEls || now - tmElsT > 4000) { tmEls = document.querySelectorAll(TEXT_SEL); tmElsT = now; }
  for (const el of tmEls) {
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > H || r.width < 4 || r.height < 4) continue;
    const x0 = Math.max(0, Math.floor((r.left - 8) / TC)), x1 = Math.min(tmW - 1, Math.floor((r.right + 8) / TC));
    const y0 = Math.max(0, Math.floor((r.top - 6) / TC)), y1 = Math.min(tmH - 1, Math.floor((r.bottom + 6) / TC));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) tm[y * tmW + x] = 1;
  }
  tmDirty = false; tmLast = performance.now();
}

/* ---------- the water ---------- */
/* wave equation on a coarse grid: velocity follows the Laplacian, a little damping lets ripples die out gently */
function stepWater() {
  const C2 = 0.2, DAMP = 0.984, REST = 0.0005;
  for (let y = 1; y < GH - 1; y++) {
    for (let x = 1, i = y * GW + 1; x < GW - 1; x++, i++) {
      const lap = hf[i - 1] + hf[i + 1] + hf[i - GW] + hf[i + GW] - 4 * hf[i];
      hv[i] = (hv[i] + lap * C2) * DAMP - hf[i] * REST;
    }
  }
  for (let y = 1; y < GH - 1; y++) for (let x = 1, i = y * GW + 1; x < GW - 1; x++, i++) hf[i] += hv[i];
}
function slopes() {
  for (let y = 2; y < GH - 2; y++) {
    for (let x = 2, i = y * GW + 2; x < GW - 2; x++, i++) {
      hgx[i] = (hf[i + 2] - hf[i - 2] + 2 * (hf[i + 1] - hf[i - 1])) * 0.1666;
      hgy[i] = (hf[i + 2 * GW] - hf[i - 2 * GW] + 2 * (hf[i + GW] - hf[i - GW])) * 0.1666;
    }
  }
}
/* the pointer pins the surface toward a soft bowl (crater, with a low rim) or its mirror image (convex bulge);
   wherever it just was, the surface is released and rebounds — that rebound is the wake */
function pinCursor(x, y, a, R) {
  const x0 = Math.max(1, Math.floor((x - R * 1.9) / CELL)), x1 = Math.min(GW - 2, Math.ceil((x + R * 1.9) / CELL));
  const y0 = Math.max(1, Math.floor((y - R * 1.9) / CELL)), y1 = Math.min(GH - 2, Math.ceil((y + R * 1.9) / CELL));
  const R2 = R * R;
  for (let j = y0; j <= y1; j++) {
    for (let i = x0; i <= x1; i++) {
      const dx = i * CELL - x, dy = j * CELL - y, q = (dx * dx + dy * dy) / R2;
      if (q > 3.6) continue;
      const prof = (1 - 2.2 * q) * Math.exp(-1.6 * q), w = 0.2 * Math.exp(-q * 0.8), k = j * GW + i;
      hf[k] += (a * prof - hf[k]) * w;
      hv[k] *= 1 - w * 0.9;
    }
  }
}
/* an impulse: a drop falling on the surface */
function drop(x, y, a, R) {
  const x0 = Math.max(1, Math.floor((x - R * 2.5) / CELL)), x1 = Math.min(GW - 2, Math.ceil((x + R * 2.5) / CELL));
  const y0 = Math.max(1, Math.floor((y - R * 2.5) / CELL)), y1 = Math.min(GH - 2, Math.ceil((y + R * 2.5) / CELL));
  for (let j = y0; j <= y1; j++) {
    for (let i = x0; i <= x1; i++) {
      const dx = i * CELL - x, dy = j * CELL - y;
      hv[j * GW + i] += a * Math.exp(-(dx * dx + dy * dy) / (R * R));
    }
  }
}

/* ---------- the field ---------- */
/* ripples: smooth rings that expand from where the pointer has been (or from the ghost when idle) and fade out */
const WA = [0.17, 0.15, 0.10, 0.07, 0.05], WP = [0, 0, 0, 0, 0], WS = [0.00031, -0.00042, 0.00055, -0.00037, 0.00049];
function reseed() { for (let k = 0; k < WP.length; k++) WP[k] = Math.random() * 6.2832; }
reseed();
const rip = [], RSPEED = 0.17, RLIFE = 3400;
let lrx = -9999, lry = -9999, lrt = 0;
function ripple(x, y, a, t) { rip.push({ x, y, t0: t, a }); if (rip.length > 7) rip.shift(); lrx = x; lry = y; lrt = t; }

function drawField(t, dt) {
  if (!N) return;
  const live = dt > 0 && !reduce.matches;
  const breath = Math.sin(t * 0.0011);
  const ghx = W * (0.5 + 0.28 * Math.sin(t * 0.00021)), ghy = H * (0.5 + 0.2 * Math.sin(t * 0.00033 + 1));
  const nr = live ? rip.length : 0, rX = [], rY = [], rR = [], rA = [], rS = [];

  if (live) {
    gA = lerp(gA, active ? 1 : 0, clamp((active ? 0.16 : 0.04) * dt, 0, 1));
    amp = lerp(amp, pressed ? 0.8 : -1, clamp(0.14 * dt, 0, 1));
    if (fx0 === 0 && fy0 === 0) { fx0 = ghx; fy0 = ghy; }
    if (active) {
      cx = lerp(cx, gtx, clamp(0.3 * dt, 0, 1)); cy = lerp(cy, gty, clamp(0.3 * dt, 0, 1));
      /* moving through the surface sheds a ripple every so often */
      if (t - lrt > 150 && Math.sqrt((cx - lrx) * (cx - lrx) + (cy - lry) * (cy - lry)) > 60) ripple(cx, cy, 0.4, t);
    } else if (t - lrt > 3400) ripple(ghx, ghy, 0.4, t);
    const fk = clamp((active ? 0.26 : 0.035) * dt, 0, 1);
    fx0 = lerp(fx0, active ? cx : ghx, fk); fy0 = lerp(fy0, active ? cy : ghy, fk);
    while (rip.length && t - rip[0].t0 > RLIFE) rip.shift();
    for (const g of rip) {
      const age = t - g.t0, u = 1 - age / RLIFE;
      rX.push(g.x); rY.push(g.y); rR.push(40 + age * RSPEED); rA.push(g.a * u * u); rS.push(1 / (2 * Math.pow(46 + age * 0.012, 2)));
    }
    if (lite.matches ? (tmDirty ? t - lastScrollT > 160 : t - tmLast > 2500) : (tmDirty ? t - tmLast > 90 : t - tmLast > 900)) buildTextMask();
  }
  const nrr = rX.length;
  const RH = RC * 0.7 * (1 + 0.03 * breath);
  const strength = live ? 0.55 + 0.45 * gA : 0;                       // the ring is always there; the pointer makes it full
  const tcol = clamp((0.8 - amp) / 1.8, 0, 1);                        // 1 = crater (ring wide), 0 = pressed (ring collapses)
  const ringR = RH * (0.5 + 0.75 * tcol), sig2 = 1 / (2 * Math.pow(PITCH * (0.8 + 0.35 * tcol), 2));   // thin band: roughly two dots wide, so it reads as a ring
  lvN.fill(0);
  const sa = clamp(0.2 * dt, 0, 1), spring = 0.13 * dt, damp = Math.pow(0.8, dt);

  for (let i = 0; i < N; i++) {
    const X = gx[i], Y = gy[i];
    let e = 0.12;
    const ddx = X - fx0, ddy = Y - fy0, rr = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
    const ux = ddx / rr, uy = ddy / rr;

    if (live) {
      /* the ring: a smooth band of big dots at ringR; tiny dots inside and fading out beyond */
      const ang = Math.atan2(ddy, ddx);
      let wob = 1;
      for (let k = 0; k < 5; k++) wob += WA[k] * Math.sin((k + 2) * ang + WP[k] + t * WS[k]);
      const rE = rr / wob, dr = rE - ringR;                          // uneven outline that still tends to a circle
      e = 0.1 + 0.07 * Math.sin(X * 0.004 - Y * 0.003 + t * 0.0006) + 0.9 * Math.exp(-dr * dr * sig2) * strength;
      let px = 0, py = 0;
      for (let j = 0; j < nrr; j++) {                                  // ripples add brightness and a soft shove
        const wx = X - rX[j], wy = Y - rY[j], r = Math.sqrt(wx * wx + wy * wy), q = r - rR[j];
        const g = Math.exp(-q * q * rS[j]) * rA[j];
        if (g < 0.01) continue;
        e += g * 0.6;
        if (r > 0.5) { px += wx / r * g * 14; py += wy / r * g * 14; }
      }
      let tf = 1;                                                     // quieter behind copy
      if (tm) { const cxi = (X / TC) | 0, cyi = (Y / TC) | 0; if (cxi >= 0 && cxi < tmW && cyi >= 0 && cyi < tmH && tm[cyi * tmW + cxi]) tf = 0.45; }
      e *= tf;
      /* gentle displacement only: dots lean away from (or toward) the focus, so the lattice stays even */
      const q2 = Math.min(1, rE / (RH * 2.4)), f = Math.pow(1 - q2 * q2 * (3 - 2 * q2), 2);
      let pm = strength * RH * 0.16 * (-amp) * f;
      if (pm < 0 && -pm > rr * 0.5) pm = -rr * 0.5;
      /* ring tidy-up: dots near the ring edge slide a little toward its radius (max ~1/3 of the spacing) so the band reads as a true circle without bunching */
      const ringPull = clamp(-dr, -PITCH * 0.32, PITCH * 0.32) * Math.exp(-dr * dr / (2 * PITCH * PITCH * 2.5)) * strength;
      const tx = (ux * (pm + ringPull) + px) * tf, ty = (uy * (pm + ringPull) + py) * tf;      // dots spring toward their target: they lag, overshoot, settle
      ovx[i] = (ovx[i] + (tx - ox[i]) * spring) * damp; ox[i] += ovx[i] * dt;
      ovy[i] = (ovy[i] + (ty - oy[i]) * spring) * damp; oy[i] += ovy[i] * dt;
    }

    ssh[i] += (e - ssh[i]) * sa;                                      // sizes ease in and out, never flicker
    const ee = ssh[i] > 1 ? 1 : ssh[i];
    const l = Math.min(NL - 1, (ee * NL) | 0);
    const w = 1.0 + 0.2 * l, len = 1.7 + 4.4 * ee, half = Math.max(0.01, (len - w) * 0.5), Xp = X + ox[i], Yp = Y + oy[i];
    const bk = pal[i] * NL + l, n = lvN[bk]++; lv[bk][n] = i;
    sg[i * 4] = Xp - ux * half; sg[i * 4 + 1] = Yp - uy * half;       // every dash points away from the ring's centre
    sg[i * 4 + 2] = Xp + ux * half + 0.01; sg[i * 4 + 3] = Yp + uy * half;
  }

  /* one stroke per level: every dot is a round capsule, from a pin-point up to a fat dash */
  ctx.lineCap = 'round';
  for (let b = 0; b < NP * NL; b++) {
    if (!lvN[b]) continue;
    ctx.strokeStyle = LC[b];
    ctx.lineWidth = 1.0 + 0.2 * (b % NL);
    ctx.beginPath();
    const list = lv[b];
    for (let n = 0, m = lvN[b]; n < m; n++) { const i = list[n] * 4; ctx.moveTo(sg[i], sg[i + 1]); ctx.lineTo(sg[i + 2], sg[i + 3]); }
    ctx.stroke();
  }
}

/* ---------- one frame ---------- */
function frame(ts, dt) {
  const t = ts || 0;
  ctx.clearRect(0, 0, W, H);
  drawField(t, dt);

  if (!dt) return;

  px = lerp(px, tpx, clamp(0.06 * dt, 0, 1)); py = lerp(py, tpy, clamp(0.06 * dt, 0, 1));
  root.style.setProperty('--px', px.toFixed(3));
  root.style.setProperty('--py', py.toFixed(3));

  if (ring) {
    rx = lerp(rx, mx, clamp(0.45 * dt, 0, 1)); ry = lerp(ry, my, clamp(0.45 * dt, 0, 1));
    ring.style.transform = `translate3d(${rx}px,${ry}px,0)`;
  }
  for (const m of mags) {
    m.x = lerp(m.x, m.tx, clamp(0.16 * dt, 0, 1)); m.y = lerp(m.y, m.ty, clamp(0.16 * dt, 0, 1));
    if (Math.abs(m.x) + Math.abs(m.y) > 0.02 || m.tx || m.ty) m.el.style.translate = `${m.x.toFixed(2)}px ${m.y.toFixed(2)}px`;
    else if (m.el.style.translate) m.el.style.translate = '';
  }
}

/* ---------- cursor ring (fine pointers only) ---------- */
let ring = null, rx = 0, ry = 0, curOn = false;
if (fine.matches && !reduce.matches) {
  ring = document.createElement('div');
  ring.className = 'fx-ring';
  ring.setAttribute('aria-hidden', 'true');
  document.body.append(ring);
}

/* ---------- magnetic elements ---------- */
const mags = [];
if (fine.matches && !reduce.matches) {
  $$('.cta, .cta2, .tgl, .brand').forEach(el => mags.push({ el, x: 0, y: 0, tx: 0, ty: 0 }));
}
function aimMagnets() {
  for (const m of mags) {
    const r = m.el.getBoundingClientRect();
    const dx = mx - (r.left + r.width / 2), dy = my - (r.top + r.height / 2);
    /* only the element actually under the pointer leans toward it: neighbouring buttons never pull into each other */
    const over = Math.abs(dx) <= r.width / 2 && Math.abs(dy) <= r.height / 2;
    m.tx = over ? clamp(dx * 0.14, -5, 5) : 0;
    m.ty = over ? clamp(dy * 0.2, -4, 4) : 0;
  }
}

/* ---------- loop ---------- */
let raf = 0, last = 0;
function loop(ts) {
  raf = requestAnimationFrame(loop);
  if (lite.matches && ts - last < 28) return;
  const dt = clamp((ts - last) / 16.667, 0.2, 2.5); last = ts;
  frame(ts, dt);
}
const start = () => { if (!raf && !paused && !reduce.matches && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(loop); } };
const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
window.addEventListener('fx:pause', () => { paused++; stop(); });
window.addEventListener('fx:resume', () => { paused = Math.max(0, paused - 1); if (!paused) start(); });

/* ---------- events ---------- */
let scrollTick = 0;
function onScroll() {
  lastScrollT = performance.now();
  if (scrollTick) return;
  tmDirty = true;
  scrollTick = requestAnimationFrame(() => {
    scrollTick = 0;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    root.style.setProperty('--sp', max > 0 ? clamp(window.scrollY / max, 0, 1).toFixed(4) : '0');
    if (reduce.matches) frame(0, 0);
  });
}
window.addEventListener('scroll', onScroll, { passive: true });

let rz = 0;
window.addEventListener('resize', () => { tmDirty = true; clearTimeout(rz); rz = setTimeout(resize, 120); });

document.addEventListener('pointermove', e => {
  mx = e.clientX; my = e.clientY; gtx = mx; gty = my;
  if (!active) { cx = mx; cy = my; reseed(); }     // snap so the crater appears exactly under the pointer, with a fresh random outline
  active = true;
  tpx = (mx / W - 0.5) * 2; tpy = (my / H - 0.5) * 2;
  if (ring) {
    if (!curOn) { curOn = true; rx = mx; ry = my; ring.classList.add('on'); root.classList.add('fx-cursor'); }
    ring.classList.toggle('hot', !!(e.target.closest && e.target.closest('a, button, summary, .zoom-hit, [role="button"]')));
  }
  if (mags.length) aimMagnets();
}, { passive: true });

function pointerGone(e) {
  if (e && e.pointerType === 'mouse' && e.type !== 'pointerleave') return;
  mx = my = -9999; tpx = tpy = 0; active = false; pressed = false;
  mags.forEach(m => { m.tx = m.ty = 0; });
  if (ring) { curOn = false; ring.classList.remove('on'); root.classList.remove('fx-cursor'); }
}
root.addEventListener('pointerleave', pointerGone);
document.addEventListener('pointercancel', pointerGone);
document.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') pointerGone(e); });

document.addEventListener('pointerdown', e => {
  if (reduce.matches) return;
  if (e.target.closest && e.target.closest('a, button, input, textarea, select, summary, .lb, [role="button"]')) return;
  gtx = e.clientX; gty = e.clientY; if (!active) { cx = gtx; cy = gty; } active = true;
  pressed = true; reseed();                  // hold: the crater swells into a bulge; letting go drops it back with a splash
  ripple(gtx, gty, 0.9, performance.now());
});
document.addEventListener('pointerup', () => { pressed = false; });

document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });
if (reduce.addEventListener) reduce.addEventListener('change', () => { reduce.matches ? (stop(), frame(0, 0)) : start(); });
if (wide.addEventListener) wide.addEventListener('change', resize);

/* ---------- card tilt (featured cards) ---------- */
if (fine.matches && !reduce.matches) {
  $$('.fcard').forEach(card => {
    card.addEventListener('pointermove', e => {
      if (!wide.matches) return;
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      card.style.setProperty('--rx', (-y * 7).toFixed(2) + 'deg');
      card.style.setProperty('--ry', (x * 9).toFixed(2) + 'deg');
    });
    card.addEventListener('pointerleave', () => { card.style.removeProperty('--rx'); card.style.removeProperty('--ry'); });
  });
}

/* ---------- boot ---------- */
resize();
onScroll();
if (reduce.matches) frame(0, 0); else start();
})();
