import {
  MIN, partsIn, offsetMinutes, localDayStarts, clockChanges, formatTime, formatDay, formatLongDay,
  hourLabel, offsetLabel, hoursPhrase, diffLabel, relativePhrase,
} from './time.js';
import { SLOT_MIN, statusAt, scanSlots, slotScore, pickSuggestions, verdict, compromises } from './schedule.js';
import { CITIES } from './cities.js';
import {
  EXAMPLE_GROUP, MIN_PEOPLE, MAX_PEOPLE, cleanGroup, toPayload, fromPayload, loadPrefs, savePrefs,
} from './state.js';
import { seal, open, peek, newSalt, deriveKey, generatePassphrase, passphraseProblem } from './crypto.js';
import {
  loadBlob, saveBlob, takeLegacyGroup, rememberedKey, rememberKey, forgetKey, wipeDevice,
  lockoutRemaining, recordFailure, clearFailures,
} from './vault.js';

// Refuse to run inside someone else's frame (clickjacking).
if (window.top !== window.self) {
  document.documentElement.replaceChildren();
  throw new Error('Common Hour cannot be embedded.');
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

const prefs = loadPrefs();
const prefers12 = ['h11', 'h12'].includes(new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle);

const state = {
  people: [],
  isExample: false,
  h12: prefs.h12 ?? prefers12,
  title: 'Catch-up call',
  link: '',
  duration: 60,
  selected: null,
  invite: null,
  dayIndex: 0,
};

/** The group's key lives only in memory (and, if chosen, as a non-extractable key on this device). */
const vault = { key: null, salt: null, remember: true };

let dayStarts = [];
let slots = [];
let suggestions = [];
let firstRibbon = true;
let currentShareUrl = '';
let currentGroupUrl = '';

const base = () => location.origin + location.pathname;

async function encryptedUrl(payload) {
  return `${base()}#e=${await seal(vault.key, vault.salt, toPayload(payload))}`;
}

let persistSeq = 0;
async function persist() {
  savePrefs({ h12: state.h12 });
  if (!vault.key || state.isExample) return;
  const seq = ++persistSeq;
  const saved = await seal(vault.key, vault.salt, toPayload({
    people: state.people, d: state.duration, n: state.title, l: state.link,
  }));
  const groupUrl = await encryptedUrl({ people: state.people });
  if (seq !== persistSeq) return;
  if (vault.remember) saveBlob(saved);
  currentGroupUrl = groupUrl;
}

/** Friends ordered west to east, so the timeline reads like a map. */
function ordered() {
  const now = Date.now();
  return state.people
    .map((p, i) => ({ ...p, i, off: offsetMinutes(p.tz, now) }))
    .sort((a, b) => a.off - b.off || a.i - b.i);
}

function recompute() {
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
  const people = ordered();
  const west = people[0];
  const east = people[people.length - 1];
  const gap = east.off - west.off;
  const title = $('hero-title');
  title.replaceChildren();
  if (gap === 0) {
    title.append('Everyone is on the same clock.');
  } else {
    title.append(
      el('span', { class: 'gap', text: hoursPhrase(gap) }),
      ` between ${west.city} and ${east.city}.`,
    );
  }
  $('hero-lede').textContent =
    `See each friend's day side by side, find an hour that suits all ${people.length} of you, and send the invite.`;
  $('example-chip').hidden = !state.isExample;
  $('create-own').hidden = !state.isExample;
  $('lock-btn').hidden = state.isExample;
  $('share-group').hidden = state.isExample;
  $('a-link').hidden = state.isExample;
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
        style: { background: s.bg, color: s.ink },
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

  currentShareUrl = '';
  writeOutputs(people, t, '');
  if (vault.key && !state.isExample) {
    const seq = ++callSeq;
    encryptedUrl({ people: state.people, t, d: state.duration, n: state.title, l: state.link }).then((url) => {
      if (seq !== callSeq) return;
      currentShareUrl = url;
      writeOutputs(people, t, url);
    });
  }
}

let callSeq = 0;

/** Message, .ics and calendar links. `url` is the encrypted link, or '' in example mode. */
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
    description: buildMessage({
      title: state.title, start: t, durationMin: state.duration, people: ordered(),
      link: state.link, url: '', h12: state.h12,
    }),
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
  persist();
  $('planner').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
});

