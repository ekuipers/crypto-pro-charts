// ============================================================
// CHARTS — panel + chart lifecycle, layouts, indicators glue
// ============================================================
import { state, drawingState } from './state.js';
import { LAYOUT_COUNTS, COLORS, THEMES, DEFAULT_THEME, TF_SECONDS } from './constants.js';
import { getCachedKlines, fetchKlines, openKlineStream, defaultExchange } from './data.js';
import { indDef, calcOverlay, calcOscillator } from './indicators.js';
import { baseAsset, quoteAsset, fmtPrice, uid, log, warn, toast } from './utils.js';
import { initDrawingsForPanel, renderDrawings } from './drawings.js';

const LWC = () => window.LightweightCharts;

// Resolve the active theme's colors (falls back to default).
export function themeColors() {
  return (THEMES[state.theme] || THEMES[DEFAULT_THEME]).chart;
}
export function isDark() {
  return (THEMES[state.theme] || THEMES[DEFAULT_THEME]).mode === 'dark';
}

// Shared minimum width for every right price scale so main + oscillator
// panes line up on the same time axis.
const PRICE_SCALE_MIN_WIDTH = 68;

export function chartTheme() {
  const c = themeColors();
  return {
    layout: {
      background: { type: 'solid', color: c.bg },
      textColor: c.text,
    },
    grid: {
      vertLines: { color: c.grid },
      horzLines: { color: c.grid },
    },
    rightPriceScale: { borderColor: c.border, minimumWidth: PRICE_SCALE_MIN_WIDTH },
    timeScale: { borderColor: c.border, timeVisible: true, secondsVisible: false },
    crosshair: { mode: LWC().CrosshairMode.Normal },
  };
}

// ---------- Dynamic price-axis format (Roadmap 4) ----------
// Returns LightweightCharts priceFormat options with precision and minMove
// matched to the current price magnitude, so the axis never shows redundant
// decimal places (e.g. BTC at 65000 shows 0 decimals; SHIB at 0.000012 shows 8).
function dynamicPriceFormat(price) {
  const a = Math.abs(price || 0);
  if (a >= 10000) return { type: 'price', precision: 0, minMove: 1 };
  if (a >= 1000)  return { type: 'price', precision: 1, minMove: 0.1 };
  if (a >= 100)   return { type: 'price', precision: 2, minMove: 0.01 };
  if (a >= 10)    return { type: 'price', precision: 3, minMove: 0.001 };
  if (a >= 1)     return { type: 'price', precision: 4, minMove: 0.0001 };
  if (a >= 0.1)   return { type: 'price', precision: 5, minMove: 0.00001 };
  if (a >= 0.01)  return { type: 'price', precision: 6, minMove: 0.000001 };
  return { type: 'price', precision: 8, minMove: 0.00000001 };
}

// ---------- Candle countdown timer (Roadmap 5) ----------
function fmtCountdown(secs) {
  secs = Math.max(0, secs);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    : `${m}:${String(s).padStart(2,'0')}`;
}

// Global 1s interval — updates every panel's timer element.
setInterval(() => {
  const now = Math.floor(Date.now() / 1000);
  state.panels.forEach(p => {
    const el = p.el?.querySelector('.candle-timer');
    if (!el) return;
    const sec = TF_SECONDS[p.tf] || 3600;
    el.textContent = fmtCountdown((Math.floor(now / sec) + 1) * sec - now);
  });
}, 1000);

// ---------- Layout management ----------
export function setLayout(mode) {
  state.layout = mode;
  const grid = document.getElementById('chartsArea');
  grid.className = 'charts-area layout-' + mode;
  const want = LAYOUT_COUNTS[mode];
  // Add or remove panels to match
  while (state.panels.length < want) addPanel();
  while (state.panels.length > want) destroyPanel(state.panels[state.panels.length - 1]);
  applyGridSizes();
  updateResizers();
  resizeAllCharts();
}

const TWO_COL = ['l2h', 'l4'];
const TWO_ROW = ['l2v', 'l4'];

function applyGridSizes() {
  const grid = document.getElementById('chartsArea');
  if (!grid) return;
  const sz = state.gridSizes[state.layout] || {};
  grid.style.gridTemplateColumns = TWO_COL.includes(state.layout) ? (sz.cols || '1fr 1fr') : '';
  grid.style.gridTemplateRows = TWO_ROW.includes(state.layout) ? (sz.rows || '1fr 1fr') : '';
}

function updateResizers() {
  const layout = state.layout;
  state.panels.forEach((p, i) => {
    const r = p.el.querySelector('.panel-resize-r');
    const b = p.el.querySelector('.panel-resize-b');
    if (!r || !b) return;
    let showR = false, showB = false;
    if (layout === 'l2h') showR = i === 0;
    else if (layout === 'l2v') showB = i === 0;
    else if (layout === 'l4') { showR = i % 2 === 0; showB = i < 2; }
    r.style.display = showR ? 'block' : 'none';
    b.style.display = showB ? 'block' : 'none';
  });
}

