// Time-zone math built on the browser's Intl API (IANA zones, DST-aware).
// Pure functions only: no DOM, so they run in Node tests too.

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

const WEEKDAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const partsFormatters = new Map();

function partsFormatter(tz) {
  let f = partsFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsFormatters.set(tz, f);
  }
  return f;
}

/** Wall-clock parts of an instant in a zone. */
export function partsIn(tz, ms) {
  const p = {};
  for (const { type, value } of partsFormatter(tz).formatToParts(new Date(ms))) p[type] = value;
  return {
    year: +p.year,
    month: +p.month,
    day: +p.day,
    hour: +p.hour % 24,
    minute: +p.minute,
    second: +p.second,
    weekday: WEEKDAY[p.weekday],
  };
}

/** UTC offset of a zone at an instant, in minutes (e.g. Kyiv in winter = 120). */
export function offsetMinutes(tz, ms) {
  const p = partsIn(tz, ms);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / MIN);
}

/** Instant at which the wall clock in `tz` reads the given local date and time. */
export function zonedToUtc(tz, year, month, day, hour = 0, minute = 0) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - offsetMinutes(tz, guess) * MIN;
  return guess - offsetMinutes(tz, first) * MIN;
}

/** Local midnights in `tz`: today plus the next `n` days (n + 1 boundaries). */
export function localDayStarts(tz, fromMs, n) {
  const p = partsIn(tz, fromMs);
  const out = [];
  for (let i = 0; i <= n; i++) {
    const d = new Date(Date.UTC(p.year, p.month - 1, p.day + i));
    out.push(zonedToUtc(tz, d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()));
  }
  return out;
}

/** Clock changes (DST starts or ends) in a zone within the next `days` days. */
export function clockChanges(tz, fromMs, days = 21) {
  const out = [];
  const end = fromMs + days * DAY;
  let prevT = fromMs;
  let prevO = offsetMinutes(tz, fromMs);
  for (let t = fromMs + 6 * HOUR; t <= end; t += 6 * HOUR) {
    const o = offsetMinutes(tz, t);
    if (o !== prevO) {
      let lo = prevT;
      let hi = t;
      while (hi - lo > MIN) {
        const mid = Math.floor((lo + hi) / 2);
        if (offsetMinutes(tz, mid) === prevO) lo = mid;
        else hi = mid;
      }
      out.push({ tz, at: Math.round(hi / MIN) * MIN, from: prevO, to: o });
      prevO = o;
    }
    prevT = t;
  }
  return out;
}

export function isValidZone(tz) {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Older ICU builds only know Kyiv by its old spelling. */
export function normalizeZone(tz) {
  if (isValidZone(tz)) return tz;
  if (tz === 'Europe/Kyiv' && isValidZone('Europe/Kiev')) return 'Europe/Kiev';
  return null;
}

// ---------- Formatting ----------

const formatters = new Map();
function cached(locale, opts) {
  const key = locale + JSON.stringify(opts);
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, opts);
    formatters.set(key, f);
  }
  return f;
}

/** "17:00" or "5:00 PM". */
export function formatTime(tz, ms, h12 = false) {
  return h12
    ? cached('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true }).format(ms)
    : cached('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
}

/** "Sun 8 Nov". */
export function formatDay(tz, ms) {
  return cached('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(ms);
}

/** "Sunday 8 November". */
export function formatLongDay(tz, ms) {
  return cached('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(ms);
}

/** Short hour label for the timeline: "17" or "5p". */
export function hourLabel(hour, h12 = false) {
  if (!h12) return String(hour).padStart(2, '0');
  return `${hour % 12 || 12}${hour < 12 ? 'a' : 'p'}`;
}

/** "UTC+2", "UTC−6", "UTC+5:30". */
export function offsetLabel(minutes) {
  const sign = minutes < 0 ? '−' : '+';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
}

/** "8 hours", "1 hour", "5½ hours". */
export function hoursPhrase(minutes) {
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const rest = abs % 60;
  const frac = rest === 30 ? '½' : rest === 45 ? '¾' : rest === 15 ? '¼' : '';
  const num = `${h || (frac ? '' : '0')}${frac}`;
  return `${num} ${h === 1 && !frac ? 'hour' : 'hours'}`;
}

/** "+7h", "−1h", "same time", relative to another offset. */
export function diffLabel(minutes) {
  if (minutes === 0) return 'same time as you';
  const sign = minutes > 0 ? '+' : '−';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}h from you`;
}

/** "in 6 days 3 hours", "in 40 minutes", "started 2 hours ago". */
export function relativePhrase(fromMs, toMs) {
  const diff = toMs - fromMs;
  const abs = Math.abs(diff);
  const days = Math.floor(abs / DAY);
  const hours = Math.floor((abs % DAY) / HOUR);
  const mins = Math.round((abs % HOUR) / MIN);
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  let text;
  if (days > 0) text = hours ? `${plural(days, 'day')} ${plural(hours, 'hour')}` : plural(days, 'day');
  else if (hours > 0) text = mins ? `${plural(hours, 'hour')} ${plural(mins, 'minute')}` : plural(hours, 'hour');
  else text = plural(Math.max(mins, 1), 'minute');
  return diff >= 0 ? `in ${text}` : `started ${text} ago`;
}
