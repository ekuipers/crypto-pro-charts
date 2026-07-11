// ============================================================
// AUTH — multi-user sessions with username/password (application-only)
// ------------------------------------------------------------
// Cookie parsing, opaque session tokens, and salted scrypt password hashing.
// Accounts and sessions are persisted in Postgres (Supabase) via db.js — see
// that module for the schema. There is no third-party SSO. With nobody signed
// in, the app works for an anonymous "guest" whose chart data is stored in the
// database under the GUEST uid.
// ============================================================
import crypto from 'crypto';
import * as db from './db.js';

const SESSION_COOKIE = 'cpc_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

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

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;
const normUser = (u) => String(u || '').trim().toLowerCase();
const publicUser = (u) => ({ id: u.id, username: u.username, displayName: u.displayName || u.username });

// ---- Public: who is this request? ------------------------------------------
export async function currentUser(req) {
  const sid = parseCookies(req)[SESSION_COOKIE];
  if (!sid) return null;
  try {
    const uid = await db.getSessionUid(sid);
    if (!uid) return null;
    return await db.getAccount(uid);
  } catch (e) {
    console.error('[auth] currentUser lookup failed:', e?.message || e);
    return null; // storage hiccup — treat as signed-out, don't crash
  }
}

// The uid whose data this request owns: the signed-in account, or GUEST.
export async function currentUid(req) {
  const user = await currentUser(req);
  return user?.id || db.GUEST;
}

// ---- Routes ----------------------------------------------------------------
export function installAuthRoutes(app) {
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
      if (await db.getAccount(uid)) return res.status(409).json({ error: 'Username already taken' });

      const salt = token(16);
      const record = { id: uid, username, displayName: username, salt, passwordHash: hashPassword(password, salt) };
      await db.createAccount(record);

      const sid = token(24);
      await db.createSession(sid, uid, Date.now() + SESSION_TTL_MS);
      setCookie(res, SESSION_COOKIE, sid, SESSION_TTL_MS);
      res.json({ user: publicUser(record) });
    } catch (e) {
      console.error('[auth] register failed:', e?.stack || e);
      res.status(500).json({ error: 'Could not create account — database error, please retry.' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const uid = normUser(req.body?.username);
      const password = String(req.body?.password || '');
      const user = await db.getAccount(uid);
      // Same response whether the user is missing or the password is wrong.
      if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }
      try { await db.updateLastLogin(uid); } catch { /* non-critical */ }

      const sid = token(24);
      await db.createSession(sid, uid, Date.now() + SESSION_TTL_MS);
      setCookie(res, SESSION_COOKIE, sid, SESSION_TTL_MS);
      res.json({ user: publicUser(user) });
    } catch (e) {
      console.error('[auth] login failed:', e?.stack || e);
      res.status(500).json({ error: 'Sign-in failed — database error, please retry.' });
    }
  });

  app.post('/api/auth/logout', async (req, res) => {
    try {
      const sid = parseCookies(req)[SESSION_COOKIE];
      if (sid) await db.deleteSession(sid);
    } catch { /* clear the cookie regardless */ }
    clearCookie(res, SESSION_COOKIE);
    res.json({ ok: true });
  });
}
