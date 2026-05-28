'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ModuleHeader } from '../ModuleHeader';
import {
  archiveNotification,
  subscribeNotifications,
  getContext,
  setContext,
  clearContext,
  snoozeNotification,
  isSnoozedNow,
  isArchived,
  unarchiveNotification,
  type Notification,
  type Severity,
  type ModuleId,
  type UserContext,
} from '../../_data/notifications';
import { notificationRead, useLiveNotifications } from '../../_data/notificationsClient';
import { useTenantUsers } from '../../_data/useTenantUsers';
import { fireToast } from '../Toaster';
import { usePushNotifications } from '../../../../components/usePushNotifications';

type ReadFilter = 'all' | 'unread' | 'read';
type SortMode = 'ai' | 'recent';
type NotificationTab = 'inbox' | 'archived';
type CategoryFilter = 'all' | 'mentions' | 'comments' | 'watching' | 'department';

const MODULE_LABELS: Record<ModuleId, string> = {
  inbox: 'Inbox',
  operations: 'Operations',
  calendar: 'Calendar',
  reservations: 'Reservations',
  properties: 'Properties',
  reviews: 'Reviews',
  finance: 'Finance',
  hr: 'HR',
  friday: 'Friday AI',
};

const SEVERITY_LABEL: Record<Severity, string> = { info: 'Info', warn: 'Warning', urgent: 'Urgent' };
const SEVERITY_EMOJI: Record<Severity, string> = { info: '⚪', warn: '🟡', urgent: '🔴' };

