import { describe, expect, it } from 'vitest';
import {
  ANNEX_A_DEFAULT,
  designFeeForTier,
  estimateRoughBudget,
  isVarianceFlagged,
  procurementFeeForTier,
  signMockToken,
  stripForOwner,
  tierForEpc,
  validateMockToken,
  vatOf,
  withVAT,
  TASKS,
  type AnnexAConfig,
  type BudgetItem,
  type DesignTask,
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

describe('estimateRoughBudget — per-line override semantics', () => {
  it('lines with no override + no catalog match are unmatched (0 contribution)', () => {
    const result = estimateRoughBudget([
      { itemName: 'thing-with-no-history', qty: 2 },
    ]);
    expect(result.lowMinor).toBe(0);
    expect(result.midMinor).toBe(0);
    expect(result.highMinor).toBe(0);
    expect(result.unmatched).toHaveLength(1);
    expect(result.matched).toHaveLength(0);
  });

  it('override locks all three totals to (override × qty)', () => {
    const override = 50_000_00; // Rs 50,000 per unit
    const qty = 3;
    const result = estimateRoughBudget([
      { itemName: 'item-without-catalog', qty, unitCostMinorOverride: override },
    ]);
    const expected = override * qty;
    expect(result.lowMinor).toBe(expected);
    expect(result.midMinor).toBe(expected);
    expect(result.highMinor).toBe(expected);
    // Override-only (no catalog hit) ⇒ neither matched nor unmatched
    expect(result.unmatched).toHaveLength(0);
    expect(result.matched).toHaveLength(0);
  });

  it('null override is equivalent to omitting the field (no behaviour change)', () => {
    // Use the same itemName both ways — whether catalog matches or not is
    // immaterial; what matters is that null override doesn't accidentally
    // lock totals to 0 or change the matched/unmatched routing.
    const withNullOverride = estimateRoughBudget([{ itemName: 'x', qty: 2, unitCostMinorOverride: null }]);
    const withoutField = estimateRoughBudget([{ itemName: 'x', qty: 2 }]);
    expect(withNullOverride.lowMinor).toBe(withoutField.lowMinor);
    expect(withNullOverride.midMinor).toBe(withoutField.midMinor);
    expect(withNullOverride.highMinor).toBe(withoutField.highMinor);
    expect(withNullOverride.matched.length).toBe(withoutField.matched.length);
    expect(withNullOverride.unmatched.length).toBe(withoutField.unmatched.length);
  });

  it('override beats catalog when both present', () => {
    const override = 99_000_00;
    const result = estimateRoughBudget([
      { itemName: 'thing', qty: 1, unitCostMinorOverride: override },
    ]);
    expect(result.lowMinor).toBe(override);
    expect(result.midMinor).toBe(override);
    expect(result.highMinor).toBe(override);
  });

  it('zero or negative override ignored, falls back to catalog/unmatched path', () => {
    const result = estimateRoughBudget([
      { itemName: 'unknown', qty: 1, unitCostMinorOverride: 0 },
      { itemName: 'unknown2', qty: 1, unitCostMinorOverride: -100 },
    ]);
    // Both fall through to catalog lookup. No catalog match → unmatched.
    expect(result.unmatched).toHaveLength(2);
    expect(result.midMinor).toBe(0);
  });
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

// ─────────────────────────── design-be-18: task category ───────────────────────────

// ─────────────────────────── design-be-20: VAT helpers ───────────────────────────

describe('withVAT / vatOf — Mauritius 15% VAT applied on top of Annex A rates', () => {
  it('default config carries the Mauritius standard rate (0.15)', () => {
    expect(ANNEX_A_DEFAULT.vatRate).toBe(0.15);
  });

  it('withVAT — Tier 3 design fee (Rs 25,000) inflates to Rs 28,750 incl. VAT', () => {
    // Rs 25,000 × 1.15 = Rs 28,750 → 28_750_00 minor
    expect(withVAT(ANNEX_A_DEFAULT.designFee.tier3FlatMinor)).toBe(28_750_00);
  });

  it('withVAT — handles a non-integer round-trip without drift', () => {
    // Use a fee that does NOT divide evenly by 100. 12_345_67 × 1.15 = 14_197_5205
    // → Math.round = 14_197_52. Pure-math sanity check.
    expect(withVAT(12_345_67)).toBe(14_197_52);
  });

  it('vatOf — Tier 3 design fee (Rs 25,000) carries Rs 3,750 of VAT', () => {
    expect(vatOf(ANNEX_A_DEFAULT.designFee.tier3FlatMinor)).toBe(3_750_00);
  });

  it('vatRate = 0 → withVAT is identity, vatOf is zero', () => {
    const zeroVatCfg: AnnexAConfig = { ...ANNEX_A_DEFAULT, vatRate: 0 };
    expect(withVAT(25_000_00, zeroVatCfg)).toBe(25_000_00);
    expect(vatOf(25_000_00, zeroVatCfg)).toBe(0);
  });

  it('fee = 0 → both helpers return 0 regardless of rate', () => {
    expect(withVAT(0)).toBe(0);
    expect(vatOf(0)).toBe(0);
    const zeroVatCfg: AnnexAConfig = { ...ANNEX_A_DEFAULT, vatRate: 0 };
    expect(withVAT(0, zeroVatCfg)).toBe(0);
    expect(vatOf(0, zeroVatCfg)).toBe(0);
  });

  it('helpers compose: withVAT(x) === x + vatOf(x) (modulo rounding)', () => {
    // Both helpers Math.round independently, so equality is only guaranteed
    // when the unrounded products land cleanly. Use a fee that satisfies this:
    // 100_000_00 × 0.15 = 15_000_00 (exact). 100_000_00 × 1.15 = 115_000_00.
    const fee = 100_000_00;
    expect(withVAT(fee)).toBe(fee + vatOf(fee));
  });
});

describe('DesignTask.category — fixture defaults', () => {
  it("execution-stage TASKS fixture all default to category='general'", () => {
    expect(TASKS.length).toBeGreaterThan(0);
    for (const t of TASKS) {
      expect(t.category).toBe('general');
    }
  });

  it('accepts the three discriminator values at the type level', () => {
    const a: DesignTask['category'] = 'general';
    const b: DesignTask['category'] = 'blocker';
    const c: DesignTask['category'] = 'next_action';
    expect([a, b, c]).toEqual(['general', 'blocker', 'next_action']);
  });
});
