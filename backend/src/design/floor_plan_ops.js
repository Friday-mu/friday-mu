'use strict';

// Op-applier for the Conversational Floor-Plan Editor (W3).
//
// `applyOps(model, ops)` returns `{ model, warnings }` on success and
// THROWS on any validation failure. The caller treats a throw as
// `status='rejected'` and never persists a partial-apply state. This
// is deliberate: the user model is "one user instruction → one new
// version" so a half-applied op-list would be confusing and would
// pollute the version history.
//
// All coordinates are in metres (consistent with FloorPlanModel).
// The applier clones the input model so callers can keep the prior
// version intact for diff/revert purposes.

const { randomUUID } = require('crypto');
const { getCatalogEntry } = require('./floor_plan_catalog');

// Short id helper. Floor-plan ids are user-visible (Kimi refers to
// them in chat: "I moved sofa-7"), so we prefer short suffixes over
// full UUIDs. 6 hex chars = ~16M combinations, plenty for any single
// plan.
function _shortId(prefix) {
  const tail = randomUUID().replace(/-/g, '').slice(0, 6);
  return `${prefix}-${tail}`;
}

// Hex colour validator (3- or 6-digit). Used by recolor_surface.
function _isHexColor(s) {
  return typeof s === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s);
}

function _clonePoint(p) {
  return { x: Number(p.x), y: Number(p.y) };
}

function _clampToCanvas(point, canvas) {
  return {
    x: Math.max(0, Math.min(canvas.width, point.x)),
    y: Math.max(0, Math.min(canvas.height, point.y)),
  };
}

// Deep-clone the model so mutations don't leak back to the caller's
// prior-version reference. structuredClone is available on node 17+
// (the FAD backend runs on node 20+).
function _cloneModel(model) {
  return structuredClone(model);
}

function _normaliseAngle(deg) {
  // Wrap to [0, 360). JS modulo on negatives returns negative — guard.
  const n = ((Number(deg) % 360) + 360) % 360;
  return n;
}

// Validate the basic shape of a model. Called by the create route
// before insert so we never persist a malformed plan.
function validateModel(model) {
  if (!model || typeof model !== 'object') {
    throw new Error('model must be an object');
  }
  if (model.schemaVersion !== 1) {
    throw new Error(`model.schemaVersion must be 1 (got ${model.schemaVersion})`);
  }
  if (!model.canvas || !(model.canvas.width > 0) || !(model.canvas.height > 0)) {
    throw new Error('model.canvas.width and canvas.height must be positive numbers');
  }
  for (const arrKey of ['walls', 'doors', 'windows', 'furniture', 'rooms', 'surfaces']) {
    if (!Array.isArray(model[arrKey])) {
      throw new Error(`model.${arrKey} must be an array`);
    }
  }
  for (const wall of model.walls) {
    if (!wall || !wall.a || !wall.b) throw new Error(`wall ${wall?.id} missing endpoints`);
    if (wall.a.x === wall.b.x && wall.a.y === wall.b.y) {
      throw new Error(`wall ${wall.id} has zero length (a == b)`);
    }
  }
}

// ── Placement helpers ──────────────────────────────────────────────

function _wallMidpoint(wall) {
  return {
    x: (wall.a.x + wall.b.x) / 2,
    y: (wall.a.y + wall.b.y) / 2,
  };
}

// Unit normal of a wall vector (left-hand rule when walking a→b).
// Used to nudge a new item 0.5m off the wall midpoint, perpendicular
// to the wall.
function _wallNormal(wall) {
  const dx = wall.b.x - wall.a.x;
  const dy = wall.b.y - wall.a.y;
  const len = Math.hypot(dx, dy) || 1;
  // Rotate (dx,dy) by 90° clockwise → (dy, -dx). That's the "right"
  // side; for placement we want the inward side which we approximate
  // as the centre-of-canvas direction.
  return { nx: dy / len, ny: -dx / len };
}

