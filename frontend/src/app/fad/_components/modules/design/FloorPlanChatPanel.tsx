'use client';

// Floor plan chat panel — the right-hand sidebar of FloorPlanStudio.
// Renders the transcript of Kimi op-applier turns for a project and
// lets the user post new instructions. Each turn is one user message +
// Friday's reply + the resulting version chip (or rejection/error).
//
// This is the Phase 2D output of the Conversational Floor-Plan Editor
// sprint. Backend lives at /api/design/floor-plan-chats — POST returns
// { chat, version }, where version is null on rejection / failure. The
// panel never mutates outer state itself; the parent (FloorPlanStudio)
// is the source of truth for both the versions[] and chats[] arrays.
//
// We keep this dumb on purpose:
//   • parent fetches & owns chats + versions
//   • panel renders, sends, and calls onTurnComplete with the new pair
//   • parent decides whether to refetch / revert / change selection

import { useEffect, useRef, useState } from 'react';
import type { ApiFloorPlanChat, ApiFloorPlanVersion, FloorPlanOperation } from '../../../_data/floorPlanTypes';
import { sendFloorPlanChat, revertFloorPlan, updateFloorPlan } from '../../../_data/designClient';

interface Props {
  projectId: string;
  versions: ApiFloorPlanVersion[];
  chats: ApiFloorPlanChat[];
  /** Currently-selected version — used for the style-notes strip. */
  selectedVersion?: ApiFloorPlanVersion | null;
  /** Called whenever a turn completes (applied, rejected, or failed). */
  onTurnComplete: (next: { chat: ApiFloorPlanChat; version: ApiFloorPlanVersion | null }) => void;
  /** Optional — when a revert succeeds parent should refetch. */
  onRevert?: (newVersionId: string) => void;
  /** Optional — clicking a "vN" chip selects that version in the studio. */
  onSelectVersion?: (versionId: string) => void;
  /** Optional — called after a successful styleNotes patch so the parent refetches. */
  onStyleNotesChanged?: () => void;
}

export function FloorPlanChatPanel({
  projectId,
  versions,
  chats,
  selectedVersion,
  onTurnComplete,
  onRevert,
  onSelectVersion,
  onStyleNotesChanged,
}: Props) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reverting, setReverting] = useState<string | null>(null);

  // Auto-scroll to the bottom when chats change.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chats.length, sending]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const result = await sendFloorPlanChat({ project_id: projectId, user_message: text });
      onTurnComplete(result);
      setDraft('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  async function handleRevert(versionId: string) {
    if (typeof window !== 'undefined' && !window.confirm('Revert to this version? A new version will be created.')) {
      return;
    }
    setReverting(versionId);
    setError(null);
    try {
      const newVersion = await revertFloorPlan(versionId);
      onRevert?.(newVersion.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReverting(null);
    }
  }

  function versionFor(id: string | null): ApiFloorPlanVersion | null {
    if (!id) return null;
    return versions.find((v) => v.id === id) ?? null;
  }

  return (
    <div style={panelStyle()}>
      <style>{`@keyframes fp-chat-pulse { 0%,100% { opacity: 0.3 } 50% { opacity: 1 } }`}</style>
      <div style={headerStyle()}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>Chat</span>
        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
          {chats.length} turn{chats.length === 1 ? '' : 's'}
        </span>
      </div>

      {selectedVersion && (
        <StyleNotesStrip
          version={selectedVersion}
          onChanged={onStyleNotesChanged}
        />
      )}

      <div ref={scrollerRef} style={scrollerStyle()}>
        {chats.length === 0 ? (
          <div style={emptyStyle()}>
            Tell Friday what to change. e.g. <em>&ldquo;move the sofa to the left wall&rdquo;</em> or{' '}
            <em>&ldquo;add a coffee table in the living room&rdquo;</em>.
          </div>
        ) : (
          chats.map((chat) => (
            <ChatTurn
              key={chat.id}
              chat={chat}
              version={versionFor(chat.resulting_version_id)}
              reverting={reverting === chat.resulting_version_id}
              onSelectVersion={onSelectVersion}
              onRevert={handleRevert}
            />
          ))
        )}
        {sending && <TypingIndicator />}
      </div>

      {error && <div style={errorChipStyle()}>{error}</div>}

      <div style={composerStyle()}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Type a message…  (Enter to send, Shift+Enter for newline)"
          disabled={sending}
          rows={2}
          style={textareaStyle()}
        />
        <button
          type="button"
          onClick={send}
          disabled={!draft.trim() || sending}
          style={sendBtnStyle(!draft.trim() || sending)}
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  );
}

// ── pieces ─────────────────────────────────────────────────────────

