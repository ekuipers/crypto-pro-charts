// ============================================================
// UI — topbar, indicators panel, drawing toolbar, modals, tabs
// ============================================================
import { state, drawingState } from './state.js';
import { INDICATORS_DEF, INDICATOR_DESC, COLORS, THEMES, EXCHANGES } from './constants.js';
import { indDef } from './indicators.js';
import {
  setLayout, addIndicator, removeIndicator, recomputeIndicators, setIndicatorActive,
  applyThemeToCharts, resizeAllCharts, scheduleAutosave, refreshAllPanels,
} from './charts.js';
import { setTool, clearDrawings, exportDrawings, importDrawings, undo, redo } from './drawings.js';
import { showModal, closeModal } from './alerts.js';
import {
  showSaveLayoutModal, showLayoutsModal, getNamedLayouts, applyLayoutData,
  getUserTemplates, saveUserTemplate, deleteUserTemplate,
} from './persistence.js';
import { refreshOrderBook, refreshTechInfo } from './orderbook.js';
import { setEventMarkersVisible } from './events.js';
import { refreshPaper } from './paper.js';
import { esc, clamp, toast } from './utils.js';

const TEMPLATES = {
  'Trend Setup': [['ema', { period: 20 }], ['ema', { period: 50 }], ['ema', { period: 200 }], ['supertrend', {}], ['adx', {}]],
  'Mean Reversion': [['bb', {}], ['rsi', {}], ['mfi', {}]],
  'Momentum': [['macd', {}], ['roc', {}], ['donchian', {}]],
  'Volume Focus': [['vwap', {}], ['volprofile', {}], ['obv', {}]],
};

// Inline SVG icon helper — 16×16 viewBox, stroke-based icons (19×19 rendered, +25% for readability)
const _I = d => `<svg width="19" height="19" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">${d}</svg>`;
const _S = 'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';

