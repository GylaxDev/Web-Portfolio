(() => {
'use strict';
const $ = (s, r = document) => [...r.querySelectorAll(s)];
const $1 = (s, r = document) => r.querySelector(s);
const NS = 'http://www.w3.org/2000/svg';
const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
const reduced = () => mqReduce.matches;
const svgEl = (n, a = {}) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };

/* ---------- Work filters (animated) + rail ---------- */
const entries = $('.entry');
const chips = $('.work .chip');
const links = $('.rail a');

function swap(el, show) {
  clearTimeout(el._t);
  if (reduced()) { el.hidden = !show; el.classList.remove('f-leave', 'f-enter'); return; }
  if (show) {
    if (el.hidden) {
      el.classList.add('in', 'f-enter');
      el.hidden = false;
      void el.offsetWidth;
      el.classList.remove('f-enter');
    } else el.classList.remove('f-leave');
  } else if (!el.hidden) {
    el.classList.add('f-leave');
    el._t = setTimeout(() => { el.hidden = true; el.classList.remove('f-leave'); }, 210);
  }
}
function applyFilter(f) {
  chips.forEach(x => x.classList.toggle('on', x.dataset.f === f));
  entries.forEach(e => swap(e, f === 'all' || e.dataset.cat === f));
  const ok = c => f === 'all' || c === f;
  $('.tl a').forEach(a => { a.parentElement.hidden = !ok(a.dataset.cat); });
  const n = entries.filter(e => ok(e.dataset.cat)).length, wm = $1('#wmeta');
  if (wm) wm.textContent = f === 'all' ? n + ' projects' : n + ' of ' + entries.length + ' projects';
}
chips.forEach(c => c.addEventListener('click', () => applyFilter(c.dataset.f)));
links.forEach(a => a.addEventListener('click', () => applyFilter('all')));

const railIO = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) links.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id));
}), { rootMargin: '-35% 0px -55% 0px' });
entries.forEach(e => railIO.observe(e));

/* ---------- Scroll reveals ---------- */
(function initReveal() {
  if (!('IntersectionObserver' in window)) return;
  const root = document.documentElement;
  try {
    root.classList.add('js');
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { threshold: .06, rootMargin: '0px 0px -6% 0px' });
    const groups = [['.featured .fcard', 70], ['.work .entry', 0], ['.systems .gh', 0], ['.systems .lab', 60], ['.bg .bgrid>div', 80],
      ['.idx', 0], ['.systems h2', 0], ['.systems .intro', 0], ['.bg h2', 0]];
    groups.forEach(([sel, step]) => $(sel).forEach((el, i) => {
      el.classList.add('reveal');
      el.style.setProperty('--d', i * step + 'ms');
      io.observe(el);
    }));
  } catch (err) { root.classList.remove('js'); }
})();

