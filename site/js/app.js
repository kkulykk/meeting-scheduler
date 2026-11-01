import {
  MIN, partsIn, offsetMinutes, localDayStarts, clockChanges, formatTime, formatDay, formatLongDay,
  hourLabel, offsetLabel, hoursPhrase, diffLabel, relativePhrase,
} from './time.js';
import { SLOT_MIN, statusAt, scanSlots, slotScore, pickSuggestions, verdict, compromises } from './schedule.js';
import { CITIES } from './cities.js';
import {
  MIN_PEOPLE, MAX_PEOPLE, toPayload, fromPayload, buildTimeHash, readTimeHash, loadPrefs, savePrefs,
} from './state.js';
import { seal, open, peek, newSalt, deriveKey, generatePassphrase, passphraseProblem } from './crypto.js';
import {
  cleanupLegacy, rememberedKey, rememberKey, forgetKey, lockoutRemaining, recordFailure, clearFailures,
} from './vault.js';

// Refuse to run inside someone else's frame (clickjacking).
if (window.top !== window.self) {
  document.documentElement.replaceChildren();
  throw new Error('Meeting Scheduler cannot be embedded.');
}
import { buildMessage, buildIcs, googleCalendarUrl, outlookUrl, mailtoUrl } from './invite.js';

const viewerTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const $ = (id) => document.getElementById(id);

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'style') {
      for (const [prop, val] of Object.entries(v)) {
        if (prop.startsWith('--')) n.style.setProperty(prop, val);
        else n.style[prop] = val;
      }
    }
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid);
  return n;
}

// ---------- Sky colour for an hour of the local day ----------

const SKY = [
  [0, '#141a3d'], [4.5, '#1d2350'], [6, '#5d4f92'], [7, '#f2a385'], [8.5, '#a9d4f2'],
  [12, '#86c5f0'], [16.5, '#9fcdee'], [18.5, '#f6b26b'], [19.5, '#e97a6a'], [20.5, '#6d4f91'],
  [22, '#262c5e'], [24, '#141a3d'],
].map(([h, hex]) => [h, [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))]);

function sky(hour) {
  let i = 0;
  while (i < SKY.length - 2 && SKY[i + 1][0] <= hour) i++;
  const [h0, c0] = SKY[i];
  const [h1, c1] = SKY[i + 1];
  const f = (hour - h0) / (h1 - h0);
  const rgb = c0.map((c, k) => Math.round(c + (c1[k] - c) * f));
  const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  return { bg: `rgb(${rgb.join(' ')})`, ink: lum > 0.55 ? '#171b34' : '#f1f2fb' };
}

// ---------- State ----------
// Ad-hoc mode (default): people live in memory only; a refresh clears them.
// Preset mode: the group is encrypted into the page's own #p= link, opened with a password.

const prefs = loadPrefs();
const prefers12 = ['h11', 'h12'].includes(new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle);

let uid = 0;
const makeRow = (p = {}) => ({
  id: ++uid,
  name: p.name ?? '',
  city: p.city ?? '',
  tz: p.tz ?? null,
  wake: p.wake ?? 8,
  bed: p.bed ?? 23,
  work: p.work ?? true,
});

const state = {
  mode: 'adhoc',
  roster: [],
  h12: prefs.h12 ?? prefers12,
  title: 'Catch-up call',
  link: '',
  duration: 60,
  selected: null,
  invite: null,
  dayIndex: 0,
};

/** A preset's key lives in memory, and on this device only if "Remember" was ticked. */
const vault = { key: null, salt: null };

let dayStarts = [];
let slots = [];
let suggestions = [];
let firstRibbon = true;

const base = () => location.origin + location.pathname;

/** Rows that have a city, with blank names filled in. */
function people() {
  return state.roster
    .map((r, i) => ({ ...r, name: r.name.trim() || (i === 0 ? 'You' : `Friend ${i + 1}`) }))
    .filter((r) => r.tz);
}
const ready = () => people().length >= MIN_PEOPLE;

const timeUrl = () =>
  base() + buildTimeHash({ t: state.selected, d: state.duration, n: state.title, l: state.link });

let saveTimer = null;
let presetSaves = 0;

function schedulePresetSave() {
  if (state.mode !== 'preset') return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(savePreset, 400);
}

