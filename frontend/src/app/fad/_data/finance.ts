// @demo:data — Expenses, payouts, refunds — GET /api/finance/*
// Tag: PROD-DATA-3 — see frontend/DEMO_CRUFT.md

// Finance fixtures — match schema v1 from finance brief (section 7).
// Static seed data for Phase 1 surfaces: Overview, Transactions, Capture, Approvals.

import { getCachedTenantCurrency } from './currencyCache';

export type Entity = 'FR' | 'FI' | 'S';
export type BillTo = 'owner' | 'internal_fr' | 'internal_fi' | 'internal_s';
export type ExpenseStatus =
  | 'draft'
  | 'submitted'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'posted';
export type ApprovalStatus =
  | 'pending'
  | 'explicitly_approved'
  | 'deemed_approved'
  | 'rejected'
  | 'needs_human_review'
  | 'partial_proposed';
export type PeriodStatus = 'open' | 'closing' | 'closed' | 'reopened';
export type AccountSource = 'mcb_csv' | 'mcb_pdf' | 'maubank_pdf';
export type Currency = 'MUR' | 'EUR' | 'USD';
export type TxnKind =
  | 'expense_candidate'
  | 'intercompany_topup'
  | 'platform_payout'
  | 'bank_fee'
  | 'unclassified';
export type EntryMode = 'team_breezeway' | 'admin_direct';
export type ApprovalTier = 'routine' | 'medium' | 'urgent_override' | 'major';

// ───────────────── Properties + Owners ─────────────────

// FinProperty + FIN_PROPERTIES retained as back-compat shims.
// Canonical source moved to `_data/properties.ts` (v0.2 LOCKED). Will be
// removed in commit 4 of the Properties rebuild — consumers should update
// imports to read `Property` from `_data/properties.ts` directly.
import { FIN_PROPERTIES_SHIM } from './properties';

export interface FinProperty {
  code: string;
  name: string;
  ownerId: string;
}

export const FIN_PROPERTIES: FinProperty[] = FIN_PROPERTIES_SHIM;

export interface FinOwner {
  id: string;
  name: string;
  language: 'en' | 'fr';
  whatsapp: string;
}

// @demo:data — Tag: PROD-DATA-21 — see frontend/DEMO_CRUFT.md
// Hardcoded owner records. Replace with: GET /api/finance/owners.
// Originally treated as static config in first audit, but contains
// demo-specific names (Smith Family, Marchand SCI, etc.).
export const FIN_OWNERS: FinOwner[] = [
  { id: 'o1', name: 'Smith Family', language: 'en', whatsapp: '+230 5712 0044' },
  { id: 'o2', name: 'Marchand SCI', language: 'fr', whatsapp: '+33 6 78 12 44 90' },
  { id: 'o3', name: 'Fonseca Holdings', language: 'en', whatsapp: '+230 5904 1188' },
  { id: 'o4', name: 'Dubois & Associés', language: 'fr', whatsapp: '+33 7 88 22 11 56' },
  { id: 'o5', name: 'Beaumont Family Trust', language: 'en', whatsapp: '+230 5781 0099' },
  { id: 'o6', name: 'Mauritius Coastal Ltd', language: 'en', whatsapp: '+230 5722 8801' },
];

// ───────────────── Categories + Bill-to defaults ─────────────────

export interface FinCategory {
  code: string;
  name: string;
  defaultBillTo: BillTo;
  receiptRequired: 'always' | 'optional' | 'above_1000';
  /** restricts to admin (Path B) entry */
  adminOnly?: boolean;
  internalLabour?: boolean;
}

// @demo:data — Tag: PROD-DATA-22 — see frontend/DEMO_CRUFT.md
// Hardcoded expense categories. Replace with: GET /api/finance/categories.
export const FIN_CATEGORIES: FinCategory[] = [
  { code: 'FR-REP', name: 'Repairs', defaultBillTo: 'owner', receiptRequired: 'always' },
  { code: 'FR-MAI', name: 'Maintenance', defaultBillTo: 'owner', receiptRequired: 'always', internalLabour: true },
  { code: 'FR-AME', name: 'Amenities (replacement)', defaultBillTo: 'owner', receiptRequired: 'always' },
  { code: 'FR-OPS', name: 'Operations', defaultBillTo: 'internal_fr', receiptRequired: 'above_1000' },
  { code: 'FR-SRL', name: 'Supplies — soft / linen', defaultBillTo: 'internal_fr', receiptRequired: 'optional' },
  { code: 'FR-ADM-SOFT', name: 'Admin · Software', defaultBillTo: 'internal_fr', receiptRequired: 'optional', adminOnly: true },
  { code: 'FR-ADM-INS', name: 'Admin · Insurance', defaultBillTo: 'internal_fr', receiptRequired: 'optional', adminOnly: true },
  { code: 'FR-ADM-PETROL', name: 'Admin · Petrol', defaultBillTo: 'internal_fr', receiptRequired: 'optional', adminOnly: true },
  { code: 'FR-ADM-PRO', name: 'Admin · Professional services', defaultBillTo: 'internal_fr', receiptRequired: 'optional', adminOnly: true },
  { code: 'FR-ADM-GOV', name: 'Admin · Government filings', defaultBillTo: 'internal_fr', receiptRequired: 'optional', adminOnly: true },
  { code: 'FR-ADM-BANK', name: 'Admin · Banking fees', defaultBillTo: 'internal_fr', receiptRequired: 'optional', adminOnly: true },
];

// ───────────────── Vendors ─────────────────

export interface FinVendor {
  id: string;
  name: string;
  altNames: string[];
  defaultCategory?: string;
  ytdSpendMUR: number;
}

// @demo:data — Tag: PROD-DATA-23 — see frontend/DEMO_CRUFT.md
// Hardcoded vendor records. Replace with: GET /api/finance/vendors.
export const FIN_VENDORS: FinVendor[] = [
  { id: 'v1', name: 'Pereybere Hardware', altNames: ['Pereybere', 'Per. Hardware', 'Quincaillerie Pereybere'], defaultCategory: 'FR-REP', ytdSpendMUR: 84_500 },
  { id: 'v2', name: 'Climate Tech Ltd', altNames: ['Climate Tech', 'CTL'], defaultCategory: 'FR-REP', ytdSpendMUR: 142_000 },
  { id: 'v3', name: 'Aqua Plumbing', altNames: ['Aqua Plumb', 'Aqua'], defaultCategory: 'FR-REP', ytdSpendMUR: 67_300 },
  { id: 'v4', name: 'Île Maurice Linen Co', altNames: ['IM Linen', 'Linen Co'], defaultCategory: 'FR-SRL', ytdSpendMUR: 198_750 },
  { id: 'v5', name: 'Total Petrol Pereybere', altNames: ['Total', 'Total Pereybere'], defaultCategory: 'FR-ADM-PETROL', ytdSpendMUR: 31_200 },
  { id: 'v6', name: 'MCB Banking', altNames: ['MCB', 'Mauritius Commercial Bank'], defaultCategory: 'FR-ADM-BANK', ytdSpendMUR: 8_400 },
  { id: 'v7', name: 'Notion Labs Inc', altNames: ['Notion'], defaultCategory: 'FR-ADM-SOFT', ytdSpendMUR: 18_600 },
  { id: 'v8', name: 'Swan Insurance', altNames: ['Swan', 'Swan Ins'], defaultCategory: 'FR-ADM-INS', ytdSpendMUR: 56_000 },
  { id: 'v9', name: 'PGA Cleaners', altNames: ['PGA', 'Patel Goods'], defaultCategory: 'FR-OPS', ytdSpendMUR: 122_400 },
  { id: 'v10', name: 'Stanley Garden Co', altNames: ['Stanley', 'SGC'], defaultCategory: 'FR-MAI', ytdSpendMUR: 47_800 },
];

// ───────────────── Accounts ─────────────────

export interface FinAccount {
  id: string;
  name: string;
  bank: 'MCB' | 'MauBank';
  currency: Currency;
  source: AccountSource;
  lastImportedDate: string;
}

export type AccountRole = 'main_pm' | 'field_pm' | 'fx' | 'syndic' | 'interior' | 'clearance' | 'admin';

