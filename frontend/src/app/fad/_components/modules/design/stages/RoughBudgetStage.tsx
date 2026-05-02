'use client';

import { useMemo, useState } from 'react';
import {
  designClient,
  designFeeForTier,
  formatMUR,
  procurementFeeForTier,
  tierForEpc,
  type DesignProject,
  type DesignTier,
  type RoughBudget,
} from '../../../../_data/design';
import { AIPlaceholder } from '../AIPlaceholder';

interface Props {
  project: DesignProject;
}

export function RoughBudgetStage({ project }: Props) {
  const cfg = designClient.settings.annexA();
  const versions = useMemo<RoughBudget[]>(
    () => [...designClient.roughBudgets.list(project.id)].sort((a, b) => b.version - a.version),
    [project.id],
  );
  const latest = versions[0];

  // Form state — initialised from latest version (or empty for Albion).
  const [low, setLow] = useState<number | ''>(latest?.lowMinor ?? '');
  const [mid, setMid] = useState<number | ''>(latest?.midMinor ?? '');
  const [high, setHigh] = useState<number | ''>(latest?.highMinor ?? '');
  const [tierOverride, setTierOverride] = useState<DesignTier | null>(latest?.tier ?? null);
  const [designFeeOverride, setDesignFeeOverride] = useState<number | null>(latest?.designFeeMinor ?? null);
  const [procurementFeeOverride, setProcurementFeeOverride] = useState<number | null>(latest?.procurementFeeMinor ?? null);
  const [assumptions, setAssumptions] = useState(latest?.assumptions ?? '');
  const [exclusions, setExclusions] = useState(latest?.exclusions ?? '');
  const [riskItems, setRiskItems] = useState(latest?.riskItems ?? '');
  const [nextSteps, setNextSteps] = useState(latest?.nextSteps ?? '');

  const computedTier: DesignTier | null = mid === '' ? null : tierForEpc(mid as number, cfg);
  const tier = tierOverride ?? computedTier;

  const computedDesignFee = tier && mid !== '' ? designFeeForTier(tier, mid as number, cfg) : null;
  const computedProcurementFee = tier && mid !== '' ? procurementFeeForTier(tier, project.classification === 'mixed' ? 'renovation' : project.classification, mid as number, cfg) : null;

  const designFee = designFeeOverride ?? computedDesignFee;
  const procurementFee = procurementFeeOverride ?? computedProcurementFee;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <Row>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Rough budget · preliminary EPC</h3>
          <AIPlaceholder feature="rough-budget-estimate" label="Generate estimate" size="sm" />
        </Row>
        <p style={{ margin: '4px 0 12px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          Manual entry v0.1. Tier auto-calculates from Mid (per Annex A); fees auto-calc from tier + classification. All overrides recorded.
        </p>
      </Card>

      <Card>
        <h4 style={subhead()}>Low / Mid / High estimate (MUR)</h4>
        <Grid>
          <Field label="Low (MUR)"><MUInput value={low} onChange={setLow} /></Field>
          <Field label="Mid (MUR)" hint="Tier auto-calc anchor"><MUInput value={mid} onChange={setMid} /></Field>
          <Field label="High (MUR)"><MUInput value={high} onChange={setHigh} /></Field>
        </Grid>
      </Card>

      <Card>
        <h4 style={subhead()}>Tier &amp; fees</h4>
        <Grid>
          <Field label="Computed tier" hint={`from Mid = ${formatMUR(mid === '' ? null : mid as number)}`}>
            <input value={computedTier ? `Tier ${computedTier}` : '—'} disabled style={inputStyle()} />
          </Field>
          <Field label="Override tier">
            <select
              value={tierOverride ?? ''}
              onChange={(e) => setTierOverride(e.target.value === '' ? null : Number(e.target.value) as DesignTier)}
              style={inputStyle()}
            >
              <option value="">Use computed</option>
              <option value="1">Tier 1</option>
              <option value="2">Tier 2</option>
              <option value="3">Tier 3</option>
            </select>
          </Field>
        </Grid>
        <div style={{ marginTop: 12 }}>
          <Grid>
            <Field label="Design fee (computed)">
              <input value={formatMUR(computedDesignFee)} disabled style={inputStyle()} />
            </Field>
            <Field label="Design fee (override)"><MUInput value={designFeeOverride ?? ''} onChange={(v) => setDesignFeeOverride(v === '' ? null : v as number)} /></Field>
            <Field label="Procurement fee (computed)">
              <input value={formatMUR(computedProcurementFee)} disabled style={inputStyle()} />
            </Field>
            <Field label="Procurement fee (override)"><MUInput value={procurementFeeOverride ?? ''} onChange={(v) => setProcurementFeeOverride(v === '' ? null : v as number)} /></Field>
          </Grid>
        </div>
      </Card>

      <Card>
        <h4 style={subhead()}>Narrative</h4>
        <Field label="Assumptions" full>
          <textarea value={assumptions} onChange={(e) => setAssumptions(e.target.value)} rows={3} style={textareaStyle()} placeholder="Gross of VAT. Excludes architect fees…" />
        </Field>
        <Field label="Exclusions" full>
          <textarea value={exclusions} onChange={(e) => setExclusions(e.target.value)} rows={3} style={textareaStyle()} placeholder="Architect fees, planning permit, insurance…" />
        </Field>
        <Field label="Risk items" full>
          <textarea value={riskItems} onChange={(e) => setRiskItems(e.target.value)} rows={2} style={textareaStyle()} placeholder="Cost volatility flags, dependencies…" />
        </Field>
        <Field label="Next steps" full>
          <textarea value={nextSteps} onChange={(e) => setNextSteps(e.target.value)} rows={2} style={textareaStyle()} placeholder="Annex B + signature, EPC confirmation, …" />
        </Field>
      </Card>

      <Card>
        <h4 style={subhead()}>Versions</h4>
        {versions.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>No saved versions yet. Save to create v1.</div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {versions.map((v) => (
              <li key={v.id} style={{ padding: 8, border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <span><strong>v{v.version}</strong> · {v.status} · {v.createdAt.slice(0, 10)}</span>
                  <span style={{ color: 'var(--color-text-tertiary)' }}>
                    {formatMUR(v.lowMinor)} / <strong style={{ color: 'var(--color-text-primary)' }}>{formatMUR(v.midMinor)}</strong> / {formatMUR(v.highMinor)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" style={secondaryBtn()}>Preview PDF</button>
        <button type="button" style={primaryBtn()}>Save new version</button>
      </div>
    </div>
  );
}

// ─────────────────────────── shells ───────────────────────────

function MUInput({ value, onChange }: { value: number | ''; onChange: (v: number | '') => void }) {
  return (
    <input
      inputMode="numeric"
      value={value === '' ? '' : Math.round((value as number) / 100).toString()}
      onChange={(e) => {
        const cleaned = e.target.value.replace(/[^\d]/g, '');
        if (cleaned === '') return onChange('');
        onChange(Number(cleaned) * 100);
      }}
      placeholder="MUR amount"
      style={inputStyle()}
    />
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)', padding: 14 }}>{children}</div>;
}
function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>{children}</div>;
}
function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>{children}</div>;
}
function Field({ label, hint, full, children }: { label: string; hint?: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : 'auto', marginBottom: 6 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>{label}</label>
      {hint && <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>{hint}</div>}
      {children}
    </div>
  );
}
function subhead(): React.CSSProperties { return { margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }; }
function inputStyle(): React.CSSProperties {
  return { width: '100%', padding: '6px 10px', fontSize: 12, borderRadius: 'var(--radius-sm)', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' };
}
function textareaStyle(): React.CSSProperties { return { ...inputStyle(), resize: 'vertical' }; }
function primaryBtn(): React.CSSProperties { return { padding: '8px 16px', borderRadius: 'var(--radius-sm)', background: 'var(--color-brand-accent)', color: '#fff', fontSize: 13, fontWeight: 500 }; }
function secondaryBtn(): React.CSSProperties { return { padding: '8px 16px', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-tertiary)', color: 'var(--color-text-primary)', fontSize: 13 }; }
