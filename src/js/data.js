// ============================================================
// DATA — exchange REST + WebSocket access (Binance primary)
// ============================================================
import { EXCHANGES, TF_SECONDS } from './constants.js';
import { state } from './state.js';
import { fetchJSON, baseAsset, quoteAsset, log, warn, priceKey } from './utils.js';

// Quote currencies to include when fetching all pairs
const SUPPORTED_QUOTES = ['USDT', 'USDC', 'EUR', 'USD'];

// Legacy/fallback default exchange for symbols or panels that carry no explicit
// exchange of their own (e.g. pre-multi-exchange saved sessions).
export function defaultExchange() {
  const list = state.settings.exchanges;
  if (Array.isArray(list) && list.length && EXCHANGES[list[0]]) return list[0];
  return EXCHANGES[state.settings.exchange] ? state.settings.exchange : 'binance';
}

// The set of exchanges to query for the symbol picker. Falls back to the legacy
// single-exchange setting so old sessions keep working.
export function enabledExchanges() {
  const list = Array.isArray(state.settings.exchanges) && state.settings.exchanges.length
    ? state.settings.exchanges
    : [state.settings.exchange || 'binance'];
  return list.filter(id => EXCHANGES[id]);
}

function ex(exId = defaultExchange()) { return EXCHANGES[exId] || EXCHANGES.binance; }

// ---- Symbol normalisation per exchange --------------------
export function toExchangeSymbol(sym, exId = defaultExchange()) {
  const base = baseAsset(sym);
  const quote = quoteAsset(sym);
  switch (exId) {
    case 'okx':          return `${base}-${quote}`;
    case 'gate':         return `${base}_${quote}`;
    case 'kucoin':       return `${base}-${quote}`;
    case 'bitstamp':     return `${base.toLowerCase()}${quote.toLowerCase()}`;
    case 'cryptocompare': return `${base}_${quote}`;
    // Alpaca US crypto is USD-quoted; map stable quotes to USD.
    case 'alpaca':       return `${base}/${(quote === 'USDT' || quote === 'USDC') ? 'USD' : quote}`;
    // Bitvavo is EUR-quoted; map stable quotes to EUR.
    case 'bitvavo':      return `${base}-${(quote === 'USDT' || quote === 'USDC') ? 'EUR' : quote}`;
    default:             return sym; // binance, bybit
  }
}

