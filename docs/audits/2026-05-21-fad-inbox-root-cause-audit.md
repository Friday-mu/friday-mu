# FAD Inbox Root-Cause Audit — 2026-05-21

Source artifacts:
- Full feedback export: `/tmp/fad-root-cause-audit/all-feedback.json`
- Inbox bug export: `/tmp/fad-root-cause-audit/inbox-bugs.json`
- Screenshot contact sheets: `/tmp/fad-root-cause-audit/inbox-bug-contact-1.jpg` through `inbox-bug-contact-6.jpg`

## Pattern Summary

The reported Inbox bugs were not random. They clustered into four root causes:

1. **Partial GMS → FAD migration contracts**
   - Old `reservations` and conversation columns still power Inbox context, while live reservations now live in `guesty_reservations`.
   - Result: old conversation property context can remain visible after a guest moves to a new/current stay.

2. **Long-context model failure treated as final failure**
   - Consult now has compact fallback, but draft generation did not.
   - Production logs showed `finish_reason=length` and 90s Kimi timeouts causing `generation_failed` instead of a smaller retry.

3. **AI-generated summaries are not trustworthy enough as primary context**
   - A few conversations contain prompt-failure summaries like "I'm ready to help summarize..." in `conversation_summary`.
   - Alessia's reported case is a semantic summary error: the prior summary inverted guest intent.
   - Root fix: actual messages must outrank summary in prompts; known prompt-failure summaries must be filtered from UI and AI context.

4. **Consult UI was open by default**
   - The panel opened on every thread switch even with no draft, no chat history, and no pending query.
   - That made unrelated empty space look like a broken Consult state, especially on mobile.

## Changes Made In This Pass

- Added a compact draft-generation fallback for Kimi `length`, timeout, and 5xx-style transient failures.
- Added a current-reservation context resolver for Inbox detail, draft generation, and Consult. It can prefer a single current Guesty reservation over a stale legacy conversation reservation.
- Filtered unusable prompt-failure summaries out of backend AI context and frontend display.
- Stopped opening Friday Consult by default on empty thread switches. It still auto-opens for new active drafts and explicit Ask Friday actions.

## Remaining Follow-Up

- Regenerate or clear known bad factual summaries, including Alessia Barbetta, after choosing the summary job strategy.
- Decide whether old GMS compatibility routes (`/api/conversations`, `/api/ai/consult`) should be removed or hard-redirected; they still produce noisy logs when old surfaces hit them.
- Build the broader aggregated "Awaiting reply" cross-module queue as a feature, not an Inbox-only bug fix.
