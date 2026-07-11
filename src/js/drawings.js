// ============================================================
// DRAWINGS — canvas overlay drawing engine (per panel)
// Points stored as { logical, price } in chart logical/price space
// Supports: creation, selection, resize handles, move, and a live
// configuration popover (color / width / line style / coordinates).
// ============================================================
import { state, drawingState } from './state.js';
import { fmtPrice } from './utils.js';
import { logDrawingAsTrade } from './paper.js';

const FIB_RET = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const FIB_EXT = [0, 0.618, 1, 1.618, 2.618];
// Fibonacci sequence used for fib time zones (bar offsets from the anchor,
// in units of the anchor-to-second-point distance).
const FIB_TIME_SEQ = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];

const HANDLE_HIT = 9;   // px radius to grab a handle
const BODY_HIT = 6;     // px distance to select a shape body

const TYPE_LABELS = {
  hline: 'Horizontal line', vline: 'Vertical line', trend: 'Trend line',
  ray: 'Ray', extended: 'Extended line', rect: 'Rectangle', channel: 'Parallel channel',
  fibret: 'Fib retracement', fibext: 'Fib extension', fibtime: 'Fib time zones',
  measure: 'Measure', text: 'Text', pitchfork: 'Pitchfork',
  long: 'Long position', short: 'Short position',
};
// Which shapes expose a solid/dashed style control
const STYLEABLE = new Set(['hline', 'vline', 'trend', 'ray', 'extended', 'rect', 'channel', 'measure', 'pitchfork', 'fibtime']);

let dragInfo = null;   // active handle/body drag

export function initDrawingsForPanel(panel) {
  const layer = panel.el.querySelector('.drawing-layer');
  const mainDiv = panel.el.querySelector('.main-chart-div');
  const canvas = document.createElement('canvas');
  canvas.className = 'draw-canvas';
  layer.appendChild(canvas);
  panel._drawCanvas = canvas;

  let tempPts = [];

  layer.addEventListener('mousedown', e => {
    const tool = drawingState.tool;
    if (tool === 'select') { handleSelectDown(panel, e); return; }
    e.preventDefault();
    const pt = ptFromEvent(panel, e);

    if (tool === 'eraser') { eraseNearest(panel, pt); renderDrawings(panel); return; }

    if (tool === 'text') {
      const txt = prompt('Annotation text:');
      if (txt) { panel.drawings.push({ type: 'text', p1: pt, text: txt, color: drawingState.color, width: drawingState.width }); renderDrawings(panel); fin(); }
      return;
    }
    if (tool === 'hline') { panel.drawings.push({ type: 'hline', p1: pt, color: drawingState.color, width: drawingState.width }); renderDrawings(panel); fin(); return; }
    if (tool === 'vline') { panel.drawings.push({ type: 'vline', p1: pt, color: drawingState.color, width: drawingState.width }); renderDrawings(panel); fin(); return; }

    const need = (tool === 'channel' || tool === 'pitchfork') ? 3 : 2;
    tempPts.push(pt);
    if (tempPts.length >= need) {
      panel.drawings.push(buildShape(tool, tempPts));
      tempPts = [];
      renderDrawings(panel);
      fin();
    } else {
      renderDrawings(panel);
    }
  });

  layer.addEventListener('mousemove', e => {
    if (drawingState.tool === 'select') { updateSelectHover(panel, e); return; }
    if (!tempPts.length) return;
    const pt = ptFromEvent(panel, e);
    const tool = drawingState.tool;
    const p2 = tempPts[1] || pt;
    let p3 = tempPts[2] || (tempPts.length === 2 ? pt : null);
    // Position tool: synthesize a live stop preview (1:2 R:R) while dragging the target.
    if ((tool === 'long' || tool === 'short') && tempPts.length === 1 && !p3) {
      const risk = Math.abs(p2.price - tempPts[0].price) / 2;
      p3 = { logical: p2.logical, price: tool === 'long' ? tempPts[0].price - risk : tempPts[0].price + risk };
    }
    renderDrawings(panel, { type: tool, p1: tempPts[0], p2, p3, color: drawingState.color, width: drawingState.width });
  });

  // In select mode the layer is click-through (pointer-events:none) over empty
  // space so the chart still pans/zooms — hover detection on the chart div
  // turns the layer interactive only when the cursor is over a shape.
  mainDiv.addEventListener('mousemove', e => { if (drawingState.tool === 'select') updateSelectHover(panel, e); });
  mainDiv.addEventListener('mousedown', () => { if (drawingState.tool === 'select' && !dragInfo) deselect(); });

  function fin() { document.dispatchEvent(new CustomEvent('drawings-changed')); }
  panel._cancelDraw = () => { tempPts = []; renderDrawings(panel); };

  updateLayerInteractivity(panel);
}

