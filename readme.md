# CryptoPro Charts

**Version:** v1.28.0  
**Creator:** Erik Kuipers

Professional multi-chart cryptocurrency trading & analytics platform — a TradingView-style charting website built with vanilla JS, Express, and LightweightCharts.

---

## Features

- **Multi-panel layouts** — 1, 2, 4, 6, or 8-chart grid layouts; panels resizable via drag splitter
- **13 timeframes, favorites pinned to the top bar** — 1m 5m 15m 30m 1h 2h 4h 6h 12h 1d 3d 1w 1M; timeframes an exchange lacks natively are aggregated server-side from a lower timeframe. Each chart's top bar shows only your pinned favorite timeframes (1m/5m/15m/1h/4h/1d by default) plus a ▾ dropdown for the rest — star any timeframe in the dropdown to pin/unpin it, across every chart
- **7 chart types per panel** — Candles, Hollow candles, OHLC Bars, Line, Area, Heikin Ashi, Renko (ATR-sized bricks)
- **Infinite history scroll-back** — pan left and older bars stream in automatically (Postgres-backed kline store + exchange paging)
- **Log & percent price scales** — per-panel `log` / `%` toggles in the chart's ☰ options menu (top right of the panel bar)
- **Symbol link groups & crosshair sync** — put panels in a colored link group (⛓) so a symbol change follows across them; the crosshair mirrors across all panels by time
- **Live price readout** — Each chart's current price shows in a bigger, bold font right next to the symbol name in the panel's top bar, flashing green/red in the direction of the last tick
- **Refresh all** — a ⟳ button in the top bar drops the kline cache and reloads every chart's data in one click
- **Per-chart options menu** — log/percent scale, symbol link group, bar replay, compare/overlay, indicators, PNG/CSV export, fullscreen, and close are grouped behind a ☰ button in the top-right of each chart's panel bar, keeping the bar itself down to symbol, price, chart type, and timeframes
- **Multiple exchanges** — Binance (WebSocket + REST), Bybit, OKX, Gate.io, KuCoin, Hyperliquid, Bitstamp, CryptoCompare, Alpaca, Bitvavo. **Watchlists can mix symbols from several exchanges at once** — each symbol carries its own exchange, and Settings chooses which exchanges to query (not a single active one)
- **Multi-quote pairs** — USDT, USDC, and EUR pairs across all supported exchanges
- **Rich indicators** — SMA, EMA, WMA, Bollinger Bands, VWAP, Ichimoku, RSI, MACD, Stochastic, ATR, ADX, SuperTrend, Keltner, Donchian, Volume Profile, Heikin Ashi, MA Ribbon, Pivot Points, HTF Levels, Anchored VWAP, Parabolic SAR, DEMA, TEMA, **Lux Trend Signals** (EMA + ATR bands + buy/sell arrows)
- **Top-bar indicator chips** — Active indicators on the selected chart show as toggleable/editable/removable chips in the top navigation bar, right beside the Indicators picker (frees the full chart width). Click a chip's **name** to hide/show it (dimmed when off, state persists), the colored **dot** to edit its settings, and **×** to remove it
- **Oscillator panes** — RSI, MACD, Stochastic, ATR, ADX render in sub-panes below the main chart
- **Drawing tools** — Trend line, ray, extended line, horizontal/vertical lines, rectangle, channel, Fibonacci retracement/extension/**time zones**, **Andrews pitchfork**, **long/short position tool** (entry/target/stop with live R:R), text label, measurement tool, eraser, and a **magnet** toggle that snaps new points to the nearest bar's OHLC. **Lock any drawing** from its config popover (🔒) to protect it from accidental move, resize, or deletion — a padlock badge marks locked shapes; unlock to edit again
- **Symbol overlay** — Compare multiple symbols on one chart with independent price scales
- **Watchlist** — Multiple named watchlists (**drag the tabs to reorder them horizontally**), drag-to-reorder symbols, live prices from WebSocket, colour tags, REST polling fallback for pairs not in Binance stream; the symbol shown on the currently selected chart is highlighted in the list. Selecting a symbol that's already open on another chart focuses that chart instead of duplicating it. **Right-click a symbol to move it to another watchlist** (or remove it)
- **Symbol picker** — Searchable add-symbol dialog with an **exchange filter** (multi-select; none selected = all enabled exchanges) plus a quote-currency filter (All / USDT / USDC / USD / EUR) and a "Hide stablecoins" filter (on by default) that drops stable/stable pairs from both exchange and CoinGecko results. Picked symbols remember which exchange they came from
- **MA crossing markers** — Golden/death cross arrows drawn where adjacent SMA/EMA overlays cross (up arrow below bar for bullish, down arrow above bar for bearish), coloured with the up/down theme colours
- **Event markers** — High-impact economic events overlaid on the chart; past events snapped to the correct candle period, future events projected up to 2 weeks ahead at their correct future date (rendered on a hidden series so LWC doesn't snap them to the last candle)
- **Tech Info pane** — RSI speedometer, daily/monthly/yearly performance pills, day's/52-week range gauges, seasonals chart
- **Order Book pane** — Live order book depth, plus **Trades** (live time & sales tape) and **Depth** (cumulative bid/ask area chart) sub-tabs
- **Derivatives overlay** — Per-panel funding rate + countdown, open interest, and live liquidation markers (Binance USDT-M futures)
- **Bar replay** — Step through a chart's history candle-by-candle with play/pause/speed/scrub controls, for setup training
- **Indicator templates** — Save/load named indicator sets per account, alongside curated built-in presets
- **Scanner** — Symbol scanner across the watchlist or all enabled-exchange pairs, with a Volume Spike filter, saved scans, and an auto-refresh mode that toasts new hits
- **Paper trading & journal** — Simulated long/short positions with live unrealized P&L, a closed-trade journal with notes, and one-click logging straight from the position drawing tool
- **Watchlist heatmap** — Toggle the watchlist into a performance-heatmap tile grid; rows also show a 24h mini sparkline
- **Multi-user accounts** — Application-only sign-in with a username and password (no third-party SSO). Passwords are salted + scrypt-hashed. Accounts, auth sessions, and chart layouts are persisted in a **Supabase (Postgres) database** (`accounts`, `sessions`, `layouts` tables, created automatically on startup). Each user's autosave session-state and named layouts are scoped to their account; anonymous users share a guest scope. Account button in the top bar (Sign in / Create account)
- **Layout persistence** — Autosave + named layouts saved to the Postgres database (scoped per signed-in user); layout selector dropdown in the toolbar; falls back to browser localStorage if the server/DB is unavailable
- **Server-side alerts** — Price cross, % move, RSI level, and volume-spike alerts evaluated on the server every 30 s, so they fire even with the browser closed; optional Telegram / webhook notifications (`.env`), with toast + browser notifications in-app. Falls back to in-browser price alerts when no database is configured
- **Themes** — Dark Classic, Light Classic, Solarized, Nord, Dracula
- **Responsive footer** — Creator attribution and version number
- **Command palette (Ctrl/Cmd+K)** — instant symbol search/switch and an action launcher (layouts, theme, save, export, indicator toggles, …), TradingView-style
- **Undo/redo for drawings** — Ctrl/Cmd+Z / Ctrl/Cmd+Y (or Ctrl/Cmd+Shift+Z), per chart
- **Chart snapshot & export** — one-click PNG (📷, watermarked, includes your drawings) and CSV export of the currently visible bars (⤓)
- **Web Worker indicator computation** — indicator math runs off the main thread so multi-chart layouts stay smooth, with an automatic main-thread fallback if Workers are unavailable
- **Native WebSocket relay** — OKX, Gate.io and KuCoin kline streams run through a server-side connection manager (one upstream socket per symbol, fanned out to every connected client) instead of REST polling
- **Mobile/tablet responsive layout + PWA** — installable, offline-capable app shell; below ~820px any layout becomes a swipeable single-chart view with pointer/touch-driven drawing
- **Security hardening** — CSP + standard security headers, Origin-based CSRF protection, per-IP rate limiting on auth routes, self-service password change, and optional TOTP 2FA
- **Test suite + CI** — unit tests for indicator math and exchange kline normalization (`npm test`), run on every push/PR via GitHub Actions

## Exchanges & Data Sources

| Exchange | Pairs | Klines | Live Prices |
|---|---|---|---|
| Binance | USDT, USDC, EUR | REST + server cache | WebSocket (all pairs) |
| Bybit | USDT, USDC, EUR | REST + server cache | WebSocket (direct) |
| OKX | USDT, USDC, EUR | REST + server cache | WebSocket (server relay) |
| Gate.io | USDT, USDC, EUR | REST + server cache | WebSocket (server relay) |
| KuCoin | USDT, USDC, EUR | REST + server cache | WebSocket (server relay) |
| Hyperliquid | Perps | Binance fallback | — |
| Bitstamp | USDT, USDC, EUR, USD | REST + server cache | REST polling fallback |
| CryptoCompare | All major pairs (aggregated) | REST + server cache | REST polling fallback |
| Alpaca | USD (USDT/USDC mapped to USD) | REST + server cache | REST polling fallback |
| Bitvavo | EUR (USDT/USDC mapped to EUR) | REST + server cache | WebSocket (candles) |

Each watchlist symbol and chart carries its own exchange, so data is loaded from that symbol's exchange; kline fetching then uses an ordered fallback chain: **the symbol's exchange → Gate.io → Binance**.  
Missing watchlist prices are refreshed via Binance batch ticker every 30 s (for Binance-sourced symbols), with per-exchange REST fallback for everything else.  
The watchlist symbol search also queries **CoinGecko** (debounced) to discover coins not listed on the enabled exchanges — results are added as `{SYMBOL}USDT` pairs.

## Tech Stack

- **Frontend:** Vanilla ES modules (`type="module"`), no bundler
- **Charts:** [LightweightCharts v4.1.3](https://tradingview.github.io/lightweight-charts/)
- **Backend:** Node.js + Express — server-side kline cache (JSON files), username/password auth (salted scrypt via Node's `crypto`), and account/session/layout persistence in Supabase Postgres (`pg`)
- **Styling:** Single CSS file with CSS custom properties for theming

## Getting Started

```bash
npm install
npm start        # starts on http://localhost:3000
npm test         # runs the unit test suite (indicator math, exchange normalizers, TOTP)
```

### Accounts & database

Sign-in is application-only — click **Sign in** in the top bar to create an
account (username + password) or log in. No third-party SSO is involved.
Passwords are salted and scrypt-hashed.

Accounts, auth sessions, and chart layouts are stored in a **Supabase (Postgres)
database**. Provide a connection string in `.env` (the Vercel Supabase
integration injects these automatically):

```
DBCRYPTOCHARTS_POSTGRES_URL_NON_POOLING="postgresql://...:5432/postgres?sslmode=require"
DBCRYPTOCHARTS_POSTGRES_URL="postgresql://...:6543/postgres?sslmode=require"
```

The server creates these tables on startup if they don't exist:

| Table | Purpose |
|---|---|
| `accounts` | user id, username, salt, password hash, timestamps |
| `sessions` | opaque session token → account, with expiry (FK to `accounts`) |
| `layouts` | per-user autosave session-state and named layouts (`jsonb`), keyed by `(uid, name)` |
| `klines` | server-side bar store keyed by `(exchange, symbol, tf, time)` — powers infinite history scroll-back |
| `alerts` | per-user server-side alerts (price / % move / RSI / volume spike), evaluated by the alert engine |
| `templates` | per-user saved indicator templates (`jsonb`), keyed by `(uid, name)` |
| `saved_scans` | per-user saved screener scans (`jsonb`), keyed by `(uid, name)` |
| `paper_trades` | simulated positions — side/qty/entry/exit/stop/target/status/notes, per user |

`accounts` additionally carries `totp_secret` / `totp_enabled` / `password_changed_at` (added via `alter table ... add column if not exists`, so existing deployments pick them up automatically) for optional 2FA and password-change tracking.

Without a connection string the database is disabled and the frontend falls back
to browser `localStorage`. Set `NODE_ENV=production` to mark session cookies
`Secure` over HTTPS. The server loads `.env` automatically at startup.

## Project Structure

```
crypto-pro-charts/
├── .github/workflows/test.yml  # CI: npm test + syntax-check on every push/PR
├── test/                # node:test unit tests (indicators, klines, totp)
├── public/
│   ├── index.html
│   ├── manifest.json    # PWA manifest
│   ├── sw.js             # app-shell service worker (installable, offline fallback)
│   └── css/style.css
├── src/js/
│   ├── main.js          # app entry point
│   ├── auth.js          # account button + sign-in/2FA/change-password modals (client)
│   ├── charts.js        # panel creation, indicators, volume profile, derivatives readout
│   ├── data.js          # exchange REST/WS, kline fetching, pair lists, trade stream, volumes
│   ├── derivatives.js   # funding rate / OI fetch + liquidation WS (frontend)
│   ├── replay.js        # bar-by-bar replay playback
│   ├── paper.js         # paper trading + journal
│   ├── palette.js       # command palette (Ctrl/Cmd+K)
│   ├── snapshot.js      # chart PNG snapshot + CSV export
│   ├── indicator-client.js  # Web Worker request/response bridge
│   ├── indicator-worker.js  # indicator math, run off the main thread
│   ├── constants.js     # EXCHANGES, INDICATORS_DEF, THEMES
│   ├── drawings.js       # drawing engine — lines, fibs, pitchfork, position tool, undo/redo
│   ├── events.js        # market event markers
│   ├── orderbook.js     # order book + trades tape + depth chart + tech info pane
│   ├── persistence.js   # session/layout/template save & restore
│   ├── scanner.js       # symbol scanner + saved scans
│   ├── settings.js      # exchange/color settings modal
│   ├── state.js         # shared app state
│   ├── ui.js            # toolbar, drawing tools, dropdowns, templates modal
│   ├── utils.js         # helpers (baseAsset, quoteAsset, fmtPrice…)
│   └── watchlist.js     # watchlist UI + symbol picker + heatmap + sparklines
├── auth.js              # server-side auth: username/password (scrypt), 2FA, rate limiting + DB sessions
├── totp.js              # RFC 6238 TOTP (2FA) — no external dependency
├── ws-relay.js          # server-side WS connection manager (OKX/Gate.io/KuCoin kline relay)
├── derivatives.js       # funding rate / open interest fetch (backend, Binance futures)
├── db.js                # Supabase/Postgres: accounts, sessions, layouts, klines, alerts, templates, saved_scans, paper_trades tables
├── klines.js            # shared exchange kline fetch, history paging, TF aggregation
├── alert-engine.js      # server-side alert evaluation + Telegram/webhook notify
├── server.js            # Express server + kline proxy/cache + .env loader
├── .env.example         # PORT / NODE_ENV / Supabase Postgres connection string
├── data/                # kline cache + curated events.json (no user data here now)
├── cache/klines/        # server-side bar cache
└── memory.md            # running changelog
```

---

Created by **Erik Kuipers** · © 2026
