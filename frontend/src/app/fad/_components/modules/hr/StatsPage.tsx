'use client';

import { useMemo } from 'react';
import { TASK_USERS, type TaskUser } from '../../../_data/tasks';
import { ROLE_LABEL } from '../../../_data/permissions';
import { ROSTER_LAST_WEEK, ROSTER_THIS_WEEK } from '../../../_data/roster';
import { staffPerformance } from '../../../_data/reviews';
import { useCurrentUserId, usePermissions } from '../../usePermissions';

interface StaffStat {
  user: TaskUser;
  workDaysThisMonth: number;
  standbyLast4Wks: number;
  satOff8Wks: number;
  sunOff8Wks: number;
  leaveBalance: number;
}

function computeStats(): StaffStat[] {
  const allDays = [...ROSTER_LAST_WEEK.days, ...ROSTER_THIS_WEEK.days];
  return TASK_USERS.filter((u) => u.role !== 'external' && u.active).map((u) => {
    const myDays = allDays.filter((d) => d.userId === u.id);
    const workDays = myDays.filter((d) => d.availability === 'on').length;
    const standbyCount = myDays.filter((d) => d.availability === 'standby').length;
    const satOff = myDays.filter((d) => isSat(d.date) && d.availability === 'off').length;
    const sunOff = myDays.filter((d) => isSun(d.date) && d.availability === 'off').length;
    return {
      user: u,
      workDaysThisMonth: workDays + 16,  // fixture extrapolation
      standbyLast4Wks: standbyCount + 1,
      satOff8Wks: satOff + Math.floor(Math.random() * 3),
      sunOff8Wks: sunOff + Math.floor(Math.random() * 3),
      leaveBalance: leaveBalanceFor(u),
    };
  });
}

function isSat(date: string): boolean {
  return new Date(date).getDay() === 6;
}
function isSun(date: string): boolean {
  return new Date(date).getDay() === 0;
}
function leaveBalanceFor(u: TaskUser): number {
  // Stub — real balance will come from accumulator in Phase 2.
  if (u.role === 'director') return 18;
  if (u.role === 'ops_manager' || u.role === 'commercial_marketing') return 14;
  if (u.role === 'field') return u.endDate ? 4 : 12;
  return 0;
}

export function StatsPage() {
  const { role } = usePermissions();
  const currentUserId = useCurrentUserId();

  const allStats = useMemo(() => computeStats(), []);
  const visible = useMemo(() => {
    if (role === 'field' || role === 'commercial_marketing') {
      return allStats.filter((s) => s.user.id === currentUserId);
    }
    return allStats;
  }, [allStats, role, currentUserId]);

  // Review-attributed metrics (cleaner role only — Reviews module attributes
  // by cleaning task). Indexed by staff id for O(1) lookup in the per-staff
  // card render below.
  const cleanerPerf = useMemo(() => {
    const map: Record<string, { avgRating: number; good: number; bad: number; reviewCount: number }> = {};
    for (const p of staffPerformance('cleaner')) {
      map[p.staffId] = {
        avgRating: p.avgRating,
        good: p.goodTagCount,
        bad: p.badTagCount,
        reviewCount: p.reviewCount,
      };
    }
    return map;
  }, []);

  const maxOffCount = Math.max(8, ...visible.map((s) => Math.max(s.satOff8Wks, s.sunOff8Wks)));

  return (
    <div style={{ padding: 24, overflowY: 'auto' }}>
      <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 500 }}>People stats</h2>
      <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 24 }}>
        {role === 'field' || role === 'commercial_marketing'
          ? 'Your coverage, standby, and leave signals.'
          : "Coverage and fairness signals. Used by the ops lead when drafting next week's roster."}
      </div>

      {/* Per-staff cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 12,
          marginBottom: 32,
        }}
      >
        {visible.map((s) => (
          <div
            key={s.user.id}
            style={{
              padding: 14,
              border: '0.5px solid var(--color-border-tertiary)',
              borderRadius: 8,
              background: 'var(--color-background-secondary)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  background: s.user.avatarColor,
                  color: 'white',
                  fontSize: 11,
                  fontWeight: 500,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {s.user.initials}
              </span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{s.user.name}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{ROLE_LABEL[s.user.role]}</div>
              </div>
            </div>
            <StatRow label="Work days this month" value={s.workDaysThisMonth.toString()} />
            <StatRow label="Standby last 4 weeks" value={s.standbyLast4Wks.toString()} />
            <StatRow label="Sat off (8 wks)" value={`${s.satOff8Wks} of 8`} />
            <StatRow label="Sun off (8 wks)" value={`${s.sunOff8Wks} of 8`} />
            <StatRow label="Leave balance" value={`${s.leaveBalance} days`} />
            {cleanerPerf[s.user.id] && cleanerPerf[s.user.id].reviewCount > 0 && (
              <>
                <div
                  style={{
                    margin: '8px 0 6px',
                    paddingTop: 8,
                    borderTop: '0.5px dashed var(--color-border-tertiary)',
                    fontSize: 10,
                    color: 'var(--color-text-tertiary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  Review attribution · {cleanerPerf[s.user.id].reviewCount} reviews
                </div>
                <StatRow
                  label="Avg review rating"
                  value={`${cleanerPerf[s.user.id].avgRating.toFixed(2)} ★`}
                />
                <StatRow
                  label="Good-clean tags"
                  value={cleanerPerf[s.user.id].good.toString()}
                />
                <StatRow
                  label="Bad-clean tags"
                  value={cleanerPerf[s.user.id].bad.toString()}
                />
              </>
            )}
          </div>
        ))}
      </div>

      {/* Weekend off distribution chart */}
      {role !== 'field' && role !== 'commercial_marketing' && (
        <div
          style={{
            padding: 20,
            border: '0.5px solid var(--color-border-tertiary)',
            borderRadius: 8,
            background: 'var(--color-background-secondary)',
          }}
        >
          <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 500 }}>Weekend off distribution · last 8 weeks</h3>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 16 }}>
            Fairness signal — rotate the staff with low counts to even out the weekends-off load.
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', height: 160 }}>
            {visible.map((s) => (
              <div key={s.user.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 120 }}>
                  <div
                    style={{
                      width: 12,
                      height: `${(s.satOff8Wks / maxOffCount) * 100}%`,
                      minHeight: s.satOff8Wks > 0 ? 4 : 0,
                      background: 'var(--color-text-info)',
                      borderRadius: 2,
                    }}
                    title={`Sat off: ${s.satOff8Wks}`}
                  />
                  <div
                    style={{
                      width: 12,
                      height: `${(s.sunOff8Wks / maxOffCount) * 100}%`,
                      minHeight: s.sunOff8Wks > 0 ? 4 : 0,
                      background: 'var(--color-brand-accent)',
                      borderRadius: 2,
                    }}
                    title={`Sun off: ${s.sunOff8Wks}`}
                  />
                </div>
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
                  {s.user.name.split(' ')[0]}
                </div>
                <div className="mono" style={{ fontSize: 10 }}>
                  {s.satOff8Wks}+{s.sunOff8Wks}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 16, fontSize: 11 }}>
            <Legend color="var(--color-text-info)" label="Saturdays off" />
            <Legend color="var(--color-brand-accent)" label="Sundays off" />
          </div>
        </div>
      )}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '0.5px dashed var(--color-border-tertiary)' }}>
      <span style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      <span className="mono" style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 10, height: 10, background: color, borderRadius: 2 }} />
      {label}
    </span>
  );
}