function wirePanelResizers(panel) {
  const rh = panel.el.querySelector('.panel-resize-r');
  const bh = panel.el.querySelector('.panel-resize-b');
  if (!rh || !bh) return;
  const start = axis => e => {
    e.preventDefault(); e.stopPropagation();
    const grid = document.getElementById('chartsArea');
    const rect = grid.getBoundingClientRect();
    const move = ev => {
      const cur = state.gridSizes[state.layout] || {};
      if (axis === 'x') {
        let ratio = (ev.clientX - rect.left) / rect.width;
        ratio = Math.max(0.15, Math.min(0.85, ratio));
        state.gridSizes[state.layout] = { ...cur, cols: `${ratio.toFixed(4)}fr ${(1 - ratio).toFixed(4)}fr` };
      } else {
        let ratio = (ev.clientY - rect.top) / rect.height;
        ratio = Math.max(0.15, Math.min(0.85, ratio));
        state.gridSizes[state.layout] = { ...cur, rows: `${ratio.toFixed(4)}fr ${(1 - ratio).toFixed(4)}fr` };
      }
      applyGridSizes(); resizeAllCharts();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      document.body.classList.remove('resizing');
      scheduleAutosave();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    document.body.classList.add('resizing');
  };
  rh.addEventListener('mousedown', start('x'));
  bh.addEventListener('mousedown', start('y'));
}

// ---- Time-range presets (bottom timescale bar) ----
const RANGE_SECONDS = { '1D': 86400, '3D': 3 * 86400, '1W': 7 * 86400, '1M': 30 * 86400, '3M': 90 * 86400, '6M': 180 * 86400, '1Y': 365 * 86400 };
function applyTimeRange(panel, range) {
  if (!panel.chart || !panel.data.length) return;
  const ts = panel.chart.timeScale();
  if (range === 'All' || !RANGE_SECONDS[range]) { ts.fitContent(); return; }
  const last = panel.data[panel.data.length - 1].time;
  const first = panel.data[0].time;
  const from = Math.max(first, last - RANGE_SECONDS[range]);
  try { ts.setVisibleRange({ from, to: last }); } catch { ts.fitContent(); }
}

export function addPanel(opts = {}) {
  const grid = document.getElementById('chartsArea');
  const id = uid('panel');
  const el = document.createElement('div');
  el.className = 'chart-panel';
  el.dataset.id = id;
  el.innerHTML = `
    <div class="panel-bar">
      <button class="sym-btn">${opts.symbol ? baseAsset(opts.symbol) : 'BTC'}<span class="sym-quote">${opts.symbol ? quoteAsset(opts.symbol) : 'USDT'}</span></button>
      <div class="tf-group">
        ${['1m','5m','15m','30m','1h','4h','1d','1w'].map(t => `<button class="tf-btn${(opts.tf||'1h')===t?' active':''}" data-tf="${t}">${t}</button>`).join('')}
      </div>
      <div class="compare-legend"></div>
      <div class="ohlc-info"></div>
      <span class="candle-timer" title="Time until candle closes"></span>
      <div class="panel-actions">
        <button class="panel-act compare-btn" title="Compare / overlay symbol">＋📈</button>
        <button class="panel-act add-ind-btn" title="Indicators">ƒ</button>
        <button class="panel-act fs-btn" title="Fullscreen">⛶</button>
        <button class="panel-act close-btn" title="Close">✕</button>
      </div>
    </div>
    <div class="panel-body">
      <div class="main-chart-div"></div>
      <div class="osc-wrap"></div>
      <div class="vol-profile-layer"></div>
      <div class="drawing-layer"></div>
      <div class="panel-error" style="display:none"></div>
    </div>
    <div class="panel-timescale">
      ${['1D','3D','1W','1M','3M','6M','1Y','All'].map(r => `<button class="ts-btn" data-range="${r}">${r}</button>`).join('')}
    </div>
    <div class="panel-resize-r" title="Drag to resize"></div>
    <div class="panel-resize-b" title="Drag to resize"></div>`;
  grid.appendChild(el);

  const panel = {
    id, el,
    symbol: opts.symbol || 'BTCUSDT',
    symbolName: opts.symbolName || 'Bitcoin',
    exchange: opts.exchange || defaultExchange(),
    tf: opts.tf || '1h',
    data: [],
    chart: null, candleSeries: null, volumeSeries: null,
    heikinSeries: null,
    indicators: [],          // {uid, defId, params, color, series[], subChart, subSeries[], hist}
    overlays: [],            // {symbol, name, color, series, data, ws}
    drawings: opts.drawings || [],
    klineWS: null,
  };
  state.panels.push(panel);

  // wire events
  el.querySelector('.sym-btn').addEventListener('click', () => {
    setActivePanel(panel);
    document.dispatchEvent(new CustomEvent('open-symbol-search', { detail: { panel } }));
  });
  el.querySelectorAll('.tf-btn').forEach(b => b.addEventListener('click', () => {
    el.querySelectorAll('.tf-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    changeTimeframe(panel, b.dataset.tf);
  }));
  el.querySelector('.add-ind-btn').addEventListener('click', () => {
    setActivePanel(panel);
    document.dispatchEvent(new CustomEvent('open-indicators'));
  });
  el.querySelector('.compare-btn').addEventListener('click', () => {
    setActivePanel(panel);
    document.dispatchEvent(new CustomEvent('open-compare-search', { detail: { panel } }));
  });
  el.querySelectorAll('.ts-btn').forEach(b => b.addEventListener('click', () => {
    el.querySelectorAll('.ts-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    applyTimeRange(panel, b.dataset.range);
  }));
  el.querySelector('.fs-btn').addEventListener('click', () => { el.classList.toggle('panel-fullscreen'); resizeAllCharts(); });
  el.querySelector('.close-btn').addEventListener('click', () => {
    if (state.panels.length <= 1) { toast('At least one chart is required', 'warn'); return; }
    destroyPanel(panel);
    resizeAllCharts();
  });
  el.addEventListener('mousedown', () => setActivePanel(panel));
  wirePanelResizers(panel);

  initChart(panel);
  loadPanelData(panel);
  if (!state.activePanel) setActivePanel(panel);
  return panel;
}

function initChart(panel) {
  if (!LWC()) { showPanelError(panel, 'Charting library failed to load.'); return; }
  try {
    const div = panel.el.querySelector('.main-chart-div');
    const chart = LWC().createChart(div, { ...chartTheme(), autoSize: false });
    panel.chart = chart;
    panel.candleSeries = chart.addCandlestickSeries({
      upColor: state.settings.upColor, downColor: state.settings.downColor,
      borderUpColor: state.settings.upColor, borderDownColor: state.settings.downColor,
      wickUpColor: state.settings.upColor, wickDownColor: state.settings.downColor,
    });
    panel.volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' }, priceScaleId: 'vol',
    });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    // crosshair OHLC display
    chart.subscribeCrosshairMove(param => {
      const info = panel.el.querySelector('.ohlc-info');
      if (!param.time || !param.seriesData?.get(panel.candleSeries)) { info.innerHTML = ''; return; }
      const c = param.seriesData.get(panel.candleSeries);
      const up = c.close >= c.open;
      const col = up ? state.settings.upColor : state.settings.downColor;
      info.innerHTML = `<span style="color:${col}">O ${fmtPrice(c.open)} H ${fmtPrice(c.high)} L ${fmtPrice(c.low)} C ${fmtPrice(c.close)}</span>`;
    });

    // resize observer
    const ro = new ResizeObserver(() => {
      const r = div.getBoundingClientRect();
      if (r.width && r.height) chart.resize(r.width, r.height);
      renderDrawings(panel);
      renderVolProfile(panel);
    });
    ro.observe(div);
    panel._ro = ro;

    initDrawingsForPanel(panel);

    // re-render drawings / vol profile on scroll-zoom, and keep the
    // main + oscillator time axes aligned as price labels change width
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      renderDrawings(panel);
      renderVolProfile(panel);
      alignPriceScales(panel);
    });

    // Continuous watchdog: vertical price-axis scaling changes label
    // widths without firing any range event, so poll cheaply and realign
    // only when the widest scale actually changes.
    startAlignMonitor(panel);

    // wheel-to-scroll on panel bar
    const bar = panel.el.querySelector('.panel-bar');
    bar.addEventListener('wheel', e => {
      document.getElementById('chartsArea').scrollBy({ top: e.deltaY });
    }, { passive: true });
  } catch (e) {
    warn('initChart error', e);
    showPanelError(panel, 'Failed to initialise chart.');
  }
}