// ---------- Form fields and actions ----------

$('f-title').addEventListener('input', (e) => {
  state.title = e.target.value.trim() || 'Catch-up call';
  renderCall();
  persist();
});
$('f-link').addEventListener('input', (e) => {
  const v = e.target.value.trim();
  state.link = /^https?:\/\//i.test(v) ? v : '';
  renderCall();
  persist();
});
$('f-duration').addEventListener('change', (e) => {
  state.duration = Number(e.target.value);
  recompute();
  renderAll();
  persist();
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
$('a-link').addEventListener('click', () => {
  if (state.isExample) return toast('Create your own group to share links.');
  if (!currentShareUrl) return toast('Still encrypting the link. Try again in a moment.');
  copy(currentShareUrl, 'Encrypted link copied. Friends need the group passphrase to open it.');
});
$('share-group').addEventListener('click', () => {
  if (!currentGroupUrl) return toast('Still encrypting the link. Try again in a moment.');
  copy(currentGroupUrl, 'Encrypted group link copied. Send the passphrase separately.');
});

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
  renderAll();
  persist();
});

// ---------- Edit friends dialog ----------

const zoneOptions = (() => {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [];
  }
})();
const HOURS_WAKE = [5, 6, 7, 8, 9, 10, 11, 12];
const HOURS_BED = [20, 21, 22, 23, 24, 25, 26, 27];

function citySelect(id, person) {
  const sel = el('select', { id });
  const cities = el('optgroup', { label: 'Cities' });
  let matched = false;
  CITIES.forEach((c, i) => {
    const on = !matched && c.city === person?.city && c.tz === person?.tz;
    matched ||= on;
    cities.append(el('option', { value: `c:${i}`, selected: on }, `${c.city} (${c.tz.split('/')[0]})`));
  });
  sel.append(cities);
  const zones = el('optgroup', { label: 'All time zones' });
  const zoneList = person && !zoneOptions.includes(person.tz) ? [person.tz, ...zoneOptions] : zoneOptions;
  for (const z of zoneList) {
    zones.append(el('option', { value: `z:${z}`, selected: !matched && z === person?.tz }, z.replace(/_/g, ' ')));
  }
  sel.append(zones);
  return sel;
}

function hourSelect(id, hours, value) {
  return el('select', { id },
    ...hours.map((h) => el('option', { value: h, selected: h === value }, formatHourOption(h))));
}

function formatHourOption(h) {
  const hh = h % 24;
  const label = state.h12 ? `${hh % 12 || 12}:00 ${hh < 12 ? 'AM' : 'PM'}` : `${String(hh).padStart(2, '0')}:00`;
  return h >= 24 ? `${label} (after midnight)` : label;
}

let draft = [];

function readDraft() {
  return draft.map((_, i) => {
    const pick = $(`gd-city-${i}`).value;
    const [kind, val] = [pick.slice(0, 1), pick.slice(2)];
    const city = kind === 'c' ? CITIES[Number(val)] : { city: val.split('/').pop().replace(/_/g, ' '), tz: val };
    return {
      name: $(`gd-name-${i}`).value,
      city: city.city,
      tz: city.tz,
      wake: Number($(`gd-wake-${i}`).value),
      bed: Number($(`gd-bed-${i}`).value),
      work: $(`gd-work-${i}`).checked,
    };
  });
}

function renderDraft() {
  $('gd-rows').replaceChildren(
    ...draft.map((p, i) => el('fieldset', { class: 'gd-row' },
      el('legend', { text: `Friend ${i + 1}` }),
      el('div', { class: 'field' }, el('label', { for: `gd-name-${i}`, text: 'Name' }),
        el('input', { id: `gd-name-${i}`, type: 'text', maxlength: '24', value: p.name, required: true })),
      el('div', { class: 'field grow' }, el('label', { for: `gd-city-${i}`, text: 'City' }), citySelect(`gd-city-${i}`, p)),
      el('div', { class: 'field' }, el('label', { for: `gd-wake-${i}`, text: 'Wakes' }), hourSelect(`gd-wake-${i}`, HOURS_WAKE, p.wake)),
      el('div', { class: 'field' }, el('label', { for: `gd-bed-${i}`, text: 'Bed' }), hourSelect(`gd-bed-${i}`, HOURS_BED, p.bed)),
      el('label', { class: 'check', for: `gd-work-${i}` },
        el('input', { id: `gd-work-${i}`, type: 'checkbox', checked: p.work }), 'Works 9–17 on weekdays'),
      el('button', {
        type: 'button',
        class: 'btn ghost small',
        disabled: draft.length <= MIN_PEOPLE,
        'aria-label': `Remove friend ${i + 1}`,
        onclick: () => {
          draft = readDraft();
          draft.splice(i, 1);
          renderDraft();
        },
      }, 'Remove'))),
  );
  $('gd-add').disabled = draft.length >= MAX_PEOPLE;
}

