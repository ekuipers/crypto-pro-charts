// ============================================================
// WATCHLIST — right panel symbol selector + search
// ============================================================
import { state } from './state.js';
import { baseAsset, fmtPrice, fmtPct, esc, toast } from './utils.js';
import { fetchAllPairs, validateSymbol } from './data.js';
import { changeSymbol, scheduleAutosave, addOverlaySymbol } from './charts.js';
import { showModal, closeModal } from './alerts.js';

export function initWatchlist() {
  renderTabs();
  renderSymbolList();
  const search = document.getElementById('symSearch');
  search.addEventListener('input', () => handleSearch(search.value.trim()));
  search.addEventListener('keydown', e => { if (e.key === 'Escape') { search.value = ''; handleSearch(''); } });

  document.getElementById('newWatchlistBtn').addEventListener('click', addWatchlist);
  document.getElementById('addSymbolBtn').addEventListener('click', addSymbolPrompt);

  // overlay/comparison picker (triggered from a chart pane)
  document.addEventListener('open-compare-search', e => {
    const panel = e.detail?.panel || state.activePanel;
    if (!panel) return;
    showSymbolPicker('Overlay a symbol on this chart', (sym, name) => addOverlaySymbol(panel, sym, name));
  });

  // sort headers
  document.querySelectorAll('#symListHead .col').forEach(c => {
    c.addEventListener('click', () => {
      const col = c.dataset.col;
      if (state.wlSort.col === col) state.wlSort.dir = state.wlSort.dir === 'asc' ? 'desc' : 'asc';
      else { state.wlSort.col = col; state.wlSort.dir = 'asc'; }
      renderSymbolList(); scheduleAutosave();
    });
  });

  fetchAllPairs();
}

function renderTabs() {
  const tabs = document.getElementById('wlTabs');
  tabs.innerHTML = '';
  Object.keys(state.watchlists).forEach(name => {
    const b = document.createElement('button');
    b.className = 'wl-tab' + (name === state.currentWatchlist ? ' active' : '');
    b.textContent = name;
    b.addEventListener('click', () => { state.currentWatchlist = name; renderTabs(); renderSymbolList(); scheduleAutosave(); });
    b.addEventListener('contextmenu', e => { e.preventDefault(); wlContextMenu(e, name); });
    tabs.appendChild(b);
  });
}

function wlContextMenu(e, name) {
  showMenu(e.clientX, e.clientY, [
    { label: 'Rename', fn: () => {
        const nn = prompt('Rename watchlist:', name);
        if (nn && nn !== name && !state.watchlists[nn]) {
          state.watchlists[nn] = state.watchlists[name]; delete state.watchlists[name];
          if (state.currentWatchlist === name) state.currentWatchlist = nn;
          renderTabs(); renderSymbolList(); scheduleAutosave();
        }
      } },
    { label: 'Delete', fn: () => {
        if (Object.keys(state.watchlists).length <= 1) { toast('Keep at least one watchlist', 'warn'); return; }
        delete state.watchlists[name];
        if (state.currentWatchlist === name) state.currentWatchlist = Object.keys(state.watchlists)[0];
        renderTabs(); renderSymbolList(); scheduleAutosave();
      } },
  ]);
}

// Sorted view of a watchlist. col === 'manual' preserves the stored array
// order (used for drag-to-reorder).
function computeSorted(wl) {
  const { col, dir } = state.wlSort;
  if (col === 'manual') return wl.slice();
  return wl.slice().sort((a, b) => {
    let av, bv;
    if (col === 'name') { av = a.symbol; bv = b.symbol; }
    else { av = state.prices[a.symbol]?.[col === 'price' ? 'price' : col === 'chg' ? 'chgVal' : 'change'] ?? 0; bv = state.prices[b.symbol]?.[col === 'price' ? 'price' : col === 'chg' ? 'chgVal' : 'change'] ?? 0; }
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  });
}

// Freeze the current displayed order into the stored array and switch to
// manual sort, so a drag-reorder starts from exactly what the user sees.
function ensureManualOrder() {
  if (state.wlSort.col === 'manual') return;
  state.watchlists[state.currentWatchlist] = computeSorted(state.watchlists[state.currentWatchlist] || []);
  state.wlSort = { col: 'manual', dir: 'asc' };
}

