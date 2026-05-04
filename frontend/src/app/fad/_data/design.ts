// Friday Design OS — types, fixtures, mock accessors. Tag: PROD-DESIGN-* (see DEMO_CRUFT.md).
//
// @demo:data — Replace with API client. See `designClient` at the bottom of this
// file: same call shape, swap one import. Tag: PROD-DESIGN-1.
//
// @demo:logic — Tier auto-calc, fee auto-calc, owner-stripping for portal view
// belong server-side once auth is real. Tag: PROD-DESIGN-2.

// ─────────────────────────── ENTITY / MODULE CONSTANTS ───────────────────────────

/** Every Design OS record carries entity_id = 'FD' (Friday Design). */
export const DESIGN_ENTITY_ID = 'FD' as const;
export type DesignEntityId = typeof DESIGN_ENTITY_ID;

// ─────────────────────────── 17-STAGE WORKFLOW ───────────────────────────

export type StageId =
  | 'lead'
  | 'proposal'
  | 'doc-request'
  | 'site-visit'
  | 'preferences'
  | 'rough-budget'
  | 'agreement'
  | 'signature'
  | 'payment-gate'
  | 'moodboard'
  | 'design-pack'
  | 'design-review'
  | 'final-budget'
  | 'funding-gate'
  | 'execution'
  | 'expense-capture'
  | 'reconciliation';

export type StageStatus =
  | 'pending'
  | 'in-progress'
  | 'waiting-on-owner'
  | 'blocked'
  | 'done'
  | 'skipped';

/**
 * Project-level lifecycle, orthogonal to stage progress.
 *  - active: normal flow.
 *  - paused: workflow halted, all data preserved, resumable. Friday-side decision
 *            (e.g. agreement signature slips past loan window).
 *  - cancelled: terminal. Project closed, fee retained per discretion, items
 *               procured may be transferred to Friday inventory.
 */
export type LifecycleStatus = 'active' | 'paused' | 'cancelled';

export interface StageDef {
  id: StageId;
  index: number;
  label: string;
  shortLabel: string;
  /** Sub-route slug used by the project shell to swap inner content. */
  route: string;
}

export const STAGES: StageDef[] = [
  { id: 'lead',             index: 1,  label: 'Lead / Owner Intake',      shortLabel: 'Lead',         route: 'overview' },
  { id: 'proposal',         index: 2,  label: 'Proposal path decision',   shortLabel: 'Proposal',     route: 'overview' },
  { id: 'doc-request',      index: 3,  label: 'Document Request',         shortLabel: 'Docs',         route: 'overview' },
  { id: 'site-visit',       index: 4,  label: 'Site Visit',               shortLabel: 'Site visit',   route: 'site-visit' },
  { id: 'preferences',      index: 5,  label: 'Preference Scoping',       shortLabel: 'Preferences',  route: 'preferences' },
  { id: 'rough-budget',     index: 6,  label: 'Rough Budget',             shortLabel: 'Rough budget', route: 'rough-budget' },
  { id: 'agreement',        index: 7,  label: 'Agreement & Annex B',      shortLabel: 'Agreement',    route: 'agreement' },
  { id: 'signature',        index: 8,  label: 'Signature',                shortLabel: 'Signature',    route: 'agreement' },
  { id: 'payment-gate',     index: 9,  label: 'Payment Gate (deposit)',   shortLabel: 'Payment',      route: 'payments' },
  { id: 'moodboard',        index: 10, label: 'Moodboard',                shortLabel: 'Moodboard',    route: 'moodboard' },
  { id: 'design-pack',      index: 11, label: 'Design Pack & 3D',         shortLabel: 'Design pack',  route: 'design-pack' },
  { id: 'design-review',    index: 12, label: 'Owner design review',      shortLabel: 'Review',       route: 'design-pack' },
  { id: 'final-budget',     index: 13, label: 'Final Procurement Budget', shortLabel: 'Final budget', route: 'final-budget' },
  { id: 'funding-gate',     index: 14, label: 'Funding Gate',             shortLabel: 'Funding',      route: 'payments' },
  { id: 'execution',        index: 15, label: 'Procurement & Execution',  shortLabel: 'Procurement',  route: 'procurement' },
  { id: 'expense-capture',  index: 16, label: 'Expense capture',          shortLabel: 'Expenses',     route: 'execution' },
  { id: 'reconciliation',   index: 17, label: 'Reconciliation & Handover', shortLabel: 'Handover',    route: 'reconciliation' },
];

export function stageDef(id: StageId): StageDef {
  return STAGES.find((s) => s.id === id) ?? STAGES[0];
}

// ─────────────────────────── PROJECT METADATA ───────────────────────────

export type DesignTier = 1 | 2 | 3;
export type ProjectClassification = 'renovation' | 'furnishing' | 'mixed';

export type LeadSource =
  | 'friday_outreach'
  | 'owner_referral'
  | 'website'
  | 'whatsapp'
  | 'existing_owner'
  | 'walk_in'
  | 'other';

export type EntryPath =
  | 'friday_pitches'
  | 'owner_direct'
  | 'existing_friday_owner'
  | 'new_owner_no_str';

export type ProjectGoal =
  | 'str_readiness'
  | 'furnishing'
  | 'renovation'
  | 'styling'
  | 'premium_upgrade'
  | 'post_damage';

export type TargetOutcome =
  | 'list_property'
  | 'raise_adr'
  | 'improve_reviews'
  | 'prepare_sale'
  | 'improve_owner_usage';

export type ProposalStatus = 'not_needed' | 'draft' | 'sent' | 'accepted' | 'declined';
export type PMLink = 'managed_by_friday' | 'will_be_managed' | 'not_managed';

export interface DesignProject {
  id: string;
  entityId: DesignEntityId;
  name: string;
  counterpartyId: string;
  propertyId: string;
  classification: ProjectClassification;
  tier: DesignTier | null;
  /** Estimated Project Cost in MUR cents (integer minor units). */
  epcMinor: number | null;
  designFeeMinor: number | null;
  procurementFeeMinor: number | null;
  goals: ProjectGoal[];
  outcomes: TargetOutcome[];
  budgetExpectationMinor: number | null;
  urgency: string | null;
  pmLink: PMLink;
  designLeadUserId: string | null;
  /** Currently-active stage in the 17-stage flow. */
  currentStage: StageId;
  stageStatus: StageStatus;
  blocker: string | null;
  nextAction: string | null;
  createdAt: string;
  updatedAt: string;
  startDate: string | null;
  estimatedCompletion: string | null;
  /** Project-level lifecycle status, orthogonal to stage progress. Defaults to 'active'. */
  lifecycleStatus: LifecycleStatus;
  /** Set when lifecycleStatus transitions to 'paused'. */
  pausedAt: string | null;
  pausedReason: string | null;
  pausedByUserId: string | null;
  /** Set when lifecycleStatus transitions to 'cancelled'. */
  cancelledAt: string | null;
  cancelledReason: string | null;
  cancelledByUserId: string | null;
  /** Whether procured items were transferred to Friday inventory on cancel. */
  cancelTransferToInventory: boolean | null;
}

export interface DesignLead {
  id: string;
  entityId: DesignEntityId;
  source: LeadSource;
  entryPath: EntryPath;
  counterpartyName: string;
  counterpartyPhone: string | null;
  counterpartyEmail: string | null;
  propertyHint: string | null;
  budgetHint: string | null;
  status: ProposalStatus;
  notes: string | null;
  createdAt: string;
}

// ─────────────────────────── COUNTERPARTY / PROPERTY (mock surfaces) ───────────────────────────
//
// These are minimal mock shells of the §7.ZZ Counterparty primitive and the
// existing Property module, scoped to what the Design surface needs. v0.2 will
// pull from real APIs.

export interface Counterparty {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  nic: string | null;
  /** §7.ZZ unified record covers Owner / Client / Co-owner. v0.1 only uses Owner. */
  kind: 'owner' | 'client' | 'co_owner';
}

export interface DesignProperty {
  id: string;
  /** Property module ID if the property is also under PM; null = ID-only property. */
  pmPropertyId: string | null;
  name: string;
  address: string;
  region: string;
  bedrooms: number | null;
  bathrooms: number | null;
}

// ─────────────────────────── ROOMS / PHOTOS / SITE VISIT ───────────────────────────

export type PhotoKind = 'before' | 'context' | 'reference' | 'progress' | 'after';

export interface Photo {
  id: string;
  projectId: string;
  roomId: string | null;
  kind: PhotoKind;
  url: string;
  caption: string | null;
  ownerVisible: boolean;
  uploadedAt: string;
}

export interface Room {
  id: string;
  projectId: string;
  name: string;
  /** Length × width × height, all in metres. */
  lengthM: number | null;
  widthM: number | null;
  heightM: number | null;
  windows: number | null;
  doors: number | null;
  conditionNotes: string | null;
  issues: string | null;
  keepFurniture: string | null;
  removeFurniture: string | null;
  designOpportunity: string | null;
  accessNotes: string | null;
  utilitiesNotes: string | null;
  photoCount: number;
}

export interface SiteVisit {
  projectId: string;
  visitedAt: string | null;
  visitedByUserId: string | null;
  walkthroughVideoUrl: string | null;
  notes: string | null;
  marketingPhotoConsent: boolean;
  status: 'not_started' | 'in_progress' | 'closed';
}

// ─────────────────────────── PREFERENCE PROFILE (16 areas) ───────────────────────────

export type BudgetAttitude = 'minimum_viable' | 'mid_range' | 'aspirational' | 'luxury';

export interface PreferenceProfile {
  projectId: string;
  // 1–12 from source doc §7
  styleDirection: string[];
  styleNotes: string | null;
  colorPalette: string[];
  colorNotes: string | null;
  materials: string[];
  materialNotes: string | null;
  layoutNotes: string | null;
  lightingPrefs: string[];
  lightingNotes: string | null;
  functionalPriorities: string | null;
  targetGuestProfile: string | null;
  budgetAttitude: BudgetAttitude | null;
  mustKeep: string | null;
  mustRemove: string | null;
  styleDislikes: string | null;
  inspirationLinks: string[];
  // 13–16 added per Stage 5 lock
  accessibilityNotes: string | null;
  scentPrefs: string | null;
  acousticPrefs: string | null;
  allergens: string | null;
  // +1 revision expectations
  revisionExpectations: string | null;
  status: 'draft' | 'complete';
  updatedAt: string;
}

// ─────────────────────────── ROUGH BUDGET ───────────────────────────

export interface RoughBudget {
  id: string;
  projectId: string;
  version: number;
  lowMinor: number | null;
  midMinor: number | null;
  highMinor: number | null;
  /** Auto-calc from midMinor, manual override allowed. */
  tier: DesignTier | null;
  designFeeMinor: number | null;
  procurementFeeMinor: number | null;
  assumptions: string | null;
  exclusions: string | null;
  riskItems: string | null;
  nextSteps: string | null;
  status: 'draft' | 'sent' | 'accepted';
  createdAt: string;
}

// ─────────────────────────── AGREEMENT / ANNEX B ───────────────────────────

export type AgreementStatus =
  | 'draft'
  | 'pending_internal_approval'
  | 'approved_to_send'
  | 'sent'
  | 'viewed_by_client'
  | 'signed_by_client'
  | 'completed';

export interface AnnexBData {
  clientName: string;
  clientAddress: string;
  clientNic: string | null;
  projectAddress: string;
  classification: ProjectClassification;
  tier: DesignTier;
  designFeeMinor: number;
  epcMinor: number;
  procurementFeeMinor: number;
  totalEstimateMinor: number;
  startDate: string | null;
  estimatedCompletion: string | null;
  saleOfFurniture: boolean;
  strWorkingCapital: boolean;
  customInclusions: string | null;
  effectiveDate: string;
}

