// ============================================================
// WATCHLIST — right panel symbol selector + search
// ============================================================
import { state } from './state.js';
import { baseAsset, fmtPrice, fmtPct, esc, toast } from './utils.js';
import { fetchAllPairs, validateSymbol } from './data.js';
import { changeSymbol, scheduleAutosave } from './charts.js';

export function initWatchlist() {
  renderTabs();
  renderSymbolList();
  const search = document.getElementById('symSearch');
  search.addEventListener('input', () => handleSearch(search.value.trim()));
  search.addEventListener('keydown', e => { if (e.key === 'Escape') { search.value = ''; handleSearch(''); } });

  document.getElementById('newWatchlistBtn').addEventListener('click', addWatchlist);
  document.getElementById('addSymbolBtn').addEventListener('click', addSymbolPrompt);

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

export function renderSymbolList() {
  const list = document.getElementById('symList');
  const wl = state.watchlists[state.currentWatchlist] || [];
  let items = wl.slice();
  // sort
  const { col, dir } = state.wlSort;
  items.sort((a, b) => {
    let av, bv;
    if (col === 'name') { av = a.symbol; bv = b.symbol; }
    else { av = state.prices[a.symbol]?.[col === 'price' ? 'price' : col === 'chg' ? 'chgVal' : 'change'] ?? 0; bv = state.prices[b.symbol]?.[col === 'price' ? 'price' : col === 'chg' ? 'chgVal' : 'change'] ?? 0; }
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  });
  list.innerHTML = '';
  items.forEach(s => {
    const p = state.prices[s.symbol] || {};
    const up = (p.change ?? 0) >= 0;
    const row = document.createElement('div');
    row.className = 'sym-row';
    const dotColor = state.symColors[s.symbol] || 'transparent';
    row.innerHTML = `
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

async function addSymbolPrompt() {
  let sym = prompt('Add symbol (e.g. BTC or BTCUSDT):');
  if (!sym) return;
  sym = sym.toUpperCase().trim();
  if (!sym.endsWith('USDT')) sym += 'USDT';
  const ok = await validateSymbol(sym);
  if (!ok) { toast(`${sym} not found on Binance`, 'error'); return; }
  const wl = state.watchlists[state.currentWatchlist];
  if (wl.some(s => s.symbol === sym)) { toast('Already in watchlist', 'warn'); return; }
  wl.push({ symbol: sym, name: baseAsset(sym) });
  renderSymbolList(); scheduleAutosave();
  toast(`Added ${baseAsset(sym)}`, 'info');
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
