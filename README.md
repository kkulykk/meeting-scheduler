# Common Hour

Find a call time that works for 2 to 5 friends spread across time zones
(say New Orleans, Oxford, Warsaw, Vienna and Kyiv), then send the invite.
No accounts, no calendar access, no backend: it is a static site for GitHub Pages.

## What it does

- **Right now**: each friend's local time, offset from you, and whether they are
  free, at work or asleep.
- **Timeline**: one strip per friend for the chosen day, coloured like their sky
  at each hour, with a status bar underneath (free, early or late, at work, asleep).
  The bottom row scores the whole group. Click anywhere to pick a start time,
  or use the arrow keys.
- **Best times this week**: the top four slots, ranked so nobody is woken up and
  the worst-off person is as comfortable as possible.
- **Your call**: everyone's local time for the chosen slot, plus
  *Copy message* (paste into WhatsApp or Telegram), *Copy link*, *Download .ics*,
  *Google Calendar*, *Outlook* and *Email*.
- **Shared links**: links are encrypted; after entering the group passphrase, a link opens with a banner showing the call in the reader's
  own time zone, with a countdown and an add-to-calendar button.
- **Clock-change warnings**: the US and Europe change clocks on different dates;
  the app warns three weeks ahead.

Each friend has a wake time, a bed time and an optional "works 9–17 on weekdays".
Those drive the scoring, tuned for casual calls with friends.

## Security

Your friends' names, cities and call details are **end-to-end encrypted with a group
passphrase**. Nothing about the group is ever sent to a server, so there is nothing
to find by guessing URLs.

| Piece | How it is protected |
|---|---|
| Key | PBKDF2-SHA256, 600 000 iterations, random 128-bit salt per group, giving an AES-256 key |
| Data in links | AES-256-GCM, random IV per link; the version and salt are authenticated, so any edit to a link is rejected. Padded to 256 bytes, so link length does not reveal name lengths |
| Links | `#e=<ciphertext>` sits in the URL fragment, which browsers never send to the server. The app strips it from the address bar as soon as it opens |
| On your device | The group is saved only as ciphertext. With *Remember on this device*, the key is stored in IndexedDB as a **non-extractable** WebCrypto key; scripts can use it but cannot read it out. **Lock** forgets it |
| Passphrase | The suggested one has about 99 bits of randomness (`k7qm-2xpd-9rtw-h4zc-m3va`); your own must be at least 14 characters. After 3 wrong tries the page makes you wait, doubling each time |
| Page hardening | Strict Content-Security-Policy (only own scripts, no inline script, no network calls), `no-referrer`, `noindex` plus `robots.txt`, refuses to run inside frames, every decrypted field re-validated, all text rendered as text (no HTML injection) |

**How to use it safely**

1. Keep the generated passphrase in a password manager.
2. Give it to friends **once, through a different channel** than the links
   (say it on a call, or send it in a different app).
3. On shared computers, untick *Remember on this device*.

**Honest limits**

- Someone who has a link *and* the passphrase can read the group. That is the design.
- A leaked link can be attacked offline, where the page's retry delay does not apply.
  The slow key derivation plus a strong passphrase is what stops that; with the
  generated passphrase, guessing is out of reach.
- Whatever you paste into a chat, email or Google/Outlook Calendar (the copied
  message lists names and times) is then stored by that service.
- A private repository keeps the *code* private, but GitHub Pages sites are public
  unless you have GitHub Enterprise Cloud. That is fine here: the code holds no
  secrets, and the data is protected by encryption, not by hiding the page.
- Forgot the passphrase? It cannot be recovered. Create a new group.

## Run locally

```bash
npm start      # serves ./site on http://localhost:3000
npm test       # time-zone, scoring, encryption and .ics tests (Node 20+)
```

## Deploy to GitHub Pages

1. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Merge to `main`. The workflow in `.github/workflows/deploy.yml` runs the tests
   and publishes `site/` to `https://<user>.github.io/meeting-scheduler/`.

## Layout

```
site/
  index.html
  css/app.css
  js/time.js       Intl-based zone math, DST detection, formatting
  js/schedule.js   availability and slot scoring
  js/state.js      group model and validation
  js/crypto.js     PBKDF2 + AES-GCM, passphrase generation
  js/vault.js      encrypted storage, non-extractable key, retry delay
  js/invite.js     message, .ics, Google/Outlook/email links
  js/cities.js     city picker list
  js/app.js        UI
tests/logic.test.mjs
tests/crypto.test.mjs
```
