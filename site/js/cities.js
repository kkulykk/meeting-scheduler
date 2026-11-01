// City lookup: type a city (or country, or time zone) and get its IANA zone.
// Sources, in priority order: the curated list below, country names, then every
// city name in the browser's own time-zone database (about 400 of them).

export const CITIES = [
  // United States
  { city: 'New Orleans', tz: 'America/Chicago' },
  { city: 'Baton Rouge', tz: 'America/Chicago' },
  { city: 'Chicago', tz: 'America/Chicago' },
  { city: 'Houston', tz: 'America/Chicago' },
  { city: 'Dallas', tz: 'America/Chicago' },
  { city: 'Austin', tz: 'America/Chicago' },
  { city: 'San Antonio', tz: 'America/Chicago' },
  { city: 'Memphis', tz: 'America/Chicago' },
  { city: 'Nashville', tz: 'America/Chicago' },
  { city: 'Minneapolis', tz: 'America/Chicago' },
  { city: 'Kansas City', tz: 'America/Chicago' },
  { city: 'St. Louis', tz: 'America/Chicago' },
  { city: 'New York', tz: 'America/New_York' },
  { city: 'Boston', tz: 'America/New_York' },
  { city: 'Washington', tz: 'America/New_York' },
  { city: 'Philadelphia', tz: 'America/New_York' },
  { city: 'Atlanta', tz: 'America/New_York' },
  { city: 'Miami', tz: 'America/New_York' },
  { city: 'Orlando', tz: 'America/New_York' },
  { city: 'Charlotte', tz: 'America/New_York' },
  { city: 'Pittsburgh', tz: 'America/New_York' },
  { city: 'Denver', tz: 'America/Denver' },
  { city: 'Salt Lake City', tz: 'America/Denver' },
  { city: 'Phoenix', tz: 'America/Phoenix' },
  { city: 'Los Angeles', tz: 'America/Los_Angeles' },
  { city: 'San Francisco', tz: 'America/Los_Angeles' },
  { city: 'San Diego', tz: 'America/Los_Angeles' },
  { city: 'Seattle', tz: 'America/Los_Angeles' },
  { city: 'Portland', tz: 'America/Los_Angeles' },
  { city: 'Las Vegas', tz: 'America/Los_Angeles' },
  { city: 'Anchorage', tz: 'America/Anchorage' },
  { city: 'Honolulu', tz: 'Pacific/Honolulu' },
  // Canada and Latin America
  { city: 'Toronto', tz: 'America/Toronto' },
  { city: 'Montreal', tz: 'America/Toronto' },
  { city: 'Vancouver', tz: 'America/Vancouver' },
  { city: 'Mexico City', tz: 'America/Mexico_City' },
  { city: 'São Paulo', tz: 'America/Sao_Paulo' },
  { city: 'Buenos Aires', tz: 'America/Argentina/Buenos_Aires' },
  // United Kingdom and Ireland
  { city: 'London', tz: 'Europe/London' },
  { city: 'Oxford', tz: 'Europe/London' },
  { city: 'Cambridge', tz: 'Europe/London' },
  { city: 'Manchester', tz: 'Europe/London' },
  { city: 'Birmingham', tz: 'Europe/London' },
  { city: 'Bristol', tz: 'Europe/London' },
  { city: 'Leeds', tz: 'Europe/London' },
  { city: 'Liverpool', tz: 'Europe/London' },
  { city: 'Edinburgh', tz: 'Europe/London' },
  { city: 'Glasgow', tz: 'Europe/London' },
  { city: 'Cardiff', tz: 'Europe/London' },
  { city: 'Belfast', tz: 'Europe/London' },
  { city: 'Dublin', tz: 'Europe/Dublin' },
  // Central Europe
  { city: 'Warsaw', tz: 'Europe/Warsaw' },
  { city: 'Kraków', tz: 'Europe/Warsaw' },
  { city: 'Wrocław', tz: 'Europe/Warsaw' },
  { city: 'Gdańsk', tz: 'Europe/Warsaw' },
  { city: 'Poznań', tz: 'Europe/Warsaw' },
  { city: 'Łódź', tz: 'Europe/Warsaw' },
  { city: 'Lublin', tz: 'Europe/Warsaw' },
  { city: 'Katowice', tz: 'Europe/Warsaw' },
  { city: 'Vienna', tz: 'Europe/Vienna' },
  { city: 'Graz', tz: 'Europe/Vienna' },
  { city: 'Salzburg', tz: 'Europe/Vienna' },
  { city: 'Innsbruck', tz: 'Europe/Vienna' },
  { city: 'Linz', tz: 'Europe/Vienna' },
  { city: 'Berlin', tz: 'Europe/Berlin' },
  { city: 'Munich', tz: 'Europe/Berlin' },
  { city: 'Hamburg', tz: 'Europe/Berlin' },
  { city: 'Frankfurt', tz: 'Europe/Berlin' },
  { city: 'Cologne', tz: 'Europe/Berlin' },
  { city: 'Prague', tz: 'Europe/Prague' },
  { city: 'Brno', tz: 'Europe/Prague' },
  { city: 'Bratislava', tz: 'Europe/Bratislava' },
  { city: 'Budapest', tz: 'Europe/Budapest' },
  { city: 'Zurich', tz: 'Europe/Zurich' },
  { city: 'Geneva', tz: 'Europe/Zurich' },
  // Western and Southern Europe
  { city: 'Paris', tz: 'Europe/Paris' },
  { city: 'Lyon', tz: 'Europe/Paris' },
  { city: 'Amsterdam', tz: 'Europe/Amsterdam' },
  { city: 'Brussels', tz: 'Europe/Brussels' },
  { city: 'Lisbon', tz: 'Europe/Lisbon' },
  { city: 'Porto', tz: 'Europe/Lisbon' },
  { city: 'Madrid', tz: 'Europe/Madrid' },
  { city: 'Barcelona', tz: 'Europe/Madrid' },
  { city: 'Rome', tz: 'Europe/Rome' },
  { city: 'Milan', tz: 'Europe/Rome' },
  { city: 'Athens', tz: 'Europe/Athens' },
  // Northern Europe and the Baltics
  { city: 'Copenhagen', tz: 'Europe/Copenhagen' },
  { city: 'Stockholm', tz: 'Europe/Stockholm' },
  { city: 'Oslo', tz: 'Europe/Oslo' },
  { city: 'Helsinki', tz: 'Europe/Helsinki' },
  { city: 'Tallinn', tz: 'Europe/Tallinn' },
  { city: 'Riga', tz: 'Europe/Riga' },
  { city: 'Vilnius', tz: 'Europe/Vilnius' },
  // Ukraine and neighbours
  { city: 'Kyiv', tz: 'Europe/Kyiv' },
  { city: 'Lviv', tz: 'Europe/Kyiv' },
  { city: 'Kharkiv', tz: 'Europe/Kyiv' },
  { city: 'Odesa', tz: 'Europe/Kyiv' },
  { city: 'Dnipro', tz: 'Europe/Kyiv' },
  { city: 'Zaporizhzhia', tz: 'Europe/Kyiv' },
  { city: 'Vinnytsia', tz: 'Europe/Kyiv' },
  { city: 'Poltava', tz: 'Europe/Kyiv' },
  { city: 'Chernihiv', tz: 'Europe/Kyiv' },
  { city: 'Zhytomyr', tz: 'Europe/Kyiv' },
  { city: 'Ivano-Frankivsk', tz: 'Europe/Kyiv' },
  { city: 'Ternopil', tz: 'Europe/Kyiv' },
  { city: 'Lutsk', tz: 'Europe/Kyiv' },
  { city: 'Rivne', tz: 'Europe/Kyiv' },
  { city: 'Chernivtsi', tz: 'Europe/Kyiv' },
  { city: 'Uzhhorod', tz: 'Europe/Kyiv' },
  { city: 'Mykolaiv', tz: 'Europe/Kyiv' },
  { city: 'Kherson', tz: 'Europe/Kyiv' },
  { city: 'Sumy', tz: 'Europe/Kyiv' },
  { city: 'Khmelnytskyi', tz: 'Europe/Kyiv' },
  { city: 'Cherkasy', tz: 'Europe/Kyiv' },
  { city: 'Chișinău', tz: 'Europe/Chisinau' },
  { city: 'Bucharest', tz: 'Europe/Bucharest' },
  { city: 'Sofia', tz: 'Europe/Sofia' },
  { city: 'Istanbul', tz: 'Europe/Istanbul' },
  { city: 'Tbilisi', tz: 'Asia/Tbilisi' },
  // Further afield
  { city: 'Tel Aviv', tz: 'Asia/Jerusalem' },
  { city: 'Dubai', tz: 'Asia/Dubai' },
  { city: 'Delhi', tz: 'Asia/Kolkata' },
  { city: 'Mumbai', tz: 'Asia/Kolkata' },
  { city: 'Bangalore', tz: 'Asia/Kolkata' },
  { city: 'Bangkok', tz: 'Asia/Bangkok' },
  { city: 'Singapore', tz: 'Asia/Singapore' },
  { city: 'Hong Kong', tz: 'Asia/Hong_Kong' },
  { city: 'Beijing', tz: 'Asia/Shanghai' },
  { city: 'Shanghai', tz: 'Asia/Shanghai' },
  { city: 'Seoul', tz: 'Asia/Seoul' },
  { city: 'Tokyo', tz: 'Asia/Tokyo' },
  { city: 'Sydney', tz: 'Australia/Sydney' },
  { city: 'Melbourne', tz: 'Australia/Melbourne' },
  { city: 'Auckland', tz: 'Pacific/Auckland' },
  { city: 'Cape Town', tz: 'Africa/Johannesburg' },
  { city: 'Cairo', tz: 'Africa/Cairo' },
];

