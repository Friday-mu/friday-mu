'use strict';

// Hardcoded furniture catalog for the Conversational Floor-Plan
// Editor (W3). Each entry captures the canonical defaults the op-
// applier uses when Kimi omits dimensions on `add_furniture`. Mathias
// can refine these post-v1 once we see how Kimi behaves on real
// projects.
//
// Coverage rule: every value in the FurnitureCategory union in
// frontend/src/app/fad/_data/floorPlanTypes.ts MUST have a row here.
// 38 categories total.
//
// Dimensions are in metres (consistent with the FloorPlanModel
// coordinate system). `silhouette` is the shape hint the renderer
// uses for the line-art pass — 'rect' is the default; 'circle' is
// for round items (round dining tables, pendant lamps overhead);
// 'L' covers L-shaped sofas and corner counters.

const CATALOG = [
  // ── Living room ─────────────────────────────────────────────────
  { category: 'sofa',          displayName: 'Sofa (3-seater)',     defaultWidth: 2.0, defaultDepth: 0.9,  silhouette: 'rect' },
  { category: 'armchair',      displayName: 'Armchair',            defaultWidth: 0.9, defaultDepth: 0.9,  silhouette: 'rect' },
  { category: 'coffee_table',  displayName: 'Coffee table',        defaultWidth: 1.2, defaultDepth: 0.6,  silhouette: 'rect' },
  { category: 'side_table',    displayName: 'Side table',          defaultWidth: 0.5, defaultDepth: 0.5,  silhouette: 'rect' },
  { category: 'tv_unit',       displayName: 'TV unit',             defaultWidth: 1.8, defaultDepth: 0.45, silhouette: 'rect' },
  { category: 'rug',           displayName: 'Rug',                 defaultWidth: 2.4, defaultDepth: 1.6,  silhouette: 'rect' },

  // ── Lighting ────────────────────────────────────────────────────
  { category: 'pendant_lamp',  displayName: 'Pendant lamp',        defaultWidth: 0.4, defaultDepth: 0.4,  silhouette: 'circle' },
  { category: 'floor_lamp',    displayName: 'Floor lamp',          defaultWidth: 0.4, defaultDepth: 0.4,  silhouette: 'circle' },
  { category: 'table_lamp',    displayName: 'Table lamp',          defaultWidth: 0.3, defaultDepth: 0.3,  silhouette: 'circle' },

  // ── Bedroom ─────────────────────────────────────────────────────
  { category: 'bed_single',    displayName: 'Single bed',          defaultWidth: 2.0, defaultDepth: 0.9,  silhouette: 'rect' },
  { category: 'bed_double',    displayName: 'Double bed',          defaultWidth: 2.0, defaultDepth: 1.5,  silhouette: 'rect' },
  { category: 'bed_king',      displayName: 'King bed',            defaultWidth: 2.0, defaultDepth: 1.8,  silhouette: 'rect' },
  { category: 'bedside_table', displayName: 'Bedside table',       defaultWidth: 0.5, defaultDepth: 0.4,  silhouette: 'rect' },
  { category: 'wardrobe',      displayName: 'Wardrobe',            defaultWidth: 1.8, defaultDepth: 0.6,  silhouette: 'rect' },
  { category: 'dresser',       displayName: 'Dresser',             defaultWidth: 1.4, defaultDepth: 0.5,  silhouette: 'rect' },

  // ── Office ──────────────────────────────────────────────────────
  { category: 'desk',          displayName: 'Desk',                defaultWidth: 1.4, defaultDepth: 0.7,  silhouette: 'rect' },
  { category: 'office_chair',  displayName: 'Office chair',        defaultWidth: 0.6, defaultDepth: 0.6,  silhouette: 'circle' },

  // ── Dining ──────────────────────────────────────────────────────
  { category: 'dining_table',  displayName: 'Dining table',        defaultWidth: 1.8, defaultDepth: 0.9,  silhouette: 'rect' },
  { category: 'dining_chair',  displayName: 'Dining chair',        defaultWidth: 0.5, defaultDepth: 0.5,  silhouette: 'rect' },
  { category: 'bar_stool',     displayName: 'Bar stool',           defaultWidth: 0.4, defaultDepth: 0.4,  silhouette: 'circle' },

  // ── Kitchen ─────────────────────────────────────────────────────
  { category: 'kitchen_island',  displayName: 'Kitchen island',    defaultWidth: 2.4, defaultDepth: 1.0,  silhouette: 'rect' },
  { category: 'kitchen_counter', displayName: 'Kitchen counter',   defaultWidth: 2.4, defaultDepth: 0.6,  silhouette: 'L' },
  { category: 'kitchen_sink',    displayName: 'Kitchen sink',      defaultWidth: 0.8, defaultDepth: 0.6,  silhouette: 'rect' },
  { category: 'fridge',          displayName: 'Fridge',            defaultWidth: 0.7, defaultDepth: 0.7,  silhouette: 'rect' },
  { category: 'oven',            displayName: 'Oven',              defaultWidth: 0.6, defaultDepth: 0.6,  silhouette: 'rect' },
  { category: 'cooktop',         displayName: 'Cooktop',           defaultWidth: 0.6, defaultDepth: 0.6,  silhouette: 'rect' },
  { category: 'dishwasher',      displayName: 'Dishwasher',        defaultWidth: 0.6, defaultDepth: 0.6,  silhouette: 'rect' },
  { category: 'microwave',       displayName: 'Microwave',         defaultWidth: 0.5, defaultDepth: 0.4,  silhouette: 'rect' },

  // ── Bathroom ────────────────────────────────────────────────────
  { category: 'bath',          displayName: 'Bath',                defaultWidth: 1.7, defaultDepth: 0.75, silhouette: 'rect' },
  { category: 'shower',        displayName: 'Shower',              defaultWidth: 0.9, defaultDepth: 0.9,  silhouette: 'rect' },
  { category: 'toilet',        displayName: 'Toilet',              defaultWidth: 0.4, defaultDepth: 0.7,  silhouette: 'rect' },
  { category: 'vanity',        displayName: 'Vanity',              defaultWidth: 1.2, defaultDepth: 0.5,  silhouette: 'rect' },
  { category: 'mirror',        displayName: 'Mirror',              defaultWidth: 1.0, defaultDepth: 0.05, silhouette: 'rect' },

  // ── Utility ─────────────────────────────────────────────────────
  { category: 'washing_machine', displayName: 'Washing machine',   defaultWidth: 0.6, defaultDepth: 0.6,  silhouette: 'rect' },
  { category: 'dryer',           displayName: 'Dryer',             defaultWidth: 0.6, defaultDepth: 0.6,  silhouette: 'rect' },

  // ── Decor + misc ────────────────────────────────────────────────
  { category: 'plant',         displayName: 'Plant',               defaultWidth: 0.5, defaultDepth: 0.5,  silhouette: 'circle' },
  { category: 'artwork',       displayName: 'Artwork',             defaultWidth: 0.8, defaultDepth: 0.05, silhouette: 'rect' },
  { category: 'shelves',       displayName: 'Shelves',             defaultWidth: 1.2, defaultDepth: 0.35, silhouette: 'rect' },
  { category: 'cabinet',       displayName: 'Cabinet',             defaultWidth: 1.0, defaultDepth: 0.5,  silhouette: 'rect' },

  // ── Architectural ───────────────────────────────────────────────
  // door_swing is an inline marker (the visual arc on the floor plan);
  // we model it as a furniture item rather than a wall annotation so
  // Kimi can place it adjacent to a wall it has visibility of.
  { category: 'door_swing',    displayName: 'Door swing',          defaultWidth: 0.85, defaultDepth: 0.85, silhouette: 'rect' },
  { category: 'stairs',        displayName: 'Stairs',              defaultWidth: 1.0,  defaultDepth: 3.0,  silhouette: 'rect' },
  { category: 'other',         displayName: 'Other',               defaultWidth: 0.8,  defaultDepth: 0.8,  silhouette: 'rect' },
];

// Lookup index built once at require-time. Keeping a Map (instead of
// linear scan) keeps the op-applier's per-op cost O(1) even if the
// catalog grows.
const _CATALOG_BY_CATEGORY = new Map(CATALOG.map((e) => [e.category, e]));

function getCatalogEntry(category) {
  return _CATALOG_BY_CATEGORY.get(category) || null;
}

// Compressed one-line-per-category dump for the Kimi system prompt.
// Token budget for v1 is generous (moonshot-v1-8k); we still keep it
// compact because the prompt is shipped on every chat turn.
//
// Format: `<category>: <displayName>, <W>x<D>m`
const MODEL_SUMMARY_FOR_KIMI = CATALOG
  .map((e) => `${e.category}: ${e.displayName}, ${e.defaultWidth}x${e.defaultDepth}m`)
  .join('\n');

module.exports = {
  CATALOG,
  getCatalogEntry,
  MODEL_SUMMARY_FOR_KIMI,
};
