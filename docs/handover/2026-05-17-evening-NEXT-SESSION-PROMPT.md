# ACP Brief: FAD next session — post-ownership split, focused on non-AI surface

You're picking up the FAD codebase after the 2026-05-17 afternoon session.
Today we did **a lot of FridayConsult / inbox-compose iteration**, **shipped
3 layers of Guesty rate-limit mitigation**, **coordinated with the GMS
Sprint 9 lead**, and **landed an ownership split** that scopes this thread
down.

## The ownership split (read first, it changes what you touch)

| Owner | Scope |
|---|---|
| **GMS sprint (Judith via web UI Claude)** | `friday-gms/src/routes/consult.ts`, `friday-gms/src/services/draft-generator.ts`, KB loading, summarizer prompts, the merged 'Friday brain' service planned for Sprint 10, tool-calling unblock (post `gms-v6.33.0-sprint9-final`, ~2026-05-27) |
| **FAD (you)** | Everything else — module wiring, integrations, ops workflows, UI iteration based on operator feedback |

**Do NOT touch on FAD side until Sprint 10 merge lands:**

- FC's KB loading, summary prompt variants, or service-specific composer paths
- `friday-gms/src/routes/consult.ts` for Phase 3 tool calling
- `friday-gms/src/services/draft-generator.ts`
- The 'Full thread' client-side prepend chip in FC stays as-is; it gets removed
  when the merged service lands with proper budget management

You SHOULD continue fixing:
- Operator-feedback bugs (cosmetic UI, layout, dead buttons) — those don't
  touch the brain
- Wiring fixture modules to live data
- Cross-module workflows
- Build-queue items from the handover (R, P, C, F, +, K, I — see below)

If something feels like it crosses into AI/KB territory, post a note for
the GMS thread instead of fixing.

## Read these first (in order)

1. `docs/handover/2026-05-18-session-handover.md` — original 2-day baseline
2. `docs/handover/2026-05-19-NEXT-SESSION-PROMPT.md` — the 2026-05-17 morning brief
3. **This file** — the evening pivot
4. `memory/fad_gms_dependency_map.md` — backend topology
5. Repo `CLAUDE.md` + global `~/.claude/CLAUDE.md`

## Working directory

```bash
cd /Users/judith/repos/friday-admin-dashboard/.claude/worktrees/fad-design-os
git fetch origin && git status
git log --oneline -20
```

Branch `fad-design-os-v01-frontend`. HEAD after this session: `be202ef`
(or newer if you ran a later session). Migrations 052-056 applied on prod.

## Production state

- **URL:** `https://admin.friday.mu` (FAD) + `https://gms.friday.mu` (alias)
- **fad-backend** port 3002 (pid varies, see `pm2 list`)
- **friday-gms** port 3001 (running, restart count ~3205, uptime stable)
- **Guesty OAuth token endpoint** — still 429'd as of session end. Cooldown
  recovers on 24h rolling window since yesterday's mint burst.
- **Guesty webhook subscription** — NOT yet registered. Vince P. at Guesty
  support replied with a partial answer (UI is read-only, use API). We replied
  asking for create endpoint + rate-limit bump. Awaiting his next response.
- **Layer 3 scraper** — Ishant ran `./scripts/guesty-scraper/go.sh` on his
  Mac. Verify it's posting messages by checking the `messages` table for new
  inbound rows after the run.

## What shipped today (2026-05-17 afternoon + evening)

Evening additions (post 13:00 UTC), newest-first:

`1d70cc4` — feat(reservations): wire AllReservations + Overview to live /api/reservations
`c09d087` — feat(fc): auto-fit height + chips trail last message + compact spacing
`14a5345` — fix(fc): compact teaching cards (fcard frame)
`0d45a3f` — feat(fc): resizable FC height with localStorage + compact tool cards
`ad69281` — fix(fc): FAD design tokens on draft cards + Awaiting-reply chip + remove broken Polish
`1073d8d` — fix(inbox): strip auto-summary surface + dead Polish handler
`32a8874` — fix(inbox): drop subtitle + conversation title; meta strip only
`6f84715` — fix(inbox): summary collapsed by default + remove dead Translate
`b329af1` — feat(fc): drafts as first-class chat messages, stack like tool calls
`180cfef` — fix(inbox): remove FC header line + remove +Compose button

Afternoon batch:

Newest-first. Every commit pushed + deployed to prod.

