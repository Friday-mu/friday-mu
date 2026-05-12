'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  INBOX_INTERNAL_NOTES,
  INBOX_THREADS,
  type InboxEntity,
  type InboxThread,
  type InternalNote,
  type StayStatus,
} from '../../_data/fixtures';
import { useLiveConversations, useThreadDetail } from '../../_data/inboxClient';
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
  const [consultOpen, setConsultOpen] = useState(false);
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
  const { threads: liveThreads, loading: inboxLoading, error: inboxError } = useLiveConversations();
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
    if (triageFilter === 'review' && t.triageStatus !== 'review') return false;
    if (triageFilter === 'open' && t.triageStatus !== 'open') return false;
    if (triageFilter === 'done' && t.triageStatus !== 'done') return false;
    if (stayFilter !== 'all' && t.stayStatus !== stayFilter) return false;
    if (mentionsOnly && !t.mentionsMe) return false;
    return true;
  });

  // Thread shown in the detail pane. List response gives summary metadata only;
  // useThreadDetail lazily fetches full messages + reservation when selection
  // changes. Falls back to the list-version while detail loads so the pane
  // doesn't blank between selections.
  const listThread = filtered.find((t) => t.id === selected) || filtered[0] || sourceThreads[0];
  const { thread: detailThread } = useThreadDetail(listThread?.id ?? null);
  const thread = detailThread || listThread;
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
      <button className="btn primary sm">
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
              <span className="row-time">{t.time}</span>
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
          <div className="inbox-thread-body">
            <div className="msg-bubble them">
              <div className="msg-meta">
                {thread.guest} · {thread.time}
                {translateOn && thread.language && thread.language !== 'EN' && (
                  <span style={{ marginLeft: 8, color: 'var(--color-brand-accent)' }}>
                    translated from {thread.language}
                  </span>
                )}
              </div>
              <div className="msg-body">{thread.messages?.[0]?.body || thread.preview}</div>
            </div>

            {/* Internal notes — visible to team only, not to the guest */}
            {INBOX_INTERNAL_NOTES.filter((n) => n.threadId === thread.id).map((n) => (
              <InternalNoteBubble key={n.id} note={n} />
            ))}

            <div className="msg-bubble us">
              <div className="msg-meta">You · draft</div>
              <div className="msg-body" style={{ fontStyle: 'italic', opacity: 0.85 }}>
                Drafting a reply… use <span className="mono">⌘K</span> to ask Friday to draft.
              </div>
            </div>
          </div>
          {consultOpen && (
            <FridayConsult
              key={selected}
              threadScope={thread.guest}
              autoPrompt="Summarize what this guest is asking and suggest a reply angle"
              onClose={() => setConsultOpen(false)}
            />
          )}
          <div
            className={
              'inbox-compose' + (isMobile && composeCollapsed ? ' mobile-collapsed' : '')
            }
          >
            {isMobile && composeCollapsed && (
              <div
                className="inbox-compose-collapsed-bar"
                onClick={() => setComposeCollapsed(false)}
              >
                <IconSend size={12} />
                <span style={{ flex: 1, marginLeft: 8 }}>Tap to reply to {thread.guest}</span>
                <IconChevron size={10} />
              </div>
            )}
            {isMobile && !composeCollapsed && (
              <button
                className="inbox-compose-collapse-btn"
                onClick={() => setComposeCollapsed(true)}
                title="Minimize"
                style={{ float: 'right', marginBottom: -24 }}
              >
                ×
              </button>
            )}
            {composeMode === 'reply' ? (
              <>
                <div className="inbox-compose-toolbar">
                  <button
                    className={'btn ghost sm' + (consultOpen ? ' primary' : '')}
                    onClick={() => setConsultOpen((v) => !v)}
                  >
                    <IconSparkle size={12} /> Friday Consult
                  </button>
                  <button className="btn ghost sm">
                    <IconPaperclip size={12} /> Attach
                  </button>
                </div>
                <textarea
                  className="inbox-compose-textarea"
                  placeholder="Write a reply…"
                  defaultValue={
                    thread.id === 't1'
                      ? 'Bonjour Thibault — confirming Ravi will meet you at SSR arrivals at 15:20 with a Friday sign. Early check-in 14:30 approved. À tout bientôt, Friday team.'
                      : ''
                  }
                />
                <div
                  className="inbox-compose-actions"
                  style={{ position: 'relative', justifyContent: 'space-between' }}
                >
                  <button className="btn ghost">
                    <IconAI size={12} /> Polish with Friday
                  </button>
                  <div className="send-split">
                    <button className="send-split-main" onClick={() => setSendMenuOpen(false)}>
                      <IconSend size={12} /> Send
                    </button>
                    <button
                      className="send-split-caret"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSendMenuOpen((v) => !v);
                      }}
                      aria-haspopup="menu"
                      aria-expanded={sendMenuOpen}
                    >
                      ▾
                    </button>
                    {sendMenuOpen && (
                      <SendByMenu
                        channel={thread.channel}
                        entity={thread.entity}
                        onSwitchToNote={() => {
                          setComposeMode('note');
                          setSendMenuOpen(false);
                        }}
                        onClose={() => setSendMenuOpen(false)}
                      />
                    )}
                  </div>
                </div>
              </>
            ) : (
              <InternalNoteCompose
                threadId={thread.id}
                draft={noteDraft}
                setDraft={setNoteDraft}
                mentions={noteMentions}
                setMentions={setNoteMentions}
                onPosted={() => {
                  setNoteDraft('');
                  setNoteMentions([]);
                  setNotesRev((n) => n + 1);
                }}
                onSwitchToReply={() => setComposeMode('reply')}
                replyEntity={thread.entity}
                authorId={currentUserId}
              />
            )}
          </div>
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
          <div className="inbox-right-section">
            <h4>Reservation</h4>
            <div className="inbox-right-row">
              <span className="label">Property</span>
              <span className="value">VAZ</span>
            </div>
            <div className="inbox-right-row">
              <span className="label">Check-in</span>
              <span className="value">Apr 17</span>
            </div>
            <div className="inbox-right-row">
              <span className="label">Check-out</span>
              <span className="value">Apr 24</span>
            </div>
            <div className="inbox-right-row">
              <span className="label">Guests</span>
              <span className="value">2A + 2C</span>
            </div>
            <div className="inbox-right-row">
              <span className="label">Total</span>
              <span className="value">€ 2,940</span>
            </div>
          </div>
          <div className="inbox-right-section">
            <h4>Guest</h4>
            <div className="inbox-right-row">
              <span className="label">Stays with us</span>
              <span className="value">2nd</span>
            </div>
            <div className="inbox-right-row">
              <span className="label">Language</span>
              <span className="value">FR</span>
            </div>
            <div className="inbox-right-row">
              <span className="label">Prev rating</span>
              <span className="value">5.0</span>
            </div>
          </div>
          <div className="inbox-right-section">
            <h4>Suggested actions</h4>
            <button
              className="btn sm"
              style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 6 }}
            >
              <IconCheck size={12} /> Confirm airport transfer
            </button>
            <button
              className="btn sm"
              style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 6 }}
            >
              <IconCheck size={12} /> Approve 14:30 early check-in
            </button>
            <button
              className="btn sm"
              style={{ width: '100%', justifyContent: 'flex-start' }}
              onClick={onAskFriday}
            >
              <IconSparkle size={12} /> Ask Friday to draft reply
            </button>
          </div>
        </div>
      </div>
    </div>
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
    // @demo:logic — Tag: PROD-LOGIC-10 — see frontend/DEMO_CRUFT.md
    // Mock mutation. Replace with: POST /api/inbox/threads/:id/notes.
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
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => setMentionPickerOpen((v) => !v)}
            title="Tag a teammate"
          >
            @ Mention
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
  onSwitchToNote,
  onClose,
}: {
  channel: string;
  entity: InboxEntity;
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
        <button className="send-split-item" onClick={onClose}>
          <IconClock size={14} />
          <div className="lab">
            Schedule send
            <div className="desc">Pick a date + time</div>
          </div>
        </button>
        <button className="send-split-item" onClick={onClose}>
          <IconSparkle size={14} />
          <div className="lab">
            Send when {entity} is awake
            <div className="desc">8am–10pm local time</div>
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
