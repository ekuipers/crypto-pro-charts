// ============================================================
// PAPER TRADING & JOURNAL (P2-15) — simulated positions placed on-chart,
// live P&L while open, and a closed-trade journal with notes.
// ============================================================
import { state } from './state.js';
import { fmtPrice, fmtPct, esc, toast, baseAsset, quoteAsset } from './utils.js';
import { showModal, closeModal } from './alerts.js';
import { defaultExchange } from './data.js';

let pnlTimer = null;
let cache = [];

async function apiGet(path) { const r = await fetch(path); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }
async function apiSend(method, path, data) {
  const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `HTTP ${r.status}`); }
  return r.json();
}
async function apiDelete(path) { const r = await fetch(path, { method: 'DELETE' }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }

export function initPaper() {
  document.getElementById('paperNewBtn')?.addEventListener('click', showNewTradeModal);
}

export async function refreshPaper() {
  if (state.rightTab !== 'paper') { if (pnlTimer) { clearInterval(pnlTimer); pnlTimer = null; } return; }
  try { cache = await apiGet('/api/paper'); } catch { cache = []; }
  render();
  if (!pnlTimer) pnlTimer = setInterval(render, 2000);
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

  openList.innerHTML = open.length ? open.map(t => `
    <div class="paper-row">
      <div class="paper-row-main">
        <span class="paper-sym">${esc(baseAsset(t.symbol))}<span class="sym-quote-tag">${esc(quoteAsset(t.symbol))}</span></span>
        <span class="paper-side ${t.side}">${t.side.toUpperCase()}</span>
        <span class="paper-qty">×${t.qty}</span>
      </div>
      <div class="paper-row-sub">
        <span>Entry ${fmtPrice(t.entryPrice)}</span>
        ${pnlHtml(pnl(t, state.prices[t.symbol]?.price))}
      </div>
      <div class="paper-row-actions">
        <button class="paper-close-btn" data-id="${t.id}">Close</button>
        <button class="paper-del-btn" data-id="${t.id}" title="Delete">✕</button>
      </div>
    </div>`).join('') : '<div class="muted">No open positions.</div>';

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
  document.querySelectorAll('.paper-del-btn').forEach(b => b.addEventListener('click', () => deleteTrade(b.dataset.id)));
  document.querySelectorAll('.paper-note-btn').forEach(b => b.addEventListener('click', () => editNote(b.dataset.id)));
}

async function closeTrade(id) {
  const trade = cache.find(t => t.id === id);
  if (!trade) return;
  const cur = state.prices[trade.symbol]?.price;
  const input = prompt('Exit price:', cur ? fmtPrice(cur) : '');
  if (!input) return;
  const exitPrice = parseFloat(input);
  if (!Number.isFinite(exitPrice) || exitPrice <= 0) { toast('Invalid exit price', 'warn'); return; }
  try { await apiSend('PUT', `/api/paper/${id}/close`, { exitPrice }); toast('Trade closed', 'info'); refreshPaper(); }
  catch { toast('Failed to close trade', 'error'); }
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
  const curPrice = state.prices[symbol]?.price;
  showModal(`
    <h3>New Paper Trade</h3>
    <label>Symbol<input id="ptSym" value="${esc(symbol)}"></label>
    <label>Side<select id="ptSide"><option value="long">Long</option><option value="short">Short</option></select></label>
    <label>Quantity<input id="ptQty" type="number" step="any" value="1"></label>
    <label>Entry price<input id="ptEntry" type="number" step="any" value="${curPrice || ''}"></label>
    <label>Stop (optional)<input id="ptStop" type="number" step="any"></label>
    <label>Target (optional)<input id="ptTarget" type="number" step="any"></label>
    <label>Notes<input id="ptNotes"></label>
    <div class="modal-actions"><button id="ptCancel">Cancel</button><button id="ptSave" class="primary-btn">Open Trade</button></div>`, m => {
    m.querySelector('#ptCancel').addEventListener('click', closeModal);
    m.querySelector('#ptSave').addEventListener('click', async () => {
      const body = {
        symbol: m.querySelector('#ptSym').value.trim().toUpperCase(),
        exchange, side: m.querySelector('#ptSide').value,
        qty: parseFloat(m.querySelector('#ptQty').value),
        entryPrice: parseFloat(m.querySelector('#ptEntry').value),
        stop: m.querySelector('#ptStop').value ? parseFloat(m.querySelector('#ptStop').value) : null,
        target: m.querySelector('#ptTarget').value ? parseFloat(m.querySelector('#ptTarget').value) : null,
        notes: m.querySelector('#ptNotes').value,
      };
      try { await apiSend('POST', '/api/paper', body); toast('Paper trade opened', 'info'); closeModal(); refreshPaper(); }
      catch (e) { toast(e.message || 'Failed to open trade', 'error'); }
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