| Commit | Subject |
|---|---|
| `be202ef` | fix(guesty): coordinate mint-quota meta with GMS hotfix 9a091da |
| `25a0256` | fix(inbox): compact FC + truly one-line summary + sticky-bottom FC |
| `fb822b0` | feat(inbox): website-thread detail route (Phase 1.5) |
| `f1717fd` | feat(inbox): website-inbox fold into unified Inbox (Phase 1) |
| `3893173` | fix(fc): draft renders inline in transcript again |
| `428ffcd` | feat(fc): past sessions panel + full-thread context toggle |
| `6f84715` | fix(inbox): summary collapsed by default + remove dead Translate |
| `f61979c` | fix(inbox): summary collapses on short viewports |
| `ce74407` | fix(inbox): plain Enter for Ask Friday only; guest send is Cmd/Ctrl+Enter |
| `4aa24f8` | fix(inbox): @Mention button + Schedule call persists real message |
| `1f2838d` | refactor(send): route FC + TeamInbox through /api/outbound/send |
| `737d83d` | feat(settings): Change password from Settings → Account |
| `3d95bf0` | feat(guesty): R1 shared token cache between backends |
| `c73e8ea` | fix(webhook): Guesty Svix signing + correct field paths |
| `20daac0` | fix(backend): bypass express.json for Guesty webhook |
| `7032ad2` | fix(inbox): hide EmbeddedDraftCard until there's draft or chat |
| `a17425a` | feat(inbox): FridayConsult is sole compose surface |
| `5e97ca0` | feat(scraper): Layer-3 Guesty inbox fallback (Playwright + peekaboo) |
| `d748019` | feat(scraper): one-shot register-webhook script |
| `9999b28` | fix(hr): staff edit save + Mary promoted to director |

**Also patched on prod (no FAD commit; in-prod GMS edit):**
- `/var/www/friday-gms/src/routes/consult.ts` LIMIT 10 → 20 (Sprint 9 lead
  greenlit). Backed up at `consult.ts.bak.2026-05-17`. Rebuilt + restarted.

## Build queue (FAD-side, post-split, prioritized)

| # | What | Effort | Blocker | Notes |
|---|---|---|---|---|
| **R** | ~~Reservations → live~~ Phase 1 DONE (`1d70cc4`): AllReservationsPage + OverviewPage use `/api/reservations` via `reservationsClient.ts` with fixture fallback. | — | — | Phase 2 remaining: CalendarModule + CreateReservationDrawer still on fixtures. |
| **P** | Properties → consolidate live wiring | 1h | None | Design module already triggers `hydrateDesignTopLevel()` which mutates `FIXTURE_PROPERTIES` from `/api/design/properties`. Properties module piggybacks but implicit — wire `useHydrateDesignTopLevel()` into Properties module first page OR build dedicated `propertiesClient.ts` against `/api/properties` (Guesty listings cache). Decide which dataset (Design metadata vs Guesty channel info). |
| **C** | Calendar → live booking data | 2-3h | After R Phase 2 | Reuses `useLiveReservations()` from `reservationsClient.ts`. |
| **R2** | Reservations Phase 2: CalendarModule + CreateReservationDrawer | 1-2h | None | Calendar swaps `RESERVATIONS` → `useLiveReservations()`. CreateReservationDrawer currently fixture-push; needs `POST /api/reservations` backend route. |
| **+** | ~~+ Compose new-conversation flow~~ | — | KILLED 2026-05-17 evening — new conversations now flow through FC ("Friday, compose a message to <guest> about X"). The +Compose button is removed from the inbox UI. |
| **K** | TeamInbox per-message read-receipt popover | 1h | None | Handover queue item K |
| **I** | Cleanup job for orphaned attachments | 1h | None | Handover queue item I |
| **F** | Finance Phase 3 — GL + QuickBooks | days | May-Jun schedule | Big project, on roadmap |
| **W2** | Website-inbox Phase 2 — AI auto-classify on arrival | 1-2h | None (now that fold landed) | guest/owner/other classification |
| **W3** | Website-inbox Phase 3 — inline 'Create reservation' CTA | half-day | None | Hooks into Guesty POST /reservations |
| **M-bugs** | Mary's operator feedback (rolling) | varies | None | Pull from `feedback` table, fix, ship |

**Recommendation: R + P first**, then C. Highest ops-team value, simple
wiring, and the data is already cached locally so even with Guesty 429'd
the UI surfaces what's in the DB.

## Open coordination questions (with answers when known)

| Q | Status |
|---|---|
| Vince — webhook create endpoint + rate-limit bump | Reply sent. Awaiting his next response. |
| Stale `judiths-mac-mini` webhook deletion | Will request in next Vince reply once new endpoint is verified flowing |
| Unknown `stz-api.weareinto.ai/webhook` | Not ours, don't know whose. Ask team — don't delete. |
| GMS Sprint 9 ETA | Sprint 9 lead says ~2026-05-27 best case, ~2026-05-29 if multi-surface needs more work. Tool-calling unlocks then. |
| Draft-generator + consult merge | Sprint 10 (post 2026-05-26). FAD stays clear of KB/prompt work until then. |
| consult.ts cap 10→20 | DONE in prod. |
| GBH-C6 + multi-stay summarizer regression | Sprint 9 lead is filing both. Not a FAD-side fix. |
| **Stop auto-summary generation in GMS** | FAD removed the auto-summary display surface (no chip + no panel, no UI consumer). GMS should stop generating `conversation_summary` on every message — pure compute waste now. Operators request summary on demand via FC chat ('Summarise this thread'). Flag for Sprint 10 cleanup or hotfix. |

