// ============================================================
// SETTINGS — exchanges to query + candle colors overlay
// ============================================================
import { state } from './state.js';
import { EXCHANGES } from './constants.js';
import { applyCandleColors, scheduleAutosave } from './charts.js';
import { toast } from './utils.js';
import { showModal, closeModal } from './alerts.js';
import { updateWSStatus } from './ui.js';

export function initSettings() {
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
}

// The set of exchanges currently enabled for the symbol picker. Tolerates the
// legacy single-exchange setting so old sessions migrate cleanly.
function enabledSet() {
  const list = Array.isArray(state.settings.exchanges) && state.settings.exchanges.length
    ? state.settings.exchanges
    : [state.settings.exchange || 'binance'];
  return new Set(list.filter(id => EXCHANGES[id]));
}

function openSettings() {
  const s = state.settings;
  const enabled = enabledSet();
  const exRows = Object.values(EXCHANGES).map(e => `
    <label class="set-ex-row">
      <input type="checkbox" class="set-ex-cb" value="${e.id}" ${enabled.has(e.id) ? 'checked' : ''}>
      <span class="set-ex-name">${e.name}</span>
      <span class="set-ex-status">${e.status}</span>
    </label>`).join('');
  const html = `
    <h3>Settings</h3>
    <div class="set-section-label">Exchanges to query</div>
    <div class="set-ex-list">${exRows}</div>
    <div class="set-warn" id="setWarn"></div>
    <label>Up candle color <input type="color" id="setUp" value="${s.upColor}"></label>
    <label>Down candle color <input type="color" id="setDown" value="${s.downColor}"></label>
    <div class="modal-actions"><button id="setClose">Close</button><button id="setApply" class="primary-btn">Apply</button></div>`;
  showModal(html, m => {
    // Wider, resizable shell so the exchange rows lay out neatly on one line.
    m.classList.add('modal-settings');
    const warn = m.querySelector('#setWarn');
    const cbs = () => [...m.querySelectorAll('.set-ex-cb')];
    const selected = () => cbs().filter(c => c.checked).map(c => c.value);
    const updWarn = () => {
      const sel = selected();
      if (!sel.length) { warn.textContent = 'Select at least one exchange.'; return; }
      const restOnly = sel.filter(id => ['okx', 'gate'].includes(id));
      warn.textContent = restOnly.length
        ? `Note: ${restOnly.map(id => EXCHANGES[id].name).join(', ')} are REST only (no live websocket — falls back where needed).`
        : '';
    };
    cbs().forEach(c => c.addEventListener('change', updWarn)); updWarn();
    m.querySelector('#setUp').addEventListener('input', e => { state.settings.upColor = e.target.value; applyCandleColors(); });
    m.querySelector('#setDown').addEventListener('input', e => { state.settings.downColor = e.target.value; applyCandleColors(); });
    m.querySelector('#setClose').addEventListener('click', closeModal);
    m.querySelector('#setApply').addEventListener('click', () => {
      const sel = selected();
      if (!sel.length) { toast('Select at least one exchange', 'warn'); return; }
      setExchanges(sel);
      applyCandleColors(); scheduleAutosave(); closeModal();
      toast('Settings applied', 'info');
    });
  });
}

// Update the list of exchanges to query. Invalidates the cached pair list so the
// symbol picker re-aggregates, and refreshes the WS status label. Existing charts
// keep their own per-symbol exchange, so panels are not reloaded here.
export function setExchanges(ids) {
  state.settings.exchanges = ids.slice();
  // Keep the legacy `exchange` field pointing at the first enabled exchange so
  // anything still reading it (and untagged fallbacks) stays sensible.
  state.settings.exchange = ids[0] || 'binance';
  state.allPairs = null;
  state.allPairsKey = null;
  updateWSStatus('');
}