const DRAW_TOOLS = [
  { id: 'select', label: 'Cursor', icon: _I(`<path d="M3.5 2L3.5 12.5L6.5 9.8L8.5 14.2L10.2 13.4L8.2 9L12 9Z" fill="currentColor"/>`) },
  { id: 'trend', label: 'Trend Line', icon: _I(`<line x1="3" y1="13" x2="13" y2="3" ${_S}/><circle cx="3" cy="13" r="2" fill="currentColor"/><circle cx="13" cy="3" r="2" fill="currentColor"/>`) },
  { id: 'ray', label: 'Ray', icon: _I(`<line x1="3" y1="13" x2="12.5" y2="3.5" ${_S}/><circle cx="3" cy="13" r="2" fill="currentColor"/><path d="M12.5 3.5L10 6.5L13.5 5.5Z" fill="currentColor"/>`) },
  { id: 'extended', label: 'Extended Line', icon: _I(`<line x1="2" y1="14" x2="14" y2="2" ${_S}/><path d="M2 14L4.5 11.5L2.5 13.5Z" fill="currentColor"/><path d="M14 2L11.5 4.5L13.5 2.5Z" fill="currentColor"/>`) },
  { id: 'hline', label: 'Horizontal Line', icon: _I(`<line x1="2" y1="8" x2="14" y2="8" ${_S}/><line x1="2" y1="5" x2="2" y2="11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.45"/><line x1="14" y1="5" x2="14" y2="11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.45"/>`) },
  { id: 'vline', label: 'Vertical Line', icon: _I(`<line x1="8" y1="2" x2="8" y2="14" ${_S}/><line x1="5" y1="2" x2="11" y2="2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.45"/><line x1="5" y1="14" x2="11" y2="14" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.45"/>`) },
  { id: 'rect', label: 'Rectangle', icon: _I(`<rect x="2" y="4" width="12" height="8" rx="0.5" stroke="currentColor" stroke-width="1.5"/>`) },
  { id: 'channel', label: 'Parallel Channel', icon: _I(`<line x1="2" y1="5" x2="14" y2="3" ${_S}/><line x1="2" y1="11" x2="14" y2="9" ${_S}/><line x1="2" y1="5" x2="2" y2="11" stroke="currentColor" stroke-width="1" opacity="0.4"/><line x1="14" y1="3" x2="14" y2="9" stroke="currentColor" stroke-width="1" opacity="0.4"/>`) },
  { id: 'fibret', label: 'Fib Retracement', icon: _I(`<text x="1.5" y="8.5" font-size="5.5" font-weight="700" fill="currentColor" font-family="sans-serif">FIB</text><line x1="1" y1="10.5" x2="15" y2="10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="1" y1="7.5" x2="15" y2="7.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/><line x1="1" y1="13" x2="15" y2="13" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>`) },
  { id: 'fibext', label: 'Fib Extension', icon: _I(`<text x="1.5" y="7.5" font-size="5.5" font-weight="700" fill="currentColor" font-family="sans-serif">FIB</text><line x1="1" y1="10" x2="15" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="1" y1="12.5" x2="15" y2="12.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/><path d="M12.5 8.5L15 10L12.5 11.5" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round"/>`) },
  { id: 'fibtime', label: 'Fib Time Zones', icon: _I(`<line x1="2" y1="2" x2="2" y2="14" stroke="currentColor" stroke-width="1.2" opacity="0.6"/><line x1="5" y1="2" x2="5" y2="14" stroke="currentColor" stroke-width="1.2" opacity="0.6"/><line x1="9" y1="2" x2="9" y2="14" stroke="currentColor" stroke-width="1.2" opacity="0.6"/><line x1="14" y1="2" x2="14" y2="14" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>`) },
  { id: 'pitchfork', label: 'Pitchfork', icon: _I(`<path d="M2 13L8 3" ${_S}/><path d="M8 3L13 6" ${_S}/><path d="M8 3L13 10" ${_S}/><circle cx="2" cy="13" r="1.3" fill="currentColor"/><circle cx="13" cy="6" r="1.3" fill="currentColor"/><circle cx="13" cy="10" r="1.3" fill="currentColor"/>`) },
  { id: 'long', label: 'Long Position', icon: _I(`<path d="M2 12L14 4" ${_S} stroke="#26a69a"/><rect x="2" y="4" width="12" height="6" fill="#26a69a" opacity="0.25"/>`) },
  { id: 'short', label: 'Short Position', icon: _I(`<path d="M2 4L14 12" ${_S} stroke="#ef5350"/><rect x="2" y="8" width="12" height="6" fill="#ef5350" opacity="0.25"/>`) },
  { id: 'text', label: 'Text', icon: _I(`<text x="2.5" y="13" font-size="12" font-weight="700" fill="currentColor" font-family="serif">A</text><line x1="1" y1="14.5" x2="15" y2="14.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`) },
  { id: 'measure', label: 'Measure', icon: _I(`<line x1="3" y1="8" x2="13" y2="8" ${_S}/><line x1="3" y1="5.5" x2="3" y2="10.5" ${_S}/><line x1="13" y1="5.5" x2="13" y2="10.5" ${_S}/><path d="M3 8L6 6.5M3 8L6 9.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><path d="M13 8L10 6.5M13 8L10 9.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>`) },
  { id: 'eraser', label: 'Eraser', icon: _I(`<path d="M9.5 2.5L13.5 6.5L8 12H4L2 10L7.5 4.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><line x1="4" y1="12" x2="14" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="7.2" y1="5.8" x2="11.2" y2="9.8" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.4"/>`) },
];

export function initUI() {
  buildIndicatorDropdown();
  buildDrawingToolbar();
  wireTopbar();
  wireRightTabs();
  document.addEventListener('active-symbol-changed', () => { renderIndChips(); refreshOrderBook(); refreshTechInfo(); });
  document.addEventListener('indicators-changed', renderIndChips);
  // open-indicators (fired by the panel's ƒ button) now opens the topbar dropdown.
  document.addEventListener('open-indicators', openIndDropdown);
  document.addEventListener('open-symbol-search', () => { document.getElementById('symSearch')?.focus(); });
  document.addEventListener('keydown', onKey);
  renderIndChips();
}

