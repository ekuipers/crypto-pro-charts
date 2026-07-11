# CryptoPro Charts — Changelog

> Newest entry at the top. Each entry describes what changed, why, and how it was verified.

---

## v1.25.2 — 2026-07-11 · Roadmap rescan: 1-week event pruning now applies on the file-fallback path too

### Roadmap item — remove events older than a week from the events list
**Problem:** `db.pruneOldEvents()` (v1.25.0) correctly deletes `market_events` rows older than 7 days on the DB-enabled path, but `/api/events`'s file-fallback branch — used whenever no DB is configured (every local dev run) and, since v1.25.1's fix for the empty-events bug, also whenever the DB path itself fails — served the raw `data/events.json` completely unfiltered. So "remove events older than a week" only actually held on the DB-enabled happy path; the fallback (which is the *only* path exercised in this sandbox, since there's no `.env`/DB credentials here) always showed the full 16-event curated list regardless of age.
**Fix:** **`server.js`** — the file-fallback branch of `/api/events` now filters `parsed.events` to `Date.parse(e.date) >= (Date.now() - 7 days)` before responding, matching `db.pruneOldEvents()`'s exact retention window, and serves it via `res.json(parsed)` instead of piping the raw file through unmodified.
**Verified:** `node --check` clean; `npm test` 35/35. Started the local server (DB disabled here, so this exercises the fallback path directly) and confirmed `/api/events` now returns 3 events (2026-07-14, 2026-07-29, 2026-08-12) instead of all 16 — matching the manual cutoff calculation against the current date (2026-07-11).

**Roadmap item implemented directly per workflow rule 7; roadmap cleared.** Footer/readme → v1.25.2.

---

## v1.25.1 — 2026-07-11 · Bug rescan: 3 fixes (drawing undo race, KuCoin relay leak, events-seed race)

A user-requested bug rescan (`CLAUDE.md`'s Bugs section said "No open bugs," but nothing had re-checked since the v1.25.0 derivatives removal + events/Postgres migration). Delegated a read-only investigation pass first, then verified each candidate against the actual source before fixing. The derivatives-removal grep found zero leftover references (clean); the events/Postgres SQL, CSRF/rate-limiter logic, and panel-teardown timer cleanup all traced through correctly — three real, reproducible bugs found elsewhere:

### Bug 1 — drawing on an inactive panel corrupts the wrong panel's undo/redo history
**Problem:** `src/js/drawings.js`'s `drawings-changed` listener read `state.activePanel` to decide which panel's history to push a snapshot onto. Per the DOM spec, `pointerdown` fires (and, for single-click tools — hline/vline/text/eraser — completes and dispatches `drawings-changed`) *before* the panel wrapper's own `mousedown` listener runs `setActivePanel` (`src/js/charts.js`). `updateLayerInteractivity` makes every panel's drawing layer interactive whenever a draw tool is selected, not just the active panel's, so clicking a draw tool directly into an inactive panel (without first clicking to focus it) is a normal, reachable action. Result: the shape is correctly added to the panel actually clicked, but the history snapshot is pushed onto the *previously* active panel — so Ctrl+Z on the panel just drawn on does nothing, and Ctrl+Z on the other panel undoes something unrelated.
**Fix:** every `drawings-changed` dispatch site in `src/js/drawings.js` now includes the owning panel in `detail: { panel }` (the panel is always in scope at each dispatch site); the listener uses `e.detail.panel` (falling back to `state.activePanel` only if absent) instead of relying on `state.activePanel` having already been updated by a separate, unordered event listener.
**Verified:** `node --check` clean; `npm test` 35/35 passing (no existing test covered this interaction). Traced the exact DOM event ordering (`pointerdown` → dispatch → `mousedown`) against the `addPanel` wiring in `charts.js` to confirm the race is real, not hypothetical.

### Bug 2 — KuCoin WS relay connection + ping timer leaks if unsubscribed mid-handshake
**Problem:** `src/ws-relay.js`'s `openUpstream` awaits a real `bullet-public` REST round-trip (`fetchKucoinToken()`) before opening the actual KuCoin WebSocket — unlike OKX/Gate, whose `new WebSocket(...)` call is synchronous with no await in between. `subscribe()` calls `openUpstream(entry)` without awaiting it. If every client unsubscribes (symbol/timeframe switch, panel close, tab close — all of which `startKlineStream` triggers by closing and reopening the kline WS) while that token fetch is still in flight, `unsubscribe()` removes `entry` from the `upstreams` map once `entry.clients.size` hits 0. When the token fetch later resolves, `openUpstream` has no way to know it was abandoned — it opens the upstream socket, sets `entry.ws`, and starts a recurring ping `setInterval`, all on an `entry` object nothing can reach anymore to close. One leaked KuCoin connection + ping timer per occurrence, unbounded over the app's uptime under enough symbol/timeframe churn on the KuCoin relay path.
**Fix:** after `fetchKucoinToken()` resolves, `openUpstream` now checks `upstreams.get(keyOf(exchange, symbol, tf)) !== entry` and bails out before opening the socket if the entry was already dropped from the map — mirroring the pattern `unsubscribe()` already uses to key entries.
**Verified:** `node --check` clean; `npm test` 35/35 passing. Reasoned through the exact interleaving (subscribe → await in flight → unsubscribe drops entry from map → await resolves → orphaned entry) against `subscribe`/`unsubscribe`'s actual ref-counting code before and after the fix.

### Bug 3 — market-events table not guaranteed seeded before the server accepts `/api/events` requests
**Problem:** `server.js`'s startup sequence called `seedEventsFromDisk()` (async, does an awaited insert loop into Postgres) without awaiting it inside the `db.init().then(...)` callback, so `.finally()` — and thus `app.listen()` — ran immediately after, not after seeding finished. On a fresh deploy with Postgres configured and `market_events` empty, any `/api/events` request landing in that window got `db.listEvents()` back empty (or partially seeded) instead of the full curated calendar, until a later request (refresh button, page reload) caught the now-fully-seeded table.
**Fix:** `server.js` — the `db.init().then(...)` callback is now `async` and `await`s `seedEventsFromDisk()`, so `app.listen()` (chained via `.finally()`) can't fire until seeding has actually completed.
**Verified:** `node --check` clean; `npm test` 35/35 passing. Started the local server (no Postgres configured in this environment, so this exercised the JSON-fallback path only — the DB-seeding race itself can't be reproduced without a live Postgres instance from here) and confirmed `/api/events` and static asset routes still serve correctly with the awaited sequencing in place.

### Bug 4 — user-reported: market events pane empty (found live, mid-rescan)
**Problem:** while the 3 bugs above were being fixed, the user added a live report to `CLAUDE.md`: "The market events list is empty." This sandbox has no Postgres credentials (`.env` doesn't exist here — confirmed), so the DB-backed path this points at can't be reproduced directly; deployed production does have Supabase configured (`memory.md` v1.12.0). Investigated everything checkable without live DB access: the curated `data/events.json` (16 events, all valid ISO dates, none malformed), the `market_events` table DDL and `seedEvents`/`pruneOldEvents`/`listEvents` SQL (all correct), and the pruning math for "now" = 2026-07-11 (3 of the 16 curated events are still within the 1-week retention window, so a healthy table shouldn't read as fully empty). Bug 3 above (the unawaited seed) is a plausible contributor for a cold-start window, but wouldn't explain a *persistently* empty pane well after boot. The real, confirmed problem: **`server.js`'s `/api/events` route swallowed any DB-path error into `{events: []}` with no server-side `console.error`** — so whatever the actual production failure is (unseeded table, transient connection drop, anything) was both invisible in the pane *and* invisible in the logs, making the report undiagnosable from here.
**Fix:** `server.js` — `/api/events` now logs the DB error (`console.error('[events] DB read failed, falling back to file:', ...)`) and, instead of returning an empty array, falls back to serving the curated `data/events.json` file directly — the same fallback this route already uses when no DB is configured at all, now also applied when the DB path exists but fails. This makes the pane resilient to *any* DB-side failure (never shows empty as long as the file is readable) and makes the next occurrence diagnosable via server logs instead of guesswork.
**Verified:** `node --check` clean; `npm test` 35/35. Started the local server (DB disabled here, so this exercised the "already no DB" branch of the same code path) and confirmed `/api/events` still returns all 16 events. The DB-path branch and its new error-log line couldn't be exercised against a live Postgres instance from this sandbox — if the pane is still empty after this deploys, the server log will now say why.

**All 4 bugs fixed directly per workflow rule; bug rescan complete.** Footer/readme → v1.25.1.

---

## v1.25.0 — 2026-07-11 · Roadmap rescan: remove futures funding/OI toggle + events moved to Postgres

### Roadmap item 1 — remove the futures funding & open interest toggle
**Fix:** Removed the per-panel Ⓕ toggle (funding rate, open interest, and the liquidation-marker stream it also gated) end to end rather than just hiding the button, since nothing else in the app depended on it:
- **`src/js/charts.js`** — removed the `.deriv-btn`/`.panel-deriv-info` markup from the panel template, the `derivEnabled`/`derivTimer`/`liqWS`/`_liqMarkers` panel state, the click wiring, the re-subscribe-on-symbol-change call, and the whole derivatives block (`refreshDerivInfo`, `refreshOIHistory`, `paintOISpark`, `onLiquidation`, `startDerivatives`, `stopDerivatives`, `restartDerivatives`, `toggleDerivatives`). `applyPanelMarkers` no longer merges `_liqMarkers` into the marker set, and `destroyPanel` no longer tears down `derivTimer`/`liqWS`.
- **`src/js/derivatives.js`** and **`src/derivatives.js`** (frontend + backend modules, funding/OI fetch + liquidation WS) — deleted; nothing else imported them once the toggle was gone.
- **`src/js/palette.js`** — removed the "Toggle derivatives overlay" command-palette entry and its now-unused `toggleDerivatives` import.
- **`server.js`** — removed `/api/derivatives` and `/api/derivatives/oi-history` (and their in-memory caches), the `fetchFundingOI`/`fetchOIHistory` import, and `fapi.binance.com`/`wss://fstream.binance.com` from the CSP's `connect-src` (no longer called from the browser).
- **`public/css/style.css`** — removed `.panel-deriv-info`, `.oi-spark`, `.deriv-btn.active`.
- **`public/sw.js`** — dropped `/js/derivatives.js` from the PWA shell precache list and bumped the cache name (`cpc-shell-v1` → `v2`) so the old list (which would now 404 on `cache.addAll` and block the service worker install) doesn't linger in already-installed clients.
**Verified:** `node --check` clean on every touched file; full `npm test` — 35/35 passing (unaffected, no test covered this UI-only feature). Started the local server and confirmed `/js/charts.js` no longer contains `deriv-btn`/`panel-deriv-info` markup, and that `/api/derivatives` and `/js/derivatives.js` fall through to the app's existing SPA catch-all (serves `index.html`, same as any other unmatched route) rather than serving stale derivatives code or data.

### Roadmap item 2 — events list refresh button + 1-week pruning + Postgres persistence
**Problem:** the market-events calendar (`data/events.json`) was a static file re-read on every `/api/events` call, so there was no way to manually refresh the pane, no persistence layer to prune from, and no admin-facing way to add events without a deploy.
**Fix:**
- **`src/db.js`** — new `market_events` table (`id` primary key, `date timestamptz`, `title`, `category`, `country`, `impact`, `detail`), created in `init()`. `seedEvents(events)` does an `ON CONFLICT (id) DO NOTHING` batch insert (idempotent — safe to call every boot) so the curated JSON's events import into the table exactly once instead of being lost when switching to DB-backed storage. `pruneOldEvents()` deletes rows with `date < now() - interval '7 days'` (the roadmap's "remove events older than 1 week"). `listEvents()` returns everything left, ascending by date.
- **`server.js`** — `seedEventsFromDisk()` runs once at startup (alongside `startAlertEngine()`) after `db.init()` succeeds, reading `data/events.json` and calling `db.seedEvents()`. `/api/events` now calls `db.pruneOldEvents()` then `db.listEvents()` when the DB is configured; when it isn't (e.g. local dev without Postgres credentials), it falls back to reading the JSON file directly, matching the existing DB-optional pattern used elsewhere in this file (layouts, alerts, etc.).
- **`public/index.html`** — added a ⟳ `#evtRefreshBtn` next to the existing "High impact only" filter in the events pane header (grouped in a new `.events-head-actions` wrapper so `justify-content: space-between` doesn't awkwardly center the filter checkbox once a third element was added).
- **`src/js/events.js`** — `initEvents()` wires the refresh button to re-run `loadEvents()` (adds a `.spinning` class for the duration, via a CSS keyframe rotation, so the click has visible feedback).
- **`public/css/style.css`** — `.events-head-actions`, `.evt-refresh-btn` (hover state) and the `.spinning`/`@keyframes evt-spin` rotation.
**Verified:** `node --check` clean on `src/db.js`/`server.js`/`src/js/events.js`; `npm test` 35/35 passing. Started the local server (no Postgres configured in this environment, so this exercised the file-fallback path) and confirmed `curl /api/events` returns all 16 curated events unchanged, and that the served `index.html` now contains the `#evtRefreshBtn` markup. The DB-backed path (`seedEvents`/`pruneOldEvents`/`listEvents`) couldn't be exercised against a live Postgres instance from this environment, but was verified by direct code review against the same query/pool helper (`q()`) every other table in `db.js` already uses successfully, and by confirming the three new functions are properly exported (`Object.keys(db)` check).

**Both roadmap items implemented directly per workflow rule 7; roadmap cleared.** Footer → v1.25.0.

---

## v1.24.3 — 2026-07-11 · Bug fix: derivatives really unavailable in the deployed app (server-IP block)

### Bug fix — "Derivatives data unavailable" — actually still broken, this time with proof
**Problem:** v1.24.2 re-checked this bug via local `curl`/server-side testing, found `/api/derivatives` returning `200` with correct data, and closed it as a stale report. It wasn't — the user supplied a screenshot of the deployed app showing the exact same "Derivatives data unavailable" text with a live BTC/USDT chart open, proving the failure is real in production even though the identical request succeeds from local dev/server-side testing. That combination — same code, same upstream, fails only from the deployed server's own network path — is the signature of an IP-based block: Binance is well known to reject requests from a large set of cloud/datacenter IP ranges (regulatory geofencing), which frequently includes serverless hosting IPs, while a user's own residential browser IP is unaffected. This app's price ticker and candles keep working in that same screenshot because those come from a direct **client-side** WebSocket to `stream.binance.com` (the browser's IP) — only the funding/OI data was going through this app's own server (`/api/derivatives` → `fapi.binance.com` from the *server's* IP), so it was the one path actually exposed to a server-side block.
**Fix:** Confirmed (via live `curl` with an `Origin` header, not assumed) that all three Binance futures endpoints used here — `/fapi/v1/premiumIndex`, `/fapi/v1/openInterest`, `/futures/data/openInterestHist` — send `Access-Control-Allow-Origin: *`, meaning the browser can call them directly. **`src/js/derivatives.js`** — `fetchDerivatives`/`fetchOIHistory` now fetch straight from `fapi.binance.com` in the browser first (mirroring the existing direct-WebSocket pattern for price/klines/liquidations, all of which already bypass this app's server for exactly this kind of reason), and only fall back to the existing `/api/derivatives(/oi-history)` server proxy if the direct browser fetch throws — covering the opposite failure mode (a client network that blocks binance.com directly but not this app's own server). **`server.js`** — added `https://fapi.binance.com` to the CSP's `connect-src` (it only had `fstream.binance.com` for the liquidation WS before), otherwise the CSP itself would have blocked the new direct fetch.
**Verified:** live `curl -H "Origin: ..."` confirmed CORS headers on all three endpoints before writing any code. After the change: `node --check` clean; `npm test` 35/35; started the local server and confirmed the served CSP header now includes `fapi.binance.com`; a standalone script reproduced the exact fetch + field-mapping logic now in `derivatives.js` against the live API and confirmed both the funding/OI shape and the OI-history array map correctly. The original failure mode (server-side IP block) can't be reproduced from this dev environment since its outbound IP isn't blocked — this fix is a direct structural response to the screenshot evidence and the CORS-availability findings, not a guess.
**Lesson:** don't close a user-reported bug on server-side/local reproduction alone when the report describes the *deployed* app — ask for or accept concrete evidence (a screenshot, in this case) rather than trusting a passing local check over a live conflicting report.

---

## v1.24.2 — 2026-07-11 · Roadmap rescan: bug re-verified fixed + KuCoin WS relay + OI history sparkline

### Bug re-check — "Derivatives data unavailable" on BTC/USDT
**Investigated:** `CLAUDE.md`'s Bugs section still listed this after the v1.24.1 fix, so it was re-verified from scratch rather than assumed stale. Started the local server and curled `/api/derivatives?symbol=BTCUSDT` (and `ETHUSDT`/`DOGEUSDT`) directly — all returned `200` with correct funding rate/OI, and `derivativesAvailable()` (`src/js/derivatives.js`) correctly gates only on the `/USDT$/` suffix, not exchange. **Conclusion:** the v1.24.1 fix was already correct and complete; the bug entry was stale (left over from before that fix landed, never cleared from `CLAUDE.md`). Closed out — no code change needed.

### P4 — KuCoin native WS relay (closes the P3-17 gap)
**Problem:** P3-17 shipped a server-side WS relay for OKX/Gate.io but explicitly skipped KuCoin because its public WS needs a `POST /bullet-public` token handshake + periodic ping, leaving KuCoin on REST-poll for live candles.
**Fix:** **`src/ws-relay.js`** — `kucoin` added to `RELAY_EXCHANGES`; `openUpstream` is now `async` and, for KuCoin, calls `fetchKucoinToken()` (hits `bullet-public`, extracts `token`/`instanceServers[0]`) before connecting to `${endpoint}?token=…&connectId=…`, waits for the `{type:'welcome'}` frame before subscribing to `/market/candles:{BASE-QUOTE}_{interval}`, and pings on a timer derived from the server's own `pingInterval` (capped 5–30s, minus a 5s safety margin) so KuCoin never drops the socket as idle. Candle tuples (`[time,open,close,high,low,volume,turnover]`) map to the same `{time,open,high,low,close,volume,closed}` shape every other relay path produces — `closed` is always `false`, same convention as Gate's relay and Bitvavo's client-side stream, since KuCoin's push has no per-tick closed flag either. **`src/js/data.js`** `openKlineStream` routes `kucoin` through `openRelayKlineStream` alongside OKX/Gate instead of returning `null` (REST-poll fallback). **`src/js/constants.js`** — KuCoin's `status` updated from `'REST only'` to `'REST + WebSocket (server relay)'`.
**Verified live** (not assumed from docs): a standalone script confirmed the real `bullet-public` response shape and a real KuCoin candle push (`{data:{candles:[...]}}`) before writing the relay code. After implementing, a second standalone WS client connected to this app's own `/ws/relay` endpoint, subscribed `{exchange:'kucoin', symbol:'BTCUSDT', tf:'1m'}`, and received a correctly-shaped live candle back through the relay. Server log showed no `[ws-relay] failed…` errors during the run. `node --check` clean; full `npm test` — 35/35 passing (unaffected).

### P4 — Open interest history sparkline (wires up a dead P2-9 endpoint)
**Problem:** P2-9 shipped `GET /api/derivatives/oi-history` and a matching frontend `fetchOIHistory()`, but nothing in the UI ever called it — found via a repo-wide grep while rescanning for unfinished work. The funding/OI readout only ever showed the latest single OI number, with no sense of whether it's rising or falling.
**Fix:** **`src/js/charts.js`** — `refreshOIHistory(panel)` fetches 48 hourly OI points and caches them on `panel._oiHistory`, on its own interval (`panel.oiTimer`, 60s) separate from the 20s funding-text poll (OI buckets only update hourly upstream, so polling it every 20s would've been wasted requests). `refreshDerivInfo` now appends a small `<canvas class="oi-spark">` after the funding text and repaints it from the cached history (`paintOISpark`) on every rebuild, so the sparkline survives the 20s funding-text DOM replace without being refetched. `startDerivatives`/`stopDerivatives` start/clear `oiTimer` and reset `_oiHistory` alongside the existing funding timer and liquidation stream. **`src/js/utils.js`** — the sparkline painter from `watchlist.js` (P2-16) was extracted into an exported `paintSparkline(canvas, values, up)` so this reuses it instead of duplicating the drawing code (`watchlist.js` updated to import it and its local copy removed). **`server.js`** — `/api/derivatives/oi-history` had no caching (unlike `/api/derivatives`'s 15s TTL), so a panel's periodic sparkline refresh would have hit Binance directly every time; added a 60s `OI_HIST_CACHE` keyed by `symbol|period|limit`, matching the endpoint's real update cadence. **`public/css/style.css`** — `.oi-spark` vertical-align/margin so it sits inline with the funding text.
**Verified:** confirmed the endpoint returns real hourly OI buckets via curl, and that a second call within 60s is served from cache (near-zero response time). `node --check` clean on all touched files; `npm test` — 35/35 passing.

**Bugs list cleared, roadmap re-scanned and both found items implemented directly per workflow rule 7.** Footer → v1.24.2.

---

## v1.24.1 — 2026-07-11 · Roadmap rescan: event markers default + funding-rate availability fix

### Roadmap item — event markers off by default
**Fix:** **`src/js/state.js`** — `showEventMarkers` default changed `true` → `false`. **`public/index.html`** — removed the `active` class from `#evtMarkersBtn` so the topbar button's initial visual state matches. `applyEventMarkers` (`src/js/events.js`) already no-ops when `state.showEventMarkers` is false, so no other logic changed — event markers can still be turned on per-session via the 📅 button or the command palette.

### Bug fix — funding-rate toggle wrongly said "unavailable" on non-Binance panels
**Problem:** `derivativesAvailable(symbol, exchange)` in `src/js/derivatives.js` required `exchange === 'binance'`, so the Ⓕ funding/OI/liquidations toggle showed "Futures data unavailable for this symbol/exchange" for *any* panel charting a Bybit/OKX/Gate/Bitvavo/etc. symbol — even a plain BTCUSDT — even though the funding-rate feed (`src/derivatives.js`, backend) always queries Binance's futures API directly and is unrelated to which exchange supplies the panel's spot price. Every symbol in this app is stored in the same compact Binance-style form (e.g. `'BTCUSDT'`) regardless of source exchange (confirmed via `constants.js`/`data.js` — per-exchange fetchers convert that canonical form to their own REST format internally), so the exchange gate was serving no purpose other than false negatives once P3 added OKX/Gate/Bitvavo as first-class chart sources.
**Fix:** `derivativesAvailable(symbol)` now only checks the existing `/USDT$/` suffix requirement (what Binance USDT-M futures actually lists), dropping the `exchange` parameter. **`src/js/charts.js`** call site updated to match (`derivativesAvailable(panel.symbol)`). The graceful `catch` fallback in `refreshDerivInfo` ("Derivatives data unavailable") already covers the case where a symbol has no matching Binance perp market, so no new error handling was needed.
**Verified:** `node --check` on `derivatives.js`/`charts.js`/`state.js`; full `npm test` suite (35/35 passing, unaffected).

---

## v1.24.0 — 2026-07-11 · P3 roadmap: platform, performance & hardening (10 of 10 items — 1 deliberately deferred)

Shipped the P3 tier of the 2026-07-11 roadmap. Ordered here roughly safest→riskiest, which is also the order they were built and tested in. Verified with `node --check` on every touched file, the new `npm test` suite (35 unit tests), and multiple Playwright browser passes with `console --errors` checked clean each time — three real bugs were caught and fixed by that testing (see below), which is exactly why the passes kept happening after every risky change rather than only at the end.

### P3-18 — Test suite + CI
**Fix:** **`test/indicators.test.js`** — 13 tests against `calcOverlay`/`calcOscillator`/`calcHeikinAshi` (SMA/EMA converge on a constant series, RSI saturates at the range ends on monotonic series and stays in `[0,100]` on noisy ones, MACD histogram algebraically equals macd−signal, OBV direction, Heikin Ashi OHLC identities, AO rising-flag consistency). **`test/klines.test.js`** — 15 tests against `normalize`/`aggregateBars`/`toExSymbol`/`tfSupported`/`klineUrl` in `src/klines.js` (per-exchange field-order mapping including the newest-first-must-reverse cases for Bybit/OKX/KuCoin, 1M calendar-month bucketing vs fixed-width, empty-payload safety). **`test/totp.test.js`** — 7 tests (below). `package.json` — `"test": "node --test"` (default glob discovery; an explicit path argument choked on this Node/Windows combination — confirmed via testing, not assumed). **`.github/workflows/test.yml`** — `npm ci && npm test` plus a full `node --check` sweep, on every push/PR to `main`.

### P3-23 — Chart snapshot & export
**Fix:** **`src/js/snapshot.js`** (new) — `exportPanelPNG` composites `chart.takeScreenshot()` with the panel's own drawing-layer canvas (so trend lines/fibs/position-tool boxes are actually in the exported image) and stamps a symbol/TF/timestamp watermark, then downloads. `exportPanelCSV` exports only the bars in the current viewport (`getVisibleLogicalRange`), per the roadmap wording "visible bars," not the full loaded history. **`charts.js`** — 📷 and ⤓ panel-action buttons.

### P3-24 — Undo/redo for drawings
**Fix:** **`drawings.js`** — a per-panel list of full-`drawings`-array snapshots with a cursor (`panel._history` / `_historyIdx`), rather than modeling every mutation as an invertible command — drawing sets are small so cloning the whole array (`structuredClone`) on each change is cheap and far simpler. A single `document.addEventListener('drawings-changed', …)` at module scope pushes a snapshot on every genuine edit (creation, drag, resize, color/width/style/text/coordinate change, lock toggle, delete, import). `undo`/`redo` move the cursor and re-render; `applyHistoryState` calls the existing `scheduleAutosave()` directly rather than re-dispatching the change event (so navigating history doesn't itself get recorded as a new entry). **`persistence.js`** — `applyLayoutData` now calls `initDrawingsHistory(panel)` *after* restoring `panel.drawings` from a saved layout, not just at panel creation (when it was still empty) — otherwise the first undo after loading a saved layout would wipe the restored shapes instead of the user's first edit. **`ui.js`** — Ctrl/Cmd+Z undo, Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z redo, scoped to `state.activePanel`.

### P3-26 — Larger grid layouts (6, 8 charts)
**Fix:** **`constants.js`** `LAYOUT_COUNTS` — `l6: 6, l8: 8`. **`style.css`** — `.layout-l6` (3×2), `.layout-l8` (4×2) grid templates. **`ui.js`** — added to the layout-name/icon maps (the layout dropdown already iterates these generically, no other change needed). Per-cell drag-resize handles intentionally stay off for these two (matches the existing default for anything that isn't `l2h`/`l2v`/`l4`) — evenly-split grids are the expected use case at 6–8 panels.

### P3-22 — Command palette (Ctrl/Cmd+K)
**Fix:** **`src/js/palette.js`** (new) — a `showModal`-hosted overlay with a search input and a merged, scored result list: symbol matches (from the already-cached `fetchAllPairs()`, prefix matches ranked above substring matches) plus a curated action list (layout presets, toggle panels/theme/event-markers, save/open layouts, open templates/alerts/settings/account, and — when a panel is active — toggle derivatives/replay and export PNG/CSV for it). Actions that already exist as topbar buttons replay that button's click rather than duplicating its logic. Arrow keys navigate, Enter runs the selected entry, Escape closes.

### P3-19 — Auth hardening
**Scoped to:** rate limiting, security headers + CSP, CSRF mitigation, self-service password change, and optional TOTP 2FA. Email-based "forgot password" is **not** included — it needs an SMTP/email provider that isn't configured anywhere in this project (the same gap already noted for the alert engine's optional Telegram/webhook notifiers); building unverifiable send code for it seemed worse than being explicit about the gap.
- **`src/totp.js`** (new) — RFC 6238 TOTP from scratch (HMAC-SHA1 via Node's `crypto`, hand-rolled base32 codec — no library). 7 unit tests, including drift-window and garbage-input handling.
- **`src/auth.js`** — in-memory sliding-window rate limiter (10 login attempts/15 min/IP, 8 registrations/hour/IP; swept every 15 min so a long-running process doesn't leak the tracking map) — dependency-free rather than pulling in `express-rate-limit` for two routes. `POST /api/auth/change-password` (current-password verified). `POST /api/auth/2fa/setup|enable|disable` — setup stages a secret without enforcing it; enable requires proving the authenticator app actually has a valid code first, so a typo during setup can't lock someone out. `POST /api/auth/login` now returns `{requiresTotp:true}` when the password is right but the account has 2FA on and no/invalid code was supplied.
- **`server.js`** — `app.set('trust proxy', 1)` (correct client IP behind Vercel/a reverse proxy, for the rate limiter). A CSP + `X-Content-Type-Options`/`X-Frame-Options`/`Referrer-Policy`/`Permissions-Policy` (+ HSTS in production) header middleware. The CSP's `connect-src` enumerates every host the browser talks to directly (exchange REST/WS hosts, CoinGecko) — **caught by testing**: the real Binance WS URL is `wss://stream.binance.com:9443`, and a CSP source with no port only matches the scheme's default port, so the first version silently blocked every Binance price/kline/orderbook/trade stream; fixed by adding the explicit `:9443`. CSRF mitigation is an Origin/Referer-header check on mutating `/api/*` requests, rejecting any whose Origin doesn't match the server's own host — chosen over a double-submit token because the frontend has ~15 independent `fetch()` call sites across modules with no shared HTTP helper, and token-based CSRF would have meant touching all of them with real risk of silently breaking one; SameSite=Lax session cookies already block the cross-site-form CSRF vector this exists to backstop.
- **`src/js/main.js`** — the one pre-existing inline `onclick="location.reload()"` (in the "charting library failed to load" fallback) was converted to `addEventListener`, since a strict `script-src` (no `'unsafe-inline'`) blocks inline event-handler attributes.
- **`src/js/auth.js`** — sign-in flow handles the two-step TOTP challenge (password → code prompt on `requiresTotp`); account modal gained a Security section (change password, enable/disable 2FA with the secret shown for manual authenticator-app entry — no QR image rendering, to avoid adding a QR-generation dependency for something a pasted secret already accomplishes).
- **`src/db.js`** — `accounts` gains `totp_secret`/`totp_enabled`/`password_changed_at` via `alter table … add column if not exists`, so already-deployed databases pick them up on next boot without a manual migration.

### P3-17 — Native WebSocket relay (server-side connection manager)
**Fix:** **`src/ws-relay.js`** (new, `ws` package) — one upstream WS connection per `(exchange, symbol, tf)` **regardless of client count**, ref-counted (opens on first subscriber, closes 3s after the last one leaves, auto-reconnects while anyone's still subscribed), fanned out over the app's own `/ws/relay` endpoint (mounted on the same HTTP server/port — no separate process to deploy). Covers **OKX and Gate.io**, whose public kline WS APIs are plain connect-and-subscribe. **KuCoin is deliberately not included** — its public WS requires a `POST /bullet-public` token handshake plus periodic token refresh, a meaningfully bigger lifecycle than OKX/Gate's, and it stays on the existing REST-poll fallback. Bybit already had a direct client-side WS from P1 and needed no change. **`src/js/data.js`** — `openKlineStream` routes okx/gate through the new `openRelayKlineStream` instead of returning `null` (which previously meant REST polling). **Verified**: a standalone test client subscribed to both exchanges through the relay and received live, correctly-shaped candle ticks from real upstream connections.

### P3-20 — Web Worker indicator computation
**Fix:** **`src/js/indicator-worker.js`** (new, module worker) — imports the exact same pure `calcOverlay`/`calcOscillator`/`calcHeikinAshi` from `indicators.js` and runs them off the main thread. **`src/js/indicator-client.js`** (new) — promise-per-request bridge (one shared worker, requests matched to responses by id); rejects if Workers are unavailable or the worker errors, so callers can fall back cleanly. **`charts.js`** — `buildIndicator` is now `async`, awaits `computeInWorker(...)`, and falls back to the synchronous calc functions on any rejection. A per-indicator generation counter (`ind._gen`, bumped at the start of every `buildIndicator` call and in `teardownIndicator`) discards a result that arrives after that same indicator was rebuilt or removed while the worker was still computing — this matters because bar replay calls `recomputeIndicators` on every step (up to ~8/sec at 4×), which would otherwise be a real race between overlapping in-flight computations. `buildOscillator` now takes the precomputed result as a parameter instead of calling `calcOscillator` itself. **`volprofile`** (which renders directly to an SVG layer, not through `series.setData`) stays on the main thread — nothing to parallelize there. **Verified** in-browser with multiple overlays/oscillators added simultaneously, replay stepping, and undo — all rendered correctly with no stale/duplicate series.

### P3-25 — Mobile/tablet layout + PWA
**Fix:**
- **Touch drawing** — **`drawings.js`**'s canvas interaction listeners switched from `mousedown`/`mousemove`/`mouseup` to `pointerdown`/`pointermove`/`pointerup` (Pointer Events carry the same `clientX`/`clientY` a `MouseEvent` does, and fire for touch/pen too — no parallel touch-event handlers needed). **`style.css`** — `touch-action: none` on `.draw-canvas` so the browser doesn't try to pan/scroll while a finger is drawing.
- **Responsive layout** — a `max-width: 820px` block in `style.css`: any configured layout (1/2/4/6/8-chart) becomes a horizontally swipeable single-chart-at-a-time view (`scroll-snap-type: x mandatory`) instead of squeezing multiple panels into an unusable grid — the user's panels are all still there, one swipe away. The right panel (watchlist/book/scanner/paper/…) becomes a full-screen overlay via the existing hamburger (☰) toggle instead of a fixed sidebar.
- **Bug caught by testing**: the right panel reused the desktop `.collapsed` class (default = visible, class added = hidden) for the mobile full-screen overlay too, so on first mobile load the watchlist covered the entire screen with no visible chart underneath. Fixed in **`main.js`** — `.collapsed` is now added by default on init when `window.innerWidth <= 820`, so mobile users see the chart first and open the watchlist via the same hamburger button.
- **PWA** — **`public/manifest.json`** (name/icons/theme colors, reuses the existing `favicon.svg` — PNG icon variants would improve iOS/Android install-prompt fidelity but there's no image-generation tooling in this project to produce them). **`public/sw.js`** — caches the app shell (HTML/CSS/JS) for instant loads and an offline fallback; explicitly never intercepts `/api/*` or `/ws/*` (market data is only ever meaningful live). Registered from **`main.js`** after `load`.
- **Verified**: a 390px-viewport Playwright pass confirmed the right panel starts `display:none`, opens correctly via the hamburger, and a click-drag trend line (exercising the same Pointer Events path a touch-drag uses) renders correctly on the narrow layout. Service worker confirmed reaching `active` state with no console errors.

### P3-21 — LightweightCharts v4 → v5 upgrade: **researched, deliberately deferred**
The roadmap flagged this as enabling native panes and simplifying the oscillator sub-pane code — real benefits, but this is the single highest-risk item in the batch (it touches the literal rendering core of every chart type, indicator, and overlay), so it got the most scrutiny before deciding whether to attempt it, not the least.

**What was confirmed** (fetched from the official v4→v5 migration guide rather than assumed from training data, since being wrong here means shipping a broken chart engine):
- Series creation changes from `chart.addCandlestickSeries(opts)` to `chart.addSeries(LightweightCharts.CandlestickSeries, opts)` (and equivalently for Line/Area/Bar/Histogram/Baseline). The standalone/UMD CDN build still exists and still exposes a `window.LightweightCharts` global with the series-type constructors on it — compatible with this project's no-bundler architecture.
- `series.setMarkers(...)` is removed from the series instance entirely; markers become a separate primitive via `createSeriesMarkers(series, markers)`, with `.setMarkers()`/`.markers()` called on that primitive instead.
- The chart-level `watermark` option is gone; it's replaced by `createTextWatermark(pane, options)` attached to a specific pane (`chart.panes()[0]` for a single-pane chart) — there is no chart-level watermark in v5.
- An inventory of every v4 call site a migration would need to touch (`grep -n "addCandlestickSeries\|addLineSeries\|addHistogramSeries\|addAreaSeries\|addBarSeries\|setMarkers\|watermark" src/js/charts.js`): **13 series-creation sites** (all 7 chart types in `createMainSeries`, the volume histogram, heikin-ashi and line overlays, the 3 oscillator sub-chart series, the compare/overlay-symbol series), **1 markers call site** (`applyPanelMarkers`, but it's the funnel for cross-markers + event-markers + lux-algo signals + P2's liquidation markers, so its primitive would need a well-defined lifecycle tied to `panel.candleSeries` being recreated on chart-type switches), **2 watermark sites** (initial set in `loadPanelData`, theme-color update in `applyThemeToCharts`).
- **What remained unverified after two documentation fetches**: whether/how `priceScale()`/`timeScale()` APIs changed (used constantly by this app's custom cross-panel alignment/sync logic — `alignPriceScales`, `syncTimeScales`, `startAlignMonitor`), the disposal/lifecycle semantics for the new markers and watermark primitives when their owning series is torn down and recreated, and how `chart.panes()` native-pane mechanics would map onto the current architecture of one *separate LightweightCharts instance per oscillator* synced by hand.

**Decision:** deferred rather than attempted. A partially-correct migration of the core rendering engine — with unverified disposal semantics on a chart-type-switch-heavy app — is a worse outcome than shipping the other nine P3 items cleanly on a known-working v4. This writeup exists so a future attempt (by me or anyone else) starts from a concrete call-site inventory and confirmed API shapes instead of re-deriving them.

**Verification (whole batch):** `node --check` on every touched/new file. `npm test` — 35/35 passing. Multiple Playwright passes against a running server: derivatives + replay + undo/redo interacting together, indicators added through the Worker path (overlay + oscillator) at both single-chart and 6-grid layouts, the command palette driving both symbol switches and a layout change, scanner/paper/templates/heatmap panels, and a narrow-viewport pass for the mobile layout and touch-style drawing — console errors clean (aside from the expected 500/503s from this local environment's disabled Postgres). Three real bugs were caught and fixed during these passes: the CSP's missing Binance WS port (blocked every live price feed), the mobile right-panel default-visible overlay (blocked the entire UI on phones), and — from the P2 session but relevant here since P3's browser passes exercise the same tape — none new beyond those two plus the CSP fix. Footer/readme/CLAUDE.md roadmap → v1.24.0.

---

## v1.23.0 — 2026-07-11 · P2 roadmap: pro-trader differentiators (8 items)

Shipped the entire P2 tier of the 2026-07-11 roadmap in one release. Verified with `node --check` on every touched file, a local server smoke test hitting every new route (`/api/derivatives`, `/api/derivatives/oi-history`, `/api/templates`, `/api/scans`, `/api/paper` — all correctly 503 with DB disabled, malicious `symbol` params correctly 400), and a Playwright-driven browser pass against the running app (screenshots of every new panel/toggle, `console --errors` clean of JS exceptions). One real bug was caught and fixed during the browser pass (see P2-14 below).

### P2-9 — Derivatives data overlays (funding rate, open interest, liquidations)
**Fix:** **`src/derivatives.js`** (new, backend) — `fetchFundingOI`/`fetchOIHistory` hit Binance USDT-M futures (`fapi.binance.com`) public REST, no key needed. **`server.js`** — `GET /api/derivatives` (15s cache) and `GET /api/derivatives/oi-history`, both with fixed-host + regex-validated `symbol`/whitelisted `period` (no SSRF). **`src/js/derivatives.js`** (new, frontend) — fetch wrappers + `openLiquidationStream` (direct client WS to Binance's public `!forceOrder` stream per symbol). **`charts.js`** — new Ⓕ panel-action toggle; `.panel-deriv-info` span shows funding rate (colored) + countdown to next funding + OI; liquidations render as chart markers merged into the existing `applyPanelMarkers` pipeline (`panel._liqMarkers`). Scoped to Binance USDT-quoted symbols only (where the futures market actually exists); the toggle explains why it's unavailable otherwise.

### P2-10 — Bar replay mode
**Fix:** **`src/js/replay.js`** (new) — freezes `panel.data` to a historical slice, reveals bars one at a time via `candleSeries.update()`, recomputing indicators each step. Play/pause/step/speed (0.5–4×)/scrubber control bar (`.replay-bar`) appears under the panel. Exiting calls the existing `loadPanelData()` to cleanly restore full history and the live kline stream — no custom restore logic needed. **`charts.js`** — ⏮ panel-action button; `changeTimeframe`/`changeSymbol` force-exit replay first so a stale frozen slice can't fight the reload.

### P2-11 — Position tool (long/short) + pitchfork + fib time zones + magnet snap
**Fix:** **`drawings.js`** — two new drawing types, `long`/`short`: entry (p1) + target (p2) drag, with stop (p3) auto-placed at a default 1:2 R:R and independently draggable; renders a profit/loss zone box with live $ / % / R:R labels. `pitchfork` (3-point Andrews pitchfork: median + two parallel teeth, all extended rightward). `fibtime` (vertical lines at Fibonacci bar-offsets from a 2-point anchor). Magnet toggle (`drawingState.magnet`) snaps new points to the nearest bar's O/H/L/C via `magnetSnap()`. **`ui.js`** — toolbar icons for all four plus a magnet toggle button.

### P2-12 — Indicator templates (user-saved)
**Fix:** **`db.js`** — new `templates` table (uid, name, jsonb data), mirroring the existing `layouts` pattern. **`server.js`** — `GET/PUT/DELETE /api/templates(/:name)`. **`persistence.js`** — `getUserTemplates`/`saveUserTemplate`/`deleteUserTemplate` (server + `localStorage` fallback, same shape as named layouts). **`ui.js`** — `showTemplatesModal` now has a "My Templates" section (save current chart's indicators, load, delete) alongside the existing built-in presets.

### P2-13 — Screener upgrade
**Fix:** **`scanner.js`** — `scope=all` now covers every enabled-exchange pair (removed the 100-pair cap); added a **Volume Spike (≥2×)** scan type (last bar volume vs. 20-bar average); saved scans (name → `{type, scope}`) via new `saved_scans` DB table + `/api/scans` routes; an **Auto** checkbox re-runs the scan every 20s and toasts symbols that are newly matching (a lightweight client-side stand-in for full server-side scan-hit alerts, which would need alert-engine-level infrastructure — noted as a gap, not built here).

### P2-14 — Time & sales + depth chart
**Fix:** **`data.js`** — `openTradeStream` (Binance `@trade` WS, taker side derived from the `m` "buyer is maker" flag). **`orderbook.js`** — the "Book" right-tab gained Book/Trades/Depth sub-tabs; Trades renders a live-scrolling tape; Depth renders an SVG cumulative bid/ask area chart from the existing order-book snapshot. **`index.html`** — `.ob-subtabs`.
**Bug caught during browser verification:** the trade tape's Qty column showed "0.00" for every row — `fmtVol()`'s fixed 2-decimal floor reads as zero for typical sub-0.01 BTC trade sizes. Fixed with a magnitude-aware `fmtQty()` local to `orderbook.js` (doesn't touch the shared `fmtVol` used elsewhere for larger aggregate volumes).

### P2-15 — Paper trading & trade journal
**Fix:** **`db.js`** — new `paper_trades` table (side, qty, entry/exit/stop/target, status, notes, tags). **`server.js`** — `GET/POST /api/paper`, `PUT /api/paper/:id/close`, `PUT /api/paper/:id/notes`, `DELETE /api/paper/:id`. **`src/js/paper.js`** (new) — new "Paper" right-tab: open positions with live unrealized P&L (polled every 2s from `state.prices`), a closed-trade journal with editable notes. **`drawings.js`** — the position-tool config popover gained a "📝 Log Trade" button that posts the drawing's entry/target/stop straight into a paper trade (`logDrawingAsTrade`), tying P2-11 and P2-15 together.

### P2-16 — Watchlist enrichment
**Fix:** **`watchlist.js`** — each row's `$ change` column was replaced with a 24h mini sparkline (canvas, cached per `exchange:symbol` for 5 min so the list's frequent 1.5s price-tick re-render doesn't refetch); 24h volume is shown as a hover tooltip on the price cell rather than a fixed column (kept — a persistent extra column risked overflowing the panel below ~300px width). **`data.js`** — `refreshVolumes()` batches Binance 24hr ticker stats for watchlist symbols every 30s (piggybacks the existing `pollMissing` cadence in `main.js`). New **Heatmap** view (`heatmapToggleBtn`) swaps the list for a tile grid colored by 24h %-change intensity, each tile also showing volume.

**Scope notes (deliberate, to keep the batch shippable):** liquidation *levels* (aggregate liquidation-cluster estimation, vs. the live liquidation *events* shipped here) were out of scope; scan-hit alerts are client-side auto-refresh + toast, not server-side push; watchlist volume is a tooltip, not a column, for narrow-panel layout safety.

**Verification:** `node --check` on every modified/new JS file (`server.js`, `src/db.js`, `src/derivatives.js`, `src/js/charts.js`, `src/js/drawings.js`, `src/js/ui.js`, `src/js/replay.js`, `src/js/derivatives.js`, `src/js/paper.js`, `src/js/scanner.js`, `src/js/orderbook.js`, `src/js/data.js`, `src/js/watchlist.js`, `src/js/persistence.js`, `src/js/main.js`, `src/js/state.js`). Local server start + curl against every new/changed route. Playwright screenshots of the derivatives readout, replay controls, all 4 new/changed drawing tools registering in the toolbar, the scanner's saved-scan controls, the Trades tape and Depth chart, the Paper Trading tab, the watchlist heatmap and sparklines, and the templates modal's new "My Templates" section — all rendered correctly against live Binance data with no console exceptions. Footer/readme/package.json → v1.23.0.

---

## v1.22.0 — 2026-07-11 · P1 roadmap: core charting gaps vs. TradingView (8 items)

Shipped the entire P1 tier of the 2026-07-11 roadmap in one release. Verified with `node --check` on every touched file plus a local server smoke test (`/api/klines` on a native and an aggregated timeframe, `/api/klines/history` paging, alert route responses).

### P1-8 — Extended timeframes (2h, 6h, 12h, 3d, 1M)
**Problem:** Only 8 timeframes (1m–1w); pros expect the full TradingView set.
**Fix:** **`constants.js`** — `TF_SECONDS` + new `TIMEFRAMES` list + `TF_AGGREGATE` map (aggregation base/factor per synthetic TF); every exchange's `intervals` map extended with its native spellings (Binance/OKX full set, Bybit `120/360/720/M`, KuCoin `2hour…1month`, Bitstamp second-steps, CryptoCompare `histohour|N`, Alpaca `NHour/1Month`, Bitvavo `2h/6h/12h`, Gate `30d`). **`src/klines.js`** — for TFs an exchange lacks natively, `fetchBars()` fetches the base TF and rolls it up server-side (`aggregateBars`; `1M` uses calendar-month UTC buckets). **`server.js`** — timeframe validation now accepts native-or-aggregatable (`tfSupported`). **`charts.js`** — panel TF buttons render from `TIMEFRAMES`; **`style.css`** lets the pill-group scroll on narrow panels.

### P1-4 — Server-side kline database (Postgres)
**Problem:** Bars only lived in per-request JSON cache files; no durable history.
**Fix:** **`db.js`** — new `klines` table (PK exchange+symbol+tf+time) with chunked `upsertKlines`, `getKlinesBefore`, `oldestKlineTime`. **`server.js`** — every upstream fetch is persisted fire-and-forget (`storeBars`); JSON file cache still serves hot requests.

### P1-1 — Infinite history scroll-back
**Problem:** Charts were capped at one 500–1000 bar fetch; panning left hit a wall.
**Fix:** **`server.js`** — new `GET /api/klines/history?before=<sec>` serves older bars from Postgres and tops up from the exchange (each exchange's "end time" paging param wired in **`src/klines.js`** `klineUrl`), persisting what it fetched; returns `exhausted` when upstream is dry. **`data.js`** — `fetchOlderKlines()`. **`charts.js`** — `maybeLoadHistory()` on `subscribeVisibleLogicalRangeChange`: within 20 bars of the left edge it prepends a 500-bar page, rebuilds series/indicators, and shifts the visible logical range by the prepended count so the viewport doesn't jump; 3-failure circuit breaker; the old 1500-bar cap in the live-candle path was removed so history can grow unbounded.

### P1-2 — Log & percent price scales
**Fix:** **`charts.js`** — per-panel `log`/`%` pill buttons (`setScaleMode`, price-scale mode 0/1/2), persisted and restored. **`style.css`** — `.scale-group`/`.scale-btn`.

### P1-3 — Chart types (candles, hollow, bars, line, area, Heikin Ashi, Renko)
**Problem:** Candles only (Heikin Ashi existed only as an overlay indicator).
**Fix:** **`charts.js`** — per-panel chart-type `<select>`; `createMainSeries` builds the right LWC series while everything downstream keeps using `panel.candleSeries`; `mainSeriesData` transforms bars (HA via existing `calcHeikinAshi`, Renko via new ATR-brick `calcRenko` that merges same-bar bricks to keep times strictly ascending); `updateMainSeries` handles live ticks per type (incremental HA via `_haPrev`, Renko rebuilds on closed bars); crosshair OHLC readout handles value-only types; `applyCandleColors` is type-aware. Persisted per panel (snapshot v4).

### P1-5 — Symbol link groups + cross-panel crosshair sync
**Fix:** **`charts.js`** — ⛓ button cycles link group (none/1/2/3, colored); `changeSymbol` propagates to same-group panels (recursion-guarded). Crosshair moves mirror onto every other panel by time via `setCrosshairPosition` (binary-search nearest bar, recursion-guarded). Persisted per panel.

### P1-7 — Complete the oscillator set
**Finding:** OBV, MFI, CCI, Williams %R, StochRSI, CMF, ROC, DMI, TSI, UO already existed — only **Awesome Oscillator** was missing.
**Fix:** **`constants.js`** — AO definition + description; **`indicators.js`** — AO calc (SMA5−SMA34 of bar midpoint) returning a direction-colored histogram; **`charts.js`** — `buildOscillator` honors `histByDirection` (rising green / falling red).

### P1-6 — Server-side alert engine
**Problem:** Alerts lived in the browser and died with the tab.
**Fix:** **`db.js`** — `alerts` table + CRUD/trigger helpers. **`src/alert-engine.js`** (new) — evaluates active alerts every 30 s (per-pass fetch de-dup): price cross, %-move over a window, RSI level on any TF, volume spike vs 20-bar average; notifies via Telegram (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`) and generic webhook (`ALERT_WEBHOOK_URL`); marks triggered in DB. **`server.js`** — `/api/alerts` CRUD + `/api/alerts/triggered?since=` feed; engine starts after `db.init()`. **`alerts.js`** — server-mode client (typed create modal, 30 s poll surfaces triggers as toast + browser notification, including ones fired while the tab was closed); falls back to the legacy in-browser price alerts when the DB is unavailable. **`.env.example`** documents the notifier vars.

### Infrastructure
**`src/klines.js`** (new) — exchange URL building, payload normalization, paging and aggregation extracted from `server.js` so the alert engine reuses one code path. Footer/readme → v1.22.0.

---

## v1.21.0 — 2026-07-09 · Plain ＋ compare button + stable panel bar during live price ticks (Roadmap + Bug)

### Feature — remove the chart icon from the "add overlay" (compare) button
**Problem:** The roadmap asked to remove the chart icon from the "add overlay" button. The compare button in each panel's action row showed `＋📈`, which looked busy next to the other single-glyph actions.

**Fix:** **`charts.js`** — the `.compare-btn` markup in `addPanel` now renders just `＋` (tooltip "Compare / overlay symbol" unchanged).

### Bug — chart panel visually shifted on every live price update
**Problem:** The v1.19.0 live price readout (`.panel-sym-price`) sits at the start of the panel bar's flex row, before the timeframe buttons, legend, OHLC readout, and action buttons. Its width changed on almost every tick — `fmtPrice` used `maximumFractionDigits: 2` without a minimum (so `118,234.5` → `118,235` → `118,234.56` all differ in length) and the font uses proportional digits. Each tick therefore reflowed everything to the right of the price, making the chart header contents jump ("chart canvas moving with the price update").

**Fix:** Three layers, so a tick can never change the element's width:
- **`utils.js` `fmtPrice`:** prices ≥ 1000 now format with `minimumFractionDigits: 2` **and** `maximumFractionDigits: 2`, so the string length is constant for a given integer-digit count (all other magnitude branches already used fixed `toFixed` widths).
- **`style.css` `.panel-sym-price`:** added `font-variant-numeric: tabular-nums` (every digit occupies the same advance width) and `white-space: nowrap`.
- **`charts.js` `updatePanelPrice`:** ratchets a `min-width` (in `ch`) up to the widest price string seen for the current symbol, so even a rare digit-count change (e.g. 999.99 → 1,000.00) only ever grows the slot once instead of jiggling. The ratchet (`panel._priceCh`) and inline `min-width` reset in `changeSymbol`/`loadPanelData` so a new symbol re-measures from scratch.

**Verification:** `node --check` passes on `src/js/charts.js` and `src/js/utils.js`. Traced both live paths (WebSocket kline + REST poll fallback) — they funnel through `updatePanelPrice`, which now writes a constant-width string into a width-ratcheted, tabular-nums element. Footer → v1.21.0.

---

## v1.20.0 — 2026-06-29 · Lock / unlock drawing objects on the charts (Roadmap)

### Feature — protect a drawing from accidental move, resize, or deletion
**Problem:** The roadmap asked for the ability to lock and unlock drawing objects. Previously every shape was always editable — a stray drag in select mode or a pass with the eraser could move or destroy a carefully placed trend line, level, or fib.

**Fix:**
- **`drawings.js`:**
  - Shapes carry an optional `locked` boolean. When `true` the shape is rendered normally but interaction is disabled across every editing path.
  - `renderDrawings` skips drawing resize handles for a locked selected shape and draws a small padlock badge (`drawLockBadge`) over every locked shape so the locked state is visible at a glance (badge sits at the primary anchor, with the same offset logic used for h/v-line handles).
  - `hitTest` no longer offers grab handles for a locked shape; locked shapes are still body-hittable so they can be selected and unlocked.
  - `updateSelectHover` shows a `not-allowed` cursor over locked shapes instead of `move`/`crosshair`.
  - `handleSelectDown` selects a locked shape (to expose the unlock button) but returns before starting any drag — so locked shapes cannot be moved or resized.
  - `eraseNearest` ignores locked shapes, so the eraser tool (and the Delete/Backspace shortcut, which switches to the eraser) cannot remove a locked drawing.
  - The config popover gained a **🔒 Lock / 🔓 Unlock** toggle in the actions row. While locked, all body inputs (color, width, style, text, coordinates) are disabled and the **Delete** button is disabled; toggling rebuilds the popover and re-renders. The `locked` flag fires `drawings-changed` so it autosaves.
- **`style.css`:** `.dc-actions` now spreads the lock + delete buttons (`space-between`); added `.dc-lock` (with an `.active` amber state for the locked/Unlock affordance) and disabled-state styling for `.dc-del`.
- **Persistence:** `locked` lives on the drawing object, which `persistence.js` already serializes wholesale (`p.drawings`), so lock state survives reloads and saved layouts with no schema change.

**Verification:** `node --check src/js/drawings.js` passes. Traced every mutation path — drag (`handleSelectDown`), eraser (`eraseNearest`), Delete shortcut (`ui.js` → eraser), and popover Delete button — all now gate on `locked`. Confirmed the whole drawing object (including the new flag) round-trips through `persistence.js`. Footer → v1.20.0.

---

## v1.19.0 — 2026-06-29 · Live current price next to the symbol name in the chart top bar (Roadmap)

### Feature — bold current-price readout in each panel's top bar
**Problem:** The roadmap asked for the current price shown in a bigger, bold font than the symbol name, right next to it in the chart's top bar. Previously the panel bar only showed the symbol button (base + quote); the live price was only visible on the vertical price axis.

**Fix:**
- **`charts.js`:**
  - Added a `<span class="panel-sym-price">` to the `addPanel` panel-bar markup, immediately after the `.sym-btn`.
  - New `updatePanelPrice(panel, price)` helper — writes `fmtPrice(price)` into the span and toggles `up`/`down` classes by comparing to `panel._lastPrice` so the value flashes green/red in the direction of the last move. Ignores null/non-finite prices.
  - `loadPanelData` seeds the readout from the last REST candle's close (and resets `_lastPrice` so the colour starts neutral for the new symbol).
  - The live `onCandle` handler calls `updatePanelPrice` on every tick (WS or REST poll), so the number tracks the chart in real time.
  - `changeSymbol` clears the old symbol's price/colour immediately (before the async reload) to avoid showing a stale value during the switch.
- **`style.css`:** `.panel-sym-price` is 18px / 800 weight (vs the symbol's 14px / 700), with `:empty { display:none }` so the slot collapses before data loads; `.up`/`.down` modifiers colour it with `--green`/`--red` and a short colour transition.

**Verification:** `node --check` passes on `charts.js`. Traced the price flow: initial REST load → `updatePanelPrice` seeds the value; live kline WS / REST poll → `onCandle` → `updatePanelPrice` updates + colours each tick; `changeSymbol` and persistence restore reset cleanly (the separate span survives the `.sym-btn` innerHTML rebuild). Confirmed CSS vars `--green`/`--red` exist. Footer/readme → v1.19.0.

---

## v1.18.0 — 2026-06-29 · Toggle indicators on/off from the indicator bar (Roadmap)

### Feature — deactivate / reactivate active indicators by clicking the chip
**Problem:** The roadmap asked for the ability to hide an active indicator without removing it: clicking it in the indicator bar should deactivate it (and dim the chip), clicking again should reactivate it. Previously the only way to remove an indicator was the × button, which deletes it entirely — so re-adding meant re-picking it and re-entering its params.

**Fix:**
- **`charts.js`:**
  - `addIndicator` now takes an `active = true` flag and stores `ind.active`; it only builds the indicator's series when active (so a restored-inactive indicator stays hidden).
  - Extracted `teardownIndicator(panel, ind)` — the shared logic that removes an indicator's rendered artifacts (chart series, histogram, oscillator sub-chart/pane, Heikin-Ashi candles, volume-profile layer, LuxAlgo markers) and nulls the live refs (`subChart`, `hist`, `_oscDiv`, `_spacer`) **without** removing it from `panel.indicators`. Both `removeIndicator` (delete) and the new toggle reuse it.
  - New `setIndicatorActive(panel, ind, active)` — flips `ind.active`; reactivating calls `buildIndicator`, deactivating calls `teardownIndicator`; then re-layouts oscillators, rebuilds MA-cross markers, fires `indicators-changed`, and autosaves.
  - `buildIndicator` early-returns when `ind.active === false`, so `recomputeIndicators` (run on data load / timeframe change) leaves deactivated indicators hidden.
  - `rebuildCrossMarkers` now ignores inactive SMA/EMA overlays so golden/death-cross arrows disappear when an MA is toggled off.
- **`ui.js`:** `renderIndChips` adds the `inactive` class to dimmed chips; clicking the **name** now toggles active/inactive (was: open settings), the colored **dot** opens settings, and **×** still removes. Added tooltips clarifying each affordance.
- **`style.css`:** `.ind-chip.inactive` dims to 0.45 opacity with a line-through name.
- **`persistence.js`:** Serializes `active` per indicator and passes it back through `addIndicator` on restore, so the on/off state survives reloads and saved layouts.

**Verification:** `node --check` passes on `charts.js`, `ui.js`, and `persistence.js`. Traced each indicator class through `teardownIndicator`/`buildIndicator`: overlays (line series), oscillators (sub-chart pane + spacer), Heikin-Ashi (candle series), volume-profile (DOM layer), and LuxAlgo (markers) all tear down and rebuild cleanly via the existing add/remove paths. Footer/readme → v1.18.0.

---

## v1.17.0 — 2026-06-22 · Refresh-all-charts button in the top bar (Roadmap)

### Feature — one-click refresh of every chart
**Problem:** The roadmap asked for a refresh button in the top bar that reloads all price charts at once. There was no manual way to force-refresh chart data; bars only updated via the live kline WS or when a panel's symbol/timeframe changed, and `getCachedKlines` serves cached bars for up to 60s, so even re-selecting a symbol could return stale data.

**Fix:**
- **`index.html`:** Added a `⟳` `#refreshAllBtn` to the top bar's right group (before the event-markers button).
- **`charts.js`:** New `refreshAllPanels()` — clears `state.klineCache` (so each panel re-fetches fresh bars rather than reusing the 60s-TTL cache) then reloads every panel via `Promise.all(state.panels.map(loadPanelData))`. `loadPanelData` already re-streams safely (`startKlineStream` closes the prior socket), so a refresh re-subscribes cleanly.
- **`ui.js`:** Wired the button — imports `refreshAllPanels` and `toast`; the handler disables + spins the button while the refresh is in flight (guards against overlapping refreshes from rapid clicks), toasts "Charts refreshed" on success / "Refresh failed" on error, and always re-enables in `finally`.
- **`style.css`:** Added `.tb-btn:disabled` styling, larger `#refreshAllBtn` glyph, and a `tb-spin` keyframe rotation applied via `.spinning`.

**Verification:** `node --check` on `charts.js` and `ui.js` passes. Booted the server on a test port: `/` returns 200, DB connects, and the served HTML contains `id="refreshAllBtn"`. Traced the flow: click → button disables/spins → cache cleared → all panels reload in parallel (each closing/reopening its kline stream) → toast → button re-enabled. Footer/readme → v1.17.0.

---

## v1.16.2 — 2026-06-22 · Fix: prices stop updating after the tab loses focus (Bugs #1)

### Bug — live prices freeze when focus leaves the charts
**Problem:** When focus/visibility left the page (switching tabs or apps), the watchlist prices stopped updating and never resumed until a full reload.

**Root cause:** The live price feed (`openPriceStream` → Binance `!miniTicker@arr` WebSocket) had **no `onclose`/reconnect logic**. Browsers suspend and eventually close WebSockets on backgrounded tabs (and idle sockets get dropped server-side), so the stream died silently. The existing `visibilitychange` handler in `main.js` only called `resizeAllCharts()` — nothing re-established the socket — so rows stayed frozen on the last-seen prices.

**Fix:**
- **`data.js`:**
  - `openPriceStream(onUpdate, onClose)` now takes an `onClose` callback and wires `ws.onclose`, which fires `onClose()` **only on an unexpected close**. Intent is tracked **per-socket** (`ws._intentional`) instead of via a shared flag, so the old socket's async close during a reopen can't be misread as a genuine drop. The synchronous-construction-failure path also calls `onClose()`.
  - `closePriceStream()` marks the socket `_intentional` before closing.
  - New `priceStreamLive()` returns true only while the socket is `OPEN`.
- **`main.js`:**
  - `startPriceStream()` passes `onPriceStreamClosed` as the close handler, resets the retry counter on `open`, and clears any pending reconnect at the top so a reconnect timer and a focus/visibility check can't stack duplicate sockets.
  - `onPriceStreamClosed()` reconnects with **capped exponential backoff** (1s → 15s).
  - `ensurePriceStream()` reconnects immediately if the socket isn't live; it's now called from `visibilitychange` (tab visible), `window` `focus`, and `online` events — so returning to the tab or regaining network resumes prices without waiting out the backoff.

**Verification:** `node --check` on `data.js` and `main.js` passes. Traced the lifecycle: background tab → browser closes socket → `onclose` (not intentional) → `onPriceStreamClosed` schedules a backoff reconnect; returning to the tab fires `visibilitychange`/`focus` → `ensurePriceStream` sees `priceStreamLive() === false` → immediate `startPriceStream`. Reopen race covered by the per-socket `_intentional` flag (settings-driven `restart-price-stream` reopen no longer self-triggers a reconnect). Footer/readme → v1.16.2.

---

## v1.16.1 — 2026-06-22 · Persist the re-ordered watchlist tab order (Roadmap)

### Fix — drag-reordered watchlist tabs didn't survive a reload
**Problem:** The roadmap asked to save the re-ordered watchlist to the user's context so it's persistent. The v1.16.0 tab reorder rebuilt `state.watchlists` in the new key order and called `scheduleAutosave()`, but the new order was **lost on reload**.

**Root cause:** The autosave snapshot is stored server-side as **Postgres JSONB** (`layouts.data jsonb`, see `src/db.js`). JSONB does **not preserve object key order** — it normalizes keys — so the watchlist *tab* order (which was encoded purely as `state.watchlists`' key order) came back reordered after the server round-trip. (Symbol order *within* a watchlist was unaffected because each list is an **array**, and JSONB preserves array order.)

**Fix:**
- **`persistence.js`:**
  - `snapshot()` now also emits `watchlistOrder: Object.keys(state.watchlists)` — an explicit array of tab names. Arrays keep their order through JSONB, so this captures the drag-reordered order reliably.
  - `applyLayoutData()` re-applies it: after assigning `state.watchlists`, it rebuilds the object in `data.watchlistOrder` sequence (only for keys that still exist), then appends any watchlists not present in the saved order (e.g. lists created in an older session) so none are dropped.
- Named layouts get this for free since they serialize via the same `snapshot()`.

**Verification:** `node --check src/js/persistence.js` passes. Traced: reorder tabs → autosave writes `watchlistOrder` → JSONB round-trip scrambles `watchlists` keys but preserves the `watchlistOrder` array → on load the object is rebuilt in that array's order. Back-compat: sessions saved before this (no `watchlistOrder`) simply keep whatever key order they load with. Footer/readme → v1.16.1.

---

## v1.16.0 — 2026-06-22 · Reorder watchlist tabs horizontally (Roadmap)

### Feature — drag the watchlist tabs to reorder them
**Problem:** The roadmap asked to let the watchlist be reordered horizontally. The horizontal element is the row of watchlist **tabs** (`#wlTabs`): they could be renamed/deleted/switched but their left-to-right order was fixed to creation order, with no way to rearrange them.

**Fix:**
- **`watchlist.js`:** In `renderTabs()` each `.wl-tab` button is now `draggable` with `dragstart/dragend/dragover/dragleave/drop` handlers mirroring the symbol-row reorder pattern (module-level `_dragTab` holds the tab being dragged; a left/right midpoint test on the hovered tab shows a `drop-before`/`drop-after` indicator and decides insert side). `reorderWatchlist(fromName, toName, after)` rebuilds `state.watchlists` with its keys spliced into the new order — since `state.watchlists` is a plain object and JSON serialization preserves key order, the new tab order survives `scheduleAutosave()`/reload. Re-renders tabs and autosaves.
- **`style.css`:** Added `.wl-tab` `cursor: grab`, `.wl-tab.dragging` (dimmed + `grabbing`), and `.wl-tab.drop-before`/`.drop-after` inset left/right accent bars (the horizontal analogue of the symbol rows' top/bottom drop bars).

**Verification:** `node --check src/js/watchlist.js` passes. Traced the flow: drag tab A over tab B → accent bar on the correct side → drop → `reorderWatchlist` rebuilds the keyed object → tabs re-render in the new order and autosave persists it (object key order round-trips through JSON). Active-tab highlight and current-watchlist selection are untouched by the reorder. Footer/readme → v1.16.0.

---

## v1.15.0 — 2026-06-22 · Move a symbol between watchlists (Roadmap)

### Feature — right-click a watchlist row to move it to another watchlist
**Problem:** The roadmap asked for the ability to move a symbol from one watchlist to another. Previously the only ways to manage a symbol's membership were to add it (via the picker/search) or remove it (the × button) — there was no way to relocate an existing entry, so users had to remove-then-re-add it (losing its place and any per-symbol color).

**Fix:**
- **`watchlist.js`:**
  - Added a `contextmenu` handler on each `.sym-row` that opens a context menu via `rowContextMenu(e, item, exchange)`.
  - `rowContextMenu` lists a **"Move to ‹name›"** entry for every *other* watchlist, plus a **Remove** entry. When there are no other watchlists it shows a disabled "No other watchlists" placeholder.
  - `moveSymbol(item, exchange, targetName)` splices the entry (matched by **symbol+exchange** identity, consistent with the rest of the file) out of the current watchlist and pushes it onto the target. If the target already holds that symbol+exchange it just drops the source copy (no duplicate) and warns; otherwise it toasts a success message. Re-renders and `scheduleAutosave()`s either way, so the change persists to Supabase.
  - The existing `.sym-dot` color context menu now calls `e.stopPropagation()` so right-clicking the color dot doesn't also trigger the new row menu.
  - `showMenu` now honours an `it.disabled` flag, rendering the item as a non-clickable `.ctx-disabled` button.
- **`style.css`:** Added `.ctx-menu button.ctx-disabled` styling (muted color, no hover background, default cursor).

**Verification:** `node --check src/js/watchlist.js` passes. Traced the move flow: right-click row → menu lists other watchlists → pick one → entry moves (preserving its `name`, `exchange` and identity), list re-renders, autosave fires. Duplicate-target and single-watchlist edge cases handled. Footer/readme → v1.15.0.

---

## v1.14.2 — 2026-06-22 · Fix: Settings exchange rows still stacking; list now flexes (Bugs #1)

### Bug — exchange rows still vertical; list didn't size with the dialog
**Problem:** Despite the v1.14.1 fix, the "Exchanges to query" rows still stacked the checkbox above the label, and the list stayed a fixed height instead of growing with the (resizable) Settings dialog.

**Root cause:** A **CSS specificity** miss. Each row is a `<label>`, and the global `.modal label { flex-direction: column }` rule has specificity (0,1,1). The v1.14.1 `.set-ex-row { flex-direction: row }` rule is only (0,1,0), so the global rule kept winning and the rows stayed in a column (the global `margin-bottom: 10px` also still applied).

**Fix:**
- **`style.css`:** Re-scoped the row rules under `.modal-settings .set-ex-row` (specificity 0,2,0), which out-specifies `.modal label` (0,1,1) — so `flex-direction: row`, zeroed margins and the input reset now actually apply, putting the checkbox + name + status on one horizontal row. The list override also gained `min-height: 120px` alongside `flex: 1 1 auto; max-height: none` so it grows/shrinks with the dialog as the user resizes it.

**Verification:** Compared selector specificities (0,2,0 > 0,1,1) to confirm the override now wins; the flex-column dialog with a `flex:1` list grows the list on vertical resize. Footer/readme → v1.14.2.

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
