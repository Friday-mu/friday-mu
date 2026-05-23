'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type RefObject } from 'react';
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
  useTenantTeamUsers,
  useTeamPresence,
  openDm,
  markChannelRead,
  markDmRead,
  createChannel,
  archiveChannel,
  deleteChannel,
  uploadChannelAttachment,
  uploadDmAttachment,
  loadAttachmentPreviewBlob,
  loadAttachmentDownloadBlob,
  addReaction,
  removeReaction,
  parseMentions,
  type LiveChannel,
  type LiveDm,
  type LiveTeamMessage,
  type LiveAttachment,
  type LiveUser,
} from '../../../_data/teamInboxClient';
import { TASK_USER_BY_ID, type TaskUser } from '../../../_data/tasks';
import { useJwtUserId, usePermissions } from '../../usePermissions';
import { IconCal, IconClose, IconDownload, IconExpand, IconPaperclip, IconPlus, IconSend, IconSparkle, IconUsers } from '../../icons';
import { ScheduleCallDrawer } from './ScheduleCallDrawer';
import { ChannelMembersDrawer } from './ChannelMembersDrawer';
import { fireToast } from '../../Toaster';
import { trackEvent } from '../../../../../lib/analytics';

type Selection =
  | { kind: 'channel'; channelKey: ChannelKey }
  | { kind: 'dm'; dm: TeamDM };

type TeamAttachment = NonNullable<TeamMessage['attachmentList']>[number];

