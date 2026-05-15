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
  Point,
  Wall,
  Window as PlanWindow,
} from '../../../_data/floorPlanTypes';
import { emptyFloorPlan } from '../../../_data/floorPlanTypes';
import { createFloorPlan } from '../../../_data/designClient';
import { UrlOrUploadInput } from './UrlOrUploadInput';

// ── constants ─────────────────────────────────────────────────────────

const SNAP_DISTANCE_PX = 8;
const WALL_HIT_DISTANCE_PX = 12;
const UNDO_LIMIT = 20;
const DEFAULT_PIXELS_PER_METRE = 100;
const DEFAULT_WALL_THICKNESS_M = 0.10;
const DEFAULT_DOOR_WIDTH_M = 0.85;
const DEFAULT_WINDOW_WIDTH_M = 1.2;
const DEFAULT_WINDOW_SILL_M = 0.9;
const DEFAULT_WINDOW_HEIGHT_M = 1.2;

type Tool = 'wall' | 'door' | 'window' | 'select';
type Stage = 'upload' | 'trace';

interface Props {
  projectId: string;
  /** Existing model to start from (re-edit), or undefined for blank. */
  initialModel?: FloorPlanModel;
  /** Existing source raster URL — skip the upload step if provided. */
  initialSourceImageUrl?: string;
  onSaved: (versionId: string) => void;
  onClose: () => void;
}

type SelectedItem =
  | { kind: 'wall'; id: string }
  | { kind: 'door'; id: string }
  | { kind: 'window'; id: string }
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

// ── component ─────────────────────────────────────────────────────────

export function FloorPlanTracingEditor({
  projectId,
  initialModel,
  initialSourceImageUrl,
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

  const svgWidthPx = model.canvas.width * pixelsPerMetre;
  const svgHeightPx = model.canvas.height * pixelsPerMetre;

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
    if (e.button !== 0) return;
    const pM = mouseToMetres(e);

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

    if (tool === 'select') {
      // Doors / windows first (they sit on top of walls).
      const dw = hitTestDoorOrWindow(pM);
      if (dw) {
        setSelected(dw);
        const pPx = metresToPx(pM);
        setPopover({ x: pPx.x, y: pPx.y });
        return;
      }
      const wallHit = hitTestWall(pM);
      if (wallHit) {
        setSelected({ kind: 'wall', id: wallHit.wall.id });
        const pPx = metresToPx(pM);
        setPopover({ x: pPx.x, y: pPx.y });
        return;
      }
      setSelected(null);
      setPopover(null);
    }
  }

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const pM = mouseToMetres(e);

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
  }

  function onMouseUp() {
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
  }

  // ── keyboard ────────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
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
      if (e.key === 'Escape') {
        if (drawingWall) {
          setDrawingWall(null);
          setHoverSnap(null);
        } else if (popover || selected) {
          setSelected(null);
          setPopover(null);
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, drawingWall, popover, model]);

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
    }
    setSelected(null);
    setPopover(null);
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
        subtitle="Click + drag to draw walls. Switch tool to add doors and windows. Cmd/Ctrl+Z undoes."
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
          {(['wall', 'door', 'window', 'select'] as Tool[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setTool(t); setSelected(null); setPopover(null); setError(null); }}
              style={toolBtn(tool === t)}
              data-testid={`tool-${t}`}
            >
              {t === 'wall' ? 'Wall' : t === 'door' ? 'Door' : t === 'window' ? 'Window' : 'Select'}
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
        }}
      >
        <svg
          ref={svgRef}
          width={svgWidthPx}
          height={svgHeightPx}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={() => { setHoverSnap(null); }}
          style={{ display: 'block', cursor: cursorForTool(tool, !!drawingWall) }}
        >
          {/* Background raster */}
          {sourceImageUrl && (
            <image
              href={sourceImageUrl}
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
            {gridLines(model.canvas.width, model.canvas.height, pixelsPerMetre)}
          </g>

          {/* Walls */}
          {model.walls.map((w) => {
            const aPx = metresToPx(w.a);
            const bPx = metresToPx(w.b);
            const isSel = selected?.kind === 'wall' && selected.id === w.id;
            return (
              <line
                key={w.id}
                x1={aPx.x}
                y1={aPx.y}
                x2={bPx.x}
                y2={bPx.y}
                stroke={isSel ? '#3b82f6' : '#111'}
                strokeWidth={isSel ? 3 : 2}
                strokeLinecap="round"
              />
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
                  <select
                    value={selectedDoor.swing}
                    onChange={(e) => patchDoor(selectedDoor.id, { swing: e.target.value as 'left' | 'right' })}
                    style={selectStyle()}
                  >
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                  </select>
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
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="button" onClick={() => { setSelected(null); setPopover(null); }} style={secondaryBtn()}>
                Close
              </button>
              <button type="button" onClick={deleteSelected} style={dangerBtn()}>
                Delete
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 11,
          color: 'var(--color-text-tertiary)',
        }}
      >
        <span>
          {model.walls.length} wall{model.walls.length === 1 ? '' : 's'} ·{' '}
          {model.doors.length} door{model.doors.length === 1 ? '' : 's'} ·{' '}
          {model.windows.length} window{model.windows.length === 1 ? '' : 's'}
        </span>
        <span>
          Canvas {model.canvas.width}×{model.canvas.height} m · {svgWidthPx}×{svgHeightPx} px
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
  const out: React.ReactElement[] = [];
  for (let x = 1; x < widthM; x++) {
    out.push(<line key={`vx-${x}`} x1={x * pxPerM} y1={0} x2={x * pxPerM} y2={heightM * pxPerM} stroke="#e5e7eb" strokeWidth={0.5} />);
  }
  for (let y = 1; y < heightM; y++) {
    out.push(<line key={`vy-${y}`} x1={0} y1={y * pxPerM} x2={widthM * pxPerM} y2={y * pxPerM} stroke="#e5e7eb" strokeWidth={0.5} />);
  }
  return out;
}

function cursorForTool(tool: Tool, drawing: boolean): string {
  if (tool === 'select') return 'default';
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