export interface Agreement {
  id: string;
  projectId: string;
  status: AgreementStatus;
  annexB: AnnexBData;
  /** Audit trail of status transitions. */
  events: { at: string; userId: string | null; status: AgreementStatus; note?: string }[];
  /** Approver who clicked "approve to send" (Mary's old role, now FAD-gated). */
  internalApproverId: string | null;
  internalApprovedAt: string | null;
  sentAt: string | null;
  signedAt: string | null;
}

// ─────────────────────────── PAYMENT GATES ───────────────────────────

export type GateId =
  | 'agreement_signed'
  | 'design_fee_60'
  | 'design_fee_40'
  | 'execution_fee_t1'
  | 'project_funds'
  | 'execution_fee_t2'
  | 'final_balance';

export type GateStatus = 'pending' | 'awaiting' | 'received' | 'overridden';

export interface PaymentGate {
  id: GateId;
  projectId: string;
  label: string;
  status: GateStatus;
  amountMinor: number | null;
  receivedAt: string | null;
  bankRef: string | null;
  notes: string | null;
  overrideReason: string | null;
}

// ─────────────────────────── MOODBOARD / DESIGN PACK ───────────────────────────

export type ApprovalState = 'draft' | 'sent' | 'approved' | 'revision_requested' | 'rejected';

export interface MoodboardVersion {
  id: string;
  projectId: string;
  version: number;
  coverImageUrl: string;
  narrative: string;
  inspiration: { url: string; sourceLabel: string }[];
  palette: string[];
  materials: string[];
  designerNotes: string | null;
  state: ApprovalState;
  sentAt: string | null;
  approvedAt: string | null;
  ownerComments: string | null;
  createdAt: string;
}

export interface DesignPackVersion {
  id: string;
  projectId: string;
  version: number;
  pdfUrl: string | null;
  coverImageUrl: string;
  narrative: string;
  rooms: { roomId: string; layoutImageUrl: string; renderImageUrl: string | null; notes: string | null }[];
  state: ApprovalState;
  sentAt: string | null;
  approvedAt: string | null;
  ownerComments: string | null;
  createdAt: string;
}

// ─────────────────────────── BUDGET ITEMS (16-column structure) ───────────────────────────

export type BudgetCategory =
  | 'furniture'
  | 'appliance'
  | 'decor'
  | 'lighting'
  | 'linen'
  | 'contractor'
  | 'labour'
  | 'transport'
  | 'cleaning';

export type BudgetItemStatus = 'pending' | 'approved' | 'rejected' | 'revised';

export type ProcurementStatus =
  | 'to_source'
  | 'quote_received'
  | 'approved_to_buy'
  | 'ordered'
  | 'delivered'
  | 'installed'
  | 'qa_passed';

export interface BudgetItem {
  id: string;
  projectId: string;
  roomId: string;
  /** Approval-package grouping ID. Same string ⇒ approved together. */
  packageId: string;
  // 16 cols per Stage 11 lock
  itemName: string;
  itemDescription: string | null;
  category: BudgetCategory;
  qty: number;
  vendorId: string | null;
  productLink: string | null;
  imageUrl: string | null;
  /** Disclosed to owner per B3.1 (supplier discount disclosure). */
  retailCostMinor: number | null;
  /** Disclosed to owner per B3.1 — owner sees the negotiated rate Friday secured. */
  negotiatedCostMinor: number | null;
  finalApprovedCostMinor: number | null;
  actualPaidMinor: number | null;
  vatMinor: number;
  ownerBillable: boolean;
  /** Internal-only — never owner-visible. */
  internalWork: boolean;
  status: BudgetItemStatus;
  procurement: ProcurementStatus;
  receiptUrl: string | null;
  assignedUserId: string | null;
  dueDate: string | null;
  notes: string | null;
  /** Set true if the item was transferred to Friday inventory on project cancel. */
  transferredToInventory?: boolean;
}

// ─────────────────────────── VENDORS (mock §7.YY) ───────────────────────────

export type VendorCategory =
  | 'electrician'
  | 'general_contractor'
  | 'structural_engineer'
  | 'mep_engineer'
  | 'interior_designer'
  | 'furniture_supplier'
  | 'decor_supplier'
  | 'lighting_supplier'
  | 'transport'
  | 'cleaning'
  | 'other';

export interface Vendor {
  id: string;
  name: string;
  company: string | null;
  category: VendorCategory;
  phone: string | null;
  email: string | null;
  paymentTerms: string;
  notes: string | null;
  /** Engagement summary — projects worked on, total spend. v0.2 derives from real data. */
  engagements: { projectId: string; totalSpendMinor: number; rating: number | null }[];
}

// ─────────────────────────── TASKS / APPROVALS / DOCS / ACTIVITY ───────────────────────────

export interface DesignTask {
  id: string;
  projectId: string;
  /** Linked budget item, if execution-derived. */
  budgetItemId: string | null;
  title: string;
  kind: 'source' | 'buy' | 'delivery' | 'install' | 'qa' | 'photo' | 'other';
  assignedUserId: string | null;
  dueDate: string | null;
  status: 'todo' | 'in_progress' | 'completed' | 'blocked';
  evidenceRequired: string | null;
  evidenceUrl: string | null;
}

export interface DesignApproval {
  id: string;
  projectId: string;
  artifactType: 'moodboard' | 'design_pack' | 'budget_package' | 'change_order';
  artifactId: string;
  state: ApprovalState;
  /** Owner ID (counterparty). */
  ownerId: string;
  sentAt: string | null;
  decidedAt: string | null;
  decisionMethod: 'portal' | 'whatsapp' | 'email' | 'verbal' | null;
  comments: string | null;
}

export type DocumentType =
  | 'initial_proposal'
  | 'site_visit_report'
  | 'preference_brief'
  | 'rough_budget_pdf'
  | 'agreement_annex_b'
  | 'moodboard_pdf'
  | 'design_pack_pdf'
  | 'final_budget_pdf'
  | 'weekly_update'
  | 'change_order'
  | 'final_handover'
  | 'budget_reconciliation'
  | 'internal_profitability'
  | 'before_after_case_study';

export interface DesignDocument {
  id: string;
  projectId: string;
  type: DocumentType;
  version: number;
  status: 'not_yet' | 'draft' | 'sent' | 'approved' | 'archived';
  audience: 'owner' | 'internal' | 'finance' | 'admin';
  generatedAt: string | null;
  generatedByUserId: string | null;
  pdfUrl: string | null;
  notes: string | null;
}

export interface ActivityLogEntry {
  id: string;
  projectId: string;
  at: string;
  userId: string | null;
  kind: 'create' | 'update' | 'approve' | 'reject' | 'send' | 'receive_payment' | 'override' | 'stage_transition' | 'comment';
  summary: string;
}

// ─────────────────────────── ANNEX A (pricing schedule) ───────────────────────────

/** Per-tier mandatory vs optional stage matrix (B3.9). */
export interface TierStageRules {
  /** Stage IDs that may be skipped without blocking workflow progress. */
  optionalStages: StageId[];
}

/** Owner-billed status for an internal service line. */
export type OwnerBilledMode =
  | 'billed'         // flat rate or pass-through, owner is invoiced
  | 'covered_by_pe'  // already included in the procurement & execution fee
  | 'no_charge'      // captured internally, never invoiced to owner
  | 'conditional';   // depends on property handover destination

export interface InternalServiceRate {
  category: string;
  unit: string;
  /** Demo rate in MUR cents; null when not flat (covered_by_pe / no_charge / pass-through). */
  rateMinor: number | null;
  /** Range bounds (MUR cents) when the rate has variance. */
  rangeMinMinor?: number;
  rangeMaxMinor?: number;
  billed: OwnerBilledMode;
  /** Pass-through (transport, disposal) — no markup, costs flow to owner at supplier price. */
  passThrough?: boolean;
  /** Copy explaining the rule when the rate isn't a simple flat. */
  note?: string;
}

export interface AnnexAConfig {
  designFee: { tier3FlatMinor: number; tier2FlatMinor: number; tier1PercentOfEpc: number };
  procurementFurnishing: { tier3Pct: number; tier2Pct: number; tier1Pct: number };
  procurementRenovation: { tier3Pct: number; tier2Pct: number; tier1Pct: number };
  /** EPC thresholds in MUR cents. */
  tierThresholds: { tier3MaxMinor: number; tier2MaxMinor: number };
  internalServiceRates: InternalServiceRate[];
  /** Hard-stop rule copy surfaced as a callout under the rate sheet. */
  cleaningHardStopRule: string;
  /** B3.9 — per-tier mandatory/optional stage matrix. */
  tierStageRules: Record<DesignTier, TierStageRules>;
  agreementTemplateVersion: string;
}

// @demo:config — Replace with `GET /api/design/settings/annex-a`. Tag: PROD-DESIGN-3.
export const ANNEX_A_DEFAULT: AnnexAConfig = {
  designFee: {
    tier3FlatMinor: 25_000_00,
    tier2FlatMinor: 45_000_00,
    tier1PercentOfEpc: 0.03,
  },
  procurementFurnishing: { tier3Pct: 0.125, tier2Pct: 0.10, tier1Pct: 0.075 },
  procurementRenovation: { tier3Pct: 0.175, tier2Pct: 0.15, tier1Pct: 0.125 },
  tierThresholds: { tier3MaxMinor: 500_000_00, tier2MaxMinor: 1_500_000_00 },
  // Demo seed — real rates locked during the post-build training-module work.
  internalServiceRates: [
    { category: 'Internal labour (Bryan, Alex)',         unit: 'per job',      rateMinor: 250_000,                                                                billed: 'billed' },
    { category: 'Site supervision',                       unit: '—',         rateMinor: null,                                                                   billed: 'covered_by_pe', note: 'Covered by the procurement & execution fee.' },
    { category: 'Project management',                     unit: '—',         rateMinor: null,                                                                   billed: 'covered_by_pe', note: 'Covered by the procurement & execution fee.' },
    { category: 'Deep cleaning post-renovation',          unit: 'per property', rateMinor: 450_000, rangeMinMinor: 300_000, rangeMaxMinor: 600_000,                billed: 'billed',        note: 'Range varies by property size.' },
    { category: 'Standard cleaning during ID phase',      unit: 'per visit',    rateMinor: 200_000, rangeMinMinor: 150_000, rangeMaxMinor: 250_000,                billed: 'billed',        note: 'ID-phase only — see hard-stop rule below.' },
    { category: 'Transport / van runs',                   unit: 'per run',      rateMinor: null,                                                                   billed: 'billed',        passThrough: true, note: 'Pass-through, no markup. Charged at supplier rate.' },
    { category: 'Waste / disposal',                       unit: 'per load',     rateMinor: null,                                                                   billed: 'billed',        passThrough: true, note: 'Pass-through, no markup. Charged at supplier rate.' },
    { category: 'Electrical (in-house)',                  unit: 'per job',      rateMinor: 350_000,                                                                billed: 'billed' },
    { category: 'Plumbing (in-house)',                    unit: 'per job',      rateMinor: 350_000,                                                                billed: 'billed' },
    { category: 'Furniture assembly / installation',      unit: 'per job',      rateMinor: 200_000,                                                                billed: 'billed' },
    { category: 'Styling day',                            unit: '—',         rateMinor: null,                                                                   billed: 'covered_by_pe', note: 'Included in the procurement & execution fee.' },
    { category: 'Pre-renovation photos',                  unit: '—',         rateMinor: null,                                                                   billed: 'no_charge',     note: 'Captured internally, no charge.' },
    { category: 'Professional post-photos',               unit: 'per shoot',    rateMinor: null,                                                                   billed: 'conditional',   note: 'Charged when the property does not go on to Friday PM. Waived when handed over to Friday PM.' },
  ],
  cleaningHardStopRule:
    'Standard cleaning rate applies only during the ID-phase execution. Once the property goes live on Guesty (PM phase), cleaning costs flow through the guest cleaning fee, not the ID project.',
  tierStageRules: {
    1: { optionalStages: [] },
    2: { optionalStages: ['doc-request'] },
    3: { optionalStages: ['doc-request', 'moodboard', 'design-pack', 'design-review'] },
  },
  agreementTemplateVersion: '2025-09-nursoo',
};