async function downloadAttachment(attachment: TeamAttachment) {
  if (typeof document === 'undefined') return;
  const blob = await loadAttachmentDownloadBlob(attachment.id);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = attachment.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

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
  const canManageChannels = _perms.role !== 'field' && _perms.role !== 'external';
  // Real DB user ID from JWT — used for matching against backend data
  // (DM participants, reaction "I reacted", message author "is this me?").
  // The role-switcher fixture id from useCurrentUserId() never matches
  // real UUIDs the team_inbox API returns.
  const currentUserId = useJwtUserId() ?? '';

  // Live data from /api/team/* (polled every 30s for unread badges).
  const { channels: liveChannels, refetch: refetchChannels } = useChannels();
  const { dms: liveDms, refetch: refetchDms } = useDms();
  // Tenant roster — used to (a) auto-populate the DM list with one
  // virtual row per non-self team member, (b) render real display
  // names instead of raw UUIDs in DM titles + avatars.
  const { users: tenantUsers, byId: tenantUserById } = useTenantTeamUsers();
  const { onlineUserIds } = useTeamPresence();

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

  // Pre-populated DM list: every non-self team member gets a row,
  // whether a real DM exists yet or not. Virtual rows have id
  // 'virtual-<peerId>' and don't hit /api/team/dms/:id/messages until
  // the operator clicks; clicking calls openDm() to create-or-fetch
  // the real DM and switches selection.
  //
  // Group DMs (3+ participants) only appear here if they actually
  // exist in liveDms — we don't fabricate group DMs.
  type DmRow =
    | { kind: 'real'; dm: TeamDM }
    | { kind: 'virtual'; peer: LiveUser };
  const dmRows: DmRow[] = useMemo(() => {
    const real: DmRow[] = visibleDms.map((d) => ({ kind: 'real' as const, dm: d }));
    if (!currentUserId || !tenantUsers) return real;
    // Set of peer IDs that already have a 1:1 real DM with the caller.
    const realOneToOnePeers = new Set(
      visibleDms
        .filter((d) => d.participantIds.length === 2)
        .map((d) => d.participantIds.find((p) => p !== currentUserId)!)
        .filter(Boolean),
    );
    const virtual: DmRow[] = tenantUsers
      .filter((u) => u.id !== currentUserId && !realOneToOnePeers.has(u.id))
      .map((u) => ({ kind: 'virtual' as const, peer: u }));
    return [...real, ...virtual];
  }, [visibleDms, tenantUsers, currentUserId]);

  const [selection, setSelection] = useState<Selection | null>(null);
  const composeTextareaRef = useRef<HTMLTextAreaElement | null>(null);
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
  const [membersOpen, setMembersOpen] = useState(false);

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

  // Files staged via paperclip / drag / paste, awaiting send. Cleared
  // on selection change so attachments don't leak between channels.
  const [pendingAttachments, setPendingAttachments] = useState<LiveAttachment[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<TeamAttachment | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setPendingAttachments([]);
    setUploadingCount(0);
    setPreviewAttachment(null);
  }, [selection?.kind, selection?.kind === 'channel' ? selection.channelKey : selection?.kind === 'dm' ? selection.dm.id : null]);

  const handleAttachmentDownload = useCallback(async (attachment: TeamAttachment) => {
    try {
      await downloadAttachment(attachment);
    } catch (e) {
      fireToast(e instanceof Error ? e.message : 'Download failed');
    }
  }, []);

  const uploadFilesToTarget = useCallback(async (files: FileList | File[]) => {
    if (!messagesTarget) return;
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setUploadingCount((c) => c + arr.length);
    await Promise.all(arr.map(async (f) => {
      try {
        const attachment = messagesTarget.kind === 'channel'
          ? await uploadChannelAttachment(messagesTarget.id, f)
          : await uploadDmAttachment(messagesTarget.id, f);
        setPendingAttachments((prev) => [...prev, attachment]);
        trackEvent('team_attachment_upload', {
          kind: messagesTarget.kind,
          size_bytes: f.size,
          mime_type: f.type || null,
        });
      } catch (e) {
        fireToast(e instanceof Error ? `${f.name}: ${e.message}` : 'Upload failed');
        trackEvent('team_attachment_upload_failed', {
          kind: messagesTarget.kind,
          reason: e instanceof Error ? e.message : 'unknown',
        });
      } finally {
        setUploadingCount((c) => c - 1);
      }
    }));
  }, [messagesTarget]);

  const { messages: liveMessages, send: sendLive, refetch: refetchMessages } = useTeamMessages(messagesTarget);

  // Mark-read: when a channel/DM is selected and its messages have
  // loaded, mark them read for the current user so the unread badge
  // clears in the sidebar. Debounced by 800ms so rapidly tabbing
  // between channels doesn't mark a bunch of stuff read the user
  // never actually saw. Re-runs whenever the visible message count
  // grows (new arrivals while the channel is in view → still read).
  // Mary 2026-05-17 14:24: "the number of messages still pops up …
  // it never clears" — markChannelRead/markDmRead existed in the
  // client but were never called.
  useEffect(() => {
    if (!messagesTarget || !liveMessages || liveMessages.length === 0) return;
    const t = window.setTimeout(() => {
      const op = messagesTarget.kind === 'channel'
        ? markChannelRead(messagesTarget.id)
        : markDmRead(messagesTarget.id);
      op
        .then(() => {
          if (messagesTarget.kind === 'channel') refetchChannels();
          else refetchDms();
        })
        .catch(() => { /* best-effort — badge will catch up on next 30s poll */ });
    }, 800);
    return () => window.clearTimeout(t);
  }, [messagesTarget?.kind, messagesTarget?.id, liveMessages?.length, refetchChannels, refetchDms]);

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
      authorName: m.authorName,
      text: m.text,
      ts: m.ts,
      mentions: m.mentions,
      kind: m.kind,
      parentMessageId: m.parentMessageId,
      threadCount: m.replyCount,
      attachmentList: m.attachments,
      // Pass-through extras when present in meta (call/task-link fixtures).
      callMeta: (m.meta as { call?: TeamCallMeta })?.call,
      designProject: readDesignProjectMeta(m.meta),
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
    trackEvent('team_reaction_add', { emoji, kind: messageKind });
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

  const composeMention = useMentionAutocomplete({
    value: draft,
    setValue: setDraft,
    users: tenantUsers ?? [],
    textareaRef: composeTextareaRef,
  });

  const sendMessage = () => {
    const text = draft.trim();
    if (!selection) return;
    if (!text && pendingAttachments.length === 0) return;
    const parsedMentions = parseMentions(text, tenantUsers ?? []);
    // Fire and forget — the hook does optimistic append + refetch.
    sendLive(text, {
      mentions: parsedMentions.mentions,
      attachmentIds: pendingAttachments.map((a) => a.id),
    });
    trackEvent('team_message_send', {
      kind: selection.kind,
      channel_key: selection.kind === 'channel' ? selection.channelKey : undefined,
      has_text: !!text,
      attachment_count: pendingAttachments.length,
    });
    setDraft('');
    setPendingAttachments([]);
  };

  const handleCreateChannel = async () => {
    const name = window.prompt('Channel name');
    if (!name?.trim()) return;
    const purpose = window.prompt('Purpose (optional)') || '';
    try {
      const channel = await createChannel({ name: name.trim(), purpose: purpose.trim(), visibility: 'public' });
      await refetchChannels();
      openSelection({ kind: 'channel', channelKey: channel.key });
      trackEvent('team_channel_create', { channel_id: channel.id, channel_key: channel.key });
    } catch (e) {
      fireToast(e instanceof Error ? e.message : 'Failed to create channel');
    }
  };

  const handleArchiveSelectedChannel = async () => {
    if (!selectedChannel) return;
    if (!window.confirm(`Archive #${selectedChannel.name}?`)) return;
    try {
      await archiveChannel(selectedChannel.id);
      await refetchChannels();
      const next = visibleChannels.find((c) => c.id !== selectedChannel.id && c.isMember);
      setSelection(next ? { kind: 'channel', channelKey: next.key } : visibleDms[0] ? { kind: 'dm', dm: visibleDms[0] } : null);
      trackEvent('team_channel_archive', { channel_id: selectedChannel.id, channel_key: selectedChannel.key });
    } catch (e) {
      fireToast(e instanceof Error ? e.message : 'Failed to archive channel');
    }
  };

  const handleDeleteSelectedChannel = async () => {
    if (!selectedChannel) return;
    if (!window.confirm(`Delete #${selectedChannel.name} and its message history? This cannot be undone.`)) return;
    try {
      await deleteChannel(selectedChannel.id);
      await refetchChannels();
      const next = visibleChannels.find((c) => c.id !== selectedChannel.id && c.isMember);
      setSelection(next ? { kind: 'channel', channelKey: next.key } : visibleDms[0] ? { kind: 'dm', dm: visibleDms[0] } : null);
      trackEvent('team_channel_delete', { channel_id: selectedChannel.id, channel_key: selectedChannel.key });
    } catch (e) {
      fireToast(e instanceof Error ? e.message : 'Failed to delete channel');
    }
  };

  const targetTitle = selection?.kind === 'channel'
    ? selectedChannel?.name ?? '#unknown'
    : selection?.kind === 'dm' ? dmTitleFromUsers(selection.dm, currentUserId, tenantUserById) : '';

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
  // surface is now real, so keep this state truthful when the tenant simply
  // has no visible channels or DMs yet.
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
            Ask an admin to add you to a channel, or start a DM once teammates sync.
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
        <div
          className="inbox-list"
          style={
            isMobile
              ? { width: '100%', minWidth: 0, maxWidth: 'none', flex: '1 1 auto' }
              : { minWidth: 220, maxWidth: 280 }
          }
        >
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
            {canManageChannels && (
              <button
                type="button"
                onClick={handleCreateChannel}
                title="Add channel"
                style={{
                  float: 'right',
                  marginTop: -4,
                  width: 24,
                  height: 24,
                  border: '0.5px solid var(--color-border-tertiary)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-background-primary)',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  fontSize: 15,
                  lineHeight: '20px',
                }}
              >
                +
              </button>
            )}
          </div>
          {visibleChannels.filter((c) => c.isMember).map((c) => {
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

          {/* Non-member private channels — system admins only. Click
              opens the members drawer so they can join themselves. */}
          {visibleChannels.some((c) => !c.isMember) && (
            <>
              <div
                style={{
                  padding: '14px 14px 6px',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--color-text-tertiary)',
                  fontWeight: 500,
                }}
                title="Private channels you can join (visible because you're a system admin)"
              >
                Private · join to participate
              </div>
              {visibleChannels.filter((c) => !c.isMember).map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    openSelection({ kind: 'channel', channelKey: c.key });
                    setMembersOpen(true);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 14px',
                    width: '100%',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 0,
                    cursor: 'pointer',
                    fontSize: 13,
                    color: 'var(--color-text-tertiary)',
                    fontStyle: 'italic',
                  }}
                  title="Open members panel to add yourself"
                >
                  <span style={{ flex: 1 }}>🔒 {c.name}</span>
                </button>
              ))}
            </>
          )}

          <div
            style={{
              padding: '14px 14px 6px',
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--color-text-tertiary)',
              fontWeight: 500,
            }}
          >
            Direct messages
          </div>
          {dmRows.length === 0 && (
            <div style={{ padding: '6px 14px', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              No teammates yet
            </div>
          )}
          {dmRows.map((row) => {
            // Resolve display label + selection state for both real
            // and virtual rows. Virtual rows lazily create on click.
            const isReal = row.kind === 'real';
            const peer = isReal
              ? row.dm.participantIds
                  .filter((p) => p !== currentUserId)
                  .map((p) => tenantUserById.get(p))
                  .filter(Boolean)
              : [row.peer];
            const peerUsers = peer.filter(Boolean) as LiveUser[];
            const isOnline = peerUsers.some((u) => onlineUserIds.has(u.id));
            const isSel = isReal
              ? (selection.kind === 'dm' && selection.dm.id === row.dm.id)
              : false;
            const label = peer.length > 0
              ? peer.map((u) => u!.displayName.split(' ')[0]).join(', ')
              : (isReal ? '(empty DM)' : 'Unknown');
            const unread = isReal ? (row.dm.unread ?? 0) : 0;
            return (
              <button
                key={isReal ? row.dm.id : `virtual-${row.peer.id}`}
                className={'row' + (isSel ? ' selected' : '')}
                onClick={async () => {
                  if (isReal) {
                    openSelection({ kind: 'dm', dm: row.dm });
                    return;
                  }
                  // Virtual: lazy-create the DM, then switch.
                  try {
                    const newDm = await openDm([row.peer.id]);
                    openSelection({
                      kind: 'dm',
                      dm: { id: newDm.id, participantIds: newDm.participantIds, unread: 0 },
                    });
                    refetchDms();
                  } catch (e) {
                    fireToast(e instanceof Error ? e.message : 'Failed to open DM');
                  }
                }}
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
                  color: 'var(--color-text-primary)',
                }}
              >
                <DmPeerAvatars peers={peerUsers} onlineUserIds={onlineUserIds} />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {label}
                </span>
                {isOnline && (
                  <span
                    title="Online in FAD"
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 7,
                      background: 'var(--color-success, #16a34a)',
                      flex: '0 0 auto',
                    }}
                  />
                )}
                {unread > 0 && (
                  <span
                    className="chip"
                    style={{ fontSize: 10, padding: '1px 6px', background: 'var(--color-brand-accent)', color: 'white' }}
                  >
                    {unread}
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
            <div className="inbox-thread-meta" style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{targetSubtitle}</span>
              {selection.kind === 'channel' && selectedChannel && (
                <>
                  <span className="sep">·</span>
                  <button
                    type="button"
                    onClick={() => {
                      trackEvent('team_members_drawer_open', { channel_id: selectedChannel.id });
                      setMembersOpen(true);
                    }}
                    title="View / manage members"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'inherit',
                      fontSize: 'inherit',
                      padding: 0,
                      textDecoration: 'underline',
                      textDecorationStyle: 'dotted',
                      textUnderlineOffset: 2,
                    }}
                  >
                    <IconUsers size={11} />{' '}
                    {selectedChannel.visibility === 'private' ? 'Private · members' : 'Members'}
                  </button>
                  {canManageChannels && (
                    <>
                      <span className="sep">·</span>
                      <button
                        type="button"
                        onClick={handleArchiveSelectedChannel}
                        title="Archive this channel"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'inherit',
                          fontSize: 'inherit',
                          padding: 0,
                          textDecoration: 'underline',
                          textDecorationStyle: 'dotted',
                          textUnderlineOffset: 2,
                        }}
                      >
                        Archive
                      </button>
                      <span className="sep">·</span>
                      <button
                        type="button"
                        onClick={handleDeleteSelectedChannel}
                        title="Delete this channel"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--color-danger, #b42318)',
                          fontSize: 'inherit',
                          padding: 0,
                          textDecoration: 'underline',
                          textDecorationStyle: 'dotted',
                          textUnderlineOffset: 2,
                        }}
                      >
                        Delete
                      </button>
                    </>
                  )}
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
                    usersById={tenantUserById}
                    currentUserId={currentUserId}
                    onAddReaction={(emoji) => handleAddReaction(m.id, emoji)}
                    onRemoveReaction={(emoji) => handleRemoveReaction(m.id, emoji)}
                    onOpenThread={() => setOpenThreadParentId(threadOpen ? null : m.id)}
                    threadOpen={threadOpen}
                    onPreviewAttachment={setPreviewAttachment}
                    onDownloadAttachment={handleAttachmentDownload}
                  />
                  {threadOpen && (
                    <ThreadSurface
                      target={threadTarget}
                      parentId={m.id}
                      replies={threadReplies ?? []}
                      currentUserId={currentUserId}
                      users={tenantUsers ?? []}
                      usersById={tenantUserById}
                      onPreviewAttachment={setPreviewAttachment}
                      onDownloadAttachment={handleAttachmentDownload}
                      onSend={async (text, attachmentIds = []) => {
                        const parsedMentions = parseMentions(text, tenantUsers ?? []);
                        const msg = await sendThreadReply(text, { mentions: parsedMentions.mentions, attachmentIds });
                        if (msg) {
                          trackEvent('team_thread_reply', {
                            kind: messageKind,
                            parent_id: m.id,
                            attachment_count: attachmentIds.length,
                          });
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

          <div
            className="inbox-compose"
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer?.files?.length) uploadFilesToTarget(e.dataTransfer.files);
            }}
            style={{
              position: 'relative',
              outline: dragOver ? '2px dashed var(--color-brand-accent)' : 'none',
              outlineOffset: -4,
              borderRadius: 'var(--radius-sm)',
              transition: 'outline-color 0.1s',
            }}
          >
            {dragOver && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                  fontSize: 13,
                  color: 'var(--color-brand-accent)',
                  background: 'var(--color-background-accent-soft, rgba(56, 132, 255, 0.08))',
                  borderRadius: 'var(--radius-sm)',
                  zIndex: 1,
                }}
              >
                Drop files to upload
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files?.length) uploadFilesToTarget(e.target.files);
                e.target.value = '';
              }}
            />
            <div className="inbox-compose-toolbar">
              <button
                className="btn ghost sm"
                onClick={() => setCallOpen(true)}
                title="Schedule a call"
              >
                <IconCal size={12} /> Schedule call
              </button>
              <button
                className="btn ghost sm"
                title="Attach a file"
                onClick={() => fileInputRef.current?.click()}
              >
                <IconPaperclip size={12} /> Attach
              </button>
              <button
                className="btn ghost sm"
                title="Insert mention"
                onClick={() => {
                  composeMention.openAtCursor();
                }}
              >
                @ Mention
              </button>
              <span
                className="mono"
                style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-tertiary)' }}
              >
                {targetTitle}
              </span>
            </div>
            {(pendingAttachments.length > 0 || uploadingCount > 0) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '6px 8px' }}>
                {pendingAttachments.map((att) => (
                  <PendingAttachmentChip
                    key={att.id}
                    attachment={att}
                    onRemove={() => setPendingAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                  />
                ))}
                {uploadingCount > 0 && (
                  <span
                    className="chip"
                    style={{ fontSize: 11, padding: '4px 8px', color: 'var(--color-text-tertiary)' }}
                  >
                    Uploading {uploadingCount} file{uploadingCount === 1 ? '' : 's'}…
                  </span>
                )}
              </div>
            )}
            <div style={{ position: 'relative' }}>
              <MentionPicker
                open={composeMention.open}
                users={composeMention.candidates}
                activeIndex={composeMention.activeIndex}
                onHover={composeMention.setActiveIndex}
                onPick={composeMention.insertMention}
              />
              <textarea
                ref={composeTextareaRef}
                className="inbox-compose-textarea team-compose-textarea"
                placeholder={`Message ${targetTitle}…`}
                value={draft}
                onChange={composeMention.onChange}
                onSelect={composeMention.onSelect}
                onKeyDown={(e) => {
                  if (composeMention.onKeyDown(e)) return;
                  // Bug #4 fix (2026-05-23) — chat convention: plain
                  // Enter sends; Shift+Enter inserts a newline. Cmd/
                  // Ctrl+Enter also sends (backwards compat). Matches
                  // Slack/WhatsApp/Discord; Mary reported the prior
                  // Cmd-only requirement as awkward.
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                onPaste={(e) => {
                  const files = Array.from(e.clipboardData?.files || []);
                  if (files.length > 0) {
                    e.preventDefault();
                    uploadFilesToTarget(files);
                  }
                }}
              />
            </div>
            <div className="inbox-compose-actions" style={{ justifyContent: 'flex-end' }}>
              {/* 'Polish with Friday' removed 2026-05-17 — Mary reported
                  it as broken (no onClick wired). Polish needs FC's
                  consult endpoint which requires conversationId; team
                  channels don't have one. Operator polishes team
                  messages directly. */}
              <button
                className="btn primary"
                onClick={sendMessage}
                disabled={(!draft.trim() && pendingAttachments.length === 0) || uploadingCount > 0}
              >
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
          ? { kind: 'channel', channelKey: selection.channelKey, channelId: selectedChannel?.id }
          : { kind: 'dm', dmId: selection.dm.id, participantIds: selection.dm.participantIds }}
        defaultInviteeIds={defaultInviteeIds}
        onScheduled={() => {
          // 15s poller will pick up the new message; nothing to do here.
        }}
      />

      {selection.kind === 'channel' && selectedChannel && membersOpen && (
        <ChannelMembersDrawer
          open={membersOpen}
          onClose={() => setMembersOpen(false)}
          channelId={selectedChannel.id}
          channelName={selectedChannel.name}
          onMembersChanged={() => {
            // A private channel may have just become visible/invisible to
            // the caller; refetch the sidebar so the list stays in sync.
            refetchChannels();
          }}
        />
      )}

      <AttachmentPreviewPanel
        attachment={previewAttachment}
        onClose={() => setPreviewAttachment(null)}
        onDownload={handleAttachmentDownload}
      />
    </>
  );
}