export const FIN_ACCOUNTS: (FinAccount & {
  role: AccountRole;
  cardHolder?: string;
  description?: string;
  approxBalanceMinor?: number;
  dormant?: boolean;
})[] = [
  // ─── MCB · 11 accounts ───
  { id: 'mcb-860', name: 'Main PM (...860)', bank: 'MCB', currency: 'MUR', source: 'mcb_csv', lastImportedDate: '2026-04-26', role: 'main_pm', cardHolder: 'Ishant', description: 'Primary holding · operational reserves', approxBalanceMinor: 79_000_000 },
  { id: 'mcb-803', name: 'Bryan PM (...803)', bank: 'MCB', currency: 'MUR', source: 'mcb_csv', lastImportedDate: '2026-04-26', role: 'field_pm', cardHolder: 'Bryan', description: 'Maintenance lead · North' },
  { id: 'mcb-897', name: 'Ishant West PM (...897)', bank: 'MCB', currency: 'MUR', source: 'mcb_csv', lastImportedDate: '2026-04-25', role: 'field_pm', cardHolder: 'Ishant', description: 'West properties · car/procurement backup' },
  { id: 'mcb-817', name: 'Franny Ops (...817)', bank: 'MCB', currency: 'MUR', source: 'mcb_csv', lastImportedDate: '2026-04-26', role: 'field_pm', cardHolder: 'Franny', description: 'Ops manager · syndic' },
  { id: 'mcb-844', name: 'Ishant & Online (...844)', bank: 'MCB', currency: 'MUR', source: 'mcb_csv', lastImportedDate: '2026-04-25', role: 'admin', cardHolder: 'Ishant', description: 'API, subscriptions, online spend' },
  { id: 'mcb-836', name: 'Main ID (...836)', bank: 'MCB', currency: 'MUR', source: 'mcb_csv', lastImportedDate: '2026-04-23', role: 'interior', cardHolder: 'Ishant', description: 'Friday Interiors holding', approxBalanceMinor: 46_000_000 },
  { id: 'mcb-852', name: 'Secondary ID (...852)', bank: 'MCB', currency: 'MUR', source: 'mcb_csv', lastImportedDate: '2026-04-23', role: 'interior', description: 'ID staff card · top-up only' },
  { id: 'mcb-828', name: 'EUR (...828)', bank: 'MCB', currency: 'EUR', source: 'mcb_csv', lastImportedDate: '2026-04-25', role: 'fx', description: '€17,880 · platform inbound EUR' },
  { id: 'mcb-927', name: 'USD (...927)', bank: 'MCB', currency: 'USD', source: 'mcb_csv', lastImportedDate: '2026-04-25', role: 'fx', description: '$1,724 · Airbnb USD' },
  { id: 'mcb-805', name: 'GBH Syndic (...805)', bank: 'MCB', currency: 'MUR', source: 'mcb_csv', lastImportedDate: '2026-04-22', role: 'syndic', description: 'First building syndic fund' },
  { id: 'mcb-775', name: 'Clearance (...775)', bank: 'MCB', currency: 'MUR', source: 'mcb_csv', lastImportedDate: '2026-04-20', role: 'clearance', description: '0 balance · feeder', dormant: true },
  // ─── MauBank · 3 accounts ───
  { id: 'mb-main', name: 'MauBank Main MUR', bank: 'MauBank', currency: 'MUR', source: 'maubank_pdf', lastImportedDate: '2026-04-22', role: 'admin', description: 'VAT · government payments', approxBalanceMinor: 11_100_000 },
  { id: 'mb-eur', name: 'MauBank EUR', bank: 'MauBank', currency: 'EUR', source: 'maubank_pdf', lastImportedDate: '2026-04-22', role: 'fx', description: '€100 · dormant', dormant: true },
  { id: 'mb-usd', name: 'MauBank USD', bank: 'MauBank', currency: 'USD', source: 'maubank_pdf', lastImportedDate: '2026-04-22', role: 'fx', description: '$100 · dormant', dormant: true },
];

// ───────────────── Period ─────────────────

export interface FinPeriod {
  id: string;
  label: string;
  status: PeriodStatus;
  startDate: string;
  endDate: string;
  warRateEurMur?: number;
  warRateUsdMur?: number;
  closeStage?: number;
  lockedBy?: string;
  lockedAt?: string;
}

// @demo:data — Tag: PROD-DATA-24 — see frontend/DEMO_CRUFT.md
// Hardcoded fiscal periods. Replace with: GET /api/finance/periods.
export const FIN_PERIODS: FinPeriod[] = [
  { id: 'p-2026-04', label: 'April 2026', status: 'closing', startDate: '2026-04-01', endDate: '2026-04-30', warRateEurMur: 52.45, warRateUsdMur: 47.20, closeStage: 5, lockedBy: 'Mary', lockedAt: '2026-04-27 14:32' },
  { id: 'p-2026-03', label: 'March 2026', status: 'closed', startDate: '2026-03-01', endDate: '2026-03-31', warRateEurMur: 52.30, warRateUsdMur: 47.10 },
  { id: 'p-2026-02', label: 'February 2026', status: 'closed', startDate: '2026-02-01', endDate: '2026-02-28', warRateEurMur: 52.15, warRateUsdMur: 46.95 },
];

export const CURRENT_PERIOD = FIN_PERIODS[0];

// ───────────────── Expenses ─────────────────

export interface FinExpense {
  id: string;
  occurredAt: string;
  enteredAt: string;
  vendorId: string;
  vendorName: string;
  /** for vendor_unrecognized=true free-text captures */
  vendorUnrecognized?: boolean;
  amountMinor: number;
  currency: Currency;
  categoryCode: string;
  billTo: BillTo;
  billToOverridden?: boolean;
  propertyCode?: string;
  description: string;
  status: ExpenseStatus;
  approvalTier?: ApprovalTier;
  approvalStatus?: ApprovalStatus;
  entryMode: EntryMode;
  enteredBy: string;
  brzTaskId?: string;
  reservationId?: string;
  receipts: number;
  exceededUserCap?: boolean;
  internalLabourHours?: number;
  recurring?: boolean;
  /** period id this expense will post into */
  periodId: string;
  /** FAD task that originated this expense (T8 cost-to-Finance integration). */
  sourceTaskId?: string;
}

