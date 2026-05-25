'use client';

// Reviews · Insights tab — per-module projection of the central
// Analytics engine per scoping pack §4.
// Phase 0 partial: until Cube Core + the deterministic insight engine
// are stood up, this is a hand-built read of /api/analytics/portfolio
// scoped to Reviews-relevant signals. When the engine lands, the
// ranked-insight feed replaces the static cards and the filter bar
// becomes the global one defined in §3.

import { usePortfolio, formatKpiMinor } from '../../../_data/analyticsClient';
import { useLiveReviews } from '../../../_data/reviewsClient';

export function ReviewsInsightsPage() {
  const { portfolio, loading: portLoading } = usePortfolio(30);
  const { reviews, loading: revLoading } = useLiveReviews();

  if (portLoading && revLoading && !portfolio && !reviews) {
    return (
      <div style={{ padding: 16, fontSize: 13, color: 'var(--color-text-tertiary)' }}>
        Loading insights…
      </div>
    );
  }

  // Reviews-relevant signals derived from what we have today (no
  // Cube Core yet). Reviews-side: average score, count, sentiment
  // mix. Portfolio-side: revenue per review for the rebooking-signal
  // angle the scoping doc calls out (§4 Reviews row).
  const revs = reviews || [];
  const total = revs.length;
  const ratings = revs
    .map((r) => Number(r.rating))
    .filter((n) => Number.isFinite(n));
  const avgRating = ratings.length
    ? (ratings.reduce((a, b) => a + b, 0) / ratings.length)
    : null;
  const lowScores = revs.filter((r) => (Number(r.rating) || 5) <= 3).length;
  const channelMix = revs.reduce<Record<string, number>>((acc, r) => {
    const k = (r.channel || 'unknown').toLowerCase();
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  const navAnalytics = (tab: string) => {
    if (typeof window === 'undefined') return;
    window.location.href = `/fad?m=analytics&t=${encodeURIComponent(tab)}`;
  };

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
      <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 6, background: 'var(--color-background-secondary)', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
        <strong style={{ color: 'var(--color-text-secondary)' }}>Phase 0 partial:</strong>{' '}
        Static cards driven by live data. Ranked insight feed + agent narration land with Cube Core (Phase 0 full per Analytics scoping §11).
      </div>

      <div className="kpi-grid">
        <Kpi label="Average rating" value={avgRating != null ? avgRating.toFixed(2) : '—'} sub={`across ${total} reviews`} />
        <Kpi label="Low scores (≤3)" value={String(lowScores)} sub={total > 0 ? `${Math.round((lowScores / total) * 100)}% of reviews` : 'no reviews'} />
        <Kpi label="Total reviews" value={String(total)} sub="all channels" />
        <Kpi
          label="Revenue · last 30d"
          value={portfolio ? formatKpiMinor(portfolio.kpis.revenue_minor, portfolio.currency) : '—'}
          sub="for rebooking-signal context"
        />
      </div>

      {Object.keys(channelMix).length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header">
            <div className="card-title">Reviews by channel</div>
            <div className="card-subtitle">where the reviews are landing</div>
          </div>
          <div className="card-body">
            {Object.entries(channelMix)
              .sort((a, b) => b[1] - a[1])
              .map(([channel, count]) => (
                <div
                  key={channel}
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
                  <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>{channel}</span>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{count}</span>
                  <span className="mono" style={{ fontSize: 12 }}>{total > 0 ? `${Math.round((count / total) * 100)}%` : '—'}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 24, padding: '12px 16px', background: 'var(--color-background-secondary)', borderRadius: 6 }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
          Open in Analytics
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(['overview', 'reviews', 'team', 'channels'] as const).map((slug) => (
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
