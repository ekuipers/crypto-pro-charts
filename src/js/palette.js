// ============================================================
// COMMAND PALETTE (P3-22) — Ctrl/Cmd+K: instant symbol search/switch and
// an action launcher, TradingView-style.
// ============================================================
import { state } from './state.js';
import { esc, baseAsset, quoteAsset } from './utils.js';
import { showModal, closeModal } from './alerts.js';
import { fetchAllPairs, defaultExchange } from './data.js';
import { setLayout, selectWatchlistSymbol, toggleDerivatives, scheduleAutosave } from './charts.js';
import { exportPanelPNG, exportPanelCSV } from './snapshot.js';

// Actions that just replay an existing topbar button's click handler reuse
// the button directly instead of duplicating its logic here.
const clickAction = (id) => () => document.getElementById(id)?.click();

function actions() {
  const panel = state.activePanel;
  return [
    { label: 'Layout: Single chart', hint: 'Layout', run: () => setLayout('l1') },
    { label: 'Layout: 2 columns', hint: 'Layout', run: () => setLayout('l2h') },
    { label: 'Layout: 2 rows', hint: 'Layout', run: () => setLayout('l2v') },
    { label: 'Layout: 4-chart grid', hint: 'Layout', run: () => setLayout('l4') },
    { label: 'Layout: 6-chart grid', hint: 'Layout', run: () => setLayout('l6') },
    { label: 'Layout: 8-chart grid', hint: 'Layout', run: () => setLayout('l8') },
    { label: 'Toggle watchlist panel', hint: 'View', run: clickAction('toggleRight') },
    { label: 'Toggle color theme', hint: 'View', run: clickAction('themeToggle') },
    { label: 'Toggle event markers', hint: 'View', run: clickAction('evtMarkersBtn') },
    { label: 'Refresh all charts', hint: 'Action', run: clickAction('refreshAllBtn') },
    { label: 'Save current layout…', hint: 'Layout', run: clickAction('saveBtn') },
    { label: 'Open saved layouts…', hint: 'Layout', run: clickAction('layoutsBtn') },
    { label: 'Open indicator templates…', hint: 'Indicators', run: clickAction('templatesBtn') },
    { label: 'Open alerts…', hint: 'Alerts', run: clickAction('alertsBtn') },
    { label: 'Open settings…', hint: 'Settings', run: clickAction('settingsBtn') },
    { label: 'Sign in / account…', hint: 'Account', run: clickAction('accountBtn') },
    ...(panel ? [
      { label: `Toggle derivatives overlay (${baseAsset(panel.symbol)})`, hint: 'Chart', run: () => toggleDerivatives(panel) },
      { label: `Toggle bar replay (${baseAsset(panel.symbol)})`, hint: 'Chart', run: () => document.dispatchEvent(new CustomEvent('toggle-replay', { detail: { panel } })) },
      { label: `Export chart as PNG (${baseAsset(panel.symbol)})`, hint: 'Export', run: () => exportPanelPNG(panel) },
      { label: `Export visible bars as CSV (${baseAsset(panel.symbol)})`, hint: 'Export', run: () => exportPanelCSV(panel) },
    ] : []),
  ];
}

function scoreMatch(q, text) {
  const t = text.toLowerCase();
  const i = t.indexOf(q);
  if (i < 0) return -1;
  return (i === 0 ? 1000 : 100) - i; // prefix matches rank highest
}

async function buildResults(query) {
  const q = query.trim().toLowerCase();
  const acts = actions()
    .map(a => ({ kind: 'action', ...a, score: q ? scoreMatch(q, a.label) : 0 }))
    .filter(a => !q || a.score >= 0);

  if (!q) return acts.slice(0, 8);

  let pairs = [];
  try { pairs = await fetchAllPairs(); } catch { pairs = []; }
  const symResults = pairs
    .map(p => ({ kind: 'symbol', symbol: p.symbol, name: p.name, exchange: p.exchange, score: scoreMatch(q, p.symbol) }))
    .filter(p => p.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  return [...symResults, ...acts.sort((a, b) => b.score - a.score)].slice(0, 14);
}

let selectedIdx = 0;

export function initCommandPalette() {
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      open();
    }
  });
}

async function open() {
  showModal(`
    <input id="cmdkInput" class="cmdk-input" placeholder="Search symbols or type a command…" autocomplete="off">
    <div id="cmdkList" class="cmdk-list"></div>`, async m => {
    m.classList.add('cmdk-modal');
    const input = m.querySelector('#cmdkInput');
    const list = m.querySelector('#cmdkList');
    input.focus();
    selectedIdx = 0;

    let current = [];
    const render = async () => {
      current = await buildResults(input.value);
      selectedIdx = Math.min(selectedIdx, Math.max(0, current.length - 1));
      list.innerHTML = current.length ? current.map((r, i) => `
        <div class="cmdk-item${i === selectedIdx ? ' sel' : ''}" data-i="${i}">
          ${r.kind === 'symbol'
            ? `<span class="cmdk-sym">${esc(baseAsset(r.symbol))}<span class="sym-quote-tag">${esc(quoteAsset(r.symbol))}</span></span><span class="cmdk-hint">${esc(r.exchange)}</span>`
            : `<span class="cmdk-sym">${esc(r.label)}</span><span class="cmdk-hint">${esc(r.hint)}</span>`}
        </div>`).join('') : '<div class="muted" style="padding:14px">No matches</div>';
      list.querySelectorAll('.cmdk-item').forEach(el => {
        el.addEventListener('mouseenter', () => { selectedIdx = +el.dataset.i; updateSel(); });
        el.addEventListener('click', () => choose(+el.dataset.i));
      });
    };
    const updateSel = () => list.querySelectorAll('.cmdk-item').forEach(el => el.classList.toggle('sel', +el.dataset.i === selectedIdx));

    const choose = (i) => {
      const r = current[i];
      if (!r) return;
      closeModal();
      if (r.kind === 'symbol') {
        const panel = state.activePanel;
        if (panel) selectWatchlistSymbol(r.symbol, r.name, r.exchange || defaultExchange());
        scheduleAutosave();
      } else {
        r.run();
      }
    };

    input.addEventListener('input', render);
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); selectedIdx = Math.min(selectedIdx + 1, current.length - 1); updateSel(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); selectedIdx = Math.max(selectedIdx - 1, 0); updateSel(); }
      else if (e.key === 'Enter') { e.preventDefault(); choose(selectedIdx); }
      else if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
    });

    await render();
  });
}
