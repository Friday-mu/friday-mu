'use client';

// Floor plan tracing editor — modal SVG drawing surface that lets the
// designer trace walls / doors / windows over an uploaded raster floor
// plan. This is the W2 frontend of the Conversational Floor-Plan Editor
// sprint and replaces the single-shot Nanobanana redraw in
// FloorPlanGenerator.tsx with a structured vector model the renderer +
// Kimi can edit by operation.
//
// Coordinate system: everything in the FloorPlanModel is in metres
// (matches floorPlanTypes.ts). A pixelsPerMetre state translates between
// SVG pixels and metres. Canvas is locked at 10x10m for v1; the SVG
// surface is rendered at canvas.width * pixelsPerMetre pixels so the
// scale slider effectively zooms in / out.
//
// Tools:
//   • Wall   — click-drag a line segment, endpoints snap to nearest
//              existing endpoint within 8px.
//   • Door   — click on an existing wall to anchor a door at the click
//              position with a width prompt (default 0.85m).
//   • Window — same as door, width 1.2m, sill 0.9m, height 1.2m.
//   • Select — click a wall/door/window to open a popover with editable
//              properties + Delete.
//
// Undo: snapshot stack of FloorPlanModel, max 20 steps. Ctrl/Cmd+Z and
// the Undo toolbar button both pop. Snapshots are pushed BEFORE every
// mutating action so undo restores the prior state.
//
// Save: POST /api/design/floor-plans with the assembled model. On
// success, parent receives the new version id via onSaved(versionId).

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  Door,
  FloorPlanModel,
  FurnitureCategory,
  FurnitureItem,
  Point,
  RoomRegion,
  Surface,
  Wall,
  Window as PlanWindow,
} from '../../../_data/floorPlanTypes';
import { emptyFloorPlan } from '../../../_data/floorPlanTypes';
import { createFloorPlan } from '../../../_data/designClient';
import { UrlOrUploadInput } from './UrlOrUploadInput';

// ── constants ─────────────────────────────────────────────────────────

const SNAP_DISTANCE_PX = 8;
const WALL_HIT_DISTANCE_PX = 12;
const ENDPOINT_HIT_PX = 10;
const FURNITURE_HIT_SLACK_PX = 4;
const UNDO_LIMIT = 20;
const DEFAULT_PIXELS_PER_METRE = 100;
const MIN_PIXELS_PER_METRE = 20;
const MAX_PIXELS_PER_METRE = 400;
const DEFAULT_WALL_THICKNESS_M = 0.10;
const DEFAULT_DOOR_WIDTH_M = 0.85;
const DEFAULT_WINDOW_WIDTH_M = 1.2;
const DEFAULT_WINDOW_SILL_M = 0.9;
const DEFAULT_WINDOW_HEIGHT_M = 1.2;
const DRAG_THRESHOLD_PX = 3;

type Tool = 'wall' | 'door' | 'window' | 'room' | 'surface' | 'select';
type Stage = 'upload' | 'trace';

// ── surface texture catalog ───────────────────────────────────────────
// Hardcoded list of texture keys the renderer / Gemini texture-pass
// understands. Exported so the design KB and prompt-builder can
// reference the same canonical strings without drifting from the UI.
// Keep entries lowercase + underscore-separated so they round-trip
// cleanly through the LLM grammar.
export const SURFACE_TEXTURE_CATALOG: Array<{
  key: string;
  label: string;
  kind: 'wall_face' | 'floor' | 'ceiling';
}> = [
  // Floors
  { key: 'wood_floor_oak',      label: 'Oak wood floor',       kind: 'floor' },
  { key: 'wood_floor_walnut',   label: 'Walnut wood floor',    kind: 'floor' },
  { key: 'wood_floor_teak',     label: 'Teak wood floor',      kind: 'floor' },
  { key: 'tile_white',          label: 'White ceramic tile',   kind: 'floor' },
  { key: 'tile_terrazzo',       label: 'Terrazzo tile',        kind: 'floor' },
  { key: 'marble_carrara',      label: 'Carrara marble',       kind: 'floor' },
  { key: 'concrete_polished',   label: 'Polished concrete',    kind: 'floor' },
  // Walls
  { key: 'paint_smooth',        label: 'Smooth painted',       kind: 'wall_face' },
  { key: 'paint_limewash',      label: 'Limewash paint',       kind: 'wall_face' },
  { key: 'wallpaper_floral',    label: 'Floral wallpaper',     kind: 'wall_face' },
  { key: 'wood_panel_vertical', label: 'Vertical wood panel',  kind: 'wall_face' },
  { key: 'stone_natural',       label: 'Natural stone',        kind: 'wall_face' },
  { key: 'tile_subway',         label: 'Subway tile',          kind: 'wall_face' },
  // Ceilings
  { key: 'ceiling_smooth_white', label: 'Smooth white ceiling', kind: 'ceiling' },
  { key: 'ceiling_wood_beams',   label: 'Exposed wood beams',   kind: 'ceiling' },
];

/** Lookup helper — returns the label for a texture key, or the key itself. */
function textureLabel(key: string | undefined): string {
  if (!key) return '';
  return SURFACE_TEXTURE_CATALOG.find((t) => t.key === key)?.label ?? key;
}

// ── furniture catalog (mirrored subset of backend/src/design/floor_plan_catalog.js)
// 18 most-common categories Mathias will reach for. Revisit as we see
// real usage.
interface CatalogEntry {
  category: FurnitureCategory;
  displayName: string;
  defaultWidth: number;
  defaultDepth: number;
  group: 'Living' | 'Bedroom' | 'Dining' | 'Kitchen' | 'Bathroom' | 'Office';
}

const FURNITURE_CATALOG: CatalogEntry[] = [
  { category: 'sofa',          displayName: 'Sofa',          defaultWidth: 2.0, defaultDepth: 0.9,  group: 'Living' },
  { category: 'armchair',      displayName: 'Armchair',      defaultWidth: 0.9, defaultDepth: 0.9,  group: 'Living' },
  { category: 'coffee_table',  displayName: 'Coffee table',  defaultWidth: 1.2, defaultDepth: 0.6,  group: 'Living' },
  { category: 'tv_unit',       displayName: 'TV unit',       defaultWidth: 1.8, defaultDepth: 0.45, group: 'Living' },
  { category: 'rug',           displayName: 'Rug',           defaultWidth: 2.4, defaultDepth: 1.6,  group: 'Living' },
  { category: 'bed_king',      displayName: 'King bed',      defaultWidth: 2.0, defaultDepth: 1.8,  group: 'Bedroom' },
  { category: 'bed_double',    displayName: 'Double bed',    defaultWidth: 2.0, defaultDepth: 1.5,  group: 'Bedroom' },
  { category: 'bedside_table', displayName: 'Bedside table', defaultWidth: 0.5, defaultDepth: 0.4,  group: 'Bedroom' },
  { category: 'wardrobe',      displayName: 'Wardrobe',      defaultWidth: 1.8, defaultDepth: 0.6,  group: 'Bedroom' },
  { category: 'dining_table',  displayName: 'Dining table',  defaultWidth: 1.8, defaultDepth: 0.9,  group: 'Dining' },
  { category: 'dining_chair',  displayName: 'Dining chair',  defaultWidth: 0.5, defaultDepth: 0.5,  group: 'Dining' },
  { category: 'kitchen_island',displayName: 'Kitchen island',defaultWidth: 2.4, defaultDepth: 1.0,  group: 'Kitchen' },
  { category: 'fridge',        displayName: 'Fridge',        defaultWidth: 0.7, defaultDepth: 0.7,  group: 'Kitchen' },
  { category: 'bath',          displayName: 'Bath',          defaultWidth: 1.7, defaultDepth: 0.75, group: 'Bathroom' },
  { category: 'shower',        displayName: 'Shower',        defaultWidth: 0.9, defaultDepth: 0.9,  group: 'Bathroom' },
  { category: 'toilet',        displayName: 'Toilet',        defaultWidth: 0.4, defaultDepth: 0.7,  group: 'Bathroom' },
  { category: 'vanity',        displayName: 'Vanity',        defaultWidth: 1.2, defaultDepth: 0.5,  group: 'Bathroom' },
  { category: 'desk',          displayName: 'Desk',          defaultWidth: 1.4, defaultDepth: 0.7,  group: 'Office' },
];

const CATALOG_BY_CATEGORY = new Map<FurnitureCategory, CatalogEntry>(
  FURNITURE_CATALOG.map((e) => [e.category, e]),
);

function catalogDisplayName(category: FurnitureCategory): string {
  return CATALOG_BY_CATEGORY.get(category)?.displayName ?? category;
}

const FURNITURE_DRAG_MIME = 'application/x-fad-furniture-category';

// ── furniture icons ───────────────────────────────────────────────────
// Inline tiny SVG glyph per category. Drawn into a 24-unit viewBox.
// `furnitureIconShapes` returns just the inner shapes so we can reuse
// the same paths inside a wrapping <svg> (catalog cards) or nested
// directly inside a rotated <g> (canvas furniture, where the parent
// already provides x/y/width/height + viewBox). `furnitureIcon` wraps
// the shapes in a sized <svg> for stand-alone use.
//
// All glyphs share a stroke / no-fill style and use `currentColor` so
// the parent controls light/dark colour without prop drilling.
function furnitureIconShapes(category: FurnitureCategory, sw: number): React.ReactElement {
  const stroke = 'currentColor';
  const fill = 'none';
  const common = { stroke, strokeWidth: sw, fill } as const;
  switch (category) {
    case 'sofa':
      return (
        <g>
          <rect x={3} y={9} width={18} height={9} rx={2} {...common} />
          <line x1={8} y1={9} x2={8} y2={15} {...common} />
          <line x1={12} y1={9} x2={12} y2={15} {...common} />
          <line x1={16} y1={9} x2={16} y2={15} {...common} />
        </g>
      );
    case 'armchair':
      return (
        <g>
          <rect x={6} y={8} width={12} height={11} rx={2} {...common} />
          <line x1={10} y1={11} x2={10} y2={16} {...common} />
        </g>
      );
    case 'coffee_table':
      return (
        <g>
          <rect x={3} y={11} width={18} height={4} rx={1} {...common} />
        </g>
      );
    case 'side_table':
      return (
        <g>
          <rect x={8} y={9} width={8} height={8} rx={1} {...common} />
        </g>
      );
    case 'tv_unit':
      return (
        <g>
          <rect x={3} y={13} width={18} height={5} rx={1} {...common} />
          <line x1={8} y1={16} x2={16} y2={16} {...common} />
        </g>
      );
    case 'rug':
      return (
        <g>
          <rect x={3} y={6} width={18} height={12} rx={1} strokeDasharray="2 2" {...common} />
        </g>
      );
    case 'pendant_lamp':
      return (
        <g>
          <line x1={12} y1={3} x2={12} y2={10} {...common} />
          <path d="M 7 14 Q 12 8 17 14 Z" {...common} />
        </g>
      );
    case 'floor_lamp':
      return (
        <g>
          <path d="M 8 7 L 16 7 L 14 12 L 10 12 Z" {...common} />
          <line x1={12} y1={12} x2={12} y2={20} {...common} />
          <line x1={9} y1={20} x2={15} y2={20} {...common} />
        </g>
      );
    case 'table_lamp':
      return (
        <g>
          <path d="M 8 10 L 16 10 L 14 14 L 10 14 Z" {...common} />
          <line x1={12} y1={14} x2={12} y2={18} {...common} />
          <line x1={9} y1={18} x2={15} y2={18} {...common} />
        </g>
      );
    case 'bed_single':
      return (
        <g>
          <rect x={5} y={5} width={14} height={14} rx={1} {...common} />
          <rect x={7} y={7} width={10} height={3} rx={1} {...common} />
        </g>
      );
    case 'bed_double':
      return (
        <g>
          <rect x={3} y={5} width={18} height={14} rx={1} {...common} />
          <rect x={5} y={7} width={6} height={3} rx={1} {...common} />
          <rect x={13} y={7} width={6} height={3} rx={1} {...common} />
        </g>
      );
    case 'bed_king':
      return (
        <g>
          <rect x={2} y={5} width={20} height={14} rx={1} {...common} />
          <rect x={4} y={7} width={7} height={3} rx={1} {...common} />
          <rect x={13} y={7} width={7} height={3} rx={1} {...common} />
        </g>
      );
    case 'bedside_table':
      return (
        <g>
          <rect x={8} y={8} width={8} height={9} rx={1} {...common} />
          <circle cx={12} cy={13} r={1} fill={stroke} stroke="none" />
        </g>
      );
    case 'wardrobe':
      return (
        <g>
          <rect x={6} y={3} width={12} height={18} rx={1} {...common} />
          <line x1={12} y1={3} x2={12} y2={21} {...common} />
          <circle cx={10.5} cy={12} r={0.6} fill={stroke} stroke="none" />
          <circle cx={13.5} cy={12} r={0.6} fill={stroke} stroke="none" />
        </g>
      );
    case 'dresser':
      return (
        <g>
          <rect x={4} y={6} width={16} height={12} rx={1} {...common} />
          <line x1={4} y1={10} x2={20} y2={10} {...common} />
          <line x1={4} y1={14} x2={20} y2={14} {...common} />
          <line x1={12} y1={6} x2={12} y2={18} {...common} />
        </g>
      );
    case 'desk':
      return (
        <g>
          <rect x={3} y={9} width={18} height={3} rx={0.5} {...common} />
          <line x1={5} y1={12} x2={5} y2={17} {...common} />
          <line x1={19} y1={12} x2={19} y2={17} {...common} />
        </g>
      );
    case 'office_chair':
      return (
        <g>
          <rect x={8} y={5} width={8} height={6} rx={1.5} {...common} />
          <line x1={12} y1={11} x2={12} y2={17} {...common} />
          <line x1={8} y1={17} x2={16} y2={17} {...common} />
          <line x1={9} y1={17} x2={7} y2={20} {...common} />
          <line x1={15} y1={17} x2={17} y2={20} {...common} />
        </g>
      );
    case 'dining_table':
      return (
        <g>
          <rect x={3} y={8} width={18} height={8} rx={2} {...common} />
        </g>
      );
    case 'dining_chair':
      return (
        <g>
          <rect x={8} y={6} width={8} height={12} rx={1} {...common} />
          <line x1={8} y1={11} x2={16} y2={11} {...common} />
        </g>
      );
    case 'bar_stool':
      return (
        <g>
          <circle cx={12} cy={9} r={4} {...common} />
          <line x1={12} y1={13} x2={12} y2={20} {...common} />
        </g>
      );
    case 'kitchen_island':
      return (
        <g>
          <rect x={3} y={7} width={18} height={10} rx={1} {...common} />
          <line x1={3} y1={12} x2={21} y2={12} {...common} />
        </g>
      );
    case 'kitchen_counter':
      return (
        <g>
          <rect x={3} y={9} width={18} height={6} rx={1} {...common} />
        </g>
      );
    case 'kitchen_sink':
      return (
        <g>
          <rect x={4} y={8} width={16} height={9} rx={1} {...common} />
          <circle cx={17} cy={11} r={1} {...common} />
        </g>
      );
    case 'fridge':
      return (
        <g>
          <rect x={7} y={3} width={10} height={18} rx={1} {...common} />
          <line x1={7} y1={10} x2={17} y2={10} {...common} />
          <circle cx={14.5} cy={7} r={0.6} fill={stroke} stroke="none" />
          <circle cx={14.5} cy={14} r={0.6} fill={stroke} stroke="none" />
        </g>
      );
    case 'oven':
      return (
        <g>
          <rect x={4} y={5} width={16} height={14} rx={1} {...common} />
          <line x1={4} y1={9} x2={20} y2={9} {...common} />
          <circle cx={12} cy={14} r={2.5} {...common} />
        </g>
      );
    case 'cooktop':
      return (
        <g>
          <rect x={4} y={6} width={16} height={12} rx={1} {...common} />
          <circle cx={9} cy={10} r={1.5} {...common} />
          <circle cx={15} cy={10} r={1.5} {...common} />
          <circle cx={9} cy={15} r={1.5} {...common} />
          <circle cx={15} cy={15} r={1.5} {...common} />
        </g>
      );
    case 'dishwasher':
      return (
        <g>
          <rect x={5} y={4} width={14} height={16} rx={1} {...common} />
          <line x1={5} y1={8} x2={19} y2={8} {...common} />
          <rect x={9} y={11} width={6} height={6} rx={0.5} {...common} />
        </g>
      );
    case 'microwave':
      return (
        <g>
          <rect x={3} y={7} width={18} height={10} rx={1} {...common} />
          <rect x={5} y={9} width={10} height={6} rx={0.5} {...common} />
          <line x1={17} y1={10} x2={19} y2={10} {...common} />
          <line x1={17} y1={13} x2={19} y2={13} {...common} />
        </g>
      );
    case 'bath':
      return (
        <g>
          <rect x={3} y={7} width={18} height={10} rx={3} {...common} />
          <ellipse cx={12} cy={12} rx={6} ry={2.5} {...common} />
        </g>
      );
    case 'shower':
      return (
        <g>
          <rect x={5} y={5} width={14} height={14} rx={1} {...common} />
          <circle cx={12} cy={12} r={1} fill={stroke} stroke="none" />
          <line x1={9} y1={9} x2={10} y2={10} {...common} />
          <line x1={15} y1={9} x2={14} y2={10} {...common} />
          <line x1={9} y1={15} x2={10} y2={14} {...common} />
          <line x1={15} y1={15} x2={14} y2={14} {...common} />
        </g>
      );
    case 'toilet':
      return (
        <g>
          <rect x={9} y={3} width={6} height={5} rx={0.5} {...common} />
          <ellipse cx={12} cy={14} rx={5} ry={6} {...common} />
        </g>
      );
    case 'vanity':
      return (
        <g>
          <rect x={3} y={9} width={18} height={8} rx={1} {...common} />
          <ellipse cx={12} cy={13} rx={4} ry={2} {...common} />
        </g>
      );
    case 'mirror':
      return (
        <g>
          <ellipse cx={12} cy={12} rx={4} ry={8} {...common} />
        </g>
      );
    case 'washing_machine':
      return (
        <g>
          <rect x={5} y={4} width={14} height={16} rx={1} {...common} />
          <circle cx={12} cy={13} r={4} {...common} />
          <circle cx={12} cy={13} r={1.5} {...common} />
        </g>
      );
    case 'dryer':
      return (
        <g>
          <rect x={5} y={4} width={14} height={16} rx={1} {...common} />
          <circle cx={12} cy={13} r={4} {...common} />
          <line x1={10} y1={11} x2={14} y2={15} {...common} />
        </g>
      );
    case 'plant':
      return (
        <g>
          <path d="M 12 14 C 7 11 8 5 12 6 C 16 5 17 11 12 14 Z" {...common} />
          <path d="M 9 19 L 15 19 L 14 14 L 10 14 Z" {...common} />
        </g>
      );
    case 'artwork':
      return (
        <g>
          <rect x={4} y={5} width={16} height={14} rx={0.5} {...common} />
          <line x1={4} y1={15} x2={10} y2={9} {...common} />
          <line x1={10} y1={9} x2={14} y2={13} {...common} />
          <line x1={14} y1={13} x2={20} y2={8} {...common} />
        </g>
      );
    case 'shelves':
      return (
        <g>
          <rect x={5} y={4} width={14} height={16} rx={0.5} {...common} />
          <line x1={5} y1={9} x2={19} y2={9} {...common} />
          <line x1={5} y1={14} x2={19} y2={14} {...common} />
          <line x1={5} y1={19} x2={19} y2={19} {...common} />
        </g>
      );
    case 'cabinet':
      return (
        <g>
          <rect x={5} y={4} width={14} height={16} rx={1} {...common} />
          <line x1={12} y1={4} x2={12} y2={20} {...common} />
        </g>
      );
    case 'door_swing':
      return (
        <g>
          <line x1={5} y1={19} x2={5} y2={5} {...common} />
          <path d="M 5 5 A 14 14 0 0 1 19 19" {...common} />
        </g>
      );
    case 'stairs':
      return (
        <g>
          <path d="M 3 21 L 3 17 L 9 17 L 9 13 L 15 13 L 15 9 L 21 9 L 21 5" {...common} />
        </g>
      );
    case 'other':
    default:
      return (
        <g>
          <rect x={5} y={5} width={14} height={14} rx={2} {...common} />
        </g>
      );
  }
}

