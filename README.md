# Meeting Scheduler

**Find a time that works for everyone, wherever they are.**

Meeting Scheduler helps small groups of friends spread across time zones agree on a
call time in a minute, without sign-ups, without connecting calendars, and without
the usual "is that your time or mine?" back-and-forth.

**Try it:** https://kkulykk.github.io/meeting-scheduler/

---

## The problem

When friends live in New Orleans, London, Warsaw, Vienna and Kyiv, the gap between
the furthest two is eight hours. Someone is always about to go to bed, still at work,
or not awake yet. Working that out by hand in a group chat takes several rounds of
messages, and daylight-saving changes, which happen on different dates in the US and
Europe, quietly break calls that used to work.

## How it works

1. **Add who's joining.** Type each person's name and the city they're in right now.
   Two to five people.
2. **Pick a time.** See everyone's day side by side, coloured like their sky. The app
   suggests the best times this week, the ones where nobody is woken up or stuck at work.
3. **Send it.** Copy a ready-made message for WhatsApp or Telegram, or share a link that
   opens in each friend's own time zone, with a one-tap *Add to calendar*.

## What friends see

The link you send opens a clean invite: the call in *their* local time, a countdown,
buttons for Google Calendar, Outlook or any calendar app, a *Join call* button if you
added one, and what time it will be for everyone else. No account and no password
needed.

## Highlights

- **No sign-up, nothing to install.** It works in any browser, on phone or laptop.
- **No calendar access.** Nobody has to connect or share their calendar.
- **Smart suggestions.** Respects each person's wake-up time, bedtime and working hours.
- **Clock-change warnings.** Alerts you when the US and Europe switch clocks on
  different dates, so recurring calls don't drift.
- **Type any city.** Hundreds of cities, with or without accents, plus country names.
- **Your format.** Switch between 24-hour and 12-hour times.

## Private groups for the people you call often

Plain planning saves nothing. Close the page and it's gone.

For a group you talk to regularly, you can **save it as a private group** behind a
password. You get a private link to bookmark. Anyone who opens it without the password
sees nothing about the group.

## Privacy, in plain words

- **We never see your data.** There are no accounts and no database, and nothing about
  your friends is sent to a server.
- **Planning is temporary.** What you type stays on your screen and disappears when you
  close or refresh the page.
- **Private groups are locked with your password.** The group is encrypted inside its
  own link with strong, industry-standard encryption. Without the password, the link
  is unreadable. The password is never stored anywhere, so keep it in a password manager.
- **Invites stay discreet.** Invite links contain only the time, the call details and
  city names, never people's names.

Good habits: share the password separately from the link, and only tick
*Remember on this device* on your own phone or computer.

## Questions

**Does everyone need to install something or sign up?**
No. Everyone just opens a link.

**What if someone is travelling?**
Enter the city they'll be in. Times are always based on where each person is *right now*.

**What if I forget the password for a private group?**
It can't be recovered, by design. Create the group again; it takes a minute.

**How many people can join?**
Two to five per plan.

**Does it cost anything?**
No.

---

## Running it yourself

Meeting Scheduler is a static website with no server. To publish your own copy:
fork this repository, then in **Settings → Pages** set the source to **GitHub Actions**.
Every change merged to `main` is tested and published automatically.

To try it locally:

```bash
npm start
```

Run the tests with:

```bash
npm test
```

Developer notes on how the timing, suggestions and encryption work live alongside the
code in the `site/js/` folder.
