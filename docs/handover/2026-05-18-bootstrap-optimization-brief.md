# ACP Brief: bootstrap optimization for FAD code sessions

**Goal.** A Claude Code session opened against the FAD repo should be immediately aware of the strategic + procedural context that today lives only in Notion and has to be fetched manually each session. Future-me shouldn't have to be told "go read the operating rules" or "check the running decisions log" — those should be part of the bootstrap.

**Scope.** This brief is for a *separate session* whose only job is to design + implement the bootstrap improvements. Don't do FAD product work in this session.

**Anti-goal.** Don't try to auto-load all of Notion. Most of Notion is irrelevant to FAD code work (Judith/Slack workflow, sprint planning, legal pack). Pull only what materially changes coding decisions.

---

## 1. What's currently auto-loaded for a new FAD code session

| Surface | Path | Auto-loaded? | What it contains |
|---|---|---|---|
| Global CLAUDE.md | `~/.claude/CLAUDE.md` | ✅ yes (every session) | Ishant's communication preferences, ACP-vs-Direct framing, FridayOS context, git conventions |
| Repo CLAUDE.md | `friday-admin-dashboard/CLAUDE.md` | ✅ yes (whenever cwd is in the repo) | Tech stack, deploy commands, file org, gotchas, conventions |
| Auto-memory | `~/.claude/projects/-Users-judith-repos-friday-admin-dashboard/memory/` | ✅ yes (always) | FAD-specific learned facts (greenfield route, product direction, finance decisions, deploy paths, dependency map, design SaaS) |

## 2. What's NOT auto-loaded but materially changes coding decisions

These were fetched manually in the 2026-05-18 session and proved to shift outputs (see "Evidence" column for the concrete diff in behavior):