export async function loadPanelData(panel) {
  hidePanelError(panel);
  try {
    const data = await getCachedKlines(panel.symbol, panel.tf, 500, panel.exchange);
    panel.data = data;
    panel.candleSeries.setData(data);
    if (data.length) panel.candleSeries.applyOptions({ priceFormat: dynamicPriceFormat(data[data.length - 1].close) });
    panel.volumeSeries.setData(data.map(c => ({
      time: c.time, value: c.volume,
      color: c.close >= c.open ? state.settings.upColor + '80' : state.settings.downColor + '80',
    })));
    panel.chart.applyOptions({ watermark: {
      visible: true, text: baseAsset(panel.symbol), fontSize: 48,
      color: isDark() ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
      horzAlign: 'center', vertAlign: 'center',
    }});
    recomputeIndicators(panel);
    rebuildOverlays(panel);
    renderDrawings(panel);
    startKlineStream(panel);
    requestAnimationFrame(() => alignPriceScales(panel));
    // Let the events module (re)place its x-axis markers for the new data range.
    document.dispatchEvent(new CustomEvent('panel-data-loaded', { detail: { panel } }));
    return data;
  } catch (e) {
    warn('loadPanelData error', e);
    showPanelError(panel, 'Failed to load chart data.');
    return [];
  }
}

