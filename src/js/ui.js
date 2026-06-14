// ============================================================
// UI — topbar, indicators panel, drawing toolbar, modals, tabs
// ============================================================
import { state, drawingState } from './state.js';
import { INDICATORS_DEF, COLORS } from './constants.js';
import { indDef } from './indicators.js';
import {
  setLayout, addIndicator, removeIndicator, recomputeIndicators,
  applyThemeToCharts, resizeAllCharts, scheduleAutosave,
} from './charts.js';
import { setTool, clearDrawings, exportDrawings, importDrawings } from './drawings.js';
import { showModal, closeModal } from './alerts.js';
import { showSaveLayoutModal, showLayoutsModal } from './persistence.js';
import { refreshOrderBook, refreshTechInfo } from './orderbook.js';
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
  buildIndicatorPanel();
  buildDrawingToolbar();
  wireTopbar();
  wireRightTabs();
  document.addEventListener('active-symbol-changed', () => { renderIndChips(); refreshOrderBook(); refreshTechInfo(); });
  document.addEventListener('indicators-changed', renderIndChips);
  document.addEventListener('open-indicators', () => document.getElementById('leftPanel').classList.remove('collapsed'));
  document.addEventListener('open-symbol-search', () => { document.getElementById('symSearch')?.focus(); });
  document.addEventListener('keydown', onKey);
  renderIndChips();
}

// ---------- Indicators left panel ----------
function buildIndicatorPanel() {
  const list = document.getElementById('indList');
  const filter = document.getElementById('indFilter');
  const render = () => {
    const q = (filter.value || '').toLowerCase();
    list.innerHTML = '';
    INDICATORS_DEF.filter(d => d.name.toLowerCase().includes(q) || d.full.toLowerCase().includes(q)).forEach(d => {
      const b = document.createElement('button');
      b.className = 'ind-item';
      b.innerHTML = `<span class="ind-tag ${d.type}">${d.type === 'overlay' ? 'O' : 'S'}</span><span class="ind-name">${d.name}</span><span class="ind-full">${esc(d.full)}</span>`;
      b.addEventListener('click', () => {
        if (!state.activePanel) return;
        if (d.params.length) showIndicatorModal(d.id);
        else addIndicator(state.activePanel, d.id);
      });
      list.appendChild(b);
    });
  };
  filter.addEventListener('input', render);
  render();
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
  document.getElementById('toggleLeft').addEventListener('click', () => { document.getElementById('leftPanel').classList.toggle('collapsed'); resizeAllCharts(); });
  document.getElementById('toggleRight').addEventListener('click', () => { document.getElementById('rightPanel').classList.toggle('collapsed'); resizeAllCharts(); });

  document.querySelectorAll('.layout-opt').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.layout-opt').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    setLayout(b.dataset.layout); scheduleAutosave();
  }));

  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  document.getElementById('saveBtn').addEventListener('click', showSaveLayoutModal);
  document.getElementById('layoutsBtn').addEventListener('click', showLayoutsModal);
  document.getElementById('templatesBtn').addEventListener('click', showTemplatesModal);
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = state.theme;
  applyThemeToCharts(); scheduleAutosave();
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
  dot.title = 'WebSocket: ' + (s || 'idle');
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
