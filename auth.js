// ============================================================
// AUTH — multi-user sessions with username/password (application-only)
// ------------------------------------------------------------
// Pure Node (no extra deps): cookie parsing, opaque session tokens, and salted
// scrypt password hashing. All state lives in JSON on disk under
// <dataDir>/users.json so the backend stays portable.
//
// There is no third-party SSO: users register and sign in with a username and
// password handled entirely by this app. With nobody signed in the app still
// works for an anonymous "guest" whose data maps to the legacy shared files,
// preserving every layout saved before multi-user support existed.
// ============================================================
import { promises as fs } from 'fs';
import { join } from 'path';
import crypto from 'crypto';

let DATA_DIR = '';
let USERS_FILE = '';
let USERS_SUBDIR = '';

const SESSION_COOKIE = 'cpc_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ---- Store helpers (read-modify-write a single JSON file) ------------------
async function readStore() {
  try {
    return JSON.parse(await fs.readFile(USERS_FILE, 'utf8'));
  } catch {
    return { users: {}, sessions: {} };
  }
}
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

async function writeStore(store) {
  await withRetry(() => fs.mkdir(DATA_DIR, { recursive: true }));
  await withRetry(() => fs.writeFile(USERS_FILE, JSON.stringify(store, null, 2)));
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

// Usernames double as the on-disk folder name, so keep them filesystem-safe.
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;
const normUser = (u) => String(u || '').trim().toLowerCase();

// ---- Sessions --------------------------------------------------------------
async function createSession(store, uid) {
  const now = Date.now();
  for (const [sid, s] of Object.entries(store.sessions)) {
    if (s.expiresAt < now) delete store.sessions[sid]; // prune expired
  }
  const sid = token(24);
  store.sessions[sid] = { uid, createdAt: now, expiresAt: now + SESSION_TTL_MS };
  return sid;
}
const publicUser = (u) => ({ id: u.id, username: u.username, displayName: u.displayName || u.username });

// ---- Public: who is this request? ------------------------------------------
export async function currentUser(req) {
  const sid = parseCookies(req)[SESSION_COOKIE];
  if (!sid) return null;
  const store = await readStore();
  const sess = store.sessions[sid];
  if (!sess || sess.expiresAt < Date.now()) return null;
  return store.users[sess.uid] || null;
}

// Where a given uid's data lives. Guests (uid null) reuse the legacy shared
// files so pre-multi-user layouts keep working untouched.
export function userPaths(uid) {
  if (!uid) {
    return { sessionFile: join(DATA_DIR, 'session.json'), layoutsDir: join(DATA_DIR, 'layouts') };
  }
  const dir = join(USERS_SUBDIR, uid);
  return { sessionFile: join(dir, 'session.json'), layoutsDir: join(dir, 'layouts') };
}

export function init(dataDir) {
  DATA_DIR = dataDir;
  USERS_FILE = join(dataDir, 'users.json');
  USERS_SUBDIR = join(dataDir, 'users');
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
      const store = await readStore();
      if (store.users[uid]) return res.status(409).json({ error: 'Username already taken' });

      const salt = token(16);
      const now = Date.now();
      store.users[uid] = {
        id: uid, username, displayName: username,
        salt, passwordHash: hashPassword(password, salt),
        createdAt: now, lastLogin: now,
      };
      const sid = await createSession(store, uid);
      await writeStore(store);
      // The layouts folder is created lazily on first save too, so a transient
      // failure here must not fail (or hang) the registration.
      try { await withRetry(() => fs.mkdir(join(USERS_SUBDIR, uid, 'layouts'), { recursive: true })); } catch { /* lazy */ }

      setCookie(res, SESSION_COOKIE, sid, SESSION_TTL_MS);
      res.json({ user: publicUser(store.users[uid]) });
    } catch (e) {
      res.status(500).json({ error: 'Could not create account — storage error, please retry.' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const uid = normUser(req.body?.username);
      const password = String(req.body?.password || '');
      const store = await readStore();
      const user = store.users[uid];
      // Same response whether the user is missing or the password is wrong.
      if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }
      user.lastLogin = Date.now();
      const sid = await createSession(store, uid);
      await writeStore(store);
      setCookie(res, SESSION_COOKIE, sid, SESSION_TTL_MS);
      res.json({ user: publicUser(user) });
    } catch (e) {
      res.status(500).json({ error: 'Sign-in failed — storage error, please retry.' });
    }
  });

  app.post('/api/auth/logout', async (req, res) => {
    try {
      const sid = parseCookies(req)[SESSION_COOKIE];
      if (sid) {
        const store = await readStore();
        if (store.sessions[sid]) { delete store.sessions[sid]; await writeStore(store); }
      }
    } catch { /* clear the cookie regardless */ }
    clearCookie(res, SESSION_COOKIE);
    res.json({ ok: true });
  });
}
