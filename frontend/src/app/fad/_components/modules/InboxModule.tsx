'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  INBOX_INTERNAL_NOTES,
  INBOX_THREADS,
  type InboxEntity,
  type InboxMessage,
  type InboxThread,
  type InternalNote,
  type StayStatus,
} from '../../_data/fixtures';
import { useLiveConversations, useThreadDetail } from '../../_data/inboxClient';
import {
  approveDraft,
  rejectDraft,
  reviseDraft,
  sendCompose,
  isReviewReady,
  markRead,
} from '../../_data/draftsClient';
import { DraftPanel } from './inbox/DraftPanel';
import { SendPreflightModal } from './inbox/SendPreflightModal';
import { apiFetch } from '../../../../components/types';

// Human-readable relative time. Used in list rows + message bubbles.
// Returns "now", "5m", "2h", "yesterday", "Mar 14" depending on age.
function formatRelative(iso: string): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diffMs = Date.now() - t;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'yesterday';
  if (diffD < 7) return `${diffD}d`;
  return new Date(t).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}
import { TASK_USERS, TASK_USER_BY_ID } from '../../_data/tasks';
import { TEAM_CHANNELS, TEAM_DMS } from '../../_data/teamInbox';
import {
  RESERVATION_BY_ID,
  CHANNEL_LABEL,
  STATUS_LABEL as RES_STATUS_LABEL,
  formatStayWindow,
  type Reservation,
} from '../../_data/reservations';
import { useCurrentUserId } from '../usePermissions';
import { fireToast } from '../Toaster';
import { FridayConsult } from '../FridayConsult';
import {
  IconAI,
  IconBell,
  IconCheck,
  IconChevron,
  IconClock,
  IconFilter,
  IconGlobe,
  IconInbox,
  IconMail,
  IconPaperclip,
  IconPin,
  IconPlus,
  IconSend,
  IconSparkle,
  IconUsers,
} from '../icons';
import { ModuleHeader } from '../ModuleHeader';
import { useCanAccess } from '../usePermissions';
import { TeamInbox } from './inbox/TeamInbox';

interface Props {
  onAskFriday: () => void;
}

