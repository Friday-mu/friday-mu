'use client';

// Analytics module — Phase 0 (deterministic tier-1 metrics from
// /api/analytics/portfolio). Per scoping pack
// 36a43ca884928165b886fc3043e399a0 the Overview + Occupancy tabs are
// the first to wire live; other tabs (Revenue / Channels / Reviews /
// Team / Margin) remain fixture-driven until Phase 2 (Cube Core +
// per-module Insights panels).

import { useMemo, useState } from 'react';
import {
  ANALYTICS_OVERVIEW_KPI,
  CHANNEL_COSTS,
  CHANNEL_REVENUE,
  MARGIN_BREAKDOWN,
  OCC_HEATMAP_MONTHS,
  OCC_HEATMAP_PROPS,
  REVENUE_BY_PROPERTY,
  REVENUE_TREND,
  REVIEW_BY_REGION,
  REVIEW_TREND,
  TEAM_LOAD,
} from '../../_data/analytics';
import {
  usePortfolio,
  useOccupancyHeatmap,
  formatKpiMinor,
  deltaPct,
  type PortfolioResponse,
} from '../../_data/analyticsClient';
import { useLiveReviews } from '../../_data/reviewsClient';
import { useApiTasks } from '../../_data/useApiTasks';
import { IconDownload, IconSparkle } from '../icons';
import { ModuleHeader } from '../ModuleHeader';
import { useT } from '../../_i18n/useT';

export function AnalyticsModule() {
  const { t } = useT();
  const [tab, setTab] = useState('overview');
  const tabs = [
    { id: 'overview', label: t('analytics.tabs.overview', 'Overview') },
    { id: 'revenue', label: t('analytics.tabs.revenue', 'Revenue') },
    { id: 'occupancy', label: t('analytics.tabs.occupancy', 'Occupancy') },
    { id: 'channels', label: t('analytics.tabs.channels', 'Channels') },
    { id: 'reviews', label: t('analytics.tabs.reviews', 'Reviews') },
    { id: 'team', label: t('analytics.tabs.team', 'Team') },
    { id: 'margin', label: t('analytics.tabs.margin', 'Margin') },
  ];
  return (
    <>
      <ModuleHeader
        title={t('module.analytics', 'Analytics')}
        subtitle={t('analytics.subtitle', 'Portfolio dashboards · scan-first · data across every module')}
        tabs={tabs}
        activeTab={tab}
        onTabChange={setTab}
        actions={
          <>
            <button className="btn ghost sm">
              <IconSparkle size={12} /> {t('analytics.askFriday', 'Ask Friday')}
            </button>
            <button className="btn sm">
              <IconDownload size={12} /> {t('analytics.exportPdf', 'Export PDF')}
            </button>
          </>
        }
      />
      
      <div className="fad-module-body">
        {tab === 'overview' && <OverviewTab />}
        {tab === 'revenue' && <RevenueTab />}
        {tab === 'occupancy' && <OccupancyTab />}
        {tab === 'channels' && <ChannelsTab />}
        {tab === 'reviews' && <ReviewsTabLive />}
        {tab === 'team' && <TeamTab />}
        {tab === 'margin' && <MarginTab />}
      </div>
    </>
  );
}

function AnalyticsCardHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="card-header">
      <div className="card-title">{title}</div>
      {subtitle && <div className="card-subtitle">{subtitle}</div>}
    </div>
  );
}

function AskAnalyticsCTA({ question }: { question: string }) {
  return (
    <button
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        fontSize: 11,
        background: 'var(--color-brand-accent-soft)',
        color: 'var(--color-brand-accent)',
        border: 0,
        borderRadius: 'var(--radius-full)',
        cursor: 'pointer',
        marginLeft: 'auto',
      }}
      title={question}
    >
      <IconSparkle size={10} /> Ask Friday
    </button>
  );
}

/* ───────────── Overview ─────────────
 * Phase 0 live: KPIs, revenue trend, top properties, channel mix all
 * drive from /api/analytics/portfolio over a rolling-30 window. The
 * insight bullets remain "Phase 2 pending" placeholder per scoping. */
