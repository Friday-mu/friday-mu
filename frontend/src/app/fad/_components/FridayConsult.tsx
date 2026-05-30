'use client';

// Friday Consult — inline chat panel scoped to a single conversation.
// Wires to FAD-native /api/inbox/consult. Replaces the scripted-strings
// stub that lived here until 2026-05-17.
//
// Two surfaces it serves:
//   1. The compose-box "Friday Consult" toggle in InboxModule —
//      `context: 'compose'` (operator asks about the conversation
//      without an active draft).
//   2. The DraftPanel's "Ask Friday" affordance — `context:
//      'draft_review'` (operator wants Friday to polish/shorten/etc
//      the active draft). The backend returns structured draft updates;
//      each one is rendered as a draft message so revisions stay in the
//      chat flow instead of leaking as plain assistant text.

import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, formatConfidencePercent } from '../../../components/types';
import type { InboxDraft } from '../_data/fixtures';
import { confidenceTier } from '../_data/draftsClient';
import { PROPERTIES } from '../_data/properties';
import { fireToast } from './Toaster';
import { IconCheck, IconClose, IconRefresh, IconSend, IconSparkle } from './icons';
import TaskSuggestionCard, { type TaskSuggestion } from '../../../components/TaskSuggestionCard';

/** Structured teaching proposal emitted by the FAD Consult parser.
 *  One per assistant turn at most. */
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
  role: 'user' | 'friday' | 'draft';
  text: string;
  /** When set, the assistant turn carries a draft rewrite. UI shows
   *  a chip "Friday rewrote the draft → apply" that triggers
   *  onDraftUpdate(draftUpdate) in the parent. */
  draftUpdate?: string;
  /** Revision number for 'draft' role — sequentially increments each
   *  time Friday produces a structured draft update or via a fresh
   *  persisted draft. Latest revision is the active/editable one. */
  draftRev?: number;
  /** Inbox draft id for 'draft' role when sourced from a persisted draft. */
  draftId?: string;
  draftRecipientLabel?: string | null;
  draftChannel?: string | null;
  draftTargetHint?: string | null;
  /** When non-empty, render TeachingCards under the message. Each card
   *  closes the learning loop: operator confirms → POST /api/inbox/teachings,
   *  FAD stores it, every future draft prompt includes it. */
  teachingActions?: TeachingAction[];
  /** Per-action local state — 'pending' (showing), 'saving' (POST in
   *  flight), 'saved' (success), 'dismissed' (operator declined). */
  teachingStates?: Array<'pending' | 'saving' | 'saved' | 'dismissed'>;
  /** Friday-proposed task suggestions (rendered as inline cards). */
  taskSuggestions?: TaskSuggestion[];
  /** Per-suggestion local state — 'pending' / 'accepted' / 'dismissed'. */
  taskSuggestionStates?: Array<'pending' | 'accepted' | 'dismissed'>;
  /** Optional citations / sources surfaced by Friday for accountability. */
  source?: string;
}

interface ConsultDraftUpdate {
  body?: string;
  draft_body?: string;
  draftBody?: string;
  text?: string;
  message?: string;
  recipient_label?: string | null;
  recipientLabel?: string | null;
  recipient?: string | null;
  to?: string | null;
  channel?: string | null;
  target_hint?: string | null;
  targetHint?: string | null;
  target?: string | null;
}

interface ConsultResponse {
  response: string;
  model?: string;
  /** 0..1 confidence score on this consult turn. Surfaces in the
   *  embedded DraftCard's confidence pill and in the send preflight
   *  modal so the operator can weigh whether to send as-is or revise.
   *  backend heuristic for v1; model self-report later. */
  confidence?: number;
  draft_update?: string;
  draft_updates?: ConsultDraftUpdate[];
  teaching_actions?: TeachingAction[];
  task_suggestions?: TaskSuggestion[];
  sessionId?: string;
  missingKnowledge?: boolean;
  compacted?: boolean;
  metadata?: {
    fallbackUsed?: boolean;
    degraded?: boolean;
    modelTimeout?: boolean;
    fullThread?: boolean;
    messageCount?: number;
    draftUpdateCount?: number;
    structuredEnvelope?: boolean;
  };
}

type ConsultContext =
  | 'compose'
  | 'draft_review'
  | 'revision'
  | 'pending_action'
  | 'next_step'
  | 'message_review';

type WhatsAppWindow = { open: boolean; expiresInMinutes?: number; expiresAt?: string };

function confidenceRatio(value: unknown): number | null {
  const percent = formatConfidencePercent(value as number | string | null | undefined);
  return percent == null ? null : percent / 100;
}

function normalizeConsultDraftUpdates(data: ConsultResponse | null | undefined): Array<{
  body: string;
  recipientLabel: string | null;
  channel: string | null;
  targetHint: string | null;
}> {
  const rawUpdates = Array.isArray(data?.draft_updates)
    ? data!.draft_updates!
    : (data?.draft_update ? [{ body: data.draft_update }] : []);
  return rawUpdates
    .map((item) => {
      const body = String(item?.body || item?.draft_body || item?.draftBody || item?.text || item?.message || '').trim();
      if (!body) return null;
      const recipientLabel = item.recipient_label || item.recipientLabel || item.recipient || item.to || null;
      const targetHint = item.target_hint || item.targetHint || item.target || null;
      return {
        body,
        recipientLabel: recipientLabel ? String(recipientLabel) : null,
        channel: item.channel ? String(item.channel) : null,
        targetHint: targetHint ? String(targetHint) : null,
      };
    })
    .filter((item): item is { body: string; recipientLabel: string | null; channel: string | null; targetHint: string | null } => Boolean(item));
}

function useWhatsAppWindow(windowInfo?: WhatsAppWindow) {
  const [state, setState] = useState<{ open: boolean; expiresInMinutes?: number }>({
    open: !!windowInfo?.open,
    expiresInMinutes: windowInfo?.expiresInMinutes,
  });

  useEffect(() => {
    const update = () => {
      if (!windowInfo) return;
      if (!windowInfo.open) {
        setState({ open: false, expiresInMinutes: 0 });
        return;
      }
      if (!windowInfo.expiresAt) {
        setState({ open: true, expiresInMinutes: windowInfo.expiresInMinutes });
        return;
      }
      const minutes = Math.max(0, Math.round((new Date(windowInfo.expiresAt).getTime() - Date.now()) / 60_000));
      setState({ open: minutes > 0, expiresInMinutes: minutes });
    };
    update();
    const interval = globalThis.setInterval(update, 30_000);
    return () => globalThis.clearInterval(interval);
  }, [windowInfo?.expiresAt, windowInfo?.expiresInMinutes, windowInfo?.open]);

  return state;
}

const CHIP_INSTRUCTIONS: Record<string, string> = {
  Polish: 'Improve the tone, grammar, and professionalism of this draft. Apply brand voice and teachings.',
  Shorter: 'Make this draft shorter and more concise. Keep the key information.',
  'More formal': 'Make this draft more formal and professional in tone.',
  'More casual': 'Make this draft more casual and friendly in tone.',
  'STR KB': '[STR_KB] Review this draft against the full STR best practices. Flag any issues and suggest improvements.',
  'Airbnb policy': 'Review this draft against Airbnb guest messaging, review, refund, and policy constraints. Flag concrete risks only.',
  'Booking.com policy': 'Review this draft against Booking.com guest messaging, cancellation, payment, and policy constraints. Flag concrete risks only.',
  'Summarise this thread': 'Summarise this conversation for an operator. Focus on guest intent, open questions, and next action.',
  'What does the guest want?': 'Identify what the guest wants, what we know, and the next best reply.',
};

