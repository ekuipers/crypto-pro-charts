// ============================================================
// EVENTS — market-events pane + chart x-axis markers
// High-impact events get small belowBar markers on each panel's candle series.
// Clicking a marker shows the event detail modal (no text on the marker itself).
// Future events within 2 weeks are projected onto the extended time axis.
// ============================================================
import { state } from './state.js';
import { applyPanelMarkers } from './charts.js';
import { TF_SECONDS } from './constants.js';
import { showModal, closeModal } from './alerts.js';
import { fetchJSON, esc, warn } from './utils.js';

let _events = [];          // [{id, ts(sec), date, title, category, country, impact, detail}]
let _loaded = false;

const IMPACT_COLOR = { high: '#ef5350', medium: '#f7a600', low: '#787b86' };
const TWO_WEEKS_SEC = 14 * 86400;

export function initEvents() {
  const highOnly = document.getElementById('evtHighOnly');
  if (highOnly) highOnly.addEventListener('change', renderEventsPane);

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
  state.panels.forEach(applyEventMarkers);
}

// ---------- Toggle visibility (Roadmap 3) ----------
export function setEventMarkersVisible(visible) {
  state.showEventMarkers = visible;
  state.panels.forEach(p => {
    if (!visible) {
      p._eventMarkers = [];
      applyPanelMarkers(p);
    } else {
      applyEventMarkers(p);
    }
  });
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

function fmtShortDate(ts) {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ---------- Chart markers (Roadmap 1) ----------
function nearestBarTime(data, t) {
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

  if (!state.showEventMarkers) {
    panel._eventMarkers = [];
    applyPanelMarkers(panel);
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const first = panel.data[0].time;
  const last  = panel.data[panel.data.length - 1].time;
  const future = now + TWO_WEEKS_SEC;
  const tfSec  = TF_SECONDS[panel.tf] || 3600;

  const byTime = new Map();

  // — Past events within the loaded data range.
  // Floor to the candle period that *contains* the event, then snap to the
  // nearest real bar. This prevents events near midnight from sliding to the
  // next day's candle when "nearest bar" logic would pick the wrong side.
  _events.filter(e => e.impact === 'high' && e.ts >= first && e.ts <= last)
    .forEach(e => {
      const candleStart = Math.floor(e.ts / tfSec) * tfSec;
      const bar = nearestBarTime(panel.data, candleStart);
      const arr = byTime.get(bar) || [];
      arr.push({ ...e, future: false }); byTime.set(bar, arr);
    });

  // — Future events within the next 2 weeks (projected onto the time grid)
  _events.filter(e => e.impact === 'high' && e.ts > now && e.ts <= future)
    .forEach(e => {
      // Snap to the start of the candle period the event falls in.
      const projTime = Math.floor(e.ts / tfSec) * tfSec;
      const arr = byTime.get(projTime) || [];
      arr.push({ ...e, future: true }); byTime.set(projTime, arr);
    });

  const markers = [];
  byTime.forEach((list, time) => {
    const isFuture = list[0].future;
    markers.push({
      time,
      // belowBar puts the dot below each candle's wick — the closest LWC
      // supports to an x-axis marker without a separate series.
      position: 'belowBar',
      color: isFuture ? '#2962ff' : '#ef5350',
      shape: 'circle',
      size: 1,
      // No text for past events (click to show details).
      // Short date label for future events so they are identifiable on hover.
      text: isFuture
        ? (list.length > 1 ? `${fmtShortDate(list[0].ts)} +${list.length}` : fmtShortDate(list[0].ts))
        : '',
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
