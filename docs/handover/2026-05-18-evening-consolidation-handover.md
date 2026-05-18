# ACP Brief: FAD next session — post 2026-05-18 evening consolidation

You're picking up after a Sunday-evening consolidation session that
retired two parallel web-Claude sessions (GMS/KB + FAD/Consumer) and
folded everything into FAD code-session ownership. This brief
sequences what to tackle and points at the canonical docs.

Distinct from `2026-05-18-NEXT-SESSION-PROMPT.md` which captures a
different earlier handoff in this same day.

## 1. Working directory + branch
- **Branch:** `fad-design-os-v01-frontend`
- **Worktree:** `/Users/judith/repos/friday-admin-dashboard/.claude/worktrees/fad-design-os`
- **HEADs at session close**: `4e88d00` on `fad-design-os-v01-frontend`; `f1edae8` on `fad-rebuild` (main repo); `e81b70a` on friday-gms `master`.
- **Frontend deployed:** `4ee61c6` per `curl -s https://admin.friday.mu/version.json`.

## 2. Cold-open checklist

```bash
cd /Users/judith/repos/friday-admin-dashboard/.claude/worktrees/fad-design-os
git fetch origin && git status
git log --oneline -20
curl -s https://admin.friday.mu/version.json
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu 'pm2 list'
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu \
  'pm2 logs fad-backend --lines 200 --nostream 2>&1 | grep -E "guesty/webhook/msg|guesty/poller" | tail -5'
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu 'cat /var/www/friday-gms/.guesty-token-meta.json'
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu \
  'set -a && . /var/www/fad-backend/.env && set +a && psql "$DATABASE_URL" -c "SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '"'"'24 hours'"'"') AS last_24h FROM action_feedback;"'
```

## 3. Canonical docs to read first (in order)

1. **Consolidated FAD/GMS Roadmap — 2026-05-18** — `docs/roadmap/2026-05-18-consolidated.md` on `fad-rebuild` (commit `800222c`). Notion mirror: `36443ca8849281e38052fb6d67343f74`. TL;DR + 6 time-horizons + 13-row open-decisions table + 20 anti-goals.
2. **GMS/KB Final-State Handover** — Notion `36443ca8849281f2b5effb59d6980aa9`. Sprint 9 status, Sprint 10/11 KB roadmap, comprehensive open-questions.
3. **FAD External Connections Audit** — `EXTERNAL-CONNECTIONS-AUDIT-FAD-2026-05-18.md` on `fad-rebuild` (commit `22a2dfd`). Pairs with website audit. Drives the FAD-as-single-source-of-truth architecture.
4. **Running Decisions Log §5.7 / §5.8 / §5.9** — Notion `34f43ca88492819f8284ea6a89e8624e`. Don't re-litigate.
5. Memory dir at `~/.claude/projects/-Users-judith-repos-friday-admin-dashboard/memory/` — note today's new `git_author_convention.md` and the corrected `fad_access_and_auth.md` (admin.friday.mu is canonical).

## 4. State of prod (verified 2026-05-18 evening UTC)

**Healthy:**
- Guesty webhook delivering (real ObjectIds, latest ~30 min before close)
- Token cache shared cross-process (post hotfix `e26ad0c`). ~1 mint/24h.
- Auto-summarizer gate HOLDING. Verified.
- consult.ts cap fix (10→20) NOW IN MASTER (committed as `e81b70a` today — the prod drift is closed).
- Defensive UUID filter live.
- Resend wired in fad-backend `.env`. Anthropic wired. fad-backend restart 134.

**Active but dormant:**
- FAD outbound `/api/outbound/send`: zero FAD-UI-originated sends since 2026-05-17. Team uses Guesty UI for outbound because WhatsApp templates can't fire via Guesty API.
- Learning loop Stage 1 (`action_feedback`): 472 rows, 162 in last 7 days. Heavily active. Stage 2 Analyzer scheduler **has never fired** — biggest unlock.