function startKlineStream(panel) {
  if (panel.klineWS) { try { panel.klineWS.close(); } catch {} panel.klineWS = null; }
  if (panel._klinePoll) { clearInterval(panel._klinePoll); panel._klinePoll = null; }

  const onCandle = candle => {
    const d = panel.data;
    if (!d.length) return;
    const last = d[d.length - 1];
    if (candle.time === last.time) {
      Object.assign(last, candle);
    } else if (candle.time > last.time) {
      d.push(candle);
      if (d.length > 1500) d.shift();
      // A new bar appeared on the main chart — extend every oscillator's spacer
      // grid with the same time so the panes stay aligned at the right edge.
      panel.indicators.forEach(ind => { if (ind._spacer) { try { ind._spacer.update({ time: candle.time }); } catch {} } });
    } else return;
    panel.candleSeries.update(candle);
    panel.volumeSeries.update({ time: candle.time, value: candle.volume,
      color: candle.close >= candle.open ? state.settings.upColor + '80' : state.settings.downColor + '80' });
    // Keep the charted symbol's watchlist price on the SAME exchange as the chart.
    // The Binance mini-ticker stream (main.js) feeds every other watchlist row, but
    // for a non-Binance exchange its price would diverge from this chart — so the
    // chart owns its symbol's price here (main.js skips pinned symbols).
    if (panel.exchange !== 'binance') {
      state.prices[panel.symbol] = { ...(state.prices[panel.symbol] || {}), price: candle.close };
    }
    // A closed bar can finalise a fresh MA crossing — refresh the markers.
    if (candle.closed) rebuildCrossMarkers(panel);
    document.dispatchEvent(new CustomEvent('panel-live', { detail: { panel, price: candle.close } }));
  };

  panel.klineWS = openKlineStream(panel.symbol, panel.tf, onCandle, panel.exchange);
  // Exchanges without a live kline WebSocket (OKX, Gate, KuCoin, Bitstamp,
  // CryptoCompare, Alpaca, Hyperliquid) would otherwise freeze the chart at the
  // last REST candle, leaving the vertical price axis showing stale values. Poll
  // the latest bar so the chart keeps tracking the current price.
  if (!panel.klineWS) startKlinePoll(panel, onCandle);
}

// REST polling fallback for exchanges without a kline WebSocket. Refreshes the
// latest bar (the server-side cache coalesces these into real upstream hits at
// the per-timeframe TTL, so this stays cheap).
function startKlinePoll(panel, onCandle) {
  const sec = TF_SECONDS[panel.tf] || 3600;
  // ~4 refreshes per candle, clamped to 5–60 s to keep REST traffic light.
  const periodMs = Math.min(Math.max(Math.round(sec / 4), 5), 60) * 1000;
  const tick = async () => {
    if (document.hidden) return;
    try {
      const bars = await fetchKlines(panel.symbol, panel.tf, 2, panel.exchange);
      if (bars.length) onCandle({ ...bars[bars.length - 1], closed: false });
    } catch { /* transient upstream error — keep the last bars on screen */ }
  };
  tick();                                   // align immediately, don't wait a full period
  panel._klinePoll = setInterval(tick, periodMs);
}

export function changeTimeframe(panel, tf) {
  panel.tf = tf;
  loadPanelData(panel);
  scheduleAutosave();
}

// Refresh every chart in one click (top-bar refresh button). Drops the kline
// cache so each panel re-fetches fresh bars (getCachedKlines otherwise serves
// cached data for up to 60s), then reloads all panels in parallel.
export async function refreshAllPanels() {
  state.klineCache = {};
  await Promise.all(state.panels.map(p => loadPanelData(p)));
}

export async function changeSymbol(panel, symbol, name, exchange) {
  panel.symbol = symbol;
  panel.symbolName = name || baseAsset(symbol);
  if (exchange) panel.exchange = exchange;
  panel.el.querySelector('.sym-btn').innerHTML = `${baseAsset(symbol)}<span class="sym-quote">${quoteAsset(symbol)}</span>`;
  await loadPanelData(panel);
  if (panel === state.activePanel) {
    document.dispatchEvent(new CustomEvent('active-symbol-changed', { detail: { panel } }));
  }
  scheduleAutosave();
}

export function setActivePanel(panel) {
  state.activePanel = panel;
  state.panels.forEach(p => p.el.classList.toggle('active', p === panel));
  document.dispatchEvent(new CustomEvent('active-symbol-changed', { detail: { panel } }));
}

// Pick a symbol from the watchlist. If another (non-active) chart is already
// showing this symbol, focus that chart instead of loading a duplicate onto the
// active chart — this prevents two panes charting the same symbol. Otherwise the
// symbol loads into the active chart as usual.
export function selectWatchlistSymbol(symbol, name, exchange) {
  const active = state.activePanel;
  const ex = exchange || defaultExchange();
  // Treat symbol+exchange as the identity — BTCUSDT on Binance and on Bybit are
  // different charts, so don't collapse them onto one another.
  if (active && active.symbol === symbol && active.exchange === ex) return;
  const existing = state.panels.find(p => p !== active && p.symbol === symbol && p.exchange === ex);
  if (existing) { setActivePanel(existing); return; }
  if (active) changeSymbol(active, symbol, name, ex);
}

export function destroyPanel(panel) {
  stopAlignMonitor(panel);
  try { panel._ro?.disconnect(); } catch {}
  if (panel._klinePoll) { clearInterval(panel._klinePoll); panel._klinePoll = null; }
  try { panel.klineWS?.close(); } catch {}
  panel.overlays?.forEach(o => { try { o.ws?.close(); } catch {} });
  panel.indicators.forEach(ind => { try { ind.subChart?.remove(); } catch {} });
  try { panel.chart?.remove(); } catch {}
  panel.el.remove();
  state.panels = state.panels.filter(p => p !== panel);
  if (state.activePanel === panel) setActivePanel(state.panels[0] || null);
}

export function resizeAllCharts() {
  requestAnimationFrame(() => {
    state.panels.forEach(p => {
      const div = p.el.querySelector('.main-chart-div');
      const r = div.getBoundingClientRect();
      if (r.width && r.height && p.chart) p.chart.resize(r.width, r.height);
      p.indicators.forEach(ind => {
        if (ind.subChart) {
          const sr = ind._oscDiv.getBoundingClientRect();
          if (sr.width && sr.height) ind.subChart.resize(sr.width, sr.height);
        }
      });
      renderDrawings(p);
      renderVolProfile(p);
      alignPriceScales(p);
    });
  });
}