/** Re-encrypts the group into the address bar. Nothing is written to storage. */
async function savePreset() {
  clearTimeout(saveTimer);
  if (state.mode !== 'preset' || !vault.key || !ready()) return;
  const token = await seal(vault.key, vault.salt, toPayload({
    people: people(), d: state.duration, n: state.title, l: state.link,
  }));
  history.replaceState(null, '', `${base()}#p=${token}`);
  presetSaves += 1;
  if (presetSaves > 1) {
    $('preset-text').textContent =
      'Changes saved into a new private link. Bookmark this page again or copy the link. Old links still open the old version.';
  }
}

/** Friends ordered west to east, so the timeline reads like a map. */
function ordered() {
  const now = Date.now();
  return people()
    .map((p, i) => ({ ...p, i, off: offsetMinutes(p.tz, now) }))
    .sort((a, b) => a.off - b.off || a.i - b.i);
}

function recompute() {
  if (!ready()) return;
  const now = Date.now();
  dayStarts = localDayStarts(viewerTz, now, 7);
  slots = scanSlots(ordered(), dayStarts[0], dayStarts[7], state.duration);
  suggestions = pickSuggestions(slots, Math.ceil(now / (SLOT_MIN * MIN)) * SLOT_MIN * MIN, 4);
  if (state.selected == null && suggestions[0]) state.selected = suggestions[0].ms;
  syncDayToSelection();
}

function syncDayToSelection() {
  if (state.selected == null) return;
  const i = dayStarts.findIndex((s, k) => k < 7 && state.selected >= s && state.selected < dayStarts[k + 1]);
  if (i >= 0) state.dayIndex = i;
}

function select(ms) {
  state.selected = ms;
  syncDayToSelection();
  renderDays();
  renderRibbon();
  renderSuggestions();
  renderCall();
}

// ---------- Hero ----------

function renderHero() {
  const title = $('hero-title');
  title.replaceChildren();
  if (!ready()) {
    title.append('Plan a call across time zones.');
    $('hero-lede').textContent =
      'Add who is joining and the city each person is in right now. Nothing is saved: refresh and it is gone.';
    return;
  }
  const list = ordered();
  const west = list[0];
  const east = list[list.length - 1];
  const gap = east.off - west.off;
  if (gap === 0 || west.city === east.city) {
    title.append('Everyone is on the same clock.');
  } else {
    title.append(el('span', { class: 'gap', text: hoursPhrase(gap) }), ` between ${west.city} and ${east.city}.`);
  }
  $('hero-lede').textContent =
    `See each person's day side by side, find an hour that suits all ${list.length} of you, and send the invite.`;
}

// ---------- Right now ----------

function renderNow() {
  const now = Date.now();
  const viewerOff = offsetMinutes(viewerTz, now);
  const today = formatDay(viewerTz, now);
  $('now-list').replaceChildren(
    ...ordered().map((p) => {
      const st = statusAt(p, now);
      const s = sky(st.hour + st.minute / 60);
      const day = formatDay(p.tz, now);
      return el(
        'li',
        { class: 'now-card', style: { '--sky': s.bg } },
        el('div', { class: 'now-top' },
          el('span', { class: 'now-name', text: p.name }),
          el('span', { class: `pill st-${st.key}`, text: st.label })),
        el('p', { class: 'now-time', text: formatTime(p.tz, now, state.h12) }),
        el('p', { class: 'now-meta' },
          `${p.city} · ${day === today ? 'today' : day}`),
        el('p', { class: 'now-diff', text: `${offsetLabel(p.off)} · ${diffLabel(p.off - viewerOff)}` }),
      );
    }),
  );
}

// ---------- Clock-change warning ----------

function renderDst() {
  const now = Date.now();
  const seen = new Set();
  const changes = [];
  for (const p of ordered()) {
    if (seen.has(p.tz)) continue;
    seen.add(p.tz);
    for (const c of clockChanges(p.tz, now, 21)) changes.push({ ...c, city: p.city });
  }
  const box = $('dst-notice');
  if (!changes.length) {
    box.hidden = true;
    return;
  }
  changes.sort((a, b) => a.at - b.at);
  const parts = changes.map(
    (c) => `${c.city} on ${formatDay(c.tz, c.at)} (${offsetLabel(c.from)} to ${offsetLabel(c.to)})`,
  );
  box.textContent = `Clocks change soon: ${parts.join('; ')}. The gap between some of you shifts by an hour around those dates, so double-check recurring calls.`;
  box.hidden = false;
}