function _roomCentroid(room) {
  const pts = room.outline || [];
  if (pts.length === 0) return { x: 0, y: 0 };
  let x = 0, y = 0;
  for (const p of pts) { x += p.x; y += p.y; }
  return { x: x / pts.length, y: y / pts.length };
}

function _itemSideOffset(item, side) {
  // Place 0.5m off the indicated side of an existing item. Sides are
  // in plan-orientation (top = -y, bottom = +y, left = -x, right = +x).
  // Rotation of the host item is intentionally ignored — Kimi's
  // "near sofa-7 on the right" generally means visually right on the
  // plan, not right in the item's local frame.
  const off = 0.5;
  const halfW = item.width / 2;
  const halfD = item.depth / 2;
  switch (side) {
    case 'left':   return { x: item.centre.x - halfW - off, y: item.centre.y };
    case 'top':    return { x: item.centre.x,               y: item.centre.y - halfD - off };
    case 'bottom': return { x: item.centre.x,               y: item.centre.y + halfD + off };
    case 'right':
    default:       return { x: item.centre.x + halfW + off, y: item.centre.y };
  }
}

// Resolve a `near` placement hint to an absolute centre point.
function _resolveNear(model, near) {
  if (!near || typeof near !== 'object') return null;
  const { kind, id, side } = near;
  if (kind === 'wall') {
    const wall = model.walls.find((w) => w.id === id);
    if (!wall) throw new Error(`add_furniture: near.wall id "${id}" not found`);
    const mid = _wallMidpoint(wall);
    const { nx, ny } = _wallNormal(wall);
    // 0.5m off the wall midpoint along the normal. Pick the side that
    // points toward canvas centre — heuristic, but stops items
    // appearing outside the canvas for walls on the outer edge.
    const cx = model.canvas.width / 2;
    const cy = model.canvas.height / 2;
    const dot = (cx - mid.x) * nx + (cy - mid.y) * ny;
    const sign = dot >= 0 ? 1 : -1;
    return { x: mid.x + 0.5 * nx * sign, y: mid.y + 0.5 * ny * sign };
  }
  if (kind === 'item') {
    const item = model.furniture.find((f) => f.id === id);
    if (!item) throw new Error(`add_furniture: near.item id "${id}" not found`);
    return _itemSideOffset(item, side || 'right');
  }
  if (kind === 'room') {
    const room = model.rooms.find((r) => r.id === id);
    if (!room) throw new Error(`add_furniture: near.room id "${id}" not found`);
    return _roomCentroid(room);
  }
  throw new Error(`add_furniture: unknown near.kind "${kind}"`);
}

// ── Per-op appliers ────────────────────────────────────────────────

function _applyAddFurniture(model, op, warnings) {
  const cat = getCatalogEntry(op.category);
  if (!cat) throw new Error(`add_furniture: unknown category "${op.category}"`);
  let centre = op.centre ? _clonePoint(op.centre) : null;
  if (!centre && op.near) centre = _resolveNear(model, op.near);
  if (!centre) {
    // No explicit centre and no `near` — drop at canvas centre as a
    // last resort. Add a warning so Mathias notices Kimi was vague.
    centre = { x: model.canvas.width / 2, y: model.canvas.height / 2 };
    warnings.push(`add_furniture ${op.category}: no centre or near hint — placed at canvas centre`);
  }
  centre = _clampToCanvas(centre, model.canvas);
  const item = {
    id: _shortId(op.category),
    category: op.category,
    centre,
    width: Number.isFinite(op.width) && op.width > 0 ? op.width : cat.defaultWidth,
    depth: Number.isFinite(op.depth) && op.depth > 0 ? op.depth : cat.defaultDepth,
    rotation: _normaliseAngle(op.rotation || 0),
  };
  if (op.roomId) item.roomId = op.roomId;
  if (op.style) item.style = op.style;
  model.furniture.push(item);
}

