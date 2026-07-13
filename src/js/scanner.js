// ============================================================
// SCANNER — market screener pane
// ============================================================
import { state } from './state.js';
import { fetchAllPairs, getCachedKlines, defaultExchange } from './data.js';
import { baseAsset, fmtPrice, fmtPct, fmtVol, toast, priceKey } from './utils.js';
import { changeSymbol } from './charts.js';

const SCAN_TYPES = [
  { id: 'gainers', label: 'Top Gainers' },
  { id: 'losers', label: 'Top Losers' },
  { id: 'volume', label: 'Highest Volume' },
  { id: 'rsi_ob', label: 'RSI Overbought' },
  { id: 'rsi_os', label: 'RSI Oversold' },
  { id: 'above_ema', label: 'Above EMA 200' },
  { id: 'below_ema', label: 'Below EMA 200' },
  { id: 'volspike', label: 'Volume Spike (≥2×)' },
];
// Types that iterate klines per symbol (server round-trips) — capped for perf,
// unlike the ticker-based scans which read already-cached prices.
const CANDLE_SCAN_TYPES = new Set(['rsi_ob', 'rsi_os', 'above_ema', 'below_ema', 'volspike']);
const CANDLE_SCAN_LIMIT = 40;
const AUTO_REFRESH_MS = 20000;

let autoTimer = null;
let lastHits = new Set(); // sym:ex keys from the previous auto-refresh run, to detect new hits

export function initScanner() {
  const sel = document.getElementById('scanType');
  if (!sel) return;
  sel.innerHTML = SCAN_TYPES.map(s => `<option value="${s.id}">${s.label}</option>`).join('');
  document.getElementById('scanRun').addEventListener('click', () => runScan());
  document.getElementById('scanAuto').addEventListener('change', e => setAutoRefresh(e.target.checked));
  document.getElementById('scanSaveBtn').addEventListener('click', saveCurrentScan);
  document.getElementById('scanSaved').addEventListener('change', loadSelectedScan);
  refreshSavedScansList();
}

// Builds the symbol universe for a scan scope. Each entry carries its exchange
// so candle-based scans hit the right venue. 'all' now covers every enabled-
// exchange pair (P2-13), not just the first 100.
async function buildUniverse(scope) {
  if (scope === 'watchlist') {
    return (state.watchlists[state.currentWatchlist] || []).map(s => ({ sym: s.symbol, ex: s.exchange || defaultExchange() }));
  }
  return (await fetchAllPairs()).map(p => ({ sym: p.symbol, ex: p.exchange || defaultExchange() }));
}

async function runScan(silent = false) {
  const type = document.getElementById('scanType').value;
  const scope = document.getElementById('scanScope').value;
  const out = document.getElementById('scanResults');
  if (!silent) out.innerHTML = '<div class="muted">Scanning…</div>';

  const universe = await buildUniverse(scope);

  try {
    let rows;
    if (['gainers', 'losers', 'volume'].includes(type)) {
      const priced = universe.map(u => ({ sym: u.sym, ex: u.ex, p: state.prices[priceKey(u.sym, u.ex)] })).filter(r => r.p);
      if (type === 'gainers') priced.sort((a, b) => (b.p.change ?? 0) - (a.p.change ?? 0));
      if (type === 'losers') priced.sort((a, b) => (a.p.change ?? 0) - (b.p.change ?? 0));
      if (type === 'volume') priced.sort((a, b) => (b.p.price * 1) - (a.p.price * 1)); // approx by price; vol unavailable in miniticker map
      rows = priced.slice(0, 30).map(r => ({ sym: r.sym, ex: r.ex, val: type === 'volume' ? fmtPrice(r.p.price) : fmtPct(r.p.change), up: (r.p.change ?? 0) >= 0 }));
    } else {
      rows = await runCandleScan(type, universe.slice(0, CANDLE_SCAN_LIMIT));
    }
    if (!silent) renderResults(rows);
    else notifyNewHits(rows);
    return rows;
  } catch {
    if (!silent) out.innerHTML = '<div class="muted">Scan failed.</div>';
    return [];
  }
}

async function runCandleScan(type, subset) {
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
      } else if (type === 'volspike') {
        const vols = d.map(c => c.volume);
        const last = vols[vols.length - 1];
        const prior = vols.slice(-21, -1);
        if (!prior.length) continue;
        const avg = prior.reduce((a, v) => a + v, 0) / prior.length;
        if (avg > 0 && last / avg >= 2) results.push({ sym, ex, val: (last / avg).toFixed(1) + '×ADV', up: d[d.length - 1].close >= d[d.length - 1].open });
      } else {
        const e = ema(closes, Math.min(200, closes.length - 1));
        const last = e[e.length - 1], price = closes[closes.length - 1];
        if (last == null) continue;
        if (type === 'above_ema' && price > last) results.push({ sym, ex, val: fmtPrice(price), up: true });
        if (type === 'below_ema' && price < last) results.push({ sym, ex, val: fmtPrice(price), up: false });
      }
    } catch {}
  }
  return results;
}

// P2-13 (scoped): a lightweight stand-in for server-side scan-hit alerts —
// toast whenever auto-refresh surfaces a symbol that wasn't in the previous run.
function notifyNewHits(rows) {
  const keys = new Set(rows.map(r => `${r.sym}:${r.ex}`));
  const fresh = rows.filter(r => !lastHits.has(`${r.sym}:${r.ex}`));
  if (lastHits.size && fresh.length) {
    toast(`Scanner: ${fresh.map(r => baseAsset(r.sym)).slice(0, 5).join(', ')} now matching`, 'info');
  }
  lastHits = keys;
  renderResults(rows);
}

function setAutoRefresh(on) {
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  lastHits = new Set();
  if (on) {
    runScan(true);
    autoTimer = setInterval(() => runScan(true), AUTO_REFRESH_MS);
  }
}

// ---- Saved scans (P2-13) ----
async function refreshSavedScansList() {
  const sel = document.getElementById('scanSaved');
  if (!sel) return;
  let saved = {};
  try { saved = await (await fetch('/api/scans')).json(); } catch {}
  const names = saved && typeof saved === 'object' && !saved.error ? Object.keys(saved) : [];
  sel.innerHTML = '<option value="">Saved scans…</option>' + names.map(n => `<option value="${n}">${n}</option>`).join('');
}

async function saveCurrentScan() {
  const name = prompt('Save this scan as:');
  if (!name) return;
  const data = { type: document.getElementById('scanType').value, scope: document.getElementById('scanScope').value };
  try {
    await fetch(`/api/scans/${encodeURIComponent(name.trim())}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    });
    toast(`Saved scan "${name.trim()}"`, 'info');
    refreshSavedScansList();
  } catch { toast('Failed to save scan', 'error'); }
}

async function loadSelectedScan() {
  const sel = document.getElementById('scanSaved');
  const name = sel.value;
  if (!name) return;
  try {
    const saved = await (await fetch('/api/scans')).json();
    const data = saved?.[name];
    if (!data) return;
    document.getElementById('scanType').value = data.type;
    document.getElementById('scanScope').value = data.scope;
    runScan();
  } catch { toast('Failed to load scan', 'error'); }
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