export function updateLayerInteractivity(panel) {
  const layer = panel.el.querySelector('.drawing-layer');
  if (drawingState.tool === 'select') {
    layer.style.pointerEvents = 'none';   // hover handler flips this to 'auto' over shapes
    layer.style.cursor = 'default';
  } else {
    layer.style.pointerEvents = 'auto';
    layer.style.cursor = 'crosshair';
  }
}

export function setTool(tool) {
  if (tool !== 'select') deselect();
  drawingState.tool = tool;
  state.panels.forEach(updateLayerInteractivity);
}

// ---------- coordinate helpers ----------
function canvasXY(panel, e) {
  const rect = panel._drawCanvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}
// Snap to the nearest bar's OHLC price when the magnet tool is on (P2-11).
function magnetSnap(panel, logical, price) {
  if (!panel.data?.length || logical == null || price == null) return { logical, price };
  const idx = Math.max(0, Math.min(panel.data.length - 1, Math.round(logical)));
  const bar = panel.data[idx];
  if (!bar) return { logical, price };
  const candidates = [bar.open, bar.high, bar.low, bar.close];
  const snapped = candidates.reduce((best, v) => Math.abs(v - price) < Math.abs(best - price) ? v : best, candidates[0]);
  return { logical: idx, price: snapped };
}

function ptFromEvent(panel, e) {
  const { x, y } = canvasXY(panel, e);
  let logical = panel.chart.timeScale().coordinateToLogical(x);
  let price = panel.candleSeries.coordinateToPrice(y);
  if (drawingState.magnet) ({ logical, price } = magnetSnap(panel, logical, price));
  return { logical, price, x, y };
}
function X(panel, pt) { return panel.chart.timeScale().logicalToCoordinate(pt.logical); }
function Y(panel, pt) { return panel.candleSeries.priceToCoordinate(pt.price); }

// Position tool (P2-11): entry (p1) + target (p2) drag; the stop (p3) is
// auto-placed at a default 1:2 risk:reward and can be dragged independently.
function buildShape(tool, pts) {
  const shape = { type: tool, p1: pts[0], p2: pts[1] || null, p3: pts[2] || null, color: drawingState.color, width: drawingState.width };
  if (tool === 'long' || tool === 'short') {
    const entry = pts[0], target = pts[1];
    const risk = Math.abs(target.price - entry.price) / 2;
    const stopPrice = tool === 'long' ? entry.price - risk : entry.price + risk;
    shape.p3 = { logical: target.logical, price: stopPrice };
  }
  return shape;
}

// ---------- rendering ----------
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

  // Lock badges sit on top of every locked shape so locked state is visible at a glance.
  for (const d of panel.drawings) if (d.locked) drawLockBadge(panel, ctx, d);

  const sel = drawingState.selected;
  if (sel && drawingState.selectedPanel === panel && panel.drawings.includes(sel) && !sel.locked) drawHandles(panel, ctx, sel);

  refreshConfigCoords();
}

// A small padlock glyph drawn at the shape's primary anchor to mark it as locked.
function drawLockBadge(panel, ctx, d) {
  const anchor = d.p1 || d.p2;
  if (!anchor) return;
  let x = X(panel, anchor), y = Y(panel, anchor);
  if (x == null || y == null) return;
  if (d.type === 'hline') x = panel._drawCanvas.width - 60;
  if (d.type === 'vline') y = 16;
  ctx.save();
  ctx.setLineDash([]);
  ctx.translate(x + 8, y - 8);
  ctx.fillStyle = 'rgba(20,22,28,.85)';
  ctx.strokeStyle = '#f0b90b';
  ctx.lineWidth = 1.2;
  // body
  ctx.beginPath(); ctx.rect(-4, -1, 8, 7); ctx.fill(); ctx.stroke();
  // shackle
  ctx.beginPath(); ctx.arc(0, -1, 3, Math.PI, 0); ctx.stroke();
  ctx.restore();
}

