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

## Decision needed

1. ⏸ Greenlight the 4–6 week vector-floor-plan sprint?
2. ⏸ Build the 1-day Option A placebo in the meantime — yes / no?
3. ⏸ Tell Mathias "we hear you, parking for next sprint" and revisit
   when there's budget?

Default if no decision: option 3 (transparent acknowledgement, no code
moves).
