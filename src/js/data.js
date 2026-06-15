// ============================================================
// DATA — exchange REST + WebSocket access (Binance primary)
// ============================================================
import { EXCHANGES } from './constants.js';
import { state } from './state.js';
import { fetchJSON, baseAsset, quoteAsset, log, warn } from './utils.js';

// Quote currencies to include when fetching all pairs
const SUPPORTED_QUOTES = ['USDT', 'USDC', 'EUR'];

function ex() { return EXCHANGES[state.settings.exchange] || EXCHANGES.binance; }

// ---- Symbol normalisation per exchange --------------------
export function toExchangeSymbol(sym, exId = state.settings.exchange) {
  const base = baseAsset(sym);
  const quote = quoteAsset(sym);
  switch (exId) {
    case 'okx':    return `${base}-${quote}`;
    case 'gate':   return `${base}_${quote}`;
    case 'kucoin': return `${base}-${quote}`;
    default:       return sym; // binance, bybit
  }
}

// ---- Klines (candles) -------------------------------------
// Returns [{ time(sec), open, high, low, close, volume }]
export async function fetchKlines(symbol, tf, limit = 500) {
  const e = ex();
  const interval = e.intervals[tf] || tf;
  // Prefer the server-side JSON-file cache/proxy (persists bars to disk and
  // avoids exchange CORS). Falls through to direct exchange fetch if the server
  // route is unavailable (e.g. opened from file://) or returns nothing.
  try {
    const j = await fetchJSON(`/api/klines?exchange=${e.id}&symbol=${encodeURIComponent(symbol)}&tf=${tf}&limit=${limit}`, {}, 16000);
    if (j && Array.isArray(j.bars) && j.bars.length) return j.bars;
  } catch (e0) {
    warn('server kline cache unavailable, fetching exchange directly', e0.message);
  }
  try {
    if (e.id === 'binance') {
      const url = `${e.rest}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
      const raw = await fetchJSON(url);
      return raw.map(k => ({
        time: Math.floor(k[0] / 1000),
        open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
      }));
    }
    if (e.id === 'bybit') {
      const url = `${e.rest}/kline?category=spot&symbol=${symbol}&interval=${interval}&limit=${limit}`;
      const j = await fetchJSON(url);
      const list = (j.result?.list || []).slice().reverse();
      return list.map(k => ({
        time: Math.floor(+k[0] / 1000),
        open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
      }));
    }
    if (e.id === 'okx') {
      const inst = toExchangeSymbol(symbol, 'okx');
      const url = `${e.rest}/candles?instId=${inst}&bar=${interval}&limit=${Math.min(limit, 300)}`;
      const j = await fetchJSON(url);
      const list = (j.data || []).slice().reverse();
      return list.map(k => ({
        time: Math.floor(+k[0] / 1000),
        open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
      }));
    }
    if (e.id === 'gate') {
      const inst = toExchangeSymbol(symbol, 'gate');
      const url = `${e.rest}/candlesticks?currency_pair=${inst}&interval=${interval}&limit=${Math.min(limit, 1000)}`;
      const raw = await fetchJSON(url);
      return raw.map(k => ({
        time: Math.floor(+k[0]),
        open: +k[5], high: +k[3], low: +k[4], close: +k[2], volume: +k[6] || +k[1],
      })).sort((a, b) => a.time - b.time);
    }
    if (e.id === 'kucoin') {
      // KuCoin klines are served via the server proxy (avoids CORS)
      const j = await fetchJSON(`/api/klines?exchange=kucoin&symbol=${encodeURIComponent(symbol)}&tf=${tf}&limit=${limit}`, {}, 16000);
      if (j && Array.isArray(j.bars) && j.bars.length) return j.bars;
      throw new Error('kucoin proxy returned empty');
    }
  } catch (e2) {
    warn('fetchKlines failed, trying fallback chain', e2.message);
  }
  // Ordered fallback chain: try Gate.io (good USDC coverage) then Binance
  const fallbacks = [
    async () => {
      const inst = toExchangeSymbol(symbol, 'gate');
      const gateInterval = EXCHANGES.gate.intervals[tf] || tf;
      const raw = await fetchJSON(`${EXCHANGES.gate.rest}/candlesticks?currency_pair=${inst}&interval=${gateInterval}&limit=${Math.min(limit, 1000)}`);
      if (!raw?.length) throw new Error('empty');
      return raw.map(k => ({ time: Math.floor(+k[0]), open: +k[5], high: +k[3], low: +k[4], close: +k[2], volume: +k[6] || +k[1] })).sort((a, b) => a.time - b.time);
    },
    async () => {
      const binInt = EXCHANGES.binance.intervals[tf] || tf;
      const raw = await fetchJSON(`${EXCHANGES.binance.rest}/klines?symbol=${symbol}&interval=${binInt}&limit=${limit}`);
      if (!raw?.length) throw new Error('empty');
      return raw.map(k => ({ time: Math.floor(k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }));
    },
  ];
  for (const attempt of fallbacks) {
    try { return await attempt(); } catch {}
  }
  throw new Error(`No data source returned bars for ${symbol} ${tf}`);
}

// Cached wrapper (1 min TTL)
export async function getCachedKlines(symbol, tf, limit = 500) {
  const key = `${state.settings.exchange}:${symbol}:${tf}`;
  const c = state.klineCache[key];
  if (c && Date.now() - c.ts < 60000 && c.data.length >= limit) {
    return c.data.slice(-limit);
  }
  const data = await fetchKlines(symbol, tf, limit);
  state.klineCache[key] = { data, ts: Date.now() };
  return data;
}

// ---- Single price / 24h stats -----------------------------
export async function fetchPrice(symbol) {
  const e = ex();
  try {
    if (e.id === 'binance') {
      const j = await fetchJSON(`${e.rest}/ticker/24hr?symbol=${symbol}`);
      return {
        price: +j.lastPrice, open: +j.openPrice, high: +j.highPrice, low: +j.lowPrice,
        change: +j.priceChangePercent, volume: +j.quoteVolume,
      };
    }
    if (e.id === 'bybit') {
      const j = await fetchJSON(`${e.rest}/tickers?category=spot&symbol=${symbol}`);
      const t = j.result?.list?.[0];
      if (!t) throw new Error('no bybit ticker');
      const price = +t.lastPrice, open = +t.prevPrice24h || price;
      return { price, open, change: open ? ((price - open) / open) * 100 : 0, chgVal: price - open, volume: +t.turnover24h || 0 };
    }
    if (e.id === 'gate') {
      const inst = toExchangeSymbol(symbol, 'gate');
      const j = await fetchJSON(`${e.rest}/tickers?currency_pair=${inst}`);
      const t = Array.isArray(j) ? j[0] : j;
      if (!t) throw new Error('no gate ticker');
      const price = +t.last, open = +t.open_24h || price;
      return { price, open, change: open ? ((price - open) / open) * 100 : +t.change_percentage || 0, chgVal: price - open, volume: +t.quote_volume || 0 };
    }
    if (e.id === 'kucoin') {
      const inst = toExchangeSymbol(symbol, 'kucoin');
      const j = await fetchJSON(`${e.rest}/market/stats?symbol=${inst}`);
      const t = j.data;
      if (!t) throw new Error('no kucoin ticker');
      const price = +t.last, open = +t.open || price;
      return { price, open, change: open ? ((price - open) / open) * 100 : 0, chgVal: price - open, volume: +t.volValue || 0 };
    }
  } catch (e2) { warn('fetchPrice fallback', e2.message); }
  // Final fallback: Binance
  const j = await fetchJSON(`${EXCHANGES.binance.rest}/ticker/24hr?symbol=${symbol}`);
  return {
    price: +j.lastPrice, open: +j.openPrice, high: +j.highPrice, low: +j.lowPrice,
    change: +j.priceChangePercent, volume: +j.quoteVolume,
  };
}

// Refresh state.prices for watchlist symbols that lack data.
// Tries the Binance batch ticker first (one request for all), then individual
// per-exchange calls for any symbol Binance doesn't know about.
export async function refreshMissingPrices(symbols) {
  const missing = symbols.filter(s => !state.prices[s] || !state.prices[s].price);
  if (!missing.length) return;
  const found = new Set();
  try {
    const encoded = encodeURIComponent(JSON.stringify(missing));
    const arr = await fetchJSON(`${EXCHANGES.binance.rest}/ticker/24hr?symbols=${encoded}`);
    for (const t of (Array.isArray(arr) ? arr : [])) {
      const price = +t.lastPrice, open = +t.openPrice;
      state.prices[t.symbol] = { price, open, change: +t.priceChangePercent, chgVal: price - open };
      found.add(t.symbol);
    }
  } catch (e2) { warn('refreshMissingPrices batch', e2.message); }
  // Symbols not on Binance: fetch individually from the active exchange
  const remaining = missing.filter(s => !found.has(s));
  await Promise.allSettled(remaining.map(async sym => {
    try {
      const p = await fetchPrice(sym);
      state.prices[sym] = { price: p.price, open: p.open, change: p.change, chgVal: p.chgVal ?? p.price - p.open };
    } catch {}
  }));
}

// ---- All tradeable pairs (USDT + USDC + EUR) from the active exchange --------
async function fetchBinancePairs() {
  const j = await fetchJSON(`${EXCHANGES.binance.rest}/exchangeInfo`);
  return j.symbols
    .filter(s => s.status === 'TRADING' && SUPPORTED_QUOTES.includes(s.quoteAsset))
    .map(s => ({ symbol: s.symbol, name: s.baseAsset, quote: s.quoteAsset }));
}

async function fetchExchangePairs(exId) {
  switch (exId) {
    case 'bybit': {
      const j = await fetchJSON('https://api.bybit.com/v5/market/instruments-info?category=spot');
      return (j.result?.list || [])
        .filter(s => SUPPORTED_QUOTES.includes(s.quoteCoin) && (s.status === 'Trading' || !s.status))
        .map(s => ({ symbol: `${s.baseCoin}${s.quoteCoin}`, name: s.baseCoin, quote: s.quoteCoin }));
    }
    case 'okx': {
      const j = await fetchJSON('https://www.okx.com/api/v5/public/instruments?instType=SPOT');
      return (j.data || [])
        .filter(s => SUPPORTED_QUOTES.includes(s.quoteCcy) && s.state === 'live')
        .map(s => ({ symbol: `${s.baseCcy}${s.quoteCcy}`, name: s.baseCcy, quote: s.quoteCcy }));
    }
    case 'gate': {
      const j = await fetchJSON('https://api.gateio.ws/api/v4/spot/currency_pairs');
      return (j || [])
        .filter(s => SUPPORTED_QUOTES.includes(s.quote) && (s.trade_status === 'tradable' || !s.trade_status))
        .map(s => ({ symbol: `${s.base}${s.quote}`, name: s.base, quote: s.quote }));
    }
    case 'kucoin': {
      const j = await fetchJSON('https://api.kucoin.com/api/v1/symbols');
      return (j.data || [])
        .filter(s => SUPPORTED_QUOTES.includes(s.quoteCurrency) && s.enableTrading)
        .map(s => ({ symbol: `${s.baseCurrency}${s.quoteCurrency}`, name: s.baseCurrency, quote: s.quoteCurrency }));
    }
    default: // binance + hyperliquid (which falls back to Binance data)
      return fetchBinancePairs();
  }
}

export async function fetchAllPairs() {
  if (state.allPairs) return state.allPairs;
  const exId = state.settings.exchange;
  try {
    let pairs = await fetchExchangePairs(exId);
    // Some exchanges occasionally return an empty/odd payload — fall back so the
    // symbol picker is never empty.
    if (!pairs.length && exId !== 'binance') pairs = await fetchBinancePairs();
    // De-dupe by symbol and sort alphabetically for a stable picker order.
    const seen = new Set();
    pairs = pairs.filter(p => p.symbol && !seen.has(p.symbol) && seen.add(p.symbol))
                 .sort((a, b) => a.symbol.localeCompare(b.symbol));
    state.allPairs = pairs;
    return pairs;
  } catch (e) {
    warn('fetchAllPairs failed', e.message);
    try { state.allPairs = await fetchBinancePairs(); return state.allPairs; }
    catch { return []; }
  }
}

// Validate a symbol exists on Binance
export async function validateSymbol(symbol) {
  try {
    await fetchJSON(`${EXCHANGES.binance.rest}/ticker/price?symbol=${symbol}`);
    return true;
  } catch { return false; }
}

// ---- Order book snapshot ----------------------------------
export async function fetchOrderBook(symbol, limit = 20) {
  const e = ex();
  try {
    if (e.id === 'binance') {
      const j = await fetchJSON(`${e.rest}/depth?symbol=${symbol}&limit=${limit}`);
      return {
        symbol,
        bids: j.bids.map(b => ({ price: +b[0], qty: +b[1] })),
        asks: j.asks.map(a => ({ price: +a[0], qty: +a[1] })),
      };
    }
  } catch (e2) { warn('fetchOrderBook fallback', e2.message); }
  const j = await fetchJSON(`${EXCHANGES.binance.rest}/depth?symbol=${symbol}&limit=${limit}`);
  return {
    symbol,
    bids: j.bids.map(b => ({ price: +b[0], qty: +b[1] })),
    asks: j.asks.map(a => ({ price: +a[0], qty: +a[1] })),
  };
}

// ---- WebSocket: live mini-tickers for all symbols ---------
// onUpdate({symbol, price, change, open})
export function openPriceStream(onUpdate) {
  closePriceStream();
  try {
    const ws = new WebSocket('wss://stream.binance.com:9443/ws/!miniTicker@arr');
    state.ws = ws;
    ws.onopen = () => log('price stream open');
    ws.onmessage = ev => {
      let arr;
      try { arr = JSON.parse(ev.data); } catch { return; }
      if (!Array.isArray(arr)) return;
      for (const t of arr) {
        if (!t.s || !SUPPORTED_QUOTES.some(q => t.s.endsWith(q))) continue;
        const price = +t.c, open = +t.o;
        const change = open ? ((price - open) / open) * 100 : 0;
        onUpdate({ symbol: t.s, price, open, change, chgVal: price - open });
      }
    };
    ws.onerror = () => warn('price stream error');
    return ws;
  } catch (e) {
    warn('openPriceStream failed', e.message);
    return null;
  }
}

export function closePriceStream() {
  if (state.ws) { try { state.ws.close(); } catch {} state.ws = null; }
}

// ---- WebSocket: live kline for one panel ------------------
// Returns the ws; onCandle({time, open, high, low, close, volume, closed})
export function openKlineStream(symbol, tf, onCandle) {
  const e = ex();
  const interval = e.intervals[tf] || tf;
  try {
    if (e.id === 'binance') {
      const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${interval}`);
      ws.onmessage = ev => {
        let m;
        try { m = JSON.parse(ev.data); } catch { return; }
        const k = m.k;
        if (!k) return;
        onCandle({
          time: Math.floor(k.t / 1000),
          open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v,
          closed: k.x,
        });
      };
      return ws;
    }
    if (e.id === 'bybit') return openBybitKlineStream(symbol, interval, onCandle);
    return null; // okx / gate / hyperliquid: no public kline WS wired here yet
  } catch (e2) {
    warn('openKlineStream failed', e2.message);
    return null;
  }
}

