# Floor-plan sprint W2–W6 — result handover — 2026-05-16

> Companion to `2026-05-16-floorplan-sprint-plan.md`. W2–W5 shipped in
> one compressed session via 4 parallel subagents. W6 (Mathias-led
> testing) is for after this deploys soaks. Production is at `89299d5`.

## What shipped vs the original W2-W6 plan

| Week (original plan) | What landed | Status |
|---|---|---|
| **W2** vectorisation pipeline | Migration 032 (already shipped W1), tracing editor SVG draw tool, backend CRUD for `/api/design/floor-plans` | ✅ shipped |
| **W3** operation grammar + Kimi prompt | 42-entry furniture catalog, `applyOps()` op-applier with full validation, Kimi prompt that translates natural-language to `FloorPlanOperation[]` | ✅ shipped |
| **W4** renderer | `renderModelToSvg` (deterministic) + `renderModelToStylizedRaster` (Gemini texture pass) + sha256 caching in `design_assets` + stub fallback when Nanobanana unavailable | ✅ shipped |
| **W5** chat UI | `FloorPlanStudio` wrapper, `FloorPlanChatPanel`, `FloorPlanTracingEditor`. `FloorPlanGenerator` + `FurnishedFloorPlanGenerator` deleted (no fragmentation) | ✅ shipped |
| **W6** integration + Mathias testing | Wired into `FloorPlanStage` (single-button entry). Mathias testing not yet done — that's the soak. | 🟡 wired, untested |

## How it works (data flow)

```
1. Mathias opens FloorPlanStage → clicks "Open studio"
2. Studio mounts. Empty project → tracing editor.
3. Mathias uploads a raster, traces walls/doors/windows. Saves.
   → POST /api/design/floor-plans creates v1 with the vector model.
4. Studio switches to chat panel.
5. Mathias types "move the sofa to the left wall".
   → POST /api/design/floor-plan-chats
   → backend: load v1 → Kimi → ops → applyOps → insert v2 + chat row.
   → returns { chat, version }.
6. UI displays Friday's reply + v2 chip.
7. User clicks the v2 chip → studio loads /api/design/floor-plans/<v2>/render
   → backend: cached lookup → if miss, calls renderer.renderModelToStylizedRaster
     → SVG built → Gemini call → URL stored in design_assets + design_floor_plans.rendered_image_url.
8. Stylised raster displays on the canvas.
9. Mathias iterates: "change wall colour to navy" → v3 → render → display.
10. Once satisfied: "Save as final" → flips is_final on v3 + cascades false elsewhere.
```

## Routes added

| Route | Purpose | Auth |
|---|---|---|
| `GET /api/design/floor-plans?project_id=` | List versions DESC | requireDesignPerm + tenant scope |
| `GET /api/design/floor-plans/:id` | Single version | same |
| `GET /api/design/floor-plans/:id/render` | Lazy render (cached) | same |
| `POST /api/design/floor-plans` | Create new version (e.g. tracing save) | same |
| `PATCH /api/design/floor-plans/:id` | Update model/label | same |
| `POST /api/design/floor-plans/:id/finalize` | Flip is_final | same |
| `POST /api/design/floor-plans/:id/revert` | Duplicate as new latest | same |
| `POST /api/design/floor-plan-chats` | Submit user message → ops → new version | same |
| `GET /api/design/floor-plan-chats?project_id=` | Chat history | same |

All multitenant — `req.tenantId` scopes every query. All gated by
`requireModule('design')` (inherited from the design router mount).

## What's still rough / not done

1. **Mathias hasn't tested it.** The whole point. The first real
   test will reveal places the Kimi prompt produces bad ops, the
   renderer drifts, the SVG editor mis-handles edge cases, etc.
2. **Furniture silhouettes are rectangles + labels** in the SVG renderer.
   The "L" silhouette for kitchen counters falls back to rect.
   Mathias will likely want recognisable shapes for the texture pass
   to anchor properly. Real silhouettes (or category icons) is a
   follow-up.
3. **SVG → Gemini reference image** uses inlineData with
   `image/svg+xml`, which `ai_images.js` explicitly excludes from its
   whitelist. The fallback path returns the SVG as a data-URL with
   `stub: true`. If Gemini rejects the SVG in practice, we'll need
   server-side SVG → PNG rasterisation (no `sharp` / `canvas` /
   `resvg` in deps yet — would need `npm install sharp` on prod).
4. **`near.kind: 'wall'` placement uses a "point normal toward canvas
   centre" heuristic** for which side of the wall to place on. Works
   for rectangular footprints; misplaces items in L-shaped rooms.