export const FIN_EXPENSES: FinExpense[] = [
  { id: 'e1', occurredAt: '2026-04-26 09:14', enteredAt: '2026-04-26 09:18', vendorId: 'v2', vendorName: 'Climate Tech Ltd', amountMinor: 1_250_000, currency: 'MUR', categoryCode: 'FR-REP', billTo: 'owner', propertyCode: 'VV-47', description: 'Aircon compressor failure, master bedroom', status: 'pending_approval', approvalTier: 'medium', approvalStatus: 'pending', entryMode: 'team_breezeway', enteredBy: 'Bryan', brzTaskId: 'BRZ-4421', receipts: 2, periodId: 'p-2026-04', sourceTaskId: 't-006' },
  { id: 'e2', occurredAt: '2026-04-26 11:02', enteredAt: '2026-04-26 11:05', vendorId: 'v9', vendorName: 'PGA Cleaners', amountMinor: 432_000, currency: 'MUR', categoryCode: 'FR-OPS', billTo: 'internal_fr', propertyCode: 'BL-12', description: 'Deep clean post-departure, extended', status: 'posted', entryMode: 'team_breezeway', enteredBy: 'Franny', brzTaskId: 'BRZ-4429', receipts: 1, periodId: 'p-2026-04' },
  { id: 'e3', occurredAt: '2026-04-25 16:30', enteredAt: '2026-04-26 08:02', vendorId: 'v3', vendorName: 'Aqua Plumbing', amountMinor: 870_000, currency: 'MUR', categoryCode: 'FR-REP', billTo: 'owner', propertyCode: 'PT-3', description: 'Water heater leak, kitchen — replacement valve + service', status: 'pending_approval', approvalTier: 'medium', approvalStatus: 'pending', entryMode: 'team_breezeway', enteredBy: 'Bryan', brzTaskId: 'BRZ-4418', receipts: 2, periodId: 'p-2026-04', sourceTaskId: 't-008' },
  { id: 'e4', occurredAt: '2026-04-25 14:00', enteredAt: '2026-04-25 18:21', vendorId: 'v10', vendorName: 'Stanley Garden Co', amountMinor: 320_000, currency: 'MUR', categoryCode: 'FR-MAI', billTo: 'owner', propertyCode: 'VV-47', description: 'Quarterly garden maintenance', status: 'posted', entryMode: 'team_breezeway', enteredBy: 'Ishant', brzTaskId: 'BRZ-4410', receipts: 1, periodId: 'p-2026-04' },
  { id: 'e5', occurredAt: '2026-04-25 09:45', enteredAt: '2026-04-25 09:46', vendorId: 'v7', vendorName: 'Notion Labs Inc', amountMinor: 4800, currency: 'EUR', categoryCode: 'FR-ADM-SOFT', billTo: 'internal_fr', description: 'Notion Plus seat — Apr 2026', status: 'posted', entryMode: 'admin_direct', enteredBy: 'Ishant', recurring: true, receipts: 1, periodId: 'p-2026-04' },
  { id: 'e6', occurredAt: '2026-04-24 17:11', enteredAt: '2026-04-24 17:14', vendorId: 'v1', vendorName: 'Pereybere Hardware', amountMinor: 184_500, currency: 'MUR', categoryCode: 'FR-AME', billTo: 'owner', propertyCode: 'BL-12', description: 'Replacement set: bathroom fixtures (towel rail, hooks, soap dispenser)', status: 'posted', entryMode: 'team_breezeway', enteredBy: 'Bryan', brzTaskId: 'BRZ-4405', receipts: 1, periodId: 'p-2026-04' },
  { id: 'e7', occurredAt: '2026-04-24 12:30', enteredAt: '2026-04-24 19:01', vendorId: 'v4', vendorName: 'Île Maurice Linen Co', amountMinor: 5_640_000, currency: 'MUR', categoryCode: 'FR-SRL', billTo: 'internal_fr', description: 'Bulk linen rotation — 240 sets, all properties', status: 'posted', entryMode: 'admin_direct', enteredBy: 'Ishant', receipts: 2, periodId: 'p-2026-04' },
  { id: 'e8', occurredAt: '2026-04-24 10:00', enteredAt: '2026-04-24 10:01', vendorId: 'v8', vendorName: 'Swan Insurance', amountMinor: 56_000_00, currency: 'MUR', categoryCode: 'FR-ADM-INS', billTo: 'internal_fr', description: 'Public liability — annual renewal', status: 'posted', entryMode: 'admin_direct', enteredBy: 'Ishant', recurring: true, receipts: 1, periodId: 'p-2026-04' },
  { id: 'e9', occurredAt: '2026-04-23 15:22', enteredAt: '2026-04-23 19:44', vendorId: 'v1', vendorName: 'Pereybere Hardware', amountMinor: 22_500_000, currency: 'MUR', categoryCode: 'FR-REP', billTo: 'owner', propertyCode: 'LC-9', description: 'Roof tile replacement after April storm — emergency materials', status: 'pending_approval', approvalTier: 'major', approvalStatus: 'pending', entryMode: 'team_breezeway', enteredBy: 'Bryan', brzTaskId: 'BRZ-4391', receipts: 3, exceededUserCap: false, periodId: 'p-2026-04' },
  { id: 'e10', occurredAt: '2026-04-23 14:00', enteredAt: '2026-04-23 14:02', vendorId: 'v9', vendorName: 'PGA Cleaners', amountMinor: 380_000, currency: 'MUR', categoryCode: 'FR-OPS', billTo: 'internal_fr', propertyCode: 'PT-3', description: 'Standard turnover clean', status: 'posted', entryMode: 'team_breezeway', enteredBy: 'Franny', brzTaskId: 'BRZ-4388', receipts: 1, periodId: 'p-2026-04' },
  { id: 'e11', occurredAt: '2026-04-23 11:15', enteredAt: '2026-04-23 11:17', vendorId: 'v6', vendorName: 'MCB Banking', amountMinor: 1200_00, currency: 'MUR', categoryCode: 'FR-ADM-BANK', billTo: 'internal_fr', description: 'Wire transfer fees — Apr (Marchand, Smith payouts)', status: 'posted', entryMode: 'admin_direct', enteredBy: 'Ishant', receipts: 0, periodId: 'p-2026-04' },
  { id: 'e12', occurredAt: '2026-04-22 16:50', enteredAt: '2026-04-22 17:01', vendorId: 'v3', vendorName: 'Aqua Plumbing', amountMinor: 156_000, currency: 'MUR', categoryCode: 'FR-REP', billTo: 'owner', propertyCode: 'BL-12', description: 'Drain unblock, guest bathroom', status: 'posted', entryMode: 'team_breezeway', enteredBy: 'Bryan', brzTaskId: 'BRZ-4376', receipts: 1, periodId: 'p-2026-04' },
  { id: 'e13', occurredAt: '2026-04-22 09:00', enteredAt: '2026-04-22 19:30', vendorId: 'v5', vendorName: 'Total Petrol Pereybere', amountMinor: 38_500, currency: 'MUR', categoryCode: 'FR-ADM-PETROL', billTo: 'internal_fr', description: 'Work van fill-up — Bryan', status: 'posted', entryMode: 'team_breezeway', enteredBy: 'Bryan', brzTaskId: 'BRZ-OPSMISC-VV-APR', receipts: 1, periodId: 'p-2026-04' },
  { id: 'e14', occurredAt: '2026-04-21 13:40', enteredAt: '2026-04-21 13:43', vendorId: 'v2', vendorName: 'Climate Tech Ltd', amountMinor: 412_000, currency: 'MUR', categoryCode: 'FR-MAI', billTo: 'owner', propertyCode: 'VV-47', description: 'AC service contract — quarterly', status: 'posted', entryMode: 'team_breezeway', enteredBy: 'Bryan', brzTaskId: 'BRZ-4358', receipts: 1, periodId: 'p-2026-04' },
  { id: 'e15', occurredAt: '2026-04-21 09:00', enteredAt: '2026-04-21 09:02', vendorId: 'v9', vendorName: 'PGA Cleaners', amountMinor: 540_000, currency: 'MUR', categoryCode: 'FR-OPS', billTo: 'internal_fr', propertyCode: 'VV-47', description: 'Three-property turnover (VV, BL, LC)', status: 'posted', entryMode: 'team_breezeway', enteredBy: 'Franny', brzTaskId: 'BRZ-4351', receipts: 1, periodId: 'p-2026-04' },
  { id: 'e16', occurredAt: '2026-04-20 18:14', enteredAt: '2026-04-20 22:01', vendorId: 'v1', vendorName: 'Pereybere Hardware', amountMinor: 78_500, currency: 'MUR', categoryCode: 'FR-MAI', billTo: 'owner', propertyCode: 'PT-3', description: 'Fence post + cement, beachfront fence', status: 'pending_approval', approvalTier: 'medium', approvalStatus: 'partial_proposed', entryMode: 'team_breezeway', enteredBy: 'Bryan', brzTaskId: 'BRZ-4344', receipts: 1, periodId: 'p-2026-04' },
  { id: 'e17', occurredAt: '2026-04-20 11:00', enteredAt: '2026-04-20 11:04', vendorName: 'Quincaillerie Bain Boeuf', vendorId: '', vendorUnrecognized: true, amountMinor: 12_400, currency: 'MUR', categoryCode: 'FR-REP', billTo: 'owner', propertyCode: 'LC-9', description: 'Door handle replacement — small parts', status: 'submitted', entryMode: 'team_breezeway', enteredBy: 'Bryan', brzTaskId: 'BRZ-4338', receipts: 1, periodId: 'p-2026-04' },
  { id: 'e18', occurredAt: '2026-04-19 09:30', enteredAt: '2026-04-19 19:01', vendorId: '', vendorName: 'internal labour', amountMinor: 6_000_00, currency: 'MUR', categoryCode: 'FR-MAI', billTo: 'owner', propertyCode: 'BL-12', description: 'Bryan — 4h on cabinet repair, kitchen', status: 'posted', entryMode: 'team_breezeway', enteredBy: 'Bryan', brzTaskId: 'BRZ-4321', receipts: 0, internalLabourHours: 4, periodId: 'p-2026-04' },
  { id: 'e19', occurredAt: '2026-04-18 14:30', enteredAt: '2026-04-18 14:31', vendorId: 'v7', vendorName: 'Notion Labs Inc', amountMinor: 1900, currency: 'EUR', categoryCode: 'FR-ADM-SOFT', billTo: 'internal_fr', description: 'Linear seat — Apr', status: 'posted', entryMode: 'admin_direct', enteredBy: 'Ishant', recurring: true, receipts: 1, periodId: 'p-2026-04' },
  { id: 'e20', occurredAt: '2026-04-18 10:00', enteredAt: '2026-04-18 10:03', vendorId: 'v9', vendorName: 'PGA Cleaners', amountMinor: 365_000, currency: 'MUR', categoryCode: 'FR-OPS', billTo: 'internal_fr', propertyCode: 'LC-9', description: 'Standard turnover clean', status: 'posted', entryMode: 'team_breezeway', enteredBy: 'Franny', brzTaskId: 'BRZ-4308', receipts: 1, periodId: 'p-2026-04' },
  { id: 'e21', occurredAt: '2026-04-17 17:00', enteredAt: '2026-04-17 17:02', vendorId: 'v3', vendorName: 'Aqua Plumbing', amountMinor: 245_000, currency: 'MUR', categoryCode: 'FR-REP', billTo: 'owner', propertyCode: 'VV-47', description: 'Tap replacement, en-suite', status: 'pending_approval', approvalTier: 'medium', approvalStatus: 'pending', entryMode: 'team_breezeway', enteredBy: 'Bryan', brzTaskId: 'BRZ-4302', receipts: 1, periodId: 'p-2026-04' },
  { id: 'e22', occurredAt: '2026-04-16 09:00', enteredAt: '2026-04-16 09:01', vendorId: 'v8', vendorName: 'Swan Insurance', amountMinor: 12_800_00, currency: 'MUR', categoryCode: 'FR-ADM-INS', billTo: 'internal_fr', description: 'Vehicle insurance — work van', status: 'posted', entryMode: 'admin_direct', enteredBy: 'Ishant', recurring: true, receipts: 1, periodId: 'p-2026-04' },
  { id: 'e23', occurredAt: '2026-04-15 13:20', enteredAt: '2026-04-15 18:14', vendorId: 'v1', vendorName: 'Pereybere Hardware', amountMinor: 4_320_000, currency: 'MUR', categoryCode: 'FR-REP', billTo: 'owner', billToOverridden: true, propertyCode: 'BL-12', description: 'Bathroom retile — owner-approved capex (urgent override)', status: 'posted', approvalTier: 'urgent_override', entryMode: 'team_breezeway', enteredBy: 'Bryan', brzTaskId: 'BRZ-4288', receipts: 3, exceededUserCap: true, periodId: 'p-2026-04' },
  { id: 'e24', occurredAt: '2026-04-15 09:30', enteredAt: '2026-04-15 09:31', vendorId: 'v5', vendorName: 'Total Petrol Pereybere', amountMinor: 41_200, currency: 'MUR', categoryCode: 'FR-ADM-PETROL', billTo: 'internal_fr', description: 'West procurement car fuel — Ishant', status: 'posted', entryMode: 'team_breezeway', enteredBy: 'Ishant', brzTaskId: 'BRZ-OPSMISC-LC-APR', receipts: 1, periodId: 'p-2026-04' },
  { id: 'e25', occurredAt: '2026-04-14 11:00', enteredAt: '2026-04-14 11:02', vendorId: 'v9', vendorName: 'PGA Cleaners', amountMinor: 410_000, currency: 'MUR', categoryCode: 'FR-OPS', billTo: 'internal_fr', propertyCode: 'PT-3', description: 'Standard turnover clean', status: 'posted', entryMode: 'team_breezeway', enteredBy: 'Franny', brzTaskId: 'BRZ-4271', receipts: 1, periodId: 'p-2026-04' },
];

