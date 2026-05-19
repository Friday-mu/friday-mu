# Session-close handover — FAD 2026-05-18 → 2026-05-19

> **Distinct from**: `2026-05-18-late-handover.md` (the handover that *kicked off* this session)
> and `2026-05-19-teaching-consolidation-handover.md` (a sub-handover for just the teaching
> consolidation work).
>
> This doc is the **comprehensive close** for the ~24-hour session running 2026-05-18 17:00 UTC
> through 2026-05-19 ~09:00 UTC. Read this first.

---

## 0. Cold-open checklist (verify before acting on anything below)

```bash
# 1. Worktree state
cd /Users/judith/repos/friday-admin-dashboard/.claude/worktrees/fad-design-os
git fetch origin
git log --oneline -15

# 2. Branch should be fad-design-os-v01-frontend with HEAD ~ 55024c6
git branch --show-current   # → fad-design-os-v01-frontend
git rev-parse HEAD          # → 55024c6 (guestyRequest export fix)

# 3. fad-backend deployed state
curl -s https://admin.friday.mu/version.json
ssh -i ~/.ssh/do_friday_admin root@admin.friday.mu 'pm2 list'
#   Expected: fad-backend restart #164, friday-gms restart #3213

# 4. Active teachings count (was 100 at session start)
ssh -i ~/.ssh/do_friday_admin root@admin.friday.mu \
  'export DATABASE_URL=$(grep ^DATABASE_URL /var/www/fad-backend/.env | cut -d= -f2-); \
   psql "$DATABASE_URL" -c "SELECT status, COUNT(*) FROM teachings GROUP BY status"'
#   Expected: active=37, revoked=97

# 5. New feedback bugs in last 12h
ssh -i ~/.ssh/do_friday_admin root@admin.friday.mu \
  'export DATABASE_URL=$(grep ^DATABASE_URL /var/www/fad-backend/.env | cut -d= -f2-); \
   psql "$DATABASE_URL" -c "SELECT id::text, created_at::timestamp(0), status, LEFT(description, 80) FROM feedback WHERE created_at > NOW() - INTERVAL '"'"'12 hours'"'"' ORDER BY created_at DESC"'

# 6. Disk on VPS (was 88% — watch for pressure)
ssh -i ~/.ssh/do_friday_admin root@admin.friday.mu 'df -h / | tail -1'
```

---

## 1. What shipped this session — full chronology

### Phase 3.1 — FAD-native auto-draft generator (Kimi K2.6)

| Commit | Description |
|---|---|
| `168624c` | Initial implementation (`backend/src/ai/kimi_draft.js` + `backend/src/inbox/draft_generator.js` + `backend/src/inbox/draft_reaper.js` + webhook wiring + composer property_card → optional) |
| `c218630` | friday-gms: gate webhook + poller draft-gen triggers behind `GMS_DRAFTGEN_DISABLED` |
| `a45d5e5` | **hotfix**: K2.6 requires `temperature: 1`, not 0.4 (caught first inbound after deploy) |
| `e5bed13` | **hotfix**: bump `max_tokens` 1200 → 4096 + skip-retry on `finish_reason=length` (K2.6 is reasoning-style, burns output on hidden CoT) |
| `6f269f2` | **hotfix**: don't retry on deterministic empty responses (content_filter / length) |

**Wire-up:** `guesty_message_webhook.js` fires `triggerDraftGeneration(messageId, conversationId)` fire-and-forget after inbound non-reaction non-auto-response. `FAD_DRAFTGEN_DISABLED` env flag = rollback. friday-gms-side firing gated by `GMS_DRAFTGEN_DISABLED=true` in their env.

### Phase 3.2 — Action detector (post-send commitment extraction)

| Commit | Description |
|---|---|
| `3f6116d` | `backend/src/inbox/action_detector.js` + `action_suppression.js` (auto-dismiss rules) + `deadline_learner.js` (learned-deadline lookup). Fires from `drafts_send.js` after a successful send. Kimi `extractStructuredOutput` (json_object mode). |
| `4b86519` | friday-gms: gate `detectActions` entry behind `GMS_ACTION_DETECTOR_DISABLED` |

Key insight from the audit: GMS's action-detector scans the **outbound** team message for promises ("we'll check with the owner"), NOT the inbound for tasks. The Stage 3 plan-doc framing was wrong.

### Phase 3.3 — Inquiry follow-up scanner + draft generator