// Old or alternative spellings people commonly type.
const SPELLINGS = {
  kiev: 'Kyiv', lvov: 'Lviv', lwow: 'Lviv', kharkov: 'Kharkiv', odessa: 'Odesa', dnepr: 'Dnipro',
  dnipropetrovsk: 'Dnipro', zaporozhye: 'Zaporizhzhia', nikolaev: 'Mykolaiv', cracow: 'Kraków',
  wien: 'Vienna', warszawa: 'Warsaw', munchen: 'Munich', koln: 'Cologne', praha: 'Prague',
  roma: 'Rome', lisboa: 'Lisbon', nola: 'New Orleans', nyc: 'New York', la: 'Los Angeles',
  sf: 'San Francisco', dc: 'Washington', 'washington dc': 'Washington', 'saint louis': 'St. Louis',
  'st louis': 'St. Louis', bombay: 'Mumbai', bengaluru: 'Bangalore', peking: 'Beijing',
  'new delhi': 'Delhi', kishinev: 'Chișinău',
  // Cyrillic and Polish spellings for the group's own cities
  'київ': 'Kyiv', 'киев': 'Kyiv', 'львів': 'Lviv', 'харків': 'Kharkiv', 'одеса': 'Odesa',
  'дніпро': 'Dnipro', 'варшава': 'Warsaw', 'відень': 'Vienna', 'лондон': 'London',
};