// ---------- Indicators ----------
export function addIndicator(panel, defId, params, color) {
  const def = indDef(defId);
  if (!def) return;
  const ind = {
    uid: uid('ind'), defId, params: params || {}, color: color || def.color,
    series: [], subChart: null, subSeries: [], hist: null,
  };
  // fill default params
  def.params.forEach(p => { if (ind.params[p.n] == null) ind.params[p.n] = p.d; });
  panel.indicators.push(ind);
  buildIndicator(panel, ind);
  rebuildCrossMarkers(panel);
  document.dispatchEvent(new CustomEvent('indicators-changed', { detail: { panel } }));
  scheduleAutosave();
  return ind;
}

export function removeIndicator(panel, ind) {
  ind.series.forEach(s => { try { panel.chart.removeSeries(s); } catch {} });
  if (ind.hist) { try { panel.chart.removeSeries(ind.hist); } catch {} }
  if (panel.heikinSeries && ind.defId === 'heikinashi') { try { panel.chart.removeSeries(panel.heikinSeries); } catch {} panel.heikinSeries = null; }
  if (ind.subChart) { try { ind.subChart.remove(); } catch {} ind._oscDiv?.remove(); }
  if (ind.defId === 'volprofile') panel.el.querySelector('.vol-profile-layer').innerHTML = '';
  if (ind.defId === 'luxalgo') { panel._luxAlgoMarkers = []; applyPanelMarkers(panel); }
  panel.indicators = panel.indicators.filter(i => i !== ind);
  layoutOscillators(panel);
  rebuildCrossMarkers(panel);
  document.dispatchEvent(new CustomEvent('indicators-changed', { detail: { panel } }));
  scheduleAutosave();
}

export function recomputeIndicators(panel) {
  // rebuild all (simple + robust)
  const defs = panel.indicators.map(i => ({ defId: i.defId, params: i.params, color: i.color, uid: i.uid }));
  panel.indicators.slice().forEach(ind => {
    ind.series.forEach(s => { try { panel.chart.removeSeries(s); } catch {} });
    if (ind.hist) { try { panel.chart.removeSeries(ind.hist); } catch {} }
    if (ind.subChart) { try { ind.subChart.remove(); } catch {} ind._oscDiv?.remove(); }
    ind.series = []; ind.subSeries = []; ind.subChart = null; ind.hist = null;
  });
  if (panel.heikinSeries) { try { panel.chart.removeSeries(panel.heikinSeries); } catch {} panel.heikinSeries = null; }
  panel.el.querySelector('.vol-profile-layer').innerHTML = '';
  panel._luxAlgoMarkers = [];
  panel.indicators.forEach(ind => buildIndicator(panel, ind));
  rebuildCrossMarkers(panel);
}

function buildIndicator(panel, ind) {
  const def = indDef(ind.defId);
  if (!def || !panel.data.length) return;
  const p = { ...ind.params, _color: ind.color };

  if (ind.defId === 'volprofile') { renderVolProfile(panel); return; }

  if (def.type === 'overlay') {
    const res = calcOverlay(ind.defId, panel.data, p);
    res.forEach(r => {
      if (r.candles) {
        panel.heikinSeries = panel.chart.addCandlestickSeries({
          upColor: '#26a69a80', downColor: '#ef535080', borderUpColor: '#26a69a',
          borderDownColor: '#ef5350', wickUpColor: '#26a69a', wickDownColor: '#ef5350',
        });
        panel.heikinSeries.setData(r.candles);
        ind.series.push(panel.heikinSeries);
        return;
      }
      if (r.signals) {
        panel._luxAlgoMarkers = r.signals.map(s => ({
          time: s.time,
          position: s.direction === 1 ? 'belowBar' : 'aboveBar',
          color: s.direction === 1 ? '#26a69a' : '#ef5350',
          shape: s.direction === 1 ? 'arrowUp' : 'arrowDown',
          size: 1,
          text: s.direction === 1 ? 'BUY' : 'SELL',
        }));
        applyPanelMarkers(panel);
        return;
      }
      const s = panel.chart.addLineSeries({
        color: r.color, lineWidth: 2,
        lineStyle: r.dashed ? LWC().LineStyle.Dashed : LWC().LineStyle.Solid,
        priceLineVisible: false, lastValueVisible: false,
        pointMarkersVisible: !!r.pointMarker,
        lineType: r.pointMarker ? 1 : 0,
      });
      s.setData(r.vals);
      ind.series.push(s);
    });
  } else {
    buildOscillator(panel, ind, p);
  }
}

