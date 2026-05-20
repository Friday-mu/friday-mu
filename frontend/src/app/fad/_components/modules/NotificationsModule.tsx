'use client';

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { ModuleHeader } from '../ModuleHeader';
import { useCurrentRole, useCurrentUserId } from '../usePermissions';
import { TASK_USERS } from '../../_data/tasks';
import {
  allNotifications,
  markAllRead,
  markRead,
  markUnread,
  isRead,
  subscribeNotifications,
  getContext,
  setContext,
  clearContext,
  snoozeNotification,
  isSnoozedNow,
  type Notification,
  type Severity,
  type ModuleId,
  type UserContext,
} from '../../_data/notifications';
import { fireToast } from '../Toaster';

type ReadFilter = 'all' | 'unread' | 'read';
type SortMode = 'ai' | 'recent';

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
  const role = useCurrentRole();
  const userId = useCurrentUserId();

  const [, setRev] = useState(0);
  useEffect(() => subscribeNotifications(setRev), []);

  const [readFilter, setReadFilter] = useState<ReadFilter>('all');
  const [moduleFilter, setModuleFilter] = useState<Set<ModuleId>>(new Set());
  const [severityFilter, setSeverityFilter] = useState<Set<Severity>>(new Set());
  const [mentionsOnly, setMentionsOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('ai');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filtersOpenMobile, setFiltersOpenMobile] = useState(false);

  const all = allNotifications(role, userId);

  const filtered = useMemo(() => {
    let out = all.slice();
    if (readFilter === 'unread') out = out.filter((n) => !isRead(n.id));
    else if (readFilter === 'read') out = out.filter((n) => isRead(n.id));
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
  }, [all, readFilter, moduleFilter, severityFilter, mentionsOnly, search, sortMode]);

  const selected = selectedId ? all.find((n) => n.id === selectedId) ?? null : null;

  // Auto-mark-read when a notification is selected
  useEffect(() => {
    if (selected && !isRead(selected.id)) markRead(selected.id);
  }, [selected?.id]);

  const counts = {
    all: all.length,
    unread: all.filter((n) => !isRead(n.id) && !isSnoozedNow(getContext(n.id))).length,
    mentions: all.filter((n) => n.isMention).length,
    urgent: all.filter((n) => n.severity === 'urgent' && !isRead(n.id) && !isSnoozedNow(getContext(n.id))).length,
    snoozed: all.filter((n) => isSnoozedNow(getContext(n.id))).length,
  };

  const moduleCounts = useMemo(() => {
    const m: Partial<Record<ModuleId, number>> = {};
    all.forEach((n) => { m[n.module] = (m[n.module] ?? 0) + 1; });
    return m;
  }, [all]);

  const toggleModule = (mod: ModuleId) => setModuleFilter((p) => { const n = new Set(p); n.has(mod) ? n.delete(mod) : n.add(mod); return n; });
  const toggleSeverity = (sev: Severity) => setSeverityFilter((p) => { const n = new Set(p); n.has(sev) ? n.delete(sev) : n.add(sev); return n; });
  const handleMarkAllRead = () => markAllRead(filtered);
  const clearFilters = () => {
    setModuleFilter(new Set());
    setSeverityFilter(new Set());
    setMentionsOnly(false);
    setReadFilter('all');
    setSearch('');
  };
  const filtersActive = moduleFilter.size > 0 || severityFilter.size > 0 || mentionsOnly || readFilter !== 'all' || search.trim().length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <ModuleHeader
        title="Notifications"
        subtitle={`${counts.unread} unread${counts.urgent > 0 ? ` · ${counts.urgent} urgent` : ''}${counts.snoozed > 0 ? ` · ${counts.snoozed} snoozed` : ''} · ${counts.all} total`}
        actions={
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn ghost sm notif-mobile-filter-btn" onClick={() => setFiltersOpenMobile(true)}>
              ☰ Filters
            </button>
            <button className="btn ghost sm" onClick={() => setSortMode(sortMode === 'ai' ? 'recent' : 'ai')} title="Toggle ranking">
              {sortMode === 'ai' ? '✨ AI priority' : 'Chronological'}
            </button>
            <button className="btn ghost sm" onClick={handleMarkAllRead}>Mark all read</button>
          </div>
        }
      />

      <div className="notif-page" style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Filter sidebar */}
        <aside className={'notif-filters' + (filtersOpenMobile ? ' mobile-open' : '')}>
          <div className="notif-filters-mobile-header">
            <span style={{ fontWeight: 500 }}>Filters</span>
            <button className="btn ghost sm" onClick={() => setFiltersOpenMobile(false)}>Close</button>
          </div>
          <div className="notif-filter-section">
            <h4>Read state</h4>
            <FilterRow label="All" count={counts.all} active={readFilter === 'all'} onClick={() => setReadFilter('all')} />
            <FilterRow label="Unread" count={counts.unread} active={readFilter === 'unread'} onClick={() => setReadFilter('unread')} />
            <FilterRow label="Read" count={counts.all - counts.unread - counts.snoozed} active={readFilter === 'read'} onClick={() => setReadFilter('read')} />
          </div>

          <div className="notif-filter-section">
            <h4>Mentions</h4>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={mentionsOnly} onChange={() => setMentionsOnly(!mentionsOnly)} />
              <span>Only @mentions ({counts.mentions})</span>
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
                No notifications match the current filters.
              </div>
            ) : (
              filtered.map((n) => (
                <ListRow key={n.id} notif={n} selected={selectedId === n.id} showAi={sortMode === 'ai'}
                  onSelect={() => setSelectedId(n.id)}
                  onToggleRead={() => { if (isRead(n.id)) markUnread(n.id); else markRead(n.id); }} />
              ))
            )}
          </div>
        </div>

        {/* Detail — right panel only renders when something is selected */}
        {selected && (
          <aside className={'notif-detail' + (selected ? ' mobile-open' : '')}>
            <DetailPane notification={selected} onClose={() => setSelectedId(null)} />
          </aside>
        )}

        {/* Right-panel default (desktop only, when nothing selected) */}
        {!selected && (
          <aside className="notif-detail notif-detail-empty">
            <DefaultPane all={all} onSelect={(id) => setSelectedId(id)} />
          </aside>
        )}
      </div>
    </div>
  );
}