function openGroupDialog() {
  draft = state.people.map((p) => ({ ...p }));
  renderDraft();
  $('group-dialog').showModal();
}
$('edit-group').addEventListener('click', openGroupDialog);

$('gd-add').addEventListener('click', () => {
  draft = readDraft();
  if (draft.length >= MAX_PEOPLE) return;
  const guess = CITIES.findIndex((c) => c.tz === viewerTz);
  const base = guess >= 0 ? CITIES[guess] : { city: viewerTz.split('/').pop().replace(/_/g, ' '), tz: viewerTz };
  draft.push({ name: '', city: base.city, tz: base.tz, wake: 8, bed: 23, work: true });
  renderDraft();
  $(`gd-name-${draft.length - 1}`).focus();
});

$('group-dialog').addEventListener('close', () => {
  if ($('group-dialog').returnValue !== 'save') return;
  const people = cleanGroup(readDraft());
  if (!people) return;
  state.people = people;
  recompute();
  renderAll();
  persist();
  toast(state.isExample
    ? 'Example edits are not saved. Create your group to keep them.'
    : 'Friends saved and encrypted. Copy the group link to share them.');
});

// ---------- Boot ----------

function renderAll() {
  renderClockToggle();
  renderHero();
  renderInvite();
  renderDst();
  renderNow();
  renderDays();
  renderRibbon();
  renderSuggestions();
  renderCall();
}

// ---------- Lock screen ----------

let pendingToken = null;
let pendingFromLink = false;
let legacyPeople = null;
let lockoutTimer = null;

function showApp(on) {
  $('app').hidden = !on;
  $('lock').hidden = on;
  $('top-actions').hidden = !on;
}

const LOCK_COPY = {
  welcome: [
    'Your group, for your eyes only',
    'Names and cities are encrypted on your device with a passphrase only your group knows. ' +
      'Nothing is stored on a server, and a link is useless without the passphrase. ' +
      'Got a link from a friend? Open it and you will be asked for the passphrase.',
  ],
  unlock: [
    'Enter the group passphrase',
    'This group is encrypted. Ask the friend who set it up for the passphrase.',
  ],
  create: [
    'Create your group',
    'Everyone in the group uses this one passphrase to open links. ' +
      'Send it once, separately from the links: say it on a call or use a different app.',
  ],
};

function showLock(mode, { error = '' } = {}) {
  showApp(false);
  $('lock-welcome').hidden = mode !== 'welcome';
  $('unlock-form').hidden = mode !== 'unlock';
  $('create-form').hidden = mode !== 'create';
  $('lock-title').textContent = LOCK_COPY[mode][0];
  $('lock-text').textContent = LOCK_COPY[mode][1];
  $('lock-error').textContent = mode === 'welcome' ? error : '';
  $('lock-error').hidden = !(mode === 'welcome' && error);
  $('forget-device').hidden = !loadBlob();
  if (mode === 'unlock') {
    $('unlock-pass').value = '';
    $('unlock-error').textContent = error;
    $('unlock-pass').focus();
    updateLockout();
  }
  if (mode === 'create') {
    $('create-pass').value = generatePassphrase();
    $('create-error').textContent = '';
    $('create-saved').checked = false;
    $('create-pass').focus();
  }
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

function syncFields() {
  $('f-title').value = state.title;
  $('f-link').value = state.link;
  $('f-duration').value = String(state.duration);
  if (!$('f-duration').value) $('f-duration').value = '60';
}

async function unlock(key, salt, payload, remember, fromLink) {
  vault.key = key;
  vault.salt = salt;
  vault.remember = remember;
  if (remember) await rememberKey(salt, key);
  else await wipeDevice();
  state.people = payload.people;
  state.isExample = false;
  state.title = payload.n ?? 'Catch-up call';
  state.link = payload.l ?? '';
  state.duration = payload.d ?? 60;
  if (fromLink && payload.t != null) {
    state.selected = payload.t;
    state.invite = { t: payload.t };
  }
  syncFields();
  recompute();
  showApp(true);
  renderAll();
  await persist();
}

$('unlock-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (lockoutRemaining()) return updateLockout();
  const pass = $('unlock-pass').value;
  if (!pass) return;
  const btn = $('unlock-btn');
  btn.disabled = true;
  btn.textContent = 'Unlocking…';
  let payload = null;
  let key = null;
  const { salt } = peek(pendingToken);
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
    $('unlock-error').textContent = 'That passphrase does not open this group. Check it with the friend who set it up.';
    $('unlock-pass').select();
    updateLockout();
    return;
  }
  clearFailures();
  $('unlock-pass').value = '';
  await unlock(key, salt, payload, $('unlock-remember').checked, pendingFromLink);
});