5. **`PATCH /:id` allows editing any non-final version**, not just the
   latest. Useful for fixing typos in old labels but means concurrent
   edits could collide. Add a version field for optimistic locking
   in a follow-up if it becomes an issue.
6. **`MOVE_FURNITURE` silently clamps to canvas bounds** rather than
   warning. Hides Kimi's spatial reasoning errors. Surface a warning
   chip if we ever hit this in practice.
7. **No render-cache eviction.** If we re-prompt Gemini and want fresh
   output, today we have to manually clear the `design_assets` row.
   `floor_plan_renderer.clearRendererCache({ tenantId })` exists but
   no UI invokes it yet.
8. **Tracing editor: no resize / pan / zoom.** Fixed 800×600 canvas
   at 100 px/m. Mathias will want zoom for detailed plans. Pinch /
   wheel zoom is a 1-day add post-soak.

## Files added

### Backend
- `backend/src/design/floor_plan_catalog.js` — 42 furniture categories
- `backend/src/design/floor_plan_ops.js` — applyOps + validateModel
- `backend/src/design/floor_plan_kimi.js` — NL → ops translator
- `backend/src/design/floor_plan_renderer.js` — SVG renderer + Gemini texture pass + caching
- `backend/src/design/floor_plans.js` — CRUD + render route
- `backend/src/design/floor_plan_chats.js` — chat pipeline

### Frontend
- `frontend/src/app/fad/_components/modules/design/FloorPlanTracingEditor.tsx`
- `frontend/src/app/fad/_components/modules/design/FloorPlanChatPanel.tsx`
- `frontend/src/app/fad/_components/modules/design/FloorPlanStudio.tsx`

### Modified
- `backend/src/design/adapters.js` (shape functions)
- `backend/src/design/index.js` (mounts)
- `frontend/src/app/fad/_data/designClient.ts` (client functions)
- `frontend/src/app/fad/_components/modules/design/stages/FloorPlanStage.tsx` (mounts studio)

### Deleted
- `frontend/src/app/fad/_components/modules/design/FloorPlanGenerator.tsx`
- `frontend/src/app/fad/_components/modules/design/FurnishedFloorPlanGenerator.tsx`

## Click-through checklist for Mathias

The team's UpdateBanner will prompt force-refresh within ~60s of focus.
Once they're on `89299d5`, Mathias should:

- [ ] Open a project → Floor Plan stage → click the new entry point
- [ ] Studio modal opens. Empty project → tracing editor mounts.
- [ ] Upload a raster (his sample plan). Background renders at 0.5 opacity.
- [ ] Trace 4 outer walls. Snap should work at endpoints.
- [ ] Add a door, a window. Inline width prompt accepts a number.
- [ ] Select + delete works. Undo (Cmd+Z) reverts the last action.
- [ ] Save → studio switches to chat panel.
- [ ] Type "add a sofa in the living room" → Kimi response → v2 created.
- [ ] Click v2 chip → loads the render. With `NANOBANANA_API_KEY` set
      on prod, Gemini renders a stylised image; without it, SVG fallback.
- [ ] Type "move the sofa to the left wall" → v3. Walls unchanged.
- [ ] "Revert to v1" → reverts. Walls return.
- [ ] "Save as final" on the version Mathias likes → green ✓.

If ANY of these break — that's the W6 triage work.

## Rollback recipes

- **Frontend regression:** `git revert 89299d5 && npm run deploy`. Sidebar
  team sees the old FloorPlanGenerator come back on next force-refresh.
- **Backend regression:** revert + rsync `backend/src/design/`. Schema
  changes (mig 032) are additive; revert leaves the table in place but
  unused by the old code.
- **Kimi misbehaving:** disable the chat by unsetting `KIMI_API_KEY` on
  prod env. Chat endpoint will return "Friday couldn't reach Kimi" but
  the tracing editor still works (it's local-only until save).
- **Gemini misbehaving:** unsetting `NANOBANANA_API_KEY` flips the
  renderer to its SVG-data-URL stub path. UI still shows the structural
  view.
- **Database needs cleaning** (test rows): `DELETE FROM
  design_floor_plan_chats WHERE created_at > '2026-05-16'; DELETE FROM
  design_floor_plans WHERE created_at > '2026-05-16';` (ON DELETE
  CASCADE on chat resulting_version_id handles the FK).

## How to resume W6

When Mathias has tested:
1. Read his feedback rows (filed via the bug FAB, probably as
   `module: floor-plan`).
2. Triage by severity. Fix critical issues inline.
3. Polish: silhouettes, zoom, anything else from the "what's rough"
   list above that Mathias actually hit.
4. Tag the result `fad-floorplan-v1` (per scoping doc) and call it done.
