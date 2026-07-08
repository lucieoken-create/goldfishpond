# Goldfish Pond — TODO

## Big additions (next up)
- [ ] **Art style selection: "painted" vs "8-bit".**
      8-bit inspiration: https://www.effectgames.com/demos/canvascycle/
      (palette-cycling pixel art). Likely a render-mode switch: pixelated
      low-res canvas upscaled with `imageSmoothingEnabled = false`, chunky
      sprites, limited palette — biggest-ticket item, design before building.
      **UI direction from Lucie:** the switcher should be a little tab on the
      LEFT side of the screen, like a video-game inventory menu tab — clearly
      differentiated from the day/night and sound toggles (top-right circles).
      Consider running the `impeccable` design skill on this UI, and a
      `/code-review` pass at the start of the 8-bit session.

## Pending
- [ ] Listen pass: crickets + frog croak at night, birds by day — judge on
      real speakers.

## Done July 8 2026, round 3 (verified in preview)
- [x] **Day/night toggle** — sun/moon button under the sound toggle, ~3s
      dusk/dawn ease. Night = deep-blue multiply pass + moonlight glint on the
      water + fireflies near the bushes; crickets replace the birds. At night
      the pup walks in, lies down by the pond, and sleeps (breathing, closed
      eye, ear twitches, floating z's) until a pat sends her home — she's back
      ~20s later. Morning wakes her automatically.
- [x] Frog ribbits when poked (throat puff + croak; tap the frog instead of
      making a ripple).
- [x] Ear fix — removed the stray fringe strokes that drew a line down the
      middle of each ear.
- [x] iPhone silent-switch audio confirmed working by Lucie.

## Done July 8 2026, round 2 (verified in preview)
- [x] More lily pads — 11 across three clusters.
- [x] Frog on a lily pad — breathes, blinks, croaks with a throat puff
      (synthesized croak), and hops to another pad every ~20–45s.
- [x] Fish clipping over the stone coping — stronger containment steering,
      wider hard clamp, and fish/pellets/shadows are render-clipped to the pond.
- [x] Flowering bushes — blossom drifts on the hedge (pink/white/lavender)
      and flowering tufts in the bottom corners.
- [x] iOS silent-switch audio fix (needs on-device confirmation).
- [x] Hints now cycle forever (~11s apart) instead of appearing once; added a
      fourth hint and inapplicable ones are skipped.
- [x] Cup z-order — the resting cup now sits behind the dog; it only pops to
      the top layer while lifted/armed/in flight.

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
