// ============================================================
// CONSTANTS — static configuration (no imports needed)
// ============================================================
const BINANCE = 'https://api.binance.com/api/v3';
const COLORS = ['#2962ff','#f7a600','#9c27b0','#00bcd4','#4caf50','#ff5722','#e91e63','#607d8b','#795548','#009688','#ff9800','#3f51b5'];

const WATCHLISTS_INIT = {
  'Favorites': [
    { symbol:'BTCUSDT', name:'Bitcoin' },
    { symbol:'ETHUSDT', name:'Ethereum' },
    { symbol:'BNBUSDT', name:'BNB' },
    { symbol:'SOLUSDT', name:'Solana' },
    { symbol:'XRPUSDT', name:'XRP' },
    { symbol:'ADAUSDT', name:'Cardano' },
    { symbol:'DOGEUSDT', name:'Dogecoin' },
    { symbol:'AVAXUSDT', name:'Avalanche' },
    { symbol:'LINKUSDT', name:'Chainlink' },
    { symbol:'DOTUSDT', name:'Polkadot' },
  ],
  'DeFi': [
    { symbol:'UNIUSDT', name:'Uniswap' },
    { symbol:'AAVEUSDT', name:'Aave' },
    { symbol:'MKRUSDT', name:'Maker' },
    { symbol:'CRVUSDT', name:'Curve' },
    { symbol:'SUSHIUSDT', name:'SushiSwap' },
    { symbol:'SNXUSDT', name:'Synthetix' },
    { symbol:'COMPUSDT', name:'Compound' },
    { symbol:'1INCHUSDT', name:'1inch' },
  ],
  'Layer 1': [
    { symbol:'ETHUSDT', name:'Ethereum' },
    { symbol:'SOLUSDT', name:'Solana' },
    { symbol:'AVAXUSDT', name:'Avalanche' },
    { symbol:'ADAUSDT', name:'Cardano' },
    { symbol:'DOTUSDT', name:'Polkadot' },
    { symbol:'NEARUSDT', name:'NEAR Protocol' },
    { symbol:'ATOMUSDT', name:'Cosmos' },
    { symbol:'ALGOUSDT', name:'Algorand' },
  ],
  'Layer 2': [
    { symbol:'MATICUSDT', name:'Polygon' },
    { symbol:'ARBUSDT', name:'Arbitrum' },
    { symbol:'OPUSDT', name:'Optimism' },
    { symbol:'LDOUSDT', name:'Lido DAO' },
    { symbol:'IMXUSDT', name:'ImmutableX' },
  ],
  'Meme': [
    { symbol:'DOGEUSDT', name:'Dogecoin' },
    { symbol:'SHIBUSDT', name:'Shiba Inu' },
    { symbol:'PEPEUSDT', name:'Pepe' },
    { symbol:'FLOKIUSDT', name:'Floki' },
    { symbol:'WIFUSDT', name:'dogwifhat' },
    { symbol:'BONKUSDT', name:'Bonk' },
  ],
};

