// Reconciliation report — closeout-stage planned vs actual + variance.

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
import { FRIDAY, deriveInitials, fridayDocNumber, formatDocDate } from './fridayParticulars';

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

  const byCategory = new Map<string, { approved: number; paid: number; count: number }>();
  for (const i of items) {
    const slot = byCategory.get(i.category) ?? { approved: 0, paid: 0, count: 0 };
    slot.approved += i.finalApprovedCostMinor ?? 0;
    slot.paid += i.actualPaidMinor ?? 0;
    slot.count += 1;
    byCategory.set(i.category, slot);
  }

  const initials = deriveInitials(counterparty?.fullName);
  const docNumber = fridayDocNumber(initials, 1, { service: 'RC' });
  const status = project.stageStatus === 'done' ? 'final' : 'draft';

  return (
    <DocumentLayout meta={{ title: docNumber }} project={project}>
      <DocumentPage>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4mm' }}>
          <div>
            <h1 style={{ marginBottom: '2pt' }}>Reconciliation Report</h1>
            <div style={{ fontSize: '10pt', color: '#5b6776' }}>{project.name}</div>
          </div>
          <div style={{ fontSize: '10pt', textAlign: 'right' }}>
            <div><span style={{ fontWeight: 600 }}>REF:</span> <span style={{ fontFamily: 'var(--font-mono-fad), monospace' }}>{docNumber}</span></div>
            <div><span style={{ fontWeight: 600 }}>DATE:</span> {formatDocDate(new Date().toISOString())}</div>
            <div><span style={{ fontWeight: 600 }}>STATUS:</span> {status}</div>
          </div>
        </div>

        <p>
          Closeout reconciliation comparing the line-item budget the Client
          approved at funding gate against the receipts captured during
          execution. Per Agreement clause 4, the project is reconciled at
          completion; lines outside the ±{VARIANCE_FLAG_THRESHOLD_PCT}%
          threshold are flagged for transparency.
        </p>

        <h2>Prepared for</h2>
        <table className="doc-table-bare">
          <tbody>
            <tr><td style={{ width: '32%', fontWeight: 600 }}>Client</td><td>{counterparty?.fullName ?? '—'}</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Property</td><td>{property?.name ?? '—'}</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Classification / Tier</td><td>{formatClassification(project.classification)} · {formatTier(project.tier)}</td></tr>
          </tbody>
        </table>

        <h2>1. Headline figures</h2>
        <table>
          <tbody>
            <tr><td style={{ width: '50%' }}>Approved budget (sign-off at funding gate)</td><td className="num">{formatMUR(totalApproved)}</td></tr>
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
            Detailed on the following page with supporting context. None
            require Client repayment unless explicitly noted.
          </div>
        ) : items.length > 0 ? (
          <div className="doc-callout">
            <strong>No lines flagged ±{VARIANCE_FLAG_THRESHOLD_PCT}%.</strong>{' '}
            Project closed within the variance threshold across all line items.
          </div>
        ) : null}

        <h2>2. By category</h2>
        <table>
          <thead>
            <tr><th>Category</th><th className="num">Items</th><th className="num">Approved</th><th className="num">Paid</th><th className="num">Δ</th></tr>
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
        <DocumentPage>
          <h1>3. Flagged lines</h1>
          <p>
            Lines below settled more than ±{VARIANCE_FLAG_THRESHOLD_PCT}%
            from the approved figure. Notes capture the reason recorded
            during execution.
          </p>
          <table>
            <thead>
              <tr><th>Line</th><th className="num">Approved</th><th className="num">Paid</th><th className="num">Δ %</th></tr>
            </thead>
            <tbody>{flaggedItems.map(varianceRow)}</tbody>
          </table>
        </DocumentPage>
      )}

      <DocumentPage>
        <h1>4. Client sign-off</h1>
        <p>
          By signing below, the Client confirms the figures above have been
          reviewed and the project is accepted as reconciled. Sign-off
          triggers the final balance gate &mdash; any residual due to
          either party is settled within 14 days.
        </p>

        <div className="doc-signatures">
          <div className="doc-sig-block">
            <div>{FRIDAY.legalName}</div>
            <div>Representative: {FRIDAY.signatories.director.name}</div>
            <div className="doc-sig-line">Signature</div>
            <div style={{ marginTop: '8pt' }}>Date: <span className="doc-fill" style={{ minWidth: '80pt' }} /></div>
          </div>
          <div className="doc-sig-block">
            <div>Client</div>
            <div>Client Name: <span className="doc-fill" style={{ minWidth: '120pt' }}>{counterparty?.fullName ?? ''}</span></div>
            <div className="doc-sig-line">Signature</div>
            <div style={{ marginTop: '8pt' }}>Date: <span className="doc-fill" style={{ minWidth: '80pt' }} /></div>
          </div>
        </div>

        <hr className="doc-divider" />
        <p style={{ fontSize: '9pt', color: '#5b6776' }}>
          The closeout binder &mdash; warranties, maintenance schedule, and
          snag list &mdash; is delivered as a separate document at
          handover and remains valid for the warranty durations stated on
          each item.
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