// ---------- Indicator picker dropdown (Roadmap 2) ----------
function buildIndicatorDropdown() {
  const list   = document.getElementById('indList');
  const filter = document.getElementById('indFilter');
  if (!list || !filter) return;
  const render = () => {
    const q = (filter.value || '').toLowerCase();
    list.innerHTML = '';
    INDICATORS_DEF.filter(d => d.name.toLowerCase().includes(q) || d.full.toLowerCase().includes(q)).forEach(d => {
      const b = document.createElement('button');
      b.className = 'ind-item';
      b.innerHTML = `<span class="ind-tag ${d.type}">${d.type === 'overlay' ? 'O' : 'S'}</span><span class="ind-name">${d.name}</span><span class="ind-full">${esc(d.full)}</span>`;
      const desc = INDICATOR_DESC[d.id] || d.full;
      b.addEventListener('mouseenter', () => showIndTooltip(b, d.full, desc));
      b.addEventListener('mouseleave', hideIndTooltip);
      b.addEventListener('click', () => {
        hideIndTooltip();
        if (!state.activePanel) return;
        if (d.params.length) showIndicatorModal(d.id);
        else addIndicator(state.activePanel, d.id);
        // Keep dropdown open so the user can add multiple indicators.
      });
      list.appendChild(b);
    });
  };
  filter.addEventListener('input', render);
  render();
}

function openIndDropdown() {
  const drop = document.getElementById('indDropdown');
  const btn  = document.getElementById('indDropBtn');
  if (!drop) return;
  const open = drop.style.display !== 'none';
  if (open) { closeIndDropdown(); return; }
  // Position below the button.
  const r = btn?.getBoundingClientRect();
  if (r) { drop.style.left = r.left + 'px'; drop.style.top = r.bottom + 4 + 'px'; }
  drop.style.display = 'flex';
  document.getElementById('indFilter')?.focus();
}

function closeIndDropdown() {
  const drop = document.getElementById('indDropdown');
  if (drop) drop.style.display = 'none';
}

// ---------- Indicator hover tooltip ----------
let _indTip = null;
function showIndTooltip(anchor, title, desc) {
  hideIndTooltip();
  _indTip = document.createElement('div');
  _indTip.className = 'ind-tooltip';
  _indTip.innerHTML = `<div class="ind-tt-title">${esc(title)}</div><div class="ind-tt-desc">${esc(desc)}</div>`;
  document.body.appendChild(_indTip);
  const a = anchor.getBoundingClientRect();
  const t = _indTip.getBoundingClientRect();
  // Prefer to the right of the indicator pane; flip left if it would overflow.
  let left = a.right + 10;
  if (left + t.width > window.innerWidth - 8) left = Math.max(8, a.left - t.width - 10);
  let top = Math.min(a.top, window.innerHeight - t.height - 8);
  _indTip.style.left = left + 'px';
  _indTip.style.top = Math.max(8, top) + 'px';
  requestAnimationFrame(() => _indTip && _indTip.classList.add('show'));
}
function hideIndTooltip() {
  if (_indTip) { _indTip.remove(); _indTip = null; }
}

export function renderIndChips() {
  const wrap = document.getElementById('indChips');
  if (!wrap) return;
  const panel = state.activePanel;
  wrap.innerHTML = '';
  if (!panel) return;
  panel.indicators.forEach(ind => {
    const def = indDef(ind.defId);
    const inactive = ind.active === false;
    const chip = document.createElement('div');
    chip.className = inactive ? 'ind-chip inactive' : 'ind-chip';
    chip.innerHTML = `<span class="chip-dot" style="background:${ind.color}" title="Edit settings"></span><span class="chip-name" title="Click to hide / show">${def.name}</span><button class="chip-x" title="Remove">×</button>`;
    // Click the name toggles the indicator on/off (dimmed when off); the colored
    // dot opens settings; × removes it entirely.
    chip.querySelector('.chip-name').addEventListener('click', () => setIndicatorActive(panel, ind, ind.active === false));
    chip.querySelector('.chip-dot').addEventListener('click', () => showIndicatorModal(ind.defId, ind, panel));
    chip.querySelector('.chip-x').addEventListener('click', () => removeIndicator(panel, ind));
    wrap.appendChild(chip);
  });
}

