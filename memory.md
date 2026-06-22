# CryptoPro Charts — Changelog

> Newest entry at the top. Each entry describes what changed, why, and how it was verified.

---

## v1.14.1 — 2026-06-22 · Fix: sloppy Settings exchange list; resizable dialog (Bugs #1)

### Bug — exchange rows misaligned (checkbox wrapping to next line)
**Problem:** The new "Exchanges to query" list in the Settings dialog looked sloppy — each row's checkbox, name and status stacked vertically instead of sitting on one line, and the 380px dialog was too narrow for the rows.

**Root cause:** Each exchange row (`.set-ex-row`) is a `<label>`, and the global `.modal label` rule forces `flex-direction: column`. `.set-ex-row` set `display:flex; align-items:center` but didn't override the inherited column direction, so the checkbox/name/status laid out as a column.

**Fix:**
- **`style.css`:** `.set-ex-row` now sets `flex-direction: row` (with `white-space: nowrap` on the name/status and a non-shrinking checkbox) so each exchange sits neatly on one line. Added a `.modal.modal-settings` shell — **480px wide**, `min-width/min-height`, **`resize: both`** with `overflow: auto` (native bottom-right size handle, clamped by the modal's existing `max-width:92vw`/`max-height:88vh`), laid out as a flex column so the exchange list (`flex:1; max-height:none`) grows to fill the dialog as it's resized.
- **`settings.js`:** The settings modal's `after` callback adds the `modal-settings` class to the modal element.

**Verification:** `node --check` on `settings.js`. Reviewed the cascade: `.modal label` (column) was the culprit; `.set-ex-row { flex-direction: row }` overrides it. Footer/readme → v1.14.1.

---

## v1.14.0 — 2026-06-22 · Multi-exchange watchlists (Roadmap)

### Feature — add symbols from multiple exchanges; per-symbol exchange
**Problem:** The roadmap asked to let the watchlist hold symbols from *multiple* exchanges at once. The old model had a single active exchange (`state.settings.exchange`) that every chart, price feed and order book keyed off — so a watchlist could only ever show one venue. The Settings exchange **selector** should be replaced with a **list** of exchanges to query, and the symbol-picker should gain an exchange **filter** (no filter selected = all enabled exchanges).

**Fix:**
- **`state.js`:** Added `settings.exchanges` (array of enabled exchange ids; the source of truth for the picker) while keeping `settings.exchange` as a legacy default/fallback. Added `allPairsKey` so the aggregated pair cache invalidates when the enabled set changes.
- **`data.js`:** New `defaultExchange()` / `enabledExchanges()` helpers. Threaded an explicit `exId` parameter (defaulting to `defaultExchange()`) through `fetchKlines`, `getCachedKlines` (cache key now `exId:symbol:tf`), `fetchPrice`, `fetchOrderBook`, `openKlineStream`, `openOrderBookStream` and `toExchangeSymbol`. `refreshMissingPrices` now takes `{symbol, exchange}` items — Binance-sourced symbols are batched in one ticker call; everything else is fetched per-item from its own exchange. **`fetchAllPairs` now aggregates across every enabled exchange**, tagging each pair with `exchange`, de-duping by `exchange:symbol`, and caching per enabled set.
- **`charts.js`:** Each `panel` now carries an `exchange`. `loadPanelData`, the kline WebSocket/REST-poll, the price-ownership pin and overlays all use `panel.exchange` (overlays carry their own `exchange`). `changeSymbol`/`selectWatchlistSymbol`/`addOverlaySymbol` take an `exchange`, and symbol identity for "already-charted" detection is now `symbol+exchange`.
- **`watchlist.js`:** Watchlist items now store `exchange`. The symbol picker gained a **multi-select exchange filter** (pills; none selected = all enabled exchanges, only shown when >1 exchange is enabled), an exchange badge per row, and passes the chosen exchange to `onPick`. Rows, removal, drag-reorder and the top search are keyed by `symbol+exchange`; a per-row exchange tag shows when a watchlist mixes venues.
- **`settings.js`:** Replaced the single `<select>` with a **checkbox list of exchanges** ("Exchanges to query"). `setExchanges()` saves the list, points the legacy `exchange` at the first enabled one, invalidates the pair cache and refreshes the WS label. No panel reloads — each chart keeps its own exchange.
- **`orderbook.js` / `scanner.js` / `main.js`:** Order book + Tech Info use `panel.exchange`; the scanner universe carries each symbol's exchange into `getCachedKlines` and the click-through; the missing-price poll passes `{symbol, exchange}`; chart-pin logic pins any charted non-Binance symbol.
- **`persistence.js`:** Persists/restores `panel.exchange` and overlay `exchange`; migrates legacy single-exchange sessions by deriving `settings.exchanges` from `settings.exchange`. Untagged watchlist items fall back to `defaultExchange()` at read time.
- **`ui.js`:** WS status label shows the exchange name when one is enabled, else "N exchanges" (title lists them).
- **`style.css`:** Styles for the picker exchange-filter pills, picker/search/watchlist exchange badges, and the Settings exchange checkbox list.

**Verification:** `node --check` passed on all 10 modified frontend modules. Local server serving `/` and `/js/data.js` returned 200. Reviewed the migration path: old sessions (no `exchanges`, untagged items/panels) resolve through `defaultExchange()` and the persistence migration, so they keep working unchanged. Footer → v1.14.0.

---

## v1.13.0 — 2026-06-22 · Add Bitvavo as a data source (Roadmap)

### Feature — Bitvavo exchange support
**Problem:** The roadmap asked to add Bitvavo (the EUR-focused Dutch exchange) as a selectable data source alongside Binance, Bybit, OKX, Gate, KuCoin, Bitstamp, CryptoCompare and Alpaca.

**Fix:**
- **`constants.js`:** Added a `bitvavo` entry to `EXCHANGES` (`rest: https://api.bitvavo.com/v2`, status `Full: REST + WebSocket (EUR)`). Intervals map `1m…1d` to Bitvavo's native values. Bitvavo has **no native weekly candle**, so `1w` is intentionally omitted — the server returns 400 for it and the client's Gate→Binance fallback chain serves weekly bars.
- **`server.js` (kline proxy):** `toExSymbol` maps app symbols to Bitvavo's `BASE-QUOTE` form, translating stable quotes (USDT/USDC) to **EUR** so the deep EUR book is used. `klineUrl` adds the `/{market}/candles?interval=&limit=` route (max 1440). `normalize` converts Bitvavo's `[time(ms),open,high,low,close,volume]` rows (newest-first) to ascending `{time(sec),…}` bars.
- **`data.js` (frontend):** Added Bitvavo to `toExchangeSymbol` (same EUR mapping), a direct `fetchKlines` branch, a `fetchPrice` branch (`/ticker/24h`), a `fetchExchangePairs` case (`/markets`, filters `status==='trading'` + supported quotes — 429 EUR pairs live), a `fetchOrderBook` branch (`/{market}/book`), and a live candle WebSocket `openBitvavoKlineStream` (`wss://ws.bitvavo.com/v2/`, `candles` channel) wired into `openKlineStream`.

**Verification:** `node --check` on `server.js`, `data.js`, `constants.js`. Probed live Bitvavo REST: candles, `ticker/24h`, `markets` (440 total / 429 EUR-trading), and order book all returned the expected shapes. Ran the local server and hit the proxy: `?exchange=bitvavo&symbol=BTCEUR&tf=1h` returned ascending bars, and `symbol=ETHUSDT` correctly mapped to `ETH-EUR` (≈€1553) — confirming the stable-quote→EUR mapping. Footer → v1.13.0.

---

## v1.12.0 — 2026-06-22 · Move persistence to Supabase (Postgres); retire blob/JSON storage (Roadmap)

### Feature — Database-backed accounts, sessions & layouts
**Problem:** The roadmap asked to replace the blob/JSON-file persistence with a Supabase (Postgres) database in Vercel, creating tables for user accounts and saved layouts. `.env` carries the Supabase credentials (`DBCRYPTOCHARTS_POSTGRES_*`, `DBCRYPTOCHARTS_SUPABASE_*`).

**Fix:**
- **Connectivity check first:** Tested both Postgres URLs with `pg`. They connect, but Supabase serves a cert outside Node's default trust store (`self-signed certificate in certificate chain`) and newer `pg` treats the connection-string `sslmode=require` as `verify-full`. Resolved by normalising the URL to `sslmode=no-verify` (TLS on, chain not verified) — both pooled and non-pooling connect and run queries.
- **`db.js` (new):** `pg.Pool` over the Supabase connection string (prefers `DBCRYPTOCHARTS_POSTGRES_URL_NON_POOLING`, then pooled, then generic `POSTGRES_URL`/`DATABASE_URL`). `init()` runs `create table if not exists` for **`accounts`** (id, username, display_name, salt, password_hash, timestamps), **`sessions`** (sid PK, uid FK→accounts ON DELETE CASCADE, expires_at, + index), and **`layouts`** (uid, name, `jsonb` data, updated_at, PK `(uid,name)`). Exports account CRUD, session CRUD (with expiry pruning), and layout CRUD (`getLayout`/`putLayout` upsert/`deleteLayout`/`listLayouts`). Autosave session-state is a layout row named `__session__`; anonymous users use the `GUEST` (`__guest__`) uid. Queries retry once on transient connection errors.
- **`auth.js` (rewritten):** Dropped all file/blob storage, `userPaths`, and the legacy-migration code. Accounts and sessions now go through `db.js`. Kept cookie handling and scrypt hashing. `register`/`login`/`logout` use DB; uniqueness check is a normal `getAccount` (DB is strongly consistent, so no cache workaround needed). Added `currentUid(req)` → signed-in account id or `GUEST`. Errors are logged and surfaced as 500s.
- **`server.js`:** `db.init()` runs before `app.listen()` (DB failure logged, non-fatal — kline proxy still serves and the frontend falls back to localStorage). The `/api/session` and `/api/layouts` endpoints now read/write the `layouts` table via `currentUid`, replacing the per-user files. `.env` loader comment updated to Supabase.
- **Removed:** `blob.js` and the `@vercel/blob` dependency. Added `pg`.
- **Frontend:** No change needed — `persistence.js` already calls these endpoints and keeps its localStorage fallback.

**Verification:** `node --check` on `db.js`/`auth.js`/`server.js`. Live run against the **real Supabase DB**: startup logged `[db] connected; tables ready`; then register → user, `/api/me` ok, duplicate → 409, wrong password → 401, session-state PUT/GET round-tripped the `jsonb`, named layout save/list/delete worked, and an anonymous **guest** session PUT/GET worked under the GUEST uid; logout cleared the session; no errors in the log. (A throwaway test account `dbu<ts>` remains in the dev DB — an unscoped cleanup DELETE was correctly blocked by the sandbox; it's harmless.) `.env` confirmed not committed. Footer/README/.env.example → v1.12.0.

---

## v1.11.1 — 2026-06-22 · Fix: "Could not create account — storage error" (blob unreachable)

### Bug — Account creation failed with a storage error (Bugs #1)
**Problem:** Registering returned `Could not create account — storage error, please retry.` — the register route's 500 catch-all. v1.11.0 made the Vercel Blob store the only account store, so if a blob call failed (store unreachable/suspended, expired token, rate limit, or — likely in a Capgemini corporate-proxy network — a slow/blocked outbound HTTPS request), registration hard-failed. The catch also **swallowed the real error**, so the cause was invisible. Reproduced the exact failure class by pointing the server at a bogus token: `Vercel Blob: This store does not exist.`

**Fix (resilience + observability):**
- **`auth.js` — local safety net:** The account store now treats blob as primary with a **local `data/accounts/` fallback**. Reads try blob first, then fall back to the local copy on any blob error; writes go to blob and, **if blob throws, save locally instead of failing**. So a transient blob/network outage can no longer block sign-in or account creation. Both fallbacks log a clear `[auth] blob read/write failed …` line.
- **`auth.js` — surface errors:** `register`/`login` catch blocks now `console.error(e.stack)` so the true cause is logged instead of hidden.
- **`blob.js` — retry + longer timeout:** Transient blob errors (`BlobServiceNotAvailable`, `BlobServiceRateLimited`, `BlobRequestAbortedError`, `BlobUnknownError`, generic network `TypeError`/`AbortError`) are retried up to 3× with backoff; permanent errors (auth/store-not-found/not-found) throw immediately. Abort timeout raised 12 s → 20 s for slow corporate proxies.

**Verification:** `node --check` on `blob.js`/`auth.js`. (A) With a **bogus token**, register now returns **200 via local fallback** (was the storage error), duplicate → 409, `/api/me` works, `data/accounts/fbk1.json` is written, and the log shows `blob write failed, saving locally: Vercel Blob: This store does not exist.` (B) With the **real token**, the normal blob path still works end-to-end (register/409/me) with no local files and no errors. Test users removed from the blob store. Footer/README → v1.11.1; bug moved out of `CLAUDE.md`.

---

## v1.11.0 — 2026-06-22 · Store account info in the Vercel Blob "Users/" folder (Roadmap)

### Feature — Per-user account JSON files in the blob store
**Problem:** The roadmap asked to write account information to the blob store as separate JSON files per user in a "Users" folder, using the credentials in `.env` (`BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID`). Previously all accounts (plus sessions) lived in one local `data/users.json`.

**Fix:**
- **`@vercel/blob` dependency** added (`npm install @vercel/blob`, v2.4.1).
- **`blob.js` (new):** Thin wrapper over the SDK gated on `BLOB_READ_WRITE_TOKEN`. `putAccount(uid, rec)` writes `Users/<uid>.json` with `access:'private'`, `addRandomSuffix:false`, `allowOverwrite:true`. `getAccount(uid, fresh)` reads it back via `get(pathname,{access:'private',useCache:!fresh})` and streams the body to JSON (returns null on `BlobNotFoundError`). `delAccount`/`listAccountUids` round out CRUD. Every call carries a 12 s `abortSignal` so a slow network can't hang an auth request.
- **`auth.js` (refactored storage):** Accounts now go through an account-store layer — **blob `Users/<uid>.json` when a token is set, else local `data/accounts/<uid>.json`** (named `accounts`, *not* `Users`, so it can't collide with the layout dir `data/users` on case-insensitive Windows/macOS filesystems). Sessions moved out of the account store into their own local `data/sessions.json` (ephemeral, not "account information", needs fast access). `currentUser`, `register`, `login`, `logout` rewritten against these stores; `register`'s uniqueness check uses an **uncached** read (`getAccount(uid, true)`) to avoid blob read-after-write staleness that would otherwise let a duplicate username overwrite an existing account. A one-time `migrateLegacyUsers()` copies any pre-existing `data/users.json` accounts into the new per-user store + sessions file, then renames the old file to `.migrated`.
- **`server.js`:** Added a tiny `.env` loader (no new dependency) that runs before anything reads `process.env`, so the blob token is available. Updated the init comment.
- **`.env.example` / `.gitignore`:** Documented the blob token vars; ignore `data/accounts/`, `data/sessions.json`, `data/users.json.migrated`.

**Verification:** `node --check` on `blob.js`/`auth.js`/`server.js`. Direct round-trip against the **real** blob store: put → get → list (found) → del → get(null) all OK. Full server auth flow against the live blob: register writes `Users/<uid>.json`, `/api/me` resolves the session→blob account, duplicate register now returns **409** (uncached check fixed the earlier 200), wrong password → 401, fresh login + logout OK, and no local account files are created (blob path) while `data/users/<uid>/` holds only layouts. Also verified the **local fallback** by temporarily removing `.env`: register/duplicate(409)/me work and `data/accounts/<uid>.json` is written; `.env` restored afterward. Test users were deleted from the blob store. Footer/README/.env.example → v1.11.0.

---

## v1.10.2 — 2026-06-22 · Fix: account creation stuck on "Creating account…" forever

### Bug — Register/login could hang the UI indefinitely (Bugs #1)
**Problem:** Entering a valid username/password and clicking "Create account" sometimes stuck on "Creating account…" forever. Root cause: the `/api/auth/register` and `/api/auth/login` route handlers were `async` with **no try/catch**, and they `await fs.writeFile`/`fs.mkdir`. The project lives in a **OneDrive-synced** folder ("OneDrive - Capgemini"), whose sync client intermittently locks files and makes those writes throw `EBUSY`/`EPERM`. An unhandled rejection in an Express 4 handler never sends a response (and on newer Node crashes the process) — so the client's `fetch` stayed pending and the spinner never resolved. Reproduced deterministically by replacing the `data/users` dir with a file to force `mkdir` to throw: the request returned no response and the server died on the unhandled rejection.

**Fix (defense in depth, three layers):**
- **`auth.js` — resilient writes:** Added `withRetry()` that retries transient FS errors (`EBUSY`/`EPERM`/`EACCES`/`ENOTEMPTY`) up to 5× with linear backoff; `writeStore()` now wraps both its `mkdir` and `writeFile` in it. This rides out OneDrive's brief file locks instead of failing on the first one.
- **`auth.js` — always respond:** Wrapped the `register`, `login`, and `logout` handler bodies in try/catch that returns `500 { error: '… storage error, please retry.' }` (logout still clears the cookie). The per-user `layouts` `mkdir` in register is now best-effort (its own try/catch) since that folder is also created lazily on first layout save — so a lock there can't fail registration.
- **`src/js/auth.js` — client timeout:** The auth `fetch` now uses an `AbortController` with a 15 s timeout; on abort it shows "Server did not respond — please try again." and re-enables the buttons. The UI can no longer spin forever regardless of server behaviour.

**Verification:** `node --check` passed on `auth.js` and `src/js/auth.js`. Live test: a normal register returns the user (200); after replacing `data/users` with a file to force the old failure, register now **completes with 200** (layouts mkdir is non-fatal) and, crucially, **the server stays alive** (`/api/me` for the earlier user still works) instead of crashing/hanging as before. Footer/README → v1.10.2; bug moved out of `CLAUDE.md`.

---

## v1.10.1 — 2026-06-22 · Fix: "Create account" button didn't create an account

### Bug — Sign-in dialog wouldn't progress on "Create account" (Bugs #1)
**Problem:** The auth dialog opened in *login* mode with a mode-toggle link labelled **"Create account"** sitting next to the primary **"Sign in"** button. Clicking "Create account" only re-rendered the dialog into register mode (and wiped any typed username/password) instead of creating the account — so a new user clicking the obvious "Create account" button never registered and then couldn't log in. The backend `/api/auth/register` route was fine (verified by curl); the defect was purely the confusing client toggle.

**Fix:**
- **`src/js/auth.js`:** Replaced the mode-toggle `authModal(mode)` with a single `signInModal()` that has **two explicit action buttons over one shared form** — `Create account` (→ `POST /api/auth/register`) and `Sign in` (→ `POST /api/auth/login`). Both read the same username/password fields, so the "Create account" button now always registers. Added an in-flight guard that disables both buttons and shows a "Creating account…/Signing in…" status, distinct error fallbacks per action, and Enter-to-sign-in. `initAuth` now calls `signInModal()`.
- **`public/css/style.css`:** Removed the now-unused `.auth-switch` link style; added `.modal-actions button:disabled` styling for the busy state.

**Verification:** `node --check src/js/auth.js` passed. Ran the server live: `POST /api/auth/register` for a new user returns the user + session cookie and `/api/me` then reports them; an invalid username (`"a b"`) returns 400. The dialog now exposes "Create account" as a real submit action rather than a form switch. Footer bumped to v1.10.1; bug moved out of `CLAUDE.md`.

---

## v1.10.0 — 2026-06-22 · Replace SSO with application-only username/password login (Roadmap)

### Change — Drop Google/GitHub OAuth; add built-in username + password accounts
**Problem:** The roadmap was revised to make login application-only: users sign in with a username and password handled entirely by the app, and the Google/GitHub SSO added in v1.9.0 should be removed. (OAuth also pulled in third-party redirect flows and a Windows-unsafe `provider:id` uid that contained a colon.)

**Fix:**
- **`auth.js` (server, rewritten):** Removed the OAuth2 provider definitions, authorize/callback routes, the `cpc_oauth_state` cookie, and `BASE_URL` handling. Added salted password hashing with Node's `crypto.scryptSync` (64-byte hash, 16-byte random salt) and constant-time verification via `timingSafeEqual`. New routes: `POST /api/auth/register` (validates username `^[a-zA-Z0-9_.-]{3,32}$` and password ≥ 6 chars, 409 on duplicate, auto-creates a session) and `POST /api/auth/login` (single generic "Invalid username or password" for both missing-user and bad-password). `GET /api/me` now returns just `{ user }` (no providers list); `POST /api/auth/logout` unchanged. Users are keyed by lowercased username, which is filesystem-safe and doubles as the per-user folder name, so `userPaths(uid)` → `data/users/<username>/{session.json,layouts/}`. **User context still persisted to `data/users.json`** (`{ users, sessions }`); each user record stores `salt` + `passwordHash`, never the plaintext. `currentUser`/`userPaths`/`init`/`installAuthRoutes` signatures unchanged, so `server.js` needed no edits.
- **`src/js/auth.js` (client, rewritten):** Replaced the provider-button modal with a single username/password form that toggles between **Sign in** and **Create account** (`#auSwitch`), POSTs to `/api/auth/{login,register}`, shows inline server errors, submits on Enter, and reloads on success to pull the user's saved layouts. Account modal now shows the username + Sign out.
- **`public/css/style.css`:** Removed the unused `.sso-*` styles; added `.auth-switch` (link-style toggle) and `.auth-err`. Kept the account avatar/card styling (now initials-only — no third-party avatars).
- **`.env.example`:** Stripped all OAuth variables; documents only optional `PORT` / `NODE_ENV`.
- **`public/index.html` + `readme.md`:** Footer/version → v1.10.0; docs describe application-only accounts.

**Verification:** `node --check` passed on `auth.js`, `src/js/auth.js`, `server.js`. Ran the server live and exercised the full flow with curl: anon `/api/me` → `{user:null}`; register `alice` sets a session cookie and `/api/me` returns her; duplicate register → 409; saving a session then logging in fresh restored **alice's own** session (per-user storage confirmed); wrong password → 401; short password → 400; logout clears the session. Cleaned up the `data/users*` test artifacts afterward. README, `.env.example`, footer, and this changelog updated to v1.10.0.

---

## v1.9.0 — 2026-06-22 · Multi-user accounts with Google/GitHub SSO (Roadmap item #1, superseded by v1.10.0)

### Feature — Multi-user + SSO, per-user layout storage in backend JSON
**Problem:** The roadmap asked to make CryptoPro Charts multi-user with SSO (Google/GitHub), saving layouts under the user context, with the user context stored in a JSON file in the backend. Until now sessions and named layouts were global single-user files (`data/session.json`, `data/layouts/`), shared by anyone hitting the server.

**Fix:**
- **`auth.js` (new, server):** Self-contained auth with no new dependencies — built on Node's `fetch` + `crypto`. Implements the OAuth2 authorization-code flow for Google (`accounts.google.com` → `oauth2.googleapis.com/token` → `oauth2/v3/userinfo`) and GitHub (`github.com/login/oauth` → `api.github.com/user` + `/user/emails` for the primary verified email). Opaque session tokens (`crypto.randomBytes`) are stored server-side; a CSRF `state` is round-tripped in a short-lived `cpc_oauth_state` cookie and verified on callback. Sessions live in a 30-day `cpc_session` HttpOnly/SameSite=Lax cookie (Secure when `NODE_ENV=production`). The **user context is persisted to `data/users.json`** (`{ users, sessions }`, pretty-printed). Exposes `init(dataDir)`, `installAuthRoutes(app)`, `currentUser(req)`, and `userPaths(uid)`. Providers are gated on env credentials, so unconfigured providers return 404 and don't appear in the UI. Routes: `GET /api/me`, `GET /api/auth/:provider/login`, `GET /api/auth/:provider/callback`, `POST /api/auth/logout`.
- **`server.js`:** Imported and initialised auth (`initAuth(data)`, `installAuthRoutes(app)`). Replaced the global `SESSION_FILE`/`LAYOUTS_DIR` constants with `pathsFor(req)`, which calls `currentUser(req)` and resolves storage via `userPaths`: a signed-in user gets `data/users/<uid>/{session.json,layouts/}`; an anonymous guest reuses the legacy `data/session.json` + `data/layouts/` so **all pre-existing layouts keep working untouched**. All four session/layout endpoints now create the per-user dir on write (`mkdir(dirname(...))`).
- **`src/js/auth.js` (new, client):** `initAuth()` fetches `/api/me`, renders the top-bar account button (avatar/name when signed in, "👤 Sign in" otherwise), and wires a sign-in modal (one "Continue with …" button per configured provider, plus "Continue as guest") and an account modal (profile card + "Sign out" → `POST /api/auth/logout` + reload). Since layout data is already user-scoped by the cookie server-side, sign-in/out is just a (re)load.
- **`src/js/main.js`:** `await initAuth()` runs before `loadAutosave()` so the restored session/layouts belong to the signed-in user.
- **`public/index.html`:** Added `#accountBtn` to the top bar; footer bumped to v1.9.0.
- **`public/css/style.css`:** Added `.acct-*` / `.sso-*` styles (avatar pills, provider buttons, account card) using existing theme variables.
- **`.env.example` (new):** Documents `BASE_URL`, `NODE_ENV`, and the Google/GitHub client ID/secret pairs. **`.gitignore`:** ignores `data/users/`, `data/users.json`, `.env`.

**Verification:** `node --check` passed on `auth.js`, `server.js`, `src/js/auth.js`, `src/js/main.js`. Ran the server live (after `npm install`): with no env, `GET /api/me` → `{"user":null,"providers":[]}`, `/api/auth/google/login` → 404, and a guest session PUT/GET round-tripped correctly via the legacy file. With `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` set, `/api/me` listed the Google provider and `/api/auth/google/login` returned a 302 to the correct Google authorize URL with the right `redirect_uri`, `scope`, `state`, and a matching `cpc_oauth_state` cookie. The token-exchange + profile callback path requires real OAuth credentials to exercise end-to-end. README, `.env.example`, footer, and this changelog updated to v1.9.0.

---

## v1.8.1 — 2026-06-19 · Fix stale price axis & watchlist mismatch on no-WebSocket exchanges

### Bug — Price axis frozen and chart price ≠ watchlist price (Bugs #1)
**Problem:** After adding Alpaca (v1.8.0), the vertical price axis showed stale values and the chart's price didn't match the watchlist. Two root causes, both exposed (not caused) by Alpaca:
1. **Frozen chart.** `openKlineStream()` only wires a live WebSocket for Binance and Bybit; for every other exchange (OKX, Gate, KuCoin, Bitstamp, CryptoCompare, Alpaca, Hyperliquid) it returns `null`, so the chart never updated after the initial REST load — the last candle (and the price axis) sat frozen until a manual reload. Alpaca made this obvious because its USD feed visibly diverges from the still-live (Binance-sourced) watchlist.
2. **Watchlist always Binance.** The watchlist/live-price stream (`openPriceStream`) is hardwired to Binance's `!miniTicker` feed for *all* symbols, so a chart on any other exchange could never agree with the watchlist row for the same symbol.

**Fix:**
- `src/js/charts.js`: Extracted the kline `onCandle` handler in `startKlineStream()` and added `startKlinePoll()` — a REST polling fallback that runs only when no WebSocket is available. It refreshes the latest bar (`fetchKlines(symbol, tf, 2)`) at ~4×/candle, clamped to 5–60 s, skips polling while the tab is hidden, and fires once immediately so the chart aligns without waiting a full period. The server-side cache coalesces these polls into real upstream hits at the per-timeframe TTL, so traffic stays light. The handler now also writes the charted symbol's price into `state.prices` when the active exchange isn't Binance, so its watchlist row tracks the chart. `destroyPanel()` clears `_klinePoll`.
- `src/js/main.js`: Added `isChartPinned()` — when a non-Binance exchange is active, the Binance mini-ticker callback skips any symbol currently shown on a chart, so it can't clobber the chart-owned price. Other watchlist rows still use the Binance overview.
- `src/js/data.js`: `fetchPrice()` for Alpaca now returns `high`/`low` from the daily bar (previously omitted), fixing the Tech Info panel's Day's-Range gauge.

**Verification:** `node --check` passed on `charts.js`, `main.js`, `data.js`. Confirmed via live Node tests that Alpaca `snapshots` parses to a full `{price,open,high,low,change,volume}` and `fetchKlines(...,2)` returns the latest bar for the poll. Traced the flow: no-WS exchange → `startKlinePoll` ticks immediately + on interval → `onCandle` updates the candle/volume series and (non-Binance) `state.prices[symbol]`, while `isChartPinned` stops the Binance stream from overwriting it. Benefits all REST-only exchanges, not just Alpaca. Footer and README bumped to `v1.8.1`.

---

## v1.8.0 — 2026-06-19 · Add Alpaca as an exchange

### Feature — Alpaca US crypto data source (Roadmap item #1)
**Problem:** The roadmap asked to add Alpaca as a selectable exchange. Alpaca's `v1beta3/crypto/us` market-data endpoints serve OHLCV bars and snapshots for US crypto pairs and — verified by testing — require **no API key** and return `Access-Control-Allow-Origin: *`, so they work both through the server proxy and via direct browser fetch.

**Fix:**
- `src/js/constants.js`: Added an `alpaca` entry to `EXCHANGES` (`rest: https://data.alpaca.markets/v1beta3/crypto/us`, status "REST only (US crypto, USD-quoted)") with the Alpaca timeframe map (`1Min/5Min/15Min/30Min/1Hour/4Hour/1Day/1Week`). The settings dropdown is built from `EXCHANGES`, so Alpaca now appears automatically.
- `server.js`: Imported `TF_SECONDS`; added Alpaca cases to `toExSymbol` (`BASE/QUOTE`, mapping `USDT`/`USDC` → `USD` to hit the real-volume USD feed instead of a thin derived book), `klineUrl` (the `bars` endpoint with an explicit `start` anchored `(limit+5)*tfSeconds` back — without `start` Alpaca only returns the latest narrow window), and `normalize` (unwraps `{ bars: { "BTC/USD": [{t,o,h,l,c,v}] } }`).
- `src/js/data.js`: Imported `TF_SECONDS`; added Alpaca to `toExchangeSymbol`, a direct-fetch branch in `fetchKlines` (same `start` logic, for the `file://`/no-proxy path), an Alpaca branch in `fetchPrice` using the `snapshots` endpoint (`latestTrade.p`, `dailyBar.o/v`), and routed `fetchExchangePairs` to reuse Binance's pair list (Alpaca has no free unauthenticated symbol-list endpoint — same approach as CryptoCompare). Symbols Alpaca doesn't list degrade gracefully through the existing Gate.io→Binance kline fallback chain.

**Notes / limitations:** No Alpaca kline WebSocket is wired (returns `null`, same as OKX/Gate), so live updates poll via REST. Weekly/daily bars rely on the `start` anchor since Alpaca's default lookback is short.

**Verification:** `node --check` passed on `server.js`, `constants.js`, `data.js`. Confirmed the live endpoints via curl (bars at 1Hour/4Hour/1Day/1Week, snapshots, CORS `*`) and ran a standalone Node integration test replicating the server's URL build + fetch + normalize for `BTCUSDT @ 1h` → 5 correctly-shaped bars. Footer and README bumped to `v1.8.0`.

---

## v1.7.0 — 2026-06-19 · Quote-currency filter in the symbol picker

### Feature — Filter symbols by quote/stablecoin (Roadmap item #1)
**Problem:** The symbol picker listed every tradeable pair regardless of quote currency. The roadmap asked for a way to narrow the list to a single quote stablecoin/currency — pick USDC and see only `*/USDC` pairs, pick USDT → only USDT pairs, USD → only USD pairs. (v1.6.0's "Hide stablecoins" toggle is unrelated: it drops stable/stable pairs by *base* asset; this is a *quote*-side filter.)

**Fix:**
- `src/js/watchlist.js`: Added a module-level `_quoteFilter` (defaults `'all'`, persists across dialog opens) and a `QUOTE_FILTER_ORDER = ['USDT','USDC','USD','EUR']` preference list. `showSymbolPicker()` now renders a row of quote pills (`#spQuoteFilter`) built from the quotes that actually appear in the active exchange's pair list (`availableQuotes`), so exchanges with different quote sets only show valid options. A stale `_quoteFilter` not available on the current exchange falls back to `'all'`. The render filters exchange pairs by `pairQuote(p)` (prefers exchange-supplied `p.quote`, falls back to `quoteAsset(p.symbol)`), and suppresses the CoinGecko discovery rows (always `*/USDT`) when a non-USDT quote is selected. Clicking a pill resets paging, re-highlights, and re-renders. Works alongside the existing "Hide stablecoins" toggle.
- `public/css/style.css`: Added `.sp-quote-filter` / `.sp-quote-pill` styling — rounded pill buttons with an accent-filled active state, matching the picker's visual language across all themes.

**Verification:** `node --check src/js/watchlist.js` passed. Traced the render path: with `_quoteFilter='USDC'` the exchange list keeps only pairs whose `quote==='USDC'`, the CoinGecko section is hidden, and the count line reflects the filtered total. Confirmed the available-quotes guard prevents an empty list when switching exchanges. Footer and README bumped to `v1.7.0`.

---

## v1.6.0 — 2026-06-19 · Stablecoin filter + focus existing chart on symbol select

### Feature 1 — "Hide stablecoins" filter in the symbol picker (Roadmap)
**Problem:** The Add-symbol dialog (and overlay picker) listed every tradeable pair, including stable/stable pairs (USDCUSDT, DAIUSDT, FDUSDUSDT, …) that are rarely charted and just clutter the list.

**Fix:**
- `src/js/constants.js`: Added a `STABLECOINS` `Set` of stablecoin base-asset tickers (USDT, USDC, BUSD, DAI, TUSD, USDP, FDUSD, USDD, FRAX, LUSD, PYUSD, …) and exported it.
- `src/js/watchlist.js`: `showSymbolPicker()` now renders a "Hide stablecoins" checkbox above the list, defaulting on via a module-level `_hideStables` flag that persists across dialog opens in a session. The render filters out exchange pairs whose `baseAsset()` is in `STABLECOINS` and also drops matching CoinGecko discovery rows. Toggling the checkbox re-renders immediately and the empty-state check uses the filtered CG list.
- `public/css/style.css`: Added `.sp-stable-toggle` styling for the checkbox row (accent-colored control, muted label).

### Feature 2 — Focus existing chart instead of duplicating a symbol (Roadmap)
**Problem:** Selecting a watchlist symbol always loaded it onto the active chart, even when another open panel was already charting that exact symbol — producing two panes on the same symbol.

**Fix:**
- `src/js/charts.js`: Added `selectWatchlistSymbol(symbol, name)`. If the active chart already shows the symbol it no-ops; if a *different* open panel shows it, that panel is focused via `setActivePanel()`; otherwise the symbol loads into the active chart via `changeSymbol()`.
- `src/js/watchlist.js`: Both selection paths — the watchlist row click and the top search-result click — now call `selectWatchlistSymbol()` instead of `changeSymbol()` directly. Removed the now-unused `changeSymbol` import.

**Verification:** `node --check` passed on `src/js/watchlist.js`, `src/js/charts.js`, and `src/js/constants.js`. Traced both selection paths and confirmed the existing `active-symbol-changed` highlight (v1.5.5) still updates when an existing chart is focused, since `setActivePanel()` dispatches that event. Footer and README bumped to `v1.6.0`.

---

## v1.5.5 — 2026-06-18 · Highlight watchlist symbol for the selected chart

### Feature — Highlight active chart's symbol in the watchlist (Roadmap)
**Problem:** Nothing in the watchlist indicated which symbol was loaded on the currently selected chart panel. With multiple panels open it was hard to correlate the active chart with its entry in the symbol list.

**Fix:**
- `src/js/watchlist.js`: `renderSymbolList()` reads `state.activePanel?.symbol` and adds an `active` class to the matching `.sym-row`. Added a listener on the `active-symbol-changed` event that re-renders the list, so the highlight follows both panel-selection changes and symbol swaps on the active panel.
- `public/css/style.css`: Added `.sym-row.active` styling — an accent-tinted background (`color-mix` with `--accent`) plus a 3px inset left bar in the accent colour, with a stronger tint on hover so the highlight reads in every theme.
- The required event already existed: `setActivePanel()` dispatches `active-symbol-changed` on selection, and `changeSymbol()` dispatches it when the active panel's symbol changes (`src/js/charts.js:385,393`). No new wiring needed.

**Verification:** `node --check` passed on `src/js/watchlist.js` and `src/js/charts.js`. Confirmed the highlight covers both trigger paths (panel select + symbol swap) by tracing the two dispatch sites. Footer and README bumped to `v1.5.5`.

---

## v1.5.4 — 2026-06-18 · Remove text labels from SMA crossing markers

### Feature — Strip text from MA crossing markers (Roadmap)
**Problem:** The golden/death cross markers drawn by `rebuildCrossMarkers()` carried a text label (e.g. `↑ SMA50/SMA200`) on every crossing arrow. On busy charts with multiple MA pairs the labels stacked up and cluttered the price axis, obscuring candles.

**Fix:**
- `src/js/charts.js`: Removed the `text` property from the marker object pushed in `rebuildCrossMarkers()`. Markers now render as bare up/down arrows (`arrowUp`/`arrowDown`) coloured with the up/down settings colours, positioned below/above the bar. Direction and bull/bear meaning are still conveyed by the arrow shape, position, and colour.

**Verification:** `node --check src/js/charts.js` passed. Confirmed the only remaining `text:` usage for cross markers was the removed line; event/LuxAlgo markers are unaffected (separate code paths in `applyPanelMarkers`).

---

## v1.5.3 — 2026-06-18 · Active indicators moved to top nav bar

### Feature — Relocate active-indicator chips from left panel to top nav (Roadmap)
**Problem:** The active-indicator chips lived in a dedicated 230px left sidebar (`#leftPanel`) that did nothing else, wasting horizontal chart space. Roadmap called for moving the selected indicators into the top navigation bar.

**Fix:**
- `public/index.html`: Removed the `#leftPanel` `<aside>` (and its "Active on chart" `.panel-head`). Moved `#indChips` into the top bar as a `.topbar-chips` flex item placed right after the Indicators button, so the chips sit beside the picker that creates them. Footer bumped to `v1.5.3`.
- `public/css/style.css`: Replaced the vertical `.ind-chips` panel rule with a horizontal `.topbar-chips` rule — single row, `flex: 0 1 auto`, `max-width: 42vw`, horizontal scroll with a thin styled scrollbar. `.ind-chip` now `flex: none; white-space: nowrap` so chips keep their size and scroll instead of wrapping. Removed the now-dead `.left-panel`, `.left-panel.collapsed`, and `.panel-head` rules, plus the left-panel responsive override (replaced with a `.topbar-chips { max-width: 30vw }` rule under 900px).
- No JS change needed — `renderIndChips()` still targets `#indChips`, which simply lives in a new parent.

**Verification:** Confirmed no remaining references to `leftPanel`/`left-panel`/`panel-head`/`ind-chips` anywhere in the repo (grep). The chart area now reclaims the full former sidebar width.

---

## v1.5.2 — 2026-06-15 · Drawing toolbar icon size +25%

### Feature — Larger drawing toolbar icons (Roadmap 1)
- `src/js/ui.js`: `_I()` helper changed from `width="15" height="15"` to `width="19" height="19"` (viewBox stays `0 0 16 16`). All 13 drawing tool icons and the 3 action button icons are now 26% larger with no path changes.
- `public/css/style.css`: `.draw-tool` button: `32×32` → `40×40`. `.draw-toolbar` width: `44px` → `55px`. Color picker `#drawColor`: `28×28` → `35×35`.
- `public/index.html`: Footer bumped to `v1.5.2`.

**Verification:** `node --check` passed on `src/js/ui.js`.

---

## v1.5.1 — 2026-06-15 · Bug fix: future event markers at wrong date

### Bug fix — Future event markers snapping to last candle
**Problem:** `applyEventMarkers` added future event markers to `panel._eventMarkers` alongside past markers, all applied via `panel.candleSeries.setMarkers()`. LightweightCharts requires every marker time to have a matching data point in the series; since future candles don't exist yet, LWC silently snapped those markers to the last existing bar — so a 17-06-2026 event appeared on the 15-06-2026 candle.

**Fix (`src/js/events.js`):**
- Past event markers continue to go on `panel._eventMarkers` → `candleSeries.setMarkers()` (unchanged).
- Future events are now collected in a separate `futureByTime` map, then rendered on a hidden `LineSeries` (`panel._futureEvtSeries`) created with `color: 'rgba(0,0,0,0)'`, `lineWidth: 0`, `priceLineVisible/lastValueVisible/crosshairMarkerVisible: false`, sharing the `right` price scale. Each data point uses the last candle's close price so it stays within the visible price range. Markers are set on that series — LWC places them at the correct future dates.
- `_removeFutureEvtSeries(panel)` helper cleans up the hidden series; called at the start of every `applyEventMarkers` call and in `setEventMarkersVisible(false)`.
- Click-to-detail still works: `futureByTime` entries are merged into the combined `byTime` map used by `wireEventClick`.

- `public/index.html`: Footer bumped to `v1.5.1`.

**Verification:** `node --check src/js/events.js` passed.

---

## v1.5.0 — 2026-06-15 · Lux Trend indicator + Bitstamp + CryptoCompare + CoinGecko watchlist

### Feature — Lux Trend Signals indicator (Roadmap 1)
- `src/js/constants.js`: Added `luxalgo` to `INDICATORS_DEF` (EMA period 14, ATR period 14, ATR mult 1.5) and `INDICATOR_DESC`.
- `src/js/indicators.js`: Added `luxalgo` case to `calcOverlay`. Returns an EMA line, upper/lower ATR bands (dashed), and a `{signals}` entry listing buy/sell crossings. Buy fires when `close > upper`, sell fires when `close < lower`.
- `src/js/charts.js` `buildIndicator`: Added `r.signals` branch — populates `panel._luxAlgoMarkers` with LWC marker objects (arrowUp/arrowDown, green/red) and calls `applyPanelMarkers`.
- `src/js/charts.js` `applyPanelMarkers`: Now merges `_luxAlgoMarkers` alongside `_crossMarkers` and `_eventMarkers`.
- `src/js/charts.js` `removeIndicator`: Clears `_luxAlgoMarkers` and re-applies markers when luxalgo is removed.
- `src/js/charts.js` `recomputeIndicators`: Resets `_luxAlgoMarkers = []` before rebuilding indicators.

### Feature — Bitstamp data source (Roadmap 2)
- `src/js/constants.js`: Added `bitstamp` to `EXCHANGES` (REST `https://www.bitstamp.net/api/v2`, interval map uses step values `60`…`604800`).
- `src/js/utils.js`: Added `USD` to `baseAsset`/`quoteAsset` regex — needed so Bitstamp's USD pairs (e.g. `BTCUSD`) parse correctly without stripping too much.
- `src/js/data.js`: `SUPPORTED_QUOTES` now includes `'USD'`. `toExchangeSymbol` maps `bitstamp` → lowercase concat (e.g. `BTCUSD → btcusd`). `fetchKlines`, `fetchPrice`, `fetchExchangePairs` all handle `bitstamp`.
- `server.js`: `toExSymbol`, `klineUrl`, `normalize` handle `bitstamp` (`/ohlcdata/{inst}/?step={step}&limit={n}` + `{data:{ohlc:[...]}}` response).

### Feature — CryptoCompare data source (Roadmap 2)
- `src/js/constants.js`: Added `cryptocompare` to `EXCHANGES` (REST `https://min-api.cryptocompare.com/data/v2`, interval map encodes endpoint + aggregate as `histohour|4`).
- `src/js/data.js`: `toExchangeSymbol` maps `cryptocompare` → `BASE_QUOTE`. `fetchKlines`, `fetchPrice`, `fetchExchangePairs` all handle `cryptocompare`. Pair list uses Binance pairs (CryptoCompare covers all major assets via their aggregated feed). Direct `histominute`/`histohour`/`histoday` endpoints with optional `&aggregate=N`.
- `server.js`: `klineUrl` parses the `endpoint|aggregate` interval string and constructs the CryptoCompare URL. `normalize` reads `Data.Data` array.

### Feature — CoinGecko multi-source watchlist search (Roadmap 3)
- `src/js/data.js`: Added `searchCoinGecko(query)` — calls `/api/v3/search`, returns up to 8 coin matches with id, name, symbol, thumb.
- `src/js/watchlist.js`: `handleSearch` now appends a "CoinGecko" section below exchange results after a 400 ms debounce. Clicking a CoinGecko result adds `{SYMBOL}USDT` to the watchlist. `showSymbolPicker` also queries CoinGecko when the search term yields no exchange matches, showing coins with a purple "CG" badge.
- `public/css/style.css`: Added `.cg-badge`, `.search-sep`, `.search-res-cg` styles.

### Misc
- `public/index.html`: Footer bumped to `v1.5.0`.

**Verification:** `node --check` passed on all modified JS files and server.js.

---

## v1.4.0 — 2026-06-15 · Bug fixes + KuCoin datasource

### Bug fix — Volume profile not showing on charts
**Problem:** `.vol-profile-layer` had no `z-index`, so its SVG could paint behind LightweightCharts' internal canvas. Also, `layer.clientHeight` was used for bar sizing instead of `.main-chart-div` height, causing y-coordinate misalignment when oscillator panes were open.  
**Fix:**
- `public/css/style.css`: Added `z-index: 4` to `.vol-profile-layer` (above LWC canvas, below drawing layer at 8).
- `src/js/charts.js` `renderVolProfile`: Uses `chartDiv.clientHeight` for SVG height and bar sizing. Added `requestAnimationFrame` retry when dimensions are 0. Added `y < 0 || y > h` out-of-range guard.

### Bug fix — Price data missing for non-Binance USDC pairs (e.g. BRETTUSDC)
**Problem:** `state.prices` was populated only by the Binance mini-ticker WebSocket. Symbols not listed on Binance (e.g. Gate.io-only USDC pairs) never received price data; watchlist rows showed "--".  
**Fix:**
- `src/js/data.js` `fetchPrice`: Extended to handle Bybit (`/v5/market/tickers`), Gate.io (`/spot/tickers`), and KuCoin (`/market/stats`) natively, with Binance as final fallback.
- `src/js/data.js`: Added exported `refreshMissingPrices(symbols)` — batch-fetches Binance ticker for all symbols in one request; individually fetches remaining via `fetchPrice()` from the active exchange.
- `src/js/main.js`: Imported `refreshMissingPrices`. Added `startPriceStream._missingTimer` — first call after 2 s, then every 30 s for current watchlist symbols.

### Bug fix — Event markers snapping to wrong bar date
**Problem:** `nearestBarTime(panel.data, e.ts)` picked the chronologically *closest* bar. An event at 22:00 on Day 1 is only 2 h from Day 2's midnight bar and would snap there on a daily chart.  
**Fix:**
- `src/js/events.js` `applyEventMarkers`: Changed past-event snapping to `nearestBarTime(panel.data, Math.floor(e.ts / tfSec) * tfSec)`. Flooring to the candle-period start first guarantees the search targets the bar that *contains* the event.

### Feature — KuCoin as a data source + smart fallback chain
- `src/js/constants.js`: Added `kucoin` to `EXCHANGES` (REST `https://api.kucoin.com/api/v1`, REST-only, interval names `1min` … `1week`). KuCoin appears in Settings → Exchange automatically.
- `src/js/data.js`: `toExchangeSymbol` adds `kucoin → ${base}-${quote}`. `fetchExchangePairs` adds KuCoin via `/api/v1/symbols`. `fetchKlines` adds KuCoin (proxied through server to avoid CORS). Hardcoded Binance fallback replaced with ordered chain: **active exchange → Gate.io → Binance**.
- `server.js`: `toExSymbol`, `klineUrl`, and `normalize` all handle KuCoin's `[time, open, close, high, low, vol, turnover]` newest-first format.

### Misc
- `public/index.html`: Footer now shows `v1.4.0`.
- `public/css/style.css`: Added `.footer-version` (10 px, 50% opacity).
- `README.md`: Created with feature overview, exchange table, tech stack, and project structure.

**Verification:** `node --check` passed on all modified JS files and server.js.

---

## v1.3.0 — 2026-06-15 · Full pair names in watchlist + footer + SVG toolbar icons

### Full pair names in symbol list (BTCUSDT / ETHEUR / ADAUSDC)
- `src/js/watchlist.js`: `renderSymbolList` now shows `baseAsset` + `<span class="sym-quote-tag">quoteAsset</span>` so the quote currency (USDT / USDC / EUR) is always visible. Symbol picker and search dropdown also show the correct quote instead of hardcoded "USDT".
- `public/css/style.css`: Added `.sym-quote-tag` (10 px, muted, normal weight).

### Footer bar
- `public/index.html`: Added `<footer class="app-footer">` — logo, description, "Created by Erik Kuipers", © 2026.
- `public/css/style.css`: Added `.app-footer` (30 px, flex, panel bg, top border) with responsive rule hiding the description on narrow screens.

### SVG drawing toolbar icons
- `src/js/ui.js`: Replaced all Unicode placeholder characters in `DRAW_TOOLS` with purpose-built 15×15 inline SVG icons (stroke-based, `currentColor`). Added `_I()` helper and `_S` stroke-attribute constant. All 13 tools and 3 action buttons (export/import/clear) have clean SVG paths. Changed `b.textContent` → `b.innerHTML` so SVG renders correctly.
- `public/css/style.css`: Updated `.draw-tool` — removed `font-size: 15px`, added `svg { display:block }`, default colour set to `var(--muted)`.

**Verification:** `node --check` passed on modified files.

---

## v1.2.0 — 2026-06-15 · Fancy buttons, tech info pane, multi-quote, layout dropdown

### Fancy button transitions
- `public/css/style.css`: Added CSS transitions on `.tb-btn`, `.sym-btn`, `.tf-btn`, `.ts-btn`, `.panel-act`, `.draw-tool`, `.wl-footer button`, `.primary-btn`, `.right-tab`. Timeframe buttons use a pill container. Right-panel tabs get an animated underline via `::after`.

### Enhanced Tech Info pane
- `src/js/orderbook.js`: Added `calcRSI14` (Wilder's 14-period RSI), `perfPill` (coloured % badge), `rangeGaugeSvg` (horizontal gauge with thumb), `rsiSpeedometerSvg` (SVG semi-circle with 3 colour zones and needle), `seasonalsChartSvg` (SVG bar chart of average monthly returns). `refreshTechInfo` now fetches price and 1d klines in parallel and renders: performance pills (7D/1M/1Y), OHLV grid, Day's Range gauge, 52-Week Range gauge, RSI speedometer, seasonals chart.
- `public/css/style.css`: Added all `.ti-*` styles.

### Multi-quote symbol support (USDT / USDC / EUR)
- `src/js/utils.js`: Extended `baseAsset` regex to strip EUR/BTC/ETH/BNB/DAI. Added `quoteAsset(symbol)` returning the quote currency (defaults to USDT).
- `src/js/data.js`: Added `SUPPORTED_QUOTES = ['USDT','USDC','EUR']`. `toExchangeSymbol`, `fetchBinancePairs`, `fetchExchangePairs`, and the price stream filter all respect the supported quotes.
- `src/js/charts.js`, `src/js/persistence.js`: Panel symbol button now shows `quoteAsset(symbol)` instead of hardcoded "USDT".
- `server.js`: `toExSymbol` parses the real quote from the symbol string before building OKX/Gate URLs.

### Layout selector dropdown
- `public/index.html`: Replaced the four preset layout buttons with `#layoutDropWrap > #layoutDropBtn + #layoutDropMenu`.
- `src/js/ui.js`: Added `LAYOUT_NAMES`, `LAYOUT_ICONS`, `updateLayoutDropBtn()`, `openLayoutDropdown()` (async, loads saved + preset layouts), `closeLayoutDropdown()`.
- `src/js/main.js`: `layout-restored` event calls `updateLayoutDropBtn()`.
- `public/css/style.css`: Added `.layout-drop-*` and `.ld-*` styles.

**Verification:** `node --check` passed on all 8 modified JS files and server.js.

---

## v1.1.0 — 2026-06-15 · Events on charts, indicators dropdown, session persistence

### Rename to "CryptoPro Charts"
- `public/index.html`, `server.js`, `src/js/main.js`: Updated title, logo, and log messages from "Crypto Charting Pro".

### Event markers on charts (click-to-detail + 2-week future window)
- `src/js/events.js`: `applyEventMarkers` maps high-impact events to chart bars using `position: 'belowBar'`. Past events show a clickable red dot; future events (up to 14 days) show a blue dot with a short date label projected onto the time grid. `setEventMarkersVisible(visible)` exported for the toggle button.
- `src/js/constants.js`: Added `TF_SECONDS` export.
- Event markers toggle button (`#evtMarkersBtn`) added to topbar.

### Indicators as multi-select dropdown
- Removed indicators list from left panel; left panel now shows only "Active on chart" chips.
- New `#indDropBtn` in topbar opens `#indDropdown` (floating, stays open for multi-add, click-outside closes).
- Bug fix: `open-indicators` event now correctly calls `openIndDropdown()`.

### Indicator hover descriptions
- `src/js/constants.js`: Added `INDICATOR_DESC` map (one-line plain-language description per indicator).
- `src/js/ui.js`: `mouseenter/mouseleave` on each indicator item shows a custom floating tooltip with the description.

### Dynamic price axis decimals
- `src/js/charts.js`: Added `dynamicPriceFormat(price)` — returns `{precision, minMove}` scaled to price magnitude (8 dp for SHIB, 0 dp for BTC). Applied after `candleSeries.setData()`.

### Candle countdown timer
- `src/js/charts.js`: `.candle-timer` span added to each panel bar. Module-level `setInterval` (1 s) computes remaining seconds until next candle boundary and renders `m:ss` / `h:mm:ss`.

### Toggle event markers visibility
- `src/js/state.js`: Added `showEventMarkers = true`.
- `src/js/events.js`: `setEventMarkersVisible(visible)` clears or re-applies markers on all panels.

### Connected exchange name in status bar
- `public/index.html`: Added `#wsExchange` label next to the WebSocket status dot.
- `src/js/ui.js`: `updateWSStatus()` sets the exchange name from `EXCHANGES[state.settings.exchange].name`.

### Backend session & layout persistence
- `server.js`: Added `GET/PUT /api/session` and `GET/PUT/DELETE /api/layouts/:name`. Name validation prevents path traversal.
- `src/js/persistence.js`: `autosave` now PUTs `/api/session`; `loadAutosave` GETs it first; named layouts use the server API. All fall back to `localStorage` if the server is unavailable.
- `.gitignore`: Added `data/session.json` and `data/layouts/` (runtime user data).

### Server-side kline cache
- `server.js`: `GET /api/klines` fetches from the active exchange, normalises to `[{time,open,high,low,close,volume}]`, and caches to `cache/klines/<exchange>_<symbol>_<tf>_<limit>.json` with per-TF TTLs (30 s for 1 m … 15 min for 1 w). Serves stale cache on upstream failure. Input validation prevents SSRF.
- `src/js/data.js`: `fetchKlines` tries `/api/klines` first, falls back to direct exchange fetch.
- `.gitignore`: Added `cache/*`.

### Multi-exchange pair lists
- `src/js/data.js`: `fetchAllPairs` branches per exchange — Binance `exchangeInfo`, Bybit `instruments-info`, OKX `public/instruments`, Gate.io `currency_pairs`. Falls back to Binance on error. Results paged 100 at a time in the symbol picker.

### EMA/SMA crossing markers (golden / death cross)
- `src/js/charts.js`: `rebuildCrossMarkers(panel)` detects sign changes between sorted MA pairs and sets up/down arrow markers. `applyPanelMarkers(panel)` merges cross markers with event markers before calling `candleSeries.setMarkers`.

### Bybit live kline stream fix
- `src/js/data.js`: `openKlineStream` was returning `null` for non-Binance exchanges. Added `openBybitKlineStream` connecting to `wss://stream.bybit.com/v5/public/spot` with a 20 s keep-alive ping.

### Watchlist column header alignment fix
- `public/css/style.css`: Added `scrollbar-gutter: stable` to `.sym-list` and CSS var `--sb-w` on `.sym-list-head`.
- `src/js/watchlist.js`: `syncHeaderGutter()` measures real scrollbar gutter and publishes it as `--sb-w` on init and resize.

**Verification:** `node --check` passed on all modified JS files and server.js.

---

## v1.0.0 — 2026-06-13 · Initial build

### Architecture
- Vanilla JS ES modules (`type="module"`), no build step
- [LightweightCharts v4.1.3](https://tradingview.github.io/lightweight-charts/) via unpkg CDN
- Node.js + Express server for kline proxy, session/layout persistence
- Primary data: Binance REST + WebSocket

### Layout
- Three-column: left panel (active indicators) | drawing toolbar | charts area | right panel (watchlist/book/info/scanner)
- Topbar: logo, indicators button, layout selector, theme toggle, exchange status, alerts, settings
- Layout modes: single (l1), 2 side-by-side (l2h), 2 stacked (l2v), 4-grid (l4)
- Responsive; panels resizable via drag splitter

### Charts
- Candlestick series + volume histogram per panel
- Independent symbol, timeframe, indicators, and drawing layer per panel
- Active panel: blue border highlight
- OHLCV crosshair info in panel header
- Per-panel TF buttons: 1m 5m 15m 30m 1h 4h 1d 1w
- Asset watermark in chart background
- Live kline WebSocket per panel for real-time candle updates

### Technical indicators (25+)
**Overlays:** SMA, EMA, WMA, Bollinger Bands, VWAP, Ichimoku Cloud, Parabolic SAR, DEMA, TEMA, Pivot Points, SuperTrend, Keltner Channels, Donchian Channels, Volume Profile (SVG overlay), Heikin Ashi, HTF Levels, MA Ribbon, Anchored VWAP  
**Oscillators (sub-pane):** RSI, MACD, Stochastic, ATR, ADX  
Sub-panes are time-synced with the main chart (scroll/zoom propagates).

### Watchlist
- Multiple named tabs (context-menu: rename, delete)
- Drag-to-reorder symbols
- Sortable columns: Symbol, Price, Chg $, Chg %
- Live prices via Binance miniTicker WebSocket
- Colour tags per symbol (right-click dot)

### Drawing tools (13)
Trend line, ray, extended line, horizontal line, vertical line, rectangle, parallel channel, Fibonacci retracement, Fibonacci extension, text annotation, measure, eraser, cursor/select.  
Drawings stored as `{type, p1, p2, p3, color, width}` in time/price coordinates. Export/import as JSON. Keyboard shortcuts: T H V R F M Backspace Esc.

### Alert system
- Price alerts: `{id, symbol, price, condition, note, triggered}`
- Create via right-click on horizontal line or 🔔 topbar button
- Browser Notification API; toast on trigger
- Persisted with session autosave

### Themes
Dark Classic (default), Light Classic, Solarized, Nord, Dracula — toggled via topbar button, applied to all chart instances.

### Favicon
`public/favicon.svg` — 32×32 SVG candlestick chart (one bearish + two bullish candles with trend line). Colors: bg `#131722`, green `#26a69a`, red `#ef5350`, blue `#2962ff`.

### Session persistence
- Autosave (debounced 1.5 s) to server (`/api/session`) with `localStorage` fallback
- Named layouts: save/load/delete via server (`/api/layouts/:name`), `localStorage` fallback
- Snapshot: version, theme, layout, watchlists, panels (symbol/tf/indicators/drawings/overlays)