// ───────────────── Display helpers ─────────────────

/** First letter of first two whitespace-separated words, uppercased. */
function deriveInitials(name: string | undefined | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Deterministic palette pick from name — same name always lands on the
 *  same colour. 12-colour palette tuned for FAD's brand neutrals. */
const AVATAR_PALETTE = [
  '#2B4A93', '#6B8E5F', '#B8744F', '#7C4D8F', '#3F7B8C',
  '#A0613A', '#5E7C6B', '#8B5E83', '#3D6B5E', '#A37B4F',
  '#4F6B8E', '#7C5E4F',
];
function deriveColor(name: string | undefined | null): string {
  if (!name) return '#94a3b8'; // slate-400 fallback
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]!;
}

// ───────────────── Attachment helpers ─────────────────

const IMAGE_MIME_RE = /^image\//;
const TEXT_MIME_RE = /^(text\/|application\/(json|xml|csv))/;

function isImageAttachment(att: { mimeType: string | null; filename: string }): boolean {
  if (att.mimeType && IMAGE_MIME_RE.test(att.mimeType)) return true;
  return /\.(jpe?g|png|gif|webp|avif|heic|heif|bmp|svg)$/i.test(att.filename);
}

function isPdfAttachment(att: { mimeType: string | null; filename: string }): boolean {
  return att.mimeType === 'application/pdf' || /\.pdf$/i.test(att.filename);
}

