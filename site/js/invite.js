// Invites without calendar access: a paste-ready message, an .ics file and calendar links.
import { formatDay, formatTime, MIN } from './time.js';

export function buildMessage({ title, start, durationMin, people, link, url, h12 }) {
  const lines = [`${title} (${durationMin} min)`, ''];
  for (const p of people) {
    lines.push(`${p.name}, ${p.city}: ${formatDay(p.tz, start)}, ${formatTime(p.tz, start, h12)}`);
  }
  lines.push('');
  if (link) lines.push(`Join: ${link}`);
  if (url) lines.push(`See it in your time zone: ${url}`);
  return lines.join('\n').trim();
}

const icsStamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

const icsEscape = (s) =>
  String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Fold content lines at 75 octets, as RFC 5545 requires. */
export function foldLine(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const chunks = [];
  let cur = '';
  let len = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    const limit = chunks.length ? 74 : 75; // continuation lines start with a space
    if (len + b > limit) {
      chunks.push(cur);
      cur = '';
      len = 0;
    }
    cur += ch;
    len += b;
  }
  chunks.push(cur);
  return chunks.join('\r\n ');
}

export function buildIcs({ title, start, durationMin, description, link, now = Date.now(), uid }) {
  const end = start + durationMin * MIN;
  const id = uid ?? `${start}-${Math.random().toString(36).slice(2, 10)}@meeting-scheduler`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Meeting Scheduler//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${id}`,
    `DTSTAMP:${icsStamp(now)}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${icsEscape(title)}`,
  ];
  if (description) lines.push(`DESCRIPTION:${icsEscape(description)}`);
  if (link) lines.push(`LOCATION:${icsEscape(link)}`, `URL:${link}`);
  lines.push(
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Call with friends in 15 minutes',
    'TRIGGER:-PT15M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  );
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

export function googleCalendarUrl({ title, start, durationMin, description, link }) {
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${icsStamp(start)}/${icsStamp(start + durationMin * MIN)}`,
    details: description ?? '',
  });
  if (link) q.set('location', link);
  return `https://calendar.google.com/calendar/render?${q}`;
}

export function outlookUrl({ title, start, durationMin, description, link }) {
  const q = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: title,
    startdt: new Date(start).toISOString(),
    enddt: new Date(start + durationMin * MIN).toISOString(),
    body: description ?? '',
  });
  if (link) q.set('location', link);
  return `https://outlook.live.com/calendar/0/deeplink/compose?${q}`;
}

export function mailtoUrl({ title, body }) {
  return `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}
