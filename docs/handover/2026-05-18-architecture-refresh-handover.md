# ACP Brief: architecture-refresh execution — 21 Notion punch-list items

**From.** Bootstrap-optimization CC session 2026-05-18 evening. That session created the canonical new Notion page **🏗️ FAD Architecture & Integrations** (`36443ca884928155861cdbf0dba4fe22`) in Command Layer, sibling to Atlas. That covers the affirmative side (single source of truth for current + planned FAD architecture). This brief covers the 21 cleanup punch-list items.

**For.** A fresh CC session executing the writes via Claude Web UI → Judith. CC can route the existing-Notion edits through Web UI Claude (the orchestrator), Judith handles the actual MCP-bridge writes. CC does NOT touch the existing high-stakes pages (Atlas, Manifest, Operating Rules, Code Index) directly — same anti-pattern Ishant established 2026-05-18.

**Why.** Atlas + 5 other governance pages have drifted from 2026-05-18 reality. The drift is recent (mostly today): Stage 1 public API shipped, Stage 2 inbox FAD-native, Phase 4 SKIPPED, anti-goal §8 lifted, friday-gms archival pulled forward. Anyone reading Notion as ground truth right now is being misled.

---

## 1. Inputs (read before executing)

In order:

1. **🏗️ FAD Architecture & Integrations** (Notion `36443ca884928155861cdbf0dba4fe22`) — the new canonical FAD-side architecture doc. Atlas §4 will point here instead of duplicating.
2. **`docs/handover/2026-05-18-late-handover.md`** on `fad-design-os-v01-frontend` (commit `1fa0698`) — parallel session's late-session handover. Architecture model dump.
3. **`docs/handover/2026-05-18-stage3-intelligence-layer-plan.md`** on `fad-design-os-v01-frontend` (commit `c2bfd4f`) — 7-phase Stage 3 plan + locked decisions.
4. **`docs/handover/2026-05-18-phase4-decision.md`** on `fad-design-os-v01-frontend` (commit `7ceade8`) — Phase 4 SKIP rationale + carry-forward to FAD-native composer.
5. **`docs/roadmap/2026-05-18-consolidated.md`** on `fad-rebuild` (commit `800222c`) — forward roadmap. **Multiple stale items per §3 of this brief.**
6. **`docs/handover/2026-05-18-bootstrap-optimization-validation.md`** on `fad-rebuild` (commit `c5c3c60`) — what shipped in the bootstrap track.
7. **Notion: FAD Running Decisions Log** (`34f43ca88492819f8284ea6a89e8624e`) — least stale of the existing governance pages.

---

## 2. What's already done (don't redo)

- **🏗️ FAD Architecture & Integrations** Notion page created. Contains: 2 topology diagrams (current + planned), service ownership table, route surface table (Stage 1 live + Stage 4 planned), integrations matrix, inbox-flow sequence diagram, knowledge composer flow, FAD-ADR registry 001-016 (namespaced separately from Operating Rules ADRs), dependencies + failure-mode summary, Stage 3 phase tracker, open questions, cross-references, change log.
- **ADR namespace convention locked**: Operating Rules §14 ADRs → reference as `OpsRules-ADR-NNN`; the new FAD-ADRs → `FAD-ADR-NNN`. Document both conventions in the §0 routing additions below.

---

## 3. Punch list — 21 items to execute via Web UI / Judith

Severity sorted. Each item: **page** · **section** · **current stale claim** · **correct claim** · **edit instructions**.

### HIGH (8 items)

**#1 — Atlas §4 (entire section + mermaid)**
- Page: Friday System Atlas (`34c43ca8849281b9a10de9f264141c37`)
- Section: §4 GMS Data Flow
- Stale: mermaid shows GMS as monolithic owner of poller → BE → context-assembly → draft → review → send → action-detector → teaching, with "GMS backend persists" as the claim. KB stated to live at `/var/www/friday-gms/knowledge/`. WhatsApp Playwright fallback described as live.
- Correct: as of 2026-05-18, **fad-backend** owns 14 inbox CRUD routes + send orchestrator + 4 draft mutations + translation worker + webhook receiver + KB composer. **friday-gms** is now intelligence-layer only (revise + compose + consult + teachings + draft-gen + action-detector + followup + auto-summarize + auto-resolve + learning-analyzer), and Stage 3 (2-3 weeks) ports those too. KB lives in **`backend/knowledge/`** in fad-backend; GMS copy frozen.
- Edit instructions: rewrite §4 as a short pointer paragraph: "FAD-side architecture detail lives at 🏗️ FAD Architecture & Integrations (`36443ca884928155861cdbf0dba4fe22`). This section retains only the broader Friday system context; FAD-internal flows are deep-dived on that page." Then keep ~150 words covering the friday-gms shrinkage trajectory + archival timeline + cross-ref to FAD-ADR-012.

