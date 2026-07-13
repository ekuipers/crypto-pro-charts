import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs, readFileSync } from 'fs';
import { EXCHANGES, TF_SECONDS } from './src/js/constants.js';
import { installAuthRoutes, currentUid } from './src/auth.js';
import * as db from './src/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// Load .env (Supabase Postgres credentials) before anything reads process.env.
// Minimal parser so we don't add a dependency; existing env vars win.
function loadEnv(file) {
  try {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
      if (!m || line.trimStart().startsWith('#')) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!(m[1] in process.env)) process.env[m[1]] = v;
    }
  } catch { /* no .env — fine */ }
}
loadEnv(join(__dirname, '.env'));

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '2mb' }));

// Multi-user auth — accounts, sessions & layouts persist in Supabase (Postgres).
installAuthRoutes(app);

// ---- Server-side kline cache (persists fetched bars to JSON files) ----------
const CACHE_DIR = join(__dirname, 'cache', 'klines');
// Per-timeframe freshness: short TFs change fast, higher TFs rarely.
const TTL_MS = {
  '1m': 30_000, '5m': 60_000, '15m': 90_000, '30m': 120_000,
  '1h': 180_000, '4h': 300_000, '1d': 600_000, '1w': 900_000,
};

function toExSymbol(sym, exId) {
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
  // Alpaca's US crypto feed is USD-quoted; map stable quotes to USD so the
  // real-volume pair is used instead of a thin derived USDT/USDC book.
  if (exId === 'alpaca')        return `${base}/${(quote === 'USDT' || quote === 'USDC') ? 'USD' : quote}`;
  return sym;
}

function klineUrl(exId, symbol, tf, limit) {
  const e = EXCHANGES[exId] || EXCHANGES.binance;
  const interval = e.intervals[tf] || tf;
  switch (exId) {
    case 'bybit':
      return `${e.rest}/kline?category=spot&symbol=${symbol}&interval=${interval}&limit=${limit}`;
    case 'okx':
      return `${e.rest}/candles?instId=${toExSymbol(symbol, 'okx')}&bar=${interval}&limit=${Math.min(limit, 300)}`;
    case 'gate':
      return `${e.rest}/candlesticks?currency_pair=${toExSymbol(symbol, 'gate')}&interval=${interval}&limit=${Math.min(limit, 1000)}`;
    case 'kucoin':
      // KuCoin candles: returns array of [time(sec),open,close,high,low,vol,turnover] newest-first
      return `${e.rest}/market/candles?symbol=${toExSymbol(symbol, 'kucoin')}&type=${interval}&pageSize=${Math.min(limit, 1500)}`;
    case 'bitstamp':
      return `${e.rest}/ohlcdata/${toExSymbol(symbol, 'bitstamp')}/?step=${interval}&limit=${Math.min(limit, 1000)}`;
    case 'bitvavo':
      // Bitvavo candles: array of [time(ms),open,high,low,close,volume], newest-first.
      return `${e.rest}/${toExSymbol(symbol, 'bitvavo')}/candles?interval=${interval}&limit=${Math.min(limit, 1440)}`;
    case 'cryptocompare': {
      const [base, quote] = toExSymbol(symbol, 'cryptocompare').split('_');
      const [endpoint, agg] = (interval || 'histohour').split('|');
      const aggParam = agg ? `&aggregate=${agg}` : '';
      return `${e.rest}/${endpoint}?fsym=${base}&tsym=${quote}&limit=${Math.min(limit, 2000)}${aggParam}`;
    }
    case 'alpaca': {
      // Alpaca defaults to a narrow recent window, so anchor `start` far enough
      // back to satisfy the requested bar count for the chosen timeframe.
      const inst = toExSymbol(symbol, 'alpaca');
      const secs = TF_SECONDS[tf] || 3600;
      const start = new Date(Date.now() - (limit + 5) * secs * 1000).toISOString();
      return `${e.rest}/bars?symbols=${encodeURIComponent(inst)}&timeframe=${interval}&limit=${Math.min(limit, 10000)}&start=${start}`;
    }
    default:
      return `${EXCHANGES.binance.rest}/klines?symbol=${symbol}&interval=${EXCHANGES.binance.intervals[tf] || tf}&limit=${limit}`;
  }
}

// Normalise each exchange's raw payload to [{time(sec),open,high,low,close,volume}].
function normalize(exId, raw) {
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
    // data field holds the array (newest-first); [time,open,close,high,low,vol,turnover]
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
    // { bars: { "BTC/USD": [{ t,o,h,l,c,v }, ...] } } — single requested symbol.
    const list = Object.values(raw?.bars || {})[0] || [];
    return list.map(k => ({ time: Math.floor(new Date(k.t).getTime() / 1000), open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v }));
  }
  // binance
  return (raw || []).map(k => ({ time: Math.floor(k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }));
}

