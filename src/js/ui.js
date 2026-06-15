// ============================================================
// UI — topbar, indicators panel, drawing toolbar, modals, tabs
// ============================================================
import { state, drawingState } from './state.js';
import { INDICATORS_DEF, INDICATOR_DESC, COLORS, THEMES, EXCHANGES } from './constants.js';
import { indDef } from './indicators.js';
import {
  setLayout, addIndicator, removeIndicator, recomputeIndicators,
  applyThemeToCharts, resizeAllCharts, scheduleAutosave,
} from './charts.js';
import { setTool, clearDrawings, exportDrawings, importDrawings } from './drawings.js';
import { showModal, closeModal } from './alerts.js';
import { showSaveLayoutModal, showLayoutsModal, getNamedLayouts, applyLayoutData } from './persistence.js';
import { refreshOrderBook, refreshTechInfo } from './orderbook.js';
import { setEventMarkersVisible } from './events.js';
import { esc, clamp } from './utils.js';

const TEMPLATES = {
  'Trend Setup': [['ema', { period: 20 }], ['ema', { period: 50 }], ['ema', { period: 200 }], ['supertrend', {}], ['adx', {}]],
  'Mean Reversion': [['bb', {}], ['rsi', {}], ['mfi', {}]],
  'Momentum': [['macd', {}], ['roc', {}], ['donchian', {}]],
  'Volume Focus': [['vwap', {}], ['volprofile', {}], ['obv', {}]],
};

const DRAW_TOOLS = [
  { id: 'select', icon: '⤧', label: 'Cursor' },
  { id: 'trend', icon: '╱', label: 'Trend Line' },
  { id: 'ray', icon: '→', label: 'Ray' },
  { id: 'extended', icon: '↔', label: 'Extended Line' },
  { id: 'hline', icon: '─', label: 'Horizontal Line' },
  { id: 'vline', icon: '│', label: 'Vertical Line' },
  { id: 'rect', icon: '▭', label: 'Rectangle' },
  { id: 'channel', icon: '▱', label: 'Parallel Channel' },
  { id: 'fibret', icon: 'F', label: 'Fib Retracement' },
  { id: 'fibext', icon: 'E', label: 'Fib Extension' },
  { id: 'text', icon: 'T', label: 'Text' },
  { id: 'measure', icon: '⊿', label: 'Measure' },
  { id: 'eraser', icon: '⌫', label: 'Eraser' },
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
    const chip = document.createElement('div');
    chip.className = 'ind-chip';
    chip.innerHTML = `<span class="chip-dot" style="background:${ind.color}"></span><span class="chip-name">${def.name}</span><button class="chip-x">×</button>`;
    chip.querySelector('.chip-name').addEventListener('click', () => showIndicatorModal(ind.defId, ind, panel));
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
const LAYOUT_NAMES = { l1: 'Single', l2h: '2 Columns', l2v: '2 Rows', l4: '4 Grid' };
const LAYOUT_ICONS = { l1: '▢', l2h: '▢▢', l2v: '⊟', l4: '⊞' };

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
    b.dataset.tool = t.id; b.title = t.label; b.textContent = t.icon;
    b.addEventListener('click', () => selectTool(t.id));
    tb.appendChild(b);
  });
  const exp = document.createElement('button'); exp.className = 'draw-tool'; exp.title = 'Export'; exp.textContent = '↓';
  exp.addEventListener('click', () => state.activePanel && exportDrawings(state.activePanel));
  const imp = document.createElement('button'); imp.className = 'draw-tool'; imp.title = 'Import'; imp.textContent = '↑';
  imp.addEventListener('click', () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
    inp.onchange = () => inp.files[0] && state.activePanel && importDrawings(state.activePanel, inp.files[0]);
    inp.click();
  });
  const clr = document.createElement('button'); clr.className = 'draw-tool clear'; clr.title = 'Clear All'; clr.textContent = '🗑';
  clr.addEventListener('click', () => state.activePanel && clearDrawings(state.activePanel));
  tb.append(exp, imp, clr);

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

function showTemplatesModal() {
  const cards = Object.entries(TEMPLATES).map(([name, inds]) =>
    `<button class="tpl-card" data-name="${esc(name)}"><b>${esc(name)}</b><span>${inds.map(i => indDef(i[0])?.name).join(', ')}</span></button>`).join('');
  showModal(`<h3>Indicator Templates</h3><div class="tpl-grid">${cards}</div>
    <div class="modal-actions"><button id="tplClose">Close</button></div>`, m => {
    m.querySelector('#tplClose').addEventListener('click', closeModal);
    m.querySelectorAll('.tpl-card').forEach(c => c.addEventListener('click', () => {
      const panel = state.activePanel; if (!panel) return;
      TEMPLATES[c.dataset.name].forEach(([id, params]) => addIndicator(panel, id, params));
      closeModal();
    }));
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
  }));
}

// ---------- WS status ----------
export function updateWSStatus(s) {
  const dot = document.getElementById('wsStatus');
  if (!dot) return;
  dot.className = 'ws-status ' + (s || '');
  const ex = EXCHANGES[state.settings.exchange] || EXCHANGES.binance;
  const stateLabel = s || 'idle';
  dot.title = `${ex.name}: ${stateLabel}`;
  const exLabel = document.getElementById('wsExchange');
  if (exLabel) {
    exLabel.textContent = ex.name;
    exLabel.title = `${ex.name} — ${ex.status}`;
  }
}

// ---------- Keyboard ----------
function onKey(e) {
  if (e.target.matches('input, textarea, select')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); showSaveLayoutModal(); return; }
  const map = { t: 'trend', h: 'hline', v: 'vline', r: 'rect', f: 'fibret', m: 'measure' };
  if (map[e.key.toLowerCase()]) selectTool(map[e.key.toLowerCase()]);
  if (e.key === 'Backspace' || e.key === 'Delete') selectTool('eraser');
  if (e.key === 'Escape') { selectTool('select'); state.activePanel?._cancelDraw?.(); closeModal(); }
}
