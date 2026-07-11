// ============================================================
// DERIVATIVES (frontend, data only) — funding rate, open interest & live
// liquidations for Binance USDT-M futures. Rendering lives in charts.js so it
// can reach panel-level chart/marker state; this module stays DOM-free.
// ============================================================
import { fetchJSON, warn } from './utils.js';

export async function fetchDerivatives(symbol) {
  return fetchJSON(`/api/derivatives?symbol=${encodeURIComponent(symbol)}`, {}, 8000);
}

export async function fetchOIHistory(symbol, period = '1h', limit = 200) {
  const j = await fetchJSON(`/api/derivatives/oi-history?symbol=${encodeURIComponent(symbol)}&period=${period}&limit=${limit}`, {}, 12000);
  return j.data || [];
}

// A symbol is eligible for the Binance USDT-M futures feed used here.
export function derivativesAvailable(symbol, exchange) {
  return exchange === 'binance' && /USDT$/.test(symbol);
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
