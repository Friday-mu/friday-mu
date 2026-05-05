// Rough budget preview — owner-facing pre-agreement estimate.
//
// Single page (sometimes two if assumptions/exclusions/risk text is long).
// Sourced from designClient.roughBudgets.list — uses the latest version when
// multiple iterations exist, falls back to a placeholder when the project
// hasn't reached the rough-budget stage yet.

import {
  designClient,
  formatMUR,
  formatTier,
  formatClassification,
  type DesignProject,
  type RoughBudget,
} from '../../fad/_data/design';
import { DocumentLayout, DocumentPage } from './DocumentLayout';

export function RoughBudgetPreview({ project }: { project: DesignProject }) {
  const counterparty = designClient.counterparties.get(project.counterpartyId);
  const property = designClient.properties.get(project.propertyId);
  const all = designClient.roughBudgets.list(project.id);
  const rb: RoughBudget | null = all.length > 0
    ? [...all].sort((a, b) => b.version - a.version)[0]
    : null;
  const meta = {
    title: 'Rough budget',
    version: rb ? `v${rb.version} · ${rb.status}` : 'pending',
  };

  const lowMid = rb && rb.lowMinor !== null && rb.midMinor !== null ? rb.midMinor - rb.lowMinor : null;
  const midHigh = rb && rb.midMinor !== null && rb.highMinor !== null ? rb.highMinor - rb.midMinor : null;
  const range = rb && rb.lowMinor !== null && rb.highMinor !== null ? rb.highMinor - rb.lowMinor : null;

  return (
    <DocumentLayout meta={meta} project={project}>
      <DocumentPage project={project} meta={meta} pageLabel="Rough budget">
        <h2>Rough budget — {project.name}</h2>
        <p>
          Pre-agreement estimate of the all-in project cost (EPC) and Friday
          Retreats fees, based on the site visit and preference scoping. This
          range is informational and not binding — the binding fee schedule is
          set in the Annex B / Annex A agreement that follows.
        </p>

        <table>
          <tbody>
            <tr><td style={{ width: '30%' }}>Owner</td><td>{counterparty?.fullName ?? '—'}</td></tr>
            <tr><td>Property</td><td>{property?.name ?? '—'}{property?.address ? ` · ${property.address}` : ''}</td></tr>
            <tr><td>Project</td><td>{project.name} ({project.id})</td></tr>
            <tr><td>Classification</td><td>{formatClassification(project.classification)}</td></tr>
          </tbody>
        </table>

        {!rb ? (
          <div className="doc-callout">
            <strong>Rough budget not yet captured.</strong> This document
            populates after the rough-budget stage. Until then, only the
            owner intake range is on file.
          </div>
        ) : (
          <>
            <h3>1. EPC band</h3>
            <table>
              <thead>
                <tr><th>Scenario</th><th style={{ textAlign: 'right' }}>Estimated project cost</th></tr>
              </thead>
              <tbody>
                <tr><td>Low (lean spec)</td><td className="num">{formatMUR(rb.lowMinor)}</td></tr>
                <tr><td><strong>Mid (target)</strong></td><td className="num"><strong>{formatMUR(rb.midMinor)}</strong></td></tr>
                <tr><td>High (premium spec)</td><td className="num">{formatMUR(rb.highMinor)}</td></tr>
                {range !== null && range !== 0 && (
                  <tr style={{ color: '#5b6776' }}>
                    <td style={{ fontSize: '9pt' }}>Range (high − low)</td>
                    <td className="num" style={{ fontSize: '9pt' }}>{formatMUR(range)} · ±{Math.round((range / 2 / (rb.midMinor ?? 1)) * 100)}%</td>
                  </tr>
                )}
              </tbody>
            </table>
            {(lowMid !== null || midHigh !== null) && (
              <p style={{ fontSize: '9pt', color: '#5b6776', marginTop: '4pt' }}>
                Low → Mid headroom: {lowMid !== null ? formatMUR(lowMid) : '—'}.
                Mid → High headroom: {midHigh !== null ? formatMUR(midHigh) : '—'}.
              </p>
            )}

            <h3>2. Friday Retreats fee estimate</h3>
            <table>
              <tbody>
                <tr><td style={{ width: '40%' }}>Tier (per Annex A)</td><td>{formatTier(rb.tier)}</td></tr>
                <tr><td>Design fee (estimated)</td><td className="num">{formatMUR(rb.designFeeMinor)}</td></tr>
                <tr><td>Procurement &amp; execution fee (estimated)</td><td className="num">{formatMUR(rb.procurementFeeMinor)}</td></tr>
                <tr>
                  <td><strong>All-in fee estimate</strong></td>
                  <td className="num"><strong>{formatMUR((rb.designFeeMinor ?? 0) + (rb.procurementFeeMinor ?? 0))}</strong></td>
                </tr>
                <tr style={{ color: '#5b6776' }}>
                  <td style={{ fontSize: '9pt' }}>Mid EPC + fees</td>
                  <td className="num" style={{ fontSize: '9pt' }}>{formatMUR((rb.midMinor ?? 0) + (rb.designFeeMinor ?? 0) + (rb.procurementFeeMinor ?? 0))}</td>
                </tr>
              </tbody>
            </table>

            {rb.assumptions && (
              <>
                <h3>3. Assumptions</h3>
                <p>{rb.assumptions}</p>
              </>
            )}

            {rb.exclusions && (
              <>
                <h3>4. Exclusions</h3>
                <p>{rb.exclusions}</p>
              </>
            )}

            {rb.riskItems && (
              <>
                <h3>5. Risk items</h3>
                <p>{rb.riskItems}</p>
              </>
            )}

            {rb.nextSteps && (
              <>
                <h3>6. Next steps</h3>
                <p>{rb.nextSteps}</p>
              </>
            )}

            <hr className="doc-divider" />
            <p style={{ fontSize: '9pt', color: '#5b6776' }}>
              Rough budget {meta.version} · created {rb.createdAt.slice(0, 10)} ·
              project {project.id}. The mid scenario is the working baseline
              referenced in the agreement (Annex B). Final line-item budget
              is locked at the final-procurement-budget stage and presented
              for owner approval before any procurement begins.
            </p>
          </>
        )}
      </DocumentPage>
    </DocumentLayout>
  );
}
