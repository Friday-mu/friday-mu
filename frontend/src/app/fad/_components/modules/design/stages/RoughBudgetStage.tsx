'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  designClient,
  designFeeForTier,
  formatMUR,
  procurementFeeForTier,
  tierForEpc,
  withVAT,
  ROUGH_BUDGETS as FIXTURE_ROUGH_BUDGETS,
  type CatalogItem,
  type DesignProject,
  type DesignTier,
  type RoughBudget,
  type RoughBudgetEstimateLine,
} from '../../../../_data/design';
import { FRIDAY_CATALOG_HISTORY, FRIDAY_STYLE_GUIDE } from '../../../../_data/fridayCatalogHistory';
import { createRoughBudgetVersion, apiRoughBudgetVersionToFixture, tierNumToString, aiRoughBudgetEstimate, loadProject, apiProjectToFixture, listRoughBudgetItems, type AiRoughBudgetResponse, type ApiRoughBudgetItem } from '../../../../_data/designClient';
import { PROJECTS as FIXTURE_PROJECTS } from '../../../../_data/design';
import { bumpFixtureRev, useFixtureRev } from '../../../../_data/fixtureRev';
import { fireToast } from '../../../Toaster';
import { AIPlaceholder } from '../AIPlaceholder';
import { Hint } from '../Hint';

interface Props {
  project: DesignProject;
}

interface ItemRow {
  /** Local id for React keying. */
  rid: string;
  itemName: string;
  qty: number;
  /**
   * Per-row price override in minor units. null = use catalog median
   * (auto-pricing). When set, this becomes the single price for the row
   * (no Low/Mid/High spread — overrides are certain). Auto-filled from
   * catalog median when the user picks a suggestion; user can edit.
   */
  unitCostMinorOverride: number | null;
}

let _ridSeq = 1;
const newRid = () => `rb-line-${_ridSeq++}`;