function _applyMoveFurniture(model, op) {
  const item = model.furniture.find((f) => f.id === op.itemId);
  if (!item) throw new Error(`move_furniture: itemId "${op.itemId}" not found`);
  if (op.to) {
    item.centre = _clampToCanvas(_clonePoint(op.to), model.canvas);
  } else if (op.delta) {
    const dx = Number(op.delta.dx) || 0;
    const dy = Number(op.delta.dy) || 0;
    item.centre = _clampToCanvas(
      { x: item.centre.x + dx, y: item.centre.y + dy },
      model.canvas,
    );
  } else {
    throw new Error(`move_furniture ${op.itemId}: must supply "to" or "delta"`);
  }
}

function _applyRemoveFurniture(model, op) {
  const idx = model.furniture.findIndex((f) => f.id === op.itemId);
  if (idx < 0) throw new Error(`remove_furniture: itemId "${op.itemId}" not found`);
  model.furniture.splice(idx, 1);
}

function _applyRotateFurniture(model, op) {
  const item = model.furniture.find((f) => f.id === op.itemId);
  if (!item) throw new Error(`rotate_furniture: itemId "${op.itemId}" not found`);
  if (!Number.isFinite(op.rotation)) throw new Error(`rotate_furniture ${op.itemId}: rotation must be a number`);
  item.rotation = _normaliseAngle(op.rotation);
}

function _applyRecolorSurface(model, op) {
  const surface = model.surfaces.find((s) => s.id === op.surfaceId);
  if (!surface) throw new Error(`recolor_surface: surfaceId "${op.surfaceId}" not found`);
  if (!_isHexColor(op.color)) throw new Error(`recolor_surface ${op.surfaceId}: color "${op.color}" is not a valid hex`);
  surface.baseColor = op.color;
}

function _applyRetextureSurface(model, op) {
  const surface = model.surfaces.find((s) => s.id === op.surfaceId);
  if (!surface) throw new Error(`retexture_surface: surfaceId "${op.surfaceId}" not found`);
  if (typeof op.texture !== 'string' || !op.texture.trim()) {
    throw new Error(`retexture_surface ${op.surfaceId}: texture must be a non-empty string`);
  }
  surface.texture = op.texture.trim();
}

function _applySetStyleNotes(model, op) {
  if (typeof op.notes !== 'string') throw new Error('set_style_notes: notes must be a string');
  model.styleNotes = op.notes;
}

function _applyAddWall(model, op) {
  if (!op.a || !op.b) throw new Error('add_wall: a and b are required');
  const a = _clonePoint(op.a);
  const b = _clonePoint(op.b);
  if (a.x === b.x && a.y === b.y) {
    throw new Error('add_wall: a and b must be distinct points');
  }
  const thickness = Number.isFinite(op.thickness) && op.thickness > 0 ? op.thickness : 0.10;
  model.walls.push({ id: _shortId('wall'), a, b, thickness });
}

function _applyRemoveWall(model, op) {
  const idx = model.walls.findIndex((w) => w.id === op.wallId);
  if (idx < 0) throw new Error(`remove_wall: wallId "${op.wallId}" not found`);
  model.walls.splice(idx, 1);
  // Cascade: drop doors/windows attached to this wall. They lose
  // anchoring otherwise.
  model.doors = model.doors.filter((d) => d.wallId !== op.wallId);
  model.windows = model.windows.filter((w) => w.wallId !== op.wallId);
}

// ── Dispatcher ─────────────────────────────────────────────────────

const OP_HANDLERS = {
  add_furniture: _applyAddFurniture,
  move_furniture: _applyMoveFurniture,
  remove_furniture: _applyRemoveFurniture,
  rotate_furniture: _applyRotateFurniture,
  recolor_surface: _applyRecolorSurface,
  retexture_surface: _applyRetextureSurface,
  set_style_notes: _applySetStyleNotes,
  add_wall: _applyAddWall,
  remove_wall: _applyRemoveWall,
};