function isTextAttachment(att: { mimeType: string | null; filename: string }): boolean {
  if (att.mimeType && TEXT_MIME_RE.test(att.mimeType)) return true;
  return /\.(txt|md|csv|json|log|xml)$/i.test(att.filename);
}

function canPreviewAttachment(att: { mimeType: string | null; filename: string }): boolean {
  return isImageAttachment(att) || isPdfAttachment(att) || isTextAttachment(att);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function PendingAttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: LiveAttachment;
  onRemove: () => void;
}) {
  const isImage = isImageAttachment(attachment);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 6px 4px 4px',
        background: 'var(--color-background-secondary)',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--radius-sm)',
        fontSize: 11,
      }}
    >
      {isImage ? (
        <img
          src={attachment.url}
          alt=""
          style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 3 }}
        />
      ) : (
        <span style={{ fontSize: 14 }}>📎</span>
      )}
      <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {attachment.filename}
      </span>
      <span style={{ color: 'var(--color-text-tertiary)' }}>{formatBytes(attachment.sizeBytes)}</span>
      <button
        type="button"
        onClick={onRemove}
        title="Remove"
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '0 2px',
          color: 'var(--color-text-tertiary)',
          fontSize: 13,
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </span>
  );
}

function MessageAttachments({
  attachments,
  onPreview,
  onDownload,
}: {
  attachments: TeamMessage['attachmentList'];
  onPreview?: (attachment: TeamAttachment) => void;
  onDownload?: (attachment: TeamAttachment) => void;
}) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
      {attachments.map((att) => {
        const previewable = canPreviewAttachment(att);
        if (isImageAttachment(att)) {
          return (
            <button
              key={att.id}
              type="button"
              onClick={() => onPreview?.(att)}
              title="Preview attachment"
              style={{
                display: 'inline-block',
                lineHeight: 0,
                padding: 0,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <img
                src={att.url}
                alt={att.filename}
                style={{
                  maxWidth: 320,
                  maxHeight: 240,
                  borderRadius: 'var(--radius-sm)',
                  border: '0.5px solid var(--color-border-tertiary)',
                  objectFit: 'cover',
                }}
              />
            </button>
          );
        }
        return (
          <span
            key={att.id}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 10px',
              background: 'var(--color-background-secondary)',
              border: '0.5px solid var(--color-border-tertiary)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 12,
              color: 'var(--color-text-primary)',
              textDecoration: 'none',
              maxWidth: '100%',
            }}
          >
            <IconPaperclip size={15} />
            <div style={{ minWidth: 0, maxWidth: 240 }}>
              <div style={{ fontWeight: 500, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {att.filename}
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                {formatBytes(att.sizeBytes)}
              </div>
            </div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, marginLeft: 2 }}>
              {previewable && (
                <button
                  type="button"
                  onClick={() => onPreview?.(att)}
                  title="Preview"
                  style={{
                    width: 24,
                    height: 24,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '0.5px solid var(--color-border-tertiary)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-background-primary)',
                    color: 'var(--color-text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  <IconExpand size={13} />
                </button>
              )}
              <button
                type="button"
                onClick={() => onDownload?.(att)}
                title="Download"
                style={{
                  width: 24,
                  height: 24,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '0.5px solid var(--color-border-tertiary)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-background-primary)',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                }}
              >
                <IconDownload size={13} />
              </button>
            </span>
          </span>
        );
      })}
    </div>
  );
}

