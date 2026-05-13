import { describe, expect, it } from 'vitest';
import {
  ANNEX_A_DEFAULT,
  designFeeForTier,
  isVarianceFlagged,
  procurementFeeForTier,
  signMockToken,
  stripForOwner,
  tierForEpc,
  validateMockToken,
  type BudgetItem,
} from './design';

// Threshold reference (kept here so the test fails loudly if the constants
// drift in design.ts):
const T3_MAX = ANNEX_A_DEFAULT.tierThresholds.tier3MaxMinor; // 50_000_000
const T2_MAX = ANNEX_A_DEFAULT.tierThresholds.tier2MaxMinor; // 150_000_000

describe('tierForEpc', () => {
  it('returns 3 just below the tier-3 ceiling', () => {
    expect(tierForEpc(T3_MAX - 1)).toBe(3);
  });
  it('returns 2 exactly at the tier-3 ceiling', () => {
    expect(tierForEpc(T3_MAX)).toBe(2);
  });
  it('returns 2 exactly at the tier-2 ceiling', () => {
    expect(tierForEpc(T2_MAX)).toBe(2);
  });
  it('returns 1 just above the tier-2 ceiling', () => {
    expect(tierForEpc(T2_MAX + 1)).toBe(1);
  });
});

describe('designFeeForTier', () => {
  it('Tier 3 returns the flat 25,000 cents-major fee', () => {
    expect(designFeeForTier(3, 0)).toBe(ANNEX_A_DEFAULT.designFee.tier3FlatMinor);
    expect(designFeeForTier(3, 100_000_00)).toBe(ANNEX_A_DEFAULT.designFee.tier3FlatMinor);
  });
  it('Tier 2 returns the flat 45,000 cents-major fee', () => {
    expect(designFeeForTier(2, 100_000_00)).toBe(ANNEX_A_DEFAULT.designFee.tier2FlatMinor);
  });
  it('Tier 1 is 3% of EPC, rounded', () => {
    const epc = 200_000_00;
    expect(designFeeForTier(1, epc)).toBe(Math.round(epc * 0.03));
  });
});

describe('procurementFeeForTier — 9-cell matrix (mixed → renovation rate)', () => {
  const epc = 100_000_00; // Rs 100,000 in minor units
  const cells: Array<{
    tier: 1 | 2 | 3;
    classification: 'renovation' | 'furnishing' | 'mixed';
    expectedPct: number;
  }> = [
    { tier: 3, classification: 'furnishing', expectedPct: 0.125 },
    { tier: 2, classification: 'furnishing', expectedPct: 0.10 },
    { tier: 1, classification: 'furnishing', expectedPct: 0.075 },
    { tier: 3, classification: 'renovation', expectedPct: 0.175 },
    { tier: 2, classification: 'renovation', expectedPct: 0.15 },
    { tier: 1, classification: 'renovation', expectedPct: 0.125 },
    // 'mixed' projects involve construction work — they're priced at the
    // renovation (higher) rate, not furnishing. Only pure-furnishing
    // qualifies for the lower rate. (Locked 2026-05-13.)
    { tier: 3, classification: 'mixed',      expectedPct: 0.175 },
    { tier: 2, classification: 'mixed',      expectedPct: 0.15 },
    { tier: 1, classification: 'mixed',      expectedPct: 0.125 },
  ];
  for (const cell of cells) {
    it(`Tier ${cell.tier} ${cell.classification} → ${cell.expectedPct * 100}% of EPC`, () => {
      expect(procurementFeeForTier(cell.tier, cell.classification, epc)).toBe(
        Math.round(epc * cell.expectedPct),
      );
    });
  }
});

