# CryptoPro Charts

A professional, TradingView-style crypto charting web app with multiple charts on a single
page, 33 technical indicators, drawing tools, watchlists, an order book, a market scanner, and
a macro/crypto **events calendar**. Vanilla JS (ES modules) on the front end, a small Express
server for static hosting plus a kline cache and events API.

_Creator: Erik Kuipers_

## Run

```bash
npm install
npm start          # serves on http://localhost:3000 (set PORT to change)
npm run dev        # same, with --watch
```

Open the served URL in a browser. The charting library (lightweight-charts) loads from a CDN.

## Architecture

- `server.js` — Express. Serves `public/` and `src/js/`, plus two JSON APIs (below).
- `public/index.html`, `public/css/style.css` — markup + styles.
- `src/js/` — ES modules:
  - `main.js` (entry), `state.js`, `constants.js`, `utils.js`
  - `charts.js` (panels, layouts, indicators glue, MA-cross + event markers)
  - `indicators.js` (indicator math), `data.js` (exchange REST/WS access)
  - `ui.js`, `watchlist.js`, `events.js`, `orderbook.js`, `scanner.js`, `alerts.js`,
    `settings.js`, `drawings.js`, `persistence.js`

Exchanges supported for data: Binance (full REST+WS), Bybit (full REST+WS), OKX, Gate.io,
Hyperliquid. Symbols use the internal `BASEUSDT` form and are normalized per exchange.

## Server APIs

- `GET /api/klines?exchange&symbol&tf&limit` — fetches candles from the chosen exchange,
  normalizes them, and **caches them to JSON files** under `cache/klines/` with a per-timeframe
  TTL. Serves fresh cache when available, stale cache on upstream failure. Inputs are validated
  (symbol `^[A-Z0-9]{2,20}$`, exchange whitelist, timeframe in the exchange's interval map,
  limit clamped 1–1000). The client tries this first and falls back to direct exchange fetch.
- `GET /api/events` — serves the curated market-events calendar from `data/events.json`.

## Events calendar

`data/events.json` holds curated macro/crypto events (FOMC, CPI, NFP, ECB, options expiry, …).
The right-panel **Events** tab lists them (with a "high impact only" filter); high-impact events
are marked on each chart's x-axis. Clicking a marker or a row shows the event details. Edit the
JSON to add or update events.

## Notes for contributors

- Changelog lives in `memory.md` — append a dated entry for every code change (see
  `CLAUDE.md` workflow rule).
- `cache/` and `ruvector.db` are git-ignored.