export function NotificationsModule() {
  const [, setRev] = useState(0);
  useEffect(() => subscribeNotifications(setRev), []);
  const {
    notifications: all,
    loading,
    error,
    markRead: markLiveRead,
    markUnread: markLiveUnread,
    markAllRead: markLiveAllRead,
  } = useLiveNotifications();
  const {
    permission: pushPermission,
    requestPermission: requestPushPermission,
    refreshSubscription: refreshPushSubscription,
    deliveryReady: pushDeliveryReady,
    syncing: pushSyncing,
    error: pushError,
  } = usePushNotifications();

  const [readFilter, setReadFilter] = useState<ReadFilter>('all');
  const [notificationTab, setNotificationTab] = useState<NotificationTab>('inbox');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [moduleFilter, setModuleFilter] = useState<Set<ModuleId>>(new Set());
  const [severityFilter, setSeverityFilter] = useState<Set<Severity>>(new Set());
  const [mentionsOnly, setMentionsOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('ai');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filtersOpenMobile, setFiltersOpenMobile] = useState(false);
  const [expandedPreviewIds, setExpandedPreviewIds] = useState<Set<string>>(new Set());

  const readIds = useMemo(() => new Set(all.filter(notificationRead).map((n) => n.id)), [all]);
  const inboxItems = all.filter((n) => !isArchived(n.id));
  const archivedItems = all.filter((n) => isArchived(n.id));
  const activeTabItems = notificationTab === 'archived' ? archivedItems : inboxItems;

  const filtered = useMemo(() => {
    let out = activeTabItems.slice();
    if (readFilter === 'unread') out = out.filter((n) => !readIds.has(n.id));
    else if (readFilter === 'read') out = out.filter((n) => readIds.has(n.id));
    if (categoryFilter === 'mentions') out = out.filter((n) => n.isMention);
    if (categoryFilter === 'comments') out = out.filter((n) => n.category === 'comment' || /comment/i.test(`${n.title} ${n.body}`));
    if (categoryFilter === 'watching') out = out.filter((n) => n.module === 'operations' || n.module === 'properties');
    if (categoryFilter === 'department') out = out.filter((n) => n.category === 'department' || n.module === 'operations' || n.module === 'hr');
    if (moduleFilter.size > 0) out = out.filter((n) => moduleFilter.has(n.module));
    if (severityFilter.size > 0) out = out.filter((n) => severityFilter.has(n.severity));
    if (mentionsOnly) out = out.filter((n) => n.isMention);
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter((n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q));
    }
    if (sortMode === 'ai') {
      out.sort((a, b) => (b.aiPriority ?? 0) - (a.aiPriority ?? 0));
    } else {
      out.sort((a, b) => (a.ts < b.ts ? 1 : -1));
    }
    return out;
  }, [activeTabItems, categoryFilter, moduleFilter, readFilter, readIds, severityFilter, mentionsOnly, search, sortMode]);

  const selected = selectedId ? all.find((n) => n.id === selectedId) ?? null : null;

  const handleMarkRead = useCallback(async (id: string) => {
    try {
      await markLiveRead(id);
    } catch (e) {
      fireToast(e instanceof Error ? `Read state failed: ${e.message}` : 'Read state failed');
    }
  }, [markLiveRead]);

  const handleMarkUnread = useCallback(async (id: string) => {
    try {
      await markLiveUnread(id);
    } catch (e) {
      fireToast(e instanceof Error ? `Read state failed: ${e.message}` : 'Read state failed');
    }
  }, [markLiveUnread]);

  const handleArchiveToggle = useCallback((id: string) => {
    if (isArchived(id)) {
      unarchiveNotification(id);
    } else {
      archiveNotification(id);
      void handleMarkRead(id);
    }
  }, [handleMarkRead]);

  // Auto-mark-read when a notification is selected
  useEffect(() => {
    if (selected && !notificationRead(selected)) void handleMarkRead(selected.id);
  }, [handleMarkRead, selected?.id, selected?.readAt]);

  const counts = {
    all: inboxItems.length,
    archived: archivedItems.length,
    unread: inboxItems.filter((n) => !readIds.has(n.id) && !isSnoozedNow(getContext(n.id))).length,
    mentions: all.filter((n) => n.isMention).length,
    comments: all.filter((n) => n.category === 'comment' || /comment/i.test(`${n.title} ${n.body}`)).length,
    watching: all.filter((n) => n.module === 'operations' || n.module === 'properties').length,
    department: all.filter((n) => n.category === 'department' || n.module === 'operations' || n.module === 'hr').length,
    urgent: inboxItems.filter((n) => n.severity === 'urgent' && !readIds.has(n.id) && !isSnoozedNow(getContext(n.id))).length,
    snoozed: all.filter((n) => isSnoozedNow(getContext(n.id))).length,
  };
  const tabCounts = {
    all: activeTabItems.length,
    unread: activeTabItems.filter((n) => !readIds.has(n.id) && !isSnoozedNow(getContext(n.id))).length,
    read: activeTabItems.filter((n) => readIds.has(n.id)).length,
    mentions: activeTabItems.filter((n) => n.isMention).length,
    comments: activeTabItems.filter((n) => n.category === 'comment' || /comment/i.test(`${n.title} ${n.body}`)).length,
    watching: activeTabItems.filter((n) => n.module === 'operations' || n.module === 'properties').length,
    department: activeTabItems.filter((n) => n.category === 'department' || n.module === 'operations' || n.module === 'hr').length,
  };

  const moduleCounts = useMemo(() => {
    const m: Partial<Record<ModuleId, number>> = {};
    all.forEach((n) => { m[n.module] = (m[n.module] ?? 0) + 1; });
    return m;
  }, [all]);

  const toggleModule = (mod: ModuleId) => setModuleFilter((p) => { const n = new Set(p); n.has(mod) ? n.delete(mod) : n.add(mod); return n; });
  const toggleSeverity = (sev: Severity) => setSeverityFilter((p) => { const n = new Set(p); n.has(sev) ? n.delete(sev) : n.add(sev); return n; });
  const handleMarkAllRead = () => {
    void markLiveAllRead(filtered).catch((e) => {
      fireToast(e instanceof Error ? `Read state failed: ${e.message}` : 'Read state failed');
    });
  };
  const handleEnablePush = () => {
    void requestPushPermission()
      .then((ok) => {
        fireToast(ok ? 'Browser notifications enabled' : 'Browser notifications not enabled');
      })
      .catch((e) => {
        fireToast(e instanceof Error ? `Push setup failed: ${e.message}` : 'Push setup failed');
      });
  };
  const handleRepairPush = () => {
    void refreshPushSubscription()
      .then((ok) => {
        fireToast(ok ? 'Push subscription refreshed' : 'Push subscription still needs attention');
      })
      .catch((e) => {
        fireToast(e instanceof Error ? `Push refresh failed: ${e.message}` : 'Push refresh failed');
      });
  };
  const clearFilters = () => {
    setModuleFilter(new Set());
    setSeverityFilter(new Set());
    setMentionsOnly(false);
    setCategoryFilter('all');
    setReadFilter('all');
    setSearch('');
  };
  const filtersActive = moduleFilter.size > 0 || severityFilter.size > 0 || mentionsOnly || categoryFilter !== 'all' || readFilter !== 'all' || search.trim().length > 0;
  const toggleExpandedPreview = (id: string) => setExpandedPreviewIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <ModuleHeader
        title="Notifications"
        subtitle={`${counts.unread} unread${counts.urgent > 0 ? ` · ${counts.urgent} urgent` : ''}${counts.snoozed > 0 ? ` · ${counts.snoozed} snoozed` : ''} · ${counts.all} total`}
        actions={
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn ghost sm notif-mobile-filter-btn notif-header-action" onClick={() => setFiltersOpenMobile(true)}>
              ☰ Filters
            </button>
            {pushPermission === 'default' && (
              <button className="btn ghost sm notif-header-action" onClick={handleEnablePush}>
                Enable push
              </button>
            )}
            {pushPermission === 'granted' && (
              <button className="btn ghost sm notif-header-action" onClick={handleRepairPush} disabled={pushSyncing} title={pushError || (pushDeliveryReady ? 'Push delivery is registered on this device' : 'Refresh this device push subscription')}>
                {pushSyncing ? 'Checking push' : pushDeliveryReady ? 'Push ready' : 'Repair push'}
              </button>
            )}
            {pushPermission === 'denied' && (
              <button className="btn ghost sm notif-header-action" disabled title="Browser notifications are blocked">
                Push blocked
              </button>
            )}
            <button className="btn ghost sm notif-header-action" onClick={() => setSortMode(sortMode === 'ai' ? 'recent' : 'ai')} title="Toggle ranking">
              {sortMode === 'ai' ? '✨ AI priority' : 'Chronological'}
            </button>
            <button className="btn ghost sm notif-header-action" onClick={handleMarkAllRead}>Mark all read</button>
          </div>
        }
      />

      <div className="notif-top-tabs">
        {([
          ['inbox', `Inbox (${counts.all})`],
          ['archived', `Archived (${counts.archived})`],
        ] as const).map(([id, label]) => (
          <button key={id} className={notificationTab === id ? 'active' : ''} onClick={() => setNotificationTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="notif-category-strip" aria-label="Notification filters">
        {([
          ['all', `All ${tabCounts.all}`],
          ['mentions', `Mentions ${tabCounts.mentions}`],
          ['comments', `Comments ${tabCounts.comments}`],
          ['watching', `Watching ${tabCounts.watching}`],
          ['department', `Department ${tabCounts.department}`],
        ] as const).map(([id, label]) => (
          <button key={id} className={categoryFilter === id ? 'active' : ''} onClick={() => setCategoryFilter(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="notif-page" style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Filter sidebar */}
        <aside className={'notif-filters' + (filtersOpenMobile ? ' mobile-open' : '')}>
          <div className="notif-filters-mobile-header">
            <span style={{ fontWeight: 500 }}>Filters</span>
            <button className="btn ghost sm notif-header-action" onClick={() => setFiltersOpenMobile(false)}>Close</button>
          </div>
          <div className="notif-filter-section">
            <h4>Read state</h4>
            <FilterRow label="All" count={tabCounts.all} active={readFilter === 'all'} onClick={() => setReadFilter('all')} />
            <FilterRow label="Unread" count={tabCounts.unread} active={readFilter === 'unread'} onClick={() => setReadFilter('unread')} />
            <FilterRow label="Read" count={tabCounts.read} active={readFilter === 'read'} onClick={() => setReadFilter('read')} />
          </div>

          <div className="notif-filter-section">
            <h4>Mentions</h4>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={mentionsOnly} onChange={() => setMentionsOnly(!mentionsOnly)} />
              <span>Only @mentions ({tabCounts.mentions})</span>
            </label>
          </div>

          <div className="notif-filter-section">
            <h4>Severity</h4>
            {(['urgent', 'warn', 'info'] as Severity[]).map((sev) => (
              <FilterRow key={sev} label={`${SEVERITY_EMOJI[sev]} ${SEVERITY_LABEL[sev]}`}
                count={all.filter((n) => n.severity === sev).length}
                active={severityFilter.has(sev)} onClick={() => toggleSeverity(sev)} />
            ))}
          </div>

          <div className="notif-filter-section">
            <h4>Module</h4>
            {(Object.keys(MODULE_LABELS) as ModuleId[]).map((mod) => {
              const c = moduleCounts[mod] ?? 0;
              if (c === 0) return null;
              return (
                <FilterRow key={mod} label={MODULE_LABELS[mod]} count={c}
                  active={moduleFilter.has(mod)} onClick={() => toggleModule(mod)} />
              );
            })}
          </div>

          {filtersActive && (
            <button className="btn ghost sm" style={{ marginTop: 12, width: '100%' }} onClick={clearFilters}>
              Clear all filters
            </button>
          )}
        </aside>

        {/* List */}
        <div className="notif-list-pane">
          <div className="notif-search-bar">
            <input type="text" placeholder="Search notifications..." value={search}
              onChange={(e) => setSearch(e.target.value)} className="fad-input" />
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>
              {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
            </span>
          </div>
          <div className="notif-list-rows">
            {filtered.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
                {loading ? 'Loading live notifications…' : 'No notifications match the current filters.'}
              </div>
            ) : (
              filtered.map((n) => (
                <ListRow key={n.id} notif={n} selected={selectedId === n.id} showAi={sortMode === 'ai'}
                  archived={notificationTab === 'archived'}
                  read={readIds.has(n.id)}
                  expanded={expandedPreviewIds.has(n.id)}
                  onSelect={() => setSelectedId(n.id)}
                  onToggleExpanded={() => toggleExpandedPreview(n.id)}
                  onArchiveToggle={() => handleArchiveToggle(n.id)}
                  onToggleRead={() => { if (readIds.has(n.id)) void handleMarkUnread(n.id); else void handleMarkRead(n.id); }} />
              ))
            )}
          </div>
        </div>

        {/* Detail — right panel only renders when something is selected */}
        {selected && (
          <aside className={'notif-detail' + (selected ? ' mobile-open' : '')}>
            <DetailPane
              notification={selected}
              onClose={() => setSelectedId(null)}
              onMarkRead={handleMarkRead}
              onMarkUnread={handleMarkUnread}
              onArchiveToggle={() => handleArchiveToggle(selected.id)}
            />
          </aside>
        )}

        {/* Right-panel default (desktop only, when nothing selected) */}
        {!selected && (
          <aside className="notif-detail notif-detail-empty">
            <DefaultPane all={all} readIds={readIds} onSelect={(id) => setSelectedId(id)} />
          </aside>
        )}
      </div>
      {error && (
        <div role="alert" style={{ padding: '8px 12px', fontSize: 12, color: 'var(--color-text-danger)', borderTop: '0.5px solid var(--color-border-tertiary)' }}>
          Live notifications failed to load: {error}
        </div>
      )}
    </div>
  );
}

// ───────────────── Default pane (no selection) ─────────────────

function DefaultPane({ all, readIds, onSelect }: { all: Notification[]; readIds: Set<string>; onSelect: (id: string) => void }) {
  const top3 = useMemo(() => {
    return [...all]
      .filter((n) => !readIds.has(n.id) && !isSnoozedNow(getContext(n.id)))
      .sort((a, b) => (b.aiPriority ?? 0) - (a.aiPriority ?? 0))
      .slice(0, 3);
  }, [all, readIds]);

  const wakingUp = useMemo(() => {
    const now = Date.now();
    return all.filter((n) => {
      const ctx = getContext(n.id);
      if (!ctx.snoozedUntil) return false;
      const due = new Date(ctx.snoozedUntil).getTime();
      return due > now && due - now < 24 * 3600 * 1000;
    }).slice(0, 5);
  }, [all]);

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 500 }}>✨ Top 3 to handle</h3>
        <p style={{ margin: '0 0 12px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          AI-ranked unread, factoring your context (snoozes, waiting-on, notes).
        </p>
        {top3.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>All caught up.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {top3.map((n) => (
              <button key={n.id} onClick={() => onSelect(n.id)} className="notif-default-row">
                <span className={'notif-row-dot ' + n.severity} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{MODULE_LABELS[n.module]}</div>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {wakingUp.length > 0 && (
        <div>
          <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 500 }}>⏱ Snoozed · waking up next 24h</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {wakingUp.map((n) => {
              const ctx = getContext(n.id);
              return (
                <button key={n.id} onClick={() => onSelect(n.id)} className="notif-default-row">
                  <span className="mono" style={{ fontSize: 10, color: 'var(--color-text-tertiary)', minWidth: 60 }}>
                    {ctx.snoozedUntil?.slice(11, 16)}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {n.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ marginTop: 'auto', padding: 12, background: 'var(--color-background-secondary)', borderRadius: 'var(--radius-sm)', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
        💡 Tip: select a notification to add a note, snooze, or mark as "waiting on" someone — these signals teach the AI ranker your priorities.
      </div>
    </div>
  );
}

// ───────────────── Filter helpers ─────────────────

function FilterRow({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={'notif-filter-row' + (active ? ' active' : '')}>
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{count}</span>
    </button>
  );
}

// ───────────────── List row ─────────────────

function ListRow({ notif, selected, showAi, archived, read, expanded, onSelect, onToggleRead, onArchiveToggle, onToggleExpanded }: {
  notif: Notification;
  selected: boolean;
  showAi: boolean;
  archived: boolean;
  read: boolean;
  expanded: boolean;
  onSelect: () => void;
  onToggleRead: () => void;
  onArchiveToggle: () => void;
  onToggleExpanded: () => void;
}) {
  const ctx = getContext(notif.id);
  const snoozed = isSnoozedNow(ctx);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={'notif-list-row' + (read ? ' read' : '') + (selected ? ' selected' : '') + (snoozed ? ' snoozed' : '')}
      title={showAi && notif.aiReason ? `Ranked: ${notif.aiReason}` : notif.title}
    >
      <span className={'notif-row-dot ' + notif.severity} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          {notif.isMention && <span className="fad-notif-mention">@</span>}
          {showAi && notif.aiPriority !== undefined && notif.aiPriority > 0.7 && (
            <span style={{ fontSize: 10, color: 'var(--color-brand-accent)' }}>✨</span>
          )}
          <span style={{ fontWeight: read ? 400 : 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {notif.title}
          </span>
          {snoozed && <span className="chip sm" style={{ fontSize: 9 }}>⏱ snoozed</span>}
          {ctx.note && !snoozed && <span className="chip sm" style={{ fontSize: 9 }}>💬 noted</span>}
          {ctx.waitingOn && <span className="chip sm" style={{ fontSize: 9 }}>⌛ waiting</span>}
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--color-text-tertiary)',
            overflow: expanded ? 'visible' : 'hidden',
            textOverflow: expanded ? 'clip' : 'ellipsis',
            whiteSpace: expanded ? 'pre-wrap' : 'nowrap',
            lineHeight: 1.45,
          }}
        >
          {notif.body}
        </div>
        {notif.body.length > 140 && (
          <span
            role="button"
            tabIndex={0}
            className="notif-preview-toggle"
            onClick={(e) => { e.stopPropagation(); onToggleExpanded(); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onToggleExpanded();
              }
            }}
          >
            {expanded ? 'View less' : 'View more'}
          </span>
        )}
        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {MODULE_LABELS[notif.module]} · {notif.ts.slice(5, 16).replace('T', ' ')}
        </div>
      </div>
      <button onClick={(e) => { e.stopPropagation(); onArchiveToggle(); }} className="fad-notif-archive" title={archived ? 'Restore' : 'Archive'}>
        {archived ? 'Restore' : 'Archive'}
      </button>
      <button onClick={(e) => { e.stopPropagation(); onToggleRead(); }} className="fad-notif-toggle" title={read ? 'Mark unread' : 'Mark read'}>
        {read ? '○' : '●'}
      </button>
    </div>
  );
}

// ───────────────── Detail pane ─────────────────

function DetailPane({
  notification,
  onClose,
  onMarkRead,
  onMarkUnread,
  onArchiveToggle,
}: {
  notification: Notification;
  onClose: () => void;
  onMarkRead: (id: string) => Promise<void>;
  onMarkUnread: (id: string) => Promise<void>;
  onArchiveToggle: () => void;
}) {
  const ctx = getContext(notification.id);
  const { users: tenantUsers } = useTenantUsers();
  const [noteDraft, setNoteDraft] = useState(ctx.note ?? '');
  const [waitingDraft, setWaitingDraft] = useState(ctx.waitingOn ?? '');
  const [editingWaiting, setEditingWaiting] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);

  const snoozed = isSnoozedNow(ctx);
  const archived = isArchived(notification.id);

  const doSnooze = (hours: number) => {
    const until = new Date(Date.now() + hours * 3600 * 1000);
    snoozeNotification(notification.id, until);
    fireToast(`Snoozed until ${until.toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`);
  };

  const doSnoozeNextMon = () => {
    const d = new Date();
    const day = d.getDay();
    const daysUntilMon = (8 - day) % 7 || 7;
    d.setDate(d.getDate() + daysUntilMon);
    d.setHours(9, 0, 0, 0);
    snoozeNotification(notification.id, d);
    fireToast(`Snoozed until next Monday 09:00`);
  };

  const saveNote = () => {
    setContext(notification.id, { note: noteDraft.trim() || undefined });
    fireToast(noteDraft.trim() ? 'Note saved' : 'Note cleared');
  };

  const saveWaiting = () => {
    setContext(notification.id, { waitingOn: waitingDraft.trim() || undefined });
    fireToast(waitingDraft.trim() ? `Waiting on ${waitingDraft.trim()}` : 'Cleared waiting-on');
    setEditingWaiting(false);
  };

  const doForward = (toUserId: string, toName: string) => {
    setContext(notification.id, { forwardedTo: toUserId });
    void onMarkRead(notification.id);
    fireToast(`Forwarded to ${toName} · removed from your feed`);
    setForwardOpen(false);
    onClose();
  };

  const candidates = tenantUsers.filter((u) => u.role !== 'external' && u.active);

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14, height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn ghost sm notif-detail-close" onClick={onClose} title="Close">← Back</button>
        <span className="chip sm">{MODULE_LABELS[notification.module]}</span>
        <span className={`chip sm ${notification.severity === 'urgent' ? 'warn' : notification.severity === 'warn' ? 'warn' : ''}`}>
          {SEVERITY_EMOJI[notification.severity]} {SEVERITY_LABEL[notification.severity]}
        </span>
        {notification.isMention && <span className="chip sm info">@mention</span>}
        {snoozed && <span className="chip sm">⏱ snoozed</span>}
        {notification.aiPriority !== undefined && notification.aiPriority > 0.7 && (
          <span className="chip sm" title={notification.aiReason}>✨ AI-prioritized</span>
        )}
      </div>

      <div>
        <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 500 }}>{notification.title}</h2>
        <div className="mono" style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          {notification.ts.replace('T', ' ').slice(0, 19)}
        </div>
      </div>

      <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap' }}>
        {notification.body}
      </div>

      {notification.aiReason && (
        <div style={{ padding: 8, borderRadius: 'var(--radius-sm)', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          <strong>AI ranking:</strong> {notification.aiReason}
        </div>
      )}

      {notification.href && (
        <button className="btn primary sm" onClick={() => { if (notification.href) window.location.href = notification.href; }}>
          Open in {MODULE_LABELS[notification.module]} →
        </button>
      )}

      <button
        className="btn ghost sm"
        onClick={onArchiveToggle}
      >
        {archived ? 'Restore to inbox' : 'Archive notification'}
      </button>

      {/* My context section */}
      <div className="notif-context-section">
        <h4>My context</h4>
        <p>Add notes or snooze to teach the AI your priorities. These stay on this device.</p>

        {/* Snooze */}
        <div className="notif-context-row">
          <span className="notif-context-label">Snooze</span>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <button className="btn ghost sm" onClick={() => doSnooze(1)}>1h</button>
            <button className="btn ghost sm" onClick={() => doSnooze(4)}>4h</button>
            <button className="btn ghost sm" onClick={() => doSnooze(24)}>Tomorrow</button>
            <button className="btn ghost sm" onClick={doSnoozeNextMon}>Next Mon</button>
            {snoozed && (
              <button className="btn ghost sm" onClick={() => clearContext(notification.id, ['snoozedUntil'])}>Wake now</button>
            )}
          </div>
        </div>
        {ctx.snoozedUntil && (
          <p style={{ margin: '4px 0 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            {snoozed ? 'Until' : 'Was snoozed until'} {new Date(ctx.snoozedUntil).toLocaleString()}
          </p>
        )}

        {/* Note */}
        <div className="notif-context-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          <span className="notif-context-label">Note</span>
          <textarea
            value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="e.g. I'll handle this Friday after Mathias' site visit"
            rows={2} className="fad-input" style={{ resize: 'vertical', fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            {ctx.note && noteDraft !== ctx.note && (
              <button className="btn ghost sm" onClick={() => setNoteDraft(ctx.note ?? '')}>Reset</button>
            )}
            <button className="btn ghost sm" onClick={saveNote} disabled={noteDraft === (ctx.note ?? '')}>
              Save note
            </button>
          </div>
        </div>

        {/* Waiting on */}
        <div className="notif-context-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          <span className="notif-context-label">Waiting on</span>
          {!editingWaiting && ctx.waitingOn ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="chip sm">⌛ {ctx.waitingOn}</span>
              <button className="btn ghost sm" onClick={() => { setWaitingDraft(ctx.waitingOn ?? ''); setEditingWaiting(true); }}>Edit</button>
              <button className="btn ghost sm" onClick={() => clearContext(notification.id, ['waitingOn'])}>Clear</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="text" value={waitingDraft}
                onChange={(e) => setWaitingDraft(e.target.value)}
                placeholder="Person or system you're waiting on"
                className="fad-input" style={{ flex: 1 }}
              />
              <button className="btn ghost sm" onClick={saveWaiting} disabled={waitingDraft === (ctx.waitingOn ?? '')}>
                Save
              </button>
            </div>
          )}
        </div>

        {/* Forward */}
        <div className="notif-context-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          <span className="notif-context-label">Forward to</span>
          {!forwardOpen ? (
            <div>
              <button className="btn ghost sm" onClick={() => setForwardOpen(true)}>↪ Forward this notification</button>
              <p style={{ margin: '4px 0 0', fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                Removes from your feed · appears in their feed instead.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {candidates.slice(0, 8).map((u) => (
                <button key={u.id} className="btn ghost sm" onClick={() => doForward(u.id, u.name)}>
                  {u.name.split(' ')[0]}
                </button>
              ))}
              <button className="btn ghost sm" onClick={() => setForwardOpen(false)}>Cancel</button>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 'auto', flexWrap: 'wrap' }}>
        <button className="btn ghost sm" onClick={() => { void onMarkUnread(notification.id); }}>Mark unread</button>
      </div>
    </div>
  );
}
