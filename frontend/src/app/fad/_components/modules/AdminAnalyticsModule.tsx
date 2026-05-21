'use client';

// AdminAnalyticsModule — FR-admin-only platform overview.
//
// Single GET /api/tenants/admin/dashboard request feeds the whole
// surface: KPI cards, tenant status breakdown, top-10 AI spenders,
// recent signups, outstanding invoices. No charting library — plain
// HTML/SVG. Sidebar already hides the module for non-FR tenants; this
// component also returns a "not authorised" block if it's hit via a
// direct ?m=admin-analytics URL from a non-FR tenant.

import { useEffect, useState } from 'react';
import { ModuleHeader } from '../ModuleHeader';
import { apiFetch } from '../../../../components/types';
import { useIsFrAdmin } from '../../_data/useTenantIdentity';

interface DashboardResponse {
  tenants_total: number;
  tenants_active: number;
  tenants_trial: number;
  tenants_past_due: number;
  tenants_cancelled: number;
  mrr_usd_minor: number;
  new_signups_30d: number;
  trial_conversions_30d: number;
  churn_30d: number;
  ai_cost_30d_usd_minor: number;
  ai_cost_by_tenant_top10: Array<{
    tenant_id: string;
    tenant_name: string;
    cost_minor_usd: number;
  }>;
  invoices_outstanding_count: number;
  invoices_outstanding_amount_minor: number;
  recent_signups: Array<{
    tenant_id: string;
    name: string;
    created_at: string;
    subscription_status: string;
  }>;
}

export function AdminAnalyticsModule() {
  const isFrAdmin = useIsFrAdmin();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFrAdmin) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = (await apiFetch('/api/tenants/admin/dashboard')) as DashboardResponse;
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isFrAdmin]);

  if (!isFrAdmin) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <ModuleHeader title="Admin Analytics" subtitle="Platform overview." />
        <div className="fad-module-body">
          <div className="card" style={{ padding: 24, maxWidth: 560, margin: '40px auto', textAlign: 'center' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 500 }}>Not available</h3>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-tertiary)' }}>
              This view is restricted to Friday Retreats platform admins.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <ModuleHeader title="Admin Analytics" subtitle="Platform-wide tenant + revenue overview." />
      <div className="fad-module-body">
        {loading && <Loading />}
        {error && <ErrorMsg message={error} />}
        {data && <Dashboard data={data} />}
      </div>
    </div>
  );
}