async function fetchUpstream(exId, symbol, tf, limit) {
  const r = await fetch(klineUrl(exId, symbol, tf, limit), { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`upstream ${r.status}`);
  return normalize(exId, await r.json());
}

app.get('/api/klines', async (req, res) => {
  const symbol = String(req.query.symbol || '').toUpperCase();
  const tf = String(req.query.tf || '1h');
  const exchange = EXCHANGES[req.query.exchange] ? String(req.query.exchange) : 'binance';
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 500, 1), 1000);

  // Validate to keep the upstream URL safe (no SSRF — fixed hosts + clean params).
  if (!/^[A-Z0-9]{2,20}$/.test(symbol)) return res.status(400).json({ error: 'invalid symbol' });
  if (!EXCHANGES[exchange].intervals[tf]) return res.status(400).json({ error: 'invalid timeframe' });

  const file = join(CACHE_DIR, `${exchange}_${symbol}_${tf}_${limit}.json`);
  const ttl = TTL_MS[tf] || 60_000;

  // Serve fresh cache if available.
  try {
    const stat = await fs.stat(file);
    if (Date.now() - stat.mtimeMs < ttl) {
      const cached = JSON.parse(await fs.readFile(file, 'utf8'));
      return res.json({ bars: cached.bars, cached: true });
    }
  } catch { /* no cache yet */ }

  // Fetch from the exchange, persist to JSON, return.
  try {
    let bars = await fetchUpstream(exchange, symbol, tf, limit);
    if (!bars.length && exchange !== 'binance') bars = await fetchUpstream('binance', symbol, tf, limit);
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(file, JSON.stringify({ ts: Date.now(), bars }));
    res.json({ bars, cached: false });
  } catch (e) {
    // On upstream failure, fall back to stale cache if we have any.
    try {
      const cached = JSON.parse(await fs.readFile(file, 'utf8'));
      return res.json({ bars: cached.bars, cached: true, stale: true });
    } catch { /* none */ }
    res.status(502).json({ error: String(e.message || e) });
  }
});

// ---- Market events calendar (curated JSON on disk) -------------------------
app.get('/api/events', async (_req, res) => {
  try {
    const raw = await fs.readFile(join(__dirname, 'data', 'events.json'), 'utf8');
    res.type('application/json').send(raw);
  } catch (e) {
    res.status(500).json({ error: 'events unavailable', events: [] });
  }
});

// ---- Market status: Fear & Greed, Altcoin Season, global market snapshot ---
// Sourced from alternative.me (Fear & Greed) and CoinGecko's free /global and
// /coins/markets endpoints (no API key). Cached to a single disk file since
// this is one shared snapshot, not per-symbol — mirrors the kline cache
// pattern above but with a longer TTL matched to how slowly these move.
const MARKET_STATUS_CACHE = join(__dirname, 'cache', 'market-status.json');
const MARKET_STATUS_TTL_MS = 10 * 60_000;
const STABLECOIN_SYMBOLS = new Set(['USDT', 'USDC', 'DAI', 'FDUSD', 'TUSD', 'USDP', 'USDD', 'PYUSD', 'EURT', 'GUSD', 'USDE']);

function classifyAltcoinSeason(idx) {
  if (idx >= 75) return 'Altcoin Season';
  if (idx <= 25) return 'Bitcoin Season';
  return 'Neutral';
}

