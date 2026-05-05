// Final procurement budget preview — line-item budget for owner approval.
//
// Sourced from designClient.budgetItems.list. Items are grouped by room +
// package; internal-only lines are stripped (owners never see them). Renders
// across as many pages as the line count requires — natural page breaks
// happen between room groups.

import {
  designClient,
  formatMUR,
  formatTier,
  formatClassification,
  type DesignProject,
  type BudgetItem,
} from '../../fad/_data/design';
import { DocumentLayout, DocumentPage } from './DocumentLayout';

export function FinalBudgetPreview({ project }: { project: DesignProject }) {
  const counterparty = designClient.counterparties.get(project.counterpartyId);
  const property = designClient.properties.get(project.propertyId);
  const rooms = designClient.rooms.list(project.id);
  // Owner-facing: skip internal-only and not-yet-approved drafts.
  const items = designClient.budgetItems.list(project.id).filter((i) => !i.internalWork);
  const totalApproved = items.reduce((s, i) => s + (i.finalApprovedCostMinor ?? 0), 0);
  const totalRetail = items.reduce((s, i) => s + (i.retailCostMinor ?? i.finalApprovedCostMinor ?? 0), 0);
  const totalSavings = totalRetail - totalApproved;
  const roomMap = new Map<string, { name: string; items: BudgetItem[] }>();
  for (const r of rooms) roomMap.set(r.id, { name: r.name, items: [] });
  // Catch items whose roomId isn't in the rooms list (rare, but be defensive).
  const orphan: BudgetItem[] = [];
  for (const item of items) {
    const slot = roomMap.get(item.roomId);
    if (slot) slot.items.push(item);
    else orphan.push(item);
  }

  const meta = {
    title: 'Final procurement budget',
    version: items.length === 0 ? 'pending' : items.every((i) => i.status === 'approved') ? 'final' : 'draft',
  };

  return (
    <DocumentLayout meta={meta} project={project}>
      <DocumentPage project={project} meta={meta} pageLabel="Final budget · Cover">
        <h2>Final procurement budget — {project.name}</h2>
        <p>
          Owner-facing line-item budget for sign-off before procurement begins.
          Friday Retreats discloses retail and negotiated rates per item per
          B3.1; the right-most column is the figure the owner is approving for
          procurement. Internal labour and Friday-borne lines are not shown.
        </p>

        <table>
          <tbody>
            <tr><td style={{ width: '30%' }}>Owner</td><td>{counterparty?.fullName ?? '—'}</td></tr>
            <tr><td>Property</td><td>{property?.name ?? '—'}</td></tr>
            <tr><td>Project</td><td>{project.name} ({project.id})</td></tr>
            <tr><td>Classification / tier</td><td>{formatClassification(project.classification)} · {formatTier(project.tier)}</td></tr>
          </tbody>
        </table>

        {items.length === 0 ? (
          <div className="doc-callout">
            <strong>Final budget not yet captured.</strong> Items appear here
            after the design pack is approved and the final procurement
            budget is built. Until then, only the rough-budget range is on
            file.
          </div>
        ) : (
          <>
            <h3>Summary</h3>
            <table>
              <tbody>
                <tr><td style={{ width: '40%' }}>Line items (owner-billable)</td><td className="num">{items.length}</td></tr>
                <tr><td>Total at retail rates</td><td className="num">{formatMUR(totalRetail)}</td></tr>
                <tr><td>Total at negotiated / approved rates</td><td className="num">{formatMUR(totalApproved)}</td></tr>
                <tr style={{ color: '#5b6776' }}>
                  <td style={{ fontSize: '9pt' }}>Friday savings disclosed</td>
                  <td className="num" style={{ fontSize: '9pt' }}>{formatMUR(totalSavings)} · {totalRetail > 0 ? Math.round((totalSavings / totalRetail) * 100) : 0}%</td>
                </tr>
              </tbody>
            </table>

            <h3>By room</h3>
            <table>
              <thead><tr><th>Room</th><th style={{ textAlign: 'right' }}>Items</th><th style={{ textAlign: 'right' }}>Approved</th></tr></thead>
              <tbody>
                {Array.from(roomMap.values()).filter((r) => r.items.length > 0).map((r) => {
                  const sum = r.items.reduce((s, i) => s + (i.finalApprovedCostMinor ?? 0), 0);
                  return (
                    <tr key={r.name}>
                      <td>{r.name}</td>
                      <td className="num">{r.items.length}</td>
                      <td className="num">{formatMUR(sum)}</td>
                    </tr>
                  );
                })}
                {orphan.length > 0 && (
                  <tr>
                    <td>Other / unassigned</td>
                    <td className="num">{orphan.length}</td>
                    <td className="num">{formatMUR(orphan.reduce((s, i) => s + (i.finalApprovedCostMinor ?? 0), 0))}</td>
                  </tr>
                )}
                <tr>
                  <td><strong>Total</strong></td>
                  <td className="num"><strong>{items.length}</strong></td>
                  <td className="num"><strong>{formatMUR(totalApproved)}</strong></td>
                </tr>
              </tbody>
            </table>
          </>
        )}
      </DocumentPage>

      {items.length > 0 && (
        <DocumentPage project={project} meta={meta} pageLabel="Final budget · Line items">
          <h2>Line items</h2>
          <p style={{ fontSize: '9pt', color: '#5b6776' }}>
            Grouped by room. Quantities are unit-counts; rates are MUR per
            unit. Approved is final per-line at owner sign-off; any later
            change requires a change order (separate document).
          </p>

          {Array.from(roomMap.entries()).filter(([, r]) => r.items.length > 0).map(([roomId, r]) => (
            <div key={roomId}>
              <h3>{r.name}</h3>
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th style={{ textAlign: 'right' }}>Qty</th>
                    <th style={{ textAlign: 'right' }}>Retail</th>
                    <th style={{ textAlign: 'right' }}>Negotiated</th>
                    <th style={{ textAlign: 'right' }}>Approved</th>
                  </tr>
                </thead>
                <tbody>
                  {r.items.map((i) => (
                    <tr key={i.id}>
                      <td>
                        {i.itemName}
                        {i.itemDescription && <><br /><span style={{ color: '#5b6776', fontSize: '9pt' }}>{i.itemDescription}</span></>}
                      </td>
                      <td className="num">{i.qty}</td>
                      <td className="num">{i.retailCostMinor !== null ? formatMUR(i.retailCostMinor) : '—'}</td>
                      <td className="num">{i.negotiatedCostMinor !== null ? formatMUR(i.negotiatedCostMinor) : '—'}</td>
                      <td className="num"><strong>{formatMUR(i.finalApprovedCostMinor)}</strong></td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'right' }}><em>{r.name} subtotal</em></td>
                    <td className="num"><strong>{formatMUR(r.items.reduce((s, i) => s + (i.finalApprovedCostMinor ?? 0), 0))}</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}

          <hr className="doc-divider" />

          <h3>Owner sign-off</h3>
          <p>
            By signing below, the Owner approves the line items above for
            procurement at the rates shown. Any subsequent change to a line
            item — substitution, quantity change, or scope addition — will
            be captured by a change order and re-presented for sign-off.
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
        </DocumentPage>
      )}
    </DocumentLayout>
  );
}