**#2 — Consolidated Roadmap §6.2 + §8 anti-goal #1**
- Page: Consolidated FAD/GMS Roadmap (`36443ca8849281e38052fb6d67343f74`)
- Sections: §6.2 KB-track anti-goal; §8 anti-goal #1
- Stale: "Don't touch friday-gms consult.ts / draft-generator.ts / action-detector.ts / followup-draft-generator.ts / learning-analyzer.ts / KB-loading on the GMS side after Sprint 10. Those calls become inbound from FAD only post-archival."
- Correct: anti-goal LIFTED 2026-05-18 evening (Ishant approval after Stage 2 completion). Stage 3 is actively porting these files to fad-backend.
- Edit instructions: replace each occurrence with: "**LIFTED 2026-05-18 evening.** Stage 3 (2-3 weeks, in flight) ports consult.ts / draft-generator.ts / action-detector.ts / followup-draft-generator.ts / learning-analyzer.ts to fad-backend natively. See FAD-ADR-015 (`36443ca884928155861cdbf0dba4fe22`) and `docs/handover/2026-05-18-stage3-intelligence-layer-plan.md`."

**#3 — ADR numbering collision (Operating Rules §14 vs Consolidated Roadmap §3.8)**
- Pages: Operating Rules (`34d43ca88492810ea8aec815655e0042`) §14 AND Consolidated Roadmap §3.8
- Stale: both docs claim ADRs 001-010 as their own with different content. Anyone citing "ADR-005" is ambiguous.
- Correct: Operating Rules §14 ADRs are operational (Judith / OpenClaw / Claude infrastructure). FAD ADRs are product/architecture. They occupy different namespaces.
- Edit instructions:
  - In Operating Rules §14: add a callout at the top of the section: "ADRs in this section are **operational** (Judith / OpenClaw / Claude infrastructure). Reference as `OpsRules-ADR-NNN`. Product / FAD-architecture ADRs are separate namespace, live at 🏗️ FAD Architecture & Integrations §8 (`36443ca884928155861cdbf0dba4fe22`)."
  - In Consolidated Roadmap §3.8: rename "ADR-001" through "ADR-010" to "**FAD-ADR-001**" through "**FAD-ADR-010**" verbatim. Add the same callout as Operating Rules.
  - In Atlas §1 or wherever ADRs are referenced inline: ensure the namespace is explicit on every citation.

**#4 — Consolidated Roadmap §5.1.4 + §5.3.9 + §6.1 (Sprint 9 Phase 4 dead refs)**
- Page: Consolidated FAD/GMS Roadmap (`36443ca8849281e38052fb6d67343f74`)
- Sections: §5.1.4 "Sprint 9 Phase 4 prereq: multi-surface shadow logging wiring"; §5.3.9 "Sprint 9 deferred stages 3-5 of learnings loop"; §6.1 KB track "Sprint 10: Phase 4 cutover · Phase 5 burn-in"
- Stale: refers to Phase 4 as upcoming
- Correct: Phase 4 SKIPPED 2026-05-18, structured-loader pattern carries forward to FAD-native composer rewrite (Stage 3.0+). GMS shadow-logger investment obsolete. Decision doc at `docs/handover/2026-05-18-phase4-decision.md` (commit `7ceade8`).
- Edit instructions: in each occurrence, strike the original wording and replace with: "**SKIPPED 2026-05-18.** Pattern proof carries forward to Stage 3.0 FAD-native composer rewrite. See FAD-ADR-014 and `docs/handover/2026-05-18-phase4-decision.md`." For §6.1 KB-track timeline, update Sprint 10 to read "Stage 3.0 KB composer (FAD-native) ✅ done. Stage 3.1-3.7 in-flight. Then 2-week burn-in, then archive."

