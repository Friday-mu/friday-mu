'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  TEAM_MESSAGES,
  type ChannelKey,
  type TeamCallMeta,
  type TeamDM,
  type TeamMessage,
} from '../../../_data/teamInbox';
import {
  useChannels,
  useDms,
  useTeamMessages,
  useMessageReplies,
  addReaction,
  removeReaction,
  type LiveChannel,
  type LiveDm,
  type LiveTeamMessage,
} from '../../../_data/teamInboxClient';
import { TASK_USER_BY_ID, type TaskUser } from '../../../_data/tasks';
import { useCurrentUserId, usePermissions } from '../../usePermissions';
import { IconCal, IconPaperclip, IconPlus, IconSend, IconSparkle, IconUsers } from '../../icons';
import { ScheduleCallDrawer } from './ScheduleCallDrawer';
import { fireToast } from '../../Toaster';

type Selection =
  | { kind: 'channel'; channelKey: ChannelKey }
  | { kind: 'dm'; dm: TeamDM };

export function TeamInbox({
  mentionsOnly = false,
  isMobile = false,
  mobileThreadOpen = false,
  onMobileThreadOpenChange,
}: {
  mentionsOnly?: boolean;
  isMobile?: boolean;
  mobileThreadOpen?: boolean;
  onMobileThreadOpenChange?: (open: boolean) => void;
}) {
  // role/permissions still wired but no longer used for channel filtering —
  // backend enforces channel visibility via membership table. Kept here
  // because other surfaces (compose toolbar, send permissions) may need
  // them in follow-ups.
  const _perms = usePermissions();
  void _perms;
  const currentUserId = useCurrentUserId();

  // Live data from /api/team/* (polled every 30s for unread badges).
  const { channels: liveChannels } = useChannels();
  const { dms: liveDms } = useDms();

  const visibleChannels: LiveChannel[] = useMemo(
    () => liveChannels ?? [],
    [liveChannels],
  );
  // LiveDm is a superset of fixture TeamDM; convert for downstream compat.
  const visibleDms: TeamDM[] = useMemo(
    () => (liveDms ?? [])
      .filter((d: LiveDm) => d.participantIds.includes(currentUserId))
      .map((d: LiveDm) => ({ id: d.id, participantIds: d.participantIds, unread: d.unread })),
    [liveDms, currentUserId],
  );

  const [selection, setSelection] = useState<Selection | null>(null);
  // Auto-select the first available channel once data lands. Switches
  // to a different channel/DM are explicit user actions thereafter.
  useEffect(() => {
    if (selection !== null) return;
    if (visibleChannels[0]) {
      setSelection({ kind: 'channel', channelKey: visibleChannels[0].key });
    } else if (visibleDms[0]) {
      setSelection({ kind: 'dm', dm: visibleDms[0] });
    }
  }, [visibleChannels, visibleDms, selection]);

  const [draft, setDraft] = useState('');
  const [callOpen, setCallOpen] = useState(false);

  // Resolve the selected channel's database id so the messages hook
  // can fetch via /api/team/channels/:id/messages (the API takes the
  // UUID, not the channel_key).
  const selectedChannel = selection?.kind === 'channel'
    ? visibleChannels.find((c) => c.key === selection.channelKey) || null
    : null;
  const messagesTarget = selection
    ? selection.kind === 'channel'
      ? (selectedChannel ? { kind: 'channel' as const, id: selectedChannel.id } : null)
      : { kind: 'dm' as const, id: selection.dm.id }
    : null;

  const { messages: liveMessages, send: sendLive, refetch: refetchMessages } = useTeamMessages(messagesTarget);

  // Open thread state — when set, an inline ThreadSurface renders below
  // the matching parent message. Reset on selection change so switching
  // channels doesn't leave a stale surface open against the wrong context.
  const [openThreadParentId, setOpenThreadParentId] = useState<string | null>(null);
  useEffect(() => { setOpenThreadParentId(null); }, [selection?.kind, selection?.kind === 'channel' ? selection.channelKey : selection?.kind === 'dm' ? selection.dm.id : null]);

  const threadTarget = useMemo(() => {
    if (!openThreadParentId || !messagesTarget) return null;
    return {
      kind: messagesTarget.kind,
      parentId: openThreadParentId,
      targetId: messagesTarget.id,
    };
  }, [openThreadParentId, messagesTarget]);
  const { replies: threadReplies, send: sendThreadReply } = useMessageReplies(threadTarget);

  const messages: TeamMessage[] = useMemo(() => {
    let msgs: TeamMessage[] = (liveMessages ?? []).map((m): TeamMessage => ({
      id: m.id,
      channelKey: m.channelKey,
      dmId: m.dmId,
      authorId: m.authorId || '',
      text: m.text,
      ts: m.ts,
      mentions: m.mentions,
      kind: m.kind,
      parentMessageId: m.parentMessageId,
      threadCount: m.replyCount,
      // Pass-through extras when present in meta (call/task-link fixtures).
      callMeta: (m.meta as { call?: TeamCallMeta })?.call,
    }));
    if (mentionsOnly) {
      msgs = msgs.filter((m) => m.mentions?.includes(currentUserId));
    }
    return msgs;
  }, [liveMessages, mentionsOnly, currentUserId]);

  // Separate Map from messageId → reactions so the existing TeamMessage
  // shape doesn't need to grow a reactions field. Built from liveMessages
  // and re-derived when the message list re-fetches. Optimistically
  // mutated on add/remove (sync with server on next poll).
  const [reactionOverride, setReactionOverride] = useState<Record<string, Record<string, string[]>>>({});
  const reactionsByMessageId: Record<string, Record<string, string[]>> = useMemo(() => {
    const out: Record<string, Record<string, string[]>> = {};
    (liveMessages ?? []).forEach((m) => {
      out[m.id] = reactionOverride[m.id] ?? m.reactions ?? {};
    });
    return out;
  }, [liveMessages, reactionOverride]);

  const messageKind: 'channel' | 'dm' = selection?.kind === 'dm' ? 'dm' : 'channel';

  const handleAddReaction = async (messageId: string, emoji: string) => {
    // Optimistic: add current user to the emoji list immediately.
    setReactionOverride((prev) => {
      const cur = prev[messageId] ?? reactionsByMessageId[messageId] ?? {};
      const list = new Set(cur[emoji] ?? []);
      list.add(currentUserId);
      return { ...prev, [messageId]: { ...cur, [emoji]: Array.from(list) } };
    });
    try {
      await addReaction(messageKind, messageId, emoji);
    } catch (e) {
      fireToast(e instanceof Error ? e.message : 'Reaction failed');
      // Rollback on failure
      setReactionOverride((prev) => {
        const cur = prev[messageId] ?? {};
        const list = (cur[emoji] ?? []).filter((u) => u !== currentUserId);
        const next = { ...cur, [emoji]: list };
        if (list.length === 0) delete next[emoji];
        return { ...prev, [messageId]: next };
      });
    }
  };

  const handleRemoveReaction = async (messageId: string, emoji: string) => {
    setReactionOverride((prev) => {
      const cur = prev[messageId] ?? reactionsByMessageId[messageId] ?? {};
      const list = (cur[emoji] ?? []).filter((u) => u !== currentUserId);
      const next = { ...cur };
      if (list.length === 0) delete next[emoji];
      else next[emoji] = list;
      return { ...prev, [messageId]: next };
    });
    try {
      await removeReaction(messageKind, messageId, emoji);
    } catch (e) {
      fireToast(e instanceof Error ? e.message : 'Reaction remove failed');
    }
  };

  const sendMessage = () => {
    const text = draft.trim();
    if (!text || !selection) return;
    // Fire and forget — the hook does optimistic append + refetch.
    sendLive(text);
    setDraft('');
  };

  const targetTitle = selection?.kind === 'channel'
    ? selectedChannel?.name ?? '#unknown'
    : selection?.kind === 'dm' ? dmTitle(selection.dm, currentUserId) : '';

  const targetSubtitle = selection?.kind === 'channel'
    ? selectedChannel?.purpose ?? ''
    : selection?.kind === 'dm'
      ? `Direct message · ${selection.dm.participantIds.length === 2 ? '1:1' : 'group'}`
      : '';

  // Channel member list lives behind GET /api/team/channels/:id (detail);
  // for v1 ScheduleCallDrawer we don't pre-populate invitees from the
  // channel — operator picks them. DMs still pre-fill participants.
  const defaultInviteeIds = selection?.kind === 'dm'
    ? selection.dm.participantIds
    : [];

  const openSelection = (next: Selection) => {
    setSelection(next);
    if (isMobile) onMobileThreadOpenChange?.(true);
  };

  // No channels and no DMs visible → render a single empty state instead of
  // showing the chrome around an "#unknown" placeholder channel. Demo
  // fixtures were purged 2026-05-13 (design-be-19); the live team-channels
  // surface lands with Tier E (bw-7/8/9).
  if (visibleChannels.length === 0 && visibleDms.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 40,
          textAlign: 'center',
          color: 'var(--color-text-tertiary)',
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        <div>
          No team channels or DMs yet.
          <br />
          <span style={{ fontSize: 12 }}>
            Internal team chat lands with the next inbox sprint.
          </span>
        </div>
      </div>
    );
  }

  // Brief loading window: channels list returned non-empty but useEffect
  // hasn't auto-selected yet (single render frame typically).
  if (!selection) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 40,
          color: 'var(--color-text-tertiary)',
          fontSize: 13,
        }}
      >
        Loading team chat…
      </div>
    );
  }

  return (
    <>
      <div
        className={'inbox-split' + (mobileThreadOpen ? ' thread-open' : '')}
        style={{ flex: 1 }}
      >
        {/* Left rail — channels + DMs */}
        <div className="inbox-list" style={{ minWidth: 220, maxWidth: 280 }}>
          <div
            style={{
              padding: '12px 14px 6px',
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--color-text-tertiary)',
              fontWeight: 500,
            }}
          >
            Channels
          </div>
          {visibleChannels.map((c) => {
            const isSel = selection.kind === 'channel' && selection.channelKey === c.key;
            return (
              <button
                key={c.id}
                className={'row' + (isSel ? ' selected' : '') + ((c.unread ?? 0) > 0 ? ' unread' : '')}
                onClick={() => openSelection({ kind: 'channel', channelKey: c.key })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 14px',
                  width: '100%',
                  textAlign: 'left',
                  background: isSel ? 'var(--color-background-tertiary)' : 'transparent',
                  border: 0,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: (c.unread ?? 0) > 0 ? 500 : 400,
                  color: 'var(--color-text-primary)',
                }}
              >
                <span style={{ flex: 1 }}>{c.name}</span>
                {(c.unread ?? 0) > 0 && (
                  <span
                    className="chip"
                    style={{ fontSize: 10, padding: '1px 6px', background: 'var(--color-brand-accent)', color: 'white' }}
                  >
                    {c.unread}
                  </span>
                )}
              </button>
            );
          })}

          <div
            style={{
              padding: '14px 14px 6px',
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--color-text-tertiary)',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{ flex: 1 }}>Direct messages</span>
            <button
              className="fad-util-btn"
              style={{ width: 22, height: 22 }}
              title="New DM"
              onClick={() => fireToast('New DM creation lands in T6 polish')}
            >
              <IconPlus size={10} />
            </button>
          </div>
          {visibleDms.length === 0 && (
            <div style={{ padding: '6px 14px', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              No DMs yet
            </div>
          )}
          {visibleDms.map((dm) => {
            const isSel = selection.kind === 'dm' && selection.dm.id === dm.id;
            return (
              <button
                key={dm.id}
                className={'row' + (isSel ? ' selected' : '')}
                onClick={() => openSelection({ kind: 'dm', dm })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 14px',
                  width: '100%',
                  textAlign: 'left',
                  background: isSel ? 'var(--color-background-tertiary)' : 'transparent',
                  border: 0,
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                <DmAvatars dm={dm} currentUserId={currentUserId} />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {dmTitle(dm, currentUserId)}
                </span>
                {(dm.unread ?? 0) > 0 && (
                  <span
                    className="chip"
                    style={{ fontSize: 10, padding: '1px 6px', background: 'var(--color-brand-accent)', color: 'white' }}
                  >
                    {dm.unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right pane — messages + compose */}
        <div className="inbox-thread">
          <div className="inbox-thread-header">
            <button
              className="btn ghost sm inbox-mobile-back"
              onClick={() => onMobileThreadOpenChange?.(false)}
              style={{ marginBottom: 8 }}
            >
              ← Back to channels
            </button>
            <div className="inbox-thread-subject" style={{ fontSize: 16 }}>
              {targetTitle}
            </div>
            <div className="inbox-thread-meta" style={{ marginBottom: 4 }}>
              <span>{targetSubtitle}</span>
              {selection.kind === 'channel' && selectedChannel && (
                <>
                  <span className="sep">·</span>
                  <span>
                    <IconUsers size={11} />{' '}
                    {selectedChannel.visibility === 'private' ? 'Private' : 'Everyone'}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="inbox-thread-body">
            {messages.length === 0 && (
              <div
                style={{
                  padding: 24,
                  fontSize: 13,
                  color: 'var(--color-text-tertiary)',
                  textAlign: 'center',
                }}
              >
                No messages yet. Be the first to post.
              </div>
            )}
            {messages.map((m) => {
              const author = TASK_USER_BY_ID[m.authorId];
              const threadOpen = openThreadParentId === m.id;
              if (m.kind === 'call_scheduled' && m.callMeta) {
                return <CallMessage key={m.id} message={m} author={author} />;
              }
              if (m.kind === 'roster_publish') {
                return <SystemMessage key={m.id} icon="🤖" title="Roster published" body={m.text} ts={m.ts} author={author} />;
              }
              return (
                <div key={m.id}>
                  <TextMessage
                    message={m}
                    author={author}
                    reactions={reactionsByMessageId[m.id] ?? {}}
                    currentUserId={currentUserId}
                    onAddReaction={(emoji) => handleAddReaction(m.id, emoji)}
                    onRemoveReaction={(emoji) => handleRemoveReaction(m.id, emoji)}
                    onOpenThread={() => setOpenThreadParentId(threadOpen ? null : m.id)}
                    threadOpen={threadOpen}
                  />
                  {threadOpen && (
                    <ThreadSurface
                      parentId={m.id}
                      replies={threadReplies ?? []}
                      currentUserId={currentUserId}
                      onSend={async (text) => {
                        const msg = await sendThreadReply(text);
                        if (msg) {
                          // Bump the parent's threadCount badge without
                          // waiting for the 15s poll cycle.
                          refetchMessages();
                        }
                        return !!msg;
                      }}
                      onClose={() => setOpenThreadParentId(null)}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="inbox-compose">
            <div className="inbox-compose-toolbar">
              <button
                className="btn ghost sm"
                onClick={() => setCallOpen(true)}
                title="Schedule a call"
              >
                <IconCal size={12} /> Schedule call
              </button>
              <button className="btn ghost sm" title="Attach a file">
                <IconPaperclip size={12} /> Attach
              </button>
              <button className="btn ghost sm" title="Insert mention">
                @ Mention
              </button>
              <span
                className="mono"
                style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-tertiary)' }}
              >
                {targetTitle}
              </span>
            </div>
            <textarea
              className="inbox-compose-textarea"
              placeholder={`Message ${targetTitle}…`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />
            <div className="inbox-compose-actions" style={{ justifyContent: 'space-between' }}>
              <button className="btn ghost">
                <IconSparkle size={12} /> Polish with Friday
              </button>
              <button className="btn primary" onClick={sendMessage} disabled={!draft.trim()}>
                <IconSend size={12} /> Send
              </button>
            </div>
          </div>
        </div>
      </div>

      <ScheduleCallDrawer
        open={callOpen}
        onClose={() => setCallOpen(false)}
        target={selection.kind === 'channel'
          ? { kind: 'channel', channelKey: selection.channelKey }
          : { kind: 'dm', dmId: selection.dm.id, participantIds: selection.dm.participantIds }}
        defaultInviteeIds={defaultInviteeIds}
        onScheduled={() => {
          // Refetch the active thread so the just-scheduled call
          // message appears. Hook owns the polling cadence; manual
          // refetch on a known mutation is a UX nicety.
          // (The 15s poll would also pick it up.)
        }}
      />
    </>
  );
}

// ───────────────── Message components ─────────────────

// Semantic reaction set per Ishant 2026-05-17:
//   👀 — "I'm looking / on it"
//   ✅ — "Done"
//   🙋 — "Need help"
// Three with distinct meanings, not a Slack-style emoji free-for-all.
// To add a 4th, update VALID_REACTIONS in backend too.
const REACTION_SET = ['👀', '✅', '🙋'] as const;
const REACTION_LABEL: Record<string, string> = {
  '👀': 'I\'m looking',
  '✅': 'Done',
  '🙋': 'Need help',
};

function TextMessage({
  message,
  author,
  reactions,
  currentUserId,
  onAddReaction,
  onRemoveReaction,
  onOpenThread,
  threadOpen,
  compact,
}: {
  message: TeamMessage;
  author?: TaskUser;
  reactions?: Record<string, string[]>;
  currentUserId?: string;
  onAddReaction?: (emoji: string) => void;
  onRemoveReaction?: (emoji: string) => void;
  /** When provided, message gets a hover "Reply" affordance + the
   *  thread-count badge becomes clickable. Omit inside the thread
   *  itself (replies don't have their own threads). */
  onOpenThread?: () => void;
  threadOpen?: boolean;
  /** Replies in the thread surface render tighter (smaller avatars,
   *  reduced padding). */
  compact?: boolean;
}) {
  const [hovering, setHovering] = useState(false);
  const reactionEntries = Object.entries(reactions ?? {})
    .filter(([_, users]) => users.length > 0)
    .sort(([a], [b]) => REACTION_SET.indexOf(a as typeof REACTION_SET[number]) -
                        REACTION_SET.indexOf(b as typeof REACTION_SET[number]));

  return (
    <div
      className="msg-bubble them"
      style={{ maxWidth: 'unset', position: 'relative' }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="msg-meta" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {author && (
          <span
            style={{
              display: 'inline-block',
              width: 18,
              height: 18,
              borderRadius: 9,
              background: author.avatarColor,
              color: 'white',
              fontSize: 10,
              textAlign: 'center',
              lineHeight: '18px',
              fontWeight: 500,
            }}
          >
            {author.initials}
          </span>
        )}
        <span style={{ fontWeight: 500 }}>{author?.name ?? 'Unknown'}</span>
        <span style={{ color: 'var(--color-text-tertiary)' }}>· {formatTs(message.ts)}</span>
      </div>
      <div className="msg-body" style={{ whiteSpace: 'pre-wrap' }}>
        {renderMentions(message.text, message.mentions)}
      </div>
      {/* Aggregated reactions — one chip per emoji with count.
          Operator clicks their own chip to remove; clicks others to add. */}
      {reactionEntries.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
          {reactionEntries.map(([emoji, users]) => {
            const meReacted = !!currentUserId && users.includes(currentUserId);
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  if (meReacted && onRemoveReaction) onRemoveReaction(emoji);
                  else if (!meReacted && onAddReaction) onAddReaction(emoji);
                }}
                title={`${REACTION_LABEL[emoji] || emoji} · ${users.length} ${users.length === 1 ? 'person' : 'people'}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 6px',
                  fontSize: 11,
                  background: meReacted ? 'var(--color-background-accent-soft, rgba(56, 132, 255, 0.15))' : 'var(--color-background-secondary)',
                  border: `0.5px solid ${meReacted ? 'var(--color-brand-accent)' : 'var(--color-border-tertiary)'}`,
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                }}
              >
                <span>{emoji}</span>
                <span style={{ fontWeight: meReacted ? 600 : 400 }}>{users.length}</span>
              </button>
            );
          })}
        </div>
      )}
      {/* Hover picker — three semantic emojis + an optional "Reply in
          thread" button appear on top-right when hovering. */}
      {hovering && onAddReaction && (
        <div
          style={{
            position: 'absolute',
            top: -14,
            right: 8,
            display: 'flex',
            gap: 2,
            padding: '2px 4px',
            background: 'var(--color-background-primary)',
            border: '0.5px solid var(--color-border-secondary)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: '0 2px 8px rgba(15, 24, 54, 0.08)',
          }}
        >
          {REACTION_SET.map((emoji) => {
            const meReacted = !!currentUserId && (reactions?.[emoji] ?? []).includes(currentUserId);
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  if (meReacted && onRemoveReaction) onRemoveReaction(emoji);
                  else onAddReaction(emoji);
                }}
                title={REACTION_LABEL[emoji]}
                style={{
                  padding: '2px 4px',
                  fontSize: 14,
                  background: meReacted ? 'var(--color-background-accent-soft, rgba(56, 132, 255, 0.15))' : 'transparent',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  lineHeight: 1,
                }}
              >
                {emoji}
              </button>
            );
          })}
          {onOpenThread && (
            <button
              type="button"
              onClick={onOpenThread}
              title={threadOpen ? 'Close thread' : 'Reply in thread'}
              style={{
                padding: '2px 4px',
                fontSize: 12,
                background: threadOpen ? 'var(--color-background-accent-soft, rgba(56, 132, 255, 0.15))' : 'transparent',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                lineHeight: 1,
                marginLeft: 2,
                borderLeft: '0.5px solid var(--color-border-tertiary)',
                paddingLeft: 6,
                color: 'var(--color-text-secondary)',
              }}
            >
              💬
            </button>
          )}
        </div>
      )}
      {(message.threadCount ?? 0) > 0 && !compact && (
        <button
          type="button"
          onClick={onOpenThread}
          disabled={!onOpenThread}
          style={{
            marginTop: 4,
            padding: '2px 6px',
            fontSize: 11,
            color: 'var(--color-brand-accent)',
            background: threadOpen ? 'var(--color-background-accent-soft, rgba(56, 132, 255, 0.15))' : 'transparent',
            border: 'none',
            borderRadius: 4,
            cursor: onOpenThread ? 'pointer' : 'default',
            display: 'inline-block',
            fontWeight: 500,
          }}
        >
          💬 {message.threadCount} repl{message.threadCount === 1 ? 'y' : 'ies'}
          {threadOpen && ' · hide'}
        </button>
      )}
    </div>
  );
}

// Inline thread surface — renders below the parent message with replies
// in chronological order + a small compose. Reactions are not yet
// supported on replies (Slack-style "reply, then react in thread" is a
// Day 2-3 polish item); reply-to-reply nesting is disallowed by the
// backend (flat threads only).
function ThreadSurface({
  parentId: _parentId,
  replies,
  currentUserId,
  onSend,
  onClose,
}: {
  parentId: string;
  replies: LiveTeamMessage[];
  currentUserId: string;
  onSend: (text: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    const ok = await onSend(text);
    setSending(false);
    if (ok) setDraft('');
    else fireToast('Reply failed — try again');
  };
  return (
    <div
      style={{
        marginLeft: 24,
        marginTop: 6,
        marginBottom: 12,
        paddingLeft: 12,
        borderLeft: '2px solid var(--color-border-secondary)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 11,
          color: 'var(--color-text-tertiary)',
          marginBottom: 6,
        }}
      >
        <span style={{ fontWeight: 500 }}>
          Thread · {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
        </span>
        <button
          type="button"
          onClick={onClose}
          style={{
            marginLeft: 'auto',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-text-tertiary)',
            fontSize: 11,
            padding: '2px 4px',
          }}
        >
          Close ×
        </button>
      </div>
      {replies.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>
          No replies yet. Be the first.
        </div>
      )}
      {replies.map((r) => {
        const author = TASK_USER_BY_ID[r.authorId || ''];
        const msg: TeamMessage = {
          id: r.id,
          channelKey: r.channelKey,
          dmId: r.dmId,
          authorId: r.authorId || '',
          text: r.text,
          ts: r.ts,
          mentions: r.mentions,
          kind: r.kind,
          parentMessageId: r.parentMessageId,
        };
        return (
          <TextMessage
            key={r.id}
            message={msg}
            author={author}
            reactions={r.reactions}
            currentUserId={currentUserId}
            compact
          />
        );
      })}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Reply in thread…"
          rows={2}
          style={{
            flex: 1,
            fontSize: 13,
            padding: 8,
            border: '0.5px solid var(--color-border-tertiary)',
            borderRadius: 'var(--radius-sm)',
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
        <button
          className="btn primary sm"
          onClick={send}
          disabled={!draft.trim() || sending}
          style={{ alignSelf: 'flex-end' }}
        >
          <IconSend size={11} /> Reply
        </button>
      </div>
    </div>
  );
}

function CallMessage({ message, author }: { message: TeamMessage; author?: TaskUser }) {
  const meta = message.callMeta as TeamCallMeta;
  return (
    <div
      className="msg-bubble"
      style={{
        background: 'var(--color-background-secondary)',
        border: '0.5px solid var(--color-border-tertiary)',
        borderLeft: '3px solid var(--color-brand-accent)',
        padding: 12,
        borderRadius: 8,
        marginBottom: 8,
        maxWidth: 'unset',
      }}
    >
      <div className="msg-meta" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 14 }}>📅</span>
        <span style={{ fontWeight: 500 }}>Call scheduled</span>
        <span style={{ color: 'var(--color-text-tertiary)' }}>by {author?.name ?? 'Unknown'} · {formatTs(message.ts)}</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{meta.title}</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
        {formatStart(meta.startAt)}
      </div>
      <div style={{ fontSize: 12, marginBottom: 8 }}>
        Attendees:{' '}
        {meta.inviteeIds.map((id, i) => {
          const u = TASK_USER_BY_ID[id];
          return (
            <span key={id}>
              {i > 0 && ', '}
              {u?.name.split(' ')[0] ?? id}
            </span>
          );
        })}
        {meta.inviteeEmails && meta.inviteeEmails.length > 0 && (
          <span>, +{meta.inviteeEmails.length} external</span>
        )}
      </div>
      <a
        href={meta.meetUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="btn primary sm"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
      >
        Join Meet
      </a>
      <div style={{ marginTop: 6, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
        {meta.meetUrl}
      </div>
    </div>
  );
}

function SystemMessage({
  icon,
  title,
  body,
  ts,
  author,
}: {
  icon: string;
  title: string;
  body: string;
  ts: string;
  author?: TaskUser;
}) {
  return (
    <div
      style={{
        background: 'var(--color-background-secondary)',
        border: '0.5px dashed var(--color-border-tertiary)',
        padding: 10,
        borderRadius: 8,
        marginBottom: 8,
        fontSize: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span>{icon}</span>
        <span style={{ fontWeight: 500 }}>{title}</span>
        <span style={{ color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>
          {author?.name ?? 'system'} · {formatTs(ts)}
        </span>
      </div>
      <div style={{ color: 'var(--color-text-secondary)' }}>{body}</div>
    </div>
  );
}

// ───────────────── Helpers ─────────────────

function dmTitle(dm: TeamDM, currentUserId: string): string {
  const others = dm.participantIds.filter((id) => id !== currentUserId);
  return others
    .map((id) => TASK_USER_BY_ID[id]?.name.split(' ')[0] ?? id)
    .join(', ');
}

function DmAvatars({ dm, currentUserId }: { dm: TeamDM; currentUserId: string }) {
  const others = dm.participantIds.filter((id) => id !== currentUserId).slice(0, 2);
  return (
    <div style={{ display: 'flex' }}>
      {others.map((id, i) => {
        const u = TASK_USER_BY_ID[id];
        return (
          <span
            key={id}
            style={{
              display: 'inline-block',
              width: 22,
              height: 22,
              borderRadius: 11,
              background: u?.avatarColor ?? '#94a3b8',
              color: 'white',
              fontSize: 10,
              textAlign: 'center',
              lineHeight: '22px',
              fontWeight: 500,
              marginLeft: i === 0 ? 0 : -8,
              border: '1.5px solid var(--color-background-primary)',
            }}
          >
            {u?.initials ?? '??'}
          </span>
        );
      })}
    </div>
  );
}

function formatTs(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}

function formatStart(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderMentions(text: string, mentions?: string[]): React.ReactNode {
  if (!mentions || mentions.length === 0) return text;
  // Simple replacement: turn "@Name Name" patterns into chips when matched against mentions.
  // For Phase 1, just bold any "@" tokens — real autocomplete is T9 polish.
  const parts = text.split(/(@[A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)/g);
  return parts.map((p, i) =>
    p.startsWith('@') ? (
      <span
        key={i}
        style={{
          color: 'var(--color-brand-accent)',
          background: 'var(--color-background-tertiary)',
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

// ───────────────── Shim for cross-task posting ─────────────────
//
// T5 calls this from the Roster Publish flow. Appends a system message to #ops.
// Exported here rather than in breezeway.ts so the message shape stays close to
// where it's rendered.

export function postToTeamChannel(
  channelKey: ChannelKey,
  text: string,
  authorId: string,
  kind: TeamMessage['kind'] = 'text',
): TeamMessage {
  const message: TeamMessage = {
    id: `tm-${Date.now()}`,
    channelKey,
    authorId,
    text,
    ts: new Date().toISOString(),
    kind,
  };
  TEAM_MESSAGES.push(message);
  return message;
}
