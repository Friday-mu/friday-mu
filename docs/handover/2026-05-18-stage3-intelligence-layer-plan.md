# Stage 3 — Intelligence Layer Port Plan

**Decision:** approved 2026-05-18 by Ishant. Anti-goal §8 (consult.ts / draft-generator.ts / KB-loading frozen) is now lifted — porting these files to fad-backend is in scope.

**Total estimate:** ~2-3 weeks focused, broken into 7 phases below. Most phases ship value independently — we don't have to wait for all to complete before archiving GMS surfaces.

---

## TL;DR

Port friday-gms's intelligence-layer services to fad-backend natively:

1. **KB-loading subsystem** (foundation, ~3-5 days) — prerequisite for everything else, no user-visible change alone
2. **Auto-draft generator** (~3-5 days) — biggest user win; AI drafts appear in inbox without GMS
3. **Action detector** (~2-3 days) — pending-action alerts on inbound
4. **Followup-draft generator** (~2-3 days) — proactive re-engagement after silence
5. **Auto-summarize + auto-resolve** (~1-2 days) — conversation hygiene
6. **Consult ("Ask Friday")** (~3-5 days) — the consultation feature
7. **Learning-collector + analyzer** (~3-5 days) — the feedback loop

After all phases land + 2-week burn-in: friday-gms can be archived per roadmap §5.4.2.

---

## Phase order & dependencies

```
  Phase 3.0  KB-loading  ◄─ prereq for everything
       │
       ├──▶  Phase 3.1  Auto-draft generator
       │
       ├──▶  Phase 3.2  Action detector  (lightweight — can ship sooner if needed)
       │
       ├──▶  Phase 3.3  Followup-draft generator
       │
       └──▶  Phase 3.5  Consult / Ask Friday
              │
              └──▶  Phase 3.6  Teachings / learning-collector
                         │
                         └──▶  Phase 3.7  Learning-analyzer (Stage 2 of loop)

  Phase 3.4  Auto-summarize + auto-resolve  ◄─ independent, no KB dep
```

KB-loading is the prerequisite for 3.1, 3.2, 3.3, 3.5 because they all build structured prompts on top of it. Phase 3.4 (auto-summarize / auto-resolve) doesn't need KB — can run in parallel as a quick win.

---

## Per-phase detail

### Phase 3.0 — KB-loading subsystem (~3-5 days)

**What it is.** The structured-loader pattern proven by today's P0.1 shadow-log analysis (70-78% token reduction, 45-55 named rule sections per call). KB files are markdown / JSON in friday-gms's `knowledge/` directory; the loader builds a context-aware system prompt by selecting + concatenating relevant rule blocks per surface (inbox-drafts, consult, action-detector, followup, etc.).

**Deliverables.**
- Copy `knowledge/` directory from friday-gms to fad-backend (`backend/knowledge/`)
- `backend/src/knowledge/composer.js` — the structured loader. Reads named rule blocks, supports lazy-load triggers, builds the system prompt per surface
- `backend/src/knowledge/property-cards.js` — per-property knowledge cards (read from DB + KB files)
- `backend/src/knowledge/test.js` — port the GMS knowledge-composer.test.js so we can verify parity

**Verification.** Build a test that runs the new composer against a sample conversation + property and compares the output to GMS's composer output (using the shadow-log methodology). Must match within a small token-count window.

**No user-visible change yet** — this is just the foundation. Nothing routes through it until Phase 3.1+.

---

### Phase 3.1 — Auto-draft generator (~3-5 days)

**What it is.** When an inbound guest message arrives, GMS auto-generates a draft reply via Anthropic Claude, using the KB-built system prompt + conversation history. Per shadow-log analysis: avg 18K tokens per call (down from 80K+ with the old monolithic loader).

**Deliverables.**
- `backend/src/inbox/draft_generator.js` — fad-native port of `friday-gms/src/services/draft-generator.ts`
- Wire into the inbound webhook handler: after a new inbound message lands, trigger draft generation async
- Same fields populated as GMS (draft_body, confidence, retry_count starting at 0, state='draft_ready')
- SSE broadcast to inbox UI on draft_updated (eventually; for now polling works)
- Skip-draft-on-reaction logic (already plumbed via my `isReaction` flag in the webhook)

**Verification.** Send a test guest message, watch a draft appear in the inbox within ~5-10s. Compare quality against GMS's draft on the same input (run both, manual eyeball).

**Risk.** This is the most user-visible change in Stage 3. Quality regression vs GMS would be felt immediately. Mitigation: keep GMS's draft-generator running in parallel for a burn-in window (~3-5 days) and diff outputs.

---

### Phase 3.2 — Action detector (~2-3 days)

**What it is.** Scans inbound messages for "I need staff to do something" patterns (booking change, special request, complaint). Inserts pending_actions rows. Frontend surfaces these as alerts.

**Deliverables.**
- `backend/src/inbox/action_detector.js` — port of `friday-gms/src/services/action-detector.ts`
- Wire into inbound webhook flow
- Uses KB for context enrichment (so depends on Phase 3.0)
- Could ship lighter without KB if we use a simple Anthropic prompt — quality vs. cost tradeoff

**Verification.** Send a test inbound that should trigger an action ("can I have a late checkout"); confirm `pending_actions` row appears + frontend renders alert.

---

