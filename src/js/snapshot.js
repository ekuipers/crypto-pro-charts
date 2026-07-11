// ============================================================
// SNAPSHOT & EXPORT (P3-23) — one-click PNG screenshot with watermark,
// plus CSV export of the currently visible bars.
// ============================================================
import { baseAsset, quoteAsset } from './utils.js';

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Composite the LightweightCharts screenshot (candles/indicators) with the
// panel's own drawing-layer canvas (trend lines, fibs, position tool, …) so
// the exported PNG matches what the user actually sees, then stamps a
// watermark in the corner.
export function exportPanelPNG(panel) {
  if (!panel?.chart) return;
  const shot = panel.chart.takeScreenshot();
  const out = document.createElement('canvas');
  out.width = shot.width;
  out.height = shot.height;
  const ctx = out.getContext('2d');
  ctx.drawImage(shot, 0, 0);

  const drawCanvas = panel._drawCanvas;
  if (drawCanvas && drawCanvas.width && drawCanvas.height) {
    ctx.drawImage(drawCanvas, 0, 0, out.width, out.height);
  }

  const label = `${baseAsset(panel.symbol)}/${quoteAsset(panel.symbol)} · ${panel.tf} · CryptoPro Charts · ${new Date().toLocaleString()}`;
  ctx.font = `${Math.max(11, Math.round(out.width / 120))}px sans-serif`;
  const textW = ctx.measureText(label).width;
  const pad = 8;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, out.height - 24, textW + pad * 2, 24);
  ctx.fillStyle = '#fff';
  ctx.fillText(label, pad, out.height - 8);

  out.toBlob(blob => {
    if (blob) download(blob, `${panel.symbol}_${panel.tf}_${Date.now()}.png`);
  }, 'image/png');
}

// Exports the bars currently visible in the panel's viewport (per the
// roadmap: "CSV export of visible bars"), not the full loaded history.
export function exportPanelCSV(panel) {
  if (!panel?.chart || !panel.data?.length) return;
  const range = panel.chart.timeScale().getVisibleLogicalRange();
  const from = range ? Math.max(0, Math.floor(range.from)) : 0;
  const to = range ? Math.min(panel.data.length - 1, Math.ceil(range.to)) : panel.data.length - 1;
  const bars = panel.data.slice(from, to + 1);
  if (!bars.length) return;

  const rows = ['Time,Date (UTC),Open,High,Low,Close,Volume'];
  for (const b of bars) {
    rows.push([b.time, new Date(b.time * 1000).toISOString(), b.open, b.high, b.low, b.close, b.volume].join(','));
  }
  download(new Blob([rows.join('\n')], { type: 'text/csv' }), `${panel.symbol}_${panel.tf}_${Date.now()}.csv`);
}
