# Session handover — 2026-05-17 (overnight)

> One day, many ships. Read top-down for "what should I look at first".
> Last commit: `e1a6666` deployed at 2026-05-17 02:57 UTC.

## TL;DR — what's live for the team to use Monday morning

| Surface | URL | Status |
|---|---|---|
| **Friday Consult v2** (default reply surface) | `gms.friday.mu/fad/?m=inbox` | Live, end-to-end |
| **TeamInbox** (Slack replacement, MVP) | `gms.friday.mu/fad/?m=inbox` (Team filter chip) | Live, MVP scope |
| **AI Draft review + Approve&Send + 5s undo + send preflight modal** | inside Friday Consult | Live |
| **Teaching cards** (👀 confirm/dismiss/conflict) | inside Friday Consult | Live with multi-property scope picker |
| **Smart search** across TeamInbox messages + DMs | `GET /api/team/search?q=...` (UI bar lands Day 4-5) | Live (backend); UI pending |

**Things to test in browser tomorrow** (priority order):
1. Open inbox → switch to a thread → Friday Consult is open by default → type a question → confirm AI responds + draft appears in DraftCard
2. Edit the draft inline → click Approve & Send → preflight modal opens → confirm channel + see confidence pill → click Confirm → 5s undo banner → wait for send (or cancel)
3. TeamInbox: switch to TeamInbox sidebar entry → confirm 13 channels show + you can post in `gm` → confirm message appears
4. Hover any TeamInbox message → 👀 ✅ 🙋 picker appears → click → reaction chip appears under message
5. Open a private channel (finance/admin/refunds/adjustments) as a non-member → should 403 (we haven't built the member-management UI yet; use the API to add members for now)

## What shipped — all commits 2026-05-17

### friday-gms (3 commits)

| Commit | What |
|---|---|
| `f8524b8` → cherry-picked as `a077d2e` on prod | brand-voice v2.0.1 schema support (fixes latent `voiceDescription` crash) |
| `71ced50` → `d1d3490` | guesty token-mint concurrency mutex (collapses parallel bursts to one) |
| `382ec36` → `2fb0f75` | breezeway 404 spam suppressed |
| `20cd4c8` → `3a5dd8e` | guesty 429 circuit breaker (6h cooldown) |
| `d1b0fb1` → `e3ae2e6` | consult.ts emits confidence on every response |

### friday-admin-dashboard / fad-design-os-v01-frontend (16+ commits)

| Commit | What |
|---|---|
| `c6df96c` | backend: 15 new `/api/inbox/*` proxy routes (drafts + consult + teachings) |
| `bb5d053` | frontend types + draftsClient + drafts surfaced in detail bundle |
| `579f7d9` | DraftPanel + FridayConsult LLM + teaching cards + compose wire |
| `2dd5a40` | 3 audit docs + inbox parity gap doc |
| `d2ba9e1` | Friday Consult as primary surface (embed editable draft) |
| `84b2603` | hotfix: stale onDraftUpdate ReferenceError + 4 pre-existing TS cleanups |
| `fd3cf39` | Phase 1: default consultOpen=true, hide reply compose, notes link |
| `363a2d4` | TeamInbox Day 1 (mig 052, channels + DMs + messages + members) |
| `779c71b` | TeamInbox smart search (mig 053 + Postgres FTS) |
| `400136b` | Phase 2: send preflight modal + confidence everywhere + multi-property teach |
| `a8a87ef` | Slack import scaffolding (mig 054 + worker + setup docs) |
| `ae2cf72` | Review tab + sent-draft timeline merge + date separators |
| `e1a6666` | TeamInbox reactions UI (👀 ✅ 🙋) |

### Docs

| Path | What |
|---|---|
| `docs/handover/audit-2026-05-17/02-gms-backend.md` | friday-gms backend audit (drafts pipeline, consult, learning loop) |
| `docs/handover/audit-2026-05-17/03-old-gms-ui.md` | OLD admin.friday.mu UI feature inventory |
| `docs/handover/audit-2026-05-17/04-fad-inbox.md` | FAD inbox current state |
| `docs/handover/2026-05-17-inbox-parity-gap.md` | synthesis + phased plan |
| `docs/handover/2026-05-17-friday-as-nervous-system.md` | architecture v0.1 (7-layer, multi-audience, autonomous, prompt injection) |
| `docs/handover/slack-import-setup.md` | Slack app creation walkthrough — needed when you create the bot |
| `docs/handover/2026-05-17-session-handover.md` | this doc |
| [Notion: TeamInbox Sprint — Scoping + Decisions](https://www.notion.so/36343ca884928180a38bcd2a433661df) | TeamInbox decisions + parked items + open questions |

## What's parked — needs your input to unblock

### 1. Slack history import (scaffolding done, waiting on bot token)

**What to do:** create a Slack app per `docs/handover/slack-import-setup.md` (~10 min). Drop the `xoxb-...` bot token in chat. I'll run the import (~5-30 min depending on workspace size); imports last 90 days of channel + DM history into TeamInbox with provenance + user/channel mapping. After verified, you cancel Slack.

### 2. Email integration (designed, deferred)

**What to do:** answer the 6 design questions in the previous session message — provider strategy (Gmail-only vs multi-provider), sync model (polling vs webhooks vs IMAP IDLE), OAuth flow (per-user vs service account), classification (heuristics vs LLM), threading strategy, storage scope (headers vs attachments).

OAuth client setup in GCP console blocks the Gmail API path entirely — needs your hands either way.

Recommend: answer in next session and we design + build together.

### 3. Architecture v0.1 open questions

§10 of `docs/handover/2026-05-17-friday-as-nervous-system.md` has 4 unanswered:
- Sprint 9 sequencing for Phase 3 tool calling
- Multi-audience unified outbound abstraction yes/no
- Team chat = TeamInbox (confirmed yes 2026-05-17) — can mark answered
- Tool calling scope — Ishant answered cross-module Day 1; can mark answered

So really 2 questions left:
1. Wait for Sprint 9 ship before Phase 3, or design Phase 3 on top of post-Sprint-9?
2. Future unified outbound abstraction or per-channel forever?

### 4. Private TeamInbox channel membership

Private channels (`finance`, `admin`, `refunds`, `adjustments`) start empty. Add members via:
```bash
curl -X POST https://gms.friday.mu/api/team/channels/<channel_uuid>/members \
  -H "Authorization: Bearer <admin_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"userId": "<user_uuid>", "role": "admin"}'
```
List channel UUIDs: `psql -c "SELECT id, channel_key FROM team_channels WHERE tenant_id = '00000000-0000-0000-0000-000000000001'"`. List user UUIDs: `psql -c "SELECT id, username FROM users WHERE tenant_id = '00000000-0000-0000-0000-000000000001'"`.

Or wait for the admin-UI I haven't built yet (next session).

## What I parked decisions on autonomously (flag if you disagree)

1. **Video conferencing**: dropped embedded SDK, sticking with Google Meet links only. Doc: see [TeamInbox Notion page](https://www.notion.so/36343ca884928180a38bcd2a433661df) → "Parked items".
2. **Channel set**: 13 seeded for FR — `gm`, `announce`, `random`, `ops`, `reservations`, `syndic`, `agency`, `marketing`, `photoshoot` (public), `finance`, `admin`, `refunds`, `adjustments` (private). NOT seeded: HR, per-property, expenses, roster, general (because we have `random` for misc + a future "Roster published" auto-message will post into `ops`).
3. **Reactions**: three semantic — 👀 "I'm looking", ✅ "Done", 🙋 "Need help". To add a 4th, update `VALID_REACTIONS` in backend + `REACTION_SET` in frontend together.
4. **Multi-property teaching scope picker v1**: comma-separated codes input (`LB-2, KS-5, MV-1`) instead of a checkbox picker against `/api/properties`. Live property list wiring is a follow-up.
5. **Pre-existing repo TS errors** caught by the pre-commit hook (FloorPlanTracingEditor touch type, TaskDetail user narrowing, design.ts formatMUR, useDisplayedUser email fallback). I fixed them as side-effect cleanups so commits could land. None were mine.
6. **Send preflight modal v1**: pending teachables count hardcoded 0 (the count would need a callback from FridayConsult up to InboxModule; minor lift; next session).
7. **Sent-draft attribution**: shows "Friday on {channel} · {time}". GMS returns `reviewed_by` field but our transformer doesn't capture it yet — would let us show "Mathias via Friday on WhatsApp". Small follow-up.

## What's still in the queue (next session priorities)

| # | What | Effort | Notes |
|---|---|---|---|
| 18 | Fold website-inbox into unified inbox list | 2-3h | Today website-inbox is a separate sidebar entry; fold renders as `source: website` filter chip |
| 29 | Email integration (after design pass) | 1-2 weeks | Blocked on you answering the 6 design questions |
| 32-partial | TeamInbox threading UI | 2-3h | `parent_message_id` schema ready; just UI work |
| 32-partial | TeamInbox file uploads + photoshoot quality bypass | 3-4h | Needs storage decision (local-disk vs S3); sharp for compression |
| — | Per-message read-receipt popover UI | 1h | Endpoints live; popover not built |
| — | Admin UI for TeamInbox channel membership | 2h | Adds/removes via UI vs current API curl |
| — | Architecture Phase 3 (tool calling) | post-Sprint-9 | gated on GMS Sprint 9 ship |

## Guesty 429 status

When session started: cooldown engaged until `2026-05-17 05:17 UTC`. At time of writing (`02:57 UTC`), still ~2h 20m until first mint attempt. Circuit breaker continues to refuse mints; logs show `[guesty/poller] tenant=... failed: Request failed with status code 429` every 15 min from fad-backend (each fails fast). friday-gms's circuit breaker is preventing token spam.

When cooldown clears (~05:17 UTC), one fresh mint attempt. If Guesty's daily quota recovered, we get a 24h valid token + normal polling resumes. If not, another 6h cooldown.

## Process state on prod (as of session end)

```
$ pm2 list
fad-backend   uptime: 10m   mem: 150MB   restarts: 69   status: online
friday-gms    uptime: 20m   mem: 104MB   restarts: 3203 status: online
```

Both stable. friday-gms's restart count is lifetime (not crash loop — uptime 20m confirms). No active errors beyond the expected Guesty 429s.

## How to verify in browser tomorrow

1. **Hard refresh** (Cmd+Shift+R) — version.json changed → chunk hashes are new
2. **Cookies/JWT** — should still work; no auth changes
3. **Check this URL**: `https://gms.friday.mu/version.json` — should show `e1a6666`

If anything looks weird, easiest debug: `pm2 logs fad-backend --lines 100` via SSH.

## End-of-session todo list state

```
✅ #1-10  earlier audits + friday-gms fixes
✅ #12-16 backend proxies + DraftPanel + Friday Consult wiring + compose
✅ #17    Review tab + WA banner + sent-draft timeline
⏸ #18    website-inbox fold (next session)
✅ #19    smoke + commit + push + deploy (multiple iterations)
✅ #20-22 teaching cards, embed-draft, hide-compose
✅ #23-25 Notion research + architecture doc + Phase 1
✅ #26    TeamInbox Day 1
✅ #27    video conferencing parked
✅ #28    TeamInbox smart search
⏸ #29    email integration (deferred — needs design pass)
✅ #30    Phase 2 guest inbox
✅ #31    Slack import scaffolding (parked on bot token)
✅ #32    TeamInbox reactions (threading + uploads deferred)
✅ #33    this doc
```

Sleep well; questions in the morning.