// ---- Klines (candles) -------------------------------------
// Returns [{ time(sec), open, high, low, close, volume }]
export async function fetchKlines(symbol, tf, limit = 500, exId = defaultExchange()) {
  const e = ex(exId);
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
    if (e.id === 'bitstamp') {
      const inst = toExchangeSymbol(symbol, 'bitstamp');
      const step = e.intervals[tf] || '3600';
      const url = `${e.rest}/ohlcdata/${inst}/?step=${step}&limit=${Math.min(limit, 1000)}`;
      const j = await fetchJSON(url);
      return (j.data?.ohlc || []).map(k => ({
        time: Math.floor(+k.timestamp), open: +k.open, high: +k.high, low: +k.low, close: +k.close, volume: +k.volume,
      }));
    }
    if (e.id === 'bitvavo') {
      const inst = toExchangeSymbol(symbol, 'bitvavo');
      const url = `${e.rest}/${inst}/candles?interval=${interval}&limit=${Math.min(limit, 1440)}`;
      const raw = await fetchJSON(url);
      return (raw || []).map(k => ({
        time: Math.floor(+k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
      })).sort((a, b) => a.time - b.time);
    }
    if (e.id === 'cryptocompare') {
      const [base2, quote2] = toExchangeSymbol(symbol, 'cryptocompare').split('_');
      const [endpoint, agg] = (e.intervals[tf] || 'histohour').split('|');
      const aggParam = agg ? `&aggregate=${agg}` : '';
      const url = `${e.rest}/${endpoint}?fsym=${base2}&tsym=${quote2}&limit=${Math.min(limit, 2000)}${aggParam}`;
      const j = await fetchJSON(url);
      return (j.Data?.Data || [])
        .map(k => ({ time: Math.floor(+k.time), open: +k.open, high: +k.high, low: +k.low, close: +k.close, volume: +k.volumefrom }))
        .filter(k => k.close > 0);
    }
    if (e.id === 'alpaca') {
      // Alpaca needs an explicit `start`, else it returns only the latest window.
      const inst = toExchangeSymbol(symbol, 'alpaca');
      const secs = TF_SECONDS[tf] || 3600;
      const start = new Date(Date.now() - (limit + 5) * secs * 1000).toISOString();
      const url = `${e.rest}/bars?symbols=${encodeURIComponent(inst)}&timeframe=${interval}&limit=${Math.min(limit, 10000)}&start=${start}`;
      const j = await fetchJSON(url);
      const list = Object.values(j.bars || {})[0] || [];
      return list.map(k => ({ time: Math.floor(new Date(k.t).getTime() / 1000), open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v }));
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

// ---- History paging (P1-1) ---------------------------------
// Older bars strictly BEFORE `before` (epoch sec) via the server's Postgres
// kline store (which tops itself up from the exchange). Returns ascending bars;
// an empty array means history is exhausted.
export async function fetchOlderKlines(symbol, tf, before, limit = 500, exId = defaultExchange()) {
  const j = await fetchJSON(
    `/api/klines/history?exchange=${ex(exId).id}&symbol=${encodeURIComponent(symbol)}&tf=${tf}&before=${Math.floor(before)}&limit=${limit}`,
    {}, 20000,
  );
  return (j && Array.isArray(j.bars)) ? j.bars : [];
}

// Cached wrapper (1 min TTL)
export async function getCachedKlines(symbol, tf, limit = 500, exId = defaultExchange()) {
  const key = `${exId}:${symbol}:${tf}`;
  const c = state.klineCache[key];
  if (c && Date.now() - c.ts < 60000 && c.data.length >= limit) {
    return c.data.slice(-limit);
  }
  const data = await fetchKlines(symbol, tf, limit, exId);
  state.klineCache[key] = { data, ts: Date.now() };
  return data;
}

// ---- Single price / 24h stats -----------------------------
export async function fetchPrice(symbol, exId = defaultExchange()) {
  const e = ex(exId);
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
    if (e.id === 'bitstamp') {
      const inst = toExchangeSymbol(symbol, 'bitstamp');
      const j = await fetchJSON(`${e.rest}/ticker/${inst}/`);
      const price = +j.last, open = +j.open;
      return { price, open, change: open ? ((price - open) / open) * 100 : 0, chgVal: price - open, volume: +j.volume || 0 };
    }
    if (e.id === 'bitvavo') {
      const inst = toExchangeSymbol(symbol, 'bitvavo');
      const j = await fetchJSON(`${e.rest}/ticker/24h?market=${inst}`);
      const price = +j.last, open = +j.open || price;
      return { price, open, high: +j.high || price, low: +j.low || price, change: open ? ((price - open) / open) * 100 : 0, chgVal: price - open, volume: +j.volumeQuote || +j.volume || 0 };
    }
    if (e.id === 'cryptocompare') {
      const [base2, quote2] = toExchangeSymbol(symbol, 'cryptocompare').split('_');
      const j = await fetchJSON(`https://min-api.cryptocompare.com/data/pricemultifull?fsyms=${base2}&tsyms=${quote2}`);
      const t = j.RAW?.[base2]?.[quote2];
      if (!t) throw new Error('no cryptocompare ticker');
      const price = +t.PRICE, open = +t.OPEN24HOUR;
      return { price, open, change: open ? ((price - open) / open) * 100 : 0, chgVal: price - open, volume: +t.TOTALVOLUME24HTO || 0 };
    }
    if (e.id === 'alpaca') {
      const inst = toExchangeSymbol(symbol, 'alpaca');
      const j = await fetchJSON(`${e.rest}/snapshots?symbols=${encodeURIComponent(inst)}`);
      const snap = j.snapshots?.[inst];
      if (!snap) throw new Error('no alpaca snapshot');
      const db = snap.dailyBar || {};
      const price = +snap.latestTrade?.p || +db.c;
      const open = +db.o || price;
      return { price, open, high: +db.h || price, low: +db.l || price, change: open ? ((price - open) / open) * 100 : 0, chgVal: price - open, volume: +db.v || 0 };
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
// Accepts an array of { symbol, exchange } items. Binance-quoted symbols are
// batched in one ticker request; everything else is fetched individually from
// each item's own exchange (so multi-exchange watchlists price correctly).
export async function refreshMissingPrices(items) {
  // Tolerate plain string symbols for backward compatibility.
  const norm = items.map(s => typeof s === 'string' ? { symbol: s, exchange: defaultExchange() } : s);
  const missing = norm.filter(s => { const k = priceKey(s.symbol, s.exchange); return !state.prices[k] || !state.prices[k].price; });
  if (!missing.length) return;
  const found = new Set();
  // Batch only the symbols actually sourced from Binance.
  const binanceSyms = missing.filter(s => s.exchange === 'binance').map(s => s.symbol);
  if (binanceSyms.length) {
    try {
      const encoded = encodeURIComponent(JSON.stringify(binanceSyms));
      const arr = await fetchJSON(`${EXCHANGES.binance.rest}/ticker/24hr?symbols=${encoded}`);
      for (const t of (Array.isArray(arr) ? arr : [])) {
        const price = +t.lastPrice, open = +t.openPrice;
        state.prices[t.symbol] = { price, open, change: +t.priceChangePercent, chgVal: price - open };
        found.add(t.symbol);
      }
    } catch (e2) { warn('refreshMissingPrices batch', e2.message); }
  }
  // Everything else: fetch individually from the item's own exchange.
  // (Filtered by exchange, not just symbol — a symbol can be missing on one
  // exchange but already satisfied by the Binance batch above on another.)
  const remaining = missing.filter(s => s.exchange !== 'binance' || !found.has(s.symbol));
  await Promise.allSettled(remaining.map(async ({ symbol, exchange }) => {
    try {
      const p = await fetchPrice(symbol, exchange);
      state.prices[priceKey(symbol, exchange)] = { price: p.price, open: p.open, change: p.change, chgVal: p.chgVal ?? p.price - p.open };
    } catch {}
  }));
}

// P2-16: 24h quote volume for Binance-listed watchlist symbols, merged into
// state.prices[sym].volume. Other exchanges are skipped (no cheap batch
// endpoint) — their rows simply show no volume figure.
export async function refreshVolumes(items) {
  const binanceSyms = items.filter(s => s.exchange === 'binance').map(s => s.symbol);
  if (!binanceSyms.length) return;
  try {
    const encoded = encodeURIComponent(JSON.stringify(binanceSyms));
    const arr = await fetchJSON(`${EXCHANGES.binance.rest}/ticker/24hr?symbols=${encoded}`);
    for (const t of (Array.isArray(arr) ? arr : [])) {
      if (!state.prices[t.symbol]) state.prices[t.symbol] = {};
      state.prices[t.symbol].volume = +t.quoteVolume;
    }
  } catch (e) { warn('refreshVolumes failed', e.message); }
}

// ---- All tradeable pairs (USDT + USDC + EUR) from the active exchange --------
async function fetchBinancePairs() {
  const j = await fetchJSON(`${EXCHANGES.binance.rest}/exchangeInfo`);
  return j.symbols
    .filter(s => s.status === 'TRADING' && SUPPORTED_QUOTES.includes(s.quoteAsset))
    .map(s => ({ symbol: s.symbol, name: s.baseAsset, quote: s.quoteAsset }));
}

export async function fetchExchangePairs(exId) {
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
    case 'bitstamp': {
      const j = await fetchJSON('https://www.bitstamp.net/api/v2/trading-pairs-info/');
      return (j || [])
        .filter(s => s.trading === 'Enabled')
        .map(s => { const parts = (s.name || '').split('/'); return parts.length === 2 ? { symbol: `${parts[0]}${parts[1]}`, name: parts[0], quote: parts[1] } : null; })
        .filter(s => s && SUPPORTED_QUOTES.includes(s.quote));
    }
    case 'bitvavo': {
      const j = await fetchJSON('https://api.bitvavo.com/v2/markets');
      return (j || [])
        .filter(s => (s.status === 'trading' || !s.status) && SUPPORTED_QUOTES.includes(s.quote))
        .map(s => ({ symbol: `${s.base}${s.quote}`, name: s.base, quote: s.quote }));
    }
    case 'cryptocompare':
    case 'alpaca':
      // CryptoCompare and Alpaca have no free unauthenticated pair-list endpoint;
      // reuse Binance's symbol list. Alpaca maps stable quotes to its USD feed,
      // and symbols it doesn't list fall back through the kline fallback chain.
      return fetchBinancePairs();
    default: // binance + hyperliquid (which falls back to Binance data)
      return fetchBinancePairs();
  }
}

// Aggregate the tradeable pairs from every enabled exchange. Each pair is tagged
// with the `exchange` it came from so the watchlist can chart a symbol from a
// specific exchange and the picker can filter by exchange. Cached per enabled
// set (state.allPairsKey) so toggling exchanges in Settings refreshes the list.
export async function fetchAllPairs() {
  const exIds = enabledExchanges();
  const key = exIds.join(',');
  if (state.allPairs && state.allPairsKey === key) return state.allPairs;
  try {
    const lists = await Promise.all(exIds.map(async exId => {
      try {
        let pairs = await fetchExchangePairs(exId);
        // Some exchanges occasionally return an empty/odd payload — fall back so
        // the picker is never empty for that exchange.
        if (!pairs.length && exId !== 'binance') pairs = await fetchBinancePairs();
        return pairs.map(p => ({ ...p, exchange: exId }));
      } catch (e2) { warn(`fetchExchangePairs(${exId}) failed`, e2.message); return []; }
    }));
    // De-dupe by exchange:symbol; sort by symbol then exchange for a stable order.
    const seen = new Set();
    let pairs = lists.flat()
      .filter(p => p.symbol && !seen.has(`${p.exchange}:${p.symbol}`) && seen.add(`${p.exchange}:${p.symbol}`))
      .sort((a, b) => a.symbol.localeCompare(b.symbol) || a.exchange.localeCompare(b.exchange));
    if (!pairs.length) pairs = (await fetchBinancePairs()).map(p => ({ ...p, exchange: 'binance' }));
    state.allPairs = pairs;
    state.allPairsKey = key;
    return pairs;
  } catch (e) {
    warn('fetchAllPairs failed', e.message);
    try {
      state.allPairs = (await fetchBinancePairs()).map(p => ({ ...p, exchange: 'binance' }));
      state.allPairsKey = key;
      return state.allPairs;
    } catch { return []; }
  }
}

// Validate a symbol is actually listed on the given exchange — used to check
// deep-link (?symbol=&exchange=) input before charting it, so a stale or
// mistyped link fails with a toast instead of loading a blank/broken chart.
export async function validateSymbol(symbol, exchange = 'binance') {
  try {
    const pairs = await fetchExchangePairs(exchange);
    if (exchange === 'alpaca' || exchange === 'cryptocompare') {
      // These two reuse Binance's pair list (no free unauthenticated pair-list
      // endpoint of their own) but quote differently — Alpaca is USD, Binance is
      // USDT/BUSD/etc — so a literal symbol compare always fails. Match on base
      // asset instead, same substitution toExchangeSymbol() already applies.
      const base = baseAsset(symbol);
      return pairs.some(p => baseAsset(p.symbol) === base);
    }
    return pairs.some(p => p.symbol === symbol);
  } catch { return false; }
}

// Search CoinGecko for coins by name or symbol. Returns [{id, name, symbol, thumb}].
// Used to let users discover coins not listed on the active exchange.
export async function searchCoinGecko(query) {
  if (!query || query.length < 2) return [];
  try {
    const j = await fetchJSON(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`, {}, 8000);
    return (j.coins || []).slice(0, 8).map(c => ({
      id: c.id, name: c.name, symbol: c.symbol.toUpperCase(), thumb: c.thumb,
    }));
  } catch (e2) {
    warn('searchCoinGecko failed', e2.message);
    return [];
  }
}

// ---- Order book snapshot ----------------------------------
export async function fetchOrderBook(symbol, limit = 20, exId = defaultExchange()) {
  const e = ex(exId);
  try {
    if (e.id === 'binance') {
      const j = await fetchJSON(`${e.rest}/depth?symbol=${symbol}&limit=${limit}`);
      return {
        symbol,
        bids: j.bids.map(b => ({ price: +b[0], qty: +b[1] })),
        asks: j.asks.map(a => ({ price: +a[0], qty: +a[1] })),
      };
    }
    if (e.id === 'bitvavo') {
      const inst = toExchangeSymbol(symbol, 'bitvavo');
      const j = await fetchJSON(`${e.rest}/${inst}/book?depth=${limit}`);
      return {
        symbol,
        bids: (j.bids || []).map(b => ({ price: +b[0], qty: +b[1] })),
        asks: (j.asks || []).map(a => ({ price: +a[0], qty: +a[1] })),
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
// onUpdate({symbol, price, change, open}); onClose() fires only on an
// *unexpected* socket close so the caller can reconnect. Intent is tracked
// per-socket (ws._intentional) rather than via a shared flag, so the old
// socket's async close during a reopen can't be misread as a genuine drop.
export function openPriceStream(onUpdate, onClose) {
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
    ws.onclose = () => {
      if (state.ws === ws) state.ws = null;
      if (!ws._intentional && onClose) onClose();
    };
    return ws;
  } catch (e) {
    warn('openPriceStream failed', e.message);
    if (onClose) onClose();
    return null;
  }
}

export function closePriceStream() {
  if (state.ws) { try { state.ws._intentional = true; state.ws.close(); } catch {} state.ws = null; }
}

// True only while the price socket is actually OPEN — used to decide whether to
// reconnect when the tab regains focus.
export function priceStreamLive() {
  return !!state.ws && state.ws.readyState === WebSocket.OPEN;
}

// ---- WebSocket: live kline for one panel ------------------
// Returns the ws; onCandle({time, open, high, low, close, volume, closed})
export function openKlineStream(symbol, tf, onCandle, exId = defaultExchange()) {
  const e = ex(exId);
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
    if (e.id === 'bitvavo') return openBitvavoKlineStream(toExchangeSymbol(symbol, 'bitvavo'), interval, onCandle);
    // P3-17/P4: OKX, Gate.io and KuCoin stream via our own server-side relay
    // (one shared upstream socket per symbol+tf regardless of client count)
    // instead of a REST poll. Hyperliquid/etc. still fall back to REST polling.
    if (e.id === 'okx' || e.id === 'gate' || e.id === 'kucoin') return openRelayKlineStream(e.id, symbol, tf, onCandle);
    return null;
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

// Bitvavo v2 public candle stream. Emits the live (still-forming) candle on each
// update; Bitvavo has no per-candle "closed" flag, so the chart simply updates
// the latest bar until a new period starts a fresh one.
function openBitvavoKlineStream(market, interval, onCandle) {
  const ws = new WebSocket('wss://ws.bitvavo.com/v2/');
  ws.addEventListener('open', () => {
    try { ws.send(JSON.stringify({ action: 'subscribe', channels: [{ name: 'candles', interval: [interval], markets: [market] }] })); } catch {}
  });
  ws.addEventListener('message', ev => {
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    if (m.event !== 'candle' || !Array.isArray(m.candle)) return;
    const k = m.candle[0];
    if (!k) return;
    onCandle({
      time: Math.floor(+k[0] / 1000),
      open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
      closed: false,
    });
  });
  return ws;
}

// P3-17: relay kline stream — connects to our own server (which holds the
// single upstream socket per symbol+tf) instead of the exchange directly.
// Mirrors the exact onCandle({time,open,high,low,close,volume,closed})
// shape every other openXxxKlineStream produces.
function openRelayKlineStream(exchange, symbol, tf, onCandle) {
  try {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws/relay`);
    ws.addEventListener('open', () => {
      try { ws.send(JSON.stringify({ action: 'subscribe', exchange, symbol, tf })); } catch {}
    });
    ws.addEventListener('message', ev => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.type !== 'kline' || !m.candle) return;
      onCandle(m.candle);
    });
    ws.addEventListener('error', () => warn('relay kline stream error'));
    return ws;
  } catch (e) {
    warn('openRelayKlineStream failed', e.message);
    return null;
  }
}

// ---- WebSocket: order book stream -------------------------
export function openOrderBookStream(symbol, onBook, exId = defaultExchange()) {
  closeOrderBookStream();
  const e = ex(exId);
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

// ---- WebSocket: live trade tape (P2-14 time & sales) -------
// onTrade({ time(ms), price, qty, side: 'buy'|'sell' }). side is the taker's
// side, derived from Binance's "buyer is maker" flag.
export function openTradeStream(symbol, onTrade, exId = defaultExchange()) {
  const e = ex(exId);
  if (e.id !== 'binance') return null;
  try {
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@trade`);
    ws.onmessage = ev => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.e !== 'trade') return;
      onTrade({ time: m.T, price: +m.p, qty: +m.q, side: m.m ? 'sell' : 'buy' });
    };
    ws.onerror = () => warn('trade stream error');
    return ws;
  } catch (e2) {
    warn('openTradeStream failed', e2.message);
    return null;
  }
}