// ───────────────── Payouts (Airbnb / BDC / Direct) ─────────────────

export interface FinPayout {
  id: string;
  platform: 'Airbnb' | 'Booking.com' | 'Direct';
  ref: string;
  settledAt: string;
  amountMinor: number;
  currency: Currency;
  reservationCount: number;
  periodId: string;
}

export const FIN_PAYOUTS_NEW: FinPayout[] = [
  { id: 'pay1', platform: 'Airbnb', ref: 'AXB-8821', settledAt: '2026-04-25', amountMinor: 4_822_000, currency: 'EUR', reservationCount: 6, periodId: 'p-2026-04' },
  { id: 'pay2', platform: 'Booking.com', ref: 'BKG-2210', settledAt: '2026-04-24', amountMinor: 3_150_400, currency: 'EUR', reservationCount: 4, periodId: 'p-2026-04' },
  { id: 'pay3', platform: 'Direct', ref: 'DIR-2026-041', settledAt: '2026-04-22', amountMinor: 285_000, currency: 'EUR', reservationCount: 1, periodId: 'p-2026-04' },
  { id: 'pay4', platform: 'Airbnb', ref: 'AXB-8788', settledAt: '2026-04-18', amountMinor: 5_910_000, currency: 'EUR', reservationCount: 7, periodId: 'p-2026-04' },
  { id: 'pay5', platform: 'Booking.com', ref: 'BKG-2197', settledAt: '2026-04-17', amountMinor: 2_440_000, currency: 'EUR', reservationCount: 3, periodId: 'p-2026-04' },
];

// ───────────────── Bank lines (sample) ─────────────────

export interface FinBankLine {
  id: string;
  accountId: string;
  date: string;
  description: string;
  amountMinor: number;
  currency: Currency;
  kind: TxnKind;
  status: 'matched' | 'proposed' | 'unmatched' | 'classified_topup' | 'classified_fee';
  matchedExpenseId?: string;
  matchedPayoutId?: string;
}

export const FIN_BANK_LINES: FinBankLine[] = [
  { id: 'b1', accountId: 'mcb-828', date: '2026-04-25', description: 'AIRBNB PAYMENTS UK LTD AXB-8821', amountMinor: 4_822_000, currency: 'EUR', kind: 'platform_payout', status: 'matched', matchedPayoutId: 'pay1' },
  { id: 'b2', accountId: 'mcb-828', date: '2026-04-24', description: 'BOOKING.COM BV BKG-2210', amountMinor: 3_150_400, currency: 'EUR', kind: 'platform_payout', status: 'matched', matchedPayoutId: 'pay2' },
  { id: 'b3', accountId: 'mcb-860', date: '2026-04-26', description: 'CLIMATE TECH LTD INV 4421', amountMinor: 1_250_000, currency: 'MUR', kind: 'expense_candidate', status: 'proposed', matchedExpenseId: 'e1' },
  { id: 'b4', accountId: 'mcb-803', date: '2026-04-26', description: 'PGA CLEANERS', amountMinor: 432_000, currency: 'MUR', kind: 'expense_candidate', status: 'matched', matchedExpenseId: 'e2' },
  { id: 'b5', accountId: 'mcb-803', date: '2026-04-22', description: 'IB Own Account Transfer 002 Top Up FRIDAY RETREATS LTD', amountMinor: 2_000_000, currency: 'MUR', kind: 'intercompany_topup', status: 'classified_topup' },
  { id: 'b6', accountId: 'mcb-860', date: '2026-04-23', description: 'BANK TARIFF — WIRE OUT', amountMinor: 1200_00, currency: 'MUR', kind: 'bank_fee', status: 'classified_fee' },
  { id: 'b7', accountId: 'mb-main', date: '2026-04-19', description: 'unrecognised — supplier name truncated', amountMinor: 67_500, currency: 'MUR', kind: 'unclassified', status: 'unmatched' },
  { id: 'b8', accountId: 'mcb-897', date: '2026-04-21', description: 'TOTAL PETROL PEREYBERE', amountMinor: 41_200, currency: 'MUR', kind: 'expense_candidate', status: 'matched', matchedExpenseId: 'e24' },
  { id: 'b9', accountId: 'mcb-860', date: '2026-04-15', description: 'IB Own Account Transfer Top Up BRYAN PM', amountMinor: 5_000_000, currency: 'MUR', kind: 'intercompany_topup', status: 'classified_topup' },
];

// ───────────────── Tourist tax (current period, summary) ─────────────────

export interface FinTouristTaxRow {
  monthLabel: string;
  collectedEur: number;
  correctEur: number;
  refundedEur: number;
  netOwedEur: number;
  filed: boolean;
}

export const FIN_TOURIST_TAX: FinTouristTaxRow[] = [
  { monthLabel: 'Apr 2026', collectedEur: 1_842, correctEur: 1_734, refundedEur: 108, netOwedEur: 1_734, filed: false },
  { monthLabel: 'Mar 2026', collectedEur: 2_201, correctEur: 2_088, refundedEur: 113, netOwedEur: 2_088, filed: false },
  { monthLabel: 'Feb 2026', collectedEur: 1_512, correctEur: 1_434, refundedEur: 78, netOwedEur: 1_434, filed: false },
  { monthLabel: 'Jan 2026', collectedEur: 1_286, correctEur: 1_220, refundedEur: 66, netOwedEur: 1_220, filed: false },
  { monthLabel: 'Dec 2025', collectedEur: 2_104, correctEur: 1_998, refundedEur: 106, netOwedEur: 1_998, filed: false },
  { monthLabel: 'Nov 2025', collectedEur: 1_758, correctEur: 1_658, refundedEur: 100, netOwedEur: 1_658, filed: false },
  { monthLabel: 'Oct 2025', collectedEur: 1_872, correctEur: 1_715, refundedEur: 157, netOwedEur: 1_715, filed: false },
];

// ───────────────── KPIs (computed roll-up) ─────────────────

export const FIN_OVERVIEW_KPIS = {
  periodLabel: CURRENT_PERIOD.label,
  payoutsThisPeriodMinor: FIN_PAYOUTS_NEW
    .filter((p) => p.periodId === CURRENT_PERIOD.id)
    .reduce((s, p) => s + p.amountMinor, 0),
  payoutsCurrency: 'EUR' as Currency,
  expensesPostedThisPeriodMUR: FIN_EXPENSES
    .filter((e) => e.periodId === CURRENT_PERIOD.id && e.status === 'posted' && e.currency === 'MUR')
    .reduce((s, e) => s + e.amountMinor, 0),
  pendingApprovalsCount: FIN_EXPENSES.filter((e) => e.status === 'pending_approval').length,
  pendingApprovalsMUR: FIN_EXPENSES
    .filter((e) => e.status === 'pending_approval' && e.currency === 'MUR')
    .reduce((s, e) => s + e.amountMinor, 0),
  unreconciledBankLines: FIN_BANK_LINES.filter((b) => b.status === 'unmatched' || b.status === 'proposed').length,
  touristTaxOwedEur: FIN_TOURIST_TAX.filter((m) => !m.filed).reduce((s, m) => s + m.netOwedEur, 0),
};

// ───────────────── Approvals (WhatsApp delivery state) ─────────────────

export interface FinApprovalRecord {
  expenseId: string;
  token: string;
  sentAt?: string;
  channel: 'whatsapp';
  language: 'en' | 'fr';
  linkClicks: number;
  status: ApprovalStatus;
  expiresAt?: string;
  ownerReplyExcerpt?: string;
  partialProposedMinor?: number;
}

export const FIN_APPROVALS: FinApprovalRecord[] = [
  {
    expenseId: 'e1', token: 'wa_aircon_vv47_a3kz', sentAt: '2026-04-26 09:24',
    channel: 'whatsapp', language: 'en', linkClicks: 2, status: 'pending',
    expiresAt: '2026-04-27 09:24',
  },
  {
    expenseId: 'e3', token: 'wa_water_pt3_b9pq', sentAt: '2026-04-26 08:10',
    channel: 'whatsapp', language: 'en', linkClicks: 1, status: 'pending',
    expiresAt: '2026-04-27 08:10',
  },
  {
    expenseId: 'e9', token: 'wa_roof_lc9_x7mn', sentAt: '2026-04-23 19:55',
    channel: 'whatsapp', language: 'fr', linkClicks: 4, status: 'pending',
    expiresAt: '2026-04-24 19:55', ownerReplyExcerpt: 'Je regarde demain matin',
  },
  {
    expenseId: 'e16', token: 'wa_fence_pt3_g2lj', sentAt: '2026-04-20 22:14',
    channel: 'whatsapp', language: 'en', linkClicks: 1, status: 'partial_proposed',
    expiresAt: '2026-04-21 22:14', ownerReplyExcerpt: 'OK but only Rs 6,000 not 7,850',
    partialProposedMinor: 6_000_00,
  },
  {
    expenseId: 'e21', token: 'wa_tap_vv47_q4rk', sentAt: '2026-04-17 17:12',
    channel: 'whatsapp', language: 'en', linkClicks: 0, status: 'pending',
    expiresAt: '2026-04-18 17:12',
  },
];

