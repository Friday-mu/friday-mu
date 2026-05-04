'use client';

import {
  designClient,
  type ActivityLogEntry,
  type DesignProject,
} from '../../../../_data/design';

interface Props {
  project: DesignProject;
}

export function ActivityTab({ project }: Props) {
  const entries = designClient.activity.listForOwner(project.id);
  if (entries.length === 0) {
    return (
      <div style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>
        Nothing has happened on your project yet. Friday will log every meaningful
        action here once work begins.
      </div>
    );
  }
  // Group by YYYY-MM-DD so the visual scan reads as a daily timeline.
  const groups = groupByDay(entries);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
        A trail of every meaningful action Friday has logged on your project. Most-recent first.
      </div>
      {groups.map((group) => (
        <div key={group.day}>
          <div
            style={{
              fontSize: 11,
              color: 'var(--color-text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: 0.4,
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            {formatDay(group.day)}
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {group.entries.map((e) => (
              <li
                key={e.id}
                data-portal-activity-row={e.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '8px 1fr auto',
                  gap: 10,
                  padding: 10,
                  background: 'var(--color-background-primary)',
                  border: '0.5px solid var(--color-border-tertiary)',
                  borderRadius: 'var(--radius-sm)',
                  alignItems: 'flex-start',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: kindColor(e.kind),
                    marginTop: 4,
                  }}
                  title={e.kind}
                />
                <div style={{ fontSize: 12, lineHeight: 1.5, minWidth: 0 }}>
                  {e.summary}
                </div>
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono-fad)', whiteSpace: 'nowrap' }}>
                  {e.at.slice(11, 16)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

interface DayGroup {
  day: string;
  entries: ActivityLogEntry[];
}

function groupByDay(entries: ActivityLogEntry[]): DayGroup[] {
  const map = new Map<string, ActivityLogEntry[]>();
  for (const e of entries) {
    const day = e.at.slice(0, 10);
    const arr = map.get(day) ?? [];
    arr.push(e);
    map.set(day, arr);
  }
  // Days are inserted in newest-first order (entries already sorted desc),
  // so the Map's iteration order is correct.
  return Array.from(map.entries()).map(([day, group]) => ({ day, entries: group }));
}

function formatDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00.000Z');
  if (Number.isNaN(d.getTime())) return iso;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dStr = d.toISOString().slice(0, 10);
  if (dStr === today.toISOString().slice(0, 10)) return 'Today';
  if (dStr === yesterday.toISOString().slice(0, 10)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function kindColor(kind: ActivityLogEntry['kind']): string {
  switch (kind) {
    case 'approve':           return 'var(--color-text-success)';
    case 'reject':            return 'var(--color-text-warning)';
    case 'send':              return 'var(--color-text-info)';
    case 'receive_payment':   return 'var(--color-text-success)';
    case 'cancel':            return 'var(--color-text-danger)';
    case 'pause':             return 'var(--color-text-warning)';
    case 'resume':            return 'var(--color-text-info)';
    case 'stage_transition':  return 'var(--color-brand-accent)';
    default:                  return 'var(--color-text-tertiary)';
  }
}