**#5 — Atlas §2 Infrastructure Map**
- Page: Friday System Atlas
- Section: §2 mermaid + Key Facts
- Stale: "`admin.friday.mu` = FAD | `gms.friday.mu` = GMS API"
- Correct: both vhosts root at `/var/www/fad/`; same Next.js bundle. `admin.friday.mu` is canonical user-facing URL. (Locked in Running Decisions Log §5.8.)
- Edit instructions: update §2 key fact to: "**`admin.friday.mu` AND `gms.friday.mu`** both nginx vhosts root at `/var/www/fad/`. Same Next.js bundle. `admin.friday.mu` is canonical user-facing URL; PWAs installed against it. Cross-ref FAD-ADR-016." Update §2 mermaid accordingly.

**#6 — Friday Code Index missing entries**
- Page: Friday Code Index (`35143ca88492810d9a73d46b0101c436`)
- Sections: GMS section + missing Inbox section + missing Public API section
- Stale: no entry for inbox-port, Phase 4 SKIP, Stage 1 public API
- Correct: 3 new sections / entries needed
- Edit instructions: add 3 new sections (or entries within existing GMS / FAD sections):
  - **Inbox (FAD-native, 2026-05-18 port)** — link to `🏗️ FAD Architecture & Integrations` §4-7 (current owner, route surface, message flow). Note: 14 CRUD routes + send orchestrator + 4 draft mutations + translation worker + webhook 10-edge-case ports.
  - **Public API (Stage 1 live, 2026-05-18)** — link to `🏗️ FAD Architecture & Integrations` §4.1 + commits `5e934f4`, `79f1cad`, `bea7538`. Document `/api/auth/token` + `/api/public/listings`.
  - **Phase 4 SKIP decision** — link to filesystem `docs/handover/2026-05-18-phase4-decision.md` (commit `7ceade8`). Brief description: shadow-log evidence proves structured-loader pattern; cutover to FAD-native composer instead.

**#7 — Consolidated Roadmap §5.3.8 + §5.4.2 (friday-gms archival re-sequence)**
- Page: Consolidated FAD/GMS Roadmap (`36443ca8849281e38052fb6d67343f74`)
- Sections: §5.3.8 "friday-gms archival prep — move inbox + reviews + translate to FAD-native"; §5.4.2 "friday-gms archival executed"
- Stale: scheduled for Sprint 10 prep / Sprint 11 execution
- Correct: read-side + send orchestrator + translate already FAD-native today. Intelligence layer is Stage 3 scope (2-3 weeks, in flight). Reviews already FAD (`/api/reviews/list`). Archival timing shifted forward to "post Stage 3.7 + 2-week burn-in" per FAD-ADR-012.
- Edit instructions:
  - §5.3.8 Inbox migration: change to "**Read-side + send orchestrator already FAD-native (2026-05-18). Intelligence-layer in Stage 3.** No further work needed for §5.3.8 inbox bullet."
  - §5.3.8 Reviews / Translate: keep as-is but mark "already done".
  - §5.4.2: change timing from "Gate: 2 weeks zero rollback after Sprint 10 inbox migration" to "**Gate: Stage 3.7 ships + 2-week zero-rollback burn-in. Per FAD-ADR-012.** Archival execution timing: 2026-Q3 (after Stage 3 completes mid-June at earliest, then 2-week burn-in)."

**#8 — Atlas §10 Sprint Timeline**
- Page: Friday System Atlas
- Section: §10 Sprint Timeline
- Stale: stops at Sprint 9 Phase 1 close (May 15)
- Correct: append rows for Sprint 9 Phase 3 deploy (9a091da), Phase 4 SKIP decision (7ceade8), Stage 1 public API ship, Stage 2 inbox FAD-native port, translation worker live, Stage 3 plan committed.
- Edit instructions: append 5-7 dated rows covering 2026-05-17 through 2026-05-18 evening. Verify dates against fad-design-os-v01-frontend git log if uncertain.

### MEDIUM (9 items)

**#9 — Atlas §4 production metrics (Apr 29 stamps)**
- Page: Atlas
- Section: §4 production metrics
- Stale: "2,320 messages / 1,122 drafts / 70 teachings, verified 2026-04-29"
- Edit instructions: Judith re-pulls from prod Postgres. Replace numbers + bump stamp to today.

**#10 — Operating Rules §14 ADR-009 (Judith VPS migration deferred)**
- Page: Operating Rules `34d43ca88492810ea8aec815655e0042`
- Section: §14 ADRs
- Stale: status "Phase 3 VPS migration deferred; trigger = Judith heavy use by Friday team via FridayOS/FAD admin dashboard". Trigger partially met now.
- Edit instructions: flag for Ishant decision — flip to "active" or extend.

