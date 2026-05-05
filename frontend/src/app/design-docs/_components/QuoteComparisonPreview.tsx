// Quote comparison preview — designer's per-line vendor comparison.
//
// The locked decision "Quote-comparison UI designed before backend" means
// the data model isn't here yet; this component synthesises three plausible
// quotes from the BudgetItem fixture (retail = rejected high, negotiated =
// recommended, middle = synthesised alternative). The layout is the
// contract. v0.2 backend swaps the synthesis for a real Quote table on
// each budget item.
//
// @demo:logic — Replace synthesizeQuotes() with a fetch against the quote
// table. Tag: PROD-DESIGN-QUOTE-COMPARE.

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

  if (!item) {
    const meta = { title: 'Quote comparison', version: 'pending' };
    return (
      <DocumentLayout meta={meta} project={project}>
        <DocumentPage project={project} meta={meta} pageLabel="Quote comparison">
          <h2>Quote comparison — {project.name}</h2>
          <div className="doc-callout">
            <strong>No budget items on file.</strong> Quote comparisons are
            generated per line during procurement; once budget items exist,
            each can be opened with a <code>?item=&lt;id&gt;</code> query
            param.
          </div>
        </DocumentPage>
      </DocumentLayout>
    );
  }

  const quotes = synthesizeQuotes(item);
  const cheapest = quotes.reduce((min, q) => q.unitMinor < min.unitMinor ? q : min, quotes[0]);
  const recommended = quotes.find((q) => q.unitMinor === (item.negotiatedCostMinor ?? item.finalApprovedCostMinor)) ?? cheapest;

  const meta = { title: 'Quote comparison', version: item.itemName };
  return (
    <DocumentLayout meta={meta} project={project}>
      <DocumentPage project={project} meta={meta} pageLabel={`Quote comparison · ${item.itemName}`}>
        <h2>Quote comparison — {item.itemName}</h2>
        <p style={{ fontSize: '9pt', color: '#5b6776' }}>
          Internal designer document. Friday Retreats sources 2–3 vendors per
          line item per B3.1 disclosure rules; this sheet captures the
          comparison and the picked vendor with reasoning. Owners see the
          summary version inside the procurement chain drawer; this is the
          full sheet retained on file.
        </p>

        <table>
          <tbody>
            <tr><td style={{ width: '30%' }}>Project</td><td>{project.name} ({project.id})</td></tr>
            <tr><td>Owner</td><td>{counterparty?.fullName ?? '—'}</td></tr>
            <tr><td>Property</td><td>{property?.name ?? '—'}</td></tr>
            <tr><td>Line item</td><td>{item.itemName}{item.itemDescription && ` · ${item.itemDescription}`}</td></tr>
            <tr><td>Quantity</td><td>{item.qty}</td></tr>
            <tr><td>Category</td><td style={{ textTransform: 'capitalize' }}>{item.category}</td></tr>
          </tbody>
        </table>

        <h3>Quotes received</h3>
        <table>
          <thead>
            <tr>
              <th>Vendor</th>
              <th style={{ textAlign: 'right' }}>Per-unit</th>
              <th style={{ textAlign: 'right' }}>Line total</th>
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
                <tr key={q.vendorName} style={isPicked ? { background: '#f0eadb' } : undefined}>
                  <td>
                    <strong>{q.vendorName}</strong>
                    {q.company && <><br /><span style={{ color: '#5b6776', fontSize: '9pt' }}>{q.company}</span></>}
                    <div style={{ marginTop: '3pt', display: 'flex', gap: '4pt', flexWrap: 'wrap' }}>
                      {isPicked && <span style={{ background: '#14233d', color: '#f8f4ec', fontSize: '8pt', padding: '1pt 6pt', borderRadius: '2pt', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Picked</span>}
                      {isCheapest && !isPicked && <span style={{ background: '#5b6776', color: '#f8f4ec', fontSize: '8pt', padding: '1pt 6pt', borderRadius: '2pt', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Cheapest</span>}
                    </div>
                  </td>
                  <td className="num">{formatMUR(q.unitMinor)}</td>
                  <td className="num">{formatMUR(q.unitMinor * item.qty)}</td>
                  <td>{q.leadTimeDays}d</td>
                  <td>{q.warrantyMonths}m</td>
                  <td style={{ fontSize: '9pt', color: '#5b6776' }}>{q.paymentTerms}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <h3>Picked vendor</h3>
        <p>
          <strong>{recommended.vendorName}{recommended.company ? ` (${recommended.company})` : ''}</strong>
          {' '}— line total <strong>{formatMUR(recommended.unitMinor * item.qty)}</strong>.
        </p>
        {recommended.notes && (
          <p style={{ fontStyle: 'italic', color: '#5b6776' }}>"{recommended.notes}"</p>
        )}
        {cheapest !== recommended && (
          <p style={{ fontSize: '9pt', color: '#5b6776' }}>
            Note: cheapest quote was {cheapest.vendorName} at{' '}
            {formatMUR(cheapest.unitMinor * item.qty)}; not picked because
            of {cheapest.warrantyMonths < recommended.warrantyMonths
              ? `shorter warranty (${cheapest.warrantyMonths}m vs ${recommended.warrantyMonths}m)`
              : cheapest.leadTimeDays > recommended.leadTimeDays
                ? `longer lead time (${cheapest.leadTimeDays}d vs ${recommended.leadTimeDays}d)`
                : 'unfavourable terms'}.
            See B3.1 disclosure: Friday discloses both retail and negotiated
            rates per line; the picked vendor's rate is in the owner's final
            budget.
          </p>
        )}

        <hr className="doc-divider" />
        <p style={{ fontSize: '9pt', color: '#5b6776' }}>
          To compare quotes for a different line, replace{' '}
          <code style={{ fontFamily: 'var(--font-mono-fad)' }}>?item={item.id}</code>
          {' '}with another budget-item id. Designer-only document — not
          shared with owner unless explicitly requested.
        </p>
      </DocumentPage>
    </DocumentLayout>
  );
}

// Synthesise three plausible vendor quotes from a single BudgetItem. Stable
// across renders because we hash the item id into the variance offsets.
// In v0.2 this is replaced by a fetch against the per-line quote table.
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

  // Hash for deterministic but varied lead times / warranty months.
  const seed = hash(item.id);
  return [
    {
      vendorName: picked.name,
      company: picked.company,
      unitMinor: negotiated,
      paymentTerms: picked.paymentTerms,
      leadTimeDays: 14 + (seed % 14),
      warrantyMonths: 24 + (seed % 12),
      notes: 'Recommended — best balance of price + warranty + lead time.',
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
