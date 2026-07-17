// ============================================================
// ORDER BOOK + TECH INFO panes
// ============================================================
import { state } from './state.js';
import { fetchOrderBook, openOrderBookStream, closeOrderBookStream, openTradeStream, fetchPrice, getCachedKlines } from './data.js';
import { fmtPrice, fmtVol, fmtPct, priceKey } from './utils.js';

let pollTimer = null;
let tradeWS = null;
let trades = []; // recent trade tape (P2-14), newest first, capped

export function refreshOrderBook() {
  const panel = state.activePanel;
  if (!panel) return;
  if (state.rightTab !== 'orderbook') { teardownOrderBook(); return; }
  const symbol = panel.symbol;
  const exId = panel.exchange;
  closeOrderBookStream();
  if (pollTimer) clearInterval(pollTimer);

  // Discard a response that lands after the panel's symbol/exchange has
  // already moved on (rapid panel/symbol switching can reorder these REST
  // calls) — otherwise a slow, stale response can overwrite fresher data.
  const stillCurrent = () => panel.symbol === symbol && panel.exchange === exId;
  const applyBook = ob => { if (stillCurrent()) { state.obData = ob; renderActiveSubtab(); } };
  fetchOrderBook(symbol, 20, exId).then(applyBook).catch(() => {});
  const ws = openOrderBookStream(symbol, applyBook, exId);
  if (!ws) {
    pollTimer = setInterval(() => fetchOrderBook(symbol, 20, exId).then(applyBook).catch(() => {}), 5000);
  }
  setupTradeStream(panel);
  renderActiveSubtab();
}

function teardownOrderBook() {
  closeOrderBookStream();
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (tradeWS) { try { tradeWS.close(); } catch {} tradeWS = null; }
}

function setupTradeStream(panel) {
  if (tradeWS) { try { tradeWS.close(); } catch {} tradeWS = null; }
  trades = [];
  tradeWS = openTradeStream(panel.symbol, t => {
    trades.unshift(t);
    if (trades.length > 60) trades.length = 60;
    if (state.obSubTab === 'trades') renderTrades();
  }, panel.exchange);
}

function renderActiveSubtab() {
  if (state.rightTab !== 'orderbook') return;
  if (state.obSubTab === 'trades') renderTrades();
  else if (state.obSubTab === 'depth') renderDepth();
  else renderOrderBook();
}

// P2-14: Book / Trades / Depth sub-tabs within the right-panel "Book" tab.
export function initOrderBookSubtabs() {
  document.querySelectorAll('.ob-subtab').forEach(b => b.addEventListener('click', () => {
    state.obSubTab = b.dataset.sub;
    document.querySelectorAll('.ob-subtab').forEach(x => x.classList.toggle('active', x === b));
    renderActiveSubtab();
  }));
}

const SPREAD_LEVELS = ['auto', 0.0001, 0.001, 0.01, 0.1, 0.5, 1, 5, 10, 50, 100];

// Aggregate raw levels into buckets of `inc`. Bids floor, asks ceil.
function groupLevels(levels, inc, side) {
  if (!inc || inc <= 0) return levels;
  const map = new Map();
  levels.forEach(o => {
    const bucket = side === 'bid'
      ? Math.floor(o.price / inc) * inc
      : Math.ceil(o.price / inc) * inc;
    const key = bucket.toFixed(8);
    map.set(key, (map.get(key) || 0) + o.qty);
  });
  const out = [...map.entries()].map(([p, qty]) => ({ price: +p, qty }));
  out.sort((a, b) => side === 'bid' ? b.price - a.price : a.price - b.price);
  return out;
}

