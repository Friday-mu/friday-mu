# Conversational Floor-Plan Editor — Sprint W2–W6 — 2026-05-16

> Continuation after the SaaS scaffolding shipment (`6d6236f`). W1
> shipped previously (mig 032 + `floorPlanTypes.ts`). W2–W6 compressed
> into one session per Ishant's direction.

## Strategy

Parallelise aggressively. Three dependency-isolated subagents in
parallel for the bulk of the work; main thread orchestrates,
integrates, deploys.

```
Phase 1 (parallel):
  A. Backend (CRUD + chat + ops + catalog)
  B. Tracing editor (SVG draw walls/doors/windows over raster)
  C. Renderer (SVG + Gemini texture pass)
  
Phase 2:
  D. Chat UI (depends on B working + A's API)
  
Phase 3:
  Integration + smoke + deploy
```

## Phase contents

### A — Backend (subagent, ~3 hr)

Files to create in `backend/src/design/`:
- `floor_plans.js` — Express router. Routes:
  - `GET /api/design/floor-plans?project_id=...` — list versions DESC
  - `GET /api/design/floor-plans/:id` — single version
  - `POST /api/design/floor-plans` — create v1 (from tracing editor save)
  - `PATCH /api/design/floor-plans/:id` — update model (e.g. tracing editor save-while-editing)
  - `POST /api/design/floor-plans/:id/finalize` — flip is_final
  - `POST /api/design/floor-plans/:id/revert` — duplicate this version as a new latest
- `floor_plan_chats.js` — chat endpoint:
  - `POST /api/design/floor-plan-chats` — body: `{project_id, user_message}`. Pipeline:
    1. Load current floor plan version
    2. Call Kimi with (model, user_message) → FloorPlanOperation[]
    3. Validate ops
    4. Apply ops → new model
    5. Render (call renderer module)
    6. Insert new version + chat row
    7. Return `{chat, version}`
  - `GET /api/design/floor-plan-chats?project_id=...` — list chat history
- `floor_plan_ops.js` — op-applier. `applyOps(model, ops) → newModel`. Validates each op; throws on invalid.
- `floor_plan_catalog.js` — hardcoded furniture catalog with ~50 categories matching the `FurnitureCategory` union. Each: `{ category, defaultWidth, defaultDepth, silhouette: 'rect' | 'circle' | ..., displayName }`.
- `floor_plan_kimi.js` — Kimi prompt builder. Reads the model summary + user_message, returns ops or empty array on Kimi error. Reuses the `callKimi` helper from `ai_rough_budget.js`.
- Mount in `design/index.js`.

All routes use `requireDesignPerm` + scope queries by `req.tenantId`.

### B — Tracing editor (subagent, ~3 hr)

Files to create in `frontend/src/app/fad/_components/modules/design/`:
- `FloorPlanTracingEditor.tsx` — modal or full-page component. Props: `{ projectId, onClose, onSaved }`.
- Steps:
  1. Upload a raster (uses existing `UrlOrUploadInput` with `uploadKind='image'`)
  2. SVG canvas overlay on the uploaded image. Tools (mode switch in toolbar):
     - **Wall**: click-drag to draw a wall segment. Click on an existing endpoint to snap.
     - **Door**: click on an existing wall to drop a door at that position. Input width inline.
     - **Window**: same as door, with width + sill/height inputs.
     - **Select**: click to select; delete key removes.
  3. "Save" → POST /api/design/floor-plans with the assembled FloorPlanModel (only walls/doors/windows populated; furniture/rooms/surfaces empty).
- All coordinate math in metres (the canvas defines a metre-per-pixel scale; default 100 px/m).
- Render walls as 2px black lines, doors as small arcs, windows as parallel double lines.

Replaces `FloorPlanGenerator.tsx` — but DON'T delete the old file in this phase; the chat UI (D) replaces it later.

### C — Renderer (subagent, ~2 hr)

Files to create in `backend/src/design/`:
- `floor_plan_renderer.js` — exports `renderModelToSvg(model)` and `renderModelToStylizedRaster(model, styleNotes)`.
- `renderModelToSvg`: pure function. Returns an SVG string. Walls as `<line>`, doors as `<path>` arc, windows as `<g>` with two lines. Furniture as `<rect>` with a `<text>` label.
- `renderModelToStylizedRaster`: takes the SVG, sends to Gemini via existing nanobanana endpoint with a prompt template that says "render this floor plan as a photorealistic top-down rendering, walls / doors / windows are structural and MUST NOT change, only paint textures + furniture style". Returns image URL.
- Output caching: sha256 hash of `{model, styleNotes}` → result URL. Stored in `design_assets` table (already exists).

### D — Chat UI (subagent, ~3 hr)

Files to create:
- `FloorPlanChatPanel.tsx` — chat interface. Reuses the bug-report chat pattern (see `FeedbackChat.tsx` or similar).
- `FloorPlanStudio.tsx` — top-level wrapper. Shows tracing editor (B) when no plan exists, then switches to chat panel + version sidebar.
- Chat panel features:
  - Text input + send button
  - Message list with rendered images per turn
  - "Revert to this version" button on past turns
  - "Save as final" button on latest turn
- Replaces `FloorPlanGenerator.tsx` + `FurnishedFloorPlanGenerator.tsx`. Delete the old files in this phase.

### Phase 3 — Integration + deploy (main thread, ~1 hr)

- Update `DesignModule` / `FloorPlanStage` to render `FloorPlanStudio` instead of the old generators.
- Update any `data-doc-link="floor-plan"` references.
- Run migration 032 if not yet on prod (should already be applied per prior session — verify).
- Rsync backend + restart.
- Deploy frontend.
- Smoke test: upload a raster, trace some walls, save, send a chat message.

## Anti-goals (from scoping doc, repeated here for safety)

- No CV-based auto-vectorisation in v1.
- No 3D.
- No editing the raster output directly.
- No Option A placebo.
- No fragmentation — replace `FloorPlanGenerator` entirely.

## Rollback

- All migrations additive. Schema changes already on prod (mig 032).
- Code is additive to a NEW module surface; the old `FloorPlanGenerator` stays until phase D deletes it. Reverting the chat UI commit brings it back.
- Renderer + Kimi pipeline are gated by `NANOBANANA_API_KEY` + `KIMI_API_KEY` — set on prod, but if either misbehaves the chat falls back gracefully.

## Resume notes if session compacts

- W1 was migration 032 + `floorPlanTypes.ts` (already shipped).
- The plan above lays out W2–W6 verbatim.
- Each subagent's outputs are written to disk; partial progress is recoverable by reading the committed files + this plan.
