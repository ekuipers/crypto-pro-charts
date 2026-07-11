// ============================================================
// REPLAY — bar-by-bar playback for setup training (P2-10)
// Freezes a panel's series to a historical slice of its already-loaded data
// and reveals bars one at a time. Exiting restores live data via the normal
// loadPanelData() path, so nothing here needs to duplicate that logic.
// ============================================================
import { state } from './state.js';
import { recomputeIndicators, loadPanelData, updatePanelMenuBtn } from './charts.js';
import { renderDrawings } from './drawings.js';
import { toast } from './utils.js';

const SPEEDS = [0.5, 1, 2, 4];
const MIN_START = 15;

export function initReplay() {
  document.addEventListener('toggle-replay', e => toggleReplay(e.detail.panel));
}

function toggleReplay(panel) {
  if (panel._replay) stopReplay(panel);
  else startReplay(panel);
}

function startReplay(panel) {
  if (!panel.data || panel.data.length < MIN_START * 2) { toast('Not enough history to replay', 'warn'); return; }
  if (panel.klineWS) { try { panel.klineWS.close(); } catch {} panel.klineWS = null; }
  if (panel._klinePoll) { clearInterval(panel._klinePoll); panel._klinePoll = null; }
  const full = panel.data.slice();
  panel._replay = { full, idx: Math.max(MIN_START, full.length - 150), playing: false, speed: 1, timer: null };
  updatePanelMenuBtn(panel);
  applyIndex(panel);
  renderBar(panel);
}

function stopReplay(panel) {
  const r = panel._replay;
  if (!r) return;
  if (r.timer) clearInterval(r.timer);
  panel._replay = null;
  updatePanelMenuBtn(panel);
  const bar = panel.el.querySelector('.replay-bar');
  bar.style.display = 'none';
  bar.innerHTML = '';
  loadPanelData(panel); // restores full history + resumes the live kline stream
}

function applyIndex(panel) {
  const r = panel._replay;
  const slice = r.full.slice(0, r.idx);
  panel.data = slice;
  panel.candleSeries.setData(slice);
  panel.volumeSeries.setData(slice.map(c => ({
    time: c.time, value: c.volume,
    color: c.close >= c.open ? state.settings.upColor + '80' : state.settings.downColor + '80',
  })));
  recomputeIndicators(panel);
  renderDrawings(panel);
}

function step(panel, n) {
  const r = panel._replay;
  if (!r) return;
  r.idx = Math.max(MIN_START, Math.min(r.full.length, r.idx + n));
  applyIndex(panel);
  if (r.idx >= r.full.length) pause(panel); else renderBar(panel);
}

function play(panel) {
  const r = panel._replay;
  if (!r || r.playing) return;
  r.playing = true;
  r.timer = setInterval(() => step(panel, 1), 900 / r.speed);
  renderBar(panel);
}

function pause(panel) {
  const r = panel._replay;
  if (!r) return;
  if (r.timer) { clearInterval(r.timer); r.timer = null; }
  r.playing = false;
  renderBar(panel);
}

function renderBar(panel) {
  const r = panel._replay;
  const bar = panel.el.querySelector('.replay-bar');
  if (!r || !bar) return;
  bar.style.display = 'flex';
  bar.innerHTML = `
    <button class="replay-act" data-a="exit" title="Exit replay">✕</button>
    <button class="replay-act" data-a="back" title="Step back">⏪</button>
    <button class="replay-act" data-a="play" title="${r.playing ? 'Pause' : 'Play'}">${r.playing ? '⏸' : '▶'}</button>
    <button class="replay-act" data-a="fwd" title="Step forward">⏩</button>
    <select class="replay-speed" title="Playback speed">
      ${SPEEDS.map(s => `<option value="${s}"${s === r.speed ? ' selected' : ''}>${s}×</option>`).join('')}
    </select>
    <input type="range" class="replay-scrub" min="${MIN_START}" max="${r.full.length}" value="${r.idx}" title="Jump to bar">
    <span class="replay-pos">${r.idx} / ${r.full.length}</span>`;
  bar.querySelector('[data-a="exit"]').addEventListener('click', () => stopReplay(panel));
  bar.querySelector('[data-a="back"]').addEventListener('click', () => { pause(panel); step(panel, -1); });
  bar.querySelector('[data-a="fwd"]').addEventListener('click', () => { pause(panel); step(panel, 1); });
  bar.querySelector('[data-a="play"]').addEventListener('click', () => { r.playing ? pause(panel) : play(panel); });
  bar.querySelector('.replay-speed').addEventListener('change', e => {
    r.speed = +e.target.value;
    if (r.playing) { clearInterval(r.timer); r.timer = setInterval(() => step(panel, 1), 900 / r.speed); }
  });
  bar.querySelector('.replay-scrub').addEventListener('input', e => {
    pause(panel);
    r.idx = +e.target.value;
    applyIndex(panel);
    bar.querySelector('.replay-pos').textContent = `${r.idx} / ${r.full.length}`;
  });
}
