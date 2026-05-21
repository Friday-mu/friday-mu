'use client';

import { useMemo, useState } from 'react';
import {
  designClient,
  type EntryPath,
  type LeadSource,
  type PMLink,
  type ProjectGoal,
  type ProposalStatus,
  type TargetOutcome,
} from '../../../_data/design';
import { fireToast } from '../../Toaster';

interface Props {
  /** Closes the intake (cancel or after submit). Receives optional new project ID. */
  onClose: (newProjectId?: string) => void;
}

const SOURCE_OPTIONS: { id: LeadSource; label: string }[] = [
  { id: 'outreach',                label: 'Cold outreach' },
  { id: 'owner_referral',          label: 'Owner referral' },
  { id: 'existing_owner',          label: 'Existing owner' },
  { id: 'repeat_customer',         label: 'Repeat customer' },
  { id: 'industry_referral',       label: 'Industry referral (agent / notary / contractor)' },
  { id: 'press_media',             label: 'Press / media' },
  { id: 'trade_show_event',        label: 'Trade show / event' },
  { id: 'website',                 label: 'Website' },
  { id: 'whatsapp',                label: 'WhatsApp' },
  { id: 'email_campaign',          label: 'Email campaign' },
  { id: 'social_media',            label: 'Social media' },
  { id: 'social_media_influencer', label: 'Social media — influencer campaign' },
  { id: 'social_media_ad',         label: 'Social media — ad campaign' },
  { id: 'walk_in',                 label: 'Walk-in' },
  { id: 'other',                   label: 'Other' },
];

