// ============================================================
// AUTH — multi-user sessions + OAuth SSO (Google / GitHub)
// ------------------------------------------------------------
// Pure Node (no extra deps): cookie parsing, opaque session tokens, and the
// OAuth2 authorization-code flow via the built-in fetch. All state lives in
// JSON files on disk under <dataDir>/users.json so the backend stays portable.
//
// OAuth providers are optional: configure them with environment variables and
// the matching "Sign in" buttons light up. With none configured the app still
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
const STATE_COOKIE   = 'cpc_oauth_state';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ---- OAuth provider definitions (endpoints + how to read a profile) --------
const PROVIDERS = {
  google: {
    label: 'Google',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
    scope: 'openid email profile',
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
    profile: async (accessToken) => {
      const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!r.ok) throw new Error(`google userinfo ${r.status}`);
      const u = await r.json();
      return { providerId: u.sub, name: u.name || u.email, email: u.email || '', avatar: u.picture || '' };
    },
  },
  github: {
    label: 'GitHub',
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userUrl: 'https://api.github.com/user',
    scope: 'read:user user:email',
    clientId: () => process.env.GITHUB_CLIENT_ID,
    clientSecret: () => process.env.GITHUB_CLIENT_SECRET,
    profile: async (accessToken) => {
      const headers = { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'CryptoPro-Charts', Accept: 'application/json' };
      const r = await fetch('https://api.github.com/user', { headers });
      if (!r.ok) throw new Error(`github user ${r.status}`);
      const u = await r.json();
      let email = u.email || '';
      if (!email) {
        try {
          const er = await fetch('https://api.github.com/user/emails', { headers });
          if (er.ok) {
            const list = await er.json();
            email = (list.find(e => e.primary && e.verified) || list.find(e => e.verified) || list[0] || {}).email || '';
          }
        } catch { /* email scope may be missing — non-fatal */ }
      }
      return { providerId: String(u.id), name: u.name || u.login, email, avatar: u.avatar_url || '' };
    },
  },
};

// ---- Store helpers (read-modify-write a single JSON file) ------------------
async function readStore() {
  try {
    return JSON.parse(await fs.readFile(USERS_FILE, 'utf8'));
  } catch {
    return { users: {}, sessions: {} };
  }
}
async function writeStore(store) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(USERS_FILE, JSON.stringify(store, null, 2));
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
  appendHeader(res, 'Set-Cookie', bits.join('; '));
}
function clearCookie(res, name) {
  appendHeader(res, 'Set-Cookie', `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}
function appendHeader(res, name, value) {
  const prev = res.getHeader(name);
  if (!prev) res.setHeader(name, value);
  else res.setHeader(name, Array.isArray(prev) ? [...prev, value] : [prev, value]);
}

const token = (bytes = 24) => crypto.randomBytes(bytes).toString('hex');
const configured = (p) => Boolean(PROVIDERS[p]?.clientId() && PROVIDERS[p]?.clientSecret());

function baseUrl(req) {
  if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http');
  return `${proto}://${req.headers.host}`;
}

// ---- Public: who is this request? ------------------------------------------
// Returns the user record for a valid, unexpired session cookie, else null.
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
  // Which providers are available + the signed-in user (drives the UI).
  app.get('/api/me', async (req, res) => {
    const user = await currentUser(req);
    const providers = Object.keys(PROVIDERS).filter(configured).map(id => ({ id, label: PROVIDERS[id].label }));
    res.json({
      user: user ? { id: user.id, name: user.name, email: user.email, avatar: user.avatar, provider: user.provider } : null,
      providers,
    });
  });

  // Step 1 — kick off the OAuth dance.
  app.get('/api/auth/:provider/login', (req, res) => {
    const p = PROVIDERS[req.params.provider];
    if (!p || !configured(req.params.provider)) return res.status(404).send('provider not configured');
    const state = token(16);
    setCookie(res, STATE_COOKIE, `${req.params.provider}:${state}`, 10 * 60 * 1000);
    const params = new URLSearchParams({
      client_id: p.clientId(),
      redirect_uri: `${baseUrl(req)}/api/auth/${req.params.provider}/callback`,
      response_type: 'code',
      scope: p.scope,
      state,
    });
    res.redirect(`${p.authUrl}?${params}`);
  });

  // Step 2 — provider redirects back with a code; exchange it, upsert the user,
  // mint a session, and bounce home.
  app.get('/api/auth/:provider/callback', async (req, res) => {
    const id = req.params.provider;
    const p = PROVIDERS[id];
    if (!p || !configured(id)) return res.status(404).send('provider not configured');

    const cookie = parseCookies(req)[STATE_COOKIE] || '';
    const [cProvider, cState] = cookie.split(':');
    clearCookie(res, STATE_COOKIE);
    if (cProvider !== id || !cState || cState !== req.query.state) {
      return res.status(400).send('invalid OAuth state');
    }

    try {
      const tokenRes = await fetch(p.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({
          client_id: p.clientId(),
          client_secret: p.clientSecret(),
          code: String(req.query.code || ''),
          redirect_uri: `${baseUrl(req)}/api/auth/${id}/callback`,
          grant_type: 'authorization_code',
        }),
      });
      if (!tokenRes.ok) throw new Error(`token ${tokenRes.status}`);
      const tok = await tokenRes.json();
      if (!tok.access_token) throw new Error('no access_token');

      const prof = await p.profile(tok.access_token);
      const uid = `${id}:${prof.providerId}`;

      const store = await readStore();
      const now = Date.now();
      store.users[uid] = {
        id: uid, provider: id, providerId: prof.providerId,
        name: prof.name, email: prof.email, avatar: prof.avatar,
        createdAt: store.users[uid]?.createdAt || now, lastLogin: now,
      };
      // Prune expired sessions, then add a fresh one.
      for (const [sid, s] of Object.entries(store.sessions)) {
        if (s.expiresAt < now) delete store.sessions[sid];
      }
      const sid = token(24);
      store.sessions[sid] = { uid, createdAt: now, expiresAt: now + SESSION_TTL_MS };
      await writeStore(store);
      await fs.mkdir(join(USERS_SUBDIR, uid, 'layouts'), { recursive: true });

      setCookie(res, SESSION_COOKIE, sid, SESSION_TTL_MS);
      res.redirect('/');
    } catch (e) {
      res.status(502).send(`Sign-in failed: ${e.message}. <a href="/">Return</a>`);
    }
  });

  app.post('/api/auth/logout', async (req, res) => {
    const sid = parseCookies(req)[SESSION_COOKIE];
    if (sid) {
      const store = await readStore();
      if (store.sessions[sid]) { delete store.sessions[sid]; await writeStore(store); }
    }
    clearCookie(res, SESSION_COOKIE);
    res.json({ ok: true });
  });
}
