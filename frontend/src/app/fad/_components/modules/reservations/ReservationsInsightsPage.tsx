'use client';

// Reservations · Insights tab — derived from live /api/analytics/portfolio
// and the existing reservations list. Surfaces the metrics most useful
// when scanning revenue + occupancy + channel health from the
// reservations module without bouncing to the Analytics module.
//
// Cross-link rail at the bottom deep-links to the full Analytics
// tabs (Revenue / Occupancy / Channels / Reviews / Team / Margin)
// so the operator can drop into the deep dashboards when needed.

import { usePortfolio, formatKpiMinor, deltaPct } from '../../../_data/analyticsClient';
import { useT } from '../../../_i18n/useT';

export function ReservationsInsightsPage() {
  const { t } = useT();
  const { portfolio, loading, error, refetch } = usePortfolio(30);

  if (loading && !portfolio) {
    return (
      <div style={{ padding: 16, fontSize: 13, color: 'var(--color-text-tertiary)' }}>
        {t('analytics.loading', 'Loading insights…')}
      </div>
    );
  }
  if (error || !portfolio) {
    return (
      <div role="alert" style={{ padding: 16, color: 'var(--color-text-warning)', fontSize: 13 }}>
        {t('reservations.insights.loadError', 'Failed to load insights')}: {error || 'unknown error'}
        <button className="btn ghost sm" onClick={refetch} style={{ marginLeft: 8 }}>
          {t('common.retry', 'Retry')}
        </button>
      </div>
    );
  }

  const { kpis, currency, channel_mix, top_properties, window: w } = portfolio;
  const revDelta = deltaPct(kpis.revenue_minor, kpis.revenue_minor_prev);
  const adrDelta = deltaPct(kpis.adr_minor, kpis.adr_minor_prev);
  const navAnalytics = (tab: string) => {
    if (typeof window === 'undefined') return;
    window.location.href = `/fad?m=analytics&t=${encodeURIComponent(tab)}`;
  };

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
      <div className="kpi-grid">
        <Kpi
          label={t('reservations.insights.kpi.revenue', 'Revenue')}
          value={formatKpiMinor(kpis.revenue_minor, currency)}
          sub={`${revDelta.dir === 'flat' ? '—' : (revDelta.pct > 0 ? '+' : '') + revDelta.pct + '%'} ${t('reservations.insights.vsPrior', { days: w.days }, 'vs prior {days}d')}`}
        />
        <Kpi
          label={t('reservations.insights.kpi.bookings', 'Bookings')}
          value={String(kpis.reservation_count)}
          sub={t('reservations.insights.bookedNights', { n: kpis.booked_nights }, '{n} booked nights')}
        />
        <Kpi
          label={t('reservations.insights.kpi.occupancy', 'Paid occupancy')}
          value={`${kpis.occupancy_pct}%`}
          sub={kpis.active_properties + ' ' + t('reservations.insights.liveProps', 'live props')}
        />
        <Kpi
          label={t('reservations.insights.kpi.adr', 'ADR')}
          value={formatKpiMinor(kpis.adr_minor, currency)}
          sub={`${adrDelta.dir === 'flat' ? '—' : (adrDelta.pct > 0 ? '+' : '') + adrDelta.pct + '%'} ${t('reservations.insights.vsPrior', { days: w.days }, 'vs prior {days}d')}`}
        />
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <div className="card-title">
            {t('reservations.insights.channelMix', 'Channel mix')}
          </div>
          <div className="card-subtitle">
            {t('reservations.insights.shareLast', { days: w.days }, 'reservation share · last {days}d')}
          </div>
        </div>
        <div className="card-body">
          {channel_mix.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: 0 }}>
              {t('reservations.insights.noBookings', 'No bookings in this window.')}
            </p>
          )}
          {channel_mix.map((c) => (
            <div
              key={c.channel}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 60px 80px',
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

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <div className="card-title">
            {t('reservations.insights.topProperties', 'Top properties by bookings')}
          </div>
          <div className="card-subtitle">
            {t('reservations.insights.lastDays', { days: w.days }, 'last {days}d')}
          </div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {top_properties.slice(0, 8).map((p) => (
            <div
              key={p.code || p.nickname || Math.random()}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 80px 80px 100px',
                gap: 8,
                padding: '10px 14px',
                borderBottom: '0.5px solid var(--color-border-tertiary)',
                alignItems: 'center',
                fontSize: 13,
              }}
            >
              <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <span className="mono" style={{ fontWeight: 500 }}>{p.code || '—'}</span>
                <span style={{ color: 'var(--color-text-tertiary)', marginLeft: 8 }}>
                  {p.title || p.nickname || ''}
                </span>
              </div>
              <span className="mono" style={{ fontSize: 12 }}>{p.reservation_count}</span>
              <span className="mono" style={{ fontSize: 12 }}>{p.occupancy_pct}%</span>
              <span className="mono" style={{ fontSize: 12, textAlign: 'right' }}>
                {formatKpiMinor(p.revenue_minor, currency)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 24, padding: '12px 16px', background: 'var(--color-background-secondary)', borderRadius: 6 }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
          {t('reservations.insights.openInAnalytics', 'Open in Analytics')}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(['overview', 'revenue', 'occupancy', 'channels', 'reviews', 'team'] as const).map((slug) => (
            <button
              key={slug}
              className="btn ghost sm"
              type="button"
              onClick={() => navAnalytics(slug)}
              style={{ fontSize: 11, padding: '3px 8px' }}
            >
              {t(`analytics.tabs.${slug}`, slug)}
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
