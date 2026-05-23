'use client';

import { useMemo, useState } from 'react';
import {
  PROPERTIES,
  PROPERTY_BY_CODE,
  ONBOARDING_REQUIRED,
  rebuildDerivedPropertyMaps,
  type Property,
  type ListingType,
  type PropertyZone,
  type PropertyTier,
  type ChecklistItemStatus,
} from '../../../_data/properties';
import { createProperty, hydratePropertiesFromGuesty } from '../../../_data/propertiesClient';
import { bumpFixtureRev } from '../../../_data/fixtureRev';
import { COHORT_LABEL, type Cohort } from '../../../_data/reviews';
import { FIN_OWNERS } from '../../../_data/finance';
import { fireToast } from '../../Toaster';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (property: Property) => void;
}

type Step = 'draft' | 'confirm';

const DEFAULT_DRAFT = {
  code: '',
  name: '',
  buildingName: '',
  address: '',
  region: 'flic_en_flac' as Cohort,
  listingType: 'villa' as ListingType,
  bedrooms: 2,
  bathrooms: 1,
  maxOccupancy: 4,
  sqm: undefined as number | undefined,
  primaryOwnerId: '',
  baseRateMUR: 0,
};

function regionToZone(region: Cohort): PropertyZone {
  if (region === 'grand_baie' || region === 'pereybere') return 'north';
  return 'west';
}

function tierFromOccupancy(maxOccupancy: number): PropertyTier {
  if (maxOccupancy <= 3) return 'small';
  if (maxOccupancy <= 7) return 'medium';
  return 'big';
}

