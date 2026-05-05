// Change order preview — owner-facing scope/cost change request.
//
// One page per change order: title + reason + line items + new total +
// signature block. Different from the agreement / final-budget docs in that
// each CO is independent — the route resolves a `?co=co-id` query param to
// pick which one. When omitted, lists every CO on the project as an index.

'use client';

import { useSearchParams } from 'next/navigation';
import {
  designClient,
  formatMUR,
  changeOrderTotal,
  type DesignProject,
  type ChangeOrder,
} from '../../fad/_data/design';
import { DocumentLayout, DocumentPage } from './DocumentLayout';

export function ChangeOrderPreview({ project }: { project: DesignProject }) {
  const params = useSearchParams();
  const coId = params?.get('co') ?? null;
  const counterparty = designClient.counterparties.get(project.counterpartyId);
  const property = designClient.properties.get(project.propertyId);
  const allCOs = designClient.changeOrders.list(project.id);

  if (allCOs.length === 0) {
    const meta = { title: 'Change order', version: 'pending' };
    return (
      <DocumentLayout meta={meta} project={project}>
        <DocumentPage project={project} meta={meta} pageLabel="Change order">
          <h2>Change orders — {project.name}</h2>
          <div className="doc-callout">
            <strong>No change orders on file.</strong> Change orders are
            issued whenever scope or per-line costs deviate from the
            owner-approved final procurement budget. They are sequenced
            CO-001, CO-002, … and require owner sign-off before the
            corresponding work proceeds.
          </div>
        </DocumentPage>
      </DocumentLayout>
    );
  }

  // Resolve which CO to render. If the query param matches one, use it.
  // Otherwise render the index page listing all of them, then one page per CO.
  const selected = coId ? allCOs.find((c) => c.id === coId) ?? null : null;

  if (selected) {
    return renderSingle(project, selected, counterparty, property);
  }

  // Index + per-CO pages
  const meta = { title: 'Change orders', version: `${allCOs.length} on file` };
  return (
    <DocumentLayout meta={meta} project={project}>
      <DocumentPage project={project} meta={meta} pageLabel="Change orders · Index">
        <h2>Change orders — {project.name}</h2>
        <p>
          All change orders issued on this project to date. Each line below
          is rendered in full on a subsequent page; pass <code>?co=&lt;id&gt;</code>
          to this URL to render an individual change order on its own.
        </p>
        <table>
          <thead>
            <tr><th>#</th><th>Title</th><th>State</th><th style={{ textAlign: 'right' }}>Net change</th><th>Sent</th></tr>
          </thead>
          <tbody>
            {allCOs.map((co) => (
              <tr key={co.id}>
                <td><strong>{co.number}</strong></td>
                <td>{co.title}</td>
                <td style={{ textTransform: 'capitalize' }}>{co.state}</td>
                <td className="num">{formatChangeAmount(changeOrderTotal(co))}</td>
                <td>{co.sentAt?.slice(0, 10) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DocumentPage>
      {allCOs.map((co) => (
        <SingleChangeOrderPage key={co.id} project={project} co={co} counterparty={counterparty} property={property} meta={meta} />
      ))}
    </DocumentLayout>
  );
}

function renderSingle(
  project: DesignProject,
  co: ChangeOrder,
  counterparty: ReturnType<typeof designClient.counterparties.get>,
  property: ReturnType<typeof designClient.properties.get>,
) {
  const meta = {
    title: `Change order ${co.number}`,
    version: co.state,
  };
  return (
    <DocumentLayout meta={meta} project={project}>
      <SingleChangeOrderPage project={project} co={co} counterparty={counterparty} property={property} meta={meta} />
    </DocumentLayout>
  );
}

function SingleChangeOrderPage({
  project,
  co,
  counterparty,
  property,
  meta,
}: {
  project: DesignProject;
  co: ChangeOrder;
  counterparty: ReturnType<typeof designClient.counterparties.get>;
  property: ReturnType<typeof designClient.properties.get>;
  meta: { title: string; version: string };
}) {
  const total = changeOrderTotal(co);
  return (
    <DocumentPage project={project} meta={meta} pageLabel={`${co.number} · ${co.title}`}>
      <h2>{co.number} — {co.title}</h2>

      <table>
        <tbody>
          <tr><td style={{ width: '30%' }}>Owner</td><td>{counterparty?.fullName ?? '—'}</td></tr>
          <tr><td>Property</td><td>{property?.name ?? '—'}</td></tr>
          <tr><td>Project</td><td>{project.name} ({project.id})</td></tr>
          <tr><td>State</td><td style={{ textTransform: 'capitalize' }}>{co.state}</td></tr>
          <tr><td>Issued</td><td>{co.createdAt.slice(0, 10)}</td></tr>
          <tr><td>Sent</td><td>{co.sentAt?.slice(0, 10) ?? '—'}</td></tr>
          {co.decidedAt && <tr><td>Decided</td><td>{co.decidedAt.slice(0, 10)}</td></tr>}
        </tbody>
      </table>

      <h3>Reason</h3>
      <p>{co.reason}</p>

      <h3>Line items</h3>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th style={{ textAlign: 'right' }}>Qty</th>
            <th style={{ textAlign: 'right' }}>Per-unit</th>
            <th style={{ textAlign: 'right' }}>Line total</th>
          </tr>
        </thead>
        <tbody>
          {co.lineItems.map((line) => {
            const lineTotal = line.qty * line.costMinor;
            return (
              <tr key={line.id}>
                <td>
                  <strong>{line.itemName}</strong>
                  <span style={{ marginLeft: '6pt', color: '#5b6776', fontSize: '9pt', textTransform: 'capitalize' }}>· {line.category}</span>
                  {line.itemDescription && <><br /><span style={{ color: '#5b6776', fontSize: '9pt' }}>{line.itemDescription}</span></>}
                  {line.budgetItemId && <><br /><span style={{ color: '#5b6776', fontSize: '8.5pt' }}>Modifies budget line: {line.budgetItemId}</span></>}
                </td>
                <td className="num">{line.qty}</td>
                <td className="num">{formatChangeAmount(line.costMinor)}</td>
                <td className="num"><strong>{formatChangeAmount(lineTotal)}</strong></td>
              </tr>
            );
          })}
          <tr>
            <td colSpan={3} style={{ textAlign: 'right' }}><strong>Net change to budget</strong></td>
            <td className="num"><strong>{formatChangeAmount(total)}</strong></td>
          </tr>
        </tbody>
      </table>

      {co.ownerComment && (
        <>
          <h3>Owner comment</h3>
          <p style={{ fontStyle: 'italic', color: '#5b6776' }}>"{co.ownerComment}"</p>
        </>
      )}

      <h3>Owner sign-off</h3>
      <p>
        By signing below, the Owner approves the change above. The line
        items will be added to the procurement budget at the per-unit
        prices shown; the project's running total will adjust by the net
        change indicated.
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
  );
}

function formatChangeAmount(minor: number): string {
  const sign = minor < 0 ? '−' : '+';
  return `${sign}${formatMUR(Math.abs(minor))}`;
}