// Keep the browser budget aligned with the backend/nginx long-context path.
// The panel has a Stop control, so operators can still cancel manually.
const CONSULT_CLIENT_TIMEOUT_MS = 590_000;

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

interface Props {
  threadScope: string;
  /** Conversation id — required for live LLM context loading. When
   *  null/undefined, the panel renders in degraded mode (chat works
   *  but Friday has no per-property knowledge). */
  conversationId?: string;
  /** The active Inbox draft (if any) for this conversation. When present,
   *  its body seeds the embedded DraftCard. Friday can revise/replace
   *  it via a structured draft update; operator can edit inline + Approve/Reject
   *  without leaving the panel. */
  currentDraft?: InboxDraft | null;
  /** Operator's in-progress compose text. Lets Friday refine work that
   *  has not been AI-drafted yet. If both are present, currentDraft
   *  wins because it is the state-machine-backed version. */
  initialBody?: string;
  /** Conversation context — drives prompt assembly + model selection
   *  in the FAD-native Consult backend. Defaults to 'compose'. */
  context?: ConsultContext;
  /** WhatsApp channel + window state for the inline timer in DraftCard. */
  channelLabel?: string;
  whatsappWindow?: WhatsAppWindow;

  // ── Action callbacks ── parent owns the network calls + 5s undo state.
  /** Approve the active Inbox draft (with optional inline edits). When
   *  there's no currentDraft, this should send the body as a manual
   *  compose (mode=manual). */
  onApproveDraft?: (body: string) => void;
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

  /** Text to submit as a consult query. Set by the parent's unified
   *  inbox-compose when the operator picks "Ask Friday" from the
   *  dropdown. FridayConsult fires submit() on prop change, then calls
   *  onPendingQueryConsumed so the parent can null it out. */
  pendingQuery?: string | null;
  onPendingQueryConsumed?: () => void;

  onRefreshThread?: () => void;
  onClose: () => void;

