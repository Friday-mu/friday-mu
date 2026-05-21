'use client';

// Channel member admin drawer — replaces the curl commands that operators
// used to add/remove members of private channels (finance, admin, refunds,
// adjustments). Open from the channel header "Members" button.
//
// Permission model: anyone who can see the channel sees the member list.
// Add/remove buttons render only when the current user is a channel admin
// (caller's channelRole === 'admin'). Backend re-checks on every mutation,
// so the UI gate is purely UX.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addChannelMember,
  loadChannelDetail,
  loadTenantUsers,
  removeChannelMember,
  type LiveChannel,
  type LiveUser,
} from '../../../_data/teamInboxClient';
import { IconClose, IconPlus, IconUsers } from '../../icons';
import { fireToast } from '../../Toaster';

// JWT-derived identity — the `currentUserId` from usePermissions() is
// a fixture id ('u-ishant') for the role switcher, NOT the real DB
// UUID. The members API uses real UUIDs, so we read the JWT here to
// match correctly + detect system-admin (DB users.role === 'admin').
function readJwtIdentity(): { userId: string | null; role: string | null } {
  if (typeof window === 'undefined') return { userId: null, role: null };
  const token = localStorage.getItem('gms_token');
  if (!token) return { userId: null, role: null };
  try {
    const payload = JSON.parse(atob(token.split('.')[1] || ''));
    return { userId: payload?.user_id || null, role: payload?.role || null };
  } catch {
    return { userId: null, role: null };
  }
}

interface Props {
  open: boolean;
  onClose: () => void;
  channelId: string;
  channelName: string;
  /** Fired after add/remove so the parent can refetch channels (membership
   *  affects visibility of private channels in the sidebar). */
  onMembersChanged?: () => void;
}

type ChannelMember = LiveUser & { channelRole: 'admin' | 'member'; joinedAt: string };

