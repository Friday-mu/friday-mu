// Vector floor plan model — the structured representation that
// replaces single-shot Nanobanana generation per the W1 kickoff of
// the Conversational Floor-Plan Editor sprint (docs/scoping/
// conversational-floor-plan-editor.md).
//
// Coordinate system: metres, origin top-left, X→right, Y→down. We
// keep metres (not pixels) so the same model renders at any zoom or
// canvas size, and so dimensions match the room measurements the
// user typed on Site Visit.
//
// All ids are short opaque strings the user might see in Kimi
// operations ("move sofa-7 left 0.5m") — keep them short, lowercase,
// human-distinguishable.

/** A 2D point in metres from the floor-plan origin (top-left). */
export interface Point {
  x: number;
  y: number;
}

/** A wall segment. Straight only — curves are out of scope for v1. */
export interface Wall {
  id: string;
  a: Point;
  b: Point;
  /** Thickness in metres. Default 0.10 (10cm interior partition). */
  thickness: number;
  /**
   * Optional surface assignment — referenced by `recolor` /
   * `retexture` operations. Renderer uses this to paint the wall
   * face.
   */
  surfaceId?: string;
}

/**
 * A door — anchored on a wall by ratio (0 = wall.a, 1 = wall.b) +
 * width in metres. We don't store absolute coords so doors stay
 * attached when the wall moves.
 */
export interface Door {
  id: string;
  wallId: string;
  /** Position along the wall, 0..1. */
  positionRatio: number;
  /** Door width in metres. Default 0.85. */
  width: number;
  /**
   * Which side the door swings to — left of the wall vector (a→b) or
   * right of it. UI shows an arc; renderer uses this for the line-
   * art only. Texture pass usually closes the door.
   */
  swing: 'left' | 'right';
}

/** A window — same anchoring model as a door. */
export interface Window {
  id: string;
  wallId: string;
  positionRatio: number;
  /** Window width in metres. */
  width: number;
  /** Sill height from floor in metres. Default 0.9. */
  sillHeight: number;
  /** Window height in metres. Default 1.2. */
  height: number;
}

/** Furniture category — limited to the hardcoded catalog for v1. */
export type FurnitureCategory =
  | 'sofa' | 'armchair' | 'coffee_table' | 'side_table' | 'tv_unit'
  | 'rug' | 'pendant_lamp' | 'floor_lamp' | 'table_lamp'
  | 'bed_single' | 'bed_double' | 'bed_king' | 'bedside_table'
  | 'wardrobe' | 'dresser' | 'desk' | 'office_chair'
  | 'dining_table' | 'dining_chair' | 'bar_stool'
  | 'kitchen_island' | 'kitchen_counter' | 'kitchen_sink'
  | 'fridge' | 'oven' | 'cooktop' | 'dishwasher' | 'microwave'
  | 'bath' | 'shower' | 'toilet' | 'vanity' | 'mirror'
  | 'washing_machine' | 'dryer'
  | 'plant' | 'artwork' | 'shelves' | 'cabinet'
  | 'door_swing' | 'stairs' | 'other';

/**
 * A furniture item placed in the plan. Bounding box rotated around
 * its centre. Renderer looks up the category in the catalog to draw
 * the right silhouette.
 */
export interface FurnitureItem {
  id: string;
  category: FurnitureCategory;
  /** Centre of the bounding box in metres. */
  centre: Point;
  /** Bounding box dimensions in metres (pre-rotation). */
  width: number;
  depth: number;
  /** Rotation in degrees clockwise from north (top of plan). */
  rotation: number;
  /**
   * Optional room reference — useful for ops like "move all
   * bedroom furniture down 0.5m" and for the texture-pass prompt.
   */
  roomId?: string;
  /**
   * Style label that flavours the texture pass ("rattan", "black
   * leather", "warm oak"). Falls back to the category default.
   */
  style?: string;
}

/**
 * A named region. v1 uses these for op targeting ("the bedroom") and
 * for the texture prompt. Not strictly necessary for rendering since
 * walls define the actual enclosure.
 */
export interface RoomRegion {
  id: string;
  label: string;
  /** Polygon vertices in metres, CW order. */
  outline: Point[];
}

