// ============================================================
// PERSISTENCE — autosave + named layouts (server JSON, localStorage fallback)
// ============================================================
import { state } from './state.js';
import { LEGACY_THEME, THEMES, DEFAULT_THEME } from './constants.js';
import { debounce, toast, esc, baseAsset, quoteAsset } from './utils.js';
import { addPanel, destroyPanel, setLayout, setActivePanel, addIndicator, loadPanelData, applyPanelViewOptions, renderTfGroup } from './charts.js';
import { initDrawingsHistory } from './drawings.js';
import { showModal, closeModal } from './alerts.js';

const AUTOSAVE_KEY  = 'cryptopro_autosave';
const LAYOUTS_KEY   = 'cryptopro_layouts';
const TEMPLATES_KEY = 'cryptopro_templates';
const VERSION = 4;

export function snapshot() {
  return {
    version: VERSION,
    theme: state.theme,
    layout: state.layout,
    gridSizes: state.gridSizes,
    obGrouping: state.obGrouping,
    watchlists: state.watchlists,
    // Explicit tab order. state.watchlists is a plain object, and the server
    // stores the snapshot as Postgres JSONB — which does NOT preserve object
    // key order — so the drag-reordered tab order would otherwise be lost on
    // reload. Arrays keep their order through JSONB, so we persist the order
    // separately and re-apply it on load.
    watchlistOrder: Object.keys(state.watchlists),
    currentWatchlist: state.currentWatchlist,
    wlSort: state.wlSort,
    settings: state.settings,
    alerts: state.alerts,
    symColors: state.symColors,
    panels: state.panels.map(p => ({
      symbol: p.symbol, symbolName: p.symbolName, exchange: p.exchange, tf: p.tf,
      chartType: p.chartType || 'candles', scaleMode: p.scaleMode || 0, linkGroup: p.linkGroup || null,
      indicators: p.indicators.map(i => ({ defId: i.defId, params: i.params, color: i.color, active: i.active !== false })),
      overlays: (p.overlays || []).map(o => ({ symbol: o.symbol, name: o.name, exchange: o.exchange, color: o.color })),
      drawings: p.drawings,
    })),
  };
}