function dashFor(d) { return d.lineStyle ? (d.lineStyle === 'dashed') : (d.type === 'hline' || d.type === 'vline'); }

function drawOne(panel, ctx, d, w, h) {
  ctx.save();
  ctx.strokeStyle = d.color; ctx.fillStyle = d.color; ctx.lineWidth = d.width || 1;
  ctx.setLineDash(dashFor(d) ? [6, 4] : []);
  const p1 = d.p1, p2 = d.p2, p3 = d.p3;
  const x1 = p1 ? X(panel, p1) : null, y1 = p1 ? Y(panel, p1) : null;
  const x2 = p2 ? X(panel, p2) : null, y2 = p2 ? Y(panel, p2) : null;

  switch (d.type) {
    case 'hline': {
      ctx.beginPath(); ctx.moveTo(0, y1); ctx.lineTo(w, y1); ctx.stroke();
      label(ctx, w - 60, y1, fmtPrice(p1.price), d.color);
      break;
    }
    case 'vline': {
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
    case 'fibtime': fibTime(panel, ctx, d, h); break;
    case 'pitchfork': pitchfork(panel, ctx, d, x1, y1, x2, y2, p3, w); break;
    case 'long': case 'short': position(panel, ctx, d); break;
    case 'measure': {
      line(ctx, x1, y1, x2, y2);
      const dp = p2.price - p1.price, pct = (dp / p1.price) * 100;
      const col = dp >= 0 ? '#26a69a' : '#ef5350';
      ctx.setLineDash([]);
      ctx.fillStyle = col;
      ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2) - 34, 120, 30);
      ctx.fillStyle = '#fff'; ctx.font = '11px sans-serif';
      ctx.fillText(`${fmtPrice(dp)} (${pct.toFixed(2)}%)`, Math.min(x1, x2) + 6, Math.min(y1, y2) - 14);
      break;
    }
    case 'text': {
      ctx.setLineDash([]);
      ctx.font = '13px sans-serif';
      ctx.fillText(d.text, x1 + 4, y1);
      break;
    }
  }
  ctx.restore();
}

function fib(panel, ctx, d, levels, w) {
  const x1 = X(panel, d.p1), x2 = X(panel, d.p2);
  const pr1 = d.p1.price, pr2 = d.p2.price;
  ctx.font = '10px sans-serif';
  ctx.setLineDash([]);
  levels.forEach(lv => {
    const price = pr1 + (pr2 - pr1) * lv;
    const y = panel.candleSeries.priceToCoordinate(price);
    if (y == null) return;
    ctx.strokeStyle = d.color; ctx.globalAlpha = 0.8;
    ctx.beginPath(); ctx.moveTo(Math.min(x1, x2), y); ctx.lineTo(w, y); ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = d.color;
    ctx.fillText(`${lv} (${fmtPrice(price)})`, Math.min(x1, x2) + 2, y - 2);
  });
  ctx.globalAlpha = 1;
}

// Fib time zones (P2-11): vertical lines at Fibonacci bar-offsets from the
// anchor, spaced by the anchor-to-second-point distance.
function fibTime(panel, ctx, d, h) {
  if (!d.p2) return;
  const unit = d.p2.logical - d.p1.logical;
  if (!unit) return;
  ctx.setLineDash([]);
  ctx.font = '10px sans-serif';
  FIB_TIME_SEQ.forEach(f => {
    const x = panel.chart.timeScale().logicalToCoordinate(d.p1.logical + unit * f);
    if (x == null) return;
    ctx.strokeStyle = d.color; ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = d.color;
    ctx.fillText(String(f), x + 2, 12);
  });
}

