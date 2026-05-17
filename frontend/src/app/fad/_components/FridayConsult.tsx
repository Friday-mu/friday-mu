'use client';

// Friday Consult — inline chat panel scoped to a single conversation.
// Wires to friday-gms's /api/ai/consult via FAD's /api/inbox/consult
// proxy. Replaces the scripted-strings stub that lived here until
// 2026-05-17.
//
// Two surfaces it serves:
//   1. The compose-box "Friday Consult" toggle in InboxModule —
//      `context: 'compose'` (operator asks about the conversation
//      without an active draft).
//   2. The DraftPanel's "Ask Friday" affordance — `context:
//      'draft_review'` (operator wants Friday to polish/shorten/etc
//      the active draft). The AI may emit a [DRAFT_UPDATE]…[/DRAFT_UPDATE]
//      block, parsed server-side and returned as `draft_update`. We
//      surface it to the parent via `onDraftUpdate` so DraftPanel can
//      swap into edit mode with the rewritten body.

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../../components/types';
import type { InboxDraft } from '../_data/fixtures';
import { confidenceTier } from '../_data/draftsClient';
import { fireToast } from './Toaster';
import { IconCheck, IconClose, IconRefresh, IconSend, IconSparkle } from './icons';

/** Structured teaching proposal emitted by friday-gms's [TEACH] tag
 *  parser (consult.ts:865-893). One per assistant turn at most. */
interface TeachingAction {
  /** create  — net-new rule; just confirm to insert.
   *  update  — refine an existing teaching (existingTeachingId).
   *  flag_conflict — new rule contradicts an existing one
   *                 (conflictingTeachingId). Operator chooses: pause
   *                 the conflicting + create new, or cancel. */
  action: 'create' | 'update' | 'flag_conflict';
  instruction: string;
  scope: 'global' | 'property';
  propertyCode: string | null;
  reason: string | null;
  existingTeachingId: string | null;
  conflictingTeachingId: string | null;
  conflictingTeachingIndex: string | null;
}

interface ConsultMessage {
  role: 'user' | 'friday';
  text: string;
  /** When set, the assistant turn carries a draft rewrite. UI shows
   *  a chip "Friday rewrote the draft → apply" that triggers
   *  onDraftUpdate(draftUpdate) in the parent. */
  draftUpdate?: string;
  /** When non-empty, render TeachingCards under the message. Each card
   *  closes the learning loop: operator confirms → POST /api/inbox/teachings,
   *  GMS stores it, every future draft prompt includes it. */
  teachingActions?: TeachingAction[];
  /** Per-action local state — 'pending' (showing), 'saving' (POST in
   *  flight), 'saved' (success), 'dismissed' (operator declined). */
  teachingStates?: Array<'pending' | 'saving' | 'saved' | 'dismissed'>;
  /** Optional citations / sources surfaced by GMS for accountability. */
  source?: string;
}

interface ConsultResponse {
  response: string;
  model?: string;
  /** 0..1 confidence score on this consult turn. Surfaces in the
   *  embedded DraftCard's confidence pill and in the send preflight
   *  modal so the operator can weigh whether to send as-is or revise.
   *  GMS-side heuristic for v1 (consult.ts); model self-report later. */
  confidence?: number;
  draft_update?: string;
  teaching_actions?: TeachingAction[];
  sessionId?: string;
  missingKnowledge?: boolean;
  compacted?: boolean;
}

type ConsultContext =
  | 'compose'
  | 'draft_review'
  | 'revision'
  | 'pending_action'
  | 'next_step'
  | 'message_review';

interface Props {
  threadScope: string;
  /** Conversation id — required for live LLM context loading. When
   *  null/undefined, the panel renders in degraded mode (chat works
   *  but Friday has no per-property knowledge). */
  conversationId?: string;
  /** The active GMS draft (if any) for this conversation. When present,
   *  its body seeds the embedded DraftCard. Friday can revise/replace
   *  it via [DRAFT_UPDATE]; operator can edit inline + Approve/Reject
   *  without leaving the panel. */
  currentDraft?: InboxDraft | null;
  /** Operator's in-progress compose text. Lets Friday refine work that
   *  hasn't been GMS-drafted yet. If both are present, currentDraft
   *  wins (because it's the GMS-authored version with state machine). */
  initialBody?: string;
  /** Conversation context — drives prompt assembly + model selection
   *  in friday-gms's consult.ts. Defaults to 'compose'. */
  context?: ConsultContext;
  /** WhatsApp channel + window state for the inline timer in DraftCard. */
  channelLabel?: string;
  whatsappWindow?: { open: boolean; expiresInMinutes?: number };