function AttachmentPreviewPanel({
  attachment,
  onClose,
  onDownload,
}: {
  attachment: TeamAttachment | null;
  onClose: () => void;
  onDownload: (attachment: TeamAttachment) => void;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!attachment || !canPreviewAttachment(attachment)) {
      setBlobUrl(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    let localUrl: string | null = null;
    setBlobUrl(null);
    setError(null);
    setLoading(true);

    loadAttachmentPreviewBlob(attachment.id)
      .then((blob) => {
        if (cancelled) return;
        localUrl = URL.createObjectURL(blob);
        setBlobUrl(localUrl);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Preview failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (localUrl) URL.revokeObjectURL(localUrl);
    };
  }, [attachment?.id]);

  useEffect(() => {
    if (!attachment) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [attachment, onClose]);

  if (!attachment) return null;

  const previewable = canPreviewAttachment(attachment);
  const content = (() => {
    if (!previewable) {
      return (
        <div style={{ padding: 24, color: 'var(--color-text-secondary)', fontSize: 13 }}>
          Preview is not available for this file type yet.
        </div>
      );
    }
    if (loading) {
      return (
        <div style={{ padding: 24, color: 'var(--color-text-tertiary)', fontSize: 13 }}>
          Loading preview…
        </div>
      );
    }
    if (error) {
      return (
        <div style={{ padding: 24, color: 'var(--color-danger, #b42318)', fontSize: 13 }}>
          {error}
        </div>
      );
    }
    if (!blobUrl) return null;
    if (isImageAttachment(attachment)) {
      return (
        <div style={{ display: 'grid', placeItems: 'center', width: '100%', height: '100%', background: 'var(--color-background-secondary)' }}>
          <img
            src={blobUrl}
            alt={attachment.filename}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        </div>
      );
    }
    return (
      <iframe
        title={attachment.filename}
        src={blobUrl}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          background: 'white',
        }}
      />
    );
  })();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={attachment.filename}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        background: 'rgba(15, 24, 54, 0.42)',
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 'min(960px, calc(100vw - 24px))',
          height: 'min(760px, calc(100dvh - 24px))',
          display: 'grid',
          gridTemplateRows: 'auto 1fr',
          overflow: 'hidden',
          borderRadius: 'var(--radius-md)',
          border: '0.5px solid var(--color-border-secondary)',
          background: 'var(--color-background-primary)',
          boxShadow: '0 20px 60px rgba(15, 24, 54, 0.25)',
        }}
      >
        <div
          style={{
            minHeight: 48,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 10px',
            borderBottom: '0.5px solid var(--color-border-secondary)',
          }}
        >
          <IconPaperclip size={15} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {attachment.filename}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              {formatBytes(attachment.sizeBytes)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onDownload(attachment)}
            title="Download"
            style={{
              width: 32,
              height: 32,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '0.5px solid var(--color-border-tertiary)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-background-primary)',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
            }}
          >
            <IconDownload size={15} />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            style={{
              width: 32,
              height: 32,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '0.5px solid var(--color-border-tertiary)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-background-primary)',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
            }}
          >
            <IconClose size={15} />
          </button>
        </div>
        <div style={{ minHeight: 0, overflow: 'hidden' }}>
          {content}
        </div>
      </div>
    </div>
  );
}