const INDICATORS_DEF = [
  // Overlays
  { id:'sma',       name:'SMA',       full:'Simple Moving Average',        type:'overlay',
    params:[{ n:'period', l:'Period', d:20, mn:2, mx:500 }], color:'#2962ff' },
  { id:'ema',       name:'EMA',       full:'Exponential Moving Average',   type:'overlay',
    params:[{ n:'period', l:'Period', d:20, mn:2, mx:500 }], color:'#f7a600' },
  { id:'wma',       name:'WMA',       full:'Weighted Moving Average',      type:'overlay',
    params:[{ n:'period', l:'Period', d:20, mn:2, mx:500 }], color:'#9c27b0' },
  { id:'bb',        name:'BB',        full:'Bollinger Bands',              type:'overlay',
    params:[{ n:'period', l:'Period', d:20, mn:2, mx:200 },{ n:'mult', l:'Std Dev', d:2, mn:0.1, mx:10, s:0.1 }], color:'#00bcd4' },
  { id:'vwap',      name:'VWAP',      full:'Volume Weighted Avg Price',    type:'overlay',
    params:[], color:'#ff9800' },
  { id:'ich',       name:'Ichimoku',  full:'Ichimoku Cloud',               type:'overlay',
    params:[{ n:'tenkan', l:'Tenkan', d:9, mn:1, mx:100 },{ n:'kijun', l:'Kijun', d:26, mn:1, mx:200 },{ n:'senkou', l:'Senkou B', d:52, mn:1, mx:300 }], color:'#4caf50' },
  { id:'psar',      name:'P.SAR',     full:'Parabolic SAR',                type:'overlay',
    params:[{ n:'step', l:'Step', d:0.02, mn:0.001, mx:0.5, s:0.001 },{ n:'maxaf', l:'Max AF', d:0.2, mn:0.01, mx:1, s:0.01 }], color:'#e91e63' },
  { id:'dema',      name:'DEMA',      full:'Double EMA',                   type:'overlay',
    params:[{ n:'period', l:'Period', d:21, mn:2, mx:500 }], color:'#ff5722' },
  { id:'tema',      name:'TEMA',      full:'Triple EMA',                   type:'overlay',
    params:[{ n:'period', l:'Period', d:21, mn:2, mx:500 }], color:'#607d8b' },
  { id:'pivot',     name:'Pivots',    full:'Pivot Points',                 type:'overlay',
    params:[], color:'#795548' },
  { id:'supertrend',name:'SuperTrend',full:'SuperTrend',                   type:'overlay',
    params:[{ n:'period', l:'ATR Period', d:10, mn:1, mx:100 },{ n:'mult', l:'Multiplier', d:3, mn:0.1, mx:20, s:0.1 }], color:'#4caf50' },
  { id:'keltner',   name:'KC',        full:'Keltner Channels',             type:'overlay',
    params:[{ n:'period', l:'EMA Period', d:20, mn:2, mx:200 },{ n:'mult', l:'ATR Mult', d:1.5, mn:0.1, mx:10, s:0.1 },{ n:'atrp', l:'ATR Period', d:10, mn:1, mx:100 }], color:'#00bcd4' },
  { id:'donchian',  name:'DC',        full:'Donchian Channels',            type:'overlay',
    params:[{ n:'period', l:'Period', d:20, mn:2, mx:500 }], color:'#9c27b0' },
  { id:'volprofile', name:'Vol Profile', full:'Volume Profile',            type:'overlay',
    params:[{ n:'bins', l:'Price Levels', d:30, mn:5, mx:100 }], color:'#607d8b' },
  { id:'heikinashi', name:'Heikin Ashi', full:'Heikin Ashi',              type:'overlay',
    params:[], color:'#ff9800' },
  { id:'htflevels', name:'HTF Levels', full:'HTF Levels',                 type:'overlay',
    params:[{ n:'prevday', l:'Prev Day H/L', d:1, mn:0, mx:1 },{ n:'prevweek', l:'Prev Week H/L', d:1, mn:0, mx:1 }], color:'#795548' },
  { id:'maribbon',  name:'MA Ribbon', full:'MA Ribbon (8 EMAs)',           type:'overlay',
    params:[], color:'#2962ff' },
  { id:'avwap',     name:'Anch.VWAP', full:'Anchored VWAP',               type:'overlay',
    params:[{ n:'bars', l:'Anchor Bars Ago', d:50, mn:1, mx:500 }], color:'#ff5722' },
  // Oscillators
  { id:'rsi',       name:'RSI',       full:'Relative Strength Index',      type:'oscillator',
    params:[{ n:'period', l:'Period', d:14, mn:2, mx:100 }], color:'#2962ff' },
  { id:'macd',      name:'MACD',      full:'MACD',                         type:'oscillator',
    params:[{ n:'fast', l:'Fast', d:12, mn:1, mx:100 },{ n:'slow', l:'Slow', d:26, mn:1, mx:200 },{ n:'sig', l:'Signal', d:9, mn:1, mx:100 }], color:'#f7a600' },
  { id:'stoch',     name:'Stoch',     full:'Stochastic Oscillator',        type:'oscillator',
    params:[{ n:'kp', l:'%K Period', d:14, mn:1, mx:200 },{ n:'dp', l:'%D Period', d:3, mn:1, mx:100 }], color:'#9c27b0' },
  { id:'atr',       name:'ATR',       full:'Average True Range',           type:'oscillator',
    params:[{ n:'period', l:'Period', d:14, mn:1, mx:200 }], color:'#00bcd4' },
  { id:'adx',       name:'ADX',       full:'Average Directional Index',    type:'oscillator',
    params:[{ n:'period', l:'Period', d:14, mn:1, mx:100 }], color:'#4caf50' },
  { id:'cci',       name:'CCI',       full:'Commodity Channel Index',      type:'oscillator',
    params:[{ n:'period', l:'Period', d:20, mn:2, mx:200 }], color:'#ff5722' },
  { id:'obv',       name:'OBV',       full:'On-Balance Volume',            type:'oscillator',
    params:[], color:'#e91e63' },
  { id:'willr',     name:'Will %R',   full:'Williams %R',                  type:'oscillator',
    params:[{ n:'period', l:'Period', d:14, mn:1, mx:200 }], color:'#607d8b' },
  { id:'mfi',       name:'MFI',       full:'Money Flow Index',             type:'oscillator',
    params:[{ n:'period', l:'Period', d:14, mn:1, mx:100 }], color:'#795548' },
  { id:'roc',       name:'ROC',       full:'Rate of Change',               type:'oscillator',
    params:[{ n:'period', l:'Period', d:12, mn:1, mx:200 }], color:'#009688' },
  { id:'stochrsi',  name:'Stoch RSI', full:'Stochastic RSI',               type:'oscillator',
    params:[{ n:'rsiP', l:'RSI Period', d:14, mn:2, mx:100 },{ n:'stochP', l:'Stoch Period', d:14, mn:2, mx:100 },{ n:'k', l:'K Smooth', d:3, mn:1, mx:20 },{ n:'d', l:'D Smooth', d:3, mn:1, mx:20 }], color:'#ff9800' },
  { id:'dmi',       name:'DMI',       full:'Directional Movement Index',   type:'oscillator',
    params:[{ n:'period', l:'Period', d:14, mn:1, mx:100 }], color:'#2962ff' },
  { id:'cmf',       name:'CMF',       full:'Chaikin Money Flow',           type:'oscillator',
    params:[{ n:'period', l:'Period', d:20, mn:2, mx:100 }], color:'#4caf50' },
  { id:'tsi',       name:'TSI',       full:'True Strength Index',          type:'oscillator',
    params:[{ n:'long', l:'Long', d:25, mn:2, mx:100 },{ n:'short', l:'Short', d:13, mn:2, mx:100 }], color:'#9c27b0' },
  { id:'uo',        name:'UO',        full:'Ultimate Oscillator',          type:'oscillator',
    params:[{ n:'p1', l:'Period 1', d:7, mn:1, mx:50 },{ n:'p2', l:'Period 2', d:14, mn:1, mx:100 },{ n:'p3', l:'Period 3', d:28, mn:1, mx:200 }], color:'#f7a600' },
];