// Andrews' Pitchfork (P2-11): a median line from the handle (p1) through the
// midpoint of p2/p3, with two parallel teeth through p2 and p3, all extended
// rightward.
function pitchfork(panel, ctx, d, x1, y1, x2, y2, p3, w) {
  if (!d.p2) return;
  if (!p3) { line(ctx, x1, y1, x2, y2); dot(ctx, x1, y1); dot(ctx, x2, y2); return; }
  const x3 = X(panel, p3), y3 = Y(panel, p3);
  const midx = (x2 + x3) / 2, midy = (y2 + y3) / 2;
  const dx = midx - x1, dy = midy - y1;
  const [medEx, medEy] = extend(x1, y1, midx, midy, w, 1);
  line(ctx, x1, y1, medEx, medEy);
  const [e2x, e2y] = extend(x2, y2, x2 + dx, y2 + dy, w, 1);
  line(ctx, x2, y2, e2x, e2y);
  const [e3x, e3y] = extend(x3, y3, x3 + dx, y3 + dy, w, 1);
  line(ctx, x3, y3, e3x, e3y);
  dot(ctx, x1, y1); dot(ctx, x2, y2); dot(ctx, x3, y3);
}

// Long/short position tool (P2-11): a profit zone from entry (p1) to target
// (p2) and a loss zone from entry to stop (p3), with an auto-computed R:R.
function position(panel, ctx, d) {
  if (!d.p2 || !d.p3) return;
  const isLong = d.type === 'long';
  const entryPrice = d.p1.price, targetPrice = d.p2.price, stopPrice = d.p3.price;
  const xL = X(panel, d.p1);
  const xR = Math.max(X(panel, d.p2), X(panel, d.p3));
  const yEntry = Y(panel, d.p1);
  const yTarget = panel.candleSeries.priceToCoordinate(targetPrice);
  const yStop = panel.candleSeries.priceToCoordinate(stopPrice);
  if ([xL, xR, yEntry, yTarget, yStop].some(v => v == null)) return;
  const profitCol = isLong ? '#26a69a' : '#ef5350';
  const lossCol = isLong ? '#ef5350' : '#26a69a';
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = profitCol;
  ctx.fillRect(Math.min(xL, xR), Math.min(yEntry, yTarget), Math.abs(xR - xL), Math.abs(yTarget - yEntry));
  ctx.fillStyle = lossCol;
  ctx.fillRect(Math.min(xL, xR), Math.min(yEntry, yStop), Math.abs(xR - xL), Math.abs(yStop - yEntry));
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
  [yEntry, yTarget, yStop].forEach(y => {
    ctx.beginPath(); ctx.moveTo(Math.min(xL, xR), y); ctx.lineTo(Math.max(xL, xR), y); ctx.stroke();
  });
  const rr = Math.abs(targetPrice - entryPrice) / (Math.abs(entryPrice - stopPrice) || 1);
  const pctT = ((targetPrice - entryPrice) / entryPrice) * 100;
  const pctS = ((stopPrice - entryPrice) / entryPrice) * 100;
  ctx.font = '10px sans-serif'; ctx.fillStyle = '#fff';
  const lx = Math.min(xL, xR) + 4;
  ctx.fillText(`Entry ${fmtPrice(entryPrice)}`, lx, yEntry - 3);
  ctx.fillText(`Target ${fmtPrice(targetPrice)} (${pctT >= 0 ? '+' : ''}${pctT.toFixed(2)}%)`, lx, yTarget - 3);
  ctx.fillText(`Stop ${fmtPrice(stopPrice)} (${pctS >= 0 ? '+' : ''}${pctS.toFixed(2)}%)  R:R 1:${rr.toFixed(2)}`, lx, yStop + 11);
}

function drawHandles(panel, ctx, d) {
  ctx.save();
  ctx.setLineDash([]);
  getHandles(panel, d).forEach(hd => {
    const x = X(panel, hd.pt), y = Y(panel, hd.pt);
    let hx = x, hy = y;
    if (hd.axis === 'y') hx = panel._drawCanvas.width - 60;   // hline handle sits at the price label
    if (hd.axis === 'x') hy = 16;                              // vline handle near the top
    if (hx == null || hy == null) return;
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2962ff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.rect(hx - 4, hy - 4, 8, 8); ctx.fill(); ctx.stroke();
  });
  ctx.restore();
}