function readDesignProjectMeta(meta: Record<string, unknown> | null): TeamMessage['designProject'] {
  const project = meta?.designProject;
  if (!project || typeof project !== 'object' || Array.isArray(project)) return undefined;
  const row = project as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.name !== 'string') return undefined;
  return {
    id: row.id,
    name: row.name,
    slug: typeof row.slug === 'string' ? row.slug : null,
    source: typeof row.source === 'string' ? row.source : undefined,
    confidence: typeof row.confidence === 'number' ? row.confidence : undefined,
  };
}

function DesignProjectChip({ project }: { project?: TeamMessage['designProject'] }) {
  if (!project) return null;
  const href = `/fad?m=design&pid=${encodeURIComponent(project.id)}`;
  const title = project.source === 'inferred'
    ? 'Design project inferred from this message'
    : project.source === 'inherited'
      ? 'Design project inherited from the parent thread'
      : 'Open linked design project';
  return (
    <a
      href={href}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        maxWidth: '100%',
        marginTop: 6,
        padding: '3px 7px',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--color-background-secondary)',
        color: 'var(--color-text-secondary)',
        fontSize: 11,
        lineHeight: 1.3,
        textDecoration: 'none',
      }}
    >
      <span style={{ fontWeight: 600 }}>Design</span>
      <span
        style={{
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {project.name}
      </span>
      {project.source === 'inferred' && <span style={{ color: 'var(--color-text-tertiary)' }}>auto</span>}
    </a>
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
  usersById,
  currentUserId,
  onAddReaction,
  onRemoveReaction,
  onOpenThread,
  threadOpen,
  onPreviewAttachment,
  onDownloadAttachment,
  compact,
}: {
  message: TeamMessage;
  author?: TaskUser;
  reactions?: Record<string, string[]>;
  usersById?: Map<string, LiveUser>;
  currentUserId?: string;
  onAddReaction?: (emoji: string) => void;
  onRemoveReaction?: (emoji: string) => void;
  onPreviewAttachment?: (attachment: TeamAttachment) => void;
  onDownloadAttachment?: (attachment: TeamAttachment) => void;
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
        {(() => {
          // Prefer the fixture (deterministic colour + initials for FR
          // team members). Fall back to the backend-captured author_display_name
          // for any user not in the fixture (real DB users created post-seed,
          // SaaS tenants, etc.).
          const displayName = author?.name ?? message.authorName ?? 'Unknown';
          const initials = author?.initials ?? deriveInitials(displayName);
          const color = author?.avatarColor ?? deriveColor(displayName);
          return (
            <>
              <span
                style={{
                  display: 'inline-block',
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  background: color,
                  color: 'white',
                  fontSize: 10,
                  textAlign: 'center',
                  lineHeight: '18px',
                  fontWeight: 500,
                }}
              >
                {initials}
              </span>
              <span style={{ fontWeight: 500 }}>{displayName}</span>
            </>
          );
        })()}
        <span style={{ color: 'var(--color-text-tertiary)' }}>· {formatTs(message.ts)}</span>
      </div>
      <div className="msg-body" style={{ whiteSpace: 'pre-wrap' }}>
        {renderMentions(message.text, message.mentions, usersById)}
      </div>
      <DesignProjectChip project={message.designProject} />
      <MessageAttachments
        attachments={message.attachmentList}
        onPreview={onPreviewAttachment}
        onDownload={onDownloadAttachment}
      />
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
  target,
  parentId: _parentId,
  replies,
  currentUserId,
  users,
  usersById,
  onPreviewAttachment,
  onDownloadAttachment,
  onSend,
  onClose,
}: {
  target: { kind: 'channel' | 'dm'; parentId: string; targetId: string } | null;
  parentId: string;
  replies: LiveTeamMessage[];
  currentUserId: string;
  users: LiveUser[];
  usersById: Map<string, LiveUser>;
  onPreviewAttachment: (attachment: TeamAttachment) => void;
  onDownloadAttachment: (attachment: TeamAttachment) => void;
  onSend: (text: string, attachmentIds?: string[]) => Promise<boolean>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<LiveAttachment[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mention = useMentionAutocomplete({
    value: draft,
    setValue: setDraft,
    users,
    textareaRef,
  });
  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    if (!target) return;
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setUploadingCount((count) => count + arr.length);
    await Promise.all(arr.map(async (file) => {
      try {
        const attachment = target.kind === 'channel'
          ? await uploadChannelAttachment(target.targetId, file)
          : await uploadDmAttachment(target.targetId, file);
        setPendingAttachments((prev) => [...prev, attachment]);
        trackEvent('team_thread_attachment_upload', {
          kind: target.kind,
          size_bytes: file.size,
          mime_type: file.type || null,
        });
      } catch (e) {
        fireToast(e instanceof Error ? `${file.name}: ${e.message}` : 'Upload failed');
      } finally {
        setUploadingCount((count) => count - 1);
      }
    }));
  }, [target]);
  const send = async () => {
    const text = draft.trim();
    const attachmentIds = pendingAttachments.map((attachment) => attachment.id);
    if ((!text && attachmentIds.length === 0) || sending || uploadingCount > 0) return;
    setSending(true);
    const ok = await onSend(text, attachmentIds);
    setSending(false);
    if (ok) {
      setDraft('');
      setPendingAttachments([]);
    }
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
          authorName: r.authorName,
          text: r.text,
          ts: r.ts,
          mentions: r.mentions,
          kind: r.kind,
          parentMessageId: r.parentMessageId,
          attachmentList: r.attachments,
        };
        return (
          <TextMessage
            key={r.id}
            message={msg}
            author={author}
            reactions={r.reactions}
            usersById={usersById}
            currentUserId={currentUserId}
            onPreviewAttachment={onPreviewAttachment}
            onDownloadAttachment={onDownloadAttachment}
            compact
          />
        );
      })}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files?.length) void uploadFiles(e.target.files);
          e.target.value = '';
        }}
      />
      {(pendingAttachments.length > 0 || uploadingCount > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {pendingAttachments.map((att) => (
            <PendingAttachmentChip
              key={att.id}
              attachment={att}
              onRemove={() => setPendingAttachments((prev) => prev.filter((a) => a.id !== att.id))}
            />
          ))}
          {uploadingCount > 0 && (
            <span className="chip" style={{ fontSize: 11, padding: '4px 8px', color: 'var(--color-text-tertiary)' }}>
              Uploading {uploadingCount} file{uploadingCount === 1 ? '' : 's'}…
            </span>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'flex-end' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <MentionPicker
            open={mention.open}
            users={mention.candidates}
            activeIndex={mention.activeIndex}
            onHover={mention.setActiveIndex}
            onPick={mention.insertMention}
          />
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={mention.onChange}
            onSelect={mention.onSelect}
            onKeyDown={(e) => {
              if (mention.onKeyDown(e)) return;
              // Bug #4 fix (2026-05-23) — plain Enter sends, Shift+
              // Enter inserts a newline. Cmd/Ctrl+Enter also sends
              // (backwards compat). Same convention as the top-level
              // composer above.
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData?.files || []);
              if (files.length > 0) {
                e.preventDefault();
                void uploadFiles(files);
              }
            }}
            placeholder="Reply in thread…"
            rows={2}
            style={{
              width: '100%',
              fontSize: 13,
              padding: 8,
              border: '0.5px solid var(--color-border-tertiary)',
              borderRadius: 'var(--radius-sm)',
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
        </div>
        <button
          className="btn ghost sm"
          type="button"
          title="Attach a file"
          onClick={() => fileInputRef.current?.click()}
          disabled={!target || uploadingCount > 0}
          style={{ flex: '0 0 auto' }}
        >
          <IconPaperclip size={11} />
        </button>
        <button
          className="btn primary sm"
          onClick={send}
          disabled={(!draft.trim() && pendingAttachments.length === 0) || sending || uploadingCount > 0}
          style={{ flex: '0 0 auto' }}
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

function dmTitleFromUsers(dm: TeamDM, currentUserId: string, byId: Map<string, LiveUser>): string {
  const others = dm.participantIds.filter((id) => id !== currentUserId);
  return others
    .map((id) => byId.get(id)?.displayName.split(' ')[0] ?? id.slice(0, 8))
    .join(', ');
}

function DmPeerAvatars({
  peers,
  onlineUserIds,
}: {
  peers: LiveUser[];
  onlineUserIds: Set<string>;
}) {
  const slice = peers.slice(0, 2);
  return (
    <div style={{ display: 'flex' }}>
      {slice.map((u, i) => (
        <span
          key={u.id}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            width: 22,
            height: 22,
            borderRadius: 11,
            background: deriveColor(u.displayName),
            color: 'white',
            fontSize: 10,
            fontWeight: 500,
            marginLeft: i === 0 ? 0 : -8,
            border: '1.5px solid var(--color-background-primary)',
          }}
        >
          {deriveInitials(u.displayName)}
          {onlineUserIds.has(u.id) && (
            <span
              title={`${u.displayName} is online in FAD`}
              style={{
                position: 'absolute',
                right: -1,
                bottom: -1,
                width: 7,
                height: 7,
                borderRadius: 7,
                background: 'var(--color-success, #16a34a)',
                border: '1.5px solid var(--color-background-primary)',
              }}
            />
          )}
        </span>
      ))}
      {slice.length === 0 && (
        <span
          style={{
            display: 'inline-block',
            width: 22,
            height: 22,
            borderRadius: 11,
            background: '#94a3b8',
            color: 'white',
            fontSize: 10,
            textAlign: 'center',
            lineHeight: '22px',
            border: '1.5px solid var(--color-background-primary)',
          }}
        >
          ?
        </span>
      )}
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

type MentionTrigger = { start: number; query: string };

function escapeMentionRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mentionAliasPattern(alias: string): RegExp {
  const escaped = escapeMentionRegExp(alias.trim()).replace(/\s+/g, '\\s+');
  return new RegExp(`^${escaped}(?=$|[\\s.,;:!?()[\\]{}<>])`, 'i');
}

function mentionAliases(user: LiveUser): string[] {
  return [user.displayName, user.displayName.replace(/\s+/g, ''), user.username, mentionHandle(user)]
    .map((v) => v.trim())
    .filter((v, index, arr) => v && arr.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === index);
}

function mentionHandle(user: LiveUser): string {
  return user.username.includes('@') ? user.username.split('@')[0] : user.username;
}

function findMentionTrigger(text: string, cursor: number): MentionTrigger | null {
  const before = text.slice(0, cursor);
  const start = before.lastIndexOf('@');
  if (start < 0) return null;
  if (start > 0 && /[\w.-]/.test(before[start - 1])) return null;
  const query = before.slice(start + 1);
  if (query.length > 48 || /[\n\r]/.test(query) || /[()[\]{}<>]/.test(query)) return null;
  return { start, query };
}

function filterMentionUsers(users: LiveUser[], query: string): LiveUser[] {
  const q = query.trim().toLowerCase();
  return users
    .filter((u) => {
      if (!q) return true;
      return u.displayName.toLowerCase().includes(q)
        || u.username.toLowerCase().includes(q)
        || u.email.toLowerCase().includes(q);
    })
    .slice(0, 8);
}

function useMentionAutocomplete({
  value,
  setValue,
  users,
  textareaRef,
}: {
  value: string;
  setValue: (value: string) => void;
  users: LiveUser[];
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const [trigger, setTrigger] = useState<MentionTrigger | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const candidates = useMemo(
    () => (trigger ? filterMentionUsers(users, trigger.query) : []),
    [trigger, users],
  );
  const open = !!trigger && candidates.length > 0;

  useEffect(() => {
    if (activeIndex >= candidates.length) setActiveIndex(0);
  }, [activeIndex, candidates.length]);

  const refreshTrigger = useCallback((nextValue: string, cursor: number) => {
    const next = findMentionTrigger(nextValue, cursor);
    setTrigger(next);
    if (next) setActiveIndex(0);
  }, []);

  const insertMention = useCallback((user: LiveUser) => {
    const textarea = textareaRef.current;
    const cursor = textarea?.selectionStart ?? value.length;
    const currentTrigger = trigger ?? findMentionTrigger(value, cursor);
    if (!currentTrigger) return;
    const mentionText = `@${user.displayName} `;
    const before = value.slice(0, currentTrigger.start);
    const after = value.slice(cursor).replace(/^\s+/, '');
    const next = `${before}${mentionText}${after}`;
    const nextCursor = before.length + mentionText.length;
    setValue(next);
    setTrigger(null);
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(nextCursor, nextCursor);
    });
  }, [setValue, textareaRef, trigger, value]);

  const openAtCursor = useCallback(() => {
    const textarea = textareaRef.current;
    const cursor = textarea?.selectionStart ?? value.length;
    const before = value.slice(0, cursor);
    const after = value.slice(cursor);
    const insertion = before.length === 0 || /\s$/.test(before) ? '@' : ' @';
    const next = `${before}${insertion}${after}`;
    const nextCursor = before.length + insertion.length;
    setValue(next);
    setTrigger({ start: nextCursor - 1, query: '' });
    setActiveIndex(0);
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(nextCursor, nextCursor);
    });
  }, [setValue, textareaRef, value]);

  return {
    open,
    candidates,
    activeIndex,
    setActiveIndex,
    insertMention,
    openAtCursor,
    onChange: (event: ChangeEvent<HTMLTextAreaElement>) => {
      const next = event.target.value;
      setValue(next);
      refreshTrigger(next, event.target.selectionStart ?? next.length);
    },
    onSelect: (event: ChangeEvent<HTMLTextAreaElement>) => {
      refreshTrigger(event.target.value, event.target.selectionStart ?? event.target.value.length);
    },
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!open) return false;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((i) => (i + 1) % candidates.length);
        return true;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((i) => (i - 1 + candidates.length) % candidates.length);
        return true;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        insertMention(candidates[activeIndex]);
        return true;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setTrigger(null);
        return true;
      }
      return false;
    },
  };
}

