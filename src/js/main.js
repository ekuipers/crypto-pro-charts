// ============================================================
// MAIN — app entry point
// ============================================================
import { state } from './state.js';
import { openPriceStream, closePriceStream } from './data.js';
import { setLayout, setAutosaveFn, resizeAllCharts } from './charts.js';
import { initUI, updateWSStatus, renderIndChips } from './ui.js';
import { initWatchlist, updatePriceRows } from './watchlist.js';
import { initAlerts } from './alerts.js';
import { initSettings } from './settings.js';
import { initScanner } from './scanner.js';
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
}

function init() {
  if (!window.LightweightCharts) {
    document.getElementById('chartsArea').innerHTML = '<div class="panel-error" style="display:flex"><div><p>Charting library failed to load. Check your connection and reload.</p><button onclick="location.reload()" class="retry-btn">Reload</button></div></div>';
    return;
  }
  setAutosaveFn(autosave);

  // restore or default
  const restored = loadAutosave();
  document.documentElement.dataset.theme = state.theme;
  if (!restored) setLayout('l1');

  initUI();
  initWatchlist();
  initAlerts();
  initSettings();
  initScanner();

  startPriceStream();
  document.addEventListener('restart-price-stream', startPriceStream);

  // active layout button + theme reflect
  document.querySelectorAll('.layout-opt').forEach(b => b.classList.toggle('active', b.dataset.layout === state.layout));

  document.addEventListener('drawings-changed', autosave);
  document.addEventListener('layout-restored', () => {
    renderIndChips();
    document.querySelectorAll('.layout-opt').forEach(b => b.classList.toggle('active', b.dataset.layout === state.layout));
  });

  window.addEventListener('resize', debounce(resizeAllCharts, 150));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resizeAllCharts(); });

  // right panel splitter
  initSplitter();

  log('Crypto Charting Pro ready');
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