function renderOrderBook() {
  const el = document.getElementById('obContent');
  if (!el) return;
  let { bids, asks } = state.obData;
  if (!bids?.length && !asks?.length) {
    el.innerHTML = `${spreadSelectorHtml()}<div class="muted">No order book data</div>`;
    wireSpreadSelector();
    return;
  }
  const inc = state.obGrouping === 'auto' ? 0 : +state.obGrouping;
  if (inc) { bids = groupLevels(bids, inc, 'bid'); asks = groupLevels(asks, inc, 'ask'); }

  const maxQty = Math.max(...bids.map(b => b.qty), ...asks.map(a => a.qty), 1);
  const askRows = asks.slice(0, 15).reverse().map(a => row(a, maxQty, 'ask')).join('');
  const bidRows = bids.slice(0, 15).map(b => row(b, maxQty, 'bid')).join('');
  const spread = asks[0] && bids[0] ? asks[0].price - bids[0].price : 0;
  const spreadPct = bids[0] ? (spread / bids[0].price) * 100 : 0;
  el.innerHTML = `
    ${spreadSelectorHtml()}
    <div class="ob-table">${askRows}</div>
    <div class="ob-spread">Spread ${fmtPrice(spread)} (${spreadPct.toFixed(3)}%)</div>
    <div class="ob-table">${bidRows}</div>`;
  wireSpreadSelector();
}

function spreadSelectorHtml() {
  const opts = SPREAD_LEVELS.map(l =>
    `<option value="${l}" ${String(l) === String(state.obGrouping) ? 'selected' : ''}>${l === 'auto' ? 'Auto' : l}</option>`).join('');
  return `<div class="ob-controls"><label>Spread</label><select id="obGroup">${opts}</select></div>`;
}

function wireSpreadSelector() {
  const sel = document.getElementById('obGroup');
  if (!sel) return;
  sel.addEventListener('change', () => { state.obGrouping = sel.value; renderOrderBook(); });
}
function row(o, maxQty, side) {
  const pct = (o.qty / maxQty) * 100;
  const c = side === 'bid' ? 'var(--green)' : 'var(--red)';
  return `<div class="ob-row ${side}">
    <span class="ob-bar" style="width:${pct}%;background:${c}1f"></span>
    <span class="ob-price ${side}">${fmtPrice(o.price)}</span>
    <span class="ob-qty">${fmtVol(o.qty)}</span></div>`;
}

// ---- Time & sales (P2-14) ----
// fmtVol's fixed 2-decimal floor reads as "0.00" for typical BTC-sized trade
// quantities (e.g. 0.0003 BTC) — use magnitude-aware precision here instead.
function fmtQty(v) {
  if (v == null || isNaN(v)) return '--';
  const a = Math.abs(v);
  if (a >= 1000) return fmtVol(v);
  if (a >= 1) return v.toFixed(3);
  if (a >= 0.001) return v.toFixed(5);
  return v.toFixed(8);
}

function renderTrades() {
  const el = document.getElementById('obContent');
  if (!el) return;
  if (!trades.length) { el.innerHTML = '<div class="muted">Waiting for trades…</div>'; return; }
  const rows = trades.map(t => `
    <div class="tape-row ${t.side}">
      <span class="tape-time">${new Date(t.time).toLocaleTimeString([], { hour12: false })}</span>
      <span class="tape-price">${fmtPrice(t.price)}</span>
      <span class="tape-qty">${fmtQty(t.qty)}</span>
    </div>`).join('');
  el.innerHTML = `<div class="tape-head"><span>Time</span><span>Price</span><span>Qty</span></div><div class="tape-list">${rows}</div>`;
}

