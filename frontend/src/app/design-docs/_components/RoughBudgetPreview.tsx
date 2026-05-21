// Rough budget — owner-facing pre-agreement estimate.

import {
  designClient,
  formatMUR,
  formatTier,
  formatClassification,
  type DesignProject,
  type RoughBudget,
} from '../../fad/_data/design';
import { DocumentLayout, DocumentPage } from './DocumentLayout';
import { FRIDAY, deriveInitials, fridayDocNumber, formatDocDate } from './fridayParticulars';

export function RoughBudgetPreview({ project }: { project: DesignProject }) {
  const counterparty = designClient.counterparties.get(project.counterpartyId);
  const property = designClient.properties.get(project.propertyId);
  const all = designClient.roughBudgets.list(project.id);
  const rb: RoughBudget | null = all.length > 0
    ? [...all].sort((a, b) => b.version - a.version)[0]
    : null;
  const initials = deriveInitials(counterparty?.fullName);
  const docNumber = fridayDocNumber(initials, 1, { service: 'RB' });
  const issued = rb ? formatDocDate(rb.createdAt) : '';

  const range = rb && rb.lowMinor !== null && rb.highMinor !== null ? rb.highMinor - rb.lowMinor : null;

  return (
    <DocumentLayout meta={{ title: docNumber }} project={project}>
      <DocumentPage>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4mm' }}>
          <div>
            <h1 style={{ marginBottom: '2pt' }}>Preliminary Budget</h1>
            <div style={{ fontSize: '10pt', color: '#5b6776' }}>{project.name}</div>
          </div>
          <div style={{ fontSize: '10pt', textAlign: 'right' }}>
            <div><span style={{ fontWeight: 600 }}>REF:</span> <span style={{ fontFamily: 'var(--font-mono-fad), monospace' }}>{docNumber}</span></div>
            <div><span style={{ fontWeight: 600 }}>DATE:</span> {issued || formatDocDate(new Date().toISOString())}</div>
            {rb && <div><span style={{ fontWeight: 600 }}>VERSION:</span> v{rb.version} · {rb.status}</div>}
          </div>
        </div>

        <p>
          Pre-agreement estimate of the all-in project cost (EPC) and Friday
          Retreats fees, based on the site visit and preference scoping. The
          range is informational and not binding — binding terms are set in
          Annex B of the Interior Design Agreement that follows.
        </p>

        <h2>Prepared for</h2>
        <table className="doc-table-bare">
          <tbody>
            <tr><td style={{ width: '32%', fontWeight: 600 }}>Client</td><td>{counterparty?.fullName ?? '—'}</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Property</td><td>{property?.name ?? '—'}{property?.address ? ` · ${property.address}` : ''}</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Classification</td><td>{formatClassification(project.classification)}</td></tr>
          </tbody>
        </table>

        {!rb ? (
          <div className="doc-callout">
            <strong>Rough budget pending.</strong> This estimate populates
            after the rough-budget stage. Until then, only the owner intake
            range is on file.
          </div>
        ) : (
          <>
            <h2>Estimated Project Cost (EPC) Band</h2>
            <table>
              <thead>
                <tr><th>Scenario</th><th className="num">Estimated cost</th></tr>
              </thead>
              <tbody>
                <tr><td>Low (lean specification)</td><td className="num">{formatMUR(rb.lowMinor)}</td></tr>
                <tr><td><strong>Mid (working target)</strong></td><td className="num"><strong>{formatMUR(rb.midMinor)}</strong></td></tr>
                <tr><td>High (premium specification)</td><td className="num">{formatMUR(rb.highMinor)}</td></tr>
                {range !== null && range !== 0 && rb.midMinor !== null && (
                  <tr style={{ color: '#5b6776' }}>
                    <td style={{ fontSize: '9pt' }}>Spread</td>
                    <td className="num" style={{ fontSize: '9pt' }}>{formatMUR(range)} · ±{Math.round((range / 2 / rb.midMinor) * 100)}% from mid</td>
                  </tr>
                )}
              </tbody>
            </table>

            <h2>Friday Retreats Fee Estimate</h2>
            <table>
              <tbody>
                <tr><td style={{ width: '50%' }}>Tier (per Annex A)</td><td className="num">{formatTier(rb.tier)}</td></tr>
                <tr><td>Design Fee (estimated)</td><td className="num">{formatMUR(rb.designFeeMinor)}</td></tr>
                <tr><td>Procurement &amp; Execution Fee (estimated)</td><td className="num">{formatMUR(rb.procurementFeeMinor)}</td></tr>
                <tr><td><strong>Total fee estimate (Excl. VAT)</strong></td><td className="num"><strong>{formatMUR((rb.designFeeMinor ?? 0) + (rb.procurementFeeMinor ?? 0))}</strong></td></tr>
                <tr style={{ color: '#5b6776' }}>
                  <td style={{ fontSize: '9pt' }}>Mid EPC + fees</td>
                  <td className="num" style={{ fontSize: '9pt' }}>{formatMUR((rb.midMinor ?? 0) + (rb.designFeeMinor ?? 0) + (rb.procurementFeeMinor ?? 0))}</td>
                </tr>
              </tbody>
            </table>
            <p style={{ fontSize: '9pt', color: '#5b6776' }}>All fees are exclusive of VAT (15%).</p>

            {rb.assumptions && (<><h2>Assumptions</h2><p>{rb.assumptions}</p></>)}
            {rb.exclusions && (<><h2>Exclusions</h2><p>{rb.exclusions}</p></>)}
            {rb.riskItems && (<><h2>Risk items</h2><p>{rb.riskItems}</p></>)}
            {rb.nextSteps && (<><h2>Next steps</h2><p>{rb.nextSteps}</p></>)}

            <hr className="doc-divider" />
            <div style={{ fontSize: '9pt', color: '#5b6776' }}>
              <div>Prepared by {FRIDAY.legalName}</div>
              <div>{FRIDAY.address.line1}, {FRIDAY.address.city} · {FRIDAY.phone} · {FRIDAY.emails.general}</div>
              <div>BRN: {FRIDAY.brn} · VAT Reg. No: {FRIDAY.vatNumber}</div>
            </div>
          </>
        )}
      </DocumentPage>
    </DocumentLayout>
  );
}
