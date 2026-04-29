'use client';

import { useState } from 'react';
import { TASK_USERS } from '../../../_data/tasks';
import { TEAM_MESSAGES, type ChannelKey, type TeamMessage, type TeamCallMeta } from '../../../_data/teamInbox';
import { IconClose, IconSend } from '../../icons';
import { useCurrentUserId } from '../../usePermissions';
import { fireToast } from '../../Toaster';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Either channel or DM target — exactly one. */
  target: { kind: 'channel'; channelKey: ChannelKey } | { kind: 'dm'; dmId: string; participantIds: string[] };
  /** Pre-filled invitee ids based on the thread context. */
  defaultInviteeIds?: string[];
  /** Called after successful submit so the parent can refresh the thread. */
  onScheduled?: (msg: TeamMessage) => void;
}

function makeMeetSlug(): string {
  const segments = [3, 4, 3];
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  return segments
    .map((n) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join(''))
    .join('-');
}

function tomorrowAt09(): { date: string; time: string } {
  const d = new Date('2026-04-28T09:00:00');
  return {
    date: d.toISOString().slice(0, 10),
    time: '09:00',
  };
}

export function ScheduleCallDrawer({ open, onClose, target, defaultInviteeIds, onScheduled }: Props) {
  const currentUserId = useCurrentUserId();
  const initial = tomorrowAt09();
  const [title, setTitle] = useState('Quick sync');
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [duration, setDuration] = useState('30');
  const [inviteeIds, setInviteeIds] = useState<string[]>(defaultInviteeIds ?? []);
  const [externalEmail, setExternalEmail] = useState('');
  const [externalEmails, setExternalEmails] = useState<string[]>([]);

  const candidateUsers = TASK_USERS.filter((u) => u.active && u.role !== 'external');

  const toggleInvitee = (userId: string) => {
    setInviteeIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  const addExternal = () => {
    const email = externalEmail.trim();
    if (email && !externalEmails.includes(email)) {
      setExternalEmails((prev) => [...prev, email]);
      setExternalEmail('');
    }
  };

  const submit = () => {
    // @demo:config — Google Meet hardcoded as video provider. Replace with
    // GET /api/integrations/video-conferencing returning active provider + URL template. Tag: PROD-CONFIG-7.
    const meetUrl = `https://meet.google.com/${makeMeetSlug()}`;
    const startAt = new Date(`${date}T${time}:00`).toISOString();
    const callMeta: TeamCallMeta = {
      id: `call-${Date.now()}`,
      title: title || 'Untitled call',
      startAt,
      meetUrl,
      inviteeIds,
      inviteeEmails: externalEmails.length > 0 ? externalEmails : undefined,
      organizerId: currentUserId,
    };

    const message: TeamMessage = {
      id: `tm-${Date.now()}`,
      authorId: currentUserId,
      text: `📅 Call scheduled: ${callMeta.title} — ${formatStart(startAt)} (${duration} min)`,
      ts: new Date().toISOString(),
      kind: 'call_scheduled',
      callMeta,
      ...(target.kind === 'channel' ? { channelKey: target.channelKey } : { dmId: target.dmId }),
    };
    TEAM_MESSAGES.push(message);

    const totalAttendees = inviteeIds.length + externalEmails.length;
    fireToast(`Would create Google Calendar event for ${totalAttendees} attendee${totalAttendees === 1 ? '' : 's'}`);

    onScheduled?.(message);
    onClose();
  };

  if (!open) return null;

  return (
    <>
      <div className="fad-drawer-overlay open" onClick={onClose} />
      <aside className="fad-drawer open" aria-hidden={false} style={{ maxWidth: 460 }}>
        <div className="fad-drawer-header">
          <div className="fad-drawer-title">Schedule call</div>
          <button className="fad-util-btn" onClick={onClose} title="Close" style={{ marginLeft: 'auto' }}>
            <IconClose />
          </button>
        </div>
        <div className="fad-drawer-body" style={{ padding: 16 }}>
          <Field label="Title">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What is this call about?"
            />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <Field label="Date">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Time">
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
            <Field label="Duration">
              <select value={duration} onChange={(e) => setDuration(e.target.value)}>
                <option value="15">15 min</option>
                <option value="30">30 min</option>
                <option value="45">45 min</option>
                <option value="60">60 min</option>
                <option value="90">90 min</option>
              </select>
            </Field>
          </div>

          <Field label="Attendees">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {candidateUsers.map((u) => {
                const selected = inviteeIds.includes(u.id);
                return (
                  <button
                    key={u.id}
                    className={'inbox-chip' + (selected ? ' active' : '')}
                    onClick={() => toggleInvitee(u.id)}
                    type="button"
                  >
                    <span
                      style={{
                        display: 'inline-block',
                        width: 14,
                        height: 14,
                        borderRadius: 7,
                        background: u.avatarColor,
                        color: 'white',
                        fontSize: 9,
                        textAlign: 'center',
                        lineHeight: '14px',
                        marginRight: 4,
                      }}
                    >
                      {u.initials}
                    </span>
                    {u.name.split(' ')[0]}
                  </button>
                );
              })}
            </div>
            {externalEmails.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {externalEmails.map((email) => (
                  <span key={email} className="chip">
                    {email}
                    <button
                      onClick={() => setExternalEmails((prev) => prev.filter((e) => e !== email))}
                      style={{
                        marginLeft: 4,
                        background: 'transparent',
                        border: 0,
                        cursor: 'pointer',
                        color: 'inherit',
                      }}
                      title="Remove"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                type="email"
                value={externalEmail}
                onChange={(e) => setExternalEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addExternal();
                  }
                }}
                placeholder="external email…"
                style={{ flex: 1 }}
              />
              <button type="button" className="btn ghost sm" onClick={addExternal}>
                Add
              </button>
            </div>
          </Field>

          <div style={{ marginTop: 18, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={submit}
              disabled={inviteeIds.length === 0 && externalEmails.length === 0}
            >
              <IconSend size={12} /> Generate Meet & send
            </button>
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            Phase 1: generates fixture Meet URL and posts to thread. Phase 2 wires the real Google Calendar API.
          </div>
        </div>
      </aside>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label
      style={{
        display: 'block',
        marginBottom: 12,
        fontSize: 11,
        color: 'var(--color-text-secondary)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}
    >
      {label}
      <div style={{ marginTop: 4, textTransform: 'none' }}>{children}</div>
    </label>
  );
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

