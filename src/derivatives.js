// ============================================================
// DERIVATIVES (backend) — Binance USDT-M futures funding rate & open interest.
// Public REST endpoints, no API key required. Fixed host (fapi.binance.com) and
// validated symbol/period keep this safe from SSRF.
// ============================================================
const FAPI = 'https://fapi.binance.com';

export async function fetchFundingOI(symbol) {
  const [premiumRes, oiRes] = await Promise.all([
    fetch(`${FAPI}/fapi/v1/premiumIndex?symbol=${symbol}`),
    fetch(`${FAPI}/fapi/v1/openInterest?symbol=${symbol}`),
  ]);
  if (!premiumRes.ok) throw new Error(`no futures market for ${symbol}`);
  const premium = await premiumRes.json();
  const oi = oiRes.ok ? await oiRes.json() : null;
  return {
    symbol,
    markPrice: +premium.markPrice,
    fundingRate: +premium.lastFundingRate,
    nextFundingTime: +premium.nextFundingTime,
    openInterest: oi ? +oi.openInterest : null,
  };
}

const OI_PERIODS = new Set(['5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d']);

export async function fetchOIHistory(symbol, period = '1h', limit = 200) {
  if (!OI_PERIODS.has(period)) period = '1h';
  const url = `${FAPI}/futures/data/openInterestHist?symbol=${symbol}&period=${period}&limit=${Math.min(Math.max(limit, 1), 500)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  return (Array.isArray(j) ? j : []).map(d => ({
    time: Math.floor(d.timestamp / 1000),
    oi: +d.sumOpenInterest,
    oiValue: +d.sumOpenInterestValue,
  }));
}