**#11 — Operating Rules §14 ADR-010 (friday-gms 9146ee7 hold)**
- Page: Operating Rules §14
- Stale: "Status pending re-verification" since Apr 24
- Edit instructions: flag for Ishant — close or escalate.

**#12 — Manifest bootstrap + Atlas rows last_verified (Apr 28 stale)**
- Page: Claude Workspace Manifest (`35043ca884928186a7e8c8c7a859179d`)
- Section: bootstrap table + semantic memory table
- Stale: rows show `last_verified: 2026-04-28`, 20 days old. 30-day stale threshold so technically still in window but close.
- Edit instructions: re-stamp after #1 lands. Bump Atlas row to today; Manifest row to today.

**#13 — Operating Rules §0 + Manifest topical routing (missing routes)**
- Pages: Operating Rules §0, Manifest topical routing table
- Stale: no routing rows for "FAD inbox / public API / archival" queries; no row for "Universal Bootstrap Rules" CC routing.
- Edit instructions: add rows:
  - Operating Rules §0: "User asks about FAD inbox ownership / public API / archival progress" → fetch `🏗️ FAD Architecture & Integrations` (`36443ca884928155861cdbf0dba4fe22`) + Consolidated Roadmap.
  - Operating Rules §0: "Starting any Claude Code session in any project (Friday or external)" → fetch Universal Bootstrap Rules (`36443ca8849281fea06df5f83ae8e00a`) first, then this page if Friday context applies.
  - Manifest topical routing: same two rows.

**#14 — People & Domain Mary stub (7-day countdown)**
- Page: People & Domain (`35043ca8849281bead67eaf182142118`)
- Section: Mary stub
- Stale: "Departing May 2026" — Mary leaves 2026-05-25, now 7 days.
- Edit instructions: update to "**Departing 2026-05-25 (7 days, hard deadline)**. Outstanding handover deliverables per Consolidated Roadmap §5.1.1: vendor table, owner CRM dump, contract repository state, process docs. Status of each: TBD by Ishant."

**#15 — Atlas §4 WhatsApp Playwright fallback**
- Page: Atlas §4
- Stale: described as live behavior
- Correct: deferred today (VPS disk 89%); Channex + Meta WhatsApp Business displaces Q3-Q4 2026.
- Edit instructions: add a forward-looking note in the WhatsApp paragraph: "Playwright fallback deferred 2026-05-18 due to VPS disk pressure. Long-term: Meta WhatsApp Business direct integration post-Channex cutover. See Channel Manager Decision Memo (`35943ca88492818883d3fcefd8bb5e02`)."

**#16 — Atlas §7 Investor Pitch (Apr 29 metrics)**
- Page: Atlas §7
- Stale: Apr 29 numbers
- Edit instructions: re-pull before any external pitch use. Flag in change log "needs refresh before external pitch".

**#17 — Consolidated Roadmap §5.3.5 `/api/public/ai/chat` (KB physical location)**
- Page: Consolidated Roadmap §5.3.5
- Stale: doesn't reflect that KB is now physically FAD-side
- Edit instructions: add note: "KB physically lives in fad-backend (`backend/knowledge/`) since Stage 3.0 (2026-05-18). `/api/public/ai/chat` Kimi wrapper will load from there directly; no GMS dependency."

### LOW (4 items)

**#18 — Atlas §1 Key facts (Kimi K2.6 P10 vs P7 LIVE)**
- Page: Atlas §1
- Stale: "Kimi K2.6 P10 validation pending" — superseded by Apr 26 P7 LIVE update further down the page.
- Edit instructions: one-line clarification at §1 pointing to §8 model topology for current state.

**#19 — Operating Rules header date**
- Page: Operating Rules header callout
- Stale: "Last updated: April 25, 2026" but change log goes to May 12 + needs 2026-05-18 entry
- Edit instructions: bump header to "Last updated: May 18, 2026" + add change log entry for whatever items in this brief land.

**#20 — Consolidated Roadmap §2.3 VPS disk (88% → 89%)**
- Page: Consolidated Roadmap §2.3
- Stale: 88%
- Edit instructions: bump to 89% (per parallel session report 2026-05-18 evening).