export function CreatePropertyDrawer({ open, onClose, onCreated }: Props) {
  const [step, setStep] = useState<Step>('draft');
  const [draft, setDraft] = useState(DEFAULT_DRAFT);

  const validations = useMemo(() => {
    const errors: string[] = [];
    const code = draft.code.trim();
    if (!code) errors.push('Code required');
    else if (PROPERTY_BY_CODE[code]) errors.push(`Code ${code} already in use`);
    else if (!/^[A-Z0-9-]+$/.test(code)) errors.push('Code must be uppercase letters, digits, hyphens only');
    if (!draft.name.trim()) errors.push('Name required');
    if (!draft.address.trim()) errors.push('Address required');
    if (!draft.primaryOwnerId) errors.push('Primary owner required');
    if (draft.bedrooms < 0) errors.push('Bedrooms can\'t be negative');
    if (draft.maxOccupancy < 1) errors.push('Max occupancy ≥ 1');
    return errors;
  }, [draft]);

  const canProceed = validations.length === 0;

  const proceedToConfirm = () => {
    if (!canProceed) {
      fireToast(`Cannot proceed: ${validations.length} validation error${validations.length === 1 ? '' : 's'}`);
      return;
    }
    setStep('confirm');
  };

  // Optimistic create: build the Property locally, splice into PROPERTIES,
  // close the drawer + toast immediately, then fire the API call in the
  // background. On success, hydrate replaces the optimistic row with the
  // canonical backend version. On failure, we pop the optimistic row +
  // restore the drawer state so the user can retry.
  const confirmCreate = () => {
    const ownerName = FIN_OWNERS.find((o) => o.id === draft.primaryOwnerId)?.name ?? draft.primaryOwnerId;
    const region = draft.region;
    const zone = regionToZone(region);
    const tier = tierFromOccupancy(draft.maxOccupancy);

    const checklist = ONBOARDING_REQUIRED.reduce(
      (acc, k) => ({ ...acc, [k]: 'not_started' as ChecklistItemStatus }),
      {} as Record<string, ChecklistItemStatus>,
    );

    const trimmedCode = draft.code.trim();
    const trimmedName = draft.name.trim();
    const optimisticId = `optimistic-${trimmedCode.toLowerCase()}-${Date.now()}`;
    const input = {
      code: trimmedCode,
      name: trimmedName,
      buildingName: draft.buildingName.trim() || undefined,
      address: draft.address.trim(),
      region,
      area: `${COHORT_LABEL[region]} · ${zone === 'north' ? 'North' : 'West'}`,
      zone,
      tier,
      lifecycleStatus: 'onboarding' as const,
      onboardingChecklist: checklist,
      listingType: draft.listingType,
      bedrooms: draft.bedrooms,
      bathrooms: draft.bathrooms || undefined,
      maxOccupancy: draft.maxOccupancy,
      sqm: draft.sqm,
      primaryOwnerId: draft.primaryOwnerId,
      baseRateMUR: draft.baseRateMUR,
      tags: ['Onboarding'],
    };
    const optimisticProperty: Property = {
      id: optimisticId,
      code: trimmedCode,
      name: trimmedName,
      buildingName: input.buildingName,
      address: input.address,
      region,
      area: input.area,
      zone,
      tier,
      lifecycleStatus: 'onboarding',
      onboardingChecklist: checklist,
      listingType: draft.listingType,
      bedrooms: draft.bedrooms,
      bathrooms: draft.bathrooms || undefined,
      maxOccupancy: draft.maxOccupancy,
      sqm: draft.sqm,
      primaryOwnerId: draft.primaryOwnerId,
      listings: [],
      baseRateMUR: draft.baseRateMUR,
      photoIds: [],
      tags: ['Onboarding'],
      occupancyYTD: 0,
      occupancy90d: 0,
      adr: 0,
      rating: 0,
      ratingCount: 0,
      lastActivityAt: new Date().toISOString().slice(0, 10),
    };

    // Splice into local state — list updates immediately.
    PROPERTIES.push(optimisticProperty);
    rebuildDerivedPropertyMaps();
    bumpFixtureRev();

    // Close drawer + toast immediately.
    const savedDraft = draft;
    setDraft(DEFAULT_DRAFT);
    setStep('draft');
    onClose();
    fireToast(
      `Property created · ${trimmedCode} · ${trimmedName} · onboarding (0 / ${ONBOARDING_REQUIRED.length}) · primary owner ${ownerName}`,
    );
    onCreated(optimisticProperty);

    // Background: real API call + reconcile.
    createProperty(input)
      .then(() => hydratePropertiesFromGuesty())
      .catch((e) => {
        // Roll back: remove the optimistic row + restore the draft so the
        // user can fix + retry.
        const idx = PROPERTIES.findIndex((p) => p.id === optimisticId);
        if (idx >= 0) PROPERTIES.splice(idx, 1);
        rebuildDerivedPropertyMaps();
        bumpFixtureRev();
        const msg = e instanceof Error ? e.message : 'Failed to create property';
        fireToast(`Create failed · ${msg} · property removed`);
        setDraft(savedDraft);
      });
  };

  const handleClose = () => {
    setDraft(DEFAULT_DRAFT);
    setStep('draft');
    onClose();
  };

  if (!open) return null;

  return (
    <>
      <div onClick={handleClose} style={overlayStyle} />
      <aside className="task-detail-pane open" style={{ width: 560, maxWidth: '100vw' }}>
        <div className="task-detail-header">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 500 }}>
                {step === 'draft' ? 'New property · draft' : 'Confirm new property'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                {step === 'draft'
                  ? 'Capture property essentials. Onboarding artifacts populate from here.'
                  : 'Review before saving · property starts in onboarding state.'}
              </div>
            </div>
            <button className="btn ghost sm" onClick={handleClose}>Close</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {step === 'draft' ? (
            <DraftStep draft={draft} setDraft={setDraft} validations={validations} />
          ) : (
            <ConfirmStep draft={draft} />
          )}
        </div>

        <div style={{ borderTop: '0.5px solid var(--color-border-tertiary)', padding: 14, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {step === 'draft' ? (
            <>
              <button className="btn ghost sm" onClick={handleClose}>Cancel</button>
              <button
                className="btn primary sm"
                onClick={proceedToConfirm}
                disabled={!canProceed}
                style={!canProceed ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
              >
                Continue →
              </button>
            </>
          ) : (
            <>
              <button className="btn ghost sm" onClick={() => setStep('draft')}>← Back</button>
              <button className="btn primary sm" onClick={confirmCreate}>
                Create property
              </button>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

function DraftStep({
  draft, setDraft, validations,
}: {
  draft: typeof DEFAULT_DRAFT;
  setDraft: (d: typeof DEFAULT_DRAFT) => void;
  validations: string[];
}) {
  const upd = <K extends keyof typeof DEFAULT_DRAFT>(k: K, v: (typeof DEFAULT_DRAFT)[K]) =>
    setDraft({ ...draft, [k]: v });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Row>
        <Field label="Code" hint="Uppercase + digits + hyphens. Shown across the app.">
          <input
            type="text"
            value={draft.code}
            onChange={(e) => upd('code', e.target.value.toUpperCase())}
            placeholder="e.g. SLN-1"
            className="fad-input mono"
          />
        </Field>
        <Field label="Name" hint="Display name owners and guests recognize.">
          <input
            type="text"
            value={draft.name}
            onChange={(e) => upd('name', e.target.value)}
            placeholder="e.g. Solar Lane Villa"
            className="fad-input"
          />
        </Field>
      </Row>

      <Field label="Building (optional)" hint="If part of a complex (e.g. Grand Beehive).">
        <input
          type="text"
          value={draft.buildingName}
          onChange={(e) => upd('buildingName', e.target.value)}
          placeholder="e.g. Grand Beehive Tower"
          className="fad-input"
        />
      </Field>

      <Field label="Address">
        <textarea
          value={draft.address}
          onChange={(e) => upd('address', e.target.value)}
          rows={2}
          placeholder="Street, locale, region"
          className="fad-input"
          style={{ resize: 'vertical' }}
        />
      </Field>

      <Row>
        <Field label="Region">
          <select value={draft.region} onChange={(e) => upd('region', e.target.value as Cohort)} className="fad-input">
            {Object.entries(COHORT_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </Field>
        <Field label="Listing type">
          <select value={draft.listingType} onChange={(e) => upd('listingType', e.target.value as ListingType)} className="fad-input">
            <option value="villa">Villa</option>
            <option value="apartment">Apartment</option>
            <option value="studio">Studio</option>
            <option value="townhouse">Townhouse</option>
            <option value="bungalow">Bungalow</option>
          </select>
        </Field>
      </Row>

      <Row>
        <Field label="Bedrooms">
          <input type="number" min={0} value={draft.bedrooms} onChange={(e) => upd('bedrooms', Number(e.target.value))} className="fad-input" />
        </Field>
        <Field label="Bathrooms">
          <input type="number" min={0} value={draft.bathrooms} onChange={(e) => upd('bathrooms', Number(e.target.value))} className="fad-input" />
        </Field>
        <Field label="Max occupancy">
          <input type="number" min={1} value={draft.maxOccupancy} onChange={(e) => upd('maxOccupancy', Number(e.target.value))} className="fad-input" />
        </Field>
      </Row>

      <Row>
        <Field label="Floor area (m²)">
          <input
            type="number"
            min={0}
            value={draft.sqm ?? ''}
            onChange={(e) => upd('sqm', e.target.value ? Number(e.target.value) : undefined)}
            placeholder="optional"
            className="fad-input"
          />
        </Field>
        <Field label="Base rate (Rs / night)" hint="Set later if not yet decided.">
          <input
            type="number"
            min={0}
            value={draft.baseRateMUR / 100}
            onChange={(e) => upd('baseRateMUR', Math.round(Number(e.target.value) * 100))}
            placeholder="optional"
            className="fad-input"
          />
        </Field>
      </Row>

      <Field label="Primary owner" hint="Signing party for the contract. Add new owner: defer to Owners module.">
        <select value={draft.primaryOwnerId} onChange={(e) => upd('primaryOwnerId', e.target.value)} className="fad-input">
          <option value="">— Select —</option>
          {FIN_OWNERS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </Field>

      {validations.length > 0 && (
        <div style={{
          padding: 10, borderRadius: 'var(--radius-sm)',
          background: 'rgba(220, 80, 80, 0.08)', border: '0.5px solid rgba(220, 80, 80, 0.4)',
          fontSize: 12, color: 'var(--color-text-warning, var(--color-text-primary))',
        }}>
          <strong>{validations.length} issue{validations.length === 1 ? '' : 's'}:</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {validations.map((v) => <li key={v}>{v}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function ConfirmStep({ draft }: { draft: typeof DEFAULT_DRAFT }) {
  const ownerName = FIN_OWNERS.find((o) => o.id === draft.primaryOwnerId)?.name ?? '—';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        padding: 12, borderRadius: 'var(--radius-sm)',
        background: 'rgba(var(--color-brand-accent-rgb, 86, 128, 202), 0.08)',
        border: '0.5px solid var(--color-brand-accent)',
        fontSize: 12, color: 'var(--color-text-secondary)',
      }}>
        ⚠ <strong>Property starts in onboarding</strong> — {ONBOARDING_REQUIRED.length} required artifacts created (all not-started).
        Site Visit is the natural first step. Pre-onboarding lead context (vetting Q&A, presentation sent, discovery call notes) lives in
        Leads / CRM-lite — when that module ships, "Convert to Property" will pre-fill these onboarding fields automatically.
      </div>

      <SummaryRow label="Code" value={draft.code} mono />
      <SummaryRow label="Name" value={draft.name} bold />
      {draft.buildingName && <SummaryRow label="Building" value={draft.buildingName} />}
      <SummaryRow label="Address" value={draft.address} />
      <SummaryRow label="Region" value={COHORT_LABEL[draft.region]} />
      <SummaryRow label="Listing type" value={draft.listingType} />
      <SummaryRow label="Layout" value={`${draft.bedrooms === 0 ? 'Studio' : `${draft.bedrooms} BR`} · ${draft.bathrooms || '—'} bath · sleeps ${draft.maxOccupancy}${draft.sqm ? ` · ${draft.sqm} m²` : ''}`} />
      {draft.baseRateMUR > 0 && <SummaryRow label="Base rate" value={`Rs ${(draft.baseRateMUR / 100).toLocaleString()} / night`} />}
      <SummaryRow label="Primary owner" value={ownerName} />
      <SummaryRow label="Lifecycle" value="Onboarding · 0 / 13 checklist" />
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 10 }}>{children}</div>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1 }}>
      <label style={{ display: 'block', fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

function SummaryRow({ label, value, bold, mono }: { label: string; value: string; bold?: boolean; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <div style={{ width: 130, fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>{label}</div>
      <div className={mono ? 'mono' : undefined} style={{ fontSize: 13, fontWeight: bold ? 500 : 400 }}>{value}</div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: '48px 0 0 0',
  background: 'rgba(15, 24, 54, 0.12)',
  zIndex: 44,
};