// Handles to expose per shape. axis: 'both' | 'x' (logical only) | 'y' (price only)
function getHandles(panel, d) {
  switch (d.type) {
    case 'hline': return [{ pt: d.p1, axis: 'y', label: 'Level' }];
    case 'vline': return [{ pt: d.p1, axis: 'x', label: 'Time' }];
    case 'text': return [{ pt: d.p1, axis: 'both', label: 'Anchor' }];
    case 'channel': return [
      { pt: d.p1, axis: 'both', label: 'Point 1' },
      { pt: d.p2, axis: 'both', label: 'Point 2' },
      ...(d.p3 ? [{ pt: d.p3, axis: 'both', label: 'Width' }] : []),
    ];
    case 'pitchfork': return [
      { pt: d.p1, axis: 'both', label: 'Handle' },
      { pt: d.p2, axis: 'both', label: 'Point 2' },
      ...(d.p3 ? [{ pt: d.p3, axis: 'both', label: 'Point 3' }] : []),
    ];
    case 'long': case 'short': return [
      { pt: d.p1, axis: 'both', label: 'Entry' },
      { pt: d.p2, axis: 'both', label: 'Target' },
      ...(d.p3 ? [{ pt: d.p3, axis: 'both', label: 'Stop' }] : []),
    ];
    default: return [
      { pt: d.p1, axis: 'both', label: 'Point 1' },
      ...(d.p2 ? [{ pt: d.p2, axis: 'both', label: 'Point 2' }] : []),
    ];
  }
}

// ---------- selection + hit testing ----------
function updateSelectHover(panel, e) {
  if (drawingState.tool !== 'select') return;
  const layer = panel.el.querySelector('.drawing-layer');
  const { x, y } = canvasXY(panel, e);
  const hit = hitTest(panel, x, y);
  if (hit) {
    layer.style.pointerEvents = 'auto';
    layer.style.cursor = hit.drawing.locked ? 'not-allowed' : (hit.handleIdx >= 0 ? 'crosshair' : 'move');
  } else if (!dragInfo) {
    layer.style.pointerEvents = 'none';
    layer.style.cursor = 'default';
  }
}

function hitTest(panel, x, y) {
  const w = panel.el.querySelector('.main-chart-div').clientWidth;
  // Prefer handles of the currently selected shape so they stay grabbable.
  const sel = drawingState.selected;
  if (sel && !sel.locked && drawingState.selectedPanel === panel && panel.drawings.includes(sel)) {
    const hs = getHandles(panel, sel);
    for (let i = 0; i < hs.length; i++) {
      let hx = X(panel, hs[i].pt), hy = Y(panel, hs[i].pt);
      if (hs[i].axis === 'y') hx = panel._drawCanvas.width - 60;
      if (hs[i].axis === 'x') hy = 16;
      if (hx != null && hy != null && Math.hypot(x - hx, y - hy) <= HANDLE_HIT) return { drawing: sel, handleIdx: i };
    }
  }
  for (let i = panel.drawings.length - 1; i >= 0; i--) {
    if (bodyHit(panel, panel.drawings[i], x, y, w)) return { drawing: panel.drawings[i], handleIdx: -1 };
  }
  return null;
}

