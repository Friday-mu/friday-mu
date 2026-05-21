'use strict';

// Interior-design knowledge base for the Conversational Floor-Plan
// Editor (W3). This file is consumed by floor_plan_ai.js — it gets
// embedded into the system prompt so Gemini reasons about spatial
// constraints, clearances, and arrangement best-practices the way a
// junior interior designer would.
//
// All measurements in metres (the FloorPlanModel coordinate system
// is metric). Inch references are deliberately omitted to keep the
// model's mental units consistent with the JSON it emits.
//
// Sections:
//   1. Clearances         — hard minimums; violations are bugs.
//   2. Arrangement        — focal points, conversation flow, rugs.
//   3. Anti-patterns      — explicit "don't do this" list.
//   4. Style guidance     — proportion rules (coffee table, side tables).
//   5. Room-kind hints    — bedroom/living/dining/kitchen/bath specifics.
//
// Target size: ~1000–1500 tokens. Tight enough that we can ship it
// on every chat turn without chewing context budget.

const INTERIOR_DESIGN_KB = `# Interior Design Knowledge Base

You are reasoning about furniture placement on a metric floor plan. Apply
these rules whenever you decide where to put an item, how big to make it,
or which item to move. All measurements are in metres.

## 1. Clearances (hard minimums — never violate)

- Main walkway / circulation route: 0.90 m wide.
- Walkway between two pieces of large furniture: 0.75–0.90 m.
- Coffee table front edge to sofa front edge: 0.40–0.45 m (close enough
  to reach a drink, far enough for legs).
- Bed long-side to wall (non-headboard side): 0.60–0.90 m. The headboard
  side can touch the wall.
- Behind a pulled-out dining chair: 0.90 m clear (so a seated diner can
  push back without hitting the wall or another piece).
- Wheelchair turning radius: 1.50 m of clear floor where accessibility
  matters (master suites, ground-floor bathrooms, entryways).
- Entryway: 0.90 m clear walkway from door swing to the first piece of
  furniture.
- Kitchen work triangle (sink ↔ stove ↔ fridge): each leg between
  1.2 m and 2.7 m. Triangle perimeter should not exceed 7.9 m total.
- In front of a toilet or sink: 0.55 m minimum clear.
- Door swing arcs must be left empty — no furniture inside the arc.

## 2. Arrangement principles

- Anchor every room with a focal point. Living rooms: TV unit, fireplace,
  or large window. Bedrooms: the bed (centered on its primary wall).
  Dining rooms: the dining table. Arrange seating + supporting items
  TOWARD the focal point.
- Floating arrangements (sofa + chairs pulled away from walls into a
  conversation cluster) beat "everything pushed against walls". For a
  living room with sofa + 2 armchairs, pull the sofa 0.30–0.60 m off
  the wall if the room is large enough, and angle the chairs toward it.
- Rugs anchor furniture groups. At minimum, the FRONT LEGS of every
  seating piece in a conversation group should sit on the rug. Ideally
  all legs do. Rug dimensions ≥ sofa width + 0.3 m on each side.
- Symmetry communicates calm — pairs of bedside tables, matched
  armchairs flanking a sofa, twin pendants over an island.
- Asymmetry communicates energy — only use it deliberately (e.g. a
  reading nook in one corner, art wall on one side).

## 3. Anti-patterns (never do these)

- Don't block doors. No furniture overlapping a door swing arc or
  within 0.30 m of an open doorway.
- Don't block windows with tall furniture (wardrobes, bookshelves,
  fridges, full-height cabinets). Light sources are precious — keep
  them clear. Low pieces (sofa back, bench, console under 0.9 m) are OK.
- Don't push the bed into a corner unless the room is too small for
  alternatives. Both long sides should be accessible.
- Don't centre a coffee table that doesn't fit the sofa — coffee table
  length should be roughly 2/3 of the sofa length (e.g. 2.0 m sofa →
  1.2–1.4 m coffee table).
- Don't place a dining table directly in front of a door or against the
  primary circulation route.
- Don't crowd a focal point. If there's a fireplace, leave 0.60 m of
  clear floor in front of it.
- Don't stack tall items next to each other — alternate visual heights.

## 4. Style + proportion rules

- Coffee table length ≈ 2/3 of sofa length. Coffee table height should
  match or sit 0.05 m below the seat height of the sofa.
- Side tables: height within ±0.05 m of the sofa armrest height. Width
  0.40–0.60 m typically.
- Rug-to-room ratio: leave 0.30–0.60 m of bare floor between the rug
  edge and the walls in most rooms. Don't wall-to-wall a rug unless
  it's a true area carpet.
- TV unit: width ≥ TV width + 0.30 m on each side. Centre on the wall
  unless the wall has an off-centre architectural feature.
- Dining table: 0.60 m of edge length per diner. A 1.8 m table seats
  6 comfortably.
- Pendant lamps over an island or dining table: centred above, hung
  so the bottom of the pendant is 0.75–0.90 m above the surface
  (you're not modelling height, but the X/Y placement should be on
  the geometric centre of the table/island).

## 5. Room-kind specifics

### Living room
- Conversation distance: seats facing each other should be 1.8–3.0 m
  apart (close enough to talk normally).
- TV viewing distance: 1.5–2.5× the TV's diagonal. Place sofa accordingly.
- A 3-seater sofa + 2 armchairs is the canonical conversation cluster.

### Bedroom
- Bed centred on the longest unbroken wall when possible. Headboard
  against that wall.
- Bedside tables: one per occupant, flanking the bed, top surface
  roughly level with the mattress.
- Wardrobe on a wall PERPENDICULAR to the bed's headboard wall — never
  directly facing the foot of the bed in a small room (cramped).
- Don't place the bed under a window if there's a usable alternative.

### Dining room
- Table centred in the room (or centred on the focal feature: window,
  feature wall, pendant).
- Allow 0.90 m clearance around all sides for chair pull-out.
- An additional sideboard / buffet goes against a wall, NOT in the
  circulation path.

### Kitchen
- Maintain the work triangle (sink/stove/fridge): legs 1.2–2.7 m,
  perimeter ≤ 7.9 m.
- Island: 1.0 m clearance on all sides where people walk; 1.2 m
  if it doubles as a seating bar.
- Don't place the fridge directly next to the cooktop (heat) — keep
  at least 0.45 m of counter or a cabinet between them.

### Bathroom
- Toilet centreline ≥ 0.40 m from any side wall or fixture.
- Vanity: ≥ 0.55 m clear in front.
- Shower entry: 0.60 m clear walkway from the door.

### Office
- Desk facing into the room (not the wall) if there's a view; otherwise
  oriented so the user faces the door (psychological — backs to walls,
  not to doors).
- Office chair: 0.90 m clear behind for roll-back.

## Operating principle

When the user says "add a sofa" or "rearrange the bedroom", apply the
relevant section above. Prefer placements that satisfy the clearances
AND the arrangement principles. If a placement is forced into an
anti-pattern by the room size, note it in the reply and propose the
least-bad option.`;