function starterGroup() {
  const mine = CITIES.find((c) => c.tz === viewerTz)
    ?? { city: viewerTz.split('/').pop().replace(/_/g, ' '), tz: viewerTz };
  return cleanGroup([
    { name: 'Me', city: mine.city, tz: mine.tz, wake: 8, bed: 23, work: true },
    { name: '', city: 'London', tz: 'Europe/London', wake: 8, bed: 23, work: true },
  ]);
}

$('create-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pass = $('create-pass').value;
  const problem = passphraseProblem(pass);
  if (problem) {
    $('create-error').textContent = problem;
    return;
  }
  if (!$('create-saved').checked) {
    $('create-error').textContent = 'Tick the box once you have saved the passphrase. It cannot be recovered.';
    return;
  }
  const btn = $('create-btn');
  btn.disabled = true;
  btn.textContent = 'Encrypting…';
  const salt = newSalt();
  const key = await deriveKey(pass, salt);
  btn.disabled = false;
  btn.textContent = 'Create group';
  $('create-pass').value = '';
  const people = cleanGroup(legacyPeople) ?? starterGroup();
  legacyPeople = null;
  await unlock(key, salt, { people }, $('create-remember').checked, false);
  openGroupDialog();
});

$('create-regen').addEventListener('click', () => {
  $('create-pass').value = generatePassphrase();
  $('create-error').textContent = '';
});
$('create-copy').addEventListener('click', () => copy($('create-pass').value, 'Passphrase copied. Save it in your password manager.'));
$('create-pass').addEventListener('input', () => { $('create-error').textContent = ''; });
$('unlock-pass').addEventListener('input', () => { $('unlock-error').textContent = ''; });
$('create-back').addEventListener('click', () => showLock('welcome'));
$('start-create').addEventListener('click', () => showLock('create'));
$('start-example').addEventListener('click', () => {
  vault.key = null;
  state.people = EXAMPLE_GROUP.map((p) => ({ ...p }));
  state.isExample = true;
  recompute();
  showApp(true);
  renderAll();
});
$('create-own').addEventListener('click', () => showLock('create'));

$('lock-btn').addEventListener('click', async () => {
  await forgetKey();
  location.reload();
});

$('forget-device').addEventListener('click', async () => {
  if (!confirm('Remove the saved group and its key from this device? You will need a link and the passphrase to open it again.')) return;
  await wipeDevice();
  location.reload();
});

async function start() {
  legacyPeople = takeLegacyGroup(); // wipes any unencrypted data left by an older version
  const hashToken = new URLSearchParams(location.hash.slice(1)).get('e');
  // Never leave group data in the address bar or history entry.
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  const token = hashToken ?? loadBlob();
  if (!token) return showLock('welcome');
  const info = peek(token);
  if (!info) return showLock('welcome', { error: 'That link is damaged or incomplete. Ask your friend to send it again.' });
  pendingToken = token;
  pendingFromLink = Boolean(hashToken);
  const key = await rememberedKey(info.salt);
  if (key) {
    try {
      const payload = fromPayload(await open(key, token));
      if (payload) return unlock(key, info.salt, payload, true, pendingFromLink);
    } catch {
      /* stored key does not match: fall through to the passphrase prompt */
    }
  }
  showLock('unlock');
}

start();

setInterval(() => {
  if ($('app').hidden) return;
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