/**
 * Surface assignment — wall faces, floor zones, ceiling. Operations
 * like `retexture` and `recolor` target a surface by id.
 */
export interface Surface {
  id: string;
  kind: 'wall_face' | 'floor' | 'ceiling';
  /** Optional reference to a room region for floor / ceiling surfaces. */
  roomId?: string;
  /** Hex colour for the renderer's base layer. */
  baseColor?: string;
  /** Texture key (matches a texture name in the renderer's catalog). */
  texture?: string;
}

/** The whole vector floor plan — single JSONB blob per version row. */
export interface FloorPlanModel {
  /** Schema version — bump when we make a breaking change. */
  schemaVersion: 1;
  /** Total canvas size in metres. Default ~10×10 starter. */
  canvas: { width: number; height: number };
  walls: Wall[];
  doors: Door[];
  windows: Window[];
  furniture: FurnitureItem[];
  rooms: RoomRegion[];
  surfaces: Surface[];
  /**
   * Free-form style notes for the texture-pass prompt — populated by
   * Kimi over the chat, e.g. "modern coastal, light beige walls,
   * brass fixtures". Sent verbatim to Gemini in the rendering step.
   */
  styleNotes?: string;
}

/** Returned shape from /api/design/floor-plans/:project_id. */
export interface ApiFloorPlanVersion {
  id: string;
  project_id: string;
  version: number;
  source_image_url: string | null;
  model: FloorPlanModel;
  rendered_image_url: string | null;
  label: string | null;
  is_final: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Chat turn shape. resulting_version_id will be null when ops were
 * rejected or the renderer failed; the UI uses status to display.
 */
export interface ApiFloorPlanChat {
  id: string;
  project_id: string;
  resulting_version_id: string | null;
  user_message: string;
  friday_reply: string | null;
  operations: FloorPlanOperation[];
  status: 'pending' | 'applied' | 'rejected' | 'failed';
  created_at: string;
}

// ── Operation grammar ───────────────────────────────────────────────
// Kimi reads the current FloorPlanModel + the user's message and
// returns an array of these. The applier validates each, applies in
// order, and creates a new version. Any validation failure rejects
// the entire turn so partial-apply states never persist.

export type FloorPlanOperation =
  | AddFurnitureOp
  | MoveFurnitureOp
  | RemoveFurnitureOp
  | RotateFurnitureOp
  | RecolorSurfaceOp
  | RetextureSurfaceOp
  | SetStyleNotesOp
  | AddWallOp
  | RemoveWallOp;

export interface AddFurnitureOp {
  op: 'add_furniture';
  category: FurnitureCategory;
  /** Optional placement hint resolved by the applier. */
  near?: { kind: 'wall' | 'item' | 'room'; id: string; side?: 'left' | 'right' | 'top' | 'bottom' };
  centre?: Point;
  width?: number;
  depth?: number;
  rotation?: number;
  roomId?: string;
  style?: string;
}

export interface MoveFurnitureOp {
  op: 'move_furniture';
  itemId: string;
  /** Either an absolute target or a relative delta. */
  to?: Point;
  delta?: { dx: number; dy: number };
}

export interface RemoveFurnitureOp {
  op: 'remove_furniture';
  itemId: string;
}

export interface RotateFurnitureOp {
  op: 'rotate_furniture';
  itemId: string;
  /** Absolute degrees CW from north. */
  rotation: number;
}

export interface RecolorSurfaceOp {
  op: 'recolor_surface';
  surfaceId: string;
  color: string; // hex
}

export interface RetextureSurfaceOp {
  op: 'retexture_surface';
  surfaceId: string;
  texture: string;
}

export interface SetStyleNotesOp {
  op: 'set_style_notes';
  notes: string;
}

export interface AddWallOp {
  op: 'add_wall';
  a: Point;
  b: Point;
  thickness?: number;
}

export interface RemoveWallOp {
  op: 'remove_wall';
  wallId: string;
}

/** Empty plan factory — used when a project hasn't started one yet. */
export function emptyFloorPlan(): FloorPlanModel {
  return {
    schemaVersion: 1,
    canvas: { width: 10, height: 10 },
    walls: [],
    doors: [],
    windows: [],
    furniture: [],
    rooms: [],
    surfaces: [],
  };
}