// ───────────────── Owner statements (waterfall per property/period) ─────────────────

export interface FinWaterfallStep {
  label: string;
  amountMinor: number;
  /** negative = subtraction from running total */
  isDeduction?: boolean;
  /** highlighted intermediate total */
  isSubtotal?: boolean;
  detail?: string;
}

export interface FinOwnerStatement {
  propertyCode: string;
  ownerId: string;
  periodId: string;
  guestyCheckMatches: boolean;
  guestyDiffMinor?: number;
  steps: FinWaterfallStep[];
  /** final owner revenue MUR */
  ownerRevenueMUR: number;
  /** in EUR after WAR */
  ownerRevenueEUR: number;
}

export const FIN_OWNER_STATEMENTS: FinOwnerStatement[] = [
  {
    propertyCode: 'VV-47', ownerId: 'o1', periodId: 'p-2026-04', guestyCheckMatches: true,
    steps: [
      { label: 'Rental income from booking', amountMinor: 4_820_000, detail: '6 reservations · gross' },
      { label: 'STA license refund', amountMinor: 60_00, detail: 'Government refund · pass-through' },
      { label: 'Cleaning fee retained', amountMinor: -380_000, isDeduction: true, detail: 'Net pass-through · T&C 1.2' },
      { label: 'Channel commission', amountMinor: -819_400, isDeduction: true, detail: 'Airbnb 17% · BDC 18%' },
      { label: 'Tourist tax (€3 × eligible nights)', amountMinor: -188_820, isDeduction: true, detail: '14 eligible guest-nights · MU residents excluded' },
      { label: 'Payment processor fees', amountMinor: -1_56_00, isDeduction: true, detail: 'Stripe + bank wire' },
      { label: 'Rental income (after platform deductions)', amountMinor: 3_490_424, isSubtotal: true },
      { label: 'PMC commission', amountMinor: -724_120, isDeduction: true, detail: '20% of rental income' },
      { label: '15% VAT on PMC', amountMinor: -108_618, isDeduction: true, detail: 'T&C 1.7' },
      { label: 'Linen fee', amountMinor: 0, isDeduction: true, detail: 'Effective from June 2026' },
      { label: 'Owner-billable expenses', amountMinor: -732_000, isDeduction: true, detail: '3 expenses · click for detail' },
      { label: 'Working capital adjustment', amountMinor: -50_000, isDeduction: true, detail: 'Rolling float maintained · T&C 5.7' },
      { label: 'Prior payment to owner', amountMinor: -1_426_664, isDeduction: true, detail: 'Mid-month payout already sent' },
      { label: "Owner's revenue (this period)", amountMinor: 449_022, isSubtotal: true },
    ],
    ownerRevenueMUR: 449_022, ownerRevenueEUR: 8_561,
  },
  {
    propertyCode: 'BL-12', ownerId: 'o2', periodId: 'p-2026-04', guestyCheckMatches: false, guestyDiffMinor: 12_400,
    steps: [
      { label: 'Rental income from booking', amountMinor: 6_180_000, detail: '8 reservations · gross' },
      { label: 'STA license refund', amountMinor: 0 },
      { label: 'Cleaning fee retained', amountMinor: -456_000, isDeduction: true, detail: 'Net pass-through' },
      { label: 'Channel commission', amountMinor: -1_050_600, isDeduction: true, detail: 'Airbnb 17%' },
      { label: 'Tourist tax (€3 × eligible nights)', amountMinor: -239_040, isDeduction: true, detail: '18 eligible guest-nights' },
      { label: 'Payment processor fees', amountMinor: -2_22_00, isDeduction: true },
      { label: 'Rental income (after platform deductions)', amountMinor: 4_412_160, isSubtotal: true },
      { label: 'PMC commission', amountMinor: -934_680, isDeduction: true },
      { label: '15% VAT on PMC', amountMinor: -140_202, isDeduction: true },
      { label: 'Linen fee', amountMinor: 0, isDeduction: true },
      { label: 'Owner-billable expenses', amountMinor: -4_660_500, isDeduction: true, detail: 'Includes urgent override Rs 43.2k retile' },
      { label: 'Working capital adjustment', amountMinor: -50_000, isDeduction: true },
      { label: 'Prior payment to owner', amountMinor: 0, isDeduction: true, detail: 'No mid-month payout' },
      { label: "Owner's revenue (this period)", amountMinor: -1_373_222, isSubtotal: true, detail: 'NEGATIVE — capex this period' },
    ],
    ownerRevenueMUR: -1_373_222, ownerRevenueEUR: -26_180,
  },
  {
    propertyCode: 'PT-3', ownerId: 'o3', periodId: 'p-2026-04', guestyCheckMatches: true,
    steps: [
      { label: 'Rental income from booking', amountMinor: 3_240_000, detail: '4 reservations · gross' },
      { label: 'STA license refund', amountMinor: 0 },
      { label: 'Cleaning fee retained', amountMinor: -288_000, isDeduction: true },
      { label: 'Channel commission', amountMinor: -550_800, isDeduction: true },
      { label: 'Tourist tax (€3 × eligible nights)', amountMinor: -125_880, isDeduction: true },
      { label: 'Payment processor fees', amountMinor: -1_15_00, isDeduction: true },
      { label: 'Rental income (after platform deductions)', amountMinor: 2_263_820, isSubtotal: true },
      { label: 'PMC commission', amountMinor: -480_240, isDeduction: true },
      { label: '15% VAT on PMC', amountMinor: -72_036, isDeduction: true },
      { label: 'Linen fee', amountMinor: 0, isDeduction: true },
      { label: 'Owner-billable expenses', amountMinor: -1_193_500, isDeduction: true },
      { label: 'Working capital adjustment', amountMinor: -50_000, isDeduction: true },
      { label: 'Prior payment to owner', amountMinor: -350_000, isDeduction: true },
      { label: "Owner's revenue (this period)", amountMinor: 118_044, isSubtotal: true },
    ],
    ownerRevenueMUR: 118_044, ownerRevenueEUR: 2_251,
  },
  {
    propertyCode: 'LC-9', ownerId: 'o4', periodId: 'p-2026-04', guestyCheckMatches: false, guestyDiffMinor: 8_900,
    steps: [
      { label: 'Rental income from booking', amountMinor: 5_410_000, detail: '7 reservations · gross' },
      { label: 'STA license refund', amountMinor: 0 },
      { label: 'Cleaning fee retained', amountMinor: -425_000, isDeduction: true },
      { label: 'Channel commission', amountMinor: -919_700, isDeduction: true },
      { label: 'Tourist tax (€3 × eligible nights)', amountMinor: -208_440, isDeduction: true },
      { label: 'Payment processor fees', amountMinor: -1_88_00, isDeduction: true },
      { label: 'Rental income (after platform deductions)', amountMinor: 3_837_060, isSubtotal: true },
      { label: 'PMC commission', amountMinor: -813_060, isDeduction: true },
      { label: '15% VAT on PMC', amountMinor: -121_959, isDeduction: true },
      { label: 'Linen fee', amountMinor: 0, isDeduction: true },
      { label: 'Owner-billable expenses', amountMinor: -2_262_400, isDeduction: true, detail: 'Includes Rs 22.5k roof emergency · pending approval' },
      { label: 'Working capital adjustment', amountMinor: -50_000, isDeduction: true },
      { label: 'Prior payment to owner', amountMinor: -480_000, isDeduction: true },
      { label: "Owner's revenue (this period)", amountMinor: 109_641, isSubtotal: true },
    ],
    ownerRevenueMUR: 109_641, ownerRevenueEUR: 2_090,
  },
];

// ───────────────── Tourist tax overcharge detection (per reservation) ─────────────────

export interface FinTouristOvercharge {
  reservationId: string;
  guestName: string;
  propertyCode: string;
  checkin: string;
  nights: number;
  numAdults: number;
  numChildren: number;
  guestCountry: string;
  chargedEur: number;
  correctEur: number;
  overchargeEur: number;
  reason: 'mauritian_resident' | 'children_excluded' | 'both';
  refundIssued: boolean;
}