function bodyHit(panel, d, x, y, w) {
  const p1 = d.p1, p2 = d.p2, p3 = d.p3;
  const x1 = p1 ? X(panel, p1) : null, y1 = p1 ? Y(panel, p1) : null;
  const x2 = p2 ? X(panel, p2) : null, y2 = p2 ? Y(panel, p2) : null;
  if (x1 == null) return false;
  switch (d.type) {
    case 'hline': return Math.abs(y - y1) <= BODY_HIT;
    case 'vline': return Math.abs(x - x1) <= BODY_HIT;
    case 'text': return Math.abs(x - x1) < 46 && Math.abs(y - y1) < 14;
    case 'trend': case 'measure': return distToSeg(x, y, x1, y1, x2, y2) <= BODY_HIT;
    case 'ray': { const [ex, ey] = extend(x1, y1, x2, y2, w, 1); return distToSeg(x, y, x1, y1, ex, ey) <= BODY_HIT; }
    case 'extended': { const [ax, ay] = extend(x2, y2, x1, y1, w, 1); const [bx, by] = extend(x1, y1, x2, y2, w, 1); return distToSeg(x, y, ax, ay, bx, by) <= BODY_HIT; }
    case 'rect': return nearRect(x, y, x1, y1, x2, y2, BODY_HIT);
    case 'channel': {
      if (!p3) return distToSeg(x, y, x1, y1, x2, y2) <= BODY_HIT;
      const dy = Y(panel, p3) - y1;
      return distToSeg(x, y, x1, y1, x2, y2) <= BODY_HIT || distToSeg(x, y, x1, y1 + dy, x2, y2 + dy) <= BODY_HIT;
    }
    case 'fibret': case 'fibext': {
      const levels = d.type === 'fibret' ? FIB_RET : FIB_EXT;
      const minX = Math.min(x1, x2 ?? x1);
      if (x < minX - BODY_HIT) return false;
      return levels.some(lv => {
        const yy = panel.candleSeries.priceToCoordinate(p1.price + (p2.price - p1.price) * lv);
        return yy != null && Math.abs(y - yy) <= BODY_HIT;
      });
    }
    case 'fibtime': {
      if (!p2) return false;
      const unit = p2.logical - p1.logical;
      if (!unit) return false;
      return FIB_TIME_SEQ.some(f => {
        const xx = X(panel, { logical: p1.logical + unit * f });
        return xx != null && Math.abs(x - xx) <= BODY_HIT;
      });
    }
    case 'pitchfork': {
      if (!p3) return distToSeg(x, y, x1, y1, x2, y2) <= BODY_HIT;
      const x3 = X(panel, p3), y3 = Y(panel, p3);
      const midx = (x2 + x3) / 2, midy = (y2 + y3) / 2;
      return distToSeg(x, y, x1, y1, midx, midy) <= BODY_HIT
        || distToSeg(x, y, x1, y1, x2, y2) <= BODY_HIT
        || distToSeg(x, y, x1, y1, x3, y3) <= BODY_HIT;
    }
    case 'long': case 'short': {
      if (!p3) return false;
      const x3 = X(panel, p3), y3 = Y(panel, p3);
      const lo = Math.min(x1, x2, x3), hi = Math.max(x1, x2, x3);
      const top = Math.min(y1, y2, y3), bot = Math.max(y1, y2, y3);
      return x >= lo - BODY_HIT && x <= hi + BODY_HIT && y >= top - BODY_HIT && y <= bot + BODY_HIT;
    }
  }
  return false;
}

