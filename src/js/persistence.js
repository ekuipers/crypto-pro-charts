// ============================================================
// PERSISTENCE — autosave + named layouts (localStorage)
// ============================================================
import { state } from './state.js';
import { LEGACY_THEME, THEMES, DEFAULT_THEME } from './constants.js';
import { debounce, toast, esc } from './utils.js';
import { addPanel, destroyPanel, setLayout, setActivePanel, addIndicator, loadPanelData } from './charts.js';
import { showModal, closeModal } from './alerts.js';

const AUTOSAVE_KEY = 'cryptopro_autosave';
const LAYOUTS_KEY = 'cryptopro_layouts';
const SETTINGS_KEY = 'cryptopro_settings';
const VERSION = 3;

export function snapshot() {
  return {
    version: VERSION,
    theme: state.theme,
    layout: state.layout,
    gridSizes: state.gridSizes,
    obGrouping: state.obGrouping,
    watchlists: state.watchlists,
    currentWatchlist: state.currentWatchlist,
    wlSort: state.wlSort,
    settings: state.settings,
    alerts: state.alerts,
    symColors: state.symColors,
    panels: state.panels.map(p => ({
      symbol: p.symbol, symbolName: p.symbolName, tf: p.tf,
      indicators: p.indicators.map(i => ({ defId: i.defId, params: i.params, color: i.color })),
      overlays: (p.overlays || []).map(o => ({ symbol: o.symbol, name: o.name, color: o.color })),
      drawings: p.drawings,
    })),
  };
}

export const autosave = debounce(() => {
  try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(snapshot())); } catch {}
}, 1500);

export function loadAutosave() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return false;
    applyLayoutData(JSON.parse(raw));
    return true;
  } catch { return false; }
}

export function applyLayoutData(data) {
  if (!data) return;
  if (data.theme) state.theme = LEGACY_THEME[data.theme] || (THEMES[data.theme] ? data.theme : DEFAULT_THEME);
  if (data.gridSizes) state.gridSizes = data.gridSizes;
  if (data.obGrouping) state.obGrouping = data.obGrouping;
  if (data.watchlists) state.watchlists = data.watchlists;
  if (data.currentWatchlist) state.currentWatchlist = data.currentWatchlist;
  if (data.wlSort) state.wlSort = data.wlSort;
  if (data.settings) state.settings = { ...state.settings, ...data.settings };
  if (data.alerts) state.alerts = data.alerts;
  if (data.symColors) state.symColors = data.symColors;

  document.documentElement.dataset.theme = state.theme;

  // rebuild panels
  state.panels.slice().forEach(destroyPanel);
  setLayout(data.layout || 'l1');

  const panelsData = data.panels || [];
  state.panels.forEach((panel, i) => {
    const pd = panelsData[i];
    if (!pd) return;
    panel.symbol = pd.symbol; panel.symbolName = pd.symbolName; panel.tf = pd.tf;
    panel.drawings = pd.drawings || [];
    panel.overlays = (pd.overlays || []).map(o => ({ symbol: o.symbol, name: o.name, color: o.color, series: null, data: [], ws: null }));
    panel.el.querySelector('.sym-btn').innerHTML = `${pd.symbol.replace(/USDT$/, '')}<span class="sym-quote">USDT</span>`;
    panel.el.querySelectorAll('.tf-btn').forEach(b => b.classList.toggle('active', b.dataset.tf === pd.tf));
    loadPanelData(panel).then(() => {
      (pd.indicators || []).forEach(ind => addIndicator(panel, ind.defId, ind.params, ind.color));
    });
  });
  if (state.panels[0]) setActivePanel(state.panels[0]);
  document.dispatchEvent(new CustomEvent('layout-restored'));
}

// ---- Named layouts ----
export function getNamedLayouts() {
  try { return JSON.parse(localStorage.getItem(LAYOUTS_KEY) || '{}'); } catch { return {}; }
}
export function saveNamedLayout(name) {
  const all = getNamedLayouts();
  if (Object.keys(all).length >= 10 && !all[name]) { toast('Max 10 saved layouts', 'warn'); return; }
  all[name] = { ...snapshot(), savedAt: Date.now() };
  localStorage.setItem(LAYOUTS_KEY, JSON.stringify(all));
  toast(`Saved layout "${name}"`, 'info');
}
export function deleteNamedLayout(name) {
  const all = getNamedLayouts();
  delete all[name];
  localStorage.setItem(LAYOUTS_KEY, JSON.stringify(all));
}

export function showSaveLayoutModal() {
  showModal(`<h3>Save Layout</h3><label>Name<input id="lyName" placeholder="My layout"></label>
    <div class="modal-actions"><button id="lyCancel">Cancel</button><button id="lySave" class="primary-btn">Save</button></div>`, m => {
    m.querySelector('#lyCancel').addEventListener('click', closeModal);
    m.querySelector('#lySave').addEventListener('click', () => {
      const n = m.querySelector('#lyName').value.trim();
      if (n) { saveNamedLayout(n); closeModal(); }
    });
  });
}

export function showLayoutsModal() {
  const all = getNamedLayouts();
  const keys = Object.keys(all);
  const body = keys.length ? keys.map(k => `
    <div class="layout-item">
      <div class="layout-item-info">
        <div class="layout-item-name">${esc(k)}</div>
        <div class="layout-item-meta">${all[k].panels?.length || 0} charts · ${all[k].layout}</div>
      </div>
      <div class="layout-item-actions">
        <button class="layout-item-btn load" data-k="${esc(k)}">Load</button>
        <button class="layout-item-btn del" data-k="${esc(k)}">Delete</button>
      </div>
    </div>`).join('') : '<div class="muted">No saved layouts.</div>';
  showModal(`<h3>Saved Layouts</h3><div class="layout-list">${body}</div>
    <div class="modal-actions"><button id="lyClose">Close</button></div>`, m => {
    m.querySelector('#lyClose').addEventListener('click', closeModal);
    m.querySelectorAll('.load').forEach(b => b.addEventListener('click', () => { applyLayoutData(getNamedLayouts()[b.dataset.k]); closeModal(); document.dispatchEvent(new CustomEvent('layout-restored')); }));
    m.querySelectorAll('.del').forEach(b => b.addEventListener('click', () => { deleteNamedLayout(b.dataset.k); showLayoutsModal(); }));
  });
}