const EXCHANGES = {
  binance: { id:'binance', name:'Binance', rest:'https://api.binance.com/api/v3', status:'Full: REST + WebSocket',
    intervals:{ '1m':'1m','5m':'5m','15m':'15m','30m':'30m','1h':'1h','4h':'4h','1d':'1d','1w':'1w' } },
  bybit:   { id:'bybit',   name:'Bybit',   rest:'https://api.bybit.com/v5/market', status:'Full: REST + WebSocket',
    intervals:{ '1m':'1','5m':'5','15m':'15','30m':'30','1h':'60','4h':'240','1d':'D','1w':'W' } },
  okx:     { id:'okx',     name:'OKX',     rest:'https://www.okx.com/api/v5/market', status:'REST only',
    intervals:{ '1m':'1m','5m':'5m','15m':'15m','30m':'30m','1h':'1H','4h':'4H','1d':'1D','1w':'1W' } },
  gate:    { id:'gate',    name:'Gate.io', rest:'https://api.gateio.ws/api/v4/spot', status:'REST only',
    intervals:{ '1m':'1m','5m':'5m','15m':'15m','30m':'30m','1h':'1h','4h':'4h','1d':'1d','1w':'7d' } },
  hyperliquid: { id:'hyperliquid', name:'Hyperliquid', rest:'https://api.hyperliquid.xyz/info', status:'Perps only',
    intervals:{ '1m':'1m','5m':'5m','15m':'15m','30m':'30m','1h':'1h','4h':'4h','1d':'1d','1w':'1w' } },
};

const LAYOUT_COUNTS = { l1: 1, l2h: 2, l2v: 2, l4: 4 };

// ---- Themes (2 light + 4 dark). `chart` holds Lightweight-Charts colors;
//      the matching CSS variables live in style.css keyed by [data-theme]. ----
const THEMES = {
  'dark-classic': { label: 'Dark Classic', mode: 'dark',
    chart: { bg: '#131722', text: '#d1d4dc', grid: '#1e222d', border: '#2a2e39', accent: '#2962ff' } },
  'dark-midnight': { label: 'Midnight Blue', mode: 'dark',
    chart: { bg: '#0c1a2b', text: '#cdd9e5', grid: '#13283f', border: '#1d3a57', accent: '#3b82f6' } },
  'dark-matrix': { label: 'Matrix Green', mode: 'dark',
    chart: { bg: '#0a0f0a', text: '#c8f7c5', grid: '#10210f', border: '#1c361a', accent: '#22c55e' } },
  'dark-carbon': { label: 'Carbon', mode: 'dark',
    chart: { bg: '#16181d', text: '#cfd2d8', grid: '#222530', border: '#33373f', accent: '#a78bfa' } },
  'light-classic': { label: 'Light Classic', mode: 'light',
    chart: { bg: '#ffffff', text: '#131722', grid: '#e0e3eb', border: '#d6dcde', accent: '#2962ff' } },
  'light-warm': { label: 'Warm Sand', mode: 'light',
    chart: { bg: '#fbf7f0', text: '#3b3022', grid: '#ece2d2', border: '#d9cab2', accent: '#c2761c' } },
};
const DEFAULT_THEME = 'dark-classic';
// Map legacy persisted values to new theme keys
const LEGACY_THEME = { dark: 'dark-classic', light: 'light-classic' };

export { BINANCE, COLORS, WATCHLISTS_INIT, INDICATORS_DEF, EXCHANGES, LAYOUT_COUNTS, THEMES, DEFAULT_THEME, LEGACY_THEME };
