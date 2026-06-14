// ============================================================
// DRAWINGS — canvas overlay drawing engine (per panel)
// Points stored as { logical, price } in chart logical/price space
// ============================================================
import { state, drawingState } from './state.js';
import { fmtPrice } from './utils.js';

const FIB_RET = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const FIB_EXT = [0, 0.618, 1, 1.618, 2.618];

export function initDrawingsForPanel(panel) {
  const layer = panel.el.querySelector('.drawing-layer');
  const canvas = document.createElement('canvas');
  canvas.className = 'draw-canvas';
  layer.appendChild(canvas);
  panel._drawCanvas = canvas;

  let tempPts = [];

  function ptFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const logical = panel.chart.timeScale().coordinateToLogical(x);
    const price = panel.candleSeries.coordinateToPrice(y);
    return { logical, price, x, y };
  }

  layer.addEventListener('mousedown', e => {
    const tool = drawingState.tool;
    if (tool === 'select') return;
    e.preventDefault();
    const pt = ptFromEvent(e);

    if (tool === 'eraser') { eraseNearest(panel, pt); renderDrawings(panel); return; }

    if (tool === 'text') {
      const txt = prompt('Annotation text:');
      if (txt) { panel.drawings.push({ type: 'text', p1: pt, text: txt, color: drawingState.color, width: drawingState.width }); renderDrawings(panel); document.dispatchEvent(new CustomEvent('drawings-changed')); }
      return;
    }
    if (tool === 'hline') { panel.drawings.push({ type: 'hline', p1: pt, color: drawingState.color, width: drawingState.width }); renderDrawings(panel); fin(); return; }
    if (tool === 'vline') { panel.drawings.push({ type: 'vline', p1: pt, color: drawingState.color, width: drawingState.width }); renderDrawings(panel); fin(); return; }

    const need = (tool === 'channel') ? 3 : 2;
    tempPts.push(pt);
    if (tempPts.length >= need) {
      panel.drawings.push({ type: tool, p1: tempPts[0], p2: tempPts[1], p3: tempPts[2] || null, color: drawingState.color, width: drawingState.width });
      tempPts = [];
      renderDrawings(panel);
      fin();
    } else {
      renderDrawings(panel);
    }
  });

  layer.addEventListener('mousemove', e => {
    if (drawingState.tool === 'select' || !tempPts.length) return;
    const pt = ptFromEvent(e);
    renderDrawings(panel, { type: drawingState.tool, p1: tempPts[0], p2: tempPts[1] || pt, p3: tempPts[2] || (tempPts.length === 2 ? pt : null), color: drawingState.color, width: drawingState.width });
  });

  function fin() {
    document.dispatchEvent(new CustomEvent('drawings-changed'));
  }
  panel._cancelDraw = () => { tempPts = []; renderDrawings(panel); };

  updateLayerInteractivity(panel);
}

export function updateLayerInteractivity(panel) {
  const layer = panel.el.querySelector('.drawing-layer');
  layer.style.pointerEvents = (drawingState.tool === 'select') ? 'none' : 'auto';
  layer.style.cursor = (drawingState.tool === 'select') ? 'default' : 'crosshair';
}

export function setTool(tool) {
  drawingState.tool = tool;
  state.panels.forEach(updateLayerInteractivity);
}

function X(panel, pt) { return panel.chart.timeScale().logicalToCoordinate(pt.logical); }
function Y(panel, pt) { return panel.candleSeries.priceToCoordinate(pt.price); }

export function renderDrawings(panel, preview) {
  const canvas = panel._drawCanvas;
  if (!canvas || !panel.chart) return;
  const div = panel.el.querySelector('.main-chart-div');
  const w = div.clientWidth, h = div.clientHeight;
  canvas.width = w; canvas.height = h;
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  const all = preview ? [...panel.drawings, preview] : panel.drawings;
  for (const d of all) drawOne(panel, ctx, d, w, h);
}

