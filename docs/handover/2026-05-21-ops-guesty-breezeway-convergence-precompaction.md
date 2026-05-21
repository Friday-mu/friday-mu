# Ops Guesty/Breezeway Convergence - Pre-Compaction Note

Date: 2026-05-21
Worktree: `/Users/judith/.codex/worktrees/7fa0/friday-admin-dashboard`
Target branch: `fad-rebuild`
Current head before this slice: `ba92b59`

## Locked Decisions

- FAD is the single org-wide client for Guesty. Ops, Inbox, Calendar, Finance, Properties, and Reservations must consume FAD cached tables/internal events, not call Guesty independently.
- Ops workflows should listen to FAD reservation/calendar/domain events and create tasks idempotently. Ops Settings should not become a second Guesty integration surface.
- Breezeway is being replaced. CSV remains the primary backfill source; Breezeway API is temporary validation/enrichment only.
- Breezeway provenance stays internal: `external_ref = breezeway:<Task ID>`, `bz_id`, `source_payload.provider = breezeway`. User-facing task source should become Imported/Internal/Syndic/Reservation/Reported/etc., not "Breezeway" as the primary operator label.
- API enrichment should import useful historical detail where available: assignments, photos, task tags, created/requested/finished-by objects, linked reservation, report URL, requirements/comments if endpoints expose them.
- No secrets in docs/logs. Keychain may be used by scripts only when explicitly invoked.

## Current Findings

- `/api/tasks` is live-backed and paginated; All Tasks works live with 4,483 imported tasks.
- Ops still has fixture/static islands: roster, settings workflow display, staff/user mapping, some notifications/pending counts, and property task activity.
- Guesty helper currently lives at `backend/src/website_inbox/guesty.js`, but is used by reservations, calendar, properties, inbox send, outbound send, and website inbox. This should move behind `backend/src/integrations/guesty`.
- Existing Guesty sync/cache pieces already exist: `guesty_reservations`, `guesty_calendar`, reservation webhook, calendar refresh on reservation webhook, listing/reservation pollers.
- Breezeway API validation sampled 50/50 tasks successfully, with no core field diffs against CSV. API-only/richer fields observed include report URLs, descriptions, assignments, photos, task tags, created-by objects, finished-by objects, and linked reservation.

## First Implementation Slice

1. Create a central Guesty integration module without breaking old imports.
2. Leave `backend/src/website_inbox/guesty.js` as a compatibility shim.
3. Add a Breezeway task enrichment preview script/service that reads existing imported tasks and reports what API enrichment would add before writing anything.
4. Keep apply/write mode out unless preview is reliable and idempotent.

## Next Slices

- Add task source/scope model: `task_type = field|office`, `scope = property|reservation|building|internal|project`, building code for GBH/Syndic, and user-facing source label separation.
- Wire HR staff/users into Ops roster and assignee filters.
- Wire Ops workflow engine to FAD internal reservation/calendar events with idempotent external refs.
- Add property activity task queries from `/api/tasks?property=<code>`.
- Replace client-side Ops insights with backend aggregate endpoints.
