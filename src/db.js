// ============================================================
// DB — Supabase (Postgres) persistence for accounts, sessions & layouts
// ------------------------------------------------------------
// Replaces the previous blob/JSON-file storage. Connects with the `pg` driver
// using the Supabase connection string from .env (DBCRYPTOCHARTS_POSTGRES_*).
// Tables are created on startup via init(). All state — user accounts, auth
// sessions, autosave session-state and named layouts — lives in Postgres.
// ============================================================
import pg from 'pg';

const { Pool } = pg;

// Sentinel uid for anonymous (not-signed-in) users, so guest layouts persist
// just like the old shared files did.
export const GUEST = '__guest__';
// Row name under which a user's autosave session-state is stored in `layouts`.
export const SESSION_NAME = '__session__';

// Prefer a direct (non-pooling) connection for this long-lived server; fall back
// to the pooled URL or generic names.
const CONN_VARS = [
  'DBCRYPTOCHARTS_POSTGRES_URL_NON_POOLING',
  'DBCRYPTOCHARTS_POSTGRES_URL',
  'POSTGRES_URL_NON_POOLING',
  'POSTGRES_URL',
  'DATABASE_URL',
];
function connString() {
  for (const v of CONN_VARS) if (process.env[v]) return process.env[v];
  return null;
}
export const dbEnabled = () => Boolean(connString());

// Supabase serves a cert that isn't in Node's default trust store, so use
// sslmode=no-verify (TLS on, chain not verified) rather than failing the chain.
function normalizeSsl(url) {
  return /sslmode=/.test(url)
    ? url.replace(/sslmode=[^&]+/, 'sslmode=no-verify')
    : url + (url.includes('?') ? '&' : '?') + 'sslmode=no-verify';
}

let pool;
function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: normalizeSsl(connString()),
      max: 5,
      connectionTimeoutMillis: 12000,
      idleTimeoutMillis: 30000,
    });
    pool.on('error', (e) => console.error('[db] idle client error:', e.message));
  }
  return pool;
}

// Query with one retry on transient connection errors.
async function q(text, params) {
  for (let i = 0; ; i++) {
    try { return await getPool().query(text, params); }
    catch (e) {
      const transient = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE', '57P01', '08006', '08003'];
      if (i >= 1 || !transient.includes(e.code)) throw e;
      await new Promise(r => setTimeout(r, 300));
    }
  }
}

export async function init() {
  if (!dbEnabled()) { console.warn('[db] no Postgres connection string set — database disabled'); return false; }
  await q(`create table if not exists accounts (
    id            text primary key,
    username      text not null,
    display_name  text,
    salt          text not null,
    password_hash text not null,
    created_at    timestamptz not null default now(),
    last_login    timestamptz not null default now()
  )`);
  // P3-19 auth hardening: TOTP 2FA + password-change tracking, added via
  // ALTER so existing deployments' accounts tables pick them up too.
  await q(`alter table accounts add column if not exists totp_secret text`);
  await q(`alter table accounts add column if not exists totp_enabled boolean not null default false`);
  await q(`alter table accounts add column if not exists password_changed_at timestamptz`);
  await q(`create table if not exists sessions (
    sid        text primary key,
    uid        text not null references accounts(id) on delete cascade,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null
  )`);
  await q(`create index if not exists sessions_expires_idx on sessions(expires_at)`);
  await q(`create table if not exists layouts (
    uid        text not null,
    name       text not null,
    data       jsonb not null,
    updated_at timestamptz not null default now(),
    primary key (uid, name)
  )`);
  // Server-side kline store (P1-4): persisted bars keyed by exchange+symbol+tf.
  // Enables deep history paging (P1-1) beyond any single upstream fetch limit.
  await q(`create table if not exists klines (
    exchange text not null,
    symbol   text not null,
    tf       text not null,
    time     bigint not null,
    open     double precision not null,
    high     double precision not null,
    low      double precision not null,
    close    double precision not null,
    volume   double precision not null,
    primary key (exchange, symbol, tf, time)
  )`);
  // Server-side alerts (P1-6): evaluated by src/alert-engine.js even when no
  // browser tab is open. uid scopes alerts per account (GUEST when anonymous).
  await q(`create table if not exists alerts (
    id           text primary key,
    uid          text not null,
    symbol       text not null,
    exchange     text not null default 'binance',
    tf           text not null default '1h',
    type         text not null default 'price',
    condition    text not null default 'above',
    value        double precision not null,
    params       jsonb not null default '{}'::jsonb,
    note         text not null default '',
    active       boolean not null default true,
    created_at   timestamptz not null default now(),
    triggered_at timestamptz,
    trigger_msg  text
  )`);
  await q(`create index if not exists alerts_active_idx on alerts(active) where active`);
  // User-saved indicator templates (P2-12): named sets of indicators a user can
  // apply to any chart in one click, alongside the built-in curated presets.
  await q(`create table if not exists templates (
    uid        text not null,
    name       text not null,
    data       jsonb not null,
    updated_at timestamptz not null default now(),
    primary key (uid, name)
  )`);
  // Saved screener scans (P2-13): a named scan type + scope combination the
  // user can re-run in one click.
  await q(`create table if not exists saved_scans (
    uid        text not null,
    name       text not null,
    data       jsonb not null,
    updated_at timestamptz not null default now(),
    primary key (uid, name)
  )`);
  // Paper trading & journal (P2-15): simulated positions with a persisted P&L
  // trail once closed.
  await q(`create table if not exists paper_trades (
    id          text primary key,
    uid         text not null,
    symbol      text not null,
    exchange    text not null default 'binance',
    side        text not null default 'long',
    qty         double precision not null,
    entry_price double precision not null,
    exit_price  double precision,
    stop        double precision,
    target      double precision,
    status      text not null default 'open',
    notes       text not null default '',
    tags        text not null default '',
    opened_at   timestamptz not null default now(),
    closed_at   timestamptz
  )`);
  await q(`create index if not exists paper_trades_uid_idx on paper_trades(uid, status)`);
  // Market events calendar (roadmap 2026-07-11): was a static curated JSON file
  // on disk; moved to Postgres so events persist across deploys and can be
  // pruned once stale (see pruneOldEvents).
  await q(`create table if not exists market_events (
    id       text primary key,
    date     timestamptz not null,
    title    text not null,
    category text not null default '',
    country  text not null default '',
    impact   text not null default 'medium',
    detail   text not null default ''
  )`);
  await q(`create index if not exists market_events_date_idx on market_events(date)`);
  console.log('[db] connected; tables ready');
  return true;
}