// ---------- Day chips ----------

function renderDays() {
  const now = Date.now();
  const box = $('days');
  box.replaceChildren(
    ...Array.from({ length: 7 }, (_, i) => {
      const start = dayStarts[i];
      const end = dayStarts[i + 1];
      const best = slots.filter((s) => s.ms >= start && s.ms < end && s.ms + SLOT_MIN * MIN > now)
        .reduce((m, s) => Math.max(m, s.total), 0);
      const label = i === 0 ? 'Today' : formatDay(viewerTz, start).replace(/ \w+$/, '');
      const v = verdict({ min: best >= 1 ? 1 : best > 0 ? 0.5 : 0 }).key;
      return el(
        'button',
        {
          type: 'button',
          class: `day${i === state.dayIndex ? ' on' : ''}`,
          'aria-pressed': String(i === state.dayIndex),
          title: best >= 1 ? 'Has times when everyone is free' : best > 0 ? 'Only compromise times' : 'No workable times',
          onclick: () => {
            state.dayIndex = i;
            renderDays();
            renderRibbon();
          },
        },
        el('span', { class: `day-dot v-${v}`, 'aria-hidden': 'true' }),
        label,
      );
    }),
  );
}

// ---------- Timeline ribbon ----------

function renderRibbon() {
  const ribbon = $('ribbon');
  const start = dayStarts[state.dayIndex];
  const end = dayStarts[state.dayIndex + 1];
  const n = Math.round((end - start) / (SLOT_MIN * MIN));
  const people = ordered();
  const now = Date.now();
  ribbon.style.setProperty('--cols', n);
  const nodes = [];
  const place = (node, row, col, span = 1) => {
    node.style.gridRow = String(row);
    node.style.gridColumn = `${col} / span ${span}`;
    nodes.push(node);
    return node;
  };

  // Row 1: axis in the viewer's own time.
  place(el('div', { class: 'r-label axis-label' },
    el('span', { class: 'r-name', text: 'Your time' }),
    el('span', { class: 'r-city', text: viewerTz.split('/').pop().replace(/_/g, ' ') })), 1, 1);
  for (let c = 0; c < n; c++) {
    const t = start + c * SLOT_MIN * MIN;
    const p = partsIn(viewerTz, t);
    const tick = p.minute === 0 && p.hour % 3 === 0;
    place(el('div', { class: `axis${tick ? ' tick' : ''}` }, tick ? hourLabel(p.hour, state.h12) : null), 1, c + 2);
  }

  // One row per friend: the sky they will see, plus a status bar.
  people.forEach((person, r) => {
    const row = r + 2;
    place(el('div', { class: 'r-label' },
      el('span', { class: 'r-name', text: person.name }),
      el('span', { class: 'r-city', text: `${person.city} · ${offsetLabel(offsetMinutes(person.tz, start + 12 * 60 * MIN))}` })), row, 1);
    for (let c = 0; c < n; c++) {
      const t = start + c * SLOT_MIN * MIN;
      const st = statusAt(person, t);
      const s = sky(st.hour + st.minute / 60);
      const label = st.minute === 0 && st.hour % 3 === 0 ? hourLabel(st.hour, state.h12) : null;
      const cls = ['cell', `st-${st.key}`, c === 0 && 'first', c === n - 1 && 'last'].filter(Boolean).join(' ');
      place(el('div', {
        class: cls,
        'data-ms': t,
        style: { background: s.bg, color: s.ink, '--i': c },
        title: `${person.name}: ${formatDay(person.tz, t)} ${formatTime(person.tz, t, state.h12)} · ${st.label}`,
      }, label ? el('span', { class: 'hl', text: label }) : null), row, c + 2);
    }
  });

  // Last row: the group's overlap, clickable.
  const overlapRow = people.length + 2;
  place(el('div', { class: 'r-label overlap-label' },
    el('span', { class: 'r-name', text: 'Everyone' }),
    el('span', { class: 'r-city', text: `${state.duration} min call` })), overlapRow, 1);
  for (let c = 0; c < n; c++) {
    const t = start + c * SLOT_MIN * MIN;
    const slot = slots.find((s) => s.ms === t) ?? slotScore(people, t, state.duration);
    const v = verdict(slot);
    place(el('button', {
      type: 'button',
      class: `ov v-${v.key}`,
      'data-ms': t,
      tabindex: '-1',
      'aria-label': `${formatTime(viewerTz, t, state.h12)} your time: ${v.label}`,
      style: { '--h': `${Math.round(slot.total * 100)}%` },
    }, el('span', { class: 'ov-bar' })), overlapRow, c + 2);
  }

  // Selection beam across all rows.
  if (state.selected != null && state.selected >= start && state.selected < end) {
    const col = Math.floor((state.selected - start) / (SLOT_MIN * MIN));
    const span = Math.min(Math.ceil(state.duration / SLOT_MIN), n - col);
    const beam = el('div', { class: 'beam', 'aria-hidden': 'true' });
    beam.style.gridRow = '1 / -1';
    beam.style.gridColumn = `${col + 2} / span ${span}`;
    nodes.push(beam);
  }

  // A thin line at the current moment, on today's view.
  if (now >= start && now < end) {
    const exact = (now - start) / (SLOT_MIN * MIN);
    const col = Math.floor(exact);
    const line = el('div', { class: 'nowline', 'aria-hidden': 'true' }, el('span', { text: 'now' }));
    line.style.gridRow = '1 / -1';
    line.style.gridColumn = `${col + 2} / span 1`;
    line.style.marginLeft = `${((exact - col) * 100).toFixed(1)}%`;
    nodes.push(line);
  }

  ribbon.replaceChildren(...nodes);
  ribbon.style.gridTemplateRows = `28px repeat(${people.length}, 46px) 44px`;
  if (firstRibbon) {
    firstRibbon = false;
    ribbon.classList.add('intro');
    setTimeout(() => ribbon.classList.remove('intro'), 1400);
    scrollRibbonToSelection();
  }
}

