// ============================================================
// AUTH (client) — account button + username/password sign-in modal
// ------------------------------------------------------------
// Talks to /api/me, /api/auth/login, /api/auth/register, /api/auth/logout.
// Layout data is already user-scoped server-side via the session cookie, so
// signing in or out is just a page (re)load that fetches the right user's data.
// ============================================================
import { esc } from './utils.js';
import { showModal, closeModal } from './alerts.js';

export let currentUser = null;

async function fetchMe() {
  try {
    const r = await fetch('/api/me');
    if (!r.ok) return { user: null };
    return await r.json();
  } catch {
    return { user: null };
  }
}

function renderButton(user) {
  const btn = document.getElementById('accountBtn');
  if (!btn) return;
  if (user) {
    const name = user.displayName || user.username;
    btn.innerHTML = `<span class="acct-avatar acct-avatar-fallback">${esc(name.charAt(0).toUpperCase())}</span><span class="acct-name">${esc(name)}</span>`;
    btn.title = `Signed in as ${name}`;
  } else {
    btn.innerHTML = '👤 Sign in';
    btn.title = 'Sign in to save layouts to your account';
  }
}

// One modal handling both Sign in and Create account via a mode toggle.
function authModal(mode = 'login') {
  const isLogin = mode === 'login';
  showModal(`
    <h3>${isLogin ? 'Sign in' : 'Create account'}</h3>
    <p class="muted">Your chart layouts and watchlists are saved to your account.</p>
    <label>Username<input id="auUser" autocomplete="username" placeholder="your name"></label>
    <label>Password<input id="auPass" type="password" autocomplete="${isLogin ? 'current-password' : 'new-password'}" placeholder="${isLogin ? 'password' : 'at least 6 characters'}"></label>
    <div class="auth-err set-warn" id="auErr"></div>
    <div class="modal-actions">
      <button id="auSwitch" class="auth-switch">${isLogin ? 'Create account' : 'Have an account? Sign in'}</button>
      <button id="auSubmit" class="primary-btn">${isLogin ? 'Sign in' : 'Create account'}</button>
    </div>`, m => {
    const userEl = m.querySelector('#auUser');
    const passEl = m.querySelector('#auPass');
    const errEl = m.querySelector('#auErr');
    userEl.focus();

    m.querySelector('#auSwitch').addEventListener('click', () => authModal(isLogin ? 'register' : 'login'));

    const submit = async () => {
      const username = userEl.value.trim();
      const password = passEl.value;
      if (!username || !password) { errEl.textContent = 'Enter a username and password.'; return; }
      errEl.textContent = '';
      try {
        const r = await fetch(`/api/auth/${isLogin ? 'login' : 'register'}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) { errEl.textContent = data.error || 'Sign-in failed.'; return; }
        window.location.reload(); // reload to pull this user's saved layouts
      } catch {
        errEl.textContent = 'Network error — try again.';
      }
    };
    m.querySelector('#auSubmit').addEventListener('click', submit);
    passEl.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  });
}

function accountModal(user) {
  const name = user.displayName || user.username;
  showModal(`
    <h3>Account</h3>
    <div class="acct-card">
      <span class="acct-modal-avatar acct-avatar-fallback">${esc(name.charAt(0).toUpperCase())}</span>
      <div class="acct-card-info">
        <div class="acct-card-name">${esc(name)}</div>
        <div class="acct-card-email muted">@${esc(user.username)}</div>
      </div>
    </div>
    <p class="muted">Your layouts and watchlists are saved to this account.</p>
    <div class="modal-actions">
      <button id="acctClose">Close</button>
      <button id="acctLogout" class="primary-btn">Sign out</button>
    </div>`, m => {
    m.querySelector('#acctClose').addEventListener('click', closeModal);
    m.querySelector('#acctLogout').addEventListener('click', async () => {
      try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
      window.location.reload();
    });
  });
}

export async function initAuth() {
  const me = await fetchMe();
  currentUser = me.user;
  renderButton(me.user);
  document.getElementById('accountBtn')?.addEventListener('click', () => {
    if (currentUser) accountModal(currentUser); else authModal('login');
  });
  return me;
}
