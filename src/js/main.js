// ============================================================
// MAIN — app entry point
// ============================================================
import { state } from './state.js';
import { openPriceStream, closePriceStream, priceStreamLive, refreshMissingPrices, refreshVolumes, defaultExchange } from './data.js';
import { setLayout, setAutosaveFn, resizeAllCharts, redrawAllPanels } from './charts.js';
import { initUI, updateWSStatus, renderIndChips, updateLayoutDropBtn } from './ui.js';
import { initWatchlist, updatePriceRows } from './watchlist.js';
import { initMarketStatus } from './marketstatus.js';
import { initAlerts } from './alerts.js';
import { initSettings } from './settings.js';
import { initScanner } from './scanner.js';
import { initEvents } from './events.js';
import { refreshOrderBook, refreshTechInfo, initOrderBookSubtabs, updateTechInfoPrice } from './orderbook.js';
import { autosave, loadAutosave } from './persistence.js';
import { initAuth } from './auth.js';
import { initReplay } from './replay.js';
import { initPaper } from './paper.js';
import { initCommandPalette } from './palette.js';
import { debounce, log, toast } from './utils.js';

function startPriceStream() {
  // Cancel any pending reconnect so we don't stack duplicate sockets when a
  // reconnect timer and a focus/visibility check both fire.
  clearTimeout(startPriceStream._reconnect);
  updateWSStatus('');
  const ws = openPriceStream(batch => {
    // Binance mini-ticker always writes the plain (Binance) key — a chart on a
    // different exchange for the same symbol now lives at its own namespaced
    // key (see priceKey in utils.js), so the two can never collide.
    state.prices[batch.symbol] = { price: batch.price, open: batch.open, change: batch.change, chgVal: batch.chgVal };
  }, onPriceStreamClosed);
  if (ws) {
    ws.addEventListener('open', () => { startPriceStream._retry = 0; updateWSStatus('connected'); });
    ws.addEventListener('error', () => updateWSStatus('error'));
  }
  // throttle row updates to ~1s (also keeps the Info pane's price/24h-change,
  // and any open paper-trade position lines drawn on the chart, ticking live
  // at the same cadence as the watchlist rows)
  if (!startPriceStream._timer) {
    startPriceStream._timer = setInterval(() => { updatePriceRows(); updateTechInfoPrice(); redrawAllPanels(); }, 1500);
  }
  // poll REST for watchlist symbols that Binance stream doesn't carry (e.g. USDC
  // pairs listed only on Gate.io/KuCoin). First run after 2 s, then every 30 s.
  if (!startPriceStream._missingTimer) {
    const pollMissing = async () => {
      const wl = state.watchlists[state.currentWatchlist] || [];
      const items = wl.map(s => ({ symbol: s.symbol, exchange: s.exchange || defaultExchange() }));
      if (items.length) { await Promise.all([refreshMissingPrices(items), refreshVolumes(items)]); updatePriceRows(); }
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
    const area = document.getElementById('chartsArea');
    area.innerHTML = '<div class="panel-error" style="display:flex"><div><p>Charting library failed to load. Check your connection and reload.</p><button class="retry-btn">Reload</button></div></div>';
    // No inline onclick= — a strict CSP (script-src without 'unsafe-inline') blocks inline event handlers.
    area.querySelector('.retry-btn').addEventListener('click', () => location.reload());
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

  // P3-25: on a phone/narrow-tablet viewport the right panel becomes a
  // full-screen overlay (see the mobile media query in style.css) — default
  // it to hidden so the chart is what a mobile user actually sees first,
  // same hamburger (☰) button reveals it either way.
  if (window.innerWidth <= 820) document.getElementById('rightPanel')?.classList.add('collapsed');

  initUI();
  initWatchlist();
  initMarketStatus();
  initAlerts();
  initSettings();
  initScanner();
  initEvents();
  initReplay();
  initOrderBookSubtabs();
  initPaper();
  initCommandPalette();

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

// P3-25: PWA — register the app-shell service worker (installable, opens
// instantly, offline fallback). Registered after load so it never competes
// with first-paint for bandwidth/CPU.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
