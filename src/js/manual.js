// ============================================================
// USER MANUAL — left-side slide-out reference for how the app works
// (Suite roadmap, Charts-only: Help button in the top bar, unfolds from the
// left with a table-of-contents + content layout)
// ============================================================
import { esc } from './utils.js';

// Each section is plain-language, end-user-facing documentation — no
// implementation detail. Keep in sync with the actual UI: if a button,
// tab, or behavior described here changes, update the matching section.
const SECTIONS = [
  {
    id: 'overview', title: 'Getting Started',
    html: `
      <p>CryptoPro Charts is a multi-chart crypto charting tool. The screen is split into four areas:</p>
      <ul>
        <li><b>Top bar</b> — panel toggles, layout picker, and app-wide actions (refresh, event markers, patterns guide, templates, save, layouts, alerts, settings, theme, sign-in, this manual).</li>
        <li><b>Left panel (◧ to toggle)</b> — the indicators active on the currently selected chart.</li>
        <li><b>Chart area</b> — one or more chart panels, arranged by the current layout.</li>
        <li><b>Right panel (☰ to toggle)</b> — tabbed: Watchlist, Events, Book, Info, Scanner, Paper.</li>
      </ul>
      <p>A thin drawing toolbar sits on the far left of the chart area for trendlines, Fibonacci tools, and more.</p>
      <p>Everything you set up — layout, symbols, timeframes, indicators, drawings, theme — autosaves about 1.5 seconds after each change and restores automatically the next time you open the app.</p>`,
  },
  {
    id: 'layouts', title: 'Charts & Layouts',
    html: `
      <p>The <b>layout dropdown</b> in the top bar switches between Single, 2 Columns, 2 Rows, 4/6/8-Grid, or any layout you've saved yourself. Grid splitters between panels can be dragged to resize columns/rows.</p>
      <p>Each chart panel's header bar has:</p>
      <ul>
        <li>A <b>symbol button</b> — click it to unfold a searchable symbol list right below it and switch the pair on that panel. Any symbol works, not just ones already on a watchlist; picking one also adds it to your current watchlist.</li>
        <li>A live <b>price readout</b>, colored green/red against the last tick.</li>
        <li>A <b>chart-type selector</b> — Candles, Hollow, Bars, Line, Area, Heikin Ashi, Renko.</li>
        <li><b>Timeframe pills</b> you've favorited (★), plus a "▾" dropdown to pin/unpin more.</li>
        <li>A candle-close countdown timer, and a <b>☰ hamburger menu</b> for per-panel actions.</li>
      </ul>
      <p>The hamburger menu holds: Log scale, Percent scale, Link symbol (color-coded groups where panels follow one symbol together), Bar replay, Compare/overlay (adds another symbol's line to the same chart), Indicators, Save as PNG, Export CSV, Fullscreen, and Close chart.</p>
      <p>Time-range buttons along the bottom (1D/3D/1W/1M/3M/6M/1Y/All) zoom the visible range; panning left near the start of loaded history fetches older bars automatically.</p>
      <p>If two or more panels are in the same link group, moving the crosshair on one moves it on all of them, and the OHLC readout follows the crosshair.</p>`,
  },
  {
    id: 'drawing', title: 'Drawing Tools',
    html: `
      <p>The toolbar on the left edge of the chart area holds: Cursor, Trend Line, Ray, Extended Line, Horizontal Line, Vertical Line, Rectangle, Parallel Channel, Fib Retracement, Fib Extension, Fib Time Zones, Pitchfork, Long/Short Position, Text, Measure, and Eraser — plus Export/Import (JSON), Clear all, and a Magnet toggle that snaps new points to a bar's open/high/low/close.</p>
      <p>Most tools take 2–3 clicks to place; Horizontal Line, Vertical Line, and Text draw on a single click (Text also prompts for a caption).</p>
      <p>Switch to the Cursor tool to select a shape — drag it or its handles to reshape it, or open its config popover to change color, width, solid/dashed style, exact bar/price coordinates, lock it, or delete it. A locked shape can't be moved, edited, or erased until unlocked again.</p>
      <p>The <b>Long/Short Position</b> tool auto-computes a 1:2 stop and shows Entry/Target/Stop with % and risk:reward; its popover has a "📝 Log Trade" button that sends the setup straight to Paper Trading.</p>
      <p>Every drawing change on a panel is tracked for Undo/Redo, up to 50 steps back.</p>`,
  },
  {
    id: 'indicators', title: 'Indicators',
    html: `
      <p>Click the <b>+</b> button at the top of the left Indicators panel to open a searchable list of every available indicator, tagged Overlay or Oscillator. Indicators with parameters (period, source, color, etc.) open a small config modal before being added; parameter-less ones are added immediately. The dropdown stays open so you can add several at once.</p>
      <p>Active indicators show as chips under the panel:</p>
      <ul>
        <li>Click the <b>chip name</b> to toggle it active/inactive without removing it.</li>
        <li>Click the <b>colored dot</b> to reopen its params/color.</li>
        <li>Click the <b>×</b> to remove it.</li>
      </ul>
      <p>Indicator math runs in a background worker, so adding several indicators across a multi-chart layout doesn't freeze the UI.</p>`,
  },
  {
    id: 'watchlist', title: 'Watchlist & Market Status',
    html: `
      <p>The <b>Watchlist</b> tab supports multiple named lists (tabs along the top) — add, rename, delete, and drag to reorder them. Right-click a row to move or copy it to another list, or to color-tag it.</p>
      <p>Each row shows the symbol, an exchange badge when a list mixes exchanges, a 24h sparkline, price, and % change; columns are sortable and rows are drag-to-reorder.</p>
      <p><b>+ Symbol</b> opens a searchable picker that filters by exchange and quote currency, can hide stablecoins, and also surfaces coins from CoinGecko that aren't yet on a connected exchange. <b>▦ Heatmap</b> swaps the list view for color tiles sized and colored by 24h % change. The search box above the list does live symbol/coin search across all pairs plus CoinGecko.</p>
      <p>Above the list, the <b>market status</b> strip shows the Fear & Greed Index, the Altcoin Season Index (both with a meter and change vs. yesterday), and global stats — BTC dominance, total market cap with 24h change, and 24h volume. This refreshes every 10 minutes.</p>`,
  },
  {
    id: 'orderbook', title: 'Order Book & Info',
    html: `
      <p>The <b>Book</b> tab has three sub-tabs: <b>Book</b> (a live bid/ask ladder with a spread-grouping selector — Auto or a fixed increment), <b>Trades</b> (a live time-and-sales tape), and <b>Depth</b> (a cumulative bid/ask area chart).</p>
      <p>The <b>Info</b> tab shows the current price and 24h change, 7D/1M/1Y performance pills, Day's-range and 52-Week-range gauges, an RSI(14) "buy/sell pressure" speedometer, a monthly seasonality bar chart, and a "🔔 Set Price Alert" shortcut that opens the alert form pre-filled with the current price.</p>`,
  },
  {
    id: 'scanner', title: 'Scanner',
    html: `
      <p>The <b>Scanner</b> tab runs one of: Top Gainers, Top Losers, Highest Volume, RSI Overbought/Oversold, Above/Below EMA 200, or Volume Spike (≥2× average) — scoped to either your current watchlist or all pairs.</p>
      <p>Check results and bulk-add them to any watchlist. Clicking a result loads it onto the active chart. Scans can be saved and reloaded by name, and toggling <b>Auto</b> re-runs the scan every 20 seconds and toasts newly-matching symbols.</p>`,
  },
  {
    id: 'paper', title: 'Paper Trading',
    html: `
      <p><b>+ New Trade</b> opens a form for symbol, side, quantity, entry, and leverage (with a live estimated-liquidation preview), plus stop, target, and notes. You can also log a trade straight from a Long/Short chart drawing.</p>
      <p>Open positions show live P&L, TP/SL/liquidation levels, and margin. Per-row actions: toggle chart visibility (👁/🚫), edit terms (✎), close (prompts for an exit price) or "Close at liquidation" once price crosses the estimate, and delete.</p>
      <p>Open trades are drawn directly on the matching chart as entry/TP/SL/liquidation lines with a live P&L badge, unless hidden with the eye toggle. Closing a trade moves it to a <b>Journal</b> list with entry→exit, P&L, and an editable note.</p>`,
  },
  {
    id: 'alerts', title: 'Alerts & Notifications',
    html: `
      <p>The <b>🔔</b> button opens a slide-out panel; <b>+ Add</b> creates a new alert. When the server and database are available, alerts support Price cross, % move (with a time window), RSI level (per timeframe), and Volume spike (× average); without a server they fall back to local Price-cross-only alerts.</p>
      <p>Server-side alerts persist and fire even with the tab closed — the app polls for triggered alerts every 30 seconds. Firing an alert shows a toast and, if you've granted permission, a browser notification. The <b>🔔</b> button shows a badge with the count of active alerts.</p>`,
  },
  {
    id: 'patterns', title: 'Patterns Guide',
    html: `
      <p>The <b>📐</b> button opens a reference of common chart patterns (Head & Shoulders, Double/Triple Top/Bottom, triangles, wedges, flags/pennant, cup & handle, rounding bottom, rectangle, broadening formation) — each with a description, a small schematic diagram, and the specific breakout level to watch. Filter by All/Bullish/Bearish/Neutral using the tabs at the top. This panel is purely informational and doesn't touch the chart.</p>
      <p>The <b>📅</b> button (top bar) is different — it toggles small markers directly on your charts: red dots below candles for past high-impact events, and blue dots for high-impact events projected up to two weeks ahead. Click a marker (or a row in the <b>Events</b> tab) to see that event's detail.</p>`,
  },
  {
    id: 'saving', title: 'Save, Layouts & Templates',
    html: `
      <p><b>Save</b> prompts for a name and stores your entire current session — theme, layout, grid sizes, and every panel's symbol, timeframe, chart type, indicators, overlays, and drawings — as a named layout (up to 10). <b>Layouts</b> lists saved layouts to load or delete; loading one fully replaces your current chart setup.</p>
      <p><b>Templates</b> are indicator-only presets — built-in ones (Trend Setup, Mean Reversion, Momentum, Volume Focus) plus your own saved ones (up to 20, via "Save current as template" from a chart's active indicators). Applying a template adds its indicators to the active chart without touching layout or drawings.</p>
      <p>A panel's hamburger menu also has <b>Save as PNG</b> (a screenshot with your drawings composited in, plus a watermark) and <b>Export CSV</b> (the currently visible bars).</p>
      <p>Watchlists sync separately, tied to your account rather than to any saved layout.</p>`,
  },
  {
    id: 'palette', title: 'Command Palette & Deep Links',
    html: `
      <p>Press <b>Ctrl/Cmd + K</b> to open the command palette. It fuzzy-searches symbols (jumps the active chart to one you pick) and app actions — change layout, toggle panels/theme/event markers, refresh, open Save/Layouts/Templates/Alerts/Settings/Account, toggle replay, or export the active chart as PNG/CSV. Use the arrow keys and Enter to navigate and select.</p>
      <p>The browser URL always reflects what you're looking at — <code>?symbol=BTCUSDT&exchange=binance#watchlist</code> — and updates live as you switch charts or tabs. Opening a link like that loads the matching symbol/exchange and switches to that right-panel tab, which makes it easy to share a specific chart or view with someone else. The symbol doesn't need to be on any of your watchlists — a link can point at any symbol the exchange actually lists, which is how other CryptoPro apps (like Trader) deep-link you straight to a chart. If the symbol in the link doesn't exist on that exchange, an error toast tells you so and your current chart is left alone.</p>`,
  },
  {
    id: 'replay', title: 'Bar Replay',
    html: `
      <p>Start replay from a panel's hamburger menu ("⏮ Bar replay"). The chart freezes to historical data and a replay bar appears with: exit (✕), step back/forward, play/pause with 0.5×/1×/2×/4× speed, and a scrub slider showing your position in history. Exiting restores live data and resumes streaming automatically.</p>`,
  },
  {
    id: 'account', title: 'Account & Sync',
    html: `
      <p>The <b>👤 Sign in</b> button opens a single modal with both "Create account" and "Sign in" (username + password, 3–32 characters). If the account has two-factor authentication enabled, sign-in also asks for a 6-digit authenticator code.</p>
      <p>Once signed in, your layouts, watchlists, templates, and alerts are saved to your account on the server instead of only to this browser — so they follow you across devices and browsers. Click the account button again while signed in to change your password, enable/disable 2FA, or sign out.</p>
      <p>This account is shared across the whole CryptoPro suite (Trader, Charts, Training) — one sign-in works everywhere.</p>`,
  },
  {
    id: 'settings', title: 'Settings & Theme',
    html: `
      <p>The <b>⚙</b> button opens Settings, where you choose which exchanges are queried for data (a warning appears if you only select REST-only exchanges like OKX/Gate, since those don't have a live WebSocket feed) and set your up/down candle colors, which apply immediately.</p>
      <p>The <b>◐</b> button cycles the color theme; your choice is remembered and restored on reload.</p>`,
  },
];

