// ============================================================
// Unit tests for exchange kline normalization + aggregation (P3-18) — a
// mis-mapped OHLCV field silently corrupts what every trader sees.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, aggregateBars, toExSymbol, tfSupported, klineUrl } from '../src/klines.js';

test('normalize: binance array payload maps [time,o,h,l,c,v] correctly', () => {
  const raw = [[1_700_000_000_000, '100.5', '102', '99', '101', '12.34']];
  const bars = normalize('binance', raw);
  assert.deepEqual(bars, [{ time: 1_700_000_000, open: 100.5, high: 102, low: 99, close: 101, volume: 12.34 }]);
});

test('normalize: bybit result.list is newest-first and must be reversed to ascending', () => {
  const raw = { result: { list: [
    ['1700003600000', '103', '104', '102', '103.5', '5'],
    ['1700000000000', '100', '101', '99', '100.5', '10'],
  ] } };
  const bars = normalize('bybit', raw);
  assert.equal(bars.length, 2);
  assert.ok(bars[0].time < bars[1].time, 'expected ascending time order');
  assert.equal(bars[0].open, 100);
});

test('normalize: okx data array is newest-first and must be reversed to ascending', () => {
  const raw = { data: [
    ['1700003600000', '103', '104', '102', '103.5', '5'],
    ['1700000000000', '100', '101', '99', '100.5', '10'],
  ] };
  const bars = normalize('okx', raw);
  assert.ok(bars[0].time < bars[1].time);
  assert.equal(bars[0].close, 100.5);
});

test('normalize: gate.io candlesticks map [time,quoteVol,close,high,low,open,baseVol]', () => {
  // Gate's fields: [time, quote_vol, close, high, low, open, base_vol]
  const raw = [['1700000000', '1000', '101', '102', '99', '100', '10']];
  const bars = normalize('gate', raw);
  assert.deepEqual(bars, [{ time: 1_700_000_000, open: 100, high: 102, low: 99, close: 101, volume: 10 }]);
});

test('normalize: kucoin data is newest-first with [time,open,close,high,low,volume]', () => {
  const raw = { data: [
    ['1700003600', '103', '103.5', '104', '102', '5'],
    ['1700000000', '100', '100.5', '101', '99', '10'],
  ] };
  const bars = normalize('kucoin', raw);
  assert.ok(bars[0].time < bars[1].time);
  assert.deepEqual(bars[0], { time: 1_700_000_000, open: 100, high: 101, low: 99, close: 100.5, volume: 10 });
});

test('normalize: unknown exchange falls back to the binance shape', () => {
  const raw = [[1_700_000_000_000, '1', '2', '0.5', '1.5', '3']];
  const bars = normalize('some-future-exchange', raw);
  assert.equal(bars[0].open, 1);
  assert.equal(bars[0].volume, 3);
});

test('normalize: empty/missing payloads never throw', () => {
  assert.deepEqual(normalize('bybit', {}), []);
  assert.deepEqual(normalize('okx', undefined), []);
  assert.deepEqual(normalize('gate', null), []);
  assert.deepEqual(normalize('binance', null), []);
});

test('aggregateBars: 4 hourly bars roll up into 1 four-hour bar with correct OHLCV', () => {
  const hourly = [
    { time: 0, open: 100, high: 105, low: 99, close: 102, volume: 10 },
    { time: 3600, open: 102, high: 106, low: 101, close: 104, volume: 20 },
    { time: 7200, open: 104, high: 108, low: 103, close: 107, volume: 15 },
    { time: 10800, open: 107, high: 109, low: 95, close: 96, volume: 5 },
  ];
  const out = aggregateBars(hourly, '4h');
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { time: 0, open: 100, high: 109, low: 95, close: 96, volume: 50 });
});

test('aggregateBars: buckets split correctly when bars span two periods', () => {
  const hourly = [
    { time: 0, open: 100, high: 101, low: 99, close: 100, volume: 1 },
    { time: 3600, open: 100, high: 102, low: 98, close: 101, volume: 1 },
    { time: 7200, open: 101, high: 103, low: 100, close: 102, volume: 1 }, // starts a new 2h bucket
    { time: 10800, open: 102, high: 104, low: 101, close: 103, volume: 1 },
  ];
  const out = aggregateBars(hourly, '2h');
  assert.equal(out.length, 2);
  assert.equal(out[0].time, 0);
  assert.equal(out[0].close, 101);
  assert.equal(out[1].time, 7200);
  assert.equal(out[1].close, 103);
});

test('aggregateBars: 1M buckets by calendar month (UTC), not a fixed 30-day window', () => {
  const daily = [
    { time: Date.UTC(2026, 0, 30) / 1000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 1 }, // Jan
    { time: Date.UTC(2026, 1, 1) / 1000, open: 1.5, high: 2.5, low: 1, close: 2, volume: 1 },   // Feb
  ];
  const out = aggregateBars(daily, '1M');
  assert.equal(out.length, 2);
  assert.equal(out[0].time, Date.UTC(2026, 0, 1) / 1000);
  assert.equal(out[1].time, Date.UTC(2026, 1, 1) / 1000);
});

test('aggregateBars: empty input returns empty output', () => {
  assert.deepEqual(aggregateBars([], '4h'), []);
});

test('toExSymbol: maps BTCUSDT to each exchange\'s native pair format', () => {
  assert.equal(toExSymbol('BTCUSDT', 'okx'), 'BTC-USDT');
  assert.equal(toExSymbol('BTCUSDT', 'gate'), 'BTC_USDT');
  assert.equal(toExSymbol('BTCUSDT', 'kucoin'), 'BTC-USDT');
  assert.equal(toExSymbol('BTCUSDT', 'bitstamp'), 'btcusdt');
  // Bitvavo and Alpaca map stable quotes to their own settlement currency.
  assert.equal(toExSymbol('BTCUSDT', 'bitvavo'), 'BTC-EUR');
  assert.equal(toExSymbol('BTCUSDT', 'alpaca'), 'BTC/USD');
  assert.equal(toExSymbol('BTCEUR', 'bitvavo'), 'BTC-EUR');
});

test('tfSupported: true for a native interval, true for an aggregatable one, false otherwise', () => {
  assert.equal(tfSupported('binance', '1h'), true);   // native
  assert.equal(tfSupported('binance', '2h'), true);   // aggregated from 1h
  assert.equal(tfSupported('bitvavo', '3d'), true);   // aggregated from 1d
  assert.equal(tfSupported('bitvavo', 'not-a-tf'), false);
});

test('klineUrl: OKX paging param requests bars strictly before the given time', () => {
  const url = klineUrl('okx', 'BTCUSDT', '1h', 100, 1_700_000_000);
  assert.match(url, /instId=BTC-USDT/);
  assert.match(url, /after=1700000000000/);
});

test('klineUrl: Gate.io paging param requests bars strictly before the given time', () => {
  const url = klineUrl('gate', 'BTCUSDT', '1h', 100, 1_700_000_000);
  assert.match(url, /currency_pair=BTC_USDT/);
  assert.match(url, /to=1699999999/);
});