**Anomalies left intentionally:**
- Shadow log only firing on `inbox-drafts` (47 entries); other surfaces empty. Likely OBSOLETE because composer moves to FAD anyway. Read the 47 entries when convenient.
- `session-summary.ts` un-gated secondary summarizer — intentionally out of scope per Ishant.

## 5. Priority queue

### P0 (this week)

1. **Read the 47 entries in `/var/www/friday-gms/logs/composer-shadow.jsonl`** → decide Phase 4 (composer old→new) or skip to FAD-rebuild. ~30 min.
2. **Stage 2 Analyzer scheduler design** — build on FAD (decided 2026-05-18). Cron-style worker reading `action_feedback`, clustering, writing `analyzer_candidates`. Investigate-before-implement: write a proposal doc first. ~half-day investigation, ~2-3 days implementation.
3. **WhatsApp template Playwright job** — unblocks 100% FAD outbound. Mirror night-session scrapers' pattern. ~half-day v1.
4. **F3 push notifications backend** — queued, now unblocked. Proposal at `docs/handover/2026-05-18-push-notifications-proposal.md`. ~1h 25m.
5. **Ishant's dictation PWA-vs-tab test** — outstanding. Tell him to test `admin.friday.mu/fad` in regular Chrome tab. If `network` error appears there too, VPN/DNS not PWA.

### P1 (next 2 weeks — Phase 1 of the merge)

Per Roadmap §5.2: `/api/auth/token` JWT issuer, `/api/public/listings`, calendar sync (new `guesty_calendar` table + sync function + webhook subscriber), Atlas update session.

### P2 (Sprint 10 — June)

Per Roadmap §5.3. KB-side: auto-summarizer follow-through, GBH-C6 fallback, multi-stay regression, Stage 2 Analyzer ship, `tenant_id` on learning tables. Plus `/api/public/availability`, `/api/public/email`, `/api/public/ai/chat`, friday-gms archival prep.

## 6. Parallel session running right now

A **bootstrap-optimization session** is wiring Notion content into the FAD code-session auto-bootstrap (Path A inline + Path B memory hybrid per `docs/handover/2026-05-18-bootstrap-optimization-brief.md`). Read-only on FAD; only edits `friday-admin-dashboard/CLAUDE.md` and memory files. Don't conflict — if you see uncommitted state in those paths on cold-open, rebase on `origin/fad-rebuild` before any commit.

## 7. Pending Ishant inputs

- **OpenRouter key disposition** — no FAD/website consumer. Put in 1Password / Notion vault.
- **Upstash provisioning on friday.mu Vercel** — still on Ishant. Until done OR `/api/auth/token` ships, website's cold-start Guesty mints continue.
- **GBH-C6 KB content** — needs writing for syndic-aware fallback (Sprint 10).
- **Stage 2 Analyzer ownership** — confirmed: build on FAD.

## 8. Anti-goals

- Don't touch friday-gms consult.ts / draft-generator.ts / KB-loading. After `e81b70a` today, treat consult.ts as frozen until FAD migration replaces it.
- Don't chase missing shadow-validation surfaces. Mechanism is obsoleted by FAD migration.
- Don't push to `main` or `fad-rebuild` without explicit say-so. FAD work continues on `fad-design-os-v01-frontend`.
- Don't speculatively mint Guesty OAuth tokens in test code. At ~1/5 today.
- Don't pull Sprint 9 GMS wholesale — KB JSON files transfer; `shadow-logger.ts` + multi-surface validation become obsolete.
- Don't add `OPENAI_API_KEY` back — confirmed dead. AI stack: Anthropic + Kimi + Gemini.

## 9. Style + workflow

- Terse responses to Ishant. No filler. Push back with reasoning.
- Direct push to `fad-design-os-v01-frontend`. No PRs.
- Commits authored "Judith Friday <judith@friday.mu>" with `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` trailer.
- `git fetch origin` before non-trivial action.
- UI changes: Playwright verify against admin.friday.mu (Ishant has password).

Re-read on disk: `docs/handover/2026-05-18-evening-consolidation-handover.md`
