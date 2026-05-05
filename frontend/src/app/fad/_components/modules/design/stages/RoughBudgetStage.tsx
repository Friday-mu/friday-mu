'use client';

import { useMemo, useState } from 'react';
import {
  designClient,
  designFeeForTier,
  formatMUR,
  procurementFeeForTier,
  tierForEpc,
  type CatalogItem,
  type DesignProject,
  type DesignTier,
  type RoughBudget,
  type RoughBudgetEstimateLine,
} from '../../../../_data/design';
import { AIPlaceholder } from '../AIPlaceholder';

interface Props {
  project: DesignProject;
}

interface ItemRow {
  /** Local id for React keying. */
  rid: string;
  itemName: string;
  qty: number;
}

let _ridSeq = 1;
const newRid = () => `rb-line-${_ridSeq++}`;

export function RoughBudgetStage({ project }: Props) {
  const cfg = designClient.settings.annexA();
  const versions = useMemo<RoughBudget[]>(
    () => [...designClient.roughBudgets.list(project.id)].sort((a, b) => b.version - a.version),
    [project.id],
  );
  const latest = versions[0];

  // Item-list state — start with a single empty row so the user sees the
  // affordance immediately.
  const [rows, setRows] = useState<ItemRow[]>(() => [
    { rid: newRid(), itemName: '', qty: 1 },
  ]);

  // Manual override of low/mid/high — used when the catalog estimate is
  // wrong or the project has scope items the catalog can't price.
  const [lowOverride, setLowOverride] = useState<number | ''>(latest?.lowMinor ?? '');
  const [midOverride, setMidOverride] = useState<number | ''>(latest?.midMinor ?? '');
  const [highOverride, setHighOverride] = useState<number | ''>(latest?.highMinor ?? '');
  const [tierOverride, setTierOverride] = useState<DesignTier | null>(latest?.tier ?? null);
  const [designFeeOverride, setDesignFeeOverride] = useState<number | null>(latest?.designFeeMinor ?? null);
  const [procurementFeeOverride, setProcurementFeeOverride] = useState<number | null>(latest?.procurementFeeMinor ?? null);
  const [assumptions, setAssumptions] = useState(latest?.assumptions ?? '');
  const [exclusions, setExclusions] = useState(latest?.exclusions ?? '');
  const [riskItems, setRiskItems] = useState(latest?.riskItems ?? '');
  const [nextSteps, setNextSteps] = useState(latest?.nextSteps ?? '');

  const validLines = useMemo<RoughBudgetEstimateLine[]>(
    () => rows.filter((r) => r.itemName.trim() && r.qty > 0).map((r) => ({ itemName: r.itemName, qty: r.qty })),
    [rows],
  );
  const estimate = useMemo(() => designClient.catalog.estimate(validLines), [validLines]);

  // Effective totals: catalog estimate unless user has typed an override.
  const effectiveLow = lowOverride === '' ? estimate.lowMinor : (lowOverride as number);
  const effectiveMid = midOverride === '' ? estimate.midMinor : (midOverride as number);
  const effectiveHigh = highOverride === '' ? estimate.highMinor : (highOverride as number);

  const computedTier: DesignTier | null = effectiveMid <= 0 ? null : tierForEpc(effectiveMid, cfg);
  const tier = tierOverride ?? computedTier;

  const computedDesignFee = tier && effectiveMid > 0 ? designFeeForTier(tier, effectiveMid, cfg) : null;
  const computedProcurementFee =
    tier && effectiveMid > 0
      ? procurementFeeForTier(tier, project.classification === 'mixed' ? 'renovation' : project.classification, effectiveMid, cfg)
      : null;
  const designFee = designFeeOverride ?? computedDesignFee;
  const procurementFee = procurementFeeOverride ?? computedProcurementFee;

  const updateRow = (rid: string, patch: Partial<ItemRow>) =>
    setRows((prev) => prev.map((r) => (r.rid === rid ? { ...r, ...patch } : r)));
  const removeRow = (rid: string) => setRows((prev) => prev.filter((r) => r.rid !== rid));
  const addRow = () => setRows((prev) => [...prev, { rid: newRid(), itemName: '', qty: 1 }]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <Row>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Rough budget · estimate from past projects</h3>
          <AIPlaceholder feature="rough-budget-estimate" label="Suggest items from property" size="sm" />
        </Row>
        <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
          Add the items this project needs. We&apos;ll price each one against
          what Friday actually paid on past projects to produce a
          historical-data-backed Low / Mid / High estimate. Manual override
          is available below if the catalog under- or over-estimates.
        </p>
      </Card>

      <Card>
        <Row>
          <h4 style={subhead()}>Project items</h4>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            {validLines.length} item{validLines.length === 1 ? '' : 's'} · {estimate.matched.length} priced from history · {estimate.unmatched.length} unpriced
          </span>
        </Row>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {rows.map((row) => (
            <ItemRowEditor
              key={row.rid}
              row={row}
              onChange={(patch) => updateRow(row.rid, patch)}
              onRemove={() => removeRow(row.rid)}
              canRemove={rows.length > 1}
            />
          ))}
        </div>

        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" onClick={addRow} style={addBtn()}>
            + Add item
          </button>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            Catalog draws from {designClient.catalog.list().length} historical line{designClient.catalog.list().length === 1 ? '' : 's'} across past Friday projects.
          </span>
        </div>
      </Card>

      <Card>
        <h4 style={subhead()}>Estimated EPC range</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <RangeStat label="Low (best-case prior)" valueMinor={effectiveLow} tone="success" />
          <RangeStat label="Mid (median prior)" valueMinor={effectiveMid} tone="info" highlight />
          <RangeStat label="High (worst-case prior)" valueMinor={effectiveHigh} tone="warning" />
        </div>

        {estimate.unmatched.length > 0 && (
          <div
            style={{
              marginTop: 12,
              padding: 10,
              borderLeft: '2px solid var(--color-text-warning)',
              background: 'var(--color-bg-warning)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 11,
              color: 'var(--color-text-warning)',
            }}
          >
            <strong>{estimate.unmatched.length} item{estimate.unmatched.length === 1 ? '' : 's'}</strong> {estimate.unmatched.length === 1 ? 'has' : 'have'} no historical data and {estimate.unmatched.length === 1 ? "isn't" : "aren't"} included in the totals: {estimate.unmatched.map((u) => u.itemName).join(', ')}. Either rename to match an existing catalog entry or use the manual override below.
          </div>
        )}

        <details style={{ marginTop: 12 }}>
          <summary style={{ fontSize: 12, cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
            Manual override (use if the catalog estimate is off)
          </summary>
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <Field label="Low (override, MUR)"><MUInput value={lowOverride} onChange={setLowOverride} /></Field>
            <Field label="Mid (override, MUR)" hint="Tier auto-calc anchor"><MUInput value={midOverride} onChange={setMidOverride} /></Field>
            <Field label="High (override, MUR)"><MUInput value={highOverride} onChange={setHighOverride} /></Field>
          </div>
        </details>
      </Card>

      <Card>
        <h4 style={subhead()}>Tier &amp; fees</h4>
        <Grid>
          <Field label="Computed tier" hint={`from Mid = ${formatMUR(effectiveMid > 0 ? effectiveMid : null)}`}>
            <input value={computedTier ? `Tier ${computedTier}` : '—'} disabled style={inputStyle()} />
          </Field>
          <Field label="Override tier">
            <select
              value={tierOverride ?? ''}
              onChange={(e) => setTierOverride(e.target.value === '' ? null : (Number(e.target.value) as DesignTier))}
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
            <Field label="Design fee (override)">
              <MUInput value={designFeeOverride ?? ''} onChange={(v) => setDesignFeeOverride(v === '' ? null : (v as number))} />
            </Field>
            <Field label="Procurement fee (computed)">
              <input value={formatMUR(computedProcurementFee)} disabled style={inputStyle()} />
            </Field>
            <Field label="Procurement fee (override)">
              <MUInput value={procurementFeeOverride ?? ''} onChange={(v) => setProcurementFeeOverride(v === '' ? null : (v as number))} />
            </Field>
          </Grid>
        </div>
        {(designFee || procurementFee) && (
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            Total Friday revenue if scope holds: {formatMUR((designFee ?? 0) + (procurementFee ?? 0))} on top of the EPC.
          </div>
        )}
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
        <a
          href={`/design-docs/${project.slug}/rough-budget`}
          target="_blank"
          rel="noopener"
          data-doc-link="rough-budget"
          style={{ ...secondaryBtn(), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
        >
          Preview PDF ↗
        </a>
        <button type="button" style={primaryBtn()}>Save new version</button>
      </div>
    </div>
  );
}

// ─────────────────────────── item row ───────────────────────────

function ItemRowEditor({
  row,
  onChange,
  onRemove,
  canRemove,
}: {
  row: ItemRow;
  onChange: (patch: Partial<ItemRow>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showWhereUsed, setShowWhereUsed] = useState(false);
  const suggestions = useMemo<CatalogItem[]>(
    () => (row.itemName.trim() ? designClient.catalog.search(row.itemName, 6) : []),
    [row.itemName],
  );
  const exactMatch = useMemo(
    () => designClient.catalog.lookup(row.itemName),
    [row.itemName],
  );
  const usage = useMemo(
    () => (exactMatch ? designClient.catalog.usage(exactMatch.key) : null),
    [exactMatch],
  );

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 80px auto',
        gap: 8,
        alignItems: 'start',
        padding: 8,
        background: 'var(--color-background-tertiary)',
        borderRadius: 'var(--radius-sm)',
      }}
    >
      <div style={{ position: 'relative' }}>
        <input
          value={row.itemName}
          onChange={(e) => onChange({ itemName: e.target.value })}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => window.setTimeout(() => setShowSuggestions(false), 120)}
          placeholder="e.g. Modular sofa, 3-seater + chaise"
          style={{ ...inputStyle(), minWidth: 0 }}
        />
        {showSuggestions && suggestions.length > 0 && (
          <ul
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              right: 0,
              maxHeight: 220,
              overflowY: 'auto',
              margin: 0,
              padding: 4,
              listStyle: 'none',
              background: 'var(--color-background-primary)',
              border: '0.5px solid var(--color-border-secondary)',
              borderRadius: 'var(--radius-sm)',
              zIndex: 20,
              boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
            }}
          >
            {suggestions.map((s) => (
              <li key={s.key}>
                <button
                  type="button"
                  data-catalog-suggest={s.key}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange({ itemName: s.displayName });
                    setShowSuggestions(false);
                  }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: 8,
                    fontSize: 12,
                    background: 'transparent',
                    color: 'var(--color-text-primary)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <div style={{ fontWeight: 500 }}>{s.displayName}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                    {s.category} · {formatMUR(s.medianMinor)} median · {s.sampleCount} prior sample{s.sampleCount === 1 ? '' : 's'}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        {exactMatch ? (
          <>
            <div
              style={{
                marginTop: 4,
                fontSize: 11,
                color: 'var(--color-text-info)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <span>
                <strong>{formatMUR(exactMatch.medianMinor)}</strong> median · {formatMUR(exactMatch.minMinor)}–{formatMUR(exactMatch.maxMinor)} · {exactMatch.sampleCount} prior sample{exactMatch.sampleCount === 1 ? '' : 's'}
              </span>
              {usage && usage.occurrences.length > 0 && (
                <button
                  type="button"
                  data-catalog-where-used={exactMatch.key}
                  onClick={() => setShowWhereUsed((v) => !v)}
                  style={{
                    padding: '1px 6px',
                    fontSize: 10,
                    background: 'var(--color-background-tertiary)',
                    color: 'var(--color-text-secondary)',
                    border: '0.5px solid var(--color-border-tertiary)',
                    borderRadius: 'var(--radius-full)',
                  }}
                >
                  {showWhereUsed ? 'hide' : 'where used'}
                </button>
              )}
            </div>
            {showWhereUsed && usage && usage.occurrences.length > 0 && (
              <ul
                data-catalog-where-used-list
                style={{
                  margin: '6px 0 0',
                  padding: '8px 10px',
                  listStyle: 'none',
                  background: 'var(--color-background-primary)',
                  border: '0.5px solid var(--color-border-tertiary)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  fontSize: 11,
                }}
              >
                {usage.occurrences.map((o) => (
                  <li key={o.itemId} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ minWidth: 0 }}>
                      <strong>{o.projectName}</strong>
                      <span style={{ color: 'var(--color-text-tertiary)' }}> · qty {o.qty}</span>
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono-fad)', color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>
                      {formatMUR(o.perUnitMinor)}/unit
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : row.itemName.trim() ? (
          <div style={{ marginTop: 4, fontSize: 11, color: 'var(--color-text-warning)' }}>
            No historical match — won&apos;t be priced. Pick from suggestions or rename.
          </div>
        ) : null}
      </div>

      <input
        type="number"
        min={1}
        value={row.qty}
        onChange={(e) => onChange({ qty: Math.max(0, Number(e.target.value) || 0) })}
        style={{ ...inputStyle(), textAlign: 'right' }}
        aria-label="Quantity"
      />

      <button
        type="button"
        onClick={onRemove}
        disabled={!canRemove}
        style={{
          padding: '6px 10px',
          fontSize: 11,
          borderRadius: 'var(--radius-sm)',
          background: 'transparent',
          color: canRemove ? 'var(--color-text-tertiary)' : 'var(--color-border-tertiary)',
          border: '0.5px solid var(--color-border-tertiary)',
          cursor: canRemove ? 'pointer' : 'not-allowed',
        }}
        aria-label="Remove item"
      >
        Remove
      </button>
    </div>
  );
}

function RangeStat({
  label,
  valueMinor,
  tone,
  highlight,
}: {
  label: string;
  valueMinor: number;
  tone: 'success' | 'info' | 'warning';
  highlight?: boolean;
}) {
  const colourMap = {
    success: 'var(--color-text-success)',
    info: 'var(--color-text-info)',
    warning: 'var(--color-text-warning)',
  } as const;
  const bgMap = {
    success: 'var(--color-bg-success)',
    info: 'var(--color-bg-info)',
    warning: 'var(--color-bg-warning)',
  } as const;
  return (
    <div
      style={{
        background: highlight ? bgMap[tone] : 'var(--color-background-tertiary)',
        border: highlight ? `1px solid ${colourMap[tone]}` : '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--radius-md)',
        padding: 12,
      }}
    >
      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </div>
      <div
        style={{
          marginTop: 4,
          fontFamily: 'var(--font-mono-fad)',
          fontSize: highlight ? 18 : 16,
          fontWeight: 600,
          color: valueMinor > 0 ? colourMap[tone] : 'var(--color-text-tertiary)',
        }}
      >
        {valueMinor > 0 ? formatMUR(valueMinor) : '—'}
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
function addBtn(): React.CSSProperties { return { padding: '6px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--color-brand-accent-soft)', color: 'var(--color-brand-accent)', fontSize: 12, fontWeight: 500 }; }