function buildOscillator(panel, ind, p) {
  const def = indDef(ind.defId);
  const oscWrap = panel.el.querySelector('.osc-wrap');
  const div = document.createElement('div');
  div.className = 'osc-pane';
  div.innerHTML = `<div class="osc-label">${def.full}<button class="osc-close">✕</button></div><div class="osc-chart"></div>`;
  oscWrap.appendChild(div);
  ind._oscDiv = div;
  div.querySelector('.osc-close').addEventListener('click', () => removeIndicator(panel, ind));

  const chartDiv = div.querySelector('.osc-chart');
  const sub = LWC().createChart(chartDiv, {
    ...chartTheme(),
    timeScale: { ...chartTheme().timeScale, visible: false },
    rightPriceScale: { ...chartTheme().rightPriceScale },
  });
  ind.subChart = sub;

  // Time-grid spacer: an invisible series carrying a whitespace point for EVERY
  // candle time, on a hidden overlay price scale. Oscillator series start late
  // (RSI/MACD/ATR each have a different warmup), so without this the sub-chart's
  // time scale would have fewer bars than the main chart and the synced logical
  // range would drift the right edge left by the warmup length — exactly the
  // misalignment seen between the last candle and the oscillator line ends.
  // With identical time grids, the logical-range sync lines up both edges.
  // (Verified headless: last-bar x main 521 == osc 521, pixel-perfect.)
  ind._spacer = sub.addLineSeries({
    priceScaleId: 'spc', color: 'rgba(0,0,0,0)',
    lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
  });
  sub.priceScale('spc').applyOptions({ visible: false });
  ind._spacer.setData(panel.data.map(c => ({ time: c.time })));

  const res = calcOscillator(ind.defId, panel.data, p);

  if (res.hist) {
    ind.hist = sub.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
    ind.hist.setData(res.hist.map(h => ({ time: h.time, value: h.value, color: h.value >= 0 ? '#26a69a80' : '#ef535080' })));
  }
  res.lines.forEach(l => {
    const s = sub.addLineSeries({ color: l.color, lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
    s.setData(l.vals);
    ind.subSeries.push(s);
  });
  (res.refs || []).forEach(rv => {
    const ref = res.lines[0] ? ind.subSeries[0] : null;
    if (ref) ref.createPriceLine({ price: rv, color: '#787b86', lineWidth: 1, lineStyle: LWC().LineStyle.Dashed, axisLabelVisible: true });
  });

  // time-sync sub <-> main
  syncTimeScales(panel.chart, sub);
  layoutOscillators(panel);
  requestAnimationFrame(() => {
    const r = chartDiv.getBoundingClientRect();
    if (r.width && r.height) sub.resize(r.width, r.height);
    sub.timeScale().setVisibleLogicalRange(panel.chart.timeScale().getVisibleLogicalRange());
    alignPriceScales(panel);
  });
}

// ---- Align right price-scale widths so main + oscillator time axes match ----
// The main price chart and each oscillator are independent chart instances.
// Their time axes (and right edges) only line up if every right price-scale has
// the same pixel width. A LightweightCharts price scale never renders narrower
// than its content, so padding every pane's `minimumWidth` up to the widest
// pane makes them all render at exactly that width.
//
// This is intentionally STATELESS: it compares the live widths each call and
// re-aligns whenever they diverge, rather than caching a target. That matters
// because other code paths reset minimumWidth behind our back — most notably
// applyThemeToCharts(), which re-applies chartTheme() (minimumWidth 68) to every
// chart on a light/dark toggle. A cached-target guard would think it was still
// aligned and never correct the post-theme divergence; the divergence check
// always recovers (verified headless: theme toggle [78,68,68] -> [78,78,78]).
export function alignPriceScales(panel) {
  if (!panel || !panel.chart) return;
  const charts = [panel.chart, ...panel.indicators.filter(i => i.subChart).map(i => i.subChart)];
  if (charts.length < 2) return;   // nothing to align against

  let widths;
  try { widths = charts.map(c => c.priceScale('right').width()); } catch { return; }
  const target = Math.ceil(Math.max(PRICE_SCALE_MIN_WIDTH, ...widths));

  // Already aligned: every pane already sits at the target width. Skipping here
  // avoids needless applyOptions churn (and keeps this safe to poll often).
  if (widths.every(w => Math.ceil(w) === target)) return;

  charts.forEach(c => { try { c.priceScale('right').applyOptions({ minimumWidth: target }); } catch {} });
}

// Cheap polling watchdog. Reading priceScale().width() is inexpensive; we only
// touch the charts via alignPriceScales when the widest scale has changed.
function startAlignMonitor(panel) {
  stopAlignMonitor(panel);
  panel._alignTimer = setInterval(() => {
    if (!panel.chart) return;
    alignPriceScales(panel);
  }, 200);
}
function stopAlignMonitor(panel) {
  if (panel._alignTimer) { clearInterval(panel._alignTimer); panel._alignTimer = null; }
}

let _syncing = false;
function syncTimeScales(main, sub) {
  const mts = main.timeScale(), sts = sub.timeScale();
  mts.subscribeVisibleLogicalRangeChange(r => {
    if (_syncing || !r) return; _syncing = true; try { sts.setVisibleLogicalRange(r); } finally { _syncing = false; }
  });
  sts.subscribeVisibleLogicalRangeChange(r => {
    if (_syncing || !r) return; _syncing = true; try { mts.setVisibleLogicalRange(r); } finally { _syncing = false; }
  });
}

function layoutOscillators(panel) {
  const wrap = panel.el.querySelector('.osc-wrap');
  const n = panel.indicators.filter(i => i._oscDiv).length;
  wrap.style.height = n ? Math.min(n * 110, 330) + 'px' : '0';
  // The oscillator set changed — drop every scale back to the baseline so the
  // panes re-measure from scratch (otherwise they stay padded to the width of
  // a since-removed oscillator and never shrink back). alignPriceScales then
  // grows them all to the new widest pane.
  const charts = [panel.chart, ...panel.indicators.filter(i => i.subChart).map(i => i.subChart)];
  charts.forEach(c => { try { c.priceScale('right').applyOptions({ minimumWidth: PRICE_SCALE_MIN_WIDTH }); } catch {} });
  resizeAllCharts();
}

// ---------- Volume Profile (SVG overlay) ----------
export function renderVolProfile(panel) {
  const ind = panel.indicators.find(i => i.defId === 'volprofile');
  const layer = panel.el.querySelector('.vol-profile-layer');
  if (!ind || !panel.data.length || !panel.chart) { if (layer) layer.innerHTML = ''; return; }

  // Use the main-chart-div height for y-coordinate alignment (priceToCoordinate
  // returns coords relative to the chart canvas, not the full panel-body which
  // also includes any oscillator panes below).
  const chartDiv = panel.el.querySelector('.main-chart-div');
  const w = layer.clientWidth || chartDiv?.clientWidth || 0;
  const h = chartDiv?.clientHeight || layer.clientHeight || 0;

  if (!w || !h) {
    // Layout not computed yet — defer to next animation frame
    requestAnimationFrame(() => renderVolProfile(panel));
    return;
  }

  const bins = ind.params.bins || 30;
  const range = panel.chart.timeScale().getVisibleLogicalRange();
  let visible = panel.data;
  if (range) visible = panel.data.slice(Math.max(0, Math.floor(range.from)), Math.ceil(range.to));
  if (!visible.length) { layer.innerHTML = ''; return; }
  let lo = Infinity, hi = -Infinity;
  visible.forEach(c => { lo = Math.min(lo, c.low); hi = Math.max(hi, c.high); });
  const step = (hi - lo) / bins || 1;
  const buckets = new Array(bins).fill(0);
  visible.forEach(c => {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor(((c.high + c.low) / 2 - lo) / step)));
    buckets[idx] += c.volume;
  });
  const maxV = Math.max(...buckets) || 1;
  const barMax = w * 0.18;
  // SVG sized to the chart area so bar heights match priceToCoordinate units
  let svg = `<svg width="${w}" height="${h}" style="position:absolute;left:0;top:0;pointer-events:none">`;
  for (let i = 0; i < bins; i++) {
    const price = lo + step * (i + 0.5);
    const y = panel.candleSeries.priceToCoordinate(price);
    if (y == null || y < 0 || y > h) continue;
    const bw = (buckets[i] / maxV) * barMax;
    svg += `<rect x="0" y="${y - (h / bins) / 2}" width="${bw}" height="${Math.max(1, h / bins - 1)}" fill="${ind.color}" opacity="0.35"/>`;
  }
  svg += '</svg>';
  layer.innerHTML = svg;
}

