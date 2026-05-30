# AI Trust-State Adoption + Locked-Decision Audit — 2026-05-31

Read-only audit run while the M-series (module bodies) is held for per-module design lock.
Turns the briefs' general "most modules import zero trust-kit" claim into a concrete per-module
checklist, and confirms locked-decision compliance after the ConfBar + AIConfidenceChip fixes.

## Locked-decision compliance

**1. Confidence = BAND, never a number — ✓ swept.**
- `ConfBar` (TrustStates.tsx) → 3-segment band + word (`78ef3bf1`).
- `AIConfidenceChip` (AIComponents.tsx) → band word, both callers (AISuggestionCard, Ops TaskDetail) (`f77e17dd`).
- Helper: `confidenceBandOf()` in `ai/aiHealth.ts` (≥80 high · ≥60 medium · else low).
- **Remaining (judgment call, NOT fixed):** `AgencyModule.tsx:254` renders a buyer **"MATCH" score** as `{m.score}%` + an `lq-conf` fill bar. This is a match-quality score, arguably distinct from "AI confidence" — left as-is pending a call on whether match-score counts as confidence.
- **Legitimate `%` (correctly untouched):** all `occupancy_pct` / `share_pct` / ADR / reconciliation-variance / onboarding-checklist-% across Analytics, Owners, Reservations, Properties. Occupancy *is* a percentage — the locked decision is only about AI confidence.

**2. One "Friday", no model names — ✓ clean.**
No user-facing model-name leaks (Gemini / Kimi / Opus / Sonnet / Haiku) anywhere outside tests/comments. No model-picker UI.

## Per-module trust-kit adoption (prep for the M-series)

"Wired" = imports/uses any of SourceTag/SourceChip · ConfBar · SyncChip · StateBanner · Provenance · AITrustStrip · deriveAIHealth · AIConfidenceChip · AISuggestionCard · trustEnvelope.

| Module / surface | Trust-kit wired today? |
|---|---|
| Operations (`OperationsModule` + `operations/TaskDetail`) | ✓ |
| Properties V2 (`v2/PropertiesModuleV2`) | ✓ |
| Reservations (`reservations/ReservationDetail`) | ✓ (detail only) |
| Reviews (`reviews/AllReviewsPage`) | ✓ |
| Agency (`AgencyModule`) | ✓ |
| Tier3 modules (`Tier3Modules` — guests/leads/etc. shared) | ✓ (partial) |
| **Inbox** | ✗ — M-series adds it |
| **Calendar** | ✗ |
| **Owners** (beyond OwnersInsightsPage) | ✗ (insights only) |
| **Guests** | ✗ |
| **Training** | ✗ |
| **Finance** | ✗ |
| **Legal & Admin** | ✗ |
| **Marketing** | ✗ |
| **Leads** | ✗ |
| **HR** | ✗ |
| **Settings / Tenant trio** | ✗ |
| **Analytics** | ✗ (data %, not AI-confidence surfaces) |

The ✗ modules start from zero on trust-state wiring — each M-series slice adds the kit per its
brief's "§7 critical states" mapping. The ✓ modules already have a foothold to extend.

## Known verification gap (not closeable here)
AF7 (GM AskPanel → `/api/friday/ask` + `/actions/execute`) and AF8 (Ops Accept → `updateTask`)
are wired + tsc/build-green + logic-verified, but the **live round-trip is unverified** — the harness
has no backend (`DATABASE_URL` unset, no `backend/.env`). Confirm end-to-end once a backend is up.
