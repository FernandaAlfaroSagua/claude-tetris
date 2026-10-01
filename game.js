'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const GRID_COLORS = { dark: '#22222e', light: '#dcdfec' };
const THEME_KEY = 'tetris-theme';

// ---- Skins ----
const SKIN_KEY = 'tetris-skin';

const SKINS = {
  retro: {
    colors: COLORS,
    grid: GRID_COLORS, // follows light/dark theme
    drawBlock: drawBlockRetro,
  },
  neon: {
    colors: [
      null,
      '#00f0ff', // I
      '#fff700', // O
      '#d500f9', // T
      '#39ff14', // S
      '#ff1744', // Z
      '#2979ff', // J
      '#ff9100', // L
    ],
    grid: { dark: '#1a1a2e', light: '#1a1a2e' }, // board is always black
    drawBlock: drawBlockNeon,
  },
  pastel: {
    colors: [
      null,
      '#a8e6ef', // I
      '#fff1b8', // O
      '#d9b8f0', // T
      '#b8e6c1', // S
      '#f5b8b8', // Z
      '#b8d4f5', // J
      '#fbd3a8', // L
    ],
    grid: { dark: '#2a2a38', light: '#ece8f2' },
    drawBlock: drawBlockPastel,
  },
  pixelart: {
    colors: [
      null,
      '#29b6c8', // I
      '#e6b800', // O
      '#9c3fb0', // T
      '#4caf50', // S
      '#d84343', // Z
      '#4a90d9', // J
      '#e68a00', // L
    ],
    grid: { dark: '#22222e', light: '#dcdfec' },
    drawBlock: drawBlockPixel,
  },
};

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const skinSelect = document.getElementById('skin-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let theme = localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
let skin = 'retro';

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

// ---- Skin drawing ----
// Each strategy draws one block; drawBlock sets globalAlpha before calling it.
function drawBlockRetro(context, x, y, color, size) {
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
}

function drawBlockNeon(context, x, y, color, size) {
  const px = x * size + 3, py = y * size + 3, s = size - 6;
  context.shadowColor = color;
  context.shadowBlur = 12;
  context.fillStyle = color;
  context.globalAlpha *= 0.35;
  context.fillRect(px, py, s, s);
  context.globalAlpha /= 0.35;
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.strokeRect(px, py, s, s);
  // reset so the glow does not leak into other drawing
  context.shadowBlur = 0;
  context.shadowColor = 'transparent';
}

function drawBlockPastel(context, x, y, color, size) {
  const px = x * size + 2, py = y * size + 2, s = size - 4, r = 7;
  context.fillStyle = color;
  context.beginPath();
  if (context.roundRect) {
    context.roundRect(px, py, s, s, r);
  } else {
    context.moveTo(px + r, py);
    context.arcTo(px + s, py, px + s, py + s, r);
    context.arcTo(px + s, py + s, px, py + s, r);
    context.arcTo(px, py + s, px, py, r);
    context.arcTo(px, py, px + s, py, r);
    context.closePath();
  }
  context.fill();
  // soft highlight
  context.fillStyle = 'rgba(255,255,255,0.35)';
  context.fillRect(px + 6, py + 4, s - 12, 3);
}

function drawBlockPixel(context, x, y, color, size) {
  const px = x * size + 1, py = y * size + 1, s = size - 2, u = 3;
  context.fillStyle = color;
  context.fillRect(px, py, s, s);
  // checker texture of lighter/darker sub-squares
  const n = Math.floor(s / u);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if ((r + c) % 2) continue;
      context.fillStyle = (r % 4 < 2) ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)';
      context.fillRect(px + c * u, py + r * u, u, u);
    }
  }
  // hard bevel edges
  context.fillStyle = 'rgba(255,255,255,0.5)';
  context.fillRect(px, py, s, u);
  context.fillRect(px, py, u, s);
  context.fillStyle = 'rgba(0,0,0,0.45)';
  context.fillRect(px, py + s - u, s, u);
  context.fillRect(px + s - u, py, u, s);
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const def = SKINS[skin];
  context.save();
  context.globalAlpha = alpha ?? 1;
  context.imageSmoothingEnabled = false;
  def.drawBlock(context, x, y, def.colors[colorIndex], size);
  context.restore();
}

function drawGrid() {
  ctx.strokeStyle = SKINS[skin].grid[theme];
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function setTheme(newTheme) {
  theme = newTheme === 'light' ? 'light' : 'dark';
  document.body.setAttribute('data-theme', theme);
  themeToggle.checked = theme === 'light';
  localStorage.setItem(THEME_KEY, theme);
}

function setSkin(name) {
  skin = Object.prototype.hasOwnProperty.call(SKINS, name) ? name : 'retro';
  document.body.dataset.skin = skin;
  skinSelect.value = skin;
  try { localStorage.setItem(SKIN_KEY, skin); } catch (e) { /* storage unavailable */ }
  // refresh canvases without touching the loop or pause state
  if (board && current && next && !gameOver) {
    draw();
    drawNext();
  }
}

function loadSkin() {
  let saved = null;
  try { saved = localStorage.getItem(SKIN_KEY); } catch (e) { /* storage unavailable */ }
  setSkin(saved);
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
      if (gameOver) return;
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  setTheme(theme);
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);
themeToggle.addEventListener('change', () => setTheme(themeToggle.checked ? 'light' : 'dark'));
skinSelect.addEventListener('change', () => {
  setSkin(skinSelect.value);
  skinSelect.blur(); // keep keyboard controls (arrows/space) on the game
});

loadSkin();

init();
