// ============================================================
// MAIN — app entry point
// ============================================================
import { state } from './state.js';
import { openPriceStream, closePriceStream, priceStreamLive, refreshMissingPrices, defaultExchange } from './data.js';
import { setLayout, setAutosaveFn, resizeAllCharts } from './charts.js';
import { initUI, updateWSStatus, renderIndChips, updateLayoutDropBtn } from './ui.js';
import { initWatchlist, updatePriceRows } from './watchlist.js';
import { initAlerts } from './alerts.js';
import { initSettings } from './settings.js';
import { initScanner } from './scanner.js';
import { initEvents } from './events.js';
import { refreshOrderBook, refreshTechInfo } from './orderbook.js';
import { autosave, loadAutosave } from './persistence.js';
import { initAuth } from './auth.js';
import { debounce, log, toast } from './utils.js';

// A symbol charted on a non-Binance exchange has its price owned by that chart
// (see charts.js startKlineStream), so the Binance mini-ticker must not clobber
// it — otherwise the charted symbol's watchlist row would disagree with the
// chart's own price axis.
function isChartPinned(symbol) {
  return state.panels.some(p => p.symbol === symbol && p.exchange !== 'binance');
}

function startPriceStream() {
  // Cancel any pending reconnect so we don't stack duplicate sockets when a
  // reconnect timer and a focus/visibility check both fire.
  clearTimeout(startPriceStream._reconnect);
  updateWSStatus('');
  const ws = openPriceStream(batch => {
    if (isChartPinned(batch.symbol)) return;
    state.prices[batch.symbol] = { price: batch.price, open: batch.open, change: batch.change, chgVal: batch.chgVal };
  }, onPriceStreamClosed);
  if (ws) {
    ws.addEventListener('open', () => { startPriceStream._retry = 0; updateWSStatus('connected'); });
    ws.addEventListener('error', () => updateWSStatus('error'));
  }
  // throttle row updates to ~1s
  if (!startPriceStream._timer) {
    startPriceStream._timer = setInterval(() => updatePriceRows(), 1500);
  }
  // poll REST for watchlist symbols that Binance stream doesn't carry (e.g. USDC
  // pairs listed only on Gate.io/KuCoin). First run after 2 s, then every 30 s.
  if (!startPriceStream._missingTimer) {
    const pollMissing = async () => {
      const wl = state.watchlists[state.currentWatchlist] || [];
      const items = wl.map(s => ({ symbol: s.symbol, exchange: s.exchange || defaultExchange() }));
      if (items.length) { await refreshMissingPrices(items); updatePriceRows(); }
    };
    setTimeout(pollMissing, 2000);
    startPriceStream._missingTimer = setInterval(pollMissing, 30000);
  }
}

// The price socket closed unexpectedly (tab backgrounded, network blip, server
// drop). Reconnect with capped exponential backoff so prices resume on their
// own — previously the stream just died and rows stopped updating until reload.
function onPriceStreamClosed() {
  updateWSStatus('error');
  const retry = startPriceStream._retry = (startPriceStream._retry || 0) + 1;
  const delay = Math.min(15000, 1000 * 2 ** Math.min(retry, 4));
  clearTimeout(startPriceStream._reconnect);
  startPriceStream._reconnect = setTimeout(startPriceStream, delay);
}

// Reconnect immediately if the socket isn't live when the user returns to the
// tab / window, or the network comes back — rather than waiting out the backoff.
function ensurePriceStream() {
  if (!priceStreamLive()) startPriceStream();
}

async function init() {
  if (!window.LightweightCharts) {
    document.getElementById('chartsArea').innerHTML = '<div class="panel-error" style="display:flex"><div><p>Charting library failed to load. Check your connection and reload.</p><button onclick="location.reload()" class="retry-btn">Reload</button></div></div>';
    return;
  }
  setAutosaveFn(autosave);

  // Resolve the signed-in user first so the session/layouts we load below come
  // from their account (server scopes /api/session by the auth cookie).
  await initAuth();

  // restore or default
  const restored = await loadAutosave();
  document.documentElement.dataset.theme = state.theme;
  if (!restored) setLayout('l1');

  initUI();
  initWatchlist();
  initAlerts();
  initSettings();
  initScanner();
  initEvents();

  startPriceStream();
  document.addEventListener('restart-price-stream', startPriceStream);

  document.addEventListener('drawings-changed', autosave);
  document.addEventListener('layout-restored', () => {
    renderIndChips();
    updateLayoutDropBtn();
  });

  window.addEventListener('resize', debounce(resizeAllCharts, 150));
  // When the tab/window regains focus or the network returns, redraw charts and
  // make sure the price stream is alive (browsers suspend backgrounded sockets).
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { resizeAllCharts(); ensurePriceStream(); } });
  window.addEventListener('focus', ensurePriceStream);
  window.addEventListener('online', ensurePriceStream);

  // right panel splitter
  initSplitter();

  log('CryptoPro Charts ready');
  setTimeout(resizeAllCharts, 300);
}

function initSplitter() {
  const sp = document.getElementById('splitterRight');
  const right = document.getElementById('rightPanel');
  if (!sp) return;
  let dragging = false;
  sp.addEventListener('mousedown', e => { dragging = true; sp.classList.add('dragging'); e.preventDefault(); });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    const w = Math.max(220, Math.min(520, window.innerWidth - e.clientX));
    right.style.width = w + 'px';
    resizeAllCharts();
  });
  window.addEventListener('mouseup', () => { if (dragging) { dragging = false; sp.classList.remove('dragging'); } });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
