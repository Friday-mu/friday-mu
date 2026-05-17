# Friday GMS Backend Audit — Inbox/Messaging/AI Surface

> Audit input for the 2026-05-17 inbox-parity gap analysis. Source: subagent
> read pass over `/Users/judith/repos/friday-gms` + live SSH inspection of
> the prod process at `gms.friday.mu`.

## TL;DR

Repo audited: `/Users/judith/repos/friday-gms`. **Important clarification:** the friday-gms codebase uses NEW-style `/api/...` paths (e.g. `/api/conversations`, `/api/drafts/:id/approve`, `/api/ai/consult`). The FAD proxy in `backend/server.js` ALSO has legacy routes that point at OLD-style bare paths (`/pending`, `/regenerate/:id`, `/command`, `/approve/:id`, `/edit/:id`, `/reject/:id`) — those routes 404 in prod today (`/pending` was removed 2026-05-13, the `ENABLE_GMS_INBOX_POLLING` flag at `server.js:805-816` documents this). Only the NEWER `/api/inbox/conversations*` proxy in FAD (server.js:1211+) hits real, working endpoints.

| FAD-consumed endpoint (legacy proxy path) | Equivalent in current friday-gms | FAD uses today? | Port difficulty |
|---|---|---|---|
| `GET /pending` | `GET /api/conversations?has_pending_draft=true` | Y (broken — 404) | Easy — SQL query |
| `POST /regenerate/:id` | `POST /api/drafts/:id/revise` | Y | Medium — triggers async gen |
| `POST /approve/:id` | `POST /api/drafts/:id/approve` | Y | **Hard** — Guesty send + WA window + retry/Slack/SSE/action-detect |
| `POST /edit/:id` | Approve with `draft_body` field, or revise | Y | Easy — UPDATE drafts |
| `POST /reject/:id` | `POST /api/drafts/:id/reject` | Y | Easy — state + learning event |
| `POST /command` | `POST /api/ai/consult` | Y | **Hard** — full prompt assembly, sessions, teachings |
| `GET /conversation/:id` | `GET /api/conversations/:id` | Y | Easy — direct port |
| `GET /conversation/:id/messages` | `GET /api/conversations/:id/messages` | Y | Trivial |
| `GET /conversation/:id/reservation` | `GET /api/conversations/:id/reservation` | Y | Trivial |
| `GET /translation/languages` | (no equivalent — was hardcoded; FAD has fallback) | Y | Trivial (static) |
| `POST /translation/translate` | `translateText()` helper, no HTTP route | Y | Easy — wrap helper |
| `GET /analytics/dashboard` | `GET /api/analytics/summary` + `/api/analytics/v2/*` | Y | Medium — reshape data |
| `GET /reviews` | **Not implemented** in friday-gms | Y | Greenfield |
| `GET /api/system/status` | `GET /api/health` + `GET /api/version` | Y | Trivial |

---

## 1. Conversation + message endpoints

All conversation routes are at `/api/conversations`, mounted in `src/index.ts:101`. JWT via `authMiddleware` + tenant-scope via `tenantMiddleware` (src/index.ts:97-100).

- `GET /api/conversations` — list with optional `status`, `channel`, `has_pending_draft`. SQL at `src/routes/conversations.ts:11-74`. Joins drafts (latest state/id/confidence), inbound count, last-message body/direction, per-user `read_status`. Orders `last_message_at DESC`. No pagination.
- `GET /api/conversations/search` — text + filter (`q`, `status`, `property`, `channel`, `dateFrom`, `dateTo`) — `:77-166`. Limit 100.
- `GET /api/conversations/filters` — distinct properties/channels/statuses — `:169-186`.
- `GET /api/conversations/:id` — heavy aggregate: conversation + messages + drafts + reservation + `available_channels` + `recommended_channel` + WhatsApp 24h window + `seen_by` — `:189-282`.
- `POST /api/conversations/:id/send-template` — Guesty WhatsApp template (browser fallback) — `:285-362`.
- `PATCH /api/conversations/:id/read` and `/unread` — `:365-402`.
- `GET /api/conversations/:id/reservation` — `:405-422`.
- `PATCH /api/conversations/:id` — update notes/status/auto_send_enabled with `force_done` guard against open pending_actions — `:425-501`.
- `GET /api/conversations/:id/{messages,drafts,channels}` — `:504-562`.
- `POST /api/conversations/:id/translate` — `:565-574`.
- Compose router: `POST /api/conversations/:id/compose` (`src/routes/compose.ts:33`) with three modes: `manual`, `draft` (AI), `direct_send`.

