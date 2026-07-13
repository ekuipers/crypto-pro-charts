// ============================================================
// UTILS — formatting + fetch helpers
// ============================================================

const LOG = '[CryptoPro]';
export function log(...a) { console.log(LOG, ...a); }
export function warn(...a) { console.warn(LOG, ...a); }
export function err(...a) { console.error(LOG, ...a); }

// fetch with timeout (default 15s)
export async function fetchJSON(url, opts = {}, timeout = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// Key for state.prices — the same symbol can trade at different prices on
// different exchanges (a chart pinned to a non-Binance venue vs. a plain
// Binance-quoted watchlist row), so they must not share one cache slot.
// Binance keeps the plain symbol (the overwhelmingly common case, and what
// the Binance mini-ticker stream has always used) so existing entries don't
// need migrating; every other exchange gets its own namespaced key.
export function priceKey(symbol, exchange) {
  return exchange && exchange !== 'binance' ? `${symbol}@${exchange}` : symbol;
}

// Format a price intelligently based on magnitude
export function fmtPrice(p) {
  if (p == null || isNaN(p)) return '--';
  const a = Math.abs(p);
  // Fixed 2 decimals (not just max 2) so live readouts keep a constant width
  // across ticks — variable-length strings made the panel bar reflow (Bug 1).
  if (a >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (a >= 1)    return p.toFixed(2);
  if (a >= 0.01) return p.toFixed(4);
  if (a >= 0.0001) return p.toFixed(6);
  return p.toFixed(8);
}

// Format large volume numbers with K/M/B suffixes
export function fmtVol(v) {
  if (v == null || isNaN(v)) return '--';
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return (v / 1e3).toFixed(2) + 'K';
  return v.toFixed(2);
}

export function fmtPct(p) {
  if (p == null || isNaN(p)) return '--';
  return (p >= 0 ? '+' : '') + p.toFixed(2) + '%';
}

// Base asset from a symbol, e.g. BTCUSDT -> BTC, BTCUSDC -> BTC, BTCEUR -> BTC
export function baseAsset(symbol) {
  return String(symbol).replace(/(USDT|USDC|BUSD|EUR|USD|BTC|ETH|BNB|DAI)$/, '');
}

// Quote asset from a symbol, e.g. BTCUSDT -> USDT, BTCEUR -> EUR, BTCUSD -> USD
export function quoteAsset(symbol) {
  const m = String(symbol).match(/(USDT|USDC|BUSD|EUR|USD|BTC|ETH|BNB|DAI)$/);
  return m ? m[1] : 'USDT';
}

// debounce
export function debounce(fn, ms) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

// Unique id helper
let _idc = 0;
export function uid(prefix = 'id') { return `${prefix}_${Date.now()}_${_idc++}`; }

// Clamp
export function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }

// Escape HTML
export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Paint a minimal line sparkline of `values` into `canvas`, colored by
// direction (green if the series rose overall, red if it fell). Used by
// the watchlist row sparklines (P2-16).
export function paintSparkline(canvas, values, up) {
  if (!canvas || !values || values.length < 2) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const lo = Math.min(...values), hi = Math.max(...values);
  const range = (hi - lo) || 1;
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = (i / (values.length - 1)) * (w - 2) + 1;
    const y = h - 1 - ((v - lo) / range) * (h - 2);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = up ? '#26a69a' : '#ef5350';
  ctx.lineWidth = 1.3;
  ctx.stroke();
}

// Toast notifications
let toastContainer = null;
export function toast(msg, type = 'info', ms = 3500) {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toastContainer';
    document.body.appendChild(toastContainer);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  toastContainer.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, ms);
}