function drawOne(panel, ctx, d, w, h) {
  ctx.save();
  ctx.strokeStyle = d.color; ctx.fillStyle = d.color; ctx.lineWidth = d.width || 1;
  const p1 = d.p1, p2 = d.p2, p3 = d.p3;
  const x1 = p1 ? X(panel, p1) : null, y1 = p1 ? Y(panel, p1) : null;
  const x2 = p2 ? X(panel, p2) : null, y2 = p2 ? Y(panel, p2) : null;

  switch (d.type) {
    case 'hline': {
      ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(0, y1); ctx.lineTo(w, y1); ctx.stroke();
      label(ctx, w - 60, y1, fmtPrice(p1.price), d.color);
      break;
    }
    case 'vline': {
      ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x1, h); ctx.stroke();
      break;
    }
    case 'trend': line(ctx, x1, y1, x2, y2); dot(ctx, x1, y1); dot(ctx, x2, y2); break;
    case 'ray': { const [ex, ey] = extend(x1, y1, x2, y2, w, 1); line(ctx, x1, y1, ex, ey); dot(ctx, x1, y1); dot(ctx, x2, y2); break; }
    case 'extended': { const [ax, ay] = extend(x2, y2, x1, y1, w, 1); const [bx, by] = extend(x1, y1, x2, y2, w, 1); line(ctx, ax, ay, bx, by); break; }
    case 'rect': {
      ctx.globalAlpha = 0.12; ctx.fillRect(x1, y1, x2 - x1, y2 - y1); ctx.globalAlpha = 1;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1); break;
    }
    case 'channel': {
      if (!p3) { line(ctx, x1, y1, x2, y2); break; }
      const y3 = Y(panel, p3);
      const dy = y3 - y1;
      ctx.globalAlpha = 0.1;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x2, y2 + dy); ctx.lineTo(x1, y1 + dy); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      line(ctx, x1, y1, x2, y2); line(ctx, x1, y1 + dy, x2, y2 + dy);
      break;
    }
    case 'fibret': fib(panel, ctx, d, FIB_RET, w); break;
    case 'fibext': fib(panel, ctx, d, FIB_EXT, w); break;
    case 'measure': {
      line(ctx, x1, y1, x2, y2);
      const dp = p2.price - p1.price, pct = (dp / p1.price) * 100;
      const col = dp >= 0 ? '#26a69a' : '#ef5350';
      ctx.fillStyle = col;
      ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2) - 34, 120, 30);
      ctx.fillStyle = '#fff'; ctx.font = '11px sans-serif';
      ctx.fillText(`${fmtPrice(dp)} (${pct.toFixed(2)}%)`, Math.min(x1, x2) + 6, Math.min(y1, y2) - 14);
      break;
    }
    case 'text': {
      ctx.font = '13px sans-serif';
      ctx.fillText(d.text, x1 + 4, y1);
      break;
    }
  }
  ctx.restore();
}

function fib(panel, ctx, d, levels, w) {
  const x1 = X(panel, d.p1), y1 = Y(panel, d.p1), x2 = X(panel, d.p2), y2 = Y(panel, d.p2);
  const pr1 = d.p1.price, pr2 = d.p2.price;
  ctx.font = '10px sans-serif';
  levels.forEach((lv, i) => {
    const price = pr1 + (pr2 - pr1) * lv;
    const y = panel.candleSeries.priceToCoordinate(price);
    if (y == null) return;
    ctx.strokeStyle = d.color; ctx.globalAlpha = 0.8;
    ctx.beginPath(); ctx.moveTo(Math.min(x1, x2), y); ctx.lineTo(w, y); ctx.stroke();
    if (lv >= 0.382 && lv <= 0.618) { ctx.globalAlpha = 0.06; ctx.fillStyle = d.color; }
    ctx.globalAlpha = 1; ctx.fillStyle = d.color;
    ctx.fillText(`${lv} (${fmtPrice(price)})`, Math.min(x1, x2) + 2, y - 2);
  });
  ctx.globalAlpha = 1;
}

function line(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function dot(ctx, x, y) { ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); }
function label(ctx, x, y, text, color) {
  ctx.save(); ctx.font = '10px sans-serif'; ctx.fillStyle = color;
  ctx.fillText(text, x, y - 2); ctx.restore();
}
function extend(x1, y1, x2, y2, w, dir) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = dx === 0 ? 99999 : (dir > 0 ? (w * 2 - x1) / dx : -x1 / dx);
  return [x1 + dx * Math.abs(t), y1 + dy * Math.abs(t)];
}

function eraseNearest(panel, pt) {
  if (!panel.drawings.length) return;
  const px = X(panel, pt), py = Y(panel, pt);
  let best = -1, bestD = 25;
  panel.drawings.forEach((d, i) => {
    const x1 = X(panel, d.p1), y1 = Y(panel, d.p1);
    let dist = Math.hypot(px - x1, py - y1);
    if (d.p2) { const x2 = X(panel, d.p2), y2 = Y(panel, d.p2); dist = Math.min(dist, Math.hypot(px - x2, py - y2)); }
    if (dist < bestD) { bestD = dist; best = i; }
  });
  if (best >= 0) panel.drawings.splice(best, 1);
  document.dispatchEvent(new CustomEvent('drawings-changed'));
}

export function clearDrawings(panel) {
  panel.drawings = [];
  renderDrawings(panel);
  document.dispatchEvent(new CustomEvent('drawings-changed'));
}

export function exportDrawings(panel) {
  const blob = new Blob([JSON.stringify(panel.drawings, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `drawings_${panel.symbol}_${panel.tf}_${Date.now()}.json`;
  a.click(); URL.revokeObjectURL(url);
}

export function importDrawings(panel, file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const arr = JSON.parse(reader.result);
      if (Array.isArray(arr)) { panel.drawings.push(...arr); renderDrawings(panel); document.dispatchEvent(new CustomEvent('drawings-changed')); }
    } catch {}
  };
  reader.readAsText(file);
}