let activeId = SECTIONS[0].id;

function tocHtml(filter) {
  const items = filter
    ? SECTIONS.filter(s => s.title.toLowerCase().includes(filter) || s.html.toLowerCase().includes(filter))
    : SECTIONS;
  if (!items.length) return '<p class="muted manual-empty">No matches.</p>';
  return items.map(s => `<button class="manual-toc-item${s.id === activeId ? ' active' : ''}" data-id="${s.id}">${esc(s.title)}</button>`).join('');
}

function contentHtml(id) {
  const section = SECTIONS.find(s => s.id === id) || SECTIONS[0];
  return `<h3>${esc(section.title)}</h3>${section.html}`;
}

function renderToc(filter = '') {
  document.getElementById('manualToc').innerHTML = tocHtml(filter);
}

function renderContent() {
  document.getElementById('manualContent').innerHTML = contentHtml(activeId);
  document.getElementById('manualContent').scrollTop = 0;
}

function selectSection(id) {
  activeId = id;
  renderToc(document.getElementById('manualSearch').value.trim().toLowerCase());
  renderContent();
}

function toggleManualPanel() {
  document.getElementById('manualPanel').classList.toggle('open');
}

export function initManualGuide() {
  document.getElementById('helpBtn')?.addEventListener('click', () => {
    const panel = document.getElementById('manualPanel');
    if (!panel.classList.contains('open')) {
      document.getElementById('manualSearch').value = '';
      renderToc();
      renderContent();
    }
    toggleManualPanel();
  });
  document.getElementById('closeManualBtn')?.addEventListener('click', toggleManualPanel);
  document.getElementById('manualToc')?.addEventListener('click', e => {
    const btn = e.target.closest('.manual-toc-item');
    if (btn) selectSection(btn.dataset.id);
  });
  document.getElementById('manualSearch')?.addEventListener('input', e => renderToc(e.target.value.trim().toLowerCase()));
}