  // ── Action callbacks ── parent owns the network calls + 5s undo state.
  /** Approve the active GMS draft (with optional inline edits). When
   *  there's no currentDraft, this should send the body as a manual
   *  compose (mode=manual). */
  onApproveDraft?: (body: string) => void;
  /** Reject the active GMS draft with optional learning feedback. */
  onRejectDraft?: (reason?: string) => void;
  /** Send as a manual compose (when no currentDraft). Identical to
   *  approve from the operator's POV — Approve & Send always works. */
  onSendManual?: (body: string) => void;
  /** Set true while the parent is staging the send (5s undo countdown
   *  active or POST in flight). Disables DraftCard actions. */
  sendBusy?: boolean;

  /** Optional: when the user just types in compose and opens consult,
   *  whatever they had drafted comes through here so we don't drop it. */
  onBodyChanged?: (body: string) => void;

  /** Operator wants to write an internal team note (different audience —
   *  team, not guest). Parent switches composeMode + closes consult. */
  onSwitchToNote?: () => void;

  onClose: () => void;
}

export function FridayConsult({
  threadScope,
  conversationId,
  currentDraft,
  initialBody,
  context = 'compose',
  channelLabel,
  whatsappWindow,
  onApproveDraft,
  onRejectDraft,
  onSendManual,
  sendBusy = false,
  onBodyChanged,
  onSwitchToNote,
  onClose,
}: Props) {
  // The "working draft body" is what the operator will eventually send.
  // Seeded from the active GMS draft if any, else the in-progress
  // compose text. Mutated by inline edits, by [DRAFT_UPDATE] from Friday,
  // and by quick-chip rewrites. Tracks the source of truth across the
  // whole chat session.
  const seed = currentDraft?.body ?? initialBody ?? '';
  const [workingBody, setWorkingBody] = useState<string>(seed);
  // Reset when the active draft swaps (next conversation, or revise
  // landed a new draft id).
  useEffect(() => {
    setWorkingBody(currentDraft?.body ?? initialBody ?? '');
  }, [currentDraft?.id, currentDraft?.body, initialBody]);

  // Push body changes up to the parent so it stays in sync with the
  // compose box when the user closes consult.
  useEffect(() => {
    onBodyChanged?.(workingBody);
  }, [workingBody, onBodyChanged]);

  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  // Live confidence on the most recent consult turn. Surfaces in the
  // DraftCard header so the operator can see how confident Friday is
  // in their latest rewrite, separate from the GMS-draft confidence
  // (which is on currentDraft.confidence).
  const [latestConfidence, setLatestConfidence] = useState<number | null>(
    typeof currentDraft?.confidence === 'number' ? currentDraft.confidence : null,
  );
  useEffect(() => {
    if (typeof currentDraft?.confidence === 'number') {
      setLatestConfidence(currentDraft.confidence);
    }
  }, [currentDraft?.id, currentDraft?.confidence]);
  const [msgs, setMsgs] = useState<ConsultMessage[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [missingKnowledge, setMissingKnowledge] = useState(false);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll on new messages / thinking state.
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, thinking]);

  // ─── Quick chips ─────────────────────────────────────────────────────
  // Context-aware quick replies. draft_review gets the OLD-UI set
  // (Polish / Shorter / More formal / More casual / STR KB); compose
  // gets a smaller set focused on triage.
  const chips = context === 'draft_review'
    ? ['Polish', 'Shorter', 'More formal', 'More casual', 'STR KB']
    : ['Summarise this thread', 'What does the guest want?', 'STR KB'];

  const submit = async (text: string) => {
    const q = text.trim();
    if (!q || thinking) return;

    setError(null);
    setMsgs((m) => [...m, { role: 'user', text: q }]);
    setThinking(true);

    try {
      const body: Record<string, unknown> = {
        text: q,
        context,
      };
      if (conversationId) body.conversationId = conversationId;
      if (currentDraft?.id) body.draftId = currentDraft.id;
      // Always send the CURRENT working body so Friday operates on the
      // operator's latest edits, not the stale GMS-original.
      if (workingBody) body.draftBody = workingBody;
      if (sessionId) body.sessionId = sessionId;

      const t0 = Date.now();
      const data = await apiFetch('/api/inbox/consult', {
        method: 'POST',
        body: JSON.stringify(body),
      }) as ConsultResponse;

      // Adoption tracking — every consult query, with response signals:
      // missing-knowledge, has-teach, has-draft-update. Lets us see what
      // operators actually ask Friday for + which queries Friday handles
      // confidently vs admits ignorance.
      try {
        const { trackEvent } = await import('../../../lib/analytics');
        trackEvent('friday_consult_query', {
          context: body.context,
          duration_ms: Date.now() - t0,
          missing_knowledge: !!data?.missingKnowledge,
          has_teach_blocks: Array.isArray(data?.teaching_actions) && data.teaching_actions.length > 0,
          has_draft_update: !!data?.draft_update,
          model: data?.model,
        });
      } catch { /* ignore */ }

      if (data?.sessionId && data.sessionId !== sessionId) setSessionId(data.sessionId);
      if (data?.missingKnowledge) setMissingKnowledge(true);
      if (typeof data?.confidence === 'number') setLatestConfidence(data.confidence);

      // Friday rewrote the draft — surface inline in the embedded
      // DraftCard. The chat bubble itself just confirms the action.
      if (data?.draft_update && data.draft_update.trim().length > 0) {
        setWorkingBody(data.draft_update.trim());
      }

      const teachings = Array.isArray(data?.teaching_actions) ? data!.teaching_actions! : [];
      const aiMsg: ConsultMessage = {
        role: 'friday',
        text: (data?.response || '').trim(),
        draftUpdate: data?.draft_update,
        teachingActions: teachings.length > 0 ? teachings : undefined,
        teachingStates: teachings.length > 0 ? teachings.map(() => 'pending' as const) : undefined,
        source: data?.model,
      };
      if (aiMsg.text.length === 0 && !aiMsg.draftUpdate && teachings.length === 0) {
        setError('Friday went quiet — try rephrasing.');
      } else {
        setMsgs((m) => [...m, aiMsg]);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Friday is unreachable right now.';
      setError(msg);
    } finally {
      setThinking(false);
    }
  };

  // ─── Draft actions (inline within the consult panel) ─────────────────

  const submitApprove = () => {
    if (!workingBody.trim() || sendBusy) return;
    if (currentDraft && onApproveDraft) onApproveDraft(workingBody.trim());
    else if (onSendManual) onSendManual(workingBody.trim());
  };

  const submitReject = () => {
    if (!onRejectDraft || !currentDraft) return;
    onRejectDraft(rejectReason.trim() || undefined);
    setRejecting(false);
    setRejectReason('');
  };

  const onSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (input.trim()) {
      submit(input.trim());
      setInput('');
    }
  };

  // Update one teaching's local state without rebuilding the whole list.
  const setTeachingState = (
    msgIndex: number,
    actionIndex: number,
    state: 'pending' | 'saving' | 'saved' | 'dismissed',
  ) => {
    setMsgs((all) => {
      const copy = [...all];
      const msg = { ...copy[msgIndex] };
      if (!msg.teachingStates) return all;
      msg.teachingStates = [...msg.teachingStates];
      msg.teachingStates[actionIndex] = state;
      copy[msgIndex] = msg;
      return copy;
    });
  };

  // Operator confirmed a teaching proposal — close the loop with GMS.
  // The action types differ in how they hit the API:
  //   create        → POST /api/inbox/teachings
  //   update        → PATCH /api/inbox/teachings/:existingId
  //   flag_conflict → POST /api/inbox/teachings/:conflictingId/pause
  //                   then POST /api/inbox/teachings (the replacement)
  //
  // Optional `extraPropertyCodes` widens the scope from a single
  // property (proposed by Friday) to multiple — wired through to GMS
  // via the property_codes[] array which mig 053-era teachings already
  // support. Used by the multi-property picker in TeachingCard.
  const confirmTeaching = async (
    msgIndex: number,
    actionIndex: number,
    ta: TeachingAction,
    extraPropertyCodes?: string[],
  ) => {
    setTeachingState(msgIndex, actionIndex, 'saving');
    try {
      const payload: Record<string, unknown> = {
        instruction: ta.instruction,
        scope: ta.scope,
      };
      if (ta.propertyCode && (!extraPropertyCodes || extraPropertyCodes.length === 0)) {
        payload.property_code = ta.propertyCode;
      }
      // Multi-property: send property_codes[] when picker added codes
      // beyond the one Friday proposed. Backend prefers this over the
      // single property_code field.
      if (extraPropertyCodes && extraPropertyCodes.length > 0) {
        const all = ta.propertyCode
          ? [...new Set([ta.propertyCode, ...extraPropertyCodes])]
          : [...new Set(extraPropertyCodes)];
        payload.property_codes = all;
      }

      if (ta.action === 'create') {
        await apiFetch('/api/inbox/teachings', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        fireToast('Friday will remember this');
      } else if (ta.action === 'update' && ta.existingTeachingId) {
        // Update + multi-property: backend's PATCH /api/teachings/:id
        // takes instruction only. For multi-property updates we'd need
        // to also POST a new teaching scoped to the additional properties.
        // For v1 keep update path as instruction-only; multi-property
        // extension after an update is a Phase 2.1 enhancement.
        await apiFetch(`/api/inbox/teachings/${ta.existingTeachingId}`, {
          method: 'PATCH',
          body: JSON.stringify({ instruction: ta.instruction }),
        });
        fireToast('Teaching updated');
      } else if (ta.action === 'flag_conflict' && ta.conflictingTeachingId) {
        // Replace pattern: pause the conflicting rule, then create the new
        // one. If the pause succeeds but the create fails, the old is
        // still paused — surface that to the operator.
        await apiFetch(`/api/inbox/teachings/${ta.conflictingTeachingId}/pause`, { method: 'POST' });
        await apiFetch('/api/inbox/teachings', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        fireToast('Old rule paused, new rule added');
      } else {
        // No actionable id (update/conflict variants missing their target).
        // Fall back to a create so the instruction isn't lost.
        await apiFetch('/api/inbox/teachings', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        fireToast('Friday will remember this');
      }
      setTeachingState(msgIndex, actionIndex, 'saved');
    } catch (e) {
      fireToast(e instanceof Error ? e.message : 'Failed to save teaching');
      setTeachingState(msgIndex, actionIndex, 'pending');
    }
  };

  const dismissTeaching = (msgIndex: number, actionIndex: number) => {
    setTeachingState(msgIndex, actionIndex, 'dismissed');
  };

  return (
    <div
      className="friday-consult"
      style={{
        // When consult is the primary surface (no compose below), allow
        // it to grow tall instead of being capped at the legacy 360px.
        // 65vh gives plenty of room for chat + DraftCard + input without
        // pushing the rest off-screen.
        maxHeight: '65vh',
        flex: '1 1 auto',
      }}
    >
      <div className="friday-consult-header">
        <IconSparkle size={12} />
        <span style={{ fontSize: 12, fontWeight: 500 }}>Friday Consult</span>
        <span className="chip" style={{ marginLeft: 6, fontSize: 10 }}>
          scope · {threadScope}
        </span>
        {missingKnowledge && (
          <span
            className="chip"
            style={{ marginLeft: 6, fontSize: 10, color: 'var(--color-text-warning)' }}
            title="No property knowledge file loaded for this property"
          >
            ⚠ no KB
          </span>
        )}
        <button
          className="fad-util-btn"
          onClick={onClose}
          style={{ marginLeft: 'auto', width: 24, height: 24 }}
          title="Close"
        >
          <IconClose size={12} />
        </button>
      </div>
      <div className="friday-consult-body" ref={transcriptRef}>
        {msgs.length === 0 && (
          <div
            style={{
              padding: 16,
              fontSize: 12,
              color: 'var(--color-text-tertiary)',
              textAlign: 'center',
              lineHeight: 1.5,
            }}
          >
            Ask Friday about this conversation — drafting tone, missing context,
            policy lookups, refunds. Friday reads the thread + property knowledge
            + active draft.
          </div>
        )}
        {msgs.map((m, i) => (
          <MessageRow
            key={i}
            m={m}
            msgIndex={i}
            onChipClick={submit}
            onConfirmTeaching={confirmTeaching}
            onDismissTeaching={dismissTeaching}
          />
        ))}
        {thinking && <ThinkingRow />}
        {error && (
          <div
            style={{
              padding: '8px 12px',
              margin: '4px 0',
              fontSize: 12,
              color: 'var(--color-text-danger)',
              background: 'var(--color-background-danger-soft, rgba(220, 38, 38, 0.08))',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            {error}
          </div>
        )}
        {/* Active draft renders inline at the end of the consult thread
            (not pinned below). When Friday revises, the new draft body
            replaces this card's contents — older revisions stay visible
            as part of the conversation messages above. Only renders
            when there's something to edit/approve so the empty
            "Your reply will be…" placeholder no longer takes a row. */}
        {(currentDraft || workingBody.trim().length > 0) && (
          <EmbeddedDraftCard
            workingBody={workingBody}
            setWorkingBody={setWorkingBody}
            currentDraft={currentDraft || null}
            liveConfidence={latestConfidence}
            channelLabel={channelLabel}
            whatsappWindow={whatsappWindow}
            sendBusy={sendBusy}
            rejecting={rejecting}
            rejectReason={rejectReason}
            setRejectReason={setRejectReason}
            onApprove={submitApprove}
            onStartReject={() => setRejecting(true)}
            onConfirmReject={submitReject}
            onCancelReject={() => { setRejecting(false); setRejectReason(''); }}
          />
        )}
      </div>
      {/* Quick-reply chips: context-aware presets */}
      {msgs.length === 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 4,
            padding: '0 12px 8px',
          }}
        >
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => submit(c)}
              disabled={thinking}
              style={{
                padding: '4px 8px',
                fontSize: 11,
                color: 'var(--color-text-secondary)',
                background: 'var(--color-background-secondary)',
                border: '0.5px solid var(--color-border-tertiary)',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
              }}
            >
              {c}
            </button>
          ))}
        </div>
      )}
      <form className="friday-consult-input" onSubmit={onSubmit}>
        <input
          placeholder={
            workingBody.length > 0
              ? 'Ask Friday to refine the draft…'
              : 'Ask Friday — or paste a draft to refine…'
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={thinking}
        />
        <button type="submit" className="btn primary sm" disabled={thinking || !input.trim()}>
          <IconSend size={12} />
        </button>
        <ComposeMenu
          onSwitchToNote={onSwitchToNote}
          disabled={thinking}
        />
      </form>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────

function MessageRow({
  m,
  msgIndex,
  onChipClick: _onChipClick,
  onConfirmTeaching,
  onDismissTeaching,
}: {
  m: ConsultMessage;
  msgIndex: number;
  onChipClick: (text: string) => void;
  onConfirmTeaching: (msgIndex: number, actionIndex: number, ta: TeachingAction, extraPropertyCodes?: string[]) => void;
  onDismissTeaching: (msgIndex: number, actionIndex: number) => void;
}) {
  const isUser = m.role === 'user';
  return (
    <div style={{ margin: '6px 12px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: isUser ? 'flex-end' : 'flex-start',
        }}
      >
        <div
          style={{
            maxWidth: '85%',
            padding: '8px 10px',
            fontSize: 13,
            lineHeight: 1.45,
            whiteSpace: 'pre-wrap',
            color: 'var(--color-text-primary)',
            background: isUser
              ? 'var(--color-brand-accent)'
              : 'var(--color-background-secondary)',
            borderRadius: 'var(--radius-md)',
            ...(isUser ? { color: '#fff' } : {}),
          }}
        >
          {m.text}
          {/* If [DRAFT_UPDATE] arrived, the working draft below already
              picked it up. Show a small affordance so it's obvious the
              chat caused the change, not a UI bug. */}
          {m.draftUpdate && (
            <div
              style={{
                marginTop: 6,
                fontSize: 11,
                fontWeight: 500,
                color: isUser ? 'rgba(255,255,255,0.85)' : 'var(--color-brand-accent)',
                fontStyle: 'italic',
              }}
            >
              ↓ Draft updated below
            </div>
          )}
        </div>
      </div>
      {/* Teaching cards — below the bubble, full-width within the message
          row. One card per teaching action. Each closes the learning loop
          when the operator confirms. */}
      {m.teachingActions && m.teachingActions.map((ta, ai) => (
        <TeachingCard
          key={ai}
          action={ta}
          state={(m.teachingStates && m.teachingStates[ai]) || 'pending'}
          onConfirm={(extraPropertyCodes) => onConfirmTeaching(msgIndex, ai, ta, extraPropertyCodes)}
          onDismiss={() => onDismissTeaching(msgIndex, ai)}
        />
      ))}
    </div>
  );
}

// ─── Embedded DraftCard ─────────────────────────────────────────────────
// The operator's working draft body, editable inline. Lives inside the
// FridayConsult panel so the operator never has to leave to act on it.
// Approve & Reject buttons fire callbacks the parent (InboxModule) wires
// to the same handlers DraftPanel used before — same 5s undo banner, same
// backend pipeline.

function EmbeddedDraftCard({
  workingBody,
  setWorkingBody,
  currentDraft,
  liveConfidence,
  channelLabel,
  whatsappWindow,
  sendBusy,
  rejecting,
  rejectReason,
  setRejectReason,
  onApprove,
  onStartReject,
  onConfirmReject,
  onCancelReject,
}: {
  workingBody: string;
  setWorkingBody: (s: string) => void;
  currentDraft: InboxDraft | null;
  /** Confidence from the most recent consult turn — supersedes
   *  currentDraft.confidence whenever Friday has rewritten the draft
   *  in this session (so the pill reflects the freshest score). */
  liveConfidence?: number | null;
  channelLabel?: string;
  whatsappWindow?: { open: boolean; expiresInMinutes?: number };
  sendBusy: boolean;
  rejecting: boolean;
  rejectReason: string;
  setRejectReason: (s: string) => void;
  onApprove: () => void;
  onStartReject: () => void;
  onConfirmReject: () => void;
  onCancelReject: () => void;
}) {
  // Resolve which confidence number to render. Live consult-turn
  // confidence wins (it's the freshest). Falls back to GMS-draft
  // confidence. Manual (operator-typed) compose has neither — show
  // "Operator-authored" instead.
  const effectiveConfidence: number | null =
    typeof liveConfidence === 'number'
      ? liveConfidence
      : typeof currentDraft?.confidence === 'number'
        ? currentDraft.confidence
        : null;
  const tier = confidenceTier(effectiveConfidence ?? undefined);
  const confLabel = effectiveConfidence !== null
    ? `${Math.round(effectiveConfidence * 100)}%`
    : null;
  const isOperatorAuthored = effectiveConfidence === null && !currentDraft;
  const confColor: Record<'high' | 'mid' | 'low', string> = {
    high: 'var(--color-text-success)',
    mid: 'var(--color-text-warning)',
    low: 'var(--color-text-danger)',
  };
  const headerLabel = currentDraft ? 'AI Draft' : 'Your reply';
  const sendDisabled = sendBusy || !workingBody.trim();

  // WhatsApp window pill (compact). Shown when channel is WhatsApp.
  const showWaPill = channelLabel?.toLowerCase().includes('whatsapp') && whatsappWindow;
  const waOpen = whatsappWindow?.open;
  const waLeft = whatsappWindow?.expiresInMinutes;

  return (
    <div
      style={{
        margin: '4px 12px 8px',
        padding: 10,
        background: 'var(--color-background-accent-soft, rgba(56, 132, 255, 0.06))',
        border: '0.5px solid var(--color-border-accent, rgba(56, 132, 255, 0.3))',
        borderRadius: 'var(--radius-md)',
      }}
    >
      {/* Header: source label + confidence + revision number + WA timer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          color: 'var(--color-text-tertiary)',
        }}>
          {headerLabel}
        </span>
        {confLabel && (
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '1px 6px',
            borderRadius: 'var(--radius-sm)',
            background: confColor[tier],
            color: '#fff',
          }}
            title="Friday's confidence on this draft. Live consult turns supersede the original GMS-draft score."
          >
            {confLabel}
          </span>
        )}
        {isOperatorAuthored && workingBody.length > 0 && (
          <span
            style={{
              fontSize: 10,
              padding: '1px 6px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-background-tertiary)',
              color: 'var(--color-text-secondary)',
              fontStyle: 'italic',
            }}
            title="You typed this — no AI confidence to display."
          >
            Operator-authored
          </span>
        )}
        {currentDraft && typeof currentDraft.revisionNumber === 'number' && currentDraft.revisionNumber > 1 && (
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
            rev {currentDraft.revisionNumber}
          </span>
        )}
        {showWaPill && (
          <span style={{
            fontSize: 10,
            padding: '1px 6px',
            borderRadius: 'var(--radius-sm)',
            background: waOpen ? 'rgba(16, 185, 129, 0.12)' : 'rgba(220, 38, 38, 0.12)',
            color: waOpen ? 'var(--color-text-success)' : 'var(--color-text-danger)',
            fontWeight: 600,
          }}
          title="WhatsApp 24-hour reply window">
            {waOpen
              ? `WA · ${typeof waLeft === 'number' ? `${Math.floor(waLeft / 60)}h ${waLeft % 60}m left` : 'open'}`
              : 'WA window closed — use template'}
          </span>
        )}
      </div>

      {/* Editable body — operator can tweak before sending. */}
      <textarea
        value={workingBody}
        onChange={(e) => setWorkingBody(e.target.value)}
        placeholder="Draft will appear here when Friday writes one, or type your own…"
        rows={6}
        style={{
          width: '100%',
          minHeight: 100,
          maxHeight: 280,
          padding: 8,
          fontSize: 13,
          lineHeight: 1.45,
          fontFamily: 'inherit',
          color: 'var(--color-text-primary)',
          background: 'var(--color-background-primary)',
          border: '0.5px solid var(--color-border-tertiary)',
          borderRadius: 'var(--radius-sm)',
          resize: 'vertical',
          boxSizing: 'border-box',
        }}
        disabled={sendBusy || rejecting}
      />

      {rejecting ? (
        <div style={{ marginTop: 8 }}>
          <input
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Why is this draft wrong? (Friday learns — leave empty to dismiss silently)"
            style={{
              width: '100%',
              padding: '7px 10px',
              fontSize: 12,
              color: 'var(--color-text-primary)',
              background: 'var(--color-background-primary)',
              border: '0.5px solid var(--color-border-secondary)',
              borderRadius: 'var(--radius-sm)',
              boxSizing: 'border-box',
            }}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button
              type="button"
              onClick={onConfirmReject}
              style={{
                padding: '6px 10px',
                fontSize: 12,
                fontWeight: 600,
                color: '#fff',
                background: 'var(--color-text-danger)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
              }}
            >
              <IconClose size={11} /> {rejectReason.trim() ? 'Reject with feedback' : 'Dismiss'}
            </button>
            <button
              type="button"
              onClick={onCancelReject}
              style={{
                padding: '6px 10px',
                fontSize: 12,
                color: 'var(--color-text-secondary)',
                background: 'transparent',
                border: '0.5px solid var(--color-border-secondary)',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onApprove}
            disabled={sendDisabled}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 600,
              color: '#fff',
              background: 'var(--color-brand-accent)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              cursor: sendDisabled ? 'not-allowed' : 'pointer',
              opacity: sendDisabled ? 0.5 : 1,
            }}
          >
            <IconSend size={12} /> Approve &amp; send
          </button>
          {currentDraft && (
            <button
              type="button"
              onClick={onStartReject}
              disabled={sendBusy}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '6px 10px',
                fontSize: 12,
                color: 'var(--color-text-secondary)',
                background: 'transparent',
                border: '0.5px solid var(--color-border-secondary)',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
              }}
            >
              <IconClose size={11} /> Reject
            </button>
          )}
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', alignSelf: 'center' }}>
            <IconRefresh size={10} /> Keep chatting to refine
          </span>
        </div>
      )}
    </div>
  );
}

