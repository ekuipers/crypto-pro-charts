// ============================================================
// PAPER TRADING & JOURNAL (P2-15) — simulated positions placed on-chart,
// live P&L while open, and a closed-trade journal with notes.
// ============================================================
import { state } from './state.js';
import { fmtPrice, fmtPct, esc, toast, baseAsset, quoteAsset, priceKey } from './utils.js';
import { showModal, closeModal } from './alerts.js';
import { defaultExchange } from './data.js';
import { redrawAllPanels } from './charts.js';

let pnlTimer = null;
let paperPollTimer = null;
let cache = [];

// Isolated-margin liquidation-price estimate, mirroring the server-side calc
// in server.js (calcLiquidationPrice) — used for the live preview in the New
// Trade modal only; the authoritative value comes back from the API.
const LIQUIDATION_MMR = 0.005;
function estLiquidationPrice(side, entryPrice, leverage) {
  if (!(leverage > 1) || !Number.isFinite(entryPrice) || entryPrice <= 0) return null;
  const liq = side === 'short'
    ? entryPrice * (1 + 1 / leverage - LIQUIDATION_MMR)
    : entryPrice * (1 - 1 / leverage + LIQUIDATION_MMR);
  return liq > 0 ? liq : null;
}

// Open trades matching a chart panel's symbol+exchange — the integration
// point for drawings.js to paint long/short position lines on the chart.
export function openTradesForSymbol(symbol, exchange) {
  const ex = exchange || 'binance';
  return cache.filter(t => t.status === 'open' && t.symbol === symbol && (t.exchange || 'binance') === ex);
}

// True once price has traded through a leveraged trade's liquidation level.
function isLiquidated(t, curPrice) {
  if (t.liquidationPrice == null || curPrice == null) return false;
  return t.side === 'long' ? curPrice <= t.liquidationPrice : curPrice >= t.liquidationPrice;
}

