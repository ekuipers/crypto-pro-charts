// ============================================================
// APP STATE — singleton; import state everywhere
// ============================================================
import { WATCHLISTS_INIT, DEFAULT_THEME } from './constants.js';

let state = {
  theme: DEFAULT_THEME,
  layout: 'l1',
  gridSizes: {},     // { l2h: '1fr 1fr', ... } custom drag-resized grid templates
  obGrouping: 'auto',// order book price-grouping level
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
  // `exchanges` is the list of exchanges to query for the symbol picker (multi-
  // exchange watchlists). `exchange` is kept as the legacy default/fallback used
  // when a watchlist item or panel has no explicit exchange of its own.
  settings: { exchange: 'binance', exchanges: ['binance'], upColor: '#26a69a', downColor: '#ef5350' },
  alerts: [],        // [{id, symbol, price, condition:'above'|'below', note, triggered}]
  alertIdCounter: 0,
  allPairs: null,    // cached all tradeable pairs (across enabled exchanges)
  allPairsKey: null, // enabled-exchange set the cached allPairs was built for
  symSearchActive: false,
  orderBookWS: null,
  obData: { bids: [], asks: [], symbol: null },
  rightTab: 'watchlist',
  klineCache: {},      // { 'binance:BTCUSDT:1h': { data, ts } }
  symColors: {},       // { 'BTCUSDT': '#color' }
  showEventMarkers: true,
};

// drawingState lives here so it can be imported without circular deps
let drawingState = {
  tool: 'select',
  color: '#2962ff',
  width: 1,
  phase: 0,
  p1: null, p2: null, p3: null,
  pendingType: null,
  selected: null,        // currently selected drawing object (for handles/config)
  selectedPanel: null,   // panel that owns the selected drawing
};

export { state, drawingState };
