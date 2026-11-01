// Group data model and validation. Storage and links go through crypto.js and vault.js.
import { normalizeZone } from './time.js';

export const MIN_PEOPLE = 2;
export const MAX_PEOPLE = 5;

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

// ---------- Payload carried (encrypted) in links and on the device ----------

export function toPayload({ people, t, d, n, l }) {
  const out = { g: people.map((p) => [p.name, p.city, p.tz, p.wake, p.bed, p.work ? 1 : 0]) };
  if (t != null) out.t = t;
  if (d) out.d = d;
  if (n) out.n = n;
  if (l) out.l = l;
  return out;
}

/** Validates a decrypted payload. Never trust it blindly, even after decryption. */
export function fromPayload(obj) {
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.g)) return null;
  const people = cleanGroup(obj.g.map((r) => (Array.isArray(r)
    ? { name: r[0], city: r[1], tz: r[2], wake: r[3], bed: r[4], work: r[5] }
    : null)));
  if (!people) return null;
  const out = { people };
  if (Number.isFinite(obj.t)) out.t = obj.t;
  if (obj.d != null) out.d = clampInt(obj.d, 15, 240, 60);
  if (typeof obj.n === 'string' && obj.n.trim()) out.n = obj.n.trim().slice(0, 80);
  if (typeof obj.l === 'string' && /^https?:\/\//i.test(obj.l)) out.l = obj.l.slice(0, 500);
  return out;
}

// ---------- Public time links (no names, no group) ----------

const stamp = (ms) => new Date(ms).toISOString().slice(0, 16) + 'Z';

/** "#t=2026-11-08T17:00Z&d=60&n=Catch-up+call&l=https://…&z=Warsaw~Europe/Warsaw|Kyiv~Europe/Kyiv"
 *  `places` are cities only (never people's names), so friends can see each other's local time. */
export function buildTimeHash({ t, d, n, l, places }) {
  const q = new URLSearchParams();
  q.set('t', stamp(t));
  if (d) q.set('d', String(d));
  if (n) q.set('n', n);
  if (l) q.set('l', l);
  const z = uniquePlaces(places ?? []).map((p) => `${p.city.replace(/[~|]/g, ' ')}~${p.tz}`).join('|');
  if (z) q.set('z', z);
  return '#' + q.toString();
}

function uniquePlaces(list) {
  const seen = new Set();
  const out = [];
  for (const p of list) {
    const tz = normalizeZone(p?.tz);
    const city = String(p?.city ?? '').trim().slice(0, 40);
    const key = `${city.toLowerCase()}|${tz}`;
    if (!tz || !city || seen.has(key)) continue;
    seen.add(key);
    out.push({ city, tz });
    if (out.length === MAX_PEOPLE) break;
  }
  return out;
}

export function readTimeHash(params) {
  const t = Date.parse(params.get('t') ?? '');
  if (!Number.isFinite(t)) return null;
  const out = { t };
  if (params.get('d')) out.d = clampInt(params.get('d'), 15, 240, 60);
  const n = (params.get('n') ?? '').trim();
  if (n) out.n = n.slice(0, 80);
  const l = params.get('l') ?? '';
  if (/^https?:\/\//i.test(l)) out.l = l.slice(0, 500);
  const places = uniquePlaces((params.get('z') ?? '').split('|').filter(Boolean).map((item) => {
    const [city, tz] = item.split('~');
    return { city, tz };
  }));
  if (places.length) out.places = places;
  return out;
}

// ---------- Non-sensitive preferences ----------

const PREFS_KEY = 'common-hour:prefs';

export function loadPrefs(storage = globalThis.localStorage) {
  try {
    return JSON.parse(storage?.getItem(PREFS_KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

export function savePrefs(prefs, storage = globalThis.localStorage) {
  try {
    storage?.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}
