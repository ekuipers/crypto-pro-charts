// ============================================================
// CHARTS — panel + chart lifecycle, layouts, indicators glue
// ============================================================
import { state, drawingState } from './state.js';
import { LAYOUT_COUNTS, COLORS } from './constants.js';
import { getCachedKlines, fetchKlines, openKlineStream } from './data.js';
import { indDef, calcOverlay, calcOscillator } from './indicators.js';
import { baseAsset, fmtPrice, uid, log, warn, toast } from './utils.js';
import { initDrawingsForPanel, renderDrawings } from './drawings.js';

const LWC = () => window.LightweightCharts;

export function chartTheme() {
  const dark = state.theme === 'dark';
  return {
    layout: {
      background: { type: 'solid', color: dark ? '#131722' : '#ffffff' },
      textColor: dark ? '#d1d4dc' : '#131722',
    },
    grid: {
      vertLines: { color: dark ? '#1e222d' : '#e0e3eb' },
      horzLines: { color: dark ? '#1e222d' : '#e0e3eb' },
    },
    rightPriceScale: { borderColor: dark ? '#2a2e39' : '#d6dcde' },
    timeScale: { borderColor: dark ? '#2a2e39' : '#d6dcde', timeVisible: true, secondsVisible: false },
    crosshair: { mode: LWC().CrosshairMode.Normal },
  };
}

// ---------- Layout management ----------
export function setLayout(mode) {
  state.layout = mode;
  const grid = document.getElementById('chartsArea');
  grid.className = 'charts-area layout-' + mode;
  const want = LAYOUT_COUNTS[mode];
  // Add or remove panels to match
  while (state.panels.length < want) addPanel();
  while (state.panels.length > want) destroyPanel(state.panels[state.panels.length - 1]);
  resizeAllCharts();
}

export function addPanel(opts = {}) {
  const grid = document.getElementById('chartsArea');
  const id = uid('panel');
  const el = document.createElement('div');
  el.className = 'chart-panel';
  el.dataset.id = id;
  el.innerHTML = `
    <div class="panel-bar">
      <button class="sym-btn">${opts.symbol ? baseAsset(opts.symbol) : 'BTC'}<span class="sym-quote">USDT</span></button>
      <div class="tf-group">
        ${['1m','5m','15m','30m','1h','4h','1d','1w'].map(t => `<button class="tf-btn${(opts.tf||'1h')===t?' active':''}" data-tf="${t}">${t}</button>`).join('')}
      </div>
      <div class="ohlc-info"></div>
      <div class="panel-actions">
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
    </div>`;
  grid.appendChild(el);

  const panel = {
    id, el,
    symbol: opts.symbol || 'BTCUSDT',
    symbolName: opts.symbolName || 'Bitcoin',
    tf: opts.tf || '1h',
    data: [],
    chart: null, candleSeries: null, volumeSeries: null,
    heikinSeries: null,
    indicators: [],          // {uid, defId, params, color, series[], subChart, subSeries[], hist}
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
  el.querySelector('.fs-btn').addEventListener('click', () => el.classList.toggle('panel-fullscreen'));
  el.querySelector('.close-btn').addEventListener('click', () => {
    if (state.panels.length <= 1) { toast('At least one chart is required', 'warn'); return; }
    destroyPanel(panel);
    resizeAllCharts();
  });
  el.addEventListener('mousedown', () => setActivePanel(panel));

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

    // re-render drawings / vol profile on scroll-zoom
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      renderDrawings(panel);
      renderVolProfile(panel);
    });

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
    const data = await getCachedKlines(panel.symbol, panel.tf, 500);
    panel.data = data;
    panel.candleSeries.setData(data);
    panel.volumeSeries.setData(data.map(c => ({
      time: c.time, value: c.volume,
      color: c.close >= c.open ? state.settings.upColor + '80' : state.settings.downColor + '80',
    })));
    panel.chart.applyOptions({ watermark: {
      visible: true, text: baseAsset(panel.symbol), fontSize: 48,
      color: state.theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
      horzAlign: 'center', vertAlign: 'center',
    }});
    recomputeIndicators(panel);
    renderDrawings(panel);
    startKlineStream(panel);
    return data;
  } catch (e) {
    warn('loadPanelData error', e);
    showPanelError(panel, 'Failed to load chart data.');
    return [];
  }
}

function startKlineStream(panel) {
  if (panel.klineWS) { try { panel.klineWS.close(); } catch {} panel.klineWS = null; }
  panel.klineWS = openKlineStream(panel.symbol, panel.tf, candle => {
    const d = panel.data;
    if (!d.length) return;
    const last = d[d.length - 1];
    if (candle.time === last.time) {
      Object.assign(last, candle);
    } else if (candle.time > last.time) {
      d.push(candle);
      if (d.length > 1500) d.shift();
    } else return;
    panel.candleSeries.update(candle);
    panel.volumeSeries.update({ time: candle.time, value: candle.volume,
      color: candle.close >= candle.open ? state.settings.upColor + '80' : state.settings.downColor + '80' });
    document.dispatchEvent(new CustomEvent('panel-live', { detail: { panel, price: candle.close } }));
  });
}

export function changeTimeframe(panel, tf) {
  panel.tf = tf;
  loadPanelData(panel);
  scheduleAutosave();
}

export async function changeSymbol(panel, symbol, name) {
  panel.symbol = symbol;
  panel.symbolName = name || baseAsset(symbol);
  panel.el.querySelector('.sym-btn').innerHTML = `${baseAsset(symbol)}<span class="sym-quote">USDT</span>`;
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

export function destroyPanel(panel) {
  try { panel._ro?.disconnect(); } catch {}
  try { panel.klineWS?.close(); } catch {}
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
  panel.indicators = panel.indicators.filter(i => i !== ind);
  layoutOscillators(panel);
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
  panel.indicators.forEach(ind => buildIndicator(panel, ind));
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
  });
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
  resizeAllCharts();
}

// ---------- Volume Profile (SVG overlay) ----------
export function renderVolProfile(panel) {
  const ind = panel.indicators.find(i => i.defId === 'volprofile');
  const layer = panel.el.querySelector('.vol-profile-layer');
  if (!ind || !panel.data.length || !panel.chart) { layer.innerHTML = ''; return; }
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
  const h = layer.clientHeight, w = layer.clientWidth;
  const barMax = w * 0.18;
  let svg = `<svg width="${w}" height="${h}" style="position:absolute;left:0;top:0;pointer-events:none">`;
  for (let i = 0; i < bins; i++) {
    const price = lo + step * (i + 0.5);
    const y = panel.candleSeries.priceToCoordinate(price);
    if (y == null) continue;
    const bw = (buckets[i] / maxV) * barMax;
    svg += `<rect x="0" y="${y - (h / bins) / 2}" width="${bw}" height="${Math.max(1, h / bins - 1)}" fill="${ind.color}" opacity="0.35"/>`;
  }
  svg += '</svg>';
  layer.innerHTML = svg;
}

// ---------- Theme refresh ----------
export function applyThemeToCharts() {
  state.panels.forEach(p => {
    p.chart?.applyOptions(chartTheme());
    p.indicators.forEach(ind => ind.subChart?.applyOptions(chartTheme()));
    p.chart?.applyOptions({ watermark: { color: state.theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' } });
    renderDrawings(p);
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
