# friday-gms → FAD-native rebuild audit — 2026-05-18

**Decision needed:** how much of friday-gms to port to fad-backend this sprint vs. keep proxying until Sprint 11 (June-July).

**Context:** Judith asked whether to stop debugging proxy-contract mismatches (reviewed_by, sent_via, etc.) and instead audit friday-gms and rebuild what's needed FAD-native. Two read-only audits ran in parallel: inbox CRUD (this Claude in main context) + intelligence layer (subagent).

---

## TL;DR

The friday-gms code splits cleanly into two layers with very different port costs:

| Layer | Port effort | Anti-goal conflict | Recommendation |
|---|---|---|---|
| **Read-side CRUD** (list conversations, get thread, get messages, mark read/unread, get drafts) | ~2 dev days | None | **Port this sprint.** Replaces ~80% of proxy traffic. Eliminates the kind of contract debugging we just hit. |
| **Write-side / intelligence orchestrator** (approve, reject, revise, retry, fail, dismiss, compose, consult, teachings, translate) | ~3-4 weeks | Frozen per brief §8 | **Keep proxied.** Port follows the existing roadmap Sprint 11 schedule and needs Ishant sign-off. |

**Recommended action this sprint:** port the read-side. Defer the intelligence layer to Sprint 11. This is consistent with roadmap §5.3.8 ("inbox migration: 2 weeks zero rollback gate before friday-gms inbox archived"). It also gives you most of what you want — a cleaner, debuggable FAD-native read path — without unfreezing the anti-goal.

---

## Audit #1 — Inbox CRUD (read-side)

GMS source: `~/repos/friday-gms/src/routes/conversations.ts` (576 LOC), `drafts.ts` (770 LOC).

### Port-cheap routes

| Route | GMS file:lines | Port effort | Notes |
|---|---|---|---|
| `GET /api/inbox/conversations` | conversations.ts:11-76 | ~3-4h | Single SQL with `read_status` join + filter logic. Most complex of the bunch. |
| `GET /api/inbox/conversations/search` | conversations.ts:77-168 | ~2h | Full-text style search across messages. |
| `GET /api/inbox/conversations/filters` | conversations.ts:169-188 | ~30 min | Counts per status/channel. |
| `GET /api/inbox/conversations/:id` | conversations.ts:189-284 | ~2h | Detail bundle (joins reservation, drafts, messages). |
| `GET /api/inbox/conversations/:id/messages` | conversations.ts:504-519 | ~30 min | Straight SELECT. |
| `GET /api/inbox/conversations/:id/drafts` | conversations.ts:520-536 | ~30 min | Straight SELECT. |
| `GET /api/inbox/conversations/:id/channels` | conversations.ts:537-564 | ~1h | Channel availability computation. |
| `GET /api/inbox/conversations/:id/reservation` | conversations.ts:405-424 | ~30 min | Straight SELECT. |
| `PATCH /api/inbox/conversations/:id/read` | conversations.ts:365-385 | ~30 min | Upsert read_status. |
| `PATCH /api/inbox/conversations/:id/unread` | conversations.ts:386-404 | ~30 min | Delete or null read_status. |
| `PATCH /api/inbox/conversations/:id` | conversations.ts:425-503 | ~1h | Update status/labels. |
| `GET /api/inbox/drafts/queued/list` | drafts.ts:38-57 | ~30 min | Simple SELECT with JOIN. |
| `GET /api/inbox/drafts/:id` | drafts.ts:58-74 | ~15 min | Simple SELECT. |

**Total: ~13h of dev work, call it 2 days with testing and verification.**

### Why this is cheap

- The Postgres database is **already shared** between fad-backend and friday-gms — no schema migration needed
- fad-backend already has the database client wired (`./src/database/client`)
- These routes are essentially "express handler with SQL inside" — no AI, no third-party calls, no orchestration
- Auth pattern is the same JWT both sides validate against `JWT_SECRET`

### What this unblocks

- All read traffic stops going through friday-gms — fewer 502/timeout/contract-mismatch failure modes
- The recent "reviewed_by is required" class of bug stops happening for reads (writes still need handling)
- FAD inbox becomes deployable independent of friday-gms uptime for the read side
- Foundation for the §5.3.6 SSE event stream (Postgres LISTEN/NOTIFY) when that ships

### What it does NOT unblock

- `/api/inbox/conversations/:id/send-template`, `/translate`, `/compose` — those call `draft-generator.ts` or `guesty-browser-fallback.ts`, intelligence-layer
- All draft mutation routes (approve/reject/revise/etc.) — intelligence-adjacent, see audit #2

---

## Audit #2 — Intelligence layer (from parallel subagent)

GMS source: `~/repos/friday-gms/src/services/consult.ts` (~800 LOC), `draft-generator.ts` (~650 LOC), `action-detector.ts` (~500 LOC), `followup-draft-generator.ts` (~450 LOC), `learning-analyzer.ts` (~600 LOC), KB-loading subsystem (~700 LOC).

### Per-module summary (from subagent)