export function tierForEpc(epcMinor: number, cfg: AnnexAConfig = ANNEX_A_DEFAULT): DesignTier {
  if (epcMinor < cfg.tierThresholds.tier3MaxMinor) return 3;
  if (epcMinor <= cfg.tierThresholds.tier2MaxMinor) return 2;
  return 1;
}

export function designFeeForTier(tier: DesignTier, epcMinor: number, cfg: AnnexAConfig = ANNEX_A_DEFAULT): number {
  if (tier === 3) return cfg.designFee.tier3FlatMinor;
  if (tier === 2) return cfg.designFee.tier2FlatMinor;
  return Math.round(epcMinor * cfg.designFee.tier1PercentOfEpc);
}

export function procurementFeeForTier(
  tier: DesignTier,
  classification: ProjectClassification,
  epcMinor: number,
  cfg: AnnexAConfig = ANNEX_A_DEFAULT,
): number {
  const table = classification === 'renovation' ? cfg.procurementRenovation : cfg.procurementFurnishing;
  const pct = tier === 3 ? table.tier3Pct : tier === 2 ? table.tier2Pct : table.tier1Pct;
  return Math.round(epcMinor * pct);
}

// ─────────────────────────── FORMATTING (MUR re-export) ───────────────────────────

export const formatMUR = (minor: number | null): string => {
  if (minor === null || Number.isNaN(minor)) return '—';
  return 'Rs ' + (minor / 100).toLocaleString('en-MU', { maximumFractionDigits: 0 });
};

export const formatTier = (tier: DesignTier | null): string => (tier ? `Tier ${tier}` : 'Tier —');

export const formatClassification = (c: ProjectClassification): string =>
  c === 'renovation' ? 'Renovation' : c === 'furnishing' ? 'Furnishing' : 'Mixed';

// ─────────────────────────── SEED FIXTURES ───────────────────────────
//
// @demo:data — All seed records below. Tag: PROD-DESIGN-4.
// Realism matters: this is the data the team meeting reads as the demo.

const ISO_NOW = '2026-05-02T08:00:00.000Z';
const TODAY = '2026-05-02';

// Counterparties (mock §7.ZZ)
export const COUNTERPARTIES: Counterparty[] = [
  { id: 'cp-tasleem',  fullName: 'Tasleem Peeroo',     phone: '+230 5400 1100', email: 'tasleem.peeroo@example.com',  nic: null, kind: 'owner' },
  { id: 'cp-davisen',  fullName: 'Davisen Nursoo',     phone: '+230 5800 4422', email: 'davisen.nursoo@example.com',  nic: 'N1903730912045', kind: 'owner' },
  { id: 'cp-matthieu', fullName: 'Matthieu Duval',     phone: '+230 5900 7733', email: 'matthieu.duval@example.com',  nic: null, kind: 'owner' },
  { id: 'cp-rc15',     fullName: 'Residence Camelia 15 Owner', phone: null,     email: 'rc15-owner@example.com',      nic: null, kind: 'owner' },
  { id: 'cp-lb2',      fullName: 'Lagon Bleu LB-2 Owner',      phone: null,     email: 'lb2-owner@example.com',       nic: null, kind: 'owner' },
  { id: 'cp-lb3',      fullName: 'Lagon Bleu LB-3 Owner',      phone: null,     email: 'lb3-owner@example.com',       nic: null, kind: 'owner' },
];

export function getCounterparty(id: string): Counterparty | null {
  return COUNTERPARTIES.find((c) => c.id === id) ?? null;
}
export function searchCounterparties(query: string): Counterparty[] {
  const q = query.trim().toLowerCase();
  if (!q) return COUNTERPARTIES;
  return COUNTERPARTIES.filter(
    (c) => c.fullName.toLowerCase().includes(q) || c.phone?.includes(q) || c.email?.toLowerCase().includes(q),
  );
}

// Properties
export const PROPERTIES: DesignProperty[] = [
  { id: 'pr-albion',   pmPropertyId: null,    name: 'Albion residence',     address: 'Albion, west coast', region: 'West',   bedrooms: 4, bathrooms: 3 },
  { id: 'pr-ohana',    pmPropertyId: 'OH-1',  name: 'Ohana House',          address: 'Royal Road, Pereybere',  region: 'North',  bedrooms: 5, bathrooms: 4 },
  { id: 'pr-flicflac', pmPropertyId: null,    name: 'Duval — Flic en Flac', address: 'Flic en Flac',           region: 'West',   bedrooms: 3, bathrooms: 2 },
  { id: 'pr-rc15',     pmPropertyId: 'RC-15',   name: 'Residence Camelia 15', address: 'Beau Plan',              region: 'North',  bedrooms: 2, bathrooms: 2 },
  { id: 'pr-lb2',      pmPropertyId: 'LB-2',    name: 'Lagon Bleu LB-2',      address: 'Lagon Bleu Complex',     region: 'North',  bedrooms: 3, bathrooms: 2 },
  { id: 'pr-lb3',      pmPropertyId: 'LB-3',    name: 'Lagon Bleu LB-3',      address: 'Lagon Bleu Complex',     region: 'North',  bedrooms: 3, bathrooms: 2 },
];

export function getProperty(id: string): DesignProperty | null {
  return PROPERTIES.find((p) => p.id === id) ?? null;
}

// Vendors (§7.YY mock)
export const VENDORS: Vendor[] = [
  { id: 'v-faiz',    name: 'Faiz',           company: 'Phase Electronics Ltd', category: 'electrician',         phone: '+230 5111 2233', email: 'faiz@phase.mu',     paymentTerms: 'Per engagement, 50% deposit',      notes: 'Reliable, quotes in 48h',     engagements: [{ projectId: 'p-ohana', totalSpendMinor: 220_000_00, rating: 4.5 }] },
  { id: 'v-jsev',    name: 'John Sevatian',  company: null,                    category: 'general_contractor',  phone: '+230 5222 3344', email: 'jsevatian@example.com', paymentTerms: 'Milestone-based',              notes: 'General contractor, used on Albion siteworks', engagements: [] },
  { id: 'v-orion',   name: 'Orion Design',   company: 'Orion Design Ltd',      category: 'structural_engineer', phone: '+230 5333 4455', email: 'office@oriondesign.mu', paymentTerms: 'Per drawing set',           notes: null,                          engagements: [{ projectId: 'p-ohana', totalSpendMinor: 80_000_00, rating: 5 }] },
  { id: 'v-yuvan',   name: 'Yuvan',          company: null,                    category: 'mep_engineer',        phone: '+230 5444 5566', email: 'yuvan@example.com', paymentTerms: 'Per engagement',                  notes: 'M&E coordination',            engagements: [] },
  { id: 'v-jaabir',  name: 'Jaabir',         company: null,                    category: 'interior_designer',   phone: '+230 5555 6677', email: 'jaabir@example.com', paymentTerms: 'Project rate',                   notes: 'External Design Lead, built Ohana plans', engagements: [{ projectId: 'p-ohana', totalSpendMinor: 0, rating: 5 }] },
];

export function listVendors(filter?: { category?: VendorCategory; query?: string }): Vendor[] {
  let arr = VENDORS;
  if (filter?.category) arr = arr.filter((v) => v.category === filter.category);
  if (filter?.query) {
    const q = filter.query.toLowerCase();
    arr = arr.filter((v) => v.name.toLowerCase().includes(q) || v.company?.toLowerCase().includes(q));
  }
  return arr;
}
export function getVendor(id: string): Vendor | null {
  return VENDORS.find((v) => v.id === id) ?? null;
}

