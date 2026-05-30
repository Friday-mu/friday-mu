'use client';

import { useMemo, useState } from 'react';
import {
  PROPERTIES,
  checklistProgress,
  type Property,
} from '../../../_data/properties';
import { useFixtureRev } from '../../../_data/fixtureRev';
import { FIN_OWNERS } from '../../../_data/finance';
import { OnboardingArtifacts, ChecklistRollup } from './OnboardingArtifacts';

interface Props {
  onOpen: (code: string) => void;
}

export function OnboardingPage({ onOpen }: Props) {
  const fixtureRev = useFixtureRev();
  const onboarding = useMemo(() => PROPERTIES.filter((p) => p.lifecycleStatus === 'onboarding'), [fixtureRev]);
  const ownerName = (id: string) => FIN_OWNERS.find((o) => o.id === id)?.name ?? id;
  const [expandedCode, setExpandedCode] = useState<string | null>(null);

  return (
    <div className="fad-module-body" style={{ flex: 1, overflowY: 'auto' }}>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--color-text-tertiary)' }}>
        Properties currently going through onboarding. Owns artifact capture (Site Visit, Owner Agreement, Standards Book, Keys, Amenities Form, Gap Analysis, Home Build-Out, Preventative Maintenance, Aesthetic Check, Photoshoot, Listing Setup) before listings push to channels.
      </p>

      {onboarding.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
          No properties currently in onboarding.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {onboarding.map((p) => (
            <OnboardingRow
              key={p.code}
              property={p}
              ownerName={ownerName(p.primaryOwnerId)}
              expanded={expandedCode === p.code}
              onToggle={() => setExpandedCode(expandedCode === p.code ? null : p.code)}
              onOpen={() => onOpen(p.code)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OnboardingRow({
  property,
  ownerName,
  expanded,
  onToggle,
  onOpen,
}: {
  property: Property;
  ownerName: string;
  expanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const { done, total, pct } = checklistProgress(property);
  const daysSinceStart = property.lastActivityAt
    ? Math.floor((Date.now() - new Date(property.lastActivityAt).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <span className="mono" style={{ fontSize: 11 }}>{property.code}</span>
        <button onClick={onOpen} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>
          {property.name}
        </button>
        <span className="chip info">Onboarding</span>
        <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{ownerName}</span>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>· {daysSinceStart}d since last activity</span>
        <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 500 }}>{done} / {total} <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}>· {pct}%</span></span>
        <button className="btn ghost sm" onClick={onToggle}>
          {expanded ? 'Collapse ▴' : 'Expand ▾'}
        </button>
      </div>

      <div style={{ height: 6, background: 'var(--color-background-secondary)', borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--color-brand-accent)', transition: 'width 200ms' }} />
      </div>

      {!expanded && <ChecklistRollup property={property} />}
      {expanded && <OnboardingArtifacts property={property} />}
    </div>
  );
}