export function RoughBudgetStage({ project }: Props) {
  const cfg = designClient.settings.annexA();
  // Global fixture-rev — versions list re-derives when a new version
  // is saved here OR when hydration repopulates FIXTURE_ROUGH_BUDGETS
  // (e.g. on project switch).
  const fixtureRev = useFixtureRev();
  const versions = useMemo<RoughBudget[]>(
    () => [...designClient.roughBudgets.list(project.id)].sort((a, b) => b.version - a.version),
    [project.id, fixtureRev],
  );
  const latest = versions[0];

  // Item-list state — start with a single empty row so the user sees the
  // affordance immediately.
  const [rows, setRows] = useState<ItemRow[]>(() => [
    { rid: newRid(), itemName: '', qty: 1, unitCostMinorOverride: null },
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
    () =>
      rows
        .filter((r) => r.itemName.trim() && r.qty > 0)
        .map((r) => ({
          itemName: r.itemName,
          qty: r.qty,
          unitCostMinorOverride: r.unitCostMinorOverride,
        })),
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
  const addRow = () => setRows((prev) => [...prev, { rid: newRid(), itemName: '', qty: 1, unitCostMinorOverride: null }]);

  // Which saved version (if any) the user clicked in the Versions list.
  // Renders a read-only modal showing that version's totals, fees, and
  // notes. Mathias reported the version rows weren't clickable
  // (feedback row ad56fe97-f828-...) — this is the "open" affordance.
  const [versionInspect, setVersionInspect] = useState<RoughBudget | null>(null);

  // ── AI Estimator state ───────────────────────────────────────────
  // Modal lifecycle + last response (so we can render provenance chips
  // next to the inserted rows). Each AI-suggested row carries its
  // sourceKeys via an internal map keyed by rid.
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiBrief, setAiBrief] = useState('');
  const [aiTier, setAiTier] = useState<DesignTier | ''>('');
  const [aiClassification, setAiClassification] = useState<'renovation' | 'furnishing' | 'mixed' | ''>('');
  const [aiPending, setAiPending] = useState(false);
  const [aiLastResponse, setAiLastResponse] = useState<AiRoughBudgetResponse | null>(null);
  const [aiSourceByRid, setAiSourceByRid] = useState<Record<string, string[]>>({});

  const sampleCatalogForAi = useMemo(() => {
    // Pick the top 4 entries per category by sample frequency so Kimi
    // gets a representative pool without blowing the 8k context window.
    // Sort within each category by samples-with-this-key.
    const keyCounts = new Map<string, number>();
    for (const e of FRIDAY_CATALOG_HISTORY) {
      keyCounts.set(e.normalizedKey, (keyCounts.get(e.normalizedKey) ?? 0) + 1);
    }
    const byCat = new Map<string, typeof FRIDAY_CATALOG_HISTORY>();
    for (const e of FRIDAY_CATALOG_HISTORY) {
      if (e.internalWork) continue;
      const arr = byCat.get(e.category) ?? [];
      arr.push(e);
      byCat.set(e.category, arr);
    }
    const out: Array<{ normalizedKey: string; displayName: string; category: string; vendor: string | null; unitCostMinor: number; sourceProjectLabel: string }> = [];
    for (const [, items] of byCat) {
      const sorted = [...items].sort((a, b) => (keyCounts.get(b.normalizedKey) ?? 0) - (keyCounts.get(a.normalizedKey) ?? 0));
      for (const e of sorted.slice(0, 4)) {
        out.push({
          normalizedKey: e.normalizedKey,
          displayName: e.displayName,
          category: e.category,
          vendor: e.vendor,
          unitCostMinor: e.unitCostMinor,
          sourceProjectLabel: e.sourceProjectLabel,
        });
      }
    }
    return out;
  }, []);

  const handleAiEstimate = async () => {
    if (!aiBrief.trim()) {
      fireToast('Brief is required.');
      return;
    }
    setAiPending(true);
    try {
      const response = await aiRoughBudgetEstimate({
        project_id: project.id,
        brief: aiBrief.trim(),
        target_tier: aiTier === '' ? null : aiTier,
        classification: aiClassification === '' ? null : aiClassification,
        project_context: {
          name: project.name,
          tier: project.tier,
          classification: project.classification,
          epcMinor: project.epcMinor,
          engagementScope: project.engagementScope,
        },
        catalog_sample: sampleCatalogForAi,
        style_guide: {
          notes: FRIDAY_STYLE_GUIDE.notes,
          priceRangesByCategory: FRIDAY_STYLE_GUIDE.priceRangesByCategory,
          preferredVendors: FRIDAY_STYLE_GUIDE.preferredVendors.slice(0, 8),
        },
        tier_rules: cfg as unknown as Record<string, unknown>,
      });
      setAiLastResponse(response);

      // Replace current rows with the AI-suggested lines. Each line
      // becomes an ItemRow with unitCostMinorOverride set to the
      // suggested unit cost so the row pins (no further catalog
      // lookup overrides the price).
      const newRows: ItemRow[] = [];
      const newSourceMap: Record<string, string[]> = {};
      for (const line of response.lines) {
        const rid = newRid();
        // Encode room into itemName as "[Room] item" so the room
        // grouping survives even without a structured roomId column.
        const roomPrefix = line.room && line.room !== 'Whole property' ? `[${line.room}] ` : '';
        newRows.push({
          rid,
          itemName: `${roomPrefix}${line.item}`,
          qty: line.qty || 1,
          unitCostMinorOverride: line.unitCostMinor || null,
        });
        newSourceMap[rid] = line.sourceKeys || [];
      }
      if (newRows.length > 0) {
        setRows(newRows);
        setAiSourceByRid(newSourceMap);
        // Also seed the narrative / next-steps if the user hasn't
        // typed anything yet. Don't clobber existing input.
        if (!nextSteps.trim() && response.narrative) {
          setNextSteps(response.narrative);
        }
      }
      setShowAiModal(false);
      fireToast(`AI estimate ready · ${response.lines.length} lines · ${response.source}.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fireToast(`AI estimate failed: ${msg}`);
    } finally {
      setAiPending(false);
    }
  };

  const [savingVersion, setSavingVersion] = useState(false);
  const handleSaveNewVersion = async () => {
    setSavingVersion(true);
    try {
      const payload = {
        project_id: project.id,
        low_minor: effectiveLow || null,
        mid_minor: effectiveMid || null,
        high_minor: effectiveHigh || null,
        tier: tierNumToString(tier),
        design_fee_minor: designFee ?? null,
        procurement_fee_minor: procurementFee ?? null,
        assumptions: assumptions || null,
        exclusions: exclusions || null,
        risk_items: riskItems || null,
        next_steps: nextSteps || null,
        status: 'draft' as const,
        line_items: validLines.map((line) => ({
          // Map ItemRow → backend line item shape. The fixture itemName
          // becomes the backend description; quantity carries from qty;
          // unit_cost_minor is the override or null (catalog median is
          // looked up at read-time, not pinned at save-time).
          description: line.itemName,
          quantity: line.qty,
          unit_cost_minor: line.unitCostMinorOverride ?? null,
        })),
      };
      const apiVersion = await createRoughBudgetVersion(payload);
      const fixtureVersion = apiRoughBudgetVersionToFixture(apiVersion);
      FIXTURE_ROUGH_BUDGETS.push(fixtureVersion);

      // Backend propagates the latest version's mid + fees onto the
      // project row (epc_minor, design_fee_minor, procurement_fee_minor).
      // Refetch + swap the project in FIXTURE_PROJECTS so Summary,
      // Annex B auto-fill, and Overview cards re-render with the new
      // numbers on the next fixtureRev bump.
      try {
        const refreshedApi = await loadProject(project.id);
        const refreshed = apiProjectToFixture(refreshedApi);
        const idx = FIXTURE_PROJECTS.findIndex((p) => p.id === project.id);
        if (idx >= 0) FIXTURE_PROJECTS.splice(idx, 1, refreshed);
        else FIXTURE_PROJECTS.push(refreshed);
      } catch {
        // Stale project view is acceptable; the next per-project
        // hydration will catch up.
      }

      bumpFixtureRev();
      fireToast(`v${fixtureVersion.version} saved (${apiVersion.line_items_inserted}/${validLines.length} items).`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fireToast(`Save failed: ${msg}`);
    } finally {
      setSavingVersion(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <Row>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Rough budget · estimate from past projects</h3>
          <button
            type="button"
            onClick={() => setShowAiModal(true)}
            data-rough-budget-ai-trigger
            data-ai-feature="rough-budget-estimate"
            style={{
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 500,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-brand-accent)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            ✨ Estimate from brief
          </button>
        </Row>
        {aiLastResponse && (
          <div
            data-ai-budget-receipt
            style={{
              marginTop: 10,
              padding: 8,
              fontSize: 11,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-brand-accent-softer)',
              border: '0.5px solid var(--color-brand-accent)',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.5,
            }}
          >
            <strong>AI estimate</strong> · {aiLastResponse.lines.length} lines · source: <code style={{ fontFamily: 'var(--font-mono-fad)' }}>{aiLastResponse.source}</code>
            {aiLastResponse.model ? ` · ${aiLastResponse.model}` : ''} · {(aiLastResponse.durationMs / 1000).toFixed(1)}s
            {aiLastResponse.contingencyPct ? ` · suggested contingency ${aiLastResponse.contingencyPct}%` : ''}
            {aiLastResponse.narrative && (
              <div style={{ marginTop: 4 }}>{aiLastResponse.narrative}</div>
            )}
          </div>
        )}
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
              aiSourceKeys={aiSourceByRid[row.rid]}
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
            <Field label="Design fee (computed, excl. VAT)">
              <input value={formatMUR(computedDesignFee)} disabled style={inputStyle()} />
            </Field>
            <Field label="Design fee (override, excl. VAT)">
              <MUInput value={designFeeOverride ?? ''} onChange={(v) => setDesignFeeOverride(v === '' ? null : (v as number))} />
            </Field>
            <Field label="Execution fee (computed, excl. VAT)">
              <input value={formatMUR(computedProcurementFee)} disabled style={inputStyle()} />
            </Field>
            <Field label="Execution fee (override, excl. VAT)">
              <MUInput value={procurementFeeOverride ?? ''} onChange={(v) => setProcurementFeeOverride(v === '' ? null : (v as number))} />
            </Field>
          </Grid>
        </div>
        {(designFee || procurementFee) && (() => {
          const designExcl = designFee ?? 0;
          const procurementExcl = procurementFee ?? 0;
          const totalExcl = designExcl + procurementExcl;
          const vatPct = (cfg.vatRate * 100).toFixed(cfg.vatRate * 100 % 1 === 0 ? 0 : 2);
          return (
            <div
              data-testid="rough-budget-fee-vat-preview"
              style={{
                marginTop: 10,
                padding: '8px 10px',
                background: 'var(--color-background-tertiary)',
                border: '0.5px solid var(--color-border-tertiary)',
                borderRadius: 'var(--radius-sm)',
                display: 'grid',
                gridTemplateColumns: 'minmax(110px, max-content) 1fr 1fr',
                gap: '4px 12px',
                fontSize: 11,
                alignItems: 'baseline',
              }}
            >
              <div style={{ gridColumn: 1, fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                Friday revenue
              </div>
              <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4, textAlign: 'right' }}>excl. VAT</div>
              <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4, textAlign: 'right' }}>incl. {vatPct}% VAT</div>
              <span style={{ color: 'var(--color-text-tertiary)' }}>Design fee</span>
              <span style={{ fontFamily: 'var(--font-mono-fad)', textAlign: 'right', color: 'var(--color-text-primary)' }}>{formatMUR(designExcl)}</span>
              <span style={{ fontFamily: 'var(--font-mono-fad)', textAlign: 'right', color: 'var(--color-text-secondary)' }}>{formatMUR(withVAT(designExcl, cfg))}</span>
              <span style={{ color: 'var(--color-text-tertiary)' }}>Execution fee</span>
              <span style={{ fontFamily: 'var(--font-mono-fad)', textAlign: 'right', color: 'var(--color-text-primary)' }}>{formatMUR(procurementExcl)}</span>
              <span style={{ fontFamily: 'var(--font-mono-fad)', textAlign: 'right', color: 'var(--color-text-secondary)' }}>{formatMUR(withVAT(procurementExcl, cfg))}</span>
              <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 600 }}>Total fee</span>
              <span style={{ fontFamily: 'var(--font-mono-fad)', textAlign: 'right', color: 'var(--color-text-primary)', fontWeight: 600 }}>{formatMUR(totalExcl)}</span>
              <span style={{ fontFamily: 'var(--font-mono-fad)', textAlign: 'right', color: 'var(--color-text-secondary)', fontWeight: 600 }}>{formatMUR(withVAT(totalExcl, cfg))}</span>
              <div style={{ gridColumn: '1 / -1', marginTop: 4, fontSize: 10, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
                On top of the EPC. Annex A is VAT-exclusive; {vatPct}% VAT added on top per Mauritius regulations.
              </div>
            </div>
          );
        })()}
      </Card>

      <Card>
        <h4 style={subhead()}>Narrative</h4>
        <Field label="Assumptions" full>
          <Hint
            body="What this budget DEPENDS ON being true. Each assumption is an unstated 'if X breaks, the number breaks too.' Make them explicit so a change in conditions is visible — not a surprise."
            examples={[
              'Owner provides existing curtain rails — not replaced as part of this budget',
              'Local artisan rate of Rs 1,500/day holds across the project window (no public-holiday spike)',
              'No structural works needed — walls / plumbing / electrical positions as found',
            ]}
          />
          <textarea value={assumptions} onChange={(e) => setAssumptions(e.target.value)} rows={3} style={textareaStyle()} placeholder="Gross of VAT. Excludes architect fees…" />
        </Field>
        <Field label="Exclusions" full>
          <Hint
            body="What this number does NOT cover. Anything the owner might assume IS included unless you spell it out. The most common dispute source — be ruthless about listing things that aren't here."
            examples={[
              'Architect fees (sub-contracted by owner) and planning permits',
              'Building insurance during the works window',
              'Owner-supplied artwork installation (frames, hanging, lighting)',
            ]}
          />
          <textarea value={exclusions} onChange={(e) => setExclusions(e.target.value)} rows={3} style={textareaStyle()} placeholder="Architect fees, planning permit, insurance…" />
        </Field>
        <Field label="Risk items" full>
          <Hint
            body="Where this budget COULD slip and by roughly how much. Cost volatility, supply lead times, vendor reliability, weather windows. The 'I'm telling you now, not in week 6' list. Each risk should have a vague magnitude — even if it's just S / M / L."
            examples={[
              'Imported fabric prices fluctuate ±15% over the project window — buffer +5% reserved',
              'Curtain workshop currently 4 weeks lead time; risk of slipping if booked late (S)',
              'Cyclone season overlap — exterior works may need a 1–2 week pause (M)',
            ]}
          />
          <textarea value={riskItems} onChange={(e) => setRiskItems(e.target.value)} rows={2} style={textareaStyle()} placeholder="Cost volatility flags, dependencies…" />
        </Field>
        <Field label="Next steps" full>
          <Hint
            body="The concrete things that need to happen next to lock this budget — typically before Annex B + signature. Each should have an owner and an approximate when. This is the action list, not a wish list."
            examples={[
              'Owner signs Annex B (this week)',
              'Confirm EPC schedule + vendor with site lead — by Friday',
              'Lock fabric selections — needs site visit photos finalised first',
            ]}
          />
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
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => setVersionInspect(v)}
                  data-rough-budget-version-row={v.id}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: 8,
                    border: '0.5px solid var(--color-border-tertiary)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-background-primary)',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <span><strong>v{v.version}</strong> · {v.status} · {v.createdAt.slice(0, 10)}</span>
                    <span style={{ color: 'var(--color-text-tertiary)' }}>
                      {formatMUR(v.lowMinor)} / <strong style={{ color: 'var(--color-text-primary)' }}>{formatMUR(v.midMinor)}</strong> / {formatMUR(v.highMinor)}
                      <span style={{ marginLeft: 8, color: 'var(--color-brand-accent)' }}>Open ↗</span>
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {versionInspect && (
        <VersionInspectModal version={versionInspect} onClose={() => setVersionInspect(null)} />
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <a
          href={`/design-docs/rough-budget?pid=${project.id}`}
          target="_blank"
          rel="noopener"
          data-doc-link="rough-budget"
          style={{ ...secondaryBtn(), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
        >
          Preview PDF ↗
        </a>
        <button
          type="button"
          onClick={handleSaveNewVersion}
          disabled={savingVersion}
          data-rough-budget-save
          style={{ ...primaryBtn(), opacity: savingVersion ? 0.5 : 1, cursor: savingVersion ? 'not-allowed' : 'pointer' }}
        >
          {savingVersion ? 'Saving…' : 'Save new version'}
        </button>
      </div>

      {showAiModal && (
        <div
          onClick={() => !aiPending && setShowAiModal(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            data-ai-budget-modal
            style={{ background: 'var(--color-background-primary)', borderRadius: 'var(--radius-md)', padding: 20, width: '100%', maxWidth: 520 }}
          >
            <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>✨ Estimate from brief</h3>
            <p style={{ margin: '0 0 14px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Describe the project in one or two sentences. Kimi grounds the result against Friday&apos;s 155-entry catalog + style guide.
              Every line will cite its source.
            </p>
            <Field label="Brief">
              <textarea
                value={aiBrief}
                onChange={(e) => setAiBrief(e.target.value)}
                rows={3}
                placeholder='e.g. "2-bed villa in Pereybere, Tier 2, mid-range Scandi with rattan accents, including kitchen + bathroom upgrades"'
                style={textareaStyle()}
                data-ai-budget-brief
                disabled={aiPending}
              />
            </Field>
            <Grid>
              <Field label="Tier override" hint="(optional — overrides project tier)">
                <select
                  value={aiTier === '' ? '' : String(aiTier)}
                  onChange={(e) => setAiTier(e.target.value === '' ? '' : (Number(e.target.value) as DesignTier))}
                  style={inputStyle()}
                  data-ai-budget-tier
                  disabled={aiPending}
                >
                  <option value="">— use project tier —</option>
                  <option value="1">T1 — renovation</option>
                  <option value="2">T2 — furnishing</option>
                  <option value="3">T3 — design-only</option>
                </select>
              </Field>
              <Field label="Classification override" hint="(optional)">
                <select
                  value={aiClassification}
                  onChange={(e) => setAiClassification((e.target.value as 'renovation' | 'furnishing' | 'mixed' | '') || '')}
                  style={inputStyle()}
                  data-ai-budget-classification
                  disabled={aiPending}
                >
                  <option value="">— use project classification —</option>
                  <option value="furnishing">Furnishing</option>
                  <option value="renovation">Renovation</option>
                  <option value="mixed">Mixed</option>
                </select>
              </Field>
            </Grid>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button
                type="button"
                onClick={() => setShowAiModal(false)}
                disabled={aiPending}
                style={secondaryBtn()}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAiEstimate}
                disabled={aiPending || !aiBrief.trim()}
                data-ai-budget-submit
                style={{
                  ...primaryBtn(),
                  opacity: aiPending || !aiBrief.trim() ? 0.5 : 1,
                  cursor: aiPending || !aiBrief.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {aiPending ? 'Thinking…' : '✨ Estimate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── item row ───────────────────────────

function ItemRowEditor({
  row,
  onChange,
  onRemove,
  canRemove,
  aiSourceKeys,
}: {
  row: ItemRow;
  onChange: (patch: Partial<ItemRow>) => void;
  onRemove: () => void;
  canRemove: boolean;
  aiSourceKeys?: string[];
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
        gridTemplateColumns: 'minmax(0, 1fr) 80px 130px auto',
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
                    // Autofill the price override with the catalog median
                    // when the user picks a suggestion AND hasn't already
                    // typed a custom price. They can still edit after.
                    const patch: Partial<ItemRow> = { itemName: s.displayName };
                    if (row.unitCostMinorOverride == null) {
                      patch.unitCostMinorOverride = s.medianMinor;
                    }
                    onChange(patch);
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
        {aiSourceKeys && aiSourceKeys.length > 0 && (
          <div
            data-row-ai-source
            style={{
              marginTop: 4,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 4,
              fontSize: 10,
              color: 'var(--color-text-tertiary)',
            }}
          >
            <span style={{ fontWeight: 500 }}>AI source:</span>
            {aiSourceKeys.map((k) => (
              <span
                key={k}
                style={{
                  padding: '0 6px',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--color-brand-accent-softer)',
                  color: 'var(--color-text-secondary)',
                  fontFamily: 'var(--font-mono-fad)',
                }}
              >
                {k}
              </span>
            ))}
          </div>
        )}
      </div>

      <input
        type="number"
        min={1}
        value={row.qty}
        onChange={(e) => onChange({ qty: Math.max(0, Number(e.target.value) || 0) })}
        style={{ ...inputStyle(), textAlign: 'right' }}
        aria-label="Quantity"
      />

      {/* Per-row price override (MUR major units). Empty = use catalog
          median for the auto-estimate. When user types a value, the row
          locks to that price (no Low/Mid/High spread). Auto-filled when
          a catalog suggestion is picked above. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <input
          inputMode="numeric"
          value={
            row.unitCostMinorOverride == null
              ? ''
              : Math.round(row.unitCostMinorOverride / 100).toString()
          }
          onChange={(e) => {
            const cleaned = e.target.value.replace(/[^\d]/g, '');
            if (cleaned === '') {
              onChange({ unitCostMinorOverride: null });
            } else {
              onChange({ unitCostMinorOverride: Number(cleaned) * 100 });
            }
          }}
          placeholder={
            exactMatch
              ? `Rs ${Math.round(exactMatch.medianMinor / 100)} (median)`
              : 'Rs unit price'
          }
          style={{ ...inputStyle(), textAlign: 'right' }}
          aria-label="Unit price (MUR)"
          data-rough-budget-unit-cost-input
        />
        {row.unitCostMinorOverride != null && exactMatch && (
          <button
            type="button"
            onClick={() => onChange({ unitCostMinorOverride: null })}
            style={{
              padding: '0 4px',
              fontSize: 10,
              background: 'transparent',
              color: 'var(--color-text-tertiary)',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'right',
              textDecoration: 'underline',
            }}
            aria-label="Reset to catalog median"
          >
            reset to median
          </button>
        )}
      </div>

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

// Read-only inspect modal — opens when the user clicks a row in the
// "Versions" list. Renders the version's totals, tier, fees, and the
// four notes fields exactly as saved. We don't load-into-editor here
// to avoid surprising state mutations; the user can copy whatever they
// need by eye and Save a new version.
function VersionInspectModal({ version, onClose }: { version: RoughBudget; onClose: () => void }) {
  // Mathias's feedback ad56fe97 — what he actually wanted from clicking
  // a saved version was to see the LINE ITEMS that made up that budget,
  // not just the totals. Line items live in design_rough_budgets and
  // carry version_id; we fetch the whole project's items and filter
  // client-side by version_id.
  const [lineItems, setLineItems] = useState<ApiRoughBudgetItem[] | null>(null);
  const [loadingItems, setLoadingItems] = useState(true);
  const [itemsError, setItemsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingItems(true);
    listRoughBudgetItems(version.projectId)
      .then((all) => {
        if (cancelled) return;
        // Older line items (from before migration 023) have null
        // version_id — they're "ambient" items that pre-dated
        // versioning. Don't show them on a specific version.
        const filtered = all.filter((i) => i.version_id === version.id);
        setLineItems(filtered);
        setLoadingItems(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setItemsError(err instanceof Error ? err.message : 'Failed to load line items');
        setLoadingItems(false);
      });
    return () => { cancelled = true; };
  }, [version.id, version.projectId]);

  const itemsTotal = useMemo(() => {
    if (!lineItems) return 0;
    return lineItems.reduce(
      (sum, i) => sum + (i.unit_cost_minor ?? 0) * (i.quantity ?? 0),
      0,
    );
  }, [lineItems]);

  return (
    <div className="fad-modal-overlay" onClick={onClose}>
      <div className="fad-modal" style={{ width: 720 }} onClick={(e) => e.stopPropagation()}>
        <div className="fad-modal-head">
          <div className="fad-modal-title">Rough budget v{version.version}</div>
          <span className="chip" style={{ marginLeft: 8 }}>{version.status}</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            saved {version.createdAt.slice(0, 10)}
          </span>
          <button type="button" className="fad-util-btn" style={{ marginLeft: 12 }} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="fad-modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
            <Stat label="Low" value={formatMUR(version.lowMinor)} />
            <Stat label="Mid" value={formatMUR(version.midMinor)} accent />
            <Stat label="High" value={formatMUR(version.highMinor)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
            <Stat label="Tier" value={(version.tier as string | null | undefined) ?? '—'} />
            <Stat label="Design fee" value={version.designFeeMinor != null ? formatMUR(version.designFeeMinor) : '—'} />
            <Stat label="Procurement fee" value={version.procurementFeeMinor != null ? formatMUR(version.procurementFeeMinor) : '—'} />
          </div>

          {/* Line items — the primary thing Mathias was looking for. */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-secondary)', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Line items {lineItems ? `(${lineItems.length})` : ''}</span>
              {lineItems && lineItems.length > 0 && (
                <span style={{ fontFamily: 'var(--font-mono-fad)', color: 'var(--color-text-tertiary)' }}>
                  items total: {formatMUR(itemsTotal)}
                </span>
              )}
            </div>
            {loadingItems && (
              <div style={{ padding: 12, fontSize: 12, color: 'var(--color-text-tertiary)' }}>Loading line items…</div>
            )}
            {itemsError && (
              <div style={{ padding: 12, fontSize: 12, color: 'var(--color-text-danger)' }}>{itemsError}</div>
            )}
            {!loadingItems && !itemsError && lineItems && lineItems.length === 0 && (
              <div style={{ padding: 12, fontSize: 12, color: 'var(--color-text-tertiary)', background: 'var(--color-background-tertiary)', borderRadius: 'var(--radius-sm)' }}>
                No line items were saved with this version. It was likely created using the manual low/mid/high override.
              </div>
            )}
            {!loadingItems && !itemsError && lineItems && lineItems.length > 0 && (
              <div style={{ overflowX: 'auto', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead style={{ background: 'var(--color-background-tertiary)' }}>
                    <tr>
                      <th style={lineItemCell('left')}>Item</th>
                      <th style={lineItemCell('left')}>Category</th>
                      <th style={lineItemCell('right')}>Qty</th>
                      <th style={lineItemCell('right')}>Unit cost</th>
                      <th style={lineItemCell('right')}>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((li) => {
                      const sub = (li.unit_cost_minor ?? 0) * (li.quantity ?? 0);
                      return (
                        <tr key={li.id} style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                          <td style={lineItemCell('left')}>{li.description ?? <em style={{ color: 'var(--color-text-tertiary)' }}>(no description)</em>}</td>
                          <td style={lineItemCell('left')}>{li.category_code ?? '—'}</td>
                          <td style={{ ...lineItemCell('right'), fontFamily: 'var(--font-mono-fad)' }}>{li.quantity ?? '—'}</td>
                          <td style={{ ...lineItemCell('right'), fontFamily: 'var(--font-mono-fad)' }}>{li.unit_cost_minor != null ? formatMUR(li.unit_cost_minor) : '—'}</td>
                          <td style={{ ...lineItemCell('right'), fontFamily: 'var(--font-mono-fad)', fontWeight: 500 }}>{formatMUR(sub)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <NotesBlock label="Assumptions" value={version.assumptions} />
          <NotesBlock label="Exclusions" value={version.exclusions} />
          <NotesBlock label="Risk items" value={version.riskItems} />
          <NotesBlock label="Next steps" value={version.nextSteps} />
        </div>
        <div className="fad-modal-foot">
          <button type="button" className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function lineItemCell(align: 'left' | 'right'): React.CSSProperties {
  return { padding: '6px 10px', textAlign: align, color: 'var(--color-text-primary)' };
}

function Stat({ label, value, accent }: { label: string; value: string | null; accent?: boolean }) {
  return (
    <div style={{ padding: 10, borderRadius: 'var(--radius-sm)', background: 'var(--color-background-tertiary)' }}>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-tertiary)' }}>{label}</div>
      <div style={{ fontSize: accent ? 16 : 14, fontWeight: accent ? 600 : 500, marginTop: 4, color: accent ? 'var(--color-brand-accent)' : 'var(--color-text-primary)' }}>
        {value || '—'}
      </div>
    </div>
  );
}

function NotesBlock({ label, value }: { label: string; value: string | null }) {
  if (!value || value.trim().length === 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-secondary)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap', padding: 10, background: 'var(--color-background-tertiary)', borderRadius: 'var(--radius-sm)' }}>
        {value}
      </div>
    </div>
  );
}
