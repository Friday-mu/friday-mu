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

**2. One "Friday", no model names — ⚠ mostly, but real surfacings found (judgment calls, NOT auto-fixed).**
No model-**picker** UI, and the *core* Friday assistant (Ask Friday, Inbox/Ops consult) surfaces no model names. **But** the **Design module** + one **Reviews** string do name models visibly:
- `design/MoodboardImageGenerator.tsx:218` — "Powered by Nanobanana (Gemini 2.5 Flash Image)" (visible).
- `design/MoodboardImageGenerator.tsx:263` — "Kimi unavailable — using template fallback" (visible failure state).
- `design/FloorPlanStudio.tsx:538-539` — "Gemini key missing…" / "Gemini not available" (visible).
- `design/stages/MoodboardStage.tsx:319` — title "…Nanobanana (Gemini 2.5 Flash Image)".
- `design/stages/RoughBudgetStage.tsx:610` — "Kimi grounds the result against Friday's…".
- `reviews/SettingsPage.tsx:256` — "All FAD AI work … runs through Kimi".

**Judgment, for Ishant — not auto-fixed:** the locked decision was framed around the *Ask Friday assistant* (no model picker, don't brand Friday's intelligence by model). These cases are arguably different — feature attribution for image-gen ("Nanobanana/Gemini"), and honest *failure* states ("Kimi unavailable"). Whether "one Friday, no model names" extends to (a) the Design image-gen feature and (b) failure-state copy is a real call. Options: (i) rename all to "Friday" / "the image model" / generic; (ii) keep image-gen attribution but genericise the Reviews/Settings + failure strings; (iii) leave as-is (these aren't the assistant). Flag, don't silently change.

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
