// ============================================================
// AUTH — multi-user sessions with username/password (application-only)
// ------------------------------------------------------------
// Cookie parsing, opaque session tokens, and salted scrypt password hashing.
//
// Account records are stored as **one JSON file per user** in the "Users/"
// folder. When BLOB_READ_WRITE_TOKEN is configured (see .env) that folder lives
// in the Vercel Blob store (Users/<uid>.json, private); otherwise it falls back
// to local files under <dataDir>/Users/<uid>.json so the app still runs offline.
// Session tokens are ephemeral and always kept locally in <dataDir>/sessions.json.
//
// There is no third-party SSO: users register and sign in with a username and
// password handled entirely by this app. With nobody signed in the app still
// works for an anonymous "guest" whose chart data maps to the legacy shared
// files, preserving every layout saved before multi-user support existed.
// ============================================================
import { promises as fs } from 'fs';
import { join } from 'path';
import crypto from 'crypto';
import * as blob from './blob.js';

let DATA_DIR = '';
let USERS_SUBDIR = '';     // local chart-layout data per user (data/users/<uid>/)
let ACCOUNTS_DIR = '';     // local fallback for account JSON when blob is disabled
let SESSIONS_FILE = '';
let LEGACY_USERS_FILE = '';

const SESSION_COOKIE = 'cpc_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Retry transient filesystem errors. The repo often lives in a OneDrive-synced
// folder whose sync client briefly locks files, surfacing as EBUSY/EPERM/EACCES
// on writeFile/mkdir — without this a single lock would crash/hang the request.
const TRANSIENT = new Set(['EBUSY', 'EPERM', 'EACCES', 'ENOTEMPTY']);
async function withRetry(fn, tries = 5) {
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e) {
      if (i >= tries - 1 || !TRANSIENT.has(e.code)) throw e;
      await new Promise(r => setTimeout(r, 60 * (i + 1)));
    }
  }
}
async function writeJson(file, data) {
  await withRetry(() => fs.mkdir(join(file, '..'), { recursive: true }));
  await withRetry(() => fs.writeFile(file, JSON.stringify(data, null, 2)));
}
async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch { return fallback; }
}

// ---- Account store (per-user JSON: blob "Users/" with local safety net) ----
// The blob store is the primary home for account files. A local copy under
// data/accounts/ acts as a fallback so a transient blob/network outage (e.g. a
// corporate proxy hiccup) never blocks sign-in or account creation. Reads check
// blob first then local; writes go to blob, and also to local if blob fails.
const localAccountPath = (uid) => join(ACCOUNTS_DIR, `${uid}.json`);

// `fresh` forces an uncached blob read (for the registration uniqueness check).
async function getAccount(uid, fresh = false) {
  if (blob.blobEnabled()) {
    try {
      const rec = await blob.getAccount(uid, fresh);
      if (rec) return rec;
    } catch (e) {
      console.error('[auth] blob read failed, using local fallback:', e?.message || e);
    }
  }
  return readJson(localAccountPath(uid), null);
}
async function putAccount(uid, record) {
  if (blob.blobEnabled()) {
    try { await blob.putAccount(uid, record); return; }
    catch (e) { console.error('[auth] blob write failed, saving locally:', e?.message || e); }
  }
  await writeJson(localAccountPath(uid), record);
}

// ---- Sessions (always local; ephemeral, not "account information") ---------
async function readSessions() { return readJson(SESSIONS_FILE, {}); }
async function writeSessions(sessions) { return writeJson(SESSIONS_FILE, sessions); }

async function createSession(uid) {
  const sessions = await readSessions();
  const now = Date.now();
  for (const [sid, s] of Object.entries(sessions)) {
    if (s.expiresAt < now) delete sessions[sid]; // prune expired
  }
  const sid = token(24);
  sessions[sid] = { uid, createdAt: now, expiresAt: now + SESSION_TTL_MS };
  await writeSessions(sessions);
  return sid;
}

// ---- Passwords (salted scrypt + constant-time compare) ---------------------
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}
function verifyPassword(password, salt, expected) {
  const got = Buffer.from(hashPassword(password, salt), 'hex');
  const exp = Buffer.from(expected, 'hex');
  return got.length === exp.length && crypto.timingSafeEqual(got, exp);
}