function scrollRibbonToSelection() {
  requestAnimationFrame(() => {
    const wrap = $('ribbon-wrap');
    const beam = wrap.querySelector('.beam');
    if (!beam || wrap.scrollWidth <= wrap.clientWidth) return;
    wrap.scrollLeft = Math.max(0, beam.offsetLeft - wrap.clientWidth / 2);
  });
}

$('ribbon').addEventListener('click', (e) => {
  const target = e.target.closest('[data-ms]');
  if (target) select(Number(target.dataset.ms));
});

$('ribbon-wrap').addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault();
  const step = (e.key === 'ArrowRight' ? 1 : -1) * SLOT_MIN * MIN;
  const base = state.selected ?? dayStarts[state.dayIndex] + 18 * 60 * MIN;
  const next = base + step;
  if (next >= dayStarts[0] && next < dayStarts[7]) select(next);
});

// ---------- Suggestions ----------

function renderSuggestions() {
  const people = ordered();
  const list = $('suggest-list');
  if (!suggestions.length) {
    list.replaceChildren(el('li', { class: 'empty', text: 'No time this week avoids everyone\'s sleep. Try a shorter call, or widen wake and bed times under Edit friends.' }));
    return;
  }
  list.replaceChildren(
    ...suggestions.map((s) => {
      const v = verdict(s);
      const notes = compromises(people, s);
      const on = s.ms === state.selected;
      return el('li', {},
        el('button', {
          type: 'button',
          class: `sugg${on ? ' on' : ''}`,
          'aria-pressed': String(on),
          onclick: () => {
            select(s.ms);
            scrollRibbonToSelection();
          },
        },
        el('span', { class: 'sugg-head' },
          el('span', { class: 'sugg-day', text: formatLongDay(viewerTz, s.ms) }),
          el('span', { class: `pill v-${v.key}`, text: v.label })),
        el('span', { class: 'sugg-times' },
          ...people.map((p) => el('span', { class: 'sugg-t' },
            el('b', { text: formatTime(p.tz, s.ms, state.h12) }),
            el('small', { text: p.city })))),
        notes.length ? el('span', { class: 'sugg-note', text: notes.join(', ') }) : null),
      );
    }),
  );
}

// ---------- Call panel ----------

let icsUrl = null;

