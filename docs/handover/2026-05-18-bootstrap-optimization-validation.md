# Bootstrap Optimization — 2026-05-18 (validation report)

**Original brief.** `docs/handover/2026-05-18-bootstrap-optimization-brief.md` (commit `f1edae8`). Scoped two paths: A) inline strategic + procedural context into repo CLAUDE.md; B) memory-routing entries for Notion-fetch triggers. Validation criterion: a fresh CC session in this worktree, prompted to "design a new public-API endpoint for /api/public/listings," should spontaneously reference multi-tenant, typed-wrapper, investigation-before-implementation, git author convention, FAD-as-single-source-of-truth — without being told to fetch Notion.

**Scope expansion mid-session.** Ishant redirected from FAD-only bootstrap to universal Claude Code bootstrap: split `~/.claude/CLAUDE.md` from project-coupled to project-agnostic, establish universal patterns, create canonical Notion reference, design credential-discovery layer, prepare Web-UI handoff prompts for changes outside this session's scope.

## What shipped

### Filesystem

| Path | Change | Branch / location |
|---|---|---|
| `friday-admin-dashboard/CLAUDE.md` | Added 3 sections: Strategic constraints (locked) · Workflow rules (Friday-specific, post-dedup) · Module ownership snapshot. Extended References with Notion IDs. Trimmed universal patterns now covered by global. | `fad-rebuild` commit `a5ee748` (initial) + dedup commit (this batch) |
| `~/.claude/projects/-Users-judith-repos-friday-admin-dashboard/memory/notion_routing.md` | New file — project-scoped trigger → Notion-page-id routing table | Auto-memory (outside repo) |
| `~/.claude/projects/-Users-judith-repos-friday-admin-dashboard/memory/MEMORY.md` | Added pointer to `notion_routing.md` | Auto-memory |
| `~/.claude/CLAUDE.md` | Rewrote universal layer — ~65 lines, project-agnostic. Cut Friday-specific content. Added About-Ishant / Project-discovery / Notion-as-canonical / Escalate sections. Backup at `~/.claude/CLAUDE.md.bak.2026-05-18`. | User-scope filesystem |

### Notion (new pages — no edits to existing pages)

| Page | ID | Parent |
|---|---|---|
| 🤖 Claude Code — Universal Bootstrap Rules | `36443ca8849281fea06df5f83ae8e00a` | Command Layer |
| 🔑 Credential Index | `36443ca8849281f7bba1ddc93698c5ee` | Command Layer |

### Hooks (deferred — concept acked, wire pending)

Two PreToolUse / SessionStart hooks designed in `.bootstrap-work/hooks-DRAFT.md`:
- `git fetch origin` on SessionStart in any git repo
- Git author email check on `git commit` (blocks commits with non-`@friday.mu` author)

To be wired via the `update-config` skill in a follow-up.

## Validation result

**Subagent simulation (preliminary).** Spawned a general-purpose subagent with the new context loaded, asked the design question. Result: 1 of 5 concepts spontaneously surfaced (multi-tenant). Other 4 either not invoked (typed-wrapper, FAD-as-single-source-of-truth, git author) or only partially (investigation-before-implementation gestured at via "Open questions" without explicit ADR-009 invocation).

**Caveat:** the subagent test under-represents real fresh-session behavior. Subagents read files via tool-call, not via the auto-loading mechanism. A real fresh CC session opening with the new CLAUDE.md auto-loaded would have all the strategic content as ambient context from turn 1, not consciously fetched. Recommend re-validation with a real fresh session.

## Layer model now in force

