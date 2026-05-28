# Ask Friday Website Public Wiring Prompt

Date: 2026-05-28
Status: paste-ready prompt for a separate Friday Website session
Source branch: `codex/ask-friday-continuation-20260528`
Latest source commit when written: `3fe578d0`

## Prompt

You are continuing Ask Friday Website public wiring.

Repo:

- `/Users/judith/Friday Website`

Important coordination:

- Work in a fresh Website worktree/branch from latest Website `origin/master`.
- Do not edit the active FAD checkout or FAD branch in the Website session.
- Do not deploy unless Ishant explicitly says deploy.
- User-facing global AI surface is Ask Friday.
- Ask Friday Core is the FAD-owned runtime/control plane.
- FridayOS is the whole platform/product.
- Do not write the retired/wrong assistant label anywhere.

Read first:

- FAD contract doc: `/Users/judith/.codex/worktrees/ask-friday-continuation-20260528/docs/architecture/ask-friday-public-owner-feedback-contracts-2026-05-28.md`
- FAD source matrix: `/Users/judith/.codex/worktrees/ask-friday-continuation-20260528/docs/architecture/ask-friday-website-owner-feedback-source-matrix-2026-05-28.md`
- FAD Core v1: `/Users/judith/.codex/worktrees/ask-friday-continuation-20260528/docs/architecture/ask-friday-core-v1-2026-05-23.md`
- Website handoff docs:
  - `/Users/judith/Friday Website/docs/FAD-PROMPT-WEBSITE-AI-HANDOFF-2026-05-22.md`
  - `/Users/judith/Friday Website/docs/ASK-FRIDAY-CONTEXT-ROUTER-2026-05-22.md`
  - `/Users/judith/Friday Website/docs/ASK-FRIDAY-LIVE-QA-2026-05-22.md`
- Website runtime sources:
  - `/Users/judith/Friday Website/lib/ask-friday/handoff.ts`
  - `/Users/judith/Friday Website/lib/ask-friday/scrub.ts`
  - `/Users/judith/Friday Website/lib/ask-friday/tool-schemas.ts`
  - `/Users/judith/Friday Website/lib/ownerEnquiry.ts`
  - `/Users/judith/Friday Website/knowledge/surfaces/hero/SKILL.md`
  - `/Users/judith/Friday Website/knowledge/surfaces/owner-enquiry/SKILL.md`
  - `/Users/judith/Friday Website/knowledge/surfaces/feedback-fab-bug/SKILL.md`
  - `/Users/judith/Friday Website/knowledge/surfaces/feedback-fab-feature/SKILL.md`

FAD/Core branch state to account for:

- `9287c841 docs(ask-friday): define public owner feedback contracts`
- `207c6ca0 test(ask-friday): cover public owner feedback policies`
- `c13aae23 test(ask-friday): cover public action requests`
- `3fe578d0 feat(ask-friday): seed public contract evals`

Goal:

Wire Website public Ask Friday surfaces to Ask Friday Core without changing the visible user experience unless strictly needed.

Implementation scope:

1. Add a small Website adapter for `GET /api/ask-friday/core/context-packs/:surfaceId`.
   - Use published packs only.
   - Use the existing local Website KB as fallback if pack fetch fails or returns 404.
   - Record `contextPackStatus` and `contextPackVersion` for future events.
   - Do not allow staff/private scopes into public prompts.
2. Add compact redacted learning-event emission to FAD Core `POST /api/ask-friday/core/events`.
   - Start with guest hero/FAB, owner enquiry, and feedback FAB if the local architecture allows it safely.
   - Use summaries, tool names, knowledge scope names, handoff state, and evidence refs.
   - Do not send raw transcripts, raw screenshots, raw diagnostics, access codes, payment data, secrets, guest-sensitive data, owner-private data, or staff workload.
3. Map owner enquiry extraction into an `owner_lead_capsule`.
   - Preserve the current Website owner flow and readiness threshold.
   - Redact contact details in learning events.
   - Use action request or existing handoff path for staff follow-up; do not promise revenue or legal/tax outcomes.
4. Map feedback submissions into a `feedback_evidence_capsule`.
   - Keep screenshots as evidence refs or restricted storage references.
   - Preserve multi-screenshot support if present.
   - Do not let feedback content publish memory directly.
5. Preserve handoff/takeover behavior exactly:
   - `human_takeover` or `aiMayReply:false` stops Website AI replies.
   - Visitor follow-ups after takeover go to the FAD visitor-message proxy, not Ask Friday.
   - Staff messages from FAD render as team replies.

Suggested implementation order:

1. Inspect current Website environment variables and FAD public API client pattern.
2. Add typed client helpers only; keep call sites unchanged until helper tests pass.
3. Wire context-pack read with local fallback.
4. Wire learning-event emission behind a non-blocking failure path.
5. Add owner capsule mapping.
6. Add feedback evidence mapping.
7. Add tests for:
   - context pack success;
   - context pack 404 fallback;
   - event redaction;
   - takeover suppression;
   - owner lead ready capsule;
   - feedback evidence refs;
   - no staff/private scope leakage.
8. Run Website typecheck/build and targeted tests.
9. Report exact files changed and do not deploy.

Hard no-go:

- No direct self-updating production truth.
- No public context from staff-private FAD records.
- No direct booking/payment/OTA write.
- No durable personalization without auth or explicit consent policy.
- No raw screenshot/diagnostic dump into Ask Friday Core events.
- No second FAD implementation branch from the Website session.