const ENTRY_PATH_OPTIONS: { id: EntryPath; label: string; description: string }[] = [
  { id: 'direct_pitch',     label: 'We pitched the owner',  description: 'We initiate; owner is new prospect.' },
  { id: 'owner_direct',     label: 'Owner came directly',    description: 'Owner reached out asking for our service.' },
  { id: 'existing_owner',   label: 'Existing owner',         description: 'PM client already; expanding to ID.' },
  { id: 'new_owner_no_str', label: 'New owner, not yet in STR', description: 'No PM relationship yet.' },
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

const PM_OPTIONS: { id: PMLink; label: string }[] = [
  { id: 'managed_by_company', label: 'Already managed by us' },
  { id: 'will_manage',        label: 'Will be managed by us' },
  { id: 'not_managed',        label: 'Not managed by us' },
];

const PROPOSAL_OPTIONS: { id: ProposalStatus; label: string }[] = [
  { id: 'not_needed', label: 'Not needed' },
  { id: 'draft',      label: 'Draft' },
  { id: 'sent',       label: 'Sent' },
  { id: 'accepted',   label: 'Accepted' },
  { id: 'declined',   label: 'Declined' },
];

export function ProjectIntake({ onClose }: Props) {
  // Lead intake fields
  const [source, setSource] = useState<LeadSource>('outreach');
  const [entryPath, setEntryPath] = useState<EntryPath>('direct_pitch');

  // Counterparty typeahead — using existing fixture as the search source.
  const [counterpartyQuery, setCounterpartyQuery] = useState('');
  const [counterpartyId, setCounterpartyId] = useState<string | null>(null);
  const [newCpName, setNewCpName] = useState('');
  const [newCpPhone, setNewCpPhone] = useState('');
  const [newCpEmail, setNewCpEmail] = useState('');

  const counterpartyMatches = useMemo(
    () => designClient.counterparties.search(counterpartyQuery).slice(0, 6),
    [counterpartyQuery],
  );

  // §B3.3 identity-resolution: name + phone match suggestion banner.
  const idResolutionMatch = useMemo(() => {
    if (!newCpName.trim() || !newCpPhone.trim()) return null;
    const nameLower = newCpName.toLowerCase().trim();
    return designClient.counterparties.search('').find(
      (c) => c.fullName.toLowerCase().includes(nameLower) && c.phone === newCpPhone.trim(),
    );
  }, [newCpName, newCpPhone]);

  // Property typeahead
  const [propertyQuery, setPropertyQuery] = useState('');
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [newPropAddress, setNewPropAddress] = useState('');

  const propertyMatches = useMemo(() => {
    const q = propertyQuery.toLowerCase().trim();
    if (!q) return designClient.properties.list().slice(0, 6);
    return designClient.properties.list().filter((p) =>
      p.name.toLowerCase().includes(q) || p.address.toLowerCase().includes(q),
    ).slice(0, 6);
  }, [propertyQuery]);

  // Project metadata
  const [name, setName] = useState('');
  const [goals, setGoals] = useState<ProjectGoal[]>([]);
  const [outcomes, setOutcomes] = useState<TargetOutcome[]>([]);
  const [budgetExpectation, setBudgetExpectation] = useState('');
  const [urgency, setUrgency] = useState('');
  const [pmLink, setPmLink] = useState<PMLink>('will_manage');
  const [siteFloorRequested, setSiteFloorRequested] = useState(false);
  const [proposalStatus, setProposalStatus] = useState<ProposalStatus>('not_needed');

  const toggleGoal = (g: ProjectGoal) =>
    setGoals((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  const toggleOutcome = (o: TargetOutcome) =>
    setOutcomes((prev) => (prev.includes(o) ? prev.filter((x) => x !== o) : [...prev, o]));

  const canSubmit = name.trim().length > 0 && (counterpartyId !== null || (newCpName && newCpPhone));

  const submit = () => {
    if (!canSubmit) return;
    // @demo:logic — Tag: PROD-DESIGN-2. Real version POSTs to /api/design/projects
    // (or /api/design/leads, depending on entry path). v0.1 just shows a toast.
    const willConvertImmediately = entryPath === 'owner_direct' || proposalStatus === 'not_needed';
    const action = willConvertImmediately ? 'Project' : 'Lead';
    const owner = counterpartyId ? designClient.counterparties.get(counterpartyId)?.fullName : newCpName;
    fireToast(`${action} created — ${name} · ${owner}`);
    onClose();
  };

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: 8 }}>
      <div
        style={{
          background: 'var(--color-background-primary)',
          border: '0.5px solid var(--color-border-tertiary)',
          borderRadius: 'var(--radius-md)',
          padding: 24,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-friday-fad)', fontSize: 20, fontWeight: 500 }}>New design project</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              Lead intake form. Submitting creates either a Lead or a Project (auto-decided by entry path + proposal status).
            </p>
          </div>
          <button
            type="button"
            onClick={() => onClose()}
            style={{ padding: '6px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-tertiary)', fontSize: 12 }}
          >
            Cancel
          </button>
        </div>

        {/* Lead source */}
        <Section label="Lead source">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {SOURCE_OPTIONS.map((opt) => (
              <Chip key={opt.id} active={source === opt.id} onClick={() => setSource(opt.id)} label={opt.label} />
            ))}
          </div>
        </Section>

        {/* Entry path */}
        <Section label="Entry path">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ENTRY_PATH_OPTIONS.map((opt) => (
              <label
                key={opt.id}
                style={{
                  display: 'flex',
                  gap: 10,
                  padding: 10,
                  border: '0.5px solid ' + (entryPath === opt.id ? 'var(--color-brand-accent)' : 'var(--color-border-tertiary)'),
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  background: entryPath === opt.id ? 'var(--color-brand-accent-softer)' : 'transparent',
                }}
              >
                <input type="radio" checked={entryPath === opt.id} onChange={() => setEntryPath(opt.id)} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{opt.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{opt.description}</div>
                </div>
              </label>
            ))}
          </div>
        </Section>

        {/* Counterparty */}
        <Section label="Counterparty (owner)" hint="Search existing or create new. Identity-resolution warns if name+phone match an existing record.">
          <input
            type="search"
            placeholder="Search by name, phone, or email…"
            value={counterpartyQuery}
            onChange={(e) => { setCounterpartyQuery(e.target.value); setCounterpartyId(null); }}
            style={inputStyle()}
          />
          {counterpartyQuery && (
            <div style={{ marginTop: 6, border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)', maxHeight: 160, overflowY: 'auto' }}>
              {counterpartyMatches.length === 0 ? (
                <div style={{ padding: 8, fontSize: 12, color: 'var(--color-text-tertiary)' }}>No matches.</div>
              ) : (
                counterpartyMatches.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setCounterpartyId(c.id); setCounterpartyQuery(c.fullName); }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', padding: 8, fontSize: 12,
                      background: counterpartyId === c.id ? 'var(--color-brand-accent-soft)' : 'transparent',
                      borderBottom: '0.5px solid var(--color-border-tertiary)',
                    }}
                  >
                    <strong>{c.fullName}</strong>{' '}
                    <span style={{ color: 'var(--color-text-tertiary)' }}>· {c.phone ?? '—'} · {c.email ?? '—'}</span>
                  </button>
                ))
              )}
            </div>
          )}

          <div style={{ marginTop: 10, padding: 10, border: '0.5px dashed var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>… or create new:</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
              <input placeholder="Full name" value={newCpName} onChange={(e) => setNewCpName(e.target.value)} style={inputStyle()} />
              <input placeholder="Phone (+230 …)" value={newCpPhone} onChange={(e) => setNewCpPhone(e.target.value)} style={inputStyle()} />
              <input placeholder="Email" value={newCpEmail} onChange={(e) => setNewCpEmail(e.target.value)} style={inputStyle()} />
            </div>
            {idResolutionMatch && (
              <div
                style={{
                  marginTop: 8,
                  padding: 8,
                  background: 'var(--color-bg-warning)',
                  color: 'var(--color-text-warning)',
                  fontSize: 12,
                  borderRadius: 'var(--radius-sm)',
                  borderLeft: '3px solid var(--color-text-warning)',
                }}
              >
                <strong>Possible match:</strong> {idResolutionMatch.fullName} · {idResolutionMatch.phone}.{' '}
                <button
                  type="button"
                  onClick={() => { setCounterpartyId(idResolutionMatch.id); setCounterpartyQuery(idResolutionMatch.fullName); setNewCpName(''); setNewCpPhone(''); setNewCpEmail(''); }}
                  style={{ marginLeft: 4, color: 'var(--color-text-warning)', textDecoration: 'underline' }}
                >
                  Use existing record
                </button>
              </div>
            )}
          </div>
        </Section>

        {/* Property */}
        <Section label="Property">
          <input
            type="search"
            placeholder="Search property…"
            value={propertyQuery}
            onChange={(e) => { setPropertyQuery(e.target.value); setPropertyId(null); }}
            style={inputStyle()}
          />
          <div style={{ marginTop: 6, border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)', maxHeight: 160, overflowY: 'auto' }}>
            {propertyMatches.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { setPropertyId(p.id); setPropertyQuery(p.name); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: 8, fontSize: 12,
                  background: propertyId === p.id ? 'var(--color-brand-accent-soft)' : 'transparent',
                  borderBottom: '0.5px solid var(--color-border-tertiary)',
                }}
              >
                <strong>{p.name}</strong>{' '}
                <span style={{ color: 'var(--color-text-tertiary)' }}>· {p.address}</span>
              </button>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <input
              placeholder="… or new property address"
              value={newPropAddress}
              onChange={(e) => setNewPropAddress(e.target.value)}
              style={inputStyle()}
            />
          </div>
        </Section>

        {/* Name */}
        <Section label="Project name" required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Albion — Tasleem"
            style={inputStyle()}
          />
        </Section>

        {/* Goals */}
        <Section label="Project goals">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {GOAL_OPTIONS.map((opt) => (
              <Chip key={opt.id} active={goals.includes(opt.id)} onClick={() => toggleGoal(opt.id)} label={opt.label} />
            ))}
          </div>
        </Section>

        {/* Outcomes */}
        <Section label="Target outcomes">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {OUTCOME_OPTIONS.map((opt) => (
              <Chip key={opt.id} active={outcomes.includes(opt.id)} onClick={() => toggleOutcome(opt.id)} label={opt.label} />
            ))}
          </div>
        </Section>

        {/* Budget + Urgency */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <Section label="Budget expectation (MUR)">
            <input
              inputMode="numeric"
              value={budgetExpectation}
              onChange={(e) => setBudgetExpectation(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="e.g. 1500000"
              style={inputStyle()}
            />
          </Section>
          <Section label="Urgency / target deadline">
            <input
              type="date"
              value={urgency}
              onChange={(e) => setUrgency(e.target.value)}
              style={inputStyle()}
            />
          </Section>
        </div>

        {/* PM link */}
        <Section label="Property management link">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {PM_OPTIONS.map((opt) => (
              <Chip key={opt.id} active={pmLink === opt.id} onClick={() => setPmLink(opt.id)} label={opt.label} />
            ))}
          </div>
        </Section>

        {/* Site/floor + Proposal status */}
        <Section label="Pre-visit document request">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={siteFloorRequested} onChange={(e) => setSiteFloorRequested(e.target.checked)} />
            Request site plan / floor plan / photos before site visit
          </label>
        </Section>
        <Section label="Initial proposal status">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {PROPOSAL_OPTIONS.map((opt) => (
              <Chip key={opt.id} active={proposalStatus === opt.id} onClick={() => setProposalStatus(opt.id)} label={opt.label} />
            ))}
          </div>
        </Section>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, paddingTop: 16, borderTop: '0.5px solid var(--color-border-tertiary)' }}>
          <button
            type="button"
            onClick={() => onClose()}
            style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-tertiary)', fontSize: 13 }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-sm)',
              background: canSubmit ? 'var(--color-brand-accent)' : 'var(--color-background-tertiary)',
              color: canSubmit ? '#fff' : 'var(--color-text-tertiary)',
              fontSize: 13,
              fontWeight: 500,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
            }}
          >
            {entryPath === 'owner_direct' || proposalStatus === 'not_needed' ? 'Create project' : 'Create lead'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── helpers ───────────────────────────

function Section({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ marginBottom: 6 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          {label}
          {required && <span style={{ color: 'var(--color-text-danger)' }}> *</span>}
        </label>
        {hint && <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '5px 12px',
        fontSize: 12,
        borderRadius: 'var(--radius-full)',
        border: '0.5px solid ' + (active ? 'var(--color-brand-accent)' : 'var(--color-border-secondary)'),
        background: active ? 'var(--color-brand-accent)' : 'var(--color-background-tertiary)',
        color: active ? '#fff' : 'var(--color-text-secondary)',
        fontWeight: active ? 600 : 500,
      }}
    >
      {label}
    </button>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    width: '100%',
    padding: '8px 12px',
    fontSize: 13,
    borderRadius: 'var(--radius-sm)',
    border: '0.5px solid var(--color-border-secondary)',
    background: 'var(--color-background-primary)',
    color: 'var(--color-text-primary)',
  };
}
