# CryptoPro Charts

**Version:** v1.5.3  
**Creator:** Erik Kuipers

Professional multi-chart cryptocurrency trading & analytics platform — a TradingView-style charting website built with vanilla JS, Express, and LightweightCharts.

---

## Features

- **Multi-panel layouts** — 1, 2, 3, 4-chart grid layouts; panels resizable via drag splitter
- **Multiple exchanges** — Binance (WebSocket + REST), Bybit, OKX, Gate.io, KuCoin, Hyperliquid, Bitstamp, CryptoCompare
- **Multi-quote pairs** — USDT, USDC, and EUR pairs across all supported exchanges
- **Rich indicators** — SMA, EMA, WMA, Bollinger Bands, VWAP, Ichimoku, RSI, MACD, Stochastic, ATR, ADX, SuperTrend, Keltner, Donchian, Volume Profile, Heikin Ashi, MA Ribbon, Pivot Points, HTF Levels, Anchored VWAP, Parabolic SAR, DEMA, TEMA, **Lux Trend Signals** (EMA + ATR bands + buy/sell arrows)
- **Top-bar indicator chips** — Active indicators on the selected chart show as removable/editable chips in the top navigation bar, right beside the Indicators picker (frees the full chart width)
- **Oscillator panes** — RSI, MACD, Stochastic, ATR, ADX render in sub-panes below the main chart
- **Drawing tools** — Trend line, ray, extended line, horizontal/vertical lines, rectangle, channel, Fibonacci retracement/extension, text label, measurement tool, eraser
- **Symbol overlay** — Compare multiple symbols on one chart with independent price scales
- **Watchlist** — Multiple named watchlists, drag-to-reorder, live prices from WebSocket, colour tags, REST polling fallback for pairs not in Binance stream
- **Event markers** — High-impact economic events overlaid on the chart; past events snapped to the correct candle period, future events projected up to 2 weeks ahead at their correct future date (rendered on a hidden series so LWC doesn't snap them to the last candle)
- **Tech Info pane** — RSI speedometer, daily/monthly/yearly performance pills, day's/52-week range gauges, seasonals chart
- **Order Book pane** — Live order book depth for the active symbol
- **Scanner** — Configurable symbol scanner across the watchlist or top pairs
- **Layout persistence** — Autosave + named layouts saved to server; layout selector dropdown in the toolbar
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

Kline fetching uses an ordered fallback chain: **active exchange → Gate.io → Binance**.  
Missing watchlist prices are refreshed via Binance batch ticker every 30 s, with per-exchange REST fallback for symbols not on Binance.  
The watchlist symbol search also queries **CoinGecko** (debounced) to discover coins not listed on the active exchange — results are added as `{SYMBOL}USDT` pairs.

## Tech Stack

- **Frontend:** Vanilla ES modules (`type="module"`), no bundler
- **Charts:** [LightweightCharts v4.1.3](https://tradingview.github.io/lightweight-charts/)
- **Backend:** Node.js + Express — server-side kline cache (JSON files), session/layout persistence
- **Styling:** Single CSS file with CSS custom properties for theming

## Getting Started

```bash
npm install
npm start        # starts on http://localhost:3000
```

## Project Structure

```
crypto-pro-charts/
├── public/
│   ├── index.html
│   └── css/style.css
├── src/js/
│   ├── main.js          # app entry point
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
├── server.js            # Express server + kline proxy/cache
├── data/                # session.json, layouts/
├── cache/klines/        # server-side bar cache
└── memory.md            # running changelog
```

---

Created by **Erik Kuipers** · © 2026
