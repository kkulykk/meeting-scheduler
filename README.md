# Meeting Scheduler

Find a call time that works for 2 to 5 friends spread across time zones
(say New Orleans, Oxford, Warsaw, Vienna and Kyiv), then send the invite.
No accounts, no calendar access, no backend: a static site for GitHub Pages.

## Two ways to use it

**Ad hoc (default).** Open the page, type who is joining and the city each person is
in right now (with suggestions; accents optional, country names and time zones like
`Europe/Warsaw` work too), and plan. Nothing is saved anywhere: refresh and it is gone.

**Private group (optional).** Click *Save as private group…*, keep the password, and the
group is encrypted into a private link (`…/#p=<ciphertext>`). Bookmark it. Opening the
link asks for the password; without it the page shows nothing about the group.
Edits re-encrypt the group into a new link in the address bar, so bookmark again or
copy it after changing people. Old links keep opening the old version.

## Features

- **Right now**: each person's local time, offset from you, and whether they are
  free, at work or asleep.
- **Timeline**: one strip per person for the chosen day, coloured like their sky at
  each hour, with a status bar (free, early or late, at work, asleep). The bottom row
  scores the whole group. Click to pick a start time, or use the arrow keys.
- **Best times this week**: the top four slots, ranked so nobody is woken up and the
  worst-off person is as comfortable as possible.
- **Your call**: everyone's local time for the slot, plus *Copy message* (for WhatsApp
  or Telegram), *Copy time link*, *Download .ics*, *Google Calendar*, *Outlook*, *Email*.
- **Time links** (`#t=…`) open a focused invite screen: the call in the reader's own time
  with a countdown, *Add to calendar*, *Google*, *Outlook* and *Join call*, plus the other
  cities' local times. They carry the time, title, call link and **city names only, never
  people's names**, so friends need no password. *Plan a different time* opens the planner
  with those cities filled in.
- **Who's on the call** collapses to a one-line summary (private groups open collapsed).
- **24h / 12h** switch in the header.
- **Clock-change warnings**: the US and Europe change clocks on different dates; the
  app warns three weeks ahead.

## Security

| Piece | How it is protected |
|---|---|
| Ad-hoc plans | Kept in memory only. No cookies, no storage, nothing in the URL. Only the 12/24-hour preference is saved |
| Private group link | PBKDF2-SHA256 (600 000 iterations, random 128-bit salt) derives an AES-256-GCM key. Random IV per save; version and salt are authenticated, so any edit to a link is rejected. Padded to 256 bytes so length does not reveal name lengths |
| Where it lives | Only inside the link's `#` fragment, which browsers never send to any server. Nothing about the group is stored on the device |
| "Remember on this device" | Off by default. When ticked, only the key is kept, in IndexedDB as a **non-extractable** WebCrypto key. **Lock** forgets it |
| Password | The suggested one has about 99 bits of randomness (`k7qm-2xpd-9rtw-h4zc-m3va`); your own must be at least 14 characters. After 3 wrong tries the page makes you wait, doubling each time |
| Page hardening | Strict Content-Security-Policy (own scripts only, no inline script, no network calls), `no-referrer`, `noindex` plus `robots.txt`, refuses to run in frames, every decrypted field re-validated, all text rendered as text |

**Use it safely:** keep the password in a password manager, and give it to friends
through a different channel than the link.

**Honest limits**

- Someone with the private link *and* the password can read the group. That is the design.
- A leaked private link can be attacked offline, where the retry delay does not apply.
  The slow key derivation and a strong password are what stop that; with the generated
  password it is out of reach.
- The copied invite message lists names and times. Once pasted into a chat, email or
  calendar, that service stores it.
- A private repository keeps the code private, but GitHub Pages sites are public unless
  you have GitHub Enterprise Cloud. That is fine: the code holds no secrets.
- A forgotten password cannot be recovered. Recreate the group.

## Run locally

```bash
npm start      # serves ./site on http://localhost:3000
npm test       # time-zone, scoring, encryption, link and .ics tests (Node 20+)
```

## Deploy to GitHub Pages

1. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Merge to `main`. The workflow in `.github/workflows/deploy.yml` runs the tests and
   publishes `site/` to `https://<user>.github.io/meeting-scheduler/`.

## Layout

```
site/
  index.html
  css/app.css
  js/time.js       Intl-based zone math, DST detection, formatting
  js/schedule.js   availability and slot scoring
  js/state.js      people model, validation, time links
  js/crypto.js     PBKDF2 + AES-GCM, password generation
  js/vault.js      optional remembered key, retry delay
  js/invite.js     message, .ics, Google/Outlook/email links
  js/cities.js     city lookup: curated cities, spellings, countries, browser zones
  js/app.js        UI
tests/
```
