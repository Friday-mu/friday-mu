'use client';

import { useState } from 'react';
import {
  artifactsForProperty,
  type Property,
  type OnboardingArtifact,
  type GapAnalysisArtifact,
  type HomeBuildOutArtifact,
  type SiteVisitArtifact,
  type OwnerAgreementArtifact,
  type StandardsBookArtifact,
  type KeysArtifact,
  type AmenitiesFormArtifact,
  type PhotoshootArtifact,
  type ListingSetupArtifact,
  type ChecklistItemStatus,
} from '../../../_data/properties';
import { fireToast } from '../../Toaster';

interface Props {
  property: Property;
}

const ARTIFACT_LABELS: Record<string, string> = {
  site_visit: 'Site Visit',
  owner_agreement: 'Owner Agreement',
  standards_book: 'Standards Book',
  keys: 'Keys',
  amenities_form: 'Amenities Form',
  gap_analysis: 'Gap Analysis',
  home_build_out: 'Home Build-Out',
  preventative_maintenance: 'Preventative Maintenance',
  aesthetic_check: 'Aesthetic Check',
  photoshoot: 'Photoshoot',
  listing_setup: 'Listing Setup',
};

const ARTIFACT_ORDER: OnboardingArtifact['type'][] = [
  'site_visit', 'owner_agreement', 'standards_book', 'keys',
  'amenities_form', 'gap_analysis', 'home_build_out',
  'preventative_maintenance', 'aesthetic_check', 'photoshoot', 'listing_setup',
];

export function OnboardingArtifacts({ property }: Props) {
  const artifacts = artifactsForProperty(property.id);
  const byType = new Map(artifacts.map((a) => [a.type, a]));

  return (
    <div style={{ marginTop: 16, padding: '16px', background: 'var(--color-background-secondary)', borderRadius: 'var(--radius-md)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-tertiary)' }}>
          Artifacts · 11 total
        </h4>
        <button
          className="btn ghost sm"
          onClick={() => fireToast('Onboarding Report would be generated · pulls all artifacts into PDF · Phase 2')}
        >
          📄 Generate Onboarding Report
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ARTIFACT_ORDER.map((type) => {
          const artifact = byType.get(type);
          return <ArtifactRow key={type} type={type} artifact={artifact} />;
        })}
      </div>
    </div>
  );
}

function statusChipClass(status: ChecklistItemStatus | undefined): string {
  if (status === 'complete') return 'info';
  if (status === 'in_progress') return '';
  if (status === 'skipped') return '';
  return '';
}

function statusLabel(status: ChecklistItemStatus | undefined): string {
  if (status === 'complete') return '✓ Complete';
  if (status === 'in_progress') return '◐ In progress';
  if (status === 'skipped') return '○ Skipped';
  return '○ Not started';
}

function ArtifactRow({ type, artifact }: { type: OnboardingArtifact['type']; artifact?: OnboardingArtifact }) {
  const [open, setOpen] = useState(false);
  const status = artifact?.status ?? 'not_started';

  return (
    <div className="card" style={{ padding: 12 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', padding: 0, cursor: 'pointer', width: '100%', textAlign: 'left', color: 'var(--color-text-primary)' }}
      >
        <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{ARTIFACT_LABELS[type]}</span>
        <span className={`chip sm ${statusChipClass(status)}`}>{statusLabel(status)}</span>
        {artifact?.completedAt && (
          <span className="mono" style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
            {artifact.completedAt.slice(0, 10)}
          </span>
        )}
        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--color-border-tertiary)' }}>
          {artifact ? <ArtifactDetail artifact={artifact} /> : <NotStartedDetail type={type} />}
        </div>
      )}
    </div>
  );
}

function NotStartedDetail({ type }: { type: OnboardingArtifact['type'] }) {
  return (
    <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
      <p style={{ margin: '0 0 8px' }}>Not yet started.</p>
      <button
        className="btn ghost sm"
        onClick={() => fireToast(`${ARTIFACT_LABELS[type]} form would open · structured capture lands Phase 2`)}
      >
        Start {ARTIFACT_LABELS[type]}
      </button>
    </div>
  );
}

function ArtifactDetail({ artifact }: { artifact: OnboardingArtifact }) {
  switch (artifact.type) {
    case 'site_visit': return <SiteVisitDetail artifact={artifact} />;
    case 'owner_agreement': return <OwnerAgreementDetail artifact={artifact} />;
    case 'standards_book': return <StandardsBookDetail artifact={artifact} />;
    case 'keys': return <KeysDetail artifact={artifact} />;
    case 'amenities_form': return <AmenitiesDetail artifact={artifact} />;
    case 'gap_analysis': return <GapAnalysisDetail artifact={artifact} />;
    case 'home_build_out': return <HomeBuildOutDetail artifact={artifact} />;
    case 'photoshoot': return <PhotoshootDetail artifact={artifact} />;
    case 'listing_setup': return <ListingSetupDetail artifact={artifact} />;
    default:
      return <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Capture form lands Phase 2.</p>;
  }
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 12 }}>{value}</div>
    </>
  );
}

