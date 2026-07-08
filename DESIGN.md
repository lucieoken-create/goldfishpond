# Design

Visual system for the Goldfish Pond. Everything on screen is procedural Canvas 2D — there are no image assets; "components" are draw functions. The DOM carries only edge chrome (toggles, hints).

## Theme

A warm storybook garden seen from above, painterly and soft. Daylight is the default; a night mode multiplies the scene toward deep blue and adds glow layers (moonlight, fireflies). The upcoming second style, **8-bit mode**, re-renders the same scene as Canvascycle-authentic pixel art (limited palette, dithering, palette-cycled water) — one garden, two rendering languages.

## Colors

Canonical palette lives in `src/util.js` (`PALETTE`) and is painted, not tokenized in CSS.

- **Ground**: gravel `#c4b49a` with speckles `#d8cab2 → #a8977c`; page bg behind canvas `#b8a88f`
- **Stone coping**: `#8d8d8b` / light `#a5a5a1` / dark `#6e6e6c`
- **Water** (deep→shallow): `#26485a`, `#33596a`, `#3f6774`, `#4b7379`
- **Foliage**: greens `#4a6741 → #6b8a55`, dark `#2f4229`; plum accents `#5c3a44`, `#6e4550`, `#4a2f38`
- **Lily pads**: `#5d8a4f` / dark `#456e3a` / light `#74a163`; lotus pinks `#e8a7b8`, `#f0bccb`, center `#f5d76e`
- **Goldfish**: orange `#e8853a`, deep `#d46a25`, white `#f2ede2` (fish schemes hardcode these in `fish.js`)
- **Dachshund**: coat `#b5713a`, deep `#96562a`, cream `#d9a86c` (hardcoded in `dog.js`)
- **Chrome**: warm translucent cream `rgba(255,252,245,0.6–0.85)`, ink `#5a4f3a`, shadow `rgba(60,50,30,0.25)`
- **Night**: multiply toward `rgb(105,127,187)`-ish, wash `rgba(18,26,64,…)`, moonlight `rgba(190,210,250,…)`, firefly `rgba(226,240,150,…)`

Known debt: the goldfish/doxie PALETTE entries are duplicated as hardcoded hexes in `fish.js`/`dog.js` — treat `PALETTE` as the source of truth when refactoring, and 8-bit mode should introduce its own quantized palette table rather than reusing these.

## Typography

- **UI voice**: Georgia italic (serif), 13–14px, ink `#5a4f3a` on translucent cream pills. Used for hints only — the interface whispers in a storybook voice.
- No headings, no display type. Text is rare by design.
- 8-bit mode should swap the hint voice to a pixel-appropriate face (bitmap-style font) while keeping the same whisper register — never all-caps arcade shouting.

## Components

- **Circle toggles** (`#soundToggle`, `#nightToggle`): fixed top-right stack, 44×44, `border-radius: 50%`, translucent cream, emoji glyph, hover scale 1.08. The established chrome pattern — new controls match this restraint or go diegetic.
- **Hint pills** (`#soundHint`, `#actionHint`): translucent cream rounded pills, Georgia italic, fade via opacity transitions (0.8–1.2s). Action hints cycle ~7.5s with a 20s per-hint suppression; urgent hints jump the queue.
- **In-world affordances**: the food cup on the coping (armed state = lift + glow ring), the pettable dog, the pokeable frog. Diegetic beats chrome.
- **Planned — style selector tab**: left-edge tab styled like a video-game inventory menu; visually distinct from the circle toggles but equally quiet at rest.

## Layout

- Full-viewport canvas; the pond is a rounded rect (`radius = 0.08 × min dimension`) centered with margins: ~20% x (14% portrait), ~18% top, ~26% bottom (dog path lives in the bottom band).
- Layer order (in `main.js render()`): painterly background (offscreen, rebuilt on resize) → fish shadows/pellets/fish (clipped to pond) → water shimmer/ripples → lily pads/flyers → cup+dog (cup pops above while lifted) → night multiply + glow layers.
- Chrome anchors: toggles top-right, sound hint beside them, action hint bottom-center. Left edge is free — reserved for the style-selector tab.

## Motion

- Fixed 60Hz sim (`DT = 1/60`, max 5 catch-up steps); water field simulated at half rate.
- Organic easing everywhere: exponential decay (`Math.exp(-dt·k)`) for springs/wobbles, smoothstep for hops, ease-out cubic for the cup return, 3s linear ease for dusk/dawn.
- Nothing strobes; ambient motion is slow (pads drift, leaves fall over tens of seconds). Palette-cycling in 8-bit mode must stay in this gentle register.

## Sound

Fully synthesized Web Audio (no assets): wind/lap/rustle beds, day birds, night crickets, one-shot plips/splashes/gulps/croaks/ribbits. Master gain + compressor; sound defaults on but requires a gesture unlock; hidden tab = silence. 8-bit mode should chiptune-ify timbres (square/triangle oscillators, tighter envelopes) without raising loudness or busyness.