export function showIndicatorModal(defId, existingInd = null, panel = state.activePanel) {
  const def = indDef(defId);
  if (!def || !panel) return;
  const cur = existingInd ? existingInd.params : {};
  const color = existingInd ? existingInd.color : def.color;
  const paramsHtml = def.params.map(p => `
    <label>${esc(p.l)}<input type="number" data-p="${p.n}" value="${cur[p.n] ?? p.d}" min="${p.mn}" max="${p.mx}" step="${p.s || 1}"></label>`).join('');
  const colorsHtml = COLORS.map(c => `<button class="color-sw ${c === color ? 'sel' : ''}" data-c="${c}" style="background:${c}"></button>`).join('');
  showModal(`
    <h3>${existingInd ? 'Edit' : 'Add'} ${esc(def.full)}</h3>
    ${paramsHtml || '<p class="muted">No parameters.</p>'}
    <div class="color-row">${colorsHtml}</div>
    <div class="modal-actions"><button id="indCancel">Cancel</button><button id="indSave" class="primary-btn">${existingInd ? 'Update' : 'Add'}</button></div>`, m => {
    let chosen = color;
    m.querySelectorAll('.color-sw').forEach(b => b.addEventListener('click', () => {
      chosen = b.dataset.c; m.querySelectorAll('.color-sw').forEach(x => x.classList.remove('sel')); b.classList.add('sel');
    }));
    m.querySelector('#indCancel').addEventListener('click', closeModal);
    m.querySelector('#indSave').addEventListener('click', () => {
      const params = {};
      m.querySelectorAll('input[data-p]').forEach(inp => {
        const def2 = def.params.find(x => x.n === inp.dataset.p);
        params[inp.dataset.p] = clamp(parseFloat(inp.value), def2.mn, def2.mx);
      });
      if (existingInd) {
        existingInd.params = params; existingInd.color = chosen;
        recomputeIndicators(panel); renderIndChips(); scheduleAutosave();
      } else {
        addIndicator(panel, defId, params, chosen);
      }
      closeModal();
    });
  });
}

// ---------- Layout selector dropdown ----------
const LAYOUT_NAMES = { l1: 'Single', l2h: '2 Columns', l2v: '2 Rows', l4: '4 Grid', l6: '6 Grid', l8: '8 Grid' };
const LAYOUT_ICONS = { l1: '▢', l2h: '▢▢', l2v: '⊟', l4: '⊞', l6: '⊞⊞', l8: '⊞⊞⊞' };

export function updateLayoutDropBtn() {
  const btn = document.getElementById('layoutDropBtn');
  if (!btn) return;
  const name = LAYOUT_NAMES[state.layout] || state.layout;
  btn.textContent = `${LAYOUT_ICONS[state.layout] || ''} ${name} ▾`.trim();
}

async function openLayoutDropdown() {
  const menu = document.getElementById('layoutDropMenu');
  const btn = document.getElementById('layoutDropBtn');
  if (!menu || !btn) return;
  if (menu.style.display !== 'none') { closeLayoutDropdown(); return; }

  // Build preset section
  const presetItems = Object.entries(LAYOUT_NAMES).map(([key, name]) =>
    `<button class="ld-item${state.layout === key ? ' active' : ''}" data-preset="${key}">
       <span class="ld-icon">${LAYOUT_ICONS[key]}</span>${name}
     </button>`).join('');

  // Load saved layouts
  let savedHtml = '';
  try {
    const saved = await getNamedLayouts();
    const keys = Object.keys(saved);
    if (keys.length) {
      savedHtml = `<div class="ld-sep">Saved</div>` +
        keys.map(k => `<button class="ld-item" data-saved="${esc(k)}"><span class="ld-icon">📋</span>${esc(k)}</button>`).join('');
    }
  } catch {}

  menu.innerHTML = `<div class="ld-sep">Presets</div>${presetItems}${savedHtml}`;

  // Wire clicks
  menu.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => {
    setLayout(b.dataset.preset);
    scheduleAutosave();
    updateLayoutDropBtn();
    closeLayoutDropdown();
  }));
  menu.querySelectorAll('[data-saved]').forEach(b => b.addEventListener('click', async () => {
    const all = await getNamedLayouts();
    const data = all[b.dataset.saved];
    if (data) { applyLayoutData(data); document.dispatchEvent(new CustomEvent('layout-restored')); }
    closeLayoutDropdown();
  }));

  // Position below button
  const r = btn.getBoundingClientRect();
  menu.style.left = r.left + 'px';
  menu.style.top = r.bottom + 4 + 'px';
  menu.style.display = 'block';
}

