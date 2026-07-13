// ============================================================
// WS RELAY (P3-17, extended P4) — server-side connection manager for
// exchanges without a direct-from-browser WebSocket integration (OKX,
// Gate.io, KuCoin). Opens exactly ONE upstream socket per (exchange, symbol,
// tf) regardless of how many browser clients are watching it, and fans out
// ticks over our own WebSocket endpoint.
// ============================================================
import { WebSocketServer, WebSocket } from 'ws';
import { toExSymbol } from './klines.js';
import { EXCHANGES } from './js/constants.js';

const RELAY_EXCHANGES = new Set(['okx', 'gate', 'kucoin']);
const RECONNECT_MS = 3000;

// key -> { exchange, symbol, tf, ws, clients: Set<ws>, reconnectTimer, pingTimer }
const upstreams = new Map();
const keyOf = (exchange, symbol, tf) => `${exchange}:${symbol}:${tf}`;

// KuCoin's public WS needs a short-lived token + endpoint from this REST
// handshake before connecting (confirmed live: POST returns
// {data:{token, instanceServers:[{endpoint, pingInterval}]}}).
async function fetchKucoinToken() {
  const r = await fetch('https://api.kucoin.com/api/v1/bullet-public', { method: 'POST', signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`bullet-public HTTP ${r.status}`);
  const j = await r.json();
  const token = j?.data?.token;
  const server = j?.data?.instanceServers?.[0];
  if (!token || !server?.endpoint) throw new Error('bullet-public missing token/endpoint');
  return { token, server };
}

async function openUpstream(entry) {
  const { exchange, symbol, tf } = entry;
  const interval = EXCHANGES[exchange]?.intervals[tf];
  if (!interval) return;
  let ws;
  try {
    if (exchange === 'okx') {
      ws = new WebSocket('wss://ws.okx.com:8443/ws/v5/business');
      ws.on('open', () => ws.send(JSON.stringify({ op: 'subscribe', args: [{ channel: `candle${interval}`, instId: toExSymbol(symbol, 'okx') }] })));
      ws.on('message', raw => {
        let m; try { m = JSON.parse(raw); } catch { return; }
        const k = m.data?.[0];
        if (!k) return;
        broadcast(entry, { time: Math.floor(+k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5], closed: k[8] === '1' });
      });
    } else if (exchange === 'gate') {
      ws = new WebSocket('wss://api.gateio.ws/ws/v4/');
      ws.on('open', () => ws.send(JSON.stringify({ time: Math.floor(Date.now() / 1000), channel: 'spot.candlesticks', event: 'subscribe', payload: [interval, toExSymbol(symbol, 'gate')] })));
      ws.on('message', raw => {
        let m; try { m = JSON.parse(raw); } catch { return; }
        const r = m.result;
        if (m.event !== 'update' || !r) return;
        // Gate's candle stream has no per-tick "closed" flag; treat every
        // update as the still-forming latest bar (same convention already
        // used for Bitvavo's client-side candle stream in data.js).
        broadcast(entry, { time: Math.floor(+r.t), open: +r.o, high: +r.h, low: +r.l, close: +r.c, volume: +r.v, closed: false });
      });
    } else if (exchange === 'kucoin') {
      const { token, server } = await fetchKucoinToken();
      // The token fetch is a real network round-trip, unlike okx/gate's
      // synchronous `new WebSocket(...)`. If every client unsubscribed while
      // it was in flight, `entry` was already dropped from `upstreams` — bail
      // out instead of opening a socket nothing can ever reach to close.
      if (upstreams.get(keyOf(exchange, symbol, tf)) !== entry) return;
      const connectId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      ws = new WebSocket(`${server.endpoint}?token=${token}&connectId=${connectId}`);
      const topic = `/market/candles:${toExSymbol(symbol, 'kucoin')}_${interval}`;
      ws.on('message', raw => {
        let m; try { m = JSON.parse(raw); } catch { return; }
        if (m.type === 'welcome') {
          // Ping well inside pingTimeout/pingInterval so KuCoin never drops us as idle.
          const pingMs = Math.max(5000, Math.min(+server.pingInterval || 18000, 30000) - 5000);
          entry.pingTimer = setInterval(() => { try { ws.send(JSON.stringify({ id: String(Date.now()), type: 'ping' })); } catch {} }, pingMs);
          try { ws.send(JSON.stringify({ id: String(Date.now()), type: 'subscribe', topic, privateChannel: false, response: true })); } catch {}
          return;
        }
        if (m.type !== 'message' || m.topic !== topic || !Array.isArray(m.data?.candles)) return;
        // KuCoin candle tuple: [time(sec), open, close, high, low, volume, turnover]
        // — same field order the REST normalizer already expects (klines.js).
        const c = m.data.candles;
        broadcast(entry, { time: Math.floor(+c[0]), open: +c[1], high: +c[3], low: +c[4], close: +c[2], volume: +c[5], closed: false });
      });
    }
  } catch (e) {
    console.error(`[ws-relay] failed to open ${exchange} upstream:`, e.message);
    scheduleReconnect(entry);
    return;
  }
  entry.ws = ws;
  ws.on('close', () => { clearInterval(entry.pingTimer); entry.pingTimer = null; scheduleReconnect(entry); });
  ws.on('error', e => console.error(`[ws-relay] ${exchange} upstream error:`, e.message));
}

function scheduleReconnect(entry) {
  if (!entry.clients.size) return; // nobody's watching this key anymore
  clearTimeout(entry.reconnectTimer);
  entry.reconnectTimer = setTimeout(() => openUpstream(entry), RECONNECT_MS);
}

function broadcast(entry, candle) {
  const msg = JSON.stringify({ type: 'kline', exchange: entry.exchange, symbol: entry.symbol, tf: entry.tf, candle });
  for (const client of entry.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  }
}

function subscribe(client, exchange, symbol, tf) {
  const key = keyOf(exchange, symbol, tf);
  let entry = upstreams.get(key);
  if (!entry) {
    entry = { exchange, symbol, tf, ws: null, clients: new Set(), reconnectTimer: null, pingTimer: null };
    upstreams.set(key, entry);
    openUpstream(entry);
  }
  entry.clients.add(client);
  client._relayKeys.add(key);
}

function unsubscribe(client, key) {
  client._relayKeys.delete(key);
  const entry = upstreams.get(key);
  if (!entry) return;
  entry.clients.delete(client);
  if (!entry.clients.size) {
    clearTimeout(entry.reconnectTimer);
    try { entry.ws?.close(); } catch {}
    upstreams.delete(key);
  }
}

// Mount the relay's WS endpoint on the app's own HTTP server (same port —
// no separate process or port to manage in deployment).
export function attachRelay(server) {
  const wss = new WebSocketServer({ server, path: '/ws/relay' });
  wss.on('connection', client => {
    client._relayKeys = new Set();
    client.on('message', raw => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      const exchange = String(m.exchange || '');
      if (!RELAY_EXCHANGES.has(exchange)) return;
      const symbol = String(m.symbol || '').toUpperCase();
      if (!/^[A-Z0-9]{2,20}$/.test(symbol)) return;
      const tf = String(m.tf || '');
      if (!EXCHANGES[exchange]?.intervals[tf]) return;
      const key = keyOf(exchange, symbol, tf);
      if (m.action === 'subscribe') subscribe(client, exchange, symbol, tf);
      else if (m.action === 'unsubscribe') unsubscribe(client, key);
    });
    client.on('close', () => { for (const key of client._relayKeys) unsubscribe(client, key); });
  });
  console.log('[ws-relay] mounted at /ws/relay for', [...RELAY_EXCHANGES].join(', '));
}