| Commit | Description |
|---|---|
| `dffec85` | friday-gms: **fix `inquiry-followup-scanner` to treat `reserved` as booked** (cea6ac30 bug — followed up on guests who'd already accepted offers). Touched both auto-dismiss query (added `reserved` to status list + r2 join) and create-prospect query (removed `reserved` from non-committed list). |
| `89ec855` | `backend/src/inbox/followup_scanner.js` (cron worker, 15min) + `backend/src/inbox/followup_draft_generator.js`. Starts from `server.js`. |
| `45274f8` | friday-gms: gate `scanInquiryFollowups` behind `GMS_FOLLOWUP_SCANNER_DISABLED` |

The `reserved` fix is in BOTH the GMS pre-port hotfix AND the FAD port. Both paths now consistent.

### Phase 3.4 — Auto-resolve (no auto-summarize)

| Commit | Description |
|---|---|
| `2e524df` | `backend/src/inbox/auto_resolve.js` — Kimi `extractStructuredOutput` against open `pending_actions`, marks resolved ones `completed`. Wired from `drafts_send.js` alongside action_detector. Auto-summarize **deliberately not ported** — disabled in GMS per consolidation §5.1.5, no active consumer. |
| `365967f` | friday-gms: gate `checkAutoResolve` behind `GMS_AUTO_RESOLVE_DISABLED` |

### Regression fix — Sprint 8/9 contract preserved

| Commit | Description |
|---|---|
| `afa6b62` | `backend/src/inbox/learning_context.js` (new shared helper) + draft_generator / followup / action_detector all inject `[Team Instructions]` (teachings table) + `[Action Feedback from team]` (action_feedback table) blocks into the system prompt after the composer output. **The structured composer does NOT carry teachings — they're a separate dynamic-injection channel.** I'd dropped this in Phase 3.1; both sprint audit sessions (Sprint 8 + Sprint 9) independently confirmed contract-preservation was the intent. |

### ai-usage-meter wiring

| Commit | Description |
|---|---|
| `c15b0a9` | Added `kimi-k2.6` to RATE_TABLE ($0.75 / $3.50 per M tokens, Moonshot official). All Phase 3.x Kimi calls accept optional `meter: { tenantId, feature }`. Features wired: `inbox_draft`, `inbox_followup_draft`, `inbox_classify`, `inbox_action_detect`, `inbox_auto_resolve`. Per-call recordUsage fires fire-and-forget. |

### Public-API `/api/public/chat`

| Commit | Description |
|---|---|
| `7cb89c4` | New `backend/src/ai/chat_proxy.js` + `backend/src/public/chat.js`. Multi-provider (Kimi K2.6 primary, Anthropic Claude Sonnet 4.5 fallback on 429/5xx). Streaming SSE + non-streaming JSON. Tool-call passthrough in OpenAI shape. Mounted at `app.use('/api/public/chat', ...)` after `/api/public/listings`. friday-website client already has `ai:chat` scope — no DB update needed. Smoke-tested in prod (both streaming + non-streaming work). |

### Property card backfill + V2 promotes

| Commit | Description |
|---|---|
| `ff263f0` | Promoted 4 deferred property cards (BW-C4, GBH-C7, KS-5, SD-10) from `properties-deferred/` to `properties/`. Composer can now load them for the ~17 active conversations affected. **NB: these 4 are V1 schema; proper V1→V2 migration is the A2 task.** |
| `46c74dd` | **Cluster A1**: 25 property-scoped teachings absorbed into 14 V2 property cards. BS-1, LF-7, 5 GBH cards (B4/C3/C5/C6/C8), RC-15/16/7, LB-C complex + LB-1/2/3 subunits. All edits to existing V2 schema fields. |

### business-config promotes + payment-conflict resolution

| Commit | Description |
|---|---|
| `7dc9c66` | **Clusters E/F/H**: 20 teachings → `backend/knowledge/global/business-config/SKILL.md`. New sections: Check-in Flow, Listing URLs. Expanded: Contact, Fees & Pricing, Direct Booking, Operational Policies, Services Offered. Flagged direct-booking payment conflict (cards vs no-cards). |
| `437cec0` | **Payment conflict resolved** per Ishant 2026-05-19: bank transfer + cash only, no cards/PayPal. SKILL.md updated. Teaching `1350ef8c` revoked. |
| `bc415e8` | **Cascade fix**: `platform-rules.json` direct.paymentMethods list still had "Credit card via payment processor" + "PayPal" — updated to bank transfer + cash, explicit "Friday Retreats does NOT accept card payments or PayPal" line. |

### Teaching consolidation (100 → 37)

Logged in `docs/handover/2026-05-19-teaching-consolidation-handover.md` and the working doc `docs/teaching-consolidation/2026-05-19-100-active-teachings.md`.

| Operation | Count |
|---|---|
| Cluster A1 promote → cards | 25 |
| Easy revoke sweep (V2 KB dups) | 12 |
| Clusters E/F/H promote → biz-config | 20 |
| Cascade revoke (newly redundant) | 3 |
| Cluster B voice merges + flips | 3 (revokes) + 6 rewrites |
| **Total revoked / rewritten** | **63 teachings** |

End state: **37 active** (28 global + 9 property-scoped).

### Bug fixes through the session

| Commit | Bug | Source |
|---|---|---|
| `dffec85` | Inquiry-followup over-fired on 'reserved' guests (feedback cea6ac30) | Manual flag from Ishant |
| `a45d5e5` | K2.6 temperature must be 1, not 0.4 | Caught in prod logs |
| `e5bed13` | K2.6 max_tokens 1200 too low for reasoning model | Caught in prod logs |
| `6f269f2` | Retry-on-empty-response wastes Kimi budget | Caught in prod logs |
| `437cec0` + `bc415e8` | Direct-booking payment-method conflict between teachings + KB | Surfaced during consolidation |
| `55024c6` | `guestyRequest` not exported → drafts_send broken since Stage 2.1 | Feedback 0d056c78 from Ishant 05:23 UTC |

---

## 2. Production state (as of 2026-05-19 session close)

| System | State |
|---|---|
| Branch | `fad-design-os-v01-frontend`, HEAD = `55024c6` |
| fad-backend (`/var/www/fad-backend/`) | Restart #164, all this session's code deployed |
| friday-gms (`/var/www/friday-gms/`) | Restart #3213, on master @ `45274f8`, with `GMS_DRAFTGEN_DISABLED=true`, `GMS_ACTION_DETECTOR_DISABLED=true`, `GMS_AUTO_RESOLVE_DISABLED=true`, `GMS_FOLLOWUP_SCANNER_DISABLED=true` in `.env` |
| Frontend (`/var/www/fad/`) | Last deployed `0de257b` (no FE work this session) |
| Disk | 88% (was 89% at session start — `pm2 flush` early in session) |
| Active workers in fad-backend | translation_worker (60s), draft_reaper (60s/5min stuck threshold), followup_scanner (15min), guesty/poller (15min), email/pull_worker, website_inbox/jobs (15s), tenants/trial_jobs (hourly) |

### Active teachings: 37 breakdown

- **28 global** (some now positive-framed from Cluster B; rest still negative-framed, needs flip walks)
- **9 property-scoped**: 4 on BW-C4 + 1 KS-5 + 1 SD-10 (A2 deferred) + 3 VA-3/VA-4 (A3 deferred)

### `/api/public/chat` live + verified

- Smoke-tested 2026-05-18 19:57 UTC. Non-streaming returned `{"message":...,"model":"kimi-k2.6","fallback_used":false}`. Streaming returned text-delta chunks + envelope.
- ai_usage rows landed correctly per-call.
- Fallback path (Kimi → Anthropic on 429/5xx) **not exercised in prod** — code is there, untested live.
- **Caveat**: Moonshot's streaming SSE doesn't emit usage by default. Streaming calls log 0¢ cost. Non-streaming is accurate. Fix is `stream_options: { include_usage: true }` — Tier 1 follow-up.

### Stage 3 phase progress

| Phase | Status |
|---|---|
| 3.0 KB composer | ✓ shipped (catch-up deploy this session) |
| 3.1 Draft generator | ✓ shipped + 3 hotfixes + regression fix |
| 3.2 Action detector | ✓ shipped |
| 3.3 Followup scanner + draft | ✓ shipped |
| 3.4 Auto-resolve | ✓ shipped (auto-summarize deliberately skipped) |
| 3.5 Consult / Ask Friday | **not started** — biggest remaining phase (~800 lines GMS source) |
| 3.6 Teachings + learning-collector | not started |
| 3.7 Learning-analyzer | not started — "core competitive moat" per Final-State Handover, scheduler design pending |

---

## 3. Locked decisions (don't re-litigate)

1. **Kill GMS at end of migration, no parallel run.** Each Stage 3 phase ships FAD-native + disables the GMS counterpart in the same atomic deploy. After Phase 3.7 + verify, `pm2 stop friday-gms`. No 2-week burn-in.
2. **Kimi K2.6 for drafts.** Not Anthropic Claude. `temperature: 1` mandatory. `max_tokens: 4096` for reasoning headroom.
3. **Structured composer is the active loader.** Sprint 9's KnowledgeComposer (shadow-only in GMS) is now the primary prompt-build path in FAD. No monolithic-prompt port.
4. **Direct-booking payment: bank transfer or cash only.** No cards, no PayPal as of 2026-05-19 (no processor active).
5. **Property facts belong in cards, not teachings.** The 33 property-scoped teachings the team accumulated all promote to V2 schema fields.
6. **Teachings table = behavioural directives only.** Static facts (banking, fees, services) live in business-config SKILL.md. Property data lives in property cards.
7. **Positive framing for all kept teachings.** Per Sprint 8 research (Notion `35e43ca884928132a8b6fa14beddfe6b`).
8. **Auto-send disabled for FAD-native drafts.** Every draft passes user review. Re-enable later via env once quality is observed steady.
9. **Auto-summarize NOT ported.** GMS killed it (default-off env flag); no consumer.
10. **Don't introduce silent fallbacks.** Visible error patterns over silent retries.

---

## 4. Pending tasks — priority queue

### P0 — Resume the teaching consolidation flip walks

Working doc: `docs/teaching-consolidation/2026-05-19-100-active-teachings.md`
Handover: `docs/handover/2026-05-19-teaching-consolidation-handover.md`

22 globals still need positive-framing rewrites:
- Cluster C — verify/sourcing (3 teachings)
- Cluster D — commitment (3)
- Cluster E — fee framing (2)
- Cluster F — check-in goodwill (1)
- Cluster G — maintenance/complaints (7)
- Cluster H — returning-guest playbook (1)
- Cluster I — outliers (5)

Estimated: 30-45min Ishant ack time + 10min execution. **Use `Write` → `scp` → `psql -f` for the SQL** — do NOT manually retype UUIDs (2 typos this session). Use content-pattern WHERE clauses where possible.

### P0 — A2: V1→V2 card migration

4 cards (BW-C4, GBH-C7, KS-5, SD-10) are V1 schema with `quick_responses` / `trigger_keywords`. They need V1→V2 migration before the 6 deferred property-scoped teachings (BW-C4 ×4, KS-5, SD-10) can be absorbed. Estimated ~30-45min per card.

### P0 — A3: Create missing cards (VA-3, VA-4)

No cards exist. Need to create from Guesty listing data + the 3 deferred teachings (distances, location, building setup). Plus the previously-flagged MV-1 / TRR-4 / VA-3 / VA-4 set (4 properties with no cards).

### P1 — Phase 3.5: Consult / Ask Friday

Biggest remaining Stage 3 phase. friday-gms's `consult.ts` is ~800 lines. The Friday Consult sidebar in FAD inbox currently proxies to GMS — porting native unblocks the consult UI's perf + lets us drop the GMS proxy for one more surface.

Use the `per-conversation-mutex` pattern from the feature catalog (`architecture/per-conversation-mutex.md`) for shared Ask Friday session writes.

### P1 — Streaming `usage` capture on `/api/public/chat`

Add `stream_options: { include_usage: true }` to the Kimi streaming call so cost tracking works for streaming traffic too. Tier 1 fix, ~5min.

### P1 — Website session is unblocked on listings auto-derive

They've got the 36-key DTO they needed. Their queued work: extend `FadListing` type, auto-derive Friday-side fields (slug, area, region, type), drop `_seed/properties.json`. No FAD-side action — they ship at their own cadence.

### P2 — Phase 3.6/3.7 — Teachings + Learning-Analyzer

The Stage 2 Analyzer has never fired in production (per the GMS/KB Final-State Handover, this is "the core competitive moat"). Once it does, it'd fold teachings into V2 KB content automatically — making future consolidation passes unnecessary. Sprint 11 candidate per the cross-session roadmap.

### P3 — Reported bugs still standing

| ID | Summary | Status |
|---|---|---|
| `48c478be` | Drafts leaking across conversations in Friday Consult | new — defer to Phase 3.5 (consult port) |
| `3425ff65` | Confidence level 7000% on a draft | new — likely auto-dies on FAD-native drafts (clamped 10-98) |
| `dba0a793` | Wrong summary for guest Alessia Barbetta | new — auto-summarize is disabled, this is residual GMS-side |
| `59b6581a` | Can't edit/refine a draft (revise) | **OBSOLETE** — revise was removed; Polish-with-Friday is the replacement |
| `2dd203cd` | Polish-with-Friday button doesn't work | unverified post-Phase 3.1 deploy; Ishant said "polish moved to team chat only" |
| (10 frontend bugs from earlier sweep) | Channels, mentions, scheduling, read receipts, responsiveness | separate FE track — not phase-blocking |

### P3 — Disk cleanup on VPS

Steady at 88%. Adding more workers in Phase 3.5+ will tighten. Worth `pm2 flush` + `find /var/log -name '*.gz' -mtime +14 -delete` before any heavy phase deploy.

---

## 5. Known gaps + risks

### Gaps

- **`/api/public/chat` Anthropic fallback never exercised in prod.** Code is there but no 429 has fired. First real spike will be the test.
- **Streaming token usage = null** in ai_usage table. Streaming cost is under-counted.
- **VPS at 88% disk.** Not crisis-level but not headroom either.
- **MV-1, TRR-4, VA-3, VA-4 still have no property cards.** ~10 active conversations run prompts without property-specific facts. Drafts work degraded.
- **Composer cache** in fad-backend doesn't auto-reload on file change. pm2 restart required after KB edits — manual step, easy to forget.

### Risks

- **K2.6 quirks.** Reasoning-style model burns output budget on hidden CoT. We hit this twice in one session (temperature, max_tokens). More similar quirks may surface — keep finish_reason logging in mind.
- **GMS still does some work.** Even with all 4 flags set, GMS handles consult/revise/compose proxies (not yet ported). Killing GMS pm2 prematurely breaks those.
- **Teaching-flip backlog.** 22 negative-polarity rules still in the draft prompt. Sprint 9 research says these underperform vs positive framing. Quality impact: real but not catastrophic. Finish soon.

---

## 6. Lessons / patterns logged this session

1. **UUID retyping is a foot-gun.** Two typos in two SQL batches (`6cb1` ↔ `cb1c`, `ff81` ↔ `cf91`). For bulk DB ops, prefer: content-pattern WHERE clauses → `Write` SQL to local file → `scp` → `psql -f`. The Cluster E/F/H batch ran 20 revokes via content patterns with zero errors.

2. **Shell quoting over SSH heredocs collapses on nested JSON-style quotes.** Use the file → scp → `psql -f` flow when SQL contains complex quotes.

3. **The HELD-conflict pattern works.** Tag conflicts with `[⚠ CONFLICTING TEACHING]` in the destination doc + hold the source teaching until resolved. Don't silently pick.

4. **Test new APIs in prod immediately.** Phase 3.1 deployed clean but K2.6's temperature constraint surfaced on the very first inbound. Better to ship + watch + hotfix than to over-test in dev.

5. **Don't broadcast 8-rule consolidations as 12-rule merges.** Voice cluster proposal was 8 → 6 (modest), not 8 → 4 (overreach). Smaller merges preserve nuance; larger merges hide it.

6. **Sprint research often answers itself.** The "100 teachings to <30" memory mapped to the V2 KB rule count, not the teachings table count. The Final-State Handover Notion page had the definitive answer. Always check the Notion ancestor chain before assuming memory is right.

7. **Pre-existing bugs hide behind unused code paths.** `guestyRequest` not-exported lived since Stage 2.1 because nobody actually used the FAD-native send flow until this session. The bug surfaced the first time Ishant tried to send.

8. **Estimation memory got an upgrade mid-session.** Now tiered: Tier 1 (coding 4-7×), Tier 2 (writing 1.5×), Tier 3 (research 1.3×), Tier 4 (strategy 1×). Apply the right tier — don't lump.

---

## 7. Resumption prompt — paste this into the next session

```
Resume from docs/handover/2026-05-19-session-close-handover.md.

Working directory: /Users/judith/repos/friday-admin-dashboard/.claude/worktrees/fad-design-os
Branch: fad-design-os-v01-frontend, HEAD = 55024c6 (guestyRequest export hotfix)
fad-backend deployed restart #164; friday-gms restart #3213.

Run the cold-open checklist in §0 of the handover before any action.

Recommended starter is one of:
  P0a — Resume teaching consolidation flip walks (22 globals to flip
        to positive framing per docs/teaching-consolidation/
        2026-05-19-100-active-teachings.md). ~40min of Ishant ack
        time + 10min execution. Drops 37 → ~15 globals.
  P0b — A2 V1→V2 property card migration (BW-C4, KS-5, SD-10).
        ~30-45min per card. Unblocks the 6 deferred A2 teachings.
  P0c — A3 create VA-3 + VA-4 + MV-1 + TRR-4 cards from Guesty data.
        ~30-45min total.
  P1  — Phase 3.5 Consult port (friday-gms consult.ts ~800 lines).
        Biggest remaining Stage 3 phase.

Locked decisions: §3 of the handover. Don't re-litigate.

Estimation tier: most of the consolidation work is Tier 4 (judgment-
heavy). Coding work (3.5 port, V1→V2 migration) is Tier 1. Apply
correctly per memory feedback-estimation-bias.

Bugs still standing: §4 P3 of handover.

Pending Ishant inputs: none critical right now.
```
