'use client';

import { useEffect, useState, type MouseEvent } from 'react';
import {
  IconBell,
  IconBook,
  IconChat,
  IconHelp,
  IconMoon,
  IconRoad,
  IconSearch,
  IconSidebar,
  IconSpark,
  IconSparkle,
  IconSun,
  IconTool,
} from './icons';
import { RoleSwitcher } from './PermissionGate';
import { usePermissions, useCurrentUserId } from './usePermissions';
import { TASK_USER_BY_ID } from '../_data/tasks';
import { ROLE_LABEL } from '../_data/permissions';
import { clearToken } from '../../../components/types';
import {
  topNotifications,
  unreadCount,
  isRead,
  markRead,
  markAllRead,
  allNotifications,
  subscribeNotifications,
  type Notification,
} from '../_data/notifications';

interface Props {
  onOpenPalette: () => void;
  onOpenFriday: () => void;
  fridayOpen: boolean;
  onToggleSidebar: () => void;
  onGoHome?: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenBell: (e: MouseEvent) => void;
  bellOpen: boolean;
  onOpenHelp: (e: MouseEvent) => void;
  helpOpen: boolean;
  onOpenAvatar: (e: MouseEvent) => void;
  avatarOpen: boolean;
}

export function Header({
  onOpenPalette,
  onOpenFriday,
  fridayOpen,
  onToggleSidebar,
  onGoHome,
  theme,
  onToggleTheme,
  onOpenBell,
  bellOpen,
  onOpenHelp,
  helpOpen,
  onOpenAvatar,
  avatarOpen,
}: Props) {
  const { currentUserId, role } = usePermissions();
  const currentUser = TASK_USER_BY_ID[currentUserId];

  // Subscribe to notifications-rev so the bell dot updates reactively
  const [, setNotifRev] = useState(0);
  useEffect(() => subscribeNotifications(setNotifRev), []);

  const counts = unreadCount(role, currentUserId);
  const dotTone = counts.urgent > 0 ? 'urgent' : counts.total > 0 ? 'unread' : 'none';

  return (
    <header className="fad-header">
      <div className="fad-brand">
        <button
          className="fad-util-btn"
          onClick={onToggleSidebar}
          title="Toggle sidebar"
          style={{ marginRight: 4 }}
        >
          <IconSidebar />
        </button>
        <button
          className="fad-brand-link"
          onClick={onGoHome}
          title="Home · Inbox"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/friday-logo.jpg"
            alt="Friday"
            className="fad-brand-logo"
            width={32}
            height={32}
          />
          <span className="fad-brand-name">
            friday.mu
            <span className="fad-brand-sub">Admin</span>
          </span>
        </button>
      </div>

      <div className="fad-ask-wrap">
        <button className="fad-ask-pill" onClick={onOpenPalette}>
          <IconSearch size={14} />
          <span className="ask-label">
            Search or <span className="ask-friday">Ask Friday</span>…
          </span>
          <span className="kbd">⌘K</span>
        </button>
      </div>

      <div className="fad-utilities">
        <RoleSwitcher />
        <button
          className={'fad-util-btn' + (fridayOpen ? ' active' : '')}
          onClick={onOpenFriday}
          title="Ask Friday  ⌘/"
        >
          <IconSparkle />
        </button>
        <div style={{ position: 'relative' }}>
          <button
            className={'fad-util-btn' + (bellOpen ? ' active' : '')}
            onClick={onOpenBell}
            title={counts.total > 0 ? `Notifications · ${counts.total} unread${counts.urgent > 0 ? ` · ${counts.urgent} urgent` : ''}` : 'Notifications'}
          >
            <IconBell />
            {dotTone !== 'none' && (
              <span className={'fad-util-dot' + (dotTone === 'urgent' ? ' urgent' : ' unread')} />
            )}
            {counts.total > 0 && (
              <span className={'fad-bell-count' + (counts.urgent > 0 ? ' urgent' : '')}>
                {counts.total > 99 ? '99+' : counts.total}
              </span>
            )}
          </button>
          {bellOpen && <NotificationsDropdown role={role} userId={currentUserId} />}
        </div>
        <div style={{ position: 'relative' }}>
          <button
            className={'fad-util-btn' + (helpOpen ? ' active' : '')}
            onClick={onOpenHelp}
            title="Help"
          >
            <IconHelp />
          </button>
          {helpOpen && <HelpDropdown />}
        </div>
        <button
          className="fad-util-btn"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
        >
          {theme === 'dark' ? <IconSun /> : <IconMoon />}
        </button>
        <div style={{ position: 'relative' }}>
          <button
            onClick={onOpenAvatar}
            className="fad-avatar"
            title="Account"
            style={currentUser ? { background: currentUser.avatarColor } : undefined}
          >
            {currentUser?.initials ?? 'IS'}
          </button>
          {avatarOpen && <AvatarDropdown />}
        </div>
      </div>
    </header>
  );
}

