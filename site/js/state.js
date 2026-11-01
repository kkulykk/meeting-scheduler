// Group and invite state, stored in the URL hash (shareable) and localStorage (sticky).
import { normalizeZone } from './time.js';

export const MIN_PEOPLE = 2;
export const MAX_PEOPLE = 5;
const STORAGE_KEY = 'common-hour:v1';

export const EXAMPLE_GROUP = [
  { name: 'Jake', city: 'New Orleans', tz: 'America/Chicago', wake: 7, bed: 23, work: true },
  { name: 'Emma', city: 'Oxford', tz: 'Europe/London', wake: 8, bed: 24, work: true },
  { name: 'Marta', city: 'Warsaw', tz: 'Europe/Warsaw', wake: 7, bed: 23, work: true },
  { name: 'Lukas', city: 'Vienna', tz: 'Europe/Vienna', wake: 7, bed: 23, work: true },
  { name: 'Oksana', city: 'Kyiv', tz: 'Europe/Kyiv', wake: 8, bed: 24, work: true },
];

const clampInt = (v, lo, hi, dflt) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

export function cleanPerson(raw, i = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const tz = normalizeZone(raw.tz);
  if (!tz) return null;
  const name = String(raw.name ?? '').trim().slice(0, 24) || `Friend ${i + 1}`;
  const city = String(raw.city ?? '').trim().slice(0, 40) || tz.split('/').pop().replace(/_/g, ' ');
  return {
    name,
    city,
    tz,
    wake: clampInt(raw.wake, 4, 12, 8),
    bed: clampInt(raw.bed, 19, 27, 23),
    work: Boolean(raw.work),
  };
}

export function cleanGroup(list) {
  if (!Array.isArray(list)) return null;
  const people = list.map(cleanPerson).filter(Boolean).slice(0, MAX_PEOPLE);
  return people.length >= MIN_PEOPLE ? people : null;
}

// ---------- base64url (UTF-8 safe, so Cyrillic names survive) ----------

export function toB64Url(str) {
  let bin = '';
  for (const b of new TextEncoder().encode(str)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64Url(s) {
  let b = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b.length % 4) b += '=';
  return new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0)));
}

export function encodeGroup(people) {
  return toB64Url(JSON.stringify(people.map((p) => [p.name, p.city, p.tz, p.wake, p.bed, p.work ? 1 : 0])));
}

export function decodeGroup(code) {
  try {
    const rows = JSON.parse(fromB64Url(code));
    return cleanGroup(rows.map(([name, city, tz, wake, bed, work]) => ({ name, city, tz, wake, bed, work })));
  } catch {
    return null;
  }
}

/** Short UTC stamp for links: 2026-11-08T17:00Z */
const stamp = (ms) => new Date(ms).toISOString().slice(0, 16) + 'Z';

export function readHash(hash) {
  const q = new URLSearchParams(String(hash).replace(/^#/, ''));
  const out = {};
  if (q.get('g')) out.people = decodeGroup(q.get('g'));
  const t = Date.parse(q.get('t') ?? '');
  if (Number.isFinite(t)) out.t = t;
  if (q.get('d')) out.d = clampInt(q.get('d'), 15, 240, 60);
  if (q.get('n')) out.n = q.get('n').slice(0, 80);
  if (q.get('l')) {
    const l = q.get('l');
    if (/^https?:\/\//i.test(l)) out.l = l.slice(0, 500);
  }
  return out;
}

export function buildHash({ people, t, d, n, l }) {
  const q = new URLSearchParams();
  q.set('g', encodeGroup(people));
  if (t != null) q.set('t', stamp(t));
  if (d) q.set('d', String(d));
  if (n) q.set('n', n);
  if (l) q.set('l', l);
  return '#' + q.toString();
}

export function loadLocal(storage = globalThis.localStorage) {
  try {
    const data = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
    if (!data) return null;
    return { ...data, people: cleanGroup(data.people) };
  } catch {
    return null;
  }
}

export function saveLocal(data, storage = globalThis.localStorage) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* private mode or full storage: the URL still carries the group */
  }
}
