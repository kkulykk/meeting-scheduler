import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveKey, seal, open, peek, newSalt, b64u, fromB64u, generatePassphrase, passphraseProblem, ITERATIONS,
} from '../site/js/crypto.js';
import { EXAMPLE_GROUP, toPayload } from '../site/js/state.js';

const FAST = 1000; // keep tests quick; the app uses ITERATIONS

test('uses a strong work factor in the app', () => {
  assert.ok(ITERATIONS >= 600_000);
});

test('encrypt and decrypt with the right passphrase', async () => {
  const salt = newSalt();
  const key = await deriveKey('k7qm-2xpd-9rtw-h4zc-m3va', salt, FAST);
  const payload = toPayload({ people: EXAMPLE_GROUP, t: 123 });
  const token = await seal(key, salt, payload);
  assert.deepEqual(await open(key, token), payload);
  assert.deepEqual(peek(token).salt, salt);
});

test('the token reveals nothing in plain text', async () => {
  const salt = newSalt();
  const key = await deriveKey('correct horse battery staple', salt, FAST);
  const token = await seal(key, salt, toPayload({ people: EXAMPLE_GROUP }));
  const raw = new TextDecoder('latin1').decode(fromB64u(token));
  for (const p of EXAMPLE_GROUP) {
    assert.ok(!raw.includes(p.name) && !token.includes(p.name));
    assert.ok(!raw.includes(p.tz));
  }
});

test('wrong passphrase fails', async () => {
  const salt = newSalt();
  const token = await seal(await deriveKey('right passphrase 123', salt, FAST), salt, { g: [] });
  const wrong = await deriveKey('wrong passphrase 123', salt, FAST);
  await assert.rejects(open(wrong, token));
});

test('any tampering is detected', async () => {
  const salt = newSalt();
  const key = await deriveKey('right passphrase 123', salt, FAST);
  const bytes = fromB64u(await seal(key, salt, { g: [] }));
  for (const i of [0, 5, 20, 40, bytes.length - 1]) {
    const copy = bytes.slice();
    copy[i] ^= 1;
    await assert.rejects(open(key, b64u(copy)));
  }
});

test('same data encrypts differently each time, and length hides name length', async () => {
  const salt = newSalt();
  const key = await deriveKey('right passphrase 123', salt, FAST);
  const a = await seal(key, salt, { g: [['A']] });
  const b = await seal(key, salt, { g: [['A']] });
  const c = await seal(key, salt, { g: [['A much much longer name here']] });
  assert.notEqual(a, b);
  assert.equal(a.length, c.length);
});

test('malformed links are rejected before decryption', () => {
  assert.equal(peek('not a token!'), null);
  assert.equal(peek('AAAA'), null);
  assert.equal(peek(''), null);
});

test('generated passphrases are strong and well formed', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const p = generatePassphrase();
    assert.match(p, /^[a-z2-9]{4}(-[a-z2-9]{4}){4}$/);
    assert.equal(passphraseProblem(p), null);
    seen.add(p);
  }
  assert.equal(seen.size, 200);
});

test('weak passphrases are refused', () => {
  assert.ok(passphraseProblem('short'));
  assert.ok(passphraseProblem('aaaaaaaaaaaaaaaa'));
  assert.ok(passphraseProblem('abcabcabcabcabcabc'));
  assert.equal(passphraseProblem('our friends call 2026'), null);
});