function renderCall() {
  const people = ordered();
  const t = state.selected;
  const disabled = t == null;
  for (const id of ['a-copy', 'a-share', 'a-link']) $(id).disabled = disabled;
  if (disabled) {
    $('call-when').textContent = 'Click the timeline to choose a start time.';
    $('call-times').replaceChildren();
    $('call-verdict').textContent = '';
    $('msg-preview').textContent = '';
    return;
  }
  const end = t + state.duration * MIN;
  const slot = slotScore(people, t, state.duration);
  const v = verdict(slot);
  $('call-verdict').className = `pill v-${v.key}`;
  $('call-verdict').textContent = v.label;
  $('call-when').textContent =
    `${formatLongDay(viewerTz, t)}, ${formatTime(viewerTz, t, state.h12)} to ${formatTime(viewerTz, end, state.h12)} your time`;

  $('call-times').replaceChildren(
    ...people.map((p, i) => {
      const st = slot.statuses[i];
      const s = sky(st.hour + st.minute / 60);
      return el('li', { style: { '--sky': s.bg } },
        el('span', { class: 'ct-who' }, el('b', { text: p.name }), el('small', { text: p.city })),
        el('span', { class: 'ct-time' },
          el('b', { text: formatTime(p.tz, t, state.h12) }),
          el('small', { text: formatDay(p.tz, t) })),
        el('span', { class: `pill st-${st.key}`, text: st.label }));
    }),
  );

  writeOutputs(people, t, timeUrl());
}

/** Message, .ics and calendar links. `url` is the public time link (no names in it). */
function writeOutputs(people, t, url) {
  const message = buildMessage({
    title: state.title, start: t, durationMin: state.duration, people, link: state.link, url, h12: state.h12,
  });
  $('msg-preview').textContent = message;

  const event = { title: state.title, start: t, durationMin: state.duration, description: message, link: state.link };
  if (icsUrl) URL.revokeObjectURL(icsUrl);
  icsUrl = URL.createObjectURL(new Blob([buildIcs(event)], { type: 'text/calendar' }));
  $('a-ics').href = icsUrl;
  $('a-ics').download = `${state.title.replace(/[^\w-]+/g, '-').toLowerCase() || 'call'}.ics`;
  $('a-google').href = googleCalendarUrl(event);
  $('a-outlook').href = outlookUrl(event);
  $('a-email').href = mailtoUrl({ title: state.title, body: message });
}

// ---------- Invite banner (opened from a shared link) ----------

function renderInvite() {
  const box = $('invite');
  if (!state.invite) {
    box.hidden = true;
    return;
  }
  const t = state.invite.t;
  const event = {
    title: state.title, start: t, durationMin: state.duration, link: state.link,
    description: state.link ? `Join: ${state.link}` : '',
  };
  $('invite-title').textContent = state.title;
  $('invite-when').textContent =
    `${formatLongDay(viewerTz, t)} at ${formatTime(viewerTz, t, state.h12)} your time (${viewerTz.replace(/_/g, ' ')})`;
  $('invite-count').textContent = `${relativePhrase(Date.now(), t)} · ${state.duration} min`;
  const blob = URL.createObjectURL(new Blob([buildIcs(event)], { type: 'text/calendar' }));
  $('invite-ics').href = blob;
  $('invite-google').href = googleCalendarUrl(event);
  $('invite-join').hidden = !state.link;
  if (state.link) $('invite-join').href = state.link;
  box.hidden = false;
}

$('invite-close').addEventListener('click', () => {
  state.invite = null;
  renderInvite();
  if (state.mode === 'adhoc') history.replaceState(null, '', base());
});

// ---------- Form fields and actions ----------

$('f-title').addEventListener('input', (e) => {
  state.title = e.target.value.trim() || 'Catch-up call';
  renderCall();
  schedulePresetSave();
});
$('f-link').addEventListener('input', (e) => {
  const v = e.target.value.trim();
  state.link = /^https?:\/\//i.test(v) ? v : '';
  renderCall();
  schedulePresetSave();
});
$('f-duration').addEventListener('change', (e) => {
  state.duration = Number(e.target.value);
  recompute();
  renderAll();
  schedulePresetSave();
});

let toastTimer;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

async function copy(text, done) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = el('textarea', { style: { position: 'fixed', opacity: '0' } });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast(done);
}

