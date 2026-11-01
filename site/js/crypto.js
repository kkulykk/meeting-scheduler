// End-to-end encryption for group data. Links and saved data only ever hold ciphertext.
//
//   key   = PBKDF2-SHA256(passphrase, salt, 600 000 iterations) -> AES-256-GCM key
//   token = base64url( version(1) | salt(16) | iv(12) | AES-GCM(ciphertext + tag) )
//
// The version byte and salt are bound as additional authenticated data, so any change
// to a link is detected. The plaintext is padded to a 256-byte boundary so the link
// length does not reveal how long the names are.

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

export const VERSION = 1;
export const ITERATIONS = 600_000;
const SALT_LEN = 16;
const IV_LEN = 12;
const PAD_TO = 256;

export function b64u(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64u(s) {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('bad encoding');
  let b = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b.length % 4) b += '=';
  return Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
}

export const randomBytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));
export const newSalt = () => randomBytes(SALT_LEN);

export async function deriveKey(passphrase, salt, iterations = ITERATIONS) {
  const base = await subtle.importKey('raw', enc.encode(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable: the raw key can never be read back out of the browser
    ['encrypt', 'decrypt'],
  );
}

function header(salt) {
  const h = new Uint8Array(1 + SALT_LEN);
  h[0] = VERSION;
  h.set(salt, 1);
  return h;
}

export async function seal(key, salt, obj) {
  let text = JSON.stringify(obj);
  const len = enc.encode(text).length;
  text += ' '.repeat(Math.ceil((len + 1) / PAD_TO) * PAD_TO - len);
  const iv = randomBytes(IV_LEN);
  const h = header(salt);
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: h }, key, enc.encode(text)));
  const out = new Uint8Array(h.length + IV_LEN + ct.length);
  out.set(h, 0);
  out.set(iv, h.length);
  out.set(ct, h.length + IV_LEN);
  return b64u(out);
}

/** Reads the salt from a token without decrypting, or null if it is malformed. */
export function peek(token) {
  try {
    const bytes = fromB64u(token);
    if (bytes.length < 1 + SALT_LEN + IV_LEN + 16 || bytes[0] !== VERSION) return null;
    return { salt: bytes.slice(1, 1 + SALT_LEN) };
  } catch {
    return null;
  }
}

/** Decrypts a token. Throws if the key is wrong or the token was altered. */
export async function open(key, token) {
  const bytes = fromB64u(token);
  const h = bytes.slice(0, 1 + SALT_LEN);
  const iv = bytes.slice(h.length, h.length + IV_LEN);
  const ct = bytes.slice(h.length + IV_LEN);
  const plain = await subtle.decrypt({ name: 'AES-GCM', iv, additionalData: h }, key, ct);
  return JSON.parse(dec.decode(plain));
}

// ---------- Passphrases ----------

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/o, 1/l/i look-alikes (31 symbols)

/** "k7qm-2xpd-9rtw-h4zc-m3va": 20 random symbols, about 99 bits of entropy. */
export function generatePassphrase(groups = 5, size = 4) {
  const out = [];
  while (out.length < groups * size) {
    for (const b of randomBytes(32)) {
      if (b < 248 && out.length < groups * size) out.push(ALPHABET[b % 31]); // 248 = 8 × 31, unbiased
    }
  }
  return Array.from({ length: groups }, (_, i) => out.slice(i * size, (i + 1) * size).join('')).join('-');
}

/** Returns a reason the passphrase is too weak, or null if it is acceptable. */
export function passphraseProblem(p) {
  const s = (p ?? '').normalize('NFKC');
  if (s.length < 14) return 'Use at least 14 characters, or keep the generated passphrase.';
  if (new Set(s).size < 6) return 'Too repetitive. Mix in more different characters.';
  if (/^(.+?)\1+$/.test(s)) return 'Too repetitive. Avoid repeating the same chunk.';
  return null;
}