// ---- Depth chart (P2-14): cumulative bid/ask visualization ----
function renderDepth() {
  const el = document.getElementById('obContent');
  if (!el) return;
  const { bids = [], asks = [] } = state.obData || {};
  if (!bids.length || !asks.length) { el.innerHTML = '<div class="muted">No order book data</div>'; return; }
  const sBids = [...bids].sort((a, b) => b.price - a.price);
  const sAsks = [...asks].sort((a, b) => a.price - b.price);
  let cum = 0;
  const bidPts = sBids.map(b => ({ price: b.price, cum: (cum += b.qty) }));
  cum = 0;
  const askPts = sAsks.map(a => ({ price: a.price, cum: (cum += a.qty) }));
  const maxCum = Math.max(bidPts[bidPts.length - 1]?.cum || 0, askPts[askPts.length - 1]?.cum || 0, 1e-9);
  const loP = bidPts[bidPts.length - 1]?.price ?? sBids[0].price;
  const hiP = askPts[askPts.length - 1]?.price ?? sAsks[0].price;
  const W = 300, H = 170, PAD = 4;
  const xOf = p => PAD + ((p - loP) / ((hiP - loP) || 1)) * (W - PAD * 2);
  const yOf = c => H - PAD - (c / maxCum) * (H - PAD * 2 - 14);

  const bidPath = `M${xOf(bidPts[bidPts.length - 1].price).toFixed(1)},${(H - PAD).toFixed(1)} ` +
    bidPts.slice().reverse().map(p => `L${xOf(p.price).toFixed(1)},${yOf(p.cum).toFixed(1)}`).join(' ') +
    ` L${xOf(sBids[0].price).toFixed(1)},${(H - PAD).toFixed(1)} Z`;
  const askPath = `M${xOf(sAsks[0].price).toFixed(1)},${(H - PAD).toFixed(1)} ` +
    askPts.map(p => `L${xOf(p.price).toFixed(1)},${yOf(p.cum).toFixed(1)}`).join(' ') +
    ` L${xOf(askPts[askPts.length - 1].price).toFixed(1)},${(H - PAD).toFixed(1)} Z`;

  el.innerHTML = `
    <div class="depth-chart">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px">
        <path d="${bidPath}" fill="rgba(38,166,154,0.25)" stroke="#26a69a" stroke-width="1.2"/>
        <path d="${askPath}" fill="rgba(239,83,80,0.25)" stroke="#ef5350" stroke-width="1.2"/>
      </svg>
      <div class="depth-labels"><span class="up">${fmtPrice(loP)}</span><span>Mid ${fmtPrice((loP + hiP) / 2)}</span><span class="down">${fmtPrice(hiP)}</span></div>
    </div>`;
}

// ---- Tech info (enhanced) ----

function calcRSI14(closes) {
  if (!closes || closes.length < 16) return null;
  const arr = closes.slice(-30);
  let ag = 0, al = 0;
  for (let i = 1; i <= 14; i++) {
    const d = arr[i] - arr[i - 1];
    if (d > 0) ag += d; else al -= d;
  }
  ag /= 14; al /= 14;
  for (let i = 15; i < arr.length; i++) {
    const d = arr[i] - arr[i - 1];
    ag = (ag * 13 + Math.max(0, d)) / 14;
    al = (al * 13 + Math.max(0, -d)) / 14;
  }
  return al ? 100 - 100 / (1 + ag / al) : 100;
}

function perfPill(pct) {
  const up = pct >= 0;
  return `<span class="ti-perf-pill ${up ? 'up' : 'down'}">${up ? '+' : ''}${pct.toFixed(2)}%</span>`;
}

function rangeGaugeSvg(value, lo, hi, label) {
  const pct = hi > lo ? Math.max(0, Math.min(100, ((value - lo) / (hi - lo)) * 100)) : 50;
  const color = pct < 33 ? 'var(--red)' : pct > 67 ? 'var(--green)' : '#f59e0b';
  return `
    <div class="ti-section-label">${label}</div>
    <div class="ti-range-wrap">
      <span class="ti-range-lo">${fmtPrice(lo)}</span>
      <div class="ti-range-track">
        <div class="ti-range-fill" style="width:${pct.toFixed(1)}%;background:${color}"></div>
        <div class="ti-range-thumb" style="left:${pct.toFixed(1)}%;background:${color}"></div>
      </div>
      <span class="ti-range-hi">${fmtPrice(hi)}</span>
    </div>`;
}