$('a-copy').addEventListener('click', () => copy($('msg-preview').textContent, 'Message copied. Paste it in your group chat.'));
$('a-link').addEventListener('click', () =>
  copy(timeUrl(), 'Time link copied. It shows the time in each friend\'s own zone and contains no names.'));

if (navigator.share) {
  $('a-share').hidden = false;
  $('a-share').addEventListener('click', () => {
    navigator.share({ title: state.title, text: $('msg-preview').textContent }).catch(() => {});
  });
}

function renderClockToggle() {
  $('clock-toggle').setAttribute('aria-pressed', String(state.h12));
}
$('clock-toggle').addEventListener('click', () => {
  state.h12 = !state.h12;
  savePrefs({ h12: state.h12 });
  renderRoster();
  renderAll();
});

// ---------- Who's on the call (inline editor) ----------

const zoneOptions = (() => {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [];
  }
})();
const HOURS_WAKE = [5, 6, 7, 8, 9, 10, 11, 12];
const HOURS_BED = [20, 21, 22, 23, 24, 25, 26, 27];

function citySelect(id, row, onchange) {
  const sel = el('select', { id, onchange });
  sel.append(el('option', { value: '', selected: !row.tz }, 'Choose a city…'));
  const cities = el('optgroup', { label: 'Cities' });
  let matched = false;
  CITIES.forEach((c, i) => {
    const on = !matched && c.city === row.city && c.tz === row.tz;
    matched ||= on;
    cities.append(el('option', { value: `c:${i}`, selected: on }, `${c.city} (${c.tz.split('/')[0]})`));
  });
  sel.append(cities);
  const zones = el('optgroup', { label: 'All time zones' });
  const list = row.tz && !zoneOptions.includes(row.tz) ? [row.tz, ...zoneOptions] : zoneOptions;
  for (const z of list) {
    zones.append(el('option', { value: `z:${z}`, selected: !matched && z === row.tz }, z.replace(/_/g, ' ')));
  }
  sel.append(zones);
  return sel;
}

function formatHourOption(h) {
  const hh = h % 24;
  const label = state.h12 ? `${hh % 12 || 12}:00 ${hh < 12 ? 'AM' : 'PM'}` : `${String(hh).padStart(2, '0')}:00`;
  return h >= 24 ? `${label} (after midnight)` : label;
}

function hourSelect(id, hours, value, onchange) {
  return el('select', { id, onchange },
    ...hours.map((h) => el('option', { value: h, selected: h === value }, formatHourOption(h))));
}

let nameTimer = null;

function rosterChanged() {
  recompute();
  renderAll();
  schedulePresetSave();
}

function renderRoster() {
  const rows = state.roster.map((r, i) => {
    const id = (k) => `r-${k}-${r.id}`;
    return el('fieldset', { class: 'r-row' },
      el('legend', { class: 'visually-hidden', text: `Person ${i + 1}` }),
      el('div', { class: 'field' },
        el('label', { for: id('name'), text: 'Name' }),
        el('input', {
          id: id('name'),
          type: 'text',
          maxlength: '24',
          value: r.name,
          placeholder: i === 0 ? 'You' : `Friend ${i + 1}`,
          autocomplete: 'off',
          oninput: (e) => {
            r.name = e.target.value;
            clearTimeout(nameTimer);
            nameTimer = setTimeout(rosterChanged, 250);
          },
        })),
      el('div', { class: 'field grow' },
        el('label', { for: id('city'), text: 'City right now' }),
        citySelect(id('city'), r, (e) => {
          const v = e.target.value;
          if (!v) {
            r.tz = null;
            r.city = '';
          } else if (v.startsWith('c:')) {
            Object.assign(r, { city: CITIES[Number(v.slice(2))].city, tz: CITIES[Number(v.slice(2))].tz });
          } else {
            r.tz = v.slice(2);
            r.city = r.tz.split('/').pop().replace(/_/g, ' ');
          }
          rosterChanged();
        })),
      el('div', { class: 'field' },
        el('label', { for: id('wake'), text: 'Wakes' }),
        hourSelect(id('wake'), HOURS_WAKE, r.wake, (e) => {
          r.wake = Number(e.target.value);
          rosterChanged();
        })),
      el('div', { class: 'field' },
        el('label', { for: id('bed'), text: 'Bed' }),
        hourSelect(id('bed'), HOURS_BED, r.bed, (e) => {
          r.bed = Number(e.target.value);
          rosterChanged();
        })),
      el('label', { class: 'check', for: id('work') },
        el('input', {
          id: id('work'),
          type: 'checkbox',
          checked: r.work,
          onchange: (e) => {
            r.work = e.target.checked;
            rosterChanged();
          },
        }),
        'Works 9–17 weekdays'),
      el('button', {
        type: 'button',
        class: 'btn ghost small',
        disabled: state.roster.length <= MIN_PEOPLE,
        'aria-label': `Remove person ${i + 1}`,
        onclick: () => {
          state.roster.splice(i, 1);
          renderRoster();
          rosterChanged();
        },
      }, 'Remove'));
  });
  $('roster-rows').replaceChildren(...rows);
  $('roster-add').disabled = state.roster.length >= MAX_PEOPLE;
  $('roster-count').textContent = `${state.roster.length} of ${MAX_PEOPLE}`;
}