**Upstream origin:** all message data is **polled** from Guesty, not webhook-pushed. `src/services/poller.ts:39` starts a `setInterval`. `poller.ts:97` calls `guestyClient.listConversations(25)` every tick. New posts become `messages` rows → `triggerDraftGeneration` in `draft-generator.ts:1393`.

Response shape: unwrapped DB rows. Aggregate `/:id` returns `{ conversation, messages, drafts, reservation, whatsapp_window_open, whatsapp_window_expires_at, available_channels, recommended_channel, seen_by }`.

## 2. Draft generation pipeline

Mounted at `/api/drafts` (`index.ts:102`).

**State machine** (see UPDATEs in `drafts.ts`):
```
friday_drafting → draft_ready → under_review → approved → sending → sent
                            ↘ rejected
                            ↘ revision_requested → (new draft cycle)
                            ↘ superseded
sent path → send_queued → (retry) → sent | send_failed → dismissed
```

- `GET /api/drafts/queued/list` — send-queue panel (`drafts.ts:38-55`)
- `GET /api/drafts/:id` — single (`:58`)
- `POST /api/drafts/:id/approve` — **the meaty one** (`:75-427`). Sends via Guesty (with `guestyBrowserFallback` if API fails — `:194-202`), translates at send-time if `original_language != 'en'` (`:172-187`), inserts outbound `messages` row, supersedes peer drafts, recalcs response-time metrics, fires action detection, optional `learnMode` creates a `teachings` row.
- `POST /api/drafts/:id/reject` — `:430-473`. Logs to `learning_events` via `collectRejectionEvent`.
- `POST /api/drafts/:id/revise` — marks current `revision_requested`, calls `triggerDraftGeneration(messageId, conversationId, revision_instruction, newRevisionNumber)` async, logs `revision_log` + `learning_events`. Optional `mode='teach'` inserts a `teachings` row immediately. `:476-575`.
- `POST /api/drafts/:id/retry`, `/fail`, `/dismiss` — manual queue management `:579-768`.

**Prompt structure** (`src/services/draft-generator.ts:580-972`, function `generateReply`):

System prompt assembled in order:
1. Hard language rule (English only — translation at send-time)
2. Brand voice subset filtered by category (`formatBrandVoiceRules` :240) ← **see crash note in §5**
3. Emoji interpretation primer
4. STR communication practices (full)
5. STR essentials
6. STR best practices filtered by detected context (check-in/checkout/maintenance/pricing/complaint flags built at `:603-612`)
7. Platform rules for current channel
8. Active `teachings` filtered to global or matching property (`:677-702`)
9. Discount-negotiation policies (always)
10. Refund assessment framework (always)
11. Team data (people, escalation chains, comp tools)
12. Operations knowledge
13. Property knowledge card from `knowledge/{property_code}.json`
14. Intent-specific sales/extension/complaint guidance based on `conversation_intent`
15. Availability context if dates mentioned (`buildAvailabilityContext`)
16. Last 20 `action_feedback` rows (teach/reject) — operator feedback loop
17. Financial data from reservation
18. Revision/compose blocks with previous draft body if applicable

User message: `PREVIOUS MESSAGES:\n{thread}\n\nDRAFT A REPLY TO THE LATEST MESSAGE...` (`:968`).

**Model:** `config.ai.draftModel` = env `DRAFT_MODEL`, default `claude-sonnet-4-20250514` (`src/core/config.ts:41`). Translation: `claude-haiku-4-5-20251001`. `max_tokens: 1000`. No temperature/top_p.

