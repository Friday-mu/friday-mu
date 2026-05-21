# Floor-plan studio v2 — fixes + deepening — 2026-05-16

> Follow-up to the W2-W5 sprint shipment. Mathias's first smoke
> surfaced bugs + asked for the conversational AI to actually be
> smart. This commit addresses all of it. Production at `e282a89`.

## What was broken (per Mathias's testing)

| # | Issue | Root cause | Fix |
|---|---|---|---|
| 4 | Upload → white screen | Canvas dimensions could be NaN if `model.canvas` malformed; `gridLines()` looped on `NaN`; SVG `<image>` Safari quirk with `href` vs `xlinkHref` | Fallback to 10×10m when malformed; `Number.isFinite` guards in gridLines; both `href` AND `xlinkHref` on `<image>` |
| 6 | Save doesn't complete | `save()` never reset `saving=false` on happy path; no toast on success; reload-failure stranded the user | `setSaving(false)` + clear dirty + empty undo before `onSaved`; Studio shows toast on save; reload failure still transitions to chat |
| 1 | Can't move placed items | Select tool only opened props popover | Drag-to-move walls (endpoint handles + midpoint translate), drag-to-move doors/windows along wall, drag-to-move furniture |
| 3 | Kimi "super super dumb" | Kimi/Moonshot lacks Gemini's spatial reasoning; prompt had no interior-design KB | Swapped to Gemini 2.5 Flash (research: leads ARC-AGI-2 at 77.1% vs Claude 68.8% / GPT 52.9%); inline interior-design KB (clearances, arrangement principles, anti-patterns, proportion rules, room-kind specifics); rendered SVG sent as vision input so Gemini SEES the layout |
| 7 | "Friday Studios" naming | n/a | Renamed to "FridayOS Design" across signup / pitch / memory |
| 2 | "Deepen the module" | n/a | Pan/zoom, room labeling, dimension display, drag-from-catalog (18 entries grouped by room type), furniture rendering |

## What's now on prod (e282a89)

**Tracing editor — new capabilities:**
- Drag walls by endpoint handles (blue circles when selected). Snaps within 8px of other endpoints.
- Drag walls by midpoint (translates both endpoints).
- Drag doors/windows along their anchored wall. Stays on-wall.
- Drag furniture anywhere. Rotation editable via slider in popover.
- Drag-from-catalog: 18 furniture types grouped by room. HTML5 drag-and-drop onto the canvas.
- Pan: middle-mouse-drag or Space+drag. Zoom: Ctrl/Cmd+wheel (20-400 px/m). Reset view button.
- Dimension labels on selected walls (`X.XX m` at midpoint with perpendicular tick).
- Room labeling tool — click vertices, Enter / dblclick / close to finish, prompt for label.
- Duplicate button for furniture in popover (0.3m offset).
- All existing keyboard shortcuts preserved.

**AI — new pipeline:**
- `floor_plan_kimi.js` deleted → `floor_plan_ai.js` (Gemini 2.5 Flash) + `floor_plan_design_kb.js` (interior-design KB).
- Gemini prompt assembles: system contract + interior-design KB + op grammar + 42-furniture-category summary + rendered SVG (vision input) + user message + current model JSON.
- KB sections: clearances (metric), arrangement principles, anti-patterns, proportion rules, room-kind specifics.
- `kbForRoom(roomKind)` helper slices the KB to relevant section if `room_kind` is in the chat payload (frontend can populate later).
- Same `translateToOps()` signature, no contract change for the chat endpoint.

**Brand:**
- "Friday Studios" → "FridayOS Design" everywhere (signup copy, pitch doc, memory).
- Pitch doc renamed: `docs/marketing/friday-studios-pitch-v0.md` → `fridayos-design-pitch-v0.md`.

## Smoke test results (prod, just now)

| Check | Result |
|---|---|
| Backend boot clean | ✓ |
| `floor_plan_ai.js` + `floor_plan_design_kb.js` deployed | ✓ |
| `floor_plan_kimi.js` removed | ✓ |
| Chat endpoint reachable (404 = correct for nonexistent project) | ✓ |
| Frontend version | `e282a89` |
| Tenant module gate working (verified earlier in session) | ✓ |
| Signup flow (verified earlier in session) | ✓ |

## What needs Mathias to click through

The same surfaces as last time, now with the new capabilities:

- [ ] Upload his real plan → confirm trace stage renders (no more white screen)
- [ ] Trace walls, then SELECT one and drag endpoint → should move
- [ ] Select wall midpoint → drag → translates whole wall
- [ ] Select a door → drag along the wall → slides
- [ ] Ctrl+wheel → zoom around cursor. Space+drag → pan. Reset view button → restores.
- [ ] Click Room tool → click vertices → close → enter label. Polygon renders.
- [ ] Drag a furniture card from the catalog strip → onto canvas → renders at drop point.
- [ ] Click Save → toast appears: "Floor plan saved". Modal transitions to chat.
- [ ] Type "add a sofa in the living room" → Gemini reply should be MUCH smarter than Kimi. Should reference real spatial constraints (clearances, focal points).
- [ ] Click v2 chip → render loads. Walls should NOT drift (KB tells Gemini explicitly).
- [ ] Try "make sure all walkways are at least 90cm wide" → Gemini should know the rule from the KB.

## Known caveats / next sprint

1. **Furniture catalog icons** — currently just text cards. Real SVG icons would help recognisability. ~2 hr.
2. **Door swing direction** — UI doesn't let you flip swing (model supports `'left' | 'right'`). Add to door popover. ~30 min.
3. **Surface assignment UI** — `recolor_surface` and `retexture_surface` ops can be created by AI but there's no UI for the user to define surfaces. AI guesses → renderer applies.
4. **Multi-floor support** — single canvas per project; no concept of floor 1 / floor 2 / loft.
5. **Vertex editing on rooms** — rooms can be deleted but not reshaped after creation.
6. **Furniture rotation snapping** — slider is continuous. Snap to 15° / 45° / 90° would feel better.
7. **Mobile** — desktop-first. Touch + pinch-zoom not yet wired.
8. **Real Gemini token cost monitoring** — no per-tenant AI usage tracking. Could spike on a chatty tenant.

## Rollback recipes

- **Floor-plan editor UI broken:** `git revert e282a89 && npm run deploy`. The Wave 1 fixes + Gemini swap stay; only the deepening reverts.
- **Gemini misbehaving:** unset `NANOBANANA_API_KEY` on prod → `floor_plan_ai.js` falls back to friendly empty-ops reply. Tracing editor still works (local-only until save).
- **Specific Gemini model misbehaving:** set `FLOOR_PLAN_AI_MODEL` env var to override (e.g. `gemini-1.5-pro` or `gemini-2.0-flash-exp`).
- **Backend regression:** revert + rsync `backend/src/design/` + pm2 restart.

## Sources cited

Research that informed the AI swap + KB content:
- [LM Council AI Benchmarks May 2026](https://lmcouncil.ai/benchmarks) — Gemini 3 ARC-AGI-2 lead
- [Furniture Spacing Guide 2026 — Craft'n Build](https://craftnbuild.com/en-us/blogs/interior-styles/furniture-spacing) — walkway / clearance standards
- [How Much Space to Walk Between Furniture — Living Etc](https://www.livingetc.com/advice/how-much-space-between-furniture-for-walking) — corroborated 36"/90cm primary walkway
- [react-planner](https://github.com/cvdlab/react-planner) — drag-from-catalog UX precedent
