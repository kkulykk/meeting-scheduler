import {
  MIN, partsIn, offsetMinutes, localDayStarts, clockChanges, formatTime, formatDay, formatLongDay,
  hourLabel, offsetLabel, hoursPhrase, diffLabel, relativePhrase,
} from './time.js';
import { SLOT_MIN, statusAt, scanSlots, slotScore, pickSuggestions, verdict, compromises } from './schedule.js';
import { CITIES } from './cities.js';
import {
  EXAMPLE_GROUP, MIN_PEOPLE, MAX_PEOPLE, cleanGroup, readHash, buildHash, loadLocal, saveLocal,
} from './state.js';
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

const hash = readHash(location.hash);
const local = loadLocal();
const prefers12 = ['h11', 'h12'].includes(new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle);

const state = {
  people: hash.people ?? local?.people ?? EXAMPLE_GROUP.map((p) => ({ ...p })),
  isExample: !hash.people && !local?.people,
  h12: local?.h12 ?? prefers12,
  title: hash.n ?? local?.title ?? 'Catch-up call',
  link: hash.l ?? local?.link ?? '',
  duration: hash.d ?? local?.duration ?? 60,
  selected: hash.t ?? null,
  invite: hash.t != null ? { t: hash.t } : null,
  dayIndex: 0,
};

let dayStarts = [];
let slots = [];
let suggestions = [];
let firstRibbon = true;

function persist() {
  saveLocal({
    people: state.isExample ? null : state.people,
    h12: state.h12,
    title: state.title,
    link: state.link,
    duration: state.duration,
  });
  const keep = state.invite ? buildShareHash() : buildHash({ people: state.people });
  history.replaceState(null, '', keep);
}

function buildShareHash() {
  return buildHash({
    people: state.people,
    t: state.selected,
    d: state.duration,
    n: state.title,
    l: state.link,
  });
}

const shareUrl = () => location.origin + location.pathname + buildShareHash();
const groupUrl = () => location.origin + location.pathname + buildHash({ people: state.people });

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

  const url = shareUrl();
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
      link: state.link, url: location.href, h12: state.h12,
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

$('f-title').value = state.title;
$('f-link').value = state.link;
$('f-duration').value = String(state.duration);
if (!$('f-duration').value) $('f-duration').value = '60';

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
$('a-link').addEventListener('click', () => copy(shareUrl(), 'Link copied. It opens in each friend\'s own time zone.'));
$('share-group').addEventListener('click', () => copy(groupUrl(), 'Group link copied. Friends who open it see the same group.'));

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

$('edit-group').addEventListener('click', () => {
  draft = state.people.map((p) => ({ ...p }));
  renderDraft();
  $('group-dialog').showModal();
});

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
  state.isExample = false;
  recompute();
  renderAll();
  persist();
  toast('Friends saved. Copy the group link to share them.');
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

recompute();
renderAll();
persist();

setInterval(() => {
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