| Module | LOC | Port effort | What's lost if archived without porting |
|---|---|---|---|
| `consult.ts` (Ask Friday) | ~800 | 2-3 weeks | Friday Consult feature unavailable |
| `draft-generator.ts` (auto draft replies) | ~650 | 2-3 weeks | No draft suggestions in inbox; manual composition only |
| `action-detector.ts` | ~500 | 1.5-2 weeks | No automated action detection; manual triage |
| `followup-draft-generator.ts` | ~450 | 1.5 weeks | No proactive follow-ups after silence |
| `learning-analyzer.ts` | ~600 | 2-3 weeks | Learning loop dead; system can't improve from feedback |
| **KB-loading subsystem** | ~700 | 3-4 weeks | All AI modules lose lazy-loading; token bloat returns (70-78% increase per today's shadow-log finding) |

**Subagent estimate: 3-4 weeks total** if porting in priority order (KB-loading first as prerequisite).

### Caveats on the subagent's estimate

The subagent's report had a few blockers it listed that I don't think actually block:

- **"GMS-specific schema":** the DB is **shared** between fad-backend and friday-gms (same Postgres). Not a port blocker.
- **"Anthropic API key management"** — fad-backend already has `ANTHROPIC_API_KEY` wired (roadmap §2.4, today).
- **"Vector DB or semantic search backend"** — friday-gms's lazy-loading is structured KB JSON files (per the Sprint 9 shadow-log analysis from today's P0.1 decision doc), not vector search. Lower infra cost than the subagent suggested.
- **"Real-time UI integration / event stream"** — Sprint 10 roadmap §5.3.6 already plans `SSE /api/public/events` via Postgres LISTEN/NOTIFY. The plumbing is on the docket regardless.

**Realistic estimate, accounting for these:** 2-3 weeks if executed well. Still significant. Still warrants Ishant sign-off.

### What porting buys us

- friday-gms can be archived per Sprint 11 roadmap (saves disk, simplifies ops, kills the 3207-pm2-restarts pet)
- Single source of truth for the intelligence layer (matches §3.1 ADR — FAD-as-single-source-of-truth)
- Multi-tenant evolution is easier (Sprint 11 §5.4.1 plans per-tenant Guesty / Resend / Kimi)

### What it costs

- 2-3 weeks of focused dev work
- Delays inbox + data-pipeline priorities (calendar sync, /api/public/* for website unblock) by the same 2-3 weeks
- Bug risk in the intelligence layer during cutover. The Sprint 9 shadow-log mechanism (now obsolete per today's P0.1 decision) was specifically designed to catch this risk — without it, we'd cut over blind
- Violates the brief's anti-goal §8: "Don't touch friday-gms consult.ts / draft-generator.ts / KB-loading. After e81b70a today, treat consult.ts as frozen until FAD migration replaces it" — that anti-goal exists for a reason, and unfreezing needs explicit Ishant approval

---

## Three options for Judith + Ishant

### Option A — Port the read-side only this sprint (RECOMMENDED)

- ~2 dev days
- No anti-goal conflict, no Ishant sign-off needed (it's already in roadmap §5.3.8)
- Eliminates ~80% of proxy traffic
- Frees the rest of the sprint for calendar sync + auth issuer + public endpoints (the website-unblock priority Judith stated)
- Intelligence layer stays where it is until Sprint 11

### Option B — Full pull-forward to this sprint (NEEDS ISHANT SIGN-OFF)

- ~3-4 weeks of dedicated work
- Pulls Sprint 11 entirely into now
- Delays inbox + data-pipeline + website-unblock by 3-4 weeks
- Higher risk: rebuilding mission-critical AI surfaces without the shadow-log gate Sprint 9 was supposed to provide
- Needs the brief's anti-goal §8 explicitly lifted by Judith + Ishant before I touch consult.ts / draft-generator.ts / KB-loading

### Option C — Keep proxying everything (status quo)

- Zero rebuild cost
- Contract-mismatch debugging continues as the FAD frontend matures (today's reviewed_by is one example; there will be others)
- Roadmap timing preserved
- friday-gms's 3207 pm2 restarts and high coupling remain a liability

---

## Recommendation

**Option A this sprint, then re-evaluate.**

Reason: it gives Judith ~80% of the "stop debugging proxy contracts" win, costs only 2 days, doesn't touch the frozen anti-goal, and preserves bandwidth for the calendar/auth/public-endpoint work that's actually on the critical path to the website-unblock she stated as priority 1.

Option B is reasonable but should be a separate, intentional Sprint 11-pull-forward decision with Ishant in the loop, not a side-effect of an "audit and rebuild" framing. Ishant signed off on the original Sprint 11 timing — accelerating it deserves a fresh conversation, not an inferred yes.

Option C is the do-nothing baseline. Picking it is fine if the contract debugging hasn't actually been costing meaningful time (and so far it's been one bug today, fixed in 12 LOC).

## Decision

- [ ] Option A — port read-side this sprint (Judith can OK; no Ishant needed)
- [ ] Option B — full pull-forward (Ishant OK required first)
- [ ] Option C — status quo, defer to Sprint 11 (Judith call)
- [ ] Hybrid — Option A this sprint + Ishant briefing for B decision later (Judith call)

## Provenance

- Audit #1 (inbox CRUD): this Claude main-context, 2026-05-18.
- Audit #2 (intelligence layer): subagent (Explore type), read-only over `~/repos/friday-gms/src/services/*`.
- Anti-goal source: `docs/handover/2026-05-18-evening-consolidation-handover.md` §8.
- Roadmap reference: `docs/roadmap/2026-05-18-consolidated.md` §5.3.8 (Sprint 10 inbox migration) and §5.4.2 (Sprint 11 archival) on `fad-rebuild` branch.