| Notion surface | URL / ID | Why it matters for code | Evidence from 2026-05-18 |
|---|---|---|---|
| Claude Operating Rules — **§3.2, §3.3, §10, §11, §12, §14, §15** only | `34d43ca8-8492-810e-a8ae-c815655e0042` | Investigation-before-implementation rule; brief-writing gates must be executable in dev env; sprint git-tag conventions; ADRs (API-first, multi-tenant); Ishant working preferences | Made me split F3 into investigation-then-implement instead of dispatching code blind |
| FAD Running Decisions Log | `34f43ca8-8492-819f-8284-ea6a89e8624e` | Strategic constraints (Phase 1/2/3 Guesty curve, multi-tenant from day one, typed wrapper architecture); module ownership; channel-manager decision; module-specific locked decisions | F3 proposal includes `tenant_id` in schema by default; framed the FAD-public-API proxy as Phase 1, not permanent; mirrored typed-wrapper pattern in /api/public/* spec |
| Latest FAD Code Session Handover | most recent in `34f43ca8-8492-812b-aca2-def8dd92eb27` children (currently `36043ca8-8492-817a-99bb-e24b003e3e13`) | Deploy paths, env-var inventory, screenshot library pattern, in-flight sprint, recent gotchas | Most of this is already mirrored in repo CLAUDE.md, but the in-flight sprint context (Conversational Floor-Plan Editor W2 etc.) wasn't |
| Friday System Atlas (selected sections) | `34c43ca8-8492-81b9-a10d-e9f264141c37` | Infrastructure topology, agent topology, GMS data flow diagrams | Less critical for code work; useful when reasoning about cross-system flows |
| FAD Module Build Tracker | `35143ca8-8492-81a6-ae13-c23872e54507` | Per-module status (live / in-build / scoped / parked) | Less critical day-to-day; useful for "should I be touching this module?" decisions |

## 3. Two paths to fix it (pick one)

### Path A — Inline the critical facts into repo CLAUDE.md (recommended)

Pros: zero fetch latency, works offline / when Notion's slow, every session has it without needing to know to fetch.

Cons: drifts from Notion if Notion is updated and CLAUDE.md isn't; takes ~150–250 lines added to CLAUDE.md.

Specific additions for `friday-admin-dashboard/CLAUDE.md`:

- New section **## Strategic constraints (locked)**: bullet list of the §1 strategic constraints from running decisions log — Guesty Phase 1/2/3 curve, mid-2027 displacement target, multi-tenant non-negotiable, FridayOS-as-MCP-server long-term, typed wrapper architecture.
- New section **## Workflow rules**: §3 from running decisions log — investigation before implementation, no parallelization across waves.
- New section **## Procedural rules from Operating Rules**: just §3.2, §3.3, §10 exceptions list, §11 brief-writing failures, §12 git tag formats, §14 ADRs locked, §15 working preferences. Skip everything Notion/Judith/Slack-flavored.
- New section **## Module ownership snapshot**: who scopes what, current ship targets, from §4 of running decisions log.

Plus update existing **"References"** section to add the precise Notion IDs (not just the Atlas link that's already there) so a session that DOES want to drill in has the direct path.

### Path B — Memory entries with "fetch when…" triggers

Pros: keeps repo CLAUDE.md slim; surfaces Notion content only when the trigger fires; mirrors the Operating Rules §0 "topical reference routing" pattern.

Cons: relies on session-Claude correctly identifying the trigger; latency every fetch; gets out of sync if Notion content moves.

Specific entries to add under `~/.claude/projects/-Users-judith-repos-friday-admin-dashboard/memory/`:

- `notion_routing.md` — table of (trigger → Notion ID + section) pairs. Trigger column: "designing a new API endpoint" → fetch §1.5 of running decisions log; "scoping a new module" → fetch module's scoping pack + running decisions log §5; "starting any FAD code work" → fetch Operating Rules §3.2+§10+§15; "uncertain about git/deploy convention" → fetch FAD Code Session Handover Conventions section. Add a pointer line to MEMORY.md.
- `git_author_convention.md` — codifies `Judith Friday <judith@friday.mu>`, the auto-fallback failure mode discovered today (2026-05-18: judith@Judiths-Mac-mini.local appearing in commits because user.email was unset on the Mac), and the one-line fix.

### Recommendation: Path A primary + Path B for the git-author finding

Path A handles the structural ask. Path B handles the new finding (git author) since that's a one-off learning, not a recurring fetch.

## 4. Suggested execution sequence for the bootstrap session

1. Re-fetch the four Notion surfaces in section 2 to get the *current* state (this brief was written from 2026-05-18 snapshots; Notion may have moved).
2. Diff the section 2 content against the existing `friday-admin-dashboard/CLAUDE.md` — identify the deltas (a lot may already be there).
3. Draft the proposed CLAUDE.md additions in a single PR-ready edit. Show Ishant the diff before committing.
4. Write the two memory files in Path B.
5. Commit + push (after Ishant approves the diff).
6. **Validation test:** open a fresh Claude Code session in the worktree, prompt it with a hypothetical "design a new public-API endpoint for /api/public/X" — verify it spontaneously references multi-tenant, typed-wrapper, investigation-before-implementation, and the correct git author convention without being asked to fetch Notion.
7. Update `MEMORY.md` to point at any new files.
8. Document the validation result in `docs/handover/2026-05-XX-bootstrap-optimization-validation.md`.

## 5. Open questions for Ishant before that session starts

1. **Path A vs B vs hybrid?** Default to hybrid per my recommendation; override if you want pure A or pure B.
2. **Is there content currently in Notion that's also in CLAUDE.md?** If yes, decide whether CLAUDE.md is canonical (delete from Notion) or Notion is (delete from CLAUDE.md) — single source of truth per fact, please.
3. **Friday-gms / friday.mu repos** — they have the same need. Should this session also produce the same CLAUDE.md additions for those repos, or is FAD the only one to optimize for now? Recommend FAD-only first; replicate after validation.
4. **Tooling for Notion → CLAUDE.md sync.** Out of scope for this session, but worth flagging: if we keep the Notion content authoritative, a periodic export-to-CLAUDE.md script would prevent drift. Park unless you want it built.

## 6. Out of scope for the bootstrap session

- Building any product features.
- Restructuring Notion itself (Path A doesn't require it).
- Touching the global `~/.claude/CLAUDE.md` beyond a one-line "FAD repo has its own CLAUDE.md with strategic context — read repo CLAUDE.md first when working in a FAD repo." (Skip even this if the global already says it.)
- Memory consolidation passes — separate skill (`anthropic-skills:consolidate-memory`).

## 7. Time estimate

~1.5h for a focused session: 30min re-fetch + diff, 30min draft CLAUDE.md additions, 15min memory files, 15min validation in fresh session.

## 8. Source material this brief was distilled from (2026-05-18 fetches)

- Notion: `34d43ca8-8492-810e-a8ae-c815655e0042` (Operating Rules)
- Notion: `34f43ca8-8492-819f-8284-ea6a89e8624e` (Running decisions log)
- Notion: `36043ca8-8492-817a-99bb-e24b003e3e13` (FAD Code Session Handover 2026-05-14)
- Notion: `34f43ca8-8492-812b-aca2-def8dd92eb27` (FAD Scoping index)
- Git config investigation in `/Users/judith/repos/friday-admin-dashboard/.claude/worktrees/fad-design-os` and `/var/www/friday-gms` (live on prod) — 2026-05-18

End of brief.
