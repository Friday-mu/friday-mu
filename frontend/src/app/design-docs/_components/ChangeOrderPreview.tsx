// Change order — owner-facing scope/cost change request.

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
import { FRIDAY, deriveInitials, fridayDocNumber, formatDocDate } from './fridayParticulars';

export function ChangeOrderPreview({ project }: { project: DesignProject }) {
  const params = useSearchParams();
  const coId = params?.get('co') ?? null;
  const counterparty = designClient.counterparties.get(project.counterpartyId);
  const property = designClient.properties.get(project.propertyId);
  const allCOs = designClient.changeOrders.list(project.id);
  const initials = deriveInitials(counterparty?.fullName);
  const docNumber = fridayDocNumber(initials, 1, { service: 'CO' });

  if (allCOs.length === 0) {
    return (
      <DocumentLayout meta={{ title: docNumber }} project={project}>
        <DocumentPage>
          <Header docNumber={docNumber} status="pending" project={project} title="Change Orders" />
          <div className="doc-callout">
            <strong>No change orders on file.</strong> Change orders are
            issued whenever scope or per-line costs deviate from the
            approved final procurement budget. They are sequenced CO-001,
            CO-002, &hellip; and require Client sign-off before the
            corresponding work proceeds.
          </div>
        </DocumentPage>
      </DocumentLayout>
    );
  }

  const selected = coId ? allCOs.find((c) => c.id === coId) ?? null : null;

  if (selected) {
    const singleNumber = fridayDocNumber(initials, parseInt(selected.number.replace(/\D/g, ''), 10) || 1, { service: 'CO' });
    return (
      <DocumentLayout meta={{ title: singleNumber }} project={project}>
        <SingleChangeOrderPage project={project} co={selected} counterparty={counterparty} property={property} docNumber={singleNumber} />
      </DocumentLayout>
    );
  }

  return (
    <DocumentLayout meta={{ title: docNumber }} project={project}>
      <DocumentPage>
        <Header docNumber={docNumber} status={`${allCOs.length} on file`} project={project} title="Change Orders" />
        <p>
          All change orders issued on this project to date. Each is rendered
          in full on a subsequent page.
        </p>
        <table>
          <thead>
            <tr><th>#</th><th>Title</th><th>State</th><th className="num">Net change</th><th>Sent</th></tr>
          </thead>
          <tbody>
            {allCOs.map((co) => (
              <tr key={co.id}>
                <td><strong>{co.number}</strong></td>
                <td>{co.title}</td>
                <td style={{ textTransform: 'capitalize' }}>{co.state}</td>
                <td className="num">{formatChangeAmount(changeOrderTotal(co))}</td>
                <td>{co.sentAt ? formatDocDate(co.sentAt) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DocumentPage>
      {allCOs.map((co) => {
        const seq = parseInt(co.number.replace(/\D/g, ''), 10) || 1;
        const num = fridayDocNumber(initials, seq, { service: 'CO' });
        return (
          <SingleChangeOrderPage
            key={co.id}
            project={project}
            co={co}
            counterparty={counterparty}
            property={property}
            docNumber={num}
          />
        );
      })}
    </DocumentLayout>
  );
}

function SingleChangeOrderPage({
  project,
  co,
  counterparty,
  property,
  docNumber,
}: {
  project: DesignProject;
  co: ChangeOrder;
  counterparty: ReturnType<typeof designClient.counterparties.get>;
  property: ReturnType<typeof designClient.properties.get>;
  docNumber: string;
}) {
  const total = changeOrderTotal(co);
  return (
    <DocumentPage>
      <Header docNumber={docNumber} status={co.state} project={project} title={`Change Order ${co.number}`} />

      <h2>Prepared for</h2>
      <table className="doc-table-bare">
        <tbody>
          <tr><td style={{ width: '32%', fontWeight: 600 }}>Client</td><td>{counterparty?.fullName ?? '—'}</td></tr>
          <tr><td style={{ fontWeight: 600 }}>Property</td><td>{property?.name ?? '—'}</td></tr>
          <tr><td style={{ fontWeight: 600 }}>Issued</td><td>{formatDocDate(co.createdAt)}</td></tr>
          {co.sentAt && <tr><td style={{ fontWeight: 600 }}>Sent</td><td>{formatDocDate(co.sentAt)}</td></tr>}
          {co.decidedAt && <tr><td style={{ fontWeight: 600 }}>Decided</td><td>{formatDocDate(co.decidedAt)}</td></tr>}
        </tbody>
      </table>

      <h2>{co.title}</h2>
      <p>{co.reason}</p>

      <h2>Line items</h2>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th className="num">Qty</th>
            <th className="num">Per-unit</th>
            <th className="num">Line total</th>
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
          <h2>Client comment</h2>
          <p style={{ fontStyle: 'italic', color: '#5b6776' }}>&ldquo;{co.ownerComment}&rdquo;</p>
        </>
      )}

      <h2>Sign-off</h2>
      <p>
        By signing below, the Client approves the change above. The line
        items will be added to the procurement budget at the per-unit prices
        shown; the project&rsquo;s running total adjusts by the net change
        indicated.
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
  );
}

function Header({ docNumber, status, project, title }: { docNumber: string; status: string; project: DesignProject; title: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4mm' }}>
      <div>
        <h1 style={{ marginBottom: '2pt' }}>{title}</h1>
        <div style={{ fontSize: '10pt', color: '#5b6776' }}>{project.name}</div>
      </div>
      <div style={{ fontSize: '10pt', textAlign: 'right' }}>
        <div><span style={{ fontWeight: 600 }}>REF:</span> <span style={{ fontFamily: 'var(--font-mono-fad), monospace' }}>{docNumber}</span></div>
        <div><span style={{ fontWeight: 600 }}>DATE:</span> {formatDocDate(new Date().toISOString())}</div>
        <div><span style={{ fontWeight: 600 }}>STATUS:</span> {status}</div>
      </div>
    </div>
  );
}

function formatChangeAmount(minor: number): string {
  const sign = minor < 0 ? '−' : '+';
  return `${sign}${formatMUR(Math.abs(minor))}`;
}
