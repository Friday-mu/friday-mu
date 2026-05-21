# Scoping — Conversational floor-plan editor

> **Source:** Mathias, feedback row `5e24ad51-b2e4-49bc-9a66-9c4e96443145`
> filed 2026-05-14 via the new chat-based bug-report flow. He spent
> three turns describing his actual workflow — high-signal real-user
> feedback worth scoping properly before any implementation.

## What he's asking for

Mathias's current workflow (today, **without** FAD):

1. Receive a hand-drawn / scanned floor plan from the property owner —
   usually with existing furniture and room measurements drawn on it.
2. Upload it to **Rayon Design**.
3. Redraw the walls in Rayon → clean line-art floor plan (walls + doors
   + windows only).
4. Find furniture that fits each space, furnish or renovate each room.

Where FAD breaks his flow today: he uses our `FloorPlanGenerator` and
`FurnishedFloorPlanGenerator` (single-shot Nanobanana / Gemini Flash
Image calls), gives clear prompts, but the outputs ignore his
instructions or hallucinate the wrong layout. So he stops using FAD
and goes back to Rayon.

What he wants instead — a **chat-based floor-plan editor**:

> "What I'd suggest is a chatbox where you can:
> - Ask to clean the floor plan, leaving only walls, doors, and windows.
> - Give further instructions to add or move furniture, change textures,
>   wall colours, and so on.
> - Save the result once you have the desired outcome."

Friday's follow-up confirmed: yes, the chat should understand specific
commands like *"move the sofa to the left"* or *"change wall colour to
blue"*.

## Why this is important

- Mathias is the team's actual floor-plan operator. If FAD doesn't fit
  his workflow, he switches tools and we lose the integration value.
- It's a real workflow loop (iterate → refine → save) versus the current
  fire-and-forget single-shot generation.
- The pattern generalises: moodboard refinement, design-pack option
  iteration, and Annex-B-edit could all benefit from the same
  multi-turn interface we just shipped for bug reports.

## What it really takes

This isn't a trivial extension of the current generator. Multi-turn
image editing has three engineering shapes to choose between:

### Option A — Image-in / image-out per turn (Gemini "edit" mode)

Each turn sends the **current image** + the new instruction; Gemini
2.5 Flash Image returns a new image. The chat is just a prompt history.
Cheapest to build; quality depends entirely on Gemini's edit fidelity
(it tends to drift, especially across many turns).

Practical concern Mathias will hit immediately: Gemini doesn't reliably
keep "walls fixed, only move furniture" — every turn risks redrawing
the whole layout slightly. Mitigations: pass the original cleaned plan
as a reference + use stronger prompts + maybe a low-strength img2img.

### Option B — Vector floor plan + LLM-generated edit operations

Store the plan as structured data — walls, doors, windows as line
segments; furniture as positioned bounding boxes with category labels.
Each chat turn calls Kimi (or Claude) to translate the natural-language
instruction into a list of edit operations (`move sofa { dx: -50 }`,
`add chair near tv`, `recolor wall #001 to navy`). Render the data to
an image with a deterministic renderer.

Massively higher fidelity (no drift, walls truly fixed, edits are
auditable). But it needs:

- A floor-plan parser to turn the owner's scanned plan into vector
  data (this is non-trivial; we may need a manual touch-up step or a
  CV model)
- A furniture catalog with positions, categories, dimensions
- A renderer (SVG or Canvas-based, headless)
- An operation grammar + Kimi/Claude prompt design

Architecturally clean, 4–6 week build. The right long-term direction.

### Option C — Hybrid: vector for layout, raster for textures

Walls/doors/windows/furniture positions stay vector (Option B
fidelity). Textures, wall colors, mood-style overlays use a final
raster pass through Gemini. Lets us guarantee structural integrity
while keeping the "wow" of stylised output.

This is probably the right answer. Higher complexity but matches what
Mathias actually wants — *structurally stable, visually polished*.

## My recommendation

**Don't ship A** as a band-aid. It'll hit the same drift problem
Mathias is already complaining about and burn his trust further.

**Park** until we're ready to do C properly. That's 4–6 weeks of focused
work covering:

- W1–W2: floor-plan vectorisation pipeline (upload → CV-or-manual →
  vector store)
