'use client';

import { useMemo, useState } from 'react';
import {
  TEAM_CHANNELS,
  TEAM_DMS,
  TEAM_MESSAGES,
  allTeamMessages,
  type ChannelKey,
  type TeamCallMeta,
  type TeamDM,
  type TeamMessage,
} from '../../../_data/teamInbox';
import { TASK_USER_BY_ID, type TaskUser } from '../../../_data/tasks';
import { ROLE_LABEL, type Resource } from '../../../_data/permissions';
import { useCurrentUserId, usePermissions } from '../../usePermissions';
import { IconCal, IconPaperclip, IconPlus, IconSend, IconSparkle, IconUsers } from '../../icons';
import { ScheduleCallDrawer } from './ScheduleCallDrawer';
import { fireToast } from '../../Toaster';

type Selection =
  | { kind: 'channel'; channelKey: ChannelKey }
  | { kind: 'dm'; dm: TeamDM };

const CHANNEL_RESOURCE_BY_KEY: Record<ChannelKey, Resource> = {
  general: 'inbox_team',
  ops: 'inbox_team',
  marketing: 'inbox_team',
  finance: 'finance',  // restricted: only roles with finance read see #finance
  syndic: 'inbox_syndic',
};

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
  const { role, can } = usePermissions();
  const currentUserId = useCurrentUserId();

  const visibleChannels = useMemo(
    () => TEAM_CHANNELS.filter((c) => can(CHANNEL_RESOURCE_BY_KEY[c.key], 'read')),
    [role, can],
  );
  const visibleDms = useMemo(
    () => TEAM_DMS.filter((d) => d.participantIds.includes(currentUserId)),
    [currentUserId],
  );

  const [selection, setSelection] = useState<Selection>(() =>
    visibleChannels[0]
      ? { kind: 'channel', channelKey: visibleChannels[0].key }
      : visibleDms[0]
        ? { kind: 'dm', dm: visibleDms[0] }
        : { kind: 'channel', channelKey: 'general' },
  );

  const [draft, setDraft] = useState('');
  const [callOpen, setCallOpen] = useState(false);
  // Local revision counter to force a re-render when the fixture array mutates.
  const [rev, setRev] = useState(0);
  const bumpRev = () => setRev((n) => n + 1);

  const messages = useMemo(() => {
    let msgs: TeamMessage[];
    if (selection.kind === 'channel') {
      msgs = allTeamMessages().filter((m) => m.channelKey === selection.channelKey);
    } else {
      msgs = allTeamMessages().filter((m) => m.dmId === selection.dm.id);
    }
    if (mentionsOnly) {
      msgs = msgs.filter((m) => m.mentions?.includes(currentUserId));
    }
    return msgs;
  }, [selection, rev, mentionsOnly, currentUserId]);

  const sendMessage = () => {
    const text = draft.trim();
    if (!text) return;
    const message: TeamMessage = {
      id: `tm-${Date.now()}`,
      authorId: currentUserId,
      text,
      ts: new Date().toISOString(),
      kind: 'text',
      ...(selection.kind === 'channel'
        ? { channelKey: selection.channelKey }
        : { dmId: selection.dm.id }),
    };
    TEAM_MESSAGES.push(message);
    setDraft('');
    bumpRev();
  };

  const targetTitle = selection.kind === 'channel'
    ? TEAM_CHANNELS.find((c) => c.key === selection.channelKey)?.name ?? '#unknown'
    : dmTitle(selection.dm, currentUserId);

  const targetSubtitle = selection.kind === 'channel'
    ? TEAM_CHANNELS.find((c) => c.key === selection.channelKey)?.purpose ?? ''
    : `Direct message · ${selection.dm.participantIds.length === 2 ? '1:1' : 'group'}`;

  const defaultInviteeIds = selection.kind === 'dm'
    ? selection.dm.participantIds
    : visibleChannels.find((c) => selection.kind === 'channel' && c.key === selection.channelKey)?.memberIds.slice(0, 4) ?? [];

  const openSelection = (next: Selection) => {
    setSelection(next);
    if (isMobile) onMobileThreadOpenChange?.(true);
  };

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
              {selection.kind === 'channel' && (
                <>
                  <span className="sep">·</span>
                  <span>
                    <IconUsers size={11} />{' '}
                    {visibleChannels.find((c) => c.key === selection.channelKey)?.memberIds.length ?? 0} members
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
              if (m.kind === 'call_scheduled' && m.callMeta) {
                return <CallMessage key={m.id} message={m} author={author} />;
              }
              if (m.kind === 'roster_publish') {
                return <SystemMessage key={m.id} icon="🤖" title="Roster published" body={m.text} ts={m.ts} author={author} />;
              }
              if (m.kind === 'task_link' && m.taskComment) {
                return <TaskCommentMessage key={m.id} message={m} author={author} />;
              }
              return <TextMessage key={m.id} message={m} author={author} />;
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
                {ROLE_LABEL[role]} · {targetTitle}
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
        onScheduled={() => bumpRev()}
      />
    </>
  );
}

// ───────────────── Message components ─────────────────

function TextMessage({ message, author }: { message: TeamMessage; author?: TaskUser }) {
  return (
    <div className="msg-bubble them" style={{ maxWidth: 'unset' }}>
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
      {(message.threadCount ?? 0) > 0 && (
        <div style={{ marginTop: 4, fontSize: 11, color: 'var(--color-brand-accent)' }}>
          {message.threadCount} repl{message.threadCount === 1 ? 'y' : 'ies'}
        </div>
      )}
    </div>
  );
}

function TaskCommentMessage({ message, author }: { message: TeamMessage; author?: TaskUser }) {
  const meta = message.taskComment!;
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
      <div className="msg-meta" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 500 }}>{author?.name ?? 'Unknown'}</span>
        <span style={{ color: 'var(--color-text-tertiary)' }}>commented on a task · {formatTs(message.ts)}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
        <span className="mono" style={{ fontSize: 11, color: 'var(--color-brand-accent)' }}>{meta.propertyCode}</span>
        <strong style={{ fontSize: 13 }}>{meta.taskTitle}</strong>
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
        {renderMentions(meta.commentPreview, message.mentions)}
      </div>
      <button
        type="button"
        className="btn ghost sm"
        style={{ marginTop: 10 }}
        onClick={() => { window.location.href = `/fad?m=operations&task=${encodeURIComponent(meta.taskId)}&comment=${encodeURIComponent(meta.commentId)}`; }}
      >
        Open task
      </button>
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
