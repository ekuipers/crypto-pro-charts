// ============================================================
// KLINES — shared upstream kline access for the server & alert engine
// ------------------------------------------------------------
// Owns exchange URL building, payload normalization, history paging
// (fetching bars that end BEFORE a given time) and server-side timeframe
// aggregation for TFs an exchange has no native interval for (P1-8).
// Extracted from server.js so the alert engine (P1-6) can reuse it.
// ============================================================
import { EXCHANGES, TF_SECONDS, TF_AGGREGATE } from './js/constants.js';

// Plain-object bracket lookups treat '__proto__'/'constructor'/etc. as truthy
// (they resolve to Object.prototype), so callers must never trust
// `EXCHANGES[x]` alone to mean "x is a real exchange id" — use this instead.
function resolveExchange(exId) {
  return Object.hasOwn(EXCHANGES, exId) ? EXCHANGES[exId] : EXCHANGES.binance;
}

export function toExSymbol(sym, exId) {
  const m = sym.match(/(USDT|USDC|BUSD|EUR|USD|BTC|ETH|BNB|DAI)$/);
  const quote = m ? m[1] : 'USDT';
  const base = m ? sym.slice(0, -quote.length) : sym;
  if (exId === 'okx')           return `${base}-${quote}`;
  if (exId === 'gate')          return `${base}_${quote}`;
  if (exId === 'kucoin')        return `${base}-${quote}`;
  if (exId === 'bitstamp')      return `${base.toLowerCase()}${quote.toLowerCase()}`;
  if (exId === 'cryptocompare') return `${base}_${quote}`;
  // Bitvavo is EUR-quoted; map stable quotes to EUR so the deep EUR book is used.
  if (exId === 'bitvavo')       return `${base}-${(quote === 'USDT' || quote === 'USDC') ? 'EUR' : quote}`;
  // Alpaca's US crypto feed is USD-quoted; map stable quotes to USD.
  if (exId === 'alpaca')        return `${base}/${(quote === 'USDT' || quote === 'USDC') ? 'USD' : quote}`;
  return sym;
}

// Build the upstream kline URL. `endSec` (optional) requests bars strictly
// BEFORE that epoch-second — each exchange spells this differently.
export function klineUrl(exId, symbol, tf, limit, endSec) {
  const e = resolveExchange(exId);
  const interval = e.intervals[tf] || tf;
  switch (exId) {
    case 'bybit': {
      const end = endSec ? `&end=${endSec * 1000 - 1}` : '';
      return `${e.rest}/kline?category=spot&symbol=${symbol}&interval=${interval}&limit=${limit}${end}`;
    }
    case 'okx': {
      // OKX `after` returns records OLDER than the supplied ms timestamp.
      const end = endSec ? `&after=${endSec * 1000}` : '';
      return `${e.rest}/candles?instId=${toExSymbol(symbol, 'okx')}&bar=${interval}&limit=${Math.min(limit, 300)}${end}`;
    }
    case 'gate': {
      const end = endSec ? `&to=${endSec - 1}` : '';
      return `${e.rest}/candlesticks?currency_pair=${toExSymbol(symbol, 'gate')}&interval=${interval}&limit=${Math.min(limit, 1000)}${end}`;
    }
    case 'kucoin': {
      const end = endSec ? `&endAt=${endSec - 1}` : '';
      return `${e.rest}/market/candles?symbol=${toExSymbol(symbol, 'kucoin')}&type=${interval}&pageSize=${Math.min(limit, 1500)}${end}`;
    }
    case 'bitstamp': {
      const end = endSec ? `&end=${endSec - 1}` : '';
      return `${e.rest}/ohlcdata/${toExSymbol(symbol, 'bitstamp')}/?step=${interval}&limit=${Math.min(limit, 1000)}${end}`;
    }
    case 'bitvavo': {
      const end = endSec ? `&end=${endSec * 1000 - 1}` : '';
      return `${e.rest}/${toExSymbol(symbol, 'bitvavo')}/candles?interval=${interval}&limit=${Math.min(limit, 1440)}${end}`;
    }
    case 'cryptocompare': {
      const [base, quote] = toExSymbol(symbol, 'cryptocompare').split('_');
      const [endpoint, agg] = (interval || 'histohour').split('|');
      const aggParam = agg ? `&aggregate=${agg}` : '';
      const end = endSec ? `&toTs=${endSec - 1}` : '';
      return `${e.rest}/${endpoint}?fsym=${base}&tsym=${quote}&limit=${Math.min(limit, 2000)}${aggParam}${end}`;
    }
    case 'alpaca': {
      // Alpaca wants an explicit window; anchor start far enough back for the
      // requested bar count and optionally cap with `end`.
      const inst = toExSymbol(symbol, 'alpaca');
      const secs = TF_SECONDS[tf] || 3600;
      const endMs = endSec ? endSec * 1000 : Date.now();
      const start = new Date(endMs - (limit + 5) * secs * 1000).toISOString();
      const end = endSec ? `&end=${new Date(endSec * 1000 - 1).toISOString()}` : '';
      return `${e.rest}/bars?symbols=${encodeURIComponent(inst)}&timeframe=${interval}&limit=${Math.min(limit, 10000)}&start=${start}${end}`;
    }
    default: {
      const end = endSec ? `&endTime=${endSec * 1000 - 1}` : '';
      return `${EXCHANGES.binance.rest}/klines?symbol=${symbol}&interval=${EXCHANGES.binance.intervals[tf] || tf}&limit=${limit}${end}`;
    }
  }
}