$('roster-add').addEventListener('click', () => {
  if (state.roster.length >= MAX_PEOPLE) return;
  const row = makeRow();
  state.roster.push(row);
  renderRoster();
  renderMode();
  $(`r-name-${row.id}`).focus();
});

function renderMode() {
  const preset = state.mode === 'preset';
  $('mode-chip').hidden = !preset;
  $('adhoc-note').hidden = preset;
  $('preset-note').hidden = !preset;
  $('save-preset').disabled = !ready();
  $('save-preset').title = ready() ? '' : 'Add at least two people with a city first';
}

// ---------- Rendering ----------

function renderAll() {
  renderClockToggle();
  renderHero();
  renderInvite();
  renderMode();
  const ok = ready();
  $('plan').hidden = !ok;
  if (!ok) {
    $('dst-notice').hidden = true;
    return;
  }
  renderDst();
  renderNow();
  renderDays();
  renderRibbon();
  renderSuggestions();
  renderCall();
}

function syncFields() {
  $('f-title').value = state.title;
  $('f-link').value = state.link;
  $('f-duration').value = String(state.duration);
  if (!$('f-duration').value) $('f-duration').value = '60';
}

function showApp() {
  $('unlock').hidden = true;
  $('app').hidden = false;
}

// ---------- Ad-hoc mode ----------

function startAdhoc(invite) {
  state.mode = 'adhoc';
  vault.key = null;
  vault.salt = null;
  const mine = CITIES.find((c) => c.tz === viewerTz)
    ?? { city: viewerTz.split('/').pop().replace(/_/g, ' '), tz: viewerTz };
  state.roster = [makeRow({ city: mine.city, tz: mine.tz }), makeRow()];
  if (invite) {
    state.invite = { t: invite.t };
    state.selected = invite.t;
    state.title = invite.n ?? 'Catch-up call';
    state.link = invite.l ?? '';
    state.duration = invite.d ?? 60;
  }
  showApp();
  syncFields();
  renderRoster();
  recompute();
  renderAll();
}

// ---------- Private preset: create ----------

$('save-preset').addEventListener('click', () => {
  if (!ready()) return toast('Add at least two people with a city first.');
  $('pd-pass').value = generatePassphrase();
  $('pd-error').textContent = '';
  $('pd-saved').checked = false;
  $('pd-remember').checked = false;
  $('preset-dialog').showModal();
  $('pd-pass').select();
});

$('pd-regen').addEventListener('click', () => {
  $('pd-pass').value = generatePassphrase();
  $('pd-error').textContent = '';
});
$('pd-copy').addEventListener('click', () => copy($('pd-pass').value, 'Password copied. Save it in your password manager.'));
$('pd-pass').addEventListener('input', () => { $('pd-error').textContent = ''; });
$('pd-cancel').addEventListener('click', () => $('preset-dialog').close());

$('preset-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pass = $('pd-pass').value;
  const problem = passphraseProblem(pass);
  if (problem) {
    $('pd-error').textContent = problem.replace('passphrase', 'password');
    return;
  }
  if (!$('pd-saved').checked) {
    $('pd-error').textContent = 'Tick the box once you have saved the password. It cannot be recovered.';
    return;
  }
  const btn = $('pd-btn');
  btn.disabled = true;
  btn.textContent = 'Encrypting…';
  const salt = newSalt();
  const key = await deriveKey(pass, salt);
  btn.disabled = false;
  btn.textContent = 'Create private link';
  $('pd-pass').value = '';
  vault.key = key;
  vault.salt = salt;
  if ($('pd-remember').checked) await rememberKey(salt, key);
  state.mode = 'preset';
  presetSaves = 0;
  await savePreset();
  $('preset-dialog').close();
  renderMode();
  toast('Private link created. Bookmark this page or copy the link.');
});