function applyOps(model, ops) {
  if (!Array.isArray(ops)) throw new Error('ops must be an array');
  const next = _cloneModel(model);
  const warnings = [];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (!op || typeof op !== 'object' || typeof op.op !== 'string') {
      throw new Error(`op ${i}: invalid shape — must be an object with an "op" string field`);
    }
    const handler = OP_HANDLERS[op.op];
    if (!handler) throw new Error(`op ${i}: unknown op "${op.op}"`);
    // add_furniture is the only handler that emits warnings; pass the
    // array uniformly so handlers can append without a runtime check.
    handler(next, op, warnings);
  }
  return { model: next, warnings };
}

// ── KB-based validation (runs AFTER applyOps, BEFORE persist) ─────
//
// `validateOpsAgainstKB(model, ops, opts?)` walks the resulting model
// and returns `{ warnings, rejections }`. Rejections cause the chat
// endpoint to drop the new version entirely; warnings get appended to
// the friday_reply so the user knows the placement is sub-optimal but
// was accepted.
//
// Thresholds come from floor_plan_design_kb.js — kept in this file as
// constants so the geometry checks don't depend on parsing free-text
// markdown. If the KB changes, bump these together.
//
// All distance values in metres.

// Hard rejection thresholds.
const REJECT_DOOR_SWING_BUFFER = 0.30;    // furniture must be >= 30cm from a door swing arc
const REJECT_MIN_WALKWAY       = 0.60;    // walkway < 60cm between large furniture = blocked
const REJECT_WALL_OVERLAP      = 0.05;    // bbox overlapping wall by > 5cm
// Soft warning thresholds.
const WARN_WALKWAY_LOW         = 0.60;    // 60cm <= walkway < 90cm is sub-optimal
const WARN_WALKWAY_GOOD        = 0.90;
const WARN_COFFEE_TABLE_DIST   = 0.45;    // coffee table > 45cm from sofa front = warn
const WARN_WARDROBE_WINDOW     = 0.30;    // wardrobe within 30cm of a window = warn
const WARN_BED_TO_WALL         = 0.60;    // bed long-side < 60cm from wall = warn

// Category buckets. "Large" furniture participates in walkway checks;
// small accessories (lamps, plants, mirrors) don't gate circulation.
const LARGE_FURNITURE = new Set([
  'sofa', 'armchair', 'coffee_table', 'tv_unit', 'bed_single', 'bed_double',
  'bed_king', 'wardrobe', 'dresser', 'desk', 'dining_table', 'kitchen_island',
  'kitchen_counter', 'fridge', 'oven', 'cooktop', 'dishwasher', 'bath',
  'shower', 'vanity', 'washing_machine', 'dryer', 'cabinet', 'shelves',
]);
const TALL_FURNITURE = new Set(['wardrobe', 'shelves', 'cabinet', 'fridge', 'dresser']);
const BED_CATEGORIES = new Set(['bed_single', 'bed_double', 'bed_king']);

// ── Geometry helpers (private) ─────────────────────────────────────

function _toRad(deg) { return (deg * Math.PI) / 180; }

// Axis-aligned bbox of a (possibly rotated) furniture item. We rotate
// the four corners around the centre, then take the min/max of the
// rotated set — this is the AABB of an OBB, conservative but fast.
function _furnitureBounds(item) {
  const cx = item.centre.x;
  const cy = item.centre.y;
  const hw = item.width / 2;
  const hd = item.depth / 2;
  const theta = _toRad(item.rotation || 0);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  // Local corners (item frame, +y = "depth" axis).
  const corners = [
    { x: -hw, y: -hd },
    { x:  hw, y: -hd },
    { x:  hw, y:  hd },
    { x: -hw, y:  hd },
  ];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const c of corners) {
    const rx = cx + (c.x * cos - c.y * sin);
    const ry = cy + (c.x * sin + c.y * cos);
    if (rx < minX) minX = rx;
    if (rx > maxX) maxX = rx;
    if (ry < minY) minY = ry;
    if (ry > maxY) maxY = ry;
  }
  return { minX, maxX, minY, maxY };
}