function SiteVisitDetail({ artifact }: { artifact: SiteVisitArtifact }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 6, fontSize: 12 }}>
      <Field label="Visit date" value={artifact.visitDate ?? '—'} />
      <Field label="Attendees" value={artifact.attendeesUserIds?.length ? `${artifact.attendeesUserIds.length} attendees` : '—'} />
      <Field label="Photos" value={artifact.photosCount ?? 0} />
      <Field label="Approved" value={artifact.approvedBy ?? (artifact.status === 'complete' ? 'auto' : '—')} />
    </div>
  );
}

function OwnerAgreementDetail({ artifact }: { artifact: OwnerAgreementArtifact }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 6, fontSize: 12 }}>
      <Field label="Xodo envelope" value={artifact.xodoEnvelopeId ? <span className="mono" style={{ fontSize: 11 }}>{artifact.xodoEnvelopeId}</span> : '—'} />
      <Field label="Status" value={artifact.xodoStatus ?? '—'} />
      <Field label="Commission" value={artifact.commissionPct !== undefined ? `${artifact.commissionPct}%` : '—'} />
      <Field label="Payment day" value={artifact.paymentDay !== undefined ? `Day ${artifact.paymentDay}` : '—'} />
      {artifact.maintenanceCapMinor !== undefined && <Field label="Maint. cap" value={`Rs ${(artifact.maintenanceCapMinor / 100).toLocaleString()}`} />}
    </div>
  );
}

function StandardsBookDetail({ artifact }: { artifact: StandardsBookArtifact }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 6, fontSize: 12 }}>
      <Field label="Version" value={artifact.versionDelivered ?? '—'} />
      <Field label="Delivered" value={artifact.deliveredAt ?? '—'} />
      <Field label="Acknowledged" value={artifact.ownerAcknowledgedAt ?? '—'} />
    </div>
  );
}

function KeysDetail({ artifact }: { artifact: KeysArtifact }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 6, fontSize: 12 }}>
      <Field label="Sets received" value={artifact.setsReceived ?? '—'} />
      <Field label="Duplicates" value={artifact.duplicatesMadeAt ? `made ${artifact.duplicatesMadeAt}` : '—'} />
      <Field label="Storage" value={artifact.storageLocation ?? '—'} />
    </div>
  );
}

function AmenitiesDetail({ artifact }: { artifact: AmenitiesFormArtifact }) {
  return (
    <div style={{ fontSize: 12 }}>
      {artifact.responsesSummary ? (
        <p style={{ margin: 0 }}>{artifact.responsesSummary}</p>
      ) : (
        <p style={{ margin: 0, color: 'var(--color-text-tertiary)' }}>Form in progress · responses captured progressively · structured question-set lands Phase 2.</p>
      )}
    </div>
  );
}

