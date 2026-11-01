// Device storage. By design the app never stores people: an ad-hoc plan disappears on
// refresh, and a preset lives only inside its own encrypted link. The one thing that can
// be kept, if the person ticks "Remember", is a preset's AES key, stored in IndexedDB as a
// non-extractable CryptoKey: scripts can use it, nobody can read the key bytes out.
import { b64u } from './crypto.js';

const ATTEMPTS_KEY = 'common-hour:attempts';
const DB = 'common-hour';
const STORE = 'keys';

/** Deletes anything earlier versions stored (some of it unencrypted). */
export async function cleanupLegacy() {
  for (const k of ['common-hour:v1', 'common-hour:vault']) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
  try {
    await tx('readwrite', (s) => s.delete('group'));
  } catch {
    /* ignore */
  }
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

const slot = (salt) => `preset:${b64u(salt)}`;

export async function rememberedKey(salt) {
  try {
    return (await tx('readonly', (s) => s.get(slot(salt)))) ?? null;
  } catch {
    return null;
  }
}

export async function rememberKey(salt, key) {
  try {
    await tx('readwrite', (s) => s.put(key, slot(salt)));
  } catch {
    /* private mode: the password will be asked again next time */
  }
}

export async function forgetKey(salt) {
  try {
    await tx('readwrite', (s) => s.delete(slot(salt)));
  } catch {
    /* nothing stored */
  }
}

// ---------- Slowing down guessing on this page ----------
// Real protection against guessing is the slow key derivation plus a strong password.
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