// ---------- Symbol overlay / comparison ----------
const OVERLAY_COLORS = ['#ff9800', '#ab47bc', '#26c6da', '#ec407a', '#9ccc65'];

export async function addOverlaySymbol(panel, symbol, name, exchange) {
  if (!panel) return;
  if (symbol === panel.symbol) { toast('That is already the base symbol', 'warn'); return; }
  if (panel.overlays.some(o => o.symbol === symbol)) { toast('Already overlaid', 'warn'); return; }
  const color = OVERLAY_COLORS[panel.overlays.length % OVERLAY_COLORS.length];
  const ov = { symbol, name: name || baseAsset(symbol), exchange: exchange || panel.exchange, color, series: null, data: [], ws: null };
  panel.overlays.push(ov);
  await buildOverlay(panel, ov);
  renderCompareLegend(panel);
  scheduleAutosave();
  toast(`Overlaid ${baseAsset(symbol)}`, 'info');
}

async function buildOverlay(panel, ov) {
  try {
    const data = await getCachedKlines(ov.symbol, panel.tf, 500, ov.exchange || panel.exchange);
    ov.data = data;
    const scaleId = 'ov_' + ov.symbol;
    ov.series = panel.chart.addLineSeries({
      color: ov.color, lineWidth: 2, priceScaleId: scaleId,
      lastValueVisible: true, priceLineVisible: false, title: baseAsset(ov.symbol),
    });
    panel.chart.priceScale(scaleId).applyOptions({ visible: false, scaleMargins: { top: 0.1, bottom: 0.2 } });
    ov.series.setData(data.map(c => ({ time: c.time, value: c.close })));
    ov.ws = openKlineStream(ov.symbol, panel.tf, candle => {
      if (ov.series) ov.series.update({ time: candle.time, value: candle.close });
    }, ov.exchange || panel.exchange);
  } catch (e) { warn('overlay build failed', e.message); }
}

export function removeOverlay(panel, symbol) {
  const ov = panel.overlays.find(o => o.symbol === symbol);
  if (!ov) return;
  try { ov.ws?.close(); } catch {}
  if (ov.series) { try { panel.chart.removeSeries(ov.series); } catch {} }
  panel.overlays = panel.overlays.filter(o => o !== ov);
  renderCompareLegend(panel);
  scheduleAutosave();
}

