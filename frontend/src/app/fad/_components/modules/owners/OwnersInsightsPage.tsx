'use client';

// Owners · Insights tab — per-module projection of the central
// Analytics engine per scoping pack §4.
// Phase 0 partial: portfolio-driven view of per-property performance
// the operator can scan owner-by-owner. When Cube Core lands, owner-
// weighted attribution via ownership_pct + per-owner churn-risk
// scoring per the doc's Owners panel character.

import { usePortfolio, formatKpiMinor } from '../../../_data/analyticsClient';

export function OwnersInsightsPage() {
  const { portfolio, loading, error, refetch } = usePortfolio(30);

  if (loading && !portfolio) {
    return <div style={{ padding: 16, fontSize: 13, color: 'var(--color-text-tertiary)' }}>Loading insights…</div>;
  }
  if (error || !portfolio) {
    return (
      <div role="alert" style={{ padding: 16, color: 'var(--color-text-warning)', fontSize: 13 }}>
        Failed to load insights: {error || 'unknown error'}
        <button className="btn ghost sm" onClick={refetch} style={{ marginLeft: 8 }}>Retry</button>
      </div>
    );
  }

  const { kpis, currency, top_properties, window: w } = portfolio;
  const navAnalytics = (tab: string) => {
    if (typeof window === 'undefined') return;
    window.location.href = `/fad?m=analytics&t=${encodeURIComponent(tab)}`;
  };

  // Surface the slowest-performing properties (the operator's
  // owner-conversation candidates). Sorted ascending by reservation
  // count — bottom of the list is "needs attention".
  const slowest = [...top_properties].sort((a, b) => a.reservation_count - b.reservation_count).slice(0, 5);

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
      <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 6, background: 'var(--color-background-secondary)', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
        <strong style={{ color: 'var(--color-text-secondary)' }}>Phase 0 partial:</strong>{' '}
        Property-level performance grouped for owner conversations. Owner-weighted attribution + churn-risk scoring land with Cube Core.
      </div>

      <div className="kpi-grid">
        <Kpi label="Revenue · last 30d" value={formatKpiMinor(kpis.revenue_minor, currency)} sub="portfolio total" />
        <Kpi label="Active properties" value={String(kpis.active_properties)} sub="contributing in window" />
        <Kpi label="Paid occupancy" value={`${kpis.occupancy_pct}%`} sub="across portfolio" />
        <Kpi label="ADR" value={formatKpiMinor(kpis.adr_minor, currency)} sub="weighted average" />
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <div className="card-title">Top performers · last {w.days}d</div>
          <div className="card-subtitle">positive talking points for owner statements</div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {top_properties.slice(0, 8).map((p) => (
            <PropRow key={p.code || p.nickname || Math.random()} p={p} currency={currency} />
          ))}
        </div>
      </div>

      {slowest.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header">
            <div className="card-title">Needs attention · last {w.days}d</div>
            <div className="card-subtitle">slowest in window — owner-conversation candidates</div>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {slowest.map((p) => (
              <PropRow key={p.code || p.nickname || Math.random()} p={p} currency={currency} warning />
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 24, padding: '12px 16px', background: 'var(--color-background-secondary)', borderRadius: 6 }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
          Open in Analytics
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(['overview', 'revenue', 'occupancy', 'channels'] as const).map((slug) => (
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

function PropRow({ p, currency, warning }: { p: { code: string | null; nickname?: string | null; title?: string | null; reservation_count: number; occupancy_pct: number; revenue_minor: number }; currency: string; warning?: boolean }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 80px 80px 100px',
        gap: 8,
        padding: '10px 14px',
        borderBottom: '0.5px solid var(--color-border-tertiary)',
        alignItems: 'center',
        fontSize: 13,
        background: warning ? 'rgba(245, 158, 11, 0.04)' : undefined,
      }}
    >
      <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <span className="mono" style={{ fontWeight: 500 }}>{p.code || '—'}</span>
        <span style={{ color: 'var(--color-text-tertiary)', marginLeft: 8 }}>
          {p.title || p.nickname || ''}
        </span>
      </div>
      <span className="mono" style={{ fontSize: 12 }}>{p.reservation_count} bk</span>
      <span className="mono" style={{ fontSize: 12 }}>{p.occupancy_pct}%</span>
      <span className="mono" style={{ fontSize: 12, textAlign: 'right' }}>
        {formatKpiMinor(p.revenue_minor, currency)}
      </span>
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
