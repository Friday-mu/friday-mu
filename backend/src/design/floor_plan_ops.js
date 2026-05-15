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

module.exports = {
  applyOps,
  validateModel,
};