describe('stripForOwner', () => {
  function makeItem(overrides: Partial<BudgetItem> = {}): BudgetItem {
    return {
      id: 'bi-test',
      projectId: 'p-test',
      roomId: 'r-1',
      packageId: 'pkg-1',
      itemName: 'Test sofa',
      itemDescription: null,
      category: 'furniture',
      qty: 1,
      vendorId: null,
      productLink: null,
      imageUrl: null,
      retailCostMinor: 100_00,
      negotiatedCostMinor: 80_00,
      finalApprovedCostMinor: 80_00,
      actualPaidMinor: null,
      vatMinor: 12_00,
      ownerBillable: true,
      internalWork: false,
      status: 'approved',
      procurement: 'to_source',
      receiptUrl: 'drive://receipt.pdf',
      assignedUserId: null,
      dueDate: null,
      notes: null,
      ...overrides,
    };
  }

  it('keeps the owner-facing B3.1 disclosure columns', () => {
    const stripped = stripForOwner(makeItem());
    expect(stripped.retailCostMinor).toBe(100_00);
    expect(stripped.negotiatedCostMinor).toBe(80_00);
    expect(stripped.savedMinor).toBe(20_00); // computed delta
    expect(stripped.finalApprovedCostMinor).toBe(80_00);
  });

  it('nulls cost columns and keeps no receipt for internal-work lines', () => {
    const stripped = stripForOwner(
      makeItem({ internalWork: true, ownerBillable: false }),
    );
    expect(stripped.retailCostMinor).toBeNull();
    expect(stripped.negotiatedCostMinor).toBeNull();
    expect(stripped.savedMinor).toBeNull();
    expect(stripped.finalApprovedCostMinor).toBeNull();
    expect(stripped.receiptUrl).toBeNull();
  });

  it('drops receipt when not owner-billable, even on a non-internal line', () => {
    const stripped = stripForOwner(makeItem({ ownerBillable: false }));
    expect(stripped.receiptUrl).toBeNull();
  });

  it('does NOT expose the four forbidden internal fields on its public type', () => {
    // This is a structural sentinel — if the OwnerBudgetItem ever grows
    // back any of these keys (a regression on §10 risk control), the test
    // fails.
    const stripped = stripForOwner(makeItem());
    const forbidden = ['internalWork', 'actualPaidMinor', 'ownerBillable', 'internalMarginMinor'];
    for (const key of forbidden) {
      expect(Object.prototype.hasOwnProperty.call(stripped, key)).toBe(false);
    }
  });
});

describe('isVarianceFlagged', () => {
  it('flags > 5% over-spend', () => {
    expect(isVarianceFlagged(1000_00, 1060_00)).toBe(true); // +6%
  });
  it('does not flag exactly 5% over-spend', () => {
    expect(isVarianceFlagged(1000_00, 1050_00)).toBe(false);
  });
  it('flags > 5% under-spend (negative variance)', () => {
    expect(isVarianceFlagged(1000_00, 940_00)).toBe(true); // -6%
  });
  it('does not flag a zero approved baseline (defensive)', () => {
    expect(isVarianceFlagged(0, 1_00)).toBe(false);
  });
});

describe('mock JWT signing + validation', () => {
  it('round-trips a freshly signed token', () => {
    const { token, claims } = signMockToken({
      projectId: 'p-ohana',
      ownerId: 'cp-davisen',
      slug: 'ohana-house',
    });
    expect(token.split('.').length).toBe(3);
    const result = validateMockToken(token, 'ohana-house');
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.claims.aud).toBe('portal');
      expect(result.claims.pid).toBe('p-ohana');
      expect(result.claims.sub).toBe('cp-davisen');
      expect(result.claims.slug).toBe(claims.slug);
    }
  });

  it('rejects a token whose body has been tampered with', () => {
    const { token } = signMockToken({
      projectId: 'p-ohana',
      ownerId: 'cp-davisen',
      slug: 'ohana-house',
    });
    const [h, , s] = token.split('.');
    // Replace the payload with a different valid base64url payload — the
    // signature won't match.
    const tampered = `${h}.${Buffer.from(JSON.stringify({ aud: 'portal' }))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')}.${s}`;
    const result = validateMockToken(tampered, 'ohana-house');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe('bad_signature');
    }
  });

  it('rejects an expired token', () => {
    const { token } = signMockToken({
      projectId: 'p-ohana',
      ownerId: 'cp-davisen',
      slug: 'ohana-house',
      ttlSeconds: -10, // already expired
    });
    const result = validateMockToken(token, 'ohana-house');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe('expired');
    }
  });

  it('rejects a slug-scope mismatch', () => {
    const { token } = signMockToken({
      projectId: 'p-ohana',
      ownerId: 'cp-davisen',
      slug: 'ohana-house',
    });
    const result = validateMockToken(token, 'duval-flicflac');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe('wrong_scope');
    }
  });
});
