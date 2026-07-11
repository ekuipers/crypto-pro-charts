// ============================================================
// ALERTS — server-side alert engine client (P1-6) with local fallback
// ------------------------------------------------------------
// When the server + database are available, alerts are created/evaluated
// SERVER-SIDE (src/alert-engine.js) so they fire even with the tab closed;
// this module is then a thin client: CRUD via /api/alerts and a 30s poll of
// /api/alerts/triggered to surface toast + browser notifications.
// Without a server/DB it falls back to the legacy in-browser price alerts.
// ============================================================
import { state } from './state.js';
import { TIMEFRAMES } from './constants.js';
import { fmtPrice, esc, toast } from './utils.js';
import { scheduleAutosave } from './charts.js';

let serverMode = false;
let serverAlerts = [];
const SEEN_KEY = 'cpc_alerts_seen';

const TYPE_LABEL = { price: 'Price cross', pct: '% move', rsi: 'RSI level', volume: 'Volume spike' };

export function initAlerts() {
  if ('Notification' in window && Notification.permission === 'default') {
    try { Notification.requestPermission(); } catch {}
  }
  document.getElementById('alertsBtn').addEventListener('click', toggleAlertsPanel);
  document.getElementById('closeAlertsBtn')?.addEventListener('click', toggleAlertsPanel);
  document.getElementById('addAlertBtn')?.addEventListener('click', () => openAlertModal());
  document.addEventListener('open-alert-modal', e => openAlertModal(e.detail));
  document.addEventListener('panel-live', e => { if (!serverMode) checkAlerts(e.detail.panel.symbol, e.detail.price); });
  initServerMode();
  renderAlerts();
}

// ---- Server mode -------------------------------------------------------------
async function initServerMode() {
  try {
    const r = await fetch('/api/alerts');
    if (!r.ok) throw new Error('unavailable');
    serverAlerts = await r.json();
    serverMode = true;
    renderAlerts(); updateBadge();
    const t = setInterval(pollServer, 30_000);
    // surface anything that fired while the app was closed
    pollServer();
    return t;
  } catch { serverMode = false; }
}

async function pollServer() {
  if (document.hidden) return;
  try {
    const since = +(localStorage.getItem(SEEN_KEY) || Date.now() - 86_400_000);
    const [listR, trigR] = await Promise.all([
      fetch('/api/alerts'),
      fetch(`/api/alerts/triggered?since=${since}`),
    ]);
    if (listR.ok) serverAlerts = await listR.json();
    if (trigR.ok) {
      const fired = await trigR.json();
      for (const a of fired) {
        const msg = a.triggerMsg || `${a.symbol} alert triggered`;
        toast('🔔 ' + msg, 'info', 8000);
        try { if (Notification.permission === 'granted') new Notification('CryptoPro Alert', { body: msg }); } catch {}
      }
      if (fired.length) localStorage.setItem(SEEN_KEY, String(Date.now()));
    }
    renderAlerts(); updateBadge();
  } catch { /* transient — retry next poll */ }
}