// ---- Klines (P1-4) ----------------------------------------------------------
// Batch upsert normalized bars. Chunked multi-row inserts keep this fast enough
// for 1000-bar pages without needing COPY.
export async function upsertKlines(exchange, symbol, tf, bars) {
  if (!dbEnabled() || !bars?.length) return 0;
  const CHUNK = 500;
  let n = 0;
  for (let i = 0; i < bars.length; i += CHUNK) {
    const chunk = bars.slice(i, i + CHUNK);
    const vals = [];
    const params = [exchange, symbol, tf];
    chunk.forEach((b, j) => {
      const base = 3 + j * 6;
      vals.push(`($1,$2,$3,$${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6})`);
      params.push(b.time, b.open, b.high, b.low, b.close, b.volume);
    });
    await q(
      `insert into klines (exchange, symbol, tf, time, open, high, low, close, volume)
       values ${vals.join(',')}
       on conflict (exchange, symbol, tf, time)
       do update set open = excluded.open, high = excluded.high, low = excluded.low,
                     close = excluded.close, volume = excluded.volume`,
      params,
    );
    n += chunk.length;
  }
  return n;
}

// Bars strictly BEFORE `before` (epoch sec), newest-first internally, returned
// ascending — the shape the chart expects for a history page.
export async function getKlinesBefore(exchange, symbol, tf, before, limit = 500) {
  if (!dbEnabled()) return [];
  const { rows } = await q(
    `select time, open, high, low, close, volume from klines
     where exchange = $1 and symbol = $2 and tf = $3 and time < $4
     order by time desc limit $5`,
    [exchange, symbol, tf, before, limit],
  );
  return rows.map(r => ({ time: +r.time, open: +r.open, high: +r.high, low: +r.low, close: +r.close, volume: +r.volume })).reverse();
}

export async function oldestKlineTime(exchange, symbol, tf) {
  if (!dbEnabled()) return null;
  const { rows } = await q(
    'select min(time) as t from klines where exchange = $1 and symbol = $2 and tf = $3',
    [exchange, symbol, tf],
  );
  return rows[0]?.t != null ? +rows[0].t : null;
}

