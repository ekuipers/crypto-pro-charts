// ============================================================
// BLOB — account storage in the Vercel Blob store ("Users/" folder)
// ------------------------------------------------------------
// Each user's account record is a private JSON blob at Users/<uid>.json.
// All calls are gated on BLOB_READ_WRITE_TOKEN (loaded from .env) and carry an
// abort timeout so a slow network can never hang an auth request.
// ============================================================
import {
  put, get, del, list, BlobNotFoundError,
  BlobServiceNotAvailable, BlobServiceRateLimited, BlobRequestAbortedError, BlobUnknownError,
} from '@vercel/blob';

const PREFIX = 'Users/';
const token = () => process.env.BLOB_READ_WRITE_TOKEN;
export const blobEnabled = () => Boolean(token());

const blobPath = (uid) => `${PREFIX}${uid}.json`;

// Abort signal that fires after `ms` so blob calls can't hang indefinitely.
// Generous timeout — corporate proxies can make the first TLS handshake slow.
function timeoutSignal(ms = 20000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  if (typeof t.unref === 'function') t.unref();
  return c.signal;
}
const opts = (extra = {}) => ({ token: token(), abortSignal: timeoutSignal(), ...extra });

// Retry transient blob failures (rate limit, service blip, aborted/network).
// Permanent errors (auth, store-not-found, not-found) are thrown immediately.
const TRANSIENT_BLOB = [BlobServiceNotAvailable, BlobServiceRateLimited, BlobRequestAbortedError, BlobUnknownError];
function isTransient(e) {
  return TRANSIENT_BLOB.some(C => e instanceof C) || e?.name === 'TypeError' || e?.name === 'AbortError';
}
async function withBlobRetry(fn, tries = 3) {
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e) {
      if (i >= tries - 1 || !isTransient(e)) throw e;
      await new Promise(r => setTimeout(r, 250 * (i + 1)));
    }
  }
}

// Write (create or overwrite) a user's account JSON.
export async function putAccount(uid, record) {
  await withBlobRetry(() => put(blobPath(uid), JSON.stringify(record, null, 2), opts({
    access: 'private',
    addRandomSuffix: false, // deterministic Users/<uid>.json
    allowOverwrite: true,
    contentType: 'application/json',
  })));
}

// Read a user's account JSON, or null if it doesn't exist. Pass fresh=true to
// bypass the CDN cache — required for the registration uniqueness check, since a
// just-written blob can otherwise read as 404 for a moment (read-after-write).
export async function getAccount(uid, fresh = false) {
  let res;
  try {
    res = await withBlobRetry(() => get(blobPath(uid), opts({ access: 'private', useCache: !fresh })));
  } catch (e) {
    if (e instanceof BlobNotFoundError) return null;
    throw e;
  }
  if (!res || res.statusCode === 304 || !res.stream) return null;
  const text = await new Response(res.stream).text();
  return JSON.parse(text);
}

export async function delAccount(uid) {
  try { await del(blobPath(uid), opts()); } catch { /* best-effort */ }
}

// List the uids of all account blobs under Users/.
export async function listAccountUids() {
  const out = [];
  let cursor;
  do {
    const { blobs, hasMore, cursor: next } = await list(opts({ prefix: PREFIX, cursor }));
    for (const b of blobs) {
      if (b.pathname.endsWith('.json')) out.push(b.pathname.slice(PREFIX.length, -5));
    }
    cursor = hasMore ? next : undefined;
  } while (cursor);
  return out;
}