$('copy-preset').addEventListener('click', async () => {
  await savePreset(); // make sure the link has the latest edits
  copy(location.href, 'Private link copied. Send the password separately.');
});

$('lock-btn').addEventListener('click', async () => {
  await savePreset();
  if (vault.salt) await forgetKey(vault.salt);
  location.reload(); // the link stays in the address bar, so the password is asked again
});

// ---------- Private preset: unlock ----------

let pendingToken = null;
let lockoutTimer = null;

function showUnlock(token) {
  pendingToken = token;
  $('app').hidden = true;
  $('unlock').hidden = false;
  $('unlock-pass').value = '';
  $('unlock-error').textContent = '';
  $('unlock-pass').focus();
  updateLockout();
}

function updateLockout() {
  clearInterval(lockoutTimer);
  const tick = () => {
    const ms = lockoutRemaining();
    $('unlock-btn').disabled = ms > 0;
    $('unlock-wait').textContent = ms > 0 ? `Too many wrong tries. Try again in ${Math.ceil(ms / 1000)} s.` : '';
    if (!ms) clearInterval(lockoutTimer);
  };
  tick();
  lockoutTimer = setInterval(tick, 1000);
}

function enterPreset(key, salt, payload) {
  vault.key = key;
  vault.salt = salt;
  state.mode = 'preset';
  state.roster = payload.people.map(makeRow);
  state.title = payload.n ?? 'Catch-up call';
  state.link = payload.l ?? '';
  state.duration = payload.d ?? 60;
  presetSaves = 1;
  showApp();
  syncFields();
  renderRoster();
  recompute();
  renderAll();
}

$('unlock-pass').addEventListener('input', () => { $('unlock-error').textContent = ''; });

$('unlock-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (lockoutRemaining()) return updateLockout();
  const pass = $('unlock-pass').value;
  if (!pass) return;
  const btn = $('unlock-btn');
  btn.disabled = true;
  btn.textContent = 'Unlocking…';
  const { salt } = peek(pendingToken);
  let key = null;
  let payload = null;
  try {
    key = await deriveKey(pass, salt);
    payload = fromPayload(await open(key, pendingToken));
  } catch {
    payload = null;
  }
  btn.textContent = 'Unlock';
  btn.disabled = false;
  if (!payload) {
    recordFailure();
    $('unlock-error').textContent = 'That password does not open this group.';
    $('unlock-pass').select();
    updateLockout();
    return;
  }
  clearFailures();
  $('unlock-pass').value = '';
  if ($('unlock-remember').checked) await rememberKey(salt, key);
  enterPreset(key, salt, payload);
});

$('unlock-skip').addEventListener('click', () => {
  history.replaceState(null, '', base());
  startAdhoc(null);
});

// ---------- Boot ----------

async function start() {
  await cleanupLegacy();
  const params = new URLSearchParams(location.hash.slice(1));
  const token = params.get('p');
  if (token) {
    const info = peek(token);
    if (info) {
      const key = await rememberedKey(info.salt);
      if (key) {
        try {
          const payload = fromPayload(await open(key, token));
          if (payload) return enterPreset(key, info.salt, payload);
        } catch {
          /* stored key does not fit this link: ask for the password */
        }
      }
      return showUnlock(token);
    }
    history.replaceState(null, '', base());
    startAdhoc(null);
    toast('That private link is damaged or incomplete. Ask for it again.');
    return;
  }
  startAdhoc(readTimeHash(params));
}

start();

setInterval(() => {
  if ($('app').hidden || !ready()) return;
  if (Date.now() >= dayStarts[1]) {
    recompute();
    renderAll();
    return;
  }
  renderNow();
  renderRibbon();
  if (state.invite) $('invite-count').textContent = `${relativePhrase(Date.now(), state.invite.t)} · ${state.duration} min`;
}, 60 * 1000);

window.addEventListener('hashchange', () => location.reload());
