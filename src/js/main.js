// ============================================================
// MAIN — app entry point
// ============================================================
import { state } from './state.js';
import { openPriceStream, closePriceStream, refreshMissingPrices } from './data.js';
import { setLayout, setAutosaveFn, resizeAllCharts } from './charts.js';
import { initUI, updateWSStatus, renderIndChips, updateLayoutDropBtn } from './ui.js';
import { initWatchlist, updatePriceRows } from './watchlist.js';
import { initAlerts } from './alerts.js';
import { initSettings } from './settings.js';
import { initScanner } from './scanner.js';
import { initEvents } from './events.js';
import { refreshOrderBook, refreshTechInfo } from './orderbook.js';
import { autosave, loadAutosave } from './persistence.js';
import { debounce, log, toast } from './utils.js';

function startPriceStream() {
  updateWSStatus('');
  const ws = openPriceStream(batch => {
    state.prices[batch.symbol] = { price: batch.price, open: batch.open, change: batch.change, chgVal: batch.chgVal };
  });
  if (ws) {
    ws.addEventListener('open', () => updateWSStatus('connected'));
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
      const syms = wl.map(s => s.symbol);
      if (syms.length) { await refreshMissingPrices(syms); updatePriceRows(); }
    };
    setTimeout(pollMissing, 2000);
    startPriceStream._missingTimer = setInterval(pollMissing, 30000);
  }
}

async function init() {
  if (!window.LightweightCharts) {
    document.getElementById('chartsArea').innerHTML = '<div class="panel-error" style="display:flex"><div><p>Charting library failed to load. Check your connection and reload.</p><button onclick="location.reload()" class="retry-btn">Reload</button></div></div>';
    return;
  }
  setAutosaveFn(autosave);

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
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resizeAllCharts(); });

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
