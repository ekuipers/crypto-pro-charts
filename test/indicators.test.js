// ============================================================
// Unit tests for indicator math (P3-18) — data correctness is the product.
// Pure functions, no DOM: run directly under `node --test`.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcOverlay, calcOscillator, calcHeikinAshi } from '../src/js/indicators.js';

// Build N synthetic OHLCV bars from a close-price generator.
function bars(n, closeAt, opts = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const close = closeAt(i);
    const open = opts.openAt ? opts.openAt(i) : close;
    const high = Math.max(open, close) + (opts.wick ?? 0.5);
    const low = Math.min(open, close) - (opts.wick ?? 0.5);
    out.push({ time: 1_700_000_000 + i * 3600, open, high, low, close, volume: opts.volumeAt ? opts.volumeAt(i) : 100 });
  }
  return out;
}

test('sma of a constant series converges to that constant', () => {
  const d = bars(30, () => 100);
  const [{ vals }] = calcOverlay('sma', d, { period: 10, _color: '#000' });
  assert.ok(vals.length > 0);
  for (const v of vals) assert.equal(v.value, 100);
});

test('ema of a constant series converges to that constant', () => {
  const d = bars(30, () => 50);
  const [{ vals }] = calcOverlay('ema', d, { period: 10, _color: '#000' });
  assert.ok(vals.length > 0);
  for (const v of vals) assert.ok(Math.abs(v.value - 50) < 1e-9);
});

test('bollinger bands: upper > mid > lower when price has variance', () => {
  const d = bars(40, i => 100 + Math.sin(i / 3) * 5);
  const [upper, mid, lower] = calcOverlay('bb', d, { period: 20, mult: 2, _color: '#000' });
  assert.ok(upper.vals.length > 0);
  const lastIdx = upper.vals.length - 1;
  assert.ok(upper.vals[lastIdx].value > mid.vals[lastIdx].value);
  assert.ok(mid.vals[lastIdx].value > lower.vals[lastIdx].value);
});

test('bollinger bands collapse to the mean when price is flat (zero variance)', () => {
  const d = bars(40, () => 100);
  const [upper, mid, lower] = calcOverlay('bb', d, { period: 20, mult: 2, _color: '#000' });
  const lastIdx = upper.vals.length - 1;
  assert.equal(upper.vals[lastIdx].value, 100);
  assert.equal(mid.vals[lastIdx].value, 100);
  assert.equal(lower.vals[lastIdx].value, 100);
});

test('rsi approaches 100 on a monotonically rising series (no losses)', () => {
  const d = bars(40, i => 100 + i);
  const { lines } = calcOscillator('rsi', d, { period: 14, _color: '#000' });
  const last = lines[0].vals.at(-1).value;
  assert.ok(last > 99, `expected RSI near 100, got ${last}`);
});

test('rsi approaches 0 on a monotonically falling series (no gains)', () => {
  const d = bars(40, i => 200 - i);
  const { lines } = calcOscillator('rsi', d, { period: 14, _color: '#000' });
  const last = lines[0].vals.at(-1).value;
  assert.ok(last < 1, `expected RSI near 0, got ${last}`);
});

test('rsi stays within [0, 100] for a noisy series', () => {
  const d = bars(60, i => 100 + Math.sin(i / 2) * 10 + (i % 3 === 0 ? 3 : -1));
  const { lines } = calcOscillator('rsi', d, { period: 14, _color: '#000' });
  for (const v of lines[0].vals) {
    assert.ok(v.value >= 0 && v.value <= 100, `RSI out of range: ${v.value}`);
  }
});

test('macd histogram equals macd line minus signal line', () => {
  const d = bars(80, i => 100 + Math.sin(i / 5) * 8);
  const { lines, hist } = calcOscillator('macd', d, { fast: 12, slow: 26, sig: 9, _color: '#000' });
  const [macdLine, sigLine] = lines;
  const macdByTime = new Map(macdLine.vals.map(v => [v.time, v.value]));
  const sigByTime = new Map(sigLine.vals.map(v => [v.time, v.value]));
  assert.ok(hist.length > 0);
  for (const h of hist) {
    const m = macdByTime.get(h.time), s = sigByTime.get(h.time);
    if (m == null || s == null) continue;
    assert.ok(Math.abs(h.value - (m - s)) < 1e-9);
  }
});

test('obv accumulates volume up on higher closes and down on lower closes', () => {
  const closes = [100, 101, 100, 99, 100];
  const d = closes.map((c, i) => ({ time: 1_700_000_000 + i * 3600, open: c, high: c + 1, low: c - 1, close: c, volume: 10 }));
  const { lines } = calcOscillator('obv', d, { _color: '#000' });
  const vals = lines[0].vals.map(v => v.value);
  // 100 -> 101 (up, +10=10) -> 100 (down, -10=0) -> 99 (down, -10=-10) -> 100 (up, +10=0)
  assert.deepEqual(vals, [0, 10, 0, -10, 0]);
});

test('heikin ashi close is the average of open/high/low/close of the same bar', () => {
  const d = bars(10, i => 100 + i, { openAt: i => 99 + i, wick: 2 });
  const ha = calcHeikinAshi(d);
  d.forEach((c, i) => {
    const expected = (c.open + c.high + c.low + c.close) / 4;
    assert.ok(Math.abs(ha[i].close - expected) < 1e-9);
  });
});

test('heikin ashi high/low always contain the HA open and close', () => {
  const d = bars(20, i => 100 + Math.sin(i) * 4, { openAt: i => 100 + Math.cos(i) * 4, wick: 1 });
  const ha = calcHeikinAshi(d);
  for (const c of ha) {
    assert.ok(c.high >= c.open && c.high >= c.close);
    assert.ok(c.low <= c.open && c.low <= c.close);
  }
});

test('awesome oscillator marks rising bars only when the value increased over the prior bar', () => {
  const d = bars(80, i => 100 + i * 0.5); // steadily rising -> AO should trend up
  const { hist } = calcOscillator('ao', d, { fast: 5, slow: 34, _color: '#000' });
  assert.ok(hist.length > 0);
  let prev = null;
  for (const h of hist) {
    if (prev != null) assert.equal(h.rising, h.value >= prev);
    prev = h.value;
  }
});

test('unknown indicator ids degrade gracefully to an empty result', () => {
  const d = bars(10, i => 100 + i);
  assert.deepEqual(calcOverlay('not-a-real-indicator', d, {}), []);
  assert.deepEqual(calcOscillator('not-a-real-indicator', d, {}), { lines: [] });
});