// Projects
export const PROJECTS: DesignProject[] = [
  {
    id: 'p-albion',
    entityId: DESIGN_ENTITY_ID,
    name: 'Albion — Tasleem',
    counterpartyId: 'cp-tasleem',
    propertyId: 'pr-albion',
    classification: 'mixed',
    tier: null,
    epcMinor: null,
    designFeeMinor: null,
    procurementFeeMinor: null,
    goals: ['str_readiness', 'renovation', 'furnishing'],
    outcomes: ['list_property', 'prepare_sale'],
    budgetExpectationMinor: 1_800_000_00,
    urgency: '2026-07-02',
    pmLink: 'will_be_managed',
    designLeadUserId: 'u-mathias',
    currentStage: 'site-visit',
    stageStatus: 'in-progress',
    blocker: null,
    nextAction: 'Capture site visit photos + measurements (today, Mathias on-site).',
    createdAt: '2026-04-29T09:00:00.000Z',
    updatedAt: ISO_NOW,
    startDate: '2026-05-02',
    estimatedCompletion: '2026-07-02',
    lifecycleStatus: 'active',
    pausedAt: null,
    pausedReason: null,
    pausedByUserId: null,
    cancelledAt: null,
    cancelledReason: null,
    cancelledByUserId: null,
    cancelTransferToInventory: null,
  },
  {
    id: 'p-ohana',
    entityId: DESIGN_ENTITY_ID,
    name: 'Ohana House — Nursoo',
    counterpartyId: 'cp-davisen',
    propertyId: 'pr-ohana',
    classification: 'renovation',
    tier: 1,
    epcMinor: 3_000_000_00,
    designFeeMinor: 85_000_00,
    procurementFeeMinor: 350_000_00,
    goals: ['renovation', 'premium_upgrade'],
    outcomes: ['raise_adr', 'improve_reviews'],
    budgetExpectationMinor: 3_000_000_00,
    urgency: '2026-09-30',
    pmLink: 'managed_by_friday',
    designLeadUserId: 'u-jaabir-ext',
    currentStage: 'execution',
    stageStatus: 'in-progress',
    blocker: 'Awaiting 3 contractor quotes for masonry package',
    nextAction: 'Bryan to chase Sevatian + alt contractor for masonry quotes',
    createdAt: '2025-09-12T10:00:00.000Z',
    updatedAt: ISO_NOW,
    startDate: '2025-10-01',
    estimatedCompletion: '2026-09-30',
    lifecycleStatus: 'active',
    pausedAt: null,
    pausedReason: null,
    pausedByUserId: null,
    cancelledAt: null,
    cancelledReason: null,
    cancelledByUserId: null,
    cancelTransferToInventory: null,
  },
  {
    id: 'p-duval',
    entityId: DESIGN_ENTITY_ID,
    name: 'Duval — Flic en Flac',
    counterpartyId: 'cp-matthieu',
    propertyId: 'pr-flicflac',
    classification: 'renovation',
    tier: null,
    epcMinor: null,
    designFeeMinor: null,
    procurementFeeMinor: null,
    goals: ['renovation', 'styling'],
    outcomes: ['raise_adr'],
    budgetExpectationMinor: 1_200_000_00,
    urgency: '2026-08-01',
    pmLink: 'will_be_managed',
    designLeadUserId: null,
    currentStage: 'lead',
    stageStatus: 'in-progress',
    blocker: null,
    nextAction: 'Schedule site visit (target: 2026-05-15).',
    createdAt: '2026-04-22T11:00:00.000Z',
    updatedAt: ISO_NOW,
    startDate: null,
    estimatedCompletion: null,
    lifecycleStatus: 'active',
    pausedAt: null,
    pausedReason: null,
    pausedByUserId: null,
    cancelledAt: null,
    cancelledReason: null,
    cancelledByUserId: null,
    cancelTransferToInventory: null,
  },
  {
    id: 'p-rc15',
    entityId: DESIGN_ENTITY_ID,
    name: 'Residence Camelia 15 — closeout',
    counterpartyId: 'cp-rc15',
    propertyId: 'pr-rc15',
    classification: 'furnishing',
    tier: 3,
    epcMinor: 420_000_00,
    designFeeMinor: 25_000_00,
    procurementFeeMinor: 52_500_00,
    goals: ['furnishing'],
    outcomes: ['list_property'],
    budgetExpectationMinor: 420_000_00,
    urgency: null,
    pmLink: 'managed_by_friday',
    designLeadUserId: 'u-mathias',
    currentStage: 'reconciliation',
    stageStatus: 'waiting-on-owner',
    blocker: 'Owner sign-off on final reconciliation pending',
    nextAction: 'Send reconciliation report to owner for sign-off.',
    createdAt: '2025-06-15T08:00:00.000Z',
    updatedAt: ISO_NOW,
    startDate: '2025-07-01',
    estimatedCompletion: '2026-04-30',
    lifecycleStatus: 'active',
    pausedAt: null,
    pausedReason: null,
    pausedByUserId: null,
    cancelledAt: null,
    cancelledReason: null,
    cancelledByUserId: null,
    cancelTransferToInventory: null,
  },
  {
    id: 'p-lb2',
    entityId: DESIGN_ENTITY_ID,
    name: 'Lagon Bleu LB-2 — closeout',
    counterpartyId: 'cp-lb2',
    propertyId: 'pr-lb2',
    classification: 'renovation',
    tier: 2,
    epcMinor: 850_000_00,
    designFeeMinor: 45_000_00,
    procurementFeeMinor: 127_500_00,
    goals: ['renovation', 'furnishing'],
    outcomes: ['list_property'],
    budgetExpectationMinor: 850_000_00,
    urgency: null,
    pmLink: 'managed_by_friday',
    designLeadUserId: 'u-mathias',
    currentStage: 'reconciliation',
    stageStatus: 'in-progress',
    blocker: null,
    nextAction: 'Compile final variance report with Bryan.',
    createdAt: '2025-04-10T08:00:00.000Z',
    updatedAt: ISO_NOW,
    startDate: '2025-05-01',
    estimatedCompletion: '2026-03-15',
    lifecycleStatus: 'active',
    pausedAt: null,
    pausedReason: null,
    pausedByUserId: null,
    cancelledAt: null,
    cancelledReason: null,
    cancelledByUserId: null,
    cancelTransferToInventory: null,
  },
  {
    id: 'p-lb3',
    entityId: DESIGN_ENTITY_ID,
    name: 'Lagon Bleu LB-3 — closeout',
    counterpartyId: 'cp-lb3',
    propertyId: 'pr-lb3',
    classification: 'renovation',
    tier: 2,
    epcMinor: 720_000_00,
    designFeeMinor: 45_000_00,
    procurementFeeMinor: 108_000_00,
    goals: ['renovation', 'furnishing'],
    outcomes: ['list_property'],
    budgetExpectationMinor: 720_000_00,
    urgency: null,
    pmLink: 'managed_by_friday',
    designLeadUserId: 'u-mathias',
    currentStage: 'reconciliation',
    stageStatus: 'waiting-on-owner',
    blocker: 'Owner sign-off on final reconciliation pending',
    nextAction: 'Send reconciliation report to owner for sign-off.',
    createdAt: '2025-05-20T08:00:00.000Z',
    updatedAt: ISO_NOW,
    startDate: '2025-06-15',
    estimatedCompletion: '2026-04-15',
    lifecycleStatus: 'active',
    pausedAt: null,
    pausedReason: null,
    pausedByUserId: null,
    cancelledAt: null,
    cancelledReason: null,
    cancelledByUserId: null,
    cancelTransferToInventory: null,
  },
];

export function listProjects(filter?: { stage?: StageId; tier?: DesignTier; classification?: ProjectClassification; query?: string }): DesignProject[] {
  let arr = PROJECTS;
  if (filter?.stage) arr = arr.filter((p) => p.currentStage === filter.stage);
  if (filter?.tier) arr = arr.filter((p) => p.tier === filter.tier);
  if (filter?.classification) arr = arr.filter((p) => p.classification === filter.classification);
  if (filter?.query) {
    const q = filter.query.toLowerCase();
    arr = arr.filter((p) => p.name.toLowerCase().includes(q));
  }
  return arr;
}
export function getProject(id: string): DesignProject | null {
  return PROJECTS.find((p) => p.id === id) ?? null;
}

// Leads
export const LEADS: DesignLead[] = [
  {
    id: 'l-rivulet',
    entityId: DESIGN_ENTITY_ID,
    source: 'website',
    entryPath: 'owner_direct',
    counterpartyName: 'Camille Rivulet',
    counterpartyPhone: '+230 5777 8899',
    counterpartyEmail: 'camille.r@example.com',
    propertyHint: 'Tamarin villa, 4BR',
    budgetHint: 'MUR 800k furnishing',
    status: 'draft',
    notes: 'Inbound via friday.mu form, wants STR-ready furnishing pack.',
    createdAt: '2026-04-30T07:30:00.000Z',
  },
  {
    id: 'l-bel-air',
    entityId: DESIGN_ENTITY_ID,
    source: 'owner_referral',
    entryPath: 'friday_pitches',
    counterpartyName: 'Roshan Bel-Air',
    counterpartyPhone: '+230 5444 1122',
    counterpartyEmail: null,
    propertyHint: 'Belle Mare, 3BR',
    budgetHint: 'MUR 1.5M renovation',
    status: 'sent',
    notes: 'Referral from Davisen. Proposal sent 2026-04-28; awaiting reply.',
    createdAt: '2026-04-26T10:00:00.000Z',
  },
];

// Rooms (Ohana fully populated; Albion empty for site-visit-day demo)
export const ROOMS: Room[] = [
  ...['Living Room','Kitchen','Master bedroom','Bedroom 2','Bedroom 3','Bedroom 4','Bathroom 1','Bathroom 2'].map((name, i) => ({
    id: `r-ohana-${i + 1}`,
    projectId: 'p-ohana',
    name,
    lengthM: [6.2, 4.5, 5.0, 4.2, 3.8, 3.5, 2.4, 2.4][i] ?? null,
    widthM:  [4.8, 3.8, 4.0, 3.5, 3.2, 3.0, 2.0, 1.8][i] ?? null,
    heightM: 2.8,
    windows: i < 6 ? 2 : 1,
    doors: 1,
    conditionNotes: i === 0 ? 'Fresh paint needed; original tile to keep.' : null,
    issues: i === 1 ? 'Old extractor hood; replace.' : null,
    keepFurniture: i === 2 ? 'Solid wood wardrobe.' : null,
    removeFurniture: i === 3 ? 'Single bed (broken slats).' : null,
    designOpportunity: i === 0 ? 'Open plan to dining; reposition sofa.' : null,
    accessNotes: i === 0 ? 'Lift access, deliveries 9–17h.' : null,
    utilitiesNotes: i === 1 ? 'Re-route for dishwasher (M&E flagged by Yuvan).' : null,
    photoCount: 6,
  })),
  // RC-15 minimal (Residence Camelia 15 — standalone, not Lagon Bleu)
  { id: 'r-rc15-1', projectId: 'p-rc15', name: 'Living Room', lengthM: 4.5, widthM: 3.8, heightM: 2.7, windows: 1, doors: 1, conditionNotes: 'Closeout — no new work.', issues: null, keepFurniture: null, removeFurniture: null, designOpportunity: null, accessNotes: null, utilitiesNotes: null, photoCount: 4 },
  { id: 'r-rc15-2', projectId: 'p-rc15', name: 'Bedroom',     lengthM: 3.5, widthM: 3.2, heightM: 2.7, windows: 1, doors: 1, conditionNotes: 'Closeout — no new work.', issues: null, keepFurniture: null, removeFurniture: null, designOpportunity: null, accessNotes: null, utilitiesNotes: null, photoCount: 3 },
  // LB-2 minimal (Lagon Bleu Complex apartment 2)
  { id: 'r-lb2-1',  projectId: 'p-lb2',  name: 'Living Room', lengthM: 5.2, widthM: 4.0, heightM: 2.8, windows: 2, doors: 1, conditionNotes: 'Closeout — renovation complete.', issues: null, keepFurniture: null, removeFurniture: null, designOpportunity: null, accessNotes: null, utilitiesNotes: null, photoCount: 4 },
  { id: 'r-lb2-2',  projectId: 'p-lb2',  name: 'Master bedroom', lengthM: 4.5, widthM: 3.8, heightM: 2.8, windows: 1, doors: 1, conditionNotes: 'Closeout — renovation complete.', issues: null, keepFurniture: null, removeFurniture: null, designOpportunity: null, accessNotes: null, utilitiesNotes: null, photoCount: 3 },
  { id: 'r-lb2-3',  projectId: 'p-lb2',  name: 'Bedroom 2',  lengthM: 3.6, widthM: 3.2, heightM: 2.8, windows: 1, doors: 1, conditionNotes: 'Closeout — renovation complete.', issues: null, keepFurniture: null, removeFurniture: null, designOpportunity: null, accessNotes: null, utilitiesNotes: null, photoCount: 2 },
  // LB-3 minimal (Lagon Bleu Complex apartment 3)
  { id: 'r-lb3-1',  projectId: 'p-lb3',  name: 'Living Room', lengthM: 5.0, widthM: 4.0, heightM: 2.8, windows: 2, doors: 1, conditionNotes: 'Closeout — renovation complete.', issues: null, keepFurniture: null, removeFurniture: null, designOpportunity: null, accessNotes: null, utilitiesNotes: null, photoCount: 3 },
  { id: 'r-lb3-2',  projectId: 'p-lb3',  name: 'Master bedroom', lengthM: 4.4, widthM: 3.8, heightM: 2.8, windows: 1, doors: 1, conditionNotes: 'Closeout — renovation complete.', issues: null, keepFurniture: null, removeFurniture: null, designOpportunity: null, accessNotes: null, utilitiesNotes: null, photoCount: 3 },
  { id: 'r-lb3-3',  projectId: 'p-lb3',  name: 'Bedroom 2',  lengthM: 3.5, widthM: 3.2, heightM: 2.8, windows: 1, doors: 1, conditionNotes: 'Closeout — renovation complete.', issues: null, keepFurniture: null, removeFurniture: null, designOpportunity: null, accessNotes: null, utilitiesNotes: null, photoCount: 2 },
];

export function getRooms(projectId: string): Room[] {
  return ROOMS.filter((r) => r.projectId === projectId);
}

