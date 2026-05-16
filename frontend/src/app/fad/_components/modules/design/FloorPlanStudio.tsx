'use client';

// Floor plan studio — the top-level wrapper for the Conversational
// Floor-Plan Editor. Replaces the old single-shot FloorPlanGenerator /
// FurnishedFloorPlanGenerator pair with:
//
//   • Stage 1 (blank): mounts FloorPlanTracingEditor so the designer
//     can trace walls/doors/windows over the client's uploaded plan.
//     On save the first version (v1) lands and we drop straight into
//     Stage 2.
//   • Stage 2 (existing versions): renders the rendered raster of the
//     selected version on the left + the chat sidebar on the right.
//     The chat sidebar lets the designer give Kimi natural-language
//     instructions that produce new versions.
//
// Render display: each version's rendered_image_url is populated
// lazily by GET /:id/render. We trigger that when the version comes
// into view (or is selected). If the renderer returned an SVG stub
// (no NANOBANANA key, or hard error), we show a small "preview render"
// badge so Mathias knows it's structural-only.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listFloorPlans,
  listFloors,
  listFloorPlanChats,
  loadFloorPlanRender,
  finalizeFloorPlan,
} from '../../../_data/designClient';
import type {
  ApiFloorPlanChat,
  ApiFloorPlanFloor,
  ApiFloorPlanVersion,
} from '../../../_data/floorPlanTypes';
import { FloorPlanTracingEditor } from './FloorPlanTracingEditor';
import { FloorPlanChatPanel } from './FloorPlanChatPanel';

interface Props {
  projectId: string;
  /** When true, opens directly into the chat tab. Default false → autodetect. */
  startInChat?: boolean;
  onClose?: () => void;
}

type Stage = 'loading' | 'trace' | 'chat';

// v1 cap — per the multi-floor spec we keep the floors set small until
// we see real usage. Mathias can revisit if a property needs more.
const MAX_FLOORS_PER_PROJECT = 5;

/**
 * Default label for a floor index when the row didn't carry one — e.g.
 * legacy single-floor projects backfilled to floor_index = 0. Free text
 * still wins; this is only a fallback for display.
 */
function defaultFloorLabel(idx: number): string {
  if (idx === 0) return 'Ground floor';
  if (idx === 1) return '1st floor';
  if (idx === 2) return '2nd floor';
  return `Floor ${idx + 1}`;
}

interface RenderState {
  url: string;
  stub: boolean;
}