  /** Fired when the operator clicks "+ Create task" on a Friday-suggested
   *  task card inside the consult chat. Parent opens its CreateTaskDrawer
   *  prefilled with the suggestion. */
  onTaskSuggestionAccept?: (s: TaskSuggestion) => void;
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
  onSendManual,
  sendBusy = false,
  onBodyChanged,
  onSwitchToNote,
  pendingQuery,
  onPendingQueryConsumed,
  onRefreshThread,
  onClose,
  onTaskSuggestionAccept,
}: Props) {
  // The "working draft body" is what the operator will eventually send.
  // Seeded from the active Inbox draft if any, else the in-progress
  // compose text. Mutated by inline edits, by structured drafts from Friday,
  // and by quick-chip rewrites. Tracks the source of truth across the
  // whole chat session.
  const seed = currentDraft?.body ?? initialBody ?? '';
  const [workingBody, setWorkingBody] = useState<string>(seed);
  const onBodyChangedRef = useRef(onBodyChanged);
  useEffect(() => {
    onBodyChangedRef.current = onBodyChanged;
  }, [onBodyChanged]);
  // Reset when the active draft swaps (next conversation, or revise
  // landed a new draft id).
  useEffect(() => {
    setWorkingBody(currentDraft?.body ?? initialBody ?? '');
  }, [currentDraft?.id, currentDraft?.body, initialBody]);

  // Push body changes up to the parent so it stays in sync with the
  // compose box when the user closes consult.
  useEffect(() => {
    onBodyChangedRef.current?.(workingBody);
  }, [workingBody]);

  // Live confidence on the most recent consult turn. Surfaces in the
  // DraftCard header so the operator can see how confident Friday is
  // in their latest rewrite, separate from the original draft confidence
  // (which is on currentDraft.confidence).
  const [latestConfidence, setLatestConfidence] = useState<number | null>(
    confidenceRatio(currentDraft?.confidence),
  );
  useEffect(() => {
    setLatestConfidence(confidenceRatio(currentDraft?.confidence));
  }, [currentDraft?.id, currentDraft?.confidence]);
  const [msgs, setMsgs] = useState<ConsultMessage[]>([]);
  // Dead state: the internal compose form was removed; pendingQuery
  // from the parent's unified compose is the entry point now. Left as
  // a marker so future readers know where the input lived. The chips
  // call submit() directly.
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [missingKnowledge, setMissingKnowledge] = useState(false);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const transcriptStickToBottomRef = useRef(true);
  const activeRequestControllerRef = useRef<AbortController | null>(null);
  const manualCancelRef = useRef(false);
  const requestSeqRef = useRef(0);
  const sessionScopeKey = `${conversationId || 'none'}:${context}:${currentDraft?.id || 'manual'}`;
  const previousSessionScopeRef = useRef(sessionScopeKey);
  const defaultFullThread = context === 'draft_review' || String(conversationId || '').startsWith('web-');

  useEffect(() => () => {
    requestSeqRef.current += 1;
    manualCancelRef.current = true;
    activeRequestControllerRef.current?.abort();
    activeRequestControllerRef.current = null;
  }, []);

  // Past consult sessions for this conversation. Fetched on demand
  // when the operator opens the history panel. Endpoint already exists
  // (FAD-native /api/inbox/consult/history/:conversationId).
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pastSessions, setPastSessions] = useState<Array<{
    id: string;
    userName: string;
    messages: Array<{ role: string; text?: string; content?: string }>;
    summary?: string;
    createdAt: string;
    endedAt?: string;
  }> | null>(null);

  useEffect(() => {
    if (!conversationId) {
      setPastSessions(null);
      return;
    }
    let cancelled = false;
    setPastSessions(null);
    apiFetch(`/api/inbox/consult/history/${conversationId}`)
      .then((data) => {
        if (cancelled) return;
        const sessions = (data as {
          sessions?: Array<{
            id: string;
            userName: string;
            messages?: Array<{ role: string; text?: string; content?: string }>;
            summary?: string;
            createdAt: string;
            endedAt?: string;
          }>;
        })?.sessions || [];
        setPastSessions(sessions.map((s) => ({ ...s, messages: s.messages || [] })));
      })
      .catch(() => {
        if (!cancelled) setPastSessions([]);
      });
    return () => { cancelled = true; };
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    const params = new URLSearchParams({ conversationId, context });
    if (currentDraft?.id) params.set('draftId', currentDraft.id);
    let cancelled = false;
    apiFetch(`/api/inbox/consult/session/active?${params.toString()}`)
      .then((data) => {
        if (cancelled) return;
        const activeSessionId = (data as { sessionId?: string; session?: { id?: string } })?.sessionId
          || (data as { session?: { id?: string } })?.session?.id;
        if (activeSessionId) setSessionId(activeSessionId);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [conversationId, context, currentDraft?.id]);

  // Full-thread context toggle. The backend already loads the guest↔team
  // thread for Consult. Keep the toggle as an operator intent signal,
  // but do not paste the full thread into the user message; doing so
  // duplicates context, bloats prompts, and pollutes Consult history.
  const [useFullThread, setUseFullThread] = useState(defaultFullThread);

  // Operator-resizable FC height. Default = AUTO (wraps content up to
  // max-height). Once the operator drags the handle, the height
  // becomes explicit and persists in localStorage. To reset to auto,
  // double-click the handle. Per Ishant 2026-05-17.
  const FC_HEIGHT_STORAGE_KEY = 'fad:fc:height';
  const FC_HEIGHT_MIN = 120;
  const FC_HEIGHT_MAX = 700;
  const consultHeightMax = () => {
    if (typeof window === 'undefined') return FC_HEIGHT_MAX;
    if (window.innerWidth <= 768) {
      return Math.min(FC_HEIGHT_MAX, Math.max(260, Math.round(window.innerHeight * 0.46)));
    }
    return FC_HEIGHT_MAX;
  };
  // null = auto (wrap content); number = explicit pixel height.
  const [fcHeight, setFcHeight] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(FC_HEIGHT_STORAGE_KEY);
    if (!raw || raw === 'auto') return null;
    const parsed = Number(raw);
    const max = consultHeightMax();
    if (Number.isFinite(parsed) && parsed >= FC_HEIGHT_MIN) return Math.min(parsed, max);
    return null;
  });
  const dragStartRef = useRef<{ y: number; h: number } | null>(null);
  const onDragStart = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    // Use the current rendered height as the drag starting point —
    // grabs the auto-fit size when transitioning from auto → explicit.
    const currentEl = (e.currentTarget as HTMLElement).parentElement;
    const h = currentEl ? currentEl.getBoundingClientRect().height : (fcHeight ?? 280);
    dragStartRef.current = { y: e.clientY, h };
  };
  const onDragMove = (e: React.PointerEvent) => {
    const start = dragStartRef.current;
    if (!start) return;
    const next = Math.max(FC_HEIGHT_MIN, Math.min(consultHeightMax(), start.h - (e.clientY - start.y)));
    setFcHeight(next);
  };
  const onDragEnd = (e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    dragStartRef.current = null;
    try {
      window.localStorage.setItem(FC_HEIGHT_STORAGE_KEY, String(fcHeight ?? ''));
    } catch { /* ignore */ }
  };
  // Double-click the handle → reset to auto (wrap content).
  const onDragReset = () => {
    setFcHeight(null);
    try { window.localStorage.setItem(FC_HEIGHT_STORAGE_KEY, 'auto'); } catch { /* ignore */ }
  };

  const updateTranscriptStickiness = () => {
    const el = transcriptRef.current;
    if (!el) return;
    transcriptStickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
  };

  const scrollTranscriptToBottom = () => {
    requestAnimationFrame(() => {
      const latest = transcriptRef.current;
      if (latest) latest.scrollTop = latest.scrollHeight;
    });
  };

  // Auto-scroll only while the operator is already reading the bottom
  // or after they submit a new Ask Friday turn. This prevents the panel
  // from pulling them down while they scroll older Consult context.
  useEffect(() => {
    if (!transcriptStickToBottomRef.current) return;
    scrollTranscriptToBottom();
  }, [msgs.length, thinking, currentDraft?.id]);

  // Seed an initial 'draft' chat message when the conversation arrives
  // with an active Inbox draft. Drafts flow into the chat history like
  // tool-call results — when Friday revises, a NEW draft msg appends;
  // older ones scroll up as read-only history. Per Ishant 2026-05-17.
  const seededDraftIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentDraft?.id || !currentDraft.body) return;
    if (seededDraftIdRef.current === currentDraft.id) return;
    seededDraftIdRef.current = currentDraft.id;
    setMsgs((prev) => {
      const lastDraftRev = prev.reduce(
        (max, m) => (m.role === 'draft' && (m.draftRev ?? 0) > max ? m.draftRev! : max),
        0,
      );
      // Avoid double-seeding if the same draft body is already the
      // most recent draft msg (e.g. a duplicate render path).
      const lastDraft = [...prev].reverse().find((m) => m.role === 'draft');
      if (lastDraft && lastDraft.text === currentDraft.body) return prev;
      return [
        ...prev,
        {
          role: 'draft',
          text: currentDraft.body!,
          draftRev: lastDraftRev + 1,
          draftId: currentDraft.id,
        },
      ];
    });
  }, [currentDraft?.id, currentDraft?.body]);

  // ─── Quick chips ─────────────────────────────────────────────────────
  // Context-aware quick replies. Draft review keeps high-signal checks
  // only; broad tone chips created clutter and encouraged cosmetic turns.
  const chips = context === 'draft_review'
    ? ['Shorter', 'STR KB', 'Airbnb policy', 'Booking.com policy']
    : ['Summarise this thread', 'What does the guest want?', 'STR KB'];

  // When the parent's inbox-compose dropdown picks "Ask Friday", it
  // sets pendingQuery to the typed text. We submit it once + call back
  // so the parent can null it out (avoids a re-fire loop).
  useEffect(() => {
    if (!pendingQuery) return;
    if (thinking) return;
    const q = pendingQuery;
    onPendingQueryConsumed?.();
    void submit(q);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingQuery, thinking]);

  useEffect(() => {
    if (previousSessionScopeRef.current === sessionScopeKey) return;
    requestSeqRef.current += 1;
    manualCancelRef.current = true;
    activeRequestControllerRef.current?.abort();
    activeRequestControllerRef.current = null;
    setThinking(false);
    if (sessionId) {
      apiFetch('/api/inbox/consult/session/end', {
        method: 'POST',
        body: JSON.stringify({ sessionId, history: msgs, endReason: 'scope_changed' }),
      }).catch(() => {});
    }
    previousSessionScopeRef.current = sessionScopeKey;
    transcriptStickToBottomRef.current = true;
    setUseFullThread(defaultFullThread);
    setSessionId(undefined);
    seededDraftIdRef.current = currentDraft?.id || null;
    setMsgs(currentDraft?.id && currentDraft.body
      ? [{ role: 'draft', text: currentDraft.body, draftRev: 1, draftId: currentDraft.id }]
      : []);
    setMissingKnowledge(false);
    setError(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionScopeKey]);

  const submit = async (text: string, opts?: { fullThread?: boolean }) => {
    const q = text.trim();
    if (!q || thinking) return;

    transcriptStickToBottomRef.current = true;
    setError(null);
    setMsgs((m) => [...m, { role: 'user', text: q }]);
    setThinking(true);
    scrollTranscriptToBottom();

    const controller = new AbortController();
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    manualCancelRef.current = false;
    activeRequestControllerRef.current = controller;
    const timeoutId = globalThis.setTimeout(() => controller.abort(), CONSULT_CLIENT_TIMEOUT_MS);
    try {
      const body: Record<string, unknown> = {
        text: q,
        context,
      };
      if (conversationId) body.conversationId = conversationId;
      const requestFullThread = opts?.fullThread ?? useFullThread;
      if (requestFullThread) body.fullThread = true;
      if (currentDraft?.id) body.draftId = currentDraft.id;
      // Always send the CURRENT working body so Friday operates on the
      // operator's latest edits, not the stale original draft.
      if (workingBody) body.draftBody = workingBody;
      if (sessionId) body.sessionId = sessionId;

      const t0 = Date.now();
      const data = await apiFetch('/api/inbox/consult', {
        method: 'POST',
        body: JSON.stringify(body),
        signal: controller.signal,
      }) as ConsultResponse;
      if (requestSeq !== requestSeqRef.current) return;

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
          has_draft_update: Boolean(data?.draft_update) || Number(data?.metadata?.draftUpdateCount || 0) > 0,
          model: data?.model,
        });
      } catch { /* ignore */ }

      if (data?.sessionId && data.sessionId !== sessionId) setSessionId(data.sessionId);
      setMissingKnowledge(Boolean(data?.missingKnowledge));
      if (data?.metadata?.degraded) {
        setError('Friday timed out on the full context. Nothing changed; retry with a narrower ask.');
      } else if (data?.metadata?.fallbackUsed || data?.metadata?.modelTimeout) {
        setError(null);
      }
      const nextConfidence = confidenceRatio(data?.confidence);
      if (nextConfidence !== null) setLatestConfidence(nextConfidence);

      // Friday rewrote or composed draft(s) — push each one as a draft chat
      // message. Older cards can be restored into the active editor if the
      // operator wants to send a previous separate draft.
      const draftUpdates = normalizeConsultDraftUpdates(data);
      const latestDraftBody = draftUpdates[draftUpdates.length - 1]?.body || '';
      if (latestDraftBody.length > 0) {
        setWorkingBody(latestDraftBody);
      }

      const teachings = Array.isArray(data?.teaching_actions) ? data!.teaching_actions! : [];
      const taskSuggs = Array.isArray(data?.task_suggestions) ? data!.task_suggestions! : [];
      const aiMsg: ConsultMessage = {
        role: 'friday',
        text: (data?.response || '').trim(),
        draftUpdate: draftUpdates[0]?.body || data?.draft_update,
        teachingActions: teachings.length > 0 ? teachings : undefined,
        teachingStates: teachings.length > 0 ? teachings.map(() => 'pending' as const) : undefined,
        taskSuggestions: taskSuggs.length > 0 ? taskSuggs : undefined,
        taskSuggestionStates: taskSuggs.length > 0 ? taskSuggs.map(() => 'pending' as const) : undefined,
        source: data?.model,
      };
      setMsgs((m) => {
        const next = [...m];
        if (aiMsg.text.length > 0 || teachings.length > 0 || taskSuggs.length > 0) {
          next.push(aiMsg);
        }
        if (draftUpdates.length > 0) {
          const lastDraftRev = next.reduce(
            (max, x) => (x.role === 'draft' && (x.draftRev ?? 0) > max ? x.draftRev! : max),
            0,
          );
          draftUpdates.forEach((draft, index) => {
            next.push({
              role: 'draft',
              text: draft.body,
              draftRev: lastDraftRev + index + 1,
              draftRecipientLabel: draft.recipientLabel,
              draftChannel: draft.channel,
              draftTargetHint: draft.targetHint,
            });
          });
        }
        return next;
      });
      if (aiMsg.text.length === 0 && draftUpdates.length === 0 && teachings.length === 0) {
        setError('Friday went quiet — try rephrasing.');
      }
    } catch (e) {
      if (requestSeq !== requestSeqRef.current) return;
      if (isAbortError(e) && manualCancelRef.current) return;
      const msg = isAbortError(e)
        ? 'Friday is taking too long on this ask. Nothing changed; retry with a narrower question or turn off full thread.'
        : e instanceof Error ? e.message : 'Friday is unreachable right now.';
      if (msg.includes('draft_stale') || msg.includes('invalid_draft_state')) {
        onRefreshThread?.();
      }
      setError(msg);
    } finally {
      globalThis.clearTimeout(timeoutId);
      if (requestSeq === requestSeqRef.current) {
        if (activeRequestControllerRef.current === controller) activeRequestControllerRef.current = null;
        if (manualCancelRef.current) manualCancelRef.current = false;
        setThinking(false);
      }
    }
  };
  const cancelThinking = () => {
    if (!activeRequestControllerRef.current) return;
    requestSeqRef.current += 1;
    manualCancelRef.current = true;
    activeRequestControllerRef.current.abort();
    activeRequestControllerRef.current = null;
    setThinking(false);
  };

  // ─── Draft actions (inline within the consult panel) ─────────────────

  const submitApprove = () => {
    if (!workingBody.trim() || sendBusy) return;
    if (currentDraft && onApproveDraft) onApproveDraft(workingBody.trim());
    else if (onSendManual) onSendManual(workingBody.trim());
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

  // Operator confirmed a teaching proposal — close the loop with FAD.
  // The action types differ in how they hit the API:
  //   create        → POST /api/inbox/teachings
  //   update        → PATCH /api/inbox/teachings/:existingId
  //   flag_conflict → POST /api/inbox/teachings/:conflictingId/pause
  //                   then POST /api/inbox/teachings (the replacement)
  //
  // Optional `extraPropertyCodes` widens the scope from a single
  // property (proposed by Friday) to multiple — wired through to FAD
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

  // Task-suggestion handlers — operator clicks "+ Create task" on an
  // inline Friday-proposed task card. We mark the card as accepted (so
  // it collapses) and bubble the suggestion up so the parent inbox can
  // open its CreateTaskDrawer prefilled.
  const setTaskSuggestionState = (msgIndex: number, sIndex: number, state: 'accepted' | 'dismissed') => {
    setMsgs((current) =>
      current.map((msg, mi) =>
        mi === msgIndex && msg.taskSuggestionStates
          ? {
              ...msg,
              taskSuggestionStates: msg.taskSuggestionStates.map((s, si) => (si === sIndex ? state : s)),
            }
          : msg,
      ),
    );
  };
  const acceptTaskSuggestion = (msgIndex: number, sIndex: number, s: TaskSuggestion) => {
    if (onTaskSuggestionAccept) onTaskSuggestionAccept(s);
    setTaskSuggestionState(msgIndex, sIndex, 'accepted');
  };
  const dismissTaskSuggestion = (msgIndex: number, sIndex: number) => {
    setTaskSuggestionState(msgIndex, sIndex, 'dismissed');
  };

  // Load past consult sessions for this conversation when the history
  // panel opens (lazy — don't fetch until requested).
  const loadHistory = async () => {
    if (!conversationId || pastSessions !== null) {
      setHistoryOpen((v) => !v);
      return;
    }
    setHistoryOpen(true);
    try {
      const data = await apiFetch(`/api/inbox/consult/history/${conversationId}`) as {
        sessions?: Array<{
          id: string;
          userName: string;
          messages?: Array<{ role: string; text?: string; content?: string }>;
          summary?: string;
          createdAt: string;
          endedAt?: string;
        }>;
      };
      setPastSessions((data?.sessions || []).map((s) => ({ ...s, messages: s.messages || [] })));
    } catch (e) {
      setPastSessions([]);
      console.warn('[FC] history load failed:', (e as Error).message);
    }
  };

  const loadPastSessionIntoTranscript = (s: { messages?: Array<{ role: string; text?: string; content?: string }> }) => {
    // Read-only replay of a past session in the current transcript.
    // The operator can browse but new turns start a fresh sessionId.
    const restored: ConsultMessage[] = (s.messages || []).map((m) => ({
      role: m.role === 'user' ? 'user' : 'friday',
      text: String(m.text || m.content || ''),
    }));
    setMsgs(restored);
    setHistoryOpen(false);
  };

  const hasConsultContent = msgs.length > 0 || thinking || !!currentDraft || workingBody.trim().length > 0;

  // FC is compact-by-default: header + chips + Ask Friday input only.
  // Transcript + EmbeddedDraftCard appear conditionally below. Each
  // section sizes to its content; transcript caps with internal
  // scroll so the send button stays visible. Per Ishant + Mary
  // 2026-05-17.
  return (
    <div
      className={'friday-consult' + (fcHeight !== null ? ' is-explicit-height' : '')}
      style={{
        position: 'relative',
        zIndex: 5,
        // Auto mode: wrap content up to 50vh. Explicit mode: fixed
        // pixel height set by drag. Per Ishant 2026-05-17.
        ...(fcHeight !== null
          ? { height: Math.min(fcHeight, consultHeightMax()) }
          : { minHeight: hasConsultContent ? 'clamp(260px, 36vh, 460px)' : undefined, maxHeight: '60vh' }),
        flex: '0 0 auto',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-background-secondary)',
        boxShadow: '0 -8px 16px -8px rgba(0, 0, 0, 0.08)',
      }}
    >
      {/* Resize handle — drag up to grow, drag down to shrink, DOUBLE-
          CLICK to reset to auto-fit content. Auto by default. */}
      <div
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        onDoubleClick={onDragReset}
        title={fcHeight === null ? 'Auto-fit · drag to resize, double-click resets' : 'Drag to resize, double-click resets to auto-fit'}
        style={{
          height: 8,
          flex: '0 0 auto',
          cursor: 'ns-resize',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          touchAction: 'none',
        }}
      >
        <div
          style={{
            width: 28,
            height: 2,
            background: 'var(--color-border-secondary)',
            borderRadius: 2,
            opacity: fcHeight === null ? 0.5 : 1,
          }}
        />
      </div>
      {/* Header removed 2026-05-17 per Ishant — 'Friday Consult' is
          a developer concept, not something operators need to see.
          History + missing-KB warning move inline into the chips row
          below. Close button removed entirely (it was a noop since FC
          is always-open). */}
      {historyOpen && (
        <div
          style={{
            maxHeight: '40vh',
            overflowY: 'auto',
            padding: '8px 12px',
            borderBottom: '0.5px solid var(--color-border-tertiary)',
            background: 'var(--color-background-secondary)',
          }}
        >
          {pastSessions === null ? (
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Loading…</div>
          ) : pastSessions.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              No previous sessions on this conversation.
            </div>
          ) : (
            pastSessions.map((s) => {
              const firstUser = s.messages?.find((m) => m.role === 'user');
              const preview = String(firstUser?.text || firstUser?.content || '(empty)').slice(0, 80);
              return (
                <button
                  key={s.id}
                  onClick={() => loadPastSessionIntoTranscript(s)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 10px',
                    marginBottom: 4,
                    background: 'var(--color-background-primary)',
                    border: '0.5px solid var(--color-border-tertiary)',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    fontSize: 12,
                    color: 'var(--color-text-primary)',
                  }}
                >
                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>
                    {new Date(s.createdAt).toLocaleString('en-GB')} · {s.userName || 'unknown'}
                    {' · '}{s.messages?.length || 0} turn{(s.messages?.length || 0) === 1 ? '' : 's'}
                  </div>
                  <div style={{ lineHeight: 1.3 }}>{preview}{preview.length === 80 ? '…' : ''}</div>
                </button>
              );
            })
          )}
        </div>
      )}
      {/* Transcript — chat bubbles + thinking + error + draft card,
          all in one scrolling region. Drafts render INLINE in the chat
          so they're part of the flow (per Ishant 2026-05-17 — Friday's
          drafts should look like Friday's other messages, not a sticky
          panel). Transcript caps at 30vh; auto-scroll keeps the most
          recent item (draft or message) in view, so the Approve & send
          button stays visible without going below the fold. Capacity:
          long chats scroll; the Ask Friday input below the transcript
          is always visible because it lives outside this scroller. */}
      {/* Transcript always renders to fill the operator-resized FC
          height. Empty until there's chat / draft activity. */}
      {true && (
        <div
          className="friday-consult-body"
          ref={transcriptRef}
          onScroll={updateTranscriptStickiness}
          style={{
            flex: '1 1 auto',
            minHeight: fcHeight !== null ? 0 : hasConsultContent ? 'clamp(160px, 24vh, 300px)' : 0,
            maxHeight: 'none',
          }}
        >
          {(() => {
            // Latest draft msg is the editable one; older drafts are
            // read-only history. Compute the index once so MessageRow
            // doesn't have to scan the array per row.
            let latestDraftIndex = -1;
            for (let i = msgs.length - 1; i >= 0; i--) {
              if (msgs[i].role === 'draft') { latestDraftIndex = i; break; }
            }
            return msgs.map((m, i) => (
              <MessageRow
                key={i}
                m={m}
                msgIndex={i}
                isLatestDraft={i === latestDraftIndex}
                workingBody={workingBody}
                setWorkingBody={setWorkingBody}
                liveConfidence={latestConfidence}
                channelLabel={channelLabel}
                whatsappWindow={whatsappWindow}
                sendBusy={sendBusy}
                onApprove={submitApprove}
                onChipClick={submit}
                onConfirmTeaching={confirmTeaching}
                onDismissTeaching={dismissTeaching}
                onAcceptTaskSuggestion={acceptTaskSuggestion}
                onDismissTaskSuggestion={dismissTaskSuggestion}
              />
            ));
          })()}
          {thinking && <ThinkingRow />}
          {error && (
            <div
              style={{
                padding: '6px 10px',
                margin: '4px 12px',
                fontSize: 11,
                color: 'var(--color-text-danger)',
                background: 'var(--color-background-danger-soft, rgba(220, 38, 38, 0.08))',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {error}
            </div>
          )}
          {/* Action chips trail the last item in the transcript so they
              feel contextually tied to whatever Friday just did (or to
              the top if conversation is empty). Per Ishant 2026-05-17. */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 4,
              padding: '4px 12px 6px',
            }}
          >
            {chips.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => submit(CHIP_INSTRUCTIONS[c] || c, {
                  fullThread: ['Summarise this thread', 'What does the guest want?', 'STR KB'].includes(c),
                })}
                disabled={thinking}
                style={{
                  padding: '3px 7px',
                  fontSize: 10,
                  color: 'var(--color-text-secondary)',
                  background: 'transparent',
                  border: '0.5px solid var(--color-border-tertiary)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                }}
              >
                {c}
              </button>
            ))}
            <span style={{ flex: 1 }} />
            {missingKnowledge && (
              <span
                style={{
                  padding: '2px 6px',
                  fontSize: 10,
                  color: 'var(--color-text-warning)',
                  background: 'var(--color-background-warning-soft, rgba(245, 158, 11, 0.08))',
                  borderRadius: 'var(--radius-sm)',
                }}
                title="No property knowledge file loaded for this property"
              >
                ⚠ no KB
              </span>
            )}
            <button
              type="button"
              onClick={loadHistory}
              title="Past sessions on this conversation"
              style={{
                padding: '3px 7px',
                fontSize: 10,
                color: 'var(--color-text-tertiary)',
                background: 'transparent',
                border: '0.5px solid var(--color-border-tertiary)',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
              }}
            >
              <IconRefresh size={9} /> History
            </button>
          </div>
        </div>
      )}
      {/* Ask Friday input — restored 2026-05-17 per Ishant: FridayConsult
          is the single compose surface. The reply body lives in the
          EmbeddedDraftCard above; THIS input is for chatting with Friday
          (drafts, polish, KB lookups, teaching). Cmd/Ctrl+Enter submits;
          Enter and Shift+Enter create new lines. */}
      <AskFridayInput
        onSubmit={(q) => submit(q)}
        disabled={sendBusy}
        busy={thinking}
        onCancel={cancelThinking}
        threadGuest={threadScope}
        useFullThread={useFullThread}
        onToggleFullThread={() => setUseFullThread((v) => !v)}
      />
    </div>
  );
}