// Photos — placeholder URLs, realistic counts
export const PHOTOS: Photo[] = ROOMS.flatMap((r) =>
  Array.from({ length: r.photoCount }, (_, i) => ({
    id: `ph-${r.id}-${i + 1}`,
    projectId: r.projectId,
    roomId: r.id,
    kind: (i === 0 ? 'before' : i % 3 === 0 ? 'context' : 'before') as PhotoKind,
    url: `/placeholder-photo.svg?room=${r.id}&i=${i + 1}`,
    caption: i === 0 ? `${r.name} — wide angle` : null,
    ownerVisible: true,
    uploadedAt: '2025-09-15T10:00:00.000Z',
  })),
);

// Site visits
export const SITE_VISITS: SiteVisit[] = [
  { projectId: 'p-albion', visitedAt: null, visitedByUserId: 'u-mathias', walkthroughVideoUrl: null, notes: null, marketingPhotoConsent: true, status: 'in_progress' },
  { projectId: 'p-ohana',  visitedAt: '2025-09-15T10:00:00.000Z', visitedByUserId: 'u-mathias', walkthroughVideoUrl: 'drive://ohana-walkthrough.mp4', notes: 'Owner present, full access granted. Generator on rooftop noted.', marketingPhotoConsent: true, status: 'closed' },
  { projectId: 'p-rc15',   visitedAt: '2025-06-20T09:00:00.000Z', visitedByUserId: 'u-mathias', walkthroughVideoUrl: null, notes: 'Closeout visit only.', marketingPhotoConsent: true, status: 'closed' },
  { projectId: 'p-lb2',    visitedAt: '2025-04-15T09:00:00.000Z', visitedByUserId: 'u-mathias', walkthroughVideoUrl: 'drive://lb2-walkthrough.mp4', notes: 'Renovation complete; photo capture pending closeout sign-off.', marketingPhotoConsent: true, status: 'closed' },
  { projectId: 'p-lb3',    visitedAt: '2025-05-25T09:00:00.000Z', visitedByUserId: 'u-mathias', walkthroughVideoUrl: 'drive://lb3-walkthrough.mp4', notes: 'Renovation complete; awaiting owner sign-off on reconciliation.', marketingPhotoConsent: true, status: 'closed' },
];

export function getSiteVisit(projectId: string): SiteVisit | null {
  return SITE_VISITS.find((v) => v.projectId === projectId) ?? null;
}

// Preferences (Ohana populated, others sparse)
export const PREFERENCES: PreferenceProfile[] = [
  {
    projectId: 'p-ohana',
    styleDirection: ['modern coastal', 'tropical'],
    styleNotes: 'Light woods, rattan accents, ocean-inspired palette.',
    colorPalette: ['#e8e0d2', '#bcd3c8', '#1f3a4a', '#c2a77f'],
    colorNotes: 'Sandy neutrals + deep ocean accent.',
    materials: ['wood', 'rattan', 'fabric', 'stone'],
    materialNotes: 'Avoid synthetic plastics in living spaces.',
    layoutNotes: 'Open the kitchen to dining; remove non-load-bearing wall.',
    lightingPrefs: ['warm', 'mood', 'natural emphasis'],
    lightingNotes: 'Dimmable bedrooms; ambient living areas.',
    functionalPriorities: 'Family-friendly, host 8 guests comfortably.',
    targetGuestProfile: 'Couples + small families, 30–50, mid-luxury.',
    budgetAttitude: 'aspirational',
    mustKeep: 'Solid wood wardrobe in master bedroom.',
    mustRemove: 'Old single bed (Bedroom 4), kitchen extractor.',
    styleDislikes: 'Anything overtly industrial / chrome.',
    inspirationLinks: ['https://example.com/inspo-1', 'https://example.com/inspo-2'],
    accessibilityNotes: 'Owner mother visits — handrail in master bath helpful.',
    scentPrefs: 'Subtle citrus / coconut. Avoid heavy florals.',
    acousticPrefs: 'Soft furnishings to dampen tile echo.',
    allergens: 'No down feathers (host allergy).',
    revisionExpectations: '2 revisions baseline; willing to pay for additional if needed.',
    status: 'complete',
    updatedAt: '2025-09-20T09:00:00.000Z',
  },
];

export function getPreferences(projectId: string): PreferenceProfile | null {
  return PREFERENCES.find((p) => p.projectId === projectId) ?? null;
}

// Rough budgets (Ohana has versioned history; Albion none yet)
export const ROUGH_BUDGETS: RoughBudget[] = [
  {
    id: 'rb-ohana-1',
    projectId: 'p-ohana',
    version: 1,
    lowMinor: 2_500_000_00,
    midMinor: 3_000_000_00,
    highMinor: 3_500_000_00,
    tier: 1,
    designFeeMinor: 90_000_00,
    procurementFeeMinor: 375_000_00,
    assumptions: 'Gross of VAT. Excludes architect fees & permit costs (see Annex).',
    exclusions: 'Architect fees, planning permit, insurance, third-party landscape design.',
    riskItems: 'Masonry cost volatility; M&E re-route may surface during demo.',
    nextSteps: 'Annex B + agreement signature.',
    status: 'accepted',
    createdAt: '2025-09-25T09:00:00.000Z',
  },
];

// Agreement (Ohana signed; Albion none)
export const AGREEMENTS: Agreement[] = [
  {
    id: 'ag-ohana-1',
    projectId: 'p-ohana',
    status: 'completed',
    annexB: {
      clientName: 'Davisen Nursoo',
      clientAddress: 'Royal Road, Pereybere, Mauritius',
      clientNic: 'N1903730912045',
      projectAddress: 'Royal Road, Pereybere',
      classification: 'renovation',
      tier: 1,
      designFeeMinor: 85_000_00,
      epcMinor: 3_000_000_00,
      procurementFeeMinor: 350_000_00,
      totalEstimateMinor: 3_435_000_00,
      startDate: '2025-10-01',
      estimatedCompletion: '2026-09-30',
      saleOfFurniture: false,
      strWorkingCapital: true,
      customInclusions: 'Milestone override: 20/40/40 split for procurement & execution fee.',
      effectiveDate: '2025-09-28',
    },
    events: [
      { at: '2025-09-26T14:00:00.000Z', userId: 'u-ishant', status: 'approved_to_send', note: 'Internal pre-departure approval.' },
      { at: '2025-09-26T14:30:00.000Z', userId: 'u-ishant', status: 'sent' },
      { at: '2025-09-27T08:00:00.000Z', userId: 'u-davisen', status: 'viewed_by_client' },
      { at: '2025-09-28T16:00:00.000Z', userId: 'u-davisen', status: 'signed_by_client' },
      { at: '2025-09-28T16:30:00.000Z', userId: 'u-ishant', status: 'completed' },
    ],
    internalApproverId: 'u-ishant',
    internalApprovedAt: '2025-09-26T14:00:00.000Z',
    sentAt: '2025-09-26T14:30:00.000Z',
    signedAt: '2025-09-28T16:00:00.000Z',
  },
];

export function getAgreement(projectId: string): Agreement | null {
  return AGREEMENTS.find((a) => a.projectId === projectId) ?? null;
}

// Payment gates per project
const buildGates = (projectId: string, present: Partial<Record<GateId, Partial<PaymentGate>>>): PaymentGate[] => {
  const defs: { id: GateId; label: string }[] = [
    { id: 'agreement_signed', label: 'Agreement signed' },
    { id: 'design_fee_60',    label: 'Design fee deposit (60%)' },
    { id: 'design_fee_40',    label: 'Design fee balance (40%)' },
    { id: 'execution_fee_t1', label: 'Execution fee tranche 1 (60%)' },
    { id: 'project_funds',    label: 'Project cost funds (EPC)' },
    { id: 'execution_fee_t2', label: 'Execution fee tranche 2 (40%)' },
    { id: 'final_balance',    label: 'Final balance' },
  ];
  return defs.map((d) => ({
    id: d.id,
    projectId,
    label: d.label,
    status: 'pending' as GateStatus,
    amountMinor: null,
    receivedAt: null,
    bankRef: null,
    notes: null,
    overrideReason: null,
    ...(present[d.id] ?? {}),
  }));
};

export const PAYMENT_GATES: PaymentGate[] = [
  ...buildGates('p-albion', {}),
  ...buildGates('p-ohana', {
    agreement_signed: { status: 'received', receivedAt: '2025-09-28T16:00:00.000Z' },
    design_fee_60:    { status: 'received', amountMinor: 51_000_00, receivedAt: '2025-09-29T09:00:00.000Z', bankRef: 'MCB-A4F19' },
    design_fee_40:    { status: 'received', amountMinor: 34_000_00, receivedAt: '2025-12-15T09:00:00.000Z', bankRef: 'MCB-A4F33' },
    execution_fee_t1: { status: 'received', amountMinor: 210_000_00, receivedAt: '2026-01-10T09:00:00.000Z', bankRef: 'MCB-B2A11' },
    project_funds:    { status: 'received', amountMinor: 1_500_000_00, receivedAt: '2026-01-12T09:00:00.000Z', bankRef: 'MCB-B2C42' },
    execution_fee_t2: { status: 'awaiting' },
    final_balance:    { status: 'pending' },
  }),
  ...buildGates('p-duval', {}),
  ...buildGates('p-rc15', {
    agreement_signed: { status: 'received', receivedAt: '2025-07-01T09:00:00.000Z' },
    design_fee_60:    { status: 'received', amountMinor: 15_000_00, receivedAt: '2025-07-02T09:00:00.000Z' },
    design_fee_40:    { status: 'received', amountMinor: 10_000_00, receivedAt: '2025-09-10T09:00:00.000Z' },
    execution_fee_t1: { status: 'received', amountMinor: 31_500_00, receivedAt: '2025-10-01T09:00:00.000Z' },
    project_funds:    { status: 'received', amountMinor: 420_000_00, receivedAt: '2025-10-05T09:00:00.000Z' },
    execution_fee_t2: { status: 'received', amountMinor: 21_000_00, receivedAt: '2026-03-15T09:00:00.000Z' },
    final_balance:    { status: 'awaiting' },
  }),
  ...buildGates('p-lb2', {
    agreement_signed: { status: 'received', receivedAt: '2025-05-01T09:00:00.000Z' },
    design_fee_60:    { status: 'received', amountMinor: 27_000_00, receivedAt: '2025-05-02T09:00:00.000Z' },
    design_fee_40:    { status: 'received', amountMinor: 18_000_00, receivedAt: '2025-08-15T09:00:00.000Z' },
    execution_fee_t1: { status: 'received', amountMinor: 76_500_00, receivedAt: '2025-09-01T09:00:00.000Z' },
    project_funds:    { status: 'received', amountMinor: 850_000_00, receivedAt: '2025-09-08T09:00:00.000Z' },
    execution_fee_t2: { status: 'received', amountMinor: 51_000_00, receivedAt: '2026-02-20T09:00:00.000Z' },
    final_balance:    { status: 'received', amountMinor: 12_500_00, receivedAt: '2026-04-05T09:00:00.000Z' },
  }),
  ...buildGates('p-lb3', {
    agreement_signed: { status: 'received', receivedAt: '2025-06-15T09:00:00.000Z' },
    design_fee_60:    { status: 'received', amountMinor: 27_000_00, receivedAt: '2025-06-16T09:00:00.000Z' },
    design_fee_40:    { status: 'received', amountMinor: 18_000_00, receivedAt: '2025-09-20T09:00:00.000Z' },
    execution_fee_t1: { status: 'received', amountMinor: 64_800_00, receivedAt: '2025-10-05T09:00:00.000Z' },
    project_funds:    { status: 'received', amountMinor: 720_000_00, receivedAt: '2025-10-10T09:00:00.000Z' },
    execution_fee_t2: { status: 'received', amountMinor: 43_200_00, receivedAt: '2026-03-10T09:00:00.000Z' },
    final_balance:    { status: 'awaiting' },
  }),
];