function reorderSymbol(fromSym, toSym, after) {
  if (fromSym === toSym) return;
  const wl = state.watchlists[state.currentWatchlist];
  const fromIdx = wl.findIndex(s => s.symbol === fromSym);
  if (fromIdx < 0) return;
  const [item] = wl.splice(fromIdx, 1);
  let toIdx = wl.findIndex(s => s.symbol === toSym);
  if (toIdx < 0) wl.push(item);
  else wl.splice(after ? toIdx + 1 : toIdx, 0, item);
  renderSymbolList(); scheduleAutosave();
}

let _dragSym = null;

export function renderSymbolList() {
  const list = document.getElementById('symList');
  const wl = state.watchlists[state.currentWatchlist] || [];
  const items = computeSorted(wl);
  const { col, dir } = state.wlSort;
  list.innerHTML = '';
  items.forEach(s => {
    const p = state.prices[s.symbol] || {};
    const up = (p.change ?? 0) >= 0;
    const row = document.createElement('div');
    row.className = 'sym-row';
    row.draggable = true;
    row.dataset.sym = s.symbol;
    const dotColor = state.symColors[s.symbol] || 'transparent';
    row.innerHTML = `
      <span class="sym-drag" title="Drag to reorder">⠿</span>
      <span class="sym-dot" style="background:${dotColor}"></span>
      <span class="sym-name">${esc(baseAsset(s.symbol))}</span>
      <span class="sym-price">${fmtPrice(p.price)}</span>
      <span class="sym-chgv ${up ? 'up' : 'down'}">${p.chgVal != null ? (up ? '+' : '') + fmtPrice(p.chgVal) : '--'}</span>
      <span class="sym-chg ${up ? 'up' : 'down'}">${fmtPct(p.change)}</span>
      <button class="sym-del" title="Remove">×</button>`;
    row.addEventListener('click', e => {
      if (e.target.classList.contains('sym-del')) { removeSymbol(s.symbol); return; }
      if (state.activePanel) changeSymbol(state.activePanel, s.symbol, s.name);
    });

    // ---- drag to reorder ----
    row.addEventListener('dragstart', e => {
      ensureManualOrder();
      _dragSym = s.symbol;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', s.symbol); } catch {}
    });
    row.addEventListener('dragend', () => {
      _dragSym = null;
      list.querySelectorAll('.sym-row').forEach(r => r.classList.remove('dragging', 'drop-above', 'drop-below'));
    });
    row.addEventListener('dragover', e => {
      if (!_dragSym || _dragSym === s.symbol) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const r = row.getBoundingClientRect();
      const below = e.clientY > r.top + r.height / 2;
      row.classList.toggle('drop-below', below);
      row.classList.toggle('drop-above', !below);
    });
    row.addEventListener('dragleave', () => row.classList.remove('drop-above', 'drop-below'));
    row.addEventListener('drop', e => {
      if (!_dragSym) return;
      e.preventDefault();
      const r = row.getBoundingClientRect();
      const after = e.clientY > r.top + r.height / 2;
      const from = _dragSym;
      row.classList.remove('drop-above', 'drop-below');
      reorderSymbol(from, s.symbol, after);
    });
    row.querySelector('.sym-dot').addEventListener('contextmenu', e => {
      e.preventDefault();
      showMenu(e.clientX, e.clientY, ['#ef5350', '#ff9800', '#26a69a', '#2962ff', '#9c27b0'].map(c => ({
        label: c, color: c, fn: () => { state.symColors[s.symbol] = c; renderSymbolList(); scheduleAutosave(); },
      })).concat([{ label: 'Remove color', fn: () => { delete state.symColors[s.symbol]; renderSymbolList(); scheduleAutosave(); } }]));
    });
    list.appendChild(row);
  });
  // sort indicator
  document.querySelectorAll('#symListHead .col').forEach(c => {
    c.classList.toggle('sorted', c.dataset.col === col);
    c.dataset.dir = c.dataset.col === col ? dir : '';
  });
}

export function updatePriceRows() { renderSymbolList(); }

function removeSymbol(symbol) {
  const wl = state.watchlists[state.currentWatchlist];
  state.watchlists[state.currentWatchlist] = wl.filter(s => s.symbol !== symbol);
  renderSymbolList(); scheduleAutosave();
}