**Learning loop:** three tables fed by operator actions:
- `learning_events` — every reject/revise/teach event (`src/services/learning-collector.ts:3,23,44`).
- `teachings` — inserted on `revise` with `mode='teach'` (drafts.ts:543) or `approve` with `learnMode='learn'` (drafts.ts:313). Loaded back into every draft prompt at `draft-generator.ts:677-702`.
- `action_feedback` — teach/reject on detected actions. Loaded into every draft prompt at `draft-generator.ts:891-910`.

Auto-learn pattern detection via `checkAutoLearn` (drafts.ts:562). Two-stage: events → `learning_analyzer.ts` clusters → human reviews via `/api/learning/candidates` → approved → `teachings`.

**Per-draft DB state**: `state, draft_body, draft_translated, confidence, model_used, prompt_tokens, completion_tokens, message_id, conversation_id, revision_number, revision_instruction, reviewed_by, rejection_reason, sent_at, sent_language, translated_content, sent_via, send_method, retry_count, next_retry_at, response_minutes, skip_auto_learn`.

## 3. "Ask Friday" / Consult

Mounted at `/api/ai` (`index.ts:120`). Main endpoint:

- `POST /api/ai/consult` (`src/routes/consult.ts:122-969`) — payload: `{ text|instruction, conversationId, context, draftId, draftBody, history, sessionId, model_tier, contextData }`. Valid `context`: `revision | compose | draft_review | pending_action | next_step | teaching | learning_candidate | message_review`.

**Prompt construction differs from draft generator in 4 ways:**
1. **Surface-aware knowledge loading** via `KNOWLEDGE_CONFIG` (`:35-44`) — only loads `brand-voice + str-essentials + platform-rules + property + teachings` for revision/compose/draft_review; `operations + teachings` for pending_action/next_step; only `teachings` for teaching/learning_candidate.
2. **Conditional financial knowledge** via `FINANCIAL_KEYWORDS` regex (`:63`).
3. **STR_KB / SALES_KB chips** (`:129-138`) — prefixes load full STR / sales knowledge JSON.
4. **`[DRAFT_UPDATE]...[/DRAFT_UPDATE]` protocol tag** — when assistant rewrites a draft, parsed out (`:852-863`) and returned as separate `draft_update` field, never shown in chat. Similarly `[TEACH]{...}[/TEACH]` (`:867-894`).

**Model selection** (`selectModel`, `:73-106`): Opus 4.7 for compose/pending_action/learning_candidate; Sonnet for routine revisions (regex `polish|shorter|longer|more formal|...`) or short draft_review; Opus for financial/complaint/refund keywords; default Sonnet for revision, Opus otherwise. `model_tier` body param can force.

**Caching:** Anthropic prompt-caching — stable prompt marked `cache_control: ephemeral` (`:771-781`); dynamic prompt uncached.

**Sessions:** `consult_sessions` table holds `conversation_history`, `running_summary`, token totals. Compaction at 150k tokens via Haiku summarization (`:818-844`). Multi-user shared via per-conversation mutex (`:21-32`) and SSE broadcast (`:911-933`).

Output shape: `{ response, model, draft_update?, teaching_actions?, teaching_action?, sessionId, compacted?, missingKnowledge? }`.

Other consult routes:
- `POST /api/ai/consult/:sessionId/summarize` (`:975`)
- `GET /api/ai/consult/history/:conversationId` (`:990`)
- `POST /api/ai/consult/session/end` (`:1022`)
- `GET /api/ai/consult/session/active` (`:1051`)

## 4. Other surfaces FAD consumes

