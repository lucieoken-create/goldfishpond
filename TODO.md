# Goldfish Pond — TODO

## Big additions (next up)
- [ ] **Day/night toggle** — sun/moon icon button (decided: toggle, not slider),
      slow dusk transition (~3s). At night the dog comes in and lies down asleep
      by the pond and stays; petting him wakes him up and he walks off — then
      comes back ~20s later. Needs: night palette/lighting pass over the scene,
      sleeping pose + sleep/wake states in `src/dog.js`. Pet interaction already
      exists (`Dog.pet()`).
- [ ] **Art style selection: "painted" vs "8-bit".**
      8-bit inspiration: https://www.effectgames.com/demos/canvascycle/
      (palette-cycling pixel art). Likely a render-mode switch: pixelated
      low-res canvas upscaled with `imageSmoothingEnabled = false`, chunky
      sprites, limited palette — biggest-ticket item, design before building.

## Small
- [ ] **Dog walks under the cup** — when she passes the food cup, the cup
      renders on top of her. Draw order in `src/main.js` `render()`: the cup
      (step 6, UI) comes after the dog (step 5). Fix: draw the resting cup
      before the dog so she passes in front of it; keep it topmost only while
      it's being dragged/armed.

## Pending
- [ ] Real-device check (iOS Safari audio unlock, touch feel, performance).
- [ ] Listen pass on the new audio mix (quieter water, birds) — tuned by ear
      only in theory; Lucie should judge on speakers/headphones.

## Done July 8 2026 (verified in preview)
- [x] Dog stuck-shaking bug — SHAKE state removed entirely; added a 30s visit
      watchdog in `src/dog.js` that walks her off if any state ever strands her.
- [x] Drink-pose neck split — neck is now a thick capsule drawn in body space
      to the head pivot; head dips down-forward to the water (reads as a real
      drink, ripples + laps line up with the muzzle).
- [x] Ripples gentler and local — poke strength/radius reduced, damping up
      (DAMP 0.975), absorption band at pond walls kills the cross-pond slosh;
      grid res doubled + 2px blur so rings look liquid, not blocky.
- [x] Water is now blue (palette + depth blotches + ripple tint all shifted).
- [x] Dog bigger / fish slightly smaller — also fixed a scale-compounding bug
      that would have made her gigantic on large monitors.
- [x] Trees and bushes rebuilt with structure — scalloped hedge, leaf-rosette
      clumps with shadows and sunlit tips (matches lily pad definition).
- [x] Pet the dog — tap her for a floating heart + two happy hops, then a
      face-you pant. Front-face pose got proper hanging floppy ears.
- [x] Gentle action hints — "poke the water", "the little cup by the pond
      holds fish food", "the pup loves a little pat" (once each, early on).
- [x] Sound: water bed cut way down (was reading as ocean), breeze kept,
      synthesized birdsong every 10–28s.
- [x] Boot robustness — page now recovers if loaded in a hidden/zero-size tab.

## Done July 7 2026
- [x] Full painterly scene, ripple sim, fish steering + feeding, dog visit
      state machine (pant/drink/tilt), ambient life, synthesized audio.