export function FloorPlanStudio({ projectId, startInChat = false, onClose }: Props) {
  const [stage, setStage] = useState<Stage>('loading');
  // Floors the project knows about (post-migration 045). Each floor has
  // an independent version history. Empty array = no floors traced yet.
  const [floors, setFloors] = useState<ApiFloorPlanFloor[]>([]);
  // Active floor tab. null = no floor selected (used during the very
  // first trace when no floors exist yet).
  const [activeFloorIndex, setActiveFloorIndex] = useState<number | null>(null);
  // Pending floor label for the "+ add floor" flow — set when the user
  // prompts a label and we drop into the tracing editor with no versions
  // yet on the new floor.
  const [pendingFloorLabel, setPendingFloorLabel] = useState<string | null>(null);
  const [versions, setVersions] = useState<ApiFloorPlanVersion[]>([]);
  const [chats, setChats] = useState<ApiFloorPlanChat[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [renderCache, setRenderCache] = useState<Record<string, RenderState>>({});
  const [renderPending, setRenderPending] = useState<Record<string, boolean>>({});
  const [renderError, setRenderError] = useState<Record<string, string>>({});
  const [editingWalls, setEditingWalls] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // ── load existing floors + versions + chats ──────────────────────
  // Reload pulls the project's floor list, picks an active floor if
  // none is set, then fetches the versions for that floor. Chats are
  // not floor-scoped today (we'd revisit when chat operations move per-
  // floor — out of scope for v1).
  const reload = useCallback(async (preferredFloor?: number) => {
    try {
      const [fl, cs] = await Promise.all([listFloors(projectId), listFloorPlanChats(projectId)]);
      setFloors(fl);
      setChats(cs);
      setLoadError(null);
      const targetFloor = preferredFloor != null
        ? preferredFloor
        : (activeFloorIndex != null && fl.some((f) => f.floor_index === activeFloorIndex)
            ? activeFloorIndex
            : (fl[0]?.floor_index ?? null));
      let vs: ApiFloorPlanVersion[] = [];
      if (targetFloor != null) {
        vs = await listFloorPlans(projectId, targetFloor);
      }
      setVersions(vs);
      if (targetFloor != null) setActiveFloorIndex(targetFloor);
      return { floors: fl, versions: vs, chats: cs };
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      return { floors: [], versions: [], chats: [] };
    }
  }, [projectId, activeFloorIndex]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [fl, cs] = await Promise.all([listFloors(projectId), listFloorPlanChats(projectId)]);
        if (!alive) return;
        setFloors(fl);
        setChats(cs);
        if (fl.length === 0) {
          // No floors traced yet — drop straight into tracing editor for floor 0.
          if (!startInChat) {
            setActiveFloorIndex(0);
            setStage('trace');
          } else {
            setStage('chat');
          }
          return;
        }
        const firstFloor = fl[0].floor_index;
        setActiveFloorIndex(firstFloor);
        const vs = await listFloorPlans(projectId, firstFloor);
        if (!alive) return;
        setVersions(vs);
        const latest = vs[vs.length - 1];
        if (latest) setSelectedVersionId(latest.id);
        setStage('chat');
      } catch (e) {
        if (!alive) return;
        setLoadError(e instanceof Error ? e.message : String(e));
        setStage('chat'); // fall through — empty state will show
      }
    })();
    return () => {
      alive = false;
    };
  }, [projectId, startInChat]);

  // ── floor switch ────────────────────────────────────────────────
  // Click a floor tab → reload its versions, reset render cache so the
  // first version of the new floor lazy-renders fresh.
  const switchFloor = useCallback(async (floorIdx: number) => {
    if (floorIdx === activeFloorIndex) return;
    setActiveFloorIndex(floorIdx);
    setSelectedVersionId(null);
    try {
      const vs = await listFloorPlans(projectId, floorIdx);
      setVersions(vs);
      const latest = vs[vs.length - 1];
      if (latest) setSelectedVersionId(latest.id);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [activeFloorIndex, projectId]);

  // "+" tab — prompts for a label and drops into the tracing editor
  // with the new floor index pre-set. The actual row is created when
  // the user saves their first trace on that floor.
  function handleAddFloor() {
    if (floors.length >= MAX_FLOORS_PER_PROJECT) {
      showToast(`Maximum ${MAX_FLOORS_PER_PROJECT} floors per project.`);
      return;
    }
    const nextIdx = floors.length === 0
      ? 0
      : Math.max(...floors.map((f) => f.floor_index)) + 1;
    const raw = typeof window !== 'undefined'
      ? window.prompt('Floor label (e.g. "1st floor", "Loft")', defaultFloorLabel(nextIdx))
      : defaultFloorLabel(nextIdx);
    if (raw === null) return; // cancelled
    const label = raw.trim() || defaultFloorLabel(nextIdx);
    setActiveFloorIndex(nextIdx);
    setPendingFloorLabel(label);
    setStage('trace');
  }

  // ── lazy raster render ───────────────────────────────────────────
  // Trigger a render fetch for whichever version is currently selected
  // (if we haven't already cached it). Versions with a rendered URL
  // already on the row use that directly.
  useEffect(() => {
    if (!selectedVersionId) return;
    const v = versions.find((x) => x.id === selectedVersionId);
    if (!v) return;
    if (renderCache[v.id] || renderPending[v.id]) return;
    if (v.rendered_image_url) {
      setRenderCache((prev) => ({ ...prev, [v.id]: { url: v.rendered_image_url!, stub: false } }));
      return;
    }
    setRenderPending((prev) => ({ ...prev, [v.id]: true }));
    setRenderError((prev) => {
      const { [v.id]: _omit, ...rest } = prev;
      return rest;
    });
    loadFloorPlanRender(v.id)
      .then((r) => {
        // Backend may send { rendered_image_url } (current) or { url }
        // (target shape). Accept both — pick whichever is present.
        const url = (r as { url?: string; rendered_image_url?: string }).url
          || (r as { rendered_image_url?: string }).rendered_image_url
          || '';
        if (!url) throw new Error('Renderer returned no URL');
        setRenderCache((prev) => ({ ...prev, [v.id]: { url, stub: r.stub === true } }));
      })
      .catch((e) => {
        setRenderError((prev) => ({ ...prev, [v.id]: e instanceof Error ? e.message : String(e) }));
      })
      .finally(() => {
        setRenderPending((prev) => {
          const { [v.id]: _omit, ...rest } = prev;
          return rest;
        });
      });
  }, [selectedVersionId, versions, renderCache, renderPending]);

  // ── handlers ─────────────────────────────────────────────────────

  function handleTracingSaved(versionId: string) {
    // Tracing editor created v1 of the active floor. Fire the toast
    // immediately so the designer gets confirmation even if reload() is
    // slow, then await the version-list + floor-list refresh before
    // dropping into chat. The editor itself has already reset its own
    // saving/dirty state before calling us, so the user is not stuck
    // in a "Saving…" button.
    showToast('Floor plan saved');
    setPendingFloorLabel(null);
    void reload(activeFloorIndex ?? undefined).then(({ versions: vs }) => {
      const created = vs.find((v) => v.id === versionId) || vs[vs.length - 1];
      if (created) setSelectedVersionId(created.id);
      setStage('chat');
    }).catch(() => {
      // Even if reload fails, get out of the tracing modal — the
      // version is persisted server-side; user can refresh the page
      // to see it. Showing the chat empty-state is better than
      // appearing to do nothing.
      setStage('chat');
    });
  }

  function handleEditWallsSaved(versionId: string) {
    // Wall-edit creates a NEW version on the SAME floor (we call
    // createFloorPlan again with the version's floor_index).
    showToast('Floor plan saved');
    setEditingWalls(false);
    void reload(activeFloorIndex ?? undefined).then(({ versions: vs }) => {
      const created = vs.find((v) => v.id === versionId) || vs[vs.length - 1];
      if (created) setSelectedVersionId(created.id);
    });
  }

  function handleTurnComplete(next: { chat: ApiFloorPlanChat; version: ApiFloorPlanVersion | null }) {
    // Optimistic: append the chat + (if applied) the new version.
    setChats((prev) => {
      // POST may return a duplicate id if the optimistic version was
      // already replaced — dedupe by id.
      const filtered = prev.filter((c) => c.id !== next.chat.id);
      return [...filtered, next.chat];
    });
    if (next.version) {
      setVersions((prev) => {
        const filtered = prev.filter((v) => v.id !== next.version!.id);
        return [...filtered, next.version!].sort((a, b) => a.version - b.version);
      });
      setSelectedVersionId(next.version.id);
    }
  }

  function handleRevert(_newVersionId: string) {
    void reload().then(({ versions: vs }) => {
      const latest = vs[vs.length - 1];
      if (latest) setSelectedVersionId(latest.id);
      showToast('Reverted — new version created');
    });
  }

  async function handleFinalize() {
    if (!selectedVersionId) return;
    if (typeof window !== 'undefined' && !window.confirm('Mark this version as the final floor plan?')) return;
    setFinalizing(true);
    try {
      await finalizeFloorPlan(selectedVersionId);
      await reload();
      showToast('Marked as final');
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setFinalizing(false);
    }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  const selectedVersion = useMemo(
    () => versions.find((v) => v.id === selectedVersionId) ?? null,
    [versions, selectedVersionId],
  );

  // ── stage 1: tracing editor (blank plan) ─────────────────────────
  if (stage === 'trace') {
    // Use pendingFloorLabel if the user came in via the "+" add-floor
    // flow; otherwise fall back to the active floor's label from the
    // floors list (re-trace from scratch path); else the default.
    const idx = activeFloorIndex ?? 0;
    const labelFromList = floors.find((f) => f.floor_index === idx)?.floor_label;
    const traceLabel = pendingFloorLabel
      ?? labelFromList
      ?? defaultFloorLabel(idx);
    return (
      <FloorPlanTracingEditor
        projectId={projectId}
        floorIndex={idx}
        floorLabel={traceLabel}
        onSaved={handleTracingSaved}
        onClose={() => {
          setPendingFloorLabel(null);
          // If they close the tracing editor without saving and there
          // are no floors yet, we close the whole studio.
          if (floors.length === 0) {
            onClose?.();
          } else {
            setStage('chat');
          }
        }}
      />
    );
  }

  // ── stage 2: chat + canvas ───────────────────────────────────────
  if (editingWalls && selectedVersion) {
    return (
      <FloorPlanTracingEditor
        projectId={projectId}
        initialModel={selectedVersion.model}
        initialSourceImageUrl={selectedVersion.source_image_url ?? undefined}
        floorIndex={selectedVersion.floor_index}
        floorLabel={selectedVersion.floor_label}
        onSaved={handleEditWallsSaved}
        onClose={() => setEditingWalls(false)}
      />
    );
  }

  return (
    <ModalShell onClose={onClose}>
      <div style={headerBarStyle()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" onClick={onClose} style={closeBtnStyle()} aria-label="Close">✕</button>
          <div>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Floor plan studio</h3>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              {versions.length === 0
                ? 'Start by tracing the property plan.'
                : `${versions.length} version${versions.length === 1 ? '' : 's'} · chat to edit`}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {selectedVersion && (
            <button
              type="button"
              onClick={() => setEditingWalls(true)}
              style={secondaryBtnStyle()}
              title="Open the tracing editor with this version's walls/doors/windows"
            >
              Edit walls →
            </button>
          )}
          {selectedVersion && !selectedVersion.is_final && (
            <button
              type="button"
              onClick={handleFinalize}
              disabled={finalizing}
              style={primaryBtnStyle(finalizing)}
            >
              {finalizing ? 'Saving…' : 'Save as final'}
            </button>
          )}
        </div>
      </div>

      <div style={bodyStyle()}>
        {/* ── canvas + version chips ── */}
        <div style={canvasColStyle()}>
          {loadError && <div style={errorChipStyle()}>{loadError}</div>}

          {/* Floor tabs — one per traced floor + "+" to add. We render
              this even when there are no versions for the current floor
              so the user can still switch / add floors. */}
          <div style={floorTabsRowStyle()}>
            {floors.map((f) => (
              <button
                key={f.floor_index}
                type="button"
                onClick={() => void switchFloor(f.floor_index)}
                style={floorTabStyle(f.floor_index === activeFloorIndex)}
                title={
                  f.floor_label
                    ?? `${defaultFloorLabel(f.floor_index)} — ${f.version_count} version${f.version_count === 1 ? '' : 's'}`
                }
              >
                {f.floor_label ?? defaultFloorLabel(f.floor_index)}
              </button>
            ))}
            {floors.length < MAX_FLOORS_PER_PROJECT && (
              <button
                type="button"
                onClick={handleAddFloor}
                style={floorAddTabStyle()}
                title="Add another floor"
                aria-label="Add floor"
              >
                +
              </button>
            )}
          </div>

          {versions.length === 0 ? (
            <div style={emptyCanvasStyle()}>
              <div style={{ fontSize: 13, marginBottom: 8 }}>No floor plan yet.</div>
              <button type="button" onClick={() => setStage('trace')} style={primaryBtnStyle(false)}>
                Trace a new plan
              </button>
            </div>
          ) : (
            <>
              <div style={canvasFrameStyle()}>
                {selectedVersion ? (
                  <CanvasView
                    version={selectedVersion}
                    render={renderCache[selectedVersion.id]}
                    pending={renderPending[selectedVersion.id] === true}
                    error={renderError[selectedVersion.id]}
                  />
                ) : (
                  <div style={{ padding: 28, color: 'var(--color-text-tertiary)', fontSize: 12 }}>
                    Select a version
                  </div>
                )}
              </div>
              <div style={chipsRowStyle()}>
                {versions.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedVersionId(v.id)}
                    style={versionChipStyle(v.id === selectedVersionId, v.is_final)}
                    title={v.label ?? `Version ${v.version}`}
                  >
                    v{v.version}
                    {v.is_final && <span style={{ marginLeft: 4, color: 'var(--color-text-success)' }}>✓</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── chat sidebar ── */}
        <FloorPlanChatPanel
          projectId={projectId}
          versions={versions}
          chats={chats}
          selectedVersion={selectedVersion}
          onTurnComplete={handleTurnComplete}
          onRevert={handleRevert}
          onSelectVersion={(id) => setSelectedVersionId(id)}
          onStyleNotesChanged={() => {
            void reload();
          }}
        />
      </div>

      {toast && <div style={toastStyle()}>{toast}</div>}
    </ModalShell>
  );
}

// ── canvas view ────────────────────────────────────────────────────

function CanvasView({
  version,
  render,
  pending,
  error,
}: {
  version: ApiFloorPlanVersion;
  render: RenderState | undefined;
  pending: boolean;
  error: string | undefined;
}) {
  if (error) {
    return (
      <div style={{ padding: 24, color: 'var(--color-text-danger)', fontSize: 12 }}>
        Render failed: {error}
      </div>
    );
  }
  if (pending || !render) {
    return (
      <div style={{ padding: 28, color: 'var(--color-text-tertiary)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Spinner /> Rendering v{version.version}…
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={render.url}
        alt={`Floor plan v${version.version}`}
        style={{ width: '100%', maxHeight: '60vh', objectFit: 'contain', background: 'var(--color-background-tertiary)', borderRadius: 'var(--radius-sm)' }}
      />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={metaPillStyle()}>v{version.version}</span>
        {version.label && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{version.label}</span>}
        {render.stub && (
          <span style={stubBadgeStyle()} title="Gemini key missing — showing the structural SVG preview">
            preview render — Gemini not available
          </span>
        )}
        {version.is_final && <span style={finalBadgeStyle()}>✓ final</span>}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <>
      <style>{`@keyframes fp-studio-spin { to { transform: rotate(360deg) } }`}</style>
      <span
        style={{
          display: 'inline-block',
          width: 14,
          height: 14,
          border: '2px solid var(--color-border-secondary)',
          borderTopColor: 'var(--color-brand-accent)',
          borderRadius: '50%',
          animation: 'fp-studio-spin 700ms linear infinite',
        }}
      />
    </>
  );
}

// ── shell / styles ────────────────────────────────────────────────

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <div
      data-ai-feature="floor-plan-studio"
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
          width: 'min(1280px, 100%)',
          height: 'min(86vh, 900px)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function headerBarStyle(): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '0.5px solid var(--color-border-tertiary)',
    flexShrink: 0,
    flexWrap: 'wrap',
    gap: 8,
  };
}

function bodyStyle(): React.CSSProperties {
  return {
    flex: 1,
    minHeight: 0,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(320px, 420px)',
  };
}

function canvasColStyle(): React.CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    padding: 16,
    gap: 12,
    overflow: 'auto',
  };
}

function canvasFrameStyle(): React.CSSProperties {
  return {
    flex: 1,
    minHeight: 240,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--color-background-secondary)',
    border: '0.5px solid var(--color-border-tertiary)',
    borderRadius: 'var(--radius-sm)',
    padding: 12,
  };
}

function chipsRowStyle(): React.CSSProperties {
  return {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  };
}

function versionChipStyle(active: boolean, isFinal: boolean): React.CSSProperties {
  return {
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: active ? 600 : 500,
    borderRadius: 999,
    background: active ? 'var(--color-brand-accent)' : 'var(--color-background-tertiary)',
    color: active ? '#fff' : 'var(--color-text-primary)',
    border: '0.5px solid ' + (active ? 'var(--color-brand-accent)' : isFinal ? 'var(--color-text-success)' : 'var(--color-border-secondary)'),
    cursor: 'pointer',
  };
}

function emptyCanvasStyle(): React.CSSProperties {
  return {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-text-tertiary)',
    border: '1px dashed var(--color-border-secondary)',
    borderRadius: 'var(--radius-sm)',
    padding: 32,
  };
}

function metaPillStyle(): React.CSSProperties {
  return {
    padding: '2px 8px',
    fontSize: 10,
    fontWeight: 600,
    borderRadius: 999,
    background: 'var(--color-background-tertiary)',
    color: 'var(--color-text-secondary)',
  };
}

function stubBadgeStyle(): React.CSSProperties {
  return {
    padding: '2px 8px',
    fontSize: 10,
    borderRadius: 999,
    background: 'var(--color-bg-warning, var(--color-background-tertiary))',
    color: 'var(--color-text-warning, var(--color-text-tertiary))',
    border: '0.5px solid var(--color-border-secondary)',
  };
}

function finalBadgeStyle(): React.CSSProperties {
  return {
    padding: '2px 8px',
    fontSize: 10,
    borderRadius: 999,
    background: 'var(--color-bg-success, var(--color-background-tertiary))',
    color: 'var(--color-text-success, var(--color-text-primary))',
    fontWeight: 600,
  };
}

function primaryBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '6px 12px',
    borderRadius: 'var(--radius-sm)',
    background: disabled ? 'var(--color-background-tertiary)' : 'var(--color-brand-accent)',
    color: disabled ? 'var(--color-text-tertiary)' : '#fff',
    fontSize: 12,
    fontWeight: 500,
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

function secondaryBtnStyle(): React.CSSProperties {
  return {
    padding: '6px 12px',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-background-tertiary)',
    color: 'var(--color-text-primary)',
    fontSize: 12,
    fontWeight: 500,
    border: '0.5px solid var(--color-border-secondary)',
    cursor: 'pointer',
  };
}

function closeBtnStyle(): React.CSSProperties {
  return {
    padding: '4px 8px',
    borderRadius: 'var(--radius-sm)',
    background: 'transparent',
    color: 'var(--color-text-tertiary)',
    border: 'none',
    fontSize: 14,
    cursor: 'pointer',
  };
}

function floorTabsRowStyle(): React.CSSProperties {
  return {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
    paddingBottom: 4,
    borderBottom: '0.5px solid var(--color-border-tertiary)',
  };
}

function floorTabStyle(active: boolean): React.CSSProperties {
  return {
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: active ? 600 : 500,
    borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
    background: active ? 'var(--color-background-primary)' : 'transparent',
    color: active ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
    border: '0.5px solid ' + (active ? 'var(--color-border-secondary)' : 'transparent'),
    borderBottom: active ? '0.5px solid var(--color-background-primary)' : 'transparent',
    marginBottom: -1,
    cursor: 'pointer',
  };
}

function floorAddTabStyle(): React.CSSProperties {
  return {
    padding: '6px 10px',
    fontSize: 14,
    fontWeight: 600,
    borderRadius: 'var(--radius-sm)',
    background: 'transparent',
    color: 'var(--color-text-tertiary)',
    border: '0.5px dashed var(--color-border-secondary)',
    cursor: 'pointer',
    lineHeight: 1,
  };
}

function errorChipStyle(): React.CSSProperties {
  return {
    padding: '8px 10px',
    fontSize: 11,
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-bg-danger)',
    color: 'var(--color-text-danger)',
  };
}

function toastStyle(): React.CSSProperties {
  return {
    position: 'absolute',
    bottom: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '8px 14px',
    background: 'var(--color-background-primary)',
    border: '0.5px solid var(--color-border-secondary)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 12,
    color: 'var(--color-text-primary)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
  };
}