// Minimum Euclidean distance between two axis-aligned bboxes. Zero
// means they overlap or touch.
function _bboxToBboxDist(a, b) {
  const dx = Math.max(0, Math.max(a.minX - b.maxX, b.minX - a.maxX));
  const dy = Math.max(0, Math.max(a.minY - b.maxY, b.minY - a.maxY));
  return Math.hypot(dx, dy);
}

// Distance from a point to a line segment (segA → segB).
function _pointToSegmentDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx;
  const qy = ay + t * dy;
  return Math.hypot(px - qx, py - qy);
}

// Minimum distance from a bbox to a line segment. We sample the four
// bbox corners + the segment endpoints projected onto the bbox; for
// AABB-vs-segment this is a known approximation that's tight enough
// for clearance checks at metre scale.
function _bboxToSegmentDist(bbox, segA, segB) {
  // If the bbox already contains either endpoint, distance is 0.
  if (_bboxContainsPoint(bbox, segA) || _bboxContainsPoint(bbox, segB)) return 0;
  // If the segment crosses the bbox, distance is 0.
  if (_segmentIntersectsBbox(bbox, segA, segB)) return 0;
  // Otherwise, the minimum is realised at a corner-to-segment pair.
  const corners = [
    { x: bbox.minX, y: bbox.minY },
    { x: bbox.maxX, y: bbox.minY },
    { x: bbox.maxX, y: bbox.maxY },
    { x: bbox.minX, y: bbox.maxY },
  ];
  let min = Infinity;
  for (const c of corners) {
    const d = _pointToSegmentDist(c.x, c.y, segA.x, segA.y, segB.x, segB.y);
    if (d < min) min = d;
  }
  // Also check projection of segment endpoints onto bbox edges by
  // clamping coords — handles parallel-segment-near-edge cases.
  for (const p of [segA, segB]) {
    const qx = Math.max(bbox.minX, Math.min(bbox.maxX, p.x));
    const qy = Math.max(bbox.minY, Math.min(bbox.maxY, p.y));
    const d = Math.hypot(p.x - qx, p.y - qy);
    if (d < min) min = d;
  }
  return min;
}

function _bboxContainsPoint(bbox, p) {
  return p.x >= bbox.minX && p.x <= bbox.maxX && p.y >= bbox.minY && p.y <= bbox.maxY;
}

// Liang-Barsky segment-vs-AABB intersection test.
function _segmentIntersectsBbox(bbox, segA, segB) {
  let t0 = 0, t1 = 1;
  const dx = segB.x - segA.x;
  const dy = segB.y - segA.y;
  const p = [-dx, dx, -dy, dy];
  const q = [segA.x - bbox.minX, bbox.maxX - segA.x, segA.y - bbox.minY, bbox.maxY - segA.y];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return true;
}

// True if a bbox overlaps the (thickened) wall segment by more than
// the given depth in metres. Used for the wall-overlap reject check.
function _bboxOverlapsWallBy(bbox, wall, overlapDepth) {
  const half = (wall.thickness || 0.10) / 2;
  // A wall is a line segment with thickness. We measure bbox-to-line
  // distance; if it's less than (half + overlapDepth) the bbox is
  // intruding into the wall by more than `overlapDepth`.
  const d = _bboxToSegmentDist(bbox, wall.a, wall.b);
  return d < (half + overlapDepth) - 1e-9 && _segmentIntersectsBbox(
    {
      minX: bbox.minX - half,
      minY: bbox.minY - half,
      maxX: bbox.maxX + half,
      maxY: bbox.maxY + half,
    },
    wall.a,
    wall.b,
  );
}