| Legacy proxy path | Current friday-gms path | Source |
|---|---|---|
| `GET /pending` | `GET /api/conversations?has_pending_draft=true` | `conversations.ts:11` |
| `POST /regenerate/:id` | `POST /api/drafts/:id/revise` | `drafts.ts:476` |
| `POST /approve/:id` | `POST /api/drafts/:id/approve` | `drafts.ts:75` |
| `POST /edit/:id` | `approve` with `draft_body`, or `/revise` | `drafts.ts:131` |
| `POST /reject/:id` | `POST /api/drafts/:id/reject` | `drafts.ts:430` |
| `POST /command` | `POST /api/ai/consult` | `consult.ts:122` |
| `GET /conversation/:id` | `GET /api/conversations/:id` | `conversations.ts:189` |
| `GET /conversation/:id/messages` | `GET /api/conversations/:id/messages` | `conversations.ts:504` |
| `GET /conversation/:id/reservation` | `GET /api/conversations/:id/reservation` | `conversations.ts:405` |
| `GET /translation/languages` | No equivalent — was hardcoded; FAD has fallback (`server.js:599`) | — |
| `POST /translation/translate` | No HTTP route. `translateText(text, targetLanguage)` exists at `draft-generator.ts:974` | — |
| `GET /analytics/dashboard` | `GET /api/analytics/summary` (`analytics.ts:79`) + `/api/analytics/v2/*` (28+ routes) | — |
| `GET /reviews` | **No equivalent in this codebase** | — |
| `GET /api/system/status` | `GET /api/health` (`index.ts:164`) + `GET /api/version` (`:159`) | — |

## 5. Crash/restart context — UPDATES TO HANDOVER

**Live state contradicts the handover.** SSH to `gms.friday.mu`:
- `pm2 list` shows the process online with **uptime 2 days, current memory 102 MB**, NOT crash-looping.
- Lifetime restarts are 3,197 (accumulated since registration) but **0 restarts in the recent log window**. The "25 restarts/day" figure is stale.
- The 200-line error log contains **no crashes, only repeated 429s.** No `voiceDescription` TypeError, no unhandled rejections, no segfaults.

**The real 429 driver (NOT a restart loop):**
- `[Guesty] WARNING: 96 token refreshes today. Guesty limit is 5/day.` — climbing every poll cycle.
- Every 12h, `[STARTUP] Availability sync scheduled` (`src/index.ts:293-304`) iterates ~60 properties and calls `guestyClient` for each, **hammering the OAuth token endpoint past the 5-per-day cap**. Result: `429` on every subsequent poll (`[Poller] Poll #2581 failed`) and every availability sync (`[AvailSync] Error syncing MV-1: ...`).
- `[Breezeway] Sync failed: Client error: 404` every 15 min — `index.ts:313-323` `syncTasks`. Hardcoded tenant id `00000000-...-0001`, likely no Breezeway integration for that tenant. Cheap noise but should be silenced.

**Latent code bug — independent of current uptime:**
- `src/services/draft-generator.ts:243` reads `bv.brandIdentity.voiceDescription`, but `knowledge/brand-voice.json` (schema v2.0.1, "LOCKED" 2026-05-13) is **now flat — no `brandIdentity` object exists**. `formatBrandVoiceRules` is called on every draft generation (line 618). This **will** throw `TypeError: Cannot read properties of undefined (reading 'voiceDescription')` the next time `generateReply` runs against this brand-voice file.
- Why hasn't it hit in 2 days? Either: (a) no inbound messages have triggered draft generation since 2026-05-13, or (b) Guesty 429s have stopped polling, so no new inbound messages enter the pipeline → no drafts → no crash. **Once 429s clear, the next poll will crash the draft.**

**Priority 1A reframe for FAD owner:** Crash IS in the code at `draft-generator.ts:243`; not yet observed because the upstream poller is rate-limited dead. Fixing 429s will re-expose the crash. Both need addressing before FAD inherits this pipeline.

- Poller throttling driver: `services/poller.ts:97`
- AvailSync flood: `index.ts:293-304`
- Breezeway 404 spam: `index.ts:313-323`

Also note `[Consult] Missing property knowledge for MV-1` — this is a *warning*, not a crash. `consult.ts:222` graceful path: `missingKnowledge: true` flag in response (`:944`), tracked in `consult_sessions.missing_knowledge`. Knowledge dir has e.g. `KS-5.json` but no `MV-1.json` — just an unprovisioned property card. Port-as-is.