function MentionPicker({
  open,
  users,
  activeIndex,
  onHover,
  onPick,
}: {
  open: boolean;
  users: LiveUser[];
  activeIndex: number;
  onHover: (index: number) => void;
  onPick: (user: LiveUser) => void;
}) {
  if (!open) return null;
  return (
    <div
      role="listbox"
      aria-label="Mention teammate"
      style={{
        position: 'absolute',
        left: 8,
        bottom: '100%',
        zIndex: 20,
        width: 'min(320px, calc(100% - 16px))',
        marginBottom: 6,
        padding: 4,
        background: 'var(--color-background-elevated, var(--color-background-secondary))',
        border: '0.5px solid var(--color-border-secondary)',
        borderRadius: 'var(--radius-md)',
        boxShadow: '0 12px 30px rgba(0,0,0,0.25)',
      }}
      onMouseDown={(event) => event.preventDefault()}
    >
      {users.map((user, index) => {
        const active = index === activeIndex;
        return (
          <button
            key={user.id}
            type="button"
            role="option"
            aria-selected={active}
            onMouseEnter={() => onHover(index)}
            onClick={() => onPick(user)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 8px',
              border: 0,
              borderRadius: 'var(--radius-sm)',
              background: active ? 'var(--color-background-accent-soft, rgba(56, 132, 255, 0.14))' : 'transparent',
              color: 'var(--color-text-primary)',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                background: deriveColor(user.displayName),
                color: 'white',
                fontSize: 10,
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flex: '0 0 auto',
              }}
            >
              {deriveInitials(user.displayName)}
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>{user.displayName}</span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--color-text-tertiary)' }}>@{mentionHandle(user)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function renderMentions(text: string, mentions?: string[], usersById?: Map<string, LiveUser>): React.ReactNode {
  if (!mentions || mentions.length === 0 || !usersById) return text;
  const aliases = mentions
    .map((id) => usersById.get(id))
    .filter((u): u is LiveUser => !!u)
    .flatMap((user) => mentionAliases(user).map((alias) => ({ user, alias, re: mentionAliasPattern(alias) })))
    .sort((a, b) => b.alias.length - a.alias.length);
  if (aliases.length === 0) return text;

  const nodes: React.ReactNode[] = [];
  let last = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '@') continue;
    if (i > 0 && /[\w.-]/.test(text[i - 1])) continue;
    const tail = text.slice(i + 1);
    const hit = aliases.find((a) => a.re.test(tail));
    if (!hit) continue;
    const matched = tail.match(hit.re)?.[0] ?? hit.alias;
    if (i > last) nodes.push(<span key={`t-${last}`}>{text.slice(last, i)}</span>);
    nodes.push(
      <button
        key={`m-${i}`}
        type="button"
        title={hit.user.email}
        onClick={() => fireToast(`${hit.user.displayName} · ${hit.user.email}`)}
        style={{
          display: 'inline',
          color: 'var(--color-brand-accent)',
          background: 'var(--color-background-accent-soft, rgba(56, 132, 255, 0.14))',
          border: '0.5px solid var(--color-brand-accent)',
          padding: '0 5px',
          borderRadius: 4,
          font: 'inherit',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        @{matched}
      </button>,
    );
    last = i + matched.length + 1;
    i = last - 1;
  }
  if (last === 0) return text;
  if (last < text.length) nodes.push(<span key={`t-${last}`}>{text.slice(last)}</span>);
  return nodes;
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