async function apiGet(path) { const r = await fetch(path); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }
async function apiSend(method, path, data) {
  const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `HTTP ${r.status}`); }
  return r.json();
}
async function apiDelete(path) { const r = await fetch(path, { method: 'DELETE' }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }

export function initPaper() {
  document.getElementById('paperNewBtn')?.addEventListener('click', showNewTradeModal);
  // Load open positions at startup (not gated on the Paper tab being active)
  // so the chart pane can paint long/short position lines immediately —
  // roadmap: "Add the positions created in the paper pane to the chart pane".
  refreshPaper();
  if (!paperPollTimer) paperPollTimer = setInterval(refreshPaper, 30000);
}

export async function refreshPaper() {
  try { cache = await apiGet('/api/paper'); } catch { cache = []; }
  if (state.rightTab === 'paper') {
    render();
    if (!pnlTimer) pnlTimer = setInterval(render, 2000);
  } else if (pnlTimer) { clearInterval(pnlTimer); pnlTimer = null; }
  redrawAllPanels();
}

function pnl(t, curPrice) {
  const price = t.status === 'closed' ? t.exitPrice : curPrice;
  if (price == null) return null;
  const dir = t.side === 'long' ? 1 : -1;
  return { abs: (price - t.entryPrice) * dir * t.qty, pct: ((price - t.entryPrice) / t.entryPrice) * dir * 100 };
}

function pnlHtml(p) {
  if (!p) return '<span class="muted">--</span>';
  const up = p.abs >= 0;
  return `<span class="${up ? 'up' : 'down'}">${up ? '+' : ''}${fmtPrice(p.abs)} (${fmtPct(p.pct)})</span>`;
}

function render() {
  const openList = document.getElementById('paperOpenList');
  const journalList = document.getElementById('paperJournalList');
  if (!openList || !journalList) return;
  const open = cache.filter(t => t.status === 'open');
  const closed = cache.filter(t => t.status === 'closed');

  openList.innerHTML = open.length ? open.map(t => {
    const curPrice = state.prices[priceKey(t.symbol, t.exchange)]?.price;
    const lev = t.leverage || 1;
    const liq = isLiquidated(t, curPrice);
    const margin = lev > 1 ? (t.qty * t.entryPrice) / lev : null;
    const shown = t.showOnChart !== false;
    return `
    <div class="paper-row${liq ? ' liquidated' : ''}">
      <div class="paper-row-main">
        <span class="paper-sym">${esc(baseAsset(t.symbol))}<span class="sym-quote-tag">${esc(quoteAsset(t.symbol))}</span></span>
        <span class="paper-side ${t.side}">${t.side.toUpperCase()}</span>
        ${lev > 1 ? `<span class="paper-lev">${lev}×</span>` : ''}
        <span class="paper-qty">×${t.qty}</span>
      </div>
      <div class="paper-row-sub">
        <span>Entry ${fmtPrice(t.entryPrice)}</span>
        ${pnlHtml(pnl(t, curPrice))}
      </div>
      ${(t.target != null || t.stop != null || t.liquidationPrice != null || margin != null) ? `
      <div class="paper-row-meta">
        ${t.target != null ? `<span class="muted">TP ${fmtPrice(t.target)}</span>` : ''}
        ${t.stop != null ? `<span class="muted">SL ${fmtPrice(t.stop)}</span>` : ''}
        ${t.liquidationPrice != null ? `<span class="muted">Liq ${fmtPrice(t.liquidationPrice)}</span>` : ''}
        ${margin != null ? `<span class="muted">Margin ${fmtPrice(margin)}</span>` : ''}
      </div>` : ''}
      ${liq ? '<div class="paper-liq-warning">⚠ Price crossed the liquidation level (estimate)</div>' : ''}
      <div class="paper-row-actions">
        <button class="paper-chart-btn${shown ? ' active' : ''}" data-id="${t.id}" title="${shown ? 'Showing on chart — click to hide' : 'Hidden from chart — click to show'}">${shown ? '👁' : '🚫'}</button>
        <button class="paper-edit-btn" data-id="${t.id}" title="Edit position">✎</button>
        ${liq
          ? `<button class="paper-liq-close-btn" data-id="${t.id}">Close at liquidation</button>`
          : `<button class="paper-close-btn" data-id="${t.id}">Close</button>`}
        <button class="paper-del-btn" data-id="${t.id}" title="Delete">✕</button>
      </div>
    </div>`;
  }).join('') : '<div class="muted">No open positions.</div>';

  journalList.innerHTML = closed.length ? closed.map(t => `
    <div class="paper-row journal">
      <div class="paper-row-main">
        <span class="paper-sym">${esc(baseAsset(t.symbol))}</span>
        <span class="paper-side ${t.side}">${t.side.toUpperCase()}</span>
        ${pnlHtml(pnl(t, null))}
      </div>
      <div class="paper-row-sub">
        <span>${fmtPrice(t.entryPrice)} → ${fmtPrice(t.exitPrice)}</span>
        <span class="muted">${esc(t.notes || 'No notes')}</span>
      </div>
      <div class="paper-row-actions">
        <button class="paper-note-btn" data-id="${t.id}">Note</button>
        <button class="paper-del-btn" data-id="${t.id}" title="Delete">✕</button>
      </div>
    </div>`).join('') : '<div class="muted">No closed trades yet.</div>';

  wireRows();
}

function wireRows() {
  document.querySelectorAll('.paper-close-btn').forEach(b => b.addEventListener('click', () => closeTrade(b.dataset.id)));
  document.querySelectorAll('.paper-liq-close-btn').forEach(b => b.addEventListener('click', () => closeAtLiquidation(b.dataset.id)));
  document.querySelectorAll('.paper-del-btn').forEach(b => b.addEventListener('click', () => deleteTrade(b.dataset.id)));
  document.querySelectorAll('.paper-note-btn').forEach(b => b.addEventListener('click', () => editNote(b.dataset.id)));
  document.querySelectorAll('.paper-edit-btn').forEach(b => b.addEventListener('click', () => showEditTradeModal(b.dataset.id)));
  document.querySelectorAll('.paper-chart-btn').forEach(b => b.addEventListener('click', () => toggleChartVisibility(b.dataset.id)));
}

// Roadmap: toggle whether an open position is painted on the chart, without
// closing it — flips `showOnChart` server-side then repaints every panel.
async function toggleChartVisibility(id) {
  const trade = cache.find(t => t.id === id);
  if (!trade) return;
  const next = !(trade.showOnChart !== false);
  try { await apiSend('PUT', `/api/paper/${id}/visibility`, { showOnChart: next }); refreshPaper(); }
  catch { toast('Failed to update chart visibility', 'error'); }
}

async function closeTrade(id) {
  const trade = cache.find(t => t.id === id);
  if (!trade) return;
  const cur = state.prices[priceKey(trade.symbol, trade.exchange)]?.price;
  const input = prompt('Exit price:', cur ? fmtPrice(cur) : '');
  if (!input) return;
  // Strip thousands separators — fmtPrice() pre-fills e.g. "50,123.45" for
  // BTC-magnitude prices, and bare parseFloat() would silently truncate at
  // the comma (→ 50), passing validation with a wildly wrong exit price.
  const exitPrice = parseFloat(String(input).replace(/,/g, ''));
  if (!Number.isFinite(exitPrice) || exitPrice <= 0) { toast('Invalid exit price', 'warn'); return; }
  try { await apiSend('PUT', `/api/paper/${id}/close`, { exitPrice }); toast('Trade closed', 'info'); refreshPaper(); }
  catch { toast('Failed to close trade', 'error'); }
}

// Convenience close for a trade whose price has crossed its (estimated)
// liquidation level — settles the paper trade at that level rather than
// requiring the user to type it in manually.
async function closeAtLiquidation(id) {
  const trade = cache.find(t => t.id === id);
  if (!trade || trade.liquidationPrice == null) return;
  try {
    await apiSend('PUT', `/api/paper/${id}/close`, { exitPrice: trade.liquidationPrice });
    toast('Position liquidated', 'warn');
    refreshPaper();
  } catch { toast('Failed to close trade', 'error'); }
}

async function deleteTrade(id) {
  try { await apiDelete(`/api/paper/${id}`); refreshPaper(); } catch { toast('Failed to delete trade', 'error'); }
}

async function editNote(id) {
  const trade = cache.find(t => t.id === id);
  if (!trade) return;
  const notes = prompt('Notes:', trade.notes || '');
  if (notes == null) return;
  try { await apiSend('PUT', `/api/paper/${id}/notes`, { notes, tags: trade.tags }); refreshPaper(); }
  catch { toast('Failed to save notes', 'error'); }
}

function showNewTradeModal() {
  const panel = state.activePanel;
  const symbol = panel?.symbol || 'BTCUSDT';
  const exchange = panel?.exchange || defaultExchange();
  const curPrice = state.prices[priceKey(symbol, exchange)]?.price;
  showModal(`
    <h3>New Paper Trade</h3>
    <label>Symbol<input id="ptSym" value="${esc(symbol)}"></label>
    <label>Side<select id="ptSide"><option value="long">Long</option><option value="short">Short</option></select></label>
    <label>Quantity<input id="ptQty" type="number" step="any" value="1"></label>
    <label>Entry price<input id="ptEntry" type="number" step="any" value="${curPrice || ''}"></label>
    <label>Leverage<input id="ptLev" type="number" step="1" min="1" max="125" value="1"></label>
    <div class="pt-liq-preview muted" id="ptLiqPreview">1× = spot, no liquidation risk</div>
    <label>Stop (optional)<input id="ptStop" type="number" step="any"></label>
    <label>Target (optional)<input id="ptTarget" type="number" step="any"></label>
    <label>Notes<input id="ptNotes"></label>
    <div class="modal-actions"><button id="ptCancel">Cancel</button><button id="ptSave" class="primary-btn">Open Trade</button></div>`, m => {
    m.querySelector('#ptCancel').addEventListener('click', closeModal);

    const updateLiqPreview = () => {
      const side = m.querySelector('#ptSide').value;
      const entry = parseFloat(m.querySelector('#ptEntry').value);
      const lev = parseFloat(m.querySelector('#ptLev').value) || 1;
      const preview = m.querySelector('#ptLiqPreview');
      if (lev <= 1) { preview.textContent = '1× = spot, no liquidation risk'; return; }
      const liq = estLiquidationPrice(side, entry, lev);
      preview.textContent = liq != null
        ? `Est. liquidation ≈ ${fmtPrice(liq)} at ${lev}× (approximation — ignores fees/funding)`
        : 'Enter a valid entry price to estimate liquidation';
    };
    ['#ptSide', '#ptEntry', '#ptLev'].forEach(sel => m.querySelector(sel).addEventListener('input', updateLiqPreview));
    updateLiqPreview();

    m.querySelector('#ptSave').addEventListener('click', async () => {
      const body = {
        symbol: m.querySelector('#ptSym').value.trim().toUpperCase(),
        exchange, side: m.querySelector('#ptSide').value,
        qty: parseFloat(m.querySelector('#ptQty').value),
        entryPrice: parseFloat(m.querySelector('#ptEntry').value),
        leverage: parseFloat(m.querySelector('#ptLev').value) || 1,
        stop: m.querySelector('#ptStop').value ? parseFloat(m.querySelector('#ptStop').value) : null,
        target: m.querySelector('#ptTarget').value ? parseFloat(m.querySelector('#ptTarget').value) : null,
        notes: m.querySelector('#ptNotes').value,
      };
      try { await apiSend('POST', '/api/paper', body); toast('Paper trade opened', 'info'); closeModal(); refreshPaper(); }
      catch (e) { toast(e.message || 'Failed to open trade', 'error'); }
    });
  });
}

// Roadmap: edit an open position's terms (qty/entry/stop/target/leverage).
// Symbol/exchange/side stay fixed — changing those is really "open a new
// trade", not editing this one.
function showEditTradeModal(id) {
  const trade = cache.find(t => t.id === id);
  if (!trade) return;
  showModal(`
    <h3>Edit Position — ${esc(baseAsset(trade.symbol))}<span class="sym-quote-tag">${esc(quoteAsset(trade.symbol))}</span> <span class="paper-side ${trade.side}">${trade.side.toUpperCase()}</span></h3>
    <label>Quantity<input id="ptQty" type="number" step="any" value="${trade.qty}"></label>
    <label>Entry price<input id="ptEntry" type="number" step="any" value="${trade.entryPrice}"></label>
    <label>Leverage<input id="ptLev" type="number" step="1" min="1" max="125" value="${trade.leverage || 1}"></label>
    <div class="pt-liq-preview muted" id="ptLiqPreview"></div>
    <label>Stop (optional)<input id="ptStop" type="number" step="any" value="${trade.stop ?? ''}"></label>
    <label>Target (optional)<input id="ptTarget" type="number" step="any" value="${trade.target ?? ''}"></label>
    <div class="modal-actions"><button id="ptCancel">Cancel</button><button id="ptSave" class="primary-btn">Save Changes</button></div>`, m => {
    m.querySelector('#ptCancel').addEventListener('click', closeModal);

    const updateLiqPreview = () => {
      const entry = parseFloat(m.querySelector('#ptEntry').value);
      const lev = parseFloat(m.querySelector('#ptLev').value) || 1;
      const preview = m.querySelector('#ptLiqPreview');
      if (lev <= 1) { preview.textContent = '1× = spot, no liquidation risk'; return; }
      const liq = estLiquidationPrice(trade.side, entry, lev);
      preview.textContent = liq != null
        ? `Est. liquidation ≈ ${fmtPrice(liq)} at ${lev}× (approximation — ignores fees/funding)`
        : 'Enter a valid entry price to estimate liquidation';
    };
    ['#ptEntry', '#ptLev'].forEach(sel => m.querySelector(sel).addEventListener('input', updateLiqPreview));
    updateLiqPreview();

    m.querySelector('#ptSave').addEventListener('click', async () => {
      const body = {
        qty: parseFloat(m.querySelector('#ptQty').value),
        entryPrice: parseFloat(m.querySelector('#ptEntry').value),
        leverage: parseFloat(m.querySelector('#ptLev').value) || 1,
        stop: m.querySelector('#ptStop').value ? parseFloat(m.querySelector('#ptStop').value) : null,
        target: m.querySelector('#ptTarget').value ? parseFloat(m.querySelector('#ptTarget').value) : null,
      };
      try { await apiSend('PUT', `/api/paper/${id}`, body); toast('Position updated', 'info'); closeModal(); refreshPaper(); }
      catch (e) { toast(e.message || 'Failed to update position', 'error'); }
    });
  });
}

// Log a long/short drawing-tool position as a paper trade — the integration
// point with the position drawing tool (P2-11).
export async function logDrawingAsTrade(panel, drawing) {
  if (!panel || !drawing || (drawing.type !== 'long' && drawing.type !== 'short')) return;
  try {
    await apiSend('POST', '/api/paper', {
      symbol: panel.symbol, exchange: panel.exchange, side: drawing.type,
      qty: 1, entryPrice: drawing.p1.price, stop: drawing.p3?.price ?? null, target: drawing.p2?.price ?? null,
      notes: 'Logged from chart drawing',
    });
    toast('Logged as paper trade', 'info');
  } catch { toast('Failed to log paper trade', 'error'); }
}