### Phase 3.3 — Followup-draft generator (~2-3 days)

**What it is.** Cron-driven proactive re-engagement after a silence threshold. Generates a "checking in" draft for stale conversations.

**Deliverables.**
- `backend/src/inbox/followup_draft_generator.js` — port of `friday-gms/src/services/followup-draft-generator.ts`
- Cron worker (similar to translation_worker) — every N minutes, scan for stale conversations
- Opt-out logic (cooldown, no-recent-followup)
- Marked drafts as auto-generated so the inbox UI can flag them

---

### Phase 3.4 — Auto-summarize + auto-resolve (~1-2 days)

**What it is.** Two independent background jobs.
- Auto-summarize: when a conversation ends (last activity > N days OR explicit "session ended"), generate a summary stored on `conversations.conversation_summary`.
- Auto-resolve: when the team's outbound message indicates resolution (e.g., "Thanks, all sorted"), auto-flip the conversation status to `done`.

**Deliverables.**
- `backend/src/inbox/auto_summarize.js` — periodic worker
- `backend/src/inbox/auto_resolve.js` — fires from the approve flow (drafts_send.js) post-send

Independent of KB — uses bare Anthropic prompts. Ships in parallel with other phases.

---

### Phase 3.5 — Consult / "Ask Friday" (~3-5 days)

**What it is.** The conversational consultation feature. Team types a question to Friday about a thread; Friday answers using KB + conversation context.

**Deliverables.**
- `backend/src/inbox/consult.js` — port of `friday-gms/src/services/consult.ts` + `src/routes/consult.ts`
- Session management (consult sessions are stateful)
- KB lazy-loading per query
- Streaming response support (SSE) — phase later if needed

**Verification.** Friday Consult UI in inbox works end-to-end without GMS.

---

### Phase 3.6 — Teachings / learning-collector (~3-5 days)

**What it is.** When team rejects or revises a draft, the learning-collector captures the event for analysis. Teaching surface lets ops codify rules ("never say 'unfortunately'"), which feed into future drafts.

**Deliverables.**
- `backend/src/inbox/learning_collector.js` — port of `friday-gms/src/services/learning-collector.ts`
- Wire into draft mutation routes (reject, revise) — already FAD-native, just need to fire the collector
- Teachings CRUD routes (currently gmsProxied) — port to fad-native

---

### Phase 3.7 — Learning-analyzer (~3-5 days)

**What it is.** Stage 2 of the learning loop. Cron-driven over `action_feedback` table: clusters feedback, surfaces candidate KB updates to a review queue.

**Deliverables.**
- `backend/src/inbox/learning_analyzer.js` — port of `friday-gms/src/services/learning-analyzer.ts`
- Cron worker
- Review queue UI (Settings → Knowledge → review candidates)

Per today's P0.1 decision: the Stage 2 analyzer scheduler was the biggest moat unlock. Now is when it actually ships.

---

## What I'm starting first

**Phase 3.4 (auto-summarize + auto-resolve)** — independent of KB, ships fast, low-risk. Validates the "port a GMS service to fad-backend" workflow before tackling the heavier KB-dependent phases.

Then **Phase 3.0 (KB-loading)** — the prerequisite foundation.

Then **Phase 3.2 (action detector)** — smallest KB-dependent phase, fast value.

Then **Phase 3.1 (draft generator)** — the biggest user-visible win.

Followed by 3.3, 3.5, 3.6, 3.7 in that order.

---

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Quality regression on AI outputs (especially Phase 3.1) | Keep GMS's draft-generator running in parallel for 3-5 days post-cutover; A/B compare outputs |
| KB drift between GMS and FAD copies | One-shot copy + immediate freeze of GMS's `knowledge/` dir. All future KB edits land in fad-backend |
| Multi-week scope creates context-loss risk across sessions | Each phase = one commit + handover doc. Resumable from any phase break |
| VPS disk at 89% — adding more services tightens it | Phase 3.7 (analyzer) is the only addition that runs continuously. Most phases REPLACE existing GMS workers; net disk impact is roughly zero |
| Anthropic API cost spike when we own draft-generation | Use cheaper model (claude-haiku-4-5) where quality permits; cache aggressively; the structured KB loader already cuts 70-78% of tokens |

---

## Decision points before code

1. **Where do KB files live?** Proposed: `backend/knowledge/` mirroring `friday-gms/knowledge/`. One-shot copy. Future edits → fad-backend only.
2. **Anthropic vs Kimi for draft generation?** GMS uses Anthropic. FAD's translation worker uses Kimi. Drafts need higher quality → Anthropic recommended. Open for discussion.
3. **Burn-in strategy.** Parallel-run GMS + FAD for first ~1 week? Or hard cutover with quick rollback?
4. **Archival timing.** Once all phases land + verified, when do we actually `pm2 stop friday-gms`? Recommend 2-week zero-rollback burn-in after Phase 3.7.

---

## Provenance

- Stage 3 framing: `docs/handover/2026-05-18-gms-rebuild-audit.md` (option B — full pull-forward)
- Intelligence-layer audit: subagent in that audit cycle, refined per my caveats
- KB structured-loader pattern proof: today's P0.1 decision (`docs/handover/2026-05-18-phase4-decision.md`)
- Anti-goal lifted: Ishant 2026-05-18, in-session approval after Stage 2 completion
