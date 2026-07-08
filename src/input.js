// Pointer input: unify mouse + touch, route hits to cup / water / pokes.
import { roundedRectSDF } from './util.js';

const TAP_SLOP = 10;

export function setupInput(canvas, game) {
  let downX = 0, downY = 0, downOnCup = false, moved = false;

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    game.audio.unlock();
    game.hideHint();
    const { x, y } = toScene(e, canvas);
    downX = x; downY = y; moved = false;
    downOnCup = game.food.hitsCup(x, y);
    if (downOnCup) {
      game.food.startDrag(x, y);
      canvas.setPointerCapture(e.pointerId);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.buttons === 0 && e.pointerType === 'mouse' && !game.food.dragging) return;
    const { x, y } = toScene(e, canvas);
    if (Math.hypot(x - downX, y - downY) > TAP_SLOP) moved = true;
    if (game.food.dragging) game.food.moveDrag(x, y);
  });

  canvas.addEventListener('pointerup', (e) => {
    const { x, y } = toScene(e, canvas);
    if (game.food.dragging) {
      const fed = game.food.endDrag(game.water, game.audio);
      if (fed) game.onFeed(x, y);
      return;
    }
    if (moved) return;

    // Pet the pup!
    if (game.dog.hitTest(x, y)) {
      game.petDog();
      return;
    }

    // Tap routing: water first (feed if armed, else poke).
    const overWater = roundedRectSDF(x, y, game.layout.pond, game.layout.pondRadius) < -4;
    if (overWater) {
      if (game.food.armed) {
        game.food.feedAt(x, y, game.water, game.audio);
        game.onFeed(x, y);
      } else {
        game.poke(x, y);
      }
    } else {
      // Tap on land disarms feeding.
      game.food.armed = false;
    }
  });

  canvas.addEventListener('pointercancel', () => {
    if (game.food.dragging) game.food.endDrag(game.water, game.audio);
  });
}

function toScene(e, canvas) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