/* ---------- Lightbox ---------- */
const lb = $1('#lb');
if (lb) {
  const lbImg = $1('#lbImg'), lbTitle = $1('#lbTitle'), lbCap = $1('#lbCap'), lbClose = $1('.lb-close', lb);
  let lastFocus = null, lbTimer = 0;

  const openLb = (src, title, alt) => {
    lastFocus = document.activeElement;
    clearTimeout(lbTimer);
    lbImg.src = src; lbImg.alt = alt || '';
    lbTitle.textContent = title || ''; lbCap.textContent = alt || '';
    const sw = innerWidth - document.documentElement.clientWidth;
    document.documentElement.classList.add('lb-open');
    if (sw > 0) document.body.style.paddingRight = sw + 'px';
    lb.hidden = false; void lb.offsetWidth; lb.classList.add('open');
    lbClose.focus({ preventScroll: true });
  };
  const closeLb = () => {
    if (lb.hidden) return;
    lb.classList.remove('open');
    document.documentElement.classList.remove('lb-open');
    document.body.style.paddingRight = '';
    lbTimer = setTimeout(() => { lb.hidden = true; lbImg.removeAttribute('src'); }, reduced() ? 0 : 220);
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  };
  lb.addEventListener('click', e => { if (!e.target.closest('.lb-fig')) closeLb(); });
  document.addEventListener('keydown', e => {
    if (lb.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); closeLb(); }
    else if (e.key === 'Tab') { e.preventDefault(); lbClose.focus(); }
  });

  const titleFor = img => {
    const host = img.closest('.entry,.fcard');
    const h = host && $1('h3', host);
    if (h) return h.textContent.trim();
    return img.closest('#viewport') ? 'Project GAIA' : img.alt;
  };

  const badge = () => { const b = document.createElement('span'); b.className = 'zoom-badge'; b.setAttribute('aria-hidden', 'true'); b.textContent = 'Inspect full view'; return b; };

  const makeZoomable = (host, img) => {
    host.classList.add('zoomable');
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'zoom-hit';
    b.setAttribute('aria-haspopup', 'dialog');
    b.setAttribute('aria-label', 'Inspect full view: ' + (img.alt || titleFor(img)));
    b.addEventListener('click', () => openLb(img.currentSrc || img.src, titleFor(img), img.alt));
    host.append(b, badge());
  };
  $('.entry .frame').forEach(fr => { const img = $1('img', fr); if (img) makeZoomable(fr, img); });

  /* featured cards link to a case study when one exists; otherwise the image zooms */
  $('.fcard').forEach(a => {
    const href = a.getAttribute('href') || '';
    if (href[0] === '#' && !document.getElementById(href.slice(1))) {
      const art = $1('.art', a), img = art && $1('img', art);
      if (!img) return;
      art.classList.add('zoomable'); art.append(badge());
      a.setAttribute('aria-haspopup', 'dialog');
      a.addEventListener('click', e => { e.preventDefault(); openLb(img.currentSrc || img.src, titleFor(img), img.alt); });
    }
  });
}

/* ---------- Hero viewport: video loop ---------- */
const vp = $1('#viewport');
if (vp) {
  const vid = $1('#heroVideo', vp), play = $1('.vplay', vp);

  /* video: only plays when allowed, visible, and wanted */
  if (vid) {
    const conn = navigator.connection;
    const saver = conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || ''));
    let userPaused = false, inView = true;
    const sync = () => {
      const want = !reduced() && !userPaused && inView && !document.hidden;
      if (want) { const p = vid.play(); if (p && p.catch) p.catch(() => {}); } else vid.pause();
    };
    const drop = () => { vid.removeAttribute('autoplay'); vid.pause(); $('source', vid).forEach(s => s.remove()); vid.load(); play.hidden = true; vp.classList.remove('live'); };
    if (reduced() || saver) drop();
    else {
      vid.addEventListener('playing', () => { vp.classList.add('live'); play.hidden = false; });
      new IntersectionObserver(es => { inView = es[0].isIntersecting; sync(); }, { threshold: .1 }).observe(vp);
      document.addEventListener('visibilitychange', sync);
      mqReduce.addEventListener('change', sync);
      play.addEventListener('click', () => {
        userPaused = !userPaused;
        $1('use', play).setAttribute('href', userPaused ? '#play' : '#pause');
        play.setAttribute('aria-label', userPaused ? 'Play background video' : 'Pause background video');
        sync();
      });
    }
  }
}