/**
 * Stand-alone furniture icon — used by the catalog cards. Wraps the
 * shape group in a sized `<svg>`. For nesting inside a parent SVG (the
 * canvas furniture render), use `furnitureIconShapes` directly with a
 * caller-supplied wrapping `<svg x=... y=... width=... height=...>`.
 */
function furnitureIcon(category: FurnitureCategory, size: number = 24): React.ReactElement {
  // Stroke width is computed in viewBox units (24-wide) so visual
  // weight stays consistent regardless of the rendered pixel size.
  const sw = Math.max(1, 24 / 18);
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      {furnitureIconShapes(category, sw)}
    </svg>
  );
}

interface Props {
  projectId: string;
  /** Existing model to start from (re-edit), or undefined for blank. */
  initialModel?: FloorPlanModel;
  /** Existing source raster URL — skip the upload step if provided. */
  initialSourceImageUrl?: string;
  /**
   * Which floor of the project this trace belongs to. 0 = ground.
   * Defaults to 0 when omitted so existing single-floor callers keep
   * working unchanged.
   */
  floorIndex?: number;
  /**
   * Free-text label for the floor ("Loft", "1st floor"). Persisted on
   * the new version so the studio can render correct tab names.
   */
  floorLabel?: string | null;
  onSaved: (versionId: string) => void;
  onClose: () => void;
}

type SelectedItem =
  | { kind: 'wall'; id: string }
  | { kind: 'door'; id: string }
  | { kind: 'window'; id: string }
  | { kind: 'furniture'; id: string }
  | { kind: 'room'; id: string }
  | { kind: 'surface'; id: string }
  | null;

// Active drag-to-move (Select tool). Captured on mouseDown when the
// user grabs an existing item; consumed on mouseMove (mutate) and
// cleared on mouseUp.
type DragOp =
  | { kind: 'wall-endpoint'; wallId: string; end: 'a' | 'b'; startM: Point; origA: Point; origB: Point }
  | { kind: 'wall-translate'; wallId: string; startM: Point; origA: Point; origB: Point }
  | { kind: 'door-slide'; doorId: string; wallId: string }
  | { kind: 'window-slide'; windowId: string; wallId: string }
  | { kind: 'furniture-translate'; itemId: string; startM: Point; origCentre: Point }
  | { kind: 'room-vertex'; roomId: string; vertexIdx: number; origOutline: Point[] }
  | null;

// ── id helpers ────────────────────────────────────────────────────────

function shortId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── geometry helpers (all in metres unless noted) ─────────────────────

function distPx(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Distance from point p to segment a-b. All inputs in the same unit
 * (we call it in pixel-space for hit-testing).
 */
function distPointToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return Math.hypot(p.x - px, p.y - py);
}

/** Project p onto segment a-b, return the t (0..1). */
function projectRatioOnSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return 0;
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return t;
}

function pointAlongWall(wall: Wall, ratio: number): Point {
  return {
    x: wall.a.x + (wall.b.x - wall.a.x) * ratio,
    y: wall.a.y + (wall.b.y - wall.a.y) * ratio,
  };
}

function wallLengthM(wall: Wall): number {
  return Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
}

