// ============================================================
// DERIVATIVES (frontend, data only) — funding rate, open interest & live
// liquidations for Binance USDT-M futures. Rendering lives in charts.js so it
// can reach panel-level chart/marker state; this module stays DOM-free.
// ============================================================
import { fetchJSON, warn } from './utils.js';

// fapi.binance.com sends `Access-Control-Allow-Origin: *` on every endpoint
// used here (confirmed live), so these fetch it directly from the browser —
// the same approach already used for the live price/kline WebSockets and the
// liquidation stream below. This matters in practice: Binance blocks a lot of
// cloud/datacenter IP ranges (including where this app's own server may be
// hosted) from its REST API, while a user's own browser IP is unaffected —
// bug report confirmed "Derivatives data unavailable" in the deployed app
// even though the exact same request succeeded from local `curl`/server-side
// testing, which is the signature of a server-IP block, not a code bug.
// `/api/derivatives(/oi-history)` (server.js) still exists and is used as a
// fallback for the opposite case — a client-side network that blocks
// binance.com domains directly but not this app's own server.
const FAPI = 'https://fapi.binance.com';

async function fetchDerivativesDirect(symbol) {
  const [premium, oi] = await Promise.all([
    fetchJSON(`${FAPI}/fapi/v1/premiumIndex?symbol=${symbol}`, {}, 6000),
    fetchJSON(`${FAPI}/fapi/v1/openInterest?symbol=${symbol}`, {}, 6000).catch(() => null),
  ]);
  return {
    symbol,
    markPrice: +premium.markPrice,
    fundingRate: +premium.lastFundingRate,
    nextFundingTime: +premium.nextFundingTime,
    openInterest: oi ? +oi.openInterest : null,
  };
}

export async function fetchDerivatives(symbol) {
  try {
    return await fetchDerivativesDirect(symbol);
  } catch (e) {
    warn('direct derivatives fetch failed, falling back to server proxy', e.message);
    return fetchJSON(`/api/derivatives?symbol=${encodeURIComponent(symbol)}`, {}, 8000);
  }
}

async function fetchOIHistoryDirect(symbol, period, limit) {
  const j = await fetchJSON(`${FAPI}/futures/data/openInterestHist?symbol=${symbol}&period=${period}&limit=${limit}`, {}, 8000);
  return (Array.isArray(j) ? j : []).map(d => ({
    time: Math.floor(d.timestamp / 1000),
    oi: +d.sumOpenInterest,
    oiValue: +d.sumOpenInterestValue,
  }));
}

export async function fetchOIHistory(symbol, period = '1h', limit = 200) {
  try {
    return await fetchOIHistoryDirect(symbol, period, limit);
  } catch (e) {
    warn('direct OI-history fetch failed, falling back to server proxy', e.message);
    const j = await fetchJSON(`/api/derivatives/oi-history?symbol=${encodeURIComponent(symbol)}&period=${period}&limit=${limit}`, {}, 12000);
    return j.data || [];
  }
}

// A symbol is eligible for the Binance USDT-M futures feed used here. Funding
// rate/OI is always sourced from Binance regardless of which exchange the
// chart's spot price comes from — symbols are stored in the same compact
// Binance-style form (e.g. 'BTCUSDT') across every exchange in this app, so
// the feed works for a Bybit/OKX/Gate/Bitvavo panel just as well as a native
// Binance one. Only the USDT-quote requirement (what Binance futures lists)
// still applies.
export function derivativesAvailable(symbol) {
  return /USDT$/.test(symbol);
}

// Live liquidation stream for one symbol. onLiq receives one order per event:
// { time, side: 'BUY'|'SELL', price, qty, value }. 'SELL' = a long got
// liquidated (forced market sell); 'BUY' = a short got liquidated.
export function openLiquidationStream(symbol, onLiq) {
  try {
    const ws = new WebSocket(`wss://fstream.binance.com/ws/${symbol.toLowerCase()}@forceOrder`);
    ws.onmessage = ev => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      const o = m.o;
      if (!o) return;
      onLiq({ time: Math.floor(o.T / 1000), side: o.S, price: +o.p, qty: +o.q, value: +o.p * +o.q });
    };
    ws.onerror = () => warn('liquidation stream error');
    return ws;
  } catch (e) {
    warn('openLiquidationStream failed', e.message);
    return null;
  }
}
