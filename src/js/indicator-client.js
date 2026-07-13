// ============================================================
// INDICATOR WORKER CLIENT (P3-20) — request/response bridge to
// indicator-worker.js. One shared worker for the whole app; callers get a
// Promise per request, matched to the worker's reply by an id.
// ============================================================
import { warn } from './utils.js';

let worker = null;
let reqId = 0;
const pending = new Map(); // id -> { resolve, reject }

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./indicator-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const { id, ok, result, error } = e.data;
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    ok ? p.resolve(result) : p.reject(new Error(error));
  };
  worker.onerror = (e) => {
    warn('indicator worker error', e.message);
    // Fail every in-flight request so callers fall back to main-thread calc
    // instead of hanging forever.
    for (const [, p] of pending) p.reject(new Error('indicator worker crashed'));
    pending.clear();
    try { worker.terminate(); } catch {}
    worker = null;
  };
  return worker;
}

// kind: 'overlay' | 'oscillator' | 'heikinashi'. Rejects if Workers aren't
// available or the worker errors — callers should fall back to the
// synchronous calc functions on rejection (see charts.js buildIndicator).
export function computeInWorker(kind, defId, bars, params) {
  if (typeof Worker === 'undefined') return Promise.reject(new Error('Workers unavailable'));
  return new Promise((resolve, reject) => {
    const id = ++reqId;
    pending.set(id, { resolve, reject });
    ensureWorker().postMessage({ id, kind, defId, bars, params });
  });
}