| Layer | Where | Authority |
|---|---|---|
| **Universal Claude Code** | `~/.claude/CLAUDE.md` + Notion `36443ca8849281fea06df5f83ae8e00a` | Behavioral skeleton (terse, project-agnostic). Notion canonical for humans, filesystem canonical for the agent. Drift-check weekly. |
| **Friday workspace shared** | `~/.openclaw/workspace/AGENTS.md` (Judith's) | Judith's coordination layer. Cross-references universal patterns but stays Judith-flavored. Not edited this session. |
| **Per-project** | `friday-admin-dashboard/CLAUDE.md` (and parallel for other Friday repos) | Stack, layout, project-specific ADRs, module ownership, sprint conventions |
| **Path-scoped** | `<repo>/.claude/rules/*.md` (none yet for FAD) | Future use for module-specific gotchas |
| **Auto-memory** | `~/.claude/projects/<path>/memory/` | Project-scoped learned facts, Notion routing |
| **Hooks** | `~/.claude/settings.json` + per-repo `.claude/settings.json` | Deterministic policy. CLAUDE.md is ~70% adherence; hooks are 100%. |

## Web-UI handoff queue (Ishant routes via Claude Web UI / Judith)

Prepared as paste-able prompts in `.bootstrap-work/web-ui-handoff-prompts-DRAFT.md`:

1. AGENTS.md positive-framing audit (light, proposal-back only).
2. Friday Code Index housekeeping (fill in real per-area pages).
3. Manifest sibling-indexes update (add new Universal Bootstrap Rules page).
4. Operating Rules §0 routing-table addition (cross-ref Universal Bootstrap Rules).
5. Credentials migration (plaintext password fix + Tailscale auth key location). Includes real edits + Ishant ack gate.
6. SOUL/USER pattern feedback (low priority).

## Open security findings (from Credential Index audit)

1. Plaintext Guesty password in `business/credentials-reference.md` (Judith filesystem). Migrate to Keychain.
2. Tailscale auth key location unknown. Locate + document.
3. Anthropic API key drift across 3 stores. Mitigates after Sprint 10 §5.7 lands.
4. VAPID key pair not generated. Required before F3 push notifications ships.
5. Postgres password embedded in DATABASE_URL. Industry standard; reopen if vault adopted.

## Anti-goals observed

- ✅ No edits to FAD product code (frontend/* or backend/*)
- ✅ No pushes to `fad-design-os-v01-frontend` or any branch except `fad-rebuild` (CLAUDE.md edits only)
- ✅ No edits to existing Notion pages (Manifest, Operating Rules, Atlas, Friday Code Index, etc.) — proposals queued via Web-UI prompts instead
- ✅ No edits to Judith core files (SOUL.md, USER.md, AGENTS.md) — read for structural learning only
- ✅ No git config changes
- ✅ Did not modify the parallel session's deliverables (consolidated roadmap, push-notifications proposal)

## Open questions / decisions pending

1. Wire hooks now or after Ishant reviews `.bootstrap-work/hooks-DRAFT.md`? (Concept acked; wire pending review.)
2. Version-control `~/.claude/` via dotfiles repo for safety? (Recommended; not done this session.)
3. Re-validate with a real fresh CC session? (Recommended.)
4. Dedup pass on FAD `CLAUDE.md` workflow rules: shipped this session.

## Sequence followed

1. Read inputs: bootstrap brief, consolidated roadmap, Notion sources (Operating Rules, Running Decisions Log), memory files, AGENTS.md, SOUL.md, USER.md.
2. Wrote FAD CLAUDE.md additions + memory routing file (initial commit `a5ee748`).
3. Ran subagent validation (partial pass + caveat).
4. Round-1 research (3 parallel agents): Claude Code best practices, community signals, Friday Notion workspace audit.
5. Synthesized proposal; got Ishant ack on direction + constraints (no Notion edits to existing pages).
6. Round-2 research: targeted CLAUDE.md prune ruthlessness questions.
7. Drafted: new `~/.claude/CLAUDE.md`, Universal Bootstrap Rules Notion page, Credential Index Notion page, hooks, Web-UI handoff prompts.
8. Ishant acked the draft `~/.claude/CLAUDE.md`.
9. Wrote `~/.claude/CLAUDE.md` (backup retained).
10. Created the 2 Notion pages.
11. Dedup pass on FAD CLAUDE.md (peeled universal patterns now covered by global).
12. Wrote this validation report.
13. Committed FAD changes (dedup + this report).

## Sources

- Bootstrap brief: `docs/handover/2026-05-18-bootstrap-optimization-brief.md`
- Consolidated roadmap: `docs/roadmap/2026-05-18-consolidated.md`
- Research outputs: in-memory only (subagent results)
- Drafts: `.claude/worktrees/heuristic-saha-1f1008/.bootstrap-work/*.md` (this worktree, not committed)
- Notion: `34d43ca88492810ea8aec815655e0042` (Operating Rules), `34f43ca88492819f8284ea6a89e8624e` (Running Decisions Log), `35143ca88492810d9a73d46b0101c436` (Friday Code Index), `35143ca8849281518e8ed45131531e67` (Judith Recovery Runbook)
- AGENTS.md (Judith): `~/.openclaw/workspace/AGENTS.md`
- SOUL.md / USER.md (Judith): `~/.openclaw/workspace/{SOUL,USER}.md`
