# ACP Brief: FAD next session — post 2026-05-18 late handover

You're picking up after a long, productive Sunday session that ran from
the morning's "inbox stale" investigation through Stage 1 public-API
unblock, Stage 2 inbox-completeness port, Stage 3 plan + Phase 3.0 KB
foundation. **The big strategic shift today was Ishant lifting the
brief §8 anti-goal — consult.ts / draft-generator.ts / KB-loading are
no longer frozen.** Stage 3 is unblocked.

Distinct from the earlier-in-the-day evening-consolidation handover
(`2026-05-18-evening-consolidation-handover.md`).

## 1. Working directory + branch

- **Branch:** `fad-design-os-v01-frontend`
- **Worktree:** `/Users/judith/repos/friday-admin-dashboard/.claude/worktrees/fad-design-os`
- **HEAD at session close:** `954b1e8` (public-API listing DTO expanded for website's zero-touch publishing — 8 new fields projected from raw JSONB)
- **fad-backend deployed:** matches HEAD, restart count #148
- **friday-gms deployed:** `c2eb781` (dedup fix earlier today), pm2 restart #3208 — stays running through Stage 3, intelligence-layer routes still proxy here
- **Frontend deployed:** `0de257b-fix` (sent-by + channel display, env-var-corrected build)

## 2. Cold-open checklist

```bash
cd /Users/judith/repos/friday-admin-dashboard/.claude/worktrees/fad-design-os
git fetch origin && git status
git log --oneline -25
curl -s https://admin.friday.mu/version.json
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu 'pm2 list'
# Smoke-test the new public-API surface:
TOKEN=$(curl -s -X POST https://admin.friday.mu/api/auth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=friday-website&client_secret=$WEBSITE_SECRET" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin).get("access_token",""))')
curl -s -H "Authorization: Bearer $TOKEN" https://admin.friday.mu/api/public/listings | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["listings"]),"listings")'
# Translation worker health:
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu 'pm2 logs fad-backend --lines 100 --nostream 2>&1 | grep translation | tail -5'
# Disk check (was 89% at session close — watch this):
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu 'df -h / | tail -1'
```

## 3. Canonical docs to read first (in order)

1. **Stage 3 plan** — `docs/handover/2026-05-18-stage3-intelligence-layer-plan.md` (commit `c2bfd4f`). 7 phases, dependencies, risks, the 4 decisions Ishant already made (KB in `backend/knowledge/`, Kimi for drafts, parallel burn-in 3-5d, archive only after Phase 3.7 + 2-week burn-in). **Don't re-litigate these.**
2. **GMS → FAD-native rebuild audit** — `docs/handover/2026-05-18-gms-rebuild-audit.md` (commit `cd0fc3a`). Original audit memo that gated the decision to port intelligence layer.
3. **Phase 4 (composer cutover) decision** — `docs/handover/2026-05-18-phase4-decision.md` (commit `7ceade8`). Why GMS shadow-logger is obsolete + the structured-loader pattern proof.
4. **Evening consolidation handover** — `docs/handover/2026-05-18-evening-consolidation-handover.md` (commit `4c25d98`). The earlier handover from this morning. Some items there are now stale (Stage 1 done, Stage 2 done, anti-goal lifted) but the structural framing is still correct.

## 4. State of prod (verified 2026-05-18 late session)

**Live + working (verified):**
- 14 inbox CRUD routes FAD-native (list, search, filters, detail, messages, drafts, channels, reservation, read/unread/status, drafts/queued, drafts/:id)
- Inbound auto-translation worker — `backend/src/inbox/translation_worker.js`, 60s cadence, 10-row batches, draining well
- Webhook handler upgraded to mirror all 10 GMS edge-case scars (attachments, reactions, system pings, auto-responses, module_type, auto-reopen, etc.)
- Outbound send via fad-backend's own Guesty client — `backend/src/inbox/drafts_send.js`. Translates EN→guest-lang via thin Kimi call. ON CONFLICT dedup against webhook race.
- 4 draft state mutations native: reject, retry, fail, dismiss
- Public API Stage 1: `POST /api/auth/token` + `GET /api/public/listings` + `GET /api/public/listings/:nickname`. friday-website client minted (`8eb6d92a...`).
- **Zero-touch publishing policy locked** (Ishant, 2026-05-18 late). Website drops `_seed/properties.json` whitelist; FAD becomes single source of truth for what appears on friday.mu. Listing DTO expanded to 36 keys (gallery, lat/lng, description, summary, space, amenities, houseRules, checkInTime, checkOutTime, address.street/zipcode/state, reviewsCount, reviewsAvg) all projected from `guesty_listings.raw` at query time — commit `954b1e8`.
- KB composer at `backend/src/knowledge/composer.js` — byte-identical to GMS for same input (verified MD5)
- Sender + via-channel display in inbox bubbles
- Send dedup (GMS-side drafts.ts now captures guesty_message_id)

**Still proxied to friday-gms (intelligence-layer, to be ported in Stage 3):**
- `POST /api/inbox/drafts/:id/revise` (triggers draft regen)
- `POST /api/inbox/conversations/:id/compose` (manual + AI draft compose)
- `POST /api/inbox/conversations/:id/translate` (manual; auto-worker handles normal use)
- `POST /api/inbox/conversations/:id/send-template` (WhatsApp template browser fallback — deferred to Stage 3 due to 89% VPS disk)
- `POST /api/inbox/consult/*`
- `POST /api/inbox/teachings/*`
- Background workers in GMS: `triggerDraftGeneration`, action-detector, learning-collector, auto-summarize, auto-resolve

**Pending external action (Ishant):**
- `vercel env add FAD_PUBLIC_API_CLIENT_ID` + `FAD_PUBLIC_API_CLIENT_SECRET` on the friday.mu Vercel project. The website's dormant cutover (`fadEnabled()` gate, their commit `e24aef8`) activates the next cold function start once these land.

## 5. Priority queue

### P0 — Stage 3 (intelligence layer port)

Per the plan doc. Phase order:

| Phase | Effort | What it ships |
|---|---|---|
| **3.0 KB composer** ✅ done | — | Foundation. byte-identical to GMS |
| **3.4 auto-summarize + auto-resolve** | ~1-2 days | Independent of KB. Fast first win. Recommended starter. |
| **3.2 action detector** | ~2-3 days | Pending-action alerts on inbound. Uses KB. |
| **3.1 draft generator** (Kimi-backed) | ~3-5 days | Biggest user-visible win. Parallel-run with GMS 3-5d burn-in before cutover. |
| **3.3 followup-draft generator** | ~2-3 days | Proactive re-engagement |
| **3.5 consult / Ask Friday** | ~3-5 days | The chat-with-Friday feature |
| **3.6 teachings + learning-collector** | ~3-5 days | Capture rejections / revisions / explicit teachings |
| **3.7 learning-analyzer** | ~3-5 days | Stage 2 of the feedback loop |

After 3.7 + 2-week zero-rollback burn-in → archive friday-gms per roadmap §5.4.2.

### P1 — Stage 4 (rest of public API, when intelligence layer is done OR if web team blocks)

- Calendar sync infra (`058_guesty_calendar.sql` + sync function + webhook handlers + nightly backfill) — task #3 — unblocks `/api/public/availability`
- `/api/public/availability` — task #6
- `/api/public/email`, `/api/public/ai/chat`, `/api/public/returning-guest`, `/api/public/experiences/*`, `/api/public/events` (SSE) per roadmap §5.3

### P2 — Outstanding small items

- **Streaming dictation upgrade** (task #7) — Gemini Live / Deepgram. Ishant prefers live-text UX matching Claude Code's `/voice`. ~6-8h.
- **Claude Code voice conflict diagnosis** (task #8) — was breaking on Ishant's local. Quit-Chrome diagnostic suggested but not run.
- **Rename .env.local → .env.development.local** (task #10) — prevents the localhost-API-baked-into-prod-build bug from recurring.
- **WhatsApp template Playwright port** (task #17) — deferred to Stage 3 window (after disk pressure resolved).

## 6. Decisions already locked (don't re-litigate)

1. **Brief §8 anti-goal lifted.** consult.ts / draft-generator.ts / KB-loading are now in scope for porting. Ishant approved 2026-05-18.
2. **KB lives in `backend/knowledge/`.** One-shot copy from GMS done. GMS copy is frozen — diverging breaks parity.
3. **Kimi (not Anthropic) for draft generation in Phase 3.1.** Ishant overrode my Anthropic recommendation; cheaper. Watch quality on first parallel-run cycle.
4. **Parallel-run GMS + FAD draft generators for 3-5 days** before cutover. Both fire on each inbound; FAD's draft is canonical (shown to user); GMS's is logged silently for diff comparison.
5. **friday-gms archived only after Phase 3.7 + 2-week zero-rollback burn-in.** Per roadmap §5.4.2. Conservative. Don't rush this.
6. **Website session uses option (1) on listings whitelist** — FAD returns all active rows, website filters via their own `whitelistIds` (their `_seed/properties.json`). MV-1 was the 27th; they're adding it to seed. No FAD-side filter work needed.
7. **Bokun namespace stays website-side until Sprint 12** (~Aug 2026). FAD doesn't proxy Bokun in Stage 4.
8. **Email rename `replyTo` → `reply_to`** lands when `/api/public/email` ships in Stage 4.

## 7. Parallel sessions

- **Website (friday.mu) session** — has Stage 1 spec confirmed + their `lib/fad-client/` pre-wired (commit `e24aef8`, dormant behind `fadEnabled()`). Waiting on Ishant to install creds in Vercel. The session continues independently, file relays via Ishant.
- **Bootstrap-optimization session** — read-only, edits `CLAUDE.md` + memory files only. Compatible with everything.
- **Judith / OpenClaw bridge** — earlier this session we routed an inbox-sanity sweep through `openclaw_chat`; her side spawned an ACP that got blocked at the FAD password gate. Ishant sent her the password but no confirmation she actually completed the sweep. Low-priority — we shipped a lot since; whatever she finds is now somewhat stale anyway.

## 8. Pending Ishant inputs

- **Vercel env add for `FAD_PUBLIC_API_CLIENT_ID` + `FAD_PUBLIC_API_CLIENT_SECRET`** — gates the website's cutover. Bookkeeping action; ~2 min.
- **Disk cleanup pass** — VPS at 89%. No immediate fire, but adding background workers in Phase 3.4, 3.7 will tighten it. Worth a `pm2 flush` + `find /var/log -name '*.gz' -mtime +14 -delete` + similar before Phase 3.4 deploys.
- **Send-flow user-side verification** — Ishant said "we'll test later" mid-session. The FAD-native send (drafts_send.js) should work end-to-end with translation + dedup, but it isn't browser-verified yet. Worth ~5 min of his time before Phase 3.1 builds on top.
- **The website-session's pending question** about MV-1 vs the 27th was resolved (MV-1 IS publishable, they're updating seed). No follow-up from us.

## 9. Anti-goals

- **Don't re-introduce silent fallbacks.** Today's wins on visible-error patterns (dictation FAB, inbox error banner) — keep that going.
- **Don't break the byte-identical KB parity** with GMS. Edit `backend/knowledge/` only; GMS copy is frozen.
- **Don't change the public-API envelope shape** without warning the website session. They're typed against the current contract.
- **Don't hard-cut GMS draft-gen** in Phase 3.1 — parallel-run for 3-5 days first.
- **Don't push to main or fad-rebuild** without explicit say-so. FAD work continues on `fad-design-os-v01-frontend`.
- **Don't speculatively add disk-heavy deps** while VPS is at 89%. Playwright port is deferred for exactly this reason.

## 10. Style + workflow

- Terse responses to Ishant. No filler. Push back with reasoning when you disagree.
- Direct push to `fad-design-os-v01-frontend`. No PRs.
- Commits authored "Judith Friday <judith@friday.mu>" with `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` trailer.
- `git fetch origin` before non-trivial action. Other sessions land on this branch occasionally (today: a parallel ⌘⌘ dictation shortcut).
- UI changes: Playwright via `mcp__playwright__browser_*` requires admin.friday.mu password (Ishant has it). Don't ship UI changes blind.
- Use `openclaw_chat` to message Judith via OpenClaw gateway — but **she'll run things on Kimi directly going forward, not spawn ACPs.** Policy DM was sent earlier today.

Re-read on disk: `docs/handover/2026-05-18-late-handover.md`
