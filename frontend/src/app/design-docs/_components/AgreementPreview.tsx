// Agreement preview — Annex A pricing + Annex B per-project + signatures.
//
// Renders as 4 print pages: cover, scope + Annex B, Annex A pricing schedule,
// payment schedule + signatures. Pulls live from designClient so any change
// to Annex A or to the project flows through immediately.

import {
  designClient,
  formatMUR,
  formatTier,
  formatClassification,
  type DesignProject,
} from '../../fad/_data/design';
import { DocumentLayout, DocumentPage } from './DocumentLayout';

export function AgreementPreview({ project }: { project: DesignProject }) {
  const counterparty = designClient.counterparties.get(project.counterpartyId);
  const property = designClient.properties.get(project.propertyId);
  const agreement = designClient.agreement.get(project.id);
  const annexA = designClient.settings.annexA();
  const gates = designClient.payments.list(project.id);
  const annexB = agreement?.annexB ?? null;
  const meta = {
    title: 'Design Services Agreement',
    version: agreement?.status === 'completed' ? 'final' : agreement?.status === 'signed_by_client' ? 'countersigned' : agreement ? 'draft' : 'unsigned',
  };

  return (
    <DocumentLayout meta={meta} project={project}>
      {/* PAGE 1 — Cover / parties */}
      <DocumentPage project={project} meta={meta} pageLabel="Agreement · Cover">
        <h2>Design services agreement</h2>
        <p>
          This agreement records the engagement of Friday Retreats by the Owner
          for interior design, procurement, and execution services in respect
          of the Property described below. It comprises this cover page,
          schedule of services, <strong>Annex A</strong> (pricing schedule in
          force) and <strong>Annex B</strong> (per-project terms, including any
          negotiated overrides). The schedules form a single integrated
          contract.
        </p>

        <h3>Effective date</h3>
        <p>{annexB?.effectiveDate ?? '—'}{!annexB && ' (pending — agreement not yet sent)'}</p>

        <h3>Parties</h3>
        <table>
          <tbody>
            <tr>
              <td style={{ width: '30%' }}>Owner ("Client")</td>
              <td>
                {counterparty?.fullName ?? '—'}
                {counterparty?.nic && <><br /><span style={{ color: '#5b6776' }}>NIC: {counterparty.nic}</span></>}
                {counterparty?.email && <><br /><span style={{ color: '#5b6776' }}>{counterparty.email}</span></>}
                {counterparty?.phone && <><br /><span style={{ color: '#5b6776' }}>{counterparty.phone}</span></>}
              </td>
            </tr>
            <tr>
              <td>Service provider</td>
              <td>
                <strong>Friday Retreats Ltd</strong> (entity {project.entityId})
                <br /><span style={{ color: '#5b6776' }}>hello@friday.mu · friday.mu</span>
                <br /><span style={{ color: '#5b6776' }}>Mauritius</span>
              </td>
            </tr>
          </tbody>
        </table>

        <h3>Property &amp; project</h3>
        <table>
          <tbody>
            <tr><td style={{ width: '30%' }}>Property</td><td>{property?.name ?? '—'}{property?.address ? ` · ${property.address}` : ''}</td></tr>
            <tr><td>Region / bedrooms</td><td>{property?.region ?? '—'}{property?.bedrooms ? ` · ${property.bedrooms} BR` : ''}</td></tr>
            <tr><td>Project name</td><td>{project.name}</td></tr>
            <tr><td>Project ID</td><td>{project.id}</td></tr>
            <tr><td>Classification</td><td>{formatClassification(project.classification)}</td></tr>
            <tr><td>Tier</td><td>{formatTier(project.tier)}</td></tr>
            <tr><td>Estimated project cost (EPC)</td><td className="num">{formatMUR(project.epcMinor)}</td></tr>
          </tbody>
        </table>

        <hr className="doc-divider" />

        <h3>Status</h3>
        <p>
          Agreement status: <strong>{agreement?.status ?? 'not yet drafted'}</strong>.
          {agreement?.sentAt && <> Sent {agreement.sentAt.slice(0, 10)}.</>}
          {agreement?.signedAt && <> Signed by client {agreement.signedAt.slice(0, 10)}.</>}
        </p>

        <div className="doc-callout">
          <strong>How to read this document:</strong> page 1 records the parties
          and project. Page 2 sets out the scope and Annex B (per-project
          terms). Page 3 reproduces Annex A (the standard pricing schedule
          in force on the effective date). Page 4 lists the payment schedule
          and the signature blocks. Numbered text in the body is binding;
          callout boxes (like this one) are explanatory and not contractual.
        </div>
      </DocumentPage>

      {/* PAGE 2 — Scope + Annex B */}
      <DocumentPage project={project} meta={meta} pageLabel="Agreement · Scope &amp; Annex B">
        <h2>1. Scope of services</h2>
        <p>
          Friday Retreats undertakes the following project workflow, as
          appropriate to the tier classification stated above. The full
          17-stage workflow is set out in the per-tier stage matrix on
          page 3; mandatory and optional stages are defined there.
        </p>
        <ul>
          <li>Lead, owner-intake, and proposal preparation.</li>
          <li>Site visit, preference scoping, rough budget.</li>
          <li>Agreement, payment gate, moodboard, design pack and design review.</li>
          <li>Final procurement budget, funding gate, procurement and execution.</li>
          <li>Expense capture, reconciliation, and handover.</li>
        </ul>

        <h3>1.1 Project goals</h3>
        <ul>
          {project.goals.map((g) => <li key={g} style={{ textTransform: 'capitalize' }}>{g.replace(/_/g, ' ')}</li>)}
        </ul>

        <h3>1.2 Target outcomes</h3>
        <ul>
          {project.outcomes.map((o) => <li key={o} style={{ textTransform: 'capitalize' }}>{o.replace(/_/g, ' ')}</li>)}
        </ul>

        <h2 style={{ marginTop: '14pt' }}>2. Annex B — per-project terms</h2>
        {annexB ? (
          <table>
            <tbody>
              <tr><td style={{ width: '40%' }}>Client name</td><td>{annexB.clientName}</td></tr>
              <tr><td>Client address</td><td>{annexB.clientAddress}</td></tr>
              {annexB.clientNic && <tr><td>Client NIC</td><td>{annexB.clientNic}</td></tr>}
              <tr><td>Property address</td><td>{annexB.projectAddress}</td></tr>
              <tr><td>Classification</td><td style={{ textTransform: 'capitalize' }}>{annexB.classification}</td></tr>
              <tr><td>Tier (per Annex A thresholds)</td><td>Tier {annexB.tier}</td></tr>
              <tr><td>Design fee</td><td className="num">{formatMUR(annexB.designFeeMinor)}</td></tr>
              <tr><td>Estimated project cost (EPC)</td><td className="num">{formatMUR(annexB.epcMinor)}</td></tr>
              <tr><td>Procurement &amp; execution fee</td><td className="num">{formatMUR(annexB.procurementFeeMinor)}</td></tr>
              <tr><td><strong>Total estimate (fees + EPC)</strong></td><td className="num"><strong>{formatMUR(annexB.totalEstimateMinor)}</strong></td></tr>
              <tr><td>Start date</td><td>{annexB.startDate ?? '—'}</td></tr>
              <tr><td>Estimated completion</td><td>{annexB.estimatedCompletion ?? '—'}</td></tr>
              <tr><td>Sale of furniture (Friday-owned)</td><td>{annexB.saleOfFurniture ? 'Yes' : 'No'}</td></tr>
              <tr><td>STR working-capital advance</td><td>{annexB.strWorkingCapital ? 'Yes' : 'No'}</td></tr>
              <tr><td>Effective date</td><td>{annexB.effectiveDate}</td></tr>
            </tbody>
          </table>
        ) : (
          <div className="doc-callout">
            <strong>Annex B is not yet finalised.</strong> Per-project terms
            (client details, fee schedule, and any negotiated overrides) are
            captured during the agreement stage and inserted here before the
            agreement is sent for signature.
          </div>
        )}

        {annexB?.customInclusions && (
          <>
            <h3>2.1 Negotiated overrides</h3>
            <p>{annexB.customInclusions}</p>
            <p style={{ fontSize: '9pt', color: '#5b6776' }}>
              Where this clause differs from Annex A, this clause prevails for
              this project only.
            </p>
          </>
        )}
      </DocumentPage>

      {/* PAGE 3 — Annex A */}
      <DocumentPage project={project} meta={meta} pageLabel="Agreement · Annex A">
        <h2>Annex A — pricing schedule</h2>
        <p style={{ fontSize: '9pt', color: '#5b6776' }}>
          The pricing schedule below is Friday Retreats' standard Annex A as
          in force on the effective date. The schedule may be amended by
          Friday Retreats from time to time; amendments do not retroactively
          alter signed agreements unless the parties expressly agree.
        </p>

        <h3>A.1 — Design fee</h3>
        <table>
          <thead>
            <tr><th>Tier</th><th>EPC band</th><th style={{ textAlign: 'right' }}>Design fee</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Tier 3</td>
              <td>EPC &lt; {formatMUR(annexA.tierThresholds.tier3MaxMinor)}</td>
              <td className="num">{formatMUR(annexA.designFee.tier3FlatMinor)} (flat)</td>
            </tr>
            <tr>
              <td>Tier 2</td>
              <td>{formatMUR(annexA.tierThresholds.tier3MaxMinor)} – {formatMUR(annexA.tierThresholds.tier2MaxMinor)}</td>
              <td className="num">{formatMUR(annexA.designFee.tier2FlatMinor)} (flat)</td>
            </tr>
            <tr>
              <td>Tier 1</td>
              <td>EPC &gt; {formatMUR(annexA.tierThresholds.tier2MaxMinor)}</td>
              <td className="num">{(annexA.designFee.tier1PercentOfEpc * 100).toFixed(2)}% of EPC</td>
            </tr>
          </tbody>
        </table>

        <h3>A.2 — Procurement &amp; execution fee (% of EPC)</h3>
        <table>
          <thead>
            <tr><th>Classification</th><th style={{ textAlign: 'right' }}>Tier 3</th><th style={{ textAlign: 'right' }}>Tier 2</th><th style={{ textAlign: 'right' }}>Tier 1</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Furnishing</td>
              <td className="num">{(annexA.procurementFurnishing.tier3Pct * 100).toFixed(2)}%</td>
              <td className="num">{(annexA.procurementFurnishing.tier2Pct * 100).toFixed(2)}%</td>
              <td className="num">{(annexA.procurementFurnishing.tier1Pct * 100).toFixed(2)}%</td>
            </tr>
            <tr>
              <td>Renovation</td>
              <td className="num">{(annexA.procurementRenovation.tier3Pct * 100).toFixed(2)}%</td>
              <td className="num">{(annexA.procurementRenovation.tier2Pct * 100).toFixed(2)}%</td>
              <td className="num">{(annexA.procurementRenovation.tier1Pct * 100).toFixed(2)}%</td>
            </tr>
          </tbody>
        </table>
        <p style={{ fontSize: '9pt', color: '#5b6776', marginTop: '4pt' }}>
          Mixed-classification projects apply the renovation rate to the
          renovation portion of the budget and the furnishing rate to the
          furnishing portion, with the split documented in the final
          procurement budget.
        </p>

        <h3>A.3 — Per-tier stage matrix (B3.9 lock)</h3>
        <p style={{ fontSize: '9pt', color: '#5b6776' }}>
          Tier 1 (EPC &gt; {formatMUR(annexA.tierThresholds.tier2MaxMinor)}) runs all 17 workflow
          stages as mandatory. Tier 2 and Tier 3 may skip stages flagged
          optional below without breaching this agreement.
        </p>
        <table>
          <thead>
            <tr><th>Tier</th><th>Optional (skippable) stages</th></tr>
          </thead>
          <tbody>
            <tr><td>Tier 1</td><td>None — all 17 stages mandatory.</td></tr>
            <tr><td>Tier 2</td><td>{annexA.tierStageRules[2].optionalStages.length === 0 ? 'None.' : annexA.tierStageRules[2].optionalStages.join(', ')}</td></tr>
            <tr><td>Tier 3</td><td>{annexA.tierStageRules[3].optionalStages.length === 0 ? 'None.' : annexA.tierStageRules[3].optionalStages.join(', ')}</td></tr>
          </tbody>
        </table>

        <h3>A.4 — Agreement template version</h3>
        <p style={{ fontFamily: 'var(--font-mono-fad)', fontSize: '10pt' }}>{annexA.agreementTemplateVersion}</p>
      </DocumentPage>

      {/* PAGE 4 — Payments + signatures */}
      <DocumentPage project={project} meta={meta} pageLabel="Agreement · Payments &amp; signatures">
        <h2>3. Payment schedule</h2>
        <p>
          Friday Retreats invoices the Client at each gate below. Items marked
          "pass-through" are working capital paid by the Client and disbursed
          to vendors on the Client's behalf; they are not Friday Retreats
          revenue and are reconciled at handover.
        </p>
        <table>
          <thead>
            <tr><th>Gate</th><th>Description</th><th style={{ textAlign: 'right' }}>Status</th></tr>
          </thead>
          <tbody>
            {gates.map((g) => (
              <tr key={g.id}>
                <td>{g.label}</td>
                <td style={{ color: '#5b6776' }}>
                  {g.id === 'project_funds' ? 'Pass-through (Client working capital)' : 'Friday Retreats fee tranche'}
                  {g.amountMinor !== null && <> · {formatMUR(g.amountMinor)}</>}
                </td>
                <td className="num" style={{ textTransform: 'capitalize' }}>
                  {g.status}
                  {g.receivedAt && <><br /><span style={{ fontSize: '8.5pt', color: '#5b6776' }}>{g.receivedAt.slice(0, 10)}</span></>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 style={{ marginTop: '14pt' }}>4. Execution</h2>
        <p>
          By signing below, the parties agree to the terms set out on pages 1–3
          of this agreement, including the schedule of services, Annex A
          (pricing schedule), and Annex B (per-project terms). This agreement
          takes effect on the effective date stated on page 1.
        </p>

        <div className="doc-signatures">
          <div className="doc-sig-block">
            <div className="doc-sig-name">{counterparty?.fullName ?? '[ Owner name ]'}</div>
            <div>For and on behalf of the Client</div>
            <div>Date: ___________________</div>
            {agreement?.signedAt && (
              <div style={{ marginTop: '4pt', fontStyle: 'italic' }}>
                Signed electronically {agreement.signedAt.slice(0, 10)}.
              </div>
            )}
          </div>
          <div className="doc-sig-block">
            <div className="doc-sig-name">Ishant Gangaram</div>
            <div>Director, Friday Retreats Ltd</div>
            <div>Date: ___________________</div>
          </div>
        </div>

        {agreement && agreement.events.length > 0 && (
          <>
            <hr className="doc-divider" />
            <h3 style={{ fontSize: '10pt' }}>Audit trail</h3>
            <table style={{ fontSize: '9pt' }}>
              <thead><tr><th>When</th><th>Status</th><th>By</th><th>Note</th></tr></thead>
              <tbody>
                {agreement.events.map((ev, i) => (
                  <tr key={i}>
                    <td>{ev.at.slice(0, 16).replace('T', ' ')}</td>
                    <td style={{ textTransform: 'capitalize' }}>{ev.status.replace(/_/g, ' ')}</td>
                    <td>{ev.userId?.replace(/^u-/, '') ?? '—'}</td>
                    <td style={{ color: '#5b6776' }}>{ev.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </DocumentPage>
    </DocumentLayout>
  );
}
