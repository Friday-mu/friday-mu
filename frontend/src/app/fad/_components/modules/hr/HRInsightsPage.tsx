'use client';

// HR · Insights tab — per-module projection of the central Analytics
// engine per scoping pack §4.
// Phase 0 partial: derived from live ops tasks + portfolio. When Cube
// Core lands, this becomes a scoped query against the central engine.

import { useMemo } from 'react';
import { useApiTasks } from '../../../_data/useApiTasks';
import { usePortfolio } from '../../../_data/analyticsClient';
import type { Task } from '../../../_data/tasks';

export function HRInsightsPage() {
  const { tasks, loading: tasksLoading } = useApiTasks();
  const { portfolio, loading: portLoading } = usePortfolio(30);

  const last30 = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400000;
    return (tasks || []).filter((t) => {
      const stamp = t.completedAt || t.updatedAt;
      if (!stamp) return false;
      return new Date(stamp).getTime() >= cutoff;
    });
  }, [tasks]);

  const byAssignee = useMemo(() => {
    const map = new Map<string, { name: string; completed: number; minutes: number }>();
    for (const t of last30) {
      if (t.status !== 'completed' && t.status !== 'closed') continue;
      t.assigneeIds.forEach((id, index) => {
        const name = t.assigneeNames?.[index] || id.slice(0, 8);
        const row = map.get(id) || { name, completed: 0, minutes: 0 };
        row.completed += 1;
        row.minutes += t.spentMinutes || t.estimatedMinutes || 0;
        map.set(id, row);
      });
    }
    return [...map.values()].sort((a, b) => b.completed - a.completed).slice(0, 10);
  }, [last30]);

  const totals = useMemo(() => {
    const open = (tasks || []).filter((t: Task) => !['completed', 'closed', 'cancelled'].includes(t.status)).length;
    const completed30 = last30.filter((t) => t.status === 'completed' || t.status === 'closed').length;
    const avgMinutes = byAssignee.length > 0
      ? Math.round(byAssignee.reduce((s, r) => s + (r.completed > 0 ? r.minutes / r.completed : 0), 0) / byAssignee.length)
      : 0;
    return { open, completed30, avgMinutes };
  }, [tasks, last30, byAssignee]);

  if (tasksLoading && portLoading) {
    return <div style={{ padding: 16, fontSize: 13, color: 'var(--color-text-tertiary)' }}>Loading insights…</div>;
  }

  const navAnalytics = (tab: string) => {
    if (typeof window === 'undefined') return;
    window.location.href = `/fad?m=analytics&t=${encodeURIComponent(tab)}`;
  };

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
      <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 6, background: 'var(--color-background-secondary)', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
        <strong style={{ color: 'var(--color-text-secondary)' }}>Phase 0 partial:</strong>{' '}
        Static cards driven by live ops tasks + portfolio. Coverage gap detection + time-off pattern recognition land with Cube Core.
      </div>

      <div className="kpi-grid">
        <Kpi label="Open tasks" value={String(totals.open)} sub="across all staff" />
        <Kpi label="Completed · 30d" value={String(totals.completed30)} sub={`${last30.length} touched`} />
        <Kpi label="Avg time per task" value={totals.avgMinutes > 0 ? `${totals.avgMinutes}m` : '—'} sub="across staffers" />
        <Kpi label="Active staff" value={String(byAssignee.length)} sub="with completions" />
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <div className="card-title">Throughput per staffer · last 30 days</div>
          <div className="card-subtitle">completed tasks + average time</div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {byAssignee.length === 0 && (
            <p style={{ padding: 16, fontSize: 12, color: 'var(--color-text-tertiary)', margin: 0 }}>
              No staff completions in this window.
            </p>
          )}
          {byAssignee.map((row) => {
            const avg = row.completed > 0 ? Math.round(row.minutes / row.completed) : 0;
            const max = Math.max(...byAssignee.map((r) => r.completed));
            const pct = max > 0 ? Math.round((row.completed / max) * 100) : 0;
            return (
              <div
                key={row.name}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 60px 80px',
                  gap: 8,
                  alignItems: 'center',
                  padding: '10px 14px',
                  borderBottom: '0.5px solid var(--color-border-tertiary)',
                  fontSize: 13,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{row.name}</div>
                  <div style={{ height: 4, background: 'var(--color-background-secondary)', borderRadius: 2, marginTop: 4 }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: 'var(--color-brand-accent)', borderRadius: 2 }} />
                  </div>
                </div>
                <span className="mono" style={{ fontSize: 12, fontWeight: 500 }}>{row.completed}</span>
                <span className="mono" style={{ fontSize: 11, textAlign: 'right', color: 'var(--color-text-tertiary)' }}>{avg > 0 ? `${avg}m avg` : '—'}</span>
              </div>
            );
          })}
        </div>
      </div>

      {portfolio && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header">
            <div className="card-title">Portfolio context · last 30d</div>
            <div className="card-subtitle">workload anchor for the operations the team is supporting</div>
          </div>
          <div className="card-body" style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div><div className="kpi-label">Active properties</div><div className="kpi-value">{portfolio.kpis.active_properties}</div></div>
            <div><div className="kpi-label">Bookings</div><div className="kpi-value">{portfolio.kpis.reservation_count}</div></div>
            <div><div className="kpi-label">Booked nights</div><div className="kpi-value">{portfolio.kpis.booked_nights}</div></div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 24, padding: '12px 16px', background: 'var(--color-background-secondary)', borderRadius: 6 }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
          Open in Analytics
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(['overview', 'team', 'occupancy'] as const).map((slug) => (
            <button
              key={slug}
              className="btn ghost sm"
              type="button"
              onClick={() => navAnalytics(slug)}
              style={{ fontSize: 11, padding: '3px 8px', textTransform: 'capitalize' }}
            >
              {slug}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-sub" style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{sub}</div>
    </div>
  );
}
