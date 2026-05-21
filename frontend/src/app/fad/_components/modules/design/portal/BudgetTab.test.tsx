import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BudgetTab } from './BudgetTab';
import type { OwnerBudgetItem } from '../../../../_data/design';

const sample: OwnerBudgetItem[] = [
  {
    id: 'bi-1',
    itemName: 'Sofa',
    itemDescription: null,
    category: 'furniture',
    qty: 1,
    vendorName: 'Jaabir',
    productLink: null,
    imageUrl: null,
    retailCostMinor: 100_00,
    negotiatedCostMinor: 80_00,
    savedMinor: 20_00,
    finalApprovedCostMinor: 80_00,
    vatMinor: 12_00,
    status: 'approved',
    procurement: 'to_source',
    receiptUrl: 'drive://r1.pdf',
  },
];

const FORBIDDEN_HEADERS = [
  'Owner-bill',
  'Owner billable',
  'Internal',
  'Internal margin',
  'Supplier negotiation',
  'Internal work',
  'Margin',
];

describe('BudgetTab — owner view forbidden-column invariant', () => {
  it('never renders any of the four §10 forbidden header strings', () => {
    render(<BudgetTab items={sample} />);
    const headers = Array.from(document.querySelectorAll('th')).map(
      (th) => th.textContent?.trim() ?? '',
    );
    for (const forbidden of FORBIDDEN_HEADERS) {
      expect(
        headers.some((h) => h.toLowerCase() === forbidden.toLowerCase()),
        `forbidden owner-view column header found: ${forbidden}`,
      ).toBe(false);
    }
  });

  it('does render the B3.1 disclosure columns', () => {
    render(<BudgetTab items={sample} />);
    expect(screen.getByRole('columnheader', { name: 'Retail' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Friday-negotiated' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Saved' })).toBeInTheDocument();
  });

  it('shows a Saved by Friday callout when items have non-zero savings', () => {
    render(<BudgetTab items={sample} />);
    expect(screen.getByText('Saved by Friday')).toBeInTheDocument();
  });
});
