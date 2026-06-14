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

function renderOrderBook() {
  const el = document.getElementById('obContent');
  if (!el) return;
  const { bids, asks } = state.obData;
  if (!bids?.length && !asks?.length) { el.innerHTML = '<div class="muted">No order book data</div>'; return; }
  const maxQty = Math.max(...bids.map(b => b.qty), ...asks.map(a => a.qty), 1);
  const askRows = asks.slice(0, 15).reverse().map(a => row(a, maxQty, 'ask')).join('');
  const bidRows = bids.slice(0, 15).map(b => row(b, maxQty, 'bid')).join('');
  const spread = asks[0] && bids[0] ? asks[0].price - bids[0].price : 0;
  const spreadPct = bids[0] ? (spread / bids[0].price) * 100 : 0;
  el.innerHTML = `
    <div class="ob-table">${askRows}</div>
    <div class="ob-spread">Spread ${fmtPrice(spread)} (${spreadPct.toFixed(3)}%)</div>
    <div class="ob-table">${bidRows}</div>`;
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
