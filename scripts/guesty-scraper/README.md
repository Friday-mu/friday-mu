# Guesty scraper — Layer-3 fallback

When the Guesty Open API is rate-limited (5 OAuth mints / 24h hard
ceiling) and webhooks aren't configured / aren't flowing, this
scraper logs into Guesty's web UI from your Mac and ingests messages
the same way a webhook would.

## When to run

- The 5-min poller is failing with 429s and we have no live token.
- Guesty webhooks are not configured, or are configured but not firing.
- You need a backfill of messages that landed in Guesty during a
  rate-limit window.

Otherwise let layers 1 (poller) and 2 (webhook receiver) handle it.

## Setup (one-time, on your Mac)

```bash
cd scripts/guesty-scraper
npm install
npx playwright install chromium

# Interactive login — a real Chromium window opens. Log in via Google
# SSO (ishant@friday.mu), navigate to the inbox to confirm it loads,
# then close the window. Your session is now persisted to .profile/.
npm run auth
```

Optional, for vision-based extraction when Guesty changes their DOM:

```bash
brew install peekaboo            # https://peekaboo.dev (macOS only)
```

## Run

```bash
npm run scrape                   # normal run, posts to admin.friday.mu
npm run scrape:dry               # extract + log, but don't POST
npm run scrape:peek              # use peekaboo if DOM extraction fails
HEADFUL=1 npm run scrape         # show the browser (debug)
```

Environment overrides:

```bash
FAD_WEBHOOK_URL=https://...      # default: admin.friday.mu
FAD_WEBHOOK_SECRET=...           # default: matches prod
GUESTY_INBOX_URL=https://...     # default: app.guesty.com/communication/inbox
MAX_CONVERSATIONS=50             # cap per run
```

## How it works

1. Launches Chromium with the persisted profile in `.profile/`.
2. Navigates to the Guesty unified inbox.
3. Extracts the conversation list via DOM selectors.
4. For each conversation that's unread OR new since the last run,
   opens the thread and extracts visible messages.
5. Synthesises a Guesty-shaped event for each new message and POSTs
   it to fad-backend's existing webhook endpoint with a valid HMAC
   signature.
6. Server-side dedup via `UNIQUE(guesty_message_id)` makes the run
   safe to repeat.

Message ids are stable hashes of `(conversationId, timestamp, body)`
so a re-scrape posts the same id and gets deduped. Real Guesty webhook
events will use their canonical `_id`, which won't collide with scraper
ids — so the two ingestion paths never fight each other.

## State

`.state.json` tracks the most recent timestamp seen per conversation.
Delete it to force a full backfill on the next run.

## Cron / launchd

Sample launchd plist (`~/Library/LaunchAgents/com.friday.guesty-scraper.plist`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.friday.guesty-scraper</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-lc</string>
    <string>cd /Users/judith/repos/friday-admin-dashboard/scripts/guesty-scraper &amp;&amp; npm run scrape &gt;&gt; ~/Library/Logs/guesty-scraper.log 2&gt;&amp;1</string>
  </array>
  <key>StartInterval</key><integer>900</integer>   <!-- 15 min -->
  <key>RunAtLoad</key><false/>
</dict>
</plist>
```

Load: `launchctl load ~/Library/LaunchAgents/com.friday.guesty-scraper.plist`
Unload: `launchctl unload ...` (run only when needed; don't leave on by default).

## Limitations / gotchas

- **macOS only** because peekaboo is Mac-only. Without peekaboo the
  scraper still works but can't recover from DOM redesigns.
- **DOM selectors will rot.** Inspect with `PWDEBUG=1 npm run scrape`
  when Guesty ships a redesign and update `SELECTORS` in `scrape.mjs`.
- **Headless can break Google SSO** if Google enforces additional
  challenges on a fresh persistent profile. If `npm run auth` flow
  fails, run `HEADFUL=1 npm run scrape` once to complete any extra
  verification, then try headless again.
- **Don't run while polling is healthy.** You'll double-ingest
  (server dedup handles it but it's wasted work).
- **Outbound messages.** The scraper picks up outbound (host→guest)
  too — useful for backfilling actions taken from Guesty's UI by ops
  team members. Disable by setting `MAX_CONVERSATIONS=0` if not wanted.

## Failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| `No saved session` | Profile dir missing | `npm run auth` |
| Redirects to login | Session cookie expired | `npm run auth` |
| `found 0 conversations` | DOM selectors stale | Update `SELECTORS`, or run with `--use-peekaboo` |
| HTTP 401 from webhook | `FAD_WEBHOOK_SECRET` mismatch | Sync with prod `.env` |
| HTTP 400 expected raw body | Receiver is using `express.json()` | (should not happen — receiver mounts `express.raw`) |