export function InboxModule({ onAskFriday }: Props) {
  const canSeeGuest = useCanAccess('inbox_guest', 'read');
  const canSeeTeam = useCanAccess('inbox_team', 'read');

  type EntityChip = 'all' | InboxEntity | 'team';
  const [entityFilter, setEntityFilter] = useState<EntityChip>(() => (canSeeGuest ? 'all' : 'team'));

  // Auto-switch if current chip becomes inaccessible.
  useEffect(() => {
    if (!canSeeGuest && entityFilter !== 'team' && canSeeTeam) setEntityFilter('team');
    if (!canSeeTeam && entityFilter === 'team' && canSeeGuest) setEntityFilter('all');
  }, [canSeeGuest, canSeeTeam, entityFilter]);

  // Filter sheet state — replaces the old All/Unread/Review/Open/Done tabs.
  type TriageFilter = 'all' | 'unread' | 'review' | 'open' | 'done';
  type StayFilter = 'all' | StayStatus;
  const [triageFilter, setTriageFilter] = useState<TriageFilter>('all');
  const [stayFilter, setStayFilter] = useState<StayFilter>('all');
  const [mentionsOnly, setMentionsOnly] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  const [selected, setSelected] = useState('t1');
  // Compose mode — 'reply' goes to the guest, 'note' is internal-only.
  const [composeMode, setComposeMode] = useState<'reply' | 'note'>('reply');
  const [noteDraft, setNoteDraft] = useState('');
  const [noteMentions, setNoteMentions] = useState<string[]>([]);
  const [, setNotesRev] = useState(0);
  const currentUserId = useCurrentUserId();
  // Friday Consult is now the default reply surface — every inbound
   // Default-COLLAPSED per Ishant 2026-05-18 ("space for the actual
   // text conversation"). Auto-opens when an AI draft lands so the
   // operator immediately sees the draft to review. The unified
   // compose at the bottom stays visible regardless — no duplicate
   // "Write a reply" surface flickers in/out when consult toggles.
  // FridayConsult is now the SOLE compose surface. Always open when a
  // thread is selected (no toggle). Decision 2026-05-17.
  const consultOpen = true;
  const setConsultOpen = (_v: boolean | ((v: boolean) => boolean)) => { /* noop */ };
  // Track which draft id we've auto-opened consult for, so we don't
  // fight the operator after they explicitly close — only auto-opens
  // again when a NEW draft replaces the current one (revision).
  const autoOpenedDraftRef = useRef<string | null>(null);
  // "Ask Friday" from the SendByMenu drops the typed text here, which
  // FridayConsult reads via its pendingQuery prop, submits, then calls
  // onPendingQueryConsumed to clear. Survives a brief gap when consult
  // wasn't mounted yet (we setConsultOpen(true) at the same time).
  const [pendingConsultQuery, setPendingConsultQuery] = useState<string | null>(null);
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);
  const [listCollapsed, setListCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [aiToolbarExpanded, setAiToolbarExpanded] = useState(false);
  const [summaryCollapsed, setSummaryCollapsed] = useState(false);
  const [composeCollapsed, setComposeCollapsed] = useState(false);
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);

  useEffect(() => {
    setListCollapsed(localStorage.getItem('fad:inbox:list') === '1');
    setRightCollapsed(localStorage.getItem('fad:inbox:right') === '1');
    const mobile = window.innerWidth <= 768;
    setIsMobile(mobile);
    // On mobile, default collapse chatter-heavy panels
    if (mobile) {
      setSummaryCollapsed(true);
      setComposeCollapsed(true);
    }
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    setHydrated(true);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Switching entity (Team ↔ Guest/Owner/Vendor/All) resets the mobile slide-over
  // so the user lands on the list of the new entity, not deep in a stale thread.
  useEffect(() => {
    setMobileThreadOpen(false);
  }, [entityFilter]);

  useEffect(() => {
    if (hydrated) localStorage.setItem('fad:inbox:list', listCollapsed ? '1' : '0');
  }, [listCollapsed, hydrated]);
  useEffect(() => {
    if (hydrated) localStorage.setItem('fad:inbox:right', rightCollapsed ? '1' : '0');
  }, [rightCollapsed, hydrated]);
  const [sendMenuOpen, setSendMenuOpen] = useState(false);
  const [summaryOn, setSummaryOn] = useState(true);
  const [translateOn, setTranslateOn] = useState(false);

  // Live GMS data via FAD backend proxy; falls back to fixture INBOX_THREADS
  // during initial load or on backend failure so the inbox never blanks out.
  const { threads: liveThreads, loading: inboxLoading, error: inboxError, refetch: refetchConversations } = useLiveConversations();
  const sourceThreads = liveThreads ?? INBOX_THREADS;

  const counts = useMemo(() => {
    const byEntity: Record<string, number> = { guest: 0, owner: 0, vendor: 0, all: sourceThreads.length };
    for (const t of sourceThreads) {
      byEntity[t.entity] = (byEntity[t.entity] || 0) + 1;
    }
    return { byEntity };
  }, [sourceThreads]);

  const filtered = sourceThreads.filter((t) => {
    if (entityFilter !== 'all' && entityFilter !== 'team' && t.entity !== entityFilter) return false;
    if (triageFilter === 'unread' && !t.unread) return false;
    // 'review' now means "an AI draft is awaiting my approval" — the
    // operational definition operators actually want. GMS's
    // triageStatus 'review' (snoozed) is rare and was confusingly
    // overloading the same chip name. Match on latestDraftState
    // directly (data lands on every list row via the API).
    if (triageFilter === 'review' && t.latestDraftState !== 'draft_ready' && t.latestDraftState !== 'under_review') return false;
    if (triageFilter === 'open' && t.triageStatus !== 'open') return false;
    if (triageFilter === 'done' && t.triageStatus !== 'done') return false;
    if (stayFilter !== 'all' && t.stayStatus !== stayFilter) return false;
    if (mentionsOnly && !t.mentionsMe) return false;
    return true;
  });
  // Review tab badge count — surfaced in the FilterButton chip so
  // operators see "Review (3)" at a glance.
  const reviewCount = useMemo(
    () => sourceThreads.filter(
      (t) => t.latestDraftState === 'draft_ready' || t.latestDraftState === 'under_review',
    ).length,
    [sourceThreads],
  );

  // Thread shown in the detail pane. List response gives summary metadata only;
  // useThreadDetail lazily fetches full messages + reservation when selection
  // changes. Falls back to the list-version while detail loads so the pane
  // doesn't blank between selections.
  const listThread = filtered.find((t) => t.id === selected) || filtered[0] || sourceThreads[0];
  const { thread: detailThread, refetch: refetchDetail } = useThreadDetail(listThread?.id ?? null);
  const thread = detailThread || listThread;

  // ─── Draft review state ────────────────────────────────────────────────
  // The active draft is the most-recent one in a review-ready state. GMS
  // returns drafts newest-first in the detail bundle; we just take the
  // first one whose state is draft_ready / under_review. send_queued and
  // send_failed surface differently (queued-draft retry cards inline in
  // the thread, not in DraftPanel) — out of scope for v1.
  const activeDraft = thread?.drafts?.find((d) => isReviewReady(d.state));
  const prevDraftRevRef = useRef<number | undefined>(undefined);

  // Action wiring. The parent owns the API calls + the 5s undo; DraftPanel
  // is a controlled view.
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftRevising, setDraftRevising] = useState(false);

  // Pending-send state for the 5s undo. When non-null, a "Sending in Xs"
  // banner renders at the bottom; cancel restores the draft.
  type PendingSend = {
    draftId: string;
    draftBody?: string;   // edited body if operator edited inline
    sentVia?: 'whatsapp' | 'airbnb' | 'booking' | 'email';
    countdown: number;
  };
  const [pendingSend, setPendingSend] = useState<PendingSend | null>(null);

  // Countdown ticker for pending send. Decrements every second; at 0,
  // fires the actual approveDraft call.
  useEffect(() => {
    if (!pendingSend) return;
    if (pendingSend.countdown <= 0) {
      // Fire the send.
      const { draftId, draftBody, sentVia } = pendingSend;
      setPendingSend(null);
      setDraftBusy(true);
      setDraftError(null);
      approveDraft(draftId, { draftBody, sentVia })
        .then(() => {
          import('../../../../lib/analytics').then(m => m.trackEvent('inbox_draft_approve', { sent_via: sentVia })).catch(() => {});
          fireToast('Sent ✓');
          refetchDetail();
          refetchConversations();
        })
        .catch((e: Error) => {
          const msg = e?.message || 'Send failed';
          // WhatsApp 24h window expired — surface the special toast.
          if (msg.includes('whatsapp_window_expired')) {
            fireToast('WhatsApp 24h window expired — use a template');
          } else {
            setDraftError(msg);
            fireToast(msg);
          }
        })
        .finally(() => setDraftBusy(false));
      return;
    }
    const t = setTimeout(() => {
      setPendingSend((p) => p ? { ...p, countdown: p.countdown - 1 } : null);
    }, 1000);
    return () => clearTimeout(t);
  }, [pendingSend, refetchDetail]);

  // Detect a new draft after a revise. When activeDraft.revisionNumber
  // increases past prevDraftRevRef, clear the revising spinner.
  useEffect(() => {
    if (!activeDraft) return;
    if (draftRevising && typeof activeDraft.revisionNumber === 'number') {
      const prev = prevDraftRevRef.current;
      if (prev === undefined || activeDraft.revisionNumber > prev) {
        setDraftRevising(false);
      }
    }
    prevDraftRevRef.current = activeDraft.revisionNumber;
  }, [activeDraft, draftRevising]);

  // While a revise is pending, poll the detail every 3s. friday-gms
  // generates drafts async — we'd see the new one via SSE in OLD UI, but
  // FAD doesn't have an SSE consumer yet. Polling is the MVP path.
  useEffect(() => {
    if (!draftRevising) return;
    const interval = setInterval(refetchDetail, 3000);
    const safety = setTimeout(() => setDraftRevising(false), 30_000);
    return () => { clearInterval(interval); clearTimeout(safety); };
  }, [draftRevising, refetchDetail]);

  // Auto-open Friday Consult when a NEW AI draft lands so the operator
  // sees it without an extra click. Tracks the most recent draft id we
  // opened for; the operator can manually close after that, and we
  // won't re-open until a different draft replaces it.
  useEffect(() => {
    if (!activeDraft) return;
    if (autoOpenedDraftRef.current === activeDraft.id) return;
    setConsultOpen(true);
    autoOpenedDraftRef.current = activeDraft.id;
  }, [activeDraft]);

  // Reset the auto-open memory when the operator switches conversations
  // so the next conversation's draft gets the same first-time treatment.
  useEffect(() => {
    autoOpenedDraftRef.current = null;
  }, [selected]);

  // ── Action handlers ──────────────────────────────────────────────────

  const handleApprove = (opts: { draftBody?: string; learnMode?: 'learn' }) => {
    if (!activeDraft) return;
    setDraftError(null);
    // Phase 2: open preflight modal first (channel selector, body
    // preview, teachables review, learnMode). Modal Confirm → 5s undo
    // countdown. Modal Cancel → no send.
    const body = opts.draftBody ?? activeDraft.body;
    if (!body.trim()) return;
    setPreflight({ bodyToSend: body, fromDraft: true });
  };

  // Modal Confirm → kick off the actual send. For from-draft sends this
  // is the 5s undo + /api/inbox/drafts/:id/approve path. For manual
  // compose it's a direct sendCompose call without the 5s undo (modal
  // already provided the confirmation step; double-confirmation = friction).
  const confirmPreflight = (opts: { channel: string; learnMode?: 'learn' | 'no_learn' | 'normal' }) => {
    if (!preflight || !thread) return;
    const { bodyToSend, fromDraft } = preflight;
    setPreflight(null);
    const channel = opts.channel as 'whatsapp' | 'airbnb' | 'booking' | 'email';

    if (fromDraft && activeDraft) {
      setPendingSend({
        draftId: activeDraft.id,
        draftBody: bodyToSend !== activeDraft.body ? bodyToSend : undefined,
        sentVia: channel,
        countdown: 5,
      });
      return;
    }
    // Manual compose path — fire directly. Preflight modal IS the
    // confirmation step; no second undo.
    setComposeBusy(true);
    sendCompose(thread.id, { mode: 'manual', body: bodyToSend, channel })
      .then(() => {
        fireToast('Sent ✓');
        setReplyBody('');
        setConsultOpen(false);
        refetchDetail();
        refetchConversations();
      })
      .catch((e: Error) => {
        const msg = e?.message || 'Send failed';
        if (msg.includes('whatsapp_window_expired')) {
          fireToast('WhatsApp 24h window expired — use a template');
        } else {
          fireToast(msg);
        }
      })
      .finally(() => setComposeBusy(false));
  };

  const handleRevise = (instruction: string, mode: 'standard' | 'teach') => {
    if (!activeDraft) return;
    setDraftBusy(true);
    setDraftError(null);
    reviseDraft(activeDraft.id, instruction, { mode })
      .then(() => {
        import('../../../../lib/analytics').then(m => m.trackEvent('inbox_draft_revise', { mode })).catch(() => {});
        setDraftRevising(true);
        refetchDetail();
      })
      .catch((e: Error) => {
        const msg = e?.message || 'Revise failed';
        setDraftError(msg);
        fireToast(msg);
      })
      .finally(() => setDraftBusy(false));
  };

  const handleReject = (reason?: string) => {
    if (!activeDraft) return;
    setDraftBusy(true);
    setDraftError(null);
    rejectDraft(activeDraft.id, reason)
      .then(() => {
        import('../../../../lib/analytics').then(m => m.trackEvent('inbox_draft_reject', { has_reason: !!reason })).catch(() => {});
        fireToast(reason ? 'Draft rejected — Friday will learn from this' : 'Draft dismissed');
        refetchDetail();
        refetchConversations();
      })
      .catch((e: Error) => {
        const msg = e?.message || 'Reject failed';
        setDraftError(msg);
        fireToast(msg);
      })
      .finally(() => setDraftBusy(false));
  };

  const cancelPendingSend = () => setPendingSend(null);

  // Friday Consult may emit a draft rewrite via the [DRAFT_UPDATE] protocol.
  // We stash it here and pass to DraftPanel on the next render — DraftPanel
  // jumps into edit mode pre-filled with this body, then calls back to
  // clear it so we don't re-trigger on subsequent renders.
  const [pendingRewrite, setPendingRewrite] = useState<string | null>(null);

  // ─── Send preflight modal ────────────────────────────────────────────
  // Phase 2 of the guest inbox: a preflight check between Approve & Send
  // and the 5s undo countdown. Modal lets the operator confirm channel,
  // review the body + translated version, see pending teachables, set
  // learnMode. Confirm → countdown → POST. Cancel → no send.
  //
  // Why both modal AND countdown: preflight catches "wrong channel /
  // wrong body / forgot to commit a teach". Countdown catches "I just
  // typed an obvious typo and clicked too fast". Different concerns.
  type Preflight = {
    bodyToSend: string;
    fromDraft: boolean;
  };
  const [preflight, setPreflight] = useState<Preflight | null>(null);

  // ─── Compose state ─────────────────────────────────────────────────────
  // Operator-initiated manual reply (vs. draft-review path which goes
  // through DraftPanel). Posts to /api/inbox/conversations/:id/compose
  // mode=manual. "Polish with Friday" hits /api/inbox/consult to rewrite
  // the current body. Reset when the active thread changes.
  const [replyBody, setReplyBody] = useState('');
  const [composeBusy, setComposeBusy] = useState(false);
  const [polishBusy, setPolishBusy] = useState(false);

  useEffect(() => {
    setReplyBody('');
    setComposeMode('reply');
  }, [selected]);

  // Mark conversation as read when the operator opens it (Mary bug
  // 2026-05-17: "Messages do not update to read"). Fire-and-forget —
  // the optimistic refetchConversations() right after picks up the
  // new unread state.
  useEffect(() => {
    if (!thread?.id) return;
    if (!thread.unread) return;
    markRead(thread.id)
      .then(() => { refetchConversations(); })
      .catch(() => { /* swallow — read state is best-effort */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.id, thread?.unread]);

  const handleComposeSend = () => {
    if (!thread || !replyBody.trim() || composeBusy) return;
    setComposeBusy(true);
    const channel = (thread.recommendedChannel || thread.channelKey) as
      | 'whatsapp' | 'airbnb' | 'booking' | 'email' | undefined;
    sendCompose(thread.id, {
      mode: 'manual',
      body: replyBody.trim(),
      channel,
    })
      .then(() => {
        fireToast('Sent ✓');
        setReplyBody('');
        refetchDetail();
        refetchConversations();
      })
      .catch((e: Error) => {
        const msg = e?.message || 'Send failed';
        if (msg.includes('whatsapp_window_expired')) {
          fireToast('WhatsApp 24h window expired — use a template');
        } else {
          fireToast(msg);
        }
      })
      .finally(() => setComposeBusy(false));
  };

  const handlePolishCompose = async () => {
    if (!thread || !replyBody.trim() || polishBusy) return;
    setPolishBusy(true);
    try {
      const data = await apiFetch('/api/inbox/consult', {
        method: 'POST',
        body: JSON.stringify({
          text: `Polish this reply: ${replyBody.trim()}`,
          context: 'compose',
          conversationId: thread.id,
          draftBody: replyBody.trim(),
        }),
      }) as { response?: string; draft_update?: string };
      const rewritten = (data.draft_update || data.response || '').trim();
      if (rewritten) {
        setReplyBody(rewritten);
      } else {
        fireToast('Friday had nothing to polish — try editing manually');
      }
    } catch (e) {
      fireToast(e instanceof Error ? e.message : 'Polish failed');
    } finally {
      setPolishBusy(false);
    }
  };

  // Auto-scroll to the latest message when the thread changes or its messages
  // load. Otherwise the pane lands at the top of long threads and the user
  // has to scroll down every time.
  const threadBodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = threadBodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [selected, thread?.messages?.length]);
  const unread = sourceThreads.filter((t) => t.unread).length;

  const activeFilterCount =
    (triageFilter !== 'all' ? 1 : 0) +
    (stayFilter !== 'all' ? 1 : 0) +
    (mentionsOnly ? 1 : 0);

  const actions = (
    <>
      <FilterButton
        triageFilter={triageFilter}
        setTriageFilter={setTriageFilter}
        stayFilter={stayFilter}
        setStayFilter={setStayFilter}
        mentionsOnly={mentionsOnly}
        setMentionsOnly={setMentionsOnly}
        open={filterOpen}
        setOpen={setFilterOpen}
        activeCount={activeFilterCount}
      />
      <button
        className="btn primary sm"
        onClick={() => fireToast('New-conversation compose lands in a follow-up sprint — for now, reply within an existing thread')}
        title="Coming soon"
      >
        <IconPlus size={12} /> Compose
      </button>
    </>
  );

  const onTeam = entityFilter === 'team';

  const externalChips: { key: 'all' | InboxEntity; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.byEntity.all },
    { key: 'guest', label: 'Guest', count: counts.byEntity.guest },
    { key: 'owner', label: 'Owner', count: counts.byEntity.owner },
    { key: 'vendor', label: 'Vendor', count: counts.byEntity.vendor },
  ];

  const teamUnread =
    TEAM_CHANNELS.reduce((acc, c) => acc + (c.unread ?? 0), 0) +
    TEAM_DMS.reduce((acc, d) => acc + (d.unread ?? 0), 0);

  const chipsRow = (
    <div className="inbox-chips-row">
      {canSeeGuest && externalChips.map((c) => (
        <button
          key={c.key}
          className={'inbox-chip' + (entityFilter === c.key ? ' active' : '')}
          onClick={() => setEntityFilter(c.key)}
        >
          {c.label}{' '}
          <span className="mono" style={{ fontSize: 10, marginLeft: 4, opacity: 0.8 }}>
            {c.count}
          </span>
        </button>
      ))}
      {canSeeTeam && (
        <button
          className={'inbox-chip' + (onTeam ? ' active' : '')}
          onClick={() => setEntityFilter('team')}
          title="Internal team channels and DMs"
        >
          Team{' '}
          <span className="mono" style={{ fontSize: 10, marginLeft: 4, opacity: 0.8 }}>
            {teamUnread}
          </span>
        </button>
      )}
      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
        {onTeam ? 'Channels · DMs · calls' : `${unread} unread across all channels`}
      </span>
    </div>
  );

  if (onTeam) {
    return (
      <div
        className={isMobile && mobileThreadOpen ? 'inbox-thread-open-mobile' : ''}
        style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
      >
        <ModuleHeader
          title="Inbox"
          subtitle="Team channels · DMs · scheduled calls"
          actions={actions}
        />
        {chipsRow}
        <TeamInbox
          mentionsOnly={mentionsOnly}
          isMobile={isMobile}
          mobileThreadOpen={mobileThreadOpen}
          onMobileThreadOpenChange={setMobileThreadOpen}
        />
      </div>
    );
  }

  return (
    <div
      className={isMobile && mobileThreadOpen ? 'inbox-thread-open-mobile' : ''}
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
    >
      <ModuleHeader
        title="Inbox"
        subtitle="Guest · owner · vendor threads across Airbnb, Booking, WhatsApp, Email"
        actions={actions}
      />
      {chipsRow}
      <div
        className={'inbox-split' + (mobileThreadOpen ? ' thread-open' : '')}
        style={{ flex: 1 }}
      >
        <div className={'inbox-list' + (listCollapsed ? ' collapsed' : '')}>
          <button
            className="inbox-collapse-btn"
            onClick={() => setListCollapsed((v) => !v)}
            title={listCollapsed ? 'Show threads' : 'Collapse threads'}
          >
            <IconChevron size={12} />
          </button>
          {listCollapsed && (
            <div className="inbox-list-rail">
              <IconInbox size={14} />
              <span>Threads · {filtered.length}</span>
            </div>
          )}
          {filtered.length === 0 && (
            <div
              style={{
                padding: 24,
                textAlign: 'center',
                fontSize: 12,
                color: 'var(--color-text-tertiary)',
              }}
            >
              No threads match this filter.
            </div>
          )}
          {filtered.map((t) => (
            <div
              key={t.id}
              className={
                'row' + (t.unread ? ' unread' : '') + (t.id === selected ? ' selected' : '')
              }
              onClick={() => {
                setSelected(t.id);
                setMobileThreadOpen(true);
              }}
              style={{
                display: 'grid',
                gridTemplateColumns: '10px 1fr auto',
                gap: 10,
                alignItems: 'start',
                padding: '12px 16px',
              }}
            >
              <span
                className={
                  'dot ' +
                  (t.sentiment === 'urgent'
                    ? 'red'
                    : t.urgent || (t.unread ? 'accent' : 'neutral'))
                }
                style={{ marginTop: 6 }}
              />
              <div style={{ minWidth: 0 }}>
                <div
                  className="row-primary"
                  style={{
                    marginBottom: 2,
                    display: 'flex',
                    gap: 6,
                    alignItems: 'center',
                  }}
                >
                  <span
                    style={{
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      flex: 1,
                    }}
                  >
                    {t.guest}
                  </span>
                  {t.entity !== 'guest' && (
                    <span
                      style={{
                        fontSize: 9,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: 'var(--color-text-tertiary)',
                        padding: '1px 5px',
                        background: 'var(--color-background-secondary)',
                        borderRadius: 4,
                        flexShrink: 0,
                      }}
                    >
                      {t.entity}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--color-text-secondary)',
                    fontWeight: t.unread ? 500 : 400,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {t.subject}
                </div>
                <div className="row-meta" style={{ marginTop: 3 }}>
                  <span>{t.channel}</span>
                  <span className="sep">·</span>
                  <span>{t.property}</span>
                </div>
              </div>
              <span className="row-time">{formatRelative(t.time)}</span>
            </div>
          ))}
        </div>

        {!thread ? (
          <div className="inbox-thread" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)', fontSize: 13, padding: 40, textAlign: 'center' }}>
            <div>
              No guest, owner, or vendor threads yet.<br />
              <span style={{ fontSize: 12 }}>Use the Team chip above to switch to internal team channels.</span>
            </div>
          </div>
        ) : (
        <div className="inbox-thread">
          <div className="inbox-thread-header">
            <button
              className="btn ghost sm inbox-mobile-back"
              onClick={() => setMobileThreadOpen(false)}
              style={{ marginBottom: 8 }}
            >
              ← Back to inbox
            </button>
            <div className="inbox-thread-subject">
              <span style={{ flex: 1, minWidth: 0 }}>{thread.subject}</span>
              {isMobile && (
                <button
                  type="button"
                  className={'btn ghost sm' + (mobileDetailsOpen ? ' active' : '')}
                  onClick={() => setMobileDetailsOpen((v) => !v)}
                  style={{ fontSize: 11, padding: '4px 8px', whiteSpace: 'nowrap' }}
                  aria-expanded={mobileDetailsOpen}
                >
                  {mobileDetailsOpen ? 'Hide details ▴' : 'Details ▾'}
                </button>
              )}
            </div>
            <div className={'inbox-thread-details' + (isMobile && !mobileDetailsOpen ? ' mobile-hidden' : '')}>
            <div className="inbox-thread-meta" style={{ marginBottom: 8 }}>
              <span>{thread.guest}</span>
              <span className="sep">·</span>
              <span>{thread.channel}</span>
              <span className="sep">·</span>
              <span>{thread.property}</span>
              {thread.language && (
                <>
                  <span className="sep">·</span>
                  <span>{thread.language}</span>
                </>
              )}
            </div>
            {thread.whatsappWindow && <WhatsAppTimer window={thread.whatsappWindow} />}
            <div
              className={
                'inbox-ai-toolbar' +
                (isMobile && !aiToolbarExpanded ? ' mobile-collapsed' : '')
              }
            >
              <span className="inbox-ai-toolbar-label">Friday</span>
              {isMobile && (
                <button
                  className="inbox-ai-chip ai-toggle"
                  onClick={() => setAiToolbarExpanded((v) => !v)}
                >
                  <IconSparkle size={10} />
                  {aiToolbarExpanded ? 'Hide AI' : 'AI tools'}
                </button>
              )}
              <button
                className={'inbox-ai-chip' + (summaryOn ? ' on' : '')}
                onClick={() => setSummaryOn((v) => !v)}
              >
                <IconSparkle size={10} /> Summary
              </button>
              <button
                className={'inbox-ai-chip' + (translateOn ? ' on' : '')}
                onClick={() => setTranslateOn((v) => !v)}
              >
                <IconGlobe size={10} /> Translate
              </button>
              {thread.sentiment === 'urgent' && (
                <span
                  className="inbox-ai-chip"
                  style={{
                    background: 'var(--color-bg-danger)',
                    color: 'var(--color-text-danger)',
                  }}
                >
                  <IconBell size={10} /> Urgent
                </span>
              )}
            </div>
            {summaryOn && thread.summary && (
              <div
                className={
                  'inbox-ai-summary' + (isMobile && summaryCollapsed ? ' collapsed' : '')
                }
              >
                <div
                  className="inbox-ai-summary-label"
                  style={{ cursor: isMobile ? 'pointer' : 'default' }}
                  onClick={() => isMobile && setSummaryCollapsed((v) => !v)}
                >
                  Summary · auto
                </div>
                {thread.summary}
              </div>
            )}
            {summaryOn && thread.summary && isMobile && summaryCollapsed && (
              <button
                onClick={() => setSummaryCollapsed(false)}
                style={{
                  marginTop: 6,
                  background: 'transparent',
                  border: '0.5px dashed var(--color-border-tertiary)',
                  padding: '4px 10px',
                  fontSize: 11,
                  color: 'var(--color-brand-accent)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                }}
              >
                <IconSparkle size={10} /> Show Friday summary
              </button>
            )}
            {thread.reservationId && RESERVATION_BY_ID[thread.reservationId] && (
              <ThreadReservationChip reservation={RESERVATION_BY_ID[thread.reservationId]} />
            )}
            </div>
          </div>
          <div className="inbox-thread-body" ref={threadBodyRef}>
            {/* Render full message thread when available (live data path). Falls
                back to a single preview bubble for fixture/empty states.
                Sent drafts merged inline as outbound bubbles with reviewer
                attribution — operators see what Friday + the team actually
                sent without leaving the conversation. Per-message
                Show-original toggle when GMS detected a non-EN source. */}
            {thread.messages && thread.messages.length > 0 ? (
              <UnifiedTimeline thread={thread} />
            ) : (
              <div className="msg-bubble them">
                <div className="msg-meta">
                  {thread.guest} · {formatRelative(thread.time)}
                </div>
                <div className="msg-body">{thread.preview}</div>
              </div>
            )}

            {/* Internal notes — visible to team only, not to the guest */}
            {INBOX_INTERNAL_NOTES.filter((n) => n.threadId === thread.id).map((n) => (
              <InternalNoteBubble key={n.id} note={n} />
            ))}
            {/* The fake "Drafting a reply… use ⌘K" placeholder bubble was
                purged 2026-05-13 (design-be-19). It was a fixture-era hint
                that rendered for every thread regardless of whether the
                user was actually drafting; the compose textarea below
                already exposes the draft surface. */}
          </div>
          {/* Friday Consult — when open, this becomes the primary surface
              for both reviewing AI drafts AND composing manual replies.
              The DraftPanel + compose box collapse so the operator has
              one unified place to draft + iterate + send. The 5-second
              undo banner stays visible below regardless. */}
          {consultOpen && (
            <FridayConsult
              key={selected}
              pendingQuery={pendingConsultQuery}
              onPendingQueryConsumed={() => setPendingConsultQuery(null)}
              threadScope={thread.guest}
              conversationId={thread.id}
              currentDraft={activeDraft ?? null}
              initialBody={activeDraft ? undefined : replyBody}
              context={activeDraft ? 'draft_review' : 'compose'}
              channelLabel={thread.channel}
              whatsappWindow={thread.whatsappWindow}
              sendBusy={draftBusy || composeBusy || !!pendingSend || !!preflight}
              onApproveDraft={(body) => {
                // Open preflight instead of going straight to 5s undo.
                // Modal confirms channel + learnMode + lets operator
                // review teachables; then countdown fires.
                if (!body.trim()) return;
                setPreflight({ bodyToSend: body, fromDraft: true });
              }}
              onRejectDraft={handleReject}
              onSendManual={(body) => {
                // Manual compose path also funnels through preflight.
                // Different downstream API (mode=manual via compose),
                // same preflight UX.
                if (!body.trim()) return;
                setPreflight({ bodyToSend: body, fromDraft: false });
              }}
              onBodyChanged={(body) => {
                // Mirror Friday Consult's working body into the compose
                // textarea so the operator's edits persist when they
                // close the panel without sending.
                if (!activeDraft) setReplyBody(body);
              }}
              onSwitchToNote={() => {
                // Switch to internal-note mode. Close consult so the
                // note compose surface (different audience) becomes
                // visible. composeMode resets to 'reply' on thread
                // switch (see useEffect on [selected]).
                setComposeMode('note');
                setConsultOpen(false);
              }}
              onClose={() => setConsultOpen(false)}
            />
          )}
          {/* AI draft review panel — shown when consult is CLOSED and GMS
              has an active draft. When consult is open, the draft is
              embedded inside the consult panel instead. */}
          {!consultOpen && activeDraft && (
            <div style={{ padding: '0 12px' }}>
              <DraftPanel
                draft={activeDraft}
                busy={draftBusy || !!pendingSend}
                revising={draftRevising}
                error={draftError}
                onApprove={handleApprove}
                onRevise={handleRevise}
                onReject={handleReject}
                onOpenConsult={() => setConsultOpen(true)}
                pendingRewrite={pendingRewrite}
                onPendingRewriteConsumed={() => setPendingRewrite(null)}
              />
            </div>
          )}
          {/* Send preflight modal — opens on Approve & Send from
              FridayConsult or DraftPanel. Confirm → 5s undo banner +
              POST. Cancel → no send, modal closes. */}
          {preflight && thread && (
            <SendPreflightModal
              currentDraft={activeDraft ?? null}
              liveConfidence={null}
              bodyToSend={preflight.bodyToSend}
              recipientLabel={`${thread.guest} on ${thread.channel}`}
              availableChannels={thread.availableChannels ?? []}
              defaultChannel={(thread.recommendedChannel || thread.channelKey || 'whatsapp')}
              pendingTeachingCount={0}
              whatsappWindow={thread.whatsappWindow}
              onConfirm={confirmPreflight}
              onCancel={() => setPreflight(null)}
              onReviewTeachings={() => {
                // Close modal so operator can scroll FridayConsult and
                // confirm/dismiss the cards. Re-opening Approve & Send
                // brings the modal back.
                setPreflight(null);
              }}
            />
          )}
          {/* 5-second undo banner — visible during the countdown after
              Approve & Send. Cancel restores the DraftPanel without
              actually firing the send to GMS. */}
          {pendingSend && (
            <div
              style={{
                margin: '0 12px 8px',
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: 'var(--color-background-accent-soft, rgba(56, 132, 255, 0.1))',
                border: '0.5px solid var(--color-brand-accent)',
                borderRadius: 'var(--radius-md)',
                fontSize: 12,
                color: 'var(--color-text-primary)',
              }}
              role="status"
              aria-live="polite"
            >
              <IconSend size={12} />
              <span style={{ flex: 1 }}>
                Sending in <strong>{pendingSend.countdown}s</strong>
                {pendingSend.sentVia ? ` via ${pendingSend.sentVia}` : ''}
                {pendingSend.draftBody ? ' (edited)' : ''}…
              </span>
              <button
                type="button"
                onClick={cancelPendingSend}
                style={{
                  padding: '4px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--color-brand-accent)',
                  background: 'transparent',
                  border: '0.5px solid var(--color-brand-accent)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          )}
          {/* Inbox-compose REMOVED 2026-05-17 per Ishant: FridayConsult
              is the single compose surface (Reply, Note, Ask Friday all
              flow through FC). Old block deleted in full — toolbar,
              textarea, send-split, SendByMenu, InternalNoteCompose. The
              note-compose component is still defined below for re-mount
              from a future FC header button. */}
        </div>
        )}

        <div className={'inbox-right' + (rightCollapsed ? ' collapsed' : '')}>
          <button
            className="inbox-collapse-btn"
            onClick={() => setRightCollapsed((v) => !v)}
            title={rightCollapsed ? 'Show reservation' : 'Collapse reservation'}
          >
            <IconChevron size={12} />
          </button>
          {rightCollapsed && (
            <div className="inbox-right-rail">
              <IconPin size={14} />
              <span>Reservation</span>
            </div>
          )}
          <ReservationRightPanel
            thread={thread}
            onAskFriday={onAskFriday}
          />
        </div>
      </div>
    </div>
  );
}

// Right-side reservation panel — wired to thread.reservation from the
// bundled detail response. Falls back to an empty state when the detail
// fetch hasn't landed yet or the conversation has no linked reservation.
// Single message bubble. When GMS translated an inbound message
// (m.bodyOriginal present, different from m.body), shows the translated
// version with a "Show original · {lang}" toggle. Outbound messages
// never carry a translation; the toggle is hidden for them.
// Unified message + sent-draft timeline. Merges thread.messages (inbound
// + outbound conversation events) with thread.drafts in 'sent' state
// (AI drafts approved + sent by the team). Sorted chronologically so
// the operator sees the conversation in order, with sent drafts
// rendered as outbound bubbles carrying reviewer attribution
// ("Sent by Mathias via Friday").
//
// Why merge here rather than at the API: the bundled detail response
// is two arrays (messages + drafts); the timeline view is a derived
// shape with date separators + interleaving. Keeping the merge
// client-side means GMS doesn't need to change.
function UnifiedTimeline({ thread }: { thread: InboxThread }) {
  const items = useMemo(() => {
    type Item =
      | { kind: 'msg'; key: string; ts: string; m: InboxMessage }
      | { kind: 'sent-draft'; key: string; ts: string; body: string; bodyTranslated?: string; reviewer?: string };

    const out: Item[] = [];
    (thread.messages || []).forEach((m, idx) => {
      out.push({ kind: 'msg', key: `m-${idx}`, ts: m.time, m });
    });
    // Only sent drafts get rendered — draft_ready / under_review live
    // in the DraftPanel/Friday Consult, not in the thread timeline.
    // Failed/queued sends could surface later as retry cards.
    (thread.drafts || []).forEach((d) => {
      if (d.state !== 'sent') return;
      out.push({
        kind: 'sent-draft',
        key: `d-${d.id}`,
        ts: d.createdAt,
        body: d.body,
        bodyTranslated: d.bodyTranslated && d.bodyTranslated !== d.body ? d.bodyTranslated : undefined,
        // For v1 we don't have reviewer-name on the draft row; GMS
        // returns reviewed_by which we'd surface here if the
        // transformer captured it. For now show generic attribution.
      });
    });
    // Sort ascending by ts so thread reads top-to-bottom chronologically.
    out.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
    return out;
  }, [thread.messages, thread.drafts]);

  // Date separator helper — "Today / Yesterday / Mon May 12".
  let lastDateLabel = '';
  const dateLabelFor = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (sameDay(d, now)) return 'Today';
    if (sameDay(d, yesterday)) return 'Yesterday';
    return d.toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <>
      {items.map((it) => {
        const dateLabel = dateLabelFor(it.ts);
        const showSeparator = dateLabel !== lastDateLabel;
        lastDateLabel = dateLabel;
        return (
          <React.Fragment key={it.key}>
            {showSeparator && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  margin: '12px 0 6px',
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  color: 'var(--color-text-tertiary)',
                }}
              >
                <div style={{ flex: 1, height: 1, background: 'var(--color-border-tertiary)' }} />
                <span>{dateLabel}</span>
                <div style={{ flex: 1, height: 1, background: 'var(--color-border-tertiary)' }} />
              </div>
            )}
            {it.kind === 'msg' ? (
              <MessageBubble m={it.m} threadGuest={thread.guest} />
            ) : (
              <SentDraftBubble body={it.body} bodyTranslated={it.bodyTranslated} ts={it.ts} channel={thread.channel} />
            )}
          </React.Fragment>
        );
      })}
    </>
  );
}

function SentDraftBubble({
  body,
  bodyTranslated,
  ts,
  channel,
}: {
  body: string;
  bodyTranslated?: string;
  ts: string;
  channel: string;
}) {
  const [showTranslated, setShowTranslated] = useState(false);
  const visible = showTranslated && bodyTranslated ? bodyTranslated : body;
  return (
    <div className="msg-bubble us">
      <div className="msg-meta">
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          padding: '1px 4px',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--color-text-success)',
          color: '#fff',
          marginRight: 4,
        }}>
          Sent
        </span>
        Friday on {channel} · {formatRelative(ts)}
      </div>
      <div className="msg-body" style={{ whiteSpace: 'pre-wrap' }}>{visible}</div>
      {bodyTranslated && (
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => setShowTranslated((v) => !v)}
          style={{ fontSize: 10, marginTop: 6, opacity: 0.7 }}
        >
          {showTranslated ? 'Show English' : 'Show what was sent'}
        </button>
      )}
    </div>
  );
}

