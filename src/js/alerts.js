// ============================================================
// ALERTS — price alerts with toast + browser notifications
// ============================================================
import { state } from './state.js';
import { fmtPrice, esc, toast } from './utils.js';
import { scheduleAutosave } from './charts.js';

export function initAlerts() {
  if ('Notification' in window && Notification.permission === 'default') {
    try { Notification.requestPermission(); } catch {}
  }
  document.getElementById('alertsBtn').addEventListener('click', toggleAlertsPanel);
  document.getElementById('closeAlertsBtn')?.addEventListener('click', toggleAlertsPanel);
  document.getElementById('addAlertBtn')?.addEventListener('click', () => openAlertModal());
  document.addEventListener('open-alert-modal', e => openAlertModal(e.detail));
  document.addEventListener('panel-live', e => checkAlerts(e.detail.panel.symbol, e.detail.price));
  renderAlerts();
}

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

function renderAlerts() {
  const list = document.getElementById('alertsList');
  if (!list) return;
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
  const n = state.alerts.filter(a => !a.triggered).length;
  badge.textContent = n; badge.style.display = n ? 'flex' : 'none';
}

function toggleAlertsPanel() {
  document.getElementById('alertsPanel').classList.toggle('open');
}

function openAlertModal(detail = {}) {
  const symbol = detail.symbol || state.activePanel?.symbol || 'BTCUSDT';
  const price = detail.price != null ? fmtPrice(detail.price) : '';
  const html = `
    <h3>New Price Alert</h3>
    <label>Symbol<input id="alSym" value="${esc(symbol)}"></label>
    <label>Condition<select id="alCond"><option value="above">Crosses above</option><option value="below">Crosses below</option></select></label>
    <label>Price<input id="alPrice" type="number" step="any" value="${price}"></label>
    <label>Note<input id="alNote" placeholder="optional"></label>
    <div class="modal-actions"><button id="alCancel">Cancel</button><button id="alSave" class="primary-btn">Create</button></div>`;
  showModal(html, m => {
    m.querySelector('#alCancel').addEventListener('click', closeModal);
    m.querySelector('#alSave').addEventListener('click', () => {
      const s = m.querySelector('#alSym').value.toUpperCase().trim();
      const p = parseFloat(m.querySelector('#alPrice').value);
      if (!s || isNaN(p)) { toast('Enter a valid symbol and price', 'warn'); return; }
      addAlert(s, p, m.querySelector('#alCond').value, m.querySelector('#alNote').value);
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
