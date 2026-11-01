import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  offsetMinutes, zonedToUtc, localDayStarts, clockChanges, formatTime, hoursPhrase, offsetLabel, HOUR,
} from '../site/js/time.js';
import { statusAt, scanSlots, pickSuggestions, verdict } from '../site/js/schedule.js';
import { EXAMPLE_GROUP, toPayload, fromPayload } from '../site/js/state.js';
import { buildIcs, foldLine } from '../site/js/invite.js';

test('offsets follow DST per zone', () => {
  // US clocks go back at 02:00 CDT on Sun 1 Nov 2026 (07:00 UTC).
  assert.equal(offsetMinutes('America/Chicago', Date.UTC(2026, 10, 1, 6, 0)), -300);
  assert.equal(offsetMinutes('America/Chicago', Date.UTC(2026, 10, 1, 8, 0)), -360);
  assert.equal(offsetMinutes('Europe/Kyiv', Date.UTC(2026, 10, 8)), 120);
  assert.equal(offsetMinutes('Europe/Warsaw', Date.UTC(2026, 6, 1)), 120);
  assert.equal(offsetMinutes('Europe/London', Date.UTC(2026, 0, 1)), 0);
});

test('zonedToUtc and day boundaries', () => {
  assert.equal(zonedToUtc('Europe/London', 2026, 11, 8, 17, 0), Date.UTC(2026, 10, 8, 17, 0));
  assert.equal(zonedToUtc('America/Chicago', 2026, 11, 8, 11, 0), Date.UTC(2026, 10, 8, 17, 0));
  const [a, b] = localDayStarts('America/Chicago', Date.UTC(2026, 10, 1, 12), 1);
  assert.equal((b - a) / HOUR, 25, 'fall-back day lasts 25 hours');
});

test('clock changes are found to the minute', () => {
  const [c] = clockChanges('Europe/London', Date.UTC(2026, 2, 20), 21);
  assert.equal(c.at, Date.UTC(2026, 2, 29, 1, 0));
  assert.deepEqual([c.from, c.to], [0, 60]);
});

test('formatting', () => {
  const t = Date.UTC(2026, 10, 8, 17, 0);
  assert.equal(formatTime('Europe/Kyiv', t), '19:00');
  assert.equal(formatTime('America/Chicago', t, true), '11:00 AM');
  assert.equal(hoursPhrase(480), '8 hours');
  assert.equal(hoursPhrase(330), '5½ hours');
  assert.equal(offsetLabel(-360), 'UTC−6');
  assert.equal(offsetLabel(330), 'UTC+5:30');
});

test('status for a person', () => {
  const jake = EXAMPLE_GROUP[0]; // New Orleans, wake 7, bed 23, works
  assert.equal(statusAt(jake, Date.UTC(2026, 10, 8, 17)).key, 'free'); // Sun 11:00
  assert.equal(statusAt(jake, Date.UTC(2026, 10, 9, 18)).key, 'work'); // Mon 12:00
  assert.equal(statusAt(jake, Date.UTC(2026, 10, 9, 9)).key, 'asleep'); // Mon 03:00
  assert.equal(statusAt(jake, Date.UTC(2026, 10, 9, 4, 30)).label, 'Late'); // Sun 22:30
  const owl = { tz: 'Europe/London', wake: 9, bed: 25, work: false };
  assert.equal(statusAt(owl, Date.UTC(2026, 10, 9, 0, 30)).label, 'Late'); // 00:30
  assert.equal(statusAt(owl, Date.UTC(2026, 10, 9, 1, 30)).key, 'asleep'); // 01:30
});

test('suggestions for New Orleans to Kyiv land on the weekend', () => {
  const from = Date.UTC(2026, 10, 2); // Mon 2 Nov
  const slots = scanSlots(EXAMPLE_GROUP, from, from + 7 * 24 * HOUR, 60);
  const picks = pickSuggestions(slots, from, 4);
  assert.equal(picks.length, 4);
  for (const p of picks) {
    assert.equal(verdict(p).key, 'great');
    const day = new Date(p.ms).getUTCDay();
    assert.ok(day === 0 || day === 6, 'weekend slot');
  }
});

test('payload round trip validates everything, including Cyrillic names', () => {
  const group = [...EXAMPLE_GROUP.slice(0, 4), { ...EXAMPLE_GROUP[4], name: 'Оксана' }];
  const back = fromPayload(toPayload({ people: group, t: Date.UTC(2026, 10, 8, 17), d: 45, n: 'Catch-up' }));
  assert.deepEqual(back.people, group);
  assert.equal(back.t, Date.UTC(2026, 10, 8, 17));
  assert.equal(back.d, 45);
  assert.equal(fromPayload({ g: [['A', 'X', 'Not/AZone', 8, 23, 1]] }), null);
  assert.equal(fromPayload({ ...toPayload({ people: group }), l: 'javascript:alert(1)' }).l, undefined);
  assert.equal(fromPayload('nope'), null);
});

test('ics output', () => {
  const ics = buildIcs({
    title: 'Catch-up, call', start: Date.UTC(2026, 10, 8, 17), durationMin: 60,
    description: 'Line one\n' + 'x'.repeat(200), now: 0, uid: 'u1',
  });
  assert.match(ics, /DTSTART:20261108T170000Z\r\n/);
  assert.match(ics, /DTEND:20261108T180000Z\r\n/);
  assert.match(ics, /SUMMARY:Catch-up\\, call/);
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75);
  assert.equal(foldLine('Ж'.repeat(60)).split('\r\n ').join(''), 'Ж'.repeat(60));
});
