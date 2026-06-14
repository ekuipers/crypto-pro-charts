// ============================================================
// EVENTS — market-events pane + chart x-axis markers
// Major/critical (high-impact) events are marked on every panel's candle
// series; clicking a marker (or a row in the pane) shows the event detail.
// ============================================================
import { state } from './state.js';
import { applyPanelMarkers } from './charts.js';
import { showModal, closeModal } from './alerts.js';
import { fetchJSON, esc, warn } from './utils.js';

let _events = [];          // [{id, ts(sec), date, title, category, country, impact, detail}]
let _loaded = false;

const IMPACT_COLOR = { high: '#ef5350', medium: '#f7a600', low: '#787b86' };

export function initEvents() {
  const highOnly = document.getElementById('evtHighOnly');
  if (highOnly) highOnly.addEventListener('change', renderEventsPane);

  // Re-mark a panel whenever its data (re)loads — symbol/timeframe change, restore, etc.
  document.addEventListener('panel-data-loaded', e => {
    const panel = e.detail?.panel;
    if (panel) applyEventMarkers(panel);
  });

  loadEvents();
}

async function loadEvents() {
  try {
    const j = await fetchJSON('/api/events', {}, 12000);
    const list = Array.isArray(j) ? j : (j.events || []);
    _events = list.map(e => ({ ...e, ts: Math.floor(Date.parse(e.date) / 1000) }))
                  .filter(e => !isNaN(e.ts))
                  .sort((a, b) => a.ts - b.ts);
    _loaded = true;
  } catch (e) {
    warn('events unavailable', e.message);
    _events = [];
    _loaded = true;
  }
  renderEventsPane();
  // Apply markers to any panels that already exist.
  state.panels.forEach(applyEventMarkers);
}

// ---------- Pane list ----------
function renderEventsPane() {
  const el = document.getElementById('eventsList');
  if (!el) return;
  if (!_loaded) { el.innerHTML = '<div class="muted">Loading events…</div>'; return; }
  const highOnly = document.getElementById('evtHighOnly')?.checked;
  const rows = _events.filter(e => !highOnly || e.impact === 'high');
  if (!rows.length) { el.innerHTML = '<div class="muted">No events.</div>'; return; }

  const now = Date.now() / 1000;
  el.innerHTML = rows.map(e => {
    const past = e.ts < now;
    return `<button class="evt-row${past ? ' past' : ''}" data-id="${esc(e.id)}">
      <span class="evt-dot" style="background:${IMPACT_COLOR[e.impact] || IMPACT_COLOR.low}"></span>
      <span class="evt-main">
        <span class="evt-title">${esc(e.title)}</span>
        <span class="evt-meta">${esc(fmtDate(e.ts))} · ${esc(e.country)} · ${esc(e.category)}</span>
      </span>
    </button>`;
  }).join('');
  el.querySelectorAll('.evt-row').forEach(b => b.addEventListener('click', () => {
    const ev = _events.find(x => x.id === b.dataset.id);
    if (ev) showEventDetails([ev]);
  }));
}

function fmtDate(ts) {
  const d = new Date(ts * 1000);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
}

// ---------- Chart markers ----------
function nearestBarTime(data, t) {
  // data is ascending by time; return the time of the closest bar.
  let lo = 0, hi = data.length - 1;
  if (t <= data[0].time) return data[0].time;
  if (t >= data[hi].time) return data[hi].time;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (data[mid].time < t) lo = mid + 1; else hi = mid;
  }
  const a = data[lo - 1], b = data[lo];
  return (t - a.time) <= (b.time - t) ? a.time : b.time;
}

export function applyEventMarkers(panel) {
  if (!panel || !panel.candleSeries || !panel.data?.length) return;
  const first = panel.data[0].time, last = panel.data[panel.data.length - 1].time;
  const byTime = new Map();
  // Only major/critical events get chart markers (per the roadmap).
  _events.filter(e => e.impact === 'high').forEach(e => {
    if (e.ts < first || e.ts > last) return;
    const bar = nearestBarTime(panel.data, e.ts);
    const arr = byTime.get(bar) || [];
    arr.push(e); byTime.set(bar, arr);
  });
  const markers = [];
  byTime.forEach((list, time) => {
    markers.push({
      time,
      position: 'aboveBar',
      color: '#f7a600',
      shape: 'circle',
      text: list.length > 1 ? `📅 ${list.length} events` : `📅 ${list[0].title}`,
    });
  });
  panel._eventByTime = byTime;
  panel._eventMarkers = markers;
  applyPanelMarkers(panel);
  wireEventClick(panel);
}

function wireEventClick(panel) {
  if (panel._eventClickWired || !panel.chart) return;
  panel._eventClickWired = true;
  panel.chart.subscribeClick(param => {
    if (!param.time) return;
    const list = panel._eventByTime?.get(param.time);
    if (list && list.length) showEventDetails(list);
  });
}

function showEventDetails(list) {
  const body = list.map(e => `
    <div class="evt-detail">
      <div class="evt-detail-head">
        <span class="evt-dot" style="background:${IMPACT_COLOR[e.impact] || IMPACT_COLOR.low}"></span>
        <b>${esc(e.title)}</b>
        <span class="evt-impact ${esc(e.impact)}">${esc(e.impact)}</span>
      </div>
      <div class="evt-detail-meta">${esc(fmtDate(e.ts))} · ${esc(e.country)} · ${esc(e.category)}</div>
      <p>${esc(e.detail || '')}</p>
    </div>`).join('');
  showModal(`<h3>${list.length > 1 ? 'Events' : 'Event'}</h3>${body}
    <div class="modal-actions"><button id="evtClose" class="primary-btn">Close</button></div>`, m => {
    m.querySelector('#evtClose').addEventListener('click', closeModal);
  });
}
