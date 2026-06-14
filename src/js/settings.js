// ============================================================
// SETTINGS — exchange + candle colors overlay
// ============================================================
import { state } from './state.js';
import { EXCHANGES } from './constants.js';
import { closePriceStream, openPriceStream } from './data.js';
import { applyCandleColors, loadPanelData, scheduleAutosave } from './charts.js';
import { toast } from './utils.js';
import { showModal, closeModal } from './alerts.js';

export function initSettings() {
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
}

function openSettings() {
  const s = state.settings;
  const html = `
    <h3>Settings</h3>
    <label>Exchange
      <select id="setExchange">
        ${Object.values(EXCHANGES).map(e => `<option value="${e.id}" ${e.id === s.exchange ? 'selected' : ''}>${e.name} — ${e.status}</option>`).join('')}
      </select>
    </label>
    <div class="set-warn" id="setWarn"></div>
    <label>Up candle color <input type="color" id="setUp" value="${s.upColor}"></label>
    <label>Down candle color <input type="color" id="setDown" value="${s.downColor}"></label>
    <div class="modal-actions"><button id="setClose">Close</button><button id="setApply" class="primary-btn">Apply</button></div>`;
  showModal(html, m => {
    const warn = m.querySelector('#setWarn');
    const updWarn = () => {
      const id = m.querySelector('#setExchange').value;
      warn.textContent = ['okx', 'gate'].includes(id) ? 'Note: REST only (no live websocket on this exchange — falls back where needed).' : '';
    };
    m.querySelector('#setExchange').addEventListener('change', updWarn); updWarn();
    m.querySelector('#setUp').addEventListener('input', e => { state.settings.upColor = e.target.value; applyCandleColors(); });
    m.querySelector('#setDown').addEventListener('input', e => { state.settings.downColor = e.target.value; applyCandleColors(); });
    m.querySelector('#setClose').addEventListener('click', closeModal);
    m.querySelector('#setApply').addEventListener('click', () => {
      const id = m.querySelector('#setExchange').value;
      if (id !== state.settings.exchange) setExchange(id);
      applyCandleColors(); scheduleAutosave(); closeModal();
      toast('Settings applied', 'info');
    });
  });
}

export function setExchange(id) {
  state.settings.exchange = id;
  state.klineCache = {};
  state.allPairs = null;
  closePriceStream();
  document.dispatchEvent(new CustomEvent('restart-price-stream'));
  state.panels.forEach(p => loadPanelData(p));
}
