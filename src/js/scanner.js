// ============================================================
// SCANNER — market screener pane
// ============================================================
import { state } from './state.js';
import { fetchAllPairs, getCachedKlines, defaultExchange } from './data.js';
import { baseAsset, fmtPrice, fmtPct, fmtVol, toast } from './utils.js';
import { changeSymbol } from './charts.js';

const SCAN_TYPES = [
  { id: 'gainers', label: 'Top Gainers' },
  { id: 'losers', label: 'Top Losers' },
  { id: 'volume', label: 'Highest Volume' },
  { id: 'rsi_ob', label: 'RSI Overbought' },
  { id: 'rsi_os', label: 'RSI Oversold' },
  { id: 'above_ema', label: 'Above EMA 200' },
  { id: 'below_ema', label: 'Below EMA 200' },
];

export function initScanner() {
  const sel = document.getElementById('scanType');
  if (!sel) return;
  sel.innerHTML = SCAN_TYPES.map(s => `<option value="${s.id}">${s.label}</option>`).join('');
  document.getElementById('scanRun').addEventListener('click', runScan);
}

async function runScan() {
  const type = document.getElementById('scanType').value;
  const scope = document.getElementById('scanScope').value;
  const out = document.getElementById('scanResults');
  out.innerHTML = '<div class="muted">Scanning…</div>';

  // Universe entries carry their exchange so candle scans hit the right venue.
  let universe;
  if (scope === 'watchlist') {
    universe = (state.watchlists[state.currentWatchlist] || []).map(s => ({ sym: s.symbol, ex: s.exchange || defaultExchange() }));
  } else {
    universe = (await fetchAllPairs()).map(p => ({ sym: p.symbol, ex: p.exchange || defaultExchange() })).slice(0, 100);
  }

  try {
    if (['gainers', 'losers', 'volume'].includes(type)) {
      const rows = universe.map(u => ({ sym: u.sym, ex: u.ex, p: state.prices[u.sym] })).filter(r => r.p);
      if (type === 'gainers') rows.sort((a, b) => (b.p.change ?? 0) - (a.p.change ?? 0));
      if (type === 'losers') rows.sort((a, b) => (a.p.change ?? 0) - (b.p.change ?? 0));
      if (type === 'volume') rows.sort((a, b) => (b.p.price * 1) - (a.p.price * 1)); // approx by price; vol unavailable in miniticker map
      renderResults(rows.slice(0, 30).map(r => ({ sym: r.sym, ex: r.ex, val: type === 'volume' ? fmtPrice(r.p.price) : fmtPct(r.p.change), up: (r.p.change ?? 0) >= 0 })));
      return;
    }
    // candle-based scans (limit 30 for perf)
    const subset = universe.slice(0, 30);
    const results = [];
    for (const { sym, ex } of subset) {
      try {
        const d = await getCachedKlines(sym, '1h', 210, ex);
        if (d.length < 50) continue;
        const closes = d.map(c => c.close);
        if (type.startsWith('rsi')) {
          const r = rsi(closes, 14);
          const last = r[r.length - 1];
          if (last == null) continue;
          if (type === 'rsi_ob' && last >= 70) results.push({ sym, ex, val: 'RSI ' + last.toFixed(1), up: false });
          if (type === 'rsi_os' && last <= 30) results.push({ sym, ex, val: 'RSI ' + last.toFixed(1), up: true });
        } else {
          const e = ema(closes, Math.min(200, closes.length - 1));
          const last = e[e.length - 1], price = closes[closes.length - 1];
          if (last == null) continue;
          if (type === 'above_ema' && price > last) results.push({ sym, ex, val: fmtPrice(price), up: true });
          if (type === 'below_ema' && price < last) results.push({ sym, ex, val: fmtPrice(price), up: false });
        }
      } catch {}
    }
    renderResults(results);
  } catch (e) {
    out.innerHTML = '<div class="muted">Scan failed.</div>';
  }
}

function renderResults(rows) {
  const out = document.getElementById('scanResults');
  if (!rows.length) { out.innerHTML = '<div class="muted">No matches.</div>'; return; }
  out.innerHTML = rows.map(r => `
    <div class="scan-row" data-sym="${r.sym}" data-ex="${r.ex || ''}">
      <span>${baseAsset(r.sym)}</span>
      <span class="${r.up ? 'up' : 'down'}">${r.val}</span>
    </div>`).join('');
  out.querySelectorAll('.scan-row').forEach(el => el.addEventListener('click', () => {
    if (state.activePanel) changeSymbol(state.activePanel, el.dataset.sym, baseAsset(el.dataset.sym), el.dataset.ex || undefined);
  }));
}

// local copies of math (avoid coupling)
function ema(src, p) {
  const out = new Array(src.length).fill(null); const k = 2 / (p + 1); let prev = null;
  for (let i = 0; i < src.length; i++) {
    if (prev == null) { if (i >= p - 1) { let s = 0; for (let j = i - p + 1; j <= i; j++) s += src[j]; prev = s / p; out[i] = prev; } }
    else { prev = src[i] * k + prev * (1 - k); out[i] = prev; }
  }
  return out;
}
function rsi(src, p) {
  const g = new Array(src.length).fill(0), l = new Array(src.length).fill(0);
  for (let i = 1; i < src.length; i++) { const c = src[i] - src[i - 1]; g[i] = c > 0 ? c : 0; l[i] = c < 0 ? -c : 0; }
  const rma = (a) => { const o = new Array(a.length).fill(null); let prev = null, sum = 0, cnt = 0; for (let i = 0; i < a.length; i++) { if (prev == null) { sum += a[i]; cnt++; if (cnt === p) { prev = sum / p; o[i] = prev; } } else { prev = (prev * (p - 1) + a[i]) / p; o[i] = prev; } } return o; };
  const ag = rma(g), al = rma(l);
  return ag.map((x, i) => x == null ? null : (al[i] === 0 ? 100 : 100 - 100 / (1 + x / al[i])));
}