function OverviewTab() {
  const { portfolio, loading, error, refetch } = usePortfolio(30);

  if (loading && !portfolio) {
    return (
      <div className="kpi-grid">
        {[1, 2, 3, 4].map((i) => (
          <div className="kpi" key={i}>
            <div className="kpi-label">Loading…</div>
            <div className="kpi-value" style={{ opacity: 0.4 }}>—</div>
          </div>
        ))}
      </div>
    );
  }
  if (error || !portfolio) {
    return (
      <div role="alert" style={{ padding: '12px 16px', color: 'var(--color-text-warning)', fontSize: 13 }}>
        Failed to load portfolio analytics: {error || 'unknown error'}.
        <button className="btn ghost sm" onClick={refetch} style={{ marginLeft: 8 }}>Retry</button>
      </div>
    );
  }

  // Rename `window` from the payload to avoid masking the global Window
  // object inside child handlers (button onClick uses `window.location`).
  const { kpis, currency, channel_mix, top_properties, revenue_trend, ops, window: windowInfo } = portfolio;
  const revDelta = deltaPct(kpis.revenue_minor, kpis.revenue_minor_prev);
  const occDelta = deltaPct(kpis.occupancy_pct, kpis.occupancy_pct_prev);
  const adrDelta = deltaPct(kpis.adr_minor, kpis.adr_minor_prev);

  return (
    <>
      <div className="kpi-grid">
        <KpiCard
          label={`Revenue · last ${windowInfo.days}d`}
          value={formatKpiMinor(kpis.revenue_minor, currency)}
          sub={`${revDelta.dir === 'flat' ? '—' : (revDelta.pct > 0 ? '+' : '') + revDelta.pct + '%'} vs prior ${windowInfo.days}d`}
          dir={revDelta.dir}
        />
        <KpiCard
          label="Bookings"
          value={String(kpis.reservation_count)}
          sub={`${kpis.booked_nights} booked nights`}
          dir="flat"
        />
        <KpiCard
          label="Paid occupancy"
          value={`${kpis.occupancy_pct}%`}
          sub={kpis.total_occupancy_pct != null && kpis.total_occupancy_pct !== kpis.occupancy_pct
            ? `${kpis.total_occupancy_pct}% with owner stays · ${kpis.active_properties} live props`
            : `${occDelta.dir === 'flat' ? '—' : (occDelta.pct > 0 ? '+' : '') + occDelta.pct + 'pp'} vs prior · ${kpis.active_properties} live props`}
          dir={occDelta.dir}
        />
        <KpiCard
          label="ADR"
          value={formatKpiMinor(kpis.adr_minor, currency)}
          sub={`RevPAR ${formatKpiMinor(kpis.revpar_minor, currency)} · ADR ${adrDelta.dir === 'flat' ? '—' : (adrDelta.pct > 0 ? '+' : '') + adrDelta.pct + '%'} vs prior`}
          dir={adrDelta.dir}
        />
      </div>

      <div className="two-col">
        <div className="card">
          <AnalyticsCardHeader
            title={`Revenue trend · last ${windowInfo.days}d`}
            subtitle={`live · ${currency} · ${kpis.reservation_count} bookings · ${windowInfo.from} → ${windowInfo.to}`}
          />
          <div className="card-body">
            <LiveRevenueTrendChart trend={revenue_trend} currency={currency} />
          </div>
        </div>
        <div className="card">
          <AnalyticsCardHeader
            title="Channel mix"
            subtitle={`reservation share · last ${windowInfo.days}d`}
          />
          <div className="card-body">
            {channel_mix.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: 0 }}>
                No bookings in this window.
              </p>
            )}
            {channel_mix.map((c) => (
              <div
                key={c.channel}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 50px 80px',
                  gap: 8,
                  alignItems: 'center',
                  padding: '8px 0',
                  fontSize: 13,
                  borderBottom: '0.5px solid var(--color-border-tertiary)',
                }}
              >
                <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>
                  {c.channel || 'unknown'}
                </span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                  {c.reservation_count}
                </span>
                <span className="mono" style={{ fontSize: 12 }}>
                  {c.share_pct}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <AnalyticsCardHeader
          title="Top properties by bookings"
          subtitle={`last ${windowInfo.days}d · click to drill into property detail`}
        />
        <div className="card-body" style={{ padding: 0 }}>
          {top_properties.slice(0, 10).map((p) => (
            <button
              key={p.code || p.nickname || Math.random()}
              type="button"
              onClick={() => {
                if (p.code) {
                  window.history.pushState({}, '', `/fad?m=properties&sub=overview&p=${encodeURIComponent(p.code)}`);
                  window.location.href = `/fad?m=properties&sub=overview&p=${encodeURIComponent(p.code)}`;
                }
              }}
              style={{
                display: 'grid',
                gridTemplateColumns: '48px 1.6fr 1fr 1fr 1fr 0.8fr',
                gap: 12,
                padding: '10px 16px',
                borderBottom: '0.5px solid var(--color-border-tertiary)',
                alignItems: 'center',
                fontSize: 13,
                background: 'transparent',
                border: 0,
                borderBottomColor: 'var(--color-border-tertiary)',
                borderBottomStyle: 'solid',
                borderBottomWidth: '0.5px',
                width: '100%',
                textAlign: 'left',
                cursor: p.code ? 'pointer' : 'default',
                color: 'inherit',
                fontFamily: 'inherit',
              }}
            >
              {p.picture_url ? (
                <div style={{ width: 40, height: 30, borderRadius: 3, backgroundImage: `url(${p.picture_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
              ) : (
                <div style={{ width: 40, height: 30, borderRadius: 3, background: 'var(--color-background-secondary)' }} />
              )}
              <div style={{ minWidth: 0 }}>
                <div className="mono" style={{ fontWeight: 500 }}>{p.code || '—'}</div>
                <div className="row-meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.title || p.nickname || '—'}
                </div>
              </div>
              <span className="mono">{p.reservation_count} bookings</span>
              <span className="mono">{p.booked_nights} nights</span>
              <span className="mono">{p.occupancy_pct}% occ</span>
              <span className="mono" style={{ textAlign: 'right' }}>
                {formatKpiMinor(p.revenue_minor, currency)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {(ops.open_tasks != null || ops.overdue_tasks != null) && (
        <div className="card" style={{ marginTop: 20 }}>
          <AnalyticsCardHeader title="Operations health" subtitle="open + overdue tasks across the portfolio" />
          <div className="card-body" style={{ display: 'flex', gap: 32 }}>
            <div>
              <div className="kpi-label">Open tasks</div>
              <div className="kpi-value">{ops.open_tasks ?? '—'}</div>
            </div>
            <div>
              <div className="kpi-label">Overdue</div>
              <div className="kpi-value" style={{ color: (ops.overdue_tasks || 0) > 0 ? 'var(--color-text-danger)' : undefined }}>
                {ops.overdue_tasks ?? '—'}
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 16, padding: '8px 12px', fontSize: 11, color: 'var(--color-text-tertiary)', background: 'var(--color-background-secondary)', borderRadius: 4 }}>
        <div style={{ marginBottom: 4 }}>
          Phase 0 live · industry-standard hospitality math (VRMA + STR).
          Revenue = room revenue (rent only, excl. cleaning + taxes when Guesty breakdown is available).
          Occupancy = paid stays ÷ available room-nights (industry standard for revenue management).
        </div>
        {portfolio.data_quality?.breakdown_coverage && (
          <div style={{ marginTop: 4, color: 'var(--color-text-secondary)' }}>
            <strong style={{ fontWeight: 500 }}>Precision:</strong> {portfolio.data_quality.breakdown_coverage}
          </div>
        )}
        {portfolio.data_quality?.unpriced_note && (
          <div style={{ marginTop: 4, color: 'var(--color-text-secondary)' }}>
            <strong style={{ fontWeight: 500 }}>Unpriced rows:</strong> {portfolio.data_quality.unpriced_note}
          </div>
        )}
        {portfolio.data_quality?.owner_block_note && (
          <div style={{ marginTop: 4, color: 'var(--color-text-secondary)' }}>
            <strong style={{ fontWeight: 500 }}>Owner stays:</strong> {portfolio.data_quality.owner_block_note}
          </div>
        )}
        {portfolio.data_quality?.gap_note && (
          <div style={{ marginTop: 4, color: 'var(--color-text-secondary)' }}>
            <strong style={{ fontWeight: 500 }}>Data quality:</strong> {portfolio.data_quality.gap_note}
          </div>
        )}
      </div>
    </>
  );
}

function KpiCard({ label, value, sub, dir }: { label: string; value: string; sub: string; dir: 'up' | 'down' | 'flat' }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className={'kpi-sub ' + dir}>{sub}</div>
    </div>
  );
}

function LiveRevenueTrendChart({ trend, currency }: { trend: PortfolioResponse['revenue_trend']; currency: string }) {
  if (!trend.length) {
    return <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: 0 }}>No data in window.</p>;
  }
  const max = Math.max(1, ...trend.map((p) => p.revenue_minor));
  // Sample down to ~30 columns max for visual clarity on long windows.
  const sample = trend.length > 30
    ? trend.filter((_, i) => i % Math.ceil(trend.length / 30) === 0)
    : trend;
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 140 }}>
        {sample.map((p) => (
          <div
            key={p.day}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, height: '100%' }}
            title={`${String(p.day).slice(0, 10)} · ${formatKpiMinor(p.revenue_minor, currency)} · ${p.occupied_count} listings occupied`}
          >
            <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              <div
                style={{
                  background: p.revenue_minor > 0 ? 'var(--color-brand-accent)' : 'var(--color-background-secondary)',
                  height: `${Math.max(2, (p.revenue_minor / max) * 100)}%`,
                  minHeight: 2,
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 6 }}>
        <span className="mono">{String(sample[0]?.day).slice(0, 10)}</span>
        <span className="mono">{String(sample[sample.length - 1]?.day).slice(0, 10)}</span>
      </div>
    </>
  );
}

/* Banner shown above fixture-driven tabs until Phase 2 (Cube Core +
 * per-module Insights panels) wires them live. Anti-fake-numbers
 * disclosure per scoping pack §5 governance. */
function PendingDataBanner({ note }: { note?: string }) {
  return (
    <div style={{
      padding: '10px 14px',
      marginBottom: 16,
      background: 'rgba(220, 160, 60, 0.08)',
      borderLeft: '2px solid rgb(220, 160, 60)',
      borderRadius: 4,
      fontSize: 12,
      color: 'var(--color-text-secondary)',
    }}>
      <strong style={{ fontWeight: 500 }}>Data wiring · Phase 2 pending.</strong>{' '}
      Numbers below are illustrative fixtures until the central metric layer (Cube Core) lands per the Analytics scoping pack.
      {note && <span> · {note}</span>}
    </div>
  );
}

/* ───────────── Revenue (live, T1.14) ─────────────
 * Reads usePortfolio(30) — same SQL aggregate the Overview already
 * surfaces, just re-shaped per-property and per-month. The fixture
 * version is preserved further down as RevenueTabFixture for reference. */
function RevenueTab() {
  const { portfolio, loading, error } = usePortfolio(30);
  const { portfolio: portfolio90 } = usePortfolio(90);

  if (loading && !portfolio) {
    return (
      <div className="kpi-grid kpi-grid-3">
        {[1, 2, 3].map((i) => (
          <div className="kpi" key={i}>
            <div className="kpi-label">Loading…</div>
            <div className="kpi-value" style={{ opacity: 0.4 }}>—</div>
          </div>
        ))}
      </div>
    );
  }
  if (error || !portfolio) {
    return (
      <div role="alert" style={{ padding: '12px 16px', color: 'var(--color-text-warning)', fontSize: 13 }}>
        Failed to load revenue data: {error || 'unknown error'}.
      </div>
    );
  }

  const { currency, top_properties, window: windowInfo, revenue_trend } = portfolio;
  const fmt = (minor: number) => {
    const major = Math.round(minor / 100);
    const sym = currency === 'EUR' ? '€' : currency === 'MUR' ? 'Rs' : currency === 'USD' ? '$' : '';
    return `${sym} ${major.toLocaleString()}`;
  };
  const fmtCompact = (minor: number) => {
    const major = minor / 100;
    if (major >= 1000) return `${(major / 1000).toFixed(major >= 10000 ? 0 : 1)}k`;
    return Math.round(major).toString();
  };

  // Build monthly buckets from revenue_trend (daily).
  const monthly = (() => {
    const buckets = new Map<string, number>();
    for (const day of revenue_trend) {
      const ym = day.day.slice(0, 7); // YYYY-MM
      buckets.set(ym, (buckets.get(ym) || 0) + day.revenue_minor);
    }
    return Array.from(buckets.entries()).map(([ym, revenue]) => ({ ym, revenue }));
  })();
  const monthlyMax = Math.max(1, ...monthly.map((m) => m.revenue));

  // Top-property sorted by revenue (already sorted by portfolio backend,
  // but defensive re-sort in case the wrapper changes).
  const top = [...top_properties].sort((a, b) => b.revenue_minor - a.revenue_minor);
  const totalTop = top.reduce((a, p) => a + p.revenue_minor, 0);
  const total90 = portfolio90?.kpis.revenue_minor ?? 0;

  return (
    <>
      <div style={{
        padding: '8px 14px',
        marginBottom: 16,
        background: 'rgba(72, 173, 122, 0.08)',
        borderLeft: '2px solid rgb(72, 173, 122)',
        borderRadius: 4,
        fontSize: 12,
        color: 'var(--color-text-secondary)',
      }}>
        <strong style={{ fontWeight: 500 }}>Live data.</strong>{' '}
        Daily revenue trend + per-property breakdown computed from
        guesty_reservations over the last {windowInfo.days} days. Net-to-owner
        + channel fees split lands when Finance Phase 3 ships (per
        Analytics scoping §7).
      </div>
      <div className="kpi-grid kpi-grid-3">
        <div className="kpi">
          <div className="kpi-label">Revenue · last {windowInfo.days}d</div>
          <div className="kpi-value">€ {fmtCompact(portfolio.kpis.revenue_minor)}</div>
          <div className="kpi-sub">{portfolio.kpis.reservation_count} bookings</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Revenue · last 90d</div>
          <div className="kpi-value">€ {fmtCompact(total90)}</div>
          <div className="kpi-sub">{portfolio90?.kpis.reservation_count ?? '—'} bookings</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Top property contribution</div>
          <div className="kpi-value">
            {top[0]?.code || '—'}
          </div>
          <div className="kpi-sub">
            {top[0] ? fmt(top[0].revenue_minor) + ' · ' + Math.round((top[0].revenue_minor / Math.max(1, portfolio.kpis.revenue_minor)) * 100) + '%' : '—'}
          </div>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div className="card-title">Revenue by month · last {windowInfo.days}d</div>
          <div className="card-subtitle">aggregated from daily pro-rated nights</div>
          <AskAnalyticsCTA question="Why is this month pacing different from prior?" />
        </div>
        <div className="card-body">
          {monthly.length === 0 ? (
            <div style={{ padding: 12, fontSize: 12, color: 'var(--color-text-tertiary)' }}>No revenue in window.</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 160 }}>
              {monthly.map((m) => (
                <div key={m.ym} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%' }}>
                  <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                    <div style={{ background: 'var(--color-brand-accent)', height: `${(m.revenue / monthlyMax) * 100}%` }} />
                  </div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{m.ym}</div>
                  <div className="mono" style={{ fontSize: 11 }}>€ {fmtCompact(m.revenue)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="card">
        <div className="card-header">
          <div className="card-title">Revenue by property · last {windowInfo.days}d</div>
          <div className="card-subtitle">{fmt(totalTop)} across top {top.length} properties</div>
          <AskAnalyticsCTA question="Which property drove the biggest revenue change?" />
        </div>
        {top.length === 0 ? (
          <div style={{ padding: 14, fontSize: 12, color: 'var(--color-text-tertiary)' }}>No properties with revenue in window.</div>
        ) : (
          top.map((p) => {
            const pct = (p.revenue_minor / Math.max(1, totalTop)) * 100;
            return (
              <div
                key={p.code || p.title}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '120px 1fr 110px',
                  gap: 12,
                  padding: '12px 16px',
                  borderBottom: '0.5px solid var(--color-border-tertiary)',
                  fontSize: 13,
                  alignItems: 'center',
                }}
              >
                <span style={{ fontWeight: 500 }}>{p.code || p.nickname || '—'}</span>
                <div style={{ position: 'relative', height: 8, background: 'var(--color-background-secondary)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: 'var(--color-brand-accent)', opacity: 0.7 }} />
                </div>
                <span className="mono" style={{ textAlign: 'right' }}>{fmt(p.revenue_minor)}</span>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

/* Legacy fixture-driven version kept for reference during the live-data
 * rollout. Remove once the live RevenueTab has been pair-verified by
 * the team. */
function RevenueTabFixture() {
  const total = REVENUE_BY_PROPERTY.reduce((a, p) => a + p.gross, 0);
  return (
    <>
      <PendingDataBanner note="Fixture mode — superseded by RevenueTab (live)." />
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div className="card-title">Revenue by month</div>
          <div className="card-subtitle">gross · fees · net to owners</div>
          <AskAnalyticsCTA question="Why is April pacing lower than March?" />
        </div>
        <div className="card-body">
          <RevenueTrendChart />
        </div>
      </div>
      <div className="card">
        <div className="card-header">
          <div className="card-title">Revenue by property · MTD</div>
          <div className="card-subtitle">€ {total.toLocaleString()} gross</div>
          <AskAnalyticsCTA question="Which property drove the biggest revenue change this month?" />
        </div>
        {REVENUE_BY_PROPERTY.sort((a, b) => b.gross - a.gross).map((p) => {
          const pct = (p.gross / total) * 100;
          return (
            <div
              key={p.code}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 2fr 1fr 1fr 0.8fr',
                gap: 12,
                padding: '12px 16px',
                borderBottom: '0.5px solid var(--color-border-tertiary)',
                alignItems: 'center',
                fontSize: 13,
              }}
            >
              <div>
                <div style={{ fontWeight: 500 }}>{p.property}</div>
                <div
                  className="row-meta mono"
                  style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}
                >
                  {p.code}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    flex: 1,
                    height: 6,
                    background: 'var(--color-background-secondary)',
                    borderRadius: 3,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: '100%',
                      background: 'var(--color-brand-accent)',
                      opacity: p.partial ? 0.5 : 1,
                    }}
                  />
                </div>
                <span className="mono" style={{ fontSize: 11 }}>
                  {Math.round(pct)}%
                </span>
              </div>
              <span className="mono" style={{ fontSize: 12, fontWeight: 500 }}>
                € {p.gross.toLocaleString()}
              </span>
              <span className="mono" style={{ fontSize: 12 }}>
                {p.bookings} bookings
              </span>
              <span className="mono" style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                {Math.round(p.occ * 100)}% occ
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function RevenueTrendChart() {
  const max = Math.max(...REVENUE_TREND.map((r) => r.gross));
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 180 }}>
        {REVENUE_TREND.map((r, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              height: '100%',
            }}
          >
            <div
              style={{
                flex: 1,
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                gap: 1,
              }}
            >
              <div
                style={{
                  background: 'var(--color-brand-accent)',
                  height: `${(r.net / max) * 100}%`,
                  opacity: r.partial ? 0.5 : 1,
                }}
                title={`Net: €${r.net}k`}
              />
              <div
                style={{
                  background: 'var(--color-brand-accent-soft)',
                  height: `${(r.fees / max) * 100}%`,
                  opacity: r.partial ? 0.5 : 1,
                }}
                title={`Fees: €${r.fees}k`}
              />
            </div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              {r.month}
            </div>
            <div className="mono" style={{ fontSize: 11, fontWeight: r.partial ? 400 : 500 }}>
              €{r.gross}k
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 12 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, background: 'var(--color-brand-accent)' }} />
          Net to owners
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{ width: 10, height: 10, background: 'var(--color-brand-accent-soft)' }}
          />
          Channel fees
        </span>
      </div>
    </>
  );
}

/* ───────────── Occupancy ─────────────
 * Live heatmap from /api/analytics/occupancy-heatmap (last 6 months of
 * per-property occupancy as a % of nights booked). */
function OccupancyTab() {
  const { portfolio } = usePortfolio(30);
  const { heatmap, loading, error } = useOccupancyHeatmap(6);

  const occ = portfolio?.kpis.occupancy_pct ?? null;
  const adr = portfolio?.kpis.adr_minor ?? null;
  const revpar = portfolio?.kpis.revpar_minor ?? null;
  const currency = portfolio?.currency || 'EUR';

  return (
    <>
      <div className="kpi-grid kpi-grid-3">
        <KpiCard
          label="Portfolio occ · 30d"
          value={occ != null ? `${occ}%` : '—'}
          sub={portfolio ? `${portfolio.kpis.active_properties} live props` : ''}
          dir="flat"
        />
        <KpiCard
          label="ADR · 30d"
          value={adr != null ? formatKpiMinor(adr, currency) : '—'}
          sub={portfolio ? `${portfolio.kpis.booked_nights} booked nights` : ''}
          dir="flat"
        />
        <KpiCard
          label="RevPAR · 30d"
          value={revpar != null ? formatKpiMinor(revpar, currency) : '—'}
          sub={portfolio ? `${portfolio.kpis.reservation_count} bookings` : ''}
          dir="flat"
        />
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Occupancy heatmap · 6 months</div>
          <div className="card-subtitle">
            {heatmap
              ? `live · ${heatmap.properties.length} live properties × ${heatmap.months.length} months`
              : 'loading…'}
          </div>
        </div>
        <div style={{ padding: 16 }}>
          {loading && !heatmap && (
            <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Loading heatmap…</p>
          )}
          {error && (
            <p style={{ fontSize: 12, color: 'var(--color-text-warning)' }}>Failed: {error}</p>
          )}
          {heatmap && (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `60px repeat(${heatmap.months.length}, 1fr)`,
                  gap: 4,
                  marginBottom: 6,
                }}
              >
                <span />
                {heatmap.months.map((m) => (
                  <div
                    key={m}
                    style={{
                      fontSize: 11,
                      color: 'var(--color-text-tertiary)',
                      textAlign: 'center',
                      fontFamily: 'var(--font-mono-fad)',
                    }}
                  >
                    {String(m).slice(0, 7)}
                  </div>
                ))}
              </div>
              {heatmap.properties.map((p) => (
                <div
                  key={p.code || p.nickname || Math.random()}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `60px repeat(${heatmap.months.length}, 1fr)`,
                    gap: 4,
                    marginBottom: 4,
                  }}
                >
                  <div
                    className="mono"
                    style={{
                      fontSize: 11,
                      color: 'var(--color-text-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={p.nickname || p.code || ''}
                  >
                    {p.code || p.nickname || '—'}
                  </div>
                  {p.row.map((v, i) => (
                    <div
                      key={i}
                      style={{
                        height: 24,
                        background:
                          v === 0
                            ? 'var(--color-background-secondary)'
                            : `color-mix(in srgb, var(--color-brand-accent) ${v}%, transparent)`,
                        borderRadius: 2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10,
                        fontFamily: 'var(--font-mono-fad)',
                        color: v > 50 ? '#fff' : 'var(--color-text-tertiary)',
                      }}
                      title={`${p.code || p.nickname}: ${String(heatmap.months[i]).slice(0, 7)} = ${v}%`}
                    >
                      {v === 0 ? '—' : `${v}%`}
                    </div>
                  ))}
                </div>
              ))}
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--color-text-tertiary)',
                  marginTop: 12,
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                }}
              >
                <span>0%</span>
                <div
                  style={{
                    flex: 1,
                    height: 6,
                    background:
                      'linear-gradient(to right, var(--color-background-secondary), var(--color-brand-accent))',
                    borderRadius: 3,
                  }}
                />
                <span>100%</span>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ───────────── Channels ───────────── */
// T1.14 — default commission rates per channel. Used to ESTIMATE
// channel cost since we don't yet store a per-tenant commission
// schedule. Numbers are public industry defaults (Airbnb 15%,
// Booking.com 17% on host pricing, etc.) — they're flagged as
// "estimated" in the UI so operators don't take them as committed.
const DEFAULT_CHANNEL_COMMISSION: Record<string, number> = {
  Airbnb: 0.15,
  'Booking.com': 0.17,
  VRBO: 0.08,
  Direct: 0.0,
  Manual: 0.0,
  Email: 0.0,
  Owner: 0.0,
  'Scraped (Legacy)': 0.15, // assume Airbnb-equivalent for legacy scrapes
  Unknown: 0.12,
};

function ChannelsTab() {
  const { portfolio, loading, error } = usePortfolio(30);

  if (loading && !portfolio) {
    return (
      <div className="kpi-grid kpi-grid-3">
        {[1, 2, 3].map((i) => (
          <div className="kpi" key={i}>
            <div className="kpi-label">Loading…</div>
            <div className="kpi-value" style={{ opacity: 0.4 }}>—</div>
          </div>
        ))}
      </div>
    );
  }
  if (error || !portfolio) {
    return (
      <div role="alert" style={{ padding: '12px 16px', color: 'var(--color-text-warning)', fontSize: 13 }}>
        Failed to load channels data: {error || 'unknown error'}.
      </div>
    );
  }

  const { channel_mix, currency, window: windowInfo } = portfolio;
  // Sort by revenue descending so the visual + table both rank consistently.
  const channels = [...channel_mix].sort((a, b) => b.revenue_minor - a.revenue_minor);
  const totalRevenue = channels.reduce((a, c) => a + c.revenue_minor, 0);
  const totalCommission = channels.reduce((sum, c) => {
    const rate = DEFAULT_CHANNEL_COMMISSION[c.channel] ?? 0.12;
    return sum + c.revenue_minor * rate;
  }, 0);
  const directShare = channels
    .filter((c) => c.channel === 'Direct' || c.channel === 'Email' || c.channel === 'Manual')
    .reduce((sum, c) => sum + c.share_pct, 0);

  const fmt = (minor: number) => {
    const major = Math.round(minor / 100);
    const sym = currency === 'EUR' ? '€' : currency === 'MUR' ? 'Rs' : currency === 'USD' ? '$' : '';
    return `${sym} ${major.toLocaleString()}`;
  };
  const fmtCompact = (minor: number) => {
    const major = minor / 100;
    if (major >= 1000) return `${(major / 1000).toFixed(major >= 10000 ? 0 : 1)}k`;
    return Math.round(major).toString();
  };

  return (
    <>
      <div style={{
        padding: '8px 14px',
        marginBottom: 16,
        background: 'rgba(72, 173, 122, 0.08)',
        borderLeft: '2px solid rgb(72, 173, 122)',
        borderRadius: 4,
        fontSize: 12,
        color: 'var(--color-text-secondary)',
      }}>
        <strong style={{ fontWeight: 500 }}>Live data · last {windowInfo.days}d.</strong>{' '}
        Channel revenue + share from the same SQL aggregate as the Overview tab.
        Commissions are estimated using industry-default rates per channel
        (Airbnb 15% · Booking.com 17% · VRBO 8% · Direct 0%) — actual
        commissions land when the per-tenant commission schedule ships.
      </div>
      <div className="kpi-grid kpi-grid-3">
        <div className="kpi">
          <div className="kpi-label">Revenue · last {windowInfo.days}d</div>
          <div className="kpi-value">€ {fmtCompact(totalRevenue)}</div>
          <div className="kpi-sub">across {channels.length} channels</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Estimated channel commissions</div>
          <div className="kpi-value">€ {fmtCompact(totalCommission)}</div>
          <div className="kpi-sub">
            {totalRevenue > 0 ? Math.round((totalCommission / totalRevenue) * 100) : 0}% of revenue
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Direct + Manual + Email share</div>
          <div className="kpi-value">{Math.round(directShare)}%</div>
          <div className="kpi-sub">no channel commission</div>
        </div>
      </div>
      <div className="two-col">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Channel mix · last {windowInfo.days}d</div>
            <div className="card-subtitle">by revenue</div>
            <AskAnalyticsCTA question="Which channel is growing the fastest this window?" />
          </div>
          <div className="card-body">
            {channels.length === 0 ? (
              <div style={{ padding: 12, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                No reservations in window.
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', height: 24, borderRadius: 4, overflow: 'hidden', marginBottom: 16 }}>
                  {channels.map((c, i) => (
                    <div
                      key={c.channel}
                      style={{
                        flex: Math.max(c.revenue_minor, 1),
                        background: `color-mix(in srgb, var(--color-brand-accent) ${Math.max(25, Math.round(100 - i * 14))}%, transparent)`,
                      }}
                      title={`${c.channel}: ${Math.round(c.share_pct)}%`}
                    />
                  ))}
                </div>
                {channels.map((c, i) => (
                  <div
                    key={c.channel}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 0',
                      fontSize: 13,
                      borderBottom: '0.5px solid var(--color-border-tertiary)',
                    }}
                  >
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        background: `color-mix(in srgb, var(--color-brand-accent) ${Math.max(25, Math.round(100 - i * 14))}%, transparent)`,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ flex: 1, fontWeight: 500 }}>{c.channel}</span>
                    <span className="mono" style={{ color: 'var(--color-text-tertiary)' }}>
                      {Math.round(c.share_pct)}%
                    </span>
                    <span className="mono" style={{ width: 90, textAlign: 'right' }}>
                      {fmt(c.revenue_minor)}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Estimated channel cost</div>
            <div className="card-subtitle">commission applied per channel</div>
          </div>
          {channels.length === 0 ? (
            <div style={{ padding: 14, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              No reservations to compute commissions for.
            </div>
          ) : (
            channels.map((c) => {
              const rate = DEFAULT_CHANNEL_COMMISSION[c.channel] ?? 0.12;
              const commission = Math.round(c.revenue_minor * rate);
              return (
                <div
                  key={c.channel}
                  style={{
                    padding: '14px 16px',
                    borderBottom: '0.5px solid var(--color-border-tertiary)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{c.channel}</span>
                    <span className="mono" style={{ fontSize: 13, color: rate > 0 ? 'var(--color-text-danger)' : 'var(--color-text-tertiary)' }}>
                      {rate > 0 ? `− ${fmt(commission)}` : '—'}
                    </span>
                  </div>
                  <div className="row-meta">
                    {c.reservation_count} {c.reservation_count === 1 ? 'reservation' : 'reservations'} · estimated {Math.round(rate * 100)}% rate
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}

/* ───────────── Reviews ─────────────
 * T1.14 — wired to live /api/reviews/list (useLiveReviews) via reviewsClient.
 * Aggregates locally because the reviews count is small (hundreds).
 * Replaces fixture REVIEW_TREND + REVIEW_BY_REGION. */
function ReviewsTabLive() {
  const { reviews, loading, error } = useLiveReviews();

  // Build a rolling 6-month trend (oldest first) — avg rating + count
  // per calendar month, bucketing by submittedAt.
  const trend = useMemo(() => {
    if (!reviews || reviews.length === 0) return [];
    const now = new Date();
    const buckets: { month: string; year: number; m: number; ratings: number[] }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        month: d.toLocaleString('en-US', { month: 'short' }),
        year: d.getFullYear(),
        m: d.getMonth(),
        ratings: [],
      });
    }
    for (const rv of reviews) {
      const dt = new Date(rv.submittedAt);
      if (Number.isNaN(dt.getTime())) continue;
      const idx = buckets.findIndex((b) => b.year === dt.getFullYear() && b.m === dt.getMonth());
      if (idx < 0) continue;
      buckets[idx].ratings.push(rv.rating);
    }
    return buckets.map((b) => ({
      month: b.month,
      avg: b.ratings.length === 0 ? 0 : b.ratings.reduce((a, c) => a + c, 0) / b.ratings.length,
      count: b.ratings.length,
      partial: false,
    }));
  }, [reviews]);

  // Channel mix on reviews — distinct from reservation channel mix.
  // Useful for "which channel are guests actually leaving reviews on?"
  const channelStats = useMemo(() => {
    const acc = new Map<string, { count: number; ratingSum: number }>();
    for (const rv of reviews || []) {
      const cur = acc.get(rv.channel) || { count: 0, ratingSum: 0 };
      cur.count += 1;
      cur.ratingSum += rv.rating;
      acc.set(rv.channel, cur);
    }
    return Array.from(acc.entries())
      .map(([channel, { count, ratingSum }]) => ({
        channel,
        count,
        avg: ratingSum / count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [reviews]);

  if (loading && (!reviews || reviews.length === 0)) {
    return (
      <div className="kpi-grid kpi-grid-3">
        {[1, 2, 3].map((i) => (
          <div className="kpi" key={i}>
            <div className="kpi-label">Loading…</div>
            <div className="kpi-value" style={{ opacity: 0.4 }}>—</div>
          </div>
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div role="alert" style={{ padding: '12px 16px', color: 'var(--color-text-warning)', fontSize: 13 }}>
        Failed to load reviews: {error}.
      </div>
    );
  }
  if (!reviews || reviews.length === 0) {
    return (
      <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
        No reviews in cache yet. Reviews sync from Guesty / Reva — check back after the next poll.
      </div>
    );
  }

  const overallAvg = reviews.reduce((a, r) => a + r.rating, 0) / reviews.length;
  const last90Cutoff = new Date(Date.now() - 90 * 86400000);
  const recent = reviews.filter((r) => new Date(r.submittedAt) >= last90Cutoff);
  const recentAvg = recent.length > 0
    ? recent.reduce((a, r) => a + r.rating, 0) / recent.length
    : 0;
  const trendMax = Math.max(1, ...trend.map((t) => t.count));

  return (
    <>
      <div style={{
        padding: '8px 14px',
        marginBottom: 16,
        background: 'rgba(72, 173, 122, 0.08)',
        borderLeft: '2px solid rgb(72, 173, 122)',
        borderRadius: 4,
        fontSize: 12,
        color: 'var(--color-text-secondary)',
      }}>
        <strong style={{ fontWeight: 500 }}>Live data.</strong>{' '}
        Computed from {reviews.length} reviews in cache (Guesty + Reva sync). Rating
        bars in the trend chart scale relative to 4.0–5.0; bars at zero
        height mean no reviews landed in that month.
      </div>
      <div className="kpi-grid kpi-grid-3">
        <div className="kpi">
          <div className="kpi-label">Portfolio avg · all time</div>
          <div className="kpi-value">{overallAvg.toFixed(2)}</div>
          <div className="kpi-sub">{reviews.length} reviews</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Avg · last 90d</div>
          <div className="kpi-value">{recent.length > 0 ? recentAvg.toFixed(2) : '—'}</div>
          <div className="kpi-sub">{recent.length} reviews</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Channels reviewed</div>
          <div className="kpi-value">{channelStats.length}</div>
          <div className="kpi-sub">distinct sources</div>
        </div>
      </div>
      <div className="two-col" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Rating trend · 6 months</div>
            <div className="card-subtitle">portfolio average</div>
            <AskAnalyticsCTA question="What drove the recent rating trend?" />
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 140 }}>
              {trend.map((r, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    height: '100%',
                  }}
                >
                  <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                    <div style={{
                      background: 'var(--color-brand-accent)',
                      height: r.avg > 0 ? `${Math.max(2, ((r.avg - 4.0) / 1.0) * 100)}%` : '0%',
                      opacity: r.count === 0 ? 0.25 : 1,
                    }} />
                  </div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{r.month}</div>
                  <div className="mono" style={{ fontSize: 11 }}>{r.avg > 0 ? r.avg.toFixed(1) : '—'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Review volume</div>
            <div className="card-subtitle">reviews received per month</div>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 140 }}>
              {trend.map((r, i) => (
                <div
                  key={i}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%' }}
                >
                  <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                    <div style={{
                      background: 'var(--color-text-secondary)',
                      height: `${(r.count / trendMax) * 100}%`,
                    }} />
                  </div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{r.month}</div>
                  <div className="mono" style={{ fontSize: 11 }}>{r.count}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-header">
          <div className="card-title">By channel</div>
          <div className="card-subtitle">where guests leave reviews + how they rate</div>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr',
            gap: 12,
            padding: '10px 16px',
            borderBottom: '0.5px solid var(--color-border-tertiary)',
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--color-text-tertiary)',
          }}
        >
          <span>Channel</span>
          <span>Count</span>
          <span>Avg rating</span>
        </div>
        {channelStats.map((c) => (
          <div
            key={c.channel}
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1fr',
              gap: 12,
              padding: '14px 16px',
              borderBottom: '0.5px solid var(--color-border-tertiary)',
              fontSize: 13,
              alignItems: 'center',
            }}
          >
            <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>{c.channel}</span>
            <span className="mono" style={{ color: 'var(--color-text-tertiary)' }}>{c.count}</span>
            <span
              className="mono"
              style={{
                fontWeight: 500,
                color: c.avg >= 4.7 ? 'var(--color-text-success)' : c.avg < 4.5 ? 'var(--color-text-danger)' : 'inherit',
              }}
            >
              {c.avg.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

/* Legacy fixture-driven version — kept temporarily for reference while
 * the live version stabilises. Wire ReviewsTabLive in the tab dispatcher. */
function ReviewsTab() {
  return (
    <>
      <PendingDataBanner note="Reviews backend already exists at /api/reviews/list — wire here in Phase 2." />
      <div className="two-col" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Rating trend · 6 months</div>
            <div className="card-subtitle">portfolio average</div>
            <AskAnalyticsCTA question="What drove the April rating bump?" />
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 140 }}>
              {REVIEW_TREND.map((r, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    height: '100%',
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      width: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <div
                      style={{
                        background: 'var(--color-brand-accent)',
                        height: `${((r.avg - 4.0) / 1.0) * 100}%`,
                        opacity: r.partial ? 0.5 : 1,
                      }}
                    />
                  </div>
                  <div
                    className="mono"
                    style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}
                  >
                    {r.month}
                  </div>
                  <div className="mono" style={{ fontSize: 11 }}>
                    {r.avg.toFixed(1)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Review volume</div>
            <div className="card-subtitle">reviews received per month</div>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 140 }}>
              {REVIEW_TREND.map((r, i) => {
                const max = Math.max(...REVIEW_TREND.map((x) => x.count));
                return (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                      height: '100%',
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'flex-end',
                      }}
                    >
                      <div
                        style={{
                          background: 'var(--color-text-secondary)',
                          height: `${(r.count / max) * 100}%`,
                          opacity: r.partial ? 0.5 : 1,
                        }}
                      />
                    </div>
                    <div
                      className="mono"
                      style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}
                    >
                      {r.month}
                    </div>
                    <div className="mono" style={{ fontSize: 11 }}>
                      {r.count}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-header">
          <div className="card-title">By region</div>
          <div className="card-subtitle">avg rating · volume · SLA</div>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2.4fr 0.8fr 0.8fr 1fr 1fr',
            gap: 12,
            padding: '10px 16px',
            borderBottom: '0.5px solid var(--color-border-tertiary)',
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--color-text-tertiary)',
          }}
        >
          <span>Region</span>
          <span>Props</span>
          <span>Avg</span>
          <span>Count</span>
          <span>Response SLA</span>
        </div>
        {REVIEW_BY_REGION.map((r, i) => (
          <div
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns: '2.4fr 0.8fr 0.8fr 1fr 1fr',
              gap: 12,
              padding: '14px 16px',
              borderBottom: '0.5px solid var(--color-border-tertiary)',
              fontSize: 13,
              alignItems: 'center',
            }}
          >
            <span style={{ fontWeight: 500 }}>{r.region}</span>
            <span className="mono">{r.properties}</span>
            <span
              className="mono"
              style={{ fontWeight: 500, color: r.avg >= 4.7 ? 'var(--color-text-success)' : r.avg < 4.5 ? 'var(--color-text-danger)' : 'inherit' }}
            >
              {r.avg.toFixed(2)}
            </span>
            <span className="mono" style={{ color: 'var(--color-text-tertiary)' }}>
              {r.count}
            </span>
            <span className="mono" style={{ fontSize: 12 }}>
              {r.sla}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

/* ───────────── Team (live, T1.14) ─────────────
 * Aggregates per-assignee task workload from useApiTasks. The fixture
 * TeamTabFixture is preserved below as a reference. */
function TeamTab() {
  // 30-day window keeps the lookup bounded + matches the rest of Analytics.
  const since = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }, []);
  const taskFilter = useMemo(() => ({ updatedAfter: since, limit: 1000 }), [since]);
  const { tasks, loading, error } = useApiTasks(taskFilter);

  const stats = useMemo(() => {
    if (!tasks || tasks.length === 0) return [];
    const acc = new Map<string, { total: number; completed: number; overdue: number }>();
    const now = Date.now();
    for (const t of tasks) {
      const names = t.assigneeNames && t.assigneeNames.length > 0 ? t.assigneeNames : ['Unassigned'];
      for (const name of names) {
        const cur = acc.get(name) || { total: 0, completed: 0, overdue: 0 };
        cur.total += 1;
        const isFinished = t.status === 'completed' || t.status === 'closed';
        if (isFinished) cur.completed += 1;
        if (t.dueDate && !isFinished) {
          const due = new Date(t.dueDate).getTime();
          if (!Number.isNaN(due) && due < now) cur.overdue += 1;
        }
        acc.set(name, cur);
      }
    }
    return Array.from(acc.entries())
      .map(([name, s]) => ({ name, ...s, completionPct: s.total > 0 ? (s.completed / s.total) * 100 : 0 }))
      .sort((a, b) => b.total - a.total);
  }, [tasks]);

  if (loading && (!tasks || tasks.length === 0)) {
    return (
      <div className="kpi-grid kpi-grid-3">
        {[1, 2, 3].map((i) => (
          <div className="kpi" key={i}>
            <div className="kpi-label">Loading…</div>
            <div className="kpi-value" style={{ opacity: 0.4 }}>—</div>
          </div>
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div role="alert" style={{ padding: '12px 16px', color: 'var(--color-text-warning)', fontSize: 13 }}>
        Failed to load team workload: {error}.
      </div>
    );
  }

  const totalTasks = stats.reduce((a, s) => a + s.total, 0);
  const totalCompleted = stats.reduce((a, s) => a + s.completed, 0);
  const totalOverdue = stats.reduce((a, s) => a + s.overdue, 0);

  return (
    <>
      <div style={{
        padding: '8px 14px',
        marginBottom: 16,
        background: 'rgba(72, 173, 122, 0.08)',
        borderLeft: '2px solid rgb(72, 173, 122)',
        borderRadius: 4,
        fontSize: 12,
        color: 'var(--color-text-secondary)',
      }}>
        <strong style={{ fontWeight: 500 }}>Live data · last 30d.</strong>{' '}
        Per-assignee task workload from /api/tasks. A task with multiple
        assignees counts toward each. Messages + reviews + leads per
        person are deferred until each module exposes a per-actor
        aggregate route.
      </div>
      <div className="kpi-grid kpi-grid-3">
        <div className="kpi">
          <div className="kpi-label">Total task touches · last 30d</div>
          <div className="kpi-value">{totalTasks}</div>
          <div className="kpi-sub">across {stats.length} {stats.length === 1 ? 'person' : 'people'}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Completed</div>
          <div className="kpi-value">{totalCompleted}</div>
          <div className="kpi-sub">{totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0}% completion rate</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Overdue (open)</div>
          <div className="kpi-value">{totalOverdue}</div>
          <div className="kpi-sub">across the team</div>
        </div>
      </div>
      <div style={{ marginBottom: 16, padding: 12, background: 'var(--color-bg-info)', borderLeft: '2px solid var(--color-brand-accent)', borderRadius: 4, fontSize: 12, color: 'var(--color-text-info)' }}>
        <strong style={{ fontWeight: 500 }}>Per-staff AI performance</strong> (first-draft acceptance, teachings contributed, credits) lives in{' '}
        <span style={{ textDecoration: 'underline', cursor: 'pointer' }}>Training → Performance</span>. This tab shows operational workload.
      </div>
      <div className="card">
        <div className="card-header">
          <div className="card-title">Workload distribution · past 30 days</div>
          <div className="card-subtitle">tasks per assignee · completion rate · open overdue</div>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
            gap: 12,
            padding: '10px 16px',
            borderBottom: '0.5px solid var(--color-border-tertiary)',
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--color-text-tertiary)',
          }}
        >
          <span>Staff</span>
          <span>Tasks touched</span>
          <span>Completed</span>
          <span>Completion %</span>
          <span>Overdue (open)</span>
        </div>
        {stats.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
            No tasks in window.
          </div>
        ) : (
          stats.map((t) => (
            <div
              key={t.name}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
                gap: 12,
                padding: '14px 16px',
                borderBottom: '0.5px solid var(--color-border-tertiary)',
                fontSize: 13,
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="avatar sm">{t.name[0]}</span>
                <span style={{ fontWeight: 500 }}>{t.name}</span>
              </div>
              <span className="mono">{t.total}</span>
              <span className="mono">{t.completed}</span>
              <span
                className="mono"
                style={{ color: t.completionPct >= 70 ? 'var(--color-text-success)' : t.completionPct < 40 ? 'var(--color-text-danger)' : 'inherit' }}
              >
                {Math.round(t.completionPct)}%
              </span>
              <span
                className="mono"
                style={{ color: t.overdue > 0 ? 'var(--color-text-warning)' : 'var(--color-text-tertiary)' }}
              >
                {t.overdue}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}

/* Legacy fixture-driven version, preserved during the live-data rollout.
 * Remove once TeamTab has been pair-verified. */
function TeamTabFixture() {
  return (
    <>
      <PendingDataBanner note="Fixture mode — superseded by TeamTab (live)." />
      <div style={{ marginBottom: 16, padding: 12, background: 'var(--color-bg-info)', borderLeft: '2px solid var(--color-brand-accent)', borderRadius: 4, fontSize: 12, color: 'var(--color-text-info)' }}>
        <strong style={{ fontWeight: 500 }}>Per-staff AI performance</strong> (first-draft acceptance, teachings contributed, credits) lives in{' '}
        <span style={{ textDecoration: 'underline', cursor: 'pointer' }}>Training → Performance</span>. This tab shows operational workload.
      </div>
      <div className="card">
        <div className="card-header">
          <div className="card-title">Workload distribution · past 30 days</div>
          <div className="card-subtitle">tasks · messages · reviews · leads per person</div>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr 1fr',
            gap: 12,
            padding: '10px 16px',
            borderBottom: '0.5px solid var(--color-border-tertiary)',
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--color-text-tertiary)',
          }}
        >
          <span>Staff</span>
          <span>Role</span>
          <span>Tasks</span>
          <span>Messages</span>
          <span>Reviews</span>
          <span>Leads</span>
        </div>
        {TEAM_LOAD.map((t) => (
          <div
            key={t.name}
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr 1fr',
              gap: 12,
              padding: '14px 16px',
              borderBottom: '0.5px solid var(--color-border-tertiary)',
              fontSize: 13,
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="avatar sm">{t.name[0]}</span>
              <span style={{ fontWeight: 500 }}>{t.name}</span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{t.role}</span>
            <span className="mono">{t.tasks}</span>
            <span className="mono">{t.messages}</span>
            <span className="mono">{t.reviews}</span>
            <span className="mono">{t.leads}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/* ───────────── Margin ───────────── */
function MarginTab() {
  const totalGross = MARGIN_BREAKDOWN[0].value;
  return (
    <>
      <PendingDataBanner note="True margin breakdown gated on Finance Phase 3 (GL + owner payouts) per Analytics scoping §7." />
      <div className="card">
        <div className="card-header">
          <div className="card-title">Margin breakdown · MTD</div>
          <div className="card-subtitle">from gross revenue to Friday net</div>
          <AskAnalyticsCTA question="Where can we trim costs without affecting guest experience?" />
        </div>
        <div className="card-body">
          {MARGIN_BREAKDOWN.map((m, i) => {
            const abs = Math.abs(m.value);
            const pct = (abs / totalGross) * 100;
            return (
              <div
                key={i}
                style={{
                  padding: '10px 0',
                  borderBottom:
                    i < MARGIN_BREAKDOWN.length - 1
                      ? '0.5px solid var(--color-border-tertiary)'
                      : 'none',
                  paddingTop: m.isTotal ? 14 : 10,
                  borderTop: m.isTotal ? '2px solid var(--color-brand-accent)' : 'none',
                  marginTop: m.isTotal ? 8 : 0,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: m.isTotal ? 14 : 13,
                      fontWeight: m.isTotal ? 500 : 400,
                      color: m.color,
                    }}
                  >
                    {m.label}
                  </span>
                  <span
                    className="mono"
                    style={{
                      fontSize: m.isTotal ? 15 : 13,
                      fontWeight: m.isTotal ? 500 : 400,
                      color: m.color,
                    }}
                  >
                    {m.value < 0 ? '−' : ''}€ {abs.toLocaleString()}
                  </span>
                </div>
                <div
                  style={{
                    height: 4,
                    background: 'var(--color-background-secondary)',
                    borderRadius: 2,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: '100%',
                      background:
                        m.isTotal || m.value > 0
                          ? 'var(--color-brand-accent)'
                          : 'var(--color-text-secondary)',
                      opacity: m.isTotal || m.value > 0 ? 1 : 0.4,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