export function ChannelMembersDrawer({
  open,
  onClose,
  channelId,
  channelName,
  onMembersChanged,
}: Props) {
  // Real DB user ID from JWT (NOT the fixture role-switcher id that
  // usePermissions() returns — that's 'u-ishant' which never matches
  // the UUIDs the team_inbox API returns).
  const jwt = useMemo(() => readJwtIdentity(), []);
  const currentUserId = jwt.userId ?? '';
  const [channel, setChannel] = useState<LiveChannel | null>(null);
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [tenantUsers, setTenantUsers] = useState<LiveUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingAdd, setPendingAdd] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const refetch = useCallback(async () => {
    if (!open || !channelId) return;
    setLoading(true);
    try {
      const [detail, users] = await Promise.all([
        loadChannelDetail(channelId),
        loadTenantUsers(),
      ]);
      setChannel(detail.channel);
      setMembers(detail.members);
      setTenantUsers(users);
    } catch (e) {
      fireToast(e instanceof Error ? e.message : 'Failed to load members');
    } finally {
      setLoading(false);
    }
  }, [open, channelId]);

  useEffect(() => { refetch(); }, [refetch]);

  const me = members.find((m) => m.id === currentUserId);
  // System admin (DB-side users.role === 'admin') is the bootstrap path
  // for private channels with zero seeded members — without this, nobody
  // could ever become a channel admin via the UI. Both signals checked:
  // (1) JWT `role` claim (always available, even before tenantUsers loads),
  // (2) tenant users lookup (canonical, but async).
  const meTenant = tenantUsers.find((u) => u.id === currentUserId);
  const isSystemAdmin = jwt.role === 'admin' || meTenant?.role === 'admin';
  const isAdmin = me?.channelRole === 'admin' || isSystemAdmin;

  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);
  const candidates = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return tenantUsers
      .filter((u) => !memberIds.has(u.id))
      .filter((u) => !q ||
        u.displayName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q));
  }, [tenantUsers, memberIds, filter]);

  const handleAdd = async (userId: string) => {
    setPendingAdd(userId);
    try {
      await addChannelMember(channelId, userId, 'member');
      await refetch();
      onMembersChanged?.();
    } catch (e) {
      fireToast(e instanceof Error ? e.message : 'Add failed');
    } finally {
      setPendingAdd(null);
    }
  };

  const handleRemove = async (userId: string) => {
    if (userId === currentUserId) {
      const ok = confirm('Remove yourself from this channel? You will lose access.');
      if (!ok) return;
    }
    setPendingRemove(userId);
    try {
      await removeChannelMember(channelId, userId);
      await refetch();
      onMembersChanged?.();
    } catch (e) {
      fireToast(e instanceof Error ? e.message : 'Remove failed');
    } finally {
      setPendingRemove(null);
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="fad-drawer-overlay open" onClick={onClose} />
      <aside className="fad-drawer open" aria-hidden={false} style={{ maxWidth: 420 }}>
        <div className="fad-drawer-header">
          <div className="fad-drawer-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconUsers size={14} />
            <span>Members · {channelName}</span>
            {channel?.visibility === 'private' && (
              <span
                className="chip"
                style={{ fontSize: 10, padding: '1px 6px', background: 'var(--color-background-tertiary)' }}
              >
                Private
              </span>
            )}
          </div>
          <button className="fad-util-btn" onClick={onClose} title="Close" style={{ marginLeft: 'auto' }}>
            <IconClose />
          </button>
        </div>
        <div className="fad-drawer-body" style={{ padding: 16, overflowY: 'auto' }}>
          {loading && members.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', textAlign: 'center', padding: 12 }}>
              Loading…
            </div>
          )}

          <div
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--color-text-tertiary)',
              fontWeight: 500,
              marginBottom: 6,
            }}
          >
            Current members ({members.length})
          </div>
          {members.length === 0 && !loading && (
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 12 }}>
              No members. Add someone below.
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
            {members.map((m) => (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-background-secondary)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                    {m.displayName || m.username}
                    {m.id === currentUserId && (
                      <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--color-text-tertiary)' }}>(you)</span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--color-text-tertiary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {m.email}
                  </div>
                </div>
                {m.channelRole === 'admin' && (
                  <span
                    className="chip"
                    style={{ fontSize: 10, padding: '1px 6px', background: 'var(--color-background-tertiary)' }}
                  >
                    Admin
                  </span>
                )}
                {isAdmin && (
                  <button
                    className="btn ghost sm"
                    disabled={pendingRemove === m.id}
                    onClick={() => handleRemove(m.id)}
                    style={{ fontSize: 11, padding: '2px 8px' }}
                    title="Remove from channel"
                  >
                    {pendingRemove === m.id ? '…' : 'Remove'}
                  </button>
                )}
              </div>
            ))}
          </div>

          {isAdmin ? (
            <>
              <div
                style={{
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--color-text-tertiary)',
                  fontWeight: 500,
                  marginBottom: 6,
                }}
              >
                Add member
              </div>
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search name, username, or email…"
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  fontSize: 13,
                  border: '0.5px solid var(--color-border-tertiary)',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: 6,
                }}
              />
              {candidates.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', padding: 8 }}>
                  {filter ? 'No matches.' : 'Everyone in the tenant is already a member.'}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 280, overflowY: 'auto' }}>
                {candidates.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => handleAdd(u.id)}
                    disabled={pendingAdd === u.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 8px',
                      background: 'transparent',
                      border: '0.5px solid transparent',
                      borderRadius: 'var(--radius-sm)',
                      cursor: pendingAdd === u.id ? 'wait' : 'pointer',
                      textAlign: 'left',
                      width: '100%',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--color-background-secondary)';
                      e.currentTarget.style.borderColor = 'var(--color-border-tertiary)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.borderColor = 'transparent';
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{u.displayName || u.username}</div>
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--color-text-tertiary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {u.email}
                      </div>
                    </div>
                    <IconPlus size={12} />
                    {pendingAdd === u.id && <span style={{ fontSize: 11 }}>adding…</span>}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div
              style={{
                fontSize: 12,
                color: 'var(--color-text-tertiary)',
                padding: 12,
                background: 'var(--color-background-secondary)',
                borderRadius: 'var(--radius-sm)',
                textAlign: 'center',
              }}
            >
              Only channel admins can add or remove members. Ask an admin to grant access.
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
