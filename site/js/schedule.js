// Scoring: how good is a given moment for each friend, and for the group?
import { partsIn, MIN } from './time.js';

export const SLOT_MIN = 30;

/**
 * Availability of one person at an instant, from their own wall clock.
 * person: { tz, wake, bed, work } — wake/bed are hours; bed may exceed 24 (25 = 1am).
 */
export function statusAt(person, ms) {
  const p = partsIn(person.tz, ms);
  const h = p.hour + p.minute / 60;
  const { wake, bed, work } = person;
  const awake = bed > 24 ? h >= wake || h < bed - 24 : h >= wake && h < bed;
  const base = { hour: p.hour, minute: p.minute, weekday: p.weekday };
  if (!awake) return { ...base, key: 'asleep', label: 'Asleep', score: 0 };

  const weekend = p.weekday === 0 || p.weekday === 6;
  if (work && !weekend && h >= 9 && h < 17) {
    return { ...base, key: 'work', label: 'At work', score: 0.35 };
  }
  const sinceWake = (h - wake + 24) % 24;
  const toBed = ((bed % 24) - h + 24) % 24;
  if (sinceWake < 1) return { ...base, key: 'edge', label: 'Early', score: 0.65 };
  if (toBed < 1) return { ...base, key: 'edge', label: 'Late', score: 0.65 };
  return { ...base, key: 'free', label: 'Free', score: 1 };
}

/** Worst status a person hits across a call of `durMin` minutes. */
export function personSlot(person, start, durMin) {
  let worst = null;
  for (let t = start; t < start + durMin * MIN; t += SLOT_MIN * MIN) {
    const s = statusAt(person, t);
    if (!worst || s.score < worst.score) worst = s;
  }
  return worst;
}

/** Group score in [0, 1]: 0 if anyone is asleep; otherwise blends average and worst case. */
export function slotScore(people, start, durMin) {
  const statuses = people.map((p) => personSlot(p, start, durMin));
  const scores = statuses.map((s) => s.score);
  const min = Math.min(...scores);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return { ms: start, total: min === 0 ? 0 : 0.6 * avg + 0.4 * min, min, statuses };
}

export function scanSlots(people, from, to, durMin) {
  const out = [];
  for (let t = from; t < to; t += SLOT_MIN * MIN) out.push(slotScore(people, t, durMin));
  return out;
}

/** Best distinct slots at or after `notBefore`, at least `gapMin` apart. */
export function pickSuggestions(slots, notBefore, count = 4, gapMin = 180) {
  const ranked = slots
    .filter((s) => s.ms >= notBefore && s.total > 0)
    .sort((a, b) => b.total - a.total || a.ms - b.ms);
  const picked = [];
  for (const s of ranked) {
    if (picked.every((p) => Math.abs(p.ms - s.ms) >= gapMin * MIN)) picked.push(s);
    if (picked.length === count) break;
  }
  return picked;
}

/** Plain-language verdict for a slot. */
export function verdict(slot) {
  if (!slot || slot.min === 0) return { key: 'no', label: "Someone's asleep" };
  if (slot.min === 1) return { key: 'great', label: 'Everyone free' };
  if (slot.min >= 0.65) return { key: 'good', label: 'Early or late for someone' };
  return { key: 'stretch', label: "Clashes with someone's work" };
}

/** Names of people for whom the slot is not ideal, with why. */
export function compromises(people, slot) {
  return slot.statuses
    .map((s, i) => ({ s, p: people[i] }))
    .filter(({ s }) => s.key !== 'free')
    .map(({ s, p }) => `${s.label.toLowerCase()} for ${p.name}`);
}
