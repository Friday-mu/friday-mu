import { describe, expect, it } from 'vitest';
import {
  FRIDAY_CATALOG_HISTORY,
  FRIDAY_STYLE_GUIDE,
} from './fridayCatalogHistory';

describe('FRIDAY_CATALOG_HISTORY', () => {
  it('has more than 30 entries imported from real project data', () => {
    expect(FRIDAY_CATALOG_HISTORY.length).toBeGreaterThan(30);
  });

  it('covers all 3 source projects', () => {
    const labels = new Set(FRIDAY_CATALOG_HISTORY.map((e) => e.sourceProjectLabel));
    expect(labels).toContain('Appadoo RC 15');
    expect(labels).toContain('Lagon Bleu LB-2');
    expect(labels).toContain('Nooranee RCN-4');
  });

  it('uses normalised keys (lowercase, single-spaced) on every entry', () => {
    for (const entry of FRIDAY_CATALOG_HISTORY) {
      expect(entry.normalizedKey).toBe(entry.normalizedKey.toLowerCase());
      // No double spaces, no leading/trailing whitespace.
      expect(entry.normalizedKey).not.toMatch(/\s{2,}/);
      expect(entry.normalizedKey).toBe(entry.normalizedKey.trim());
    }
  });

  it('non-internal entries all have a positive unitCostMinor', () => {
    const nonInternal = FRIDAY_CATALOG_HISTORY.filter((e) => !e.internalWork);
    for (const entry of nonInternal) {
      expect(entry.unitCostMinor).toBeGreaterThan(0);
    }
  });

  it('has Courts as the most-cited vendor (verifies parser saw real data)', () => {
    const counts = new Map<string, number>();
    for (const e of FRIDAY_CATALOG_HISTORY) {
      if (!e.vendor) continue;
      counts.set(e.vendor, (counts.get(e.vendor) ?? 0) + 1);
    }
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    expect(sorted[0][0]).toBe('Courts');
    expect(sorted[0][1]).toBeGreaterThan(20);
  });
});

describe('FRIDAY_STYLE_GUIDE', () => {
  it('ranks Courts as the top preferred vendor', () => {
    expect(FRIDAY_STYLE_GUIDE.preferredVendors[0].name).toBe('Courts');
    expect(FRIDAY_STYLE_GUIDE.preferredVendors[0].sampleCount).toBeGreaterThan(20);
  });

  it('returns sensible category coverage for Courts (the multi-category vendor)', () => {
    const courts = FRIDAY_STYLE_GUIDE.preferredVendors.find((v) => v.name === 'Courts');
    expect(courts).toBeDefined();
    expect(courts!.categories).toContain('furniture');
    expect(courts!.categories).toContain('appliance');
  });

  it('provides p25/p50/p75 with p25 <= p50 <= p75 for furniture', () => {
    const r = FRIDAY_STYLE_GUIDE.priceRangesByCategory.furniture;
    expect(r.samples).toBeGreaterThan(10);
    expect(r.p25).toBeLessThanOrEqual(r.p50);
    expect(r.p50).toBeLessThanOrEqual(r.p75);
    // Sanity: a Friday furniture item median should be > Rs 1,000 (100_000 cents)
    expect(r.p50).toBeGreaterThan(100_000);
  });

  it('includes all 9 BudgetCategory keys in priceRangesByCategory', () => {
    const expected = [
      'furniture',
      'appliance',
      'decor',
      'lighting',
      'linen',
      'contractor',
      'labour',
      'transport',
      'cleaning',
    ];
    for (const k of expected) {
      expect(FRIDAY_STYLE_GUIDE.priceRangesByCategory).toHaveProperty(k);
    }
  });

  it('notes mentions Courts (the dominant vendor)', () => {
    expect(FRIDAY_STYLE_GUIDE.notes).toMatch(/Courts/);
    expect(FRIDAY_STYLE_GUIDE.notes.length).toBeGreaterThan(80);
  });
});
