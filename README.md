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
- **Shared links**: a link opens with a banner showing the call in the reader's
  own time zone, with a countdown and an add-to-calendar button.
- **Clock-change warnings**: the US and Europe change clocks on different dates;
  the app warns three weeks ahead.

Each friend has a wake time, a bed time and an optional "works 9–17 on weekdays".
Those drive the scoring, tuned for casual calls with friends.

## Where data lives

The group is encoded in the URL hash (`#g=…`) and saved in `localStorage`.
*Copy group link* gives everyone the same group. Nothing is sent to a server.

## Run locally

```bash
npm start      # serves ./site on http://localhost:3000
npm test       # time-zone, scoring, URL and .ics tests (Node 20+)
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
  js/state.js      group encoding for links and localStorage
  js/invite.js     message, .ics, Google/Outlook/email links
  js/cities.js     city picker list
  js/app.js        UI
tests/logic.test.mjs
```
