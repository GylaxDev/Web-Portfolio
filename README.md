This is my Portfolio Website

A landing-page style portfolio. The look follows my brand guideline (graphite, amber, grain-glass panels, outlined rounded controls, italic amber tagline), and the layout and typography are inspired by Kaggle: a big centered headline, a full-bleed artwork banner, running language and tool icons, and project cards.

- Typeface: Google Sans Flex (text) and Google Sans Code (small labels)
- Icons: Simple Icons, Font Awesome and VS Code brand logos plus Lucide, inlined as an SVG sprite in `index.html` (no extra requests)
- Banner artwork: `assets/src/hero-art.svg` rendered to `assets/hero-art.webp`
- Plain HTML, plain CSS, and plain JavaScript

## Toys and games

Extras live in `toys.css` and `toys.js` (plain JS, no libraries, works with the existing CSP). A tiny canvas 3D renderer draws every toy, and all colours come from the tokens in `styles.css`.

- Hero: a draggable glass icosahedron (click to re-skin) and a die that rolls one of six languages
- Banner: click to drop 3D toys with physics, hover to nudge them
- Skills: "Stack the build" timing game
- Security & design: "Patch the bugs" 30 second whack-a-bug game
- Contact: a donut orbiting the ring
- Seven hidden amber shards across the page, with a counter bottom-right and a celebration when all are found
- Cards tilt in 3D on hover, skill icons spin on click
- Best scores and found shards are kept in `localStorage`; `prefers-reduced-motion` turns off idle motion

## Mascot

A yellow rabbit lives in the bottom-left corner. It lives in `mascot.js` and `mascot.css` (plain JS and raw WebGL, no libraries, works with the existing CSP). Its body is built from rounded boxes and capsules, shaded with the same amber ramp as the toys, and the face is painted live on a small canvas texture.

- Waves, blinks, follows the cursor with its head and eyes, and falls asleep when you leave it alone
- Drag it to pick it up and throw it: limbs and ears lag behind, it squashes when it lands, and a hard throw makes it dizzy
- Poke the head, ears, belly, arms or legs for different reactions (poke it too much and it gets grumpy)
- Twelve emotions: happy, joy, wink, surprised, curious, thinking, sad, love, sleepy, dizzy, grumpy, cheeky
- Helps with the page: a menu (tour, projects, skills, games, contact, shard hint), a short guided tour, and one tip per section as you scroll. Tips can be switched off, and the rabbit can hide (only its ears peek out)
- Reacts when you find a hidden shard
- Keyboard: Tab to the rabbit, Enter opens the menu, Escape closes it. `prefers-reduced-motion` turns off idle motion
- Preferences are kept in `localStorage` (`va-mascot-hidden`, `va-mascot-quiet`, `va-mascot-seen`)

A tiny API is available for other scripts, for example to cheer when a game is won: `mascot.emote('joy')`, `mascot.say('Nice!')`, `mascot.wave()`, `mascot.hop()`, `mascot.hide()`, `mascot.show()`.
