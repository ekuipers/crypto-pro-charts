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

## Future improvement ideas
- Chart screenshot / export to PNG
- Multiple timeframe analysis overlay
- Trading journal / notes per drawing
- Alert via email/webhook
- More exchange support: Hyperliquid, dYdX, Gate.io