function AskFridayInput({
  onSubmit,
  disabled,
  busy,
  onCancel,
  threadGuest,
  useFullThread,
  onToggleFullThread,
}: {
  onSubmit: (q: string) => void;
  disabled: boolean;
  busy: boolean;
  onCancel: () => void;
  threadGuest: string;
  useFullThread: boolean;
  onToggleFullThread: () => void;
}) {
  const [text, setText] = useState('');
  const submit = () => {
    const q = text.trim();
    if (!q || disabled || busy) return;
    setText('');
    onSubmit(q);
  };
  return (
    <div
      className="friday-consult-askbar"
      style={{
        padding: '6px 10px 8px',
        borderTop: '0.5px solid var(--color-border-tertiary)',
        background: 'var(--color-background-primary)',
        display: 'flex',
        gap: 4,
        alignItems: 'center',
        width: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        className="friday-consult-context-toggle"
        onClick={onToggleFullThread}
        title={useFullThread
          ? 'On — Friday loads the full thread for your next question. Click to turn off.'
          : 'Off — Friday loads the recent thread context. Click to include the full thread.'}
        style={{
          padding: '5px 7px',
          fontSize: 10,
          color: useFullThread ? '#fff' : 'var(--color-text-secondary)',
          background: useFullThread ? 'var(--color-brand-accent)' : 'transparent',
          border: '0.5px solid ' + (useFullThread ? 'var(--color-brand-accent)' : 'var(--color-border-tertiary)'),
          borderRadius: 'var(--radius-sm)',
          cursor: 'pointer',
          flex: '0 0 auto',
          whiteSpace: 'nowrap',
        }}
      >
        {useFullThread ? '✓ Full' : '∞'}
      </button>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={`Ask Friday about ${threadGuest}…`}
        disabled={disabled || busy}
        rows={2}
        style={{
          flex: 1,
          minWidth: 0,
          width: '100%',
          boxSizing: 'border-box',
          minHeight: 44,
          maxHeight: 96,
          padding: '7px 9px',
          fontSize: 12,
          lineHeight: 1.35,
          fontFamily: 'inherit',
          color: 'var(--color-text-primary)',
          background: 'var(--color-background-secondary)',
          border: '0.5px solid var(--color-border-tertiary)',
          borderRadius: 'var(--radius-sm)',
          outline: 'none',
          resize: 'none',
        }}
      />
      <button
        type="button"
        className="friday-consult-send-button"
        onClick={busy ? onCancel : submit}
        disabled={disabled || (!busy && !text.trim())}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '6px 10px',
          fontSize: 11,
          fontWeight: 600,
          color: '#fff',
          background: busy ? 'var(--color-text-danger)' : 'var(--color-brand-accent)',
          border: 'none',
          borderRadius: 'var(--radius-sm)',
          cursor: disabled || (!busy && !text.trim()) ? 'not-allowed' : 'pointer',
          opacity: disabled || (!busy && !text.trim()) ? 0.5 : 1,
          flex: '0 0 auto',
          whiteSpace: 'nowrap',
        }}
      >
        {busy ? <IconClose size={12} /> : <IconSend size={12} />}
        <span className="friday-consult-send-label">{busy ? 'Stop' : 'Ask'}</span>
      </button>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────

function MessageRow({
  m,
  msgIndex,
  isLatestDraft,
  workingBody,
  setWorkingBody,
  liveConfidence,
  channelLabel,
  whatsappWindow,
  sendBusy,
  onApprove,
  onChipClick: _onChipClick,
  onConfirmTeaching,
  onDismissTeaching,
  onAcceptTaskSuggestion,
  onDismissTaskSuggestion,
}: {
  m: ConsultMessage;
  msgIndex: number;
  isLatestDraft: boolean;
  workingBody: string;
  setWorkingBody: (s: string) => void;
  liveConfidence: number | null;
  channelLabel?: string;
  whatsappWindow?: WhatsAppWindow;
  sendBusy: boolean;
  onApprove: () => void;
  onChipClick: (text: string) => void;
  onConfirmTeaching: (msgIndex: number, actionIndex: number, ta: TeachingAction, extraPropertyCodes?: string[]) => void;
  onDismissTeaching: (msgIndex: number, actionIndex: number) => void;
  onAcceptTaskSuggestion: (msgIndex: number, suggestionIndex: number, s: TaskSuggestion) => void;
  onDismissTaskSuggestion: (msgIndex: number, suggestionIndex: number) => void;
}) {
  // Draft-role messages render very differently from chat:
  //   - Latest = an editable card with Approve & send
  //   - Older = read-only "Friday's draft (rev N)" surface, accent-soft
  if (m.role === 'draft') {
    if (isLatestDraft) {
      // The active draft — operator can edit + send. Body comes from
      // workingBody (live), not m.text (frozen snapshot).
      return (
        <div style={{ margin: '8px 12px', minWidth: 0, maxWidth: '100%' }}>
          <DraftMessageActive
            workingBody={workingBody}
            setWorkingBody={setWorkingBody}
            revisionNumber={m.draftRev}
            recipientLabel={m.draftRecipientLabel}
            draftChannel={m.draftChannel}
            liveConfidence={liveConfidence}
            channelLabel={channelLabel}
            whatsappWindow={whatsappWindow}
            sendBusy={sendBusy}
            onApprove={onApprove}
            isPersistedDraft={!!m.draftId}
          />
        </div>
      );
    }
    // Older draft — read-only, frozen.
    return (
      <div style={{ margin: '6px 12px', minWidth: 0, maxWidth: '100%' }}>
        <DraftMessageHistory
          body={m.text}
          revisionNumber={m.draftRev}
          recipientLabel={m.draftRecipientLabel}
          channel={m.draftChannel}
          onUseDraft={() => setWorkingBody(m.text)}
        />
      </div>
    );
  }

  const isUser = m.role === 'user';
  return (
    <div style={{ margin: '4px 12px', minWidth: 0, maxWidth: '100%' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: isUser ? 'flex-end' : 'flex-start',
        }}
      >
        <div
          style={{
            maxWidth: '85%',
            minWidth: 0,
            padding: '5px 9px',
            fontSize: 12,
            lineHeight: 1.4,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            color: 'var(--color-text-primary)',
            background: isUser
              ? 'var(--color-brand-accent)'
              : 'var(--color-background-secondary)',
            borderRadius: 'var(--radius-md)',
            ...(isUser ? { color: '#fff' } : {}),
          }}
        >
          {m.text}
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
              ↓ New draft below
            </div>
          )}
        </div>
      </div>
      {m.teachingActions && m.teachingActions.map((ta, ai) => (
        <TeachingCard
          key={ai}
          action={ta}
          state={(m.teachingStates && m.teachingStates[ai]) || 'pending'}
          onConfirm={(extraPropertyCodes) => onConfirmTeaching(msgIndex, ai, ta, extraPropertyCodes)}
          onDismiss={() => onDismissTeaching(msgIndex, ai)}
        />
      ))}
      {m.taskSuggestions && m.taskSuggestions.map((ts, ti) => (
        <div key={`task-${ti}`} style={{ maxWidth: '85%', minWidth: 0, marginTop: 6 }}>
          <TaskSuggestionCard
            suggestion={ts}
            dismissed={(m.taskSuggestionStates && m.taskSuggestionStates[ti]) !== 'pending'}
            onAccept={(s) => onAcceptTaskSuggestion(msgIndex, ti, s)}
            onDismiss={() => onDismissTaskSuggestion(msgIndex, ti)}
          />
        </div>
      ))}
    </div>
  );
}