function MessageBubble({ m, threadGuest }: { m: InboxMessage; threadGuest: string }) {
  const [showOriginal, setShowOriginal] = useState(false);
  const hasTranslation = !!(m.bodyOriginal && m.bodyOriginal !== m.body);
  const body = hasTranslation && showOriginal ? m.bodyOriginal! : m.body;
  return (
    <div className={`msg-bubble ${m.from}`}>
      <div className="msg-meta">
        {m.from === 'them'
          ? (m.name && m.name !== 'Guest' ? m.name : threadGuest)
          : (m.name || 'Friday')}
        {' · '}
        {formatRelative(m.time)}
      </div>
      <div className="msg-body" style={{ whiteSpace: 'pre-wrap' }}>{body}</div>
      {hasTranslation && (
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => setShowOriginal((v) => !v)}
          style={{ fontSize: 10, marginTop: 6, opacity: 0.7 }}
        >
          {showOriginal ? 'Show translated' : 'Show original'}
          {m.bodyLang ? ` · ${m.bodyLang}` : ''}
        </button>
      )}
    </div>
  );
}

function ReservationRightPanel({
  thread,
  onAskFriday,
}: {
  thread: InboxThread | undefined;
  onAskFriday: () => void;
}) {
  // thread can be undefined briefly before the conversation list resolves.
  if (!thread) return null;
  const r = thread.reservation;

  const fmtDate = (iso?: string): string => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
  };

  // Currency-aware total. GMS stores numeric prices + ISO currency codes.
  // Falls back to MUR when currency missing (FR's home market).
  const fmtMoney = (amount?: number, currency?: string): string => {
    if (amount == null || !Number.isFinite(amount)) return '—';
    try {
      return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: currency || 'MUR',
        maximumFractionDigits: 0,
      }).format(amount);
    } catch {
      return `${amount} ${currency ?? ''}`.trim();
    }
  };

  const statusLabel = (s?: string): string => {
    if (!s) return '—';
    return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
  };

  return (
    <>
      <div className="inbox-right-section">
        <h4>Reservation</h4>
        {!r ? (
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            No reservation linked.
          </div>
        ) : (
          <>
            <div className="inbox-right-row">
              <span className="label">Property</span>
              <span className="value">{r.listingName || thread.property || '—'}</span>
            </div>
            <div className="inbox-right-row">
              <span className="label">Status</span>
              <span className="value">{statusLabel(r.status)}</span>
            </div>
            <div className="inbox-right-row">
              <span className="label">Check-in</span>
              <span className="value">{fmtDate(r.checkIn)}</span>
            </div>
            <div className="inbox-right-row">
              <span className="label">Check-out</span>
              <span className="value">
                {fmtDate(r.checkOut)}
                {r.numberOfNights ? (
                  <span style={{ color: 'var(--color-text-tertiary)', marginLeft: 4 }}>
                    · {r.numberOfNights}n
                  </span>
                ) : null}
              </span>
            </div>
            <div className="inbox-right-row">
              <span className="label">Guests</span>
              <span className="value">{r.numGuests ?? '—'}</span>
            </div>
            <div className="inbox-right-row">
              <span className="label">Total</span>
              <span className="value">{fmtMoney(r.totalPrice, r.currency)}</span>
            </div>
            {r.specialRequests && (
              <div className="inbox-right-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                <span className="label">Special requests</span>
                <span className="value" style={{ fontSize: 11, lineHeight: 1.4 }}>
                  {r.specialRequests}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="inbox-right-section">
        <h4>Guest</h4>
        <div className="inbox-right-row">
          <span className="label">Name</span>
          <span className="value">{r?.guestName || thread.guest || '—'}</span>
        </div>
        <div className="inbox-right-row">
          <span className="label">Language</span>
          <span className="value">{thread.language || '—'}</span>
        </div>
        {r?.guestEmail && (
          <div className="inbox-right-row">
            <span className="label">Email</span>
            <span className="value" style={{ fontSize: 11 }}>{r.guestEmail}</span>
          </div>
        )}
        {r?.guestPhone && (
          <div className="inbox-right-row">
            <span className="label">Phone</span>
            <span className="value" style={{ fontSize: 11 }}>{r.guestPhone}</span>
          </div>
        )}
      </div>

      <div className="inbox-right-section">
        <h4>Actions</h4>
        <button
          className="btn sm"
          style={{ width: '100%', justifyContent: 'flex-start' }}
          onClick={onAskFriday}
        >
          <IconSparkle size={12} /> Ask Friday to draft reply
        </button>
      </div>
    </>
  );
}

function ThreadReservationChip({ reservation }: { reservation: Reservation }) {
  return (
    <button
      type="button"
      onClick={() =>
        window.location.assign(`/fad?m=reservations&sub=overview&rsv=${reservation.id}`)
      }
      title="Open reservation detail"
      style={{
        marginTop: 8,
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 8,
        padding: '8px 12px',
        background: 'var(--color-background-secondary)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
        fontSize: 12,
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
        font: 'inherit',
        color: 'inherit',
      }}
    >
      <span className="mono" style={{ fontWeight: 500 }}>🛏 {reservation.id}</span>
      <span
        style={{
          fontSize: 10,
          padding: '2px 6px',
          borderRadius: 4,
          background: 'var(--color-brand-accent-soft)',
          color: 'var(--color-brand-accent)',
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {RES_STATUS_LABEL[reservation.status]}
      </span>
      <span style={{ color: 'var(--color-text-secondary)' }}>
        {reservation.propertyCode} · {formatStayWindow(reservation)}
      </span>
      <span style={{ color: 'var(--color-text-tertiary)', marginLeft: 'auto', fontSize: 11 }}>
        {CHANNEL_LABEL[reservation.channel]}
      </span>
    </button>
  );
}

function WhatsAppTimer({
  window,
}: {
  window: { open: boolean; expiresInMinutes?: number };
}) {
  if (!window.open) {
    return (
      <div
        style={{
          marginTop: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <span className="inbox-wa-timer closed">
          <IconClock size={10} /> Window closed · template required
        </span>
        <button
          style={{
            fontSize: 11,
            color: 'var(--color-brand-accent)',
            background: 'transparent',
            border: 0,
            padding: 0,
            cursor: 'pointer',
          }}
        >
          Pick template →
        </button>
      </div>
    );
  }
  const mins = window.expiresInMinutes || 0;
  const low = mins < 60;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return (
    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span className={'inbox-wa-timer ' + (low ? 'warn' : 'open')}>
        <IconClock size={10} /> Window open · expires in {h > 0 ? `${h}h ` : ''}
        {m}m
      </span>
      {low && (
        <span style={{ fontSize: 11, color: 'var(--color-text-warning)' }}>
          reply soon or template will be needed
        </span>
      )}
    </div>
  );
}

// ───────────────── Filter button + popover ─────────────────

const TRIAGE_OPTIONS: { value: 'all' | 'unread' | 'review' | 'open' | 'done'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'review', label: 'Review' },
  { value: 'open', label: 'Open' },
  { value: 'done', label: 'Done' },
];

const STAY_OPTIONS: { value: 'all' | StayStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'inquiry', label: 'Inquiry' },
  { value: 'booked', label: 'Booked' },
  { value: 'currently_staying', label: 'Currently staying' },
  { value: 'checked_out', label: 'Checked out' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'na', label: 'No reservation (owner / vendor)' },
];

function FilterButton({
  triageFilter,
  setTriageFilter,
  stayFilter,
  setStayFilter,
  mentionsOnly,
  setMentionsOnly,
  open,
  setOpen,
  activeCount,
}: {
  triageFilter: 'all' | 'unread' | 'review' | 'open' | 'done';
  setTriageFilter: (v: 'all' | 'unread' | 'review' | 'open' | 'done') => void;
  stayFilter: 'all' | StayStatus;
  setStayFilter: (v: 'all' | StayStatus) => void;
  mentionsOnly: boolean;
  setMentionsOnly: (v: boolean) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  activeCount: number;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <button
        className={'btn ghost sm' + (open || activeCount > 0 ? ' active' : '')}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        title="Filter threads"
        style={{
          background: activeCount > 0 ? 'var(--color-background-tertiary)' : undefined,
          color: activeCount > 0 ? 'var(--color-brand-accent)' : undefined,
        }}
      >
        <IconFilter size={14} />
        {activeCount > 0 && (
          <span
            className="mono"
            style={{
              fontSize: 10,
              marginLeft: 4,
              padding: '0 5px',
              borderRadius: 8,
              background: 'var(--color-brand-accent)',
              color: 'white',
            }}
          >
            {activeCount}
          </span>
        )}
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setOpen(false)} />
          <div
            className="fad-dropdown"
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 4,
              minWidth: 280,
              maxWidth: 'calc(100vw - 24px)',
              padding: 14,
              zIndex: 10,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <FilterGroup label="Triage status">
              <FilterPills
                options={TRIAGE_OPTIONS}
                value={triageFilter}
                onChange={setTriageFilter}
              />
            </FilterGroup>
            <FilterGroup label="Stay status">
              <FilterPills
                options={STAY_OPTIONS}
                value={stayFilter}
                onChange={setStayFilter}
              />
            </FilterGroup>
            <FilterGroup label="Mentions">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={mentionsOnly}
                  onChange={(e) => setMentionsOnly(e.target.checked)}
                />
                Only threads where I'm @mentioned
              </label>
            </FilterGroup>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '0.5px solid var(--color-border-tertiary)' }}>
              <button
                className="btn ghost sm"
                onClick={() => {
                  setTriageFilter('all');
                  setStayFilter('all');
                  setMentionsOnly(false);
                }}
                disabled={activeCount === 0}
              >
                Clear all
              </button>
              <button className="btn primary sm" onClick={() => setOpen(false)} style={{ marginLeft: 'auto' }}>
                Done
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--color-text-tertiary)',
          fontWeight: 500,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function FilterPills<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={'inbox-chip' + (value === o.value ? ' active' : '')}
          style={{ fontSize: 11 }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ───────────────── Internal notes (team-only) ─────────────────

function InternalNoteBubble({ note }: { note: InternalNote }) {
  const author = TASK_USER_BY_ID[note.authorId];
  return (
    <div
      style={{
        margin: '12px 0',
        padding: 12,
        background: 'var(--color-bg-warning)',
        border: '0.5px solid var(--color-text-warning)',
        borderRadius: 8,
        fontSize: 13,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 6,
          fontSize: 11,
          fontWeight: 500,
          color: 'var(--color-text-warning)',
        }}
      >
        <span>🔒</span>
        <span style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Internal note · team only</span>
        <span style={{ marginLeft: 'auto', fontWeight: 400, color: 'var(--color-text-tertiary)' }}>
          {note.authorName} · {formatNoteTime(note.createdAt)}
        </span>
      </div>
      <div style={{ color: 'var(--color-text-primary)', lineHeight: 1.5 }}>
        {renderNoteWithMentions(note.body)}
      </div>
    </div>
  );
}

function InternalNoteCompose({
  threadId,
  draft,
  setDraft,
  mentions,
  setMentions,
  authorId,
  onPosted,
  onSwitchToReply,
  replyEntity,
}: {
  threadId: string;
  draft: string;
  setDraft: (v: string) => void;
  mentions: string[];
  setMentions: (v: string[]) => void;
  authorId: string;
  onPosted: () => void;
  onSwitchToReply: () => void;
  replyEntity: InboxEntity;
}) {
  const [mentionPickerOpen, setMentionPickerOpen] = useState(false);
  const candidateMentions = TASK_USERS.filter((u) => u.role !== 'external' && u.active && u.id !== authorId);
  const author = TASK_USER_BY_ID[authorId];

  const insertMention = (userId: string) => {
    const u = TASK_USER_BY_ID[userId];
    if (!u) return;
    setDraft(draft + (draft.endsWith(' ') || draft.length === 0 ? '' : ' ') + `@${u.name} `);
    if (!mentions.includes(userId)) setMentions([...mentions, userId]);
    setMentionPickerOpen(false);
  };

  const post = () => {
    const text = draft.trim();
    if (!text) return;
    const note: InternalNote = {
      id: `note-${Date.now()}`,
      threadId,
      authorId,
      authorName: author?.name ?? 'Unknown',
      body: text,
      mentions,
      createdAt: new Date().toISOString(),
    };
    // Local-only optimistic write until POST /api/inbox/threads/:id/notes
    // ships in Tier E. Fixture array purged 2026-05-13 (design-be-19),
    // so the push starts from an empty list each session — fine for now;
    // notes don't persist anywhere yet.
    INBOX_INTERNAL_NOTES.push(note);
    fireToast(
      mentions.length > 0
        ? `Internal note posted · ${mentions.length} teammate${mentions.length === 1 ? '' : 's'} notified`
        : 'Internal note posted',
    );
    onPosted();
  };

  return (
    <div style={{ background: 'var(--color-bg-warning)', borderRadius: 6, padding: 10, margin: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, position: 'relative' }}>
        <span style={{ fontSize: 11, color: 'var(--color-text-warning)', fontWeight: 500 }}>
          🔒 Internal note · only your team can see this
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => setMentionPickerOpen((v) => !v)}
            title="Tag a teammate"
          >
            @ Mention
          </button>
          {/* Explicit X close — discoverable affordance to drop the note
              and go back to replying to the guest. The "← Switch to reply"
              link at the bottom row does the same but isn't obviously a
              close. */}
          <button
            type="button"
            onClick={onSwitchToReply}
            title="Close internal note and go back to reply"
            aria-label="Close internal note"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '2px 6px',
              fontSize: 16,
              lineHeight: 1,
              color: 'var(--color-text-warning)',
              marginLeft: 4,
            }}
          >
            ×
          </button>
        </span>
        {mentionPickerOpen && (
          <>
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 9 }}
              onClick={() => setMentionPickerOpen(false)}
            />
            <div
              className="fad-dropdown"
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 4,
                minWidth: 200,
                maxHeight: 240,
                overflowY: 'auto',
                zIndex: 10,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {candidateMentions.map((u) => (
                <button
                  key={u.id}
                  className="fad-dropdown-item"
                  onClick={() => insertMention(u.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}
                >
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      background: u.avatarColor,
                      color: 'white',
                      fontSize: 9,
                      fontWeight: 500,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {u.initials}
                  </span>
                  {u.name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Tag a teammate (@) and explain what you need…"
        style={{
          width: '100%',
          minHeight: 70,
          padding: 8,
          fontSize: 13,
          fontFamily: 'inherit',
          border: '0.5px solid var(--color-text-warning)',
          borderRadius: 4,
          background: 'var(--color-background-primary)',
          marginBottom: 8,
        }}
      />
      {mentions.length > 0 && (
        <div style={{ marginBottom: 8, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          Will notify:{' '}
          {mentions.map((id, i) => (
            <span key={id} style={{ color: 'var(--color-text-warning)', fontWeight: 500 }}>
              {i > 0 && ', '}
              {TASK_USER_BY_ID[id]?.name.split(' ')[0]}
            </span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
        <button
          type="button"
          className="btn ghost sm"
          onClick={onSwitchToReply}
          style={{ marginRight: 'auto', fontSize: 11 }}
        >
          ← Switch to reply to {replyEntity}
        </button>
        <button className="btn ghost sm" onClick={() => setDraft('')}>
          Clear
        </button>
        <button
          className="btn primary sm"
          onClick={post}
          disabled={!draft.trim()}
          style={{
            background: draft.trim() ? 'var(--color-text-warning)' : undefined,
            borderColor: draft.trim() ? 'var(--color-text-warning)' : undefined,
          }}
        >
          Post note
        </button>
      </div>
    </div>
  );
}

function renderNoteWithMentions(text: string): React.ReactNode {
  const parts = text.split(/(@[A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)/g);
  return parts.map((p, i) =>
    p.startsWith('@') ? (
      <span
        key={i}
        style={{
          color: 'var(--color-text-warning)',
          background: 'var(--color-bg-warning)',
          padding: '0 4px',
          borderRadius: 3,
          fontWeight: 500,
        }}
      >
        {p}
      </span>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

function formatNoteTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date('2026-04-27');
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function SendByMenu({
  channel,
  entity,
  canAskFriday,
  onAskFriday,
  onSwitchToNote,
  onClose,
}: {
  channel: string;
  entity: InboxEntity;
  canAskFriday: boolean;
  onAskFriday: () => void;
  onSwitchToNote: () => void;
  onClose: () => void;
}) {
  void channel;
  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 15 }}
        onClick={onClose}
      />
      <div className="send-split-menu" onClick={(e) => e.stopPropagation()}>
        {/* Ask Friday — typed text goes to consult instead of the guest.
            Disabled when the textarea is empty; we need something to
            ask. Top of the menu because it's the most common
            non-default action. */}
        <button
          className="send-split-item"
          onClick={canAskFriday ? onAskFriday : undefined}
          disabled={!canAskFriday}
          style={canAskFriday ? undefined : { opacity: 0.5, cursor: 'not-allowed' }}
        >
          <IconSparkle size={14} />
          <div className="lab">
            Ask Friday
            <div className="desc">{canAskFriday ? 'Open Friday Consult with this text' : 'Type something first'}</div>
          </div>
        </button>
        <div className="send-split-divider" />
        <button
          className="send-split-item"
          onClick={() => { onClose(); fireToast('Schedule send lands in a follow-up sprint'); }}
        >
          <IconClock size={14} />
          <div className="lab">
            Schedule send
            <div className="desc">Pick a date + time · coming soon</div>
          </div>
        </button>
        <button
          className="send-split-item"
          onClick={() => { onClose(); fireToast('WhatsApp template picker lands in a follow-up sprint'); }}
        >
          <span style={{ width: 14, textAlign: 'center', fontSize: 12 }}>💬</span>
          <div className="lab">
            Send WhatsApp template
            <div className="desc">Pre-approved templates · coming soon</div>
          </div>
        </button>
        <button
          className="send-split-item"
          onClick={() => { onClose(); fireToast(`"Send when ${entity} is awake" lands in a follow-up sprint`); }}
        >
          <IconSparkle size={14} />
          <div className="lab">
            Send when {entity} is awake
            <div className="desc">8am–10pm local time · coming soon</div>
          </div>
        </button>
        <div className="send-split-divider" />
        <button className="send-split-item" onClick={onSwitchToNote}>
          <span style={{ width: 14, textAlign: 'center', fontSize: 12 }}>🔒</span>
          <div className="lab">
            Post as internal note
            <div className="desc">Team-only · guest never sees this</div>
          </div>
        </button>
      </div>
    </>
  );
}
