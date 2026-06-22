import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';
import { EXCHANGES, TF_SECONDS } from './src/js/constants.js';
import { init as initAuth, installAuthRoutes, currentUser, userPaths } from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '2mb' }));

// Multi-user auth (SSO) — sessions & layouts are scoped to the signed-in user.
initAuth(join(__dirname, 'data'));
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

// ---- Session & named layout persistence (scoped per signed-in user) --------
// Resolve the storage paths for whoever made this request: a logged-in user
// gets their own data/users/<uid>/ folder; an anonymous guest reuses the legacy
// shared files (data/session.json + data/layouts/) so existing data survives.
async function pathsFor(req) {
  const user = await currentUser(req);
  return userPaths(user?.id || null);
}

// Reject names that could escape the layouts directory.
function validLayoutName(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 80
    && !name.includes('..') && !/[/\\]/.test(name);
}

app.get('/api/session', async (req, res) => {
  const { sessionFile } = await pathsFor(req);
  try {
    const raw = await fs.readFile(sessionFile, 'utf8');
    res.type('application/json').send(raw);
  } catch {
    res.status(404).json(null);
  }
});

app.put('/api/session', async (req, res) => {
  const { sessionFile } = await pathsFor(req);
  try {
    await fs.mkdir(dirname(sessionFile), { recursive: true });
    await fs.writeFile(sessionFile, JSON.stringify(req.body));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get('/api/layouts', async (req, res) => {
  const { layoutsDir } = await pathsFor(req);
  try {
    await fs.mkdir(layoutsDir, { recursive: true });
    const files = (await fs.readdir(layoutsDir)).filter(f => f.endsWith('.json'));
    const result = {};
    for (const f of files) {
      try {
        const name = decodeURIComponent(f.slice(0, -5));
        result[name] = JSON.parse(await fs.readFile(join(layoutsDir, f), 'utf8'));
      } catch { /* skip corrupt file */ }
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({});
  }
});

app.put('/api/layouts/:name', async (req, res) => {
  const name = req.params.name;
  if (!validLayoutName(name)) return res.status(400).json({ error: 'invalid name' });
  const { layoutsDir } = await pathsFor(req);
  try {
    await fs.mkdir(layoutsDir, { recursive: true });
    await fs.writeFile(join(layoutsDir, encodeURIComponent(name) + '.json'), JSON.stringify(req.body));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.delete('/api/layouts/:name', async (req, res) => {
  const name = req.params.name;
  if (!validLayoutName(name)) return res.status(400).json({ error: 'invalid name' });
  const { layoutsDir } = await pathsFor(req);
  try {
    await fs.unlink(join(layoutsDir, encodeURIComponent(name) + '.json'));
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: 'not found' });
  }
});

// Serve static assets
app.use(express.static(join(__dirname, 'public')));
app.use('/js', express.static(join(__dirname, 'src/js')));

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`CryptoPro Charts running at http://localhost:${PORT}`);
});
