---
name: pending-actions
description: Operational rules for action detection and signal generation.
when_used: Loaded for pending_action and next_step contexts.
version: v2.0
references:
  - operational-rules.md
---

# Pending Actions

Rules enforced at Layer 2 (pre-creation gate) before any signal is written.

## Core Rules

1. **Semantic deduplication** — One signal per discrete need per conversation. Check for semantically similar open or recently-closed (within 6h) signals before creating.
2. **Team-activity-aware suppression** — Defer signal creation when team posted within 10 minutes. Re-check at write time.
3. **No conditional or passive state as task** — Action text describes immediate executable next step. No "if X then Y", "once guest confirms", "await reply", "monitor for response".
4. **No embedded assignment** — Describe WHAT, never WHO. Names do not appear as leading words or embedded assignees.
5. **Reservation-aware inquiry followup** — Surface only for unconfirmed reservations where conversion is still possible. Auto-dismiss when check-in passed or calendar no longer available.
6. **Task-only classification** — Only tasks pass to team workflow. Observations and watch-list signals feed learning loop.
7. **STR voice discipline** — Professional STR industry voice. No "do the needful", bare pronouns without antecedent, team Slack abbreviations.
8. **Data context integrity** — Verify fresh ground-truth across all dimensions before drafting. Defer to team when required context unavailable.