function closeLayoutDropdown() {
  const menu = document.getElementById('layoutDropMenu');
  if (menu) menu.style.display = 'none';
}

// ---------- Drawing toolbar ----------
function buildDrawingToolbar() {
  const tb = document.getElementById('drawToolbar');
  tb.innerHTML = `<input type="color" id="drawColor" value="${drawingState.color}" title="Color">`;
  DRAW_TOOLS.forEach(t => {
    const b = document.createElement('button');
    b.className = 'draw-tool' + (t.id === 'select' ? ' active' : '');
    b.dataset.tool = t.id; b.title = t.label; b.innerHTML = t.icon;
    b.addEventListener('click', () => selectTool(t.id));
    tb.appendChild(b);
  });
  const exp = document.createElement('button'); exp.className = 'draw-tool'; exp.title = 'Export drawings';
  exp.innerHTML = _I(`<path d="M8 3v7M5 8l3 3 3-3" ${_S}/><line x1="3" y1="13" x2="13" y2="13" ${_S}/>`);
  exp.addEventListener('click', () => state.activePanel && exportDrawings(state.activePanel));
  const imp = document.createElement('button'); imp.className = 'draw-tool'; imp.title = 'Import drawings';
  imp.innerHTML = _I(`<path d="M8 10V3M5 6l3-3 3 3" ${_S}/><line x1="3" y1="13" x2="13" y2="13" ${_S}/>`);
  imp.addEventListener('click', () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
    inp.onchange = () => inp.files[0] && state.activePanel && importDrawings(state.activePanel, inp.files[0]);
    inp.click();
  });
  const clr = document.createElement('button'); clr.className = 'draw-tool clear'; clr.title = 'Clear all drawings';
  clr.innerHTML = _I(`<path d="M4 6h8v7a1 1 0 01-1 1H5a1 1 0 01-1-1V6z" ${_S}/><path d="M3 6h10" ${_S}/><path d="M6 6V4.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V6" ${_S}/>`);
  clr.addEventListener('click', () => state.activePanel && clearDrawings(state.activePanel));
  // P2-11: magnet — snap new drawing points to the nearest bar's OHLC price.
  const mag = document.createElement('button'); mag.className = 'draw-tool magnet-tool'; mag.title = 'Magnet: snap to OHLC';
  mag.innerHTML = _I(`<path d="M4 2v6a4 4 0 008 0V2" ${_S}/><path d="M4 2H2v6a6 6 0 0012 0V2h-2" ${_S}/><line x1="4" y1="4.5" x2="6" y2="4.5" stroke="currentColor" stroke-width="1.2"/><line x1="10" y1="4.5" x2="12" y2="4.5" stroke="currentColor" stroke-width="1.2"/>`);
  mag.addEventListener('click', () => { drawingState.magnet = !drawingState.magnet; mag.classList.toggle('active', drawingState.magnet); });
  tb.append(exp, imp, clr, mag);

  document.getElementById('drawColor').addEventListener('input', e => { drawingState.color = e.target.value; });
}

