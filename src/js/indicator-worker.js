// ============================================================
// INDICATOR WORKER (P3-20) — runs the pure indicator math off the main
// thread. Loaded as a module worker so it can import the exact same calc
// functions the main thread used to call directly — no duplicated math.
// ============================================================
import { calcOverlay, calcOscillator, calcHeikinAshi } from './indicators.js';

self.onmessage = (e) => {
  const { id, kind, defId, bars, params } = e.data;
  try {
    let result;
    if (kind === 'overlay') result = calcOverlay(defId, bars, params);
    else if (kind === 'oscillator') result = calcOscillator(defId, bars, params);
    else if (kind === 'heikinashi') result = calcHeikinAshi(bars);
    else throw new Error(`unknown kind: ${kind}`);
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message || err) });
  }
};
