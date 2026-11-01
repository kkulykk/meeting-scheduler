import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCity, cityOptions, normalize, CITIES } from '../site/js/cities.js';
import { isValidZone } from '../site/js/time.js';

const tzOf = (s) => resolveCity(s)?.tz;

test('every curated city has a real time zone', () => {
  for (const c of CITIES) assert.ok(isValidZone(c.tz), `${c.city}: ${c.tz}`);
});

test('the group cities resolve, typed loosely', () => {
  assert.equal(tzOf('New Orleans'), 'America/Chicago');
  assert.equal(tzOf('  new orleans '), 'America/Chicago');
  assert.equal(tzOf('NOLA'), 'America/Chicago');
  assert.equal(tzOf('Oxford'), 'Europe/London');
  assert.equal(tzOf('warsaw'), 'Europe/Warsaw');
  assert.equal(tzOf('Vienna'), 'Europe/Vienna');
  assert.equal(tzOf('Wien'), 'Europe/Vienna');
  assert.equal(tzOf('Kyiv'), 'Europe/Kyiv');
  assert.equal(tzOf('Kiev'), 'Europe/Kyiv');
  assert.equal(tzOf('Київ'), 'Europe/Kyiv');
});

test('accents are optional and the canonical name comes back', () => {
  assert.deepEqual(resolveCity('krakow'), { city: 'Kraków', tz: 'Europe/Warsaw' });
  assert.equal(tzOf('Lodz'), 'Europe/Warsaw');
  assert.equal(tzOf('Gdansk'), 'Europe/Warsaw');
  assert.equal(tzOf('Sao Paulo'), 'America/Sao_Paulo');
});

test('countries, "City, Country" and raw zones work', () => {
  assert.equal(tzOf('Poland'), 'Europe/Warsaw');
  assert.equal(tzOf('Ukraine'), 'Europe/Kyiv');
  assert.equal(tzOf('UK'), 'Europe/London');
  assert.equal(tzOf('Lviv, Ukraine'), 'Europe/Kyiv');
  assert.equal(tzOf('Kyiv (Europe)'), 'Europe/Kyiv');
  assert.equal(tzOf('Europe/Lisbon'), 'Europe/Lisbon');
  assert.equal(tzOf('Reykjavik'), 'Atlantic/Reykjavik'); // from the browser's zone list
});

test('unknown text does not guess', () => {
  assert.equal(resolveCity('Atlantis'), null);
  assert.equal(resolveCity('War'), null);
  assert.equal(resolveCity(''), null);
});

test('suggestions are unique and include the curated cities first', () => {
  const opts = cityOptions();
  assert.equal(opts[0].value, 'New Orleans');
  const keys = opts.map((o) => normalize(o.value));
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(opts.length > 300);
});
