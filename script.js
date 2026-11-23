(() => {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  /* nav: glass bar once the page has moved */
  const nav = document.getElementById('nav');
  const onScroll = () => nav.classList.toggle('scrolled', scrollY > 24);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* hero video: pause button, pauses off screen, rests under reduced motion */
  const vid = document.getElementById('heroVideo');
  const ctl = document.getElementById('vctl');
  if (vid && ctl) {
    let manual = false;
    const sync = () => {
      ctl.classList.toggle('paused', vid.paused);
      const label = vid.paused ? 'Play background video' : 'Pause background video';
      ctl.setAttribute('aria-label', label);
    };
    ctl.hidden = false;
    ctl.addEventListener('click', () => {
      manual = true;
      if (vid.paused) { manual = false; vid.play().catch(() => {}); } else vid.pause();
      sync();
    });
    vid.addEventListener('play', sync);
    vid.addEventListener('pause', sync);
    if (reduce.matches) { vid.pause(); sync(); }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => {
        if (reduce.matches || manual) return;
        if (e.isIntersecting) vid.play().catch(() => {}); else vid.pause();
      }, { threshold: 0.05 }).observe(vid);
    }
  }

  /* moment: the statement lights up word by word while its section is pinned */
  const words = document.getElementById('words');
  const section = document.getElementById('statement');
  if (words && section) {
    const text = words.dataset.text || words.textContent;
    words.textContent = '';
    const spans = text.trim().split(/\s+/).map((w, i, a) => {
      const s = document.createElement('span');
      s.className = 'w';
      s.textContent = w + (i < a.length - 1 ? ' ' : '');
      words.appendChild(s);
      return s;
    });
    words.setAttribute('aria-label', text);
    spans.forEach(s => s.setAttribute('aria-hidden', 'true'));
    words.classList.add('split');

    let ticking = false;
    const update = () => {
      ticking = false;
      if (reduce.matches) { spans.forEach(s => s.classList.add('on')); return; }
      const r = section.getBoundingClientRect();
      const run = r.height - innerHeight;
      const p = Math.min(1, Math.max(0, (-r.top + innerHeight * 0.05) / (run * 0.88)));
      const n = Math.round(p * spans.length);
      spans.forEach((s, i) => s.classList.toggle('on', i < n));
    };
    const req = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    addEventListener('scroll', req, { passive: true });
    addEventListener('resize', req);
    update();
  }

  /* details: open / close a project's write-up */
  document.querySelectorAll('.det-btn').forEach(btn => {
    const panel = document.getElementById(btn.getAttribute('aria-controls'));
    if (!panel) return;
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      panel.classList.toggle('open', open);
      panel.inert = !open;
    });
  });

  /* screens: thumbnails swap the project's main picture */
  document.querySelectorAll('.thumb').forEach(t => {
    t.addEventListener('click', () => {
      const img = document.getElementById(t.dataset.target);
      if (!img || t.classList.contains('on')) return;
      t.parentElement.querySelectorAll('.thumb').forEach(x => {
        const on = x === t;
        x.classList.toggle('on', on);
        x.setAttribute('aria-pressed', String(on));
      });
      const apply = () => {
        img.src = t.dataset.src;
        img.alt = t.dataset.alt || '';
        img.classList.remove('swap');
      };
      if (reduce.matches) apply();
      else { img.classList.add('swap'); setTimeout(apply, 220); }
    });
  });
})();