/* ---------- Algorithm trace: Linear Search vs Quick Sort + Binary Search ---------- */
const bench = $1('[data-bench]');
if (bench) {
  const runBtn = $1('.bench-run', bench), note = $1('.bench-note', bench);
  const fLin = $1('.lin', bench), fSort = $1('.sort', bench), fLook = $1('.look', bench);
  const nLin = $1('[data-n=lin]', bench), nQs = $1('[data-n=qs]', bench);
  const fmt = n => Math.round(n).toLocaleString('en-US') + ' steps';
  const idle = note.textContent;
  let timer = 0;

  function trace() {
    let s = 2463534242;                                   /* fixed seed: the trace is repeatable */
    const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
    const a = Array.from({ length: 64 }, (_, i) => i + 1);
    for (let i = 63; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    let lin = 0;
    for (let i = 0; i < 64; i++) lin += i + 1;            /* looking up a[i] scans i+1 elements */
    const b = a.slice();
    let sort = 0;
    (function qs(lo, hi) {
      if (lo >= hi) return;
      const p = b[hi]; let i = lo;
      for (let j = lo; j < hi; j++) { sort++; if (b[j] < p) { [b[i], b[j]] = [b[j], b[i]]; i++; } }
      [b[i], b[hi]] = [b[hi], b[i]];
      qs(lo, i - 1); qs(i + 1, hi);
    })(0, 63);
    let look = 0;
    for (const v of a) {
      let lo = 0, hi = 63;
      while (lo <= hi) { look++; const m = (lo + hi) >> 1; if (b[m] === v) break; if (b[m] < v) lo = m + 1; else hi = m - 1; }
    }
    return { lin, sort, look };
  }
  const paint = (t, max, adv) => {
    const L = Math.min(t.lin, adv), Q = Math.min(t.sort + t.look, adv), sp = Math.min(t.sort, Q);
    fLin.style.width = L / max * 100 + '%';
    fSort.style.width = sp / max * 100 + '%';
    fLook.style.width = (Q - sp) / max * 100 + '%';
    nLin.textContent = fmt(L); nQs.textContent = fmt(Q);
  };
  runBtn.addEventListener('click', () => {
    clearInterval(timer);
    const t = trace(), total = t.sort + t.look, max = Math.max(t.lin, total);
    const result = `Sort once (${t.sort} steps), then 64 lookups at ${(t.look / 64).toFixed(1)} steps each: ${(t.lin / total).toFixed(1)}× fewer steps than linear. For a single lookup, linear wins.`;
    const finish = () => { runBtn.disabled = false; runBtn.textContent = 'Run again'; note.textContent = result; };
    paint(t, max, 0);
    if (reduced()) { paint(t, max, max); finish(); return; }
    runBtn.disabled = true; note.textContent = 'Running 64 lookups…';
    const TICKS = 26; let k = 0;
    timer = setInterval(() => {
      k++; paint(t, max, max * k / TICKS);
      if (k >= TICKS) { clearInterval(timer); finish(); }
    }, 75);
  });
  note.textContent = idle;
}

/* ---------- GitHub contribution blocks (cached 6 h in localStorage) ---------- */
const gh = $1('#gh');
if (gh) {
  const USER = 'GylaxDev', KEY = 'gh-contrib-v1', TTL = 6 * 3600 * 1000;
  const API = `https://github-contributions-api.jogruber.de/v4/${USER}?y=last`;
  const grid = $1('#gcGrid'), monthsEl = $1('#gcMonths'), meta = $1('#ghMeta'), scroller = $1('#gcScroll');
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  };
  const pad2 = n => String(n).padStart(2, '0');
  const key = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const parse = s => new Date(s + 'T12:00:00');
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* empty 53-week calendar ending today, so the layout never jumps */
  const blank = () => {
    const end = new Date(); end.setHours(12, 0, 0, 0);
    const start = new Date(end); start.setDate(start.getDate() - 52 * 7); start.setDate(start.getDate() - start.getDay());
    const out = [];
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) out.push({ date: key(d), count: null, level: 0 });
    return out;
  };

  const draw = (days, animate) => {
    const frag = document.createDocumentFragment(), lead = parse(days[0].date).getDay();
    for (let i = 0; i < lead; i++) { const p = document.createElement('i'); p.className = 'pad'; frag.append(p); }
    days.forEach((d, i) => {
      const c = document.createElement('i');
      c.className = 'l' + Math.min(4, Math.max(0, d.level | 0));
      c.style.setProperty('--c', Math.floor((i + lead) / 7));
      if (d.count !== null) {
        const when = parse(d.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        c.title = `${d.count === 0 ? 'No' : d.count} contribution${d.count === 1 ? '' : 's'} on ${when}`;
      }
      frag.append(c);
    });
    grid.replaceChildren(frag);
    grid.classList.remove('fresh');
    if (animate) { void grid.offsetWidth; grid.classList.add('fresh'); }

    /* month labels: one per month change, never closer than 3 columns */
    const weeks = Math.ceil((days.length + lead) / 7), labels = [];
    let lastMonth = -1, lastCol = -9;
    for (let w = 0; w < weeks; w++) {
      const idx = Math.max(0, w * 7 - lead), d = days[Math.min(idx, days.length - 1)];
      const m = parse(d.date).getMonth(), s = document.createElement('span');
      if (m !== lastMonth && w - lastCol >= 3 && !(w === 0 && lead > 4)) { s.textContent = MONTHS[m]; lastCol = w; }
      lastMonth = m; labels.push(s);
    }
    monthsEl.replaceChildren(...labels);
    scroller.scrollLeft = scroller.scrollWidth;
  };

  const show = (data, animate) => {
    const days = data.contributions;
    const total = data.total && data.total.lastYear != null ? data.total.lastYear : days.reduce((a, d) => a + d.count, 0);
    draw(days, animate);
    meta.textContent = `${USER} · ${total.toLocaleString('en-US')} contributions in the last year`;
  };

  const cached = store.get();
  if (cached && cached.data) show(cached.data, false); else draw(blank(), false);

  if (!cached || Date.now() - cached.t > TTL) {
    fetch(API, { headers: { Accept: 'application/json' } })
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(data => {
        if (!data || !Array.isArray(data.contributions) || !data.contributions.length) throw new Error('empty');
        store.set({ t: Date.now(), data: { total: data.total, contributions: data.contributions } });
        show(data, !reduced());
      })
      .catch(() => { if (!cached) meta.textContent = `${USER} · live data unavailable, see GitHub`; });
  }
}