function GapAnalysisDetail({ artifact }: { artifact: GapAnalysisArtifact }) {
  if (artifact.items.length === 0) {
    return <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>No items recorded yet.</p>;
  }
  const total = artifact.items.reduce((acc, i) => acc + (i.costMinor ?? 0), 0);
  return (
    <div>
      <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '0.5px solid var(--color-border-tertiary)', color: 'var(--color-text-tertiary)' }}>
            <th style={{ textAlign: 'left', padding: '6px 4px', fontWeight: 500 }}>Item</th>
            <th style={{ textAlign: 'right', padding: '6px 4px', fontWeight: 500 }}>Qty</th>
            <th style={{ textAlign: 'left', padding: '6px 4px', fontWeight: 500 }}>Status</th>
            <th style={{ textAlign: 'right', padding: '6px 4px', fontWeight: 500 }}>Cost</th>
            <th style={{ textAlign: 'left', padding: '6px 4px', fontWeight: 500 }}>Reimbursement</th>
          </tr>
        </thead>
        <tbody>
          {artifact.items.map((i) => (
            <tr key={i.id} style={{ borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
              <td style={{ padding: '6px 4px' }}>{i.item}</td>
              <td style={{ padding: '6px 4px', textAlign: 'right' }}>{i.qtyNeeded}</td>
              <td style={{ padding: '6px 4px' }}>
                <span className={`chip sm ${i.status === 'purchased' ? 'info' : i.status === 'owner_provided' ? 'info' : 'warn'}`}>{i.status.replace('_', ' ')}</span>
              </td>
              <td style={{ padding: '6px 4px', textAlign: 'right' }} className="mono">
                {i.costMinor !== undefined ? `Rs ${(i.costMinor / 100).toLocaleString()}` : '—'}
              </td>
              <td style={{ padding: '6px 4px', color: 'var(--color-text-tertiary)' }}>
                {i.reimbursementStatus?.replace(/_/g, ' ') ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 500 }}>
            <td colSpan={3} style={{ padding: '6px 4px' }}>Total Friday-paid</td>
            <td style={{ padding: '6px 4px', textAlign: 'right' }} className="mono">Rs {(total / 100).toLocaleString()}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
      <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
        Reimbursement: deducted from payout · invoiced separately if no positive payout (Finance AR — parking-lot §5.7).
      </p>
    </div>
  );
}

function HomeBuildOutDetail({ artifact }: { artifact: HomeBuildOutArtifact }) {
  if (artifact.items.length === 0) return <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>No items recorded yet.</p>;
  return (
    <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ borderBottom: '0.5px solid var(--color-border-tertiary)', color: 'var(--color-text-tertiary)' }}>
          <th style={{ textAlign: 'left', padding: '6px 4px', fontWeight: 500 }}>Item</th>
          <th style={{ textAlign: 'left', padding: '6px 4px', fontWeight: 500 }}>Make / Model</th>
          <th style={{ textAlign: 'left', padding: '6px 4px', fontWeight: 500 }}>Serial</th>
          <th style={{ textAlign: 'left', padding: '6px 4px', fontWeight: 500 }}>Location</th>
        </tr>
      </thead>
      <tbody>
        {artifact.items.map((i) => (
          <tr key={i.id} style={{ borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
            <td style={{ padding: '6px 4px' }}>{i.item}</td>
            <td style={{ padding: '6px 4px' }}>{[i.brand, i.model].filter(Boolean).join(' ') || '—'}</td>
            <td style={{ padding: '6px 4px' }} className="mono">{i.serial ?? '—'}</td>
            <td style={{ padding: '6px 4px', color: 'var(--color-text-tertiary)' }}>{i.locationInProperty ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PhotoshootDetail({ artifact }: { artifact: PhotoshootArtifact }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 6, fontSize: 12 }}>
      <Field label="Kind" value={artifact.shootKind ?? '—'} />
      <Field label="Photographer" value={artifact.photographer ?? '—'} />
      <Field label="Shoot date" value={artifact.shootDate ?? '—'} />
      <Field label="Photos" value={artifact.galleryCount ?? 0} />
      <p style={{ gridColumn: '1 / -1', margin: '6px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
        Pro shoot is the only flexible item — can defer post-active per pack §4.
      </p>
    </div>
  );
}

function ListingSetupDetail({ artifact }: { artifact: ListingSetupArtifact }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 6, fontSize: 12 }}>
      <Field label="Base price" value={artifact.basePriceMUR !== undefined ? `Rs ${artifact.basePriceMUR.toLocaleString()}` : '—'} />
      {artifact.basePriceRationale && <Field label="Rationale" value={artifact.basePriceRationale} />}
      {artifact.listingsByChannel && Object.entries(artifact.listingsByChannel).map(([ch, id]) => (
        <Field key={ch} label={ch} value={<span className="mono" style={{ fontSize: 11 }}>{id}</span>} />
      ))}
    </div>
  );
}

/** Compact 11-row roll-up matching the expanded view 1:1. Reads each
 *  artifact's status from the fixture (falls back to checklist map). The
 *  3 listing-related checklist items (listing_airbnb / listing_friday_mu /
 *  base_price) fold into the Listing Setup artifact row to match the
 *  expanded artifact list. */
export function ChecklistRollup({ property }: { property: Property }) {
  const artifacts = artifactsForProperty(property.id);
  const byType = new Map(artifacts.map((a) => [a.type, a]));

  const statusFor = (type: OnboardingArtifact['type']): ChecklistItemStatus => {
    const a = byType.get(type);
    if (a?.status) return a.status;
    // Listing Setup folds 3 checklist gates
    if (type === 'listing_setup') {
      const keys: (keyof typeof property.onboardingChecklist)[] = ['listing_airbnb', 'listing_friday_mu', 'base_price'];
      const statuses = keys.map((k) => property.onboardingChecklist[k] ?? 'not_started');
      if (statuses.every((s) => s === 'complete')) return 'complete';
      if (statuses.some((s) => s === 'in_progress' || s === 'complete')) return 'in_progress';
      return 'not_started';
    }
    // Otherwise read from same-named checklist key
    const key = type as keyof typeof property.onboardingChecklist;
    return property.onboardingChecklist[key] ?? 'not_started';
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6, fontSize: 11 }}>
      {ARTIFACT_ORDER.map((type) => {
        const status = statusFor(type);
        const symbol = status === 'complete' ? '✓' : status === 'in_progress' ? '◐' : '○';
        const color = status === 'complete' ? 'var(--color-text-success)' : status === 'in_progress' ? 'var(--color-brand-accent)' : 'var(--color-text-tertiary)';
        return (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 5, color }}>
            <span>{symbol}</span>
            <span style={{ color: 'var(--color-text-secondary)' }}>{ARTIFACT_LABELS[type]}</span>
          </div>
        );
      })}
    </div>
  );
}
