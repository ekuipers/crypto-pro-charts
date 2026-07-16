// ============================================================
// WATCHLIST — right panel symbol selector + search
// ============================================================
import { state } from './state.js';
import { baseAsset, quoteAsset, fmtPrice, fmtPct, fmtVol, esc, toast, debounce, paintSparkline, priceKey } from './utils.js';
import { fetchAllPairs, validateSymbol, searchCoinGecko, enabledExchanges, defaultExchange, getCachedKlines } from './data.js';
import { selectWatchlistSymbol, scheduleAutosave, addOverlaySymbol } from './charts.js';
import { showModal, closeModal } from './alerts.js';
import { STABLECOINS, EXCHANGES } from './constants.js';

// Short exchange label for badges in the watchlist + picker (also used by the scanner).
export function exLabel(id) { return EXCHANGES[id]?.name || id; }
// Resolve a watchlist item's exchange, falling back for legacy (untagged) items.
function itemExchange(item) { return item.exchange || defaultExchange(); }

// Symbol-picker "Hide stablecoins" toggle. Module-level so the choice sticks
// across dialog opens within a session. Defaults on — stable/stable pairs are
// rarely charted and just clutter the list.
let _hideStables = true;

// Symbol-picker quote-currency filter. 'all' lists every quote; otherwise only
// pairs quoted in the selected stablecoin/currency are shown (e.g. 'USDC' lists
// only */USDC pairs). Module-level so the choice persists across dialog opens.
let _quoteFilter = 'all';
// Preferred display order for the quote pills; intersected with the quotes that
// actually appear in the active exchange's pair list.
const QUOTE_FILTER_ORDER = ['USDT', 'USDC', 'USD', 'EUR'];

// Symbol-picker exchange filter. A Set of exchange ids; empty means "all enabled
// exchanges" (per roadmap: no filter selected → all available exchanges).
// Module-level so the choice persists across dialog opens within a session.
let _exFilter = new Set();

// ---- Sparklines (P2-16) ----
// Cached per exchange:symbol so the frequent (1.5s) price-tick re-render only
// redraws the canvas from memory instead of re-fetching klines every tick.
const SPARK_TTL_MS = 5 * 60 * 1000;
const sparkCache = new Map();   // 'ex:sym' -> { closes, ts }
const sparkInFlight = new Set();
const requestSparkRerender = debounce(() => renderSymbolList(), 400);

function drawRowSparkline(canvas, symbol, exchange, up) {
  if (!canvas) return;
  const key = `${exchange}:${symbol}`;
  const cached = sparkCache.get(key);
  if (cached && Date.now() - cached.ts < SPARK_TTL_MS) { paintSparkline(canvas, cached.closes, up); return; }
  if (!sparkInFlight.has(key)) {
    sparkInFlight.add(key);
    getCachedKlines(symbol, '1h', 24, exchange)
      .then(bars => { sparkCache.set(key, { closes: bars.map(b => b.close), ts: Date.now() }); requestSparkRerender(); })
      .catch(() => {})
      .finally(() => sparkInFlight.delete(key));
  }
  if (cached) paintSparkline(canvas, cached.closes, up); // stale-while-revalidate
}

// ---- Heatmap view (P2-16) ----
function renderHeatmap() {
  const el = document.getElementById('symHeatmap');
  if (!el) return;
  const wl = state.watchlists[state.currentWatchlist] || [];
  if (!wl.length) { el.innerHTML = '<div class="muted">Watchlist is empty.</div>'; return; }
  el.innerHTML = wl.map(s => {
    const ex = itemExchange(s);
    const p = state.prices[priceKey(s.symbol, ex)] || {};
    const chg = p.change ?? 0;
    // Intensity scales with |%change|, capped at 8% so a single outlier doesn't wash out the rest.
    const intensity = Math.min(1, Math.abs(chg) / 8);
    const bg = chg >= 0
      ? `rgba(38,166,154,${(0.15 + intensity * 0.55).toFixed(2)})`
      : `rgba(239,83,80,${(0.15 + intensity * 0.55).toFixed(2)})`;
    return `<div class="heat-tile" style="background:${bg}" data-sym="${esc(s.symbol)}" data-ex="${esc(ex)}">
      <span class="heat-sym">${esc(baseAsset(s.symbol))}</span>
      <span class="heat-chg">${fmtPct(chg)}</span>
      <span class="heat-vol">${p.volume != null ? fmtVol(p.volume) : ''}</span>
    </div>`;
  }).join('');
  el.querySelectorAll('.heat-tile').forEach(t => t.addEventListener('click', () =>
    selectWatchlistSymbol(t.dataset.sym, baseAsset(t.dataset.sym), t.dataset.ex)));
}