/* ---------- Header: highlight the section in view ---------- */
(function navSpy() {
  const map = new Map($('.hin nav a[href^="#"]').map(a => [a.getAttribute('href').slice(1), a]));
  const io = new IntersectionObserver(es => es.forEach(e => {
    const a = map.get(e.target.id); if (!a || !e.isIntersecting) return;
    map.forEach(x => x.removeAttribute('aria-current')); a.setAttribute('aria-current', 'true');
  }), { rootMargin: '-40% 0px -55% 0px' });
  map.forEach((a, id) => { const sec = document.getElementById(id); if (sec) io.observe(sec); });
})();
})();


/* ---------- Theme toggle (dark default, remembered in localStorage) ---------- */
(function initTheme() {
  const root = document.documentElement, btn = document.getElementById('themeToggle');
  if (!btn) return;
  const meta = document.querySelector('meta[name="theme-color"]');
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  let t = 0;
  const sync = th => {
    const label = th === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    btn.setAttribute('aria-label', label); btn.title = label;
    if (meta) meta.setAttribute('content', th === 'dark' ? '#0A0A0B' : '#F8F7F4');
  };
  sync(root.getAttribute('data-theme') || 'dark');
  const apply = next => {
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) { /* storage unavailable */ }
    sync(next);
  };
  btn.addEventListener('click', e => {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    if (mq.matches) { apply(next); return; }

    /* the new theme spreads out from the cursor as a circle (keyboard clicks: from the button) */
    const r = btn.getBoundingClientRect();
    const x = e.detail === 0 ? r.left + r.width / 2 : e.clientX;
    const y = e.detail === 0 ? r.top + r.height / 2 : e.clientY;
    const rad = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

    if (!document.startViewTransition) {                 // older browsers: plain cross-fade
      root.classList.add('theme-anim'); clearTimeout(t);
      t = setTimeout(() => root.classList.remove('theme-anim'), 700);
      apply(next);
      return;
    }
    root.classList.add('theme-ripple');
    const vt = document.startViewTransition(() => apply(next));
    vt.ready.then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${rad}px at ${x}px ${y}px)`] },
        { duration: 900, easing: 'cubic-bezier(.4,0,.2,1)', pseudoElement: '::view-transition-new(root)' }
      );
    }).catch(() => {});
    vt.finished.finally(() => root.classList.remove('theme-ripple'));
  });
})();