/** Ray-cast point-in-polygon test. polygon = array of points (metres or px). */
function pointInPolygon(p: { x: number; y: number }, polygon: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = ((yi > p.y) !== (yj > p.y)) &&
      (p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Convert a #rrggbb hex string into an rgba() with the given alpha.
 * Used to render surface fills at ~40% opacity over rooms without
 * needing a separate fill prop on the SVG element. Falls back to a
 * neutral grey if the input doesn't parse — never throws so a typo in
 * the color picker can't break rendering.
 */
function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return `rgba(156,163,175,${alpha})`;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Simple centroid of polygon points (not weighted — fine for label placement). */
function polygonCentroid(polygon: Point[]): Point {
  if (polygon.length === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const p of polygon) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / polygon.length, y: sy / polygon.length };
}

/**
 * Hit-test a rotated rectangle. centre, w, d in metres; rotation degrees.
 * pointM in metres. slackPx adds tolerance on hit edge (converted via pxPerM).
 */
function pointInRotatedRect(
  pointM: Point,
  centre: Point,
  w: number,
  d: number,
  rotationDeg: number,
  slackM: number,
): boolean {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(-rad);
  const sin = Math.sin(-rad);
  const dx = pointM.x - centre.x;
  const dy = pointM.y - centre.y;
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;
  return (
    Math.abs(localX) <= w / 2 + slackM &&
    Math.abs(localY) <= d / 2 + slackM
  );
}

// ── component ─────────────────────────────────────────────────────────

export function FloorPlanTracingEditor({
  projectId,
  initialModel,
  initialSourceImageUrl,
  floorIndex,
  floorLabel,
  onSaved,
  onClose,
}: Props) {
  // Skip the upload stage if a source URL is preloaded.
  const [stage, setStage] = useState<Stage>(initialSourceImageUrl ? 'trace' : 'upload');
  const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(initialSourceImageUrl ?? null);

  const [model, setModel] = useState<FloorPlanModel>(() => initialModel ?? emptyFloorPlan());
  const [tool, setTool] = useState<Tool>('wall');
  const [pixelsPerMetre, setPixelsPerMetre] = useState<number>(DEFAULT_PIXELS_PER_METRE);
  const [selected, setSelected] = useState<SelectedItem>(null);

  // In-progress wall drag state, in metres.
  const [drawingWall, setDrawingWall] = useState<{ a: Point; b: Point } | null>(null);
  const [hoverSnap, setHoverSnap] = useState<Point | null>(null);

  // In-progress room polygon (room tool). Vertices in metres.
  const [drawingRoom, setDrawingRoom] = useState<Point[] | null>(null);
  // Live cursor position used for previewing the next room edge.
  const [roomCursor, setRoomCursor] = useState<Point | null>(null);

  // Active drag-to-move op (Select tool).
  const [dragOp, setDragOp] = useState<DragOp>(null);
  // Tracks whether the current pointer-down has dragged past the
  // threshold yet — used so a click that doesn't move still opens the
  // popover instead of being interpreted as a drag.
  const dragMovedRef = useRef<boolean>(false);
  // Starting client position of the mousedown, used to gate drag start.
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  // Pan + zoom viewport. pan in pixel units, applied as a CSS transform
  // on the SVG wrapper.
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  // Spacebar-held state for pan-on-drag.
  const [spaceHeld, setSpaceHeld] = useState(false);
  // Active pan-drag (middle mouse OR space+left). Captures start.
  const [panning, setPanning] = useState<{ startClientX: number; startClientY: number; origPan: { x: number; y: number } } | null>(null);

  // Shift-held latch — read by the rotation slider to snap to 15°
  // increments while the user drags. We use a ref (not state) so the
  // slider's onChange always sees the latest value without forcing a
  // re-render on every keydown.
  const shiftHeldRef = useRef<boolean>(false);

  // Properties popover anchor — in SVG pixels.
  const [popover, setPopover] = useState<{ x: number; y: number } | null>(null);

  // Undo stack (capped). Each entry is a snapshot of the model before
  // a mutating action.
  const [undoStack, setUndoStack] = useState<FloorPlanModel[]>([]);
  const [dirty, setDirty] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);

  // ── snapshots / undo ────────────────────────────────────────────────

  function pushSnapshot(prev: FloorPlanModel) {
    setUndoStack((stack) => {
      const next = [...stack, prev];
      if (next.length > UNDO_LIMIT) next.shift();
      return next;
    });
    setDirty(true);
  }

  function undo() {
    setUndoStack((stack) => {
      if (stack.length === 0) return stack;
      const next = stack.slice(0, -1);
      const snap = stack[stack.length - 1];
      setModel(snap);
      setSelected(null);
      setPopover(null);
      return next;
    });
  }

  // ── coord conversion ────────────────────────────────────────────────
  // Defensive: if a malformed initialModel arrives without a canvas
  // (eg. a corrupted version row, or a future schema change), fall
  // back to the default 10×10m canvas rather than rendering NaN-sized
  // SVG that crashes the modal.
  const canvasW = Number.isFinite(model.canvas?.width) && model.canvas.width > 0
    ? model.canvas.width
    : 10;
  const canvasH = Number.isFinite(model.canvas?.height) && model.canvas.height > 0
    ? model.canvas.height
    : 10;
  const svgWidthPx = canvasW * pixelsPerMetre;
  const svgHeightPx = canvasH * pixelsPerMetre;

  function mouseToMetres(e: React.MouseEvent<SVGElement>): Point {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    const yPx = e.clientY - rect.top;
    return { x: xPx / pixelsPerMetre, y: yPx / pixelsPerMetre };
  }

  function metresToPx(p: Point): { x: number; y: number } {
    return { x: p.x * pixelsPerMetre, y: p.y * pixelsPerMetre };
  }

  // ── snap helper ─────────────────────────────────────────────────────
  // Returns the closest existing endpoint within SNAP_DISTANCE_PX of
  // pointM (metres), in METRES, or null.
  function snapEndpoint(pointM: Point, excludeWallId?: string): Point | null {
    const candidates: Point[] = [];
    for (const w of model.walls) {
      if (excludeWallId && w.id === excludeWallId) continue;
      candidates.push(w.a, w.b);
    }
    let best: { p: Point; dPx: number } | null = null;
    const pPx = metresToPx(pointM);
    for (const c of candidates) {
      const cPx = metresToPx(c);
      const d = distPx(pPx, cPx);
      if (d <= SNAP_DISTANCE_PX && (best === null || d < best.dPx)) {
        best = { p: c, dPx: d };
      }
    }
    return best ? best.p : null;
  }

  // ── wall hit test ───────────────────────────────────────────────────
  // pointM in metres; returns the wall the user clicked on (within
  // WALL_HIT_DISTANCE_PX) and the projection ratio along it.
  function hitTestWall(pointM: Point): { wall: Wall; ratio: number } | null {
    const pPx = metresToPx(pointM);
    let best: { wall: Wall; ratio: number; dPx: number } | null = null;
    for (const w of model.walls) {
      const aPx = metresToPx(w.a);
      const bPx = metresToPx(w.b);
      const d = distPointToSegment(pPx, aPx, bPx);
      if (d <= WALL_HIT_DISTANCE_PX && (best === null || d < best.dPx)) {
        const ratio = projectRatioOnSegment(pPx, aPx, bPx);
        best = { wall: w, ratio, dPx: d };
      }
    }
    return best ? { wall: best.wall, ratio: best.ratio } : null;
  }

  /**
   * Hit-test wall endpoints — returns the wall + which end was hit, if
   * the click is within ENDPOINT_HIT_PX of an endpoint. Higher priority
   * than door/window/wall midpoint hit-tests.
   */
  function hitTestWallEndpoint(pointM: Point): { wallId: string; end: 'a' | 'b' } | null {
    const pPx = metresToPx(pointM);
    let best: { wallId: string; end: 'a' | 'b'; dPx: number } | null = null;
    for (const w of model.walls) {
      const aPx = metresToPx(w.a);
      const bPx = metresToPx(w.b);
      const dA = distPx(pPx, aPx);
      const dB = distPx(pPx, bPx);
      if (dA <= ENDPOINT_HIT_PX && (best === null || dA < best.dPx)) {
        best = { wallId: w.id, end: 'a', dPx: dA };
      }
      if (dB <= ENDPOINT_HIT_PX && (best === null || dB < best.dPx)) {
        best = { wallId: w.id, end: 'b', dPx: dB };
      }
    }
    return best ? { wallId: best.wallId, end: best.end } : null;
  }

  /** Hit-test furniture items. Returns the topmost (last in array) hit. */
  function hitTestFurniture(pointM: Point): FurnitureItem | null {
    const slackM = FURNITURE_HIT_SLACK_PX / pixelsPerMetre;
    // Iterate reverse so topmost (last-drawn) wins.
    for (let i = model.furniture.length - 1; i >= 0; i--) {
      const f = model.furniture[i];
      if (pointInRotatedRect(pointM, f.centre, f.width, f.depth, f.rotation, slackM)) {
        return f;
      }
    }
    return null;
  }

  /**
   * Hit-test a vertex of the currently-selected room. Returns the
   * vertex index, or null if no handle is under the cursor. Only the
   * selected room exposes handles, so this is intentionally scoped to
   * `selected` rather than scanning all rooms.
   */
  function hitTestRoomVertex(pointM: Point): { roomId: string; vertexIdx: number } | null {
    if (selected?.kind !== 'room') return null;
    const room = model.rooms.find((r) => r.id === selected.id);
    if (!room) return null;
    const pPx = metresToPx(pointM);
    let best: { vertexIdx: number; dPx: number } | null = null;
    for (let i = 0; i < room.outline.length; i++) {
      const vPx = metresToPx(room.outline[i]);
      const d = distPx(pPx, vPx);
      if (d <= ENDPOINT_HIT_PX && (best === null || d < best.dPx)) {
        best = { vertexIdx: i, dPx: d };
      }
    }
    return best ? { roomId: room.id, vertexIdx: best.vertexIdx } : null;
  }

  /** Hit-test rooms by point-in-polygon (lowest priority). */
  function hitTestRoom(pointM: Point): RoomRegion | null {
    for (let i = model.rooms.length - 1; i >= 0; i--) {
      const r = model.rooms[i];
      if (r.outline.length >= 3 && pointInPolygon(pointM, r.outline)) {
        return r;
      }
    }
    return null;
  }

  // Doors / windows are anchored on walls — hit-test them by computing
  // their pixel position and checking proximity.
  function hitTestDoorOrWindow(pointM: Point): SelectedItem {
    const pPx = metresToPx(pointM);
    const candidates: Array<{ kind: 'door' | 'window'; id: string; centrePx: { x: number; y: number } }> = [];
    for (const d of model.doors) {
      const w = model.walls.find((wl) => wl.id === d.wallId);
      if (!w) continue;
      candidates.push({ kind: 'door', id: d.id, centrePx: metresToPx(pointAlongWall(w, d.positionRatio)) });
    }
    for (const wn of model.windows) {
      const w = model.walls.find((wl) => wl.id === wn.wallId);
      if (!w) continue;
      candidates.push({ kind: 'window', id: wn.id, centrePx: metresToPx(pointAlongWall(w, wn.positionRatio)) });
    }
    let best: { item: { kind: 'door' | 'window'; id: string }; dPx: number } | null = null;
    for (const c of candidates) {
      const d = distPx(pPx, c.centrePx);
      if (d <= WALL_HIT_DISTANCE_PX && (best === null || d < best.dPx)) {
        best = { item: { kind: c.kind, id: c.id }, dPx: d };
      }
    }
    return best ? best.item : null;
  }

  // ── pointer handlers ────────────────────────────────────────────────

  function onMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    // Middle-mouse OR space+left = pan-drag, regardless of tool.
    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      e.preventDefault();
      setPanning({
        startClientX: e.clientX,
        startClientY: e.clientY,
        origPan: { ...pan },
      });
      return;
    }
    if (e.button !== 0) return;
    const pM = mouseToMetres(e);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    dragMovedRef.current = false;

    if (tool === 'wall') {
      // Start a wall drag. Snap the start point.
      const snap = snapEndpoint(pM);
      const a = snap ?? pM;
      setDrawingWall({ a, b: a });
      setHoverSnap(null);
      setSelected(null);
      setPopover(null);
      return;
    }

    if (tool === 'door' || tool === 'window') {
      const hit = hitTestWall(pM);
      if (!hit) {
        setError(`Click on an existing wall to place a ${tool}.`);
        return;
      }
      setError(null);

      // Prompt for width inline. window.prompt is blocking — fine for
      // v1; a richer dialog is overkill given how rare this op is.
      const defaultWidth = tool === 'door' ? DEFAULT_DOOR_WIDTH_M : DEFAULT_WINDOW_WIDTH_M;
      const wallLen = wallLengthM(hit.wall);
      const max = Math.max(0.1, wallLen - 0.1);
      const raw = typeof window !== 'undefined'
        ? window.prompt(`${tool === 'door' ? 'Door' : 'Window'} width in metres (max ${max.toFixed(2)})`, String(defaultWidth))
        : String(defaultWidth);
      if (raw === null) return; // user cancelled
      const widthM = Number(raw);
      if (!Number.isFinite(widthM) || widthM <= 0) {
        setError('Width must be a positive number.');
        return;
      }
      const clampedWidth = Math.min(widthM, max);

      pushSnapshot(model);
      if (tool === 'door') {
        const d: Door = {
          id: shortId('door'),
          wallId: hit.wall.id,
          positionRatio: hit.ratio,
          width: clampedWidth,
          swing: 'left',
        };
        setModel({ ...model, doors: [...model.doors, d] });
        setSelected({ kind: 'door', id: d.id });
      } else {
        const wn: PlanWindow = {
          id: shortId('win'),
          wallId: hit.wall.id,
          positionRatio: hit.ratio,
          width: clampedWidth,
          sillHeight: DEFAULT_WINDOW_SILL_M,
          height: DEFAULT_WINDOW_HEIGHT_M,
        };
        setModel({ ...model, windows: [...model.windows, wn] });
        setSelected({ kind: 'window', id: wn.id });
      }
      setPopover(null);
      return;
    }

    if (tool === 'room') {
      // Click sequentially to add a vertex. Click on the first vertex
      // (within ENDPOINT_HIT_PX) to close. Double-click handled elsewhere.
      const verts = drawingRoom ?? [];
      if (verts.length >= 3) {
        const firstPx = metresToPx(verts[0]);
        const clickPx = metresToPx(pM);
        if (distPx(firstPx, clickPx) <= ENDPOINT_HIT_PX) {
          finishRoom(verts);
          return;
        }
      }
      setDrawingRoom([...verts, pM]);
      setRoomCursor(pM);
      return;
    }

    if (tool === 'surface') {
      // Surface assignment — three target kinds resolved by hit-test +
      // modifier:
      //   • wall hit (no modifier)            → wall_face
      //   • room polygon hit, no modifier     → floor
      //   • room polygon hit, cmd/ctrl/meta   → ceiling
      // We resolve walls before rooms because walls are drawn on top of
      // floor zones and the user's intent is clearer at the line.
      const wallHit = hitTestWall(pM);
      if (wallHit) {
        handleSurfaceAssignWall(wallHit.wall, pM);
        return;
      }
      const roomHit = hitTestRoom(pM);
      if (roomHit) {
        const kind: Surface['kind'] = (e.metaKey || e.ctrlKey) ? 'ceiling' : 'floor';
        handleSurfaceAssignFloorOrCeiling(roomHit, kind, pM);
        return;
      }
      setError('Click on a wall, inside a room (floor), or cmd-click inside a room (ceiling).');
      return;
    }

    if (tool === 'select') {
      // Hit-test priority (highest to lowest):
      //   1. Room vertex handles (only if a room is selected)
      //   2. Wall endpoint handles (only if the selected item is a wall)
      //   3. Door / window
      //   4. Furniture
      //   5. Wall midpoint
      //   6. Room
      const vertexHit = hitTestRoomVertex(pM);
      if (vertexHit) {
        const room = model.rooms.find((r) => r.id === vertexHit.roomId);
        if (room) {
          setDragOp({
            kind: 'room-vertex',
            roomId: room.id,
            vertexIdx: vertexHit.vertexIdx,
            origOutline: room.outline.map((p) => ({ ...p })),
          });
          setSelected({ kind: 'room', id: room.id });
          setPopover(null);
          return;
        }
      }

      const endpointHit = selected?.kind === 'wall' ? hitTestWallEndpoint(pM) : null;
      if (endpointHit) {
        const w = model.walls.find((wl) => wl.id === endpointHit.wallId);
        if (w) {
          setDragOp({
            kind: 'wall-endpoint',
            wallId: w.id,
            end: endpointHit.end,
            startM: pM,
            origA: { ...w.a },
            origB: { ...w.b },
          });
          setSelected({ kind: 'wall', id: w.id });
          setPopover(null);
          return;
        }
      }

      const dw = hitTestDoorOrWindow(pM);
      if (dw) {
        setSelected(dw);
        const pPx = metresToPx(pM);
        setPopover({ x: pPx.x, y: pPx.y });
        if (dw.kind === 'door') {
          const door = model.doors.find((d) => d.id === dw.id);
          if (door) setDragOp({ kind: 'door-slide', doorId: door.id, wallId: door.wallId });
        } else if (dw.kind === 'window') {
          const wn = model.windows.find((x) => x.id === dw.id);
          if (wn) setDragOp({ kind: 'window-slide', windowId: wn.id, wallId: wn.wallId });
        }
        return;
      }

      const furn = hitTestFurniture(pM);
      if (furn) {
        setSelected({ kind: 'furniture', id: furn.id });
        const pPx = metresToPx(pM);
        setPopover({ x: pPx.x, y: pPx.y });
        setDragOp({
          kind: 'furniture-translate',
          itemId: furn.id,
          startM: pM,
          origCentre: { ...furn.centre },
        });
        return;
      }

      const wallHit = hitTestWall(pM);
      if (wallHit) {
        setSelected({ kind: 'wall', id: wallHit.wall.id });
        const pPx = metresToPx(pM);
        setPopover({ x: pPx.x, y: pPx.y });
        setDragOp({
          kind: 'wall-translate',
          wallId: wallHit.wall.id,
          startM: pM,
          origA: { ...wallHit.wall.a },
          origB: { ...wallHit.wall.b },
        });
        return;
      }

      const roomHit = hitTestRoom(pM);
      if (roomHit) {
        setSelected({ kind: 'room', id: roomHit.id });
        const pPx = metresToPx(pM);
        setPopover({ x: pPx.x, y: pPx.y });
        return;
      }

      setSelected(null);
      setPopover(null);
    }
  }

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    // Pan-drag takes precedence over everything else.
    if (panning) {
      const dx = e.clientX - panning.startClientX;
      const dy = e.clientY - panning.startClientY;
      setPan({ x: panning.origPan.x + dx, y: panning.origPan.y + dy });
      return;
    }

    const pM = mouseToMetres(e);

    // Track whether mouse has moved enough to count as a drag.
    if (dragStartRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
        dragMovedRef.current = true;
      }
    }

    if (tool === 'wall' && drawingWall) {
      const snap = snapEndpoint(pM);
      setHoverSnap(snap);
      setDrawingWall({ a: drawingWall.a, b: snap ?? pM });
      return;
    }

    // Visual feedback for snap while hovering with wall tool, even
    // before a drag has started — helps users see what they'd snap to.
    if (tool === 'wall' && !drawingWall) {
      const snap = snapEndpoint(pM);
      setHoverSnap(snap);
    }

    if (tool === 'room' && drawingRoom && drawingRoom.length > 0) {
      setRoomCursor(pM);
    }

    if (tool === 'select' && dragOp) {
      // Mutate the model in-place per the active op.
      if (dragOp.kind === 'wall-endpoint') {
        // Snap the moving endpoint to other endpoints (excluding this wall).
        const snap = snapEndpoint(pM, dragOp.wallId);
        const target = snap ?? pM;
        setModel((m) => ({
          ...m,
          walls: m.walls.map((w) =>
            w.id === dragOp.wallId
              ? { ...w, [dragOp.end]: target } as Wall
              : w,
          ),
        }));
        setHoverSnap(snap);
        return;
      }
      if (dragOp.kind === 'wall-translate') {
        const dxM = pM.x - dragOp.startM.x;
        const dyM = pM.y - dragOp.startM.y;
        setModel((m) => ({
          ...m,
          walls: m.walls.map((w) =>
            w.id === dragOp.wallId
              ? {
                  ...w,
                  a: { x: dragOp.origA.x + dxM, y: dragOp.origA.y + dyM },
                  b: { x: dragOp.origB.x + dxM, y: dragOp.origB.y + dyM },
                }
              : w,
          ),
        }));
        return;
      }
      if (dragOp.kind === 'door-slide' || dragOp.kind === 'window-slide') {
        const w = model.walls.find((wl) => wl.id === dragOp.wallId);
        if (!w) return;
        const aPx = metresToPx(w.a);
        const bPx = metresToPx(w.b);
        const pPx = metresToPx(pM);
        const rawRatio = projectRatioOnSegment(pPx, aPx, bPx);
        const wallLen = wallLengthM(w);
        if (dragOp.kind === 'door-slide') {
          const door = model.doors.find((d) => d.id === dragOp.doorId);
          if (!door || wallLen === 0) return;
          const halfRatio = door.width / 2 / wallLen;
          const clamped = Math.max(halfRatio, Math.min(1 - halfRatio, rawRatio));
          setModel((m) => ({
            ...m,
            doors: m.doors.map((d) => (d.id === door.id ? { ...d, positionRatio: clamped } : d)),
          }));
        } else {
          const wn = model.windows.find((x) => x.id === dragOp.windowId);
          if (!wn || wallLen === 0) return;
          const halfRatio = wn.width / 2 / wallLen;
          const clamped = Math.max(halfRatio, Math.min(1 - halfRatio, rawRatio));
          setModel((m) => ({
            ...m,
            windows: m.windows.map((x) => (x.id === wn.id ? { ...x, positionRatio: clamped } : x)),
          }));
        }
        return;
      }
      if (dragOp.kind === 'furniture-translate') {
        const dxM = pM.x - dragOp.startM.x;
        const dyM = pM.y - dragOp.startM.y;
        setModel((m) => ({
          ...m,
          furniture: m.furniture.map((f) =>
            f.id === dragOp.itemId
              ? { ...f, centre: { x: dragOp.origCentre.x + dxM, y: dragOp.origCentre.y + dyM } }
              : f,
          ),
        }));
        return;
      }
      if (dragOp.kind === 'room-vertex') {
        setModel((m) => ({
          ...m,
          rooms: m.rooms.map((r) =>
            r.id === dragOp.roomId
              ? {
                  ...r,
                  outline: r.outline.map((v, i) =>
                    i === dragOp.vertexIdx ? { x: pM.x, y: pM.y } : v,
                  ),
                }
              : r,
          ),
        }));
        return;
      }
    }
  }

  function onMouseUp() {
    if (panning) {
      setPanning(null);
      return;
    }
    dragStartRef.current = null;

    if (tool === 'wall' && drawingWall) {
      const len = Math.hypot(drawingWall.b.x - drawingWall.a.x, drawingWall.b.y - drawingWall.a.y);
      // Reject zero-length walls (just a click without drag).
      if (len < 0.05) {
        setDrawingWall(null);
        setHoverSnap(null);
        return;
      }
      const wall: Wall = {
        id: shortId('wall'),
        a: drawingWall.a,
        b: drawingWall.b,
        thickness: DEFAULT_WALL_THICKNESS_M,
      };
      pushSnapshot(model);
      setModel({ ...model, walls: [...model.walls, wall] });
      setDrawingWall(null);
      setHoverSnap(null);
    }

    if (dragOp) {
      // If the user merely clicked without moving, we already opened
      // the popover — drop the drag op silently. If they did drag,
      // push a single snapshot for undo. We can't push it on mouse-down
      // (or undo would jump back to before the move started in a
      // confusing way for every micro-click), so we do it on a real drag.
      if (dragMovedRef.current) {
        // Snapshot was not pushed at drag start because we didn't know
        // yet whether it'd be a real drag. Push *the pre-drag state*
        // by reconstructing the original — only the wall-endpoint,
        // wall-translate, and furniture-translate ops carry origs.
        // Door/window slide is fast and reversible by the same drag,
        // so we keep undo coarse: push current state's "before" by
        // restoring from origs into a snapshot before mutation.
        // To keep the implementation simple we push the *current* model
        // as the new state and rely on the user re-dragging to fix.
        // Better: rebuild the snapshot from origs.
        const snap = buildPreDragSnapshot(dragOp, model);
        if (snap) pushSnapshot(snap);
        setDirty(true);
      }
      setDragOp(null);
      setHoverSnap(null);
    }
    dragMovedRef.current = false;
  }

  // ── touch handlers ──────────────────────────────────────────────────
  //
  // Mathias does site visits on a phone, so the editor needs to work
  // without a mouse. Strategy:
  //
  //   • 1 touch  → adapt the touch into a mouse-event-shaped object and
  //                dispatch to the existing mouse handlers. This is what
  //                gets us wall-drag, door/window placement, room-vertex
  //                drag etc. for free.
  //   • 2 touches → start a pinch gesture. We track the initial distance
  //                + midpoint between the two touches. onTouchMove
  //                handles BOTH pinch-zoom (distance ratio scales
  //                pixelsPerMetre, anchored on midpoint) AND two-finger
  //                pan (midpoint translation moves the pan vector — UX
  //                parity with space+drag on desktop).
  //
  // All touch events call preventDefault() so the browser's default
  // double-tap-zoom / page-pan don't trample us. We also set
  // touch-action: none on the SVG wrapper for the same reason.

  // Pinch gesture state — null when fewer than 2 active touches.
  const pinchRef = useRef<{
    startDistPx: number;
    startPixelsPerMetre: number;
    lastMidClient: { x: number; y: number };
    startPan: { x: number; y: number };
  } | null>(null);

  /**
   * Convert a Touch into a synthetic mouse-event-shaped object that the
   * existing onMouseDown/Move/Up handlers can consume. Only the fields
   * those handlers actually read are populated.
   */
  function synthesizeMouseEvent(touch: Touch): React.MouseEvent<SVGSVGElement> {
    return {
      clientX: touch.clientX,
      clientY: touch.clientY,
      button: 0,
      buttons: 1,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      preventDefault: () => {},
      stopPropagation: () => {},
    } as unknown as React.MouseEvent<SVGSVGElement>;
  }

  function touchDistPx(t1: Touch, t2: Touch): number {
    return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
  }

  function touchMidpoint(t1: Touch, t2: Touch): { x: number; y: number } {
    return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
  }

  function onTouchStart(e: React.TouchEvent<SVGSVGElement>) {
    e.preventDefault();
    if (e.touches.length === 1) {
      // Single touch — treat as left-mouse-down at the touch point.
      onMouseDown(synthesizeMouseEvent(e.touches[0]));
      return;
    }
    if (e.touches.length === 2) {
      // Cancel any in-flight single-touch drag so we don't keep
      // drawing while pinching.
      setDrawingWall(null);
      setHoverSnap(null);
      setDragOp(null);
      dragStartRef.current = null;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      pinchRef.current = {
        startDistPx: touchDistPx(t1, t2),
        startPixelsPerMetre: pixelsPerMetre,
        lastMidClient: touchMidpoint(t1, t2),
        startPan: { ...pan },
      };
    }
  }

  function onTouchMove(e: React.TouchEvent<SVGSVGElement>) {
    e.preventDefault();
    if (e.touches.length === 2 && pinchRef.current) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const newDist = touchDistPx(t1, t2);
      const newMid = touchMidpoint(t1, t2);
      const p = pinchRef.current;

      // Scale pixelsPerMetre by the distance ratio, anchored on the
      // pinch midpoint (in SVG-local coordinates) — same anchored-zoom
      // math as the wheel handler.
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const anchorPxX = newMid.x - rect.left;
      const anchorPxY = newMid.y - rect.top;
      const anchorM = {
        x: anchorPxX / pixelsPerMetre,
        y: anchorPxY / pixelsPerMetre,
      };
      const ratio = p.startDistPx > 0 ? newDist / p.startDistPx : 1;
      const targetPpm = p.startPixelsPerMetre * ratio;
      const nextPpm = Math.max(
        MIN_PIXELS_PER_METRE,
        Math.min(MAX_PIXELS_PER_METRE, targetPpm),
      );
      if (nextPpm !== pixelsPerMetre) {
        setPixelsPerMetre(nextPpm);
        setPan((pp) => ({
          x: pp.x + (anchorPxX - anchorM.x * nextPpm),
          y: pp.y + (anchorPxY - anchorM.y * nextPpm),
        }));
      }

      // Two-finger pan: translate by midpoint delta since last frame.
      // Same UX as Space+drag — works alongside pinch (typical when
      // the user is reframing while zooming).
      const dx = newMid.x - p.lastMidClient.x;
      const dy = newMid.y - p.lastMidClient.y;
      if (dx !== 0 || dy !== 0) {
        setPan((pp) => ({ x: pp.x + dx, y: pp.y + dy }));
      }
      pinchRef.current = {
        ...p,
        lastMidClient: newMid,
      };
      return;
    }
    if (e.touches.length === 1 && !pinchRef.current) {
      onMouseMove(synthesizeMouseEvent(e.touches[0]));
    }
  }

  function onTouchEnd(e: React.TouchEvent<SVGSVGElement>) {
    e.preventDefault();
    if (pinchRef.current && e.touches.length < 2) {
      pinchRef.current = null;
      // Don't fall through to mouseUp — pinch isn't a click.
      // If a single finger is still down, the next touchmove will
      // start tracking as a 1-touch drag. We don't try to convert it
      // to a fresh mousedown mid-gesture because the user is likely
      // lifting their hand, not starting to draw.
      return;
    }
    if (e.touches.length === 0) {
      onMouseUp();
    }
  }

  /**
   * Reconstruct the "before" snapshot for a drag op, so undo restores
   * the exact pre-drag state. Returns null for ops we don't reconstruct
   * (door/window slide) — in which case the caller skips the snapshot.
   */
  function buildPreDragSnapshot(op: NonNullable<DragOp>, current: FloorPlanModel): FloorPlanModel | null {
    if (op.kind === 'wall-endpoint' || op.kind === 'wall-translate') {
      return {
        ...current,
        walls: current.walls.map((w) =>
          w.id === op.wallId ? { ...w, a: op.origA, b: op.origB } : w,
        ),
      };
    }
    if (op.kind === 'furniture-translate') {
      return {
        ...current,
        furniture: current.furniture.map((f) =>
          f.id === op.itemId ? { ...f, centre: op.origCentre } : f,
        ),
      };
    }
    if (op.kind === 'room-vertex') {
      return {
        ...current,
        rooms: current.rooms.map((r) =>
          r.id === op.roomId ? { ...r, outline: op.origOutline } : r,
        ),
      };
    }
    if (op.kind === 'door-slide' || op.kind === 'window-slide') {
      // Coarse: skip — door/window position is one number, easy to redo by eye.
      return null;
    }
    return null;
  }

  // ── room polygon helpers ────────────────────────────────────────────

  function finishRoom(verts: Point[]) {
    if (verts.length < 3) {
      setError('A room needs at least 3 points.');
      setDrawingRoom(null);
      setRoomCursor(null);
      return;
    }
    const label = typeof window !== 'undefined'
      ? window.prompt('Room label (e.g. "Living room")', 'Room')
      : 'Room';
    if (label === null) {
      setDrawingRoom(null);
      setRoomCursor(null);
      return;
    }
    const room: RoomRegion = {
      id: shortId('room'),
      label: label.trim() || 'Room',
      outline: verts,
    };
    pushSnapshot(model);
    setModel({ ...model, rooms: [...model.rooms, room] });
    setDrawingRoom(null);
    setRoomCursor(null);
    setSelected({ kind: 'room', id: room.id });
  }

  function onCanvasDoubleClick() {
    if (tool === 'room' && drawingRoom && drawingRoom.length >= 3) {
      finishRoom(drawingRoom);
    }
  }

  // ── surface assignment helpers ──────────────────────────────────────
  // These are invoked from the Surface tool's click handler. They
  // either create a new Surface entry (and link it to the wall / room)
  // or select the existing one so the popover can edit it.

  /**
   * Click on a wall in Surface tool: create or open a wall_face
   * surface for that wall. The wall's surfaceId becomes the link.
   */
  function handleSurfaceAssignWall(wall: Wall, clickM: Point) {
    setError(null);
    const existing = wall.surfaceId
      ? model.surfaces.find((s) => s.id === wall.surfaceId) ?? null
      : null;
    if (existing) {
      setSelected({ kind: 'surface', id: existing.id });
      const pPx = metresToPx(clickM);
      setPopover({ x: pPx.x, y: pPx.y });
      return;
    }
    // First-time assignment: prompt for label so the chip + Gemini
    // prompt have something meaningful. `window.prompt` is fine here —
    // matches the existing door/window/room flow in this editor.
    const defaultLabel = `Wall face ${model.surfaces.filter((s) => s.kind === 'wall_face').length + 1}`;
    const raw = typeof window !== 'undefined'
      ? window.prompt('Surface label (e.g. "Living-room north wall")', defaultLabel)
      : defaultLabel;
    if (raw === null) return;
    const label = raw.trim() || defaultLabel;
    const surface: Surface = {
      id: shortId('surf'),
      kind: 'wall_face',
      label,
    };
    pushSnapshot(model);
    setModel({
      ...model,
      surfaces: [...model.surfaces, surface],
      walls: model.walls.map((w) => (w.id === wall.id ? { ...w, surfaceId: surface.id } : w)),
    });
    setSelected({ kind: 'surface', id: surface.id });
    const pPx = metresToPx(clickM);
    setPopover({ x: pPx.x, y: pPx.y });
  }

  /**
   * Click inside a room polygon in Surface tool: create or open the
   * room's floor- or ceiling- surface (one per room+kind). We don't
   * support multiple floors per room in v1 — that's what room
   * subdivision is for.
   */
  function handleSurfaceAssignFloorOrCeiling(
    room: RoomRegion,
    kind: 'floor' | 'ceiling',
    clickM: Point,
  ) {
    setError(null);
    const existing = model.surfaces.find((s) => s.roomId === room.id && s.kind === kind) ?? null;
    if (existing) {
      setSelected({ kind: 'surface', id: existing.id });
      const pPx = metresToPx(clickM);
      setPopover({ x: pPx.x, y: pPx.y });
      return;
    }
    const defaultLabel = `${room.label} ${kind}`;
    const raw = typeof window !== 'undefined'
      ? window.prompt(`${kind === 'floor' ? 'Floor' : 'Ceiling'} label`, defaultLabel)
      : defaultLabel;
    if (raw === null) return;
    const label = raw.trim() || defaultLabel;
    const surface: Surface = {
      id: shortId('surf'),
      kind,
      roomId: room.id,
      label,
    };
    pushSnapshot(model);
    setModel({ ...model, surfaces: [...model.surfaces, surface] });
    setSelected({ kind: 'surface', id: surface.id });
    const pPx = metresToPx(clickM);
    setPopover({ x: pPx.x, y: pPx.y });
  }

  function patchSurface(id: string, patch: Partial<Surface>) {
    pushSnapshot(model);
    setModel({
      ...model,
      surfaces: model.surfaces.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  }

  /**
   * Find the walls that link to a given surface (wall_face only).
   * Surface-on-wall is 1:N in principle — one Surface entry can be
   * the assignment for several walls, even though the current UI
   * creates one surface per wall.
   */
  function wallsForSurface(surfaceId: string): Wall[] {
    return model.walls.filter((w) => w.surfaceId === surfaceId);
  }

  // ── furniture drop handler ──────────────────────────────────────────

  function onCanvasDragOver(e: React.DragEvent<SVGSVGElement>) {
    if (e.dataTransfer.types.includes(FURNITURE_DRAG_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }

  function onCanvasDrop(e: React.DragEvent<SVGSVGElement>) {
    const category = e.dataTransfer.getData(FURNITURE_DRAG_MIME) as FurnitureCategory | '';
    if (!category) return;
    e.preventDefault();
    const entry = CATALOG_BY_CATEGORY.get(category as FurnitureCategory);
    if (!entry) {
      setError(`Unknown furniture category: ${category}`);
      return;
    }
    // mouseToMetres works for DragEvent too — clientX/Y + svg rect.
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    const yPx = e.clientY - rect.top;
    const centre: Point = { x: xPx / pixelsPerMetre, y: yPx / pixelsPerMetre };
    const item: FurnitureItem = {
      id: shortId(entry.category.replace(/_/g, '-')),
      category: entry.category,
      centre,
      width: entry.defaultWidth,
      depth: entry.defaultDepth,
      rotation: 0,
    };
    pushSnapshot(model);
    setModel({ ...model, furniture: [...model.furniture, item] });
    setTool('select');
    setSelected({ kind: 'furniture', id: item.id });
    const pPx = metresToPx(centre);
    setPopover({ x: pPx.x, y: pPx.y });
    setError(null);
  }

  // ── pan / zoom ──────────────────────────────────────────────────────

  function onCanvasWheel(e: React.WheelEvent<HTMLDivElement>) {
    // Ctrl/Cmd + wheel = zoom around cursor. Without modifier, let the
    // default scroll bubble (the container has overflow auto).
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const cursorPx = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const cursorM = { x: cursorPx.x / pixelsPerMetre, y: cursorPx.y / pixelsPerMetre };
    // Step: 10% per wheel notch.
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const next = Math.max(MIN_PIXELS_PER_METRE, Math.min(MAX_PIXELS_PER_METRE, pixelsPerMetre * factor));
    if (next === pixelsPerMetre) return;
    setPixelsPerMetre(next);
    // Adjust pan so that the metre point under the cursor stays at the
    // same screen position after the zoom. Screen-x of cursorM after
    // zoom is cursorM.x * next + pan.x'. We want that to equal the old
    // screen-x = cursorPx.x + pan.x. So pan.x' = pan.x + cursorPx.x -
    // cursorM.x * next.
    setPan((p) => ({
      x: p.x + (cursorPx.x - cursorM.x * next),
      y: p.y + (cursorPx.y - cursorM.y * next),
    }));
  }

  function resetView() {
    setPan({ x: 0, y: 0 });
    setPixelsPerMetre(DEFAULT_PIXELS_PER_METRE);
  }

  // ── keyboard ────────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Track Shift globally — the rotation slider reads this via a ref
      // to snap to 15° increments while dragging. Doing it here keeps
      // the shortcut working even when the slider has focus.
      if (e.key === 'Shift') shiftHeldRef.current = true;
      // Don't hijack typing in form fields (the popover has inputs).
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
          e.preventDefault();
          undo();
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault();
        deleteSelected();
      }
      if (e.key === 'Enter' && tool === 'room' && drawingRoom && drawingRoom.length >= 3) {
        e.preventDefault();
        finishRoom(drawingRoom);
        return;
      }
      if (e.key === ' ' || e.code === 'Space') {
        if (!spaceHeld) setSpaceHeld(true);
        // Don't preventDefault unconditionally — let it focus buttons etc.
      }
      if (e.key === 'Escape') {
        if (drawingWall) {
          setDrawingWall(null);
          setHoverSnap(null);
        } else if (drawingRoom) {
          setDrawingRoom(null);
          setRoomCursor(null);
        } else if (popover || selected) {
          setSelected(null);
          setPopover(null);
        }
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === ' ' || e.code === 'Space') {
        setSpaceHeld(false);
      }
      if (e.key === 'Shift') shiftHeldRef.current = false;
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, drawingWall, drawingRoom, popover, model, tool, spaceHeld]);

  // ── selection mutators ──────────────────────────────────────────────

  function deleteSelected() {
    if (!selected) return;
    pushSnapshot(model);
    if (selected.kind === 'wall') {
      // Cascade: remove any doors / windows anchored on the wall.
      setModel({
        ...model,
        walls: model.walls.filter((w) => w.id !== selected.id),
        doors: model.doors.filter((d) => d.wallId !== selected.id),
        windows: model.windows.filter((wn) => wn.wallId !== selected.id),
      });
    } else if (selected.kind === 'door') {
      setModel({ ...model, doors: model.doors.filter((d) => d.id !== selected.id) });
    } else if (selected.kind === 'window') {
      setModel({ ...model, windows: model.windows.filter((wn) => wn.id !== selected.id) });
    } else if (selected.kind === 'furniture') {
      setModel({ ...model, furniture: model.furniture.filter((f) => f.id !== selected.id) });
    } else if (selected.kind === 'room') {
      // Cascade: drop any surfaces anchored on this room (floor /
      // ceiling) so we don't leak orphaned surface rows.
      setModel({
        ...model,
        rooms: model.rooms.filter((r) => r.id !== selected.id),
        surfaces: model.surfaces.filter((s) => s.roomId !== selected.id),
      });
    } else if (selected.kind === 'surface') {
      // Cascade: clear surfaceId on any wall that linked to this
      // surface so we don't leave dangling references.
      const surfId = selected.id;
      setModel({
        ...model,
        surfaces: model.surfaces.filter((s) => s.id !== surfId),
        walls: model.walls.map((w) => (w.surfaceId === surfId ? { ...w, surfaceId: undefined } : w)),
      });
    }
    setSelected(null);
    setPopover(null);
  }

  function duplicateSelected() {
    if (!selected || selected.kind !== 'furniture') return;
    const orig = model.furniture.find((f) => f.id === selected.id);
    if (!orig) return;
    pushSnapshot(model);
    const copy: FurnitureItem = {
      ...orig,
      id: shortId(orig.category.replace(/_/g, '-')),
      centre: { x: orig.centre.x + 0.3, y: orig.centre.y + 0.3 },
    };
    setModel({ ...model, furniture: [...model.furniture, copy] });
    setSelected({ kind: 'furniture', id: copy.id });
    const pPx = metresToPx(copy.centre);
    setPopover({ x: pPx.x, y: pPx.y });
  }

  function patchWall(id: string, patch: Partial<Wall>) {
    pushSnapshot(model);
    setModel({
      ...model,
      walls: model.walls.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    });
  }
  function patchDoor(id: string, patch: Partial<Door>) {
    pushSnapshot(model);
    setModel({
      ...model,
      doors: model.doors.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    });
  }
  function patchWindow(id: string, patch: Partial<PlanWindow>) {
    pushSnapshot(model);
    setModel({
      ...model,
      windows: model.windows.map((wn) => (wn.id === id ? { ...wn, ...patch } : wn)),
    });
  }
  function patchFurniture(id: string, patch: Partial<FurnitureItem>) {
    pushSnapshot(model);
    setModel({
      ...model,
      furniture: model.furniture.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    });
  }
  function patchRoom(id: string, patch: Partial<RoomRegion>) {
    pushSnapshot(model);
    setModel({
      ...model,
      rooms: model.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });
  }

  /**
   * Insert a new vertex at the midpoint of the polygon's longest edge.
   * The polygon is treated as closed (last → first counts as an edge).
   * Vertex is inserted between i and i+1, so existing vertex indices
   * before the insertion stay stable.
   */
  function addVertexAtLongestEdge(roomId: string) {
    const room = model.rooms.find((r) => r.id === roomId);
    if (!room || room.outline.length < 2) return;
    const n = room.outline.length;
    let bestIdx = 0;
    let bestLenSq = -1;
    for (let i = 0; i < n; i++) {
      const a = room.outline[i];
      const b = room.outline[(i + 1) % n];
      const lenSq = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
      if (lenSq > bestLenSq) {
        bestLenSq = lenSq;
        bestIdx = i;
      }
    }
    const a = room.outline[bestIdx];
    const b = room.outline[(bestIdx + 1) % n];
    const mid: Point = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const newOutline = [
      ...room.outline.slice(0, bestIdx + 1),
      mid,
      ...room.outline.slice(bestIdx + 1),
    ];
    pushSnapshot(model);
    setModel({
      ...model,
      rooms: model.rooms.map((r) => (r.id === roomId ? { ...r, outline: newOutline } : r)),
    });
  }

  // ── save / close ────────────────────────────────────────────────────

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const version = await createFloorPlan({
        project_id: projectId,
        source_image_url: sourceImageUrl ?? undefined,
        model,
        label: 'Initial trace',
        floor_index: floorIndex ?? 0,
        floor_label: floorLabel ?? undefined,
      });
      // Reset saving + dirty BEFORE handing control to the parent. If
      // the parent re-renders this editor (eg. edit-walls flow keeps
      // the same instance mounted across versions) the button needs to
      // be clickable again. The previous version of this function only
      // reset `saving` in the catch branch, leaving the button stuck
      // in "Saving…" on the happy path.
      setSaving(false);
      setDirty(false);
      setUndoStack([]);
      // eslint-disable-next-line no-console
      console.log('[FloorPlanTracingEditor] saved version', version.id, {
        walls: model.walls.length,
        doors: model.doors.length,
        windows: model.windows.length,
      });
      onSaved(version.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  function requestClose() {
    if (dirty) {
      const ok = typeof window !== 'undefined'
        ? window.confirm('You have unsaved changes. Close without saving?')
        : true;
      if (!ok) return;
    }
    onClose();
  }

  // ── derived state ───────────────────────────────────────────────────

  const selectedWall = useMemo<Wall | null>(
    () => (selected?.kind === 'wall' ? model.walls.find((w) => w.id === selected.id) ?? null : null),
    [selected, model.walls],
  );
  const selectedDoor = useMemo<Door | null>(
    () => (selected?.kind === 'door' ? model.doors.find((d) => d.id === selected.id) ?? null : null),
    [selected, model.doors],
  );
  const selectedWindow = useMemo<PlanWindow | null>(
    () => (selected?.kind === 'window' ? model.windows.find((wn) => wn.id === selected.id) ?? null : null),
    [selected, model.windows],
  );
  const selectedFurniture = useMemo<FurnitureItem | null>(
    () => (selected?.kind === 'furniture' ? model.furniture.find((f) => f.id === selected.id) ?? null : null),
    [selected, model.furniture],
  );
  const selectedRoom = useMemo<RoomRegion | null>(
    () => (selected?.kind === 'room' ? model.rooms.find((r) => r.id === selected.id) ?? null : null),
    [selected, model.rooms],
  );
  const selectedSurface = useMemo<Surface | null>(
    () => (selected?.kind === 'surface' ? model.surfaces.find((s) => s.id === selected.id) ?? null : null),
    [selected, model.surfaces],
  );
  // Surface attached to the selected wall (for the read-only summary
  // inside the wall popover and the "Edit surface" link).
  const surfaceForSelectedWall = useMemo<Surface | null>(() => {
    if (selectedWall?.surfaceId) {
      return model.surfaces.find((s) => s.id === selectedWall.surfaceId) ?? null;
    }
    return null;
  }, [selectedWall, model.surfaces]);

  // ── rendering ───────────────────────────────────────────────────────

  // Upload stage — defer to UrlOrUploadInput for upload; provide a
  // "Skip — start blank" link beneath.
  if (stage === 'upload') {
    return (
      <ModalShell onClose={requestClose}>
        <Header
          title="Trace floor plan"
          subtitle="Upload the property's floor plan (jpg/png/heic/raw). You'll trace walls, doors, and windows over it in the next step."
          onClose={requestClose}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <UrlOrUploadInput
            value={sourceImageUrl}
            onChange={(url) => {
              if (url) {
                setSourceImageUrl(url);
                setStage('trace');
              } else {
                setSourceImageUrl(null);
              }
            }}
            projectId={projectId}
            uploadKind="image"
            urlPlaceholder="Or paste a hosted image URL"
            testIdSuffix="floor-plan-source"
          />
          <button
            type="button"
            onClick={() => { setSourceImageUrl(null); setStage('trace'); }}
            style={{
              alignSelf: 'flex-start',
              background: 'transparent',
              border: 'none',
              color: 'var(--color-text-info)',
              fontSize: 11,
              cursor: 'pointer',
              padding: 0,
              textDecoration: 'underline',
            }}
          >
            Skip — start blank
          </button>
        </div>
        {error && <div style={hintBox('danger')}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={requestClose} style={secondaryBtn()}>Cancel</button>
        </div>
      </ModalShell>
    );
  }

  // Trace stage — main editor.
  return (
    <ModalShell onClose={requestClose} wide>
      <Header
        title="Trace floor plan"
        subtitle="Click + drag to draw walls. Switch tool to add doors, windows, rooms, or surfaces. Cmd/Ctrl+Z undoes."
        onClose={requestClose}
      />

      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
          padding: '8px 10px',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--color-background-tertiary)',
          border: '0.5px solid var(--color-border-tertiary)',
        }}
      >
        <div style={{ display: 'flex', gap: 4 }} role="tablist">
          {(['wall', 'door', 'window', 'room', 'surface', 'select'] as Tool[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTool(t);
                setSelected(null);
                setPopover(null);
                setError(null);
                if (t !== 'room') { setDrawingRoom(null); setRoomCursor(null); }
              }}
              style={toolBtn(tool === t)}
              data-testid={`tool-${t}`}
            >
              {t === 'wall' ? 'Wall'
                : t === 'door' ? 'Door'
                : t === 'window' ? 'Window'
                : t === 'room' ? 'Room'
                : t === 'surface' ? 'Surface'
                : 'Select'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Scale</label>
          <input
            type="number"
            min={20}
            max={400}
            step={10}
            value={pixelsPerMetre}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v >= 20 && v <= 400) setPixelsPerMetre(v);
            }}
            style={{ width: 60, padding: '4px 6px', fontSize: 11, borderRadius: 'var(--radius-sm)', border: '0.5px solid var(--color-border-secondary)' }}
          />
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>px/m</span>
        </div>

        <div style={{ flex: 1 }} />

        <button
          type="button"
          onClick={resetView}
          style={secondaryBtn()}
          title="Reset pan + zoom"
        >
          Reset view
        </button>
        <button
          type="button"
          onClick={undo}
          disabled={undoStack.length === 0}
          style={secondaryBtn(undoStack.length === 0)}
        >
          Undo ({undoStack.length})
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          style={primaryBtn(saving)}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Canvas */}
      <div
        style={{
          position: 'relative',
          overflow: 'auto',
          maxHeight: '60vh',
          border: '0.5px solid var(--color-border-tertiary)',
          borderRadius: 'var(--radius-sm)',
          background: '#fafafa',
          // Suppress browser pinch-zoom / double-tap-zoom on the canvas
          // — we own gesture handling for touch devices.
          touchAction: 'none',
        }}
        onWheel={onCanvasWheel}
      >
        <svg
          ref={svgRef}
          width={svgWidthPx}
          height={svgHeightPx}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={() => { setHoverSnap(null); if (panning) setPanning(null); }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
          onDoubleClick={onCanvasDoubleClick}
          onDragOver={onCanvasDragOver}
          onDrop={onCanvasDrop}
          style={{
            display: 'block',
            cursor: cursorForTool(tool, !!drawingWall, spaceHeld, !!panning),
            transform: `translate(${pan.x}px, ${pan.y}px)`,
            transformOrigin: '0 0',
            touchAction: 'none',
          }}
        >
          {/* Background raster — supply both `href` (SVG 2) and
              `xlinkHref` (SVG 1.1) so the image paints reliably across
              browsers, including Safari which still prefers xlink. */}
          {sourceImageUrl && (
            <image
              href={sourceImageUrl}
              xlinkHref={sourceImageUrl}
              x={0}
              y={0}
              width={svgWidthPx}
              height={svgHeightPx}
              preserveAspectRatio="xMidYMid meet"
              opacity={0.5}
            />
          )}

          {/* Subtle metre grid */}
          <g pointerEvents="none">
            {gridLines(canvasW, canvasH, pixelsPerMetre)}
          </g>

          {/* Surface paint layer — floor + ceiling fills beneath
              walls / furniture. Only painted when the Surface tool is
              active or a surface is selected, so designers can still
              read a plain trace without coloured overlays. Ceilings
              are rendered with a stronger dash so they don't blend
              into floors when both exist for the same room. */}
          {(tool === 'surface' || selected?.kind === 'surface') && model.surfaces.map((s) => {
            if (s.kind !== 'floor' && s.kind !== 'ceiling') return null;
            const room = s.roomId ? model.rooms.find((r) => r.id === s.roomId) : null;
            if (!room || room.outline.length < 3) return null;
            const isSel = selected?.kind === 'surface' && selected.id === s.id;
            const pts = room.outline.map((p) => `${p.x * pixelsPerMetre},${p.y * pixelsPerMetre}`).join(' ');
            const fill = s.baseColor ? withAlpha(s.baseColor, 0.4) : (s.kind === 'floor' ? 'rgba(34,197,94,0.18)' : 'rgba(168,85,247,0.18)');
            const stroke = s.baseColor ?? (s.kind === 'floor' ? '#22c55e' : '#a855f7');
            return (
              <polygon
                key={`surf-fill-${s.id}`}
                points={pts}
                fill={fill}
                stroke={stroke}
                strokeWidth={isSel ? 1.5 : 0.5}
                strokeDasharray={s.kind === 'ceiling' ? '2 3' : 'none'}
                pointerEvents={tool === 'surface' ? 'auto' : 'none'}
                onClick={(e) => {
                  if (tool !== 'surface') return;
                  e.stopPropagation();
                  const pM = mouseToMetres(e);
                  setSelected({ kind: 'surface', id: s.id });
                  const pPx = metresToPx(pM);
                  setPopover({ x: pPx.x, y: pPx.y });
                }}
              />
            );
          })}

          {/* Rooms — dashed outlines beneath everything else */}
          {model.rooms.map((r) => {
            const isSel = selected?.kind === 'room' && selected.id === r.id;
            const pts = r.outline.map((p) => `${p.x * pixelsPerMetre},${p.y * pixelsPerMetre}`).join(' ');
            const centroid = polygonCentroid(r.outline);
            return (
              <g key={r.id}>
                <polygon
                  points={pts}
                  fill={isSel ? 'rgba(59,130,246,0.08)' : 'rgba(99,102,241,0.04)'}
                  stroke={isSel ? '#3b82f6' : '#6366f1'}
                  strokeWidth={isSel ? 1.5 : 1}
                  strokeDasharray="6 4"
                />
                <text
                  x={centroid.x * pixelsPerMetre}
                  y={centroid.y * pixelsPerMetre}
                  fontSize={11}
                  fill={isSel ? '#1d4ed8' : '#4f46e5'}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  pointerEvents="none"
                  style={{ fontWeight: 500 }}
                >
                  {r.label}
                </text>
              </g>
            );
          })}

          {/* Walls */}
          {model.walls.map((w) => {
            const aPx = metresToPx(w.a);
            const bPx = metresToPx(w.b);
            const isSel = selected?.kind === 'wall' && selected.id === w.id;
            // Surface paint for wall_face: drawn as a thicker, lower-
            // opacity stroke underneath the main line so the trace
            // stays legible. Only painted in Surface tool or when the
            // attached surface is selected — same gate as floor /
            // ceiling fills.
            const surface = w.surfaceId
              ? model.surfaces.find((s) => s.id === w.surfaceId) ?? null
              : null;
            const showSurfacePaint = surface && (
              tool === 'surface'
              || (selected?.kind === 'surface' && selected.id === surface.id)
            );
            const surfaceStroke = surface?.baseColor ?? '#f97316';
            return (
              <g key={w.id}>
                {showSurfacePaint && (
                  <line
                    x1={aPx.x}
                    y1={aPx.y}
                    x2={bPx.x}
                    y2={bPx.y}
                    stroke={surfaceStroke}
                    strokeWidth={8}
                    strokeLinecap="round"
                    opacity={0.4}
                    pointerEvents={tool === 'surface' ? 'auto' : 'none'}
                    onClick={(e) => {
                      if (tool !== 'surface' || !surface) return;
                      e.stopPropagation();
                      const pM = mouseToMetres(e);
                      setSelected({ kind: 'surface', id: surface.id });
                      const pPx = metresToPx(pM);
                      setPopover({ x: pPx.x, y: pPx.y });
                    }}
                  />
                )}
                <line
                  x1={aPx.x}
                  y1={aPx.y}
                  x2={bPx.x}
                  y2={bPx.y}
                  stroke={isSel ? '#3b82f6' : '#111'}
                  strokeWidth={isSel ? 3 : 2}
                  strokeLinecap="round"
                />
              </g>
            );
          })}

          {/* Surface chips — small labels near each surface so the
              designer can see at-a-glance which wall / floor / ceiling
              has been assigned. Shown alongside the paint layer (same
              gate). */}
          {(tool === 'surface' || selected?.kind === 'surface') && model.surfaces.map((s) => {
            const isSel = selected?.kind === 'surface' && selected.id === s.id;
            // Anchor: centroid of the linked geometry. Wall_face uses
            // the midpoint of the first wall linking to it; floor /
            // ceiling use the room polygon centroid.
            let anchor: Point | null = null;
            if (s.kind === 'wall_face') {
              const wall = model.walls.find((w) => w.surfaceId === s.id);
              if (wall) anchor = pointAlongWall(wall, 0.5);
            } else if (s.roomId) {
              const room = model.rooms.find((r) => r.id === s.roomId);
              if (room && room.outline.length > 0) anchor = polygonCentroid(room.outline);
            }
            if (!anchor) return null;
            const px = metresToPx(anchor);
            const label = s.label ?? `${s.kind} ${s.id.slice(-4)}`;
            const yOffset = s.kind === 'ceiling' ? -14 : (s.kind === 'wall_face' ? 0 : 14);
            const chipW = label.length * 6 + 18;
            const chipH = 14;
            return (
              <g
                key={`surf-chip-${s.id}`}
                pointerEvents={tool === 'surface' ? 'auto' : 'none'}
                style={{ cursor: tool === 'surface' ? 'pointer' : 'default' }}
                onClick={(e) => {
                  if (tool !== 'surface') return;
                  e.stopPropagation();
                  setSelected({ kind: 'surface', id: s.id });
                  setPopover({ x: px.x, y: px.y + yOffset });
                }}
              >
                <rect
                  x={px.x - chipW / 2}
                  y={px.y + yOffset - chipH / 2}
                  width={chipW}
                  height={chipH}
                  rx={3}
                  fill="#fff"
                  stroke={isSel ? '#3b82f6' : (s.baseColor ?? '#9ca3af')}
                  strokeWidth={isSel ? 1.5 : 0.5}
                />
                <text
                  x={px.x}
                  y={px.y + yOffset + 0.5}
                  fontSize={9}
                  fill={isSel ? '#1d4ed8' : '#374151'}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{ fontWeight: 500 }}
                >
                  {label}
                </text>
              </g>
            );
          })}

          {/* Furniture */}
          {model.furniture.map((f) => {
            const isSel = selected?.kind === 'furniture' && selected.id === f.id;
            const cx = f.centre.x * pixelsPerMetre;
            const cy = f.centre.y * pixelsPerMetre;
            const wPx = f.width * pixelsPerMetre;
            const dPx = f.depth * pixelsPerMetre;
            // The category icon is drawn in a 24x24 viewBox; nesting it
            // inside the rotated group with a sized <svg> element scales
            // the strokes uniformly while still respecting the rotation.
            // Pad the icon by 4px on each side so the rect outline stays
            // legible behind the glyph.
            const iconPad = Math.min(4, Math.min(wPx, dPx) / 6);
            const iconW = Math.max(0, wPx - iconPad * 2);
            const iconH = Math.max(0, dPx - iconPad * 2);
            return (
              <g
                key={f.id}
                transform={`translate(${cx} ${cy}) rotate(${f.rotation})`}
              >
                <rect
                  x={-wPx / 2}
                  y={-dPx / 2}
                  width={wPx}
                  height={dPx}
                  fill={isSel ? '#dbeafe' : '#f3f4f6'}
                  stroke={isSel ? '#3b82f6' : '#374151'}
                  strokeWidth={isSel ? 2 : 0.5}
                />
                {/* Front-edge tick so rotation is visible */}
                <line
                  x1={-wPx / 2}
                  y1={dPx / 2}
                  x2={wPx / 2}
                  y2={dPx / 2}
                  stroke={isSel ? '#1d4ed8' : '#6b7280'}
                  strokeWidth={1.5}
                />
                {/* Category icon, scaled to fit the rotated bounding box.
                    `preserveAspectRatio="none"` would stretch — we keep
                    `xMidYMid meet` so glyphs stay recognisable even on
                    elongated items like sofas. */}
                {iconW > 6 && iconH > 6 && (
                  <svg
                    x={-iconW / 2}
                    y={-iconH / 2}
                    width={iconW}
                    height={iconH}
                    viewBox="0 0 24 24"
                    preserveAspectRatio="xMidYMid meet"
                    pointerEvents="none"
                    style={{ color: isSel ? '#1d4ed8' : '#374151' }}
                  >
                    {furnitureIconShapes(f.category, 24 / 18)}
                  </svg>
                )}
              </g>
            );
          })}

          {/* Doors */}
          {model.doors.map((d) => {
            const wall = model.walls.find((w) => w.id === d.wallId);
            if (!wall) return null;
            return (
              <DoorGlyph
                key={d.id}
                door={d}
                wall={wall}
                pixelsPerMetre={pixelsPerMetre}
                selected={selected?.kind === 'door' && selected.id === d.id}
              />
            );
          })}

          {/* Windows */}
          {model.windows.map((wn) => {
            const wall = model.walls.find((w) => w.id === wn.wallId);
            if (!wall) return null;
            return (
              <WindowGlyph
                key={wn.id}
                window={wn}
                wall={wall}
                pixelsPerMetre={pixelsPerMetre}
                selected={selected?.kind === 'window' && selected.id === wn.id}
              />
            );
          })}

          {/* Drawing wall preview */}
          {drawingWall && (
            <line
              x1={drawingWall.a.x * pixelsPerMetre}
              y1={drawingWall.a.y * pixelsPerMetre}
              x2={drawingWall.b.x * pixelsPerMetre}
              y2={drawingWall.b.y * pixelsPerMetre}
              stroke="#3b82f6"
              strokeWidth={2}
              strokeDasharray="4 4"
              pointerEvents="none"
            />
          )}

          {/* Room-in-progress preview */}
          {tool === 'room' && drawingRoom && drawingRoom.length > 0 && (
            <g pointerEvents="none">
              {drawingRoom.map((p, i) => (
                <circle
                  key={`rv-${i}`}
                  cx={p.x * pixelsPerMetre}
                  cy={p.y * pixelsPerMetre}
                  r={i === 0 && drawingRoom.length >= 3 ? 6 : 4}
                  fill={i === 0 && drawingRoom.length >= 3 ? '#22c55e' : '#6366f1'}
                  stroke="#fff"
                  strokeWidth={1}
                />
              ))}
              {drawingRoom.length >= 2 && (
                <polyline
                  points={drawingRoom.map((p) => `${p.x * pixelsPerMetre},${p.y * pixelsPerMetre}`).join(' ')}
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                />
              )}
              {roomCursor && drawingRoom.length > 0 && (
                <line
                  x1={drawingRoom[drawingRoom.length - 1].x * pixelsPerMetre}
                  y1={drawingRoom[drawingRoom.length - 1].y * pixelsPerMetre}
                  x2={roomCursor.x * pixelsPerMetre}
                  y2={roomCursor.y * pixelsPerMetre}
                  stroke="#a5b4fc"
                  strokeWidth={1}
                  strokeDasharray="2 3"
                />
              )}
            </g>
          )}

          {/* Selected wall: dimension annotation + endpoint handles */}
          {selectedWall && (() => {
            const midM = pointAlongWall(selectedWall, 0.5);
            const midPx = metresToPx(midM);
            const lenM = wallLengthM(selectedWall);
            // Perpendicular unit vector (in pixels) for the tick.
            const dx = selectedWall.b.x - selectedWall.a.x;
            const dy = selectedWall.b.y - selectedWall.a.y;
            const wallLen = Math.hypot(dx, dy) || 1;
            const nx = -dy / wallLen;
            const ny = dx / wallLen;
            const tickLen = 8; // px
            const labelOffset = 14; // px from the wall along the normal
            const labelX = midPx.x + nx * labelOffset;
            const labelY = midPx.y + ny * labelOffset;
            const tickX1 = midPx.x + nx * 2;
            const tickY1 = midPx.y + ny * 2;
            const tickX2 = midPx.x + nx * (2 + tickLen);
            const tickY2 = midPx.y + ny * (2 + tickLen);
            const labelText = `${lenM.toFixed(2)} m`;
            const labelW = labelText.length * 6.2 + 8;
            const labelH = 14;
            const aPx = metresToPx(selectedWall.a);
            const bPx = metresToPx(selectedWall.b);
            return (
              <g pointerEvents="none">
                <line x1={tickX1} y1={tickY1} x2={tickX2} y2={tickY2} stroke="#3b82f6" strokeWidth={1} />
                <rect
                  x={labelX - labelW / 2}
                  y={labelY - labelH / 2}
                  width={labelW}
                  height={labelH}
                  fill="#fff"
                  stroke="#3b82f6"
                  strokeWidth={0.5}
                  rx={2}
                />
                <text
                  x={labelX}
                  y={labelY}
                  fontSize={10}
                  fill="#1d4ed8"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{ fontWeight: 600 }}
                >
                  {labelText}
                </text>
                {/* Endpoint handles — draggable in Select tool */}
                <circle cx={aPx.x} cy={aPx.y} r={5} fill="#3b82f6" stroke="#fff" strokeWidth={1.5} />
                <circle cx={bPx.x} cy={bPx.y} r={5} fill="#3b82f6" stroke="#fff" strokeWidth={1.5} />
              </g>
            );
          })()}

          {/* Selected room: draggable vertex handles */}
          {selectedRoom && (
            <g>
              {selectedRoom.outline.map((v, i) => {
                const vPx = metresToPx(v);
                return (
                  <circle
                    key={`room-vh-${i}`}
                    cx={vPx.x}
                    cy={vPx.y}
                    r={4}
                    fill="#3b82f6"
                    stroke="#fff"
                    strokeWidth={1.5}
                    style={{ cursor: 'grab' }}
                  />
                );
              })}
            </g>
          )}

          {/* Snap hover */}
          {hoverSnap && (
            <circle
              cx={hoverSnap.x * pixelsPerMetre}
              cy={hoverSnap.y * pixelsPerMetre}
              r={4}
              fill="#ef4444"
              pointerEvents="none"
            />
          )}
        </svg>

        {/* Properties popover */}
        {popover && selected && (
          <div
            style={{
              position: 'absolute',
              left: Math.min(popover.x + 8, svgWidthPx - 200),
              top: Math.min(popover.y + 8, svgHeightPx - 80),
              minWidth: 200,
              padding: 10,
              background: 'var(--color-background-primary)',
              border: '0.5px solid var(--color-border-secondary)',
              borderRadius: 'var(--radius-sm)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              zIndex: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {selectedWall && (
              <>
                <div style={popoverHeader()}>Wall {selectedWall.id}</div>
                <PropertyRow label="Thickness (m)">
                  <NumberField
                    value={selectedWall.thickness}
                    step={0.01}
                    min={0.05}
                    onChange={(v) => patchWall(selectedWall.id, { thickness: v })}
                  />
                </PropertyRow>
                <PropertyRow label="Length (m)">
                  <span style={readOnlyText()}>{wallLengthM(selectedWall).toFixed(2)}</span>
                </PropertyRow>
                {/* Surface summary — read-only fields with a link to
                    switch into Surface tool for editing. The Surface
                    tool then re-selects this surface so the popover
                    flips to its full editor. */}
                {surfaceForSelectedWall ? (
                  <>
                    <PropertyRow label="Surface">
                      <span style={readOnlyText()}>{surfaceForSelectedWall.label ?? surfaceForSelectedWall.id}</span>
                    </PropertyRow>
                    <PropertyRow label="Color">
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 11,
                        color: 'var(--color-text-tertiary)',
                      }}>
                        {surfaceForSelectedWall.baseColor && (
                          <span style={{
                            width: 10,
                            height: 10,
                            borderRadius: 2,
                            background: surfaceForSelectedWall.baseColor,
                            border: '0.5px solid var(--color-border-secondary)',
                          }} />
                        )}
                        {surfaceForSelectedWall.baseColor ?? '—'}
                      </span>
                    </PropertyRow>
                    <PropertyRow label="Texture">
                      <span style={readOnlyText()}>{textureLabel(surfaceForSelectedWall.texture) || '—'}</span>
                    </PropertyRow>
                    <PropertyRow label="">
                      <button
                        type="button"
                        onClick={() => {
                          setTool('surface');
                          setSelected({ kind: 'surface', id: surfaceForSelectedWall.id });
                        }}
                        style={{
                          padding: '3px 8px',
                          fontSize: 11,
                          borderRadius: 'var(--radius-sm)',
                          border: '0.5px solid var(--color-border-secondary)',
                          background: 'var(--color-background-primary)',
                          color: 'var(--color-text-info)',
                          cursor: 'pointer',
                        }}
                        data-testid="wall-edit-surface"
                      >
                        Edit surface
                      </button>
                    </PropertyRow>
                  </>
                ) : (
                  <PropertyRow label="Surface">
                    <button
                      type="button"
                      onClick={() => {
                        setTool('surface');
                        setSelected(null);
                        setPopover(null);
                      }}
                      style={{
                        padding: '3px 8px',
                        fontSize: 11,
                        borderRadius: 'var(--radius-sm)',
                        border: '0.5px solid var(--color-border-secondary)',
                        background: 'var(--color-background-primary)',
                        color: 'var(--color-text-info)',
                        cursor: 'pointer',
                      }}
                      data-testid="wall-assign-surface"
                    >
                      Assign…
                    </button>
                  </PropertyRow>
                )}
              </>
            )}
            {selectedDoor && (
              <>
                <div style={popoverHeader()}>Door {selectedDoor.id}</div>
                <PropertyRow label="Width (m)">
                  <NumberField
                    value={selectedDoor.width}
                    step={0.05}
                    min={0.4}
                    onChange={(v) => patchDoor(selectedDoor.id, { width: v })}
                  />
                </PropertyRow>
                <PropertyRow label="Swing">
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <select
                      value={selectedDoor.swing}
                      onChange={(e) => patchDoor(selectedDoor.id, { swing: e.target.value as 'left' | 'right' })}
                      style={selectStyle()}
                    >
                      <option value="left">Left</option>
                      <option value="right">Right</option>
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        patchDoor(selectedDoor.id, {
                          swing: selectedDoor.swing === 'left' ? 'right' : 'left',
                        })
                      }
                      style={{
                        padding: '4px 8px',
                        fontSize: 11,
                        borderRadius: 'var(--radius-sm)',
                        border: '0.5px solid var(--color-border-secondary)',
                        background: 'var(--color-background-primary)',
                        color: 'var(--color-text-primary)',
                        cursor: 'pointer',
                      }}
                      title="Flip swing direction"
                      data-testid="door-swing-flip"
                    >
                      Flip ↔
                    </button>
                  </div>
                </PropertyRow>
              </>
            )}
            {selectedWindow && (
              <>
                <div style={popoverHeader()}>Window {selectedWindow.id}</div>
                <PropertyRow label="Width (m)">
                  <NumberField
                    value={selectedWindow.width}
                    step={0.05}
                    min={0.3}
                    onChange={(v) => patchWindow(selectedWindow.id, { width: v })}
                  />
                </PropertyRow>
                <PropertyRow label="Sill height (m)">
                  <NumberField
                    value={selectedWindow.sillHeight}
                    step={0.05}
                    min={0}
                    onChange={(v) => patchWindow(selectedWindow.id, { sillHeight: v })}
                  />
                </PropertyRow>
                <PropertyRow label="Height (m)">
                  <NumberField
                    value={selectedWindow.height}
                    step={0.05}
                    min={0.3}
                    onChange={(v) => patchWindow(selectedWindow.id, { height: v })}
                  />
                </PropertyRow>
              </>
            )}
            {selectedFurniture && (
              <>
                <div style={popoverHeader()}>{catalogDisplayName(selectedFurniture.category)} · {selectedFurniture.id}</div>
                <PropertyRow label="Category">
                  <span style={readOnlyText()}>{catalogDisplayName(selectedFurniture.category)}</span>
                </PropertyRow>
                <PropertyRow label="Width (m)">
                  <NumberField
                    value={selectedFurniture.width}
                    step={0.05}
                    min={0.1}
                    onChange={(v) => patchFurniture(selectedFurniture.id, { width: v })}
                  />
                </PropertyRow>
                <PropertyRow label="Depth (m)">
                  <NumberField
                    value={selectedFurniture.depth}
                    step={0.05}
                    min={0.1}
                    onChange={(v) => patchFurniture(selectedFurniture.id, { depth: v })}
                  />
                </PropertyRow>
                <PropertyRow label={`Rotation (${Math.round(selectedFurniture.rotation)}°)`}>
                  <input
                    type="range"
                    min={0}
                    max={359}
                    step={1}
                    value={selectedFurniture.rotation}
                    onChange={(e) => {
                      const raw = Number(e.target.value);
                      if (!Number.isFinite(raw)) return;
                      // Hold Shift while dragging to snap to 15° steps.
                      // Range inputs don't reliably carry the modifier
                      // on their InputEvent across browsers, so we
                      // consult the keyboard-tracked ref as the source
                      // of truth and fall back to the native event for
                      // browsers that do attach it.
                      const ne = e.nativeEvent as { shiftKey?: boolean };
                      const shift = shiftHeldRef.current || ne.shiftKey === true;
                      const snapped = shift ? Math.round(raw / 15) * 15 : raw;
                      patchFurniture(selectedFurniture.id, { rotation: ((snapped % 360) + 360) % 360 });
                    }}
                    style={{ width: 110 }}
                    title="Drag to rotate · hold Shift for 15° snap"
                  />
                </PropertyRow>
                <PropertyRow label="Snap to">
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[15, 45, 90].map((step) => (
                      <button
                        key={step}
                        type="button"
                        onClick={() => {
                          const r = selectedFurniture.rotation;
                          const snapped = Math.round(r / step) * step;
                          patchFurniture(selectedFurniture.id, {
                            rotation: ((snapped % 360) + 360) % 360,
                          });
                        }}
                        style={{
                          padding: '3px 6px',
                          fontSize: 10,
                          borderRadius: 'var(--radius-sm)',
                          border: '0.5px solid var(--color-border-secondary)',
                          background: 'var(--color-background-primary)',
                          color: 'var(--color-text-primary)',
                          cursor: 'pointer',
                        }}
                        title={`Snap rotation to nearest ${step}°`}
                        data-testid={`rotation-snap-${step}`}
                      >
                        {step}°
                      </button>
                    ))}
                  </div>
                </PropertyRow>
              </>
            )}
            {selectedRoom && (
              <>
                <div style={popoverHeader()}>Room {selectedRoom.id}</div>
                <PropertyRow label="Label">
                  <input
                    type="text"
                    value={selectedRoom.label}
                    onChange={(e) => patchRoom(selectedRoom.id, { label: e.target.value })}
                    style={{
                      width: 120,
                      padding: '4px 6px',
                      fontSize: 11,
                      borderRadius: 'var(--radius-sm)',
                      border: '0.5px solid var(--color-border-secondary)',
                      background: 'var(--color-background-primary)',
                      color: 'var(--color-text-primary)',
                    }}
                  />
                </PropertyRow>
                <PropertyRow label={`Vertices (${selectedRoom.outline.length})`}>
                  <button
                    type="button"
                    onClick={() => addVertexAtLongestEdge(selectedRoom.id)}
                    style={{
                      padding: '3px 8px',
                      fontSize: 11,
                      borderRadius: 'var(--radius-sm)',
                      border: '0.5px solid var(--color-border-secondary)',
                      background: 'var(--color-background-primary)',
                      color: 'var(--color-text-primary)',
                      cursor: 'pointer',
                    }}
                    title="Insert a vertex at the midpoint of the polygon's longest edge"
                    data-testid="room-add-vertex"
                  >
                    + Vertex
                  </button>
                </PropertyRow>
              </>
            )}
            {selectedSurface && (
              <>
                <div style={popoverHeader()}>
                  {selectedSurface.kind === 'wall_face' ? 'Wall surface'
                    : selectedSurface.kind === 'floor' ? 'Floor surface'
                    : 'Ceiling surface'}
                  {' · '}{selectedSurface.id}
                </div>
                <PropertyRow label="Label">
                  <input
                    type="text"
                    value={selectedSurface.label ?? ''}
                    onChange={(e) => patchSurface(selectedSurface.id, { label: e.target.value })}
                    placeholder="e.g. Living-room north wall"
                    style={{
                      width: 140,
                      padding: '4px 6px',
                      fontSize: 11,
                      borderRadius: 'var(--radius-sm)',
                      border: '0.5px solid var(--color-border-secondary)',
                      background: 'var(--color-background-primary)',
                      color: 'var(--color-text-primary)',
                    }}
                    data-testid="surface-label-input"
                  />
                </PropertyRow>
                <PropertyRow label="Kind">
                  <span style={readOnlyText()}>{selectedSurface.kind}</span>
                </PropertyRow>
                <PropertyRow label="Base color">
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input
                      type="color"
                      value={selectedSurface.baseColor ?? '#cccccc'}
                      onChange={(e) => patchSurface(selectedSurface.id, { baseColor: e.target.value })}
                      style={{ width: 32, height: 22, padding: 0, border: '0.5px solid var(--color-border-secondary)', borderRadius: 'var(--radius-sm)', background: 'transparent' }}
                      data-testid="surface-color-input"
                    />
                    {selectedSurface.baseColor && (
                      <button
                        type="button"
                        onClick={() => patchSurface(selectedSurface.id, { baseColor: undefined })}
                        style={{
                          padding: '2px 6px',
                          fontSize: 10,
                          borderRadius: 'var(--radius-sm)',
                          border: '0.5px solid var(--color-border-secondary)',
                          background: 'var(--color-background-primary)',
                          color: 'var(--color-text-tertiary)',
                          cursor: 'pointer',
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </PropertyRow>
                <PropertyRow label="Texture">
                  <input
                    type="text"
                    list={`surface-textures-${selectedSurface.kind}`}
                    value={selectedSurface.texture ?? ''}
                    placeholder={selectedSurface.kind === 'floor' ? 'wood_floor_oak' : selectedSurface.kind === 'wall_face' ? 'paint_smooth' : 'ceiling_smooth_white'}
                    onChange={(e) => patchSurface(selectedSurface.id, { texture: e.target.value.trim() || undefined })}
                    style={{
                      width: 140,
                      padding: '4px 6px',
                      fontSize: 11,
                      borderRadius: 'var(--radius-sm)',
                      border: '0.5px solid var(--color-border-secondary)',
                      background: 'var(--color-background-primary)',
                      color: 'var(--color-text-primary)',
                    }}
                    data-testid="surface-texture-input"
                  />
                  {/* One datalist per kind so the autocomplete only
                      offers textures of the matching surface kind. The
                      browser still accepts free-text — that's
                      intentional, the Gemini KB can pick up new keys
                      from real plans. */}
                  <datalist id={`surface-textures-${selectedSurface.kind}`}>
                    {SURFACE_TEXTURE_CATALOG
                      .filter((t) => t.kind === selectedSurface.kind)
                      .map((t) => (
                        <option key={t.key} value={t.key}>{t.label}</option>
                      ))}
                  </datalist>
                </PropertyRow>
                {selectedSurface.kind === 'wall_face' && (
                  <PropertyRow label="Walls">
                    <span style={readOnlyText()}>
                      {wallsForSurface(selectedSurface.id).length} linked
                    </span>
                  </PropertyRow>
                )}
              </>
            )}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="button" onClick={() => { setSelected(null); setPopover(null); }} style={secondaryBtn()}>
                Close
              </button>
              {selectedFurniture && (
                <button type="button" onClick={duplicateSelected} style={secondaryBtn()}>
                  Duplicate
                </button>
              )}
              <button type="button" onClick={deleteSelected} style={dangerBtn()}>
                Delete
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Furniture catalog — drag a card onto the canvas to drop the item */}
      <FurnitureCatalogStrip />

      {/* Status bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 11,
          color: 'var(--color-text-tertiary)',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <span>
          {model.walls.length} wall{model.walls.length === 1 ? '' : 's'} ·{' '}
          {model.doors.length} door{model.doors.length === 1 ? '' : 's'} ·{' '}
          {model.windows.length} window{model.windows.length === 1 ? '' : 's'} ·{' '}
          {model.furniture.length} furniture ·{' '}
          {model.rooms.length} room{model.rooms.length === 1 ? '' : 's'} ·{' '}
          {model.surfaces.length} surface{model.surfaces.length === 1 ? '' : 's'}
        </span>
        <span>
          {Math.round(pixelsPerMetre)} px/m · Cmd+wheel to zoom · space-drag to pan
        </span>
      </div>

      {error && <div style={hintBox('danger')}>{error}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <button
          type="button"
          onClick={() => { setStage('upload'); }}
          style={secondaryBtn()}
        >
          ← Change source image
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={requestClose} style={secondaryBtn()}>
            Cancel
          </button>
          <button type="button" onClick={save} disabled={saving} style={primaryBtn(saving)}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ── child renderers ───────────────────────────────────────────────────

function FurnitureCatalogStrip() {
  // Group cards by group for readability.
  const grouped = useMemo(() => {
    const map = new Map<string, CatalogEntry[]>();
    for (const e of FURNITURE_CATALOG) {
      const arr = map.get(e.group) ?? [];
      arr.push(e);
      map.set(e.group, arr);
    }
    return Array.from(map.entries());
  }, []);
  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        overflowX: 'auto',
        padding: '8px 10px',
        background: 'var(--color-background-tertiary)',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--radius-sm)',
      }}
    >
      {grouped.map(([group, entries]) => (
        <div key={group} style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '0 0 auto' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            {group}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {entries.map((e) => (
              <FurnitureCard key={e.category} entry={e} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FurnitureCard({ entry }: { entry: CatalogEntry }) {
  function onDragStart(e: React.DragEvent<HTMLDivElement>) {
    e.dataTransfer.setData(FURNITURE_DRAG_MIME, entry.category);
    e.dataTransfer.effectAllowed = 'copy';
  }
  return (
    <div
      draggable
      onDragStart={onDragStart}
      data-testid={`furniture-card-${entry.category}`}
      style={{
        minWidth: 86,
        padding: '6px 8px',
        background: 'var(--color-background-primary)',
        border: '0.5px solid var(--color-border-secondary)',
        borderRadius: 'var(--radius-sm)',
        cursor: 'grab',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        userSelect: 'none',
      }}
      title={`Drag onto canvas to add a ${entry.displayName}`}
    >
      <div
        style={{
          height: 30,
          background: '#f3f4f6',
          border: '0.5px solid #9ca3af',
          borderRadius: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#374151',
        }}
      >
        {furnitureIcon(entry.category, 22)}
      </div>
      <div style={{ fontSize: 9, color: 'var(--color-text-primary)', fontWeight: 500, textAlign: 'center' }}>
        {entry.displayName}
      </div>
      <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
        {entry.defaultWidth}×{entry.defaultDepth} m
      </div>
    </div>
  );
}

function DoorGlyph({
  door,
  wall,
  pixelsPerMetre,
  selected,
}: {
  door: Door;
  wall: Wall;
  pixelsPerMetre: number;
  selected: boolean;
}) {
  // Compute the door's centre + a short arc on one side of the wall.
  const wallLen = wallLengthM(wall);
  if (wallLen === 0) return null;
  const tx = (wall.b.x - wall.a.x) / wallLen;
  const ty = (wall.b.y - wall.a.y) / wallLen;
  // Normal — choose by swing.
  const nx = door.swing === 'left' ? -ty : ty;
  const ny = door.swing === 'left' ? tx : -tx;

  const centre = pointAlongWall(wall, door.positionRatio);
  const halfW = door.width / 2;
  const start = { x: centre.x - tx * halfW, y: centre.y - ty * halfW };
  const end = { x: centre.x + tx * halfW, y: centre.y + ty * halfW };
  // Arc end point: from the hinge, the door swings out perpendicular by
  // the width.
  const hinge = start;
  const arcEnd = { x: hinge.x + nx * door.width, y: hinge.y + ny * door.width };

  const px = pixelsPerMetre;
  const color = selected ? '#3b82f6' : '#7c3aed';
  const rPx = door.width * px;

  // Arc from the far edge of the opening (`end`) sweeping to the door
  // panel's tip (`arcEnd`), centred at the hinge. The sweep direction
  // depends on which side of the wall the door swings to.
  const sweepFlag = door.swing === 'left' ? 0 : 1;
  const arcPath = `M ${end.x * px} ${end.y * px} A ${rPx} ${rPx} 0 0 ${sweepFlag} ${arcEnd.x * px} ${arcEnd.y * px}`;

  return (
    <g>
      {/* The door gap — overdraw the wall in white to "cut" it. */}
      <line
        x1={start.x * px}
        y1={start.y * px}
        x2={end.x * px}
        y2={end.y * px}
        stroke="#fafafa"
        strokeWidth={3}
      />
      {/* The door panel itself */}
      <line
        x1={hinge.x * px}
        y1={hinge.y * px}
        x2={arcEnd.x * px}
        y2={arcEnd.y * px}
        stroke={color}
        strokeWidth={1.5}
      />
      {/* Arc swing */}
      <path
        d={arcPath}
        fill="none"
        stroke={color}
        strokeWidth={1}
        strokeDasharray="2 2"
      />
    </g>
  );
}

function WindowGlyph({
  window: wn,
  wall,
  pixelsPerMetre,
  selected,
}: {
  window: PlanWindow;
  wall: Wall;
  pixelsPerMetre: number;
  selected: boolean;
}) {
  const wallLen = wallLengthM(wall);
  if (wallLen === 0) return null;
  const tx = (wall.b.x - wall.a.x) / wallLen;
  const ty = (wall.b.y - wall.a.y) / wallLen;
  const nx = -ty;
  const ny = tx;

  const centre = pointAlongWall(wall, wn.positionRatio);
  const halfW = wn.width / 2;
  const start = { x: centre.x - tx * halfW, y: centre.y - ty * halfW };
  const end = { x: centre.x + tx * halfW, y: centre.y + ty * halfW };
  // Two parallel thin lines, offset 0.05m on either side of the wall.
  const off = 0.05;
  const px = pixelsPerMetre;
  const color = selected ? '#3b82f6' : '#0ea5e9';
  return (
    <g>
      {/* Overdraw the wall gap */}
      <line
        x1={start.x * px}
        y1={start.y * px}
        x2={end.x * px}
        y2={end.y * px}
        stroke="#fafafa"
        strokeWidth={3}
      />
      <line
        x1={(start.x + nx * off) * px}
        y1={(start.y + ny * off) * px}
        x2={(end.x + nx * off) * px}
        y2={(end.y + ny * off) * px}
        stroke={color}
        strokeWidth={1}
      />
      <line
        x1={(start.x - nx * off) * px}
        y1={(start.y - ny * off) * px}
        x2={(end.x - nx * off) * px}
        y2={(end.y - ny * off) * px}
        stroke={color}
        strokeWidth={1}
      />
    </g>
  );
}

function gridLines(widthM: number, heightM: number, pxPerM: number) {
  // Bail out cleanly on bad inputs rather than entering a runaway or
  // NaN-spewing loop. A NaN here used to render an SVG with NaN coords,
  // and Floor()-ing the bounds keeps the loop count finite even if
  // someone pumps in a fractional canvas. Keys also use the bare
  // namespace so the vertical vs horizontal grid lines can't collide.
  const out: React.ReactElement[] = [];
  if (!Number.isFinite(widthM) || !Number.isFinite(heightM) || !Number.isFinite(pxPerM)) {
    return out;
  }
  const wMax = Math.max(0, Math.floor(widthM));
  const hMax = Math.max(0, Math.floor(heightM));
  for (let x = 1; x < wMax; x++) {
    out.push(<line key={`gv-${x}`} x1={x * pxPerM} y1={0} x2={x * pxPerM} y2={heightM * pxPerM} stroke="#e5e7eb" strokeWidth={0.5} />);
  }
  for (let y = 1; y < hMax; y++) {
    out.push(<line key={`gh-${y}`} x1={0} y1={y * pxPerM} x2={widthM * pxPerM} y2={y * pxPerM} stroke="#e5e7eb" strokeWidth={0.5} />);
  }
  return out;
}

function cursorForTool(tool: Tool, drawing: boolean, spaceHeld: boolean, panning: boolean): string {
  if (panning) return 'grabbing';
  if (spaceHeld) return 'grab';
  if (tool === 'select') return 'default';
  if (tool === 'surface') return 'pointer';
  if (drawing) return 'crosshair';
  return 'crosshair';
}

// ── shell + small components ──────────────────────────────────────────

function ModalShell({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div
      data-ai-feature="floor-plan-tracing-editor"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--color-background-primary)',
          borderRadius: 'var(--radius-md)',
          border: '0.5px solid var(--color-border-tertiary)',
          width: wide ? 'min(1080px, 100%)' : 'min(620px, 100%)',
          maxHeight: '92vh',
          overflow: 'auto',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Header({ title, subtitle, onClose }: { title: string; subtitle?: string; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{title}</h3>
        {subtitle && (
          <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>{subtitle}</p>
        )}
      </div>
      <button type="button" onClick={onClose} style={closeBtn()} aria-label="Close">✕</button>
    </div>
  );
}

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{label}</span>
      {children}
    </div>
  );
}