function addSymbolPrompt() {
  showSymbolPicker('Add symbol to watchlist', (sym, name) => {
    const wl = state.watchlists[state.currentWatchlist];
    if (wl.some(s => s.symbol === sym)) { toast('Already in watchlist', 'warn'); return; }
    wl.push({ symbol: sym, name: name || baseAsset(sym) });
    renderSymbolList(); scheduleAutosave();
    toast(`Added ${baseAsset(sym)}`, 'info');
  });
}

// Reusable searchable dropdown of available symbols. onPick(symbol, name).
export async function showSymbolPicker(title, onPick) {
  showModal(`
    <h3>${esc(title)}</h3>
    <input id="spSearch" class="panel-search" placeholder="Search symbols…" autocomplete="off" style="width:100%;margin:0 0 10px">
    <div id="spList" class="sym-picker-list"><div class="muted">Loading symbols…</div></div>
    <div class="modal-actions"><button id="spCancel">Cancel</button></div>`, async m => {
    m.querySelector('#spCancel').addEventListener('click', closeModal);
    const search = m.querySelector('#spSearch');
    const listEl = m.querySelector('#spList');
    const pairs = await fetchAllPairs();
    const render = () => {
      const q = (search.value || '').toUpperCase().trim();
      const results = (q ? pairs.filter(p => p.symbol.includes(q) || p.name.includes(q)) : pairs).slice(0, 60);
      if (!results.length) { listEl.innerHTML = '<div class="muted">No matches</div>'; return; }
      listEl.innerHTML = results.map(r =>
        `<button class="sym-picker-item" data-sym="${r.symbol}" data-name="${esc(r.name)}"><b>${esc(baseAsset(r.symbol))}</b><span>USDT</span></button>`).join('');
      listEl.querySelectorAll('.sym-picker-item').forEach(b => b.addEventListener('click', () => {
        onPick(b.dataset.sym, b.dataset.name);
        closeModal();
      }));
    };
    search.addEventListener('input', render);
    render();
    search.focus();
  });
}

function addWatchlist() {
  const name = prompt('New watchlist name:');
  if (!name || state.watchlists[name]) return;
  state.watchlists[name] = [];
  state.currentWatchlist = name;
  renderTabs(); renderSymbolList(); scheduleAutosave();
}

// ---- Search (watchlist + all pairs) ----
async function handleSearch(query) {
  const dd = document.getElementById('symSearchResults');
  if (!query) { dd.style.display = 'none'; dd.innerHTML = ''; renderSymbolList(); return; }
  const q = query.toUpperCase();
  const pairs = await fetchAllPairs();
  const results = pairs.filter(p => p.symbol.includes(q) || p.name.includes(q)).slice(0, 15);
  dd.innerHTML = results.map(r => `<div class="search-res" data-sym="${r.symbol}" data-name="${r.name}">${esc(baseAsset(r.symbol))}<span>USDT</span></div>`).join('');
  dd.style.display = results.length ? 'block' : 'none';
  dd.querySelectorAll('.search-res').forEach(el => el.addEventListener('click', () => {
    const sym = el.dataset.sym, name = el.dataset.name;
    if (state.activePanel) changeSymbol(state.activePanel, sym, name);
    const wl = state.watchlists[state.currentWatchlist];
    if (!wl.some(s => s.symbol === sym)) { wl.push({ symbol: sym, name }); }
    document.getElementById('symSearch').value = '';
    dd.style.display = 'none';
    renderTabs(); renderSymbolList(); scheduleAutosave();
  }));
}

// ---- Simple context menu helper ----
let _menu = null;
export function showMenu(x, y, items) {
  closeMenu();
  _menu = document.createElement('div');
  _menu.className = 'ctx-menu';
  _menu.style.left = x + 'px'; _menu.style.top = y + 'px';
  items.forEach(it => {
    const b = document.createElement('button');
    b.innerHTML = it.color ? `<span class="ctx-dot" style="background:${it.color}"></span>${it.label}` : it.label;
    b.addEventListener('click', () => { it.fn(); closeMenu(); });
    _menu.appendChild(b);
  });
  document.body.appendChild(_menu);
  setTimeout(() => document.addEventListener('click', closeMenu, { once: true }), 0);
}
function closeMenu() { if (_menu) { _menu.remove(); _menu = null; } }
