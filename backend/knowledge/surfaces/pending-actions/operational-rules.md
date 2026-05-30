# Operational Rules

## OP-1: Semantic Deduplication

Surface one signal per discrete need per conversation. Before creating, check for semantically similar open or recently-closed (within 6 hours) signals. If match exists, update existing rather than create new.

Suppress: Duplicate check-in instructions, duplicate follow-up reminders within 6h.
Permit: First-time signal, materially different signal type in same conversation.

## OP-2: Team-Activity-Aware Suppression

Defer signal creation when team posted within 10 minutes of analyzer firing. Re-check at write time, not after creation.

Suppress: Active issue when team replied 7 minutes before analyzer firing.
Permit: Most recent post is from guest, or team post was >10 minutes ago.

## OP-3: No Conditional or Passive State as Task

Action text describes immediate executable next step. Conditional, future-dependent, and passive-state candidates are suppressed.

Suppress: "If guest confirms email change, resend instructions", "Await company name from Emmeline", "Monitor thread for confirmation".
Permit: "Send check-in instructions on May 1 at 10 AM", "Process EUR 30 goodwill refund through Airbnb today".

## OP-4: No Embedded Assignment

Describe WHAT, never WHO. Names do not appear as leading words or embedded assignees.

Suppress: "Mathias: call the guest", "Bryan to inspect AC", "Ishant should approve refund".
Permit: "Call guest about availability", "Inspect AC unit", "Approve refund".

## OP-5: Reservation-Aware Inquiry Followup

Surface inquiry_followup only for unconfirmed reservations where conversion is possible. Auto-dismiss when check-in passed or calendar unavailable.

## OP-6: Task-Only Classification

Analyzer classifies as task, observation, or watch-list. Only tasks pass to team workflow. Observations feed learning loop.

## OP-7: STR Voice Discipline

Professional STR industry voice. No "do the needful", bare pronouns, team abbreviations.

## OP-8: Data Context Integrity

Verify fresh ground-truth across: reservation context, pricing, team availability, property capabilities, cross-thread context. Defer to team when required context unavailable.