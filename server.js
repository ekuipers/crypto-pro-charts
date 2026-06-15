import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';
import { EXCHANGES } from './src/js/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '2mb' }));

// ---- Server-side kline cache (persists fetched bars to JSON files) ----------
const CACHE_DIR = join(__dirname, 'cache', 'klines');
// Per-timeframe freshness: short TFs change fast, higher TFs rarely.
const TTL_MS = {
  '1m': 30_000, '5m': 60_000, '15m': 90_000, '30m': 120_000,
  '1h': 180_000, '4h': 300_000, '1d': 600_000, '1w': 900_000,
};

function toExSymbol(sym, exId) {
  const base = sym.replace(/USDT$/, '');
  if (exId === 'okx')  return base + '-USDT';
  if (exId === 'gate') return base + '_USDT';
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

// ---- Session & named layout persistence ------------------------------------
const SESSION_FILE = join(__dirname, 'data', 'session.json');
const LAYOUTS_DIR  = join(__dirname, 'data', 'layouts');

// Reject names that could escape the layouts directory.
function validLayoutName(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 80
    && !name.includes('..') && !/[/\\]/.test(name);
}

app.get('/api/session', async (_req, res) => {
  try {
    const raw = await fs.readFile(SESSION_FILE, 'utf8');
    res.type('application/json').send(raw);
  } catch {
    res.status(404).json(null);
  }
});

app.put('/api/session', async (req, res) => {
  try {
    await fs.writeFile(SESSION_FILE, JSON.stringify(req.body));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get('/api/layouts', async (_req, res) => {
  try {
    await fs.mkdir(LAYOUTS_DIR, { recursive: true });
    const files = (await fs.readdir(LAYOUTS_DIR)).filter(f => f.endsWith('.json'));
    const result = {};
    for (const f of files) {
      try {
        const name = decodeURIComponent(f.slice(0, -5));
        result[name] = JSON.parse(await fs.readFile(join(LAYOUTS_DIR, f), 'utf8'));
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
  try {
    await fs.mkdir(LAYOUTS_DIR, { recursive: true });
    await fs.writeFile(join(LAYOUTS_DIR, encodeURIComponent(name) + '.json'), JSON.stringify(req.body));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.delete('/api/layouts/:name', async (req, res) => {
  const name = req.params.name;
  if (!validLayoutName(name)) return res.status(400).json({ error: 'invalid name' });
  try {
    await fs.unlink(join(LAYOUTS_DIR, encodeURIComponent(name) + '.json'));
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
  console.log(`Crypto Charting Pro running at http://localhost:${PORT}`);
});
