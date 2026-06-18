# CryptoPro Charts — Changelog

> Newest entry at the top. Each entry describes what changed, why, and how it was verified.

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
