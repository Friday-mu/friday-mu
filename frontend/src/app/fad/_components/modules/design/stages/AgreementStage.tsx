'use client';

import { useMemo, useState } from 'react';
import {
  designClient,
  designFeeForTier,
  formatMUR,
  procurementFeeForTier,
  withVAT,
  type AgreementStatus,
  type AnnexAConfig,
  type AnnexBData,
  type DesignProject,
  type DesignTier,
  type ProjectClassification,
} from '../../../../_data/design';
import { fireToast } from '../../../Toaster';
import { AIPlaceholder } from '../AIPlaceholder';

interface Props {
  project: DesignProject;
}

const STATUS_LABEL: Record<AgreementStatus, string> = {
  draft: 'Draft',
  sent: 'Sent for signature',
  viewed_by_client: 'Viewed by client',
  signed_by_client: 'Signed by client',
  completed: 'Completed',
};

export function AgreementStage({ project }: Props) {
  const cfg = designClient.settings.annexA();
  const existing = designClient.agreement.get(project.id);
  const counterparty = designClient.counterparties.get(project.counterpartyId);
  const property = designClient.properties.get(project.propertyId);

  // design-be-23: project-level engagement fork. design-only locks the
  // procurement fee to 0 and swaps §3.2 phrasing to "NOT INCLUDED".
  const isDesignOnly = project.engagementScope === 'design_only';

  // ── Annex B form state ─────────────────────────────────────────
  const [clientName, setClientName] = useState(existing?.annexB.clientName ?? counterparty?.fullName ?? '');
  const [clientAddress, setClientAddress] = useState(existing?.annexB.clientAddress ?? property?.address ?? '');
  const [clientNic, setClientNic] = useState(existing?.annexB.clientNic ?? counterparty?.nic ?? '');
  const [projectAddress, setProjectAddress] = useState(existing?.annexB.projectAddress ?? property?.address ?? '');
  const [classification, setClassification] = useState<ProjectClassification>(existing?.annexB.classification ?? (project.classification === 'mixed' ? 'renovation' : project.classification));
  const [tier, setTier] = useState<DesignTier>(existing?.annexB.tier ?? project.tier ?? 1);
  const [epcMinor, setEpcMinor] = useState<number>(existing?.annexB.epcMinor ?? project.epcMinor ?? 0);
  const [designFeeMinor, setDesignFeeMinor] = useState<number>(existing?.annexB.designFeeMinor ?? designFeeForTier(tier, epcMinor, cfg));
  // design-be-23: design-only engagements have NO procurement fee. The
  // input below renders read-only at 0 with helper text; the hypothetical
  // full-scope figure stays available via procurementFeeForTier() for the
  // "would be Rs X if full-scope" preview below.
  const [procurementFeeMinor, setProcurementFeeMinor] = useState<number>(
    isDesignOnly
      ? 0
      : existing?.annexB.procurementFeeMinor ?? procurementFeeForTier(tier, classification, epcMinor, cfg),
  );
  // Always-derivable hypothetical for the design-only preview line.
  const hypotheticalProcurementMinor = procurementFeeForTier(tier, classification, epcMinor, cfg);
  const [startDate, setStartDate] = useState(existing?.annexB.startDate ?? project.startDate ?? '');
  const [estimatedCompletion, setEstimatedCompletion] = useState(existing?.annexB.estimatedCompletion ?? project.estimatedCompletion ?? '');
  const [saleOfFurniture, setSaleOfFurniture] = useState(existing?.annexB.saleOfFurniture ?? false);
  const [strWorkingCapital, setStrWorkingCapital] = useState(existing?.annexB.strWorkingCapital ?? false);
  const [customInclusions, setCustomInclusions] = useState(existing?.annexB.customInclusions ?? '');
  const [effectiveDate, setEffectiveDate] = useState(existing?.annexB.effectiveDate ?? new Date().toISOString().slice(0, 10));

  const totalEstimateMinor = designFeeMinor + procurementFeeMinor + epcMinor;
  const annexB: AnnexBData = useMemo(() => ({
    clientName, clientAddress, clientNic, projectAddress, classification, tier,
    designFeeMinor, epcMinor, procurementFeeMinor, totalEstimateMinor,
    startDate: startDate || null, estimatedCompletion: estimatedCompletion || null,
    saleOfFurniture, strWorkingCapital, customInclusions, effectiveDate,
  }), [clientName, clientAddress, clientNic, projectAddress, classification, tier, designFeeMinor, epcMinor, procurementFeeMinor, totalEstimateMinor, startDate, estimatedCompletion, saleOfFurniture, strWorkingCapital, customInclusions, effectiveDate]);

  const status = existing?.status ?? 'draft';
  // B3.11: single approver. Send is gated only on Annex B form completeness.
  // design-be-23: procurementFeeMinor is intentionally 0 under design_only,
  // so it's excluded from the >0 gate when scope is design-only.
  const formComplete =
    clientName.trim().length > 0 &&
    clientAddress.trim().length > 0 &&
    projectAddress.trim().length > 0 &&
    epcMinor > 0 &&
    designFeeMinor > 0 &&
    (isDesignOnly || procurementFeeMinor > 0) &&
    effectiveDate.trim().length > 0;
  const canSend = status === 'draft' && formComplete;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <Row>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Agreement &amp; Annex B</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusBadge status={status} />
            <AIPlaceholder feature="agreement-autofill" label="Auto-fill from project" size="sm" />
          </div>
        </Row>
        <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          Annex A is configured in <strong>Settings</strong>. Annex B is per-project (this form). Section 13 of the agreement: <em>Annex B prevails on conflict</em>.
        </p>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 16 }} className="design-agreement-grid">
        {/* Annex B form */}
        <Card>
          <h4 style={subhead()}>Annex B — Project Summary</h4>
          <Grid>
            <Field label="Client name (counterparty)" full>
              <input value={clientName} onChange={(e) => setClientName(e.target.value)} style={inputStyle()} />
            </Field>
            <Field label="Client address" full><input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} style={inputStyle()} /></Field>
            <Field label="Client NIC"><input value={clientNic} onChange={(e) => setClientNic(e.target.value)} style={inputStyle()} placeholder="A1234567890123" /></Field>
            <Field label="Effective date"><input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} style={inputStyle()} /></Field>
            <Field label="Project address" full><input value={projectAddress} onChange={(e) => setProjectAddress(e.target.value)} style={inputStyle()} /></Field>
            <Field label="Classification">
              <select value={classification} onChange={(e) => setClassification(e.target.value as ProjectClassification)} style={inputStyle()}>
                <option value="renovation">Renovation</option>
                <option value="furnishing">Furnishing</option>
                <option value="mixed">Mixed</option>
              </select>
            </Field>
            <Field label="Design tier">
              <select value={tier} onChange={(e) => setTier(Number(e.target.value) as DesignTier)} style={inputStyle()}>
                <option value="1">Tier 1</option>
                <option value="2">Tier 2</option>
                <option value="3">Tier 3</option>
              </select>
            </Field>
            <Field label="EPC (MUR)"><MUInput value={epcMinor} onChange={setEpcMinor} /></Field>
            <Field label="Design fee (MUR, excl. VAT)"><MUInput value={designFeeMinor} onChange={setDesignFeeMinor} /></Field>
            {/* design-be-23: design-only locks the procurement fee at 0
               with a read-only display + helper text. Full-scope keeps
               the editable input. Hypothetical "would be Rs X if full-
               scope" surfaces below for owner reference. */}
            {isDesignOnly ? (
              <Field label="Execution fee (MUR, excl. VAT)">
                <input
                  value={formatMUR(0)}
                  disabled
                  data-testid="execution-fee-design-only"
                  aria-label="Execution fee (read-only, design only)"
                  style={inputStyle()}
                />
                <div
                  style={{ marginTop: 4, fontSize: 11, color: 'var(--color-text-tertiary)', fontStyle: 'italic', lineHeight: 1.4 }}
                >
                  Design-only engagement — no procurement fee.{' '}
                  {hypotheticalProcurementMinor > 0 && (
                    <span data-testid="hypothetical-procurement-fee">
                      (Would be {formatMUR(hypotheticalProcurementMinor)} if full-scope.)
                    </span>
                  )}
                </div>
              </Field>
            ) : (
              <Field label="Execution fee (MUR, excl. VAT)"><MUInput value={procurementFeeMinor} onChange={setProcurementFeeMinor} /></Field>
            )}
            <Field label="Total estimate (auto, excl. VAT)">
              <input value={formatMUR(totalEstimateMinor)} disabled style={inputStyle()} />
            </Field>
            <Field label="Fee breakdown w/ VAT" full>
              <FeeVatBreakdown
                designMinor={designFeeMinor}
                executionMinor={procurementFeeMinor}
                cfg={cfg}
              />
            </Field>
            <Field label="Start date"><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle()} /></Field>
            <Field label="Estimated completion"><input type="date" value={estimatedCompletion} onChange={(e) => setEstimatedCompletion(e.target.value)} style={inputStyle()} /></Field>
            <Field label="Sale of existing furniture (10% commission)" full>
              <label style={cb()}><input type="checkbox" checked={saleOfFurniture} onChange={(e) => setSaleOfFurniture(e.target.checked)} /> Friday assists with selling existing furniture</label>
            </Field>
            <Field label="STR working capital option" full>
              <label style={cb()}><input type="checkbox" checked={strWorkingCapital} onChange={(e) => setStrWorkingCapital(e.target.checked)} /> Surplus retained as STR working capital (per §4.2)</label>
            </Field>
            <Field label="Specific inclusions / milestone overrides" full>
              <textarea value={customInclusions} onChange={(e) => setCustomInclusions(e.target.value)} rows={3} style={textareaStyle()} placeholder="e.g. 20/40/40 procurement fee split (Nursoo-style)" />
            </Field>
          </Grid>
        </Card>

        {/* Preview pane */}
        <Card>
          <h4 style={subhead()}>Agreement preview</h4>
          <div
            style={{
              fontSize: 11,
              color: 'var(--color-text-secondary)',
              maxHeight: 600,
              overflowY: 'auto',
              padding: 12,
              border: '0.5px solid var(--color-border-tertiary)',
              borderRadius: 'var(--radius-sm)',
              fontFamily: 'var(--font-mono-fad)',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.5,
            }}
          >
            {renderAgreement(annexB, cfg, { isDesignOnly })}
          </div>
        </Card>
      </div>

      {/* Action bar */}
      <Card>
        <Row>
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            {status === 'draft' && (formComplete
              ? 'Annex B complete. Send for signature when ready.'
              : 'Complete the required Annex B fields to enable send.')}
            {(status === 'sent' || status === 'viewed_by_client' || status === 'signed_by_client' || status === 'completed') && 'Sent — see audit trail below.'}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a
              href={`/design-docs/${project.slug}/agreement`}
              target="_blank"
              rel="noopener"
              data-doc-link="agreement"
              style={{ ...secondaryBtn(), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
            >
              Open print preview ↗
            </a>
            <button type="button" style={secondaryBtn()} onClick={() => fireToast('Draft saved (mock)')}>Save draft</button>
            <button
              type="button"
              disabled={!canSend}
              onClick={() => fireToast('Sent for signature (mock — §7.QQ Eversign rebuild ships in the wiring sprint)')}
              style={canSend ? primaryBtn() : disabledBtn()}
              title={canSend ? '' : status !== 'draft' ? 'Already sent' : 'Annex B form incomplete'}
            >
              Send for signature
            </button>
          </div>
        </Row>
      </Card>

      {/* Audit trail. Defensive .length — API-hydrated agreements may
          omit events entirely (the prod design_agreements table has no
          events column yet; that's part of the in-portal digital signing
          feature, Tier A #3). Without the guard, existing.events.length
          throws "Cannot read properties of undefined" and the React
          error boundary takes the whole page down. */}
      {existing && (existing.events?.length ?? 0) > 0 && (
        <Card>
          <h4 style={subhead()}>Audit trail</h4>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(existing.events ?? []).map((e, i) => (
              <li key={i} style={{ fontSize: 12, padding: 6, borderLeft: '2px solid var(--color-brand-accent)', paddingLeft: 8 }}>
                <strong>{STATUS_LABEL[e.status]}</strong> · {e.at.slice(0, 16).replace('T', ' ')} · {e.userId ?? '—'}
                {e.note && <div style={{ color: 'var(--color-text-tertiary)', marginTop: 2 }}>{e.note}</div>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: AgreementStatus }) {
  const tone =
    status === 'completed' || status === 'signed_by_client' ? 'success' :
    status === 'sent' || status === 'viewed_by_client' ? 'info' :
    'neutral';
  const bg = tone === 'success' ? 'var(--color-bg-success)' :
             tone === 'info'    ? 'var(--color-bg-info)' :
                                  'var(--color-background-tertiary)';
  const fg = tone === 'success' ? 'var(--color-text-success)' :
             tone === 'info'    ? 'var(--color-text-info)' :
                                  'var(--color-text-secondary)';
  return (
    <span style={{ padding: '2px 10px', borderRadius: 'var(--radius-full)', background: bg, color: fg, fontSize: 11, fontWeight: 500 }}>
      {STATUS_LABEL[status]}
    </span>
  );
}

// ─────────────────────────── agreement boilerplate ───────────────────────────
//
// Verbatim from build doc §5.6 (Sep 2025 Nursoo template). Merge fields filled
// from Annex B form data above. v0.2 generates the actual PDF via §7.QQ.
//
// design-be-20d: VAT lines wired into both §3 (Fees & Payment Terms) and the
// Annex B Project Summary block. Annex A is VAT-exclusive (locked 2026-05-13);
// the contract now states the inclusive amounts in line with the schedule.
// design-be-23: §1.2 + §3.2 switch to "NOT INCLUDED" phrasing under
// design_only — the owner retains all sourcing, vendor management, and
// installation responsibilities. The Annex B summary echoes the same.
function renderAgreement(
  b: AnnexBData,
  cfg: AnnexAConfig,
  opts: { isDesignOnly?: boolean } = {},
): string {
  const templateVersion = cfg.agreementTemplateVersion;
  const vatPct = (cfg.vatRate * 100).toFixed(cfg.vatRate * 100 % 1 === 0 ? 0 : 2);
  const designInclMinor = withVAT(b.designFeeMinor, cfg);
  const procurementInclMinor = withVAT(b.procurementFeeMinor, cfg);
  const totalInclMinor = withVAT(b.totalEstimateMinor, cfg);
  const designOnly = !!opts.isDesignOnly;
  const scopeOneTwo = designOnly
    ? '1.2 Procurement & Execution Phase: NOT INCLUDED. Client retains all sourcing, vendor management, and installation responsibilities.'
    : '1.2 Procurement & Execution Phase (Optional Add-On): Sourcing, procurement, logistics coordination, Furniture sourcing & styling, Labour and contractor supervision, On-site styling and installation';
  const scopeOneTwoFollowUp = designOnly
    ? ''
    : '\nProcurement & Execution services may only commence after completion of the Design & Planning phase.';
  const threeTwo = designOnly
    ? '3.2 Procurement & Execution: NOT INCLUDED. Client retains all sourcing, vendor management, and installation responsibilities. No procurement fee is charged under this design-only engagement.'
    : `3.2 Procurement & Execution Fee: ${formatMUR(b.procurementFeeMinor)} excl. VAT (${formatMUR(procurementInclMinor)} incl. VAT @ ${vatPct}%) as a percentage of EPC. EPC: ${formatMUR(b.epcMinor)}. Tier ${b.tier} ${b.classification}. 60/40 default split unless overridden.`;
  const executionLine = designOnly
    ? 'Execution fee:        NOT INCLUDED (design-only engagement)'
    : `Execution fee:        ${formatMUR(b.procurementFeeMinor)}  (${formatMUR(procurementInclMinor)} incl. ${vatPct}% VAT)`;
  return `INTERIOR DESIGN AGREEMENT — TEMPLATE ${templateVersion}

This Interior Design Agreement (the "Agreement") is entered into on ${b.effectiveDate || '____________'}, by and between:

Friday Retreats Ltd, a company duly registered in Mauritius, having its registered address at No.34, Le Datier Complex, Ave des Vergers, Morc Bismic, Flic en Flac MAURITIUS, bearing Business Registration Number C24206082, represented by its Director, Ishant Ayadassen, holder of ID number A1207962905878, hereinafter referred to as the "Service Provider";

AND

${b.clientName || '____________'}, residing at ${b.clientAddress || '____________'}, holder of NIC number ${b.clientNic || '____________'}, hereinafter referred to as the "Client".

The Service Provider and the Client shall individually be referred to as "Party" collectively be referred to as the "Parties."

This Agreement is issued following the Service Provider's site visit, project classification, and prior communication of the proposed scope, pricing, and timeline. By signing below, the Client affirms their agreement to proceed under the terms outlined herein and the specific details contained in the attached Project Annex (Annex B).

1. Scope of Services
1.1 Design & Planning Phase: Moodboard (style & colors), Budget estimate, 3D designs for all rooms (if applicable)
${scopeOneTwo}${scopeOneTwoFollowUp}

2. Project Classification
The Project is classified as ${b.classification.toUpperCase()} (per Annex B).

3. Fees & Payment Terms
3.1 Design Fee: ${formatMUR(b.designFeeMinor)} excl. VAT (${formatMUR(designInclMinor)} incl. VAT @ ${vatPct}%) (Tier ${b.tier} — see Annex A). 60% upon signing this Agreement, 40% upon submission of final design package.
${threeTwo}
3.3 VAT: All fees quoted in Annex A are exclusive of VAT. Mauritius VAT (currently ${vatPct}%) is added on top of all fees per the prevailing rate.
3.4 Fee Adjustments: If scope or EPC materially changes by ±5% or more, fees may unilaterally be adjusted proportionally by the Service Provider with prior written notice.
3.5 Invoice Terms: Due within 7 calendar days. Late: 2% per month compounded.

4. Budget Reconciliation
4.1 On project completion, reconciliation conducted.
4.2 Surplus: refunded OR retained as STR working capital ${b.strWorkingCapital ? '(opted IN per Annex B)' : '(NOT opted in)'}.

5. Sale of Existing Furniture
${b.saleOfFurniture ? '5.1 Friday Retreats receives 10% commission on gross proceeds; net credited to project budget.' : '5.1 (Not applicable — Annex B did not opt into this service.)'}

6. Intellectual Property
All designs remain the sole IP of Service Provider. Client granted non-exclusive royalty-free licence for use at the Property only.

7. Liability
Service Provider not liable for third-party contractor/vendor delays. Aggregate liability capped at fees paid.

8. Termination
Either Party may terminate with 7 days' written notice. Advance payments non-refundable.

9. Notices
Email or WhatsApp message to verified contacts.

10. Dispute Resolution
Good-faith negotiation → MCCI mediation → District/Intermediate Court of Mauritius.

11. Governing Law
Laws of Mauritius.

12. Confidentiality
Mutual; Client authorises Service Provider to photograph completed interiors for portfolio/marketing (name & address withheld unless approved).

13. Entire Agreement
Annex A (Pricing) + Annex B (Project Summary) are integral. Annex B prevails on conflict.

14. Force Majeure
Standard clause.

────────────────────────────────────────────
ANNEX B — PROJECT SUMMARY
────────────────────────────────────────────
Client name:          ${b.clientName || '—'}
Client address:       ${b.clientAddress || '—'}
Client NIC:           ${b.clientNic || '—'}
Project address:      ${b.projectAddress || '—'}
Classification:       ${b.classification}
Design tier:          Tier ${b.tier}
EPC:                  ${formatMUR(b.epcMinor)}
Design fee:           ${formatMUR(b.designFeeMinor)}  (${formatMUR(designInclMinor)} incl. ${vatPct}% VAT)
${executionLine}
Total estimate:       ${formatMUR(b.totalEstimateMinor)}  (${formatMUR(totalInclMinor)} incl. ${vatPct}% VAT)
Start date:           ${b.startDate ?? '—'}
Estimated completion: ${b.estimatedCompletion ?? '—'}
Sale of furniture:    ${b.saleOfFurniture ? 'Yes (10% commission)' : 'No'}
STR working capital:  ${b.strWorkingCapital ? 'Yes (surplus retained)' : 'No (refund on surplus)'}

Custom inclusions / overrides:
${b.customInclusions || '(none)'}

[Signature blocks — Friday Retreats Ltd (Ishant Ayadassen) | Client (${b.clientName || '____________'})]`;
}

// ─────────────────────────── shells ───────────────────────────

// design-be-20d: 3-row VAT breakdown shown next to the fee inputs so the
// Director can read the inclusive number before sending the agreement.
function FeeVatBreakdown({
  designMinor,
  executionMinor,
  cfg,
}: {
  designMinor: number;
  executionMinor: number;
  cfg: AnnexAConfig;
}) {
  const total = designMinor + executionMinor;
  const vatPct = (cfg.vatRate * 100).toFixed(cfg.vatRate * 100 % 1 === 0 ? 0 : 2);
  return (
    <div
      data-testid="agreement-fee-vat-breakdown"
      style={{
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
      <div style={{ gridColumn: 1, fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4 }}></div>
      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4, textAlign: 'right' }}>excl. VAT</div>
      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4, textAlign: 'right' }}>incl. {vatPct}% VAT</div>
      <span style={{ color: 'var(--color-text-tertiary)' }}>Design fee</span>
      <span style={{ fontFamily: 'var(--font-mono-fad)', textAlign: 'right', color: 'var(--color-text-primary)' }}>{formatMUR(designMinor)}</span>
      <span style={{ fontFamily: 'var(--font-mono-fad)', textAlign: 'right', color: 'var(--color-text-secondary)' }}>{formatMUR(withVAT(designMinor, cfg))}</span>
      <span style={{ color: 'var(--color-text-tertiary)' }}>Execution fee</span>
      <span style={{ fontFamily: 'var(--font-mono-fad)', textAlign: 'right', color: 'var(--color-text-primary)' }}>{formatMUR(executionMinor)}</span>
      <span style={{ fontFamily: 'var(--font-mono-fad)', textAlign: 'right', color: 'var(--color-text-secondary)' }}>{formatMUR(withVAT(executionMinor, cfg))}</span>
      <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 600 }}>Total fee</span>
      <span style={{ fontFamily: 'var(--font-mono-fad)', textAlign: 'right', color: 'var(--color-text-primary)', fontWeight: 600 }}>{formatMUR(total)}</span>
      <span style={{ fontFamily: 'var(--font-mono-fad)', textAlign: 'right', color: 'var(--color-text-secondary)', fontWeight: 600 }}>{formatMUR(withVAT(total, cfg))}</span>
      <div style={{ gridColumn: '1 / -1', marginTop: 4, fontSize: 10, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
        Annex A is VAT-exclusive; {vatPct}% VAT added on top per Mauritius regulations.
      </div>
    </div>
  );
}

function MUInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      inputMode="numeric"
      value={Math.round(value / 100).toString()}
      onChange={(e) => {
        const cleaned = e.target.value.replace(/[^\d]/g, '');
        onChange((cleaned === '' ? 0 : Number(cleaned)) * 100);
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
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>{children}</div>;
}
function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : 'auto' }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}
function subhead(): React.CSSProperties { return { margin: '0 0 12px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }; }
function cb(): React.CSSProperties { return { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-secondary)' }; }
function inputStyle(): React.CSSProperties {
  return { width: '100%', padding: '6px 10px', fontSize: 12, borderRadius: 'var(--radius-sm)', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' };
}
function textareaStyle(): React.CSSProperties { return { ...inputStyle(), resize: 'vertical' }; }
function primaryBtn(): React.CSSProperties { return { padding: '8px 16px', borderRadius: 'var(--radius-sm)', background: 'var(--color-brand-accent)', color: '#fff', fontSize: 13, fontWeight: 500 }; }
function secondaryBtn(): React.CSSProperties { return { padding: '8px 16px', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-tertiary)', color: 'var(--color-text-primary)', fontSize: 13 }; }
function disabledBtn(): React.CSSProperties { return { ...secondaryBtn(), color: 'var(--color-text-tertiary)', cursor: 'not-allowed' }; }
