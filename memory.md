# CryptoPro Charts — Change Memory

---

## 2026-06-15 — Show full pairs in symbol list (BTCUSDT / ETHEUR / ADAUSDC)

**Problem:** The watchlist rows showed only the base asset ("BTC", "ETH") and all USDT-related labels were hardcoded to "USDT", so USDC/EUR pairs were always labelled incorrectly.

**Fix:**
- `src/js/watchlist.js`: Imported `quoteAsset` from utils. Changed `renderSymbolList` `.sym-name` to `baseAsset(symbol) + <span class="sym-quote-tag">quoteAsset(symbol)</span>` so both the base and the actual quote currency are shown (e.g. `BTC USDT`, `ETH EUR`, `ADA USDC`). Changed the symbol picker items and search-results dropdown `<span>USDT</span>` to `<span>${quoteAsset(r.symbol)}</span>`. Changed the "Added" toast to show the full pair symbol.
- `public/css/style.css`: Added `.sym-quote-tag` — 10 px, muted colour, normal weight — so the quote suffix is readable but visually subordinate to the bold base asset.

**Verification:** `node --check src/js/watchlist.js` passed.

---

## 2026-06-15 — Footer bar + SVG drawing toolbar icons

**Roadmap 1 — Footer bar**
- `public/index.html`: Added `<footer class="app-footer">` between `app-main` and `alerts-overlay` containing: logo (📈 CryptoPro Charts), short description, creator (Erik Kuipers), and year (© 2026).
- `public/css/style.css`: Added `.app-footer` (30px fixed height, flex, panel background with top border), `.footer-logo b` (accent colour), `.footer-sep` (border colour), responsive rule that hides description on narrow screens.

**Roadmap 2 — SVG drawing toolbar icons**
- `src/js/ui.js`: Replaced all Unicode placeholder characters in `DRAW_TOOLS` with clean 15×15 inline SVG icons (stroke-based, `currentColor`). Added `_I()` helper and `_S` stroke-attribute constant at module scope. All 13 drawing tools now have purpose-built SVG paths: cursor arrow, trend-line with endpoints, ray with arrowhead, extended line with double arrowhead, horizontal/vertical lines with end caps, rectangle, parallel channel, FIB retracement/extension with labelled horizontal lines, text A, measure bracket, eraser. The three action buttons (export/import/clear) also get SVG download, upload, and trash icons. Changed `b.textContent = t.icon` → `b.innerHTML = t.icon` so SVG renders.
- `public/css/style.css`: Updated `.draw-tool` — removed `font-size: 15px`, set `color: var(--muted)` default, added `svg { display: block; }`. Hover now also sets `color: var(--text)`.

**Verification:** `node --check src/js/ui.js` passed.

---

## 2026-06-15 — Roadmap: Fancy Buttons, Enhanced Tech Info, Multi-Quote, Layout Dropdown

**Roadmap 1 — Fancy buttons**
- `public/css/style.css`: Added `transition` on `.tb-btn`, `.sym-btn`, `.tf-btn`, `.ts-btn`, `.panel-act`, `.draw-tool`, `.wl-footer button`, `.primary-btn`, `.right-tab`. Symbol button gets a `var(--panel2)` background and accent hover border. Timeframe buttons grouped in a pill container with consistent active styling. Right panel tabs get animated underline via `::after`. Primary buttons get brightness/scale transitions.