function TeachingCard({
  action,
  state,
  onConfirm,
  onDismiss,
}: {
  action: TeachingAction;
  state: 'pending' | 'saving' | 'saved' | 'dismissed';
  /** Optional `extraPropertyCodes` widens scope from single-property to
   *  multi-property. Operator picks which properties beyond the one
   *  Friday proposed should also receive this teaching. */
  onConfirm: (extraPropertyCodes?: string[]) => void;
  onDismiss: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [extraCodesInput, setExtraCodesInput] = useState('');

  if (state === 'dismissed') return null;

  const isConflict = action.action === 'flag_conflict';
  const accent = isConflict ? 'var(--color-text-warning)' : 'var(--color-brand-accent)';
  const bg = isConflict
    ? 'var(--color-background-warning-soft, rgba(245, 158, 11, 0.08))'
    : 'var(--color-background-accent-soft, rgba(56, 132, 255, 0.08))';

  const title = isConflict
    ? '⚠ Conflicts with an existing rule'
    : action.action === 'update'
    ? '✎ Refine an existing teaching'
    : '✦ New teaching from Friday';

  const scopeLine = action.scope === 'property' && action.propertyCode
    ? `Scope: property ${action.propertyCode}`
    : 'Scope: global (all properties)';

  return (
    <div
      style={{
        marginTop: 6,
        padding: 10,
        background: bg,
        border: `0.5px solid ${accent}`,
        borderRadius: 'var(--radius-md)',
        fontSize: 12,
        color: 'var(--color-text-primary)',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: accent, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {title}
      </div>
      <div style={{ marginBottom: 4 }}>
        <strong>“{action.instruction}”</strong>
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: action.reason ? 4 : 8 }}>
        {scopeLine}
        {/* Multi-property expansion: when scope is 'property', let the
            operator apply the same teaching to additional properties.
            v1 takes comma-separated codes (e.g. "LB-2, KS-5"); a richer
            checkbox picker against the live /api/properties list lands
            once that endpoint is wired into the inbox surface. */}
        {action.scope === 'property' && state !== 'saving' && state !== 'saved' && (
          <>
            {' · '}
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              style={{
                background: 'transparent',
                border: 'none',
                color: accent,
                fontSize: 11,
                cursor: 'pointer',
                padding: 0,
                textDecoration: 'underline',
              }}
            >
              {pickerOpen ? 'Cancel' : 'Apply to more properties'}
            </button>
          </>
        )}
      </div>
      {pickerOpen && state !== 'saving' && state !== 'saved' && (
        <div style={{ marginBottom: 8 }}>
          <input
            type="text"
            value={extraCodesInput}
            onChange={(e) => setExtraCodesInput(e.target.value)}
            placeholder="Additional property codes — e.g. LB-2, KS-5, MV-1"
            style={{
              width: '100%',
              padding: '5px 8px',
              fontSize: 11,
              color: 'var(--color-text-primary)',
              background: 'var(--color-background-primary)',
              border: '0.5px solid var(--color-border-secondary)',
              borderRadius: 'var(--radius-sm)',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
            The teaching will apply to {action.propertyCode ? `${action.propertyCode} + ` : ''}every code you list above.
          </div>
        </div>
      )}
      {action.reason && (
        <div style={{
          fontSize: 11,
          color: 'var(--color-text-secondary)',
          marginBottom: 8,
          padding: '4px 6px',
          background: 'var(--color-background-primary)',
          borderRadius: 'var(--radius-sm)',
        }}>
          Friday&apos;s reasoning: {action.reason}
        </div>
      )}
      {state === 'saved' ? (
        <div style={{ fontSize: 11, color: 'var(--color-text-success)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <IconCheck size={11} /> Saved — Friday will use this in future drafts
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={() => {
              const extras = extraCodesInput
                .split(',')
                .map((s) => s.trim().toUpperCase())
                .filter((s) => s.length > 0);
              onConfirm(extras.length > 0 ? extras : undefined);
            }}
            disabled={state === 'saving'}
            style={{
              padding: '5px 10px',
              fontSize: 11,
              fontWeight: 600,
              color: '#fff',
              background: accent,
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
            }}
          >
            <IconCheck size={11} /> {state === 'saving'
              ? 'Saving…'
              : (isConflict ? 'Replace old rule' : action.action === 'update' ? 'Apply update' : 'Confirm')}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            disabled={state === 'saving'}
            style={{
              padding: '5px 10px',
              fontSize: 11,
              color: 'var(--color-text-secondary)',
              background: 'transparent',
              border: '0.5px solid var(--color-border-secondary)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
            }}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

// Dropdown menu next to the Send button for extra compose actions.
// Replaces the old "Add internal note instead" link with a compact
// chevron that opens a menu. Schedule send + WhatsApp templates are
// stubbed for now (toast hint) — placeholders so the menu shape is
// ready for the real flows.
function ComposeMenu({ onSwitchToNote, disabled }: { onSwitchToNote?: () => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('[data-compose-menu]')) setOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [open]);

  return (
    <div data-compose-menu style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        disabled={disabled}
        className="btn primary sm"
        title="More send options"
        aria-label="More send options"
        style={{ padding: '4px 6px', minWidth: 0 }}
      >
        ▾
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 4px)',
            right: 0,
            minWidth: 220,
            background: 'var(--color-background-primary)',
            border: '0.5px solid var(--color-border-secondary)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 8px 24px rgba(15, 24, 54, 0.12)',
            padding: 4,
            zIndex: 50,
          }}
          role="menu"
        >
          <ComposeMenuItem
            icon="📝"
            label="Add internal note"
            sub="Visible to team only — not to the guest"
            onClick={() => { setOpen(false); onSwitchToNote?.(); }}
            disabled={!onSwitchToNote}
          />
          <ComposeMenuItem
            icon="⏰"
            label="Schedule send"
            sub="Coming soon"
            onClick={() => { setOpen(false); fireToast('Schedule-send lands in a follow-up sprint'); }}
            disabled
          />
          <ComposeMenuItem
            icon="💬"
            label="Send WhatsApp template"
            sub="Coming soon"
            onClick={() => { setOpen(false); fireToast('Template picker lands in a follow-up sprint'); }}
            disabled
          />
        </div>
      )}
    </div>
  );
}

function ComposeMenuItem({
  icon,
  label,
  sub,
  onClick,
  disabled,
}: { icon: string; label: string; sub: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      role="menuitem"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        width: '100%',
        padding: '8px 10px',
        background: 'transparent',
        border: 'none',
        borderRadius: 'var(--radius-sm)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        textAlign: 'left',
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = 'var(--color-background-secondary)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{ fontSize: 14, lineHeight: 1.2 }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' }}>{label}</div>
        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 1 }}>{sub}</div>
      </span>
    </button>
  );
}

function ThinkingRow() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px' }}>
      <span
        style={{
          display: 'inline-block',
          width: 8,
          height: 8,
          borderRadius: '50%',
          border: '1.5px solid var(--color-border-secondary)',
          borderTopColor: 'var(--color-brand-accent)',
          animation: 'friday-spin 0.9s linear infinite',
        }}
      />
      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
        Friday is thinking…
      </span>
    </div>
  );
}