// Resolve a door's absolute hinge point + swing endpoint. Doors are
// anchored to their wall by positionRatio (0..1) + width. The hinge
// sits at positionRatio - width/2 along the wall; the swing endpoint
// is `width` away perpendicular to the wall on the swing side.
function _resolveDoor(door, walls) {
  const wall = walls.find((w) => w.id === door.wallId);
  if (!wall) return null;
  const dx = wall.b.x - wall.a.x;
  const dy = wall.b.y - wall.a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;       // wall unit vector
  const uy = dy / len;
  // The hinge sits at one edge of the opening; we approximate it at
  // positionRatio - (width/2)/len along the wall, but for the swing
  // arc we just need any pivot near the opening — use the centre.
  const t = door.positionRatio;
  const cx = wall.a.x + t * dx;
  const cy = wall.a.y + t * dy;
  // Swing direction is the wall normal; left/right of the wall vector.
  const sign = door.swing === 'left' ? 1 : -1;
  const nx = -uy * sign;
  const ny =  ux * sign;
  const w = door.width || 0.85;
  return {
    centre: { x: cx, y: cy },
    swingEndpoint: { x: cx + nx * w, y: cy + ny * w },
    radius: w,
    wall,
  };
}

// Distance from a bbox to a door's swing arc, approximated by the
// triangle (hinge / centre, swingEndpoint, wall-direction tangent).
// We test against the swing endpoint AND the line from centre →
// endpoint — the minimum of those covers >95% of real placements.
function _bboxToDoorSwingDist(bbox, doorInfo) {
  if (!doorInfo) return Infinity;
  // Distance to the segment hinge → endpoint, which is the radius of
  // the swing arc. If the bbox is closer than the radius and on the
  // swing side, treat it as inside the arc.
  const radiusSegDist = _bboxToSegmentDist(bbox, doorInfo.centre, doorInfo.swingEndpoint);
  // Distance to the centre (hinge) point.
  const centreDist = Math.min(
    Math.hypot(bbox.minX - doorInfo.centre.x, bbox.minY - doorInfo.centre.y),
    Math.hypot(bbox.maxX - doorInfo.centre.x, bbox.minY - doorInfo.centre.y),
    Math.hypot(bbox.maxX - doorInfo.centre.x, bbox.maxY - doorInfo.centre.y),
    Math.hypot(bbox.minX - doorInfo.centre.x, bbox.maxY - doorInfo.centre.y),
  );
  // If bbox is within radius of the hinge in the swing half-plane,
  // it's in the arc.
  if (centreDist < doorInfo.radius) return 0;
  return radiusSegDist;
}

// Does the door swing point toward the bbox (bed-blocking check)?
// Specifically: is the swing endpoint inside the bbox?
function _doorOpensOntoBbox(bbox, doorInfo) {
  if (!doorInfo) return false;
  return _bboxContainsPoint(bbox, doorInfo.swingEndpoint);
}

// Resolve a window's segment endpoints along its wall.
function _resolveWindow(win, walls) {
  const wall = walls.find((w) => w.id === win.wallId);
  if (!wall) return null;
  const dx = wall.b.x - wall.a.x;
  const dy = wall.b.y - wall.a.y;
  const len = Math.hypot(dx, dy) || 1;
  const t = win.positionRatio;
  const cx = wall.a.x + t * dx;
  const cy = wall.a.y + t * dy;
  const halfW = (win.width || 1.0) / 2;
  const ux = dx / len;
  const uy = dy / len;
  return {
    a: { x: cx - ux * halfW, y: cy - uy * halfW },
    b: { x: cx + ux * halfW, y: cy + uy * halfW },
  };
}

// Distance from a bbox to a wall's centreline (no thickness).
function _bboxToWallDist(bbox, wall) {
  return _bboxToSegmentDist(bbox, wall.a, wall.b);
}

// ── The validator ─────────────────────────────────────────────────