**Roadmap 2 — Enhanced Symbol Info Pane**
- `src/js/orderbook.js`: Added `getCachedKlines` import. Added helper functions: `calcRSI14` (Wilder's RSI from 1d closes), `perfPill` (colored % badge), `rangeGaugeSvg` (horizontal gauge with thumb), `rsiSpeedometerSvg` (SVG semi-circle gauge with 3 colour zones and needle), `seasonalsChartSvg` (SVG bar chart of average monthly returns). `refreshTechInfo` now fetches both `fetchPrice` and `getCachedKlines('1d', 400)` in parallel. Renders: 7D/1M/1Y performance pills, 4-cell OHLV grid, Day's Range gauge, 52-Week Range gauge, RSI speedometer, seasonals chart.
- `public/css/style.css`: Added `.ti-header`, `.ti-perfs`, `.ti-perf-pill`, `.ti-divider`, `.ti-section-label`, `.ti-range-*`, `.ti-speedometer-*`, `.ti-seasonals`, `.ti-alert-btn` styles.

**Roadmap 3 — Multi-Quote Symbol Support (USDT / USDC / EUR)**
- `src/js/utils.js`: Extended `baseAsset` regex to also strip EUR/BTC/ETH/BNB/DAI. Added `quoteAsset(symbol)` that returns the quote currency (defaults to USDT).
- `src/js/data.js`: Imported `baseAsset`, `quoteAsset`. Added `SUPPORTED_QUOTES = ['USDT','USDC','EUR']`. `toExchangeSymbol` now uses `baseAsset`/`quoteAsset` so OKX and Gate symbols include the correct quote. `fetchBinancePairs`/`fetchExchangePairs` now include USDC and EUR pairs. Price stream now accepts all `SUPPORTED_QUOTES` endings.
- `src/js/charts.js`: Imported `quoteAsset`. Panel bar button and `changeSymbol` now show the correct quote via `quoteAsset(symbol)` instead of hardcoded "USDT".
- `src/js/persistence.js`: Imported `baseAsset`, `quoteAsset`. `applyLayoutData` panel symbol button now uses `baseAsset`/`quoteAsset` instead of `.replace(/USDT$/, '')`.
- `server.js`: `toExSymbol` now parses the real quote currency from the symbol string before building OKX/Gate URLs.

**Roadmap 4 — Layout Selector Dropdown**
- `public/index.html`: Replaced the `.tb-group.layouts` preset buttons with a `#layoutDropWrap` containing `#layoutDropBtn` and `#layoutDropMenu`.
- `src/js/ui.js`: Imported `getNamedLayouts`, `applyLayoutData` from persistence. Added `LAYOUT_NAMES`, `LAYOUT_ICONS` constants. Added `updateLayoutDropBtn()` (exported), `openLayoutDropdown()` (async, loads saved layouts + presets on open, closes other dropdown too), `closeLayoutDropdown()`. Removed `.layout-opt` event wiring. Added `#layoutDropBtn` click handler and merged click-outside handler.
- `src/js/main.js`: Imported `updateLayoutDropBtn`. Removed `.layout-opt` active-class toggling. `layout-restored` event handler calls `updateLayoutDropBtn()`.
- `public/css/style.css`: Added `.layout-drop-wrap`, `.layout-drop-btn`, `.layout-drop-menu`, `.ld-sep`, `.ld-item`, `.ld-icon` styles.

**Verification:** `node --check` passed on all 7 modified JS files (utils.js, data.js, charts.js, persistence.js, ui.js, orderbook.js, main.js) and server.js.

---

## 2026-06-15 — Rename to "CryptoPro Charts"

**Date:** 2026-06-15
**Change:** Renamed the product from "Crypto Charting Pro" to "CryptoPro Charts" across all
user-visible surfaces.
- `public/index.html`: `<title>` updated; logo span changed to `📈 **CryptoPro** Charts`.
- `server.js`: startup log message updated.
- `src/js/main.js`: ready log message updated.
- `memory.md`: header updated.
**Verified:** Grepped all `.html`, `.js`, `.json`, `.md` files — no remaining "Crypto Charting Pro" in user-facing text (only in historical changelog entries).

---

## 2026-06-15 — Roadmap + Bug fixes (5 roadmap items, 2 bugs)

**Date:** 2026-06-15

### Bug 1 — Double tooltip on indicator hover
**Problem:** `b.title = desc` set a native browser tooltip alongside the custom `showIndTooltip`
floating div, causing two tooltips to appear simultaneously.
**Fix (`src/js/ui.js`):** Removed the `b.title = desc` line; the custom tooltip is sufficient.

### Bug 2 — Indicator toggle in price chart does nothing
**Problem:** The ƒ button in each panel bar dispatched `open-indicators`, which was wired to
`document.getElementById('leftPanel').classList.remove('collapsed')`. With the left panel
redesigned (Roadmap #2), this event now opens the indicators dropdown instead, making the button
functional again.
**Fix (`src/js/ui.js`):** `open-indicators` handler changed from `leftPanel.remove('collapsed')`
to `openIndDropdown()`.

### Roadmap 1 — Event markers on the x-axis (click-to-show + 2-week future window)
**Change (`src/js/events.js`):**
- Markers now use `position: 'belowBar'` (closest LWC approximation to x-axis) with `size: 1`.
- Past events: no text on the marker — click the dot to open the event detail modal.
- Future events (within 14 days of now): projected onto the time grid using `floor(ts / tfSec) * tfSec`;
  short date label shown (e.g. "Jun 18") since click detection on projected bars is unreliable.
  Future markers are blue (`#2962ff`) vs red for past events.
- Added `TF_SECONDS` import from constants.js for the projection calculation.

### Roadmap 2 — Indicators as multi-select dropdown in topbar
**Change (`public/index.html`, `src/js/ui.js`, `public/css/style.css`):**
- Removed the indicator search + list from `#leftPanel`; left panel now shows only "Active on chart"
  chips (width reduced 230px → 180px). Removed `#toggleLeft` button from topbar.
- New `<button id="indDropBtn">Indicators ▾</button>` in the topbar (first group).
- New `<div id="indDropdown">` floating panel (fixed, positioned below the button) containing
  `#indFilter` + `#indList` — same elements, same IDs, same JS render logic (`buildIndicatorDropdown`).
- Clicking an indicator adds it to the active panel; dropdown stays open for multi-add.
- Click-outside listener closes it automatically.
- Bug 2 is fixed as a side-effect: `open-indicators` now opens this dropdown.

### Roadmap 3 — Toggle to hide event markers
**Change (`src/js/state.js`, `src/js/events.js`, `src/js/ui.js`, `public/index.html`, `public/css/style.css`):**
- `state.showEventMarkers = true` (default on).
- New `export function setEventMarkersVisible(visible)` in `events.js` — updates state and
  re-applies/clears markers on all panels.
- `<button id="evtMarkersBtn">📅</button>` in topbar right group, styled with `.evt-markers-btn`.
  Button is dimmed (`.active` toggled) to reflect current state.

### Roadmap 4 — Dynamic decimals on price axis
**Change (`src/js/constants.js`, `src/js/charts.js`):**
- Added `export const TF_SECONDS` to `constants.js`.
- `dynamicPriceFormat(price)` function in `charts.js` returns `{ type:'price', precision, minMove }`
  based on price magnitude (e.g. BTC ≥ 10 000 → 0 decimals; SHIB < 0.01 → 8 decimals).
- Called in `loadPanelData` right after `candleSeries.setData()`.

### Roadmap 5 — Candle countdown timer
**Change (`src/js/charts.js`, `public/css/style.css`):**
- `<span class="candle-timer">` added to every panel's `.panel-bar` (between ohlc-info and actions).
- Module-level `setInterval` in `charts.js` runs every second, computes remaining time until the
  next candle boundary (`ceil(now / tfSec) * tfSec - now`) for each panel's current TF, and renders
  `m:ss` or `h:mm:ss` into the element.

**Verified:** `node --check` passes on all edited JS files. HTML validates (no unclosed tags).

---

## 2026-06-15 — Favicon: candlestick chart SVG

**Date:** 2026-06-15
**Change:** Added `public/favicon.svg` — a 32×32 SVG icon showing three candlesticks in a
classic uptrend pattern (one red/bearish candle followed by two progressively taller
green/bullish candles), with a blue accent trend line connecting the closes.
Colors match the app's own palette: background `#131722`, green `#26a69a`, red `#ef5350`,
blue accent `#2962ff`. Linked from `public/index.html` via
`<link rel="icon" type="image/svg+xml" href="/favicon.svg">`. SVG favicons are supported
natively by Chrome, Firefox, and Edge; Safari renders the default icon as fallback.
**Verified:** SVG is well-formed; the `<link>` tag is placed in `<head>` before the stylesheet.

---

## 2026-06-15 — Roadmap: save layouts and session state in backend JSON

**Date:** 2026-06-15
**Roadmap item:** "Save layouts and sessions state in backend data. Preferably in JSON format."
**Problem:** All layout and session persistence was client-side only (`localStorage`). Data was lost
when the browser cleared its storage, and could not be shared across browsers or devices.
**Fix:**
- `server.js`: Added `express.json({ limit: '2mb' })` middleware. Added `SESSION_FILE`
  (`data/session.json`) and `LAYOUTS_DIR` (`data/layouts/`) constants. Added 5 new routes:
  `GET /api/session` (read autosave), `PUT /api/session` (write autosave),
  `GET /api/layouts` (list all named layouts as `{name: data}` keyed by decoded filename),
  `PUT /api/layouts/:name` (save layout — filename = `encodeURIComponent(name).json`),
  `DELETE /api/layouts/:name` (delete layout). Name validation (`validLayoutName`) prevents
  path traversal; max 80 chars, no `..`, `/`, or `\`.
- `src/js/persistence.js`: Added `apiGet/apiPut/apiDelete` fetch helpers. `autosave` now
  calls `persistSession()` (fire-and-forget debounced) which PUTs `/api/session`; falls back
  to `localStorage` on error. `loadAutosave` is now `async` — GETs `/api/session` first,
  falls back to `localStorage`. `getNamedLayouts`, `saveNamedLayout`, `deleteNamedLayout`
  all async, using server API as primary and `localStorage` as fallback. `showLayoutsModal`
  made async to await the server layouts list. Removed unused `SETTINGS_KEY` constant.
- `src/js/main.js`: `init()` made `async`; `loadAutosave()` call is now `await`ed so
  the rest of init runs only after the session is restored from the server.
- `.gitignore`: Added `data/session.json` and `data/layouts/` (user runtime data, not for git).
**Verified:** `node --check` passes on server.js, persistence.js, main.js. The API routes are
placed before the static middleware so they take priority. Fallback to localStorage ensures the
app still works when opened without the server running.

This file tracks every significant change made to `index.html` for future reference.

---

## 2026-06-14 — Bug fix #1: Bybit chart price not updating real-time

**Date:** 2026-06-14
**Problem (Bugs #1):** `openKlineStream` in `src/js/data.js` returned `null` for any exchange
other than Binance (`if (e.id !== 'binance') return null`), so on Bybit no live candle feed was
opened and the chart price never updated in real time.
**Fix (`src/js/data.js`):** Reworked `openKlineStream` to branch by exchange and added
`openBybitKlineStream(symbol, interval, onCandle)` — connects to `wss://stream.bybit.com/v5/public/spot`,
subscribes to `kline.{interval}.{symbol}`, maps each push (`start/open/high/low/close/volume/confirm`)
to the app's candle shape (`closed` = `confirm`), and runs a 20s keep-alive ping that is cleared
on socket close/error. OKX/Gate/Hyperliquid still return `null` (no public WS wired yet).
**Why it now works:** `setExchange` and timeframe/symbol changes all re-run `loadPanelData` →
`startKlineStream` → `openKlineStream`, which now returns a live Bybit socket; charts.js updates
the last candle on each push (and recomputes MA crossings on `confirm`).
**Verified:** `node --check` passes on data.js. Returned object matches the Binance branch's
shape, so `startKlineStream`'s update logic is unchanged. (No browser run per project rule.)

---

## 2026-06-14 — Roadmap #1: market events pane + chart event markers

**Date:** 2026-06-14
**Change:** Added an "Events" tab beside the Watchlist holding macro/crypto events (FOMC, CPI,
NFP, ECB, options expiry, …). High-impact events are marked on every chart's x-axis; clicking
a marker — or an event row — opens a details modal.
**How:**
- `data/events.json`: curated calendar (`{events:[{id,date(ISO UTC),title,category,country,
  impact,detail}]}`), 2026 macro dates around the current period so markers fall in view.
- `server.js`: `GET /api/events` serves the JSON file (500 + empty list on error).
- `src/js/events.js` (new): `initEvents()` fetches `/api/events`, renders the pane (with a
  "High impact only" filter), and on every `panel-data-loaded` calls `applyEventMarkers(panel)`
  — maps each high-impact event to its nearest in-range bar (binary search), sets
  `panel._eventMarkers` + `panel._eventByTime`, and merges via `applyPanelMarkers`. Marker/row
  click shows `showEventDetails` modal. No circular import: charts.js dispatches the DOM event,
  events.js imports only `applyPanelMarkers` from charts.js.
- `src/js/charts.js`: `loadPanelData` now dispatches `panel-data-loaded`.
- `public/index.html`: Events tab button + `#eventsList` content.
- `src/js/main.js`: imports & calls `initEvents()`.
- `public/css/style.css`: events pane + detail-modal styles.
**Verified:** `node --check` passes on events.js/charts.js/main.js/server.js; `events.json`
parses. Earlier the live server returned 2026-dated Binance bars, so the June-2026 events align
with the visible candle range. (No browser run — "do not start the local server".)

---

## 2026-06-14 — Roadmap: cache fetched symbol bars in a JSON file

**Date:** 2026-06-14
**Change:** Historical klines are now cached server-side as JSON files on disk, so repeated
loads of the same symbol/timeframe don't re-hit the exchange (and CORS is avoided).
**How:**
- `server.js`: added `GET /api/klines?exchange&symbol&tf&limit`. Reusing `EXCHANGES` from
  `src/js/constants.js`, it builds the per-exchange kline URL, fetches via Node `fetch`,
  normalises to `[{time,open,high,low,close,volume}]`, and writes
  `cache/klines/<exchange>_<symbol>_<tf>_<limit>.json` (`{ts, bars}`). Serves a fresh cache
  within a per-TF TTL (30s for 1m … 15min for 1w); on upstream failure serves stale cache.
  Inputs validated (symbol `^[A-Z0-9]{2,20}$`, exchange whitelist, tf in interval map, limit
  clamped 1–1000) to keep the upstream URL safe (no SSRF).
- `src/js/data.js`: `fetchKlines` now tries `/api/klines` first and falls back to the existing
  direct-exchange logic if the route is unavailable or empty. Live updates stay on the
  client WebSocket; only historical bars are cached.
- `.gitignore`: ignore `cache/*` (and stray `ruvector.db`).
**Verified:** Started the server and curled the endpoint — returned normalized Binance bars,
wrote `cache/klines/binance_BTCUSDT_1h_5.json`, and rejected an invalid symbol with HTTP 400.
(Verification done before the "do not start the local server" note was added.)

---

## 2026-06-14 — Roadmap #4 (orig #4): load more symbols from the active exchange

**Date:** 2026-06-14
**Change:** The "Add symbol" picker now lists pairs from the *currently selected* exchange
(was always Binance) and no longer truncates to 60 results.
**How:**
- `src/js/data.js`: rewrote `fetchAllPairs` to branch per exchange — Binance `exchangeInfo`,
  Bybit `instruments-info`, OKX `public/instruments`, Gate.io `currency_pairs` — each
  normalised to internal `BASEUSDT` form (so klines/overlays keep working). Falls back to
  Binance pairs on empty/error; de-dupes and sorts alphabetically. (`state.allPairs` is already
  cleared by `setExchange`, so switching exchange refetches.)
- `src/js/watchlist.js`: `showSymbolPicker` now pages results 100 at a time with a "Load more"
  button and a "Showing X of Y" count; search resets paging.
- `public/css/style.css`: added `.sym-picker-more` / `.sym-picker-count` (span both columns).
**Verified:** `node --check` passes on data.js and watchlist.js. Return shape `{symbol,name}[]`
is unchanged, so scanner.js/watchlist.js callers are unaffected.

---

## 2026-06-14 — Roadmap: EMA/SMA crossing markers (golden / death cross)

**Date:** 2026-06-14
**Change:** When two or more SMA/EMA overlays are on a panel, crossover markers now appear
on the candles: an up-arrow (up color, below bar) where a faster MA crosses above a slower
one, a down-arrow (down color, above bar) where it crosses below. Marker text names the pair
(e.g. `↑ EMA20/SMA50`).
**How (`src/js/charts.js`):**
- Added `rebuildCrossMarkers(panel)`: recomputes each SMA/EMA via `calcOverlay`, sorts by
  period, and detects sign changes of (fast − slow) between adjacent pairs.
- Added `applyPanelMarkers(panel)`: merges `panel._crossMarkers` with `panel._eventMarkers`
  (reserved for the events feature), sorts by time, and calls `candleSeries.setMarkers` once —
  so multiple marker sources don't clobber each other.
- Wired into `recomputeIndicators` (covers data/symbol/timeframe loads + param edits),
  `addIndicator`, `removeIndicator`, and the live kline stream on each closed bar.
**Verified:** `node --check` passes on charts.js. Markers only render when ≥2 MAs are present;
removing MAs clears them (sets `[]`).

---

## 2026-06-14 — Roadmap #2: hover descriptions for indicators

**Date:** 2026-06-14
**Change:** Hovering an indicator in the left pane now shows a styled tooltip with the
indicator's full name and a short plain-language description.
**How:**
- `src/js/constants.js`: added & exported `INDICATOR_DESC` — a map of one-line descriptions
  keyed by indicator id (covers all 33 indicators).
- `src/js/ui.js`: imported `INDICATOR_DESC`; each `.ind-item` gets a native `title` (fallback)
  plus `mouseenter`/`mouseleave` handlers that show a custom floating tooltip
  (`showIndTooltip`/`hideIndTooltip`), positioned right of the pane and flipped left if it
  would overflow the viewport.
- `public/css/style.css`: added `.ind-tooltip`/`.ind-tt-title`/`.ind-tt-desc` styles with a
  fade/slide-in transition.
**Verified:** Tooltip text is sourced from `INDICATOR_DESC[id]` (falls back to `def.full`);
hidden on click and mouseleave so it can't get stuck. (Visual browser check pending.)

---

## 2026-06-14 — Roadmap #3: show connected exchange in connection status

**Date:** 2026-06-14
**Change:** The topbar connection indicator now shows the active exchange name next to the
live-feed status dot.
**How:**
- `public/index.html`: wrapped the status dot in `.ws-conn` and added `#wsExchange` label.
- `src/js/ui.js`: imported `EXCHANGES`; `updateWSStatus()` now sets `#wsExchange` text to
  `EXCHANGES[state.settings.exchange].name` and a tooltip with the exchange capability status.
- `public/css/style.css`: styled `.ws-conn`/`.ws-exchange`; label brightens to `--text` when
  the dot is `.connected` (via `:has()`).
**Verified:** `updateWSStatus` runs on init and on every `restart-price-stream` (fired by
`setExchange`), so the label reflects the current exchange immediately and after switching.

---

## 2026-06-14 — Bug fix: watchlist column labels not right-aligned

**Date:** 2026-06-14
**Problem (Bugs #2):** The watchlist header (`#symListHead`) sits outside the scrolling
`.sym-list` container. When rows overflowed and a vertical scrollbar appeared, the rows
lost ~15px of width to the scrollbar while the header did not, shifting every right-aligned
numeric value (Price/Chg/%) left of its header label.
**Fix:**
- `public/css/style.css`: added `scrollbar-gutter: stable` to `.sym-list` (gutter always
  reserved, no shift between few/many rows) and `padding-right: calc(8px + var(--sb-w,0px))`
  to `.sym-list-head`.
- `src/js/watchlist.js`: added `syncHeaderGutter()` which measures the real gutter
  (`symList.offsetWidth - symList.clientWidth`) and publishes it as the `--sb-w` CSS var on
  init and on window resize, so the header padding matches the OS scrollbar width exactly.
**Verified:** Header content-box width now equals the rows' content-box width (both reduced
by the same gutter), so grid tracks 1–6 line up; numeric columns are right-aligned over their
values. (Visual browser verification pending — Playwright bridge unavailable in this env.)

---

## 2026-06-14 — Git config: set commit email

**Date:** 2026-06-14
**Change:** Set local git `user.email` to `erik.kuipers@sogeti.com` for this project only.
**Why:** User requested project-specific commit identity separate from global git config.
**Verified:** `git config user.email` returned `erik.kuipers@sogeti.com` immediately after setting.

---

## v1.0 — Initial build
**Date:** 2026-06-13

### Architecture
- Single-file HTML app (`index.html`) — no build step, open directly in browser
- Charting library: `lightweight-charts@4.1.3` via unpkg CDN
- Data source: Binance public REST API (`https://api.binance.com/api/v3`)
- Live prices & chart updates: Binance WebSocket (`wss://stream.binance.com:9443`)

### Layout
- Three-column main layout: Left panel (indicators) | Drawing toolbar | Charts area | Right panel (watchlist)
- Top bar: logo, panel-toggle buttons, layout switcher, global timeframe selector, theme toggle
- Responsive grid for chart panels; layout modes: single (l1), 2 side-by-side (l2h), 2 stacked (l2v), 4-grid (l4)

### Charts
- Candlestick series + volume histogram per panel
- Each panel: independent symbol, timeframe, indicators, drawing layer
- Active panel highlighted with blue border
- OHLCV crosshair info display in panel header
- Per-panel timeframe buttons: 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w
- Watermark shows base asset name (e.g. BTC)
- Live kline WebSocket per panel for real-time candle updates

### 20 Technical Indicators
**Overlays (rendered on price chart):**
1. SMA — Simple Moving Average
2. EMA — Exponential Moving Average
3. WMA — Weighted Moving Average
4. BB  — Bollinger Bands (3 lines: upper/mid/lower)
5. VWAP — Volume Weighted Average Price (resets daily)
6. Ichimoku Cloud (Tenkan, Kijun, Chikou, Senkou A/B)
7. Parabolic SAR
8. DEMA — Double EMA
9. TEMA — Triple EMA
10. Pivot Points (Pivot, R1/R2, S1/S2)

**Oscillators (rendered in synced sub-panels below chart):**
11. RSI — with 30/50/70 reference lines
12. MACD — MACD line + Signal line + Histogram
13. Stochastic — %K and %D with 20/80 reference lines
14. ATR — Average True Range
15. ADX — Average Directional Index with 25 reference line
16. CCI — Commodity Channel Index with ±100 reference lines
17. OBV — On-Balance Volume
18. Williams %R — with -20/-80 reference lines
19. MFI — Money Flow Index with 20/80 reference lines
20. ROC — Rate of Change with 0 reference line

Sub-panels are time-synced with the main chart (scroll/zoom propagates both ways).

### Symbol Selector (right panel)
- Width: 310px
- Search input for filtering symbols
- Watchlist tabs (context-menu: rename, delete)
- Sortable columns: Symbol, Price, Chg $, Chg %
  - Click column header to sort; click again to reverse direction
  - Default sort: by name ascending
- Inline × delete button on hover per symbol row
- Footer: "+ New Watchlist" / "+ Add Symbol" (validates symbol against Binance API)
- Live prices via Binance miniTicker WebSocket stream

**Default watchlists:**
- Favorites (BTC, ETH, BNB, SOL, XRP, ADA, DOGE, AVAX, LINK, DOT)
- DeFi (UNI, AAVE, MKR, CRV, SUSHI, SNX, COMP, 1INCH)
- Layer 1 (ETH, SOL, AVAX, ADA, DOT, NEAR, ATOM, ALGO)
- Layer 2 (MATIC, ARB, OP, LDO, IMX)
- Meme (DOGE, SHIB, PEPE, FLOKI, WIF, BONK)

### Drawing Tools (vertical toolbar, 44px wide)
Color picker at top; Clear All button at bottom.

| Tool | Clicks | Notes |
|---|---|---|
| Select (cursor) | — | Re-enables chart pan/zoom |
| Trend Line | 2 | Anchored line with endpoint dots |
| Ray | 2 | Extends infinitely right |
| Extended Line | 2 | Extends both directions |
| Horizontal Line | 1 | Dashed, shows price label |
| Vertical Line | 1 | Dashed |
| Rectangle | 2 | Shaded fill |
| Parallel Channel | 3 | Two parallel lines with fill |
| Fibonacci Retracement | 2 | 7 levels, golden zone shaded |
| Fibonacci Extension | 2 | 5 extension levels |
| Text Annotation | 1 | Prompts for text input |
| Measure | 2 | Shows Δprice and Δ% with arrow |
| Eraser | click | Removes nearest drawing |

Drawings stored as {type, p1, p2, p3, color, width} in time/price coordinates.
Re-render triggered on: time-scale change, crosshair move, resize.

Keyboard shortcuts: T=trendline, H=hline, V=vline (note: also used for vert line), R=rect,
F=fib, M=measure, Backspace/Delete=eraser, Esc=cancel/return to cursor.

### Theme
- Dark (default): bg #131722, panels #1e222d, accent #2962ff, green #26a69a, red #ef5350
- Light: bg #f0f3fa, panels #ffffff
- Toggle button in topbar; updates all chart instances via `chart.applyOptions()`

### Chart Sizing
- `html { height: 100% }` + `body { height: 100% }` for proper cascade
- Charts area uses `overflow: auto` — scrollbars appear when panels exceed viewport
- Panel minimum size: 300px height × 320px width (enforced in grid)
- `main-chart-div` minimum height: 200px
- ResizeObserver on each chart container calls `chart.resize(w, h)` on change

### Error Handling
- 15-second fetch timeout on all Binance API calls
- Friendly error overlay with Retry button on data-load failure
- LightweightCharts library presence check before init
- `try/catch` around `initChart` in all call sites
- Console logging with `[CryptoPro]` prefix

---

---

## v1.3 — Mouse-wheel scrolling + Save/Load layouts
**Date:** 2026-06-13

### Mouse-wheel scrolling
Problem: LightweightCharts calls `preventDefault()` on wheel events on chart canvases, blocking the browser's native scroll of the charts-area container.

Solution (non-destructive):
- **Panel bar (header row)**: `wheel` event listener → calls `chartsArea.scrollBy()`. Since the header is 36px and visible, hovering there and wheeling scrolls the panel grid.
- **Chart body + Shift key**: `wheel` with `e.shiftKey` → scrolls charts area. Normal wheel = LightweightCharts zoom (untouched).
- Both listeners are `{ passive: true }` — they don't block LightweightCharts' zoom behavior.
- Added in `initChart()` via `requestAnimationFrame()` to ensure elements exist.

Side panels (indicators list, symbol list) have `overflow-y: auto` and scroll natively when hovered.

### Save / Load layouts & watchlists (localStorage)

**Auto-save** (`cryptopro_autosave`):
- Triggered (debounced 1500ms) after any state change: symbol change, timeframe change, indicator add/remove, drawing finalize, watchlist add/delete/rename/symbol changes, layout change, theme change.
- Automatically restored on page load inside `init()`.
- Snapshot includes: version, theme, layout, watchlists, currentWatchlist, wlSort, panels (symbol/symbolName/timeframe/indicators/drawings).

**Named layouts** (`cryptopro_layouts`):
- Max 10 saved layouts stored in localStorage.
- **Save** button in topbar (also Ctrl/Cmd+S shortcut) → prompts for a name.
- **Layouts** button in topbar → opens modal listing all saved layouts with Load and Delete buttons.
- `saveNamedLayout(name)` / `deleteNamedLayout(name)` / `applyLayoutData(data)` / `showSaveLayoutModal()` / `showLayoutsModal()`.
- `restorePanels(panelsData)` creates all panels synchronously, fires `loadPanelData()` per panel in parallel, then restores indicators and drawings in `.then()`.
- `applyLayoutData(data)` destroys current panels, rebuilds grid, calls `restorePanels()`.

**CSS additions:** `.layout-item`, `.layout-item-info`, `.layout-item-name`, `.layout-item-meta`, `.layout-item-actions`, `.layout-item-btn` for the layouts modal. Modal width widened from 300px → 360px.

---

## v2.0 — Major Feature Expansion
**Date:** 2026-06-13

### 4 New Technical Indicators
- **Supertrend** (overlay): ATR-based trend direction indicator. Green line = uptrend, red = downtrend. Params: ATR period (10), multiplier (3).
- **Keltner Channels** (overlay): EMA ± ATR bands. Params: EMA period (20), ATR multiplier (1.5), ATR period (10).
- **Donchian Channels** (overlay): Highest high / Lowest low over N periods. Three lines (upper, mid, lower). Params: period (20).
- **Volume Profile** (overlay): Rendered as SVG canvas overlay on main chart div (NOT a LightweightCharts series). Shows buy vs sell volume as horizontal bars on the left edge of the chart. Re-renders on chart scroll/zoom. Params: price levels / bins (30).

### Persistent Drawings
- Drawings were already persisted via autosave (v1). New in v2:
- **Export**: Downloads drawings as `drawings_SYMBOL_TF_timestamp.json`
- **Import**: Upload JSON file to merge drawings into active chart
- Both buttons added to the bottom of the drawing toolbar (↓ export, ↑ import)

### Alert System
- Alerts stored in `state.alerts`: `[{id, symbol, price, condition, note, triggered}]`
- **Create**: Right-click any horizontal line → "Set Alert at {price}" OR click 🔔 in topbar → "Add Alert" → modal
- **Check**: `checkAlerts(symbol, price)` called on every live price update (WS & kline)
- **Notification**: toast message + browser Notification API (requests permission on load)
- **UI**: Slide-out panel from right (class `.alerts-overlay.open`), badge count on bell icon
- **Persistence**: Alerts saved/restored with autosave and named layouts (version 2)

### Global Symbol Search
- `initAllPairs()` fetches all USDT spot pairs from exchange API on startup
- `handleSymbolSearch(query)` searches watchlist first then all pairs
- Dropdown appears below search box (`.sym-search-results`) with up to 15 results
- Clicking a result: loads in active chart + auto-adds to current watchlist if not present
- Escaping/clearing the search reverts to watchlist filter view
- Exchange-aware: Bybit returns `fetch_all_pairs_bybit()`, falls back to Binance

### Exchange Settings Page (Settings overlay, ⚙ icon in topbar)
**Supported exchanges:**
| Exchange | Support level |
|---|---|
| Binance | Full: REST + WebSocket klines + live order book |
| Bybit | Full: REST + WebSocket klines + live order book |
| OKX | REST only (klines via `/market/candles`) |
| Kraken | REST only (falls back to Binance data with warning) |
| Coinbase | REST only (falls back to Binance data with warning) |

- **Switching exchange**: calls `setExchange(id)` → restarts price WS + reloads all panels
- **Settings persisted** to `localStorage` under key `cryptopro_settings`
- Settings page also allows customising up/down candle colors (live preview)
- Keyboard shortcut: `Esc` closes settings page

### Resizable Panel Splitters
- Draggable divider between charts area and right panel (`#splitterRight`)
- Min width: 220px, Max width: 520px
- Chart instances are resized via ResizeObserver after drag
- `.panel-splitter.dragging` class applied during drag for blue highlight

### Right Panel Tab System
- Three tabs: **Watchlist** | **Order Book** | **Tech Info**
- Tab state in `state.rightTab`; persisted? No (resets to 'watchlist' on reload)
- Switching tabs: `switchRightTab(tabId)` — toggles `.active` on tab + content divs

### Order Book Pane
- Shows top 20 bids (green) and asks (red) with volume bars
- **Binance**: REST snapshot `/depth?limit=20` then WS `@depth20@500ms`
- **Bybit**: WS `orderbook.50.SYMBOL`
- **Fallback**: REST poll every 5s
- Spread shown between bid/ask tables
- Updates when active panel changes or Order Book tab is clicked
- `fmtVol()` formats large numbers with K/M/B suffixes

### Technical Information Pane
- Auto-updates when active panel changes and Tech Info tab is selected
- Shows: current price (large), 24h change %, open, high, low, volume estimate, period range
- Computed from: `fetchPriceExchange(symbol)` + existing panel `data[]`
- "Set Price Alert" button at the bottom opens alert modal pre-filled with current price

### Architecture Changes (v2)
- `state.settings`: `{ exchange, upColor, downColor }`
- `state.alerts`: array of alert objects
- `state.allPairs`: cached all-pairs array (null = not loaded yet)
- `state.rightTab`: current right panel tab
- `state.obData`: current order book data `{ bids, asks, symbol }`
- `state.orderBookWS`: order book WebSocket ref
- Autosave version bumped 1 → 2 (backwards compatible with v=1)
- `changeSymbol()` now also triggers order book / tech info refresh
- `setActivePanel()` now also triggers order book / tech info refresh
- `applyLayoutData()` now also restores settings + alerts

---

## v3.0 — Major Feature Expansion + Rebuild
**Date:** 2026-06-13

### Bug Fix
- File was truncated at line 3029 (mid-function). Rebuilt complete JS from scratch preserving all v2.0 features.

### New Indicators (added to INDICATORS_DEF)
- **Stoch RSI** (oscillator): RSI → Stochastic transformation with K/D smoothing. Params: RSI period, Stoch period, K smooth, D smooth.
- **Heikin Ashi** (overlay): Alternative candle type rendered as semi-transparent second series on main chart.
- **HTF Levels** (overlay): Draws previous day H/L and previous week H/L as dashed horizontal lines with price labels.
- **MA Ribbon** (overlay): 8 EMAs (20/25/30/35/40/45/50/55) with rainbow color gradient.

### New Calc Functions
- `calcStochRSI(data, rsiP, stochP, kSmooth, dSmooth)`
- `calcHeikinAshi(data)` → array of {time, open, high, low, close}
- `calcHTFLevels(data, tf)` → {prevDayH, prevDayL, prevDayO, prevDayC, prevWeekH, prevWeekL}
- `calcMARibbon(data)` → array of {period, color, vals}

### Market Scanner Tab (4th right-panel tab)
- Scan types: Top Gainers, Top Losers, Highest Volume, RSI Overbought/Oversold, Above/Below EMA 200
- Scope: Watchlist only OR All Pairs (up to 100)
- Price scans use cached WS prices; RSI/EMA scans fetch candle data (limit 30 symbols for perf)
- Click result → loads symbol in active chart

### Indicator Settings Editing
- Clicking indicator chip body (not ×) opens edit modal with current params pre-filled
- Supports editing params + color on any existing indicator
- `showIndicatorModal(defId, existingInd, panel)` — second/third args optional

### Indicator Templates
- Templates button in topbar (right of layouts)
- 4 presets: Trend Setup (EMA 20/50/200 + SuperTrend + ADX), Mean Reversion (BB + RSI + MFI), Momentum (MACD + ROC + Donchian), Volume Focus (VWAP + Vol Profile + OBV)
- Click template card in modal → applies all indicators to active panel

### Data Cache
- `state.klineCache[key]` where key = `exchange:symbol:tf`
- 1-minute TTL; `getCachedKlines(symbol, tf, limit)` wraps `fetchKlinesExchange`
- Used by scanner for performance

### Watchlist Color Labels
- Small colored dot per symbol row in watchlist
- Right-click dot → color picker context menu (Red/Orange/Green/Blue/Purple or remove)
- Stored in `state.symColors` (persisted with autosave)

### WebSocket Status Indicator
- Small dot in topbar (right side, after Templates button)
- Green = connected, Red = error, grey = idle
- `updateWSStatus('connected'|'error'|'')` function

### Architecture Changes (v3)
- `state.klineCache`: in-memory candle cache
- `state.symColors`: per-symbol color label map
- Autosave version bumped to 3
- `renderSymbolList()` now includes color label dots
- `renderIndChips()` now supports click-to-edit
- Drawing toolbar now built by `buildDrawingToolbar()` (no inline HTML)
- `loadPanelData()` now returns a Promise for use in `restorePanels()`

---

## v3.1 — Price-scale / time-axis alignment fix
**Date:** 2026-06-14
**File:** `src/js/charts.js`

### Problem
The main price chart and each oscillator sub-pane (MACD, RSI, etc.) are independent LightweightCharts instances stacked vertically. Their time axes only line up when every right-hand price scale has the same pixel width. The old code measured that width once (on load/resize) and never again, so scrolling, zooming, or dragging the vertical price axis — which changes price-label widths (e.g. RSI `51.04` vs price `0.17`) — pushed the panes out of sync, most visibly at the right edge.

### Fix
- `alignPriceScales(panel)` rewritten to re-detect the widest right scale across the main chart + all oscillator sub-charts and pad every pane's `minimumWidth` to match. Made idempotent via `panel._scaleTarget` cache — only applies `applyOptions` when the target width actually changes, avoiding relayout churn.
- Now called on the main chart's `subscribeVisibleLogicalRangeChange` (covers scroll/zoom), in addition to existing load/resize call sites.
- Added `startAlignMonitor(panel)` / `stopAlignMonitor(panel)`: a cheap 200ms `setInterval` watchdog that catches **vertical price-axis scaling**, which fires no range event at all. Reading `priceScale().width()` is inexpensive; charts are only touched when the widest scale changes. Started in `initChart()`, cleared in `destroyPanel()`.
- `layoutOscillators(panel)` now resets `panel._scaleTarget = null` and drops all scales back to `PRICE_SCALE_MIN_WIDTH` (68px) when the indicator set changes, so panes shrink back instead of staying padded to the width of a since-removed oscillator.

### Result
Main chart and indicator panes stay right-edge aligned through scrolling, zooming, scaling, and adding/removing oscillators.

### Environment note
During this session the Linux shell mount served a stale, partially-flushed copy of `src/js/charts.js` (truncated mid-statement around line 468), causing phantom `node --check` syntax errors. The file tool view was authoritative and correct. If terminal-based lint/build shows a syntax error in the oscillator code that the editor doesn't, suspect mount lag, not the file.

---

## v3.2 — Oscillator-to-oscillator alignment (stateless) + theme-toggle fix
**Date:** 2026-06-14
**File:** `src/js/charts.js`

### Problem
After v3.1, oscillator panes (MACD, RSI, …) could still end up misaligned with each other at the right edge. Root cause found via a headless render harness: `alignPriceScales` cached the aligned width in `panel._scaleTarget` and skipped re-applying whenever `target === _scaleTarget`. But `applyThemeToCharts()` re-applies `chartTheme()` (which sets `rightPriceScale.minimumWidth: 68`) to **every** chart on a light/dark toggle, resetting the floors behind the aligner's back. The cached-target guard then thought it was still aligned and never corrected the divergence — panes stuck at e.g. `[78, 68, 68]` permanently.

### Verification (headless puppeteer + lightweight-charts 4.1.3)
Stacked main + 2 oscillators with very different label magnitudes (124k price / 1-digit RSI / long-decimal MACD):
- Old guarded logic: aligned `[78,78,78]` OK, but after a simulated theme toggle → `[78,68,68]` **MISALIGNED** and never recovered.
- New stateless logic: after theme toggle → `[78,78,78]` **OK**.
(Confirmed `minimumWidth` is supported in 4.1.3 and is the library-sanctioned mechanism for equal price-scale widths across vertically-stacked charts.)

### Fix
- `alignPriceScales` rewritten to be **stateless**: each call reads all panes' live `priceScale('right').width()`, computes `target = max`, and re-applies `minimumWidth: target` to every pane whenever any pane's width ≠ target. No cached target, so it self-heals after theme toggles, recomputes, symbol changes — anything that resets the floor. Removed `panel._scaleTarget` entirely.
- Single-chart panels now early-return (nothing to align); `layoutOscillators` still drops all floors to baseline (68) on indicator-set changes so panes can shrink back.
- `applyThemeToCharts()` now calls `alignPriceScales(p)` in a rAF after re-theming, so panes re-align immediately instead of waiting for the 200ms watchdog.

---

## v3.3 — Oscillator line ends now align with the last candle (time-grid fix)
**Date:** 2026-06-14
**File:** `src/js/charts.js`

### Problem
The oscillator lines (RSI/MACD/ATR) ended at different x positions, none matching the last candle. Price-scale widths were already equal (v3.1/3.2), so this was a TIME-axis bug, not a width bug.

Root cause: each oscillator series has a warmup gap (RSI ~14 bars, MACD ~34, ATR ~14), so each sub-chart's time scale held *fewer* bars than the main candle chart. The panes are synced by **logical index** (`setVisibleLogicalRange`), but logical index N maps to a different *time* on each chart when their bar counts differ — so every oscillator's right edge drifted left by its own warmup length.

### Verification (headless puppeteer + lightweight-charts 4.1.3)
Main (120 bars) + oscillator (34-bar warmup), synced + equal price-scale widths:
- Before: last-candle x = 521, oscillator line ends at x = 373 → **misaligned** by ~148px.
- After spacer fix: oscillator line ends at x = 521 → **pixel-perfect** (first bar also 5 == 5).

### Fix
- In `buildOscillator`, each sub-chart gets an invisible **spacer line series** (`priceScaleId:'spc'`, transparent, hidden scale) loaded with a whitespace point (`{time}`) for *every* candle time: `ind._spacer.setData(panel.data.map(c => ({time:c.time})))`. This makes every oscillator's time grid identical to the main chart's, so the logical-range sync lines up both edges regardless of warmup. The spacer is on a hidden overlay scale so it doesn't affect the oscillator's autoscale or the `'right'` width alignment.
- `startKlineStream` now calls `ind._spacer.update({time: candle.time})` for every oscillator when a *new* bar arrives, so live ticks keep the grids in sync.
- Works together with v3.2 stateless `alignPriceScales` (equal widths) — both are required for pixel-perfect alignment.

---

## v3.4 — Watchlist drag-reorder + drawing handles/resize + shape config dialog
**Date:** 2026-06-14
**Files:** `src/js/watchlist.js`, `src/js/drawings.js`, `src/js/state.js`, `public/index.html`, `public/css/style.css`

### Watchlist: drag to reorder
- Symbol rows are now `draggable`; a `⠿` drag handle column was added (visible on row hover).
- HTML5 drag events reorder the underlying `state.watchlists[current]` array with an above/below drop indicator (`.drop-above` / `.drop-below` inset shadow).
- Added a `'manual'` sort mode: `computeSorted()` preserves array order when `wlSort.col === 'manual'`; `ensureManualOrder()` freezes the current displayed (sorted) order into the array and switches to manual on first drag, so reordering starts from exactly what the user sees. Order persists via the existing autosave snapshot (no schema change).
- Header markup updated to 7-col grid with two leading spacers + right-aligned numeric labels (`.col.num`), which also fixes the long-standing **Bug #2** (watchlist column labels not aligned on the right).

### Drawings: selection, resize handles, move
- `drawingState.selected` / `selectedPanel` added (state.js).
- In select mode the drawing layer is `pointer-events:none` over empty space (chart still pans/zooms); a hover hit-test on the chart div flips it to `auto` only when the cursor is over a shape. Handles (8px squares) are drawn on the selected shape.
- `hitTest`/`bodyHit` cover every shape (line distance, rect edges, fib levels, channel rails, hline/vline, text box). Drag a handle to resize/reshape (per-point, axis-aware for hline=price-only, vline=bar-only); drag the body to move all points together. Changes dispatch `drawings-changed` → autosave.

### Drawings: live config popover
- Non-modal popover (`#drawCfg`, top-right of the panel) appears on selection: edit **color**, **line width**, **line style** (solid/dashed, styleable shapes), **text** (text annotations), and each point's **Bar (X)** / **Price (Y)** coordinates. Edits apply live; coordinate fields auto-refresh as the chart pans or the shape is dragged (skipping the focused input). Includes a Delete button.
- `lineStyle` field added to drawings (persists in the drawings array); `drawOne` now honors solid/dashed per shape (hline/vline still default dashed).

### Verification
- Headless Chromium unavailable beyond the charting tests; JS validated by full authoritative review of each edited file (balanced braces, template literals, handlers). NOTE: the Linux shell mount serves stale copies of these source files this session, so `node --check` there parses the OLD files — not a reliable post-edit check this session.

---