async function fetchMarketStatus() {
  const [fngRes, globalRes, marketsRes] = await Promise.all([
    fetch('https://api.alternative.me/fng/?limit=2', { signal: AbortSignal.timeout(10_000) }),
    fetch('https://api.coingecko.com/api/v3/global', { signal: AbortSignal.timeout(10_000) }),
    fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&price_change_percentage=30d&sparkline=false', { signal: AbortSignal.timeout(10_000) }),
  ]);

  const fng = fngRes.ok ? await fngRes.json() : null;
  const glob = globalRes.ok ? await globalRes.json() : null;
  const markets = marketsRes.ok ? await marketsRes.json() : [];

  const fgToday = fng?.data?.[0];
  const fgYesterday = fng?.data?.[1];

  const btc = Array.isArray(markets) ? markets.find(c => c.symbol?.toLowerCase() === 'btc') : null;
  const btcChange30d = btc?.price_change_percentage_30d_in_currency;

  let altcoinSeason = null;
  if (typeof btcChange30d === 'number' && Array.isArray(markets)) {
    const pool = markets.filter(c => c.symbol?.toLowerCase() !== 'btc' && !STABLECOIN_SYMBOLS.has(String(c.symbol).toUpperCase()));
    const withChange = pool.filter(c => typeof c.price_change_percentage_30d_in_currency === 'number');
    if (withChange.length) {
      const outperforming = withChange.filter(c => c.price_change_percentage_30d_in_currency > btcChange30d).length;
      altcoinSeason = {
        index: Math.round((outperforming / withChange.length) * 100),
        window: '30d',
        sample: withChange.length,
      };
      altcoinSeason.classification = classifyAltcoinSeason(altcoinSeason.index);
    }
  }

  const g = glob?.data;

  return {
    fearGreed: fgToday ? {
      value: Number(fgToday.value),
      classification: fgToday.value_classification,
      previousValue: fgYesterday ? Number(fgYesterday.value) : null,
      updatedAt: Number(fgToday.timestamp) * 1000,
    } : null,
    altcoinSeason,
    global: g ? {
      totalMarketCapUsd: g.total_market_cap?.usd ?? null,
      totalVolumeUsd: g.total_volume?.usd ?? null,
      btcDominance: g.market_cap_percentage?.btc ?? null,
      ethDominance: g.market_cap_percentage?.eth ?? null,
      marketCapChange24h: g.market_cap_change_percentage_24h_usd ?? null,
    } : null,
    fetchedAt: Date.now(),
  };
}

app.get('/api/market-status', async (_req, res) => {
  try {
    const stat = await fs.stat(MARKET_STATUS_CACHE);
    if (Date.now() - stat.mtimeMs < MARKET_STATUS_TTL_MS) {
      const cached = JSON.parse(await fs.readFile(MARKET_STATUS_CACHE, 'utf8'));
      return res.json({ ...cached, cached: true });
    }
  } catch { /* no cache yet */ }

  try {
    const data = await fetchMarketStatus();
    await fs.mkdir(dirname(MARKET_STATUS_CACHE), { recursive: true });
    await fs.writeFile(MARKET_STATUS_CACHE, JSON.stringify(data));
    res.json({ ...data, cached: false });
  } catch (e) {
    try {
      const cached = JSON.parse(await fs.readFile(MARKET_STATUS_CACHE, 'utf8'));
      return res.json({ ...cached, cached: true, stale: true });
    } catch { /* none */ }
    res.status(502).json({ error: String(e.message || e) });
  }
});

// ---- Session & named layout persistence (Postgres, scoped per user) --------
// Each request's data belongs to the signed-in account, or the GUEST uid when
// anonymous — exactly the scoping the old per-user folders provided.

// Reject names used for our internal autosave row or that are over-long.
function validLayoutName(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 80 && name !== db.SESSION_NAME;
}

app.get('/api/session', async (req, res) => {
  try {
    const data = await db.getLayout(await currentUid(req), db.SESSION_NAME);
    if (data == null) return res.status(404).json(null);
    res.json(data);
  } catch (e) {
    console.error('[api] get session:', e.message);
    res.status(500).json(null);
  }
});

app.put('/api/session', async (req, res) => {
  try {
    await db.putLayout(await currentUid(req), db.SESSION_NAME, req.body);
    res.json({ ok: true });
  } catch (e) {
    console.error('[api] put session:', e.message);
    res.status(500).json({ error: String(e.message) });
  }
});

app.get('/api/layouts', async (req, res) => {
  try {
    res.json(await db.listLayouts(await currentUid(req)));
  } catch (e) {
    console.error('[api] list layouts:', e.message);
    res.status(500).json({});
  }
});

app.put('/api/layouts/:name', async (req, res) => {
  const name = req.params.name;
  if (!validLayoutName(name)) return res.status(400).json({ error: 'invalid name' });
  try {
    await db.putLayout(await currentUid(req), name, req.body);
    res.json({ ok: true });
  } catch (e) {
    console.error('[api] put layout:', e.message);
    res.status(500).json({ error: String(e.message) });
  }
});

app.delete('/api/layouts/:name', async (req, res) => {
  const name = req.params.name;
  if (!validLayoutName(name)) return res.status(400).json({ error: 'invalid name' });
  try {
    const ok = await db.deleteLayout(await currentUid(req), name);
    if (!ok) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[api] delete layout:', e.message);
    res.status(500).json({ error: String(e.message) });
  }
});

// Serve static assets
app.use(express.static(join(__dirname, 'public')));
app.use('/js', express.static(join(__dirname, 'src/js')));

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

// Create the database tables before accepting traffic, then start listening.
// A DB failure is logged but not fatal — the kline proxy still works and the
// frontend falls back to localStorage for persistence.
db.init()
  .catch(e => console.error('[db] init failed:', e?.message || e))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`CryptoPro Charts running at http://localhost:${PORT}`);
    });
  });
