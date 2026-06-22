// ============================================================
// AUTH (client) — account button, sign-in modal, session awareness
// ------------------------------------------------------------
// Talks to /api/me, /api/auth/<provider>/login and /api/auth/logout. Layout
// data is already user-scoped server-side via the session cookie, so signing in
// or out is just a page (re)load that fetches the right user's session.
// ============================================================
import { esc } from './utils.js';
import { showModal, closeModal } from './alerts.js';

export let currentUser = null;

async function fetchMe() {
  try {
    const r = await fetch('/api/me');
    if (!r.ok) return { user: null, providers: [] };
    return await r.json();
  } catch {
    return { user: null, providers: [] };
  }
}

const PROVIDER_ICON = { google: 'G', github: '🐙' };

function renderButton(me) {
  const btn = document.getElementById('accountBtn');
  if (!btn) return;
  const u = me.user;
  if (u) {
    const avatar = u.avatar
      ? `<img class="acct-avatar" src="${esc(u.avatar)}" alt="">`
      : `<span class="acct-avatar acct-avatar-fallback">${esc((u.name || '?').charAt(0).toUpperCase())}</span>`;
    btn.innerHTML = `${avatar}<span class="acct-name">${esc(u.name || 'Account')}</span>`;
    btn.title = `Signed in as ${u.name}${u.email ? ' · ' + u.email : ''}`;
  } else {
    btn.innerHTML = '👤 Sign in';
    btn.title = 'Sign in to save layouts to your account';
  }
}

function signInModal(me) {
  const providerBtns = me.providers.length
    ? me.providers.map(p => `
        <button class="sso-btn" data-provider="${esc(p.id)}">
          <span class="sso-icon">${PROVIDER_ICON[p.id] || '🔑'}</span>
          Continue with ${esc(p.label)}
        </button>`).join('')
    : `<p class="muted sso-none">No SSO providers are configured on this server.
         Set <code>GOOGLE_CLIENT_ID</code>/<code>GOOGLE_CLIENT_SECRET</code> or
         <code>GITHUB_CLIENT_ID</code>/<code>GITHUB_CLIENT_SECRET</code> to enable
         single sign-on. You can keep using the app as a guest — your layouts are
         saved locally.</p>`;

  showModal(`
    <h3>Sign in to CryptoPro Charts</h3>
    <p class="muted">Save your chart layouts to your own account and access them anywhere.</p>
    <div class="sso-list">${providerBtns}</div>
    <div class="modal-actions">
      <button id="ssoGuest">Continue as guest</button>
    </div>`, m => {
    m.querySelectorAll('.sso-btn').forEach(b =>
      b.addEventListener('click', () => { window.location.href = `/api/auth/${b.dataset.provider}/login`; }));
    m.querySelector('#ssoGuest').addEventListener('click', closeModal);
  });
}

function accountModal(me) {
  const u = me.user;
  const avatar = u.avatar
    ? `<img class="acct-modal-avatar" src="${esc(u.avatar)}" alt="">`
    : `<span class="acct-modal-avatar acct-avatar-fallback">${esc((u.name || '?').charAt(0).toUpperCase())}</span>`;
  showModal(`
    <h3>Account</h3>
    <div class="acct-card">
      ${avatar}
      <div class="acct-card-info">
        <div class="acct-card-name">${esc(u.name || 'Account')}</div>
        <div class="acct-card-email muted">${esc(u.email || '')}</div>
        <div class="acct-card-provider muted">via ${esc(u.provider)}</div>
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
  renderButton(me);
  document.getElementById('accountBtn')?.addEventListener('click', () => {
    if (currentUser) accountModal(me); else signInModal(me);
  });
  return me;
}