// Read-only render of a past draft revision. Uses the FAD design
// system (.fcard / .fcard-kicker / .fcard-block) so the look matches
// the rest of the dashboard rather than the legacy GMS-style heavy-
// accent treatment. Per Ishant 2026-05-17.
function DraftMessageHistory({
  body,
  revisionNumber,
  recipientLabel,
  channel,
  onUseDraft,
}: {
  body: string;
  revisionNumber?: number;
  recipientLabel?: string | null;
  channel?: string | null;
  onUseDraft?: () => void;
}) {
  return (
    <div
      className="friday-draft-card friday-draft-card-history"
      style={{
        maxWidth: '85%',
        minWidth: 0,
        padding: '7px 8px',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--color-background-primary)',
        whiteSpace: 'pre-wrap',
        lineHeight: 1.45,
        color: 'var(--color-text-secondary)',
      }}
    >
      <div style={{ marginBottom: 5, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0 }}>
          Draft{typeof revisionNumber === 'number' ? ` ${revisionNumber}` : ''} · previous
        </span>
        {recipientLabel && <span className="friday-draft-chip">{recipientLabel}</span>}
        {channel && <span className="friday-draft-chip">{channel}</span>}
        {onUseDraft && (
          <button type="button" className="friday-draft-use-btn" onClick={onUseDraft}>
            Use
          </button>
        )}
      </div>
      {body}
    </div>
  );
}

