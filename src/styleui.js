// The left-edge inventory tab: a quiet game-menu flap that opens a small
// panel with the two style cards (painted / 8-bit). Thumbnails are tiny
// procedural scenes — no image assets, like everything else here.

export function setupStyleUI(game) {
  const tab = document.getElementById('styleTab');
  const panel = document.getElementById('stylePanel');
  const cards = [...panel.querySelectorAll('.styleCard')];

  function isOpen() {
    return panel.classList.contains('open');
  }

  function setOpen(open) {
    panel.classList.toggle('open', open);
    tab.setAttribute('aria-expanded', String(open));
  }

  function reflect() {
    for (const c of cards) {
      c.setAttribute('aria-pressed', String(c.dataset.style === game.styleMode));
    }
  }
  game._reflectStyle = reflect;

  tab.addEventListener('click', (e) => {
    e.stopPropagation();
    game.audio.unlock();
    setOpen(!isOpen());
  });

  for (const card of cards) {
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      game.audio.unlock();
      game.setStyle(card.dataset.style);
      reflect();
      setTimeout(() => setOpen(false), 350);
    });
  }

  // Tap anywhere else (including the pond) tucks the panel away.
  document.addEventListener('pointerdown', (e) => {
    if (isOpen() && !panel.contains(e.target) && !tab.contains(e.target)) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) {
      setOpen(false);
      tab.focus();
    }
  });

  drawPaintedThumb(cards.find(c => c.dataset.style === 'painted').querySelector('canvas'));
  drawPixelThumb(cards.find(c => c.dataset.style === 'pixel').querySelector('canvas'));
  reflect();
}

// Soft little painted pond: gradient water, one fish, one pad.
function drawPaintedThumb(cv) {
  const c = cv.getContext('2d');
  const w = cv.width, h = cv.height;
  c.fillStyle = '#c4b49a';
  c.fillRect(0, 0, w, h);
  const g = c.createLinearGradient(0, h * 0.2, 0, h);
  g.addColorStop(0, '#3f6774');
  g.addColorStop(1, '#26485a');
  c.beginPath();
  c.roundRect(w * 0.12, h * 0.18, w * 0.76, h * 0.66, 7);
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = '#8d8d8b';
  c.lineWidth = 2.5;
  c.stroke();
  c.fillStyle = '#e8853a';
  c.beginPath();
  c.ellipse(w * 0.45, h * 0.52, 6.5, 3.4, 0.5, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#d46a25';
  c.beginPath();
  c.ellipse(w * 0.36, h * 0.58, 2.6, 1.8, 0.5, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#5d8a4f';
  c.beginPath();
  c.arc(w * 0.68, h * 0.34, 4.5, 0, Math.PI * 2);
  c.fill();
}

// The same pond at 1/2 res with hard cells — reads instantly as "8-bit".
function drawPixelThumb(cv) {
  const c = cv.getContext('2d');
  const w = cv.width, h = cv.height;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      const hs = n - Math.floor(n);
      c.fillStyle = hs > 0.9 ? '#d3c5a9' : hs < 0.1 ? '#a08f74' : '#c4b49a';
      c.fillRect(x, y, 1, 1);
    }
  }
  const px = Math.round(w * 0.12), py = Math.round(h * 0.18);
  const pw = Math.round(w * 0.76), ph = Math.round(h * 0.66);
  c.fillStyle = '#8d8d8b';
  c.fillRect(px - 1, py - 1, pw + 2, ph + 2);
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const edge = Math.min(x, y, pw - 1 - x, ph - 1 - y);
      const band = edge < 2 ? '#44717c' : edge < 4 ? '#396371' : ((x * 2 + y * 5) % 8 === 0 ? '#699795' : '#26485a');
      c.fillStyle = band;
      c.fillRect(px + x, py + y, 1, 1);
    }
  }
  c.fillStyle = '#e8853a';
  c.fillRect(Math.round(w * 0.4), Math.round(h * 0.5), 4, 2);
  c.fillStyle = '#d46a25';
  c.fillRect(Math.round(w * 0.34), Math.round(h * 0.52), 2, 1);
  c.fillStyle = '#5d8a4f';
  c.fillRect(Math.round(w * 0.64), Math.round(h * 0.3), 3, 2);
}
