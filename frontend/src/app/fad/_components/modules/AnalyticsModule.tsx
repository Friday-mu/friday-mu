'use client';

// Analytics module — Phase 0 (deterministic tier-1 metrics from
// /api/analytics/portfolio). Per scoping pack
// 36a43ca884928165b886fc3043e399a0 the Overview + Occupancy tabs are
// the first to wire live; other tabs (Revenue / Channels / Reviews /
// Team / Margin) remain fixture-driven until Phase 2 (Cube Core +
// per-module Insights panels).

import { useState } from 'react';
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
import { IconDownload, IconSparkle } from '../icons';
import { ModuleHeader } from '../ModuleHeader';

export function AnalyticsModule() {
  const [tab, setTab] = useState('overview');
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'revenue', label: 'Revenue' },
    { id: 'occupancy', label: 'Occupancy' },
    { id: 'channels', label: 'Channels' },
    { id: 'reviews', label: 'Reviews' },
    { id: 'team', label: 'Team' },
    { id: 'margin', label: 'Margin' },
  ];
  return (
    <>
      <ModuleHeader
        title="Analytics"
        subtitle="Portfolio dashboards · scan-first · data across every module"
        tabs={tabs}
        activeTab={tab}
        onTabChange={setTab}
        actions={
          <>
            <button className="btn ghost sm">
              <IconSparkle size={12} /> Ask Friday
            </button>
            <button className="btn sm">
              <IconDownload size={12} /> Export PDF
            </button>
          </>
        }
      />
      
      <div className="fad-module-body">
        {tab === 'overview' && <OverviewTab />}
        {tab === 'revenue' && <RevenueTab />}
        {tab === 'occupancy' && <OccupancyTab />}
        {tab === 'channels' && <ChannelsTab />}
        {tab === 'reviews' && <ReviewsTab />}
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
          label="Occupancy"
          value={`${kpis.occupancy_pct}%`}
          sub={`${occDelta.dir === 'flat' ? '—' : (occDelta.pct > 0 ? '+' : '') + occDelta.pct + 'pp'} vs prior · ${kpis.active_properties} live props`}
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
        Phase 0 live · deterministic SQL aggregates from guesty_reservations.
        <strong style={{ fontWeight: 500 }}> Phase 1 (proactive AI insights, push digest) + Phase 2 (Cube Core + per-module Insights panels)</strong> per scoping pack.
        Revenue gaps where Guesty cache lacks total_amount_minor.
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
            title={`${String(p.day).slice(0, 10)} · ${formatKpiMinor(p.revenue_minor, currency)} · ${p.reservation_count} bookings`}
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

/* ───────────── Revenue ───────────── */
function RevenueTab() {
  const total = REVENUE_BY_PROPERTY.reduce((a, p) => a + p.gross, 0);
  return (
    <>
      <PendingDataBanner note="Live revenue per property + month is on the Overview tab (live · last 30d)." />
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
function ChannelsTab() {
  const totalRevenue = CHANNEL_REVENUE.reduce((a, c) => a + c.gross, 0);
  const totalCommission = CHANNEL_COSTS.reduce((a, c) => a + c.commission, 0);
  return (
    <>
      <PendingDataBanner note="Live channel mix (reservation share) is on the Overview tab." />
      <div className="kpi-grid kpi-grid-3">
        <div className="kpi">
          <div className="kpi-label">YTD revenue</div>
          <div className="kpi-value">€ {(totalRevenue / 1000).toFixed(0)}k</div>
          <div className="kpi-sub">across 5 channels</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Channel commissions</div>
          <div className="kpi-value">€ {(totalCommission / 1000).toFixed(1)}k</div>
          <div className="kpi-sub">
            {Math.round((totalCommission / totalRevenue) * 100)}% of revenue
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Direct-book share</div>
          <div className="kpi-value">22%</div>
          <div className="kpi-sub up">goal 25% by Q4</div>
        </div>
      </div>
      <div className="two-col">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Channel mix · YTD</div>
            <div className="card-subtitle">by revenue</div>
          </div>
          <div className="card-body">
            <div
              style={{
                display: 'flex',
                height: 24,
                borderRadius: 4,
                overflow: 'hidden',
                marginBottom: 16,
              }}
            >
              {CHANNEL_REVENUE.map((c, i) => (
                <div
                  key={i}
                  style={{
                    flex: c.share,
                    background: `color-mix(in srgb, var(--color-brand-accent) ${Math.max(
                      25,
                      Math.round(100 - i * 18)
                    )}%, transparent)`,
                  }}
                  title={`${c.channel}: ${Math.round(c.share * 100)}%`}
                />
              ))}
            </div>
            {CHANNEL_REVENUE.map((c, i) => (
              <div
                key={i}
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
                    background: `color-mix(in srgb, var(--color-brand-accent) ${Math.max(
                      25,
                      Math.round(100 - i * 18)
                    )}%, transparent)`,
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1, fontWeight: 500 }}>{c.channel}</span>
                <span className="mono" style={{ color: 'var(--color-text-tertiary)' }}>
                  {Math.round(c.share * 100)}%
                </span>
                <span className="mono" style={{ width: 80, textAlign: 'right' }}>
                  € {c.gross.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Channel cost / take-rate</div>
            <div className="card-subtitle">commission paid per channel</div>
          </div>
          {CHANNEL_COSTS.map((c, i) => (
            <div
              key={i}
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
                <span
                  className="mono"
                  style={{ fontSize: 13, color: 'var(--color-text-danger)' }}
                >
                  − € {c.commission.toLocaleString()}
                </span>
              </div>
              <div className="row-meta">
                {c.notes} · effective {Math.round(c.effectiveRate * 100)}%
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ───────────── Reviews ───────────── */
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

/* ───────────── Team ───────────── */
function TeamTab() {
  return (
    <>
      <PendingDataBanner note="Aggregate task / message / review counts per staff member — Phase 2 wiring." />
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