type NotifFilter = 'all' | 'unread' | 'mentions';

function NotificationsDropdown({ role, userId }: { role: ReturnType<typeof usePermissions>['role']; userId: string }) {
  const [filter, setFilter] = useState<NotifFilter>('unread');
  const [aiSort, setAiSort] = useState(true);
  const [, setRev] = useState(0);
  useEffect(() => subscribeNotifications(setRev), []);

  const all = allNotifications(role, userId);
  const filtered = all.filter((n) => {
    if (filter === 'unread') return !isRead(n.id);
    if (filter === 'mentions') return n.isMention;
    return true;
  });

  const visible = aiSort
    ? [...filtered].sort((a, b) => (b.aiPriority ?? 0) - (a.aiPriority ?? 0))
    : [...filtered].sort((a, b) => (a.ts < b.ts ? 1 : -1));

  const top = visible.slice(0, 8);

  const handleMarkAllRead = (e: MouseEvent) => {
    e.stopPropagation();
    markAllRead(all);
  };

  return (
    <div className="fad-dropdown fad-notif-dropdown" style={{ width: 380 }}>
      <div className="fad-dropdown-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1 }}>Notifications</span>
        <button
          className="fad-notif-action"
          onClick={() => setAiSort(!aiSort)}
          title={aiSort ? 'Switch to chronological' : 'Switch to AI priority'}
        >
          {aiSort ? '✨ AI' : 'Recent'}
        </button>
        <button className="fad-notif-action" onClick={handleMarkAllRead}>Mark all read</button>
      </div>

      {/* Filter chips */}
      <div className="fad-notif-filters">
        <FilterChip label="All" count={all.length} active={filter === 'all'} onClick={() => setFilter('all')} />
        <FilterChip label="Unread" count={all.filter((n) => !isRead(n.id)).length} active={filter === 'unread'} onClick={() => setFilter('unread')} />
        <FilterChip label="@mentions" count={all.filter((n) => n.isMention).length} active={filter === 'mentions'} onClick={() => setFilter('mentions')} />
      </div>

      {/* List */}
      <div className="fad-notif-list">
        {top.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 12 }}>
            {filter === 'unread' ? 'All caught up · no unread.' : 'No notifications.'}
          </div>
        ) : (
          top.map((n) => <NotifRow key={n.id} notif={n} aiSort={aiSort} />)
        )}
      </div>

      {/* Footer */}
      <button className="fad-notif-viewall" onClick={() => { window.location.href = '/fad?m=notifications'; }}>
        View all {all.length} →
      </button>
    </div>
  );
}

function FilterChip({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={'fad-notif-filter' + (active ? ' active' : '')}
    >
      {label} <span style={{ opacity: 0.7 }}>{count}</span>
    </button>
  );
}