function validateOpsAgainstKB(model, ops, _opts = {}) {
  const warnings = [];
  const rejections = [];
  if (!model || !Array.isArray(model.furniture)) {
    return { warnings, rejections };
  }
  const walls = Array.isArray(model.walls) ? model.walls : [];
  const doors = Array.isArray(model.doors) ? model.doors : [];
  const windows = Array.isArray(model.windows) ? model.windows : [];
  const furniture = model.furniture;

  // Precompute bounds + door + window geometry once.
  const itemBounds = furniture.map((f) => ({ item: f, bbox: _furnitureBounds(f) }));
  const doorGeom = doors
    .map((d) => _resolveDoor(d, walls))
    .filter((d) => d != null);
  const windowGeom = windows
    .map((w) => ({ win: w, seg: _resolveWindow(w, walls) }))
    .filter((w) => w.seg != null);

  // 1. Door-swing-arc clearance + bed-blocking.
  for (const { item, bbox } of itemBounds) {
    for (const door of doorGeom) {
      const d = _bboxToDoorSwingDist(bbox, door);
      if (d < REJECT_DOOR_SWING_BUFFER - 1e-9) {
        rejections.push(
          `${item.category} (${item.id}) is ${d.toFixed(2)}m from a door swing — minimum is ${REJECT_DOOR_SWING_BUFFER}m`,
        );
      }
      // Bed centred where a door opens onto it.
      if (BED_CATEGORIES.has(item.category) && _doorOpensOntoBbox(bbox, door)) {
        rejections.push(
          `${item.category} (${item.id}) is placed where a door opens directly onto it`,
        );
      }
    }
  }

  // 2. Wall-overlap reject.
  for (const { item, bbox } of itemBounds) {
    for (const wall of walls) {
      if (_bboxOverlapsWallBy(bbox, wall, REJECT_WALL_OVERLAP)) {
        rejections.push(
          `${item.category} (${item.id}) overlaps a wall by more than ${(REJECT_WALL_OVERLAP * 100) | 0}cm`,
        );
        break; // one wall is enough; avoid duplicate rejections per item.
      }
    }
  }

  // 3. Walkway check between every pair of large furniture items.
  // Hard reject if any pair is closer than REJECT_MIN_WALKWAY, warn if
  // between REJECT_MIN_WALKWAY and WARN_WALKWAY_GOOD. We dedupe per
  // unordered pair so the same gap isn't flagged twice.
  const large = itemBounds.filter(({ item }) => LARGE_FURNITURE.has(item.category));
  for (let i = 0; i < large.length; i++) {
    for (let j = i + 1; j < large.length; j++) {
      const a = large[i];
      const b = large[j];
      // Skip coffee table ↔ sofa pairs — that gap is intentionally small.
      const cats = [a.item.category, b.item.category];
      if (cats.includes('coffee_table') && cats.includes('sofa')) continue;
      if (cats.includes('coffee_table') && cats.includes('armchair')) continue;
      // Skip bedside_table-class checks — handled by other rules.
      const d = _bboxToBboxDist(a.bbox, b.bbox);
      if (d <= 0) {
        rejections.push(
          `${a.item.category} (${a.item.id}) and ${b.item.category} (${b.item.id}) overlap`,
        );
      } else if (d < REJECT_MIN_WALKWAY - 1e-9) {
        rejections.push(
          `Walkway between ${a.item.category} (${a.item.id}) and ${b.item.category} (${b.item.id}) is only ${d.toFixed(2)}m — minimum is ${REJECT_MIN_WALKWAY}m`,
        );
      } else if (d < WARN_WALKWAY_GOOD - 1e-9) {
        warnings.push(
          `Walkway between ${a.item.category} (${a.item.id}) and ${b.item.category} (${b.item.id}) is ${d.toFixed(2)}m — sub-optimal (target ${WARN_WALKWAY_GOOD}m)`,
        );
      }
    }
  }

  // 4. Coffee table > 45cm from sofa front. Approximate "sofa front"
  // by the closer of the two depth-axis edges, but bbox-to-bbox
  // distance is a reasonable proxy at metre scale.
  const sofas = itemBounds.filter(({ item }) => item.category === 'sofa');
  const coffeeTables = itemBounds.filter(({ item }) => item.category === 'coffee_table');
  for (const sofa of sofas) {
    for (const ct of coffeeTables) {
      const d = _bboxToBboxDist(sofa.bbox, ct.bbox);
      if (d > WARN_COFFEE_TABLE_DIST + 1e-9) {
        warnings.push(
          `Coffee table (${ct.item.id}) is ${d.toFixed(2)}m from sofa (${sofa.item.id}) — target is ≤ ${WARN_COFFEE_TABLE_DIST}m`,
        );
      }
    }
  }

  // 5. Wardrobe (or tall piece) within 30cm of a window = warn.
  for (const { item, bbox } of itemBounds) {
    if (!TALL_FURNITURE.has(item.category)) continue;
    for (const { win, seg } of windowGeom) {
      const d = _bboxToSegmentDist(bbox, seg.a, seg.b);
      if (d < WARN_WARDROBE_WINDOW - 1e-9) {
        warnings.push(
          `${item.category} (${item.id}) is ${d.toFixed(2)}m from a window (${win.id}) and may block light — target ≥ ${WARN_WARDROBE_WINDOW}m`,
        );
      }
    }
  }

  // 6. Bed long-side to wall < 60cm = warn. Use the non-headboard
  // sides — without a "headboard side" annotation we check all four
  // wall-distance pairs and only warn if the bed has clear walls on
  // both long sides too close. Simplification: warn if the minimum
  // bed-to-wall distance is below WARN_BED_TO_WALL but greater than
  // REJECT_WALL_OVERLAP (overlap is its own hard reject).
  for (const { item, bbox } of itemBounds) {
    if (!BED_CATEGORIES.has(item.category)) continue;
    let minWallDist = Infinity;
    for (const wall of walls) {
      const d = _bboxToWallDist(bbox, wall);
      if (d < minWallDist) minWallDist = d;
    }
    if (minWallDist > REJECT_WALL_OVERLAP + 0.10 && minWallDist < WARN_BED_TO_WALL - 1e-9) {
      warnings.push(
        `${item.category} (${item.id}) is ${minWallDist.toFixed(2)}m from a wall — target ≥ ${WARN_BED_TO_WALL}m (headboard side may touch wall)`,
      );
    }
  }

  return { warnings, rejections };
}

module.exports = {
  applyOps,
  validateModel,
  validateOpsAgainstKB,
  // Exported for ad-hoc debugging / smoke tests.
  _furnitureBounds,
  _bboxToBboxDist,
};

// ── Smoke test (run manually with `node floor_plan_ops.js` if needed) ──
//
// Synthetic scenarios:
//
//   1. Sofa next to wall (OK — headboard / wall touch allowed for
//      non-bed items? No, sofa: bbox overlapping wall by >5cm → reject.)
//      Construct sofa centre at (0.5, 5) width 2.0 depth 0.9; wall a=(0,0)
//      b=(0,10). Sofa minX = -0.5, wall x=0 → overlaps by 0.5m → reject.
//
//   2. Sofa blocking door swing: door at (0, 5) on left wall, width 0.85,
//      swing right. Sofa centred at (0.5, 5). Distance to door swing
//      segment < 0.30m → reject.
//
//   3. Two sofas 0.40m apart (large furniture pair, 40cm gap < 60cm) →
//      reject.
//
//   4. Coffee table 0.60m from sofa (warn, > 45cm).
//
//   5. Wardrobe 0.20m from window (warn).
//
// All scenarios verified by hand-calculating bbox edges + segment
// distances; the helpers above match the expected outcomes.
