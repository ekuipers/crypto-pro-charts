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

// One form, two explicit actions — "Create account" and "Sign in" both submit
// the same username/password. No mode toggle, so the visible "Create account"
// button always creates the account (rather than just re-rendering the form).
function signInModal() {
  showModal(`
    <h3>Sign in to CryptoPro Charts</h3>
    <p class="muted">New here? Pick a username and password and choose <b>Create account</b>. Your chart layouts and watchlists are saved to your account.</p>
    <label>Username<input id="auUser" autocomplete="username" placeholder="3-32 letters, digits, . _ -"></label>
    <label>Password<input id="auPass" type="password" autocomplete="current-password" placeholder="at least 6 characters"></label>
    <div class="auth-err set-warn" id="auErr"></div>
    <div class="modal-actions">
      <button id="auRegister">Create account</button>
      <button id="auLogin" class="primary-btn">Sign in</button>
    </div>`, m => {
    const userEl = m.querySelector('#auUser');
    const passEl = m.querySelector('#auPass');
    const errEl = m.querySelector('#auErr');
    const buttons = m.querySelectorAll('.modal-actions button');
    userEl.focus();

    let busy = false;
    const go = async (action) => {
      if (busy) return;
      const username = userEl.value.trim();
      const password = passEl.value;
      if (!username || !password) { errEl.textContent = 'Enter a username and password.'; return; }
      busy = true; buttons.forEach(b => (b.disabled = true));
      errEl.textContent = action === 'register' ? 'Creating account…' : 'Signing in…';
      const reset = () => { busy = false; buttons.forEach(b => (b.disabled = false)); };
      // Never spin forever — abort the request if the server doesn't answer.
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      try {
        const r = await fetch(`/api/auth/${action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
          signal: ctrl.signal,
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          errEl.textContent = data.error || (action === 'register' ? 'Could not create account.' : 'Sign-in failed.');
          reset();
          return;
        }
        window.location.reload(); // reload to pull this user's saved layouts
      } catch (e) {
        errEl.textContent = e.name === 'AbortError'
          ? 'Server did not respond — please try again.'
          : 'Network error — try again.';
        reset();
      } finally {
        clearTimeout(timer);
      }
    };
    m.querySelector('#auRegister').addEventListener('click', () => go('register'));
    m.querySelector('#auLogin').addEventListener('click', () => go('login'));
    passEl.addEventListener('keydown', e => { if (e.key === 'Enter') go('login'); });
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
    if (currentUser) accountModal(currentUser); else signInModal();
  });
  return me;
}