function StyleNotesStrip({
  version,
  onChanged,
}: {
  version: ApiFloorPlanVersion;
  onChanged?: () => void;
}) {
  const current = version.model.styleNotes ?? '';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If the underlying version changes (e.g. Gemini emitted a new
  // set_style_notes), refresh the local draft state when not actively
  // editing.
  useEffect(() => {
    if (!editing) setDraft(current);
  }, [current, editing]);

  async function persist(nextValue: string) {
    setSaving(true);
    setError(null);
    try {
      await updateFloorPlan(version.id, {
        model: { ...version.model, styleNotes: nextValue || undefined },
      });
      onChanged?.();
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function handleSave() {
    const trimmed = draft.trim();
    if (trimmed === current.trim()) {
      setEditing(false);
      return;
    }
    void persist(trimmed);
  }

  function handleClear() {
    if (typeof window !== 'undefined' && !window.confirm('Clear style notes for this version?')) return;
    void persist('');
  }

  if (editing) {
    return (
      <div style={styleStripStyle()}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="e.g. modern coastal · light beige walls · brass fixtures"
          disabled={saving}
          style={styleTextareaStyle()}
          autoFocus
        />
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => {
              setDraft(current);
              setEditing(false);
              setError(null);
            }}
            disabled={saving}
            style={styleGhostBtnStyle(saving)}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={stylePrimaryBtnStyle(saving)}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        {error && <div style={styleErrorStyle()}>{error}</div>}
      </div>
    );
  }

  return (
    <div style={styleStripStyle()}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={styleLabelStyle()}>Style</span>
        {current ? (
          <span style={styleChipStyle()} title={current}>{current}</span>
        ) : (
          <span style={styleEmptyStyle()}>
            No style notes yet — type <em>&ldquo;go modern coastal&rdquo;</em> to start
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => setEditing(true)} style={styleGhostBtnStyle(false)}>
          Edit
        </button>
        {current && (
          <button type="button" onClick={handleClear} style={styleGhostBtnStyle(false)}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function ChatTurn({
  chat,
  version,
  reverting,
  onSelectVersion,
  onRevert,
}: {
  chat: ApiFloorPlanChat;
  version: ApiFloorPlanVersion | null;
  reverting: boolean;
  onSelectVersion?: (id: string) => void;
  onRevert: (versionId: string) => void;
}) {
  const isFailed = chat.status === 'rejected' || chat.status === 'failed';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
      <div style={userBubbleStyle()}>{chat.user_message}</div>
      {chat.friday_reply && (
        <div style={fridayBubbleStyle(isFailed)}>
          <div style={{ whiteSpace: 'pre-wrap' }}>{chat.friday_reply}</div>
          {chat.operations && chat.operations.length > 0 && (
            <div style={opsSummaryStyle()}>{summariseOps(chat.operations)}</div>
          )}
        </div>
      )}
      {chat.status === 'pending' && !chat.friday_reply && (
        <div style={fridayBubbleStyle(false)}>
          <span style={{ color: 'var(--color-text-tertiary)' }}>working…</span>
        </div>
      )}
      {version && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 4 }}>
          <button
            type="button"
            onClick={() => onSelectVersion?.(version.id)}
            style={versionChipStyle()}
            title="Show this version on the canvas"
          >
            v{version.version}
          </button>
          <button
            type="button"
            onClick={() => onRevert(version.id)}
            disabled={reverting}
            style={revertBtnStyle(reverting)}
          >
            {reverting ? 'Reverting…' : 'Revert here'}
          </button>
        </div>
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div style={fridayBubbleStyle(false)}>
      <span style={{ display: 'inline-flex', gap: 3 }}>
        <Dot delay={0} />
        <Dot delay={150} />
        <Dot delay={300} />
      </span>
    </div>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      style={{
        width: 5,
        height: 5,
        borderRadius: 999,
        background: 'var(--color-text-tertiary)',
        display: 'inline-block',
        animation: `fp-chat-pulse 900ms ease-in-out ${delay}ms infinite`,
      }}
    />
  );
}

// ── helpers ────────────────────────────────────────────────────────

// Tiny human-readable summary of the ops array. Kimi already returns a
// natural-language reply in friday_reply, but the structured ops give
// us a deterministic ground-truth line — handy when the reply is brief
// or missing.
function summariseOps(ops: FloorPlanOperation[]): string {
  const parts = ops.map((op) => {
    switch (op.op) {
      case 'add_furniture':
        return `added ${op.category}`;
      case 'move_furniture':
        return `moved ${op.itemId}`;
      case 'remove_furniture':
        return `removed ${op.itemId}`;
      case 'rotate_furniture':
        return `rotated ${op.itemId} → ${op.rotation}°`;
      case 'recolor_surface':
        return `recoloured ${op.surfaceId}`;
      case 'retexture_surface':
        return `retextured ${op.surfaceId}`;
      case 'set_style_notes':
        return 'updated style notes';
      case 'add_wall':
        return 'added a wall';
      case 'remove_wall':
        return `removed wall ${op.wallId}`;
      default:
        return 'change';
    }
  });
  return parts.join(' · ');
}

// ── styles ─────────────────────────────────────────────────────────

function panelStyle(): React.CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    background: 'var(--color-background-primary)',
    borderLeft: '0.5px solid var(--color-border-tertiary)',
  };
}

function headerStyle(): React.CSSProperties {
  return {
    padding: '10px 14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '0.5px solid var(--color-border-tertiary)',
    flexShrink: 0,
  };
}

function scrollerStyle(): React.CSSProperties {
  return {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
  };
}

function emptyStyle(): React.CSSProperties {
  return {
    padding: 16,
    fontSize: 12,
    lineHeight: 1.55,
    color: 'var(--color-text-tertiary)',
    textAlign: 'center',
  };
}

function userBubbleStyle(): React.CSSProperties {
  return {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    padding: '8px 11px',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-brand-accent)',
    color: '#fff',
    fontSize: 12,
    lineHeight: 1.45,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  };
}

function fridayBubbleStyle(failed: boolean): React.CSSProperties {
  return {
    alignSelf: 'flex-start',
    maxWidth: '85%',
    padding: '8px 11px',
    borderRadius: 'var(--radius-sm)',
    background: failed ? 'var(--color-bg-danger)' : 'var(--color-background-tertiary)',
    color: failed ? 'var(--color-text-danger)' : 'var(--color-text-primary)',
    fontSize: 12,
    lineHeight: 1.45,
    wordBreak: 'break-word',
  };
}

function opsSummaryStyle(): React.CSSProperties {
  return {
    marginTop: 4,
    fontSize: 10,
    color: 'var(--color-text-tertiary)',
    fontStyle: 'italic',
  };
}

function versionChipStyle(): React.CSSProperties {
  return {
    padding: '2px 8px',
    borderRadius: 999,
    background: 'var(--color-background-tertiary)',
    border: '0.5px solid var(--color-border-secondary)',
    color: 'var(--color-text-primary)',
    fontSize: 10,
    fontWeight: 500,
    cursor: 'pointer',
  };
}

function revertBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '2px 8px',
    borderRadius: 'var(--radius-sm)',
    background: 'transparent',
    border: 'none',
    color: disabled ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
    fontSize: 10,
    cursor: disabled ? 'not-allowed' : 'pointer',
    textDecoration: 'underline',
  };
}

