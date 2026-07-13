// ============================================================
// MARKET STATUS — Fear & Greed Index, Altcoin Season Index, global market
// snapshot shown above the watchlist. Data comes from the server-side
// /api/market-status proxy (server.js), which caches alternative.me +
// CoinGecko responses so the free-tier upstream APIs stay within their
// rate limits regardless of how many clients are watching.
// ============================================================
import { fetchJSON, esc } from './utils.js';

const REFRESH_MS = 10 * 60_000;
let _timer = null;

export function initMarketStatus() {
  loadMarketStatus();
  if (_timer) clearInterval(_timer);
  _timer = setInterval(loadMarketStatus, REFRESH_MS);
}

async function loadMarketStatus() {
  const el = document.getElementById('marketStatus');
  if (!el) return;
  try {
    const data = await fetchJSON('/api/market-status', {}, 12000);
    renderMarketStatus(data);
  } catch (e) {
    if (!el.dataset.rendered) el.innerHTML = '<div class="muted">Market status unavailable.</div>';
  }
}

function fmtUsd(n) {
  if (n == null || isNaN(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (a >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toFixed(0)}`;
}

// Fear & Greed's own 5-band scale (0 Extreme Fear -> 100 Extreme Greed).
function fgColor(v) {
  if (v == null) return 'var(--muted)';
  if (v <= 24) return 'var(--red)';
  if (v <= 44) return '#f7a600';
  if (v <= 55) return 'var(--muted)';
  if (v <= 75) return '#9ccc65';
  return 'var(--green)';
}

function seasonColor(cls) {
  if (cls === 'Altcoin Season') return 'var(--green)';
  if (cls === 'Bitcoin Season') return '#f7a600';
  return 'var(--muted)';
}

function meter(value, color) {
  const pct = Math.max(0, Math.min(100, value ?? 0));
  return `<div class="ms-meter"><div class="ms-meter-fill" style="width:${pct}%;background:${color}"></div></div>`;
}

function renderMarketStatus(data) {
  const el = document.getElementById('marketStatus');
  if (!el) return;
  el.dataset.rendered = '1';

  const fg = data?.fearGreed;
  const alt = data?.altcoinSeason;
  const g = data?.global;

  const fgVal = fg?.value ?? null;
  const fgColorV = fgColor(fgVal);
  const fgDelta = (fg && fg.previousValue != null) ? fg.value - fg.previousValue : null;

  const altVal = alt?.index ?? null;
  const altColorV = seasonColor(alt?.classification);

  const domChange = g?.marketCapChange24h;
  const domChangeCls = domChange > 0 ? 'up' : (domChange < 0 ? 'down' : '');

  el.innerHTML = `
    <div class="ms-row">
      <div class="ms-label">
        <span>Fear &amp; Greed</span>
        <span class="ms-value" style="color:${fgColorV}">${fgVal ?? '—'}${fg ? ` · ${esc(fg.classification)}` : ''}</span>
      </div>
      ${meter(fgVal, fgColorV)}
      ${fgDelta != null ? `<div class="ms-sub">${fgDelta > 0 ? '▲' : fgDelta < 0 ? '▼' : '·'} ${Math.abs(fgDelta)} vs yesterday</div>` : ''}
    </div>
    <div class="ms-row">
      <div class="ms-label">
        <span>Altcoin Season</span>
        <span class="ms-value" style="color:${altColorV}">${altVal ?? '—'}${alt ? ` · ${esc(alt.classification)}` : ''}</span>
      </div>
      ${meter(altVal, altColorV)}
      ${alt ? `<div class="ms-sub">${esc(alt.window)} performance vs BTC, top ${alt.sample}</div>` : ''}
    </div>
    <div class="ms-stats">
      <div class="ms-stat"><span class="ms-stat-label">BTC Dom.</span><span class="ms-stat-value">${g?.btcDominance != null ? g.btcDominance.toFixed(1) + '%' : '—'}</span></div>
      <div class="ms-stat"><span class="ms-stat-label">Mkt Cap</span><span class="ms-stat-value">${fmtUsd(g?.totalMarketCapUsd)} ${domChange != null ? `<span class="${domChangeCls}">${(domChange > 0 ? '+' : '') + domChange.toFixed(2)}%</span>` : ''}</span></div>
      <div class="ms-stat"><span class="ms-stat-label">24h Vol.</span><span class="ms-stat-value">${fmtUsd(g?.totalVolumeUsd)}</span></div>
    </div>
  `;
}
