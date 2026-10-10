document.addEventListener('DOMContentLoaded', () => {
    'use strict';

    /* ---------- Hero headline rises word by word ---------- */
    const headline = document.querySelector('.hero-headline');
    if (headline) {
        let i = 0;
        const parts = [];
        headline.childNodes.forEach((node) => {
            if (node.nodeType !== Node.TEXT_NODE) { parts.push(node); return; }
            node.textContent.trim().split(/\s+/).filter(Boolean).forEach((word) => {
                const wrap = document.createElement('span');
                wrap.className = 'iw';
                const inner = document.createElement('span');
                inner.style.setProperty('--i', i++);
                inner.textContent = word;
                wrap.appendChild(inner);
                parts.push(wrap, document.createTextNode(' '));
            });
        });
        headline.replaceChildren(...parts);
    }

    /* ---------- Scroll reveal ---------- */
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

    /* ---------- Highlights filter ---------- */
    const galleryNav = document.querySelector('.gallery-nav');
    const cards = document.querySelectorAll('.card');

    if (galleryNav) {
        galleryNav.addEventListener('click', (e) => {
            const btn = e.target.closest('.gallery-pill');
            if (!btn) return;

            const category = btn.dataset.filter;

            galleryNav.querySelectorAll('.gallery-pill').forEach((p) => {
                p.classList.remove('active');
                p.setAttribute('aria-pressed', 'false');
            });
            btn.classList.add('active');
            btn.setAttribute('aria-pressed', 'true');

            cards.forEach((card) => {
                const matches = category === 'all' || card.dataset.category === category;
                if (matches) {
                    card.classList.remove('is-hidden');
                    card.classList.add('is-fading-in');
                    card.addEventListener('animationend', () => card.classList.remove('is-fading-in'), { once: true });
                } else {
                    card.classList.add('is-hidden');
                }
            });
            requestAnimationFrame(updateScrollFx);
        });
    }

    /* ---------- Project showcase tabs ---------- */
    const projectsData = {
        design: {
            title: 'Elementary OS Concept UI',
            desc: 'Featuring new modern design elements and improved user interface to mimic modern desktop environments. It features cleaner user interface with new icons and more rounded corners. Based on Elementary OS 8.',
            tags: ['Figma', 'Adobe Photoshop', 'Canva', 'Krita', 'Affinity'],
            image: 'assets/Mockup.png'
        },
        ctf: {
            title: 'Cybersecurity & Linux',
            desc: 'Experience in cybersecurity and CTF. Also experienced with many Linux distros.',
            tags: ['FFUF', 'Burp Suite', 'John the Ripper', 'FTK Imager', 'CyberChef', 'Wireshark', 'Kali Linux'],
            image: 'assets/showcase-ctf.png'
        },
        cpp: {
            title: 'Software Development in C++/C# & Python',
            desc: 'Developed software applications using C++ and C#, and created scripts in Python. My latest project is a Windows desktop cleaner application built with WinUI3.',
            tags: ['Visual Studio', 'Visual Studio Code', 'PyCharm'],
            image: 'assets/Showcase-WinUI3.png'
        },
        mobile: {
            title: 'Android App Prototype',
            desc: 'A native Android application designed with card-based navigation, Material UI, and responsive layouts.',
            tags: ['Android Studio', 'Jetpack Compose', 'Android SDK', 'Material Design 3'],
            image: 'assets/showcase-mobile.png'
        }
    };

    const TAB_TRANSITION_MS = 300;

    const controls = document.querySelector('.controls');
    const viewerEl = document.querySelector('.viewer-container');
    const displayBox = document.getElementById('projectDisplay');
    const imgElement = document.getElementById('projectImage');
    const titleEl = document.getElementById('projectTitle');
    const descEl = document.getElementById('projectDesc');
    const tagsEl = document.getElementById('projectTags');

    let isSwitching = false;

    function renderProjectData(data) {
        if (titleEl) titleEl.textContent = data.title;
        if (descEl) descEl.textContent = data.desc;
        if (tagsEl) {
            tagsEl.replaceChildren(...data.tags.map((tag) => {
                const span = document.createElement('span');
                span.className = 'tech-tag';
                span.textContent = tag;
                return span;
            }));
        }
        if (imgElement) {
            imgElement.src = data.image;
            imgElement.alt = `${data.title} preview`;
        }
    }

    if (controls && displayBox) {
        const activeTab = controls.querySelector('.tab-btn.active');
        const initialProjectKey = activeTab ? activeTab.dataset.project : 'design';
        if (projectsData[initialProjectKey]) {
            renderProjectData(projectsData[initialProjectKey]);
            if (viewerEl) viewerEl.dataset.project = initialProjectKey;
        }

        controls.addEventListener('click', (e) => {
            const btn = e.target.closest('.tab-btn');
            if (!btn || isSwitching) return;

            const data = projectsData[btn.dataset.project];
            if (!data) return;

            controls.querySelectorAll('.tab-btn').forEach((b) => {
                b.classList.remove('active');
                b.setAttribute('aria-selected', 'false');
            });
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');

            isSwitching = true;
            if (viewerEl) viewerEl.dataset.project = btn.dataset.project;
            displayBox.classList.add('tab-transitioning');

            window.setTimeout(() => {
                renderProjectData(data);
                displayBox.classList.remove('tab-transitioning');
                isSwitching = false;
            }, TAB_TRANSITION_MS);
        });
    }

    /* ---------- Laptop Keyboard ---------- */

    const KEYBOARD_ROWS = [
        [
            { label: 'esc', cls: 'key-esc' },
            ...['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12'].map((label) => ({ label })),
            { cls: 'key-touchid', html: '<span class="key-touchid-sensor"></span>' }
        ],
        [
            ...['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='].map((label) => ({ label })),
            { label: 'backspace', cls: 'key-delete' }
        ],
        [
            { label: 'tab', cls: 'key-tab' },
            ...['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']'].map((label) => ({ label })),
            { label: '\\', cls: 'key-slash' }
        ],
        [
            { cls: 'key-caps', html: '<span class="caps-dot"></span>caps lock' },
            ...['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'"].map((label) => ({ label })),
            { label: 'return', cls: 'key-return' }
        ],
        [
            { label: 'shift', cls: 'key-shift-l' },
            ...['Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/'].map((label) => ({ label })),
            { label: 'shift', cls: 'key-shift-r' }
        ]
    ];

    const BOTTOM_ROW_HTML = `
        <span class="key key-fn">fn</span>
        <span class="key key-ctrl">control</span>
        <span class="key key-opt">option</span>
        <span class="key key-cmd">command</span>
        <span class="key key-space"></span>
        <span class="key key-cmd">command</span>
        <span class="key key-opt">option</span>
        <div class="key-arrow-group">
            <span class="key key-arrow key-arrow-left">◀</span>
            <div class="key-arrow-stacked">
                <span class="key key-arrow key-arrow-up">▲</span>
                <span class="key key-arrow key-arrow-down">▼</span>
            </div>
            <span class="key key-arrow key-arrow-right">▶</span>
        </div>`;

    function buildKey({ label = '', cls = '', html }) {
        const span = document.createElement('span');
        span.className = cls ? `key ${cls}` : 'key';
        if (html) span.innerHTML = html;
        else span.textContent = label;
        return span;
    }

    function buildKeyboard(grid) {
        if (!grid) return;
        const frag = document.createDocumentFragment();

        KEYBOARD_ROWS.forEach((rowKeys) => {
            const row = document.createElement('div');
            row.className = 'kb-row';
            rowKeys.forEach((key) => row.appendChild(buildKey(key)));
            frag.appendChild(row);
        });

        const bottomRow = document.createElement('div');
        bottomRow.className = 'kb-row';
        bottomRow.innerHTML = BOTTOM_ROW_HTML;
        frag.appendChild(bottomRow);

        grid.appendChild(frag);
    }

    buildKeyboard(document.getElementById('keyboardGrid'));

    const laptop = document.getElementById('laptop3D');
    const hero = document.querySelector('.hero');

    const isDesktopPointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (laptop && hero && isDesktopPointer && !prefersReducedMotion) {
        let pendingTransform = null;
        let rafId = null;

        const applyTransform = () => {
            laptop.style.transform = pendingTransform;
            rafId = null;
        };

        hero.addEventListener('mousemove', (e) => {
            const rect = hero.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width - 0.5;
            const y = (e.clientY - rect.top) / rect.height - 0.5;

            pendingTransform = `rotateX(${22 - y * 8}deg) rotateY(${x * 8}deg)`;
            if (rafId === null) rafId = requestAnimationFrame(applyTransform);
        });

        hero.addEventListener('mouseleave', () => {
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            laptop.style.transform = 'rotateX(22deg) rotateY(0deg)';
        });
    }

    const laptopStage = document.querySelector('.laptop-stage');

    if (laptopStage) {
        const laptopObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    laptopStage.classList.add('is-open');
                    laptopObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.2 });

        laptopObserver.observe(laptopStage);
    }

    /* ---------- Scroll effects: stacking highlight cards + tilting project screen ---------- */
    const stackCards = [...document.querySelectorAll('.gallery-cards .card')];
    const viewerBox = document.querySelector('.viewer-container');
    const reduceFx = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const clamp01 = (v) => Math.min(1, Math.max(0, v));

    function updateScrollFx() {
        if (reduceFx) return;
        const wide = window.innerWidth > 850;
        const visible = stackCards.filter((c) => !c.classList.contains('is-hidden'));

        visible.forEach((card, i) => {
            const next = visible[i + 1];
            let cover = 0;
            if (wide && next) {
                const stickTop = parseFloat(getComputedStyle(next).top) || 0;
                const travel = card.offsetHeight + 24;
                cover = clamp01(1 - (next.getBoundingClientRect().top - stickTop) / travel);
            }
            card.style.setProperty('--cover', cover.toFixed(3));
        });

        if (viewerBox) {
            const top = viewerBox.getBoundingClientRect().top;
            const vh = window.innerHeight;
            viewerBox.style.setProperty('--vp', clamp01((vh * 0.95 - top) / (vh * 0.6)).toFixed(3));
        }
    }

    if (!reduceFx) {
        window.addEventListener('scroll', () => requestAnimationFrame(updateScrollFx), { passive: true });
        window.addEventListener('resize', updateScrollFx);
        updateScrollFx();
    }
});
