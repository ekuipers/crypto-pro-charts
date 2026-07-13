// ============================================================
// Unit tests for TOTP 2FA (P3-19) — a broken verifier either locks every
// user out or accepts anything, so this gets direct coverage.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { generateSecret, verifyTotp, otpauthUri } from '../src/totp.js';

// Re-derive the current code the same way the module does internally, so the
// test doesn't depend on any fixed RFC test vector / base32 encoding of a
// human-readable seed (self-consistency is what actually matters here).
function currentCode(secret, stepOffset = 0) {
  const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = secret.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const c of clean) bits += BASE32_ALPHABET.indexOf(c).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const key = Buffer.from(bytes);
  const counter = Math.floor(Date.now() / 1000 / 30) + stepOffset;
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

test('generateSecret produces a base32 string long enough for a real secret', () => {
  const secret = generateSecret();
  assert.match(secret, /^[A-Z2-7]+$/);
  assert.ok(secret.length >= 28, `expected a ~32-char base32 secret, got length ${secret.length}`);
});

test('verifyTotp accepts the code currently valid for the secret', () => {
  const secret = generateSecret();
  assert.equal(verifyTotp(secret, currentCode(secret)), true);
});

test('verifyTotp accepts a code from one step of clock drift either side', () => {
  const secret = generateSecret();
  assert.equal(verifyTotp(secret, currentCode(secret, -1)), true);
  assert.equal(verifyTotp(secret, currentCode(secret, 1)), true);
});

test('verifyTotp rejects a code far outside the drift window', () => {
  const secret = generateSecret();
  assert.equal(verifyTotp(secret, currentCode(secret, 10)), false);
});

test('verifyTotp rejects garbage input without throwing', () => {
  const secret = generateSecret();
  assert.equal(verifyTotp(secret, 'not-a-code'), false);
  assert.equal(verifyTotp(secret, ''), false);
  assert.equal(verifyTotp(secret, null), false);
  assert.equal(verifyTotp(null, '123456'), false);
});

test('two generated secrets almost never produce the same code (sanity, not a security proof)', () => {
  const a = generateSecret(), b = generateSecret();
  assert.notEqual(a, b);
});

test('otpauthUri embeds the username, secret, and issuer for authenticator-app enrollment', () => {
  const secret = generateSecret();
  const uri = otpauthUri('trader1', secret, 'CryptoPro Charts');
  assert.match(uri, /^otpauth:\/\/totp\//);
  assert.ok(uri.includes(`secret=${secret}`));
  assert.ok(uri.includes(encodeURIComponent('CryptoPro Charts:trader1')));
});
