# Crypto Charting Pro — Change Memory

This file tracks every significant change made to `index.html` for future reference.

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

## Future improvement ideas
- More exchange support: Hyperliquid, dYdX, Gate.io
- Add order book timeframe selector
- Add auto chart scaling

-  Multi-timeframe analysis overlay
This is also listed in memory. The app already supports per-panel timeframes and multi-panel layouts, but it does not appear to overlay higher-timeframe levels directly onto a lower-timeframe chart. [onedrive.live.com], [index | HTML]
Recommendation: add “HTF Levels” as an overlay feature:

previous day high/low/open/close
previous week high/low
previous month high/low
higher-timeframe moving averages
higher-timeframe candles as ghost candles
session VWAP / anchored VWAP

Why it matters: crypto traders often analyse a 1h or 15m chart while watching daily/weekly levels. This would be more useful than simply adding more panels because it keeps context visible in the active chart.

- Market scanner / screener tab
The right panel currently has Watchlist, Order Book, and Tech Info tabs. [onedrive.live.com], [index | HTML]
Recommendation: add a fourth tab: Scanner.
Scanner ideas:

top gainers / losers
highest volume
unusual volume
RSI overbought/oversold
price above/below EMA 200
breakout above Donchian high
watchlist-only scan vs all pairs

Why it matters: global symbol search helps when users know what they want; a scanner helps them discover opportunities.

- ~~Watchlist colour labels~~ ✅ Done in v3.0 (color dot per symbol with context menu)

- Mobile and tablet optimisation
The app currently uses a three-column layout, fixed side panels, chart grid, and minimum chart sizes. [onedrive.live.com], [index | HTML]
Recommendation: improve smaller-screen behaviour:

bottom tab bar for Watchlist / Indicators / Drawings
collapsible topbar groups
full-screen active chart mode
touch-friendly drawing handles
larger hit targets
long-press context menu

Crypto users often check charts on tablets or phones, so this would expand usability significantly.

- WebSocket connection manager
The current app uses WebSockets for live prices, panel klines, and order book where supported. [onedrive.live.com], [index | HTML]
Recommendation: centralise WebSocket management:

reconnect with exponential backoff
show connection status
avoid duplicate subscriptions
pause streams for hidden panels
close streams on tab hidden, resume on visible
display stale data warning

Why it matters: multiple panels plus watchlist plus order book can create many live connections. A connection manager improves stability.

- ~~Data cache per symbol/timeframe~~ ✅ Done in v3.0 (`state.klineCache`, `getCachedKlines()`, 1-min TTL)

- Reduce inline event handlers
index contains inline event handlers in generated HTML such as onclick for fullscreen/close panel and retry logic. [index | HTML]
Recommendation: move inline handlers to delegated event listeners.
Why it matters: improves maintainability, reduces accidental global coupling, and makes the code safer if user-generated content expands.

- Split into modules eventually
The current app is intentionally a single-file HTML app with no build step.  That is convenient, but index is now large and contains styling, markup, state, data fetching, indicators, drawing tools, persistence, alerts, settings, order book, and UI logic together. [onedrive.live.com] [index | HTML]
Recommendation: keep the single-file distribution, but internally organise code sections more cleanly or create an optional modular source version:
Plain Textsrc/  app-state.js  exchanges/  indicators/  drawings/  watchlists/  alerts/  persistence/  ui/dist/  index.htmlMeer regels weergeven
Then build back into one index.html if the “single file” requirement remains.

- Drawing groups and visibility layers
Recommendation: add layers:

Support/resistance
Fibonacci
Trade setup
Notes
Alerts
HTF levels

Each layer could have show/hide and lock toggles.
Why it matters: as users build complex analyses, charts can become cluttered. Layers give structure without deleting work.

- Drawing edit mode: drag, resize, style controls
The current app has many drawing tools: trend line, ray, extended line, horizontal/vertical lines, rectangle, parallel channel, Fibonacci retracement/extension, text, measure, eraser, import/export, and persistent drawings. [onedrive.live.com], [index | HTML]
Recommendation: add true object editing:

select drawing
drag drawing
drag endpoints
change colour/width/style after creation
lock drawing
hide drawing
duplicate drawing
send drawing to back/front
drawing list panel

Why it matters: the drawing toolset is already broad, but without edit handles and object management it may feel less polished than TradingView-like tools.

- More overlays and oscillators (partially done in v3)
  - ✅ Stoch RSI, Heikin Ashi, HTF Levels, MA Ribbon added in v3
  - Still to add: Anchored VWAP, EMA Cloud, Ultimate Oscillator, CMF, Elder Force Index, TSI, DMI ±DI, market structure labels

- ~~Indicator templates / strategy presets~~ ✅ Done in v3.0 (Templates button with 4 presets)

- ~~Indicator settings editing after adding~~ ✅ Done in v3.0 (click chip body = edit modal with current params)

- Symbol format mapping per exchange
The current code uses symbols such as BTCUSDT, and OKX conversion appears to transform BTCUSDT into BTC-USDT. [index | HTML]
Recommendation: add a symbol-normalisation layer:
JavaScripttoExchangeSymbol('BTCUSDT', 'okx')      // BTC-USDTtoExchangeSymbol('BTCUSDT', 'binance')  // BTCUSDTfromExchangeSymbol('BTC-USDT', 'okx')   // BTCUSDTMeer regels weergeven

Why it matters: this avoids brittle string replacements and will become essential if Hyperliquid, dYdX, Gate.io, Coinbase, or Kraken support is expanded.

- Complete exchange support consistency
The settings page currently lists Binance and Bybit as “Full support,” while OKX, Kraken, and Coinbase are marked REST-only or fallback-like in the documented changes.  In index, Binance has REST/WebSocket klines/order book support, Bybit has REST/WebSocket paths, OKX has candle fetching, and Kraken/Coinbase fall back in several places. [onedrive.live.com] [index | HTML]
Recommendation: make exchange support explicit and safer in the UI:

show exact support badges:

Candles: Live / REST / Fallback
Watchlist prices: Live / Polling / Fallback
Order book: Live / Polling / Fallback
Symbol search: Native / Fallback

warn users when a selected exchange is falling back to another exchange’s data
add a small exchange badge on every chart panel that updates dynamically

Why it matters: if a user selects OKX/Kraken/Coinbase but receives Binance fallback data, they need clear visibility to avoid analytical mistakes.

- ~~Market scanner / screener tab~~ ✅ Done in v3.0 (4th tab: Gainers/Losers/Volume/RSI/EMA scans)

- Add a financial event calendar pane next to the watchlist. Makes it selectable or hideable. Also add a selector to add the events on the x-axis on the selected chart.