// Section-level slices used by kbForRoom() to ship only the relevant
// chunk when the caller knows what room is being edited. Keys match
// the `room.kind` values that the frontend uses in the FloorPlanModel.
// Anything unknown falls back to the full KB.
const _ROOM_KIND_SECTIONS = {
  living: ['Living room'],
  living_room: ['Living room'],
  bedroom: ['Bedroom'],
  master_bedroom: ['Bedroom'],
  dining: ['Dining room'],
  dining_room: ['Dining room'],
  kitchen: ['Kitchen'],
  bathroom: ['Bathroom'],
  bath: ['Bathroom'],
  office: ['Office'],
  study: ['Office'],
};

// Always-applicable preamble (sections 1–4) — the room-kind helper
// includes these and then appends only the matching room subsection.
const _COMMON_PREAMBLE = INTERIOR_DESIGN_KB.split('## 5. Room-kind specifics')[0]
  + '## 5. Room-kind specifics (filtered)';

function kbForRoom(roomKind) {
  if (!roomKind || typeof roomKind !== 'string') return INTERIOR_DESIGN_KB;
  const wanted = _ROOM_KIND_SECTIONS[roomKind.toLowerCase()];
  if (!wanted) return INTERIOR_DESIGN_KB;
  const sections = INTERIOR_DESIGN_KB.split(/(?=### )/);
  // sections[0] holds everything up to the first ### heading — i.e.
  // preamble + sections 1–4 + the "## 5. ..." heading itself. We
  // keep that intact and then append only the matching ### blocks
  // plus the closing "Operating principle" subsection (which has its
  // own '## Operating principle' heading and so won't appear under ###).
  const head = sections[0];
  const operating = INTERIOR_DESIGN_KB.includes('## Operating principle')
    ? '## Operating principle' + INTERIOR_DESIGN_KB.split('## Operating principle')[1]
    : '';
  const picked = sections
    .slice(1)
    .filter((s) => wanted.some((w) => s.startsWith(`### ${w}`)))
    .join('');
  return `${head}${picked}\n${operating}`.trim();
}

module.exports = {
  INTERIOR_DESIGN_KB,
  kbForRoom,
};