function NumberField({ value, step, min, onChange }: { value: number; step: number; min: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      value={value}
      step={step}
      min={min}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v) && v >= min) onChange(v);
      }}
      style={{
        width: 80,
        padding: '4px 6px',
        fontSize: 11,
        borderRadius: 'var(--radius-sm)',
        border: '0.5px solid var(--color-border-secondary)',
        background: 'var(--color-background-primary)',
        color: 'var(--color-text-primary)',
      }}
    />
  );
}

// ── styles ────────────────────────────────────────────────────────────

function toolBtn(active: boolean): React.CSSProperties {
  return {
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: active ? 500 : 400,
    borderRadius: 'var(--radius-sm)',
    background: active ? 'var(--color-brand-accent)' : 'var(--color-background-primary)',
    color: active ? '#fff' : 'var(--color-text-primary)',
    border: '0.5px solid ' + (active ? 'var(--color-brand-accent)' : 'var(--color-border-secondary)'),
    cursor: 'pointer',
  };
}

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: '6px 12px',
    borderRadius: 'var(--radius-sm)',
    background: disabled ? 'var(--color-background-tertiary)' : 'var(--color-brand-accent)',
    color: disabled ? 'var(--color-text-tertiary)' : '#fff',
    fontSize: 12,
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: 'none',
  };
}

