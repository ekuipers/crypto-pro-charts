import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs, readFileSync } from 'fs';
import { EXCHANGES, TF_SECONDS } from './src/js/constants.js';
import { installAuthRoutes, currentUid } from './src/auth.js';
import * as db from './src/db.js';
import { fetchBars, tfSupported } from './src/klines.js';
import { startAlertEngine } from './src/alert-engine.js';
import crypto from 'crypto';

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

// Fire-and-forget persistence of fetched bars into the Postgres kline store
// (P1-4). Never blocks or fails the request path.
function storeBars(exchange, symbol, tf, bars) {
  if (!db.dbEnabled() || !bars?.length) return;
  db.upsertKlines(exchange, symbol, tf, bars)
    .catch(e => console.error('[klines] db store failed:', e.message));
}

function validKlineParams(req) {
  const symbol = String(req.query.symbol || '').toUpperCase();
  const tf = String(req.query.tf || '1h');
  const exchange = EXCHANGES[req.query.exchange] ? String(req.query.exchange) : 'binance';
  // Validate to keep the upstream URL safe (no SSRF — fixed hosts + clean params).
  if (!/^[A-Z0-9]{2,20}$/.test(symbol)) return { error: 'invalid symbol' };
  // A timeframe is valid when the exchange supports it natively OR the server
  // can aggregate it from a lower timeframe (P1-8).
  if (!TF_SECONDS[tf] || !tfSupported(exchange, tf)) return { error: 'invalid timeframe' };
  return { symbol, tf, exchange };
}

app.get('/api/klines', async (req, res) => {
  const p = validKlineParams(req);
  if (p.error) return res.status(400).json({ error: p.error });
  const { symbol, tf, exchange } = p;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 500, 1), 1000);

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

  // Fetch from the exchange (native interval or server-side aggregation),
  // persist to JSON cache + Postgres kline store, return.
  try {
    let bars = await fetchBars(exchange, symbol, tf, limit);
    if (!bars.length && exchange !== 'binance') bars = await fetchBars('binance', symbol, tf, limit);
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(file, JSON.stringify({ ts: Date.now(), bars }));
    storeBars(exchange, symbol, tf, bars);
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

// ---- History paging (P1-1): bars strictly BEFORE `before` (epoch sec) -------
// Serves from the Postgres kline store first; tops up from the exchange when
// the store has fewer bars than requested (and persists what it fetched).
// `exhausted: true` tells the client there is no more history to load.
app.get('/api/klines/history', async (req, res) => {
  const p = validKlineParams(req);
  if (p.error) return res.status(400).json({ error: p.error });
  const { symbol, tf, exchange } = p;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 500, 1), 1000);
  const before = parseInt(req.query.before, 10);
  if (!Number.isFinite(before) || before <= 0) return res.status(400).json({ error: 'invalid before' });

  try {
    let bars = db.dbEnabled() ? await db.getKlinesBefore(exchange, symbol, tf, before, limit) : [];
    if (bars.length < limit) {
      // Page the exchange for older bars ending where our stored history starts.
      const end = bars.length ? bars[0].time : before;
      try {
        const fetched = await fetchBars(exchange, symbol, tf, limit, end);
        const older = fetched.filter(b => b.time < end);
        if (older.length) {
          storeBars(exchange, symbol, tf, older);
          const seen = new Set(bars.map(b => b.time));
          bars = [...older.filter(b => !seen.has(b.time)), ...bars].sort((a, b) => a.time - b.time).slice(-limit);
        }
      } catch (e) {
        // Upstream paging failed — serve whatever the store had.
        if (!bars.length) throw e;
      }
    }
    res.json({ bars, exhausted: bars.length === 0 });
  } catch (e) {
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

// ---- Server-side alerts (P1-6) ----------------------------------------------
// CRUD + a triggered-feed the client polls to surface notifications for alerts
// that fired while the tab was closed. All routes 503 when the DB is disabled —
// the frontend then falls back to its legacy in-browser alerts.
const ALERT_TYPES = new Set(['price', 'pct', 'rsi', 'volume']);

app.get('/api/alerts', async (req, res) => {
  if (!db.dbEnabled()) return res.status(503).json({ error: 'db disabled' });
  try { res.json(await db.listAlerts(await currentUid(req))); }
  catch (e) { res.status(500).json({ error: String(e.message) }); }
});

app.post('/api/alerts', async (req, res) => {
  if (!db.dbEnabled()) return res.status(503).json({ error: 'db disabled' });
  const b = req.body || {};
  const symbol = String(b.symbol || '').toUpperCase();
  const exchange = EXCHANGES[b.exchange] ? String(b.exchange) : 'binance';
  const tf = TF_SECONDS[String(b.tf)] ? String(b.tf) : '1h';
  const type = ALERT_TYPES.has(b.type) ? b.type : 'price';
  const condition = b.condition === 'below' ? 'below' : 'above';
  const value = Number(b.value);
  if (!/^[A-Z0-9]{2,20}$/.test(symbol)) return res.status(400).json({ error: 'invalid symbol' });
  if (!Number.isFinite(value)) return res.status(400).json({ error: 'invalid value' });
  const rec = {
    id: crypto.randomBytes(9).toString('hex'),
    uid: await currentUid(req),
    symbol, exchange, tf, type, condition, value,
    params: typeof b.params === 'object' && b.params ? b.params : {},
    note: String(b.note || '').slice(0, 200),
  };
  try { await db.createAlert(rec); res.json({ ok: true, id: rec.id }); }
  catch (e) { res.status(500).json({ error: String(e.message) }); }
});

app.delete('/api/alerts/:id', async (req, res) => {
  if (!db.dbEnabled()) return res.status(503).json({ error: 'db disabled' });
  try {
    const ok = await db.deleteAlert(await currentUid(req), String(req.params.id));
    if (!ok) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

app.get('/api/alerts/triggered', async (req, res) => {
  if (!db.dbEnabled()) return res.status(503).json({ error: 'db disabled' });
  const since = parseInt(req.query.since, 10) || 0;
  try { res.json(await db.listTriggeredSince(await currentUid(req), since)); }
  catch (e) { res.status(500).json({ error: String(e.message) }); }
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
  .then(ok => { if (ok) startAlertEngine(); })
  .catch(e => console.error('[db] init failed:', e?.message || e))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`CryptoPro Charts running at http://localhost:${PORT}`);
    });
  });
