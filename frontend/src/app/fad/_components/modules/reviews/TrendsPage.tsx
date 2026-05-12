'use client';

import { useState } from 'react';
import {
  REVIEWS,
  REVIEW_TAGS,
  COHORT_NARRATIVES,
  COHORT_LABEL,
  CHANNEL_LABEL,
  PROPERTY_COHORT,
  avgRating,
  reviewsInWindow,
  reviewsByCohort,
  reviewsByProperty,
  tagAggregate,
  lowRatedReviews,
  type Cohort,
  type Review,
  type TagSentiment,
} from '../../../_data/reviews';
import { useLiveReviews } from '../../../_data/reviewsClient';
import { TASK_PROPERTY_BY_CODE } from '../../../_data/tasks';
import { IconAI } from '../../icons';

type TrendTab = 'cohort' | 'tags' | 'tagsByUnit' | 'lowRated' | 'avgByUnit' | 'mom';

export function TrendsPage() {
  const [tab, setTab] = useState<TrendTab>('cohort');

  // Live Guesty data via useLiveReviews; falls back to fixture REVIEWS (empty
  // post-strip) during initial load or on backend failure. Matches the pattern
  // established by OverviewPage + AllReviewsPage.
  const { reviews: liveReviews } = useLiveReviews();
  const reviewSource = liveReviews ?? REVIEWS;

  const tabs: { id: TrendTab; label: string }[] = [
    { id: 'cohort', label: 'Cohort summaries' },
    { id: 'tags', label: 'Trending tags' },
    { id: 'tagsByUnit', label: 'Tags by unit' },
    { id: 'lowRated', label: 'Low-rated drilldown' },
    { id: 'avgByUnit', label: 'Avg by unit' },
    { id: 'mom', label: 'MoM grid' },
  ];

  return (
    <div className="fad-module-body">
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 16, borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            className={'inbox-chip' + (tab === t.id ? ' active' : '')}
            onClick={() => setTab(t.id)}
            style={{ borderRadius: '4px 4px 0 0' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'cohort' && <CohortSummaries reviews={reviewSource} />}
      {tab === 'tags' && <TrendingTags reviews={reviewSource} />}
      {tab === 'tagsByUnit' && <TagsByUnit reviews={reviewSource} />}
      {tab === 'lowRated' && <LowRatedDrilldown reviews={reviewSource} />}
      {tab === 'avgByUnit' && <AvgByUnit reviews={reviewSource} />}
      {tab === 'mom' && <MoMGrid reviews={reviewSource} />}
    </div>
  );
}

// ───────────────── Cohort Summaries ─────────────────

function CohortSummaries({ reviews }: { reviews: Review[] }) {
  const byCohort = reviewsByCohort(reviews);
  const last90 = reviewsInWindow(90, reviews);
  const last90ByCohort: Record<Cohort, Review[]> = {
    flic_en_flac: [], grand_baie: [], west: [], pereybere: [], bel_ombre: [], other: [],
  };
  for (const rv of last90) last90ByCohort[rv.cohort].push(rv);
  const prior90 = reviews.filter((rv) => {
    const days = Math.round((new Date('2026-04-27').getTime() - new Date(rv.submittedAt).getTime()) / (86400000));
    return days > 90 && days <= 180;
  });
  const prior90ByCohort: Record<Cohort, Review[]> = {
    flic_en_flac: [], grand_baie: [], west: [], pereybere: [], bel_ombre: [], other: [],
  };
  for (const rv of prior90) prior90ByCohort[rv.cohort].push(rv);

  return (
    <>
      <div className="card" style={{ padding: 14, marginBottom: 16, borderLeft: '3px solid var(--color-brand-accent)' }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <IconAI size={11} /> AI cohort narrative · last 90 days
        </div>
        {(Object.keys(COHORT_NARRATIVES) as Cohort[]).map((c) => (
          <div key={c} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 2 }}>{COHORT_LABEL[c]}</div>
            <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
              {COHORT_NARRATIVES[c]}
            </div>
          </div>
        ))}
      </div>

      {/* Comparison bar chart (last 90 vs prior 90) */}
      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          Avg rating · last 90 vs prior 90
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(Object.keys(byCohort) as Cohort[]).map((c) => {
            const cur = avgRating(last90ByCohort[c]);
            const prev = avgRating(prior90ByCohort[c]);
            return (
              <div key={c}>
                <div style={{ fontSize: 12, marginBottom: 4 }}>{COHORT_LABEL[c]}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                  <span style={{ width: 50, color: 'var(--color-text-tertiary)' }}>last 90</span>
                  <div style={{ flex: 1, height: 8, background: 'var(--color-background-secondary)', borderRadius: 4 }}>
                    <div style={{ width: `${(cur / 5) * 100}%`, height: '100%', background: 'var(--color-brand-accent)', borderRadius: 4 }} />
                  </div>
                  <span className="mono" style={{ width: 32, textAlign: 'right' }}>{cur.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginTop: 2 }}>
                  <span style={{ width: 50, color: 'var(--color-text-tertiary)' }}>prior 90</span>
                  <div style={{ flex: 1, height: 8, background: 'var(--color-background-secondary)', borderRadius: 4 }}>
                    <div style={{ width: prev > 0 ? `${(prev / 5) * 100}%` : '0%', height: '100%', background: 'var(--color-text-tertiary)', borderRadius: 4 }} />
                  </div>
                  <span className="mono" style={{ width: 32, textAlign: 'right', color: 'var(--color-text-tertiary)' }}>
                    {prev === 0 ? '—' : prev.toFixed(2)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Period table */}
      <div className="card" style={{ padding: 14, overflowX: 'auto' }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          Cohort × period
        </div>
        <table style={{ width: '100%', minWidth: 540, fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500 }}>Cohort</th>
              {([30, 60, 90, 180] as const).map((d) => (
                <th key={d} style={{ textAlign: 'right', padding: '6px 8px', fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500 }}>{d}d</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(Object.keys(byCohort) as Cohort[]).map((c) => (
              <tr key={c} style={{ borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                <td style={{ padding: '8px' }}>{COHORT_LABEL[c]}</td>
                {([30, 60, 90, 180] as const).map((d) => {
                  const w = reviewsInWindow(d, reviews).filter((rv) => rv.cohort === c);
                  const avg = avgRating(w);
                  return (
                    <td key={d} className="mono" style={{ textAlign: 'right', padding: '8px', color: avg < 4 && w.length > 0 ? 'var(--color-text-warning)' : 'inherit' }}>
                      {w.length === 0 ? '—' : `${avg.toFixed(2)} · ${w.length}`}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ───────────────── Trending Tags ─────────────────

function TrendingTags({ reviews }: { reviews: Review[] }) {
  const all = tagAggregate('all', reviews);
  const last30 = tagAggregate(30, reviews);

  const positives = all.filter((t) => t.sentiment === 'positive').slice(0, 8);
  const negatives = all.filter((t) => t.sentiment === 'negative').slice(0, 8);
  const trending = last30.slice(0, 8);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
      <TagColumn title="Top positive · all time" tags={positives} sentiment="positive" />
      <TagColumn title="Top negative · all time" tags={negatives} sentiment="negative" />
      <TagColumn title="Trending · last 30d" tags={trending} sentiment="neutral" />
    </div>
  );
}

function TagColumn({
  title, tags, sentiment,
}: {
  title: string;
  tags: ReturnType<typeof tagAggregate>;
  sentiment: TagSentiment;
}) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {tags.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>None in this window.</div>
        )}
        {tags.map((t) => (
          <div
            key={t.tag}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
              borderRadius: 4, background: 'var(--color-background-secondary)',
            }}
          >
            <span
              className="chip"
              style={{
                background: t.sentiment === 'positive' ? 'var(--color-bg-success)'
                  : t.sentiment === 'negative' ? 'var(--color-bg-danger)'
                  : 'var(--color-background-tertiary)',
                color: t.sentiment === 'positive' ? 'var(--color-text-success)'
                  : t.sentiment === 'negative' ? 'var(--color-text-danger)'
                  : 'var(--color-text-secondary)',
                fontSize: 10,
                flexShrink: 0,
              }}
            >
              {t.tag}
            </span>
            <span className="mono" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              {(t.pct * 100).toFixed(0)}%
            </span>
            <span className="mono" style={{ fontSize: 11, fontWeight: 500, width: 20, textAlign: 'right' }}>{t.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────── Tags By Unit ─────────────────

function TagsByUnit({ reviews }: { reviews: Review[] }) {
  const byProp = reviewsByProperty(reviews);
  const propTags = (props: Review[]) => {
    const ids = new Set(props.map((p) => p.id));
    const tags = REVIEW_TAGS.filter((tg) => ids.has(tg.reviewId));
    const positive = Array.from(new Set(tags.filter((tg) => tg.sentiment === 'positive').map((tg) => tg.tag))).slice(0, 5);
    const negative = Array.from(new Set(tags.filter((tg) => tg.sentiment === 'negative').map((tg) => tg.tag))).slice(0, 5);
    return { positive, negative };
  };

  return (
    <div className="card" style={{ padding: 14, overflowX: 'auto' }}>
      <table style={{ width: '100%', minWidth: 720, fontSize: 12, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
            <th style={{ textAlign: 'left', padding: '8px', fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500 }}>Property</th>
            <th style={{ textAlign: 'left', padding: '8px', fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500 }}>Top positive</th>
            <th style={{ textAlign: 'left', padding: '8px', fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500 }}>Top negative</th>
            <th style={{ textAlign: 'right', padding: '8px', fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500 }}>n</th>
          </tr>
        </thead>
        <tbody>
          {Object.keys(byProp).sort().map((code) => {
            const propReviews = byProp[code];
            const t = propTags(propReviews);
            const prop = TASK_PROPERTY_BY_CODE[code];
            return (
              <tr key={code} style={{ borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                  <span className="mono" style={{ fontSize: 11 }}>{code}</span>
                  {prop && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginLeft: 6 }}>{prop.name}</span>}
                </td>
                <td style={{ padding: '8px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {t.positive.map((tag) => (
                      <span key={tag} className="chip" style={{ background: 'var(--color-bg-success)', color: 'var(--color-text-success)', fontSize: 10 }}>{tag}</span>
                    ))}
                  </div>
                </td>
                <td style={{ padding: '8px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {t.negative.map((tag) => (
                      <span key={tag} className="chip" style={{ background: 'var(--color-bg-danger)', color: 'var(--color-text-danger)', fontSize: 10 }}>{tag}</span>
                    ))}
                  </div>
                </td>
                <td className="mono" style={{ padding: '8px', textAlign: 'right', color: 'var(--color-text-tertiary)' }}>{propReviews.length}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ───────────────── Low-Rated Drilldown ─────────────────

function LowRatedDrilldown({ reviews }: { reviews: Review[] }) {
  const lows = lowRatedReviews(reviews);
  const negTags = REVIEW_TAGS.filter((tg) => tg.sentiment === 'negative' && lows.some((rv) => rv.id === tg.reviewId));
  const negTagCounts: Record<string, number> = {};
  for (const tg of negTags) negTagCounts[tg.tag] = (negTagCounts[tg.tag] || 0) + 1;
  const topNeg = Object.entries(negTagCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

  // Low-performers: properties sorted by # of low-rated reviews
  const byProp: Record<string, number> = {};
  for (const rv of lows) byProp[rv.propertyCode] = (byProp[rv.propertyCode] || 0) + 1;
  const lowPerformers = Object.entries(byProp).sort((a, b) => b[1] - a[1]);

  // Word-cloud (simple): top non-stopword words from low-rated review text
  const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'was', 'were', 'are', 'be', 'been', 'being', 'i', 'we', 'us', 'our', 'you', 'they', 'them', 'their', 'it', 'its', 'this', 'that', 'these', 'those', 'as', 'so', 'if', 'when', 'than', 'then', 'just', 'not', 'no', 'do', 'did', 'have', 'had', 'has', 'would', 'could', 'should', 'will', 'can', 'me', 'my', 'one', 'two']);
  const wordCounts: Record<string, number> = {};
  for (const rv of lows) {
    const words = rv.reviewText.toLowerCase().match(/[a-z]+/g) ?? [];
    for (const w of words) {
      if (w.length < 4 || STOPWORDS.has(w)) continue;
      wordCounts[w] = (wordCounts[w] || 0) + 1;
    }
  }
  const cloudWords = Object.entries(wordCounts).sort((a, b) => b[1] - a[1]).slice(0, 25);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Low performers */}
      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          Low performers · ≤3★ count
        </div>
        {lowPerformers.length === 0 && <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>No low-rated reviews.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {lowPerformers.map(([code, count]) => {
            const prop = TASK_PROPERTY_BY_CODE[code];
            return (
              <div key={code} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                <span className="mono" style={{ width: 60 }}>{code}</span>
                <span style={{ flex: 1, color: 'var(--color-text-tertiary)' }}>{prop?.name ?? code}</span>
                <span className="mono" style={{ fontWeight: 500, color: 'var(--color-text-warning)' }}>{count} review{count === 1 ? '' : 's'}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        {/* Top negative tags */}
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Top negative tags
          </div>
          {topNeg.length === 0 && <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>None.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {topNeg.map(([tag, count]) => (
              <div key={tag} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span className="chip" style={{ background: 'var(--color-bg-danger)', color: 'var(--color-text-danger)', fontSize: 10 }}>{tag}</span>
                <span className="mono" style={{ marginLeft: 'auto', fontWeight: 500 }}>{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Word cloud */}
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Relevant keywords
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {cloudWords.map(([word, count]) => (
              <span
                key={word}
                style={{
                  fontSize: 10 + Math.min(8, count * 2),
                  color: count > 2 ? 'var(--color-text-danger)' : 'var(--color-text-secondary)',
                  fontWeight: count > 2 ? 500 : 400,
                }}
              >
                {word}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Raw reviews */}
      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          Raw reviews · {lows.length}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {lows.map((rv) => (
            <div
              key={rv.id}
              style={{
                padding: 10,
                borderRadius: 4,
                background: 'var(--color-background-secondary)',
                borderLeft: `3px solid ${rv.rating <= 2 ? 'var(--color-text-danger)' : 'var(--color-text-warning)'}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span className="mono" style={{ fontSize: 11, fontWeight: 500 }}>{rv.rating.toFixed(1)} ★</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{rv.guestName} · {rv.propertyCode} · {CHANNEL_LABEL[rv.channel]}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{rv.title}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{rv.reviewText}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ───────────────── Avg Rating by Unit ─────────────────

function AvgByUnit({ reviews }: { reviews: Review[] }) {
  const byProp = reviewsByProperty(reviews);
  const rows = Object.entries(byProp)
    .map(([code, propReviews]) => ({
      code,
      name: TASK_PROPERTY_BY_CODE[code]?.name ?? code,
      cohort: PROPERTY_COHORT[code],
      avg: avgRating(propReviews),
      count: propReviews.length,
    }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="card" style={{ padding: 14, overflowX: 'auto' }}>
      <table style={{ width: '100%', minWidth: 540, fontSize: 13, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
            <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500 }}>Property</th>
            <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500 }}>Cohort</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500 }}>Avg</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500 }}>Reviews</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code} style={{ borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
              <td style={{ padding: '8px' }}>
                <span className="mono" style={{ fontSize: 11 }}>{r.code}</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginLeft: 6 }}>{r.name}</span>
              </td>
              <td style={{ padding: '8px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>{COHORT_LABEL[r.cohort]}</td>
              <td className="mono" style={{ padding: '8px', textAlign: 'right', color: r.avg < 4 ? 'var(--color-text-warning)' : 'inherit', fontWeight: 500 }}>
                {r.avg.toFixed(2)}
              </td>
              <td className="mono" style={{ padding: '8px', textAlign: 'right', color: 'var(--color-text-tertiary)' }}>{r.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ───────────────── MoM Grid ─────────────────

function MoMGrid({ reviews }: { reviews: Review[] }) {
  // Build last 12 months (Apr 2026 going back). Find avg rating per month across all reviews.
  const months: { label: string; iso: string }[] = [];
  const today = new Date('2026-04-27');
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push({ label: d.toLocaleDateString('en-GB', { month: 'short' }), iso });
  }
  const monthAvgs = months.map((m) => {
    const monthReviews = reviews.filter((rv) => rv.submittedAt.startsWith(m.iso));
    return { ...m, avg: avgRating(monthReviews), count: monthReviews.length };
  });

  const ttm = avgRating(reviews);

  return (
    <div className="card" style={{ padding: 14, overflowX: 'auto' }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
        Friday Retreats · month-over-month
      </div>
      <table style={{ width: '100%', minWidth: 720, fontSize: 12, borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {monthAvgs.map((m) => (
              <th key={m.iso} style={{ padding: '6px 4px', fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500, textAlign: 'center' }}>
                {m.label}
              </th>
            ))}
            <th style={{ padding: '6px 4px', fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500, textAlign: 'center' }}>TTM</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            {monthAvgs.map((m) => (
              <td
                key={m.iso}
                className="mono"
                style={{
                  padding: '12px 4px', textAlign: 'center', fontSize: 11, fontWeight: 500,
                  color: m.count === 0 ? 'var(--color-text-tertiary)'
                    : m.avg >= 4.5 ? 'var(--color-text-success)'
                    : m.avg >= 4 ? 'var(--color-text-primary)'
                    : 'var(--color-text-warning)',
                  background: m.count === 0 ? 'transparent'
                    : m.avg >= 4.5 ? 'var(--color-bg-success)'
                    : m.avg >= 4 ? 'var(--color-background-secondary)'
                    : 'var(--color-bg-warning)',
                  borderRight: '1px solid var(--color-background-primary)',
                }}
              >
                {m.count === 0 ? '—' : m.avg.toFixed(2)}
              </td>
            ))}
            <td className="mono" style={{ padding: '12px 4px', textAlign: 'center', fontSize: 11, fontWeight: 500, background: 'var(--color-brand-accent-soft)', color: 'var(--color-brand-accent)' }}>
              {ttm.toFixed(2)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
