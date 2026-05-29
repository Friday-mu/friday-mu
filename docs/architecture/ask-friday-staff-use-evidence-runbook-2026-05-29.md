# Ask Friday Staff-Use Evidence Runbook

Date: 2026-05-29
Status: execution runbook

## Purpose

This runbook defines what counts as "team-useful" proof for the active staff Ask Friday surfaces.

Automated tests prove guardrails. Staff-use evidence proves the agents help Mary, Franny, or Ishant complete real work without creating new operational risk.

## Rules

- Test on live production only when the deployed SHA is recorded first.
- Do not treat API success as staff-usefulness.
- Do not mark a surface team-useful from a single happy-path answer.
- Capture enough evidence to reproduce the workflow: user, module, prompt shape, source objects, output, action taken, and any correction needed.
- Do not paste raw guest-private, owner-private, payment, access-code, or staff-performance data into public docs. Use redacted summaries and internal links only.
- A model answer that needs staff correction can still be useful, but record the correction as a learning candidate or eval gap.

## Evidence Fields

Each staff-use entry should record:

| Field | Required | Notes |
|---|---:|---|
| `date` | yes | Exact date/time in Mauritius time when possible. |
| `deployedSha` | yes | Frontend/backend SHA from `/version.json` and `/api/version`. |
| `surface` | yes | `fad_consult`, `fad_ops_assistant`, or `fad_global_ask_friday`. |
| `staffUser` | yes | Mary, Franny, Ishant, or other staff. |
| `workflow` | yes | Example: guest reply, weekly roster, urgent occupied-property triage. |
| `sourceObjects` | yes | Redacted thread/task/property/reservation references. |
| `promptShape` | yes | Summary, not raw private prompt if sensitive. |
| `outputType` | yes | Draft, review, schedule, action suggestion, navigation help, explanation. |
| `staffAction` | yes | Accepted, edited, rejected, used as reference, or ignored. |
| `timeToUseful` | recommended | Approximate minutes saved or time spent. |
| `riskFound` | yes | None, minor correction, major error, unsafe action, missing context. |
| `followUpArtifact` | yes if needed | Bug, KB candidate, eval case, or doc note. |

## Plan 1 Acceptance Gates

### Inbox / Friday Consult

Minimum proof:

1. Mary or Ishant uses Consult to review an existing guest thread without creating an unwanted draft.
2. Mary or Ishant uses Consult to draft or revise a guest reply and the draft card is structurally usable.
3. The output respects the latest guest turn, channel/timer state, property/reservation context, and existing teachings.
4. Staff can either send after review or reject/edit without fighting the UI.

Failure conditions:

- Creates a draft when explicitly asked not to.
- Uses stale thread context over the latest guest turn.
- Leaks raw JSON/envelope text.
- Suggests direct send without human review.
- Fabricates property, reservation, refund, payment, or platform facts.

### Ops / Friday Consult

Minimum proof:

1. Franny uses Ops Consult for a daily or weekly plan with real visible tasks.
2. The plan assigns every visible task or explains why a task is blocked.
3. The plan respects occupancy, checkout timing, travel/load constraints, and lunch/break coverage.
4. Any apply action remains reversible or staff-approved.
5. Availability/pricing uncertainty is named when cache proof is missing.

Failure conditions:

- Leaves visible work unassigned without an explicit blocker.
- Schedules non-urgent work during guest occupancy.
- Treats missing calendar/pricing cache as proof.
- Applies or implies a mutation that staff did not approve.
- Produces a plan too vague for field execution.

### Global FAD Ask Friday

Minimum proof:

1. Staff asks from an Inbox, Ops, TeamInbox, Reservations, or Properties context and the answer uses the page-focus envelope correctly.
2. TeamInbox content is treated as staff discussion evidence, not canonical operational truth.
3. Global Ask Friday routes to the smallest relevant module context before broad summaries.
4. Action suggestions respect surface policy and remain approval-gated.

Failure conditions:

- Treats TeamInbox discussion as confirmed task/reservation truth.
- Uses unrelated module context despite page focus.
- Suggests disallowed actions.
- Fails to state source staleness/missing context.

## How To Record Results

Add a dated note under `docs/architecture/ask-friday-completion-ledger-2026-05-26.md` with:

- deployed SHA;
- surface and staff user;
- pass/fail summary;
- exact follow-up artifacts created.

If the evidence creates a new product bug, put it in the bug queue first and link the bug ID from the ledger.

## Current Open Evidence Needs

- Mary: Inbox Consult review-only and draft-card usefulness.
- Franny: Ops weekly roster and daily schedule usefulness.
- Ishant: global Ask Friday page-focus and TeamInbox context usefulness after the unified right-panel UI lands.
