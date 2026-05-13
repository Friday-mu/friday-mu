'use client';

// design-be-10: mid-project edit drawer. Lets a Director patch the
// writable project fields after creation (lifecycle changes go through
// pause/resume/cancel, not here — see backend projects.js PATCH guard).
//
// Form mirrors WRITABLE_FIELDS in backend/src/design/projects.js, minus
// slug (immutable for URL stability). The base design_fee_minor /
// procurement_fee_minor columns still derive from tier and are not
// hand-edited; design-be-15 adds explicit *_override columns surfaced
// here via toggles so a Director can pin a fee per project without
// disturbing the derivation fallback.

import { useEffect, useState } from 'react';
import {
  designFeeForTier,
  formatMUR,
  procurementFeeForTier,
  tierForEpc,
  type DesignProject,
  type DesignTier,
  type LeadSource,
  type PMLink,
  type ProjectClassification,
  type ProjectGoal,
  type TargetOutcome,
} from '../../../_data/design';
import { updateProject, type ApiProject } from '../../../_data/designClient';
import { fireToast } from '../../Toaster';

interface Props {
  project: DesignProject;
  onSaved: () => void;
  onClose: () => void;
}

const CLASSIFICATION_OPTIONS: { id: ProjectClassification; label: string }[] = [
  { id: 'renovation',  label: 'Renovation' },
  { id: 'furnishing',  label: 'Furnishing' },
  { id: 'mixed',       label: 'Mixed' },
];

const SOURCE_OPTIONS: { id: LeadSource; label: string }[] = [
  { id: 'friday_outreach',         label: 'Friday outreach' },
  { id: 'owner_referral',          label: 'Owner referral' },
  { id: 'existing_owner',          label: 'Existing Friday owner' },
  { id: 'repeat_customer',         label: 'Repeat customer' },
  { id: 'industry_referral',       label: 'Industry referral (agent / notary / contractor)' },
  { id: 'website',                 label: 'Website' },
  { id: 'whatsapp',                label: 'WhatsApp' },
  { id: 'social_media',            label: 'Social media' },
  { id: 'social_media_influencer', label: 'Social media — influencer campaign' },
  { id: 'social_media_ad',         label: 'Social media — ad campaign' },
  { id: 'walk_in',                 label: 'Walk-in' },
  { id: 'other',                   label: 'Other' },
];

const PM_OPTIONS: { id: PMLink; label: string }[] = [
  { id: 'managed_by_friday', label: 'Already managed by Friday' },
  { id: 'will_be_managed',   label: 'Will be managed by Friday' },
  { id: 'not_managed',       label: 'Not managed by Friday' },
];

const TIER_OPTIONS: { id: '' | '1' | '2' | '3'; label: string }[] = [
  { id: '',  label: 'Auto-derive from EPC' },
  { id: '1', label: 'Tier 1' },
  { id: '2', label: 'Tier 2' },
  { id: '3', label: 'Tier 3' },
];

const GOAL_OPTIONS: { id: ProjectGoal; label: string }[] = [
  { id: 'str_readiness',   label: 'STR readiness' },
  { id: 'furnishing',      label: 'Furnishing' },
  { id: 'renovation',      label: 'Renovation' },
  { id: 'styling',         label: 'Styling' },
  { id: 'premium_upgrade', label: 'Premium upgrade' },
  { id: 'post_damage',     label: 'Post-damage restoration' },
];

const OUTCOME_OPTIONS: { id: TargetOutcome; label: string }[] = [
  { id: 'list_property',       label: 'List property' },
  { id: 'raise_adr',           label: 'Raise ADR' },
  { id: 'improve_reviews',     label: 'Improve guest reviews' },
  { id: 'prepare_sale',        label: 'Prepare sale' },
  { id: 'improve_owner_usage', label: 'Improve owner usage' },
];

function minorToMajorString(minor: number | null): string {
  if (minor == null) return '';
  return String(Math.round(minor / 100));
}

