// ============================================================
// INDICATORS — math + chart application
// Overlays render on the main price chart.
// Oscillators render in a synced sub-chart below the main chart.
// ============================================================
import { INDICATORS_DEF } from './constants.js';
import { state } from './state.js';

const LWC = () => window.LightweightCharts;

export function indDef(id) { return INDICATORS_DEF.find(d => d.id === id); }

// ---------- Basic math helpers ----------
function sma(src, p) {
  const out = new Array(src.length).fill(null);
  let sum = 0;
  for (let i = 0; i < src.length; i++) {
    sum += src[i];
    if (i >= p) sum -= src[i - p];
    if (i >= p - 1) out[i] = sum / p;
  }
  return out;
}
function ema(src, p) {
  const out = new Array(src.length).fill(null);
  const k = 2 / (p + 1);
  let prev = null;
  for (let i = 0; i < src.length; i++) {
    if (src[i] == null) { out[i] = prev; continue; }
    if (prev == null) {
      // seed with sma once enough data
      if (i >= p - 1) {
        let s = 0; for (let j = i - p + 1; j <= i; j++) s += src[j];
        prev = s / p; out[i] = prev;
      }
    } else {
      prev = src[i] * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}
function wma(src, p) {
  const out = new Array(src.length).fill(null);
  const denom = (p * (p + 1)) / 2;
  for (let i = p - 1; i < src.length; i++) {
    let s = 0;
    for (let j = 0; j < p; j++) s += src[i - j] * (p - j);
    out[i] = s / denom;
  }
  return out;
}
function stdev(src, p) {
  const out = new Array(src.length).fill(null);
  for (let i = p - 1; i < src.length; i++) {
    let m = 0; for (let j = i - p + 1; j <= i; j++) m += src[j];
    m /= p;
    let v = 0; for (let j = i - p + 1; j <= i; j++) v += (src[j] - m) ** 2;
    out[i] = Math.sqrt(v / p);
  }
  return out;
}
function trueRange(d) {
  const tr = new Array(d.length).fill(null);
  for (let i = 0; i < d.length; i++) {
    if (i === 0) { tr[i] = d[i].high - d[i].low; continue; }
    tr[i] = Math.max(d[i].high - d[i].low, Math.abs(d[i].high - d[i - 1].close), Math.abs(d[i].low - d[i - 1].close));
  }
  return tr;
}
function rma(src, p) { // Wilder's smoothing
  const out = new Array(src.length).fill(null);
  let prev = null, count = 0, sum = 0;
  for (let i = 0; i < src.length; i++) {
    if (src[i] == null) { out[i] = prev; continue; }
    if (prev == null) {
      sum += src[i]; count++;
      if (count === p) { prev = sum / p; out[i] = prev; }
    } else {
      prev = (prev * (p - 1) + src[i]) / p;
      out[i] = prev;
    }
  }
  return out;
}

const toLine = (d, vals) => d.map((c, i) => vals[i] == null ? null : ({ time: c.time, value: vals[i] })).filter(Boolean);

// ---------- Indicator calc dispatchers ----------
const closes = d => d.map(c => c.close);

export function calcOverlay(id, d, p) {
  switch (id) {
    case 'sma': return [{ vals: toLine(d, sma(closes(d), p.period)), color: p._color }];
    case 'ema': return [{ vals: toLine(d, ema(closes(d), p.period)), color: p._color }];
    case 'wma': return [{ vals: toLine(d, wma(closes(d), p.period)), color: p._color }];
    case 'dema': {
      const e1 = ema(closes(d), p.period), e2 = ema(e1.map(v => v ?? 0), p.period);
      const out = e1.map((v, i) => v == null || e2[i] == null ? null : 2 * v - e2[i]);
      return [{ vals: toLine(d, out), color: p._color }];
    }
    case 'tema': {
      const c = closes(d);
      const e1 = ema(c, p.period), e2 = ema(e1.map(v => v ?? 0), p.period), e3 = ema(e2.map(v => v ?? 0), p.period);
      const out = e1.map((v, i) => v == null || e2[i] == null || e3[i] == null ? null : 3 * v - 3 * e2[i] + e3[i]);
      return [{ vals: toLine(d, out), color: p._color }];
    }
    case 'bb': {
      const mid = sma(closes(d), p.period), sd = stdev(closes(d), p.period);
      const up = mid.map((m, i) => m == null ? null : m + p.mult * sd[i]);
      const lo = mid.map((m, i) => m == null ? null : m - p.mult * sd[i]);
      return [
        { vals: toLine(d, up), color: p._color },
        { vals: toLine(d, mid), color: p._color, dashed: true },
        { vals: toLine(d, lo), color: p._color },
      ];
    }
    case 'vwap': {
      const out = []; let cum = 0, cumV = 0, day = null;
      for (const c of d) {
        const dd = new Date(c.time * 1000).getUTCDate();
        if (dd !== day) { cum = 0; cumV = 0; day = dd; }
        const tp = (c.high + c.low + c.close) / 3;
        cum += tp * c.volume; cumV += c.volume;
        out.push(cumV ? cum / cumV : null);
      }
      return [{ vals: toLine(d, out), color: p._color }];
    }
    case 'avwap': {
      const start = Math.max(0, d.length - p.bars);
      const out = new Array(d.length).fill(null);
      let cum = 0, cumV = 0;
      for (let i = start; i < d.length; i++) {
        const tp = (d[i].high + d[i].low + d[i].close) / 3;
        cum += tp * d[i].volume; cumV += d[i].volume;
        out[i] = cumV ? cum / cumV : null;
      }
      return [{ vals: toLine(d, out), color: p._color }];
    }
    case 'keltner': {
      const mid = ema(closes(d), p.period);
      const tr = trueRange(d), atr = rma(tr, p.atrp);
      const up = mid.map((m, i) => m == null || atr[i] == null ? null : m + p.mult * atr[i]);
      const lo = mid.map((m, i) => m == null || atr[i] == null ? null : m - p.mult * atr[i]);
      return [
        { vals: toLine(d, up), color: p._color },
        { vals: toLine(d, mid), color: p._color, dashed: true },
        { vals: toLine(d, lo), color: p._color },
      ];
    }
    case 'donchian': {
      const up = new Array(d.length).fill(null), lo = new Array(d.length).fill(null), mid = new Array(d.length).fill(null);
      for (let i = p.period - 1; i < d.length; i++) {
        let hh = -Infinity, ll = Infinity;
        for (let j = i - p.period + 1; j <= i; j++) { hh = Math.max(hh, d[j].high); ll = Math.min(ll, d[j].low); }
        up[i] = hh; lo[i] = ll; mid[i] = (hh + ll) / 2;
      }
      return [
        { vals: toLine(d, up), color: p._color },
        { vals: toLine(d, mid), color: p._color, dashed: true },
        { vals: toLine(d, lo), color: p._color },
      ];
    }
    case 'supertrend': {
      const tr = trueRange(d), atr = rma(tr, p.period);
      const st = new Array(d.length).fill(null); const colors = [];
      let prevUp = null, prevLo = null, prevTrend = 1, prevST = null;
      const segs = [];
      for (let i = 0; i < d.length; i++) {
        if (atr[i] == null) { continue; }
        const hl2 = (d[i].high + d[i].low) / 2;
        let up = hl2 + p.mult * atr[i];
        let lo = hl2 - p.mult * atr[i];
        if (prevUp != null && d[i - 1] && d[i - 1].close <= prevUp) up = Math.min(up, prevUp);
        if (prevLo != null && d[i - 1] && d[i - 1].close >= prevLo) lo = Math.max(lo, prevLo);
        let trend = prevTrend;
        if (prevST != null) {
          if (prevTrend === 1 && d[i].close < prevLo) trend = -1;
          else if (prevTrend === -1 && d[i].close > prevUp) trend = 1;
        }
        const val = trend === 1 ? lo : up;
        st[i] = val;
        segs.push({ time: d[i].time, value: val, trend });
        prevUp = up; prevLo = lo; prevTrend = trend; prevST = val;
      }
      // split into up/down series for color
      const upLine = segs.map(s => ({ time: s.time, value: s.trend === 1 ? s.value : null }));
      const dnLine = segs.map(s => ({ time: s.time, value: s.trend === -1 ? s.value : null }));
      return [
        { vals: upLine.filter(x => x.value != null), color: '#26a69a' },
        { vals: dnLine.filter(x => x.value != null), color: '#ef5350' },
      ];
    }
    case 'psar': {
      const out = new Array(d.length).fill(null);
      let af = p.step, ep = d[0].high, sar = d[0].low, uptrend = true;
      for (let i = 1; i < d.length; i++) {
        sar = sar + af * (ep - sar);
        if (uptrend) {
          if (d[i].low < sar) { uptrend = false; sar = ep; ep = d[i].low; af = p.step; }
          else { if (d[i].high > ep) { ep = d[i].high; af = Math.min(af + p.step, p.maxaf); } }
        } else {
          if (d[i].high > sar) { uptrend = true; sar = ep; ep = d[i].high; af = p.step; }
          else { if (d[i].low < ep) { ep = d[i].low; af = Math.min(af + p.step, p.maxaf); } }
        }
        out[i] = sar;
      }
      return [{ vals: toLine(d, out), color: p._color, pointMarker: true }];
    }
    case 'ich': {
      const period = (arr, f) => { const o = new Array(d.length).fill(null); for (let i = f - 1; i < d.length; i++) { let hh = -Infinity, ll = Infinity; for (let j = i - f + 1; j <= i; j++) { hh = Math.max(hh, d[j].high); ll = Math.min(ll, d[j].low); } o[i] = (hh + ll) / 2; } return o; };
      const tenkan = period(d, p.tenkan), kijun = period(d, p.kijun), senkB = period(d, p.senkou);
      const senkA = tenkan.map((t, i) => t == null || kijun[i] == null ? null : (t + kijun[i]) / 2);
      return [
        { vals: toLine(d, tenkan), color: '#2962ff' },
        { vals: toLine(d, kijun), color: '#e91e63' },
        { vals: toLine(d, senkA), color: '#26a69a', dashed: true },
        { vals: toLine(d, senkB), color: '#ef5350', dashed: true },
      ];
    }
    case 'pivot': {
      // classic daily pivots based on previous candle group; simple: use prior bar
      const piv = new Array(d.length).fill(null), r1 = [...piv], s1 = [...piv], r2 = [...piv], s2 = [...piv];
      for (let i = 1; i < d.length; i++) {
        const h = d[i - 1].high, l = d[i - 1].low, c = d[i - 1].close;
        const P = (h + l + c) / 3;
        piv[i] = P; r1[i] = 2 * P - l; s1[i] = 2 * P - h; r2[i] = P + (h - l); s2[i] = P - (h - l);
      }
      return [
        { vals: toLine(d, piv), color: p._color, dashed: true },
        { vals: toLine(d, r1), color: '#ef5350' }, { vals: toLine(d, s1), color: '#26a69a' },
        { vals: toLine(d, r2), color: '#ef5350' }, { vals: toLine(d, s2), color: '#26a69a' },
      ];
    }
    case 'maribbon': {
      const periods = [20, 25, 30, 35, 40, 45, 50, 55];
      const rb = ['#2962ff', '#00bcd4', '#26a69a', '#cddc39', '#ffeb3b', '#ff9800', '#ff5722', '#e91e63'];
      return periods.map((pp, i) => ({ vals: toLine(d, ema(closes(d), pp)), color: rb[i] }));
    }
    case 'htflevels': {
      const lv = htfLevels(d);
      const flat = (val) => val == null ? [] : d.map(c => ({ time: c.time, value: val }));
      const arr = [];
      if (lv.prevDayH != null) { arr.push({ vals: flat(lv.prevDayH), color: '#ef5350', dashed: true }); arr.push({ vals: flat(lv.prevDayL), color: '#26a69a', dashed: true }); }
      if (lv.prevWeekH != null) { arr.push({ vals: flat(lv.prevWeekH), color: '#ff9800', dashed: true }); arr.push({ vals: flat(lv.prevWeekL), color: '#9c27b0', dashed: true }); }
      return arr;
    }
    case 'heikinashi': {
      const ha = calcHeikinAshi(d);
      return [{ candles: ha }];
    }
    case 'luxalgo': {
      const emaVals = ema(closes(d), p.emaPeriod);
      const atrVals = rma(trueRange(d), p.atrPeriod);
      const upper = emaVals.map((v, i) => v == null || atrVals[i] == null ? null : v + p.mult * atrVals[i]);
      const lower = emaVals.map((v, i) => v == null || atrVals[i] == null ? null : v - p.mult * atrVals[i]);
      const signals = [];
      let prevTrend = 0;
      for (let i = 1; i < d.length; i++) {
        if (upper[i] == null) continue;
        let trend = prevTrend;
        if (d[i].close > upper[i]) trend = 1;
        else if (d[i].close < lower[i]) trend = -1;
        if (trend !== 0 && trend !== prevTrend) signals.push({ time: d[i].time, direction: trend });
        if (trend !== 0) prevTrend = trend;
      }
      return [
        { vals: toLine(d, emaVals), color: p._color },
        { vals: toLine(d, upper), color: p._color, dashed: true },
        { vals: toLine(d, lower), color: p._color, dashed: true },
        { signals },
      ];
    }
    default: return [];
  }
}

function htfLevels(d) {
  const out = { prevDayH: null, prevDayL: null, prevWeekH: null, prevWeekL: null };
  if (!d.length) return out;
  const days = {}, weeks = {};
  for (const c of d) {
    const dt = new Date(c.time * 1000);
    const dk = dt.getUTCFullYear() + '-' + dt.getUTCMonth() + '-' + dt.getUTCDate();
    const onejan = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
    const wk = dt.getUTCFullYear() + '-w' + Math.ceil((((dt - onejan) / 86400000) + onejan.getUTCDay() + 1) / 7);
    (days[dk] ||= { h: -Infinity, l: Infinity }); days[dk].h = Math.max(days[dk].h, c.high); days[dk].l = Math.min(days[dk].l, c.low);
    (weeks[wk] ||= { h: -Infinity, l: Infinity }); weeks[wk].h = Math.max(weeks[wk].h, c.high); weeks[wk].l = Math.min(weeks[wk].l, c.low);
  }
  const dk = Object.keys(days); const wk = Object.keys(weeks);
  if (dk.length >= 2) { const p = days[dk[dk.length - 2]]; out.prevDayH = p.h; out.prevDayL = p.l; }
  if (wk.length >= 2) { const p = weeks[wk[wk.length - 2]]; out.prevWeekH = p.h; out.prevWeekL = p.l; }
  return out;
}

export function calcHeikinAshi(d) {
  const out = [];
  let prevO = null, prevC = null;
  for (const c of d) {
    const close = (c.open + c.high + c.low + c.close) / 4;
    const open = prevO == null ? (c.open + c.close) / 2 : (prevO + prevC) / 2;
    const high = Math.max(c.high, open, close);
    const low = Math.min(c.low, open, close);
    out.push({ time: c.time, open, high, low, close });
    prevO = open; prevC = close;
  }
  return out;
}

// ---------- Oscillators ----------
export function calcOscillator(id, d, p) {
  const c = closes(d);
  switch (id) {
    case 'rsi': return { lines: [{ vals: toLine(d, rsi(c, p.period)), color: p._color }], refs: [30, 50, 70], range: [0, 100] };
    case 'macd': {
      const fast = ema(c, p.fast), slow = ema(c, p.slow);
      const macd = fast.map((f, i) => f == null || slow[i] == null ? null : f - slow[i]);
      const sig = ema(macd.map(v => v ?? 0), p.sig).map((v, i) => macd[i] == null ? null : v);
      const hist = macd.map((m, i) => m == null || sig[i] == null ? null : m - sig[i]);
      return {
        lines: [{ vals: toLine(d, macd), color: '#2962ff' }, { vals: toLine(d, sig), color: '#ff9800' }],
        hist: toLine(d, hist), refs: [0],
      };
    }
    case 'stoch': {
      const { k, dd } = stochastic(d, p.kp, p.dp);
      return { lines: [{ vals: toLine(d, k), color: '#2962ff' }, { vals: toLine(d, dd), color: '#ff9800' }], refs: [20, 80], range: [0, 100] };
    }
    case 'stochrsi': {
      const r = rsi(c, p.rsiP);
      const sr = new Array(d.length).fill(null);
      for (let i = 0; i < d.length; i++) {
        if (r[i] == null || i < p.rsiP + p.stochP) continue;
        let hh = -Infinity, ll = Infinity;
        for (let j = i - p.stochP + 1; j <= i; j++) { if (r[j] != null) { hh = Math.max(hh, r[j]); ll = Math.min(ll, r[j]); } }
        sr[i] = hh === ll ? 0 : ((r[i] - ll) / (hh - ll)) * 100;
      }
      const k = sma(sr.map(v => v ?? 0), p.k).map((v, i) => sr[i] == null ? null : v);
      const dd = sma(k.map(v => v ?? 0), p.d).map((v, i) => k[i] == null ? null : v);
      return { lines: [{ vals: toLine(d, k), color: '#2962ff' }, { vals: toLine(d, dd), color: '#ff9800' }], refs: [20, 80], range: [0, 100] };
    }
    case 'atr': return { lines: [{ vals: toLine(d, rma(trueRange(d), p.period)), color: p._color }] };
    case 'adx': { const { adx } = dmiCalc(d, p.period); return { lines: [{ vals: toLine(d, adx), color: p._color }], refs: [25], range: [0, 100] }; }
    case 'dmi': {
      const { plus, minus, adx } = dmiCalc(d, p.period);
      return { lines: [{ vals: toLine(d, plus), color: '#26a69a' }, { vals: toLine(d, minus), color: '#ef5350' }, { vals: toLine(d, adx), color: '#2962ff' }], range: [0, 100] };
    }
    case 'cci': {
      const out = new Array(d.length).fill(null);
      const tp = d.map(x => (x.high + x.low + x.close) / 3);
      const m = sma(tp, p.period);
      for (let i = p.period - 1; i < d.length; i++) {
        let md = 0; for (let j = i - p.period + 1; j <= i; j++) md += Math.abs(tp[j] - m[i]);
        md /= p.period;
        out[i] = md === 0 ? 0 : (tp[i] - m[i]) / (0.015 * md);
      }
      return { lines: [{ vals: toLine(d, out), color: p._color }], refs: [-100, 0, 100] };
    }
    case 'obv': {
      const out = new Array(d.length).fill(null); let o = 0;
      for (let i = 0; i < d.length; i++) {
        if (i > 0) { if (d[i].close > d[i - 1].close) o += d[i].volume; else if (d[i].close < d[i - 1].close) o -= d[i].volume; }
        out[i] = o;
      }
      return { lines: [{ vals: toLine(d, out), color: p._color }] };
    }
    case 'willr': {
      const out = new Array(d.length).fill(null);
      for (let i = p.period - 1; i < d.length; i++) {
        let hh = -Infinity, ll = Infinity;
        for (let j = i - p.period + 1; j <= i; j++) { hh = Math.max(hh, d[j].high); ll = Math.min(ll, d[j].low); }
        out[i] = hh === ll ? 0 : ((hh - d[i].close) / (hh - ll)) * -100;
      }
      return { lines: [{ vals: toLine(d, out), color: p._color }], refs: [-20, -80], range: [-100, 0] };
    }
    case 'mfi': {
      const out = new Array(d.length).fill(null);
      const tp = d.map(x => (x.high + x.low + x.close) / 3);
      for (let i = p.period; i < d.length; i++) {
        let pos = 0, neg = 0;
        for (let j = i - p.period + 1; j <= i; j++) {
          const flow = tp[j] * d[j].volume;
          if (tp[j] > tp[j - 1]) pos += flow; else if (tp[j] < tp[j - 1]) neg += flow;
        }
        out[i] = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
      }
      return { lines: [{ vals: toLine(d, out), color: p._color }], refs: [20, 80], range: [0, 100] };
    }
    case 'roc': {
      const out = c.map((v, i) => i < p.period ? null : ((v - c[i - p.period]) / c[i - p.period]) * 100);
      return { lines: [{ vals: toLine(d, out), color: p._color }], refs: [0] };
    }
    case 'cmf': {
      const out = new Array(d.length).fill(null);
      for (let i = p.period - 1; i < d.length; i++) {
        let mfv = 0, vol = 0;
        for (let j = i - p.period + 1; j <= i; j++) {
          const rng = d[j].high - d[j].low;
          const m = rng === 0 ? 0 : ((d[j].close - d[j].low) - (d[j].high - d[j].close)) / rng;
          mfv += m * d[j].volume; vol += d[j].volume;
        }
        out[i] = vol === 0 ? 0 : mfv / vol;
      }
      return { lines: [{ vals: toLine(d, out), color: p._color }], refs: [0] };
    }
    case 'tsi': {
      const m = c.map((v, i) => i === 0 ? 0 : v - c[i - 1]);
      const am = m.map(Math.abs);
      const ds = ema(ema(m, p.long), p.short);
      const das = ema(ema(am, p.long), p.short);
      const out = ds.map((v, i) => v == null || !das[i] ? null : 100 * v / das[i]);
      return { lines: [{ vals: toLine(d, out), color: p._color }], refs: [0] };
    }
    case 'ao': {
      // Awesome Oscillator: SMA(fast) − SMA(slow) of the bar midpoint (H+L)/2.
      // Rendered as a histogram colored by momentum direction (rising = green).
      const mid = d.map(x => (x.high + x.low) / 2);
      const f = sma(mid, p.fast), s = sma(mid, p.slow);
      const ao = f.map((v, i) => v == null || s[i] == null ? null : v - s[i]);
      const hist = [];
      let prev = null;
      for (let i = 0; i < d.length; i++) {
        if (ao[i] == null) continue;
        hist.push({ time: d[i].time, value: ao[i], rising: prev != null && ao[i] >= prev });
        prev = ao[i];
      }
      return { lines: [], hist, histByDirection: true, refs: [] };
    }
    case 'uo': {
      const out = new Array(d.length).fill(null);
      const bp = new Array(d.length).fill(0), tr = new Array(d.length).fill(0);
      for (let i = 1; i < d.length; i++) {
        const minLow = Math.min(d[i].low, d[i - 1].close);
        bp[i] = d[i].close - minLow;
        tr[i] = Math.max(d[i].high, d[i - 1].close) - minLow;
      }
      const avg = (i, n) => { let sb = 0, st = 0; for (let j = i - n + 1; j <= i; j++) { sb += bp[j]; st += tr[j]; } return st === 0 ? 0 : sb / st; };
      for (let i = p.p3; i < d.length; i++) out[i] = 100 * (4 * avg(i, p.p1) + 2 * avg(i, p.p2) + avg(i, p.p3)) / 7;
      return { lines: [{ vals: toLine(d, out), color: p._color }], refs: [30, 70], range: [0, 100] };
    }
    default: return { lines: [] };
  }
}

function rsi(src, p) {
  const out = new Array(src.length).fill(null);
  const gains = new Array(src.length).fill(0), losses = new Array(src.length).fill(0);
  for (let i = 1; i < src.length; i++) {
    const ch = src[i] - src[i - 1];
    gains[i] = ch > 0 ? ch : 0; losses[i] = ch < 0 ? -ch : 0;
  }
  const ag = rma(gains, p), al = rma(losses, p);
  for (let i = 0; i < src.length; i++) {
    if (ag[i] == null) continue;
    out[i] = al[i] === 0 ? 100 : 100 - 100 / (1 + ag[i] / al[i]);
  }
  return out;
}
function stochastic(d, kp, dp) {
  const k = new Array(d.length).fill(null);
  for (let i = kp - 1; i < d.length; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - kp + 1; j <= i; j++) { hh = Math.max(hh, d[j].high); ll = Math.min(ll, d[j].low); }
    k[i] = hh === ll ? 0 : ((d[i].close - ll) / (hh - ll)) * 100;
  }
  const dd = sma(k.map(v => v ?? 0), dp).map((v, i) => k[i] == null ? null : v);
  return { k, dd };
}
function dmiCalc(d, p) {
  const tr = trueRange(d);
  const plusDM = new Array(d.length).fill(0), minusDM = new Array(d.length).fill(0);
  for (let i = 1; i < d.length; i++) {
    const up = d[i].high - d[i - 1].high, dn = d[i - 1].low - d[i].low;
    plusDM[i] = (up > dn && up > 0) ? up : 0;
    minusDM[i] = (dn > up && dn > 0) ? dn : 0;
  }
  const atr = rma(tr, p), pdm = rma(plusDM, p), mdm = rma(minusDM, p);
  const plus = atr.map((a, i) => a == null || a === 0 ? null : 100 * pdm[i] / a);
  const minus = atr.map((a, i) => a == null || a === 0 ? null : 100 * mdm[i] / a);
  const dx = plus.map((pp, i) => pp == null || minus[i] == null ? null : (pp + minus[i] === 0 ? 0 : 100 * Math.abs(pp - minus[i]) / (pp + minus[i])));
  const adx = rma(dx, p);
  return { plus, minus, adx };
}