## Test credentials (unchanged)

| User | Email | Password | must_change |
|---|---|---|---|
| Ishant | ishant@friday.mu | `2027isouryear!` | FALSE |
| Mathias | mathias@friday.mu | `Friday2026!` | TRUE |
| Franny | franny@friday.mu | `Friday2026!` | TRUE |
| Mary | mary@friday.mu | `Friday2026!` (or her new password if she changed) | TRUE→FALSE if changed |
| Bryan | bryan@friday.mu | `Friday2026!` | TRUE |
| Catherine | catherine@friday.mu | `Friday2026!` | TRUE |

Mary is now `director` per `usePermissions.ts` mapping (promoted today to
help test). DB role also flipped to `director`.

## Anti-goals (preserved + new)

- **Don't touch friday-gms consult.ts / draft-generator.ts / KB loading**
  until Sprint 10 merge. Owned by the GMS sprint lead.
- **Don't fork the call sites further** — no new service-specific KB-loading
  paths, no new summary-prompt variants, no new client-side prepend tricks.
- **Don't touch `main`** — direct push to `fad-design-os-v01-frontend`.
- **Don't render duplicate compose surfaces** — FC is the single typing
  surface; inbox-compose is permanently dead.
- **Don't compare `currentUserId` (from `usePermissions()`) against DB UUIDs.**
  Use `useJwtUserId()` for matching against backend data.
- **Don't fight the operator on Friday Consult auto-open.** It always renders
  when a thread is selected; X close is a no-op.
- **Don't run sustained browser automation against Guesty's UI.** The Layer 3
  scraper is a stopgap; long-term answer is webhooks.

## Style (unchanged)

- Terse. Push back with reasoning when Ishant is wrong.
- Direct push to `fad-design-os-v01-frontend`. No PRs.
- Commits authored "Judith Friday" with
  `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.
- Always `git fetch origin` before assessing repo state.
- Verify before declaring done — Playwright the inbox + log in as a non-admin
  role to confirm RBAC.

## Deploy flow (unchanged)

```bash
# Frontend
cd frontend && npm run deploy

# Backend
rsync -avz -e "ssh -i $HOME/.ssh/do_friday_admin" backend/src/ root@gms.friday.mu:/var/www/fad-backend/src/
rsync -avz -e "ssh -i $HOME/.ssh/do_friday_admin" backend/server.js root@gms.friday.mu:/var/www/fad-backend/
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu 'pm2 restart fad-backend'
```

**Password reset gotcha:** never inline a bcrypt hash in a bash heredoc/SQL
command — bash expands `$2` and `$10` from the hash prefix and mangles it.
Use a scp'd .sql file.

## Quick verifications to run at start

```bash
# 1. Confirm prod is on the expected version
curl -s https://admin.friday.mu/version.json

# 2. Confirm pm2 processes are healthy
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu 'pm2 list'

# 3. Check if new inbound messages landed since session end (Layer 3
#    scraper or Vince's webhook unblock should produce these)
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu \
  'set -a && . /var/www/fad-backend/.env && set +a && psql "$DATABASE_URL" -c "SELECT MAX(created_at) FROM messages WHERE direction='"'"'inbound'"'"';"'

# 4. Check Mary's feedback table for new bugs
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu \
  'set -a && . /var/www/fad-backend/.env && set +a && psql "$DATABASE_URL" -c "SELECT created_at AT TIME ZONE '"'"'UTC'"'"' as ts, title FROM feedback WHERE user_username='"'"'mary@friday.mu'"'"' ORDER BY created_at DESC LIMIT 5;"'

# 5. Check Guesty mint-meta state
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu \
  'cat /var/www/friday-gms/.guesty-token-meta.json'
```

## On cross-Claude coordination (flagged by Sprint 9 lead)

The Sprint 9 lead pointed out: there's only ONE human (Ishant) negotiating
across the FAD thread and the GMS thread. Both Claudes converge on
path-of-least-resistance because there's no second person pushing back. Worth
keeping in mind when this thread says 'agreed' too quickly to the GMS thread
or vice versa.

Mitigation in practice: when you disagree with something from the GMS thread,
surface the disagreement explicitly to Ishant rather than deferring. Today
one real example: 'iterate against current shell vs pause until Sprint 10
merge' — deferred to Sprint 10. Could have pushed back, didn't. Ishant
should make that call when it matters.

Re-read on disk at: `docs/handover/2026-05-17-evening-NEXT-SESSION-PROMPT.md`