function handleSelectDown(panel, e) {
  e.preventDefault(); e.stopPropagation();
  const { x, y } = canvasXY(panel, e);
  const hit = hitTest(panel, x, y);
  if (!hit) { deselect(); return; }
  select(panel, hit.drawing);
  const d = hit.drawing;
  if (d.locked) return;   // locked shapes can be selected (to unlock) but not moved or resized
  const startPt = ptFromEvent(panel, e);
  const orig = { p1: clonePt(d.p1), p2: clonePt(d.p2), p3: clonePt(d.p3) };
  dragInfo = { panel, d, handleIdx: hit.handleIdx, startPt, orig };

  const move = ev => {
    if (!dragInfo) return;
    const cur = ptFromEvent(panel, ev);
    if (cur.logical == null || cur.price == null) return;
    if (dragInfo.handleIdx >= 0) {
      const hnd = getHandles(panel, d)[dragInfo.handleIdx];
      if (!hnd) return;
      if (hnd.axis !== 'y') hnd.pt.logical = cur.logical;
      if (hnd.axis !== 'x') hnd.pt.price = cur.price;
    } else {
      const dLog = cur.logical - startPt.logical;
      const dPrice = cur.price - startPt.price;
      ['p1', 'p2', 'p3'].forEach(k => { if (orig[k] && d[k]) { d[k].logical = orig[k].logical + dLog; d[k].price = orig[k].price + dPrice; } });
    }
    renderDrawings(panel);
  };
  const up = () => {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
    dragInfo = null;
    document.dispatchEvent(new CustomEvent('drawings-changed'));
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
}

function select(panel, d) {
  const prevPanel = drawingState.selectedPanel;
  drawingState.selected = d;
  drawingState.selectedPanel = panel;
  if (prevPanel && prevPanel !== panel) renderDrawings(prevPanel);
  renderDrawings(panel);
  showConfig(panel, d);
}
function deselect() {
  const panel = drawingState.selectedPanel;
  drawingState.selected = null;
  drawingState.selectedPanel = null;
  hideConfig();
  if (panel) renderDrawings(panel);
}

// ---------- config popover ----------
function hideConfig() { document.getElementById('drawCfg')?.remove(); }

function showConfig(panel, d) {
  hideConfig();
  const el = document.createElement('div');
  el.id = 'drawCfg';
  el.className = 'draw-cfg';

  const styleRow = STYLEABLE.has(d.type) ? `
    <label class="dc-row">Line style
      <select id="dcStyle">
        <option value="solid"${!dashFor(d) ? ' selected' : ''}>Solid</option>
        <option value="dashed"${dashFor(d) ? ' selected' : ''}>Dashed</option>
      </select>
    </label>` : '';

  const textRow = d.type === 'text' ? `
    <label class="dc-row">Text<input id="dcText" type="text" value="${(d.text || '').replace(/"/g, '&quot;')}"></label>` : '';

  const coordRows = getHandles(panel, d).map((hd, i) => {
    const showBar = hd.axis !== 'y';
    const showPrice = hd.axis !== 'x';
    return `<div class="dc-coord">
      <span>${hd.label}</span>
      ${showBar ? `<input class="dc-bar" data-i="${i}" type="number" step="1" title="Bar (X)" value="${Math.round(hd.pt.logical)}">` : ''}
      ${showPrice ? `<input class="dc-price" data-i="${i}" type="number" step="any" title="Price (Y)" value="${trimNum(hd.pt.price)}">` : ''}
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="dc-head"><span>${TYPE_LABELS[d.type] || 'Shape'}</span><button id="dcClose" title="Close">✕</button></div>
    <div class="dc-body">
      <label class="dc-row">Color<input id="dcColor" type="color" value="${toHex(d.color)}"></label>
      <label class="dc-row">Width<input id="dcWidth" type="number" min="1" max="10" step="1" value="${d.width || 1}"></label>
      ${styleRow}
      ${textRow}
      <div class="dc-coords">${coordRows}</div>
    </div>
    <div class="dc-actions">
      ${(d.type === 'long' || d.type === 'short') ? '<button id="dcLogTrade" class="dc-log">📝 Log Trade</button>' : ''}
      <button id="dcLock" class="dc-lock${d.locked ? ' active' : ''}">${d.locked ? '🔓 Unlock' : '🔒 Lock'}</button>
      <button id="dcDelete" class="dc-del"${d.locked ? ' disabled' : ''}>Delete</button>
    </div>`;
  document.body.appendChild(el);
  positionConfig(panel, el);

  // Editing controls are read-only while the shape is locked.
  if (d.locked) el.querySelectorAll('.dc-body input, .dc-body select').forEach(inp => { inp.disabled = true; });

  const changed = () => { renderDrawings(panel); document.dispatchEvent(new CustomEvent('drawings-changed')); };
  el.querySelector('#dcClose').addEventListener('click', deselect);
  el.querySelector('#dcLogTrade')?.addEventListener('click', () => logDrawingAsTrade(panel, d));
  el.querySelector('#dcLock').addEventListener('click', () => {
    d.locked = !d.locked;
    document.dispatchEvent(new CustomEvent('drawings-changed'));
    showConfig(panel, d);   // rebuild popover to reflect the new locked state
    renderDrawings(panel);
  });
  el.querySelector('#dcColor').addEventListener('input', e => { d.color = e.target.value; changed(); });
  el.querySelector('#dcWidth').addEventListener('input', e => { d.width = Math.max(1, +e.target.value || 1); changed(); });
  el.querySelector('#dcStyle')?.addEventListener('change', e => { d.lineStyle = e.target.value; changed(); });
  el.querySelector('#dcText')?.addEventListener('input', e => { d.text = e.target.value; changed(); });
  el.querySelectorAll('.dc-bar').forEach(inp => inp.addEventListener('input', () => {
    const h = getHandles(panel, d)[+inp.dataset.i]; if (h) { h.pt.logical = +inp.value; changed(); }
  }));
  el.querySelectorAll('.dc-price').forEach(inp => inp.addEventListener('input', () => {
    const h = getHandles(panel, d)[+inp.dataset.i]; if (h) { h.pt.price = +inp.value; changed(); }
  }));
  el.querySelector('#dcDelete').addEventListener('click', () => {
    const idx = panel.drawings.indexOf(d);
    if (idx >= 0) panel.drawings.splice(idx, 1);
    deselect();
    document.dispatchEvent(new CustomEvent('drawings-changed'));
  });
}

function positionConfig(panel, el) {
  const r = panel.el.getBoundingClientRect();
  const wdt = 232;
  el.style.left = Math.max(8, r.right - wdt - 12) + 'px';
  el.style.top = (r.top + 46) + 'px';
}

// Keep the coordinate fields live as the chart pans/zooms or the shape is dragged.
function refreshConfigCoords() {
  const el = document.getElementById('drawCfg');
  const d = drawingState.selected, panel = drawingState.selectedPanel;
  if (!el || !d || !panel) return;
  const hs = getHandles(panel, d);
  el.querySelectorAll('.dc-bar').forEach(inp => { if (document.activeElement !== inp) { const h = hs[+inp.dataset.i]; if (h) inp.value = Math.round(h.pt.logical); } });
  el.querySelectorAll('.dc-price').forEach(inp => { if (document.activeElement !== inp) { const h = hs[+inp.dataset.i]; if (h) inp.value = trimNum(h.pt.price); } });
}

// ---------- geometry helpers ----------
function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function nearRect(x, y, x1, y1, x2, y2, T) {
  const lo = Math.min(x1, x2), hi = Math.max(x1, x2), top = Math.min(y1, y2), bot = Math.max(y1, y2);
  const onV = (y >= top - T && y <= bot + T) && (Math.abs(x - lo) <= T || Math.abs(x - hi) <= T);
  const onH = (x >= lo - T && x <= hi + T) && (Math.abs(y - top) <= T || Math.abs(y - bot) <= T);
  return onV || onH;
}
function clonePt(p) { return p ? { logical: p.logical, price: p.price } : null; }
function trimNum(v) { if (v == null) return ''; const a = Math.abs(v); const dp = a >= 1000 ? 2 : a >= 1 ? 4 : 8; return +v.toFixed(dp); }
function toHex(c) { if (!c) return '#2962ff'; if (c[0] === '#' && c.length === 7) return c; const m = c.match(/\d+/g); if (!m) return '#2962ff'; return '#' + m.slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join(''); }

function line(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function dot(ctx, x, y) { ctx.save(); ctx.setLineDash([]); ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
function label(ctx, x, y, text, color) {
  ctx.save(); ctx.setLineDash([]); ctx.font = '10px sans-serif'; ctx.fillStyle = color;
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
    if (d.locked) return;   // locked shapes are protected from the eraser
    const x1 = X(panel, d.p1), y1 = Y(panel, d.p1);
    let dist = Math.hypot(px - x1, py - y1);
    if (d.p2) { const x2 = X(panel, d.p2), y2 = Y(panel, d.p2); dist = Math.min(dist, Math.hypot(px - x2, py - y2)); }
    if (dist < bestD) { bestD = dist; best = i; }
  });
  if (best >= 0) {
    if (panel.drawings[best] === drawingState.selected) deselect();
    panel.drawings.splice(best, 1);
  }
  document.dispatchEvent(new CustomEvent('drawings-changed'));
}

export function clearDrawings(panel) {
  if (drawingState.selectedPanel === panel) deselect();
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