// ---- Server API helpers ----
async function apiGet(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
async function apiPut(path, data) {
  const r = await fetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
async function apiDelete(path) {
  const r = await fetch(path, { method: 'DELETE' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ---- Autosave ----
async function persistSession() {
  const snap = snapshot();
  try {
    await apiPut('/api/session', snap);
  } catch {
    // Server unavailable — fall back to localStorage.
    try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(snap)); } catch {}
  }
}

export const autosave = debounce(() => { persistSession(); }, 1500);

export async function loadAutosave() {
  // Try server first.
  try {
    const data = await apiGet('/api/session');
    if (data && data.version) { applyLayoutData(data); return true; }
  } catch {}
  // Fall back to localStorage (e.g. when running without the server).
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
  // Restore the drag-reordered tab order (JSONB doesn't preserve object key
  // order). Honour the saved order, then append any watchlists not listed in it
  // (e.g. created in an older session) so none are dropped.
  if (data.watchlistOrder && Array.isArray(data.watchlistOrder)) {
    const ordered = {};
    data.watchlistOrder.forEach(n => { if (n in state.watchlists) ordered[n] = state.watchlists[n]; });
    Object.keys(state.watchlists).forEach(n => { if (!(n in ordered)) ordered[n] = state.watchlists[n]; });
    state.watchlists = ordered;
  }
  if (data.currentWatchlist) state.currentWatchlist = data.currentWatchlist;
  if (data.wlSort) state.wlSort = data.wlSort;
  if (data.settings) state.settings = { ...state.settings, ...data.settings };
  // Migrate legacy single-exchange sessions to the multi-exchange list.
  if (!Array.isArray(state.settings.exchanges) || !state.settings.exchanges.length) {
    state.settings.exchanges = [state.settings.exchange || 'binance'];
  }
  if (data.alerts) state.alerts = data.alerts;
  if (data.symColors) state.symColors = data.symColors;

  document.documentElement.dataset.theme = state.theme;

  state.panels.slice().forEach(destroyPanel);
  setLayout(data.layout || 'l1');

  const panelsData = data.panels || [];
  state.panels.forEach((panel, i) => {
    const pd = panelsData[i];
    if (!pd) return;
    panel.symbol = pd.symbol; panel.symbolName = pd.symbolName; panel.tf = pd.tf;
    panel.exchange = pd.exchange || (state.settings.exchanges?.[0] || state.settings.exchange || 'binance');
    panel.chartType = pd.chartType || 'candles';
    panel.scaleMode = pd.scaleMode || 0;
    panel.linkGroup = pd.linkGroup || null;
    applyPanelViewOptions(panel);
    panel.drawings = pd.drawings || [];
    initDrawingsHistory(panel); // P3-24: seed undo/redo from the restored (not empty) state
    panel.overlays = (pd.overlays || []).map(o => ({ symbol: o.symbol, name: o.name, exchange: o.exchange || panel.exchange, color: o.color, series: null, data: [], ws: null }));
    panel.el.querySelector('.sym-btn').innerHTML = `${baseAsset(pd.symbol)}<span class="sym-quote">${quoteAsset(pd.symbol)}</span>`;
    renderTfGroup(panel);
    loadPanelData(panel).then(() => {
      (pd.indicators || []).forEach(ind => addIndicator(panel, ind.defId, ind.params, ind.color, ind.active !== false));
    });
  });
  if (state.panels[0]) setActivePanel(state.panels[0]);
  document.dispatchEvent(new CustomEvent('layout-restored'));
}

// ---- Named layouts ----
export async function getNamedLayouts() {
  try { return await apiGet('/api/layouts'); } catch {}
  try { return JSON.parse(localStorage.getItem(LAYOUTS_KEY) || '{}'); } catch { return {}; }
}

export async function saveNamedLayout(name) {
  const data = { ...snapshot(), savedAt: Date.now() };
  try {
    const all = await getNamedLayouts();
    if (Object.keys(all).length >= 10 && !all[name]) { toast('Max 10 saved layouts', 'warn'); return; }
    await apiPut(`/api/layouts/${encodeURIComponent(name)}`, data);
    toast(`Saved layout "${name}"`, 'info');
    return;
  } catch {}
  // Fallback: localStorage.
  try {
    const all = JSON.parse(localStorage.getItem(LAYOUTS_KEY) || '{}');
    if (Object.keys(all).length >= 10 && !all[name]) { toast('Max 10 saved layouts', 'warn'); return; }
    all[name] = data;
    localStorage.setItem(LAYOUTS_KEY, JSON.stringify(all));
    toast(`Saved layout "${name}"`, 'info');
  } catch {}
}

export async function deleteNamedLayout(name) {
  try { await apiDelete(`/api/layouts/${encodeURIComponent(name)}`); return; } catch {}
  try {
    const all = JSON.parse(localStorage.getItem(LAYOUTS_KEY) || '{}');
    delete all[name];
    localStorage.setItem(LAYOUTS_KEY, JSON.stringify(all));
  } catch {}
}

export function showSaveLayoutModal() {
  showModal(`<h3>Save Layout</h3><label>Name<input id="lyName" placeholder="My layout"></label>
    <div class="modal-actions"><button id="lyCancel">Cancel</button><button id="lySave" class="primary-btn">Save</button></div>`, m => {
    m.querySelector('#lyCancel').addEventListener('click', closeModal);
    m.querySelector('#lySave').addEventListener('click', async () => {
      const n = m.querySelector('#lyName').value.trim();
      if (n) { await saveNamedLayout(n); closeModal(); }
    });
  });
}

// ---- User-saved indicator templates (P2-12) ----
export async function getUserTemplates() {
  try { return await apiGet('/api/templates'); } catch {}
  try { return JSON.parse(localStorage.getItem(TEMPLATES_KEY) || '{}'); } catch { return {}; }
}

// `indicators` is an array of { defId, params, color } — see ui.js showTemplatesModal.
export async function saveUserTemplate(name, indicators) {
  try {
    const all = await getUserTemplates();
    if (Object.keys(all).length >= 20 && !all[name]) { toast('Max 20 saved templates', 'warn'); return; }
    await apiPut(`/api/templates/${encodeURIComponent(name)}`, indicators);
    toast(`Saved template "${name}"`, 'info');
    return;
  } catch {}
  try {
    const all = JSON.parse(localStorage.getItem(TEMPLATES_KEY) || '{}');
    if (Object.keys(all).length >= 20 && !all[name]) { toast('Max 20 saved templates', 'warn'); return; }
    all[name] = indicators;
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(all));
    toast(`Saved template "${name}"`, 'info');
  } catch {}
}

export async function deleteUserTemplate(name) {
  try { await apiDelete(`/api/templates/${encodeURIComponent(name)}`); return; } catch {}
  try {
    const all = JSON.parse(localStorage.getItem(TEMPLATES_KEY) || '{}');
    delete all[name];
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(all));
  } catch {}
}

export async function showLayoutsModal() {
  const all = await getNamedLayouts();
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
    m.querySelectorAll('.load').forEach(b => b.addEventListener('click', () => {
      applyLayoutData(all[b.dataset.k]); closeModal();
      document.dispatchEvent(new CustomEvent('layout-restored'));
    }));
    m.querySelectorAll('.del').forEach(b => b.addEventListener('click', async () => {
      await deleteNamedLayout(b.dataset.k);
      await showLayoutsModal();
    }));
  });
}
