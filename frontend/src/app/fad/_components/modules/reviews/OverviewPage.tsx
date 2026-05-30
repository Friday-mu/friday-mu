'use client';

import { useMemo } from 'react';
import {
  REVIEWS,
  REVIEW_ANOMALIES,
  SUGGESTED_ACTIONS,
  CHANNEL_LABEL,
  COHORT_LABEL,
  avgRating,
  ratingDistribution,
  reviewsInWindow,
  reviewsByCohort,
  reviewsByChannel,
  unrepliedReviews,
  type Cohort,
  type ReviewChannel,
} from '../../../_data/reviews';
import { useLiveReviews } from '../../../_data/reviewsClient';
import { liveOnlyMode } from '../../../_data/demoMode';
import { TASK_PROPERTY_BY_CODE } from '../../../_data/tasks';
import { createTask } from '../../../_data/breezeway';
import { useCurrentUserId } from '../../usePermissions';
import { fireToast } from '../../Toaster';
import { IconAI, IconSparkle } from '../../icons';

interface Props {
  onNavigate: (subPage: string) => void;
}

export function OverviewPage({ onNavigate }: Props) {
  const currentUserId = useCurrentUserId();
  const liveOnly = liveOnlyMode();

  const { reviews: liveReviews, loading: liveLoading, error: liveError } = useLiveReviews();
  const reviewSource = liveReviews ?? (liveOnly ? [] : REVIEWS);

  const last30 = useMemo(() => reviewsInWindow(30, reviewSource), [reviewSource]);
  const prior30 = useMemo(
    () => reviewSource.filter((rv) => {
      const days = Math.round(
        (new Date('2026-04-27').getTime() - new Date(rv.submittedAt).getTime()) /
          (24 * 60 * 60 * 1000),
      );
      return days > 30 && days <= 60;
    }),
    [reviewSource],
  );

  const avg30 = avgRating(last30);
  const avgPrior = avgRating(prior30);
  const yoyDelta = avg30 - avgPrior;

  const dist = ratingDistribution(last30);
  const distMax = Math.max(...Object.values(dist));

  const unreplied = unrepliedReviews(reviewSource);
  const replyRate = last30.length === 0 ? 0
    : (last30.filter((r) => r.replyStatus === 'sent').length / last30.length) * 100;

  const byChannel = reviewsByChannel(reviewSource);
  const byCohort = reviewsByCohort(reviewSource);

  const acceptSuggestedTask = async (sa: typeof SUGGESTED_ACTIONS[number]) => {
    await createTask({
      title: sa.taskTitle,
      description: sa.taskDescription,
      propertyCode: sa.reviewId
        ? (reviewSource.find((r) => r.id === sa.reviewId)?.propertyCode ?? 'OFFICE')
        : 'OFFICE',
      department: sa.department,
      subdepartment: sa.subdepartment as never,
      priority: sa.priority,
      source: 'review',
      assigneeIds: [],
      requesterId: currentUserId,
      dueDate: '2026-04-30',
    });
    fireToast(`Task created from review · "${sa.taskTitle.slice(0, 40)}…"`);
  };

  return (
    <div className="fad-module-body">
      {/* KPI cards */}
      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Avg rating · 30d</div>
          <div className="kpi-value">{avg30.toFixed(2)}</div>
          <div className="kpi-sub" style={{ color: yoyDelta >= 0 ? 'var(--color-text-success)' : 'var(--color-text-danger)' }}>
            {yoyDelta >= 0 ? '+' : ''}{yoyDelta.toFixed(2)} vs prior 30d
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Reviews · 30d</div>
          <div className="kpi-value">{last30.length}</div>
          <div className="kpi-sub">{prior30.length} prior period</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Reply rate</div>
          <div className="kpi-value">{Math.round(replyRate)}%</div>
          <div className="kpi-sub">target ≥90%</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Unreplied</div>
          <div className="kpi-value" style={{ color: unreplied.length > 0 ? 'var(--color-text-warning)' : 'inherit' }}>
            {unreplied.length}
          </div>
          <div className="kpi-sub">{unreplied.filter((r) => r.urgent).length} urgent</div>
        </div>
      </div>
      {liveLoading && (
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          Loading live Guesty reviews…
        </div>
      )}
      {liveError && (
        <div role="alert" style={{ marginTop: 12, padding: '8px 10px', borderRadius: 6, background: 'var(--color-bg-danger)', color: 'var(--color-text-danger)', fontSize: 12 }}>
          Live reviews failed to load: {liveError}
        </div>
      )}

      {/* Anomaly callouts strip */}
      {!liveOnly && REVIEW_ANOMALIES.length > 0 && (
        <div className="card" style={{ marginTop: 16, padding: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconAI size={11} /> Anomaly callouts
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {REVIEW_ANOMALIES.map((a) => (
              <div
                key={a.id}
                style={{
                  padding: 10,
                  borderRadius: 6,
                  borderLeft: `3px solid ${
                    a.severity === 'danger' ? 'var(--color-text-danger)'
                    : a.severity === 'warn' ? 'var(--color-text-warning)'
                    : 'var(--color-brand-accent)'
                  }`,
                  background: a.severity === 'danger' ? 'var(--color-bg-danger)'
                    : a.severity === 'warn' ? 'var(--color-bg-warning)'
                    : 'var(--color-brand-accent-softer)',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{a.title}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{a.body}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Star distribution */}
      <div className="card" style={{ marginTop: 16, padding: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          Star distribution · 30d
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {([5, 4, 3, 2, 1] as const).map((stars) => (
            <div key={stars} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
              <span className="mono" style={{ width: 28 }}>{stars} ★</span>
              <div style={{ flex: 1, height: 8, background: 'var(--color-background-secondary)', borderRadius: 4, overflow: 'hidden' }}>
                <div
                  style={{
                    width: distMax === 0 ? 0 : `${(dist[stars] / distMax) * 100}%`,
                    height: '100%',
                    background: stars >= 4 ? 'var(--color-text-success)'
                      : stars === 3 ? 'var(--color-text-warning)'
                      : 'var(--color-text-danger)',
                  }}
                />
              </div>
              <span className="mono" style={{ width: 32, textAlign: 'right', color: 'var(--color-text-tertiary)' }}>{dist[stars]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* AI Suggested Actions */}
      {!liveOnly && SUGGESTED_ACTIONS.length > 0 && (
        <div className="card" style={{ marginTop: 16, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
              <IconSparkle size={11} /> Suggested actions
            </div>
            <button
              className="btn ghost sm"
              style={{ marginLeft: 'auto', fontSize: 11 }}
              onClick={() => fireToast('Power Through — would batch-create all suggested tasks')}
            >
              Power through all ({SUGGESTED_ACTIONS.length})
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
            {SUGGESTED_ACTIONS.map((sa) => {
              const review = reviewSource.find((r) => r.id === sa.reviewId);
              return (
                <div
                  key={sa.id}
                  style={{
                    padding: 12,
                    background: 'var(--color-background-primary)',
                    border: '0.5px solid var(--color-border-tertiary)',
                    borderRadius: 6,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  {review && (
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontStyle: 'italic', borderLeft: '2px solid var(--color-border-tertiary)', paddingLeft: 8 }}>
                      "{review.reviewText.slice(0, 100)}{review.reviewText.length > 100 ? '…' : ''}"
                      <div style={{ marginTop: 4, fontStyle: 'normal' }}>
                        — {review.guestName} · {review.propertyCode} · {review.rating}★
                      </div>
                    </div>
                  )}
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{sa.taskTitle}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{sa.taskDescription}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
                    <span className="chip" style={{ background: 'var(--color-bg-info)', color: 'var(--color-text-info)' }}>{sa.priority}</span>
                    <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>{sa.department} · {sa.subdepartment}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    <button className="btn primary sm" onClick={() => acceptSuggestedTask(sa)}>Create task</button>
                    <button
                      className="btn ghost sm"
                      onClick={() => fireToast(`Dismissed · ${sa.taskTitle.slice(0, 30)}…`)}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Avg rating by channel */}
      <div className="kpi-grid" style={{ marginTop: 16 }}>
        {(Object.keys(byChannel) as ReviewChannel[]).map((ch) => {
          const reviews = byChannel[ch];
          if (reviews.length === 0) return null;
          return (
            <div key={ch} className="kpi">
              <div className="kpi-label">{CHANNEL_LABEL[ch]}</div>
              <div className="kpi-value">{avgRating(reviews).toFixed(2)}</div>
              <div className="kpi-sub">{reviews.length} reviews</div>
            </div>
          );
        })}
      </div>

      {/* Avg rating by cohort */}
      <div className="card" style={{ marginTop: 16, padding: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          Average rating by cohort
        </div>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
              <th style={{ textAlign: 'left', padding: '6px 0', fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500 }}>Cohort</th>
              <th style={{ textAlign: 'right', padding: '6px 0', fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500 }}>Avg</th>
              <th style={{ textAlign: 'right', padding: '6px 0', fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500 }}>Reviews</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(byCohort) as Cohort[]).map((c) => {
              const reviews = byCohort[c];
              return (
                <tr key={c} style={{ borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                  <td style={{ padding: '8px 0' }}>{COHORT_LABEL[c]}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{reviews.length === 0 ? '—' : avgRating(reviews).toFixed(2)}</td>
                  <td className="mono" style={{ textAlign: 'right', color: 'var(--color-text-tertiary)' }}>{reviews.length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Latest reviews ticker */}
      <div className="card" style={{ marginTop: 16, padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Latest reviews
          </div>
          <button
            className="btn ghost sm"
            style={{ marginLeft: 'auto', fontSize: 11 }}
            onClick={() => onNavigate('all')}
          >
            See all →
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {reviewSource.slice(0, 5).map((rv) => {
            const prop = TASK_PROPERTY_BY_CODE[rv.propertyCode];
            return (
              <div
                key={rv.id}
                style={{
                  padding: 10,
                  borderRadius: 4,
                  background: 'var(--color-background-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                }}
                onClick={() => onNavigate('all')}
              >
                <span
                  style={{
                    width: 28, height: 28, borderRadius: 14, background: 'var(--color-brand-accent-soft)',
                    color: 'var(--color-brand-accent)', fontSize: 11, fontWeight: 500, textAlign: 'center', lineHeight: '28px',
                    flexShrink: 0,
                  }}
                >
                  {rv.guestInitials}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {rv.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                    {rv.guestName} · {prop?.name ?? rv.propertyCode} · {CHANNEL_LABEL[rv.channel]}
                  </div>
                </div>
                <span className="mono" style={{ fontSize: 12, fontWeight: 500, flexShrink: 0 }}>
                  {rv.rating.toFixed(1)} ★
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
