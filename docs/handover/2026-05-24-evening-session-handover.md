# Evening session handover — 2026-05-24

> Session after the third `/compact` of the day. Eleven discrete
> deliverables shipped + verified on prod between ~16:00 and ~18:00
> MUR. This doc captures what landed, live state, and the open queue
> for the next session.

## Tree state

- **Branch:** `fad-rebuild`
- **Tree tip:** `0da4772d` (backlog docs)
- **Last frontend deploy:** `b5ed4df4` — `https://admin.friday.mu/version.json`
- **Last backend deploy:** `b5ed4df4` — pm2 `fad-backend` restart 284, migration 087 applied
- **Working tree:** clean (only `next-env.d.ts` + `tsconfig.tsbuildinfo` artifacts)

## What shipped this session (chronological)

| # | Item | Commit | One-liner |
|---|---|---|---|
| 1 | **T3.14** TeamInbox chat alignment | `4cdc4f46` | Own messages right with accent bg, teammates left with neutral; threads inherit. Latent `useJwtUserId` fixture-mapping bug fixed via new `useJwtRawUserId()` hook. Also fixed ScheduleCallDrawer's silently-broken self-exclusion as a side effect. |
| 2 | **T3.15 v0.1** French i18n toggle | `97230bd2` | i18next + react-i18next bundled as TS modules. EN/FR toggle in Settings → Appearance. Sidebar + Operations + Settings chrome localised. localStorage `fad:lang` persists per-device. First-load default respects browser preference. |
| 3 | **Calendar v0.4** | `013b3e12` | Native `<input type="date">` jump-to-date. Per-property lane stacking for overlapping reservations (greedy lane assigner + dynamic gridAutoRows). Rich hover task preview popover (title + dept + priority + due + assignees + description). |
| 4 | **FAB notifications fan-out** | `4de1b127` | New `notifyAdmins()` in `feedback.js` calls `realtime.notifyUsers()`, fanning out to: fad_notifications row + SSE banner + web push (VAPID) + Resend email. Targets every admin/director in the reporter's tenant, excluding the reporter. Slack continues via `notifySlack()` (env var still pending). |
| 5 | **FAD FAB catalog entry** | `02df90e` (catalog) | New `ui/fad-feedback-fab.md` in `Friday-mu/feature-catalog`. Documents the FAD-specific superset of `feedback-fab.md`: multi-tenant scoping, 4-channel triage, mobile scroll trick (`min-height:0` + `overscroll-behavior:contain`), ⌘⌘ shortcut, env-var matrix. README index updated. |
| 6 | **T3.15 v0.2** module headers | `72465726` | Inbox · Calendar · Properties · Reservations · HR all swap their `ModuleHeader` (title + subtitle + tab labels + primary CTAs) when language toggles. Inbox patched once (`72465726`) after a missed second `<ModuleHeader title="Inbox" />`. |
| 7 | **T3.15 v0.3** sub-pages + DB | `a2c57583` | Sidebar sub-page lookup switched to module-qualified keys (`subpage.<module>.<id>`) so `all` resolves to "Tous les logements" in Properties context and "Toutes les réservations" in Reservations. Migration 086 adds `users.preferred_language` (NULL / 'en' / 'fr') with CHECK constraint. `shapeUser()` exposes it; new `PATCH /api/auth/me/preferences` validates + writes. Frontend fires the PATCH on toggle (fire-and-forget) and `hydrateLanguageFromServer()` on mount seeds the lang from the DB when localStorage has no choice yet. |
| 8 | **T1.14 partial 1** — Channels + Reviews | `f71c6e38` | Analytics Channels tab reads `usePortfolio(30).channel_mix` + derives estimated commissions from industry defaults (Airbnb 15%, Booking 17%, VRBO 8%, Direct 0%) flagged "estimated" in the banner. Reviews tab reads `useLiveReviews()` and builds 6-month rolling rating trend + volume + per-channel breakdown locally. |
| 9 | **T1.14 partial 2** — Revenue + Team | `d33f5dc4` | Analytics Revenue tab now reads `usePortfolio(30)` + `usePortfolio(90)` for KPIs and re-buckets the daily revenue trend into monthly. Team tab aggregates per-assignee task workload from `useApiTasks` (last 30d) — total touches, completion rate, open overdue. Margin parked deliberately on Finance Phase 3 (gated on GL + owner payouts schema). |
| 10 | **T3.7 v0.1** website_inbox tenant | `b5ed4df4` | Migration 087 adds `tenant_id UUID NOT NULL DEFAULT FR_TENANT_ID` to `inbox_threads`, `inbox_events`, `inbox_guesty_jobs`, backfills 19 existing threads to FR. Replaces tenant-blind unique-email index with `(tenant_id, lower(guest_email))`. `threads.js` read paths scoped behind `attachIdentity` + `WHERE tenant_id = req.tenantId`: GET/PATCH/REPLY/MARK-PAID. Smoke-tested live: GET returns 19 threads to FR admin. |
| 11 | **T3.15 v0.4 partial** — Settings Appearance body | (same `b5ed4df4`) | Density / Sidebar / Dark mode / "Currently:" labels in the Settings → Appearance card now use `useT()` keys. Translations added under `settings.appearance.*` in both en.ts and fr.ts. |

