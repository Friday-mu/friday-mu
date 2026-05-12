'use client';

import { useMemo, useState } from 'react';
import {
  REVIEWS,
  REVIEW_BY_ID,
  CHANNEL_LABEL,
  COHORT_LABEL,
  tagsForReview,
  staffLinksForReview,
  type Review,
  type ReviewChannel,
  type Cohort,
  type ReviewTag,
} from '../../../_data/reviews';
import { useLiveReviews } from '../../../_data/reviewsClient';
import { TASK_PROPERTY_BY_CODE, TASK_USER_BY_ID } from '../../../_data/tasks';
import { RESERVATION_BY_ID } from '../../../_data/reservations';
import { CreateTaskDrawer } from '../operations/CreateTaskDrawer';
import { fireToast } from '../../Toaster';
import { IconPlus } from '../../icons';
import { PropertyChip } from '../properties/PropertyQuickView';

interface Props {
  onMutated: () => void;
}

type SortKey = 'newest' | 'oldest' | 'lowest' | 'highest';

export function AllReviewsPage({ onMutated }: Props) {
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState<ReviewChannel | 'all'>('all');
  const [cohortFilter, setCohortFilter] = useState<Cohort | 'all'>('all');
  const [ratingFilter, setRatingFilter] = useState<'all' | '5' | '4' | '3' | '≤2'>('all');
  const [hasReplyFilter, setHasReplyFilter] = useState<'all' | 'yes' | 'no'>('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [taskFromReview, setTaskFromReview] = useState<Review | null>(null);

  // Live data from Guesty via /api/reviews/list. Fallback to fixture REVIEWS
  // during initial load OR on backend failure — keeps the page rendered.
  const { reviews: liveReviews, loading: liveLoading, error: liveError } = useLiveReviews();
  const reviewSource = liveReviews ?? REVIEWS;

  const filtered = useMemo(() => {
    let list = [...reviewSource];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (rv) => rv.guestName.toLowerCase().includes(q)
          || rv.title.toLowerCase().includes(q)
          || rv.reviewText.toLowerCase().includes(q)
          || rv.propertyCode.toLowerCase().includes(q),
      );
    }
    if (channelFilter !== 'all') list = list.filter((rv) => rv.channel === channelFilter);
    if (cohortFilter !== 'all') list = list.filter((rv) => rv.cohort === cohortFilter);
    if (ratingFilter === '5') list = list.filter((rv) => rv.rating === 5);
    else if (ratingFilter === '4') list = list.filter((rv) => Math.round(rv.rating) === 4);
    else if (ratingFilter === '3') list = list.filter((rv) => Math.round(rv.rating) === 3);
    else if (ratingFilter === '≤2') list = list.filter((rv) => rv.rating <= 2);
    if (hasReplyFilter === 'yes') list = list.filter((rv) => rv.replyStatus === 'sent');
    else if (hasReplyFilter === 'no') list = list.filter((rv) => rv.replyStatus !== 'sent');

    list.sort((a, b) => {
      if (sort === 'newest') return b.submittedAt.localeCompare(a.submittedAt);
      if (sort === 'oldest') return a.submittedAt.localeCompare(b.submittedAt);
      if (sort === 'lowest') return a.rating - b.rating;
      return b.rating - a.rating;
    });
    return list;
  }, [search, channelFilter, cohortFilter, ratingFilter, hasReplyFilter, sort, reviewSource]);

  const selected = filtered.find((rv) => rv.id === selectedId) ?? filtered[0];

  return (
    <>
      <div className={'fad-split-pane' + (detailOpen ? ' detail-open' : '')}>
        {/* Left list */}
        <div className="fad-split-list" style={{ width: 420, borderRight: '0.5px solid var(--color-border-tertiary)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 12, borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
            <input
              type="search"
              placeholder="Search guest, title, body, property…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', padding: '6px 10px', fontSize: 13, marginBottom: 8 }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
              <FilterChip active={ratingFilter === 'all'} onClick={() => setRatingFilter('all')}>All ratings</FilterChip>
              <FilterChip active={ratingFilter === '5'} onClick={() => setRatingFilter('5')}>5★</FilterChip>
              <FilterChip active={ratingFilter === '4'} onClick={() => setRatingFilter('4')}>4★</FilterChip>
              <FilterChip active={ratingFilter === '3'} onClick={() => setRatingFilter('3')}>3★</FilterChip>
              <FilterChip active={ratingFilter === '≤2'} onClick={() => setRatingFilter('≤2')}>≤2★</FilterChip>
            </div>
            <div style={{ display: 'flex', gap: 6, fontSize: 12, marginBottom: 6 }}>
              <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value as never)} style={{ flex: 1, padding: '4px 6px', fontSize: 12 }}>
                <option value="all">All channels</option>
                {(['airbnb', 'booking', 'vrbo', 'google', 'direct'] as const).map((c) => (
                  <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>
                ))}
              </select>
              <select value={cohortFilter} onChange={(e) => setCohortFilter(e.target.value as never)} style={{ flex: 1, padding: '4px 6px', fontSize: 12 }}>
                <option value="all">All cohorts</option>
                {(['flic_en_flac', 'grand_baie', 'pereybere', 'bel_ombre'] as const).map((c) => (
                  <option key={c} value={c}>{COHORT_LABEL[c]}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 6, fontSize: 12 }}>
              <select value={hasReplyFilter} onChange={(e) => setHasReplyFilter(e.target.value as never)} style={{ flex: 1, padding: '4px 6px', fontSize: 12 }}>
                <option value="all">All</option>
                <option value="yes">Replied</option>
                <option value="no">Needs reply</option>
              </select>
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} style={{ flex: 1, padding: '4px 6px', fontSize: 12 }}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="lowest">Lowest rated</option>
                <option value="highest">Highest rated</option>
              </select>
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              {filtered.length} of {reviewSource.length} reviews
              {liveLoading && <span style={{ marginLeft: 6, opacity: 0.7 }}>· loading…</span>}
              {liveError && (
                <span style={{ marginLeft: 6, color: 'var(--color-text-warning)' }} title={liveError}>
                  · using fixtures (backend unreachable)
                </span>
              )}
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filtered.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                No reviews match these filters.
              </div>
            )}
            {filtered.map((rv) => {
              const isSelected = selected?.id === rv.id;
              return (
                <button
                  key={rv.id}
                  onClick={() => { setSelectedId(rv.id); setDetailOpen(true); }}
                  style={{
                    display: 'block', width: '100%', padding: '10px 14px',
                    textAlign: 'left', border: 0,
                    background: isSelected ? 'var(--color-background-tertiary)' : 'transparent',
                    cursor: 'pointer',
                    borderBottom: '0.5px solid var(--color-border-tertiary)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span
                      style={{
                        width: 22, height: 22, borderRadius: 11, background: 'var(--color-brand-accent-soft)',
                        color: 'var(--color-brand-accent)', fontSize: 10, fontWeight: 500,
                        textAlign: 'center', lineHeight: '22px', flexShrink: 0,
                      }}
                    >
                      {rv.guestInitials}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {rv.guestName}
                    </span>
                    <span className="mono" style={{ fontSize: 12, fontWeight: 500, flexShrink: 0 }}>
                      {rv.rating.toFixed(1)} ★
                    </span>
                  </div>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>{rv.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span>{rv.propertyCode}</span>
                    <span>·</span>
                    <span>{CHANNEL_LABEL[rv.channel]}</span>
                    <span>·</span>
                    <span>{relativeDate(rv.submittedAt)}</span>
                    {rv.replyStatus !== 'sent' && (
                      <>
                        <span>·</span>
                        <span style={{ color: rv.urgent ? 'var(--color-text-danger)' : 'var(--color-text-warning)' }}>
                          needs reply
                        </span>
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right detail */}
        <div className="fad-split-detail" style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
          <button type="button" className="btn ghost sm fad-split-back" onClick={() => setDetailOpen(false)}>
            ← Back to reviews
          </button>
          {selected ? (
            <ReviewDetail
              rv={selected}
              onCreateTask={() => setTaskFromReview(selected)}
              onMutated={onMutated}
            />
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', marginTop: 60 }}>
              Select a review to view details.
            </div>
          )}
        </div>
      </div>

      {/* Create-task drawer prefilled from review */}
      {taskFromReview && (
        <CreateTaskDrawer
          key={taskFromReview.id}
          open={true}
          onClose={() => setTaskFromReview(null)}
          onCreated={() => {
            setTaskFromReview(null);
            onMutated();
          }}
          prefill={{
            title: `Follow up: ${taskFromReview.title}`,
            description: `Source review (${taskFromReview.rating}★ from ${taskFromReview.guestName} · ${taskFromReview.propertyCode}):\n\n"${taskFromReview.reviewText}"`,
            propertyCode: taskFromReview.propertyCode,
            source: 'review',
          }}
        />
      )}
    </>
  );
}

// ───────────────── Review detail ─────────────────

function ReviewDetail({
  rv,
  onCreateTask,
  onMutated,
}: {
  rv: Review;
  onCreateTask: () => void;
  onMutated: () => void;
}) {
  const tags = tagsForReview(rv.id);
  const staffLinks = staffLinksForReview(rv.id);
  const reservation = rv.reservationId ? RESERVATION_BY_ID[rv.reservationId] : undefined;
  const property = TASK_PROPERTY_BY_CODE[rv.propertyCode];

  const [replyDraft, setReplyDraft] = useState(rv.replyText ?? '');
  const [noteDraft, setNoteDraft] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);

  const sendReply = () => {
    if (!replyDraft.trim()) return;
    rv.replyText = replyDraft;
    rv.replyStatus = 'sent';
    rv.replySentAt = new Date().toISOString();
    fireToast(`Reply sent · would push to ${CHANNEL_LABEL[rv.channel]}`);
    onMutated();
  };

  const postNote = () => {
    if (!noteDraft.trim()) return;
    rv.privateFeedback = (rv.privateFeedback ? rv.privateFeedback + '\n\n' : '') + noteDraft;
    setNoteDraft('');
    setNoteOpen(false);
    fireToast('Internal note added to review');
    onMutated();
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <span
          style={{
            width: 40, height: 40, borderRadius: 20,
            background: 'var(--color-brand-accent-soft)', color: 'var(--color-brand-accent)',
            fontSize: 14, fontWeight: 500, textAlign: 'center', lineHeight: '40px', flexShrink: 0,
          }}
        >
          {rv.guestInitials}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 2 }}>{rv.guestName}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <PropertyChip code={rv.propertyCode}>
              {property?.name ?? rv.propertyCode} · {rv.propertyCode}
            </PropertyChip>
            <span>·</span>
            <span>{COHORT_LABEL[rv.cohort]}</span>
            <span>·</span>
            <span>{CHANNEL_LABEL[rv.channel]}</span>
            <span>·</span>
            <span>{relativeDate(rv.submittedAt)}</span>
          </div>
        </div>
        <span className="mono" style={{ fontSize: 18, fontWeight: 500 }}>
          {rv.rating.toFixed(1)} ★
        </span>
      </div>

      {/* Title + body */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>{rv.title}</div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>{rv.reviewText}</div>
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {tags.map((tg) => (
            <TagChip key={tg.id} tag={tg} />
          ))}
        </div>
      )}

      {/* Sub-ratings */}
      <div className="card" style={{ padding: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
          Sub-ratings
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
          {(['accuracy', 'checkin', 'cleanliness', 'communication', 'location', 'value'] as const).map((k) => (
            <div key={k} style={{ fontSize: 11 }}>
              <div style={{ color: 'var(--color-text-tertiary)', textTransform: 'capitalize', marginBottom: 2 }}>{k}</div>
              <div className="mono" style={{ fontSize: 13, fontWeight: 500 }}>{rv.subRatings[k].toFixed(1)} ★</div>
            </div>
          ))}
        </div>
      </div>

      {/* Reservation chip */}
      {reservation && (
        <button
          type="button"
          className="card"
          onClick={() => window.location.assign(`/fad?m=reservations&sub=overview&rsv=${reservation.id}`)}
          title="Open reservation detail"
          style={{
            padding: 10,
            marginBottom: 12,
            width: '100%',
            textAlign: 'left',
            cursor: 'pointer',
            font: 'inherit',
            color: 'inherit',
          }}
        >
          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Linked stay
          </div>
          <div style={{ fontSize: 12 }}>
            🛏 <span className="mono">{reservation.id}</span> · {reservation.guestName} · {reservation.nights} nts
          </div>
        </button>
      )}

      {/* Staff attribution */}
      {staffLinks.length > 0 && (
        <div className="card" style={{ padding: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Staff attribution
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {staffLinks.map((sl) => {
              const u = TASK_USER_BY_ID[sl.staffId];
              return (
                <button
                  key={sl.staffId + sl.role}
                  onClick={() => fireToast(`Open HR profile: ${u?.name} (stub — wires when HR Stats lands)`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: 6,
                    background: 'transparent', border: '0.5px solid var(--color-border-tertiary)',
                    borderRadius: 4, cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  {u && (
                    <span
                      style={{
                        width: 22, height: 22, borderRadius: 11, background: u.avatarColor,
                        color: 'white', fontSize: 10, fontWeight: 500, textAlign: 'center', lineHeight: '22px',
                      }}
                    >
                      {u.initials}
                    </span>
                  )}
                  <span style={{ fontSize: 12, flex: 1 }}>
                    {u?.name ?? sl.staffId} <span style={{ color: 'var(--color-text-tertiary)' }}>· {sl.role}</span>
                  </span>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                    {sl.breezewayTaskId}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Private feedback */}
      {rv.privateFeedback && (
        <div className="card" style={{ padding: 10, marginBottom: 12, background: 'var(--color-bg-warning)', borderLeft: '3px solid var(--color-text-warning)' }}>
          <div style={{ fontSize: 10, color: 'var(--color-text-warning)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, fontWeight: 500 }}>
            🔒 Private feedback (team only)
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{rv.privateFeedback}</div>
        </div>
      )}

      {/* Reply composer */}
      <div className="card" style={{ padding: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {rv.replyStatus === 'sent' ? 'Reply sent' : 'Reply'}
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--color-text-tertiary)' }}>
            Pushes to {CHANNEL_LABEL[rv.channel]}
          </span>
        </div>
        <textarea
          value={replyDraft}
          onChange={(e) => setReplyDraft(e.target.value)}
          placeholder={`Reply to ${rv.guestName}…`}
          style={{ width: '100%', minHeight: 80, fontSize: 12, fontFamily: 'inherit', padding: 8 }}
        />
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>
          <button
            className="btn ghost sm"
            onClick={() => fireToast('AI draft polished · stub for now')}
          >
            ✨ Polish with Friday
          </button>
          <button
            className="btn primary sm"
            onClick={sendReply}
            disabled={!replyDraft.trim() || replyDraft === rv.replyText}
          >
            {rv.replyStatus === 'sent' ? 'Update reply' : 'Send reply'}
          </button>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button className="btn sm" onClick={onCreateTask}>
          <IconPlus size={11} /> Create task from review
        </button>
        <button
          className="btn ghost sm"
          onClick={() => setNoteOpen((v) => !v)}
        >
          + Internal note
        </button>
        <button
          className="btn ghost sm"
          onClick={() => fireToast(`Channel link: ${rv.channelUrl ?? 'not available'}`)}
        >
          Open on {CHANNEL_LABEL[rv.channel]}
        </button>
      </div>

      {noteOpen && (
        <div style={{ marginTop: 10, padding: 10, background: 'var(--color-bg-warning)', borderRadius: 6, borderLeft: '3px solid var(--color-text-warning)' }}>
          <div style={{ fontSize: 10, color: 'var(--color-text-warning)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, fontWeight: 500 }}>
            🔒 Add internal note
          </div>
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="What does the team need to know?"
            style={{ width: '100%', minHeight: 50, fontSize: 12, fontFamily: 'inherit', padding: 6 }}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>
            <button className="btn ghost sm" onClick={() => { setNoteOpen(false); setNoteDraft(''); }}>Cancel</button>
            <button className="btn primary sm" onClick={postNote} disabled={!noteDraft.trim()}>Post note</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────── Helpers ─────────────────

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className={'inbox-chip' + (active ? ' active' : '')} onClick={onClick}>
      {children}
    </button>
  );
}

function TagChip({ tag }: { tag: ReviewTag }) {
  const isPos = tag.sentiment === 'positive';
  const isNeg = tag.sentiment === 'negative';
  return (
    <span
      className="chip"
      style={{
        background: isPos ? 'var(--color-bg-success)' : isNeg ? 'var(--color-bg-danger)' : 'var(--color-background-secondary)',
        color: isPos ? 'var(--color-text-success)' : isNeg ? 'var(--color-text-danger)' : 'var(--color-text-secondary)',
        fontSize: 10,
        flexShrink: 0,
      }}
    >
      {tag.tag}
    </span>
  );
}

function relativeDate(iso: string): string {
  const days = Math.round((new Date('2026-04-27').getTime() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.round(days / 7)}w ago`;
  return new Date(iso).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}
