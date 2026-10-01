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

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, combo;
let theme = localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';

// ---- Records (localStorage) ----
const RECORDS_KEY = 'tetris-records';
const MAX_RECORDS = 5;

const recordsListEl = document.getElementById('records-list');
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const overlayRecords = document.getElementById('overlay-records');
const overlayRecordsList = document.getElementById('overlay-records-list');
const recordForm = document.getElementById('record-form');
const recordName = document.getElementById('record-name');

let records = loadRecords();
let bestComboGame = 0;
let pendingRecord = null;    // { score, lines } waiting for a name
let highlightIndex = -1;     // index in records.top of the entry just saved

function emptyRecords() {
  return { top: [], bestCombo: 0, maxLines: 0 };
}

function toCount(v) {
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

function loadRecords() {
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (!data || typeof data !== 'object') return emptyRecords();
    const top = (Array.isArray(data.top) ? data.top : [])
      .filter(e => e && typeof e.name === 'string' && Number.isFinite(e.score))
      .map(e => ({ name: e.name.slice(0, 12), score: toCount(e.score), lines: toCount(e.lines) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RECORDS);
    return { top, bestCombo: toCount(data.bestCombo), maxLines: toCount(data.maxLines) };
  } catch (e) {
    return emptyRecords();
  }
}

function saveRecords() {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch (e) { /* storage unavailable: records last for this session only */ }
}

// Rank where a score would be inserted (ties go below existing entries), or -1 if it does not qualify.
function recordRank(s) {
  if (s <= 0) return -1;
  const idx = records.top.findIndex(e => s > e.score);
  if (idx !== -1) return idx;
  return records.top.length < MAX_RECORDS ? records.top.length : -1;
}

function fillRecordsList(listEl, entries, hlIndex) {
  listEl.replaceChildren();
  if (!entries.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '—';
    listEl.appendChild(li);
    return;
  }
  entries.forEach((entry, i) => {
    const li = document.createElement('li');
    if (i === hlIndex) li.className = 'highlight';
    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = i + 1;
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = entry.name;
    const pts = document.createElement('span');
    pts.textContent = entry.score.toLocaleString();
    li.append(rank, name, pts);
    listEl.appendChild(li);
  });
}

function renderRecords() {
  fillRecordsList(recordsListEl, records.top, highlightIndex);
  bestComboEl.textContent = records.bestCombo;
  maxLinesEl.textContent = records.maxLines;
  // overlay list: preview the pending score at its rank while waiting for a name
  let entries = records.top;
  let hl = highlightIndex;
  if (pendingRecord) {
    hl = recordRank(pendingRecord.score);
    entries = records.top.slice();
    entries.splice(hl, 0, { name: '???', score: pendingRecord.score });
    entries = entries.slice(0, MAX_RECORDS);
  }
  fillRecordsList(overlayRecordsList, entries, hl);
}

function showGameOverRecords() {
  records.maxLines = Math.max(records.maxLines, lines);
  records.bestCombo = Math.max(records.bestCombo, bestComboGame);
  saveRecords();
  pendingRecord = recordRank(score) !== -1 ? { score, lines } : null;
  highlightIndex = -1;
  renderRecords();
  recordForm.classList.toggle('hidden', !pendingRecord);
  overlayRecords.classList.remove('hidden');
  if (pendingRecord) {
    recordName.value = '';
    recordName.focus();
  }
}

function submitRecord() {
  if (!pendingRecord) return;
  const rank = recordRank(pendingRecord.score);
  const name = recordName.value.trim().slice(0, 12) || 'ANON';
  records.top.splice(rank, 0, { name, score: pendingRecord.score, lines: pendingRecord.lines });
  records.top = records.top.slice(0, MAX_RECORDS);
  highlightIndex = rank;
  pendingRecord = null;
  saveRecords();
  recordForm.classList.add('hidden');
  renderRecords();
}

function resetRecords() {
  if (!window.confirm('¿Borrar todos los récords?')) return;
  records = emptyRecords();
  highlightIndex = -1;
  pendingRecord = null;
  saveRecords();
  recordForm.classList.add('hidden');
  renderRecords();
}

recordForm.addEventListener('submit', e => { e.preventDefault(); submitRecord(); });
resetRecordsBtn.addEventListener('click', resetRecords);
// ---- End records ----

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
    combo++;
    if (combo - 1 > bestComboGame) bestComboGame = combo - 1; // combo = extra consecutive clears
  } else {
    combo = 0;
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

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = GRID_COLORS[theme];
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
  showGameOverRecords();
}

function setTheme(newTheme) {
  theme = newTheme === 'light' ? 'light' : 'dark';
  document.body.setAttribute('data-theme', theme);
  themeToggle.checked = theme === 'light';
  localStorage.setItem(THEME_KEY, theme);
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
  submitRecord(); // restarting with a pending high score keeps it (default name)
  setTheme(theme);
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  combo = 0;
  bestComboGame = 0;
  pendingRecord = null;
  highlightIndex = -1;
  overlayRecords.classList.add('hidden');
  renderRecords();
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
  if (e.target instanceof HTMLInputElement && e.target.type === 'text') return; // typing a name
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

init();