// ───────────────── Default pane (no selection) ─────────────────

function DefaultPane({ all, onSelect }: { all: Notification[]; onSelect: (id: string) => void }) {
  const top3 = useMemo(() => {
    return [...all]
      .filter((n) => !isRead(n.id) && !isSnoozedNow(getContext(n.id)))
      .sort((a, b) => (b.aiPriority ?? 0) - (a.aiPriority ?? 0))
      .slice(0, 3);
  }, [all]);

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

function ListRow({ notif, selected, showAi, onSelect, onToggleRead }: {
  notif: Notification; selected: boolean; showAi: boolean; onSelect: () => void; onToggleRead: () => void;
}) {
  const read = isRead(notif.id);
  const ctx = getContext(notif.id);
  const snoozed = isSnoozedNow(ctx);
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
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
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {notif.body}
        </div>
        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {MODULE_LABELS[notif.module]} · {notif.ts.slice(5, 16).replace('T', ' ')}
        </div>
      </div>
      <button onClick={(e) => { e.stopPropagation(); onToggleRead(); }} className="fad-notif-toggle" title={read ? 'Mark unread' : 'Mark read'}>
        {read ? '○' : '●'}
      </button>
    </div>
  );
}

// ───────────────── Detail pane ─────────────────

function DetailPane({ notification, onClose }: { notification: Notification; onClose: () => void }) {
  const ctx = getContext(notification.id);
  const [noteDraft, setNoteDraft] = useState(ctx.note ?? '');
  const [waitingDraft, setWaitingDraft] = useState(ctx.waitingOn ?? '');
  const [editingWaiting, setEditingWaiting] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);

  const snoozed = isSnoozedNow(ctx);

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
    markRead(notification.id);
    fireToast(`Forwarded to ${toName} · removed from your feed`);
    setForwardOpen(false);
    onClose();
  };

  const candidates = TASK_USERS.filter((u) => u.role !== 'external' && u.active);

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
        <button className="btn ghost sm" onClick={() => markUnread(notification.id)}>Mark unread</button>
      </div>
    </div>
  );
}