// ---- Alerts (P1-6) -----------------------------------------------------------
function toAlert(r) {
  return r && {
    id: r.id, uid: r.uid, symbol: r.symbol, exchange: r.exchange, tf: r.tf,
    type: r.type, condition: r.condition, value: +r.value, params: r.params || {},
    note: r.note, active: r.active, createdAt: r.created_at,
    triggeredAt: r.triggered_at, triggerMsg: r.trigger_msg,
  };
}
export async function createAlert(rec) {
  await q(
    `insert into alerts (id, uid, symbol, exchange, tf, type, condition, value, params, note)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
    [rec.id, rec.uid, rec.symbol, rec.exchange, rec.tf, rec.type, rec.condition, rec.value,
     JSON.stringify(rec.params || {}), rec.note || ''],
  );
}
export async function listAlerts(uid) {
  const { rows } = await q('select * from alerts where uid = $1 order by created_at desc', [uid]);
  return rows.map(toAlert);
}
export async function deleteAlert(uid, id) {
  const { rowCount } = await q('delete from alerts where uid = $1 and id = $2', [uid, id]);
  return rowCount > 0;
}
export async function listActiveAlerts() {
  const { rows } = await q('select * from alerts where active');
  return rows.map(toAlert);
}
export async function markAlertTriggered(id, msg) {
  await q('update alerts set active = false, triggered_at = now(), trigger_msg = $2 where id = $1', [id, msg]);
}
// Triggered alerts for a user since a timestamp (ms) — client polls this to
// show notifications for alerts that fired while the tab was closed.
export async function listTriggeredSince(uid, sinceMs) {
  const { rows } = await q(
    'select * from alerts where uid = $1 and triggered_at is not null and triggered_at > to_timestamp($2 / 1000.0) order by triggered_at asc',
    [uid, sinceMs || 0],
  );
  return rows.map(toAlert);
}

// ---- Accounts --------------------------------------------------------------
function toAccount(r) {
  return r && {
    id: r.id, username: r.username, displayName: r.display_name,
    salt: r.salt, passwordHash: r.password_hash,
    createdAt: r.created_at, lastLogin: r.last_login,
    totpSecret: r.totp_secret, totpEnabled: !!r.totp_enabled,
  };
}
export async function getAccount(uid) {
  const { rows } = await q('select * from accounts where id = $1', [uid]);
  return toAccount(rows[0]) || null;
}
export async function createAccount(rec) {
  await q(
    `insert into accounts (id, username, display_name, salt, password_hash)
     values ($1, $2, $3, $4, $5)`,
    [rec.id, rec.username, rec.displayName, rec.salt, rec.passwordHash],
  );
}
export async function updateLastLogin(uid) {
  await q('update accounts set last_login = now() where id = $1', [uid]);
}
// P3-19: self-service password change (current-password verified by the caller).
export async function updatePassword(uid, salt, passwordHash) {
  await q('update accounts set salt = $2, password_hash = $3, password_changed_at = now() where id = $1', [uid, salt, passwordHash]);
}
// P3-19: TOTP 2FA — secret is stored once `enableTotp` confirms a valid code;
// `setPendingTotpSecret` only stages it during setup (not yet enforced at login).
export async function setPendingTotpSecret(uid, secret) {
  await q('update accounts set totp_secret = $2, totp_enabled = false where id = $1', [uid, secret]);
}
export async function enableTotp(uid) {
  await q('update accounts set totp_enabled = true where id = $1', [uid]);
}
export async function disableTotp(uid) {
  await q('update accounts set totp_enabled = false, totp_secret = null where id = $1', [uid]);
}

// ---- Sessions --------------------------------------------------------------
export async function createSession(sid, uid, expiresAtMs) {
  await q('delete from sessions where expires_at < now()'); // prune expired
  await q('insert into sessions (sid, uid, expires_at) values ($1, $2, to_timestamp($3 / 1000.0))', [sid, uid, expiresAtMs]);
}
export async function getSessionUid(sid) {
  const { rows } = await q('select uid from sessions where sid = $1 and expires_at > now()', [sid]);
  return rows[0]?.uid || null;
}
export async function deleteSession(sid) {
  await q('delete from sessions where sid = $1', [sid]);
}
// Invalidates every other session for this account (e.g. on password change),
// keeping the caller's own current session (`keepSid`) alive.
export async function deleteOtherSessions(uid, keepSid) {
  await q('delete from sessions where uid = $1 and sid != $2', [uid, keepSid]);
}

// ---- Layouts (named layouts + autosave session-state) ----------------------
export async function getLayout(uid, name) {
  const { rows } = await q('select data from layouts where uid = $1 and name = $2', [uid, name]);
  return rows[0]?.data ?? null;
}
export async function putLayout(uid, name, data) {
  await q(
    `insert into layouts (uid, name, data, updated_at) values ($1, $2, $3::jsonb, now())
     on conflict (uid, name) do update set data = excluded.data, updated_at = now()`,
    [uid, name, JSON.stringify(data)],
  );
}
export async function deleteLayout(uid, name) {
  const { rowCount } = await q('delete from layouts where uid = $1 and name = $2', [uid, name]);
  return rowCount > 0;
}
export async function listLayouts(uid) {
  const { rows } = await q(
    'select name, data from layouts where uid = $1 and name <> $2 order by updated_at desc',
    [uid, SESSION_NAME],
  );
  const out = {};
  for (const r of rows) out[r.name] = r.data;
  return out;
}

// ---- Indicator templates (P2-12) --------------------------------------------
export async function getTemplates(uid) {
  const { rows } = await q('select name, data from templates where uid = $1 order by updated_at desc', [uid]);
  const out = {};
  for (const r of rows) out[r.name] = r.data;
  return out;
}
export async function putTemplate(uid, name, data) {
  await q(
    `insert into templates (uid, name, data, updated_at) values ($1, $2, $3::jsonb, now())
     on conflict (uid, name) do update set data = excluded.data, updated_at = now()`,
    [uid, name, JSON.stringify(data)],
  );
}
export async function deleteTemplate(uid, name) {
  const { rowCount } = await q('delete from templates where uid = $1 and name = $2', [uid, name]);
  return rowCount > 0;
}

// ---- Saved screener scans (P2-13) --------------------------------------------
export async function getScans(uid) {
  const { rows } = await q('select name, data from saved_scans where uid = $1 order by updated_at desc', [uid]);
  const out = {};
  for (const r of rows) out[r.name] = r.data;
  return out;
}
export async function putScan(uid, name, data) {
  await q(
    `insert into saved_scans (uid, name, data, updated_at) values ($1, $2, $3::jsonb, now())
     on conflict (uid, name) do update set data = excluded.data, updated_at = now()`,
    [uid, name, JSON.stringify(data)],
  );
}
export async function deleteScan(uid, name) {
  const { rowCount } = await q('delete from saved_scans where uid = $1 and name = $2', [uid, name]);
  return rowCount > 0;
}

// ---- Paper trading & journal (P2-15) -----------------------------------------
function toPaperTrade(r) {
  return r && {
    id: r.id, uid: r.uid, symbol: r.symbol, exchange: r.exchange, side: r.side,
    qty: +r.qty, entryPrice: +r.entry_price, exitPrice: r.exit_price != null ? +r.exit_price : null,
    stop: r.stop != null ? +r.stop : null, target: r.target != null ? +r.target : null,
    status: r.status, notes: r.notes, tags: r.tags,
    openedAt: r.opened_at, closedAt: r.closed_at,
  };
}
export async function createPaperTrade(rec) {
  await q(
    `insert into paper_trades (id, uid, symbol, exchange, side, qty, entry_price, stop, target, notes, tags)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [rec.id, rec.uid, rec.symbol, rec.exchange, rec.side, rec.qty, rec.entryPrice, rec.stop, rec.target, rec.notes || '', rec.tags || ''],
  );
}
export async function listPaperTrades(uid) {
  const { rows } = await q('select * from paper_trades where uid = $1 order by opened_at desc', [uid]);
  return rows.map(toPaperTrade);
}
export async function closePaperTrade(uid, id, exitPrice) {
  const { rows } = await q(
    `update paper_trades set exit_price = $3, status = 'closed', closed_at = now()
     where uid = $1 and id = $2 and status = 'open' returning *`,
    [uid, id, exitPrice],
  );
  return toPaperTrade(rows[0]);
}
export async function updatePaperTradeNotes(uid, id, notes, tags) {
  const { rowCount } = await q('update paper_trades set notes = $3, tags = $4 where uid = $1 and id = $2', [uid, id, notes || '', tags || '']);
  return rowCount > 0;
}
export async function deletePaperTrade(uid, id) {
  const { rowCount } = await q('delete from paper_trades where uid = $1 and id = $2', [uid, id]);
  return rowCount > 0;
}

// ---- Market events calendar --------------------------------------------------
function toEvent(r) {
  return r && {
    id: r.id, date: r.date.toISOString(), title: r.title,
    category: r.category, country: r.country, impact: r.impact, detail: r.detail,
  };
}
// One-time import of the curated calendar (data/events.json) into the table,
// so switching from file storage to Postgres doesn't lose the existing list.
// ON CONFLICT DO NOTHING keeps this safe to call on every boot.
export async function seedEvents(events) {
  if (!events?.length) return;
  for (const e of events) {
    await q(
      `insert into market_events (id, date, title, category, country, impact, detail)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (id) do nothing`,
      [e.id, e.date, e.title, e.category || '', e.country || '', e.impact || 'medium', e.detail || ''],
    );
  }
}
// Purges events whose date is more than a week in the past, so the table
// doesn't accumulate stale entries forever.
export async function pruneOldEvents() {
  await q(`delete from market_events where date < now() - interval '7 days'`);
}
export async function listEvents() {
  const { rows } = await q('select * from market_events order by date asc');
  return rows.map(toEvent);
}