// Bybit v5 public spot kline stream. Returns a WebSocket whose .close() also
// stops the keep-alive ping (Bybit drops idle sockets after ~30s).
function openBybitKlineStream(symbol, interval, onCandle) {
  const ws = new WebSocket('wss://stream.bybit.com/v5/public/spot');
  let ping = null;
  ws.addEventListener('open', () => {
    try { ws.send(JSON.stringify({ op: 'subscribe', args: [`kline.${interval}.${symbol}`] })); } catch {}
    ping = setInterval(() => { try { ws.send(JSON.stringify({ op: 'ping' })); } catch {} }, 20000);
  });
  ws.addEventListener('message', ev => {
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    if (!m.topic || !m.topic.startsWith('kline.') || !Array.isArray(m.data)) return;
    const k = m.data[0];
    if (!k) return;
    onCandle({
      time: Math.floor(+k.start / 1000),
      open: +k.open, high: +k.high, low: +k.low, close: +k.close, volume: +k.volume,
      closed: !!k.confirm,
    });
  });
  const stop = () => { if (ping) { clearInterval(ping); ping = null; } };
  ws.addEventListener('close', stop);
  ws.addEventListener('error', stop);
  return ws;
}

// ---- WebSocket: order book stream -------------------------
export function openOrderBookStream(symbol, onBook) {
  closeOrderBookStream();
  const e = ex();
  if (e.id !== 'binance') return null;
  try {
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@depth20@500ms`);
    state.orderBookWS = ws;
    ws.onmessage = ev => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (!m.bids && !m.b) return;
      const bids = (m.bids || m.b || []).map(b => ({ price: +b[0], qty: +b[1] }));
      const asks = (m.asks || m.a || []).map(a => ({ price: +a[0], qty: +a[1] }));
      onBook({ symbol, bids, asks });
    };
    return ws;
  } catch (e2) {
    warn('openOrderBookStream failed', e2.message);
    return null;
  }
}

export function closeOrderBookStream() {
  if (state.orderBookWS) { try { state.orderBookWS.close(); } catch {} state.orderBookWS = null; }
}