function secondaryBtn(disabled: boolean = false): React.CSSProperties {
  return {
    padding: '6px 12px',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-background-tertiary)',
    color: disabled ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
    fontSize: 12,
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: 'none',
  };
}

function dangerBtn(): React.CSSProperties {
  return {
    padding: '6px 12px',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-bg-danger, #fee)',
    color: 'var(--color-text-danger, #b91c1c)',
    fontSize: 12,
    cursor: 'pointer',
    border: 'none',
  };
}

function closeBtn(): React.CSSProperties {
  return {
    padding: '4px 8px',
    borderRadius: 'var(--radius-sm)',
    background: 'transparent',
    color: 'var(--color-text-tertiary)',
    fontSize: 14,
    cursor: 'pointer',
    border: 'none',
  };
}

function selectStyle(): React.CSSProperties {
  return {
    padding: '4px 6px',
    fontSize: 11,
    borderRadius: 'var(--radius-sm)',
    border: '0.5px solid var(--color-border-secondary)',
    background: 'var(--color-background-primary)',
    color: 'var(--color-text-primary)',
  };
}

function popoverHeader(): React.CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    borderBottom: '0.5px solid var(--color-border-tertiary)',
    paddingBottom: 4,
  };
}

function readOnlyText(): React.CSSProperties {
  return { fontSize: 11, color: 'var(--color-text-tertiary)' };
}

function hintBox(tone: 'info' | 'danger'): React.CSSProperties {
  const colors = tone === 'info'
    ? { bg: 'var(--color-bg-info)', fg: 'var(--color-text-info)' }
    : { bg: 'var(--color-bg-danger)', fg: 'var(--color-text-danger)' };
  return {
    padding: 10,
    borderRadius: 'var(--radius-sm)',
    background: colors.bg,
    color: colors.fg,
    fontSize: 11,
    lineHeight: 1.5,
  };
}
