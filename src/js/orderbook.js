// ============================================================
// ORDER BOOK + TECH INFO panes
// ============================================================
import { state } from './state.js';
import { fetchOrderBook, openOrderBookStream, closeOrderBookStream, fetchPrice } from './data.js';
import { fmtPrice, fmtVol, fmtPct } from './utils.js';

let pollTimer = null;

export function refreshOrderBook() {
  const panel = state.activePanel;
  if (!panel) return;
  if (state.rightTab !== 'orderbook') { closeOrderBookStream(); if (pollTimer) clearInterval(pollTimer); return; }
  const symbol = panel.symbol;
  closeOrderBookStream();
  if (pollTimer) clearInterval(pollTimer);

  fetchOrderBook(symbol).then(ob => { state.obData = ob; renderOrderBook(); }).catch(() => {});
  const ws = openOrderBookStream(symbol, ob => { state.obData = ob; renderOrderBook(); });
  if (!ws) {
    pollTimer = setInterval(() => fetchOrderBook(symbol).then(ob => { state.obData = ob; renderOrderBook(); }).catch(() => {}), 5000);
  }
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

// ---- Tech info ----
export async function refreshTechInfo() {
  const panel = state.activePanel;
  const el = document.getElementById('techContent');
  if (!panel || !el) return;
  if (state.rightTab !== 'techinfo') return;
  el.innerHTML = '<div class="muted">Loading…</div>';
  try {
    const p = await fetchPrice(panel.symbol);
    const up = p.change >= 0;
    el.innerHTML = `
      <div class="ti-price ${up ? 'up' : 'down'}">${fmtPrice(p.price)}</div>
      <div class="ti-chg ${up ? 'up' : 'down'}">${fmtPct(p.change)}</div>
      <div class="ti-grid">
        <div><span>Open</span><b>${fmtPrice(p.open)}</b></div>
        <div><span>High</span><b>${fmtPrice(p.high)}</b></div>
        <div><span>Low</span><b>${fmtPrice(p.low)}</b></div>
        <div><span>24h Vol</span><b>${fmtVol(p.volume)}</b></div>
      </div>
      <button id="tiAlertBtn" class="primary-btn">Set Price Alert</button>`;
    el.querySelector('#tiAlertBtn').addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('open-alert-modal', { detail: { symbol: panel.symbol, price: p.price } }));
    });
  } catch {
    el.innerHTML = '<div class="muted">Failed to load</div>';
  }
}