- W3: furniture catalog + operation grammar + Kimi prompt
- W4: deterministic renderer (SVG + texture composition)
- W5: chat UI with screenshot history + save/finalize flow
- W6: integration + Mathias-led testing

In the meantime: **stop expanding the single-shot generators**. They're
a known dead end for Mathias's workflow. Don't add more buttons that
make him think it'll work better next time.

## Short-term placebo (optional, ≤1 day)

If we want to give Mathias *something* before we ship the real thing:

1. Wire a "send back to Friday" button on each generator output that
   takes a refinement prompt + the current image and calls Gemini's
   edit mode (Option A). Frames it explicitly as "best-effort tweak —
   for major changes use the original prompt."
2. Save successful outputs to a "good versions" gallery on the project
   so he can A/B them.

That's not the right answer, but it's a faster placebo than 4–6 weeks
of silence. Cost: a half-day. Probably not worth it because Mathias has
already told us the single-shot approach doesn't work — patching it is
just kicking the can.

## Decisions (locked 2026-05-14, Ishant)

| # | Decision | Locked |
|---|----------|--------|
| 1 | Greenlight the 4–6 week sprint | ✅ |
| 2 | Ship Option A placebo | ❌ — skip the band-aid, ship the real thing |
| 3 | Vectorisation source | ✅ **Manual trace** in-app. CV / hybrid parked as v2. |
| 4 | Furniture catalog source | ✅ **Hardcoded ~50 shapes** for v1, swap to richer source later |
| 5 | Renderer fidelity | ✅ **Photorealistic (Option C)** — vector layout + Gemini texture pass |
| 6 | Placement in FAD shell | ✅ **Replace** `FloorPlanGenerator` entirely. Don't fragment the surface. |

## Sprint plan (W1 → W6)

### W1–W2 — Vectorisation pipeline

- Owner uploads a raster floor plan (jpg / png / pdf-first-page).
- In-app tracing editor — Mathias draws walls / doors / windows on top of the uploaded image using a simple SVG line tool. Familiar pattern (he does this in Rayon today).
- Vector model persisted server-side. Versioned per project.
- Deliverables: migration, backend CRUD, TypeScript types, tracing editor route.

### W3 — Operation grammar + Kimi prompt

- Hardcoded furniture catalog: ~50 categories (sofa, bed, dining table, kitchen island, …) with category, dimensions, default style.
- Operation grammar: `add { item, near?, room? }`, `move { id, dx, dy } | { id, to }`, `remove { id }`, `recolor { target, color }`, `retexture { surface, texture }`.
- Kimi prompt: takes the current floor plan JSON + user message → returns a list of operations. Validation layer rejects invalid ops before they're applied.
- Deliverables: catalog data, op schema, Kimi prompt + endpoint, op-applier.

### W4 — Renderer

- SVG layer: walls / doors / windows / furniture-as-shapes, deterministic from the vector model.
- Raster layer: send the rendered SVG + a style prompt to Gemini for the final stylised image. Walls stay structurally fixed (anchored), only textures + colors vary.
- Deliverables: renderer module, Gemini integration (or reuse existing `ai_images.js`), output caching.

### W5 — Chat UI

- Replaces `FloorPlanGenerator.tsx` and `FurnishedFloorPlanGenerator.tsx`. Same modal frame, chat-based interaction inside (reuses the bug-report chat pattern).
- Each user message → Kimi → ops → re-render → screenshot in chat history.
- "Revert" button on each step lets Mathias rewind to a previous render.
- "Save as final" finalises the current render and writes it to the project's floor plan.

### W6 — Integration + Mathias-led testing

- Wire into Site Visit (where rooms are captured) and Floor Plan stage.
- Mathias takes 2 real projects through the new flow end-to-end. Each one logs friction in the feedback inbox under module="Floor plan studio".
- Triage round, ship fixes, tag `fad-floorplan-v1`.

## Anti-goals (don't do)

- **No CV-based auto-vectorisation in v1.** Plans vary too much, silent failures destroy trust. Park until we have plan samples + can pick a model.
- **No 3D rendering.** SVG + texture pass only. 3D drives complexity 10× for marginal gain over a polished 2D render.
- **No editing the raster output directly.** Edits flow through ops → renderer → raster. One-way pipeline keeps the data model authoritative.
- **No placebo Option A in the meantime.** Mathias will treat any single-shot output as evidence the new system also fails. Wait and ship the real thing.