export const FIN_TOURIST_OVERCHARGES: FinTouristOvercharge[] = [
  { reservationId: 'r-2026-1188', guestName: 'Ramgoolam family', propertyCode: 'VV-47', checkin: '2026-04-22', nights: 5, numAdults: 2, numChildren: 2, guestCountry: 'MU', chargedEur: 60, correctEur: 0, overchargeEur: 60, reason: 'mauritian_resident', refundIssued: false },
  { reservationId: 'r-2026-1192', guestName: 'Wilson, M.', propertyCode: 'BL-12', checkin: '2026-04-19', nights: 7, numAdults: 2, numChildren: 1, guestCountry: 'GB', chargedEur: 63, correctEur: 42, overchargeEur: 21, reason: 'children_excluded', refundIssued: false },
  { reservationId: 'r-2026-1175', guestName: 'Beemul family', propertyCode: 'LC-9', checkin: '2026-04-10', nights: 4, numAdults: 2, numChildren: 1, guestCountry: 'MU', chargedEur: 36, correctEur: 0, overchargeEur: 36, reason: 'both', refundIssued: true },
  { reservationId: 'r-2026-1162', guestName: 'Kayla G.', propertyCode: 'VV-47', checkin: '2026-03-28', nights: 7, numAdults: 2, numChildren: 3, guestCountry: 'MU', chargedEur: 105, correctEur: 0, overchargeEur: 105, reason: 'both', refundIssued: false },
  { reservationId: 'r-2026-1149', guestName: 'Maik B.', propertyCode: 'BL-12', checkin: '2026-03-22', nights: 7, numAdults: 2, numChildren: 1, guestCountry: 'DE', chargedEur: 63, correctEur: 42, overchargeEur: 21, reason: 'children_excluded', refundIssued: false },
  { reservationId: 'r-2026-1124', guestName: 'Wayne L.', propertyCode: 'PT-3', checkin: '2026-03-15', nights: 9, numAdults: 3, numChildren: 0, guestCountry: 'MU', chargedEur: 81, correctEur: 0, overchargeEur: 81, reason: 'mauritian_resident', refundIssued: false },
  { reservationId: 'r-2026-1098', guestName: 'Patel family', propertyCode: 'LC-9', checkin: '2026-02-18', nights: 5, numAdults: 2, numChildren: 2, guestCountry: 'MU', chargedEur: 60, correctEur: 0, overchargeEur: 60, reason: 'both', refundIssued: false },
  { reservationId: 'r-2026-1077', guestName: 'Ng family', propertyCode: 'VV-47', checkin: '2026-02-08', nights: 6, numAdults: 2, numChildren: 1, guestCountry: 'FR', chargedEur: 54, correctEur: 36, overchargeEur: 18, reason: 'children_excluded', refundIssued: false },
  { reservationId: 'r-2026-1051', guestName: 'Sookhraj, R.', propertyCode: 'PT-3', checkin: '2026-01-26', nights: 4, numAdults: 4, numChildren: 0, guestCountry: 'MU', chargedEur: 48, correctEur: 0, overchargeEur: 48, reason: 'mauritian_resident', refundIssued: false },
];

/** Computed roll-up across all months for the unremitted-liability hero block */
// @demo:data — Tag: PROD-DATA-34 — see frontend/DEMO_CRUFT.md
//   `ownerOverRefundDueEur` (1294) and `ownerOverRefundReservationsCount` (23)
//   are hardcoded illustrative figures. The other two derive from FIN_TOURIST_TAX.
export const FIN_TOURIST_TOTALS = {
  unremittedEur: FIN_TOURIST_TAX.filter((m) => !m.filed).reduce((s, m) => s + m.netOwedEur, 0),
  unfiledMonths: FIN_TOURIST_TAX.filter((m) => !m.filed).length,
  ownerOverRefundDueEur: 1_294, // illustrative — full back-cleanup figure across 23 reservations historically
  ownerOverRefundReservationsCount: 23,
};

// ───────────────── Float ledger (per field-PM account) ─────────────────

export interface FinFloatEntry {
  id: string;
  date: string;
  type: 'topup' | 'expense' | 'transfer_out' | 'opening';
  description: string;
  amountMinor: number;
  runningBalanceMinor: number;
  /** linked expense or top-up reference */
  refId?: string;
}

export interface FinFloatAccount {
  accountId: string;
  cardHolder: string;
  targetFloatMinor: number;
  currentBalanceMinor: number;
  monthSpendMinor: number;
  monthTopupMinor: number;
  entries: FinFloatEntry[];
}

export const FIN_FLOAT_ACCOUNTS: FinFloatAccount[] = [
  {
    accountId: 'mcb-803', cardHolder: 'Bryan',
    targetFloatMinor: 5_000_000, currentBalanceMinor: 1_847_000,
    monthSpendMinor: 5_153_000, monthTopupMinor: 7_000_000,
    entries: [
      { id: 'fl1', date: '2026-04-01', type: 'opening', description: 'Opening balance · Apr 2026', amountMinor: 0, runningBalanceMinor: 1_000_000 },
      { id: 'fl2', date: '2026-04-02', type: 'topup', description: 'Top-up from Main PM', amountMinor: 2_000_000, runningBalanceMinor: 3_000_000, refId: 'b9' },
      { id: 'fl3', date: '2026-04-08', type: 'expense', description: 'Pereybere Hardware · BL-12 retile materials', amountMinor: -432_000, runningBalanceMinor: 2_568_000, refId: 'e7' },
      { id: 'fl4', date: '2026-04-15', type: 'topup', description: 'Top-up from Main PM', amountMinor: 5_000_000, runningBalanceMinor: 7_568_000, refId: 'b9' },
      { id: 'fl5', date: '2026-04-21', type: 'expense', description: 'Climate Tech Ltd · VV-47 AC service', amountMinor: -412_000, runningBalanceMinor: 7_156_000, refId: 'e14' },
      { id: 'fl6', date: '2026-04-23', type: 'expense', description: 'Pereybere Hardware · LC-9 roof emergency', amountMinor: -2_250_000, runningBalanceMinor: 4_906_000, refId: 'e9' },
      { id: 'fl7', date: '2026-04-26', type: 'expense', description: 'Climate Tech Ltd · VV-47 compressor failure', amountMinor: -1_250_000, runningBalanceMinor: 3_656_000, refId: 'e1' },
      { id: 'fl8', date: '2026-04-26', type: 'expense', description: 'PGA Cleaners · BL-12 deep clean', amountMinor: -432_000, runningBalanceMinor: 3_224_000, refId: 'e2' },
    ],
  },
  {
    accountId: 'mcb-897', cardHolder: 'Ishant',
    targetFloatMinor: 4_000_000, currentBalanceMinor: 2_159_000,
    monthSpendMinor: 1_841_000, monthTopupMinor: 4_000_000,
    entries: [
      { id: 'fl9', date: '2026-04-01', type: 'opening', description: 'Opening balance · Apr 2026', amountMinor: 0, runningBalanceMinor: 0 },
      { id: 'fl10', date: '2026-04-03', type: 'topup', description: 'Top-up from Main PM', amountMinor: 4_000_000, runningBalanceMinor: 4_000_000 },
      { id: 'fl11', date: '2026-04-15', type: 'expense', description: 'Pereybere Hardware · BL-12 capex', amountMinor: -432_000, runningBalanceMinor: 3_568_000, refId: 'e23' },
      { id: 'fl12', date: '2026-04-20', type: 'expense', description: 'Pereybere Bain Boeuf · LC-9 small parts', amountMinor: -12_400, runningBalanceMinor: 3_555_600, refId: 'e17' },
      { id: 'fl13', date: '2026-04-21', type: 'expense', description: 'Total Petrol · van fill', amountMinor: -41_200, runningBalanceMinor: 3_514_400, refId: 'e24' },
      { id: 'fl14', date: '2026-04-25', type: 'expense', description: 'Stanley Garden Co · VV-47 quarterly', amountMinor: -320_000, runningBalanceMinor: 3_194_400, refId: 'e4' },
    ],
  },
  {
    accountId: 'mcb-817', cardHolder: 'Franny',
    targetFloatMinor: 3_000_000, currentBalanceMinor: 1_278_000,
    monthSpendMinor: 1_722_000, monthTopupMinor: 3_000_000,
    entries: [
      { id: 'fl15', date: '2026-04-01', type: 'opening', description: 'Opening balance · Apr 2026', amountMinor: 0, runningBalanceMinor: 0 },
      { id: 'fl16', date: '2026-04-04', type: 'topup', description: 'Top-up from Main PM', amountMinor: 3_000_000, runningBalanceMinor: 3_000_000 },
      { id: 'fl17', date: '2026-04-14', type: 'expense', description: 'PGA Cleaners · PT-3 turnover', amountMinor: -410_000, runningBalanceMinor: 2_590_000, refId: 'e25' },
      { id: 'fl18', date: '2026-04-18', type: 'expense', description: 'PGA Cleaners · LC-9 turnover', amountMinor: -365_000, runningBalanceMinor: 2_225_000, refId: 'e20' },
      { id: 'fl19', date: '2026-04-21', type: 'expense', description: 'PGA Cleaners · VV-47 turnover x3', amountMinor: -540_000, runningBalanceMinor: 1_685_000, refId: 'e15' },
      { id: 'fl20', date: '2026-04-23', type: 'expense', description: 'PGA Cleaners · PT-3 standard', amountMinor: -380_000, runningBalanceMinor: 1_305_000, refId: 'e10' },
    ],
  },
];

// ───────────────── Bank financing reports ─────────────────

