// Fee invoice preview — Friday Retreats Pro-Forma Invoice.
//
// MATCHES the real FR-ID-DN-004 pro-forma (Feb 2026) layout exactly:
// title top-left "PRO-FORMA INVOICE", wordmark top-right (NOT centered
// like other docs), Friday particulars left block, ISSUED TO + invoice
// metadata right block, single-line table, Subtotal / VAT (15%) / Total
// rows, PAYMENT DETAILS at the bottom.
//
// Routing: by default renders one invoice page per Friday-revenue gate
// (design fees + execution fees + final balance, project_funds excluded
// because it's owner working capital not Friday revenue). Pass
// `?gate=<id>` to render a single specific invoice.

'use client';

import { useSearchParams } from 'next/navigation';
import {
  designClient,
  formatMUR,
  type DesignProject,
  type PaymentGate,
} from '../../fad/_data/design';
import { DocumentLayout, DocumentPage } from './DocumentLayout';
import { FRIDAY, deriveInitials, fridayDocNumber, formatDocDateNumeric } from './fridayParticulars';

const FRIDAY_REVENUE_GATES: PaymentGate['id'][] = [
  'design_fee_60',
  'design_fee_40',
  'execution_fee_t1',
  'execution_fee_t2',
  'final_balance',
];

const GATE_DESCRIPTION: Record<string, string> = {
  design_fee_60: 'Design Fee — first tranche (60%)',
  design_fee_40: 'Design Fee — final tranche (40%)',
  execution_fee_t1: 'Procurement & Execution Fee — first tranche',
  execution_fee_t2: 'Procurement & Execution Fee — second tranche',
  final_balance: 'Final balance',
};

export function FeeInvoicePreview({ project }: { project: DesignProject }) {
  const params = useSearchParams();
  const gateId = params?.get('gate') ?? null;
  const counterparty = designClient.counterparties.get(project.counterpartyId);
  const allGates = designClient.payments.list(project.id);
  const billable = allGates.filter((g) => FRIDAY_REVENUE_GATES.includes(g.id));

  if (billable.length === 0) {
    return (
      <DocumentLayout meta={{ title: 'Pro-Forma Invoice' }} project={project}>
        <DocumentPage>
          <h1>Pro-Forma Invoice</h1>
          <div className="doc-callout">
            <strong>No payment gates on file.</strong> Invoices are issued
            against each fee tranche after the agreement is signed and the
            corresponding gate becomes due.
          </div>
        </DocumentPage>
      </DocumentLayout>
    );
  }

  const target = gateId ? billable.find((g) => g.id === gateId) : null;
  const toRender = target ? [target] : billable;
  const initials = deriveInitials(counterparty?.fullName);

  // Sequence number per project, mirroring Friday's real numbering. The
  // Davisen invoice was FR-ID-DN-004 — the design-fee gates received
  // before this one were 001/002/003, so we start at 1 and walk in gate
  // order to get plausible per-project sequencing.
  const sequenceById = new Map<string, number>();
  billable.forEach((g, i) => sequenceById.set(g.id, i + 1));

  return (
    <DocumentLayout meta={{ title: 'Pro-Forma Invoice' }} project={project}>
      {toRender.map((g) => (
        <ProFormaInvoicePage
          key={g.id}
          project={project}
          gate={g}
          counterparty={counterparty}
          sequence={sequenceById.get(g.id) ?? 1}
          initials={initials}
        />
      ))}
    </DocumentLayout>
  );
}