async function createServerAlert(payload) {
  const r = await fetch('/api/alerts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  await pollServer();
}

async function deleteServerAlert(id) {
  try { await fetch(`/api/alerts/${encodeURIComponent(id)}`, { method: 'DELETE' }); } catch {}
  serverAlerts = serverAlerts.filter(a => a.id !== id);
  renderAlerts(); updateBadge();
}

// ---- Local fallback (legacy in-browser price alerts) ---------------------------
export function addAlert(symbol, price, condition, note) {
  const a = { id: ++state.alertIdCounter, symbol, price: +price, condition, note: note || '', triggered: false };
  state.alerts.push(a);
  renderAlerts(); updateBadge(); scheduleAutosave();
  return a;
}

export function checkAlerts(symbol, price) {
  let fired = false;
  state.alerts.forEach(a => {
    if (a.triggered || a.symbol !== symbol) return;
    if ((a.condition === 'above' && price >= a.price) || (a.condition === 'below' && price <= a.price)) {
      a.triggered = true; fired = true;
      const msg = `${symbol} ${a.condition} ${fmtPrice(a.price)} — now ${fmtPrice(price)}`;
      toast('🔔 ' + msg, 'info', 6000);
      try { if (Notification.permission === 'granted') new Notification('Price Alert', { body: msg }); } catch {}
    }
  });
  if (fired) { renderAlerts(); updateBadge(); scheduleAutosave(); }
}

// ---- Rendering ---------------------------------------------------------------
function alertDesc(a) {
  if (a.type === 'pct') return `moves ${a.condition === 'above' ? '+' : '−'}${a.value}% in ${a.params?.windowMin || 60}m`;
  if (a.type === 'rsi') return `RSI(${a.params?.period || 14}) ${a.condition} ${a.value} on ${a.tf}`;
  if (a.type === 'volume') return `volume > ${a.value}× avg on ${a.tf}`;
  return `${a.condition} ${fmtPrice(a.value)}`;
}

function renderAlerts() {
  const list = document.getElementById('alertsList');
  if (!list) return;
  if (serverMode) {
    if (!serverAlerts.length) { list.innerHTML = '<div class="muted">No alerts yet. Server-side alerts fire even when this tab is closed.</div>'; return; }
    list.innerHTML = serverAlerts.map(a => `
      <div class="alert-item ${a.active ? '' : 'triggered'}">
        <div>
          <b>${esc(a.symbol)}</b> ${esc(alertDesc(a))}
          <span class="alert-type-tag">${TYPE_LABEL[a.type] || a.type}</span>
          ${a.note ? `<div class="alert-note">${esc(a.note)}</div>` : ''}
          ${a.active ? '' : `<span class="alert-tag">triggered</span>`}
        </div>
        <button class="alert-del" data-id="${esc(String(a.id))}">×</button>
      </div>`).join('');
    list.querySelectorAll('.alert-del').forEach(b => b.addEventListener('click', () => deleteServerAlert(b.dataset.id)));
    return;
  }
  if (!state.alerts.length) { list.innerHTML = '<div class="muted">No alerts yet.</div>'; return; }
  list.innerHTML = state.alerts.map(a => `
    <div class="alert-item ${a.triggered ? 'triggered' : ''}">
      <div>
        <b>${esc(a.symbol)}</b> ${a.condition} <b>${fmtPrice(a.price)}</b>
        ${a.note ? `<div class="alert-note">${esc(a.note)}</div>` : ''}
        ${a.triggered ? '<span class="alert-tag">triggered</span>' : ''}
      </div>
      <button class="alert-del" data-id="${a.id}">×</button>
    </div>`).join('');
  list.querySelectorAll('.alert-del').forEach(b => b.addEventListener('click', () => {
    state.alerts = state.alerts.filter(x => x.id !== +b.dataset.id);
    renderAlerts(); updateBadge(); scheduleAutosave();
  }));
}

function updateBadge() {
  const badge = document.getElementById('alertBadge');
  const n = serverMode ? serverAlerts.filter(a => a.active).length : state.alerts.filter(a => !a.triggered).length;
  badge.textContent = n; badge.style.display = n ? 'flex' : 'none';
}

function toggleAlertsPanel() {
  document.getElementById('alertsPanel').classList.toggle('open');
}

// ---- Create modal --------------------------------------------------------------
function openAlertModal(detail = {}) {
  const symbol = detail.symbol || state.activePanel?.symbol || 'BTCUSDT';
  const exchange = state.activePanel?.exchange || 'binance';
  const tf = state.activePanel?.tf || '1h';
  const price = detail.price != null ? detail.price : '';
  const tfOpts = TIMEFRAMES.map(t => `<option value="${t}"${t === tf ? ' selected' : ''}>${t}</option>`).join('');
  const typeRow = serverMode ? `
    <label>Type<select id="alType">
      <option value="price">Price cross</option>
      <option value="pct">% move</option>
      <option value="rsi">RSI level</option>
      <option value="volume">Volume spike</option>
    </select></label>` : '';
  const html = `
    <h3>New Alert${serverMode ? ' <span class="alert-server-tag">server-side</span>' : ''}</h3>
    <label>Symbol<input id="alSym" value="${esc(symbol)}"></label>
    ${typeRow}
    <label id="alCondWrap">Condition<select id="alCond"><option value="above">Crosses above</option><option value="below">Crosses below</option></select></label>
    <label id="alValueWrap">Price<input id="alValue" type="number" step="any" value="${price}"></label>
    <label id="alTfWrap" style="display:none">Timeframe<select id="alTf">${tfOpts}</select></label>
    <label id="alWinWrap" style="display:none">Window (minutes)<input id="alWin" type="number" value="60" min="1" max="1440"></label>
    <label>Note<input id="alNote" placeholder="optional"></label>
    <div class="modal-actions"><button id="alCancel">Cancel</button><button id="alSave" class="primary-btn">Create</button></div>`;
  showModal(html, m => {
    const typeSel = m.querySelector('#alType');
    const valueLabel = m.querySelector('#alValueWrap');
    const applyType = () => {
      const t = typeSel?.value || 'price';
      valueLabel.firstChild.textContent = t === 'price' ? 'Price' : t === 'pct' ? 'Move (%)' : t === 'rsi' ? 'RSI level' : 'Multiple of avg volume (×)';
      m.querySelector('#alTfWrap').style.display = (t === 'rsi' || t === 'volume') ? '' : 'none';
      m.querySelector('#alWinWrap').style.display = t === 'pct' ? '' : 'none';
      m.querySelector('#alCondWrap').style.display = t === 'volume' ? 'none' : '';
    };
    typeSel?.addEventListener('change', applyType);
    if (typeSel) applyType();
    m.querySelector('#alCancel').addEventListener('click', closeModal);
    m.querySelector('#alSave').addEventListener('click', async () => {
      const s = m.querySelector('#alSym').value.toUpperCase().trim();
      const v = parseFloat(m.querySelector('#alValue').value);
      if (!s || isNaN(v)) { toast('Enter a valid symbol and value', 'warn'); return; }
      const cond = m.querySelector('#alCond').value;
      const note = m.querySelector('#alNote').value;
      if (serverMode) {
        const t = typeSel?.value || 'price';
        const payload = {
          symbol: s, exchange, type: t, condition: t === 'volume' ? 'above' : cond, value: v, note,
          tf: m.querySelector('#alTf').value,
          params: t === 'pct' ? { windowMin: parseInt(m.querySelector('#alWin').value, 10) || 60 }
                : t === 'rsi' ? { period: 14 } : {},
        };
        try { await createServerAlert(payload); }
        catch { toast('Failed to save alert on server', 'error'); return; }
      } else {
        addAlert(s, v, cond, note);
      }
      closeModal();
      document.getElementById('alertsPanel').classList.add('open');
    });
  });
}

// shared modal helpers (also used elsewhere)
export function showModal(html, after) {
  closeModal();
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'modalOverlay';
  ov.innerHTML = `<div class="modal">${html}</div>`;
  document.body.appendChild(ov);
  ov.addEventListener('mousedown', e => { if (e.target === ov) closeModal(); });
  after?.(ov.querySelector('.modal'));
}
export function closeModal() { document.getElementById('modalOverlay')?.remove(); }
