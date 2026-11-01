// On-device storage. The group is saved only as ciphertext. If the person chooses
// "remember this device", the AES key is kept in IndexedDB as a non-extractable
// CryptoKey: scripts can use it, but nobody can read the key bytes out.
import { b64u } from './crypto.js';

const BLOB_KEY = 'common-hour:vault';
const ATTEMPTS_KEY = 'common-hour:attempts';
const LEGACY_KEYS = ['common-hour:v1']; // older builds stored the group unencrypted
const DB = 'common-hour';
const STORE = 'keys';

export function loadBlob() {
  try {
    return localStorage.getItem(BLOB_KEY);
  } catch {
    return null;
  }
}

export function saveBlob(token) {
  try {
    localStorage.setItem(BLOB_KEY, token);
  } catch {
    /* storage unavailable: the group still works for this visit */
  }
}

/** Removes any unencrypted data left by older versions and returns its group, if any. */
export function takeLegacyGroup() {
  let people = null;
  for (const k of LEGACY_KEYS) {
    try {
      const data = JSON.parse(localStorage.getItem(k) ?? 'null');
      if (data?.people && !people) people = data.people;
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
  return people;
}

function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => {
      d.close();
      resolve(req?.result);
    };
    t.onerror = () => {
      d.close();
      reject(t.error);
    };
  });
}

export async function rememberedKey(salt) {
  try {
    const rec = await tx('readonly', (s) => s.get('group'));
    return rec && rec.salt === b64u(salt) ? rec.key : null;
  } catch {
    return null;
  }
}

export async function rememberKey(salt, key) {
  try {
    await tx('readwrite', (s) => s.put({ salt: b64u(salt), key }, 'group'));
  } catch {
    /* private mode: the person will be asked for the passphrase next time */
  }
}

export async function forgetKey() {
  try {
    await tx('readwrite', (s) => s.delete('group'));
  } catch {
    /* nothing stored */
  }
}

/** Removes everything this app stored on the device. */
export async function wipeDevice() {
  await forgetKey();
  try {
    localStorage.removeItem(BLOB_KEY);
    localStorage.removeItem(ATTEMPTS_KEY);
  } catch {
    /* ignore */
  }
}

// ---------- Slowing down guessing on this page ----------
// Real protection against guessing is the slow key derivation plus a strong passphrase.
// This delay also stops someone from simply typing guesses on a shared computer.

function readAttempts() {
  try {
    return JSON.parse(localStorage.getItem(ATTEMPTS_KEY) ?? '{"n":0,"until":0}');
  } catch {
    return { n: 0, until: 0 };
  }
}

export function lockoutRemaining(now = Date.now()) {
  return Math.max(0, readAttempts().until - now);
}

export function recordFailure(now = Date.now()) {
  const a = readAttempts();
  a.n += 1;
  a.until = a.n >= 3 ? now + Math.min(2 ** (a.n - 3) * 5000, 5 * 60_000) : 0;
  try {
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(a));
  } catch {
    /* ignore */
  }
  return a;
}

export function clearFailures() {
  try {
    localStorage.removeItem(ATTEMPTS_KEY);
  } catch {
    /* ignore */
  }
}