function Dashboard({ data }: { data: DashboardResponse }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Row 1 — KPI cards */}
      <div style={kpiGrid}>
        <KpiCard
          label="Total tenants"
          value={String(data.tenants_total)}
          sub={`${data.tenants_active} active · ${data.tenants_trial} trial`}
        />
        <KpiCard
          label="MRR (USD)"
          value={formatUsd(data.mrr_usd_minor)}
          sub={`Across ${data.tenants_active + data.tenants_past_due} paying tenants`}
        />
        <KpiCard
          label="Trial conversions · 30d"
          value={String(data.trial_conversions_30d)}
          sub={`${data.new_signups_30d} new signups · ${data.churn_30d} churned`}
        />
        <KpiCard
          label="AI cost · 30d"
          value={formatUsd(data.ai_cost_30d_usd_minor)}
          sub="All providers, all tenants"
        />
      </div>

      {/* Row 2 — status breakdown + top AI spenders */}
      <div style={twoCol}>
        <div className="card" style={cardPad}>
          <h3 style={sectionH}>Tenant status</h3>
          <StatusBar
            active={data.tenants_active}
            trial={data.tenants_trial}
            pastDue={data.tenants_past_due}
            cancelled={data.tenants_cancelled}
          />
        </div>

        <div className="card" style={cardPad}>
          <h3 style={sectionH}>Top 10 AI spenders · 30d</h3>
          {data.ai_cost_by_tenant_top10.length === 0 ? (
            <Empty>No AI usage recorded in the last 30 days.</Empty>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr style={theadRow}>
                  <th style={thLeft}>Tenant</th>
                  <th style={thRight}>Cost (USD)</th>
                </tr>
              </thead>
              <tbody>
                {data.ai_cost_by_tenant_top10.map((t) => (
                  <tr key={t.tenant_id} style={tbodyRow}>
                    <td style={tdLeft}>{t.tenant_name}</td>
                    <td style={tdRight}>{formatUsd(t.cost_minor_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Row 3 — recent signups + outstanding invoices */}
      <div style={twoCol}>
        <div className="card" style={cardPad}>
          <h3 style={sectionH}>Recent signups</h3>
          {data.recent_signups.length === 0 ? (
            <Empty>No signups yet.</Empty>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr style={theadRow}>
                  <th style={thLeft}>Tenant</th>
                  <th style={thLeft}>Status</th>
                  <th style={thRight}>Created</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_signups.map((s) => (
                  <tr key={s.tenant_id} style={tbodyRow}>
                    <td style={tdLeft}>{s.name}</td>
                    <td style={tdLeft}><StatusChip status={s.subscription_status} /></td>
                    <td style={tdRight}>{formatDate(s.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card" style={cardPad}>
          <h3 style={sectionH}>Outstanding invoices</h3>
          <div style={{ display: 'flex', gap: 24, marginTop: 8 }}>
            <div>
              <div style={statValue}>{data.invoices_outstanding_count}</div>
              <div style={statLabel}>Invoices</div>
            </div>
            <div>
              <div style={statValue}>{formatUsd(data.invoices_outstanding_amount_minor)}</div>
              <div style={statLabel}>Total owed</div>
            </div>
          </div>
          <p style={{ marginTop: 16, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            Includes pending, payment-submitted, and overdue invoices across all tenants.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// KPI card
// ─────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 600, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 6 }}>{sub}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Status bar (stacked horizontal SVG)
// ─────────────────────────────────────────────────────────────

function StatusBar({
  active,
  trial,
  pastDue,
  cancelled,
}: {
  active: number;
  trial: number;
  pastDue: number;
  cancelled: number;
}) {
  const total = active + trial + pastDue + cancelled;
  if (total === 0) return <Empty>No tenants.</Empty>;

  // Colour palette — matches the StatusChip tones below.
  const segments = [
    { key: 'active', label: 'Active', count: active, color: '#16a34a' },
    { key: 'trial', label: 'Trial', count: trial, color: '#2563eb' },
    { key: 'past_due', label: 'Past due', count: pastDue, color: '#f59e0b' },
    { key: 'cancelled', label: 'Cancelled', count: cancelled, color: '#94a3b8' },
  ];

  const width = 100; // viewBox %
  const height = 24;
  let x = 0;
  return (
    <div style={{ marginTop: 8 }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: 24, borderRadius: 6, overflow: 'hidden', display: 'block' }}
        role="img"
        aria-label="Tenant subscription status breakdown"
      >
        {segments.map((seg) => {
          const w = (seg.count / total) * width;
          const rect = (
            <rect
              key={seg.key}
              x={x}
              y={0}
              width={w}
              height={height}
              fill={seg.color}
            />
          );
          x += w;
          return rect;
        })}
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 12 }}>
        {segments.map((seg) => (
          <div key={seg.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: seg.color }} />
            <span style={{ color: 'var(--color-text-secondary)' }}>{seg.label}</span>
            <span style={{ fontWeight: 600 }}>{seg.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: string }> = {
    active: { label: 'Active', tone: 'info' },
    trial: { label: 'Trial', tone: 'info' },
    past_due: { label: 'Past due', tone: 'warn' },
    cancelled: { label: 'Cancelled', tone: '' },
    suspended: { label: 'Suspended', tone: '' },
  };
  const entry = map[status] || { label: status, tone: '' };
  return <span className={'chip ' + entry.tone}>{entry.label}</span>;
}

function Loading() {
  return <div style={{ padding: 24, fontSize: 13, color: 'var(--color-text-tertiary)' }}>Loading…</div>;
}

function ErrorMsg({ message }: { message: string }) {
  return (
    <div
      role="alert"
      style={{
        padding: '8px 10px',
        borderRadius: 6,
        background: 'var(--color-bg-danger, #fef2f2)',
        color: 'var(--color-text-danger, #991b1b)',
        fontSize: 12,
      }}
    >
      {message}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 16, fontSize: 12, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
      {children}
    </div>
  );
}

function formatUsd(minorUsd: number): string {
  const dollars = (minorUsd || 0) / 100;
  return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}

// ─── styles ───

const kpiGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 12,
};

const twoCol: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 12,
};

const cardPad: React.CSSProperties = { padding: 16 };

const sectionH: React.CSSProperties = {
  margin: '0 0 12px',
  fontSize: 14,
  fontWeight: 500,
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  fontSize: 12,
  borderCollapse: 'collapse',
};

const theadRow: React.CSSProperties = {
  textAlign: 'left',
  color: 'var(--color-text-tertiary)',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

const thLeft: React.CSSProperties = { padding: '6px 8px', textAlign: 'left' };
const thRight: React.CSSProperties = { padding: '6px 8px', textAlign: 'right' };

const tbodyRow: React.CSSProperties = { borderTop: '0.5px solid var(--color-border-tertiary)' };

const tdLeft: React.CSSProperties = { padding: '8px' };
const tdRight: React.CSSProperties = { padding: '8px', textAlign: 'right', fontWeight: 500 };

const statValue: React.CSSProperties = { fontSize: 24, fontWeight: 600, lineHeight: 1.1 };
const statLabel: React.CSSProperties = { fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 };
