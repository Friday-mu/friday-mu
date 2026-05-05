// Reconciliation report — closeout-stage planned vs actual + variance.
//
// Owner-facing report sent at the reconciliation stage. Compares
// finalApprovedCostMinor (locked at funding gate) against actualPaidMinor
// (drawn from receipt capture during execution). Variance > 5% per the
// VARIANCE_FLAG_THRESHOLD_PCT constant is highlighted.

import {
  designClient,
  formatMUR,
  formatTier,
  formatClassification,
  isVarianceFlagged,
  VARIANCE_FLAG_THRESHOLD_PCT,
  type BudgetItem,
  type DesignProject,
} from '../../fad/_data/design';
import { DocumentLayout, DocumentPage } from './DocumentLayout';

export function ReconciliationPreview({ project }: { project: DesignProject }) {
  const counterparty = designClient.counterparties.get(project.counterpartyId);
  const property = designClient.properties.get(project.propertyId);
  const items = designClient.budgetItems.list(project.id).filter((i) => !i.internalWork);
  const totalApproved = items.reduce((s, i) => s + (i.finalApprovedCostMinor ?? 0), 0);
  const totalPaid = items.reduce((s, i) => s + (i.actualPaidMinor ?? 0), 0);
  const variance = totalPaid - totalApproved;
  const variancePct = totalApproved > 0 ? (variance / totalApproved) * 100 : 0;
  const flaggedItems = items.filter((i) => isVarianceFlagged(i.finalApprovedCostMinor ?? 0, i.actualPaidMinor ?? 0));
  const unpaidCount = items.filter((i) => i.actualPaidMinor === null).length;

  // Group by category for the summary table — gives a tighter picture than
  // per-room when the report is read post-hoc.
  const byCategory = new Map<string, { approved: number; paid: number; count: number }>();
  for (const i of items) {
    const slot = byCategory.get(i.category) ?? { approved: 0, paid: 0, count: 0 };
    slot.approved += i.finalApprovedCostMinor ?? 0;
    slot.paid += i.actualPaidMinor ?? 0;
    slot.count += 1;
    byCategory.set(i.category, slot);
  }

  const meta = {
    title: 'Reconciliation report',
    version: project.stageStatus === 'done' ? 'final' : 'draft',
  };

  return (
    <DocumentLayout meta={meta} project={project}>
      <DocumentPage project={project} meta={meta} pageLabel="Reconciliation · Summary">
        <h2>Reconciliation report — {project.name}</h2>
        <p>
          Closeout reconciliation comparing the line-item budget the Owner
          approved at funding gate against the receipts captured during
          execution. Friday Retreats is committed to closing within ±{VARIANCE_FLAG_THRESHOLD_PCT}%
          of the approved budget; any line outside that band is flagged
          below for owner review.
        </p>

        <table>
          <tbody>
            <tr><td style={{ width: '30%' }}>Owner</td><td>{counterparty?.fullName ?? '—'}</td></tr>
            <tr><td>Property</td><td>{property?.name ?? '—'}</td></tr>
            <tr><td>Project</td><td>{project.name} ({project.id})</td></tr>
            <tr><td>Classification / tier</td><td>{formatClassification(project.classification)} · {formatTier(project.tier)}</td></tr>
          </tbody>
        </table>

        <h3>1. Headline figures</h3>
        <table>
          <tbody>
            <tr><td style={{ width: '40%' }}>Approved budget (Owner sign-off at funding gate)</td><td className="num">{formatMUR(totalApproved)}</td></tr>
            <tr><td>Actual spend (receipts captured)</td><td className="num">{formatMUR(totalPaid)}</td></tr>
            <tr>
              <td><strong>Variance</strong></td>
              <td className="num"><strong style={{ color: variance > 0 ? '#a83232' : variance < 0 ? '#2a7a3a' : 'inherit' }}>
                {variance >= 0 ? '+' : ''}{formatMUR(variance)} · {variancePct >= 0 ? '+' : ''}{variancePct.toFixed(1)}%
              </strong></td>
            </tr>
            {unpaidCount > 0 && (
              <tr style={{ color: '#5b6776' }}>
                <td style={{ fontSize: '9pt' }}>Lines without a captured receipt</td>
                <td className="num" style={{ fontSize: '9pt' }}>{unpaidCount}</td>
              </tr>
            )}
          </tbody>
        </table>

        {flaggedItems.length > 0 ? (
          <div className="doc-callout">
            <strong>{flaggedItems.length} line{flaggedItems.length === 1 ? '' : 's'} flagged ±{VARIANCE_FLAG_THRESHOLD_PCT}%.</strong>{' '}
            Each flagged line is detailed on page 2 with the supporting context. None
            require owner repayment unless explicitly noted; flagged lines are
            for transparency.
          </div>
        ) : items.length > 0 ? (
          <div className="doc-callout">
            <strong>No lines flagged ±{VARIANCE_FLAG_THRESHOLD_PCT}%.</strong>{' '}
            Project closed within the variance threshold across all line items.
          </div>
        ) : null}

        <h3>2. By category</h3>
        <table>
          <thead>
            <tr><th>Category</th><th style={{ textAlign: 'right' }}>Items</th><th style={{ textAlign: 'right' }}>Approved</th><th style={{ textAlign: 'right' }}>Paid</th><th style={{ textAlign: 'right' }}>Δ</th></tr>
          </thead>
          <tbody>
            {Array.from(byCategory.entries()).sort(([, a], [, b]) => b.approved - a.approved).map(([cat, c]) => {
              const d = c.paid - c.approved;
              return (
                <tr key={cat}>
                  <td style={{ textTransform: 'capitalize' }}>{cat}</td>
                  <td className="num">{c.count}</td>
                  <td className="num">{formatMUR(c.approved)}</td>
                  <td className="num">{formatMUR(c.paid)}</td>
                  <td className="num" style={{ color: d > 0 ? '#a83232' : d < 0 ? '#2a7a3a' : 'inherit' }}>
                    {d >= 0 ? '+' : ''}{formatMUR(d)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </DocumentPage>

      {flaggedItems.length > 0 && (
        <DocumentPage project={project} meta={meta} pageLabel="Reconciliation · Flagged lines">
          <h2>3. Flagged lines</h2>
          <p>
            Lines below paid more than ±{VARIANCE_FLAG_THRESHOLD_PCT}% off the
            owner-approved figure. Notes capture the reason recorded during
            execution.
          </p>

          <table>
            <thead>
              <tr><th>Line</th><th style={{ textAlign: 'right' }}>Approved</th><th style={{ textAlign: 'right' }}>Paid</th><th style={{ textAlign: 'right' }}>Δ %</th></tr>
            </thead>
            <tbody>
              {flaggedItems.map(varianceRow)}
            </tbody>
          </table>
        </DocumentPage>
      )}

      <DocumentPage project={project} meta={meta} pageLabel="Reconciliation · Sign-off">
        <h2>4. Owner sign-off</h2>
        <p>
          By signing below, the Owner confirms that the figures on pages 1–
          {flaggedItems.length > 0 ? '2' : '1'}{' '}
          have been reviewed and the project is accepted as reconciled.
          Sign-off triggers the final balance gate — any residual due to
          either party is settled within 14 days.
        </p>

        <div className="doc-signatures">
          <div className="doc-sig-block">
            <div className="doc-sig-name">{counterparty?.fullName ?? '[ Owner name ]'}</div>
            <div>For and on behalf of the Client</div>
            <div>Date: ___________________</div>
          </div>
          <div className="doc-sig-block">
            <div className="doc-sig-name">Ishant Gangaram</div>
            <div>Director, Friday Retreats Ltd</div>
            <div>Date: ___________________</div>
          </div>
        </div>

        <hr className="doc-divider" />

        <p style={{ fontSize: '9pt', color: '#5b6776' }}>
          Reconciliation is the last numerical step of the project. The
          closeout binder (warranties, maintenance schedule, snag list) is
          delivered as a separate document at handover and remains valid for
          the warranty durations stated on each line.
        </p>
      </DocumentPage>
    </DocumentLayout>
  );
}

function varianceRow(item: BudgetItem) {
  const approved = item.finalApprovedCostMinor ?? 0;
  const paid = item.actualPaidMinor ?? 0;
  const delta = paid - approved;
  const pct = approved > 0 ? (delta / approved) * 100 : 0;
  return (
    <tr key={item.id}>
      <td>
        <strong>{item.itemName}</strong>
        {item.itemDescription && <><br /><span style={{ color: '#5b6776', fontSize: '9pt' }}>{item.itemDescription}</span></>}
        {item.notes && <><br /><span style={{ color: '#5b6776', fontSize: '9pt', fontStyle: 'italic' }}>Note: {item.notes}</span></>}
      </td>
      <td className="num">{formatMUR(approved)}</td>
      <td className="num">{formatMUR(paid)}</td>
      <td className="num" style={{ color: delta > 0 ? '#a83232' : delta < 0 ? '#2a7a3a' : 'inherit' }}>
        {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
      </td>
    </tr>
  );
}