export function getPaymentGates(projectId: string): PaymentGate[] {
  return PAYMENT_GATES.filter((g) => g.projectId === projectId);
}

// Moodboards
export const MOODBOARDS: MoodboardVersion[] = [
  {
    id: 'mb-ohana-1',
    projectId: 'p-ohana',
    version: 1,
    coverImageUrl: '/placeholder-photo.svg?label=moodboard-cover',
    narrative: 'Modern coastal direction: light woods, sandy neutrals, deep ocean accent.',
    inspiration: [
      { url: 'https://example.com/inspo-1', sourceLabel: 'Pinterest — coastal villa' },
      { url: 'https://example.com/inspo-2', sourceLabel: 'AD Mag — Mauritius retreat' },
    ],
    palette: ['#e8e0d2', '#bcd3c8', '#1f3a4a', '#c2a77f'],
    materials: ['wood', 'rattan', 'fabric', 'stone'],
    designerNotes: 'V1 — pre-owner-feedback baseline.',
    state: 'revision_requested',
    sentAt: '2025-10-15T09:00:00.000Z',
    approvedAt: null,
    ownerComments: 'Soften the deep blue accent — more teal-leaning.',
    createdAt: '2025-10-15T09:00:00.000Z',
  },
  {
    id: 'mb-ohana-2',
    projectId: 'p-ohana',
    version: 2,
    coverImageUrl: '/placeholder-photo.svg?label=moodboard-cover-v2',
    narrative: 'Modern coastal — V2, accent shifted to teal per feedback.',
    inspiration: [
      { url: 'https://example.com/inspo-3', sourceLabel: 'House & Garden — teal living' },
    ],
    palette: ['#e8e0d2', '#bcd3c8', '#3b6e7a', '#c2a77f'],
    materials: ['wood', 'rattan', 'fabric', 'stone'],
    designerNotes: 'V2 — owner-approved direction.',
    state: 'approved',
    sentAt: '2025-10-22T09:00:00.000Z',
    approvedAt: '2025-10-25T09:00:00.000Z',
    ownerComments: 'Yes, this is it.',
    createdAt: '2025-10-22T09:00:00.000Z',
  },
];

export function getMoodboards(projectId: string): MoodboardVersion[] {
  return MOODBOARDS.filter((m) => m.projectId === projectId).sort((a, b) => b.version - a.version);
}

// Design pack
export const DESIGN_PACKS: DesignPackVersion[] = [
  {
    id: 'dp-ohana-1',
    projectId: 'p-ohana',
    version: 1,
    pdfUrl: 'drive://ohana-design-pack-v1.pdf',
    coverImageUrl: '/placeholder-photo.svg?label=design-pack-cover',
    narrative: 'Full design pack — room-by-room layouts, palette, materials, lighting plan.',
    rooms: ROOMS.filter((r) => r.projectId === 'p-ohana').map((r) => ({
      roomId: r.id,
      layoutImageUrl: `/placeholder-photo.svg?label=layout-${r.id}`,
      renderImageUrl: `/placeholder-photo.svg?label=render-${r.id}`,
      notes: null,
    })),
    state: 'approved',
    sentAt: '2025-12-01T09:00:00.000Z',
    approvedAt: '2025-12-08T09:00:00.000Z',
    ownerComments: 'Approved. Loving the kitchen layout.',
    createdAt: '2025-12-01T09:00:00.000Z',
  },
];

export function getDesignPacks(projectId: string): DesignPackVersion[] {
  return DESIGN_PACKS.filter((d) => d.projectId === projectId).sort((a, b) => b.version - a.version);
}

// Budget items (Ohana fully populated; ~40 items across 8 rooms)
const OHANA_ROOM_IDS = ROOMS.filter((r) => r.projectId === 'p-ohana').map((r) => r.id);

const ohanaItems: BudgetItem[] = [
  // Living room (r-ohana-1)
  { id: 'bi-1',  projectId: 'p-ohana', roomId: 'r-ohana-1', packageId: 'pkg-ohana-living',  itemName: 'Modular sofa, 3-seater + chaise', itemDescription: 'Linen upholstery, sandy beige', category: 'furniture',  qty: 1, vendorId: 'v-jaabir',  productLink: null, imageUrl: null, retailCostMinor: 180_000_00, negotiatedCostMinor: 155_000_00, finalApprovedCostMinor: 155_000_00, actualPaidMinor: 155_000_00, vatMinor: 23_250_00, ownerBillable: true,  internalWork: false, status: 'approved', procurement: 'delivered',  receiptUrl: 'drive://r-1.pdf', assignedUserId: 'u-bryan', dueDate: '2026-02-01', notes: null },
  { id: 'bi-2',  projectId: 'p-ohana', roomId: 'r-ohana-1', packageId: 'pkg-ohana-living',  itemName: 'Coffee table, oak',                itemDescription: 'Round, 90cm',                  category: 'furniture',  qty: 1, vendorId: 'v-jaabir',  productLink: null, imageUrl: null, retailCostMinor: 32_000_00,  negotiatedCostMinor: 28_000_00,  finalApprovedCostMinor: 28_000_00,  actualPaidMinor: 28_000_00,  vatMinor: 4_200_00,  ownerBillable: true,  internalWork: false, status: 'approved', procurement: 'delivered',  receiptUrl: 'drive://r-2.pdf', assignedUserId: 'u-bryan', dueDate: '2026-02-01', notes: null },
  { id: 'bi-3',  projectId: 'p-ohana', roomId: 'r-ohana-1', packageId: 'pkg-ohana-living',  itemName: 'Floor lamp, rattan + brass',       itemDescription: null,                            category: 'lighting',   qty: 2, vendorId: 'v-jaabir',  productLink: null, imageUrl: null, retailCostMinor: 18_000_00,  negotiatedCostMinor: 15_000_00,  finalApprovedCostMinor: 15_000_00,  actualPaidMinor: null,        vatMinor: 2_250_00,  ownerBillable: true,  internalWork: false, status: 'approved', procurement: 'ordered',    receiptUrl: null,             assignedUserId: 'u-bryan', dueDate: '2026-05-15', notes: null },
  { id: 'bi-4',  projectId: 'p-ohana', roomId: 'r-ohana-1', packageId: 'pkg-ohana-living',  itemName: 'Area rug, wool, 3×4m',             itemDescription: null,                            category: 'decor',      qty: 1, vendorId: 'v-jaabir',  productLink: null, imageUrl: null, retailCostMinor: 45_000_00,  negotiatedCostMinor: 38_000_00,  finalApprovedCostMinor: 38_000_00,  actualPaidMinor: null,        vatMinor: 5_700_00,  ownerBillable: true,  internalWork: false, status: 'approved', procurement: 'to_source',  receiptUrl: null,             assignedUserId: null,      dueDate: '2026-05-30', notes: null },
  { id: 'bi-5',  projectId: 'p-ohana', roomId: 'r-ohana-1', packageId: 'pkg-ohana-living-elec', itemName: 'Re-wire living + ambient lighting circuit', itemDescription: null,                category: 'contractor', qty: 1, vendorId: 'v-faiz',    productLink: null, imageUrl: null, retailCostMinor: 60_000_00,  negotiatedCostMinor: 60_000_00,  finalApprovedCostMinor: 60_000_00,  actualPaidMinor: 60_000_00,  vatMinor: 9_000_00,  ownerBillable: true,  internalWork: false, status: 'approved', procurement: 'qa_passed',  receiptUrl: 'drive://r-5.pdf', assignedUserId: 'u-bryan', dueDate: '2026-01-20', notes: null },
  // Kitchen (r-ohana-2)
  { id: 'bi-6',  projectId: 'p-ohana', roomId: 'r-ohana-2', packageId: 'pkg-ohana-kitchen', itemName: 'Custom cabinetry, oak veneer',     itemDescription: null,                            category: 'furniture',  qty: 1, vendorId: 'v-jsev',    productLink: null, imageUrl: null, retailCostMinor: 220_000_00, negotiatedCostMinor: 195_000_00, finalApprovedCostMinor: 195_000_00, actualPaidMinor: null,        vatMinor: 29_250_00, ownerBillable: true,  internalWork: false, status: 'approved', procurement: 'ordered',    receiptUrl: null,             assignedUserId: 'u-bryan', dueDate: '2026-06-01', notes: null },
  { id: 'bi-7',  projectId: 'p-ohana', roomId: 'r-ohana-2', packageId: 'pkg-ohana-kitchen', itemName: 'Induction hob + extractor',         itemDescription: 'Replace old extractor',         category: 'appliance',  qty: 1, vendorId: null,        productLink: null, imageUrl: null, retailCostMinor: 65_000_00,  negotiatedCostMinor: 58_000_00,  finalApprovedCostMinor: 58_000_00,  actualPaidMinor: null,        vatMinor: 8_700_00,  ownerBillable: true,  internalWork: false, status: 'approved', procurement: 'quote_received', receiptUrl: null,         assignedUserId: 'u-bryan', dueDate: '2026-06-15', notes: null },
  { id: 'bi-8',  projectId: 'p-ohana', roomId: 'r-ohana-2', packageId: 'pkg-ohana-kitchen', itemName: 'Dishwasher, 60cm',                  itemDescription: null,                            category: 'appliance',  qty: 1, vendorId: null,        productLink: null, imageUrl: null, retailCostMinor: 38_000_00,  negotiatedCostMinor: 33_000_00,  finalApprovedCostMinor: 33_000_00,  actualPaidMinor: null,        vatMinor: 4_950_00,  ownerBillable: true,  internalWork: false, status: 'approved', procurement: 'to_source',  receiptUrl: null,             assignedUserId: null,      dueDate: '2026-06-15', notes: null },
  { id: 'bi-9',  projectId: 'p-ohana', roomId: 'r-ohana-2', packageId: 'pkg-ohana-kitchen-mep', itemName: 'M&E re-route for dishwasher', itemDescription: 'Per Yuvan scope',               category: 'contractor', qty: 1, vendorId: 'v-yuvan',   productLink: null, imageUrl: null, retailCostMinor: 45_000_00,  negotiatedCostMinor: 45_000_00,  finalApprovedCostMinor: 45_000_00,  actualPaidMinor: null,        vatMinor: 6_750_00,  ownerBillable: true,  internalWork: false, status: 'approved', procurement: 'approved_to_buy', receiptUrl: null,        assignedUserId: 'u-bryan', dueDate: '2026-05-20', notes: null },
  // Master bedroom (r-ohana-3)
  { id: 'bi-10', projectId: 'p-ohana', roomId: 'r-ohana-3', packageId: 'pkg-ohana-master',  itemName: 'King bed frame, oak',              itemDescription: null,                            category: 'furniture',  qty: 1, vendorId: 'v-jaabir',  productLink: null, imageUrl: null, retailCostMinor: 95_000_00,  negotiatedCostMinor: 82_000_00,  finalApprovedCostMinor: 82_000_00,  actualPaidMinor: 82_000_00,  vatMinor: 12_300_00, ownerBillable: true,  internalWork: false, status: 'approved', procurement: 'installed',  receiptUrl: 'drive://r-10.pdf', assignedUserId: 'u-bryan', dueDate: '2026-03-01', notes: null },
  { id: 'bi-11', projectId: 'p-ohana', roomId: 'r-ohana-3', packageId: 'pkg-ohana-master',  itemName: 'Bedside tables, pair',              itemDescription: null,                            category: 'furniture',  qty: 2, vendorId: 'v-jaabir',  productLink: null, imageUrl: null, retailCostMinor: 28_000_00,  negotiatedCostMinor: 24_000_00,  finalApprovedCostMinor: 24_000_00,  actualPaidMinor: 24_000_00,  vatMinor: 3_600_00,  ownerBillable: true,  internalWork: false, status: 'approved', procurement: 'installed',  receiptUrl: 'drive://r-11.pdf', assignedUserId: 'u-bryan', dueDate: '2026-03-01', notes: null },
  { id: 'bi-12', projectId: 'p-ohana', roomId: 'r-ohana-3', packageId: 'pkg-ohana-master',  itemName: 'Linen — king sheet sets',           itemDescription: '3 sets',                        category: 'linen',      qty: 3, vendorId: null,        productLink: null, imageUrl: null, retailCostMinor: 18_000_00,  negotiatedCostMinor: 15_000_00,  finalApprovedCostMinor: 15_000_00,  actualPaidMinor: null,        vatMinor: 2_250_00,  ownerBillable: true,  internalWork: false, status: 'approved', procurement: 'ordered',    receiptUrl: null,             assignedUserId: 'u-bryan', dueDate: '2026-06-01', notes: null },
  // Bedroom 2 (r-ohana-4) — pending package not yet approved
  { id: 'bi-13', projectId: 'p-ohana', roomId: 'r-ohana-4', packageId: 'pkg-ohana-bd2',     itemName: 'Queen bed frame',                   itemDescription: null,                            category: 'furniture',  qty: 1, vendorId: 'v-jaabir',  productLink: null, imageUrl: null, retailCostMinor: 75_000_00,  negotiatedCostMinor: 65_000_00,  finalApprovedCostMinor: null,        actualPaidMinor: null,        vatMinor: 0,         ownerBillable: true,  internalWork: false, status: 'pending',  procurement: 'to_source',  receiptUrl: null,             assignedUserId: null,      dueDate: null,       notes: 'Awaiting owner package approval.' },
  { id: 'bi-14', projectId: 'p-ohana', roomId: 'r-ohana-4', packageId: 'pkg-ohana-bd2',     itemName: 'Wardrobe, 4-door',                  itemDescription: null,                            category: 'furniture',  qty: 1, vendorId: 'v-jaabir',  productLink: null, imageUrl: null, retailCostMinor: 88_000_00,  negotiatedCostMinor: 75_000_00,  finalApprovedCostMinor: null,        actualPaidMinor: null,        vatMinor: 0,         ownerBillable: true,  internalWork: false, status: 'pending',  procurement: 'to_source',  receiptUrl: null,             assignedUserId: null,      dueDate: null,       notes: null },
  // Bedrooms 3, 4
  { id: 'bi-15', projectId: 'p-ohana', roomId: 'r-ohana-5', packageId: 'pkg-ohana-bd3',     itemName: 'Queen bed frame',                   itemDescription: null,                            category: 'furniture',  qty: 1, vendorId: 'v-jaabir',  productLink: null, imageUrl: null, retailCostMinor: 75_000_00,  negotiatedCostMinor: 65_000_00,  finalApprovedCostMinor: 65_000_00,  actualPaidMinor: null,        vatMinor: 9_750_00,  ownerBillable: true,  internalWork: false, status: 'approved', procurement: 'to_source',  receiptUrl: null,             assignedUserId: null,      dueDate: '2026-06-15', notes: null },
  { id: 'bi-16', projectId: 'p-ohana', roomId: 'r-ohana-6', packageId: 'pkg-ohana-bd4',     itemName: 'Single beds × 2',                   itemDescription: 'Replace broken slats unit', category: 'furniture',  qty: 2, vendorId: 'v-jaabir',  productLink: null, imageUrl: null, retailCostMinor: 60_000_00,  negotiatedCostMinor: 52_000_00,  finalApprovedCostMinor: 52_000_00,  actualPaidMinor: null,        vatMinor: 7_800_00,  ownerBillable: true,  internalWork: false, status: 'approved', procurement: 'ordered',    receiptUrl: null,             assignedUserId: 'u-bryan', dueDate: '2026-06-01', notes: null },
  // Bathrooms
  { id: 'bi-17', projectId: 'p-ohana', roomId: 'r-ohana-7', packageId: 'pkg-ohana-baths',   itemName: 'Vanity unit + mirror',              itemDescription: 'Bathroom 1',                    category: 'furniture',  qty: 1, vendorId: 'v-jsev',    productLink: null, imageUrl: null, retailCostMinor: 38_000_00,  negotiatedCostMinor: 32_000_00,  finalApprovedCostMinor: 32_000_00,  actualPaidMinor: null,        vatMinor: 4_800_00,  ownerBillable: true,  internalWork: false, status: 'approved', procurement: 'ordered',    receiptUrl: null,             assignedUserId: 'u-bryan', dueDate: '2026-06-15', notes: null },
  { id: 'bi-18', projectId: 'p-ohana', roomId: 'r-ohana-8', packageId: 'pkg-ohana-baths',   itemName: 'Vanity unit + mirror',              itemDescription: 'Bathroom 2',                    category: 'furniture',  qty: 1, vendorId: 'v-jsev',    productLink: null, imageUrl: null, retailCostMinor: 32_000_00,  negotiatedCostMinor: 28_000_00,  finalApprovedCostMinor: 28_000_00,  actualPaidMinor: null,        vatMinor: 4_200_00,  ownerBillable: true,  internalWork: false, status: 'approved', procurement: 'to_source',  receiptUrl: null,             assignedUserId: null,      dueDate: '2026-06-15', notes: null },
  // Internal-work line — Friday-billable (NOT owner-billable)
  { id: 'bi-19', projectId: 'p-ohana', roomId: 'r-ohana-1', packageId: 'pkg-ohana-internal', itemName: 'Friday styling hours (final install)', itemDescription: 'Internal service line',     category: 'labour',     qty: 1, vendorId: null,        productLink: null, imageUrl: null, retailCostMinor: 0,           negotiatedCostMinor: 0,           finalApprovedCostMinor: 35_000_00,  actualPaidMinor: null,        vatMinor: 5_250_00,  ownerBillable: false, internalWork: true,  status: 'approved', procurement: 'to_source',  receiptUrl: null,             assignedUserId: 'u-mathias', dueDate: '2026-08-15', notes: null },
];

