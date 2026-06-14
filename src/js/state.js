// ============================================================
// APP STATE — singleton; import state everywhere
// ============================================================
import { WATCHLISTS_INIT } from './constants.js';

let state = {
  theme: 'dark',
  layout: 'l1',
  panels: [],
  activePanel: null,
  watchlists: JSON.parse(JSON.stringify(WATCHLISTS_INIT)),
  currentWatchlist: 'Favorites',
  prices: {},        // { BTCUSDT: { price, open24h, chgVal, change24h } }
  ws: null,          // price WebSocket
  panelCount: 0,
  indFilter: '',
  symFilter: '',
  wlSort: { col: 'name', dir: 'asc' },
  settings: { exchange: 'binance', upColor: '#26a69a', downColor: '#ef5350' },
  alerts: [],        // [{id, symbol, price, condition:'above'|'below', note, triggered}]
  alertIdCounter: 0,
  allPairs: null,    // cached all tradeable pairs
  symSearchActive: false,
  orderBookWS: null,
  obData: { bids: [], asks: [], symbol: null },
  rightTab: 'watchlist',
  klineCache: {},      // { 'binance:BTCUSDT:1h': { data, ts } }
  symColors: {},       // { 'BTCUSDT': '#color' }
};

// drawingState lives here so it can be imported without circular deps
let drawingState = {
  tool: 'select',
  color: '#2962ff',
  width: 1,
  phase: 0,
  p1: null, p2: null, p3: null,
  pendingType: null,
};

export { state, drawingState };
