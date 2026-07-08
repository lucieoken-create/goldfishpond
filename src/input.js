// Pointer input: unify mouse + touch, route hits to cup / water / pokes.
const TAP_SLOP = 10;

export function setupInput(canvas, game) {
  let downX = 0, downY = 0, downOnCup = false, moved = false;

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    game.audio.unlock();
    if (!game.layout) return; // booted hidden — nothing laid out to hit yet
    const { x, y } = toScene(e, canvas);
    downX = x; downY = y; moved = false;
    downOnCup = game.food.hitsCup(x, y);
    if (downOnCup) {
      game.food.startDrag(x, y);
      canvas.setPointerCapture(e.pointerId);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!game.layout) return;
    if (e.buttons === 0 && e.pointerType === 'mouse' && !game.food.dragging) return;
    const { x, y } = toScene(e, canvas);
    if (Math.hypot(x - downX, y - downY) > TAP_SLOP) moved = true;
    if (game.food.dragging) game.food.moveDrag(x, y);
  });

  canvas.addEventListener('pointerup', (e) => {
    if (!game.layout) return;
    const { x, y } = toScene(e, canvas);
    if (game.food.dragging) {
      game.food.endDrag(game.water, game.audio);
      return;
    }
    if (moved) return;

    const overWater = game.food.overWater(x, y);

    // Feeding wins on the water — the dog's hitbox leans over the pond edge
    // (especially while drinking) and must not swallow armed-cup taps.
    if (overWater && game.food.armed) {
      game.food.feedAt(x, y, game.water, game.audio);
      return;
    }

    // Pet the pup!
    if (game.dog.hitTest(x, y)) {
      game.petDog();
      return;
    }

    if (overWater) {
      if (game.ambient.frogAt(x, y)) {
        game.ambient.pokeFrog(game.audio);
      } else {
        game.poke(x, y);
      }
    } else {
      // Tap on land disarms feeding.
      game.food.armed = false;
    }
  });

  canvas.addEventListener('pointercancel', () => {
    if (game.layout && game.food.dragging) game.food.endDrag(game.water, game.audio);
  });
}

function toScene(e, canvas) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
