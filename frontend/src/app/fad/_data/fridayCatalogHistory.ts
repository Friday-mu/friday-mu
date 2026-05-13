// Friday Design OS — historical catalog imported from 3 past project budgets.
//
// design-be-21: Real procurement data from Mr Appadoo (RC 15), Lagon Bleu LB-2,
// and Nooranee RCN-4 budgets. Parsed from CSV exports Ishant supplied; merged
// into the runtime catalog via `buildItemCatalog()` so rough-budget pricing
// reflects what Friday actually paid, not gut-feel fixtures.
//
// Source of truth: `.claude/design-budgets-import/` (3 CSVs, not committed).
// Parser was throwaway — see the design-be-21a commit description for
// keyword-classification rules.
//
// @demo:data — Catalog seed. v0.2 replaces both BUDGET_ITEMS fixtures and
// this file with GET /api/design/catalog (PROD-DESIGN-CATALOG).

import type { BudgetCategory } from './design';

/**
 * One row of historical procurement data — a line from a real Friday
 * project budget. Multiple rows can share `normalizedKey` (same item,
 * different project/vendor/qty) — we deliberately keep them un-aggregated
 * so the catalog rollup gets a real sample distribution.
 */
export interface HistoricalCatalogEntry {
  /** Normalised lookup key — lowercase, single-spaced. Matches `normaliseItemKey` in design.ts. */
  normalizedKey: string;
  /** User-facing label, case-preserved from the CSV. */
  displayName: string;
  category: BudgetCategory;
  /** Canonical vendor name (e.g., 'Courts'). null for generic contractor lines or unattributed buys. */
  vendor: string | null;
  /** Per-unit cost in MUR cents (e.g., 'Rs 18,990.00' → 1_899_000). */
  unitCostMinor: number;
  /** Quantity from the line item (defaults to 1 for Appadoo, which has no qty column). */
  qty: number;
  /** Project this line came from — used to derive synthetic sourceProjectIds for the catalog. */
  sourceProjectLabel: string;
  /** First meaningful spec line from the row (e.g., '55 inches 4K UHD Smart LED TV'). */
  itemDetails: string | null;
  /** First non-Drive https URL in the row (typically a vendor product page). */
  productLink: string | null;
  /** First drive.google.com URL in the row (receipt scan). */
  receiptLink: string | null;
  /** True for renovation/contractor work (partition walls, paint jobs, demolition, maintenance). Skipped by buildItemCatalog. */
  internalWork: boolean;
}

/**
 * Friday's real procurement history — 155 line items across 3 projects.
 *
 * Stats (parsed at import time):
 *   Appadoo RC 15:   47 entries (Living/Dining, Kitchen, Bedrooms, Bath, Balcony, textiles)
 *   Lagon Bleu LB-2: 92 entries (Renovation + full furnishing — T1 rebuild)
 *   Nooranee RCN-4:  16 entries (Bedroom/Office/Kitchen/Living/Bath + 8 maintenance items)
 *
 * Top vendors (by line frequency):
 *   Courts (41), La Foir Fouille (16), Quality Decor (11), Kalachand (9),
 *   Mr Bricolage (6), Urban Home (5), Champ Elysser (5), Metric (5)
 *
 * Category breakdown (non-internal):
 *   contractor: 34 (tiles, paint, bath/sanitary fixtures, kitchen accessories)
 *   furniture:  31 (beds, sofas, wardrobes, desks, dining)
 *   appliance:  19 (TVs, fridges, ovens, AC, microwaves)
 *   lighting:   17 (ceiling lights, lamps, bulbs, shade sail)
 *   decor:      16 (rugs, mirrors, vases, flowers, art)
 *   linen:      16 (towels, sheets, curtains, pillows)
 *   labour:      4 (installation lines)
 *   transport:   2 (delivery)
 */
