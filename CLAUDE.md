# Introduction

You are the designer and builder of a professional trading charting website, make sure that, it supports multiple graphs on a single page. It has the same like user interface as traidingview.

Title: CryptoPro Charts
Creator: Erik Kuipers

Add the creator to the footer of the website.

# Workflow rule

1. After every change to a code file, append a dated entry to `memory.md` describing what changed and why (problem, fix, and how it was verified). Treat `memory.md` as the running changelog — no code edit is complete until `memory.md` is updated. 
2. Only start local node server for testing purpose.
3. Move completed roadmap items and bug fixes to the memory file for reference and change log purpose
4. Automatically commit changes to git and sync with remote repo
5. Update documentation.
6. Update version number in the footer with the lastest version in the change log.
7. Always directly implement roadmap after the roadmap scan.
8. Allow all edits and commands automatically.
9. Place frontend .js files in the /src/js folder and backend .js files in the /src folder.
10. Use favicon as Site logo.

## Roadmap

_Populated 2026-07-11 from a full project analysis. Ordered by priority: P2 = strong differentiators, P3 = polish/platform. Completed items move to `memory.md` (P1 core charting gaps shipped in v1.22.0)._

### P2 — Pro-trader differentiators

9. **Derivatives data overlays** — funding rate, open interest, and liquidation levels (Binance/Bybit/OKX futures APIs). This is the #1 thing crypto pros check that generic charting tools lack.
10. **Bar replay mode** — step through history candle-by-candle at chosen speed for setup training; pairs naturally with the kline database (item 4).
11. **Long/short position drawing tool** — risk/reward box with entry, target, stop and R:R readout; the most-used TradingView drawing missing here. Also add pitchfork, fib time zones, and magnet/snap-to-OHLC for existing tools.
12. **Indicator templates** — save/load named indicator sets per user (DB-backed like layouts) so a pro can flip between e.g. "Scalping" and "Swing" setups in one click.
13. **Full-market screener upgrade** — extend `scanner.js` from watchlist-only to all enabled-exchange pairs with indicator-based filters (RSI, volume spike, % change), saved scans, and scan-hit alerts.
14. **Time & sales + depth chart** — trades tape pane and cumulative depth visualization next to the existing order book.
15. **Paper trading & trade journal** — simulated orders placed on-chart, P&L tracking, and a journal with notes/tags per trade, persisted per account.
16. **Watchlist enrichment** — mini sparklines, 24h volume column, funding/OI columns, and performance heatmap view.

### P3 — Platform, performance & hardening

17. **Native WebSockets for Bybit/OKX/KuCoin/Gate** — replace REST polling fallbacks with real WS streams via a server-side connection manager (one upstream socket fan-out to all clients).
18. **Test suite + CI** — zero tests today. Priority: unit tests for indicator math (`indicators.js`) and exchange normalizers (`server.js` `normalize()`) — data correctness is the product for pros. Add GitHub Actions running `node --test`.
19. **Auth hardening** — rate-limit login/register endpoints, CSRF token on state-changing routes, security headers (helmet or manual), password reset flow, optional TOTP 2FA.
20. **Web Worker indicator computation** — move heavy indicator math off the main thread to keep 4-chart layouts smooth on lower-end machines.
21. **Upgrade LightweightCharts 4.1.3 → v5** — native panes (simplifies the custom oscillator sub-pane code), better performance, active support.
22. **Command palette (Ctrl+K)** — instant symbol search/switch and action launcher, TradingView-style.
23. **Chart snapshot & export** — one-click PNG screenshot with watermark, plus CSV export of visible bars.
24. **Undo/redo for drawings** — Ctrl+Z/Ctrl+Y stack in `drawings.js`.
25. **Mobile/tablet layout + PWA** — responsive single-chart mode with touch drawing, installable with offline shell.
26. **Larger grid layouts** — 6- and 8-chart grids (2×3, 2×4) for multi-market monitoring on big screens.

## Bugs

_No open bugs. Fixed bugs are logged in `memory.md`._
