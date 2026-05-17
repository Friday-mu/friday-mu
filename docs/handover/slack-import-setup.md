# Slack → TeamInbox one-time history backfill — setup guide

> Status: **scaffolding shipped, waiting on Ishant to create the Slack app + share the bot token.**
> Once you do, importing the last 90 days of Slack history into TeamInbox is a single API call.

## Why we built this

After TeamInbox replaces Slack (Day 1 shipped 2026-05-17), the team loses access to historical context — "what did we decide about LB-2 last month", "when did Mathias mention the AC issue", etc. This worker imports your Slack workspace's message history into TeamInbox so that context survives the cut-over. After the import runs successfully, you cancel Slack and the team's historical knowledge stays in FAD.

## What Ishant needs to do (one-time, ~10 minutes)

### 1. Create a Slack app

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**
2. Name it `Friday Admin Importer` (or similar)
3. Pick the **Friday Retreats** Slack workspace as the destination
4. Click **Create App**

### 2. Add OAuth scopes

In the left sidebar, **OAuth & Permissions** → scroll to **Scopes** → **Bot Token Scopes**.

Add these scopes (paste each one, click Add):

```
channels:history
channels:read
groups:history
groups:read
im:history
im:read
mpim:history
mpim:read
users:read
users:read.email
files:read
```

(Last one is for attachment metadata; v1 doesn't download files but records their URLs in message meta so we can mirror later.)

### 3. Install to workspace

Still on **OAuth & Permissions**, click **Install to Workspace** at the top. Slack will ask for approval for the scopes you just added. Click **Allow**.

### 4. Copy the bot token

After install, you'll see **Bot User OAuth Token** — starts with `xoxb-...`. Copy it.

### 5. Share the token with me

Drop it in our chat. I'll plug it in via:

```bash
curl -X POST https://gms.friday.mu/api/team/slack-import/start \
  -H "Authorization: Bearer <your-admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"botToken": "xoxb-...", "importedSince": "2026-02-17T00:00:00Z"}'
```

`importedSince` is optional — if omitted, imports everything Slack lets us see (free-tier Slack caps at 90 days of history; paid tiers see further back).

The endpoint returns immediately with `{ok: true, message: ...}` — the actual import runs async in the background (takes ~5-30 min depending on workspace size).

## Watching progress

Poll the runs endpoint:

```bash
curl https://gms.friday.mu/api/team/slack-import/runs \
  -H "Authorization: Bearer <your-admin-jwt>"
```

Each row shows `status` (`running` | `succeeded` | `failed`), `messages_imported`, `users_mapped` (Slack users matched to FAD accounts by email), `users_unmapped` (Slack users without a FAD account — their messages still come through but with the Slack display name as author, no clickable user link), plus per-step counts.

## What gets imported

| Slack content | TeamInbox destination |
|---|---|
| Public channel messages | matching `team_channels` (by name, with manual remap fallback) |
| Private channel messages | matching `team_channels` (private visibility preserved) |
| Direct messages (1:1 + group) | `team_dms` (only if every participant maps to a FAD user) |
| User attribution | resolved by Slack email → FAD email match |
| Thread structure | preserved in `meta.slack_thread_ts` (v1 imports flat; v2 reconstructs threads) |
| File attachments | metadata only (URLs in meta); v2 mirrors the actual files |
| Reactions | NOT in v1 (Slack's emoji don't map to our 3-emoji set) |

## Channel name → FAD channel auto-mapping

The worker auto-maps these renames; everything else needs manual review (auto-skipped until the admin overrides):

| Slack name | FAD channel |
|---|---|
| `#frgm` | `gm` |
| `#general` | `random` |
| `#guest-services` | `ops` |
| Exact name matches (e.g. `#ops`, `#finance`, `#marketing`) | same name |

For channels we don't recognise, the worker records them in `slack_channel_map` with `skip=TRUE`. Operator can override before re-running the import by directly editing the table — or we can build an admin UI for it (parked).

## Schema

Migration `054_slack_import.sql` adds:
- `slack_user_map` — Slack user ID ↔ FAD user ID
- `slack_channel_map` — Slack channel ID ↔ FAD channel ID + skip flag
- `slack_import_runs` — one row per import attempt
- Provenance columns on `team_channel_messages` + `team_dm_messages`: `slack_source_message_id`, `slack_source_channel_id`, `slack_source_user_id`
- Unique indexes preventing re-import duplicates

## Safety

- Re-imports are idempotent thanks to the unique-on-(slack_source_message_id, slack_source_channel_id) index. Re-running after a partial failure won't double-insert.
- The bot token is NOT persisted server-side. Each import run takes it as a request body; if you want to re-run, paste it again.
- If you accidentally trigger the import twice in parallel, only the first row gets created — second one's INSERT will conflict. Wait for the first to complete.

## What's not in v1

- Threads as TeamInbox threads (Slack threads are flat in v1; data preserved in meta for v2 reconstruction)
- File attachment download / mirror (URLs in meta; download later)
- Reactions
- Admin UI for the channel mapping (currently you'd edit `slack_channel_map` directly if the auto-match is wrong)
- Incremental sync after the one-time import (not the goal — we cancel Slack after migration)

## Cancellation plan

After the import succeeds + the team has been on TeamInbox for a week without issues:

1. Cancel the Slack paid tier (you'd switch to free which keeps the workspace alive with 90-day history limit, OR fully cancel)
2. Keep the imported data — TeamInbox owns it now
3. Revoke the bot token from the Slack app's OAuth settings

The provenance columns (`slack_source_*`) stay populated so we can always prove "this message came from Slack on 2026-04-22" if needed for audit.