**#21 — FAD Running Decisions Log §4 Module Ownership Map (table markup broken)**
- Page: FAD Running Decisions Log (`34f43ca88492819f8284ea6a89e8624e`)
- Section: §4 Module Ownership Map
- Stale: table rows misaligned, multiple `(live)` columns running together — rendering broken
- Edit instructions: rebuild the table cleanly. Each row = one module. Columns: Module | Scoper | Ship target | Notes. Use the version that lives at `friday-admin-dashboard/CLAUDE.md` "Module ownership snapshot" section as the clean source — already in shape.

---

## 4. Suggested Web-UI orchestration prompt for fresh session

The fresh CC session can either:
- (A) Run through #1-21 itself (read each from this doc, paste a per-item prompt to Web UI Claude → Judith), OR
- (B) Save this doc to Notion as a single orchestration brief and paste ONE trigger prompt to Web UI Claude (same pattern as `36443ca88492810e869fef32cbec7a0d`).

Recommend (B). Saves Ishant 21 paste cycles.

**Procedure for the fresh session:**

1. Read this doc end-to-end.
2. Create a Notion page in Active Work zone titled `🏗️ Architecture Refresh — 21-Item Punch List (2026-05-18)`. Content: §3 of this doc, formatted for Notion (tables for HIGH/MEDIUM/LOW).
3. Append the new Notion page ID to FAD MEMORY.md under the "Active Work Notion pointers" section (use the protected-override marker workflow).
4. Hand Ishant this paste prompt:

```
ACP-style task batch from Claude Code architecture-refresh session.

Read the brief at Notion page <NEW_PAGE_ID_HERE>
("🏗️ Architecture Refresh — 21-Item Punch List (2026-05-18)" in Active Work zone).

Execute the 21 items in severity order (8 HIGH first, then 9 MEDIUM, then 4 LOW). 
DM me on D0AERDED95J at each severity-tier boundary (after #8, after #17).
Surface for ack any item that requires Ishant decision (#10, #11, #14 Mary status).
Dispatch to Judith via MCP bridge for filesystem / AGENTS.md / production-Postgres-query work. 
Use your own Notion connector for Notion-side writes.
Anti-goal: no structural reorganization beyond what's specified per-item.
```

5. Don't execute items yourself from CC. The writes go through Web UI / Judith. CC creates the Notion page only.

---

## 5. Anti-goals (carry over)

- No structural reorganization of Atlas / Manifest / Operating Rules / Code Index beyond the specific edits listed.
- No new Notion top-level zones (respect the 5-zone ceiling per Operating Rules §16).
- No edits to SOUL.md / USER.md / AGENTS.md without Ishant ack — those are core Judith identity files.
- No commits to fad-rebuild beyond this handover + any necessary CLAUDE.md updates flagged below.
- No re-litigating decisions locked today (FAD-ADR-011 through FAD-ADR-016, Phase 4 SKIP, anti-goal §8 lift, Stage 3 plan).

---

## 6. Open items for Ishant

1. Verify the new FAD Architecture page ID is correctly cited (`36443ca884928155861cdbf0dba4fe22`) — the prior session created it but the ID may render slightly differently in Notion's normalization.
2. Decision on Operating Rules ADR-009 (VPS migration) — keep deferred or flip active? See #10.
3. Decision on Operating Rules ADR-010 (friday-gms 9146ee7 hold) — close or escalate? See #11.
4. Mary handover deliverables status (vendor table, owner CRM dump, contract repository, process docs) — by 2026-05-25.
5. Vercel env install for `FAD_PUBLIC_API_CLIENT_ID` + `FAD_PUBLIC_API_CLIENT_SECRET` — pending, gates website Stage 1 cutover.

---

## 7. Provenance

- Notion staleness audit by subagent during bootstrap-optimization session (2026-05-18 evening) — 22-item punch list, severity-sorted, source-cited per page.
- Architecture reality model from parallel FAD-prod-stabilization session's late-handover dump (`docs/handover/2026-05-18-late-handover.md`, commit `1fa0698`).
- Phase 4 SKIP rationale + Stage 3 plan from parallel session's commits `7ceade8` and `c2bfd4f`.
- Cross-referenced against `docs/roadmap/2026-05-18-consolidated.md` (commit `800222c`) and `docs/handover/2026-05-18-bootstrap-optimization-validation.md` (commit `c5c3c60`).

---

*End of brief. Read once, save §3 to Notion, dispatch via Web UI. Don't execute item writes from CC.*