// Active (latest) draft card — editable textarea + Approve & send.
// Replaces the previous EmbeddedDraftCard standalone surface;
// now rendered inline as a chat message so revisions stack like
// tool-call results in conversational order.
function DraftMessageActive({
  workingBody,
  setWorkingBody,
  revisionNumber,
  recipientLabel,
  draftChannel,
  liveConfidence,
  channelLabel,
  whatsappWindow,
  sendBusy,
  onApprove,
  isPersistedDraft,
}: {
  workingBody: string;
  setWorkingBody: (s: string) => void;
  revisionNumber?: number;
  recipientLabel?: string | null;
  draftChannel?: string | null;
  liveConfidence?: number | null;
  channelLabel?: string;
  whatsappWindow?: WhatsAppWindow;
  sendBusy: boolean;
  onApprove: () => void;
  isPersistedDraft: boolean;
}) {
  const tier = confidenceTier(liveConfidence ?? undefined);
  const confLabel = typeof liveConfidence === 'number' ? `${Math.round(liveConfidence * 100)}%` : null;
  const confColor: Record<'high' | 'mid' | 'low', string> = {
    high: 'var(--color-text-success)',
    mid: 'var(--color-text-warning)',
    low: 'var(--color-text-danger)',
  };
  const sendDisabled = sendBusy || !workingBody.trim();
  const showWaPill = channelLabel?.toLowerCase().includes('whatsapp') && whatsappWindow;
  const waState = useWhatsAppWindow(whatsappWindow);
  const waOpen = waState.open;
  const waLeft = waState.expiresInMinutes;
  return (
    <div className="friday-draft-card friday-draft-card-active" style={{ padding: '6px 7px', minWidth: 0, maxWidth: '100%' }}>
      <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--color-brand-accent)' }}>
          <IconSparkle size={10} /> Draft {typeof revisionNumber === 'number' ? `· rev ${revisionNumber}` : ''}
        </span>
        {recipientLabel && <span className="friday-draft-chip">{recipientLabel}</span>}
        {draftChannel && <span className="friday-draft-chip">{draftChannel}</span>}
        {confLabel && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: 'var(--radius-sm)',
              background: confColor[tier],
              color: '#fff',
              letterSpacing: 0,
              textTransform: 'none',
            }}
            title="Friday's confidence on this draft"
          >
            {confLabel}
          </span>
        )}
        {showWaPill && (
          <span
            style={{
              fontSize: 10,
              padding: '1px 6px',
              borderRadius: 'var(--radius-sm)',
              background: waOpen ? 'rgba(16, 185, 129, 0.12)' : 'rgba(220, 38, 38, 0.12)',
              color: waOpen ? 'var(--color-text-success)' : 'var(--color-text-danger)',
              fontWeight: 600,
              letterSpacing: 0,
              textTransform: 'none',
            }}
            title="WhatsApp 24-hour reply window"
          >
            {waOpen
              ? `WA · ${typeof waLeft === 'number' ? `${Math.floor(waLeft / 60)}h ${waLeft % 60}m left` : 'open'}`
              : 'WA closed — use template'}
          </span>
        )}
      </div>
      <textarea
        value={workingBody}
        onChange={(e) => setWorkingBody(e.target.value)}
        placeholder="Draft body…"
        rows={2}
        style={{
          width: '100%',
          minHeight: 48,
          maxHeight: 124,
          padding: 5,
          fontSize: 12,
          lineHeight: 1.4,
          fontFamily: 'inherit',
          color: 'var(--color-text-primary)',
          background: 'var(--color-background-primary)',
          border: '0.5px solid var(--color-border-tertiary)',
          borderRadius: 'var(--radius-sm)',
          resize: 'vertical',
          boxSizing: 'border-box',
        }}
        disabled={sendBusy}
      />
      <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onApprove}
          disabled={sendDisabled}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '5px 10px',
            fontSize: 11,
            fontWeight: 600,
            color: '#fff',
            background: 'var(--color-brand-accent)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            cursor: sendDisabled ? 'not-allowed' : 'pointer',
            opacity: sendDisabled ? 0.5 : 1,
          }}
          title="Approve and send this draft"
        >
          <IconSend size={11} /> {isPersistedDraft ? 'Approve & send' : 'Send'}
        </button>
      </div>
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
  whatsappWindow?: WhatsAppWindow;
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
  // confidence wins (it's the freshest). Falls back to original draft
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
  const waState = useWhatsAppWindow(whatsappWindow);
  const waOpen = waState.open;
  const waLeft = waState.expiresInMinutes;

  return (
    <div
      style={{
        margin: '4px 8px 6px',
        padding: 8,
        background: 'var(--color-background-primary)',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--radius-sm)',
      }}
    >
      {/* Header: source label + confidence + revision number + WA timer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 0,
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
            title="Friday's confidence on this draft. Live consult turns supersede the original draft score."
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

      {/* Editable body. Sending to the guest stays a deliberate click;
          Cmd/Ctrl+Enter belongs to the Ask Friday input below. */}
      <textarea
        value={workingBody}
        onChange={(e) => setWorkingBody(e.target.value)}
        placeholder="Draft will appear here when Friday writes one, or type your own…"
        rows={3}
        style={{
          width: '100%',
          minHeight: 58,
          maxHeight: 126,
          padding: 7,
          fontSize: 12,
          lineHeight: 1.42,
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
          <span style={{ flex: 1 }} />
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
  const [extraPropertyCodes, setExtraPropertyCodes] = useState<string[]>([]);

  const isConflict = action.action === 'flag_conflict';
  const accent = isConflict ? 'var(--color-text-warning)' : 'var(--color-brand-accent)';

  const propertyOptions = useMemo(() => (
    PROPERTIES
      .filter((p) => p.lifecycleStatus === 'live')
      .map((p) => ({ code: p.code.toUpperCase(), label: `${p.code} · ${p.name}`, zone: p.zone }))
      .sort((a, b) => a.code.localeCompare(b.code))
  ), []);
  const northCodes = useMemo(() => propertyOptions.filter((p) => p.zone === 'north').map((p) => p.code), [propertyOptions]);
  const westCodes = useMemo(() => propertyOptions.filter((p) => p.zone === 'west').map((p) => p.code), [propertyOptions]);
  const allPropertyCodes = useMemo(() => propertyOptions.map((p) => p.code), [propertyOptions]);
  const proposedCode = action.propertyCode?.toUpperCase() || null;
  const selectedExtras = useMemo(() => new Set(extraPropertyCodes), [extraPropertyCodes]);

  const title = isConflict
    ? 'Conflicts with an existing rule'
    : action.action === 'update'
    ? 'Friday wants to refine'
    : 'Friday wants to remember';

  const scopeLine = action.scope === 'property' && action.propertyCode
    ? `${action.propertyCode}`
    : 'all properties';

  const applyRegion = (codes: string[]) => {
    const merged = new Set([...extraPropertyCodes, ...codes.map((code) => code.toUpperCase())]);
    if (proposedCode) merged.delete(proposedCode);
    setExtraPropertyCodes(Array.from(merged).sort());
    setPickerOpen(true);
  };
  const addProperty = (code: string) => {
    const normalized = code.toUpperCase();
    if (!normalized || normalized === proposedCode) return;
    setExtraPropertyCodes((current) => Array.from(new Set([...current, normalized])).sort());
    setPickerOpen(true);
  };
  const removeProperty = (code: string) => {
    setExtraPropertyCodes((current) => current.filter((c) => c !== code));
  };

  if (state === 'dismissed') return null;

  return (
    <div
      className="fcard"
      style={{ marginTop: 4, padding: '8px 10px', fontSize: 12, color: 'var(--color-text-primary)' }}
    >
      <div
        className="fcard-kicker"
        style={{ marginBottom: 6, color: accent, display: 'flex', alignItems: 'center', gap: 6 }}
      >
        {isConflict ? '⚠' : '✦'} {title}
      </div>
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.4,
          marginBottom: 6,
          padding: '6px 8px',
          background: 'var(--color-background-primary)',
          border: '0.5px solid var(--color-border-tertiary)',
          borderRadius: 'var(--radius-sm)',
        }}
      >
        “{action.instruction}”
      </div>
      <div
        style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}
      >
        <span>Apply to:</span>
        <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
          {scopeLine}
          {extraPropertyCodes.length > 0 ? ` + ${extraPropertyCodes.length} more` : ''}
        </span>
        {state !== 'saving' && state !== 'saved' && (
          <>
            <button
              type="button"
              onClick={() => applyRegion(northCodes)}
              style={{ padding: '2px 6px', fontSize: 10, background: 'transparent', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
            >
              + All North
            </button>
            <button
              type="button"
              onClick={() => applyRegion(westCodes)}
              style={{ padding: '2px 6px', fontSize: 10, background: 'transparent', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
            >
              + All West
            </button>
            <button
              type="button"
              onClick={() => applyRegion(allPropertyCodes)}
              style={{ padding: '2px 6px', fontSize: 10, background: 'transparent', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
            >
              + All properties
            </button>
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              style={{ padding: '2px 6px', fontSize: 10, background: 'transparent', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
            >
              {pickerOpen ? 'Hide list' : '+ Custom'}
            </button>
          </>
        )}
      </div>
      {pickerOpen && state !== 'saving' && state !== 'saved' && (
        <div
          style={{
            display: 'grid',
            gap: 6,
            marginBottom: 6,
          }}
        >
          <select
            value=""
            onChange={(e) => {
              addProperty(e.target.value);
              e.currentTarget.value = '';
            }}
            style={{
              width: '100%',
              padding: '5px 7px',
              fontSize: 11,
              color: 'var(--color-text-primary)',
              background: 'var(--color-background-primary)',
              border: '0.5px solid var(--color-border-secondary)',
              borderRadius: 'var(--radius-sm)',
              boxSizing: 'border-box',
            }}
          >
            <option value="">Add an active property…</option>
            {propertyOptions
              .filter((p) => p.code !== proposedCode && !selectedExtras.has(p.code))
              .map((p) => (
                <option key={p.code} value={p.code}>{p.label}</option>
              ))}
          </select>
          {extraPropertyCodes.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {extraPropertyCodes.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => removeProperty(code)}
                  title={`Remove ${code}`}
                  style={{
                    padding: '2px 7px',
                    fontSize: 10,
                    borderRadius: 999,
                    border: '0.5px solid var(--color-border-tertiary)',
                    background: 'var(--color-background-secondary)',
                    color: 'var(--color-text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  {code} x
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {action.reason && (
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 6, fontStyle: 'italic' }}>
          {action.reason}
        </div>
      )}
      {state === 'saved' ? (
        <div style={{ fontSize: 11, color: 'var(--color-text-success)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <IconCheck size={10} /> Saved — Friday will use this in future drafts
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            onClick={() => {
              onConfirm(extraPropertyCodes.length > 0 ? extraPropertyCodes : undefined);
            }}
            disabled={state === 'saving'}
            style={{
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 600,
              color: '#fff',
              background: accent,
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
            }}
          >
            {state === 'saving' ? 'Saving…' : (isConflict ? 'Replace' : 'Approve & remember')}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            disabled={state === 'saving'}
            style={{
              padding: '4px 10px',
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
