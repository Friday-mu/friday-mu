# FAD V2 Implementation — Slice 1: AI Trust-State Vocabulary

Date: 2026-05-30
Branch: `claude/fad-v2-ai-trust-states-20260530` (off `origin/fad-rebuild` @ `69e048d2`)
Worktree: `/Users/judith/.codex/worktrees/fad-v2-ai-trust-states-20260530`
Author: autonomous Claude Code session (Ishant not reachable; ACP rules in effect)

## Why this slice first

The V2 design package names the AI trust/failure-state vocabulary (`fad-states.jsx`) as
**"THE core requirement — do not skip."** It is a shared pattern (the package says to start
with a shared pattern, not a repo-wide rewrite), it sits in the Ask-Friday lane (low collision
with the live Operations redesign), and it can be driven by **real** backend signals rather
than the prototype's manual simulator. Highest leverage, lowest risk → slice 1.

## What was already in the repo (reconciled, not rebuilt)

- **V2 tokens already present** in `frontend/src/app/fad/gm-desktop.css` (`:root`) — exact match
  to the design's `fad-desktop.css` (`--bg/--card/--indigo/--green/--red/--amber/...`, fonts
  Newsreader/Hanken/JetBrains, `--r:13px`). No token work needed.
- **Source-provenance chips already present** in gm-desktop.css: `.srcgy` (Guesty), `.srcbz`
  (Breezeway), `.srcfr` (Friday), `.srcmodel`, `.srcstale`, `.srcfail`. Left as-is.
- **`_components/ai/AIComponents.tsx`** exists but uses the **legacy `--color-*` token system**
  (not V2). Left intact (used elsewhere); the new V2 trust components are separate.
- **Backend already emits the real signals** (no new backend needed for slice 1):
  `/api/friday/ask` returns `confidence` (band), `sourcesUsed[]`, `fallbackUsed`, and
  `contextSummary.sourceStatus[]` (`{name, ok, source:{freshness,checkedAt}, error}`).
  Inbox/Ops consult return numeric `confidence` + `fallbackUsed`.

## What was built

| File | What |
|---|---|
| `frontend/src/app/fad/_components/ai/aiHealth.ts` | Pure logic: `AIHealthState`, `deriveAIHealth(signals)` (failed>fallback>partial>stale>healthy from real signals), `confidencePct` (band→discrete level, no fake precision), `provenanceItems`. |
| `frontend/src/app/fad/_components/ai/TrustStates.tsx` | `SyncChip`, `Provenance`, `ConfBar`, `StateBanner`, `AITrustStrip` — ported from `fad-states.jsx`, V2 classes, self-contained glyphs. |
| `frontend/src/app/fad/gm-desktop.css` | Appended `.syncchip/.prov/.confbar/.statebanner/.aitrust` + `@keyframes pulseDot`, ported verbatim from the design CSS (unscoped — tokens live on `:root`, and the Ask Friday drawer renders outside `.dwrap`). |
| `frontend/src/app/fad/_components/FridayDrawer.tsx` | Wired the global Ask Friday panel: stores `fallbackUsed` + `sourceStatus` on each answer, derives `aiHealth`, renders `StateBanner` above the answer + `AITrustStrip` (sync/confidence/provenance) below. Replaced the old ad-hoc `confidence · …` chips. |

**No simulator shipped.** The design's manual `AIStateToggle` was deliberately NOT ported —
states come from real response signals (per the design README's production requirement).
No demo fixtures added → no `DEMO_CRUFT.md` row needed (the `PROD-AI-TRUST-1` marker in
comments is a traceability tag, not demo cruft).

## Verification

- `npx tsc --noEmit`: **0 errors** (clean).
- `npm run build`: see commit/CI — run with real `node_modules` (a symlinked node_modules
  fails under Turbopack: "Symlink node_modules is invalid").
- **Visual QA NOT done** — a logged-in desktop+mobile sweep needs a deploy or an
  authenticated dev server; not feasible headless this session. **This is the gate before
  merge.** Pixel-parity is high-confidence by construction (CSS ported verbatim).

## Parked / follow-ups (for the next session or Ishant)

1. **Apply to all AI surfaces** (design requires it): Inbox consult (`FridayConsult.tsx`),
   Ops Daily Brief, Training/Learnings, TeamInbox. Slice 1 did the global Ask Friday panel
   (`FridayDrawer`) only. The components are reusable; wiring each is small but per-surface.
2. **Retry / Re-sync handlers**: `StateBanner` supports `onRetry`/`onResync` but they're
   unset in `FridayDrawer` (no dead buttons). Wire them to re-issue the question / force a
   context re-sync.
3. **`partial`/`stale` depend on backend signal completeness**: `friday.js` populates
   `contextSummary.sourceStatus`; confirm the consult endpoints emit the same `{ok, freshness}`
   shape before relying on partial/stale there.
4. **SyncChip freshness**: currently shows "Synced · just now" for healthy; could show the
   real relative time from `sourceStatus[].source.checkedAt`.
5. **Merge + deploy**: NOT auto-merged to `fad-rebuild` and NOT deployed. The Operations
   redesign fleet is active on the shared branch and verify-before-done requires visual QA.
   Recommend: Ishant (or next session) does the visual sweep, then merge `fad-rebuild` and
   deploy FE+BE from the same SHA. (Backend unchanged this slice → FE-only deploy is safe
   here, but follow the paired-deploy rule if anything else lands.)

## Next slices (queue)

Per the redesign queue + the gaps prompt (`2026-05-30-claude-design-gaps-prompt.md`):
Reservations/Calendar restyle → Properties (spine) → the modules Claude Design still owes
(Design 17-stage, Legal/Marketing/Leads/Syndic/Agency/Tenant/Billing/Admin-Analytics) →
Field PWA → tablet layer.