export interface FinReportBundle {
  id: string;
  label: string;
  description: string;
  format: 'PDF' | 'CSV' | 'XLSX';
  lastGenerated?: string;
  recipients?: string[];
  /** sample preview metric */
  metric?: { label: string; value: string };
}

export const FIN_REPORTS: FinReportBundle[] = [
  { id: 'rpt-pl-ttm', label: 'P&L · TTM', description: 'Trailing-twelve-month profit & loss for FR consolidated. Format used by MCB lending desk.', format: 'PDF', lastGenerated: '2026-04-15', metric: { label: 'Operating margin TTM', value: 'Rs 14.2M' } },
  { id: 'rpt-cashflow-ttm', label: 'Cashflow statement', description: 'Operating, investing, financing activities. Quarterly + TTM.', format: 'PDF', lastGenerated: '2026-04-15', metric: { label: 'Net operating cash TTM', value: 'Rs 11.8M' } },
  { id: 'rpt-bs', label: 'Balance sheet', description: 'Snapshot of assets, liabilities, equity at period end. Annual + most recent quarter.', format: 'PDF', lastGenerated: '2026-04-01', metric: { label: 'Total assets', value: 'Rs 8.4M' } },
  { id: 'rpt-ar-aging', label: 'AR aging', description: 'Outstanding owner statements + days past due. Used to demonstrate receivables quality.', format: 'XLSX', metric: { label: 'Past 30d', value: 'Rs 0' } },
  { id: 'rpt-vat-detail', label: 'VAT detail · Apr 2026', description: 'Per-invoice VAT collected, VAT input on expenses, net payable. MRA-spec format.', format: 'XLSX', lastGenerated: '2026-04-15', metric: { label: 'VAT payable', value: 'Rs 422,635' } },
  { id: 'rpt-statutory', label: 'Statutory accounts (year-end)', description: 'Audited financials per Mauritius Companies Act. Auto-pulled from GL once Phase 2 ships.', format: 'PDF' },
];

// ───────────────── Slack fallback config + Classification rules ─────────────────

export interface FinSlackChannel {
  id: string;
  name: string;
  purpose: string;
  ingestEnabled: boolean;
  lastIngest?: string;
  countMTD: number;
}

export const FIN_SLACK_CHANNELS: FinSlackChannel[] = [
  { id: 's1', name: '#fr-expenses', purpose: 'Field expenses · Bryan/Catherine/Franny/Ishant when FAD unreachable', ingestEnabled: true, lastIngest: '2026-04-26 14:32', countMTD: 18 },
  { id: 's2', name: '#fr-s-expenses', purpose: 'Syndic-specific expenses · GBH building', ingestEnabled: true, lastIngest: '2026-04-22 10:18', countMTD: 4 },
  { id: 's3', name: '#ops-adjustments', purpose: 'Mathias revenue-recon proposals', ingestEnabled: false, countMTD: 0 },
];

export interface FinClassificationRule {
  id: string;
  matchType: 'vendor_pattern' | 'amount_range' | 'description_keyword' | 'account_source';
  matchValue: string;
  thenCategory: string;
  thenBillTo: BillTo;
  priority: number;
  hits90d: number;
  enabled: boolean;
}

export const FIN_CLASSIFICATION_RULES: FinClassificationRule[] = [
  { id: 'r1', matchType: 'vendor_pattern', matchValue: 'NOTION|LINEAR', thenCategory: 'FR-ADM-SOFT', thenBillTo: 'internal_fr', priority: 10, hits90d: 14, enabled: true },
  { id: 'r2', matchType: 'vendor_pattern', matchValue: 'TOTAL PETROL|VIVO PETROL|SHELL', thenCategory: 'FR-ADM-PETROL', thenBillTo: 'internal_fr', priority: 10, hits90d: 22, enabled: true },
  { id: 'r3', matchType: 'description_keyword', matchValue: 'IB Own Account Transfer.*Top Up', thenCategory: '', thenBillTo: 'internal_fr', priority: 5, hits90d: 9, enabled: true },
  { id: 'r4', matchType: 'description_keyword', matchValue: 'BANK TARIFF|WIRE OUT', thenCategory: 'FR-ADM-BANK', thenBillTo: 'internal_fr', priority: 8, hits90d: 31, enabled: true },
  { id: 'r5', matchType: 'amount_range', matchValue: '>50000', thenCategory: '', thenBillTo: 'owner', priority: 20, hits90d: 6, enabled: true },
  { id: 'r6', matchType: 'vendor_pattern', matchValue: 'AIRBNB|BOOKING.COM', thenCategory: '', thenBillTo: 'internal_fr', priority: 1, hits90d: 47, enabled: true },
];

// ───────────────── QuickBooks Online sync state (Phase 2 surface) ─────────────────

export interface FinQboMapping {
  finCategory: string;
  qboAccount: string;
  qboCode: string;
  lastSyncedAt?: string;
  status: 'synced' | 'pending' | 'errored' | 'not_mapped';
}

export const FIN_QBO_MAPPINGS: FinQboMapping[] = [
  { finCategory: 'FR-REP', qboAccount: 'Repairs & Maintenance', qboCode: '6320', status: 'not_mapped' },
  { finCategory: 'FR-MAI', qboAccount: 'Repairs & Maintenance', qboCode: '6320', status: 'not_mapped' },
  { finCategory: 'FR-AME', qboAccount: 'Property Improvements', qboCode: '6330', status: 'not_mapped' },
  { finCategory: 'FR-OPS', qboAccount: 'Cleaning Services', qboCode: '6210', status: 'not_mapped' },
  { finCategory: 'FR-SRL', qboAccount: 'Linen & Supplies', qboCode: '6220', status: 'not_mapped' },
  { finCategory: 'FR-ADM-SOFT', qboAccount: 'Software Subscriptions', qboCode: '6510', status: 'not_mapped' },
  { finCategory: 'FR-ADM-INS', qboAccount: 'Insurance', qboCode: '6620', status: 'not_mapped' },
  { finCategory: 'FR-ADM-PETROL', qboAccount: 'Vehicle Operating', qboCode: '6710', status: 'not_mapped' },
  { finCategory: 'FR-ADM-PRO', qboAccount: 'Professional Fees', qboCode: '6810', status: 'not_mapped' },
  { finCategory: 'FR-ADM-GOV', qboAccount: 'Government Fees', qboCode: '6820', status: 'not_mapped' },
  { finCategory: 'FR-ADM-BANK', qboAccount: 'Bank Charges', qboCode: '6910', status: 'not_mapped' },
];

// ───────────────── Period close · documents required ─────────────────
// Used by Stage 1 doc-centric panel — every doc the team must drop in to close the period.

export type FinDocKind = 'bank_statement' | 'payout_report';
export type FinDocStatus = 'received' | 'missing' | 'partial';

export interface FinPeriodDocRequirement {
  id: string;
  kind: FinDocKind;
  /** label shown in the panel */
  label: string;
  /** sub-text (account ID for bank, platform name for payouts) */
  source: string;
  status: FinDocStatus;
  /** date through which we have coverage (for status=received or partial) */
  coverageThrough?: string;
  /** for status=partial, what's missing */
  gap?: string;
  format: 'CSV' | 'PDF' | 'XLSX';
  /** for bank: linked accountId. for payout: platform name. */
  refId: string;
}

export const FIN_PERIOD_DOCS: FinPeriodDocRequirement[] = [
  // MCB CSVs
  { id: 'd1', kind: 'bank_statement', label: 'FR Main MUR', source: 'MCB · CSV · ...860', status: 'received', coverageThrough: '2026-04-30', format: 'CSV', refId: 'mcb-860' },
  { id: 'd2', kind: 'bank_statement', label: 'Bryan Float MUR', source: 'MCB · CSV · ...803', status: 'received', coverageThrough: '2026-04-30', format: 'CSV', refId: 'mcb-803' },
  { id: 'd3', kind: 'bank_statement', label: 'Ishant West Float MUR', source: 'MCB · CSV · ...897', status: 'partial', coverageThrough: '2026-04-25', gap: 'Apr 26–30 missing · 5 days', format: 'CSV', refId: 'mcb-897' },
  { id: 'd4', kind: 'bank_statement', label: 'Franny Ops MUR', source: 'MCB · CSV · ...817', status: 'received', coverageThrough: '2026-04-30', format: 'CSV', refId: 'mcb-817' },
  // MauBank PDFs
  { id: 'd5', kind: 'bank_statement', label: 'MauBank Main MUR', source: 'MauBank · PDF', status: 'missing', format: 'PDF', refId: 'mb-main' },
  { id: 'd6', kind: 'bank_statement', label: 'MauBank EUR', source: 'MauBank · PDF', status: 'received', coverageThrough: '2026-04-30', format: 'PDF', refId: 'mb-eur' },
  // Platform payout reports
  { id: 'd7', kind: 'payout_report', label: 'Airbnb payout report', source: 'Airbnb · CSV download', status: 'received', coverageThrough: '2026-04-25', format: 'CSV', refId: 'airbnb' },
  { id: 'd8', kind: 'payout_report', label: 'Booking.com payout report', source: 'BDC · CSV download', status: 'partial', coverageThrough: '2026-04-24', gap: 'Apr 25–30 weekend batch pending', format: 'CSV', refId: 'bdc' },
  { id: 'd9', kind: 'payout_report', label: 'Direct booking ledger', source: 'FR website · CSV', status: 'received', coverageThrough: '2026-04-30', format: 'CSV', refId: 'direct' },
];