function parseMajorToMinor(s: string): number | null {
  const trimmed = s.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return NaN as number; // sentinel for invalid
  return Math.round(n * 100);
}

export function ProjectEditDrawer({ project, onSaved, onClose }: Props) {
  const [name, setName] = useState(project.name);
  const [classification, setClassification] = useState<ProjectClassification>(project.classification);
  const [tierStr, setTierStr] = useState<'' | '1' | '2' | '3'>(project.tier ? (String(project.tier) as '1' | '2' | '3') : '');
  const [epcStr, setEpcStr] = useState(minorToMajorString(project.epcMinor));
  const [budgetStr, setBudgetStr] = useState(minorToMajorString(project.budgetExpectationMinor));
  const [goals, setGoals] = useState<Set<ProjectGoal>>(new Set(project.goals));
  const [outcomes, setOutcomes] = useState<Set<TargetOutcome>>(new Set(project.outcomes));
  // lead_source isn't exposed on the fixture DesignProject yet; fall back to '' so the dropdown stays controlled.
  type ProjectWithLeadSource = DesignProject & { leadSource?: LeadSource | null };
  const initialLeadSource = (project as ProjectWithLeadSource).leadSource ?? '';
  const [leadSource, setLeadSource] = useState<LeadSource | ''>(initialLeadSource);
  const [urgency, setUrgency] = useState(project.urgency ?? '');
  const [pmLink, setPmLink] = useState<PMLink>(project.pmLink);
  const [designLeadUserId, setDesignLeadUserId] = useState(project.designLeadUserId ?? '');
  const [blocker, setBlocker] = useState(project.blocker ?? '');
  const [nextAction, setNextAction] = useState(project.nextAction ?? '');
  const [startDate, setStartDate] = useState(project.startDate ?? '');
  const [estimatedCompletion, setEstimatedCompletion] = useState(project.estimatedCompletion ?? '');
  // design-be-15: per-fee overrides. Toggle ON => send the input value
  // as the override minor; toggle OFF => clear any persisted override
  // (PATCH null) so the read path falls back to tier derivation.
  const [designFeeOverrideOn, setDesignFeeOverrideOn] = useState(project.designFeeMinorOverride != null);
  const [designFeeOverrideStr, setDesignFeeOverrideStr] = useState(minorToMajorString(project.designFeeMinorOverride ?? null));
  const [procurementFeeOverrideOn, setProcurementFeeOverrideOn] = useState(project.procurementFeeMinorOverride != null);
  const [procurementFeeOverrideStr, setProcurementFeeOverrideStr] = useState(minorToMajorString(project.procurementFeeMinorOverride ?? null));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Escape closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const toggleSet = <T,>(setter: React.Dispatch<React.SetStateAction<Set<T>>>, value: T) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!name.trim()) nextErrors.name = 'Name is required';

    const epcMinor = parseMajorToMinor(epcStr);
    if (Number.isNaN(epcMinor as number)) nextErrors.epc = 'Must be a non-negative number';
    const budgetMinor = parseMajorToMinor(budgetStr);
    if (Number.isNaN(budgetMinor as number)) nextErrors.budget = 'Must be a non-negative number';

    // Fee overrides: when toggled ON the input must parse to a
    // non-negative number; toggle OFF sends an explicit null to clear
    // any persisted override on the backend.
    let designFeeOverrideMinor: number | null = null;
    if (designFeeOverrideOn) {
      const parsed = parseMajorToMinor(designFeeOverrideStr);
      if (parsed == null || Number.isNaN(parsed as number)) {
        nextErrors.designFeeOverride = 'Enter a non-negative number';
      } else {
        designFeeOverrideMinor = parsed;
      }
    }
    let procurementFeeOverrideMinor: number | null = null;
    if (procurementFeeOverrideOn) {
      const parsed = parseMajorToMinor(procurementFeeOverrideStr);
      if (parsed == null || Number.isNaN(parsed as number)) {
        nextErrors.procurementFeeOverride = 'Enter a non-negative number';
      } else {
        procurementFeeOverrideMinor = parsed;
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});

    const patch: Partial<ApiProject> = {
      name: name.trim(),
      classification,
      tier: tierStr === '' ? null : (Number(tierStr) as DesignTier),
      epc_minor: epcMinor as number | null,
      budget_expectation_minor: budgetMinor as number | null,
      goals: Array.from(goals),
      outcomes: Array.from(outcomes),
      lead_source: leadSource === '' ? null : leadSource,
      urgency: urgency.trim() || null,
      pm_link: pmLink,
      design_lead_user_id: designLeadUserId.trim() || null,
      blocker: blocker.trim() || null,
      next_action: nextAction.trim() || null,
      start_date: startDate || null,
      estimated_completion: estimatedCompletion || null,
      design_fee_minor_override: designFeeOverrideOn ? designFeeOverrideMinor : null,
      procurement_fee_minor_override: procurementFeeOverrideOn ? procurementFeeOverrideMinor : null,
    };

    setSaving(true);
    try {
      await updateProject(project.id, patch);
      fireToast(`Project "${patch.name}" updated.`);
      onSaved();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrors({ _form: msg });
      fireToast(`Failed to update project: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      data-project-edit-drawer
      role="dialog"
      aria-modal="true"
      aria-label="Edit project"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 60,
        background: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: 'min(520px, 100%)',
          height: '100%',
          background: 'var(--color-background-primary)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-2px 0 16px rgba(0, 0, 0, 0.25)',
        }}
      >
        <div style={{ padding: '14px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-friday-fad)', fontSize: 16, fontWeight: 500 }}>Edit project</h3>
          <button type="button" onClick={onClose} aria-label="Close" disabled={saving} style={{ fontSize: 14, padding: '4px 8px' }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {errors._form && (
            <div style={{ padding: 8, background: 'var(--color-background-danger-soft)', color: 'var(--color-text-danger)', fontSize: 12, borderRadius: 'var(--radius-sm)' }}>
              {errors._form}
            </div>
          )}

          <Field label="Name" error={errors.name}>
            <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
          </Field>

          <Field label="Classification">
            <select value={classification} onChange={(e) => setClassification(e.target.value as ProjectClassification)} style={inputStyle}>
              {CLASSIFICATION_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </Field>

          <Field label="Tier (override)" hint="auto-derives from EPC if blank">
            <select value={tierStr} onChange={(e) => setTierStr(e.target.value as '' | '1' | '2' | '3')} style={inputStyle}>
              {TIER_OPTIONS.map((o) => <option key={o.id || 'auto'} value={o.id}>{o.label}</option>)}
            </select>
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="EPC (MUR)" error={errors.epc}>
              <input
                inputMode="numeric"
                value={epcStr}
                onChange={(e) => setEpcStr(e.target.value)}
                placeholder="0"
                style={inputStyle}
              />
            </Field>
            <Field label="Budget expectation (MUR)" error={errors.budget}>
              <input
                inputMode="numeric"
                value={budgetStr}
                onChange={(e) => setBudgetStr(e.target.value)}
                placeholder="0"
                style={inputStyle}
              />
            </Field>
          </div>

          <FeeOverridesSection
            classification={classification}
            epcStr={epcStr}
            budgetStr={budgetStr}
            tierStr={tierStr}
            designOn={designFeeOverrideOn}
            setDesignOn={setDesignFeeOverrideOn}
            designStr={designFeeOverrideStr}
            setDesignStr={setDesignFeeOverrideStr}
            designError={errors.designFeeOverride}
            procurementOn={procurementFeeOverrideOn}
            setProcurementOn={setProcurementFeeOverrideOn}
            procurementStr={procurementFeeOverrideStr}
            setProcurementStr={setProcurementFeeOverrideStr}
            procurementError={errors.procurementFeeOverride}
          />

          <Field label="Goals">
            <ChipGroup
              options={GOAL_OPTIONS}
              selected={goals}
              onToggle={(id) => toggleSet(setGoals, id as ProjectGoal)}
            />
          </Field>

          <Field label="Outcomes">
            <ChipGroup
              options={OUTCOME_OPTIONS}
              selected={outcomes}
              onToggle={(id) => toggleSet(setOutcomes, id as TargetOutcome)}
            />
          </Field>

          <Field label="Lead source">
            <select value={leadSource} onChange={(e) => setLeadSource(e.target.value as LeadSource | '')} style={inputStyle}>
              <option value="">—</option>
              {SOURCE_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </Field>

          <Field label="Urgency">
            <input value={urgency} onChange={(e) => setUrgency(e.target.value)} placeholder="e.g. owner travelling 1 Jun" style={inputStyle} />
          </Field>

          <Field label="PM link">
            <select value={pmLink} onChange={(e) => setPmLink(e.target.value as PMLink)} style={inputStyle}>
              {PM_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </Field>

          <Field label="Design lead (user id)">
            <input value={designLeadUserId} onChange={(e) => setDesignLeadUserId(e.target.value)} placeholder="u-ishant" style={inputStyle} />
          </Field>

          <Field label="Blocker">
            <textarea value={blocker} onChange={(e) => setBlocker(e.target.value)} rows={2} style={{ ...inputStyle, fontFamily: 'inherit' }} />
          </Field>

          <Field label="Next action">
            <textarea value={nextAction} onChange={(e) => setNextAction(e.target.value)} rows={2} style={{ ...inputStyle, fontFamily: 'inherit' }} />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Start date">
              <input type="date" value={startDate ? startDate.slice(0, 10) : ''} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Estimated completion">
              <input type="date" value={estimatedCompletion ? estimatedCompletion.slice(0, 10) : ''} onChange={(e) => setEstimatedCompletion(e.target.value)} style={inputStyle} />
            </Field>
          </div>
        </div>

        <div style={{ padding: '12px 16px', borderTop: '0.5px solid var(--color-border-tertiary)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} disabled={saving} style={{ padding: '6px 12px', fontSize: 12, borderRadius: 'var(--radius-sm)', background: 'var(--color-background-tertiary)' }}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            data-project-edit-save
            style={{
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-brand-accent)',
              color: '#fff',
              cursor: saving ? 'wait' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  border: '0.5px solid var(--color-border-secondary)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--color-background-primary)',
  color: 'var(--color-text-primary)',
  fontSize: 13,
};

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
        {label}
        {hint && <span style={{ marginLeft: 6, color: 'var(--color-text-tertiary)', fontWeight: 400, fontStyle: 'italic' }}>{hint}</span>}
      </span>
      {children}
      {error && <span style={{ fontSize: 11, color: 'var(--color-text-danger)' }}>{error}</span>}
    </label>
  );
}

function ChipGroup<T extends string>({ options, selected, onToggle }: { options: { id: T; label: string }[]; selected: Set<T>; onToggle: (id: T) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map((o) => {
        const isOn = selected.has(o.id);
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onToggle(o.id)}
            style={{
              padding: '4px 10px',
              fontSize: 11,
              borderRadius: 'var(--radius-full)',
              border: '0.5px solid var(--color-border-secondary)',
              background: isOn ? 'var(--color-brand-accent-soft)' : 'var(--color-background-primary)',
              color: isOn ? 'var(--color-brand-accent)' : 'var(--color-text-secondary)',
              fontWeight: isOn ? 600 : 500,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// design-be-15: paired toggle + numeric-override rows for design /
// procurement fees. Helper text shows the live tier-derived value so
// the Director sees what they're overriding before flipping the
// toggle. EPC drives tier; classification gates the procurement table.
function FeeOverridesSection({
  classification,
  epcStr,
  budgetStr,
  tierStr,
  designOn,
  setDesignOn,
  designStr,
  setDesignStr,
  designError,
  procurementOn,
  setProcurementOn,
  procurementStr,
  setProcurementStr,
  procurementError,
}: {
  classification: ProjectClassification;
  epcStr: string;
  budgetStr: string;
  tierStr: '' | '1' | '2' | '3';
  designOn: boolean;
  setDesignOn: (v: boolean) => void;
  designStr: string;
  setDesignStr: (v: string) => void;
  designError?: string;
  procurementOn: boolean;
  setProcurementOn: (v: boolean) => void;
  procurementStr: string;
  setProcurementStr: (v: string) => void;
  procurementError?: string;
}) {
  // Mirror apiProjectToFixture's tier-derivation so the helper text
  // matches what the read path will compute when the override is OFF.
  const epcMinorParsed = parseMajorToMinor(epcStr);
  const budgetMinorParsed = parseMajorToMinor(budgetStr);
  const epcEffective = (typeof epcMinorParsed === 'number' && !Number.isNaN(epcMinorParsed) && epcMinorParsed > 0)
    ? epcMinorParsed
    : (typeof budgetMinorParsed === 'number' && !Number.isNaN(budgetMinorParsed) && budgetMinorParsed > 0)
      ? budgetMinorParsed
      : 0;
  const derivedTier: DesignTier = epcEffective > 0
    ? tierForEpc(epcEffective)
    : (tierStr === '' ? 1 : (Number(tierStr) as DesignTier));
  const derivedDesign = epcEffective > 0 ? designFeeForTier(derivedTier, epcEffective) : 0;
  const derivedProcurement = epcEffective > 0 ? procurementFeeForTier(derivedTier, classification, epcEffective) : 0;

  return (
    <fieldset style={{ border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <legend style={{ padding: '0 6px', fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
        Fee overrides
        <span style={{ marginLeft: 6, color: 'var(--color-text-tertiary)', fontWeight: 400, fontStyle: 'italic' }}>
          pin a manual fee; leave off to use the tier-derived value
        </span>
      </legend>
      <FeeOverrideRow
        label="Override design fee"
        derivedHint={`Derived: ${formatMUR(derivedDesign)}`}
        on={designOn}
        setOn={setDesignOn}
        valueStr={designStr}
        setValueStr={setDesignStr}
        error={designError}
        testId="design-fee-override"
      />
      <FeeOverrideRow
        label="Override procurement fee"
        derivedHint={`Derived: ${formatMUR(derivedProcurement)}`}
        on={procurementOn}
        setOn={setProcurementOn}
        valueStr={procurementStr}
        setValueStr={setProcurementStr}
        error={procurementError}
        testId="procurement-fee-override"
      />
    </fieldset>
  );
}

function FeeOverrideRow({
  label,
  derivedHint,
  on,
  setOn,
  valueStr,
  setValueStr,
  error,
  testId,
}: {
  label: string;
  derivedHint: string;
  on: boolean;
  setOn: (v: boolean) => void;
  valueStr: string;
  setValueStr: (v: string) => void;
  error?: string;
  testId: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--color-text-primary)' }}>
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
          data-testid={`${testId}-toggle`}
        />
        <span style={{ fontWeight: 500 }}>{label}</span>
        <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400, fontStyle: 'italic', fontSize: 11 }}>{derivedHint}</span>
      </label>
      {on && (
        <input
          inputMode="numeric"
          value={valueStr}
          onChange={(e) => setValueStr(e.target.value)}
          placeholder="MUR"
          aria-label={label}
          data-testid={`${testId}-input`}
          style={inputStyle}
        />
      )}
      {error && <span style={{ fontSize: 11, color: 'var(--color-text-danger)' }}>{error}</span>}
    </div>
  );
}