// Countries that sit in one time zone, so the country name is enough.
const COUNTRIES = {
  ukraine: 'Kyiv', 'україна': 'Kyiv', poland: 'Warsaw', polska: 'Warsaw', austria: 'Vienna',
  'united kingdom': 'London', uk: 'London', england: 'London', scotland: 'Edinburgh', wales: 'Cardiff',
  britain: 'London', 'great britain': 'London', ireland: 'Dublin', germany: 'Berlin',
  france: 'Paris', italy: 'Rome', netherlands: 'Amsterdam', belgium: 'Brussels',
  switzerland: 'Zurich', czechia: 'Prague', 'czech republic': 'Prague', slovakia: 'Bratislava',
  hungary: 'Budapest', romania: 'Bucharest', moldova: 'Chișinău', bulgaria: 'Sofia',
  greece: 'Athens', turkey: 'Istanbul', georgia: 'Tbilisi', denmark: 'Copenhagen',
  sweden: 'Stockholm', norway: 'Oslo', finland: 'Helsinki', estonia: 'Tallinn', latvia: 'Riga',
  lithuania: 'Vilnius', israel: 'Tel Aviv', india: 'Delhi', japan: 'Tokyo', 'south korea': 'Seoul',
  china: 'Beijing', singapore: 'Singapore', thailand: 'Bangkok', uae: 'Dubai',
  'new zealand': 'Auckland', egypt: 'Cairo', 'south africa': 'Cape Town',
};

/** Lowercase, accents stripped, punctuation squashed: "Kraków" -> "krakow". */
export function normalize(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .toLowerCase()
    .replace(/[_./,-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function zoneList() {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [];
  }
}

const zoneCity = (tz) => tz.split('/').pop().replace(/_/g, ' ');

let index = null;
let options = null;

function build() {
  index = new Map();
  const add = (key, entry) => {
    const k = normalize(key);
    if (k && !index.has(k)) index.set(k, entry);
  };
  for (const c of CITIES) add(c.city, c);
  const byName = new Map(CITIES.map((c) => [c.city, c]));
  for (const [k, name] of Object.entries(SPELLINGS)) add(k, byName.get(name));
  for (const [k, name] of Object.entries(COUNTRIES)) add(k, byName.get(name));
  const zones = zoneList();
  for (const tz of zones) {
    add(tz, { city: zoneCity(tz), tz }); // "europe/lisbon"
    add(zoneCity(tz), { city: zoneCity(tz), tz }); // "lisbon"
  }

  const seen = new Set();
  options = [];
  for (const c of CITIES) {
    seen.add(normalize(c.city));
    options.push({ value: c.city, label: c.tz.replace(/_/g, ' ') });
  }
  for (const tz of zones) {
    const name = zoneCity(tz);
    if (seen.has(normalize(name)) || /^(GMT|UTC|Etc)/i.test(tz) || !tz.includes('/')) continue;
    seen.add(normalize(name));
    options.push({ value: name, label: tz.replace(/_/g, ' ') });
  }
}

/** Resolves typed text to { city, tz }, or null when nothing matches. */
export function resolveCity(text) {
  if (!index) build();
  const key = normalize(text);
  if (!key) return null;
  const direct = index.get(key);
  if (direct) return direct;
  // "Warsaw, Poland" or "Kyiv (Europe)": try the part before the comma or bracket.
  const head = normalize(String(text).split(/[,(]/)[0]);
  return (head && index.get(head)) || null;
}

/** Suggestions for the city box: [{ value: 'Kraków', label: 'Europe/Warsaw' }, …] */
export function cityOptions() {
  if (!options) build();
  return options;
}
