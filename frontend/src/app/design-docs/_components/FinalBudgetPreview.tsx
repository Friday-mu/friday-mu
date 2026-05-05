// Final procurement budget — line-item budget for owner approval.

import {
  designClient,
  formatMUR,
  formatTier,
  formatClassification,
  type DesignProject,
  type BudgetItem,
} from '../../fad/_data/design';
import { DocumentLayout, DocumentPage } from './DocumentLayout';
import { FRIDAY, deriveInitials, fridayDocNumber, formatDocDate } from './fridayParticulars';

export function FinalBudgetPreview({ project }: { project: DesignProject }) {
  const counterparty = designClient.counterparties.get(project.counterpartyId);
  const property = designClient.properties.get(project.propertyId);
  const rooms = designClient.rooms.list(project.id);
  const items = designClient.budgetItems.list(project.id).filter((i) => !i.internalWork);
  const totalApproved = items.reduce((s, i) => s + (i.finalApprovedCostMinor ?? 0), 0);
  const totalRetail = items.reduce((s, i) => s + (i.retailCostMinor ?? i.finalApprovedCostMinor ?? 0), 0);
  const totalSavings = totalRetail - totalApproved;
  const roomMap = new Map<string, { name: string; items: BudgetItem[] }>();
  for (const r of rooms) roomMap.set(r.id, { name: r.name, items: [] });
  const orphan: BudgetItem[] = [];
  for (const item of items) {
    const slot = roomMap.get(item.roomId);
    if (slot) slot.items.push(item);
    else orphan.push(item);
  }

  const initials = deriveInitials(counterparty?.fullName);
  const docNumber = fridayDocNumber(initials, 1, { service: 'FB' });
  const status = items.length === 0 ? 'pending' : items.every((i) => i.status === 'approved') ? 'final' : 'draft';

  return (
    <DocumentLayout meta={{ title: docNumber }} project={project}>
      <DocumentPage>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4mm' }}>
          <div>
            <h1 style={{ marginBottom: '2pt' }}>Final Procurement Budget</h1>
            <div style={{ fontSize: '10pt', color: '#5b6776' }}>{project.name}</div>
          </div>
          <div style={{ fontSize: '10pt', textAlign: 'right' }}>
            <div><span style={{ fontWeight: 600 }}>REF:</span> <span style={{ fontFamily: 'var(--font-mono-fad), monospace' }}>{docNumber}</span></div>
            <div><span style={{ fontWeight: 600 }}>DATE:</span> {formatDocDate(new Date().toISOString())}</div>
            <div><span style={{ fontWeight: 600 }}>STATUS:</span> {status}</div>
          </div>
        </div>

        <p>
          Owner-facing line-item budget submitted for sign-off before
          procurement begins. Per Agreement clause 3, retail and negotiated
          rates are disclosed alongside the approved figure. Internal labour
          and Friday-borne lines are not shown.
        </p>

        <h2>Prepared for</h2>
        <table className="doc-table-bare">
          <tbody>
            <tr><td style={{ width: '32%', fontWeight: 600 }}>Client</td><td>{counterparty?.fullName ?? '—'}</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Property</td><td>{property?.name ?? '—'}{property?.address ? ` · ${property.address}` : ''}</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Classification / Tier</td><td>{formatClassification(project.classification)} · {formatTier(project.tier)}</td></tr>
          </tbody>
        </table>

        {items.length === 0 ? (
          <div className="doc-callout">
            <strong>Final budget pending.</strong> Items appear here after
            the design pack is approved and the final procurement budget is
            built. Until then, only the rough-budget range is on file.
          </div>
        ) : (
          <>
            <h2>Summary</h2>
            <table>
              <tbody>
                <tr><td style={{ width: '50%' }}>Line items</td><td className="num">{items.length}</td></tr>
                <tr><td>Total at retail rates</td><td className="num">{formatMUR(totalRetail)}</td></tr>
                <tr><td><strong>Total at approved rates</strong></td><td className="num"><strong>{formatMUR(totalApproved)}</strong></td></tr>
                <tr style={{ color: '#5b6776' }}>
                  <td style={{ fontSize: '9pt' }}>Friday-negotiated savings</td>
                  <td className="num" style={{ fontSize: '9pt' }}>{formatMUR(totalSavings)} · {totalRetail > 0 ? Math.round((totalSavings / totalRetail) * 100) : 0}%</td>
                </tr>
              </tbody>
            </table>

            <h2>By room</h2>
            <table>
              <thead><tr><th>Room</th><th className="num">Items</th><th className="num">Approved</th></tr></thead>
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
        <DocumentPage>
          <h1>Line items</h1>
          <p style={{ fontSize: '9pt', color: '#5b6776' }}>
            Grouped by room. Quantities are unit counts; rates in MUR per
            unit. Approved is final at sign-off; any later change requires a
            separate Change Order.
          </p>

          {Array.from(roomMap.entries()).filter(([, r]) => r.items.length > 0).map(([roomId, r]) => (
            <div key={roomId}>
              <h2>{r.name}</h2>
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="num">Qty</th>
                    <th className="num">Retail</th>
                    <th className="num">Negotiated</th>
                    <th className="num">Approved</th>
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

          <h2>Owner sign-off</h2>
          <p>
            By signing below, the Client approves the line items above for
            procurement at the rates shown. Any subsequent change &mdash;
            substitution, quantity change, or scope addition &mdash; will be
            captured by a Change Order and re-presented for sign-off.
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
        </DocumentPage>
      )}
    </DocumentLayout>
  );
}
