'use client';

import { useEffect, useState, type KeyboardEvent, type MouseEvent } from 'react';
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
import { ROLE_LABEL } from '../_data/permissions';
import { useDisplayedUser } from '../_data/useDisplayedUser';
import {
  topNotifications,
  unreadCount,
  isRead,
  markRead,
  markUnread,
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
  // Branches on tenant: FR keeps the role-switcher-driven fixture
  // identity, SaaS tenants read display_name + username from the JWT.
  const currentUser = useDisplayedUser();

  // Subscribe to notifications-rev so the bell dot updates reactively
  const [, setNotifRev] = useState(0);
  useEffect(() => subscribeNotifications(setNotifRev), []);

  const counts = unreadCount(role, currentUserId);
  const dotTone = counts.urgent > 0 ? 'urgent' : counts.total > 0 ? 'unread' : 'none';

  return (
    <header
      className="fad-header"
      data-qa="fad-header"
      data-qa-role={role}
      data-qa-user-id={currentUserId}
      data-qa-bell-open={bellOpen ? 'true' : 'false'}
      data-qa-help-open={helpOpen ? 'true' : 'false'}
      data-qa-avatar-open={avatarOpen ? 'true' : 'false'}
    >
      <div className="fad-brand" data-qa="fad-brand">
        <button
          className="fad-util-btn"
          onClick={onToggleSidebar}
          title="Toggle sidebar"
          style={{ marginRight: 4 }}
          data-qa="fad-sidebar-toggle"
        >
          <IconSidebar />
        </button>
        <button
          className="fad-brand-link"
          onClick={onGoHome}
          title="Home · Inbox"
          data-qa="fad-home"
        >
          <span className="fad-brand-wordmark">fridayOS</span>
        </button>
      </div>

      <div className="fad-ask-wrap" data-qa="fad-search-wrap">
        <button className="fad-ask-pill" onClick={onOpenPalette} data-qa="fad-search">
          <IconSearch size={14} />
          <span className="ask-label">
            Search or <span className="ask-friday">Ask Friday</span>…
          </span>
          <span className="kbd">⌘K</span>
        </button>
      </div>

      <div className="fad-utilities" data-qa="fad-utilities">
        <RoleSwitcher />
        <button
          className={'fad-util-btn' + (fridayOpen ? ' active' : '')}
          onClick={onOpenFriday}
          title="Ask Friday  ⌘/"
          data-qa="fad-friday-drawer-toggle"
          data-qa-active={fridayOpen ? 'true' : 'false'}
        >
          <IconSparkle />
        </button>
        <div style={{ position: 'relative' }} data-qa="fad-notifications-wrap">
          <button
            className={'fad-util-btn' + (bellOpen ? ' active' : '')}
            onClick={onOpenBell}
            title={counts.total > 0 ? `Notifications · ${counts.total} unread${counts.urgent > 0 ? ` · ${counts.urgent} urgent` : ''}` : 'Notifications'}
            data-qa="fad-notifications-toggle"
            data-qa-active={bellOpen ? 'true' : 'false'}
            data-qa-unread-count={String(counts.total)}
            data-qa-urgent-count={String(counts.urgent)}
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
        <div style={{ position: 'relative' }} data-qa="fad-help-wrap">
          <button
            className={'fad-util-btn' + (helpOpen ? ' active' : '')}
            onClick={onOpenHelp}
            title="Help"
            data-qa="fad-help-toggle"
            data-qa-active={helpOpen ? 'true' : 'false'}
          >
            <IconHelp />
          </button>
          {helpOpen && <HelpDropdown />}
        </div>
        <button
          className="fad-util-btn fad-theme-toggle"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
          data-qa="fad-theme-toggle"
          data-qa-theme={theme}
        >
          {theme === 'dark' ? <IconSun /> : <IconMoon />}
        </button>
        <div style={{ position: 'relative' }} data-qa="fad-avatar-wrap">
          <button
            onClick={onOpenAvatar}
            className="fad-avatar"
            title="Account"
            style={{ background: currentUser.avatarColor }}
            data-qa="fad-avatar-toggle"
            data-qa-active={avatarOpen ? 'true' : 'false'}
          >
            {currentUser.initials}
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
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };
  const handleToggleRead = (e: MouseEvent) => {
    e.stopPropagation();
    if (read) {
      markUnread(notif.id);
    } else {
      markRead(notif.id);
    }
  };

  const tone = notif.severity === 'urgent' ? 'urgent' : notif.severity === 'warn' ? 'warn' : '';

  return (
    <div
      role="button"
      tabIndex={0}
      className={'fad-notif-row' + (read ? ' read' : '') + ` ${tone}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
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
    </div>
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
  const { role } = usePermissions();
  const user = useDisplayedUser();
  // Email domain ("friday.mu") in the subtitle was hardcoded — derive
  // from the live email if present so SaaS tenants see their own
  // domain. Falls back to friday.mu only when we genuinely have no
  // email (FR fixture users have user.email populated).
  const domain = user.email && user.email.includes('@')
    ? user.email.split('@')[1]
    : 'friday.mu';

  // @demo:auth — Tag: PROD-AUTH-2 — see frontend/DEMO_CRUFT.md
  // Replace with: POST /api/auth/logout to invalidate session server-side.
  // Keep the localStorage cleanup for client-side hygiene.
  const handleLogout = () => {
    try {
      // Clear FAD + GMS identity state. Keeps preferences (theme,
      // sidebar collapsed) so the user lands back at /login with their
      // visual settings intact.
      localStorage.removeItem('fad:dev-role');
      localStorage.removeItem('fad:dev-user');
      localStorage.removeItem('fad:real-role');
      localStorage.removeItem('fad:last-email');
      localStorage.removeItem('gms_token');
      localStorage.removeItem('gms_role');
    } catch {
      /* localStorage unavailable — proceed to navigate anyway */
    }
    window.location.href = '/';
  };

  return (
    <div className="fad-dropdown" style={{ width: 220 }}>
      <div style={{ padding: '10px', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
        <div style={{ fontWeight: 500, fontSize: 13 }}>{user.name}</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          {ROLE_LABEL[role]} · {domain}
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
