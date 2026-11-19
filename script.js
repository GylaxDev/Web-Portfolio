document.addEventListener('DOMContentLoaded', () => {
    'use strict';

    /* ---------- Mobile menu ---------- */
    const nav = document.querySelector('.nav');
    const toggle = document.getElementById('navToggle');
    const links = document.getElementById('navLinks');

    function setMenu(open) {
        if (!nav || !toggle) return;
        nav.classList.toggle('open', open);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        const use = toggle.querySelector('use');
        if (use) use.setAttribute('href', open ? '#i-x' : '#i-menu');
    }

    if (toggle) toggle.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
    if (links) links.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
    window.matchMedia('(min-width: 861px)').addEventListener('change', (e) => { if (e.matches) setMenu(false); });

    /* ---------- Running text: languages and tools ---------- */
    const PX_PER_SECOND = 55;

    function buildMarquee(marquee) {
        const group = marquee.querySelector('.marquee-group');
        if (!group) return;

        const track = document.createElement('div');
        track.className = 'marquee-track';
        const clone = group.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');

        group.replaceWith(track);
        track.append(group, clone);
        marquee.classList.add('is-live');

        const setSpeed = () => {
            const width = group.getBoundingClientRect().width;
            if (width > 0) marquee.style.setProperty('--dur', `${(width / PX_PER_SECOND).toFixed(1)}s`);
        };
        setSpeed();
        window.addEventListener('resize', setSpeed);
    }

    document.querySelectorAll('.marquee').forEach(buildMarquee);
});