function rebuildOverlays(panel) {
  const defs = panel.overlays.map(o => ({ symbol: o.symbol, name: o.name, exchange: o.exchange, color: o.color }));
  panel.overlays.forEach(o => { try { o.ws?.close(); } catch {} if (o.series) { try { panel.chart.removeSeries(o.series); } catch {} } });
  panel.overlays = [];
  defs.forEach(d => {
    const ov = { symbol: d.symbol, name: d.name, exchange: d.exchange || panel.exchange, color: d.color, series: null, data: [], ws: null };
    panel.overlays.push(ov);
    buildOverlay(panel, ov);
  });
  renderCompareLegend(panel);
}

function renderCompareLegend(panel) {
  const el = panel.el.querySelector('.compare-legend');
  if (!el) return;
  el.innerHTML = panel.overlays.map(o =>
    `<span class="cmp-chip"><span class="cmp-dot" style="background:${o.color}"></span>${baseAsset(o.symbol)}<button class="cmp-x" data-sym="${o.symbol}" title="Remove overlay">×</button></span>`).join('');
  el.querySelectorAll('.cmp-x').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation(); removeOverlay(panel, b.dataset.sym);
  }));
}

// ---------- Moving-average crossings (golden / death cross) ----------
// When two or more SMA/EMA overlays are on a panel we mark where adjacent
// (by period) averages cross: a faster MA crossing ABOVE a slower one is
// bullish ("golden"), crossing below is bearish ("death").
const MA_CROSS_IDS = ['sma', 'ema'];

export function rebuildCrossMarkers(panel) {
  if (!panel || !panel.candleSeries) return;
  const mas = panel.indicators.filter(i => MA_CROSS_IDS.includes(i.defId));
  if (mas.length < 2 || !panel.data.length) {
    panel._crossMarkers = [];
    applyPanelMarkers(panel);
    return;
  }
  // Build a time->value map for each MA from freshly-computed values.
  const lines = mas.map(i => {
    const res = calcOverlay(i.defId, panel.data, { ...i.params, _color: i.color });
    const map = new Map((res[0]?.vals || []).map(v => [v.time, v.value]));
    return { period: i.params.period ?? 0, label: i.defId.toUpperCase() + (i.params.period ?? ''), map };
  }).sort((a, b) => a.period - b.period);

  const up = state.settings.upColor, down = state.settings.downColor;
  const markers = [];
  for (let k = 0; k < lines.length - 1; k++) {
    const fast = lines[k], slow = lines[k + 1];
    if (fast.period === slow.period && fast.label === slow.label) continue;
    let prevDiff = null;
    for (const c of panel.data) {
      const fv = fast.map.get(c.time), sv = slow.map.get(c.time);
      if (fv == null || sv == null) { prevDiff = null; continue; }
      const diff = fv - sv;
      if (prevDiff != null && ((prevDiff < 0 && diff > 0) || (prevDiff > 0 && diff < 0))) {
        const bull = diff > 0;
        markers.push({
          time: c.time,
          position: bull ? 'belowBar' : 'aboveBar',
          color: bull ? up : down,
          shape: bull ? 'arrowUp' : 'arrowDown',
        });
      }
      if (diff !== 0) prevDiff = diff;
    }
  }
  panel._crossMarkers = markers;
  applyPanelMarkers(panel);
}

// Merge every marker source (MA crossings + market events) into one sorted
// setMarkers() call, since LightweightCharts keeps a single marker list per
// series and each setMarkers replaces the previous list.
export function applyPanelMarkers(panel) {
  if (!panel || !panel.candleSeries) return;
  const all = [...(panel._crossMarkers || []), ...(panel._eventMarkers || []), ...(panel._luxAlgoMarkers || [])];
  all.sort((a, b) => a.time - b.time);
  try { panel.candleSeries.setMarkers(all); } catch {}
}

// ---------- Theme refresh ----------
export function applyThemeToCharts() {
  const wm = isDark() ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
  state.panels.forEach(p => {
    p.chart?.applyOptions(chartTheme());
    p.indicators.forEach(ind => ind.subChart?.applyOptions(chartTheme()));
    p.chart?.applyOptions({ watermark: { color: wm } });
    renderDrawings(p);
    // chartTheme() reset every scale's minimumWidth to the baseline — re-align
    // immediately so panes don't sit misaligned until the next watchdog tick.
    requestAnimationFrame(() => alignPriceScales(p));
  });
}

export function applyCandleColors() {
  state.panels.forEach(p => {
    p.candleSeries?.applyOptions({
      upColor: state.settings.upColor, downColor: state.settings.downColor,
      borderUpColor: state.settings.upColor, borderDownColor: state.settings.downColor,
      wickUpColor: state.settings.upColor, wickDownColor: state.settings.downColor,
    });
  });
}

// autosave hook (set by persistence)
let _autosave = () => {};
export function setAutosaveFn(fn) { _autosave = fn; }
export function scheduleAutosave() { _autosave(); }

// ---------- error overlay ----------
function showPanelError(panel, msg) {
  const e = panel.el.querySelector('.panel-error');
  e.style.display = 'flex';
  e.innerHTML = `<div><p>${msg}</p><button class="retry-btn">Retry</button></div>`;
  e.querySelector('.retry-btn').addEventListener('click', () => loadPanelData(panel));
}
function hidePanelError(panel) {
  const e = panel.el.querySelector('.panel-error');
  e.style.display = 'none'; e.innerHTML = '';
}
