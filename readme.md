# CryptoPro Charts

**Version:** v1.21.0  
**Creator:** Erik Kuipers

Professional multi-chart cryptocurrency trading & analytics platform — a TradingView-style charting website built with vanilla JS, Express, and LightweightCharts.

---

## Features

- **Multi-panel layouts** — 1, 2, 3, 4-chart grid layouts; panels resizable via drag splitter
- **Live price readout** — Each chart's current price shows in a bigger, bold font right next to the symbol name in the panel's top bar, flashing green/red in the direction of the last tick
- **Refresh all** — a ⟳ button in the top bar drops the kline cache and reloads every chart's data in one click
- **Multiple exchanges** — Binance (WebSocket + REST), Bybit, OKX, Gate.io, KuCoin, Hyperliquid, Bitstamp, CryptoCompare, Alpaca, Bitvavo. **Watchlists can mix symbols from several exchanges at once** — each symbol carries its own exchange, and Settings chooses which exchanges to query (not a single active one)
- **Multi-quote pairs** — USDT, USDC, and EUR pairs across all supported exchanges
- **Rich indicators** — SMA, EMA, WMA, Bollinger Bands, VWAP, Ichimoku, RSI, MACD, Stochastic, ATR, ADX, SuperTrend, Keltner, Donchian, Volume Profile, Heikin Ashi, MA Ribbon, Pivot Points, HTF Levels, Anchored VWAP, Parabolic SAR, DEMA, TEMA, **Lux Trend Signals** (EMA + ATR bands + buy/sell arrows)
- **Top-bar indicator chips** — Active indicators on the selected chart show as toggleable/editable/removable chips in the top navigation bar, right beside the Indicators picker (frees the full chart width). Click a chip's **name** to hide/show it (dimmed when off, state persists), the colored **dot** to edit its settings, and **×** to remove it
- **Oscillator panes** — RSI, MACD, Stochastic, ATR, ADX render in sub-panes below the main chart
- **Drawing tools** — Trend line, ray, extended line, horizontal/vertical lines, rectangle, channel, Fibonacci retracement/extension, text label, measurement tool, eraser. **Lock any drawing** from its config popover (🔒) to protect it from accidental move, resize, or deletion — a padlock badge marks locked shapes; unlock to edit again
- **Symbol overlay** — Compare multiple symbols on one chart with independent price scales
- **Watchlist** — Multiple named watchlists (**drag the tabs to reorder them horizontally**), drag-to-reorder symbols, live prices from WebSocket, colour tags, REST polling fallback for pairs not in Binance stream; the symbol shown on the currently selected chart is highlighted in the list. Selecting a symbol that's already open on another chart focuses that chart instead of duplicating it. **Right-click a symbol to move it to another watchlist** (or remove it)
- **Symbol picker** — Searchable add-symbol dialog with an **exchange filter** (multi-select; none selected = all enabled exchanges) plus a quote-currency filter (All / USDT / USDC / USD / EUR) and a "Hide stablecoins" filter (on by default) that drops stable/stable pairs from both exchange and CoinGecko results. Picked symbols remember which exchange they came from
- **MA crossing markers** — Golden/death cross arrows drawn where adjacent SMA/EMA overlays cross (up arrow below bar for bullish, down arrow above bar for bearish), coloured with the up/down theme colours
- **Event markers** — High-impact economic events overlaid on the chart; past events snapped to the correct candle period, future events projected up to 2 weeks ahead at their correct future date (rendered on a hidden series so LWC doesn't snap them to the last candle)
- **Tech Info pane** — RSI speedometer, daily/monthly/yearly performance pills, day's/52-week range gauges, seasonals chart
- **Order Book pane** — Live order book depth for the active symbol
- **Scanner** — Configurable symbol scanner across the watchlist or top pairs
- **Multi-user accounts** — Application-only sign-in with a username and password (no third-party SSO). Passwords are salted + scrypt-hashed. Accounts, auth sessions, and chart layouts are persisted in a **Supabase (Postgres) database** (`accounts`, `sessions`, `layouts` tables, created automatically on startup). Each user's autosave session-state and named layouts are scoped to their account; anonymous users share a guest scope. Account button in the top bar (Sign in / Create account)
- **Layout persistence** — Autosave + named layouts saved to the Postgres database (scoped per signed-in user); layout selector dropdown in the toolbar; falls back to browser localStorage if the server/DB is unavailable
- **Alerts** — Price alerts with browser notifications
- **Themes** — Dark Classic, Light Classic, Solarized, Nord, Dracula
- **Responsive footer** — Creator attribution and version number

## Exchanges & Data Sources

| Exchange | Pairs | Klines | Live Prices |
|---|---|---|---|
| Binance | USDT, USDC, EUR | REST + server cache | WebSocket (all pairs) |
| Bybit | USDT, USDC, EUR | REST + server cache | REST polling fallback |
| OKX | USDT, USDC, EUR | REST + server cache | REST polling fallback |
| Gate.io | USDT, USDC, EUR | REST + server cache | REST polling fallback |
| KuCoin | USDT, USDC, EUR | REST + server cache | REST polling fallback |
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

The server creates three tables on startup if they don't exist:

| Table | Purpose |
|---|---|
| `accounts` | user id, username, salt, password hash, timestamps |
| `sessions` | opaque session token → account, with expiry (FK to `accounts`) |
| `layouts` | per-user autosave session-state and named layouts (`jsonb`), keyed by `(uid, name)` |

Without a connection string the database is disabled and the frontend falls back
to browser `localStorage`. Set `NODE_ENV=production` to mark session cookies
`Secure` over HTTPS. The server loads `.env` automatically at startup.

## Project Structure

```
crypto-pro-charts/
├── public/
│   ├── index.html
│   └── css/style.css
├── src/js/
│   ├── main.js          # app entry point
│   ├── auth.js          # account button + username/password sign-in modal (client)
│   ├── charts.js        # panel creation, indicators, volume profile
│   ├── data.js          # exchange REST/WS, kline fetching, pair lists
│   ├── constants.js     # EXCHANGES, INDICATORS_DEF, THEMES
│   ├── events.js        # market event markers
│   ├── orderbook.js     # order book + tech info pane
│   ├── persistence.js   # session/layout save & restore
│   ├── scanner.js       # symbol scanner
│   ├── settings.js      # exchange/color settings modal
│   ├── state.js         # shared app state
│   ├── ui.js            # toolbar, drawing tools, dropdowns
│   ├── utils.js         # helpers (baseAsset, quoteAsset, fmtPrice…)
│   └── watchlist.js     # watchlist UI + symbol picker
├── auth.js              # server-side auth: username/password (scrypt) + DB sessions
├── db.js                # Supabase/Postgres: accounts, sessions, layouts tables
├── server.js            # Express server + kline proxy/cache + .env loader
├── .env.example         # PORT / NODE_ENV / Supabase Postgres connection string
├── data/                # kline cache + curated events.json (no user data here now)
├── cache/klines/        # server-side bar cache
└── memory.md            # running changelog
```

---

Created by **Erik Kuipers** · © 2026
