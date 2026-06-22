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
  console.log('[db] connected; tables ready');
  return true;
}

// ---- Accounts --------------------------------------------------------------
function toAccount(r) {
  return r && {
    id: r.id, username: r.username, displayName: r.display_name,
    salt: r.salt, passwordHash: r.password_hash,
    createdAt: r.created_at, lastLogin: r.last_login,
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