function rsiSpeedometerSvg(rsi) {
  const cx = 100, cy = 100, R = 74, bandW = 14;
  const color = rsi < 30 ? '#26a69a' : rsi > 70 ? '#ef5350' : '#f59e0b';
  const label = rsi < 30 ? 'Strong Buy' : rsi < 45 ? 'Buy' : rsi > 70 ? 'Strong Sell' : rsi > 55 ? 'Sell' : 'Neutral';
  const track = `M ${cx - R} ${cy} A ${R} ${R} 0 0 0 ${cx + R} ${cy}`;

  // Radial angle for a given 0-100 value, matching the needle convention below:
  // 0 -> pointing left (buy side), 100 -> pointing right (sell side).
  const angleRad = (v) => (Math.PI / 180) * (180 - v * 1.8);
  const ticks = [0, 25, 50, 75, 100].map((v) => {
    const rad = angleRad(v);
    const r1 = R + bandW / 2 + 2, r2 = R + bandW / 2 + 8;
    const x1 = cx + r1 * Math.cos(rad), y1 = cy - r1 * Math.sin(rad);
    const x2 = cx + r2 * Math.cos(rad), y2 = cy - r2 * Math.sin(rad);
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="var(--muted)" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>`;
  }).join('');

  const needleLen = 60;
  const rot = (rsi * 1.8 - 180).toFixed(2); // SVG rotate() degrees for a needle drawn pointing right

  return `
    <div class="ti-section-label">Buy / Sell Pressure (RSI 14)</div>
    <div class="ti-speedometer">
      <div class="ti-speedometer-row">
        <span class="ti-speedometer-side ti-speedometer-buy">BUY</span>
        <svg viewBox="0 0 200 120" style="width:100%;max-width:220px;display:block;margin:0 auto">
          <defs>
            <linearGradient id="tiGaugeGrad" x1="${cx - R}" y1="${cy}" x2="${cx + R}" y2="${cy}" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#26a69a"/>
              <stop offset="50%" stop-color="#f59e0b"/>
              <stop offset="100%" stop-color="#ef5350"/>
            </linearGradient>
            <filter id="tiGaugeShadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="1" stdDeviation="1.4" flood-opacity="0.35"/>
            </filter>
          </defs>
          <path d="${track}" fill="none" stroke="var(--panel2)" stroke-width="${bandW + 6}" stroke-linecap="round"/>
          <path d="${track}" fill="none" stroke="url(#tiGaugeGrad)" stroke-width="${bandW}" stroke-linecap="round"/>
          ${ticks}
          <g transform="rotate(${rot} ${cx} ${cy})" filter="url(#tiGaugeShadow)">
            <polygon points="${cx - 16},${cy - 4} ${cx + needleLen},${cy} ${cx - 16},${cy + 4}" fill="${color}"/>
          </g>
          <circle cx="${cx}" cy="${cy}" r="9" fill="var(--panel)" stroke="${color}" stroke-width="3"/>
          <circle cx="${cx}" cy="${cy}" r="3" fill="${color}"/>
        </svg>
        <span class="ti-speedometer-side ti-speedometer-sell">SELL</span>
      </div>
      <div class="ti-speedometer-label" style="color:${color}">${label}</div>
      <div class="ti-speedometer-rsi">RSI ${rsi.toFixed(0)}</div>
    </div>`;
}

function seasonalsChartSvg(bars) {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const buckets = Array.from({ length: 12 }, () => []);
  for (let i = 1; i < bars.length; i++) {
    const m = new Date(bars[i].time * 1000).getUTCMonth();
    const ret = (bars[i].close - bars[i - 1].close) / bars[i - 1].close * 100;
    buckets[m].push(ret);
  }
  const avgs = buckets.map(b => b.length ? b.reduce((a, v) => a + v, 0) / b.length : 0);
  const maxAbs = Math.max(...avgs.map(Math.abs), 0.01);

  const W = 290, H = 80, barW = 20, gap = 4, ox = 6;
  const midY = H / 2;
  const scale = (midY - 6) / maxAbs;

  const rects = avgs.map((v, i) => {
    const x = ox + i * (barW + gap);
    const h = Math.abs(v) * scale;
    const y = v >= 0 ? midY - h : midY;
    const fill = v >= 0 ? '#26a69a' : '#ef5350';
    return `<rect x="${x}" y="${y.toFixed(1)}" width="${barW}" height="${Math.max(1, h.toFixed(1))}" fill="${fill}" rx="2"/>
      <text x="${x + barW / 2}" y="${H - 1}" text-anchor="middle" font-size="8" fill="var(--muted)" font-family="sans-serif">${MONTHS[i].slice(0,1)}</text>`;
  }).join('');

  return `
    <div class="ti-section-label">Seasonals (avg monthly return)</div>
    <div class="ti-seasonals">
      <svg viewBox="0 0 ${W} ${H}" style="width:100%">
        <line x1="0" y1="${midY}" x2="${W}" y2="${midY}" stroke="var(--border)" stroke-width="1"/>
        ${rects}
      </svg>
    </div>`;
}

export async function refreshTechInfo() {
  const panel = state.activePanel;
  const el = document.getElementById('techContent');
  if (!panel || !el) return;
  if (state.rightTab !== 'techinfo') return;
  const symbol = panel.symbol, exchange = panel.exchange;
  el.innerHTML = '<div class="muted">Loading…</div>';
  try {
    const [p, bars] = await Promise.all([
      fetchPrice(symbol, exchange),
      getCachedKlines(symbol, '1d', 400, exchange).catch(() => []),
    ]);
    // The user may have switched panels/symbols while these requests were in
    // flight — a slower, now-stale response landing after a newer one would
    // otherwise overwrite the pane with the wrong symbol's data.
    if (state.activePanel !== panel || panel.symbol !== symbol || panel.exchange !== exchange || state.rightTab !== 'techinfo') return;
    const up = p.change >= 0;
    const closes = bars.map(b => b.close);
    const last = closes[closes.length - 1] || p.price;

    // Performance metrics
    const perf7d  = bars.length >= 8  ? (last / closes[closes.length - 8]  - 1) * 100 : null;
    const perf30d = bars.length >= 31  ? (last / closes[closes.length - 32]  - 1) * 100 : null;
    const perf1y  = bars.length >= 252 ? (last / closes[closes.length - 253] - 1) * 100 : null;

    // 52-week range
    const yr = bars.slice(-365);
    const w52hi = yr.length ? Math.max(...yr.map(b => b.high)) : p.high;
    const w52lo = yr.length ? Math.min(...yr.map(b => b.low))  : p.low;

    // RSI
    const rsi = calcRSI14(closes);

    el.innerHTML = `
      <div class="ti-header">
        <div>
          <div class="ti-price ${up ? 'up' : 'down'}" id="tiPrice">${fmtPrice(p.price)}</div>
          <div class="ti-chg ${up ? 'up' : 'down'}" id="tiChg">${fmtPct(p.change)} 24h</div>
        </div>
        <div class="ti-perfs">
          <div class="ti-perf-row"><span>7D</span>${perf7d != null ? perfPill(perf7d) : '<span class="muted">–</span>'}</div>
          <div class="ti-perf-row"><span>1M</span>${perf30d != null ? perfPill(perf30d) : '<span class="muted">–</span>'}</div>
          <div class="ti-perf-row"><span>1Y</span>${perf1y != null ? perfPill(perf1y) : '<span class="muted">–</span>'}</div>
        </div>
      </div>
      <div class="ti-grid">
        <div><span>Open</span><b>${fmtPrice(p.open)}</b></div>
        <div><span>High</span><b>${fmtPrice(p.high)}</b></div>
        <div><span>Low</span><b>${fmtPrice(p.low)}</b></div>
        <div><span>24h Vol</span><b>${fmtVol(p.volume)}</b></div>
      </div>
      <div class="ti-divider"></div>
      ${rangeGaugeSvg(p.price, p.low, p.high, "Day's Range")}
      <div class="ti-spacer"></div>
      ${rangeGaugeSvg(p.price, w52lo, w52hi, '52-Week Range')}
      <div class="ti-divider"></div>
      ${rsi != null ? rsiSpeedometerSvg(rsi) : ''}
      <div class="ti-divider"></div>
      ${bars.length >= 24 ? seasonalsChartSvg(bars) : ''}
      <div class="ti-footer">
        <button id="tiAlertBtn" class="primary-btn ti-alert-btn">🔔 Set Price Alert</button>
      </div>`;

    el.querySelector('#tiAlertBtn')?.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('open-alert-modal', { detail: { symbol: panel.symbol, price: p.price } }));
    });
  } catch {
    el.innerHTML = '<div class="muted">Failed to load</div>';
  }
}

// Roadmap: keep the Info pane's price/24h-change in sync with the live price
// stream, the same way watchlist rows do — cheap DOM patch straight from
// state.prices (already updated by the mini-ticker WS in main.js) rather than
// re-fetching/re-rendering the whole pane (which also carries RSI/seasonals
// that don't need to move every tick). Called on the same ~1.5s cadence as
// updatePriceRows(); no-ops until refreshTechInfo() has rendered the pane once.
//
// Bug (2026-07-16): the WS-only version of this looked right on paper but
// never actually moved for a real chunk of panels — `openPriceStream`'s
// `!miniTicker@arr` subscription is Binance-only and only forwards symbols
// quoted in USDT/USDC/EUR/USD (see SUPPORTED_QUOTES in data.js). Any panel on
// a different exchange (Bybit/OKX/Gate/KuCoin/Bitstamp/Bitvavo/etc.), or a
// Binance pair quoted in something else (e.g. ETHBTC), never gets a single
// write to state.prices after the one-time fetch inside refreshTechInfo() —
// so the pane silently froze at whatever price that first fetch returned,
// which reads exactly like "still not updating". Fixed by falling back to a
// throttled direct REST price fetch (same fetchPrice() refreshTechInfo already
// uses) whenever the live cache doesn't cover this panel, so every exchange/
// quote combination keeps ticking.
let _tiRestLast = 0;
let _tiRestInFlight = false;
export function updateTechInfoPrice() {
  const panel = state.activePanel;
  if (!panel || state.rightTab !== 'techinfo') return;
  const priceEl = document.getElementById('tiPrice');
  const chgEl = document.getElementById('tiChg');
  if (!priceEl || !chgEl) return;

  const exchange = panel.exchange || 'binance';
  const cached = state.prices[priceKey(panel.symbol, exchange)];
  if (cached && cached.price != null) paintTiPrice(priceEl, chgEl, cached.price, cached.change);

  // Binance-quoted-in-a-supported-currency panels are already kept fresh by
  // the cache above (written every ~second by the mini-ticker WS) — only fall
  // through to REST for the cases that stream can't reach, throttled to avoid
  // hammering the API on every 1.5s tick.
  const wsCovers = exchange === 'binance' && cached && cached.price != null;
  if (wsCovers || _tiRestInFlight) return;
  const now = Date.now();
  if (now - _tiRestLast < 4000) return;
  _tiRestLast = now;
  _tiRestInFlight = true;
  const symbol = panel.symbol;
  fetchPrice(symbol, exchange).then(p => {
    _tiRestInFlight = false;
    if (state.activePanel !== panel || panel.symbol !== symbol || (panel.exchange || 'binance') !== exchange || state.rightTab !== 'techinfo') return;
    state.prices[priceKey(symbol, exchange)] = { ...(state.prices[priceKey(symbol, exchange)] || {}), price: p.price, change: p.change, open: p.open };
    const pEl = document.getElementById('tiPrice'), cEl = document.getElementById('tiChg');
    if (pEl && cEl) paintTiPrice(pEl, cEl, p.price, p.change);
  }).catch(() => { _tiRestInFlight = false; });
}

function paintTiPrice(priceEl, chgEl, price, change) {
  const up = (change ?? 0) >= 0;
  priceEl.textContent = fmtPrice(price);
  priceEl.classList.toggle('up', up);
  priceEl.classList.toggle('down', !up);
  chgEl.textContent = `${fmtPct(change)} 24h`;
  chgEl.classList.toggle('up', up);
  chgEl.classList.toggle('down', !up);
}
