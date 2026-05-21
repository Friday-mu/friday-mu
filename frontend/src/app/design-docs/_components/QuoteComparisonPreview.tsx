// Quote comparison — designer's per-line vendor comparison (internal).

'use client';

import { useSearchParams } from 'next/navigation';
import {
  designClient,
  formatMUR,
  type BudgetItem,
  type DesignProject,
  type Vendor,
} from '../../fad/_data/design';
import { DocumentLayout, DocumentPage } from './DocumentLayout';
import { FRIDAY, deriveInitials, fridayDocNumber, formatDocDate } from './fridayParticulars';

interface SynthQuote {
  vendorName: string;
  company: string | null;
  unitMinor: number;
  paymentTerms: string;
  leadTimeDays: number;
  warrantyMonths: number;
  notes: string | null;
}

export function QuoteComparisonPreview({ project }: { project: DesignProject }) {
  const params = useSearchParams();
  const targetItemId = params?.get('item') ?? null;
  const counterparty = designClient.counterparties.get(project.counterpartyId);
  const property = designClient.properties.get(project.propertyId);
  const items = designClient.budgetItems.list(project.id).filter((i) => !i.internalWork);
  const item = targetItemId ? items.find((i) => i.id === targetItemId) ?? items[0] ?? null : items[0] ?? null;
  const initials = deriveInitials(counterparty?.fullName);
  const docNumber = fridayDocNumber(initials, 1, { service: 'QC' });

  if (!item) {
    return (
      <DocumentLayout meta={{ title: docNumber }} project={project}>
        <DocumentPage>
          <Header docNumber={docNumber} project={project} subtitle="—" />
          <div className="doc-callout">
            <strong>No budget items on file.</strong> Quote comparisons are
            generated per line during procurement; once budget items exist,
            a comparison can be opened per line.
          </div>
        </DocumentPage>
      </DocumentLayout>
    );
  }

  const quotes = synthesizeQuotes(item);
  const cheapest = quotes.reduce((min, q) => q.unitMinor < min.unitMinor ? q : min, quotes[0]);
  const recommended = quotes.find((q) => q.unitMinor === (item.negotiatedCostMinor ?? item.finalApprovedCostMinor)) ?? cheapest;

  return (
    <DocumentLayout meta={{ title: docNumber }} project={project}>
      <DocumentPage>
        <Header docNumber={docNumber} project={project} subtitle={item.itemName} />

        <p style={{ fontSize: '9.5pt', color: '#5b6776' }}>
          Internal designer document. Friday Retreats sources 2&ndash;3
          vendors per line item per the Agreement&rsquo;s rate-disclosure
          rules; this sheet captures the comparison and the picked vendor
          with reasoning. The Client sees the summary version inside the
          procurement chain drawer; this is the full sheet retained on
          file.
        </p>

        <h2>Line</h2>
        <table className="doc-table-bare">
          <tbody>
            <tr><td style={{ width: '32%', fontWeight: 600 }}>Project</td><td>{project.name}</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Client</td><td>{counterparty?.fullName ?? '—'}</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Property</td><td>{property?.name ?? '—'}</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Item</td><td>{item.itemName}{item.itemDescription && ` · ${item.itemDescription}`}</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Quantity</td><td>{item.qty}</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Category</td><td style={{ textTransform: 'capitalize' }}>{item.category}</td></tr>
          </tbody>
        </table>

        <h2>Quotes received</h2>
        <table>
          <thead>
            <tr>
              <th>Vendor</th>
              <th className="num">Per-unit</th>
              <th className="num">Line total</th>
              <th>Lead time</th>
              <th>Warranty</th>
              <th>Payment terms</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => {
              const isPicked = q === recommended;
              const isCheapest = q === cheapest;
              return (
                <tr key={q.vendorName} style={isPicked ? { background: 'rgba(43, 74, 147, 0.06)' } : undefined}>
                  <td>
                    <strong>{q.vendorName}</strong>
                    {q.company && <><br /><span style={{ color: '#5b6776', fontSize: '9pt' }}>{q.company}</span></>}
                    <div style={{ marginTop: '3pt', display: 'flex', gap: '4pt', flexWrap: 'wrap' }}>
                      {isPicked && <span style={{ background: '#0F1836', color: '#fff', fontSize: '8pt', padding: '1pt 6pt', borderRadius: '2pt', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Picked</span>}
                      {isCheapest && !isPicked && <span style={{ background: '#5b6776', color: '#fff', fontSize: '8pt', padding: '1pt 6pt', borderRadius: '2pt', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Cheapest</span>}
                    </div>
                  </td>
                  <td className="num">{formatMUR(q.unitMinor)}</td>
                  <td className="num">{formatMUR(q.unitMinor * item.qty)}</td>
                  <td>{q.leadTimeDays} days</td>
                  <td>{q.warrantyMonths} months</td>
                  <td style={{ fontSize: '9pt', color: '#5b6776' }}>{q.paymentTerms}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <h2>Picked vendor</h2>
        <p>
          <strong>{recommended.vendorName}{recommended.company ? ` (${recommended.company})` : ''}</strong>
          {' '}&mdash; line total <strong>{formatMUR(recommended.unitMinor * item.qty)}</strong>.
        </p>
        {recommended.notes && (
          <p style={{ fontStyle: 'italic', color: '#5b6776' }}>&ldquo;{recommended.notes}&rdquo;</p>
        )}
        {cheapest !== recommended && (
          <p style={{ fontSize: '9pt', color: '#5b6776' }}>
            The cheapest quote was {cheapest.vendorName} at{' '}
            {formatMUR(cheapest.unitMinor * item.qty)}, not picked due to
            {' '}{cheapest.warrantyMonths < recommended.warrantyMonths
              ? `shorter warranty (${cheapest.warrantyMonths} vs ${recommended.warrantyMonths} months)`
              : cheapest.leadTimeDays > recommended.leadTimeDays
                ? `longer lead time (${cheapest.leadTimeDays} vs ${recommended.leadTimeDays} days)`
                : 'unfavourable terms'}.
          </p>
        )}

        <hr className="doc-divider" />
        <div style={{ fontSize: '9pt', color: '#5b6776' }}>
          <div>Designer-only document &mdash; not shared with Client unless explicitly requested.</div>
          <div>Prepared by {FRIDAY.legalName} · {FRIDAY.emails.general}</div>
        </div>
      </DocumentPage>
    </DocumentLayout>
  );
}

function Header({ docNumber, project, subtitle }: { docNumber: string; project: DesignProject; subtitle: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4mm' }}>
      <div>
        <h1 style={{ marginBottom: '2pt' }}>Quote Comparison</h1>
        <div style={{ fontSize: '10pt', color: '#5b6776' }}>{project.name} · {subtitle}</div>
      </div>
      <div style={{ fontSize: '10pt', textAlign: 'right' }}>
        <div><span style={{ fontWeight: 600 }}>REF:</span> <span style={{ fontFamily: 'var(--font-mono-fad), monospace' }}>{docNumber}</span></div>
        <div><span style={{ fontWeight: 600 }}>DATE:</span> {formatDocDate(new Date().toISOString())}</div>
        <div><span style={{ fontWeight: 600 }}>VISIBILITY:</span> internal</div>
      </div>
    </div>
  );
}

function synthesizeQuotes(item: BudgetItem): SynthQuote[] {
  const negotiated = item.negotiatedCostMinor ?? item.finalApprovedCostMinor ?? 0;
  const retail = item.retailCostMinor ?? Math.round(negotiated * 1.15);
  const middle = Math.round((retail + negotiated) / 2);
  const negotiatedVendor = item.vendorId ? designClient.vendors.get(item.vendorId) : null;

  const sample = pickAlternativeVendors(item.vendorId, 2);
  const picked = negotiatedVendor ?? sample[0] ?? FALLBACK_VENDORS[0];
  const alts = sample.filter((v) => v && v.id !== negotiatedVendor?.id).slice(0, 2);
  const altA = alts[0] ?? FALLBACK_VENDORS[1];
  const altB = alts[1] ?? FALLBACK_VENDORS[2];

  const seed = hash(item.id);
  return [
    {
      vendorName: picked.name,
      company: picked.company,
      unitMinor: negotiated,
      paymentTerms: picked.paymentTerms,
      leadTimeDays: 14 + (seed % 14),
      warrantyMonths: 24 + (seed % 12),
      notes: 'Recommended — best balance of price, warranty, and lead time.',
    },
    {
      vendorName: altA.name,
      company: altA.company,
      unitMinor: middle,
      paymentTerms: altA.paymentTerms,
      leadTimeDays: 21 + (seed % 10),
      warrantyMonths: 12 + (seed % 8),
      notes: null,
    },
    {
      vendorName: altB.name,
      company: altB.company,
      unitMinor: retail,
      paymentTerms: altB.paymentTerms,
      leadTimeDays: 10 + (seed % 7),
      warrantyMonths: 36 + (seed % 12),
      notes: null,
    },
  ];
}

function pickAlternativeVendors(excludeId: string | null, n: number): Vendor[] {
  const all = designClient.vendors.list();
  return all.filter((v) => v.id !== excludeId).slice(0, n);
}

const FALLBACK_VENDORS = [
  { id: 'fb-1', name: 'Vendor A', company: null, category: 'general_contractor' as const, phone: null, email: null, paymentTerms: 'Net 30', notes: null, engagements: [] },
  { id: 'fb-2', name: 'Vendor B', company: null, category: 'general_contractor' as const, phone: null, email: null, paymentTerms: '50% deposit, balance on delivery', notes: null, engagements: [] },
  { id: 'fb-3', name: 'Vendor C', company: null, category: 'general_contractor' as const, phone: null, email: null, paymentTerms: 'Per engagement', notes: null, engagements: [] },
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