Plus backlog doc commits along the way (`5e16b94f`, `4f2b7a24`, `689f6988`, `d6e9ad07`, `50ce073a`, `0da4772d`) — all captured in `docs/FAD_BACKLOG.md`.

## Action needed from Ishant

**Slack feedback webhook** — to enable the Slack leg of FAB notifications, add to `/var/www/fad-backend/.env`:

```
SLACK_FEEDBACK_WEBHOOK_URL=<the Slack incoming webhook URL>
```

then `pm2 restart fad-backend --update-env`. Without it the Slack leg silently no-ops; the other 3 channels (Email + Push + In-app) all fire fine on every report.

Per the no-secrets-in-chat rule I deliberately didn't paste a webhook URL value — Ishant has that in his credential index (Notion `36443ca8849281f7bba1ddc93698c5ee`) or can generate a fresh one from the Slack app config.

## Verified findings (with sources)

- **`useJwtUserId()` was silently mapping known emails through TASK_USERS** (e.g. `ishant@friday.mu` → `'u-ishant'`) instead of returning the raw DB UUID. Source: `frontend/src/app/fad/_components/usePermissions.ts:96-104`. Consumers were comparing the result against backend-issued UUIDs and silently never matching. Fixed by splitting `readJwtUserId()` (fixture-mapped, still used for context seeding) from `readRawJwtUserId()` (plain decode), and adding `useJwtRawUserId()` for backend-id matching. Both consumers switched (TeamInbox alignment + ScheduleCallDrawer self-exclusion).

- **TeamInbox modal scroll trick:** `.fad-modal-body` uses `overflow-y: auto + min-height: 0 + overscroll-behavior: contain`. Without `min-height: 0`, the flex child takes its content-size as a floor and overflow-y has no effect — the canonical "scrollable flex child" trap. Mirrors the FAD FAB modal pattern documented in the new catalog entry.

- **Multi-tenant default for website_inbox:** column gets `DEFAULT '00000000-0000-0000-0000-000000000001'::uuid` so pre-migration INSERT call sites that haven't been updated yet continue to land safely on the FR tenant — no behavior change for the FR-only deployment, hardening for the non-FR rollout once it lands.

## Live state — what to check

```bash
# Frontend version
curl -fsS https://admin.friday.mu/version.json
# → {"version":"b5ed4df4",...}

# Backend version
curl -fsS https://admin.friday.mu/api/version

# Migration 086 + 087 applied
ssh -i ~/.ssh/do_friday_admin root@admin.friday.mu \
  'sudo -u postgres psql -d friday_gms -c "\d users" | grep preferred_language'
ssh -i ~/.ssh/do_friday_admin root@admin.friday.mu \
  'sudo -u postgres psql -d friday_gms -c "\d inbox_threads" | grep tenant_id'

# Language preference round-trip
# (browser POSTs /api/auth/me/preferences with {preferred_language: 'fr'},
#  GET /api/auth/me returns preferred_language: 'fr')

# Tenant-scoped website inbox
# GET /api/inbox/website/threads as FR admin → 19 results
# (a non-FR tenant would see 0)
```

## Open queue (next session, priority order)