// Normalise each exchange's raw payload to [{time(sec),open,high,low,close,volume}].
export function normalize(exId, raw) {
  if (exId === 'bybit') {
    const list = (raw?.result?.list || []).slice().reverse();
    return list.map(k => ({ time: Math.floor(+k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }));
  }
  if (exId === 'okx') {
    const list = (raw?.data || []).slice().reverse();
    return list.map(k => ({ time: Math.floor(+k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }));
  }
  if (exId === 'gate') {
    return (raw || []).map(k => ({ time: Math.floor(+k[0]), open: +k[5], high: +k[3], low: +k[4], close: +k[2], volume: +k[6] || +k[1] }))
      .sort((a, b) => a.time - b.time);
  }
  if (exId === 'kucoin') {
    const list = (raw?.data || []).slice().reverse();
    return list.map(k => ({ time: Math.floor(+k[0]), open: +k[1], high: +k[3], low: +k[4], close: +k[2], volume: +k[5] }));
  }
  if (exId === 'bitstamp') {
    return (raw?.data?.ohlc || []).map(k => ({
      time: Math.floor(+k.timestamp), open: +k.open, high: +k.high, low: +k.low, close: +k.close, volume: +k.volume,
    }));
  }
  if (exId === 'bitvavo') {
    return (raw || []).map(k => ({ time: Math.floor(+k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }))
      .sort((a, b) => a.time - b.time);
  }
  if (exId === 'cryptocompare') {
    return (raw?.Data?.Data || [])
      .map(k => ({ time: Math.floor(+k.time), open: +k.open, high: +k.high, low: +k.low, close: +k.close, volume: +k.volumefrom }))
      .filter(k => k.close > 0);
  }
  if (exId === 'alpaca') {
    const list = Object.values(raw?.bars || {})[0] || [];
    return list.map(k => ({ time: Math.floor(new Date(k.t).getTime() / 1000), open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v }));
  }
  // binance
  return (raw || []).map(k => ({ time: Math.floor(k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }));
}

async function fetchUpstream(exId, symbol, tf, limit, endSec) {
  const r = await fetch(klineUrl(exId, symbol, tf, limit, endSec), { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`upstream ${r.status}`);
  return normalize(exId, await r.json());
}

// Aggregate ascending base-TF bars into a coarser timeframe. '1M' uses calendar
// months (UTC); everything else uses fixed-width buckets of TF_SECONDS[tf].
export function aggregateBars(bars, tf) {
  if (!bars.length) return [];
  const bucketOf = tf === '1M'
    ? t => { const d = new Date(t * 1000); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000; }
    : t => Math.floor(t / TF_SECONDS[tf]) * TF_SECONDS[tf];
  const out = [];
  let cur = null;
  for (const b of bars) {
    const key = bucketOf(b.time);
    if (!cur || cur.time !== key) {
      if (cur) out.push(cur);
      cur = { time: key, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume };
    } else {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.volume += b.volume;
    }
  }
  if (cur) out.push(cur);
  return out;
}

// Fetch bars for ANY supported timeframe: uses the exchange's native interval
// when it has one, otherwise fetches the aggregation base TF and rolls it up
// server-side (P1-8). Optional `endSec` pages history (bars before that time).
export async function fetchBars(exId, symbol, tf, limit, endSec) {
  const e = resolveExchange(exId);
  if (e.intervals[tf]) return fetchUpstream(exId, symbol, tf, limit, endSec);
  const agg = TF_AGGREGATE[tf];
  if (!agg || !e.intervals[agg.base]) throw new Error(`timeframe ${tf} unsupported on ${exId}`);
  const baseLimit = Math.min(limit * agg.factor, 1000);
  const base = await fetchUpstream(exId, symbol, agg.base, baseLimit, endSec);
  return aggregateBars(base, tf).slice(-limit);
}

// A timeframe is valid for an exchange if it's native OR aggregatable.
export function tfSupported(exId, tf) {
  const e = resolveExchange(exId);
  return Boolean(e.intervals[tf] || (TF_AGGREGATE[tf] && e.intervals[TF_AGGREGATE[tf].base]));
}