function composerStyle(): React.CSSProperties {
  return {
    display: 'flex',
    gap: 8,
    padding: 10,
    borderTop: '0.5px solid var(--color-border-tertiary)',
    flexShrink: 0,
  };
}

function textareaStyle(): React.CSSProperties {
  return {
    flex: 1,
    padding: 8,
    fontSize: 12,
    borderRadius: 'var(--radius-sm)',
    border: '0.5px solid var(--color-border-secondary)',
    background: 'var(--color-background-tertiary)',
    color: 'var(--color-text-primary)',
    fontFamily: 'inherit',
    resize: 'none',
  };
}

function sendBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '0 14px',
    borderRadius: 'var(--radius-sm)',
    background: disabled ? 'var(--color-background-tertiary)' : 'var(--color-brand-accent)',
    color: disabled ? 'var(--color-text-tertiary)' : '#fff',
    fontSize: 12,
    fontWeight: 500,
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    alignSelf: 'stretch',
  };
}

function errorChipStyle(): React.CSSProperties {
  return {
    margin: '0 10px 6px',
    padding: '6px 10px',
    fontSize: 11,
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-bg-danger)',
    color: 'var(--color-text-danger)',
  };
}

// ── style-notes strip ──────────────────────────────────────────────

function styleStripStyle(): React.CSSProperties {
  return {
    padding: '8px 12px',
    borderBottom: '0.5px solid var(--color-border-tertiary)',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    flexShrink: 0,
    background: 'var(--color-background-secondary)',
  };
}

function styleLabelStyle(): React.CSSProperties {
  return {
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: 'var(--color-text-tertiary)',
    flexShrink: 0,
  };
}

function styleChipStyle(): React.CSSProperties {
  return {
    padding: '3px 8px',
    fontSize: 11,
    borderRadius: 999,
    background: 'var(--color-background-tertiary)',
    color: 'var(--color-text-primary)',
    border: '0.5px solid var(--color-border-secondary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: 260,
  };
}

function styleEmptyStyle(): React.CSSProperties {
  return {
    fontSize: 11,
    color: 'var(--color-text-tertiary)',
    fontStyle: 'normal',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };
}

function styleTextareaStyle(): React.CSSProperties {
  return {
    width: '100%',
    padding: 6,
    fontSize: 11,
    borderRadius: 'var(--radius-sm)',
    border: '0.5px solid var(--color-border-secondary)',
    background: 'var(--color-background-primary)',
    color: 'var(--color-text-primary)',
    fontFamily: 'inherit',
    resize: 'vertical',
    minHeight: 44,
  };
}

function stylePrimaryBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '3px 10px',
    fontSize: 11,
    fontWeight: 500,
    borderRadius: 'var(--radius-sm)',
    background: disabled ? 'var(--color-background-tertiary)' : 'var(--color-brand-accent)',
    color: disabled ? 'var(--color-text-tertiary)' : '#fff',
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

function styleGhostBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '3px 8px',
    fontSize: 11,
    borderRadius: 'var(--radius-sm)',
    background: 'transparent',
    color: disabled ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
    border: '0.5px solid var(--color-border-secondary)',
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

function styleErrorStyle(): React.CSSProperties {
  return {
    fontSize: 11,
    color: 'var(--color-text-danger)',
    padding: '4px 0 0',
  };
}