export const BUDGET_ITEMS: BudgetItem[] = ohanaItems;

export function getBudgetItems(projectId: string): BudgetItem[] {
  return BUDGET_ITEMS.filter((i) => i.projectId === projectId);
}

/**
 * Owner-facing strip: removes internal-only fields. v0.1 mocks the §10 risk
 * control that ships server-side in v0.2.
 */
export interface OwnerBudgetItem {
  id: string;
  itemName: string;
  itemDescription: string | null;
  category: BudgetCategory;
  qty: number;
  vendorName: string | null;
  productLink: string | null;
  imageUrl: string | null;
  /** B3.1 disclosure — retail price the supplier lists. */
  retailCostMinor: number | null;
  /** B3.1 disclosure — the price Friday negotiated, passed through to owner. */
  negotiatedCostMinor: number | null;
  /** Computed: retail − negotiated, when both present. */
  savedMinor: number | null;
  finalApprovedCostMinor: number | null;
  vatMinor: number;
  status: BudgetItemStatus;
  procurement: ProcurementStatus;
  receiptUrl: string | null;
}

/**
 * Owner-side budget shape per B3.1 (supplier discount disclosure).
 *
 * Disclosed: itemName, qty, vendorName, retailCostMinor, negotiatedCostMinor,
 * savedMinor, finalApprovedCostMinor, vat. Receipt only when ownerBillable.
 *
 * Stripped (never owner-visible): internalWork, actualPaidMinor (timing
 * detail), supplier negotiation history, internal-margin computations,
 * receiptUrl on internal-work / non-owner-billable lines.
 */
export function stripForOwner(item: BudgetItem): OwnerBudgetItem {
  // Internal-work lines are stripped from the owner view entirely upstream;
  // here we still null retail/negotiated as a defence-in-depth check so an
  // accidentally-included internal line never leaks numbers.
  const showCosts = !item.internalWork;
  const retail = showCosts ? item.retailCostMinor : null;
  const negotiated = showCosts ? item.negotiatedCostMinor : null;
  const saved =
    retail !== null && negotiated !== null && retail > negotiated ? retail - negotiated : null;
  return {
    id: item.id,
    itemName: item.itemName,
    itemDescription: item.itemDescription,
    category: item.category,
    qty: item.qty,
    vendorName: item.vendorId ? getVendor(item.vendorId)?.name ?? null : null,
    productLink: item.productLink,
    imageUrl: item.imageUrl,
    retailCostMinor: retail,
    negotiatedCostMinor: negotiated,
    savedMinor: saved,
    finalApprovedCostMinor: showCosts ? item.finalApprovedCostMinor : null,
    vatMinor: showCosts ? item.vatMinor : 0,
    status: item.status,
    procurement: item.procurement,
    receiptUrl: item.ownerBillable ? item.receiptUrl : null,
  };
}

// Tasks (execution-stage, auto-derived from approved budget items in spirit)
export const TASKS: DesignTask[] = BUDGET_ITEMS
  .filter((i) => i.projectId === 'p-ohana' && i.status === 'approved')
  .flatMap((i): DesignTask[] => {
    const base = { projectId: i.projectId, budgetItemId: i.id };
    return [
      { id: `t-${i.id}-source`,   ...base, title: `Source: ${i.itemName}`,    kind: 'source',   assignedUserId: i.assignedUserId,    dueDate: i.dueDate, status: i.procurement === 'to_source' ? 'todo' : 'completed', evidenceRequired: 'Quote or product link', evidenceUrl: null },
      { id: `t-${i.id}-buy`,      ...base, title: `Buy: ${i.itemName}`,        kind: 'buy',      assignedUserId: i.assignedUserId,    dueDate: i.dueDate, status: ['ordered','delivered','installed','qa_passed'].includes(i.procurement) ? 'completed' : (i.procurement === 'approved_to_buy' ? 'in_progress' : 'todo'), evidenceRequired: 'Receipt', evidenceUrl: i.receiptUrl },
      { id: `t-${i.id}-delivery`, ...base, title: `Delivery: ${i.itemName}`,   kind: 'delivery', assignedUserId: i.assignedUserId,    dueDate: i.dueDate, status: ['delivered','installed','qa_passed'].includes(i.procurement) ? 'completed' : 'todo', evidenceRequired: 'Delivery note', evidenceUrl: null },
      { id: `t-${i.id}-install`,  ...base, title: `Install: ${i.itemName}`,    kind: 'install',  assignedUserId: i.assignedUserId,    dueDate: i.dueDate, status: ['installed','qa_passed'].includes(i.procurement) ? 'completed' : 'todo', evidenceRequired: 'Install photo', evidenceUrl: null },
      { id: `t-${i.id}-qa`,       ...base, title: `QA: ${i.itemName}`,         kind: 'qa',       assignedUserId: i.assignedUserId,    dueDate: i.dueDate, status: i.procurement === 'qa_passed' ? 'completed' : 'todo', evidenceRequired: 'QA photo', evidenceUrl: null },
    ];
  });

export function getTasks(projectId: string): DesignTask[] {
  return TASKS.filter((t) => t.projectId === projectId);
}

