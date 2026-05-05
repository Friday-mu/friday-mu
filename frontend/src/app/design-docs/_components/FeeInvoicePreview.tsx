// Fee invoice preview — Friday Retreats invoice for a specific payment gate.
//
// Reads designClient.payments.list and renders one invoice per received
// gate (or one specific gate if `?gate=<id>` is passed). Project_funds is
// excluded — that gate is owner working capital, not a Friday invoice.

'use client';

import { useSearchParams } from 'next/navigation';
import {
  designClient,
  formatMUR,
  type DesignProject,
  type PaymentGate,
} from '../../fad/_data/design';
import { DocumentLayout, DocumentPage } from './DocumentLayout';

const FRIDAY_REVENUE_GATES: PaymentGate['id'][] = [
  'design_fee_60',
  'design_fee_40',
  'execution_fee_t1',
  'execution_fee_t2',
  'final_balance',
];

// VAT in Mauritius is 15%. Real backend computes from the line; here we
// derive from the gross amount for the demo. Tag: PROD-DESIGN-INVOICE-VAT.
const VAT_RATE = 0.15;

export function FeeInvoicePreview({ project }: { project: DesignProject }) {
  const params = useSearchParams();
  const gateId = params?.get('gate') ?? null;
  const counterparty = designClient.counterparties.get(project.counterpartyId);
  const property = designClient.properties.get(project.propertyId);
  const allGates = designClient.payments.list(project.id);
  const billable = allGates.filter((g) => FRIDAY_REVENUE_GATES.includes(g.id));

  if (billable.length === 0) {
    const meta = { title: 'Fee invoices', version: 'pending' };
    return (
      <DocumentLayout meta={meta} project={project}>
        <DocumentPage project={project} meta={meta} pageLabel="Fee invoices">
          <h2>Fee invoices — {project.name}</h2>
          <div className="doc-callout">
            <strong>No payment gates on file.</strong> Invoices are issued
            against each fee tranche after the agreement is signed and the
            corresponding gate becomes due.
          </div>
        </DocumentPage>
      </DocumentLayout>
    );
  }

  // If a specific gate is passed, render only that one.
  const target = gateId ? billable.find((g) => g.id === gateId) : null;
  const toRender = target ? [target] : billable;

  const meta = {
    title: target ? `Invoice — ${target.label}` : 'Fee invoices',
    version: target ? `INV-${invoiceRef(project, target)}` : `${toRender.length} invoice${toRender.length === 1 ? '' : 's'}`,
  };

  return (
    <DocumentLayout meta={meta} project={project}>
      {toRender.map((g) => (
        <InvoicePage
          key={g.id}
          project={project}
          gate={g}
          counterparty={counterparty}
          property={property}
        />
      ))}
    </DocumentLayout>
  );
}

function InvoicePage({
  project,
  gate,
  counterparty,
  property,
}: {
  project: DesignProject;
  gate: PaymentGate;
  counterparty: ReturnType<typeof designClient.counterparties.get>;
  property: ReturnType<typeof designClient.properties.get>;
}) {
  const ref = invoiceRef(project, gate);
  const issued = gate.receivedAt ? gate.receivedAt.slice(0, 10) : null;
  const status = gate.status === 'received' ? 'paid' : gate.status === 'awaiting' ? 'awaiting payment' : 'pending issue';
  const meta = { title: `Invoice ${ref}`, version: status };
  const grossMinor = gate.amountMinor ?? 0;
  // Demo invoice splits gross into net + VAT for display only — the receipts
  // captured against this gate may have line-item VAT distinct from this.
  const netMinor = Math.round(grossMinor / (1 + VAT_RATE));
  const vatMinor = grossMinor - netMinor;

  return (
    <DocumentPage project={project} meta={meta} pageLabel={`Invoice ${ref}`}>
      <h2>Tax invoice</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12pt' }}>
        <div>
          <h3 style={{ marginTop: 0 }}>Bill to</h3>
          <div>{counterparty?.fullName ?? '—'}</div>
          {counterparty?.email && <div style={{ color: '#5b6776' }}>{counterparty.email}</div>}
          {counterparty?.phone && <div style={{ color: '#5b6776' }}>{counterparty.phone}</div>}
          {property?.address && <div style={{ color: '#5b6776', marginTop: '4pt' }}>Re: {property.name} · {property.address}</div>}
        </div>
        <div>
          <h3 style={{ marginTop: 0 }}>From</h3>
          <div><strong>Friday Retreats Ltd</strong></div>
          <div style={{ color: '#5b6776' }}>Mauritius · entity {project.entityId}</div>
          <div style={{ color: '#5b6776' }}>hello@friday.mu</div>
        </div>
      </div>

      <table>
        <tbody>
          <tr><td style={{ width: '30%' }}>Invoice ref</td><td style={{ fontFamily: 'var(--font-mono-fad)' }}>{ref}</td></tr>
          <tr><td>Project</td><td>{project.name} ({project.id})</td></tr>
          <tr><td>Gate</td><td>{gate.label}</td></tr>
          <tr><td>Issued</td><td>{issued ?? '—'}</td></tr>
          <tr><td>Status</td><td style={{ textTransform: 'capitalize' }}>{status}</td></tr>
          {gate.bankRef && <tr><td>Bank reference</td><td style={{ fontFamily: 'var(--font-mono-fad)' }}>{gate.bankRef}</td></tr>}
        </tbody>
      </table>

      <h3>Line</h3>
      <table>
        <thead>
          <tr><th>Description</th><th style={{ textAlign: 'right' }}>Amount (excl. VAT)</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>{gate.label}</strong>
              <br /><span style={{ color: '#5b6776', fontSize: '9pt' }}>Friday Retreats fee tranche, per agreement schedule.</span>
            </td>
            <td className="num">{formatMUR(netMinor)}</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'right', color: '#5b6776' }}>VAT @ 15%</td>
            <td className="num" style={{ color: '#5b6776' }}>{formatMUR(vatMinor)}</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'right' }}><strong>Total payable</strong></td>
            <td className="num"><strong>{formatMUR(grossMinor)}</strong></td>
          </tr>
        </tbody>
      </table>

      <h3>Payment</h3>
      <p>
        Settle by bank transfer to Friday Retreats Ltd, MCB. Reference{' '}
        <code style={{ fontFamily: 'var(--font-mono-fad)' }}>{ref}</code> on the
        transfer. For queries: hello@friday.mu.
      </p>

      {gate.status === 'received' && gate.receivedAt && (
        <div className="doc-callout" style={{ background: '#dde9d6', borderLeftColor: '#2a7a3a' }}>
          <strong>Received — {gate.receivedAt.slice(0, 10)}.</strong>
          {gate.bankRef && <> Bank ref <code style={{ fontFamily: 'var(--font-mono-fad)' }}>{gate.bankRef}</code>.</>}{' '}
          This invoice is closed.
        </div>
      )}

      <hr className="doc-divider" />
      <p style={{ fontSize: '9pt', color: '#5b6776' }}>
        VAT split shown above is informational; binding figures are the
        per-line VAT recorded against the receipts captured for this
        project. v0.2 invoice generation will derive both from the line
        ledger rather than an estimated 15% split.
      </p>
    </DocumentPage>
  );
}

function invoiceRef(project: DesignProject, gate: PaymentGate): string {
  const slug = project.slug.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `${slug.slice(0, 6)}-${gate.id.toUpperCase().replace(/_/g, '')}`;
}