// ---- Cookies ---------------------------------------------------------------
function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function setCookie(res, name, value, maxAgeMs) {
  const bits = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (maxAgeMs != null) bits.push(`Max-Age=${Math.floor(maxAgeMs / 1000)}`);
  if (process.env.NODE_ENV === 'production') bits.push('Secure');
  res.setHeader('Set-Cookie', bits.join('; '));
}
function clearCookie(res, name) {
  res.setHeader('Set-Cookie', `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

const token = (bytes = 24) => crypto.randomBytes(bytes).toString('hex');

// Usernames double as the blob/file name, so keep them filesystem-safe.
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;
const normUser = (u) => String(u || '').trim().toLowerCase();
const publicUser = (u) => ({ id: u.id, username: u.username, displayName: u.displayName || u.username });

// ---- Public: who is this request? ------------------------------------------
export async function currentUser(req) {
  const sid = parseCookies(req)[SESSION_COOKIE];
  if (!sid) return null;
  const sessions = await readSessions();
  const sess = sessions[sid];
  if (!sess || sess.expiresAt < Date.now()) return null;
  try { return await getAccount(sess.uid); }
  catch { return null; } // storage hiccup — treat as signed-out, don't crash
}

// Where a given uid's chart data lives. Guests (uid null) reuse the legacy
// shared files so pre-multi-user layouts keep working untouched.
export function userPaths(uid) {
  if (!uid) {
    return { sessionFile: join(DATA_DIR, 'session.json'), layoutsDir: join(DATA_DIR, 'layouts') };
  }
  const dir = join(USERS_SUBDIR, uid);
  return { sessionFile: join(dir, 'session.json'), layoutsDir: join(dir, 'layouts') };
}

export function init(dataDir) {
  DATA_DIR = dataDir;
  USERS_SUBDIR = join(dataDir, 'users');
  // Local fallback only. Named 'accounts' (not 'Users') so it can't collide with
  // the layout dir 'users' on case-insensitive filesystems (Windows/macOS).
  // The blob store uses the real "Users/" folder (see blob.js).
  ACCOUNTS_DIR = join(dataDir, 'accounts');
  SESSIONS_FILE = join(dataDir, 'sessions.json');
  LEGACY_USERS_FILE = join(dataDir, 'users.json');
  // Move any pre-existing accounts from the old single-file store into the new
  // per-user layout (best-effort; runs once, never blocks startup).
  migrateLegacyUsers().catch(() => {});
}

// One-time migration: data/users.json ({ users, sessions }) → per-user account
// files (blob or local) + sessions.json. Renames the old file when done.
async function migrateLegacyUsers() {
  const legacy = await readJson(LEGACY_USERS_FILE, null);
  if (!legacy || !legacy.users) return;
  for (const [uid, rec] of Object.entries(legacy.users)) {
    try {
      if (!(await getAccount(uid))) await putAccount(uid, rec);
    } catch { /* leave it for next start */ }
  }
  if (legacy.sessions) {
    const sessions = await readSessions();
    await writeSessions({ ...legacy.sessions, ...sessions });
  }
  try { await fs.rename(LEGACY_USERS_FILE, LEGACY_USERS_FILE + '.migrated'); } catch {}
}

// ---- Routes ----------------------------------------------------------------
export function installAuthRoutes(app) {
  // Who's signed in (drives the UI).
  app.get('/api/me', async (req, res) => {
    const user = await currentUser(req);
    res.json({ user: user ? publicUser(user) : null });
  });

  app.post('/api/auth/register', async (req, res) => {
    try {
      const username = String(req.body?.username || '').trim();
      const password = String(req.body?.password || '');
      if (!USERNAME_RE.test(username)) {
        return res.status(400).json({ error: 'Username must be 3-32 chars: letters, digits, . _ -' });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }
      const uid = normUser(username);
      if (await getAccount(uid, true)) return res.status(409).json({ error: 'Username already taken' });

      const salt = token(16);
      const now = Date.now();
      const record = {
        id: uid, username, displayName: username,
        salt, passwordHash: hashPassword(password, salt),
        createdAt: now, lastLogin: now,
      };
      await putAccount(uid, record);          // → Users/<uid>.json (blob or local)
      const sid = await createSession(uid);
      // Chart-layout folder is created lazily on first save too, so a transient
      // failure here must not fail (or hang) the registration.
      try { await withRetry(() => fs.mkdir(join(USERS_SUBDIR, uid, 'layouts'), { recursive: true })); } catch { /* lazy */ }

      setCookie(res, SESSION_COOKIE, sid, SESSION_TTL_MS);
      res.json({ user: publicUser(record) });
    } catch (e) {
      console.error('[auth] register failed:', e?.stack || e);
      res.status(500).json({ error: 'Could not create account — storage error, please retry.' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const uid = normUser(req.body?.username);
      const password = String(req.body?.password || '');
      const user = await getAccount(uid);
      // Same response whether the user is missing or the password is wrong.
      if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }
      user.lastLogin = Date.now();
      try { await putAccount(uid, user); } catch { /* lastLogin is non-critical */ }
      const sid = await createSession(uid);
      setCookie(res, SESSION_COOKIE, sid, SESSION_TTL_MS);
      res.json({ user: publicUser(user) });
    } catch (e) {
      console.error('[auth] login failed:', e?.stack || e);
      res.status(500).json({ error: 'Sign-in failed — storage error, please retry.' });
    }
  });

  app.post('/api/auth/logout', async (req, res) => {
    try {
      const sid = parseCookies(req)[SESSION_COOKIE];
      if (sid) {
        const sessions = await readSessions();
        if (sessions[sid]) { delete sessions[sid]; await writeSessions(sessions); }
      }
    } catch { /* clear the cookie regardless */ }
    clearCookie(res, SESSION_COOKIE);
    res.json({ ok: true });
  });
}