function NotifRow({ notif, aiSort }: { notif: Notification; aiSort: boolean }) {
  const read = isRead(notif.id);
  const handleClick = () => {
    markRead(notif.id);
    if (notif.href) {
      window.location.href = notif.href;
    }
  };
  const handleToggleRead = (e: MouseEvent) => {
    e.stopPropagation();
    if (read) {
      // Re-mark as unread
      const set = new Set([...JSON.parse(localStorage.getItem('fad:notif-read') || '[]')]);
      set.delete(notif.id);
      localStorage.setItem('fad:notif-read', JSON.stringify([...set]));
      window.dispatchEvent(new Event('storage'));
    } else {
      markRead(notif.id);
    }
  };

  const tone = notif.severity === 'urgent' ? 'urgent' : notif.severity === 'warn' ? 'warn' : '';

  return (
    <button
      className={'fad-notif-row' + (read ? ' read' : '') + ` ${tone}`}
      onClick={handleClick}
      title={aiSort && notif.aiReason ? `Ranked: ${notif.aiReason}` : notif.title}
    >
      <span className={'fad-notif-dot ' + tone} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          {notif.isMention && <span className="fad-notif-mention">@</span>}
          {aiSort && notif.aiPriority && notif.aiPriority > 0.7 && <span style={{ fontSize: 10, color: 'var(--color-brand-accent)' }}>✨</span>}
          <span style={{ fontWeight: read ? 400 : 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {notif.title}
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {notif.body}
        </div>
        <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {notif.module} · {notif.ts.slice(5, 16).replace('T', ' ')}
        </div>
      </span>
      <button
        onClick={handleToggleRead}
        className="fad-notif-toggle"
        title={read ? 'Mark unread' : 'Mark read'}
      >
        {read ? '○' : '●'}
      </button>
    </button>
  );
}

function HelpDropdown() {
  const items = [
    { t: 'Help docs', I: IconBook },
    { t: 'Report a bug', I: IconTool },
    { t: "What's new", I: IconSpark },
    { t: 'Roadmap', I: IconRoad },
    { t: 'Feedback', I: IconChat },
  ];
  return (
    <div className="fad-dropdown" style={{ width: 220 }}>
      {items.map((it, i) => {
        const I = it.I;
        return (
          <button className="fad-dropdown-item" key={i}>
            <I size={14} />
            <span>{it.t}</span>
          </button>
        );
      })}
    </div>
  );
}

function AvatarDropdown() {
  const { currentUserId, role } = usePermissions();
  const user = TASK_USER_BY_ID[currentUserId];

  // @demo:auth — Tag: PROD-AUTH-2 — see frontend/DEMO_CRUFT.md
  // Replace with: POST /api/auth/logout to invalidate session server-side.
  // Keep the localStorage cleanup for client-side hygiene.
  const handleLogout = () => {
    try {
      clearToken();
      // Clear FAD identity state. Keeps preferences (theme, sidebar collapsed)
      // so the user lands back at /login with their visual settings intact.
      localStorage.removeItem('fad:dev-role');
      localStorage.removeItem('fad:dev-user');
      localStorage.removeItem('fad:real-role');
      localStorage.removeItem('fad:last-email');
    } catch {
      /* localStorage unavailable — proceed to navigate anyway */
    }
    window.location.href = '/';
  };

  return (
    <div className="fad-dropdown" style={{ width: 220 }}>
      <div style={{ padding: '10px', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
        <div style={{ fontWeight: 500, fontSize: 13 }}>{user?.name ?? 'Unknown user'}</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          {ROLE_LABEL[role]} · friday.mu
        </div>
      </div>
      <button className="fad-dropdown-item">Profile</button>
      <button className="fad-dropdown-item">Preferences</button>
      <div className="fad-dropdown-divider" />
      <button
        className="fad-dropdown-item"
        onClick={handleLogout}
        data-testid="btn-logout"
      >
        Log out
      </button>
    </div>
  );
}