// Approvals (§7.PP mock)
export const APPROVALS: DesignApproval[] = [
  { id: 'apv-1', projectId: 'p-ohana', artifactType: 'moodboard',       artifactId: 'mb-ohana-2', state: 'approved', ownerId: 'cp-davisen', sentAt: '2025-10-22T09:00:00.000Z', decidedAt: '2025-10-25T09:00:00.000Z', decisionMethod: 'whatsapp', comments: 'Yes, this is it.' },
  { id: 'apv-2', projectId: 'p-ohana', artifactType: 'design_pack',     artifactId: 'dp-ohana-1', state: 'approved', ownerId: 'cp-davisen', sentAt: '2025-12-01T09:00:00.000Z', decidedAt: '2025-12-08T09:00:00.000Z', decisionMethod: 'email',    comments: 'Approved.' },
  { id: 'apv-3', projectId: 'p-ohana', artifactType: 'budget_package',  artifactId: 'pkg-ohana-bd2',  state: 'sent', ownerId: 'cp-davisen', sentAt: '2026-04-29T09:00:00.000Z', decidedAt: null,                    decisionMethod: null,        comments: null },
];

export function getApprovals(projectId: string): DesignApproval[] {
  return APPROVALS.filter((a) => a.projectId === projectId);
}

// Documents (per-project rows for all 14 types — status seeded realistically)
const docDefaults: Omit<DesignDocument, 'projectId' | 'id'>[] = [
  { type: 'initial_proposal',       version: 0, status: 'not_yet', audience: 'owner',    generatedAt: null, generatedByUserId: null, pdfUrl: null, notes: null },
  { type: 'site_visit_report',      version: 0, status: 'not_yet', audience: 'internal', generatedAt: null, generatedByUserId: null, pdfUrl: null, notes: null },
  { type: 'preference_brief',       version: 0, status: 'not_yet', audience: 'internal', generatedAt: null, generatedByUserId: null, pdfUrl: null, notes: null },
  { type: 'rough_budget_pdf',       version: 0, status: 'not_yet', audience: 'owner',    generatedAt: null, generatedByUserId: null, pdfUrl: null, notes: null },
  { type: 'agreement_annex_b',      version: 0, status: 'not_yet', audience: 'owner',    generatedAt: null, generatedByUserId: null, pdfUrl: null, notes: null },
  { type: 'moodboard_pdf',          version: 0, status: 'not_yet', audience: 'owner',    generatedAt: null, generatedByUserId: null, pdfUrl: null, notes: null },
  { type: 'design_pack_pdf',        version: 0, status: 'not_yet', audience: 'owner',    generatedAt: null, generatedByUserId: null, pdfUrl: null, notes: null },
  { type: 'final_budget_pdf',       version: 0, status: 'not_yet', audience: 'owner',    generatedAt: null, generatedByUserId: null, pdfUrl: null, notes: null },
  { type: 'weekly_update',          version: 0, status: 'not_yet', audience: 'owner',    generatedAt: null, generatedByUserId: null, pdfUrl: null, notes: null },
  { type: 'change_order',           version: 0, status: 'not_yet', audience: 'owner',    generatedAt: null, generatedByUserId: null, pdfUrl: null, notes: null },
  { type: 'final_handover',         version: 0, status: 'not_yet', audience: 'owner',    generatedAt: null, generatedByUserId: null, pdfUrl: null, notes: null },
  { type: 'budget_reconciliation',  version: 0, status: 'not_yet', audience: 'finance',  generatedAt: null, generatedByUserId: null, pdfUrl: null, notes: null },
  { type: 'internal_profitability', version: 0, status: 'not_yet', audience: 'admin',    generatedAt: null, generatedByUserId: null, pdfUrl: null, notes: null },
  { type: 'before_after_case_study', version: 0, status: 'not_yet', audience: 'internal', generatedAt: null, generatedByUserId: null, pdfUrl: null, notes: null },
];

const ohanaDocOverrides: Partial<Record<DocumentType, Partial<DesignDocument>>> = {
  initial_proposal:  { version: 1, status: 'archived', generatedAt: '2025-08-15T09:00:00.000Z', pdfUrl: 'drive://ohana-proposal.pdf' },
  site_visit_report: { version: 1, status: 'sent',     generatedAt: '2025-09-15T11:00:00.000Z', pdfUrl: 'drive://ohana-svr.pdf' },
  preference_brief:  { version: 1, status: 'sent',     generatedAt: '2025-09-22T09:00:00.000Z', pdfUrl: 'drive://ohana-prefs.pdf' },
  rough_budget_pdf:  { version: 1, status: 'approved', generatedAt: '2025-09-25T09:00:00.000Z', pdfUrl: 'drive://ohana-roughbudget.pdf' },
  agreement_annex_b: { version: 1, status: 'approved', generatedAt: '2025-09-26T14:00:00.000Z', pdfUrl: 'drive://ohana-agreement.pdf' },
  moodboard_pdf:     { version: 2, status: 'approved', generatedAt: '2025-10-22T09:00:00.000Z', pdfUrl: 'drive://ohana-moodboard-v2.pdf' },
  design_pack_pdf:   { version: 1, status: 'approved', generatedAt: '2025-12-01T09:00:00.000Z', pdfUrl: 'drive://ohana-designpack.pdf' },
  final_budget_pdf:  { version: 1, status: 'sent',     generatedAt: '2026-04-15T09:00:00.000Z', pdfUrl: 'drive://ohana-finalbudget.pdf' },
  weekly_update:     { version: 18, status: 'sent',    generatedAt: '2026-04-28T09:00:00.000Z', pdfUrl: 'drive://ohana-weekly-w18.pdf' },
};

export const DOCUMENTS: DesignDocument[] = PROJECTS.flatMap((p) =>
  docDefaults.map((d, idx): DesignDocument => ({
    id: `doc-${p.id}-${d.type}`,
    projectId: p.id,
    ...d,
    ...(p.id === 'p-ohana' ? (ohanaDocOverrides[d.type] ?? {}) : {}),
    type: d.type,
  })),
);

export function getDocuments(projectId: string): DesignDocument[] {
  return DOCUMENTS.filter((d) => d.projectId === projectId);
}

// Activity log (Ohana = rich; others sparse)
export const ACTIVITY: ActivityLogEntry[] = [
  { id: 'a-1',  projectId: 'p-ohana', at: '2025-09-12T10:00:00.000Z', userId: 'u-ishant', kind: 'create',           summary: 'Project created from accepted proposal.' },
  { id: 'a-2',  projectId: 'p-ohana', at: '2025-09-15T10:00:00.000Z', userId: 'u-mathias', kind: 'stage_transition', summary: 'Site visit completed.' },
  { id: 'a-3',  projectId: 'p-ohana', at: '2025-09-22T09:00:00.000Z', userId: 'u-mathias', kind: 'update',           summary: 'Preference profile completed.' },
  { id: 'a-4',  projectId: 'p-ohana', at: '2025-09-26T14:00:00.000Z', userId: 'u-ishant', kind: 'approve',           summary: 'Agreement approved-to-send (internal gate).' },
  { id: 'a-5',  projectId: 'p-ohana', at: '2025-09-28T16:00:00.000Z', userId: 'u-davisen', kind: 'approve',          summary: 'Agreement signed by client.' },
  { id: 'a-6',  projectId: 'p-ohana', at: '2025-09-29T09:00:00.000Z', userId: 'u-ishant', kind: 'receive_payment',   summary: 'Design fee deposit (60%) received — Rs 51,000.' },
  { id: 'a-7',  projectId: 'p-ohana', at: '2025-10-25T09:00:00.000Z', userId: 'u-davisen', kind: 'approve',          summary: 'Moodboard v2 approved by owner.' },
  { id: 'a-8',  projectId: 'p-ohana', at: '2025-12-08T09:00:00.000Z', userId: 'u-davisen', kind: 'approve',          summary: 'Design pack v1 approved by owner.' },
  { id: 'a-9',  projectId: 'p-ohana', at: '2026-04-15T09:00:00.000Z', userId: 'u-jaabir-ext', kind: 'send',          summary: 'Final budget sent to owner for package approval.' },
  { id: 'a-10', projectId: 'p-ohana', at: '2026-04-29T09:00:00.000Z', userId: 'u-jaabir-ext', kind: 'send',          summary: 'Bedroom 2 package sent for approval.' },
  { id: 'a-11', projectId: 'p-albion', at: '2026-04-29T09:00:00.000Z', userId: 'u-ishant', kind: 'create',           summary: 'Project created from accepted lead (Tasleem Peeroo).' },
  { id: 'a-12', projectId: 'p-albion', at: ISO_NOW,                    userId: 'u-mathias', kind: 'stage_transition', summary: 'Site visit started — on-site today.' },
];

export function getActivity(projectId: string): ActivityLogEntry[] {
  return ACTIVITY.filter((a) => a.projectId === projectId).sort((a, b) => (a.at < b.at ? 1 : -1));
}

// ─────────────────────────── DASHBOARD AGGREGATES ───────────────────────────

export interface DashboardMetrics {
  activeProjects: number;
  pendingOwnerApprovals: number;
  procurementOpen: number;
  marginExposureMinor: number;
}

export function getDashboardMetrics(): DashboardMetrics {
  const activeProjects = PROJECTS.filter((p) => !['reconciliation'].includes(p.currentStage) || p.stageStatus !== 'done').length;
  const pendingOwnerApprovals = APPROVALS.filter((a) => a.state === 'sent').length;
  const procurementOpen = BUDGET_ITEMS.filter((i) => i.status === 'approved' && !['installed','qa_passed'].includes(i.procurement)).length;
  const marginExposureMinor = BUDGET_ITEMS
    .filter((i) => i.status === 'approved' && i.actualPaidMinor === null)
    .reduce((sum, i) => sum + (i.finalApprovedCostMinor ?? 0), 0);
  return { activeProjects, pendingOwnerApprovals, procurementOpen, marginExposureMinor };
}

// ─────────────────────────── MOCK CLIENT (interface mirrors future real client) ───────────────────────────
//
// @demo:logic — Swap this object for a real `fetch`-backed client. Same shape,
// same return types. Components import from this object only — never touch the
// raw fixture arrays directly. Tag: PROD-DESIGN-5.
export const designClient = {
  projects: {
    list: listProjects,
    get: getProject,
    metrics: getDashboardMetrics,
  },
  leads: {
    list: () => LEADS,
    get: (id: string) => LEADS.find((l) => l.id === id) ?? null,
  },
  counterparties: {
    get: getCounterparty,
    search: searchCounterparties,
  },
  properties: {
    get: getProperty,
    list: () => PROPERTIES,
  },
  vendors: {
    list: listVendors,
    get: getVendor,
  },
  rooms: { list: getRooms },
  photos: { list: (projectId: string) => PHOTOS.filter((p) => p.projectId === projectId) },
  siteVisit: { get: getSiteVisit },
  preferences: { get: getPreferences },
  roughBudgets: { list: (projectId: string) => ROUGH_BUDGETS.filter((b) => b.projectId === projectId) },
  agreement: { get: getAgreement },
  payments: { list: getPaymentGates },
  moodboards: { list: getMoodboards },
  designPacks: { list: getDesignPacks },
  budgetItems: {
    list: getBudgetItems,
    /** Owner-facing: internal-work lines filtered out, remaining lines stripped per B3.1. */
    listForOwner: (projectId: string) =>
      getBudgetItems(projectId)
        .filter((i) => !i.internalWork)
        .map(stripForOwner),
  },
  tasks: { list: getTasks },
  approvals: { list: getApprovals },
  documents: { list: getDocuments },
  activity: { list: getActivity },
  settings: { annexA: () => ANNEX_A_DEFAULT },
};