1. **T1.14 Margin tab** — gated on Finance Phase 3 (GL + owner payouts schema). Park; can't ship without that data.
2. **T3.15 v0.4 remaining** — module body strings (cards, table headers, empty states, form labels) inside Inbox / Calendar / Properties / Reservations / HR / Finance. Operations module body is the highest field-staff use. Biggest remaining payoff for full FR coverage. ~2-3h.
3. **T3.7 v0.2** — `webhook.js` + `ai_handoff.js` + `jobs.js` + drafts INSERT/UPDATE paths explicit tenant scoping. No-op for FR-only deployment (DEFAULT covers it); hardening for non-FR rollout.
4. **Calendar v0.5** (all 3 blocked):
   - Past-date pricing — ambiguous, needs Ishant's clarification (show historical published rate OR what guest paid?).
   - Block-dates feature — needs backend route POST `/api/calendar/block`.
   - Column alignment — couldn't reproduce, needs Ishant's screenshot.
5. **T3.10** — full ReservationDetail wiring (Folio breakdown · Payments backend · Accounting tab). ~2-3h.
6. **T3.9** — full PropertyDetail tabs (amenities · listings · per-property tasks + reservations · pricing calendar).
7. **T1.15** — TaskDetail Breezeway re-skin (full version). Blocked on Ishant's reference screenshot.
8. **Phase 4** — TaskDetail UI redesign (overlap with T1.15).
9. **Bug #5** Mary inbox flicker — needs Mary pair-debug, can't repro from idle.
10. **Bug #3** Franny notification routing — needs Franny re-test on current build.
11. **Bug #4** Ishant schedule + Breezeway cards — same screenshot dep as T1.15.

## Stopping conditions (still in force)

- 3 consecutive deploy failures → halt + write handover.
- Migration fails non-trivially → halt.
- Context > 80% → wrap up cleanly with a fresh handover.
- Production regression not diagnosable in 30 min → halt.

## Hard constraints (immutable, repeat for next session)

- Git author MUST be `Judith Friday <judith@friday.mu>` (hook-enforced).
- Type-check + build pass before every deploy. Roll back on regression.
- Verify on prod via Chrome MCP after every deploy.
- Mobile QA (375×812) after every UI commit — Chrome MCP `resize_window` is unreliable; needs a real phone.
- Multi-tenant safety: grep `tenant_id` filter after every new backend route.
- No `--no-verify`, no force-push, no skipping hooks.
- Don't edit Friday Website code (GMS edits OK if needed).
- Skip VPS backups (disk 69%).
- AI hierarchy: Gemini 3.5 Flash primary / Kimi 2.6 fallback / Sonnet 4.6 third. Image gen ONLY in 2 design surfaces on `gemini-3-pro-image-preview`.
- `fad-rebuild` canonical — never `fad-design-os-v01-*`.
- Protected migrations: `050_tasks.sql` through `054_*.sql`, `071_tasks_ops_lifecycle_reconcile.sql` — coordinate before touching.

## Where data lives

- **PROD DB:** Postgres on `admin.friday.mu` (`postgresql://friday:…@localhost:5432/friday_gms`)
- **FAD backend:** `/var/www/fad-backend/`, pm2 `fad-backend` port 3002, restart 284
- **GMS backend:** `/var/www/friday-gms/`, pm2 `friday-gms` port 3001, restart 3216
- **Frontend bundle:** `/var/www/fad/` — both `admin.friday.mu` and `gms.friday.mu` vhosts serve from here
- **SSH key:** `~/.ssh/do_friday_admin` → `root@admin.friday.mu`
- **Ishant's Chrome MCP browser:** "Working Browser" deviceId `c49e054a-1059-4f2c-87bf-41fc0e71b03c`
- **Feature catalog:** `/Users/judith/repos/feature-catalog` (mirror of `Friday-mu/feature-catalog`)
- **Backlog:** `docs/FAD_BACKLOG.md` (updated this session)
- **This handover:** `docs/handover/2026-05-24-evening-session-handover.md`

## Recovery (post-compact)

If you (future-self) come back to this and the auto-summary is fuzzy:

1. Read this file first.
2. `git log --oneline -20` and `curl https://admin.friday.mu/version.json + /api/version` to confirm live state.
3. Connect Chrome MCP to deviceId `c49e054a-1059-4f2c-87bf-41fc0e71b03c` (re-pair via `switch_browser` if absent).
4. Open queue above is priority-ordered. T3.15 v0.4 body strings is the most visible remaining payoff for full FR coverage.
5. Don't re-litigate any of the 11 shipped items — each has its commit + verification trail above.
