// ============================================================
// ROUTER — reflects the active chart's symbol pair and the open
// right-panel section in the URL (query string + hash anchor), so a
// chart or a specific part of the app can be reached directly via a
// shareable/bookmarkable link.
//   ?symbol=BTCUSDT&exchange=binance#techinfo
// ============================================================
import { state } from './state.js';
import { changeSymbol, setActivePanel } from './charts.js';
import { defaultExchange } from './data.js';
import { EXCHANGES } from './constants.js';

// Must match the `data-tab` values in index.html's `.right-tab` buttons.
const TAB_IDS = ['watchlist', 'events', 'orderbook', 'techinfo', 'scanner', 'paper'];

// Symbols are exchange ticker codes (letters/digits only) — reject anything
// else rather than reflecting untrusted URL input back into app state.
const SYMBOL_RE = /^[A-Z0-9]{2,20}$/;

// Rewrite the URL to match current state without adding a history entry —
// this keeps the link shareable without spamming the back-button on every
// symbol switch or tab click.
export function syncUrl() {
  const panel = state.activePanel;
  const params = new URLSearchParams(location.search);
  if (panel) {
    params.set('symbol', panel.symbol);
    params.set('exchange', panel.exchange || defaultExchange());
  }
  const hash = TAB_IDS.includes(state.rightTab) ? '#' + state.rightTab : '';
  history.replaceState(null, '', `${location.pathname}?${params.toString()}${hash}`);
}

// Apply a `?symbol=&exchange=` / `#tab` URL onto the just-restored app state.
// Called once at startup, after the saved session/layout has produced panels.
export function applyUrlOnLoad() {
  const params = new URLSearchParams(location.search);
  const symbol = (params.get('symbol') || '').toUpperCase();
  const exchange = params.get('exchange');
  const tabId = location.hash.slice(1);

  if (symbol && SYMBOL_RE.test(symbol)) {
    const ex = exchange && EXCHANGES[exchange] ? exchange : defaultExchange();
    const panel = state.activePanel || state.panels[0];
    if (panel && (panel.symbol !== symbol || panel.exchange !== ex)) {
      changeSymbol(panel, symbol, null, ex);
    } else if (panel) {
      setActivePanel(panel);
    }
  }

  if (TAB_IDS.includes(tabId)) {
    document.querySelector(`.right-tab[data-tab="${tabId}"]`)?.click();
  }
}

// Keep the URL in sync as the user changes charts/tabs.
export function initRouter() {
  document.addEventListener('active-symbol-changed', syncUrl);
  document.addEventListener('right-tab-changed', syncUrl);
}