function setHeatmapView(on) {
  state.wlHeatmap = on;
  document.getElementById('symList').style.display = on ? 'none' : '';
  document.getElementById('symListHead').style.display = on ? 'none' : '';
  document.getElementById('symHeatmap').style.display = on ? 'grid' : 'none';
  document.getElementById('heatmapToggleBtn').classList.toggle('active', on);
  if (on) renderHeatmap();
}

export function initWatchlist() {
  renderTabs();
  renderSymbolList();
  const search = document.getElementById('symSearch');
  search.addEventListener('input', () => handleSearch(search.value.trim()));
  search.addEventListener('keydown', e => { if (e.key === 'Escape') { search.value = ''; handleSearch(''); } });

  document.getElementById('newWatchlistBtn').addEventListener('click', addWatchlist);
  document.getElementById('addSymbolBtn').addEventListener('click', addSymbolPrompt);
  document.getElementById('heatmapToggleBtn').addEventListener('click', () => setHeatmapView(!state.wlHeatmap));

  // overlay/comparison picker (triggered from a chart pane)
  document.addEventListener('open-compare-search', e => {
    const panel = e.detail?.panel || state.activePanel;
    if (!panel) return;
    showSymbolPicker('Overlay a symbol on this chart', (sym, name, exchange) => addOverlaySymbol(panel, sym, name, exchange));
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

  // Re-render so the row for the active chart's symbol stays highlighted when
  // the selected panel changes or its symbol is swapped.
  document.addEventListener('active-symbol-changed', () => renderSymbolList());

  fetchAllPairs();

  // Keep the header's right padding equal to the list's scrollbar gutter so
  // numeric columns line up on the right whether or not a scrollbar is shown.
  syncHeaderGutter();
  window.addEventListener('resize', syncHeaderGutter);
}

// Measure the reserved scrollbar gutter on the symbol list and publish it as a
// CSS variable so the (non-scrolling) header can pad itself to match.
function syncHeaderGutter() {
  requestAnimationFrame(() => {
    const list = document.getElementById('symList');
    if (!list) return;
    const gutter = Math.max(0, list.offsetWidth - list.clientWidth);
    document.documentElement.style.setProperty('--sb-w', gutter + 'px');
  });
}

function renderTabs() {
  const tabs = document.getElementById('wlTabs');
  tabs.innerHTML = '';
  Object.keys(state.watchlists).forEach(name => {
    const b = document.createElement('button');
    b.className = 'wl-tab' + (name === state.currentWatchlist ? ' active' : '');
    b.textContent = name;
    b.draggable = true;
    b.dataset.wl = name;
    b.addEventListener('click', () => { state.currentWatchlist = name; renderTabs(); renderSymbolList(); scheduleAutosave(); });
    b.addEventListener('contextmenu', e => { e.preventDefault(); wlContextMenu(e, name); });

    // ---- drag to reorder tabs horizontally ----
    b.addEventListener('dragstart', e => {
      _dragTab = name;
      b.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', name); } catch {}
    });
    b.addEventListener('dragend', () => {
      _dragTab = null;
      tabs.querySelectorAll('.wl-tab').forEach(t => t.classList.remove('dragging', 'drop-before', 'drop-after'));
    });
    b.addEventListener('dragover', e => {
      if (!_dragTab || _dragTab === name) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const r = b.getBoundingClientRect();
      const after = e.clientX > r.left + r.width / 2;
      b.classList.toggle('drop-after', after);
      b.classList.toggle('drop-before', !after);
    });
    b.addEventListener('dragleave', () => b.classList.remove('drop-before', 'drop-after'));
    b.addEventListener('drop', e => {
      if (!_dragTab) return;
      e.preventDefault();
      const r = b.getBoundingClientRect();
      const after = e.clientX > r.left + r.width / 2;
      const from = _dragTab;
      b.classList.remove('drop-before', 'drop-after');
      reorderWatchlist(from, name, after);
    });
    tabs.appendChild(b);
  });
}

let _dragTab = null;

// Reorder the watchlist tabs by rebuilding state.watchlists with its keys in the
// new order. JSON serialization preserves key order, so the new tab order
// survives autosave/reload.
function reorderWatchlist(fromName, toName, after) {
  if (fromName === toName) return;
  const names = Object.keys(state.watchlists);
  const fromIdx = names.indexOf(fromName);
  if (fromIdx < 0) return;
  names.splice(fromIdx, 1);
  let toIdx = names.indexOf(toName);
  if (toIdx < 0) names.push(fromName);
  else names.splice(after ? toIdx + 1 : toIdx, 0, fromName);
  const reordered = {};
  names.forEach(n => { reordered[n] = state.watchlists[n]; });
  state.watchlists = reordered;
  renderTabs(); scheduleAutosave();
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
    else {
      const field = col === 'price' ? 'price' : col === 'chg' ? 'chgVal' : 'change';
      av = state.prices[priceKey(a.symbol, itemExchange(a))]?.[field] ?? 0;
      bv = state.prices[priceKey(b.symbol, itemExchange(b))]?.[field] ?? 0;
    }
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

// Composite identity for a watchlist row — symbol+exchange, so the same ticker
// tracked on two venues stays distinct for selection, removal and reordering.
function itemKey(s) { return `${s.symbol} ${itemExchange(s)}`; }

function reorderSymbol(fromKey, toKey, after) {
  if (fromKey === toKey) return;
  const wl = state.watchlists[state.currentWatchlist];
  const fromIdx = wl.findIndex(s => itemKey(s) === fromKey);
  if (fromIdx < 0) return;
  const [item] = wl.splice(fromIdx, 1);
  let toIdx = wl.findIndex(s => itemKey(s) === toKey);
  if (toIdx < 0) wl.push(item);
  else wl.splice(after ? toIdx + 1 : toIdx, 0, item);
  renderSymbolList(); scheduleAutosave();
}

let _dragKey = null;

export function renderSymbolList() {
  const list = document.getElementById('symList');
  const wl = state.watchlists[state.currentWatchlist] || [];
  const items = computeSorted(wl);
  const { col, dir } = state.wlSort;
  const activeSym = state.activePanel?.symbol;
  const activeEx = state.activePanel?.exchange;
  // Show a per-row exchange badge only when this watchlist mixes exchanges.
  const multiEx = new Set(items.map(itemExchange)).size > 1;
  list.innerHTML = '';
  items.forEach(s => {
    const ex = itemExchange(s);
    const key = itemKey(s);
    const p = state.prices[priceKey(s.symbol, ex)] || {};
    const up = (p.change ?? 0) >= 0;
    const row = document.createElement('div');
    row.className = 'sym-row' + (s.symbol === activeSym && ex === activeEx ? ' active' : '');
    row.draggable = true;
    row.dataset.sym = s.symbol;
    row.dataset.ex = ex;
    const dotColor = state.symColors[s.symbol] || 'transparent';
    const exTag = multiEx ? `<span class="sym-ex-tag" title="${esc(exLabel(ex))}">${esc(exLabel(ex))}</span>` : '';
    const volTitle = p.volume != null ? `24h Vol ${fmtVol(p.volume)}` : 'Current price';
    row.innerHTML = `
      <span class="sym-drag" title="Drag to reorder">⠿</span>
      <span class="sym-dot" style="background:${dotColor}"></span>
      <span class="sym-name">${esc(baseAsset(s.symbol))}<span class="sym-quote-tag">${esc(quoteAsset(s.symbol))}</span>${exTag}</span>
      <span class="sym-spark"><canvas class="spark-canvas" width="44" height="20"></canvas></span>
      <span class="sym-price" title="${esc(volTitle)}">${fmtPrice(p.price)}</span>
      <span class="sym-chg ${up ? 'up' : 'down'}">${fmtPct(p.change)}</span>
      <button class="sym-del" title="Remove">×</button>`;
    drawRowSparkline(row.querySelector('.spark-canvas'), s.symbol, ex, up);
    row.addEventListener('click', e => {
      if (e.target.classList.contains('sym-del')) { removeSymbol(s.symbol, ex); return; }
      selectWatchlistSymbol(s.symbol, s.name, ex);
    });

    // Right-click a row → move it to another watchlist (or remove it).
    row.addEventListener('contextmenu', e => {
      e.preventDefault();
      rowContextMenu(e, s, ex);
    });

    // ---- drag to reorder ----
    row.addEventListener('dragstart', e => {
      ensureManualOrder();
      _dragKey = key;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', s.symbol); } catch {}
    });
    row.addEventListener('dragend', () => {
      _dragKey = null;
      list.querySelectorAll('.sym-row').forEach(r => r.classList.remove('dragging', 'drop-above', 'drop-below'));
    });
    row.addEventListener('dragover', e => {
      if (!_dragKey || _dragKey === key) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const r = row.getBoundingClientRect();
      const below = e.clientY > r.top + r.height / 2;
      row.classList.toggle('drop-below', below);
      row.classList.toggle('drop-above', !below);
    });
    row.addEventListener('dragleave', () => row.classList.remove('drop-above', 'drop-below'));
    row.addEventListener('drop', e => {
      if (!_dragKey) return;
      e.preventDefault();
      const r = row.getBoundingClientRect();
      const after = e.clientY > r.top + r.height / 2;
      const from = _dragKey;
      row.classList.remove('drop-above', 'drop-below');
      reorderSymbol(from, key, after);
    });
    row.querySelector('.sym-dot').addEventListener('contextmenu', e => {
      e.preventDefault();
      e.stopPropagation();
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
  if (state.wlHeatmap) renderHeatmap();
}

export function updatePriceRows() { renderSymbolList(); }

function removeSymbol(symbol, exchange) {
  const wl = state.watchlists[state.currentWatchlist];
  state.watchlists[state.currentWatchlist] = wl.filter(s => !(s.symbol === symbol && itemExchange(s) === exchange));
  renderSymbolList(); scheduleAutosave();
}

// Row context menu: move the symbol to another watchlist, or remove it.
function rowContextMenu(e, item, exchange) {
  const others = Object.keys(state.watchlists).filter(n => n !== state.currentWatchlist);
  const items = others.length
    ? others.map(name => ({ label: `Move to "${name}"`, fn: () => moveSymbol(item, exchange, name) }))
    : [{ label: 'No other watchlists', fn: () => {}, disabled: true }];
  items.push({ label: 'Remove', fn: () => removeSymbol(item.symbol, exchange) });
  showMenu(e.clientX, e.clientY, items);
}

// Move a symbol (identified by symbol+exchange) from the current watchlist to
// another one. If it's already present in the target, just drop it from the
// source so the move still "completes" without creating a duplicate.
function moveSymbol(item, exchange, targetName) {
  const src = state.watchlists[state.currentWatchlist];
  const target = state.watchlists[targetName];
  if (!target) return;
  const idx = src.findIndex(s => s.symbol === item.symbol && itemExchange(s) === exchange);
  if (idx < 0) return;
  const [moved] = src.splice(idx, 1);
  if (target.some(s => s.symbol === moved.symbol && itemExchange(s) === exchange)) {
    toast(`${moved.symbol} already in "${targetName}"`, 'warn');
  } else {
    target.push(moved);
    toast(`Moved ${moved.symbol} to "${targetName}"`, 'info');
  }
  renderSymbolList(); scheduleAutosave();
}

function addSymbolPrompt() {
  showSymbolPicker('Add symbol to watchlist', (sym, name, exchange) => {
    const ex = exchange || defaultExchange();
    const wl = state.watchlists[state.currentWatchlist];
    // Identity is symbol+exchange so the same ticker can be tracked on two venues.
    if (wl.some(s => s.symbol === sym && itemExchange(s) === ex)) { toast('Already in watchlist', 'warn'); return; }
    wl.push({ symbol: sym, name: name || baseAsset(sym), exchange: ex });
    renderSymbolList(); scheduleAutosave();
    toast(`Added ${sym} (${exLabel(ex)})`, 'info');
  });
}

// Reusable searchable dropdown of available symbols. onPick(symbol, name, exchange).
export async function showSymbolPicker(title, onPick) {
  showModal(`
    <h3>${esc(title)}</h3>
    <input id="spSearch" class="panel-search" placeholder="Search symbols or coin name…" autocomplete="off" style="width:100%;margin:0 0 8px">
    <div id="spExFilter" class="sp-ex-filter" role="group" aria-label="Filter by exchange"></div>
    <div id="spQuoteFilter" class="sp-quote-filter" role="group" aria-label="Filter by quote currency"></div>
    <label class="sp-stable-toggle"><input type="checkbox" id="spHideStable"${_hideStables ? ' checked' : ''}> Hide stablecoins</label>
    <div id="spList" class="sym-picker-list"><div class="muted">Loading symbols…</div></div>
    <div class="modal-actions"><button id="spCancel">Cancel</button></div>`, async m => {
    m.querySelector('#spCancel').addEventListener('click', closeModal);
    const search = m.querySelector('#spSearch');
    const hideStableCb = m.querySelector('#spHideStable');
    const quoteFilterEl = m.querySelector('#spQuoteFilter');
    const exFilterEl = m.querySelector('#spExFilter');
    const listEl = m.querySelector('#spList');
    const pairs = await fetchAllPairs();
    const PAGE = 100;
    let shown = PAGE;
    let _spCgTimer = null;

    // Exchanges actually present in the aggregated pair list.
    const availableExchanges = enabledExchanges().filter(id => pairs.some(p => p.exchange === id));
    // Drop any stale filter entries that aren't currently available.
    _exFilter = new Set([..._exFilter].filter(id => availableExchanges.includes(id)));
    // Whether a pair passes the exchange filter (empty filter = all exchanges).
    const passEx = p => _exFilter.size === 0 || _exFilter.has(p.exchange);
    // The exchange CoinGecko discovery rows should be attributed to.
    const cgExchange = () => availableExchanges.includes('binance') ? 'binance' : (availableExchanges[0] || defaultExchange());

    const pickItem = (sym, name, exchange) => { onPick(sym, name, exchange); closeModal(); };

    // Quote currency of a pair, preferring the exchange-supplied value and
    // falling back to deriving it from the symbol suffix.
    const pairQuote = p => p.quote || quoteAsset(p.symbol);
    // Show the exchange badge only when more than one exchange is in play.
    const showExBadge = availableExchanges.length > 1;

    let _lastCg = [];
    const render = (cgCoins = _lastCg) => {
      _lastCg = cgCoins;
      const q = (search.value || '').toUpperCase().trim();
      let matches = q ? pairs.filter(p => p.symbol.includes(q) || p.name.includes(q)) : pairs;
      matches = matches.filter(passEx);
      if (_quoteFilter !== 'all') matches = matches.filter(p => pairQuote(p) === _quoteFilter);
      if (_hideStables) matches = matches.filter(p => !STABLECOINS.has(baseAsset(p.symbol)));
      const slice = matches.slice(0, shown);
      const hidden = matches.length - slice.length;
      const exHtml = slice.map(r => {
        const badge = showExBadge ? `<span class="sym-picker-ex">${esc(exLabel(r.exchange))}</span>` : '';
        return `<button class="sym-picker-item" data-sym="${r.symbol}" data-name="${esc(r.name)}" data-ex="${esc(r.exchange)}"><b>${esc(baseAsset(r.symbol))}</b><span>${esc(quoteAsset(r.symbol))}</span>${badge}</button>`;
      }).join('');
      const moreBtn = hidden > 0 ? `<button class="sym-picker-more" id="spMore">Load ${Math.min(PAGE, hidden)} more</button>` : '';
      const countDiv = `<div class="sym-picker-count">Showing ${slice.length} of ${matches.length}</div>`;
      // CoinGecko discovery rows are always */USDT, so suppress them when the
      // user is filtering to a different quote currency, or when the exchange
      // filter excludes the exchange they'd be attributed to.
      const cgEx = cgExchange();
      let cgList = _hideStables ? cgCoins.filter(c => !STABLECOINS.has(String(c.symbol).toUpperCase())) : cgCoins;
      if (_quoteFilter !== 'all' && _quoteFilter !== 'USDT') cgList = [];
      if (_exFilter.size && !_exFilter.has(cgEx)) cgList = [];
      const cgHtml = cgList.length
        ? `<div class="search-sep">From CoinGecko</div>` + cgList.map(c => {
            const sym = `${c.symbol}USDT`;
            return `<button class="sym-picker-item sym-picker-cg" data-sym="${sym}" data-name="${esc(c.name)}" data-ex="${esc(cgEx)}"><b>${esc(c.name)}</b><span class="cg-badge">CG</span><span>${c.symbol}/USDT</span></button>`;
          }).join('')
        : '';
      if (!matches.length && !cgList.length) { listEl.innerHTML = '<div class="muted">No matches</div>'; return; }
      listEl.innerHTML = exHtml + moreBtn + countDiv + cgHtml;
      listEl.querySelectorAll('.sym-picker-item').forEach(b =>
        b.addEventListener('click', () => pickItem(b.dataset.sym, b.dataset.name, b.dataset.ex))
      );
      const more = listEl.querySelector('#spMore');
      if (more) more.addEventListener('click', () => { shown += PAGE; render(cgCoins); });
    };

    search.addEventListener('input', () => {
      shown = PAGE;
      render([]);
      clearTimeout(_spCgTimer);
      const q = search.value.trim();
      if (q.length >= 2) {
        _spCgTimer = setTimeout(async () => {
          const cgResults = await searchCoinGecko(q);
          const exSyms = new Set(pairs.map(p => p.symbol));
          const fresh = cgResults.filter(c => !exSyms.has(`${c.symbol}USDT`));
          render(fresh);
        }, 400);
      }
    });
    hideStableCb.addEventListener('change', () => {
      _hideStables = hideStableCb.checked;
      shown = PAGE;
      render();
    });

    // ---- Exchange filter pills (multi-select; none selected = all). Only shown
    // when more than one exchange is enabled, otherwise it's redundant. ----
    const buildExFilter = () => {
      if (availableExchanges.length < 2) { exFilterEl.style.display = 'none'; return; }
      exFilterEl.innerHTML =
        `<button type="button" class="sp-ex-pill${_exFilter.size === 0 ? ' active' : ''}" data-ex="all">All</button>` +
        availableExchanges.map(id =>
          `<button type="button" class="sp-ex-pill${_exFilter.has(id) ? ' active' : ''}" data-ex="${esc(id)}">${esc(exLabel(id))}</button>`
        ).join('');
      exFilterEl.querySelectorAll('.sp-ex-pill').forEach(b =>
        b.addEventListener('click', () => {
          const id = b.dataset.ex;
          if (id === 'all') _exFilter.clear();
          else if (_exFilter.has(id)) _exFilter.delete(id);
          else _exFilter.add(id);
          shown = PAGE;
          buildExFilter();
          render();
        })
      );
    };
    buildExFilter();

    // Build the quote-currency pills from the quotes that actually appear across
    // the enabled exchanges. If a previously chosen quote isn't available here,
    // fall back to "All" so the list is never silently empty.
    const availableQuotes = QUOTE_FILTER_ORDER.filter(qc => pairs.some(p => pairQuote(p) === qc));
    if (_quoteFilter !== 'all' && !availableQuotes.includes(_quoteFilter)) _quoteFilter = 'all';
    const buildQuoteFilter = () => {
      quoteFilterEl.innerHTML = ['all', ...availableQuotes].map(qc =>
        `<button type="button" class="sp-quote-pill${_quoteFilter === qc ? ' active' : ''}" data-quote="${qc}">${qc === 'all' ? 'All' : esc(qc)}</button>`
      ).join('');
      quoteFilterEl.querySelectorAll('.sp-quote-pill').forEach(b =>
        b.addEventListener('click', () => {
          _quoteFilter = b.dataset.quote;
          shown = PAGE;
          buildQuoteFilter();
          render();
        })
      );
    };
    buildQuoteFilter();

    render([]);
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

// ---- Search (watchlist + all pairs + CoinGecko discovery) ----
let _cgSearchTimer = null;
async function handleSearch(query) {
  const dd = document.getElementById('symSearchResults');
  if (!query) { dd.style.display = 'none'; dd.innerHTML = ''; renderSymbolList(); return; }
  const q = query.toUpperCase();
  const pairs = await fetchAllPairs();
  const results = pairs.filter(p => p.symbol.includes(q) || p.name.includes(q)).slice(0, 12);

  const multiEx = enabledExchanges().length > 1;
  const cgEx = enabledExchanges().includes('binance') ? 'binance' : (enabledExchanges()[0] || defaultExchange());
  const renderResults = (exchangeRows, cgRows) => {
    const exHtml = exchangeRows.map(r => {
      const badge = multiEx ? `<span class="search-res-ex">${esc(exLabel(r.exchange))}</span>` : '';
      return `<div class="search-res" data-sym="${r.symbol}" data-name="${esc(r.name)}" data-ex="${esc(r.exchange || defaultExchange())}">${esc(baseAsset(r.symbol))}<span>${esc(quoteAsset(r.symbol))}</span>${badge}</div>`;
    }).join('');
    const cgHtml = cgRows.length
      ? `<div class="search-sep">CoinGecko</div>` + cgRows.map(c => {
          const sym = `${c.symbol}USDT`;
          return `<div class="search-res search-res-cg" data-sym="${sym}" data-name="${esc(c.name)}" data-ex="${esc(cgEx)}"><span class="cg-badge">CG</span>${esc(c.name)}<span>${c.symbol}/USDT</span></div>`;
        }).join('')
      : '';
    dd.innerHTML = exHtml + cgHtml;
    dd.style.display = exHtml || cgHtml ? 'block' : 'none';
    dd.querySelectorAll('.search-res').forEach(el => el.addEventListener('click', () => {
      const sym = el.dataset.sym, name = el.dataset.name, ex = el.dataset.ex || defaultExchange();
      selectWatchlistSymbol(sym, name, ex);
      const wl = state.watchlists[state.currentWatchlist];
      if (!wl.some(s => s.symbol === sym && itemExchange(s) === ex)) { wl.push({ symbol: sym, name, exchange: ex }); }
      document.getElementById('symSearch').value = '';
      dd.style.display = 'none';
      renderTabs(); renderSymbolList(); scheduleAutosave();
    }));
  };

  renderResults(results, []);

  // Debounce CoinGecko search to avoid hammering the free API
  clearTimeout(_cgSearchTimer);
  _cgSearchTimer = setTimeout(async () => {
    const cgResults = await searchCoinGecko(query);
    const exchangeSyms = new Set(results.map(r => r.symbol));
    const fresh = cgResults.filter(c => !exchangeSyms.has(`${c.symbol}USDT`));
    if (fresh.length) renderResults(results, fresh);
  }, 400);
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
    if (it.disabled) { b.disabled = true; b.classList.add('ctx-disabled'); }
    else b.addEventListener('click', () => { it.fn(); closeMenu(); });
    _menu.appendChild(b);
  });
  document.body.appendChild(_menu);
  setTimeout(() => document.addEventListener('click', closeMenu, { once: true }), 0);
}
function closeMenu() { if (_menu) { _menu.remove(); _menu = null; } }