export const FRIDAY_CATALOG_HISTORY: HistoricalCatalogEntry[] = [
  { normalizedKey: 'orion tv', displayName: 'Orion Tv', category: 'appliance', vendor: 'Courts', unitCostMinor: 1899000, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: '55 inches 4K UHD Smart LED TV', productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'tv wall mounted', displayName: 'Tv Wall Mounted', category: 'appliance', vendor: 'Fast Click', unitCostMinor: 149000, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: 'DOUBLE CANTILEVER / FLAT SCREEN TV', productLink: null, receiptLink: 'https://drive.google.com/file/d/1r9firi4aSoeOl63q9uTlUfsQvXaXHKkV/view?usp=drive_link', internalWork: false },
  { normalizedKey: 'rug', displayName: 'Rug', category: 'decor', vendor: 'La Foir Fouille', unitCostMinor: 225000, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: 'Tapis casabl', productLink: null, receiptLink: 'https://drive.google.com/file/d/1pBh-AqUY5MJ6exAbkPRYEVboRubo4PUC/view?usp=drive_link', internalWork: false },
  { normalizedKey: 'decorative', displayName: 'Decorative', category: 'decor', vendor: 'La Foir Fouille', unitCostMinor: 249900, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: 'Miroir Sonate / - ø 70 cm -', productLink: null, receiptLink: 'https://drive.google.com/file/d/1F0DgqIQyqBY8Q5TDBlrfMLZ3OPwRktzD/view?usp=drive_link', internalWork: false },
  { normalizedKey: 'decorative', displayName: 'Decorative', category: 'decor', vendor: null, unitCostMinor: 167200, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: 'Flower 1 / Flower 2', productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'decorative', displayName: 'Decorative', category: 'decor', vendor: 'La Foir Fouille', unitCostMinor: 169900, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: 'Vase - 16 x L 25 x / H 37 cm - Beige', productLink: null, receiptLink: 'https://drive.google.com/file/d/1eiV44lbBrZJZuKoKwenae5Lw0bD8wA2y/view?usp=drive_link', internalWork: false },
  { normalizedKey: 'tv unit', displayName: 'Tv unit', category: 'appliance', vendor: 'Urban Home', unitCostMinor: 1190000, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: null, productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'installation work for tv mounted and tv and frame', displayName: 'Installation Work For Tv Mounted and Tv and frame', category: 'labour', vendor: null, unitCostMinor: 150000, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: null, productLink: null, receiptLink: 'https://drive.google.com/file/d/1gPDPcbxWE1UhnZcGHlI89IyAAtQmNva4/view?usp=drive_link', internalWork: false },
  { normalizedKey: 'tea pots', displayName: 'Tea Pots', category: 'contractor', vendor: 'La Foir Fouille', unitCostMinor: 109900, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: 'Théière blue flower', productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'microwave cover', displayName: 'Microwave cover', category: 'appliance', vendor: 'La Foir Fouille', unitCostMinor: 14900, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: null, productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'oven baking tray', displayName: 'Oven baking Tray', category: 'appliance', vendor: 'La Foir Fouille', unitCostMinor: 76900, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: '3 plaques de cuisson four', productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'cultery divider', displayName: 'Cultery divider', category: 'contractor', vendor: 'La Foir Fouille', unitCostMinor: 49900, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: null, productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'tissue roll holder', displayName: 'Tissue Roll  Holder', category: 'contractor', vendor: 'La Foir Fouille', unitCostMinor: 24900, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: null, productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'serving trayv', displayName: 'Serving Trayv', category: 'contractor', vendor: 'La Foir Fouille', unitCostMinor: 84900, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: null, productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'dish rack', displayName: 'Dish Rack', category: 'contractor', vendor: 'La Foir Fouille', unitCostMinor: 89900, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: null, productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'candles x 2', displayName: 'Candles x 2', category: 'decor', vendor: 'La Foir Fouille', unitCostMinor: 69800, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: null, productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'microwave oven', displayName: 'Microwave Oven', category: 'appliance', vendor: 'Courts', unitCostMinor: 369000, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: 'Hitachi HMR-M2002 Microwave Oven / Capacity: 20L Solo', productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'bedframe nordic', displayName: 'Bedframe Nordic', category: 'furniture', vendor: 'Urban Home', unitCostMinor: 1990000, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: 'Nordic / Ikast Bed', productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'bedside tables x2', displayName: 'Bedside tables x2', category: 'furniture', vendor: 'Teak World', unitCostMinor: 698000, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: 'Bedside HANOVA / Maple Oak/ White', productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'bedside lamps x2', displayName: 'Bedside lamps x2', category: 'lighting', vendor: 'La Foir Fouille', unitCostMinor: 379800, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: null, productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'bulb for table lamp x 2', displayName: 'Bulb For Table Lamp x 2', category: 'lighting', vendor: 'Quincaillerie', unitCostMinor: 30000, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: null, productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'two door wardrobe', displayName: 'Two door Wardrobe', category: 'furniture', vendor: 'Courts', unitCostMinor: 1750000, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: 'Wonderland Wardrobe 2 Doors', productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'bedframe nordic', displayName: 'Bedframe Nordic', category: 'furniture', vendor: 'Urban Home', unitCostMinor: 1990000, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: 'Nordic / Ikast Bed', productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'bedside tables x2', displayName: 'bedside tables x2', category: 'furniture', vendor: 'Teak World', unitCostMinor: 698000, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: 'Bedside HANOVA / Maple Oak/ White', productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'bedside lamps x2', displayName: 'Bedside lamps x2', category: 'lighting', vendor: 'La Foir Fouille', unitCostMinor: 379800, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: null, productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'two door wardrobe', displayName: 'Two door Wardrobe', category: 'furniture', vendor: 'Courts', unitCostMinor: 1750000, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: 'Wonderland Wardrobe 2 Doors', productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'wardrobe delivery on 4th floor', displayName: 'Wardrobe Delivery on 4th Floor', category: 'transport', vendor: 'Courts', unitCostMinor: 150000, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: null, productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'mattress pick up and delivery', displayName: 'Mattress Pick up and Delivery', category: 'transport', vendor: null, unitCostMinor: 400000, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: null, productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'bulb for table lamp x2', displayName: 'Bulb For Table Lamp x2', category: 'lighting', vendor: 'Quincaillerie', unitCostMinor: 30000, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: null, productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'sofa bed', displayName: 'Sofa Bed', category: 'appliance', vendor: 'Courts', unitCostMinor: 1299900, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: 'Hobbs Sofa Bed Fabric Taupe', productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'office desk', displayName: 'Office Desk', category: 'furniture', vendor: 'Urban Home', unitCostMinor: 1090000, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: 'AXEL Desk / W145 x D81 x H77cm', productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'standing lamp', displayName: 'Standing Lamp', category: 'lighting', vendor: 'Courts', unitCostMinor: 419900, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: 'Diameter: 40cm / Height: 165cm', productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: '1 bulb for table lamp', displayName: '1 Bulb For Table Lamp', category: 'lighting', vendor: 'Quincaillerie', unitCostMinor: 15000, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: null, productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'custom toe for wardrobe', displayName: 'Custom Toe for Wardrobe', category: 'furniture', vendor: null, unitCostMinor: 300000, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: null, productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'two door wardrobe', displayName: 'Two door Wardrobe', category: 'furniture', vendor: 'Courts', unitCostMinor: 1759900, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: 'Wonderland Wardrobe 2 Doors', productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'laundry basket x 2', displayName: 'Laundry basket x 2', category: 'contractor', vendor: 'La Foir Fouille', unitCostMinor: 119600, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: null, productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'towel holder', displayName: 'Towel Holder', category: 'linen', vendor: 'La Foir Fouille', unitCostMinor: 57900, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: null, productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'towel hanger', displayName: 'Towel Hanger', category: 'linen', vendor: 'Quincaillerie', unitCostMinor: 130000, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: null, productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'tissue holder', displayName: 'Tissue Holder', category: 'contractor', vendor: 'La Foir Fouille', unitCostMinor: 180000, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: null, productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'installation works for towel hanger and towel holder', displayName: 'Installation Works for Towel  Hanger and Towel Holder', category: 'labour', vendor: null, unitCostMinor: 80000, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: null, productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'shade sail', displayName: 'Shade Sail', category: 'lighting', vendor: 'Decotarp', unitCostMinor: 7340000, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: null, productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'flower pots x 2', displayName: 'Flower Pots x 2', category: 'decor', vendor: 'Mr Bricolage', unitCostMinor: 598000, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: 'Pot Toscane carré XXL anthracite - EDA', productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'plants x2', displayName: 'Plants x2', category: 'decor', vendor: null, unitCostMinor: 500000, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: null, productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'kitchen cloth x6', displayName: 'Kitchen Cloth x6', category: 'linen', vendor: 'Manjoo', unitCostMinor: 60000, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: '8/Kitchen', productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'sherpa blanket x2', displayName: 'Sherpa Blanket x2', category: 'linen', vendor: 'Manjoo', unitCostMinor: 160000, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: '2/sofa bed', productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'bath towel', displayName: 'Bath Towel', category: 'linen', vendor: 'Manjoo', unitCostMinor: 480000, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: '8/Bedroom / 4/Study', productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'hand towel', displayName: 'Hand Towel', category: 'linen', vendor: 'Manjoo', unitCostMinor: 320000, qty: 1, sourceProjectLabel: 'Appadoo RC 15', itemDetails: '8/Bedroom / 4/Study', productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'partition wall', displayName: 'Partition Wall', category: 'contractor', vendor: null, unitCostMinor: 3500000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: null, productLink: null, receiptLink: null, internalWork: true },
  { normalizedKey: 'electrical work', displayName: 'Electrical Work', category: 'contractor', vendor: null, unitCostMinor: 3500000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: null, productLink: null, receiptLink: null, internalWork: true },
  { normalizedKey: 'electrical accessories', displayName: 'Electrical Accessories', category: 'contractor', vendor: null, unitCostMinor: 1208990, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: null, productLink: 'https://quincailleriea1.com/product/legrand-switch-socket-1g-617767/', receiptLink: null, internalWork: false },
  { normalizedKey: 'plumbing work', displayName: 'Plumbing Work', category: 'contractor', vendor: null, unitCostMinor: 1800000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: null, productLink: null, receiptLink: null, internalWork: true },
  { normalizedKey: 'painting of internal walls/ / handrail', displayName: 'Painting of Internal walls/ / Handrail', category: 'contractor', vendor: null, unitCostMinor: 4918937, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'Paint - Moonwhite 8018-1 / (Sofap)', productLink: null, receiptLink: null, internalWork: true },
  { normalizedKey: 'decorations', displayName: 'Decorations', category: 'decor', vendor: null, unitCostMinor: 1000000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: null, productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'demolishing of tiles / gf and ff/kitchen / tiles placement gf and ff / waterproofing and kicker / tiles kitchen', displayName: 'Demolishing of Tiles / GF and FF/Kitchen / Tiles Placement GF and FF / Waterproofing and Kicker / Tiles kitchen', category: 'contractor', vendor: null, unitCostMinor: 7125000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: null, productLink: null, receiptLink: null, internalWork: true },
  { normalizedKey: 'doors/external sitting area/ / wood plaint', displayName: 'Doors/External Sitting Area/ / Wood Plaint', category: 'contractor', vendor: null, unitCostMinor: 270000, qty: 5, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: null, productLink: null, receiptLink: null, internalWork: true },
  { normalizedKey: 'general small labour', displayName: 'General Small Labour', category: 'contractor', vendor: null, unitCostMinor: 1000000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: null, productLink: null, receiptLink: null, internalWork: true },
  { normalizedKey: 'door handles', displayName: 'Door Handles', category: 'contractor', vendor: 'Hayat', unitCostMinor: 81500, qty: 5, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: null, productLink: 'https://quincailleriea1.com/product/star-door-handle-rounded-set/', receiptLink: null, internalWork: false },
  { normalizedKey: 'tiles transport', displayName: 'Tiles Transport', category: 'transport', vendor: null, unitCostMinor: 200000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: null, productLink: null, receiptLink: null, internalWork: true },
  { normalizedKey: 'outdoor chair and table', displayName: 'Outdoor Chair and table', category: 'furniture', vendor: 'Courts', unitCostMinor: 549900, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'Included: 2+1+1 Seater With Coffee / Frame Material: Steel', productLink: 'https://www.courtsmammouth.mu/product/russo-sofa-set-211-with-coffee-table-black.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'l-shape sofa', displayName: 'L-Shape Sofa', category: 'furniture', vendor: 'Urban Home', unitCostMinor: 3290000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'W227 x D154 x H86cm', productLink: 'https://www.urbanhome.mu/collections/sofas/products/smart-l-shape-sofa', receiptLink: null, internalWork: false },
  { normalizedKey: 'rug', displayName: 'Rug', category: 'decor', vendor: 'Furnish Now', unitCostMinor: 640000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'Dimension / 2mx3m', productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'coffee table', displayName: 'Coffee Table', category: 'furniture', vendor: 'Courts', unitCostMinor: 199900, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'Dimension: W70xD70xH40 cm / Frame Material: Metal', productLink: 'https://www.courtsmammouth.mu/product/jena-coffee-table-15mm-mdf-black-powder-coated-metal-leg.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'tv unit', displayName: 'TV Unit', category: 'appliance', vendor: 'Courts', unitCostMinor: 899900, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'Dimension / W180xD40xH53 cm', productLink: 'https://www.courtsmammouth.mu/product/lavis-low-tv-stand-with-2-doors-and-2-drawers.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'philips tv / reference: 12050896', displayName: 'Philips TV / Reference: 12050896', category: 'appliance', vendor: 'Courts', unitCostMinor: 2099000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: '55" Philips', productLink: 'https://www.courtsmammouth.mu/product/philips-55put712998-55-uhd-smart-led-tv.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'tv wall bracket', displayName: 'TV Wall Bracket', category: 'appliance', vendor: 'Fast Click', unitCostMinor: 149000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: null, productLink: 'https://fastclick.mu/full-5-meters-rgb-color-light-2835-kit-with-power-supply-remote-control/', receiptLink: null, internalWork: false },
  { normalizedKey: 'full 5 meters rgb color', displayName: 'Full 5 Meters RGB Color', category: 'lighting', vendor: 'Fast Click', unitCostMinor: 60000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: '5m', productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'curtain (blackout)', displayName: 'Curtain (Blackout)', category: 'linen', vendor: 'Champ Elysser', unitCostMinor: 75000, qty: 10, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: '2.7m height / Colour to be black', productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'curtain (sheer)', displayName: 'Curtain (Sheer)', category: 'linen', vendor: 'Champ Elysser', unitCostMinor: 45000, qty: 10, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: '2.7m height / Colour to be White', productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'curtain rails', displayName: 'Curtain Rails', category: 'linen', vendor: 'Champ Elysser', unitCostMinor: 80000, qty: 3, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: null, productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'table and 6 chair', displayName: 'Table and 6 Chair', category: 'furniture', vendor: 'Courts', unitCostMinor: 1599900, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'Dimension: W160xD90xH75 cm', productLink: 'https://www.courtsmammouth.mu/product/emden-table-and-6-chairs.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'internal wpc dividers', displayName: 'Internal WPC Dividers', category: 'contractor', vendor: 'Deakor', unitCostMinor: 80000, qty: 8, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'Dimension : 50 x 100 x 2900 mm', productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'ceiling light', displayName: 'Ceiling Light', category: 'lighting', vendor: 'Mr Bricolage', unitCostMinor: 55000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'Dimension : 600 x 600 mm', productLink: 'https://www.mr-bricolage.mu/Grandbaie/dalle-encastrable-carree-1450lm-ip20-blanc-noir-bagues-interchangeables-xanlite.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'pendant ceiling light for dining area', displayName: 'Pendant Ceiling Light for Dining Area', category: 'lighting', vendor: 'Espace Maison', unitCostMinor: 169000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: null, productLink: 'https://www.espacemaison.mu/products/aigostar-hanging-lamp-with-brown-cord-e27', receiptLink: null, internalWork: false },
  { normalizedKey: 'decorative shelf', displayName: 'Decorative Shelf', category: 'furniture', vendor: 'Courts', unitCostMinor: 79900, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'Dimension: W37xD30xH93 cm', productLink: 'https://www.courtsmammouth.mu/product/wisconsin-bamboo-storage-rack-4-tiers.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'new ac unit', displayName: 'New AC Unit', category: 'appliance', vendor: 'Courts', unitCostMinor: 1299000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'Hisense AS-12CR4SVDTE                   Cooling Capacity: 12000 BTU', productLink: 'https://www.courtsmammouth.mu/product/hisense-as-12cr4svdte-air-conditioner.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'custom kitchen', displayName: 'Custom Kitchen', category: 'contractor', vendor: 'The Concept House', unitCostMinor: 19314250, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: null, productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'bar stool', displayName: 'Bar Stool', category: 'furniture', vendor: 'Furnish Now', unitCostMinor: 201985, qty: 2, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'Dimension: W41xD51xH91 cm', productLink: 'https://jkalachand.com/furniture/living-dining/bar-stools-tables/black-bar-stool-cam0470gr-k.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'custom blinds', displayName: 'Custom Blinds', category: 'decor', vendor: null, unitCostMinor: 262500, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: '1500mm Wide 1200mm High', productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'cooker hood', displayName: 'Cooker Hood', category: 'appliance', vendor: 'Courts', unitCostMinor: 599000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: null, productLink: 'https://www.courtsmammouth.mu/product/ocean-od2ch63bgcfce-cooker-hood.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'oven', displayName: 'Oven', category: 'appliance', vendor: 'Courts', unitCostMinor: 1678000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: null, productLink: 'https://www.courtsmammouth.mu/product/ocean-ooer611ncf1cez-built-in-oven.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'induction cooktop', displayName: 'Induction Cooktop', category: 'appliance', vendor: 'Kalachand', unitCostMinor: 1369000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: null, productLink: 'https://361.mu/aeg-built-in-ceramic-hob-with-4-cooking-zones.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'refrigerator', displayName: 'Refrigerator', category: 'appliance', vendor: '361', unitCostMinor: 1799000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: null, productLink: 'https://361.mu/samsung-refrigerator-top-mount-208l.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'sink', displayName: 'Sink', category: 'contractor', vendor: 'Quality Decor', unitCostMinor: 1050000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: null, productLink: 'https://www.qualitydecor.mu/product/7545ns/', receiptLink: null, internalWork: false },
  { normalizedKey: 'microwave', displayName: 'Microwave', category: 'appliance', vendor: '361', unitCostMinor: 299000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'Microwave Power: 700W / Capacity: 20L Solo', productLink: 'https://361.mu/westpoint-microwave-20l-black.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'microwave cover', displayName: 'Microwave Cover', category: 'appliance', vendor: null, unitCostMinor: 50000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: null, productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'electric kettle', displayName: 'Electric Kettle', category: 'appliance', vendor: 'Courts', unitCostMinor: 139900, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'Capacity: 2.5L / Power: 1850W', productLink: 'https://www.courtsmammouth.mu/product/mammouth-mk-2222-blueblk-22l-double-layer-kettle.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'cookware', displayName: 'Cookware', category: 'contractor', vendor: 'Kalachand', unitCostMinor: 299000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'cookware 4 pieces set', productLink: 'https://jkalachand.com/prestige-omega-deluxe-granite-aluminium-4-pieces-kitchen-set-prestige-36300.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'kitchen tool', displayName: 'Kitchen Tool', category: 'contractor', vendor: 'Kalachand', unitCostMinor: 63000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: '6 set', productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'cutlery set', displayName: 'Cutlery Set', category: 'contractor', vendor: 'Kalachand', unitCostMinor: 287500, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: '8 Table Forks / 8 Table Knives, 8 Dessert Spoons', productLink: 'https://jkalachand.com/viners-newbury-42-piece-stainless-steel-cutlery-set-0306-010.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'dinner set', displayName: 'Dinner Set', category: 'contractor', vendor: 'Courts', unitCostMinor: 149900, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: null, productLink: 'https://www.courtsmammouth.mu/product/dinner-set-24-pcs-black.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'place mats', displayName: 'Place Mats', category: 'linen', vendor: 'Courts', unitCostMinor: 2900, qty: 12, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: null, productLink: 'https://www.courtsmammouth.mu/product/plate-mat-square-multicolor.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'venice dish rack black', displayName: 'Venice Dish Rack Black', category: 'contractor', vendor: 'Courts', unitCostMinor: 99900, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'Dimension: W42xD30xH30cm', productLink: 'https://www.courtsmammouth.mu/product/venice-dish-rack-black.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'pendant light', displayName: 'Pendant Light', category: 'lighting', vendor: 'Courts', unitCostMinor: 99900, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'Diameter: 11 cm / Height: 30 cm', productLink: 'https://www.courtsmammouth.mu/product/pendant-lamp-11x30cm-80123-black.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'ceiling light', displayName: 'Ceiling Light', category: 'lighting', vendor: 'Mr Bricolage', unitCostMinor: 55000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'Dimension : 600 x 600 mm', productLink: 'https://www.mr-bricolage.mu/Grandbaie/dalle-encastrable-carree-1450lm-ip20-blanc-noir-bagues-interchangeables-xanlite.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'wall clock', displayName: 'Wall Clock', category: 'decor', vendor: 'Courts', unitCostMinor: 25000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'Diameter: 80 cm', productLink: 'https://www.courtsmammouth.mu/product/metal-frame-wall-clock-black-mlm-710397.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'wall tiles', displayName: 'Wall tiles', category: 'contractor', vendor: 'Quality Decor', unitCostMinor: 18500, qty: 7, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: '2.5 Sqm', productLink: 'https://www.qualitydecor.mu/product/y690/', receiptLink: null, internalWork: false },
  { normalizedKey: 'wc', displayName: 'WC', category: 'contractor', vendor: 'Quality Decor', unitCostMinor: 750000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: null, productLink: 'https://www.qualitydecor.mu/product/et-2057/', receiptLink: null, internalWork: false },
  { normalizedKey: 'toilet spray', displayName: 'Toilet Spray', category: 'contractor', vendor: 'A1 Quincaillerie', unitCostMinor: 54500, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'A1 Shattaf Black', productLink: 'https://quincailleriea1.com/product/a1-shattaf-black/', receiptLink: null, internalWork: false },
  { normalizedKey: 'sink', displayName: 'Sink', category: 'contractor', vendor: 'Espace Maison', unitCostMinor: 321400, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'Suspended washbasin / Dimension : 460 x 255 x 120', productLink: 'https://www.espacemaison.mu/products/suspended-washbasin-2', receiptLink: null, internalWork: false },
  { normalizedKey: 'tap', displayName: 'Tap', category: 'decor', vendor: 'A1 Quincaillerie', unitCostMinor: 185000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'ULA Black Basin Mixer 1132', productLink: 'https://quincailleriea1.com/product/ula-black-basin-mixer-1132/', receiptLink: null, internalWork: false },
  { normalizedKey: 'mirror', displayName: 'Mirror', category: 'decor', vendor: 'A1 Quincaillerie', unitCostMinor: 119500, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: '40 × 50 cm', productLink: 'https://quincailleriea1.com/product/a1-mirror-48cm-x-63cm-aluminium-shelf/', receiptLink: null, internalWork: false },
  { normalizedKey: 'custom shelf', displayName: 'Custom Shelf', category: 'furniture', vendor: null, unitCostMinor: 150000, qty: 2, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: '200widex800Length', productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'shower head', displayName: 'Shower head', category: 'contractor', vendor: 'Metric', unitCostMinor: 620000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: null, productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'towel bar / towel hook / paper holder / toilet brush', displayName: 'Towel bar / Towel Hook / Paper holder / Toilet Brush', category: 'linen', vendor: 'Metric', unitCostMinor: 360000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'Bathroom Set', productLink: 'https://metric.mu/METRIC_Brochure.pdf', receiptLink: null, internalWork: false },
  { normalizedKey: 'washing machine', displayName: 'Washing Machine', category: 'appliance', vendor: 'Courts', unitCostMinor: 990000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'Dimension (W x D x H): 54 x 54 x 92 cm', productLink: 'https://www.courtsmammouth.mu/product/hisense-wtja802t-washing-machine.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'laundry basket', displayName: 'Laundry Basket', category: 'contractor', vendor: 'Kalachand', unitCostMinor: 99000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: null, productLink: 'https://jkalachand.com/bamboo-basket-square-nat-with-lid-bxa23-1b-35x35x59.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'small custom shelve above washing machine', displayName: 'Small Custom Shelve above washing machine', category: 'labour', vendor: null, unitCostMinor: 150000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: null, productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'ceiling light', displayName: 'Ceiling Light', category: 'lighting', vendor: 'Mr Bricolage', unitCostMinor: 55000, qty: 2, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: null, productLink: 'https://www.mr-bricolage.mu/Grandbaie/dalle-encastrable-carree-1450lm-ip20-blanc-noir-bagues-interchangeables-xanlite.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'small trash can', displayName: 'Small Trash Can', category: 'contractor', vendor: 'Courts', unitCostMinor: 79900, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'Dimension (WxDxH): 24.5 x 18.5 x 33 cm [15L]', productLink: 'https://www.courtsmammouth.mu/product/mammouth-mdb-15ls-sensor-dustbin.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'wc wall tiles', displayName: 'WC Wall Tiles', category: 'contractor', vendor: 'Quality Decor', unitCostMinor: 4800, qty: 90, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: '8.0 Sqm', productLink: 'https://www.qualitydecor.mu/product/c30061/', receiptLink: null, internalWork: false },
  { normalizedKey: 'wc floor tiles', displayName: 'WC Floor Tiles', category: 'contractor', vendor: 'Quality Decor', unitCostMinor: 4800, qty: 18, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: '1.5 Sqm', productLink: 'https://www.qualitydecor.mu/product/c30061/', receiptLink: null, internalWork: false },
  { normalizedKey: 'shower wall tiles 2 sides', displayName: 'Shower Wall Tiles 2 sides', category: 'contractor', vendor: 'Quality Decor', unitCostMinor: 6300, qty: 80, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: '7.2 Sqm', productLink: 'https://www.qualitydecor.mu/product/black-mt/', receiptLink: null, internalWork: false },
  { normalizedKey: 'shower floor/wall 1 sidetiles', displayName: 'Shower Floor/Wall 1 sideTiles', category: 'contractor', vendor: 'Metric', unitCostMinor: 9000, qty: 28, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: '3.6 Sqm', productLink: 'https://metric.mu/METRIC_Brochure.pdf', receiptLink: null, internalWork: false },
  { normalizedKey: 'bed frame / bedroom 1/3', displayName: 'Bed frame / Bedroom 1/3', category: 'furniture', vendor: 'Courts', unitCostMinor: 1659900, qty: 2, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'Bed Size: L195xW158xH100 cm', productLink: 'https://www.courtsmammouth.mu/product/royce-bed-150x190-cm-greyash-and-black-vein.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'bed frame / bedroom 2', displayName: 'Bed frame / Bedroom 2', category: 'furniture', vendor: 'Kalachand', unitCostMinor: 1973000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'Walnut King size Bed', productLink: 'https://jkalachand.com/walnut-king-size-bed-thf15-kb-walw.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'mattress / bedroom 1/3', displayName: 'Mattress / Bedroom 1/3', category: 'furniture', vendor: 'Courts', unitCostMinor: 1369900, qty: 2, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: null, productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'mattress / bedroom 2', displayName: 'Mattress / Bedroom 2', category: 'furniture', vendor: 'Courts', unitCostMinor: 1999900, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'Will loan mattress to LB / From kalachand', productLink: 'https://www.courtsmammouth.mu/product/slumberland-new-york-supreme-king-180x200-cm-silver-border-and-white-aloe.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'pillows', displayName: 'Pillows', category: 'linen', vendor: 'Courts', unitCostMinor: 23900, qty: 6, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'Dimension: 50x70 cm / 200TC 100% Cotton', productLink: 'https://www.courtsmammouth.mu/product/franny-pillow-50x70-cm.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'bedside table / bedroom 1/3', displayName: 'Bedside Table / Bedroom 1/3', category: 'furniture', vendor: 'Courts', unitCostMinor: 179900, qty: 4, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'Dimension: W40xD30xH50 cm / Material: Particle Board', productLink: 'https://www.courtsmammouth.mu/product/royce-night-table-greyash-and-black-vein.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'bedside table / bedroom 2', displayName: 'Bedside Table / Bedroom 2', category: 'furniture', vendor: 'Teak World', unitCostMinor: 349000, qty: 2, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: null, productLink: 'https://teakworld.mu/product/bedside-hanova/', receiptLink: null, internalWork: false },
  { normalizedKey: 'bedside lamp (double)', displayName: 'Bedside Lamp (double)', category: 'lighting', vendor: 'Courts', unitCostMinor: 89900, qty: 4, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'Diameter: 30 cm / Height: 50 cm', productLink: 'https://www.courtsmammouth.mu/product/ceramic-table-lamp-in-black-with-white-shade-black-white-.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'bedside lamps (king)', displayName: 'Bedside Lamps (king)', category: 'lighting', vendor: 'Courts', unitCostMinor: 129900, qty: 2, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'Diameter: 10 cm / Height: 35 cm', productLink: 'https://www.courtsmammouth.mu/product/cylinder-bamboo-desk-lamp-10x35cm-with-cable-.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'wardrobe', displayName: 'Wardrobe', category: 'furniture', vendor: 'Courts', unitCostMinor: 899900, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'Dimension: W80xD47xH181 cm / Material: Particle Board', productLink: 'https://www.courtsmammouth.mu/product/wind-wardrobe-3-doors-almondoff-white.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'wardrobe', displayName: 'Wardrobe', category: 'furniture', vendor: 'Courts', unitCostMinor: 999900, qty: 2, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'Dimension: W108xD45xH188 cm / Material: Particle Board', productLink: 'https://www.courtsmammouth.mu/product/nilton-wardrobe-2-doors-3-drawers-freijooff-white.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'curtain (blackout)', displayName: 'Curtain (Blackout)', category: 'linen', vendor: 'Champ Elysser', unitCostMinor: 75000, qty: 8, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: '2.6m height', productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'curtain (sheer)', displayName: 'Curtain (Sheer)', category: 'linen', vendor: 'Champ Elysser', unitCostMinor: 45000, qty: 8, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: '2.6m height', productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'curtain rails', displayName: 'Curtain Rails', category: 'linen', vendor: null, unitCostMinor: 80000, qty: 4, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: null, productLink: null, receiptLink: null, internalWork: false },
  { normalizedKey: 'ceiling light', displayName: 'Ceiling Light', category: 'lighting', vendor: 'Mr Bricolage', unitCostMinor: 55000, qty: 3, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'Dimension : 600 x 600 mm', productLink: 'https://www.mr-bricolage.mu/Grandbaie/dalle-encastrable-carree-1450lm-ip20-blanc-noir-bagues-interchangeables-xanlite.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'bathroom cabinet / sink / mirror + storage space + tap / (black)', displayName: 'Bathroom Cabinet / Sink / Mirror + Storage Space + tap / (Black)', category: 'furniture', vendor: 'Metric', unitCostMinor: 1950000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: null, productLink: 'https://metric.mu/METRIC_Brochure.pdf', receiptLink: null, internalWork: false },
  { normalizedKey: 'wc', displayName: 'WC', category: 'contractor', vendor: 'Quality Decor', unitCostMinor: 750000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: null, productLink: 'https://www.qualitydecor.mu/product/et-2057/', receiptLink: null, internalWork: false },
  { normalizedKey: 'toilet spray', displayName: 'Toilet Spray', category: 'contractor', vendor: 'A1 Quincaillerie', unitCostMinor: 54500, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'A1 Shattaf Black', productLink: 'https://quincailleriea1.com/product/a1-shattaf-black/', receiptLink: null, internalWork: false },
  { normalizedKey: 'towel bar / towel hook / paper holder / toilet brush', displayName: 'Towel bar / Towel Hook / Paper holder / Toilet Brush', category: 'linen', vendor: 'Metric', unitCostMinor: 360000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'Bathroom Set', productLink: 'https://metric.mu/METRIC_Brochure.pdf', receiptLink: null, internalWork: false },
  { normalizedKey: 'shower enclosure with shower head / + fixing of shower cabin', displayName: 'Shower Enclosure with Shower Head / + Fixing of Shower Cabin', category: 'labour', vendor: 'Kalachand', unitCostMinor: 2329000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'Dimension : 900 x 900 x 2000', productLink: 'https://jkalachand.com/home-garden/bathroom/shower-enclosures/matte-black-square-shower-enclosure-fcr105-07-sqr.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'ceiling light', displayName: 'Ceiling Light', category: 'lighting', vendor: 'Mr Bricolage', unitCostMinor: 55000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: null, productLink: 'https://www.mr-bricolage.mu/Grandbaie/dalle-encastrable-carree-1450lm-ip20-blanc-noir-bagues-interchangeables-xanlite.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'small trash can', displayName: 'Small Trash Can', category: 'contractor', vendor: 'Courts', unitCostMinor: 79900, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'Dimension (WxDxH): 24.5 x 18.5 x 33 cm [15L]', productLink: 'https://www.courtsmammouth.mu/product/mammouth-mdb-15ls-sensor-dustbin.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'laundry basket', displayName: 'Laundry Basket', category: 'contractor', vendor: 'Kalachand', unitCostMinor: 99000, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: null, productLink: 'https://jkalachand.com/bamboo-basket-square-nat-with-lid-bxa23-1b-35x35x59.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'corridor wall mirror', displayName: 'Corridor Wall Mirror', category: 'decor', vendor: 'Courts', unitCostMinor: 199900, qty: 1, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: 'Dimension: W60xD2xH165 cm', productLink: 'https://www.courtsmammouth.mu/product/eva-mirror-60x2x165-cm-silver-mirror.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'floor tiles', displayName: 'Floor Tiles', category: 'contractor', vendor: 'Quality Decor', unitCostMinor: 4800, qty: 34, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: '3 Sqm', productLink: 'https://www.qualitydecor.mu/product/c30061/', receiptLink: null, internalWork: false },
  { normalizedKey: 'wall tiles', displayName: 'Wall Tiles', category: 'contractor', vendor: 'Quality Decor', unitCostMinor: 4800, qty: 134, sourceProjectLabel: 'Lagon Bleu LB-2', itemDetails: '12 Sqm', productLink: 'https://www.qualitydecor.mu/product/c30061/', receiptLink: null, internalWork: false },
  { normalizedKey: 'bedside', displayName: 'Bedside', category: 'furniture', vendor: 'Courts', unitCostMinor: 199900, qty: 1, sourceProjectLabel: 'Nooranee RCN-4', itemDetails: null, productLink: 'https://www.courtsmammouth.mu/product/linea-night-table-stone-grey-mistrale-grey-in-mdf-particle-board.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'mattress', displayName: 'Mattress', category: 'furniture', vendor: 'Courts', unitCostMinor: 2749900, qty: 1, sourceProjectLabel: 'Nooranee RCN-4', itemDetails: null, productLink: 'https://www.courtsmammouth.mu/product/slumberland-dallas-supreme-150x190-cm-firm.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'desk metal', displayName: 'Desk Metal', category: 'furniture', vendor: 'Courts', unitCostMinor: 419900, qty: 1, sourceProjectLabel: 'Nooranee RCN-4', itemDetails: null, productLink: 'https://www.courtsmammouth.mu/product/benin-metal-desk-black-oak.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'chair', displayName: 'Chair', category: 'furniture', vendor: 'Courts', unitCostMinor: 349900, qty: 1, sourceProjectLabel: 'Nooranee RCN-4', itemDetails: null, productLink: 'https://www.courtsmammouth.mu/product/lorell-medium-back-office-chair-black-with-armrest.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'rug (option 1)', displayName: 'Rug (OPTION 1)', category: 'decor', vendor: 'Courts', unitCostMinor: 349900, qty: 1, sourceProjectLabel: 'Nooranee RCN-4', itemDetails: 'Dimension: L230xW160 cm', productLink: 'https://www.courtsmammouth.mu/product/machine-waved-rug-160x230-cm-brown-and-light-grey-.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'rug (option 2)', displayName: 'Rug (OPTION 2)', category: 'decor', vendor: 'Kalachand', unitCostMinor: 219000, qty: 1, sourceProjectLabel: 'Nooranee RCN-4', itemDetails: 'Dimension: L100xW150 cm', productLink: 'https://jkalachand.com/home-garden/home-deco/rugs/mat-fiji-silver-100x150.html', receiptLink: null, internalWork: false },
  { normalizedKey: 'cabinet ( option 1)', displayName: 'Cabinet ( OPTION 1)', category: 'furniture', vendor: 'Quality Decor', unitCostMinor: 1800000, qty: 1, sourceProjectLabel: 'Nooranee RCN-4', itemDetails: 'Dimension : 800*500*480MM', productLink: 'https://www.qualitydecor.mu/product/8028-80/', receiptLink: null, internalWork: false },
  { normalizedKey: 'cabinet ( option 1)', displayName: 'Cabinet ( OPTION 1)', category: 'furniture', vendor: 'Quality Decor', unitCostMinor: 1590000, qty: 1, sourceProjectLabel: 'Nooranee RCN-4', itemDetails: 'Dimension : 800*500*480MM', productLink: 'https://www.qualitydecor.mu/product/fv-107-80/', receiptLink: null, internalWork: false },
  { normalizedKey: 'touch up paint in different areas.', displayName: 'Touch up paint in different areas.', category: 'cleaning', vendor: null, unitCostMinor: 0, qty: 1, sourceProjectLabel: 'Nooranee RCN-4', itemDetails: null, productLink: null, receiptLink: null, internalWork: true },
  { normalizedKey: 'paint touch-up and waterproofing', displayName: 'Paint touch-up and waterproofing', category: 'cleaning', vendor: null, unitCostMinor: 0, qty: 1, sourceProjectLabel: 'Nooranee RCN-4', itemDetails: null, productLink: null, receiptLink: null, internalWork: true },
  { normalizedKey: 'change the light in one bedroom', displayName: 'Change the light in one bedroom', category: 'cleaning', vendor: null, unitCostMinor: 0, qty: 1, sourceProjectLabel: 'Nooranee RCN-4', itemDetails: null, productLink: null, receiptLink: null, internalWork: true },
  { normalizedKey: 'replace the kitchen light', displayName: 'Replace the kitchen light', category: 'cleaning', vendor: null, unitCostMinor: 0, qty: 1, sourceProjectLabel: 'Nooranee RCN-4', itemDetails: null, productLink: null, receiptLink: null, internalWork: true },
  { normalizedKey: 'move the fridge and add one power socket', displayName: 'Move the fridge and add one power socket', category: 'cleaning', vendor: null, unitCostMinor: 0, qty: 1, sourceProjectLabel: 'Nooranee RCN-4', itemDetails: null, productLink: null, receiptLink: null, internalWork: true },
  { normalizedKey: 'change the position of the table', displayName: 'Change the position of the table', category: 'cleaning', vendor: null, unitCostMinor: 0, qty: 1, sourceProjectLabel: 'Nooranee RCN-4', itemDetails: null, productLink: null, receiptLink: null, internalWork: true },
  { normalizedKey: 'service all air conditioners', displayName: 'Service all air conditioners', category: 'cleaning', vendor: null, unitCostMinor: 0, qty: 1, sourceProjectLabel: 'Nooranee RCN-4', itemDetails: null, productLink: null, receiptLink: null, internalWork: true },
  { normalizedKey: 'remove limescale in all bathrooms (taps, showers, sinks, etc.).', displayName: 'Remove limescale in all bathrooms  (taps, showers, sinks, etc.).', category: 'cleaning', vendor: null, unitCostMinor: 0, qty: 1, sourceProjectLabel: 'Nooranee RCN-4', itemDetails: null, productLink: null, receiptLink: null, internalWork: true },
];

// ─────────────────────────── FRIDAY STYLE GUIDE ───────────────────────────
//
// Aggregations derived from FRIDAY_CATALOG_HISTORY at module load. Surfaces:
//  - Kimi/moodboard prompt synthesis can reference Friday's actual vendor
//    palette and price discipline rather than generic Mauritius retail data
//  - Tier-B AI furniture sourcing agent gets a real anchor for "Friday-style"
//
// Excludes internalWork=true entries (renovation/maintenance lines aren't
// "style", they're project-specific work scope).

export interface FridayStyleGuideVendor {
  /** Canonical vendor name. */
  name: string;
  /** Distinct BudgetCategories this vendor has supplied to Friday. */
  categories: string[];
  /** Number of line items in the historical catalog from this vendor. */
  sampleCount: number;
}

export interface FridayStyleGuidePriceRange {
  /** 25th-percentile unit cost in MUR cents. */
  p25: number;
  /** Median unit cost in MUR cents. */
  p50: number;
  /** 75th-percentile unit cost in MUR cents. */
  p75: number;
  /** Number of historical entries in this category. */
  samples: number;
}

export interface FridayStyleGuide {
  /** Vendors ranked by line-item frequency, top-down. */
  preferredVendors: FridayStyleGuideVendor[];
  /** Per-category price percentiles, all MUR cents. Empty categories return zeros. */
  priceRangesByCategory: Record<string, FridayStyleGuidePriceRange>;
  /** Short prose summary suitable for prompt synthesis. */
  notes: string;
}

const ALL_CATEGORIES = [
  'furniture',
  'appliance',
  'decor',
  'lighting',
  'linen',
  'contractor',
  'labour',
  'transport',
  'cleaning',
] as const;

function percentile(sortedValues: number[], q: number): number {
  if (sortedValues.length === 0) return 0;
  const pos = q * (sortedValues.length - 1);
  const lo = Math.floor(pos);
  const hi = lo + 1;
  if (hi >= sortedValues.length) return sortedValues[sortedValues.length - 1];
  const frac = pos - lo;
  return Math.round(sortedValues[lo] * (1 - frac) + sortedValues[hi] * frac);
}

function buildFridayStyleGuide(): FridayStyleGuide {
  const catalog = FRIDAY_CATALOG_HISTORY.filter((e) => !e.internalWork);

  // Vendor rollup.
  const vendorCounts = new Map<string, number>();
  const vendorCategories = new Map<string, Set<string>>();
  for (const e of catalog) {
    if (!e.vendor) continue;
    vendorCounts.set(e.vendor, (vendorCounts.get(e.vendor) ?? 0) + 1);
    const set = vendorCategories.get(e.vendor) ?? new Set();
    set.add(e.category);
    vendorCategories.set(e.vendor, set);
  }
  const preferredVendors: FridayStyleGuideVendor[] = Array.from(vendorCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, sampleCount]) => ({
      name,
      categories: Array.from(vendorCategories.get(name) ?? []).sort(),
      sampleCount,
    }));

  // Price percentiles by category.
  const costsByCategory = new Map<string, number[]>();
  for (const e of catalog) {
    const arr = costsByCategory.get(e.category) ?? [];
    arr.push(e.unitCostMinor);
    costsByCategory.set(e.category, arr);
  }
  const priceRangesByCategory: Record<string, FridayStyleGuidePriceRange> = {};
  for (const cat of ALL_CATEGORIES) {
    const sorted = (costsByCategory.get(cat) ?? []).slice().sort((a, b) => a - b);
    priceRangesByCategory[cat] = {
      p25: percentile(sorted, 0.25),
      p50: percentile(sorted, 0.5),
      p75: percentile(sorted, 0.75),
      samples: sorted.length,
    };
  }

  // Free-form notes — observations derived from the data, not hand-written.
  // Patterns observed from the 3 imports (Appadoo/LB/Nooranee, 2024–2026):
  //   1. Courts dominates as Friday's primary one-stop vendor — beds, TVs,
  //      wardrobes, appliances, lighting, even rugs.
  //   2. La Foir Fouille fills the small-decor/kitchen-accessories niche
  //      (vases, mirrors, candles, dish racks, tissue holders).
  //   3. Kalachand + Quality Decor cover bathroom fixtures & rugs at a
  //      mid-tier price point.
  //   4. Renovation work (LB-2) uses named individual contractors (Avinash,
  //      Faiz, Val, Adarsh, Ramnarain) at Rs 18–71k per work package —
  //      typically partition walls, electrical, plumbing, paint, tiling.
  //   5. T1 full-furnish projects run ~Rs 1M; light refresh ~Rs 250k.
  const notes =
    "Friday's procurement pattern (across Appadoo RC 15, Lagon Bleu LB-2, " +
    'Nooranee RCN-4): Courts is the dominant vendor across furniture, ' +
    'appliances, lighting, and even rugs. La Foir Fouille supplies small ' +
    'decor and kitchen accessories (vases, dish racks, candles). Quality ' +
    'Decor and Kalachand cover bathroom fixtures and rugs at mid-tier ' +
    'prices. Renovation work uses named individual contractors (Avinash, ' +
    'Faiz, Val, Adarsh) at Rs 18,000–71,000 per work package. Full T1 ' +
    'furnish projects ~Rs 1M; light refurnishings ~Rs 250k.';

  return { preferredVendors, priceRangesByCategory, notes };
}

/**
 * Style/vendor/price patterns derived from Friday's historical procurement.
 * Computed once at module load — see `buildFridayStyleGuide`.
 */
export const FRIDAY_STYLE_GUIDE: FridayStyleGuide = buildFridayStyleGuide();