function selectTool(id) {
  setTool(id);
  document.querySelectorAll('.draw-tool[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === id));
}

// ---------- Topbar ----------
function wireTopbar() {
  // Indicators dropdown button.
  document.getElementById('indDropBtn').addEventListener('click', openIndDropdown);

  // Layout dropdown button.
  document.getElementById('layoutDropBtn').addEventListener('click', openLayoutDropdown);

  // Close dropdowns when clicking outside them.
  document.addEventListener('click', e => {
    const indDrop = document.getElementById('indDropdown');
    const indBtn = document.getElementById('indDropBtn');
    if (!indDrop?.contains(e.target) && e.target !== indBtn) closeIndDropdown();

    const ldMenu = document.getElementById('layoutDropMenu');
    const ldBtn = document.getElementById('layoutDropBtn');
    if (!ldMenu?.contains(e.target) && e.target !== ldBtn) closeLayoutDropdown();
  }, true);

  // Event markers toggle button.
  document.getElementById('evtMarkersBtn').addEventListener('click', () => {
    const btn = document.getElementById('evtMarkersBtn');
    const next = !state.showEventMarkers;
    setEventMarkersVisible(next);
    btn.classList.toggle('active', next);
  });

  document.getElementById('toggleRight').addEventListener('click', () => { document.getElementById('rightPanel').classList.toggle('collapsed'); resizeAllCharts(); });

  // Refresh all charts in one click — drops the kline cache and reloads every
  // panel. Disable + spin the button while in flight so rapid clicks can't pile
  // up overlapping refreshes.
  document.getElementById('refreshAllBtn').addEventListener('click', async () => {
    const btn = document.getElementById('refreshAllBtn');
    if (btn.disabled) return;
    btn.disabled = true;
    btn.classList.add('spinning');
    try { await refreshAllPanels(); toast('Charts refreshed', 'info'); }
    catch { toast('Refresh failed', 'error'); }
    finally { btn.disabled = false; btn.classList.remove('spinning'); }
  });

  document.getElementById('themeToggle').addEventListener('click', showThemeMenu);
  document.getElementById('saveBtn').addEventListener('click', showSaveLayoutModal);
  document.getElementById('layoutsBtn').addEventListener('click', showLayoutsModal);
  document.getElementById('templatesBtn').addEventListener('click', showTemplatesModal);

  updateLayoutDropBtn();
}

export function applyTheme(key) {
  if (!THEMES[key]) return;
  state.theme = key;
  document.documentElement.dataset.theme = key;
  applyThemeToCharts();
  scheduleAutosave();
}

function showThemeMenu() {
  const cards = Object.entries(THEMES).map(([key, t]) => {
    const c = t.chart;
    const sel = key === state.theme ? ' sel' : '';
    return `<button class="theme-card${sel}" data-key="${key}">
      <span class="theme-swatch" style="background:${c.bg};border-color:${c.border}">
        <span style="background:${c.accent}"></span>
        <span style="background:${c.text}"></span>
        <span style="background:${c.grid}"></span>
      </span>
      <span class="theme-name">${esc(t.label)}</span>
      <span class="theme-mode">${t.mode}</span>
    </button>`;
  }).join('');
  showModal(`<h3>Color Theme</h3><div class="theme-grid">${cards}</div>
    <div class="modal-actions"><button id="thClose">Close</button></div>`, m => {
    m.querySelector('#thClose').addEventListener('click', closeModal);
    m.querySelectorAll('.theme-card').forEach(b => b.addEventListener('click', () => {
      applyTheme(b.dataset.key);
      m.querySelectorAll('.theme-card').forEach(x => x.classList.toggle('sel', x === b));
    }));
  });
}

async function showTemplatesModal() {
  const builtinCards = Object.entries(TEMPLATES).map(([name, inds]) =>
    `<button class="tpl-card" data-name="${esc(name)}"><b>${esc(name)}</b><span>${inds.map(i => indDef(i[0])?.name).join(', ')}</span></button>`).join('');

  const userTpls = await getUserTemplates();
  const userNames = Object.keys(userTpls);
  const userCards = userNames.length ? userNames.map(name => `
    <div class="tpl-user-row">
      <button class="tpl-card tpl-user" data-user="${esc(name)}">
        <b>${esc(name)}</b><span>${(userTpls[name] || []).map(i => indDef(i.defId)?.name).filter(Boolean).join(', ') || 'Empty'}</span>
      </button>
      <button class="tpl-user-del" data-del="${esc(name)}" title="Delete template">✕</button>
    </div>`).join('') : '<p class="muted">No saved templates yet — set up indicators on a chart, then "Save current as template".</p>';

  showModal(`<h3>Indicator Templates</h3>
    <div class="tpl-sep">Presets</div>
    <div class="tpl-grid">${builtinCards}</div>
    <div class="tpl-sep">My Templates</div>
    <div class="tpl-user-list">${userCards}</div>
    <div class="modal-actions"><button id="tplSaveCur">Save current as template</button><button id="tplClose">Close</button></div>`, m => {
    m.querySelector('#tplClose').addEventListener('click', closeModal);
    m.querySelectorAll('.tpl-card:not(.tpl-user)').forEach(c => c.addEventListener('click', () => {
      const panel = state.activePanel; if (!panel) return;
      TEMPLATES[c.dataset.name].forEach(([id, params]) => addIndicator(panel, id, params));
      closeModal();
    }));
    m.querySelectorAll('.tpl-user').forEach(c => c.addEventListener('click', () => {
      const panel = state.activePanel; if (!panel) return;
      (userTpls[c.dataset.user] || []).forEach(i => addIndicator(panel, i.defId, i.params, i.color));
      closeModal();
    }));
    m.querySelectorAll('.tpl-user-del').forEach(b => b.addEventListener('click', async e => {
      e.stopPropagation();
      await deleteUserTemplate(b.dataset.del);
      showTemplatesModal();
    }));
    m.querySelector('#tplSaveCur').addEventListener('click', () => {
      const panel = state.activePanel;
      if (!panel || !panel.indicators.length) { toast('Active chart has no indicators to save', 'warn'); return; }
      const name = prompt('Template name:');
      if (!name) return;
      const inds = panel.indicators.map(i => ({ defId: i.defId, params: i.params, color: i.color }));
      saveUserTemplate(name.trim(), inds).then(() => showTemplatesModal());
    });
  });
}

// ---------- Right panel tabs ----------
function wireRightTabs() {
  document.querySelectorAll('.right-tab').forEach(t => t.addEventListener('click', () => {
    const id = t.dataset.tab;
    state.rightTab = id;
    document.querySelectorAll('.right-tab').forEach(x => x.classList.toggle('active', x === t));
    document.querySelectorAll('.right-tab-content').forEach(c => c.classList.toggle('active', c.dataset.tab === id));
    if (id === 'orderbook') refreshOrderBook();
    if (id === 'techinfo') refreshTechInfo();
    if (id === 'paper') refreshPaper();
  }));
}

// ---------- WS status ----------
export function updateWSStatus(s) {
  const dot = document.getElementById('wsStatus');
  if (!dot) return;
  dot.className = 'ws-status ' + (s || '');
  const ids = (Array.isArray(state.settings.exchanges) && state.settings.exchanges.length
    ? state.settings.exchanges
    : [state.settings.exchange || 'binance']).filter(id => EXCHANGES[id]);
  const names = ids.map(id => EXCHANGES[id].name);
  const stateLabel = s || 'idle';
  const summary = names.length === 1 ? names[0] : `${names.length} exchanges`;
  dot.title = `${names.join(', ')}: ${stateLabel}`;
  const exLabel = document.getElementById('wsExchange');
  if (exLabel) {
    exLabel.textContent = summary;
    exLabel.title = names.join(', ');
  }
}

// ---------- Keyboard ----------
function onKey(e) {
  if (e.target.matches('input, textarea, select')) return;
  // Escape always works (even with a modal open, to close it) — everything
  // else below is a global shortcut that must not fire behind an open modal
  // (none of the modals opened via showModal()/showThemeMenu()/etc. trap
  // focus or stop propagation, so without this guard e.g. pressing "t" while
  // the Settings modal is open silently switches the active drawing tool).
  if (e.key === 'Escape') { closeModal(); selectTool('select'); state.activePanel?._cancelDraw?.(); return; }
  if (document.getElementById('modalOverlay')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); showSaveLayoutModal(); return; }
  // P3-24: Ctrl/Cmd+Z undo, Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z redo (on the active chart's drawings).
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo(state.activePanel); else undo(state.activePanel);
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(state.activePanel); return; }
  // Single-letter tool shortcuts must not fire alongside a modifier — otherwise
  // e.g. Ctrl+V (paste), Ctrl+F (find), Ctrl+T/R (tab/refresh) or Alt+Backspace
  // (back navigation) anywhere on the page also silently switches drawing tools.
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const map = { t: 'trend', h: 'hline', v: 'vline', r: 'rect', f: 'fibret', m: 'measure' };
  if (map[e.key.toLowerCase()]) selectTool(map[e.key.toLowerCase()]);
  if (e.key === 'Backspace' || e.key === 'Delete') selectTool('eraser');
}