function ProFormaInvoicePage({
  project,
  gate,
  counterparty,
  sequence,
  initials,
}: {
  project: DesignProject;
  gate: PaymentGate;
  counterparty: ReturnType<typeof designClient.counterparties.get>;
  sequence: number;
  initials: string;
}) {
  const docNumber = fridayDocNumber(initials, sequence);
  const issued = gate.receivedAt ?? new Date().toISOString();
  const dateStr = formatDocDateNumeric(issued);

  // Real Friday pro-formas show a single line "Final payment for First
  // Tranche of Part 1 with Main Contractor"-style description, NOT the
  // structured fee-tranche label. Use the stored description override if
  // present (gate.notes), else fall back to the gate-id template above.
  const description = gate.notes ?? GATE_DESCRIPTION[gate.id] ?? gate.label;
  // Per agreement §3.3 "All fees quoted are exclusive of VAT" — gate
  // amountMinor is the net subtotal; VAT is added on top.
  const subtotalMinor = gate.amountMinor ?? 0;
  const vatMinor = Math.round(subtotalMinor * FRIDAY.invoice.vatRate);
  const grossMinor = subtotalMinor + vatMinor;

  // The real invoice we matched against shows the sub-total figure as the
  // primary line amount (amount excl. VAT). We mirror that.
  return (
    <DocumentPage showLogo={false}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8mm' }}>
        <div style={{ fontSize: '13pt', fontWeight: 700, color: '#0F1836', letterSpacing: '0.02em' }}>
          PRO-FORMA INVOICE
        </div>
        <span className="doc-brand-mark" style={{ fontSize: '20pt' }} aria-label="Friday Retreats">
          <span className="doc-brand-friday">friday</span><span className="doc-brand-retreats">Retreats</span>
        </span>
      </div>

      {/* Friday Retreats particulars (left block) */}
      <div style={{ marginBottom: '8mm', fontSize: '10pt' }}>
        <div style={{ fontWeight: 700 }}>{FRIDAY.legalName}</div>
        <div>{FRIDAY.address.line1}</div>
        <div>{FRIDAY.address.line2}</div>
        <div>{FRIDAY.address.city}, {FRIDAY.address.country}</div>
        <div>{FRIDAY.phone}</div>
        <div>{FRIDAY.emails.finance}</div>
        <div>BRN: {FRIDAY.brn}</div>
        <div>VAT Reg. No: {FRIDAY.vatNumber}</div>
      </div>

      {/* Issued to + invoice metadata (split row) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '16pt', alignItems: 'flex-start', marginBottom: '12mm' }}>
        <div style={{ fontSize: '10pt' }}>
          <div style={{ fontWeight: 700, marginBottom: '2pt' }}>ISSUED TO:</div>
          <div>{counterparty?.fullName ?? '—'}</div>
          {counterparty?.email && <div>{counterparty.email}</div>}
          {counterparty?.phone && <div>{counterparty.phone}</div>}
          <div style={{ marginTop: '4pt', color: '#5b6776' }}>Re: {project.name}</div>
        </div>
        <div style={{ fontSize: '10pt' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '6pt 12pt' }}>
            <span style={{ fontWeight: 600 }}>PRO-FORMA NO:</span>
            <span style={{ fontFamily: 'var(--font-mono-fad), monospace' }}>{docNumber}</span>
            <span style={{ fontWeight: 600 }}>DATE:</span>
            <span>{dateStr}</span>
          </div>
        </div>
      </div>

      {/* Centered single-line table */}
      <table style={{ marginTop: '4mm', marginBottom: '6mm' }}>
        <thead>
          <tr>
            <th style={{ width: '70%', textAlign: 'center', letterSpacing: '0.06em' }}>DESCRIPTION</th>
            <th style={{ textAlign: 'center', letterSpacing: '0.06em' }}>AMOUNT (MUR)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ textAlign: 'center', padding: '12pt 8pt' }}>{description}</td>
            <td className="num" style={{ padding: '12pt 8pt' }}>{(subtotalMinor / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'right' }}>Subtotal (Excl. VAT)</td>
            <td className="num">{(subtotalMinor / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'right' }}>VAT ({(FRIDAY.invoice.vatRate * 100).toFixed(0)}%)</td>
            <td className="num">{(vatMinor / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'right', fontWeight: 700 }}>Total (Incl. VAT)</td>
            <td className="num" style={{ fontWeight: 700 }}>{(grossMinor / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
        </tbody>
      </table>

      {/* Payment Details (bottom-left) */}
      <div style={{ marginTop: '14mm', fontSize: '10pt' }}>
        <div style={{ fontWeight: 700, marginBottom: '4pt' }}>PAYMENT DETAILS</div>
        <div>Account Number: {FRIDAY.bank.accountNumber}</div>
        <div>Beneficiary Name: {FRIDAY.bank.beneficiary}</div>
        <div>Bank Name: {FRIDAY.bank.name}</div>
        <div>IBAN Number: <span style={{ fontFamily: 'var(--font-mono-fad), monospace' }}>{FRIDAY.bank.iban}</span></div>
      </div>

      {gate.status === 'received' && gate.receivedAt && (
        <div style={{ marginTop: '8mm', fontSize: '9pt', color: '#2a7a3a', borderTop: '0.5pt solid #d8d8d8', paddingTop: '6pt' }}>
          ✓ Received {gate.receivedAt.slice(0, 10)}
          {gate.bankRef && <> · Ref <span style={{ fontFamily: 'var(--font-mono-fad), monospace' }}>{gate.bankRef}</span></>}
        </div>
      )}

      <div style={{ marginTop: '6mm', fontSize: '8.5pt', color: '#5b6776' }}>
        Payment due within {FRIDAY.invoice.dueDays} calendar days of issuance per Agreement clause 3.5.
        Late balances accrue interest at {(FRIDAY.invoice.latePaymentRatePerMonth * 100).toFixed(0)}% per month, compounded monthly.
      </div>
    </DocumentPage>
  );
}
