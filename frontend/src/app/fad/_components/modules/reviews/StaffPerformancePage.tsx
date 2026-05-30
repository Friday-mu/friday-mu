'use client';

import { useMemo, useState } from 'react';
import {
  REVIEWS,
  REVIEW_BY_ID,
  STAFF_REVIEW_LINKS,
  staffPerformance,
  tagsForReview,
  avgRating,
  type StaffRole,
  type StaffPerf,
} from '../../../_data/reviews';
import { TASK_USER_BY_ID } from '../../../_data/tasks';
import { fireToast } from '../../Toaster';

type StaffSubView = 'table' | 'mom' | 'raw' | 'rankings';

export function StaffPerformancePage() {
  const [role, setRole] = useState<StaffRole>('cleaner');
  const [view, setView] = useState<StaffSubView>('table');
  const [drillStaffId, setDrillStaffId] = useState<string | null>(null);

  const perf = useMemo(() => staffPerformance(role), [role]);
  const drillPerf = drillStaffId ? perf.find((p) => p.staffId === drillStaffId) : null;

  return (
    <div className="fad-module-body">
      {/* Role tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
        {(['cleaner', 'inspector'] as const).map((r) => (
          <button
            key={r}
            className={'inbox-chip' + (role === r ? ' active' : '')}
            onClick={() => { setRole(r); setDrillStaffId(null); }}
            style={{ borderRadius: '4px 4px 0 0', textTransform: 'capitalize' }}
          >
            {r}s
          </button>
        ))}
      </div>

      {/* View switcher */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {([['table', 'Performance table'], ['mom', 'Month-over-month'], ['raw', 'Raw data'], ['rankings', 'Rankings']] as const).map(([id, label]) => (
          <button
            key={id}
            className={'inbox-chip' + (view === id ? ' active' : '')}
            onClick={() => setView(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'table' && (
        <PerformanceTable perf={perf} role={role} onDrill={setDrillStaffId} />
      )}
      {view === 'mom' && <MoMHeatmap role={role} />}
      {view === 'raw' && <RawData role={role} />}
      {view === 'rankings' && <Rankings perf={perf} role={role} />}

      {drillPerf && view === 'table' && (
        <DrillPanel perf={drillPerf} onClose={() => setDrillStaffId(null)} />
      )}
    </div>
  );
}

// ───────────────── Performance Table ─────────────────

function PerformanceTable({
  perf, role, onDrill,
}: {
  perf: StaffPerf[];
  role: StaffRole;
  onDrill: (staffId: string) => void;
}) {
  return (
    <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
      <table style={{ width: '100%', minWidth: 720, fontSize: 13, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-secondary)' }}>
            <th style={th}>Staff</th>
            <th style={{ ...th, textAlign: 'right' }}>Avg rating</th>
            <th style={{ ...th, textAlign: 'right' }}>Avg cleanliness</th>
            <th style={{ ...th, textAlign: 'right' }}>Reviews</th>
            <th style={{ ...th, textAlign: 'right' }}>Good tags</th>
            <th style={{ ...th, textAlign: 'right' }}>Bad tags</th>
          </tr>
        </thead>
        <tbody>
          {perf.length === 0 && (
            <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 12 }}>
              No {role}s linked to reviews yet.
            </td></tr>
          )}
          {perf.map((p) => {
            const u = TASK_USER_BY_ID[p.staffId];
            return (
              <tr
                key={p.staffId}
                style={{ borderBottom: '0.5px solid var(--color-border-tertiary)', cursor: 'pointer' }}
                onClick={() => onDrill(p.staffId)}
              >
                <td style={{ padding: '12px 8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {u && (
                      <span style={{
                        width: 26, height: 26, borderRadius: 13, background: u.avatarColor,
                        color: 'white', fontSize: 10, fontWeight: 500, textAlign: 'center', lineHeight: '26px',
                      }}>{u.initials}</span>
                    )}
                    <span style={{ fontWeight: 500 }}>{u?.name ?? p.staffId}</span>
                  </div>
                </td>
                <td className="mono" style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 500, color: p.avgRating < 4 ? 'var(--color-text-warning)' : 'inherit' }}>
                  {p.avgRating === 0 ? '—' : p.avgRating.toFixed(2)}
                </td>
                <td className="mono" style={{ padding: '12px 8px', textAlign: 'right' }}>
                  {p.avgCleanliness === 0 ? '—' : p.avgCleanliness.toFixed(2)}
                </td>
                <td className="mono" style={{ padding: '12px 8px', textAlign: 'right', color: 'var(--color-text-tertiary)' }}>{p.reviewCount}</td>
                <td className="mono" style={{ padding: '12px 8px', textAlign: 'right', color: 'var(--color-text-success)' }}>{p.goodTagCount}</td>
                <td className="mono" style={{ padding: '12px 8px', textAlign: 'right', color: p.badTagCount > 0 ? 'var(--color-text-warning)' : 'var(--color-text-tertiary)' }}>{p.badTagCount}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 8px',
  fontSize: 10,
  color: 'var(--color-text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  fontWeight: 500,
};

// ───────────────── Drill Panel ─────────────────

function DrillPanel({ perf, onClose }: { perf: StaffPerf; onClose: () => void }) {
  const u = TASK_USER_BY_ID[perf.staffId];
  const links = STAFF_REVIEW_LINKS.filter((l) => l.staffId === perf.staffId && l.role === perf.role);
  const reviews = links.map((l) => REVIEW_BY_ID[l.reviewId]).filter(Boolean);

  // Tag aggregation
  const tags = reviews.flatMap((rv) => tagsForReview(rv.id));
  const tagCounts: Record<string, { count: number; sentiment: 'positive' | 'negative' | 'neutral' }> = {};
  for (const tg of tags) {
    tagCounts[tg.tag] = tagCounts[tg.tag] || { count: 0, sentiment: tg.sentiment };
    tagCounts[tg.tag].count++;
  }
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1].count - a[1].count).slice(0, 8);

  // Top units
  const unitCounts: Record<string, number> = {};
  for (const rv of reviews) unitCounts[rv.propertyCode] = (unitCounts[rv.propertyCode] || 0) + 1;
  const topUnits = Object.entries(unitCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Monthly avg
  const monthly: Record<string, { count: number; sum: number }> = {};
  for (const rv of reviews) {
    const m = rv.submittedAt.slice(0, 7);
    monthly[m] = monthly[m] || { count: 0, sum: 0 };
    monthly[m].count++;
    monthly[m].sum += rv.rating;
  }
  const monthlyArr = Object.entries(monthly).sort((a, b) => a[0].localeCompare(b[0])).slice(-6);

  return (
    <div className="card" style={{ marginTop: 16, padding: 14, borderLeft: '3px solid var(--color-brand-accent)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        {u && (
          <span style={{
            width: 36, height: 36, borderRadius: 18, background: u.avatarColor,
            color: 'white', fontSize: 13, fontWeight: 500, textAlign: 'center', lineHeight: '36px',
          }}>{u.initials}</span>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{u?.name ?? perf.staffId}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', textTransform: 'capitalize' }}>{perf.role}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="mono" style={{ fontSize: 22, fontWeight: 500 }}>{perf.avgRating.toFixed(2)} ★</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{perf.reviewCount} reviews</div>
        </div>
        <button className="btn ghost sm" onClick={onClose}>Close</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        {/* Top tags */}
        <div>
          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Top tags</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {topTags.map(([tag, info]) => (
              <span
                key={tag}
                className="chip"
                style={{
                  background: info.sentiment === 'positive' ? 'var(--color-bg-success)' : info.sentiment === 'negative' ? 'var(--color-bg-danger)' : 'var(--color-background-secondary)',
                  color: info.sentiment === 'positive' ? 'var(--color-text-success)' : info.sentiment === 'negative' ? 'var(--color-text-danger)' : 'var(--color-text-secondary)',
                  fontSize: 10,
                }}
              >
                {tag} <span style={{ opacity: 0.6, marginLeft: 2 }}>{info.count}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Top units */}
        <div>
          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Top units</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            {topUnits.map(([code, count]) => (
              <div key={code} style={{ display: 'flex' }}>
                <span className="mono">{code}</span>
                <span className="mono" style={{ marginLeft: 'auto', color: 'var(--color-text-tertiary)' }}>{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Monthly trend */}
        <div>
          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Monthly trend</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 60 }}>
            {monthlyArr.map(([m, v]) => {
              const avg = v.sum / v.count;
              return (
                <div key={m} title={`${m} · ${avg.toFixed(2)} (${v.count})`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div
                    style={{
                      width: '100%', flex: 1, alignSelf: 'flex-end',
                      height: `${(avg / 5) * 100}%`,
                      background: avg >= 4.5 ? 'var(--color-text-success)' : avg >= 4 ? 'var(--color-brand-accent)' : 'var(--color-text-warning)',
                      borderRadius: '2px 2px 0 0',
                    }}
                  />
                  <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{m.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent reviews */}
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Recent reviews</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {reviews.slice(0, 4).map((rv) => (
            <div key={rv.id} style={{ padding: 8, background: 'var(--color-background-secondary)', borderRadius: 4, fontSize: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <span className="mono" style={{ fontWeight: 500 }}>{rv.rating.toFixed(1)} ★</span>
                <span style={{ color: 'var(--color-text-tertiary)' }}>{rv.guestName} · {rv.propertyCode}</span>
              </div>
              <div style={{ color: 'var(--color-text-secondary)' }}>{rv.title}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ───────────────── MoM Heatmap ─────────────────

function MoMHeatmap({ role }: { role: StaffRole }) {
  const links = STAFF_REVIEW_LINKS.filter((l) => l.role === role);
  const staffIds = Array.from(new Set(links.map((l) => l.staffId)));
  const months: string[] = [];
  const today = new Date('2026-04-27');
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const totalSubreviews = links.length;
  const allReviews = links.map((l) => REVIEW_BY_ID[l.reviewId]).filter(Boolean);
  const totalAvg = avgRating(allReviews);

  return (
    <>
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div className="kpi"><div className="kpi-label">Total {role} subreviews</div><div className="kpi-value">{totalSubreviews}</div></div>
        <div className="kpi"><div className="kpi-label">Avg cleanliness score</div><div className="kpi-value">{totalAvg.toFixed(2)}</div></div>
      </div>
      <div className="card" style={{ padding: 14, overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 540, fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, position: 'sticky', left: 0, background: 'var(--color-background-secondary)' }}>Staff</th>
              {months.map((m) => <th key={m} style={{ ...th, textAlign: 'center' }}>{m.slice(5)}</th>)}
            </tr>
          </thead>
          <tbody>
            {staffIds.map((sid) => {
              const u = TASK_USER_BY_ID[sid];
              return (
                <tr key={sid} style={{ borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                  <td style={{ padding: '8px', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: 'var(--color-background-primary)' }}>
                    {u?.name ?? sid}
                  </td>
                  {months.map((m) => {
                    const cell = links.filter((l) => l.staffId === sid && l.cleaningDate.startsWith(m))
                      .map((l) => REVIEW_BY_ID[l.reviewId])
                      .filter(Boolean);
                    const avg = avgRating(cell);
                    return (
                      <td
                        key={m}
                        className="mono"
                        style={{
                          padding: '12px 4px', textAlign: 'center', fontSize: 11, fontWeight: 500,
                          background: cell.length === 0 ? 'transparent'
                            : avg >= 4.5 ? 'var(--color-bg-success)'
                            : avg >= 4 ? 'var(--color-background-secondary)'
                            : 'var(--color-bg-warning)',
                          color: cell.length === 0 ? 'var(--color-text-tertiary)'
                            : avg >= 4.5 ? 'var(--color-text-success)'
                            : avg >= 4 ? 'inherit'
                            : 'var(--color-text-warning)',
                        }}
                        title={cell.length === 0 ? 'No reviews' : `${avg.toFixed(2)} (${cell.length})`}
                      >
                        {cell.length === 0 ? '—' : avg.toFixed(1)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ───────────────── Raw Data table ─────────────────

function RawData({ role }: { role: StaffRole }) {
  const links = STAFF_REVIEW_LINKS.filter((l) => l.role === role).sort((a, b) => b.cleaningDate.localeCompare(a.cleaningDate));

  return (
    <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
      <div style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{links.length} rows</div>
        <button
          className="btn ghost sm"
          style={{ marginLeft: 'auto' }}
          onClick={() => fireToast('CSV export · stub for now')}
        >
          Export CSV
        </button>
      </div>
      <table style={{ width: '100%', minWidth: 760, fontSize: 12, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-secondary)' }}>
            <th style={th}>{role === 'cleaner' ? 'Cleaner' : 'Inspector'}</th>
            <th style={th}>Reservation</th>
            <th style={th}>Breezeway task</th>
            <th style={th}>Cleaning date</th>
            <th style={{ ...th, textAlign: 'right' }}>Cleanliness</th>
            <th style={{ ...th, textAlign: 'right' }}>Review</th>
            <th style={th}>Description</th>
          </tr>
        </thead>
        <tbody>
          {links.map((l) => {
            const rv = REVIEW_BY_ID[l.reviewId];
            const u = TASK_USER_BY_ID[l.staffId];
            return (
              <tr key={l.staffId + l.breezewayTaskId} style={{ borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>{u?.name ?? l.staffId}</td>
                <td style={{ padding: '8px' }}>
                  <button
                    className="mono"
                    style={{ background: 'transparent', border: 0, color: 'var(--color-brand-accent)', cursor: 'pointer', fontSize: 11 }}
                    onClick={() => fireToast(`Open reservation ${rv?.reservationId ?? '—'} · stub`)}
                  >
                    {rv?.reservationId ?? '—'}
                  </button>
                </td>
                <td style={{ padding: '8px' }}>
                  <button
                    className="mono"
                    style={{ background: 'transparent', border: 0, color: 'var(--color-brand-accent)', cursor: 'pointer', fontSize: 11 }}
                    onClick={() => fireToast(`Open Breezeway task ${l.breezewayTaskId} · stub`)}
                  >
                    {l.breezewayTaskId}
                  </button>
                </td>
                <td className="mono" style={{ padding: '8px', color: 'var(--color-text-tertiary)' }}>{l.cleaningDate}</td>
                <td className="mono" style={{ padding: '8px', textAlign: 'right' }}>{rv?.subRatings.cleanliness.toFixed(1) ?? '—'}</td>
                <td className="mono" style={{ padding: '8px', textAlign: 'right', fontWeight: 500 }}>{rv?.rating.toFixed(1) ?? '—'}</td>
                <td style={{ padding: '8px', maxWidth: 320, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {rv?.title}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ───────────────── Rankings ─────────────────

function Rankings({ perf, role }: { perf: StaffPerf[]; role: StaffRole }) {
  const sorted = [...perf].sort((a, b) => b.avgRating - a.avgRating);
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
        {role}s leaderboard
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sorted.map((p, i) => {
          const u = TASK_USER_BY_ID[p.staffId];
          return (
            <div
              key={p.staffId}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: 10,
                background: i === 0 ? 'var(--color-brand-accent-softer)' : 'var(--color-background-secondary)',
                borderRadius: 4,
              }}
            >
              <span className="mono" style={{ fontSize: 14, fontWeight: 500, width: 24, textAlign: 'right' }}>{i + 1}</span>
              {u && (
                <span style={{
                  width: 26, height: 26, borderRadius: 13, background: u.avatarColor,
                  color: 'white', fontSize: 10, fontWeight: 500, textAlign: 'center', lineHeight: '26px',
                }}>{u.initials}</span>
              )}
              <span style={{ flex: 1, fontWeight: 500 }}>{u?.name ?? p.staffId}</span>
              <span className="mono" style={{ fontSize: 14, fontWeight: 500 }}>{p.avgRating.toFixed(2)} ★</span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{p.reviewCount} reviews</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