// ───────────────── Friday AI insights (Phase 4 mocked-as-active) ─────────────────

export type FridayInsightSeverity = 'urgent' | 'notice' | 'info';
export type FridayInsightKind =
  | 'anomaly' | 'forecast' | 'refund_risk' | 'compliance'
  | 'approval_urgency' | 'vendor_health' | 'cashflow';

export interface FridayInsight {
  id: string;
  severity: FridayInsightSeverity;
  kind: FridayInsightKind;
  title: string;
  body: string;
  /** sub-page id to deep-link into */
  openSub?: string;
  /** scope string passed to Friday drawer */
  fridayScope: string;
}

export const FRIDAY_FINANCE_INSIGHTS: FridayInsight[] = [
  {
    id: 'fi1', severity: 'urgent', kind: 'compliance',
    title: 'MRA tourist-tax registration window opens in 8 days',
    body: '€11,847 unremitted across 7 months. Registration packet auto-generated; Mary needs to file it before May 5 to avoid the next month\'s late-filing penalty stacking.',
    openSub: 'tourist-tax',
    fridayScope: 'Tourist tax MRA registration',
  },
  {
    id: 'fi2', severity: 'urgent', kind: 'approval_urgency',
    title: '3 medium-tier approvals expire in <24h',
    body: 'Climate Tech Ltd · Aqua Plumbing · Pereybere Hardware (LC-9 roof). Owners haven\'t responded; deemed-approval will fire automatically — but if you wanted to nudge personally, it\'s now.',
    openSub: 'approvals',
    fridayScope: 'Pending approvals expiring',
  },
  {
    id: 'fi3', severity: 'notice', kind: 'anomaly',
    title: 'Pereybere Hardware: 6 captures in 14 days',
    body: '40% above the 90-day baseline cadence. All BL-12 + LC-9. Driver: April storm damage. Not necessarily a problem — flagging because the pattern broke.',
    openSub: 'transactions',
    fridayScope: 'Pereybere Hardware spend pattern',
  },
  {
    id: 'fi4', severity: 'notice', kind: 'forecast',
    title: 'April expenses tracking 12% over March',
    body: 'Drivers: BL-12 retile (Rs 43k urgent override) + LC-9 roof emergency (pending Rs 22.5k). Excluding these two, the period is on baseline.',
    openSub: 'pnl',
    fridayScope: 'April vs March expense variance',
  },
  {
    id: 'fi5', severity: 'notice', kind: 'refund_risk',
    title: 'Wilson, M. has 2 prior refund attempts this year',
    body: 'Reservation r-2026-1192 (Apr 19, BL-12) — guest already requested partial refund via Airbnb resolution centre. Pattern matches abuse-likely cohort.',
    openSub: 'approvals',
    fridayScope: 'Guest refund pattern · Wilson',
  },
  {
    id: 'fi6', severity: 'info', kind: 'cashflow',
    title: 'Bryan\'s float card below 40% of target',
    body: 'Rs 1,847 left vs Rs 5,000 target. Top up before next week\'s scheduled VV-47 work to avoid him fronting from personal account.',
    openSub: 'float-ledger',
    fridayScope: 'Bryan float account',
  },
];

/** Per-vendor health hint surfaced in Vendor drawer header. */
export const FRIDAY_VENDOR_HINTS: Record<string, { tone: 'good' | 'notice' | 'warn'; text: string }> = {
  v1: { tone: 'notice', text: '6 captures in 14 days · 40% above baseline · driver: April storm' },
  v2: { tone: 'good', text: 'Cadence typical · 3 captures/mo, recent invoice within ±5% of last 90d avg' },
  v3: { tone: 'good', text: 'Cadence typical · plumbing call-outs cluster post-storm but amounts in line' },
  v4: { tone: 'notice', text: 'Quarterly bulk linen rotation due — last rotation Apr 24 · next: Jul' },
  v5: { tone: 'good', text: 'Field fuel · cadence + amounts within van-mileage baseline' },
  v9: { tone: 'good', text: 'Cleaning vendor · per-turnover cost within ±8% of property type baseline' },
  v10: { tone: 'good', text: 'Garden cadence quarterly · prices stable YoY' },
};

/** Per-guest refund-pattern flag surfaced in Approvals detail. */
export const FRIDAY_GUEST_FLAGS: Record<string, { severity: 'low' | 'medium' | 'high'; text: string }> = {
  // keyed by reservationId / guest reference for demo
  'r-2026-1192': { severity: 'medium', text: '2 prior refund attempts this year · pattern matches abuse-likely cohort' },
};

// ───────────────── Helpers ─────────────────

export function formatMoney(
  minor: number | null,
  currency: string = 'MUR',
  locale?: string,
): string {
  if (minor === null || Number.isNaN(minor)) return '—';
  const major = minor / 100;
  switch (currency) {
    case 'MUR': return 'Rs ' + major.toLocaleString(locale || 'en-MU', { maximumFractionDigits: 0 });
    case 'USD': return '$' + major.toLocaleString(locale || 'en-US', { maximumFractionDigits: 0 });
    case 'EUR': return '€ ' + major.toLocaleString(locale || 'en-GB', { maximumFractionDigits: 0 });
    case 'GBP': return '£' + major.toLocaleString(locale || 'en-GB', { maximumFractionDigits: 0 });
    default:
      try {
        return new Intl.NumberFormat(locale || 'en', {
          style: 'currency',
          currency,
          maximumFractionDigits: 0,
        }).format(major);
      } catch {
        return currency + ' ' + major.toLocaleString(locale || 'en', { maximumFractionDigits: 0 });
      }
  }
}

export const formatMUR = (minor: number | null): string => {
  const { currency, locale } = getCachedTenantCurrency();
  return formatMoney(minor, currency, locale);
};
export const formatEUR = (minor: number) => formatMoney(minor, 'EUR');
export const formatUSD = (minor: number) => formatMoney(minor, 'USD');
export const formatCurrency = (minor: number, ccy: Currency) => formatMoney(minor, ccy);

export const billToLabel = (b: BillTo): string =>
  b === 'owner' ? 'Owner' : b === 'internal_fr' ? 'FR' : b === 'internal_fi' ? 'FI' : 'S';

export const billToColor = (b: BillTo): 'green' | 'blue' | 'amber' =>
  b === 'owner' ? 'green' : b === 'internal_fr' ? 'blue' : 'amber';

export const tierColor = (t: ApprovalTier): 'green' | 'amber' | 'red' =>
  t === 'routine' ? 'green' : t === 'major' ? 'red' : 'amber';

export const tierLabel = (t: ApprovalTier): string =>
  t === 'routine' ? 'Auto-approved' :
  t === 'medium' ? 'Owner approval, 24h auto' :
  t === 'urgent_override' ? 'Urgent override' :
  'Owner pre-approval required';

// ───────────────── Internal escalation chain (Mathias additions · Item C) ─────────────────
//
// Replaces the originally-locked Slack-DM-Ishant flow per running decisions
// log §3.1 (Internal team comms live in FAD Inbox, not Slack). The chain
// runs when a refund / reconciliation request exceeds the requestor's
// authority cap — it walks the tiers below until someone responds.

export type EscalationRecipient = 'u-ishant' | 'u-mathias' | 'u-franny';

export interface FinEscalationChain {
  /** Where the request lands first. */
  tier1: {
    recipientId: EscalationRecipient;
    /** Posts to this team channel. Default: '#finance'. */
    channelKey: 'finance';
    /** Minutes of silence before escalating to tier 2 (urgent flag only). */
    silentTimeoutMins: number;
  };
  /** Phone-call escalation when tier 1 is silent + urgent. */
  tier2: {
    recipientId: EscalationRecipient;
    /** Stub for now; real impl wires 3CX click-to-dial. */
    via: '3cx_phone';
    /** Minutes of further silence before escalating to tier 3. */
    silentTimeoutMins: number;
  };
  /** Final fallback — Mathias can approve up to this MUR cap if tier 1 + 2
   *  fail. If amount exceeds this cap, the chain escalates to Franny. */
  tier3: {
    recipientId: EscalationRecipient;
    /** Mathias's fallback approval cap when Ishant unavailable, MUR minor. */
    fallbackApprovalCapMinor: number;
    /** Last-resort recipient if amount > tier3 cap. */
    finalFallbackRecipientId: EscalationRecipient;
  };
}

// @demo:config — Escalation chain with hardcoded recipient IDs, timeout minutes, and
// fallback approval cap (20_000_00 minor units). Replace with GET /api/finance/escalation-chain
// returning the tenant-configured chain. Tag: PROD-CONFIG-3.
export const FIN_ESCALATION_CHAIN: FinEscalationChain = {
  tier1: { recipientId: 'u-ishant', channelKey: 'finance', silentTimeoutMins: 30 },
  tier2: { recipientId: 'u-ishant', via: '3cx_phone', silentTimeoutMins: 15 },
  tier3: {
    recipientId: 'u-mathias',
    fallbackApprovalCapMinor: 20_000_00,
    finalFallbackRecipientId: 'u-franny',
  },
};
