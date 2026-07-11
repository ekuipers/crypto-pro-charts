// ============================================================
// ALERT ENGINE — server-side alert evaluation & notification (P1-6)
// ------------------------------------------------------------
// Alerts live in Postgres (see db.js `alerts` table) and are evaluated here on
// an interval, so they fire even when no browser tab is open. Supported types:
//   price  — last price crosses above/below `value`
//   pct    — % move over `params.windowMin` minutes exceeds `value` (+/- per condition)
//   rsi    — RSI(params.period, on alert.tf) crosses above/below `value`
//   volume — last CLOSED bar volume > `value` × average of previous 20 bars
// Notifications: Telegram (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID) and a generic
// JSON webhook (ALERT_WEBHOOK_URL). Triggered alerts are also stored so the
// frontend can poll /api/alerts/triggered and show browser notifications.
// ============================================================
import * as db from './db.js';
import { fetchBars } from './klines.js';

const EVAL_INTERVAL_MS = 30_000;

// ---- Small indicator math (server-side, mirrors src/js/indicators.js) -------
function rsi(closes, p = 14) {
  if (closes.length < p + 1) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= p; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch > 0) gain += ch; else loss -= ch;
  }
  gain /= p; loss /= p;
  for (let i = p + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    gain = (gain * (p - 1) + Math.max(ch, 0)) / p;
    loss = (loss * (p - 1) + Math.max(-ch, 0)) / p;
  }
  return loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
}

// ---- Notifiers ---------------------------------------------------------------
async function notifyTelegram(msg) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: `🔔 ${msg}` }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) { console.error('[alerts] telegram notify failed:', e.message); }
}
async function notifyWebhook(alert, msg) {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'cryptopro-charts', message: msg, alert }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) { console.error('[alerts] webhook notify failed:', e.message); }
}

async function trigger(alert, msg) {
  console.log(`[alerts] TRIGGERED ${alert.id}: ${msg}`);
  await db.markAlertTriggered(alert.id, msg);
  await Promise.allSettled([notifyTelegram(msg), notifyWebhook(alert, msg)]);
}

// ---- Evaluation ---------------------------------------------------------------
// Cache upstream fetches within one pass so N alerts on the same market cost
// one request. Key: exchange|symbol|tf|limit.
function makeFetcher() {
  const cache = new Map();
  return (exchange, symbol, tf, limit) => {
    const key = `${exchange}|${symbol}|${tf}|${limit}`;
    if (!cache.has(key)) cache.set(key, fetchBars(exchange, symbol, tf, limit).catch(e => { cache.delete(key); throw e; }));
    return cache.get(key);
  };
}

async function evalAlert(a, getBars) {
  const fmt = v => Number(v).toLocaleString('en-US', { maximumFractionDigits: 8 });
  if (a.type === 'price') {
    const bars = await getBars(a.exchange, a.symbol, '1m', 2);
    const price = bars[bars.length - 1]?.close;
    if (price == null) return;
    if ((a.condition === 'above' && price >= a.value) || (a.condition === 'below' && price <= a.value)) {
      await trigger(a, `${a.symbol} ${a.condition} ${fmt(a.value)} — now ${fmt(price)}${a.note ? ` (${a.note})` : ''}`);
    }
    return;
  }
  if (a.type === 'pct') {
    const win = Math.max(1, Math.min(+a.params.windowMin || 60, 1440));
    const bars = await getBars(a.exchange, a.symbol, '1m', win + 1);
    if (bars.length < 2) return;
    const first = bars[0].close, last = bars[bars.length - 1].close;
    const pct = ((last - first) / first) * 100;
    const hit = a.condition === 'above' ? pct >= a.value : pct <= -Math.abs(a.value);
    if (hit) await trigger(a, `${a.symbol} moved ${pct.toFixed(2)}% in ${win}m (threshold ${a.condition === 'above' ? '+' : '-'}${fmt(a.value)}%)${a.note ? ` (${a.note})` : ''}`);
    return;
  }
  if (a.type === 'rsi') {
    const period = Math.max(2, Math.min(+a.params.period || 14, 100));
    const bars = await getBars(a.exchange, a.symbol, a.tf, Math.max(100, period * 5));
    const r = rsi(bars.map(b => b.close), period);
    if (r == null) return;
    if ((a.condition === 'above' && r >= a.value) || (a.condition === 'below' && r <= a.value)) {
      await trigger(a, `${a.symbol} RSI(${period}) on ${a.tf} is ${r.toFixed(1)} (${a.condition} ${fmt(a.value)})${a.note ? ` (${a.note})` : ''}`);
    }
    return;
  }
  if (a.type === 'volume') {
    const bars = await getBars(a.exchange, a.symbol, a.tf, 22);
    if (bars.length < 22) return;
    // Use the last CLOSED bar (the final bar may still be forming).
    const closed = bars[bars.length - 2];
    const prev = bars.slice(-22, -2);
    const avg = prev.reduce((s, b) => s + b.volume, 0) / prev.length;
    if (avg > 0 && closed.volume > a.value * avg) {
      await trigger(a, `${a.symbol} volume spike on ${a.tf}: ${(closed.volume / avg).toFixed(1)}× the 20-bar average (threshold ${fmt(a.value)}×)${a.note ? ` (${a.note})` : ''}`);
    }
  }
}

let timer = null;
let running = false;

export async function evaluateOnce() {
  if (running) return;
  running = true;
  try {
    const alerts = await db.listActiveAlerts();
    if (alerts.length) {
      const getBars = makeFetcher();
      await Promise.allSettled(alerts.map(a =>
        evalAlert(a, getBars).catch(e => console.error(`[alerts] eval ${a.id} (${a.symbol} ${a.type}) failed:`, e.message))));
    }
  } catch (e) {
    console.error('[alerts] evaluation pass failed:', e.message);
  } finally {
    running = false;
  }
}

export function startAlertEngine() {
  if (!db.dbEnabled()) { console.warn('[alerts] database disabled — server-side alert engine not started'); return false; }
  if (timer) return true;
  timer = setInterval(evaluateOnce, EVAL_INTERVAL_MS);
  timer.unref?.();
  console.log(`[alerts] engine started (every ${EVAL_INTERVAL_MS / 1000}s)`);
  return true;
}

export function stopAlertEngine() {
  if (timer) { clearInterval(timer); timer = null; }
}
