'use client';

import { useMemo } from 'react';
import {
  PROPERTIES,
  type Property,
  isOnboardingComplete,
  checklistProgress,
  lifecycleBadge,
} from '../../../_data/properties';
import { useFixtureRev } from '../../../_data/fixtureRev';
import { FIN_OWNERS } from '../../../_data/finance';

interface Props {
  onOpen: (code: string) => void;
}

interface Alert {
  kind: 'paused' | 'onboarding' | 'pending_complete' | 'no_photos' | 'syndic';
  propertyCode: string;
  label: string;
  detail: string;
  tone: 'warning' | 'info' | 'neutral';
}

export function OverviewPage({ onOpen }: Props) {
  const fixtureRev = useFixtureRev();
  const counts = useMemo(() => ({
    live: PROPERTIES.filter((p) => p.lifecycleStatus === 'live').length,
    onboarding: PROPERTIES.filter((p) => p.lifecycleStatus === 'onboarding').length,
    paused: PROPERTIES.filter((p) => p.lifecycleStatus === 'paused').length,
    offBoarded: PROPERTIES.filter((p) => p.lifecycleStatus === 'off_boarded').length,
    activePending: PROPERTIES.filter((p) => p.lifecycleStatus === 'live' && !isOnboardingComplete(p)).length,
  }), [fixtureRev]);

  const ownerName = (id: string) => FIN_OWNERS.find((o) => o.id === id)?.name ?? id;

  const alerts: Alert[] = useMemo(() => {
    const out: Alert[] = [];
    PROPERTIES.forEach((p) => {
      if (p.lifecycleStatus === 'paused') {
        out.push({ kind: 'paused', propertyCode: p.code, label: p.name, detail: `${p.pausedReason ?? 'Paused'}${p.pauseReturnBy ? ` · return ${p.pauseReturnBy}` : ''}`, tone: 'warning' });
      }
      if (p.lifecycleStatus === 'onboarding') {
        const { pct } = checklistProgress(p);
        out.push({ kind: 'onboarding', propertyCode: p.code, label: p.name, detail: `Onboarding · ${pct}% checklist complete`, tone: 'info' });
      }
      if (p.lifecycleStatus === 'live' && p.photoIds.length === 0) {
        out.push({ kind: 'no_photos', propertyCode: p.code, label: p.name, detail: 'Live with no photos uploaded', tone: 'warning' });
      }
      if (p.isSyndicManaged) {
        out.push({ kind: 'syndic', propertyCode: p.code, label: p.name, detail: 'Friday acts as syndicate · Grand Beehive', tone: 'neutral' });
      }
    });
    return out;
  }, [fixtureRev]);

  const recentActivity = useMemo(() =>
    [...PROPERTIES]
      .sort((a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : -1))
      .slice(0, 6),
  [fixtureRev]);

  return (
    <div className="fad-module-body" style={{ flex: 1, overflowY: 'auto' }}>
      {/* KPI strip */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <Kpi label="Live" value={counts.live.toString()} />
        <Kpi label="Onboarding" value={counts.onboarding.toString()} sub={counts.activePending ? `+${counts.activePending} active · pending` : undefined} />
        <Kpi label="Paused" value={counts.paused.toString()} />
        <Kpi label="Off-boarded" value={counts.offBoarded.toString()} />
      </div>

      {/* Needs attention */}
      {alerts.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 500 }}>Needs attention</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {alerts.map((a, i) => (
              <button
                key={i}
                className="prop-attn-row"
                onClick={() => onOpen(a.propertyCode)}
              >
                <span className={`chip ${a.tone === 'warning' ? 'warn' : a.tone === 'info' ? 'info' : ''}`}>
                  {a.kind === 'paused' ? 'Paused' : a.kind === 'onboarding' ? 'Onboarding' : a.kind === 'no_photos' ? 'Photos' : a.kind === 'syndic' ? 'Syndic' : 'Pending'}
                </span>
                <span className="mono" style={{ fontSize: 11 }}>{a.propertyCode}</span>
                <span style={{ flex: 1, fontSize: 13 }}>{a.label}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{a.detail}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Recent activity */}
      <section>
        <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 500 }}>Recently active</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {recentActivity.map((p) => (
            <PropertyCardMini key={p.code} property={p} ownerName={ownerName(p.primaryOwnerId)} onOpen={() => onOpen(p.code)} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

function PropertyCardMini({ property, ownerName, onOpen }: { property: Property; ownerName: string; onOpen: () => void }) {
  const badge = lifecycleBadge(property);
  return (
    <button
      onClick={onOpen}
      className="card"
      style={{ textAlign: 'left', cursor: 'pointer', padding: 0, overflow: 'hidden', border: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-primary)' }}
    >
      <div style={{
        aspectRatio: '16 / 9',
        background: 'radial-gradient(ellipse at 30% 30%, rgba(86,128,202,0.3), transparent 60%), linear-gradient(135deg, var(--color-brand-navy), #1a2855)',
        position: 'relative',
      }}>
        <span className="mono" style={{ position: 'absolute', top: 10, left: 10, fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>{property.code}</span>
        <span className={`chip sm ${badge.tone === 'success' ? 'info' : badge.tone === 'warning' ? 'warn' : ''}`} style={{ position: 'absolute', top: 8, right: 8 }}>
          {badge.label}
        </span>
      </div>
      <div style={{ padding: '12px 14px' }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{property.name}</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>{property.area} · {ownerName}</div>
        <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--color-text-secondary)' }}>
          <span>Occ <strong>{Math.round(property.occupancy90d * 100)}%</strong></span>
          <span>ADR <strong>€{property.adr}</strong></span>
          {property.rating > 0 && <span>★ <strong>{property.rating.toFixed(2)}</strong></span>}
        </div>
      </div>
    </button>
  );
}
