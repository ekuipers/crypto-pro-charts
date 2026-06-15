// ============================================================
// CONSTANTS — static configuration (no imports needed)
// ============================================================
const BINANCE = 'https://api.binance.com/api/v3';

// Candle interval duration in seconds, keyed by timeframe id.
export const TF_SECONDS = { '1m':60,'5m':300,'15m':900,'30m':1800,'1h':3600,'4h':14400,'1d':86400,'1w':604800 };
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
  kucoin: { id:'kucoin', name:'KuCoin', rest:'https://api.kucoin.com/api/v1', status:'REST only',
    intervals:{ '1m':'1min','5m':'5min','15m':'15min','30m':'30min','1h':'1hour','4h':'4hour','1d':'1day','1w':'1week' } },
};

// Short, plain-language descriptions shown as a hover tooltip in the indicator
// pane. Keyed by indicator id (see INDICATORS_DEF).
const INDICATOR_DESC = {
  sma: 'Average closing price over N bars — smooths price to reveal the underlying trend.',
  ema: 'Exponential moving average — like SMA but weights recent bars more, so it reacts faster.',
  wma: 'Weighted moving average — linearly favors the most recent bars over older ones.',
  bb: 'Bollinger Bands — an SMA with ±N standard-deviation bands that widen on volatility and flag extremes.',
  vwap: 'Volume Weighted Average Price — the volume-weighted average, reset each day; a key intraday fair-value line.',
  ich: 'Ichimoku Cloud — a multi-line system showing trend, momentum and support/resistance with a forward "cloud".',
  psar: 'Parabolic SAR — trailing dots that flag trend direction and potential reversal points.',
  dema: 'Double EMA — a reduced-lag EMA that turns faster than a standard EMA.',
  tema: 'Triple EMA — even less lag than DEMA for quicker trend response.',
  pivot: 'Pivot Points — classic support/resistance levels derived from the prior bar’s high, low and close.',
  supertrend: 'SuperTrend — an ATR-based trailing stop that colors with the prevailing trend direction.',
  keltner: 'Keltner Channels — an EMA envelope whose width is set by ATR; gauges trend and breakouts.',
  donchian: 'Donchian Channels — the highest high and lowest low over N bars; classic breakout bands.',
  volprofile: 'Volume Profile — a horizontal histogram of how much volume traded at each price level.',
  heikinashi: 'Heikin Ashi — smoothed candles that filter noise and make trends easier to read.',
  htflevels: 'HTF Levels — previous day and week high/low reference lines from higher timeframes.',
  maribbon: 'MA Ribbon — eight stacked EMAs; their spread and order show trend strength and direction.',
  avwap: 'Anchored VWAP — a VWAP measured from a chosen anchor bar instead of the daily reset.',
  rsi: 'Relative Strength Index — momentum from 0–100; above 70 is overbought, below 30 oversold.',
  macd: 'MACD — the gap between two EMAs with a signal line and histogram; tracks momentum shifts.',
  stoch: 'Stochastic — where price closes within its recent range; %K/%D flag overbought/oversold.',
  atr: 'Average True Range — measures volatility (size of moves), not direction.',
  adx: 'Average Directional Index — trend strength from 0–100; above 25 means a strong trend.',
  cci: 'Commodity Channel Index — deviation from the average price; ±100 marks extremes.',
  obv: 'On-Balance Volume — running total of volume that rises/falls with price to confirm trend.',
  willr: 'Williams %R — momentum from −100 to 0; near 0 overbought, near −100 oversold.',
  mfi: 'Money Flow Index — a volume-weighted RSI from 0–100 measuring buying/selling pressure.',
  roc: 'Rate of Change — percentage price change over N bars; a simple momentum gauge.',
  stochrsi: 'Stochastic RSI — the Stochastic formula applied to RSI for a more sensitive oscillator.',
  dmi: 'Directional Movement Index — +DI vs −DI with ADX to show direction and trend strength.',
  cmf: 'Chaikin Money Flow — volume-weighted accumulation/distribution over N bars.',
  tsi: 'True Strength Index — a double-smoothed momentum oscillator that filters noise.',
  uo: 'Ultimate Oscillator — blends three timeframes into one 0–100 momentum reading.',
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

export { BINANCE, COLORS, WATCHLISTS_INIT, INDICATORS_DEF, INDICATOR_DESC, EXCHANGES, LAYOUT_COUNTS, THEMES, DEFAULT_THEME, LEGACY_THEME };
