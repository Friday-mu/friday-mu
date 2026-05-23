'use client';

import { useState, useMemo, createContext, useContext } from 'react';
import { ModuleHeader } from '../ModuleHeader';
import {
  IconPlus, IconArrow, IconClock, IconCheck, IconClose, IconPaperclip, IconSparkle,
} from '../icons';
import {
  CURRENT_PERIOD,
  FIN_OVERVIEW_KPIS,
  FIN_EXPENSES,
  FIN_PAYOUTS_NEW,
  FIN_PROPERTIES,
  FIN_OWNERS,
  FIN_CATEGORIES,
  FIN_VENDORS,
  FIN_ACCOUNTS,
  FIN_PERIODS,
  FIN_TOURIST_TAX,
  FIN_TOURIST_OVERCHARGES,
  FIN_TOURIST_TOTALS,
  FIN_BANK_LINES,
  FIN_APPROVALS,
  FIN_OWNER_STATEMENTS,
  FIN_FLOAT_ACCOUNTS,
  FIN_REPORTS,
  FIN_SLACK_CHANNELS,
  FIN_CLASSIFICATION_RULES,
  FIN_QBO_MAPPINGS,
  FRIDAY_FINANCE_INSIGHTS,
  FRIDAY_VENDOR_HINTS,
  FRIDAY_GUEST_FLAGS,
  FIN_PERIOD_DOCS,
  type FinDocStatus,
  formatCurrency,
  formatMUR,
  billToLabel,
  billToColor,
  tierLabel,
  tierColor,
  type BillTo,
  type ExpenseStatus,
  type Currency,
  type FinExpense,
  type FinOwnerStatement,
} from '../../_data/finance';

interface Props {
  subPage: string;
  /** Lifted to FadApp so Sidebar can show lock icons that match the active role. */
  role: FinRole;
  onRoleChange: (r: FinRole) => void;
  /**
   * Opens the Friday drawer (lifted from FadApp). Optional scope overrides the auto-computed
   * module + sub-page scope — e.g. a Friday-brief card passes "Tourist tax MRA registration"
   * so Friday loads the more specific context instead of the generic Finance · Tourist tax.
   */
  onAskFriday: (scope?: string) => void;
}

// ─────────────────────────────────── ROLE GATING ───────────────────────────────────
// Shared with FadApp + Sidebar via `_data/financeRoles.ts`.

import { FIN_ROLE_GATES, FIN_ROLE_LABELS, type FinRole } from '../../_data/financeRoles';
import {
  FIN_PAYOUT_DISCREPANCIES,
  DISCREPANCY_KIND_LABEL,
  detectAllAnomalies,
  discrepancyForReservation,
  openDiscrepancies,
  openReconValueMinor,
  openReconCountsByKind,
  type PayoutDiscrepancy,
} from '../../_data/financeAnomalies';
import { FIN_ESCALATION_CHAIN } from '../../_data/finance';
import {
  applyOwnerCharge,
  applyFareCollapseSplit,
  requestRefundApproval,
  postFinanceEscalation,
} from '../../_data/breezeway';
import { useCurrentUserId } from '../usePermissions';
import { fireToast } from '../Toaster';
import { CaptureExpenseDrawer } from './operations/CaptureExpenseDrawer';

// ─────────────────────────────────── SHARED CONTEXT ───────────────────────────────────

interface ConfirmAction {
  title: string;
  body: React.ReactNode;
  primaryLabel: string;
  primaryTone?: 'primary' | 'danger';
  onConfirm?: () => void;
}

interface FinCtx {
  role: FinRole;
  setRole: (r: FinRole) => void;
  gate: typeof FIN_ROLE_GATES[FinRole];
  openConfirm: (a: ConfirmAction) => void;
  openBankUpload: (accountId?: string, payoutPlatform?: string) => void;
  openVendor: (mode: 'add' | 'edit', vendorId?: string) => void;
  /**
   * Opens the global Friday drawer. Optional scope override — passed as the drawer's `scope`
   * so Friday loads the right context (e.g. "Pereybere Hardware spend pattern" rather than the
   * generic "Finance · Overview"). When omitted, the drawer uses the auto-computed module +
   * sub-page label.
   */
  openFriday: (scope?: string) => void;
}

const FinCtx = createContext<FinCtx | null>(null);
const useFinCtx = (): FinCtx => {
  const ctx = useContext(FinCtx);
  if (!ctx) throw new Error('FinCtx missing');
  return ctx;
};

// ─────────────────────────────────── ROUTER ───────────────────────────────────

export function FinanceModule({ subPage, role, onRoleChange, onAskFriday }: Props) {
  const [captureOpen, setCaptureOpen] = useState(false);
  const [periodCloseOpen, setPeriodCloseOpen] = useState(false);
  const setRole = onRoleChange;
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [bankUpload, setBankUpload] = useState<{ open: boolean; accountId?: string; payoutPlatform?: string }>({ open: false });
  const [vendorDrawer, setVendorDrawer] = useState<{ open: boolean; mode: 'add' | 'edit'; vendorId?: string }>({ open: false, mode: 'add' });

  const gate = FIN_ROLE_GATES[role];

  const ctxValue: FinCtx = {
    role, setRole, gate,
    openConfirm: (a) => setConfirm(a),
    openBankUpload: (accountId, payoutPlatform) => setBankUpload({ open: true, accountId, payoutPlatform }),
    openVendor: (mode, vendorId) => setVendorDrawer({ open: true, mode, vendorId }),
    openFriday: (scope) => onAskFriday(scope),
  };

  const subTitle: Record<string, string> = {
    overview: 'Overview',
    transactions: 'Transactions',
    approvals: 'Approvals',
    'owner-statements': 'Owner statements',
    'tourist-tax': 'Tourist tax',
    pnl: 'P&L dashboard',
    'float-ledger': 'Float ledger',
    reports: 'Reports',
    settings: 'Settings',
  };
  const subSub: Record<string, string> = {
    overview: `${CURRENT_PERIOD.label} · period ${CURRENT_PERIOD.status}`,
    transactions: 'Expenses, payouts, bank lines · all in one view',
    approvals: 'WhatsApp approval inbox · pending owner sign-off',
    'owner-statements': 'Per-property waterfall · period close ready',
    'tourist-tax': 'MRA filing prep · compliance back-fill in flight',
    pnl: 'FR-internal P&L · entity-split · period drill-down',
    'float-ledger': 'Field-PM cards · top-ups vs spend · variance alerts',
    reports: 'P&L · cashflow · balance sheet · bank-financing-ready exports',
    settings: 'Categories, caps, vendors, accounts, integrations',
  };

  const headerActions = (
    <>
      <RoleSwitcher role={role} onChange={setRole} />
      {gate.canClose && (
        <button className="btn ghost sm" onClick={() => setPeriodCloseOpen(true)}>
          Close period
        </button>
      )}
      {gate.canCapture && (
        <button
          className="btn primary sm"
          onClick={() => setCaptureOpen(true)}
        >
          <IconPlus size={12} /> Capture expense
        </button>
      )}
    </>
  );

  const sidebarHasAccess = gate.sub.has(subPage);

  return (
    <FinCtx.Provider value={ctxValue}>
      <ModuleHeader
        title={subTitle[subPage] || 'Finance'}
        subtitle={subSub[subPage]}
        actions={headerActions}
      />
      <div className="fad-module-body" style={{ flex: 1, overflowY: 'auto' }}>
        {!sidebarHasAccess ? (
          <RoleLocked subPage={subTitle[subPage] || subPage} role={role} onSwitchToAdmin={() => setRole('admin')} />
        ) : (
          <>
            {subPage === 'overview' && <FinanceOverview onResumeClose={() => setPeriodCloseOpen(true)} />}
            {subPage === 'transactions' && <FinanceTransactions />}
            {subPage === 'approvals' && <FinanceApprovals />}
            {subPage === 'owner-statements' && <FinanceOwnerStatements />}
            {subPage === 'tourist-tax' && <FinanceTouristTax />}
            {subPage === 'pnl' && <FinancePnL />}
            {subPage === 'float-ledger' && <FinanceFloatLedger />}
            {subPage === 'reports' && <FinanceReports />}
            {subPage === 'settings' && <FinanceSettings />}
          </>
        )}
      </div>

      {/* Path B: admin-direct expense capture, no task context. The drawer
       *  shows a property picker (incl. OFFICE meta) and posts to the real
       *  /api/expenses with entry_mode=path_b. The old in-file CaptureDrawer
       *  mock below is retained for the Path A toggle preview only — wire-up
       *  for switching modes mid-flow lives in slice 4+ if we keep that UX. */}
      {captureOpen && (
        <CaptureExpenseDrawer
          open={captureOpen}
          task={null}
          onClose={() => setCaptureOpen(false)}
          onCreated={() => { fireToast('Expense captured.'); }}
        />
      )}
      {periodCloseOpen && <PeriodCloseWizard onClose={() => setPeriodCloseOpen(false)} />}
      {confirm && <ConfirmModal action={confirm} onClose={() => setConfirm(null)} />}
      {bankUpload.open && <BankUploadDrawer accountId={bankUpload.accountId} payoutPlatform={bankUpload.payoutPlatform} onClose={() => setBankUpload({ open: false })} />}
      {vendorDrawer.open && <VendorDrawer mode={vendorDrawer.mode} vendorId={vendorDrawer.vendorId} onClose={() => setVendorDrawer({ open: false, mode: 'add' })} />}
    </FinCtx.Provider>
  );
}

// ─────────────────────────────────── ROLE UI ───────────────────────────────────

function RoleSwitcher({ role, onChange }: { role: FinRole; onChange: (r: FinRole) => void }) {
  return (
    <div className="fin-role-switcher" title="Dev — preview role views (real RBAC ships in Tasks 3.2)">
      <span className="fin-role-label">{FIN_ROLE_LABELS[role]}</span>
      <select
        value={role}
        onChange={(e) => onChange(e.target.value as FinRole)}
        className="fin-role-select"
      >
        <option value="admin">Admin</option>
        <option value="manager">Manager</option>
        <option value="contributor">Contributor</option>
      </select>
    </div>
  );
}

function RoleLocked({ subPage, role, onSwitchToAdmin }: { subPage: string; role: FinRole; onSwitchToAdmin: () => void }) {
  return (
    <div className="fin-locked">
      <div className="fin-locked-icon">🔒</div>
      <h3 className="fin-locked-title">{subPage} is admin-only</h3>
      <p className="fin-locked-body">
        You're signed in as <strong>{FIN_ROLE_LABELS[role]}</strong>. This surface ships gated to admins until per-user RBAC lands in Tasks 3.2.
      </p>
      <button className="btn primary" onClick={onSwitchToAdmin}>Preview as Admin</button>
    </div>
  );
}

// ─────────────────────────────────── CONFIRM MODAL ───────────────────────────────────

function ConfirmModal({ action, onClose }: { action: ConfirmAction; onClose: () => void }) {
  return (
    <>
      <div className="fad-drawer-overlay open" onClick={onClose} />
      <div className="fin-confirm">
        <div className="fin-confirm-title">{action.title}</div>
        <div className="fin-confirm-body">{action.body}</div>
        <div className="fin-confirm-actions">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button
            className={'btn ' + (action.primaryTone === 'danger' ? 'primary' : 'primary')}
            onClick={() => { action.onConfirm?.(); onClose(); }}
          >
            {action.primaryLabel}
          </button>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────── OVERVIEW ───────────────────────────────────

function FinanceOverview({ onResumeClose }: { onResumeClose: () => void }) {
  const { openConfirm } = useFinCtx();
  const k = FIN_OVERVIEW_KPIS;
  const recentPayouts = FIN_PAYOUTS_NEW.slice(0, 4);
  const pending = FIN_EXPENSES.filter((e) => e.status === 'pending_approval').slice(0, 5);
  const period = CURRENT_PERIOD;
  const stageLabels = ['Pre-flight', 'FX rate', 'Bank recon', 'Revenue recon', 'Per-property', 'Tourist tax', 'P&L preview', 'Lock + post'];

  const reconOpen = openDiscrepancies();
  const reconValueMinor = openReconValueMinor();
  const reconCounts = openReconCountsByKind();

  return (
    <>
      <FridayBrief />

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Payouts this period</div>
          <div className="kpi-value">{formatCurrency(k.payoutsThisPeriodMinor, k.payoutsCurrency)}</div>
          <div className="kpi-sub">across {recentPayouts.length} settlements</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Expenses posted</div>
          <div className="kpi-value">{formatCurrency(k.expensesPostedThisPeriodMUR, 'MUR')}</div>
          <div className="kpi-sub">MUR-denominated only</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Pending approvals</div>
          <div className="kpi-value">{k.pendingApprovalsCount}</div>
          <div className="kpi-sub">{formatCurrency(k.pendingApprovalsMUR, 'MUR')} awaiting</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Tourist tax owed</div>
          <div className="kpi-value">€ {k.touristTaxOwedEur.toLocaleString()}</div>
          <div className="kpi-sub">{FIN_TOURIST_TAX.filter((m) => !m.filed).length} unfiled months</div>
        </div>
      </div>

      {/* Open reconciliation items — Mathias's recon engine surface outside period close */}
      {reconOpen.length > 0 && (
        <div className="card fin-card" style={{ marginTop: 16, borderLeft: '3px solid var(--color-text-warning)' }}>
          <div className="card-header">
            <div>
              <div className="card-title">Open reconciliation items · {reconOpen.length}</div>
              <div className="card-subtitle">
                {formatCurrency(reconValueMinor, 'MUR')} in pending Owner Charges · auto-detected from Guesty vs channel-actual payouts
              </div>
            </div>
            <button className="btn sm" onClick={onResumeClose}>Resolve in period close</button>
          </div>
          <div style={{ padding: '8px 16px 16px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['resolution_centre', 'special_offer_collapse', 'reservation_change', 'platform_discount'] as const).map((k) => {
              const count = reconCounts[k];
              if (count === 0) return null;
              return (
                <span
                  key={k}
                  className="chip"
                  style={{
                    background: 'var(--color-bg-warning)',
                    color: 'var(--color-text-warning)',
                    fontSize: 11,
                  }}
                >
                  {DISCREPANCY_KIND_LABEL[k]} · {count}
                </span>
              );
            })}
          </div>
          <div className="fin-tt-table" style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
            {reconOpen.slice(0, 3).map((d) => (
              <div key={d.id} className="fin-tt-row" style={{ padding: '10px 16px', display: 'grid', gridTemplateColumns: '120px 1fr 1fr 100px', gap: 12, alignItems: 'center', fontSize: 12 }}>
                <span className="mono">{d.reservationId}</span>
                <span>
                  <strong>{d.guestName}</strong>{' '}
                  <span style={{ color: 'var(--color-text-tertiary)' }}>· {d.propertyCode}</span>
                </span>
                <span style={{ color: 'var(--color-text-secondary)' }}>{DISCREPANCY_KIND_LABEL[d.kind]}</span>
                <span className="mono" style={{ textAlign: 'right', fontWeight: 500 }}>
                  {d.suggestedOwnerChargeMinor === 0 ? 'split only' : `Rs ${(d.suggestedOwnerChargeMinor / 100).toLocaleString()}`}
                </span>
              </div>
            ))}
            {reconOpen.length > 3 && (
              <div style={{ padding: '8px 16px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                + {reconOpen.length - 3} more in Stage 4 of period close
              </div>
            )}
          </div>
        </div>
      )}

      <div className="fin-row" style={{ marginTop: 20 }}>
        <div className="card fin-card">
          <div className="card-header">
            <div>
              <div className="card-title">Period close — {period.label}</div>
              <div className="card-subtitle">Locked by {period.lockedBy} at {period.lockedAt}</div>
            </div>
            <button className="btn sm" onClick={onResumeClose}>Resume close</button>
          </div>
          <div className="fin-stage-list">
            {stageLabels.map((label, i) => {
              const stage = i + 1;
              const done = stage < (period.closeStage ?? 1);
              const current = stage === (period.closeStage ?? 1);
              return (
                <div key={i} className={'fin-stage' + (done ? ' done' : '') + (current ? ' current' : '')}>
                  <span className="fin-stage-num">{stage}</span>
                  <span className="fin-stage-label">{label}</span>
                  <span className="fin-stage-state">
                    {done ? <IconCheck size={12} /> : current ? '●' : '○'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card fin-card">
          <div className="card-header">
            <div>
              <div className="card-title">Pending approvals</div>
              <div className="card-subtitle">{k.pendingApprovalsCount} awaiting decision</div>
            </div>
            <button
              className="btn ghost sm"
              onClick={() => window.location.assign('/fad?m=finance&sub=approvals')}
            >
              Open inbox <IconArrow size={10} />
            </button>
          </div>
          <div className="fin-list">
            {pending.map((e) => (
              <div key={e.id} className="fin-row-item">
                <div className="fin-row-main">
                  <div className="fin-row-title">{e.vendorName} · <span className="mono">{e.categoryCode}</span></div>
                  <div className="fin-row-sub">{e.propertyCode ? `${e.propertyCode} · ` : ''}{e.description}</div>
                </div>
                <div className="fin-row-meta">
                  <div className="fin-row-amount">{formatCurrency(e.amountMinor, e.currency)}</div>
                  {e.approvalTier && (
                    <span className={'chip tier-' + tierColor(e.approvalTier)}>
                      {e.approvalTier === 'medium' ? 'Owner approval' : e.approvalTier === 'major' ? 'Major' : e.approvalTier}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {pending.length === 0 && <div className="fin-empty">All caught up</div>}
          </div>
        </div>
      </div>

      <div className="fin-row" style={{ marginTop: 16 }}>
        <div className="card fin-card">
          <div className="card-header">
            <div className="card-title">Recent payouts</div>
            <button
              className="btn ghost sm"
              onClick={() => window.location.assign('/fad?m=finance&sub=transactions')}
            >
              All payouts <IconArrow size={10} />
            </button>
          </div>
          <div className="fin-list">
            {recentPayouts.map((p) => (
              <div key={p.id} className="fin-row-item">
                <div className="fin-row-main">
                  <div className="fin-row-title">{p.platform} · <span className="mono">{p.ref}</span></div>
                  <div className="fin-row-sub">Settled {p.settledAt} · {p.reservationCount} reservations</div>
                </div>
                <div className="fin-row-meta">
                  <div className="fin-row-amount up">+{formatCurrency(p.amountMinor, p.currency)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card fin-card">
          <div className="card-header">
            <div className="card-title">Bank reconciliation</div>
            <button className="btn ghost sm" onClick={onResumeClose}>
              Open recon <IconArrow size={10} />
            </button>
          </div>
          <div className="fin-recon-grid">
            <div>
              <div className="fin-recon-num">{FIN_BANK_LINES.filter((b) => b.status === 'matched').length}</div>
              <div className="fin-recon-lab">Matched</div>
            </div>
            <div>
              <div className="fin-recon-num warn">{FIN_BANK_LINES.filter((b) => b.status === 'proposed').length}</div>
              <div className="fin-recon-lab">Proposed</div>
            </div>
            <div>
              <div className="fin-recon-num warn">{k.unreconciledBankLines}</div>
              <div className="fin-recon-lab">Unmatched</div>
            </div>
            <div>
              <div className="fin-recon-num">{FIN_BANK_LINES.filter((b) => b.status === 'classified_topup' || b.status === 'classified_fee').length}</div>
              <div className="fin-recon-lab">Classified</div>
            </div>
          </div>
          <div className="fin-recon-foot">
            {FIN_ACCOUNTS.length} accounts · last imported {FIN_BANK_LINES.length} lines on {CURRENT_PERIOD.endDate || '—'}
          </div>
        </div>
      </div>

      <div className="fin-ai-strip-foot">
        <span className="fin-ai-strip-tag">Phase 4</span>
        Active above is the early shape of Friday over the books — anomalies, refund risk, forecast drift, compliance reminders.
        Coming next: income forecaster, native dynamic pricing, NL Q&A across every transaction.
      </div>
    </>
  );
}

// Friday's morning brief — AI insights across the books.
// Mocked-as-active version of vision-doc Phase 4 features.
//
// UX: each card is the Ask-Friday entry point. Click anywhere on a card to open the Friday
// drawer with scope pre-set to that insight (e.g. "Pereybere Hardware spend pattern" instead
// of generic "Finance · Overview"). A small "Open source ↗" link in the corner deep-links to
// the relevant sub-page without opening Friday — for users who already know what to do.
function FridayBrief() {
  const { openFriday } = useFinCtx();
  const insights = FRIDAY_FINANCE_INSIGHTS;
  const urgent = insights.filter((i) => i.severity === 'urgent');
  const notice = insights.filter((i) => i.severity === 'notice');
  const info = insights.filter((i) => i.severity === 'info');
  const ordered = [...urgent, ...notice, ...info];

  // Hide the brief shell entirely when there are no insights to surface.
  if (ordered.length === 0) return null;

  return (
    <div className="fin-friday-brief">
      <div className="fin-friday-brief-head">
        <div className="fin-friday-brief-title">
          <IconSparkle size={14} /> Friday brief
        </div>
        <div className="fin-friday-brief-sub">
          {urgent.length} urgent · {notice.length} notice · {info.length} info · refreshed just now ·
          tap any card to ask Friday
        </div>
      </div>
      <div className="fin-friday-brief-grid">
        {ordered.map((i) => (
          <div
            key={i.id}
            role="button"
            tabIndex={0}
            className={'fin-friday-card sev-' + i.severity}
            onClick={() => openFriday(i.fridayScope)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openFriday(i.fridayScope); }}
          >
            <div className="fin-friday-card-head">
              <span className={'fin-friday-card-dot sev-' + i.severity} />
              <span className="fin-friday-card-kind">{i.kind.replace('_', ' ')}</span>
              {i.openSub && (
                <a
                  className="fin-friday-card-source"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.location.assign(`/fad?m=finance&sub=${i.openSub}`);
                  }}
                >
                  Open source ↗
                </a>
              )}
            </div>
            <div className="fin-friday-card-title">{i.title}</div>
            <div className="fin-friday-card-body">{i.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────── TRANSACTIONS ───────────────────────────────────

function FinanceTransactions() {
  const [statusFilter, setStatusFilter] = useState<ExpenseStatus | 'all'>('all');
  const [billToFilter, setBillToFilter] = useState<BillTo | 'all'>('all');
  const [propertyFilter, setPropertyFilter] = useState<string | 'all'>('all');
  const [reconOnly, setReconOnly] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = FIN_EXPENSES.filter((e) => {
    if (statusFilter !== 'all' && e.status !== statusFilter) return false;
    if (billToFilter !== 'all' && e.billTo !== billToFilter) return false;
    if (propertyFilter !== 'all' && e.propertyCode !== propertyFilter) return false;
    if (reconOnly && !(e.reservationId && discrepancyForReservation(e.reservationId))) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!e.vendorName.toLowerCase().includes(q) && !e.description.toLowerCase().includes(q) && !(e.brzTaskId || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <>
      <div className="fin-tx-toolbar">
        <input className="input" placeholder="Search vendor, description, task ref…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
        <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ExpenseStatus | 'all')}>
          <option value="all">All statuses</option>
          <option value="submitted">Submitted</option>
          <option value="pending_approval">Pending approval</option>
          <option value="approved">Approved</option>
          <option value="posted">Posted</option>
          <option value="rejected">Rejected</option>
          <option value="draft">Draft</option>
        </select>
        <select className="input" value={billToFilter} onChange={(e) => setBillToFilter(e.target.value as BillTo | 'all')}>
          <option value="all">All bill-to</option>
          <option value="owner">Owner</option>
          <option value="internal_fr">FR-internal</option>
          <option value="internal_fi">FI-internal</option>
          <option value="internal_s">S-internal</option>
        </select>
        <select className="input" value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)}>
          <option value="all">All properties</option>
          {FIN_PROPERTIES.map((p) => <option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}
        </select>
        <button
          className={'inbox-chip' + (reconOnly ? ' active' : '')}
          onClick={() => setReconOnly((v) => !v)}
          title="Show only rows linked to an open reconciliation discrepancy"
        >
          ⚠ Recon anomalies {openDiscrepancies().length > 0 && `· ${openDiscrepancies().length}`}
        </button>
        <span className="fin-tx-count">{filtered.length} of {FIN_EXPENSES.length}</span>
      </div>

      <div className="fin-tx-table">
        <div className="fin-tx-row fin-tx-head">
          <div>Date</div>
          <div>Vendor / Description</div>
          <div>Property</div>
          <div>Category</div>
          <div className="bill-to-col">Bill-to</div>
          <div className="amount-col">Amount</div>
          <div>Status</div>
          <div>By</div>
        </div>
        {filtered.map((e) => {
          const recon = e.reservationId ? discrepancyForReservation(e.reservationId) : undefined;
          return (
          <div key={e.id} className="fin-tx-row">
            <div className="mono fin-tx-date">{e.occurredAt.split(' ')[0]}</div>
            <div className="fin-tx-desc">
              <div className="fin-tx-vendor">
                {e.vendorName}
                {e.vendorUnrecognized && <span className="chip warn sm">unknown</span>}
                {recon && !recon.resolvedAt && (
                  <span
                    className="chip warn sm"
                    title={`${DISCREPANCY_KIND_LABEL[recon.kind]} — open recon item linked to ${recon.reservationId}`}
                    style={{ background: 'var(--color-bg-warning)', color: 'var(--color-text-warning)' }}
                  >
                    ⚠ recon
                  </span>
                )}
              </div>
              <div className="fin-tx-descline">{e.description}</div>
            </div>
            <div className="mono">{e.propertyCode || '—'}</div>
            <div className="mono fin-tx-cat">{e.categoryCode}</div>
            <div className="bill-to-col">
              <span className={'fin-billto fin-billto-' + billToColor(e.billTo)}>
                {billToLabel(e.billTo)}{e.billToOverridden && '*'}
              </span>
            </div>
            <div className="amount-col mono fin-tx-amount">{formatCurrency(e.amountMinor, e.currency)}</div>
            <div>
              <span className={'fin-status fin-status-' + e.status}>{e.status.replace('_', ' ')}</span>
            </div>
            <div className="fin-tx-by">{e.enteredBy}</div>
          </div>
          );
        })}
        {filtered.length === 0 && <div className="fin-empty" style={{ padding: 32 }}>No transactions match your filters.</div>}
      </div>
    </>
  );
}

// ─────────────────────────────────── APPROVALS INBOX ───────────────────────────────────

function FinanceApprovals() {
  const pending = FIN_EXPENSES.filter((e) => e.status === 'pending_approval');
  const [selectedId, setSelectedId] = useState<string | null>(pending[0]?.id || null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'partial_proposed' | 'silent'>('all');

  const filtered = pending.filter((e) => {
    if (statusFilter === 'all') return true;
    const a = FIN_APPROVALS.find((x) => x.expenseId === e.id);
    if (statusFilter === 'pending') return a?.status === 'pending';
    if (statusFilter === 'partial_proposed') return a?.status === 'partial_proposed';
    if (statusFilter === 'silent') return a?.linkClicks === 0;
    return true;
  });

  const selected = filtered.find((e) => e.id === selectedId) || filtered[0];
  const approval = selected ? FIN_APPROVALS.find((a) => a.expenseId === selected.id) : undefined;
  const owner = selected?.propertyCode
    ? FIN_OWNERS.find((o) => o.id === FIN_PROPERTIES.find((p) => p.code === selected.propertyCode)?.ownerId)
    : undefined;

  return (
    <div className="fin-approvals-split">
      <div className="fin-approvals-list">
        <div className="fin-approvals-filter">
          {[
            { id: 'all', label: 'All' },
            { id: 'pending', label: 'Pending' },
            { id: 'partial_proposed', label: 'Counter-offered' },
            { id: 'silent', label: 'Silent (no clicks)' },
          ].map((f) => (
            <button
              key={f.id}
              className={'fin-filter-chip' + (statusFilter === f.id ? ' active' : '')}
              onClick={() => setStatusFilter(f.id as 'all' | 'pending' | 'partial_proposed' | 'silent')}
            >
              {f.label}
            </button>
          ))}
        </div>

        {filtered.map((e) => {
          const a = FIN_APPROVALS.find((x) => x.expenseId === e.id);
          const isActive = e.id === selected?.id;
          return (
            <button
              key={e.id}
              className={'fin-approval-row' + (isActive ? ' active' : '')}
              onClick={() => setSelectedId(e.id)}
            >
              <div className="fin-approval-row-top">
                <span className="mono">{e.propertyCode || '—'}</span>
                <span className="fin-approval-amt mono">{formatCurrency(e.amountMinor, e.currency)}</span>
              </div>
              <div className="fin-approval-vendor">{e.vendorName}</div>
              <div className="fin-approval-desc">{e.description}</div>
              <div className="fin-approval-row-bot">
                {e.approvalTier && (
                  <span className={'chip tier-' + tierColor(e.approvalTier)}>
                    {e.approvalTier === 'medium' ? 'Medium' : e.approvalTier === 'major' ? 'Major' : e.approvalTier}
                  </span>
                )}
                {a?.status === 'partial_proposed' && (
                  <span className="chip warn sm">counter-offer</span>
                )}
                {a && a.linkClicks === 0 && a.status === 'pending' && (
                  <span className="chip warn sm">silent</span>
                )}
                {a?.language === 'fr' && <span className="chip sm">FR</span>}
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && <div className="fin-empty" style={{ padding: 24 }}>All caught up</div>}
      </div>

      <div className="fin-approvals-detail">
        {selected ? (
          <ApprovalDetail expense={selected} approval={approval} owner={owner} />
        ) : (
          <div className="fin-empty" style={{ padding: 60, textAlign: 'center' }}>
            Select an approval to see detail
          </div>
        )}
      </div>
    </div>
  );
}

function ApprovalDetail({
  expense, approval, owner,
}: {
  expense: FinExpense;
  approval: ReturnType<typeof FIN_APPROVALS.find>;
  owner: ReturnType<typeof FIN_OWNERS.find>;
}) {
  const { openFriday } = useFinCtx();
  const property = expense.propertyCode ? FIN_PROPERTIES.find((p) => p.code === expense.propertyCode) : null;
  const cat = FIN_CATEGORIES.find((c) => c.code === expense.categoryCode);
  // Friday refund-pattern flag — keyed by reservation for demo (in real product, by guest_id)
  const guestFlag = FRIDAY_GUEST_FLAGS[expense.id === 'e9' ? 'r-2026-1192' : ''];
  return (
    <div className="fin-approval-detail">
      <div className="fin-approval-detail-head">
        <div className="fin-approval-detail-title">{expense.vendorName}</div>
        <div className="fin-approval-detail-amount">{formatCurrency(expense.amountMinor, expense.currency)}</div>
      </div>
      <div className="fin-approval-detail-meta">
        <span className="mono">{expense.categoryCode}</span> · {cat?.name}
        {property && <> · <span className="mono">{property.code}</span> · {property.name}</>}
        {expense.brzTaskId && <> · <span className="mono">{expense.brzTaskId}</span></>}
      </div>
      <p className="fin-approval-detail-desc">{expense.description}</p>

      {expense.sourceTaskId && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 10px',
            background: 'rgba(124, 58, 237, 0.08)',
            borderLeft: '3px solid var(--color-brand-accent)',
            borderRadius: 4,
            marginBottom: 10,
            fontSize: 12,
          }}
        >
          <span>📋</span>
          <span>Source: Task <span className="mono">{expense.sourceTaskId}</span></span>
          <a
            href={`/fad?m=operations&sub=all&task=${expense.sourceTaskId}`}
            className="fin-link"
            style={{ marginLeft: 'auto' }}
            onClick={(e) => {
              e.preventDefault();
              window.location.href = `/fad?m=operations&sub=all`;
            }}
          >
            View task →
          </a>
        </div>
      )}

      {guestFlag && (
        <div className={'fin-friday-flag sev-' + guestFlag.severity}>
          <span className="fin-friday-flag-tag"><IconSparkle size={10} /> Friday flag</span>
          <span>{guestFlag.text}</span>
          <button
            type="button"
            className="fin-link"
            style={{ marginLeft: 'auto' }}
            onClick={() => openFriday(`Guest refund pattern · ${expense.vendorName}`)}
          >Brief me</button>
        </div>
      )}

      <div className="fin-section">
        <div className="fin-section-title">Receipts</div>
        <div className="fin-receipt-list" style={{ justifyContent: 'flex-start' }}>
          {Array.from({ length: expense.receipts }).map((_, i) => (
            <span key={i} className="fin-receipt-pill">receipt-{i + 1}.pdf</span>
          ))}
          {expense.receipts === 0 && <span className="fin-row-sub">No receipts attached</span>}
        </div>
      </div>

      {owner && (
        <div className="fin-section">
          <div className="fin-section-title">Owner contact</div>
          <div className="fin-row-sub">{owner.name} · {owner.whatsapp} · {owner.language === 'fr' ? 'French' : 'English'}</div>
        </div>
      )}

      {approval && (
        <div className="fin-section">
          <div className="fin-section-title">WhatsApp approval status</div>
          <div className="fin-wa-status">
            <div className="fin-wa-row"><span>Sent</span><span className="mono">{approval.sentAt}</span></div>
            <div className="fin-wa-row"><span>Auto-expires</span><span className="mono">{approval.expiresAt}</span></div>
            <div className="fin-wa-row"><span>Link clicks</span><span className="mono">{approval.linkClicks}</span></div>
            <div className="fin-wa-row"><span>Status</span>
              <span className={'fin-status fin-status-' + (approval.status === 'partial_proposed' ? 'pending_approval' : 'submitted')}>
                {approval.status.replace('_', ' ')}
              </span>
            </div>
            {approval.ownerReplyExcerpt && (
              <div className="fin-wa-reply">
                <span className="fin-wa-reply-tag">Reply</span>
                <span>"{approval.ownerReplyExcerpt}"</span>
              </div>
            )}
            {approval.partialProposedMinor && (
              <div className="fin-wa-counter">
                <span className="fin-wa-counter-tag">Counter-offer</span>
                <span className="mono">{formatMUR(approval.partialProposedMinor)} (vs original {formatCurrency(expense.amountMinor, expense.currency)})</span>
              </div>
            )}
          </div>
        </div>
      )}

      <ApprovalActions expense={expense} approval={approval} />
    </div>
  );
}

function ApprovalActions({ expense, approval }: { expense: FinExpense; approval: ReturnType<typeof FIN_APPROVALS.find> }) {
  const { openConfirm } = useFinCtx();
  const partialMinor = approval?.partialProposedMinor;
  return (
    <div className="fin-approval-actions">
      <button className="btn ghost" onClick={() => openConfirm({
        title: 'Reject expense',
        body: (
          <>
            <p>Rejects {formatCurrency(expense.amountMinor, expense.currency)} for {expense.vendorName}.</p>
            <p style={{ marginTop: 6 }}>Field worker is notified. Receipt stays attached for audit.</p>
          </>
        ),
        primaryLabel: 'Reject',
        primaryTone: 'danger',
      })}>Reject</button>
      {partialMinor && (
        <button className="btn ghost" onClick={() => openConfirm({
          title: `Accept partial — ${formatMUR(partialMinor)}`,
          body: <p>Approves the owner's counter-offer of {formatMUR(partialMinor)} (vs original {formatCurrency(expense.amountMinor, expense.currency)}). Adjusts the expense amount and posts.</p>,
          primaryLabel: 'Accept counter-offer',
        })}>Accept partial</button>
      )}
      <button className="btn primary" onClick={() => openConfirm({
        title: `Approve ${formatCurrency(expense.amountMinor, expense.currency)}`,
        body: <p>Posts the expense to <strong>{expense.propertyCode || 'FR-internal'}</strong> for the current period. Audit log records explicit owner approval.</p>,
        primaryLabel: 'Approve',
      })}>Approve</button>
    </div>
  );
}

// ─────────────────────────────────── OWNER STATEMENTS ───────────────────────────────────

function statementExport(label: string, body: string) {
  return { title: label, body: <p>{body}</p>, primaryLabel: label.split(' ')[0] };
}

function FinanceOwnerStatements() {
  const { openConfirm, openFriday } = useFinCtx();
  const [selectedCode, setSelectedCode] = useState<string>(FIN_OWNER_STATEMENTS[0].propertyCode);
  const selected = FIN_OWNER_STATEMENTS.find((s) => s.propertyCode === selectedCode) || FIN_OWNER_STATEMENTS[0];
  const owner = FIN_OWNERS.find((o) => o.id === selected.ownerId);
  const property = FIN_PROPERTIES.find((p) => p.code === selected.propertyCode);

  return (
    <div className="fin-statements-split">
      <div className="fin-statements-list">
        <div className="fin-section-title" style={{ padding: '10px 14px 6px' }}>
          Properties · {CURRENT_PERIOD.label}
        </div>
        {FIN_OWNER_STATEMENTS.map((s) => {
          const isActive = s.propertyCode === selectedCode;
          const prop = FIN_PROPERTIES.find((p) => p.code === s.propertyCode);
          return (
            <button
              key={s.propertyCode}
              className={'fin-statement-row' + (isActive ? ' active' : '')}
              onClick={() => setSelectedCode(s.propertyCode)}
            >
              <div className="fin-statement-row-top">
                <span className="mono">{s.propertyCode}</span>
                <span className={s.guestyCheckMatches ? 'fin-tick green' : 'fin-tick warn'}>
                  {s.guestyCheckMatches ? '✓' : '∆'}
                </span>
              </div>
              <div className="fin-statement-row-name">{prop?.name}</div>
              <div className="fin-statement-row-amt mono">
                €{(s.ownerRevenueEUR).toLocaleString()}
              </div>
            </button>
          );
        })}
      </div>

      <div className="fin-statements-detail">
        <div className="fin-statement-head">
          <div>
            <h3 className="fin-statement-h3">{property?.name} · <span className="mono">{property?.code}</span></h3>
            <div className="fin-row-sub">Owner: {owner?.name} · {CURRENT_PERIOD.label}</div>
          </div>
          <div className="fin-statement-actions">
            <button
              className="btn ghost sm fin-ask-friday-btn"
              onClick={() => openFriday(`Owner statement · ${property?.code}`)}
            ><IconSparkle size={10} /> Ask Friday</button>
            <CleaningFeeToggle propertyCode={selected.propertyCode} />
            <button className="btn ghost sm" onClick={() => openConfirm(statementExport(
              'Print statement',
              `Sends the ${property?.code} · ${CURRENT_PERIOD.label} waterfall to the system print dialog.`
            ))}>Print</button>
            <button className="btn ghost sm" onClick={() => openConfirm(statementExport(
              'Download PDF',
              `Generates a branded PDF of the ${property?.code} statement (waterfall + WAR rate footer + Guesty cross-check). File name pattern: statement-${property?.code}-${CURRENT_PERIOD.label.replace(' ', '-')}.pdf`
            ))}>Download PDF</button>
            <button className="btn ghost sm" onClick={() => openConfirm(statementExport(
              'Export CSV',
              `Flat CSV export of every line in the waterfall plus underlying expense + reservation IDs. For accountant review.`
            ))}>Export CSV</button>
          </div>
        </div>

        {!selected.guestyCheckMatches && (
          <GuestyDivergence statement={selected} />
        )}

        <Waterfall statement={selected} />

        <div className="fin-fx-foot">
          × WAR rate (1 EUR = Rs {CURRENT_PERIOD.warRateEurMur?.toFixed(2)})
          <span className="mono fin-fx-result">
            = €{selected.ownerRevenueEUR.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}

function CleaningFeeToggle({ propertyCode }: { propertyCode: string }) {
  const { openConfirm } = useFinCtx();
  // Per-property treatment, persisted to property settings in real product. Default = net (vision-spec).
  const [treatment, setTreatment] = useState<'net' | 'gross'>('net');
  const onSwitch = (next: 'net' | 'gross') => {
    if (next === treatment) return;
    openConfirm({
      title: `Switch ${propertyCode} cleaning fee → ${next === 'gross' ? 'gross (revenue)' : 'net (pass-through)'}`,
      body: (
        <>
          <p>
            <strong>{next === 'gross' ? 'Gross' : 'Net'}</strong>{' '}
            {next === 'gross'
              ? 'recognises the cleaning fee as FR revenue, with housekeeping costs as expenses. Triggers 15% VAT obligation on the fee.'
              : 'treats the fee as pass-through, funding hospitality directly. No VAT exposure on FR side. Vision-spec default.'}
          </p>
          <p style={{ marginTop: 8 }}>Affects future-period statements for {propertyCode} only. Locked periods unchanged. Audit log entry written.</p>
        </>
      ),
      primaryLabel: 'Switch treatment',
      onConfirm: () => setTreatment(next),
    });
  };
  return (
    <div className="fin-cf-toggle" title="Cleaning fee accounting treatment per T&C 1.2">
      <span className="fin-cf-toggle-label">Cleaning fee:</span>
      <button
        className={'fin-cf-toggle-btn' + (treatment === 'net' ? ' active' : '')}
        onClick={() => onSwitch('net')}
      >Net</button>
      <button
        className={'fin-cf-toggle-btn' + (treatment === 'gross' ? ' active' : '')}
        onClick={() => onSwitch('gross')}
      >Gross</button>
    </div>
  );
}

function GuestyDivergence({ statement }: { statement: FinOwnerStatement }) {
  const { openConfirm } = useFinCtx();
  const onAction = (kind: 'guesty' | 'fad' | 'investigate') => () =>
    openConfirm({
      title:
        kind === 'guesty' ? 'Accept Guesty figure' :
        kind === 'fad' ? 'Accept FAD figure' :
        'Mark for investigation',
      body: (
        <>
          <p><strong>{statement.propertyCode}</strong> · diff Rs {statement.guestyDiffMinor?.toLocaleString()}</p>
          <p style={{ marginTop: 6 }}>
            {kind === 'guesty' && 'Writes override to FAD record. Required reason captured. Logged to audit_log + property_period_reconciliations.'}
            {kind === 'fad' && 'Flags Guesty for manual update. Required reason captured. Mary copies the corrected number into Guesty in v1 (auto-push Phase 3).'}
            {kind === 'investigate' && 'Defers the decision. Item moves to flagged-queue, blocks period close until resolved.'}
          </p>
        </>
      ),
      primaryLabel:
        kind === 'guesty' ? 'Accept Guesty' :
        kind === 'fad' ? 'Accept FAD' :
        'Defer to flagged queue',
    });
  return (
    <div className="fin-guesty-warn">
      <strong>∆</strong> Guesty divergence detected · diff Rs {statement.guestyDiffMinor?.toLocaleString()}
      <div style={{ marginTop: 6 }}>
        <button className="btn sm" onClick={onAction('guesty')}>Accept Guesty</button>{' '}
        <button className="btn sm" onClick={onAction('fad')}>Accept FAD</button>{' '}
        <button className="btn ghost sm" onClick={onAction('investigate')}>Mark for investigation</button>
      </div>
    </div>
  );
}

function Waterfall({ statement }: { statement: FinOwnerStatement }) {
  return (
    <div className="fin-waterfall">
      {statement.steps.map((s, i) => {
        const isNeg = s.amountMinor < 0;
        return (
          <div
            key={i}
            className={
              'fin-waterfall-row' +
              (s.isSubtotal ? ' subtotal' : '') +
              (s.isDeduction ? ' deduction' : '')
            }
          >
            <div className="fin-waterfall-label">
              <span>{s.label}</span>
              {s.detail && <span className="fin-waterfall-detail">{s.detail}</span>}
            </div>
            <div className={'fin-waterfall-amt mono' + (isNeg ? ' neg' : '')}>
              {isNeg ? '−' : ''}{formatMUR(Math.abs(s.amountMinor))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────── TOURIST TAX ───────────────────────────────────

function FinanceTouristTax() {
  const { openConfirm } = useFinCtx();
  const ytd = useMemo(() => {
    return FIN_TOURIST_TAX.reduce(
      (acc, m) => ({
        collected: acc.collected + m.collectedEur,
        correct: acc.correct + m.correctEur,
        refunded: acc.refunded + m.refundedEur,
        netOwed: acc.netOwed + m.netOwedEur,
      }),
      { collected: 0, correct: 0, refunded: 0, netOwed: 0 },
    );
  }, []);

  const overcharges = FIN_TOURIST_OVERCHARGES.filter((r) => r.overchargeEur > 0);
  const topCorrections = overcharges.slice(0, 5);

  return (
    <>
      {/* Compliance hero — vision-spec liability + over-refund framing */}
      <div className="fin-tt-hero">
        <div className="fin-tt-hero-block fin-tt-hero-coral">
          <div className="fin-tt-hero-label">Unremitted to MRA</div>
          <div className="fin-tt-hero-amount">€ {FIN_TOURIST_TOTALS.unremittedEur.toLocaleString()}</div>
          <div className="fin-tt-hero-sub">
            Oct 2025 → {CURRENT_PERIOD.label} · {FIN_TOURIST_TOTALS.unfiledMonths} months never filed
          </div>
          <div className="fin-tt-hero-actions">
            <button className="btn primary sm" onClick={() => openConfirm({
              title: 'Generate MRA registration packet',
              body: (
                <>
                  <p>Compiles the registration documentation for MRA covering Oct 2025 → present:</p>
                  <ul style={{ paddingLeft: 18, marginTop: 4 }}>
                    <li>FR's TAN + VAT number cover sheet</li>
                    <li>Per-month tax-collected vs tax-correct ledger ({FIN_TOURIST_TOTALS.unfiledMonths} months)</li>
                    <li>Per-reservation eligibility audit</li>
                    <li>Back-payment proposal — €{FIN_TOURIST_TOTALS.unremittedEur.toLocaleString()} owed to MRA</li>
                  </ul>
                  <p style={{ marginTop: 8 }}>Output: PDF + CSV pack downloadable from this surface.</p>
                </>
              ),
              primaryLabel: 'Generate packet',
            })}>Generate MRA registration packet</button>
          </div>
        </div>
        <div className="fin-tt-hero-block fin-tt-hero-amber">
          <div className="fin-tt-hero-label">Owner over-refund due</div>
          <div className="fin-tt-hero-amount">€ {FIN_TOURIST_TOTALS.ownerOverRefundDueEur.toLocaleString()}</div>
          <div className="fin-tt-hero-sub">
            {FIN_TOURIST_TOTALS.ownerOverRefundReservationsCount} reservations · MU guests &amp; children wrongly charged
          </div>
          <div className="fin-tt-hero-actions">
            <button className="btn sm" onClick={() => openConfirm({
              title: `Process ${FIN_TOURIST_TOTALS.ownerOverRefundReservationsCount} owner refunds`,
              body: (
                <p>Queues a credit on each affected owner's next statement. Total €{FIN_TOURIST_TOTALS.ownerOverRefundDueEur.toLocaleString()}.
                Mary copies these into Guesty in v1; auto-push lands Phase 3.</p>
              ),
              primaryLabel: 'Queue all refunds',
            })}>
              Process owner refunds ({FIN_TOURIST_TOTALS.ownerOverRefundReservationsCount})
            </button>
          </div>
        </div>
      </div>

      {/* KPI strip — secondary */}
      <div className="kpi-grid" style={{ marginTop: 20 }}>
        <div className="kpi">
          <div className="kpi-label">Collected (Guesty)</div>
          <div className="kpi-value">€ {ytd.collected.toLocaleString()}</div>
          <div className="kpi-sub">From owners</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Should-be-collected</div>
          <div className="kpi-value">€ {ytd.correct.toLocaleString()}</div>
          <div className="kpi-sub">Per real policy</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Refunded so far</div>
          <div className="kpi-value">€ {ytd.refunded.toLocaleString()}</div>
          <div className="kpi-sub">Already returned</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Net owed to MRA</div>
          <div className="kpi-value">€ {ytd.netOwed.toLocaleString()}</div>
          <div className="kpi-sub">{FIN_TOURIST_TAX.filter((m) => !m.filed).length} unfiled months</div>
        </div>
      </div>

      {/* Top corrections list — surfaced from overcharges, vision-style */}
      <div className="card fin-card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Top corrections</div>
            <div className="card-subtitle">Owner refunds queued from over-charge detection</div>
          </div>
          <button
            className="btn ghost sm"
            onClick={() => openConfirm({
              title: `All ${overcharges.length} overcharge corrections`,
              body: <p>Opens the full overcharge list (filterable by reason / property / refund status). Bulk actions: queue all unrefunded for refund, mark refunded after Guesty entry.</p>,
              primaryLabel: 'View all',
            })}
          >All {overcharges.length} <IconArrow size={10} /></button>
        </div>
        <div className="fin-list">
          {topCorrections.map((r) => (
            <div key={r.reservationId} className="fin-row-item">
              <div className="fin-row-main">
                <div className="fin-row-title">
                  <span className="mono">{r.reservationId}</span> · {r.guestName}
                </div>
                <div className="fin-row-sub">
                  <span className="mono">{r.propertyCode}</span> · {r.nights}n · {r.numAdults}A
                  {r.numChildren ? ` + ${r.numChildren}C` : ''} ·{' '}
                  {r.reason === 'mauritian_resident'
                    ? 'MU resident'
                    : r.reason === 'children_excluded'
                    ? 'children miscount'
                    : 'MU + children'}{' '}
                  · €{r.chargedEur} charged
                </div>
              </div>
              <div className="fin-row-meta">
                <div className="fin-row-amount" style={{ color: 'var(--color-text-warning)' }}>
                  refund €{r.overchargeEur}
                </div>
                {r.refundIssued ? (
                  <span className="chip green sm">refunded</span>
                ) : (
                  <button className="btn sm" onClick={() => openConfirm({
                    title: `Refund owner — €${r.overchargeEur}`,
                    body: (
                      <>
                        <p><strong>Reservation:</strong> {r.guestName} · {r.propertyCode}</p>
                        <p>Queues a €{r.overchargeEur} credit to the property owner's next statement.
                        Reason: <em>{r.reason === 'mauritian_resident' ? 'MU resident' : r.reason === 'children_excluded' ? 'children miscount' : 'MU + children'}</em>.</p>
                      </>
                    ),
                    primaryLabel: 'Queue refund',
                  })}>Refund owner</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="fin-row" style={{ marginTop: 16 }}>
        <div className="card fin-card">
          <div className="card-header">
            <div className="card-title">Filing — {CURRENT_PERIOD.label}</div>
            <span className="chip warn sm">unfiled</span>
          </div>
          <div style={{ padding: '14px 16px' }}>
            <div className="fin-tt-summary">
              <div><div className="fin-row-sub">Net owed</div><div className="fin-row-amount">€ {FIN_TOURIST_TAX[0].netOwedEur.toLocaleString()}</div></div>
              <div><div className="fin-row-sub">Refunded this period</div><div className="fin-row-amount">€ {FIN_TOURIST_TAX[0].refundedEur.toLocaleString()}</div></div>
              {/* @demo:data — Tag: PROD-DATA-35 — see frontend/DEMO_CRUFT.md */}
              <div><div className="fin-row-sub">Reservations included</div><div className="fin-row-amount">14</div></div>
            </div>
            <div className="fin-capture-actions" style={{ marginTop: 14, justifyContent: 'flex-start' }}>
              <button className="btn ghost sm" onClick={() => openConfirm({
                title: `MRA submission CSV — ${CURRENT_PERIOD.label}`,
                body: <p>Generates an MRA-spec CSV of €{FIN_TOURIST_TAX[0].netOwedEur.toLocaleString()} across 14 reservations. Manual remittance in v1; auto-push to MRA portal lands Phase 2.</p>,
                primaryLabel: 'Download CSV',
              })}>Generate MRA submission CSV</button>
              <button className="btn primary sm" onClick={() => openConfirm({
                title: 'Mark April 2026 as filed',
                body: <p>Locks the period's tourist tax row. Requires admin reason for any subsequent change. Triggers audit log entry.</p>,
                primaryLabel: 'Mark filed',
              })}>Mark as filed</button>
            </div>
          </div>
        </div>

        <div className="card fin-card">
          <div className="card-header">
            <div className="card-title">Exclusion rules</div>
          </div>
          <div style={{ padding: '12px 16px 16px', fontSize: 12, lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
            <p style={{ margin: '0 0 6px' }}>Excluded from €3/guest/night charge:</p>
            <ul style={{ paddingLeft: 18, margin: 0 }}>
              <li><strong>Mauritian residents</strong> — based on <span className="mono">guest_country='MU'</span></li>
              <li><strong>Children</strong> — based on <span className="mono">num_children &gt; 0</span></li>
            </ul>
            <p style={{ marginTop: 10, color: 'var(--color-text-tertiary)' }}>Tax effective from October 2025. Historical cleanup back-fill captured in MRA registration packet.</p>
          </div>
        </div>
      </div>

      <div className="card fin-card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <div className="card-title">Monthly roll-up</div>
        </div>
        <div className="fin-tt-table">
          <div className="fin-tt-row fin-tt-head">
            <div>Month</div>
            <div className="amount-col">Collected</div>
            <div className="amount-col">Correct</div>
            <div className="amount-col">Refunded</div>
            <div className="amount-col">Net owed</div>
            <div>Status</div>
          </div>
          {FIN_TOURIST_TAX.map((m) => (
            <div key={m.monthLabel} className="fin-tt-row">
              <div>{m.monthLabel}</div>
              <div className="amount-col mono">€ {m.collectedEur.toLocaleString()}</div>
              <div className="amount-col mono">€ {m.correctEur.toLocaleString()}</div>
              <div className="amount-col mono">€ {m.refundedEur.toLocaleString()}</div>
              <div className="amount-col mono">€ {m.netOwedEur.toLocaleString()}</div>
              <div>
                <span className={'fin-status ' + (m.filed ? 'fin-status-posted' : 'fin-status-pending_approval')}>
                  {m.filed ? 'filed' : 'unfiled'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card fin-card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Overcharge detection</div>
            <div className="card-subtitle">Reservations where Guesty wrongly charged Mauritian guests / children</div>
          </div>
        </div>
        <div className="fin-tt-table">
          <div className="fin-tt-row fin-tt-head fin-overcharge-row">
            <div>Reservation</div>
            <div>Guest · property</div>
            <div>Stay</div>
            <div>Reason</div>
            <div className="amount-col">Charged</div>
            <div className="amount-col">Correct</div>
            <div className="amount-col">Refund</div>
            <div></div>
          </div>
          {overcharges.map((r) => (
            <div key={r.reservationId} className="fin-tt-row fin-overcharge-row">
              <div className="mono fin-tx-date">{r.reservationId}</div>
              <div>
                <div className="fin-row-title">{r.guestName}</div>
                <div className="fin-row-sub"><span className="mono">{r.propertyCode}</span> · {r.guestCountry}</div>
              </div>
              <div className="fin-row-sub">{r.checkin} · {r.nights}n · {r.numAdults}A {r.numChildren ? `+ ${r.numChildren}C` : ''}</div>
              <div>
                <span className="chip warn sm">
                  {r.reason === 'mauritian_resident' ? 'MU resident' : r.reason === 'children_excluded' ? 'children' : 'both'}
                </span>
              </div>
              <div className="amount-col mono">€ {r.chargedEur}</div>
              <div className="amount-col mono">€ {r.correctEur}</div>
              <div className="amount-col mono fin-tx-amount" style={{ color: 'var(--color-text-warning)' }}>
                € {r.overchargeEur}
              </div>
              <div>
                {r.refundIssued ? (
                  <span className="chip green sm">refunded</span>
                ) : (
                  <button className="btn sm">Refund owner</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────── P&L DASHBOARD ───────────────────────────────────

type PnLEntity = 'FR' | 'FI' | 'S' | 'all';

interface PnLLine { label: string; period: number; ytd: number; vsPrev?: string; section?: 'revenue' | 'passthrough' | 'opex' | 'subtotal' | 'total'; sub?: boolean; }

// @demo:data — Tag: PROD-DATA-16 — see frontend/DEMO_CRUFT.md
// Inline P&L data with hardcoded MUR figures across FR/FI/S/all entities.
// Replace with: GET /api/finance/pnl?entity=:entity&period=:period.
const PNL_BY_ENTITY: Record<PnLEntity, PnLLine[]> = {
  FR: [
    { label: 'Revenue', period: 0, ytd: 0, section: 'revenue' },
    { label: '  PMC Commission (after VAT)', period: 412_600, ytd: 1_547_200, vsPrev: '+8%', sub: true },
    { label: '  Linen Fee (June onwards)', period: 0, ytd: 0, vsPrev: '—', sub: true },
    { label: '  Direct booking 13% fee', period: 23_500, ytd: 88_200, vsPrev: '—', sub: true },
    { label: 'Total revenue', period: 436_100, ytd: 1_635_400, vsPrev: '+8%', section: 'subtotal' },
    { label: 'Cleaning Fee pass-through (net)', period: 0, ytd: 0, section: 'passthrough' },
    { label: '  Cleaning Fee inflow', period: 187_400, ytd: 692_800, vsPrev: '+12%', sub: true },
    { label: '  Housekeeping (Oracle, etc.)', period: -98_400, ytd: -366_100, vsPrev: '+5%', sub: true },
    { label: '  SRL & welcome packs', period: -48_200, ytd: -178_400, vsPrev: '+11%', sub: true },
    { label: 'Pass-through net', period: 40_800, ytd: 148_300, section: 'subtotal' },
    { label: 'Operating costs', period: 0, ytd: 0, section: 'opex' },
    { label: '  Team logistics & fuel', period: -32_100, ytd: -124_800, vsPrev: '+3%', sub: true },
    { label: '  Office & tools', period: -18_700, ytd: -67_200, vsPrev: '−2%', sub: true },
    { label: '  Subscriptions & software', period: -42_800, ytd: -168_200, vsPrev: '+1%', sub: true },
    { label: '  Office rent (director apt)', period: -25_000, ytd: -100_000, vsPrev: '—', sub: true },
    { label: '  Professional services', period: -15_000, ytd: -52_000, vsPrev: '—', sub: true },
    { label: 'Total operating costs', period: -133_600, ytd: -512_200, vsPrev: '+1%', section: 'subtotal' },
    { label: 'Operating margin', period: 343_300, ytd: 1_271_500, vsPrev: '+11%', section: 'total' },
  ],
  FI: [
    { label: 'Revenue', period: 0, ytd: 0, section: 'revenue' },
    { label: '  Interior project fees', period: 0, ytd: 0, vsPrev: '—', sub: true },
    { label: 'Total revenue', period: 0, ytd: 0, section: 'subtotal' },
    { label: 'Operating costs', period: 0, ytd: 0, section: 'opex' },
    { label: '  Vendor pass-through', period: 0, ytd: 0, vsPrev: '—', sub: true },
    { label: 'Operating margin', period: 0, ytd: 0, section: 'total' },
  ],
  S: [
    { label: 'Revenue', period: 0, ytd: 0, section: 'revenue' },
    { label: '  Syndic fees', period: 8_200, ytd: 28_700, vsPrev: '—', sub: true },
    { label: 'Total revenue', period: 8_200, ytd: 28_700, section: 'subtotal' },
    { label: 'Operating costs', period: 0, ytd: 0, section: 'opex' },
    { label: '  Vendor coordination', period: -1_500, ytd: -5_200, vsPrev: '—', sub: true },
    { label: 'Operating margin', period: 6_700, ytd: 23_500, section: 'total' },
  ],
  all: [
    { label: 'Revenue', period: 0, ytd: 0, section: 'revenue' },
    { label: '  PMC Commission', period: 412_600, ytd: 1_547_200, vsPrev: '+8%', sub: true },
    { label: '  Direct booking 13% fee', period: 23_500, ytd: 88_200, vsPrev: '—', sub: true },
    { label: '  Syndic fees', period: 8_200, ytd: 28_700, vsPrev: '—', sub: true },
    { label: 'Total revenue', period: 444_300, ytd: 1_664_100, vsPrev: '+8%', section: 'subtotal' },
    { label: 'Pass-through net', period: 40_800, ytd: 148_300, section: 'subtotal' },
    { label: 'Operating costs', period: -135_100, ytd: -517_400, vsPrev: '+1%', section: 'subtotal' },
    { label: 'Operating margin', period: 350_000, ytd: 1_295_000, vsPrev: '+11%', section: 'total' },
  ],
};

function FinancePnL() {
  const { openConfirm, openFriday } = useFinCtx();
  const [entity, setEntity] = useState<PnLEntity>('FR');
  const lines = PNL_BY_ENTITY[entity];
  return (
    <>
      <div className="fin-pnl-tabs">
        {(['FR', 'FI', 'S', 'all'] as PnLEntity[]).map((e) => (
          <button
            key={e}
            className={'fin-pnl-tab' + (entity === e ? ' active' : '')}
            onClick={() => setEntity(e)}
          >
            {e === 'all' ? 'All entities' : e}
          </button>
        ))}
      </div>

      <div className="card fin-card">
        <div className="card-header">
          <div>
            <div className="card-title">{entity === 'all' ? 'Consolidated' : `${entity} only`} · {CURRENT_PERIOD.label}</div>
            <div className="card-subtitle">Period · YTD · vs prior month</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="btn ghost sm fin-ask-friday-btn"
              onClick={() => openFriday(`P&L · ${entity === 'all' ? 'consolidated' : entity} · ${CURRENT_PERIOD.label}`)}
            ><IconSparkle size={10} /> Ask Friday</button>
            <button className="btn ghost sm" onClick={() => openConfirm({
              title: `Export ${entity === 'all' ? 'consolidated' : entity} P&L · CSV`,
              body: <p>Per-line CSV with prior-period comparison, ready to paste into the bank-financing pack or your accountant's working sheet.</p>,
              primaryLabel: 'Download CSV',
            })}>Export CSV</button>
            <button className="btn ghost sm" onClick={() => openConfirm({
              title: 'Compare period',
              body: <p>Pick another closed period to view side-by-side. Variance % auto-computed per line.</p>,
              primaryLabel: 'Pick period',
            })}>Compare period</button>
          </div>
        </div>

        <div className="fin-pnl-table">
          <div className="fin-pnl-row fin-pnl-head">
            <div>Line</div>
            <div className="amount-col">{CURRENT_PERIOD.label.split(' ')[0]}</div>
            <div className="amount-col">YTD</div>
            <div className="amount-col">vs prior</div>
          </div>
          {lines.map((l, i) => {
            const isSection = l.section === 'revenue' || l.section === 'passthrough' || l.section === 'opex';
            const isSubtotal = l.section === 'subtotal';
            const isTotal = l.section === 'total';
            return (
              <div
                key={i}
                className={
                  'fin-pnl-row' +
                  (isSection ? ' fin-pnl-section' : '') +
                  (isSubtotal ? ' fin-pnl-subtotal' : '') +
                  (isTotal ? ' fin-pnl-total' : '') +
                  (l.sub ? ' fin-pnl-sub' : '')
                }
              >
                <div>{l.label}</div>
                <div className="amount-col mono">
                  {l.period === 0 && isSection ? '' : l.period < 0 ? '−' + formatMUR(Math.abs(l.period) * 100) : l.period > 0 ? formatMUR(l.period * 100) : ''}
                </div>
                <div className="amount-col mono">
                  {l.ytd === 0 && isSection ? '' : l.ytd < 0 ? '−' + formatMUR(Math.abs(l.ytd) * 100) : l.ytd > 0 ? formatMUR(l.ytd * 100) : ''}
                </div>
                <div className="amount-col mono fin-pnl-vsprev">{l.vsPrev || ''}</div>
              </div>
            );
          })}
        </div>

        <div className="fin-pnl-foot">
          Cleaning Fee shown as net pass-through per current treatment. Toggle to gross would surface €187k as revenue line and 15% VAT obligation.
        </div>
      </div>

      {/* Phase 2 callout */}
      <div className="fin-pnl-phase2">
        <div className="fin-pnl-phase2-label">Phase 2</div>
        <div>
          <strong>QuickBooks Online sync</strong> — nightly journal-entry push, year-end statutory account export, VAT/TDS tracking.
        </div>
        <button className="btn ghost sm" onClick={() => openConfirm({
          title: 'Phase 2 · QuickBooks Online sync',
          body: (
            <>
              <p>Phase 2 ships nightly journal-entry push, year-end statutory exports, and VAT/TDS tracking through the QBO mapping in Settings → Integrations.</p>
              <p style={{ marginTop: 6 }}>Target: end of June 2026 · paired with bank-financing close.</p>
            </>
          ),
          primaryLabel: 'View roadmap',
        })}>Roadmap</button>
      </div>
    </>
  );
}

// ─────────────────────────────────── FLOAT LEDGER ───────────────────────────────────

function FinanceFloatLedger() {
  const { openConfirm } = useFinCtx();
  const [selectedAcct, setSelectedAcct] = useState<string>(FIN_FLOAT_ACCOUNTS[0].accountId);
  const account = FIN_FLOAT_ACCOUNTS.find((a) => a.accountId === selectedAcct) || FIN_FLOAT_ACCOUNTS[0];
  const accountMeta = FIN_ACCOUNTS.find((a) => a.id === account.accountId);

  const variancePct = account.targetFloatMinor
    ? Math.round(((account.currentBalanceMinor - account.targetFloatMinor) / account.targetFloatMinor) * 100)
    : 0;
  const lowOnFloat = account.currentBalanceMinor < account.targetFloatMinor * 0.4;

  return (
    <>
      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Active float accounts</div>
          <div className="kpi-value">{FIN_FLOAT_ACCOUNTS.length}</div>
          <div className="kpi-sub">field PM cards</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Float deployed</div>
          <div className="kpi-value">
            {formatMUR(FIN_FLOAT_ACCOUNTS.reduce((s, a) => s + a.currentBalanceMinor, 0))}
          </div>
          <div className="kpi-sub">across all cards now</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Spent this period</div>
          <div className="kpi-value">
            {formatMUR(FIN_FLOAT_ACCOUNTS.reduce((s, a) => s + a.monthSpendMinor, 0))}
          </div>
          <div className="kpi-sub">via float cards</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Topped up this period</div>
          <div className="kpi-value">
            {formatMUR(FIN_FLOAT_ACCOUNTS.reduce((s, a) => s + a.monthTopupMinor, 0))}
          </div>
          <div className="kpi-sub">from Main PM</div>
        </div>
      </div>

      <div className="fin-float-split">
        <div className="fin-float-list">
          <div className="fin-section-title" style={{ padding: '12px 14px 8px' }}>
            Field-PM accounts
          </div>
          {FIN_FLOAT_ACCOUNTS.map((a) => {
            const meta = FIN_ACCOUNTS.find((m) => m.id === a.accountId);
            const isLow = a.currentBalanceMinor < a.targetFloatMinor * 0.4;
            const isActive = a.accountId === selectedAcct;
            return (
              <button
                key={a.accountId}
                className={'fin-float-row' + (isActive ? ' active' : '')}
                onClick={() => setSelectedAcct(a.accountId)}
              >
                <div className="fin-float-row-head">
                  <span>{a.cardHolder}</span>
                  {isLow && <span className="chip warn sm">low</span>}
                </div>
                <div className="fin-float-row-name">{meta?.name}</div>
                <div className="fin-float-row-bal mono">
                  {formatMUR(a.currentBalanceMinor)} <span className="fin-row-sub">/ {formatMUR(a.targetFloatMinor)} target</span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="fin-float-detail">
          <div className="fin-float-head">
            <div>
              <h3 className="fin-statement-h3">{account.cardHolder} · {accountMeta?.name}</h3>
              <div className="fin-row-sub">
                Target float {formatMUR(account.targetFloatMinor)} ·{' '}
                <span className={lowOnFloat ? 'fin-variance-neg' : variancePct < 0 ? 'fin-variance-neg' : 'fin-variance-pos'}>
                  {variancePct >= 0 ? '+' : ''}{variancePct}% vs target
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="btn ghost sm"
                onClick={() =>
                  openConfirm({
                    title: 'Top up float',
                    body: (
                      <p>
                        Transfer from Main PM (...860) to {accountMeta?.name}. Current balance{' '}
                        {formatMUR(account.currentBalanceMinor)} vs target {formatMUR(account.targetFloatMinor)}.
                        Suggested top-up: {formatMUR(Math.max(account.targetFloatMinor - account.currentBalanceMinor, 0))}.
                      </p>
                    ),
                    primaryLabel: 'Initiate IB transfer',
                  })
                }
              >
                Top up
              </button>
              <button
                className="btn ghost sm"
                onClick={() =>
                  openConfirm({
                    title: `Export ledger · ${account.cardHolder}`,
                    body: (
                      <p>
                        CSV export of every entry on {accountMeta?.name} · current period. Includes opening balance, all top-ups, all expenses, running balance.
                      </p>
                    ),
                    primaryLabel: 'Download CSV',
                  })
                }
              >Export ledger</button>
            </div>
          </div>

          {lowOnFloat && (
            <div className="fin-float-alert">
              ⚠ Below 40% of target float — {account.cardHolder} should be topped up before next period.
            </div>
          )}

          <div className="fin-float-stats">
            <div>
              <div className="fin-row-sub">Period spend</div>
              <div className="fin-row-amount">{formatMUR(account.monthSpendMinor)}</div>
            </div>
            <div>
              <div className="fin-row-sub">Period top-ups</div>
              <div className="fin-row-amount">{formatMUR(account.monthTopupMinor)}</div>
            </div>
            <div>
              <div className="fin-row-sub">Net flow</div>
              <div className="fin-row-amount">
                {formatMUR(account.monthTopupMinor - account.monthSpendMinor)}
              </div>
            </div>
            <div>
              <div className="fin-row-sub">Last entry</div>
              <div className="fin-row-amount mono">{account.entries[account.entries.length - 1]?.date}</div>
            </div>
          </div>

          <div className="fin-float-table">
            <div className="fin-float-entry-row fin-float-entry-head">
              <div>Date</div>
              <div>Type</div>
              <div>Description</div>
              <div className="amount-col">Amount</div>
              <div className="amount-col">Balance</div>
            </div>
            {[...account.entries].reverse().map((e) => (
              <div key={e.id} className="fin-float-entry-row">
                <div className="mono fin-row-sub">{e.date}</div>
                <div>
                  <span
                    className={
                      'chip sm ' +
                      (e.type === 'topup' ? 'green' : e.type === 'expense' ? 'warn' : '')
                    }
                  >
                    {e.type === 'topup' ? '↓ top-up' : e.type === 'expense' ? '↑ expense' : e.type === 'opening' ? 'opening' : e.type}
                  </span>
                </div>
                <div>{e.description}</div>
                <div className={'amount-col mono ' + (e.amountMinor < 0 ? 'fin-variance-neg' : e.amountMinor > 0 ? 'fin-variance-pos' : '')}>
                  {e.amountMinor === 0 ? '—' : (e.amountMinor > 0 ? '+' : '') + formatMUR(e.amountMinor)}
                </div>
                <div className="amount-col mono">{formatMUR(e.runningBalanceMinor)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────── REPORTS ───────────────────────────────────

function FinanceReports() {
  const { openConfirm } = useFinCtx();

  return (
    <>
      <div className="fin-reports-banner">
        <div>
          <div className="fin-reports-banner-title">Bank financing readiness</div>
          <div className="fin-reports-banner-sub">
            Generated reports formatted for Mauritian commercial bank lending desks. Target close: end of June 2026.
          </div>
        </div>
        <button
          className="btn primary sm"
          onClick={() =>
            openConfirm({
              title: 'Export bank-financing pack',
              body: (
                <p>
                  Generates a single zipped PDF + XLSX bundle covering P&amp;L TTM, cashflow, balance sheet, and AR aging. Branded
                  cover letter pre-filled with FR's TAN + VAT number.
                </p>
              ),
              primaryLabel: 'Generate bundle',
            })
          }
        >
          Export bundle
        </button>
      </div>

      <div className="fin-reports-grid">
        {FIN_REPORTS.map((r) => (
          <div key={r.id} className="card fin-report-card">
            <div className="fin-report-card-head">
              <div>
                <div className="fin-report-card-title">{r.label}</div>
                <div className="fin-report-card-format mono">{r.format}</div>
              </div>
              {r.lastGenerated ? (
                <span className="chip green sm">last {r.lastGenerated}</span>
              ) : (
                <span className="chip sm">never generated</span>
              )}
            </div>
            <p className="fin-report-card-desc">{r.description}</p>
            {r.metric && (
              <div className="fin-report-card-metric">
                <div className="fin-row-sub">{r.metric.label}</div>
                <div className="fin-row-amount">{r.metric.value}</div>
              </div>
            )}
            <div className="fin-report-card-actions">
              <button
                className="btn ghost sm"
                onClick={() =>
                  openConfirm({
                    title: `Generate ${r.label}`,
                    body: (
                      <p>
                        Compiles {r.label} ({r.format}) from FR's books. Output downloadable + auto-archived to{' '}
                        <span className="mono">/finance/exports/</span>.
                      </p>
                    ),
                    primaryLabel: 'Generate',
                  })
                }
              >
                Generate
              </button>
              {r.lastGenerated && (
                <button className="btn ghost sm" onClick={() => openConfirm({
                  title: `Download ${r.label} · ${r.lastGenerated}`,
                  body: <p>Re-downloads the previously generated {r.format} bundle from <span className="mono">/finance/exports/</span>. No regeneration.</p>,
                  primaryLabel: 'Download',
                })}>Download last</button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="fin-reports-foot">
        <strong>Phase 2:</strong> direct sync to QuickBooks Online auto-pulls statutory accounts; year-end exports auto-publish to{' '}
        <span className="mono">/finance/year-end/</span>.
      </div>
    </>
  );
}

// ─────────────────────────────────── SETTINGS ───────────────────────────────────

function FinanceSettings() {
  const [tab, setTab] = useState<'categories' | 'caps' | 'escalation' | 'vendors' | 'accounts' | 'integrations'>('categories');
  return (
    <>
      <div className="fin-settings-tabs">
        {[
          { id: 'categories', label: 'Categories' },
          { id: 'caps', label: 'Spending caps' },
          { id: 'escalation', label: 'Approval escalation' },
          { id: 'vendors', label: 'Vendors' },
          { id: 'accounts', label: 'Accounts' },
          { id: 'integrations', label: 'Integrations' },
        ].map((t) => (
          <button
            key={t.id}
            className={'fin-settings-tab' + (tab === t.id ? ' active' : '')}
            onClick={() => setTab(t.id as 'categories' | 'caps' | 'escalation' | 'vendors' | 'accounts' | 'integrations')}
          >{t.label}</button>
        ))}
      </div>
      {tab === 'categories' && <SettingsCategories />}
      {tab === 'caps' && <SettingsCaps />}
      {tab === 'escalation' && <SettingsEscalation />}
      {tab === 'vendors' && <SettingsVendors />}
      {tab === 'accounts' && <SettingsAccounts />}
      {tab === 'integrations' && <SettingsIntegrations />}
    </>
  );
}

// Approval escalation chain — internal refund / reconciliation routing.
// Replaces the originally-locked Slack-DM-Ishant flow per running decisions
// log §3.1. Editable timer thresholds + recipient list + Mathias's fallback
// approval cap.
function SettingsEscalation() {
  const currentUserId = useCurrentUserId();
  const [chain, setChain] = useState({
    t1Mins: FIN_ESCALATION_CHAIN.tier1.silentTimeoutMins,
    t2Mins: FIN_ESCALATION_CHAIN.tier2.silentTimeoutMins,
    t3FallbackCapMinor: FIN_ESCALATION_CHAIN.tier3.fallbackApprovalCapMinor,
  });
  const tier1Recipient = TASK_USER_BY_ID_OR_NAME(FIN_ESCALATION_CHAIN.tier1.recipientId);
  const tier3Recipient = TASK_USER_BY_ID_OR_NAME(FIN_ESCALATION_CHAIN.tier3.recipientId);
  const tier3Final = TASK_USER_BY_ID_OR_NAME(FIN_ESCALATION_CHAIN.tier3.finalFallbackRecipientId);

  const save = () => {
    FIN_ESCALATION_CHAIN.tier1.silentTimeoutMins = chain.t1Mins;
    FIN_ESCALATION_CHAIN.tier2.silentTimeoutMins = chain.t2Mins;
    FIN_ESCALATION_CHAIN.tier3.fallbackApprovalCapMinor = chain.t3FallbackCapMinor;
    fireToast('Escalation chain saved · applies to next request');
  };

  const test = () => {
    requestRefundApproval({
      amountMinor: 500_00,
      currency: 'MUR',
      requestorId: currentUserId,
      reason: 'Test escalation — Settings → Approval escalation',
      urgent: false,
    });
  };

  return (
    <div className="card fin-card">
      <div className="card-header">
        <div>
          <div className="card-title">Approval escalation chain</div>
          <div className="card-subtitle">
            Routing for above-cap refunds and reconciliation requests · supersedes the originally-locked Slack-DM rule (running decisions log §3.1)
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn ghost sm" onClick={test}>Test post to #finance</button>
          <button className="btn primary sm" onClick={save}>Save chain</button>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Tier 1 */}
        <div style={{ padding: 12, background: 'var(--color-background-secondary)', borderRadius: 6, borderLeft: '3px solid var(--color-brand-accent)' }}>
          <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-brand-accent)', marginBottom: 6 }}>
            Tier 1 · FAD Inbox post
          </div>
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            Posts to <span className="mono">#finance</span> tagging <strong>{tier1Recipient}</strong>. Default landing tier for every above-cap request.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <label>Silent timeout (urgent only):</label>
            <input
              type="number" min={5} max={240} step={5}
              value={chain.t1Mins}
              onChange={(e) => setChain((c) => ({ ...c, t1Mins: parseInt(e.target.value) }))}
              style={{ width: 80, padding: '4px 8px' }}
            />
            <span>min before tier 2</span>
          </div>
        </div>

        {/* Tier 2 */}
        <div style={{ padding: 12, background: 'var(--color-bg-warning)', borderRadius: 6, borderLeft: '3px solid var(--color-text-warning)' }}>
          <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-warning)', marginBottom: 6 }}>
            Tier 2 · 3CX phone (urgent + silent only)
          </div>
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            Auto-dials <strong>{tier1Recipient}</strong> via 3CX when an urgent request is silent past the tier-1 timeout.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <label>Silent timeout:</label>
            <input
              type="number" min={5} max={120} step={5}
              value={chain.t2Mins}
              onChange={(e) => setChain((c) => ({ ...c, t2Mins: parseInt(e.target.value) }))}
              style={{ width: 80, padding: '4px 8px' }}
            />
            <span>min before tier 3</span>
          </div>
        </div>

        {/* Tier 3 */}
        <div style={{ padding: 12, background: 'var(--color-background-secondary)', borderRadius: 6, borderLeft: '3px solid var(--color-text-tertiary)' }}>
          <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-secondary)', marginBottom: 6 }}>
            Tier 3 · Fallback approver
          </div>
          <div style={{ fontSize: 13, marginBottom: 8, lineHeight: 1.5 }}>
            If both tiers above stay silent, the request falls through to <strong>{tier3Recipient}</strong>. Mathias may approve up to the cap below; above the cap it routes to <strong>{tier3Final}</strong> as last resort.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <label>{tier3Recipient}'s fallback cap:</label>
            <span className="mono">Rs</span>
            <input
              type="number" min={0} max={1_000_000} step={500}
              value={chain.t3FallbackCapMinor / 100}
              onChange={(e) => setChain((c) => ({ ...c, t3FallbackCapMinor: parseInt(e.target.value) * 100 }))}
              style={{ width: 110, padding: '4px 8px' }}
            />
          </div>
        </div>

        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
          Phase 1: tier-2 phone is a stub (toast). Phase 2 wires real 3CX click-to-dial + a backend cron that advances stuck requests through the chain on the timer thresholds set above.
        </div>
      </div>
    </div>
  );
}

// Integrations: Slack fallback + Classification rules + QBO sync (Phase 2)
function SettingsIntegrations() {
  const { openConfirm } = useFinCtx();
  const matchTypeLabel: Record<string, string> = {
    vendor_pattern: 'Vendor pattern',
    amount_range: 'Amount range',
    description_keyword: 'Description keyword',
    account_source: 'Source account',
  };
  return (
    <>
      {/* Slack fallback */}
      <div className="card fin-card">
        <div className="card-header">
          <div>
            <div className="card-title">Slack fallback ingestion</div>
            <div className="card-subtitle">When FAD is unreachable, posting to these channels still creates expense candidates.</div>
          </div>
          <button className="btn ghost sm" onClick={() => openConfirm({
            title: 'Add Slack channel',
            body: <p>Pick a Slack channel to monitor. The webhook ingests every message, parses for expense fields, posts to flagged queue if ambiguous.</p>,
            primaryLabel: 'Pick channel',
          })}><IconPlus size={12} /> Add channel</button>
        </div>
        <div className="fin-tt-table">
          <div className="fin-tt-row fin-tt-head fin-integ-slack-row">
            <div>Channel</div>
            <div>Purpose</div>
            <div className="amount-col">MTD ingested</div>
            <div>Last ingest</div>
            <div></div>
          </div>
          {FIN_SLACK_CHANNELS.map((c) => (
            <div key={c.id} className="fin-tt-row fin-integ-slack-row">
              <div className="mono">{c.name}</div>
              <div className="fin-row-sub">{c.purpose}</div>
              <div className="amount-col mono">{c.countMTD}</div>
              <div className="mono fin-row-sub">{c.lastIngest || '—'}</div>
              <div>
                <span className={'chip sm ' + (c.ingestEnabled ? 'green' : 'warn')}>
                  {c.ingestEnabled ? 'enabled' : 'paused'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Classification rules */}
      <div className="card fin-card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Classification rules</div>
            <div className="card-subtitle">Rules-first · LLM fallback for ambiguous cases. Higher priority wins.</div>
          </div>
          <button className="btn ghost sm" onClick={() => openConfirm({
            title: 'Add classification rule',
            body: <p>Define a match (vendor pattern / keyword / amount range / source account) → category + bill-to. Rule fires at intake before LLM fallback.</p>,
            primaryLabel: 'Open rule editor',
          })}><IconPlus size={12} /> Add rule</button>
        </div>
        <div className="fin-tt-table">
          <div className="fin-tt-row fin-tt-head fin-integ-rule-row">
            <div>Match</div>
            <div>Pattern</div>
            <div>→ Category</div>
            <div>→ Bill-to</div>
            <div className="amount-col">Hits 90d</div>
            <div></div>
          </div>
          {FIN_CLASSIFICATION_RULES.map((r) => (
            <div key={r.id} className="fin-tt-row fin-integ-rule-row">
              <div className="fin-row-sub">{matchTypeLabel[r.matchType]}</div>
              <div className="mono">{r.matchValue}</div>
              <div className="mono">{r.thenCategory || <span className="fin-row-sub">— inherit —</span>}</div>
              <div>
                <span className={'fin-billto fin-billto-' + billToColor(r.thenBillTo)}>{billToLabel(r.thenBillTo)}</span>
              </div>
              <div className="amount-col mono">{r.hits90d}</div>
              <div>
                <button
                  className="btn ghost sm"
                  onClick={() => openConfirm({
                    title: `Edit rule · ${matchTypeLabel[r.matchType]}`,
                    body: (
                      <>
                        <p><strong>Pattern:</strong> <span className="mono">{r.matchValue}</span></p>
                        <p><strong>→ Category:</strong> {r.thenCategory || 'inherit from classifier'}</p>
                        <p><strong>→ Bill-to:</strong> {billToLabel(r.thenBillTo)}</p>
                        <p><strong>Priority:</strong> {r.priority} · {r.hits90d} hits in last 90 days</p>
                        <p style={{ marginTop: 8 }}>Editor opens with all fields. Disabling does not delete history; the rule simply stops firing on new captures.</p>
                      </>
                    ),
                    primaryLabel: 'Open editor',
                  })}
                >Edit</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* QuickBooks sync — Phase 2 */}
      <div className="card fin-card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <div>
            <div className="card-title">QuickBooks Online · sync mapping</div>
            <div className="card-subtitle">Phase 2 · category → QBO chart-of-accounts mapping. Nightly journal-entry push once connected.</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <span className="chip warn sm">not connected</span>
            <button
              className="btn primary sm"
              onClick={() =>
                openConfirm({
                  title: 'Connect QuickBooks Online',
                  body: (
                    <>
                      <p>Opens OAuth flow to QBO. Once connected:</p>
                      <ul style={{ paddingLeft: 18, marginTop: 6 }}>
                        <li>Nightly journal-entry push for closed periods</li>
                        <li>Year-end statutory exports auto-published</li>
                        <li>VAT/TDS tracking maintained in QBO</li>
                      </ul>
                    </>
                  ),
                  primaryLabel: 'Connect',
                })
              }
            >
              Connect QBO
            </button>
          </div>
        </div>
        <div className="fin-tt-table">
          <div className="fin-tt-row fin-tt-head fin-integ-qbo-row">
            <div>FAD category</div>
            <div>QBO account</div>
            <div className="mono">Code</div>
            <div>Status</div>
            <div></div>
          </div>
          {FIN_QBO_MAPPINGS.map((m) => (
            <div key={m.finCategory} className="fin-tt-row fin-integ-qbo-row">
              <div className="mono">{m.finCategory}</div>
              <div>{m.qboAccount}</div>
              <div className="mono">{m.qboCode}</div>
              <div>
                <span className={'fin-status fin-status-' + (m.status === 'synced' ? 'posted' : m.status === 'errored' ? 'rejected' : 'submitted')}>
                  {m.status.replace('_', ' ')}
                </span>
              </div>
              <div>
                <button
                  className="btn ghost sm"
                  onClick={() => openConfirm({
                    title: `Map ${m.finCategory} → QBO`,
                    body: (
                      <>
                        <p><strong>FAD category:</strong> <span className="mono">{m.finCategory}</span></p>
                        <p><strong>Suggested QBO:</strong> {m.qboAccount} (code <span className="mono">{m.qboCode}</span>)</p>
                        <p style={{ marginTop: 8 }}>QBO connection required first. Once mapped, expenses in this category sync nightly. Re-mapping is reversible; old journal entries unchanged.</p>
                      </>
                    ),
                    primaryLabel: 'Map account',
                  })}
                >Map…</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function SettingsCategories() {
  const { openConfirm } = useFinCtx();
  return (
    <div className="card fin-card">
      <div className="card-header">
        <div className="card-title">Expense categories</div>
        <button
          className="btn primary sm"
          onClick={() => openConfirm({
            title: 'Add expense category',
            body: (
              <>
                <p>Opens an editor for: code (e.g. <span className="mono">FR-NEW</span>), display name, default bill-to (Owner / FR-internal / FI / S), receipt requirement (always / above Rs 1k / optional), internal-labour eligible toggle.</p>
                <p style={{ marginTop: 6 }}>Codes are immutable once captures reference them.</p>
              </>
            ),
            primaryLabel: 'Open editor',
          })}
        ><IconPlus size={12} /> Add category</button>
      </div>
      <div className="fin-tt-table">
        <div className="fin-tt-row fin-tt-head fin-settings-cat-row">
          <div>Code</div><div>Name</div><div>Default bill-to</div><div>Receipt</div><div></div>
        </div>
        {FIN_CATEGORIES.map((c) => (
          <div key={c.code} className="fin-tt-row fin-settings-cat-row">
            <div className="mono">{c.code}</div>
            <div>{c.name}</div>
            <div>
              <span className={'fin-billto fin-billto-' + billToColor(c.defaultBillTo)}>{billToLabel(c.defaultBillTo)}</span>
            </div>
            <div className="fin-row-sub">{c.receiptRequired === 'always' ? 'required' : c.receiptRequired === 'above_1000' ? '> Rs 1k' : 'optional'}</div>
            <div>
              <button
                className="btn ghost sm"
                onClick={() => openConfirm({
                  title: `Edit ${c.code} · ${c.name}`,
                  body: (
                    <>
                      <p><strong>Code:</strong> <span className="mono">{c.code}</span> (locked — referenced by captures)</p>
                      <p><strong>Name:</strong> {c.name}</p>
                      <p><strong>Default bill-to:</strong> {billToLabel(c.defaultBillTo)}</p>
                      <p><strong>Receipt:</strong> {c.receiptRequired}</p>
                      <p style={{ marginTop: 8 }}>Editor opens with these fields pre-filled. Changes apply to future captures only — existing rows keep their bill-to as captured.</p>
                    </>
                  ),
                  primaryLabel: 'Open editor',
                })}
              >Edit</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsCaps() {
  const { openConfirm } = useFinCtx();
  // @demo:config — Per-user spending caps and team members hardcoded inline. Replace with
  // GET /api/finance/policies/caps returning [{userId, displayName, role, capMinor, updatedAt}].
  // User list duplicates PROD-DATA-38 (TASK_USERS); caps are business policy. Tag: PROD-CONFIG-2.
  const team = [
    { user: 'Ishant', role: 'Admin', cap: null, lastUpdated: '—' },
    { user: 'Mary', role: 'Admin (departing May)', cap: null, lastUpdated: '2026-01-04 · Ishant' },
    { user: 'Mathias', role: 'Manager (Tasks 3.2)', cap: 20_000_00, lastUpdated: '2026-03-12 · Ishant' },
    { user: 'Franny', role: 'Contributor', cap: 5_000_00, lastUpdated: '2026-03-12 · Ishant' },
    { user: 'Bryan', role: 'Contributor', cap: 5_000_00, lastUpdated: '2026-03-12 · Ishant' },
    { user: 'Alex', role: 'Contributor', cap: 5_000_00, lastUpdated: '2026-03-12 · Ishant' },
  ];
  return (
    <div className="card fin-card">
      <div className="card-header">
        <div className="card-title">Per-user spending caps</div>
        <div className="card-subtitle">Captures over cap auto-flag + post to FAD Inbox <span className="mono">#finance</span></div>
      </div>
      <div className="fin-tt-table">
        <div className="fin-tt-row fin-tt-head fin-settings-cap-row">
          <div>User</div><div>Role</div><div className="amount-col">Cap (MUR)</div><div>Last updated</div><div></div>
        </div>
        {team.map((t) => (
          <div key={t.user} className="fin-tt-row fin-settings-cap-row">
            <div>{t.user}</div>
            <div className="fin-row-sub">{t.role}</div>
            <div className="amount-col mono">{t.cap === null ? <span className="fin-row-sub">unlimited</span> : formatMUR(t.cap)}</div>
            <div className="fin-row-sub">{t.lastUpdated}</div>
            <div>
              <button
                className="btn ghost sm"
                onClick={() => openConfirm({
                  title: `Edit cap · ${t.user}`,
                  body: (
                    <>
                      <p><strong>Role:</strong> {t.role}</p>
                      <p><strong>Current cap:</strong> {t.cap === null ? 'unlimited' : formatMUR(t.cap)}</p>
                      <p style={{ marginTop: 8 }}>Editor lets you set a new MUR amount or mark unlimited (admin only). Required reason field — captures the audit trail.</p>
                      <p style={{ marginTop: 6, color: 'var(--color-text-warning)' }}>⚠ Captures already submitted at the prior cap stay flagged.</p>
                    </>
                  ),
                  primaryLabel: 'Open editor',
                })}
              >Edit</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsVendors() {
  const { openVendor, openConfirm } = useFinCtx();
  const [q, setQ] = useState('');
  const filtered = FIN_VENDORS.filter((v) =>
    v.name.toLowerCase().includes(q.toLowerCase()) ||
    v.altNames.some((a) => a.toLowerCase().includes(q.toLowerCase())),
  );
  return (
    <div className="card fin-card">
      <div className="card-header">
        <div className="card-title">Vendors · {FIN_VENDORS.length}</div>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', alignItems: 'center' }}>
          <input className="input" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 160 }} />
          <button className="btn ghost sm" onClick={() => openConfirm({
            title: 'Import vendor CSV',
            body: 'Pick a CSV exported from Mary\'s recognition table. Each row will be deduped against canonical names + patterns.',
            primaryLabel: 'Pick file',
          })}>Import CSV</button>
          <button className="btn primary sm" onClick={() => openVendor('add')}><IconPlus size={12} /> Add vendor</button>
        </div>
      </div>
      <div className="fin-tt-table">
        <div className="fin-tt-row fin-tt-head fin-settings-vendor-row">
          <div>Canonical name</div>
          <div>Recognition patterns</div>
          <div>Default category</div>
          <div className="amount-col">YTD spend</div>
          <div></div>
        </div>
        {filtered.map((v) => (
          <div key={v.id} className="fin-tt-row fin-settings-vendor-row fin-clickable" onClick={() => openVendor('edit', v.id)}>
            <div>{v.name}</div>
            <div className="fin-vendor-alts">
              {v.altNames.map((a, i) => <span key={i} className="fin-receipt-pill">{a}</span>)}
            </div>
            <div className="mono fin-row-sub">{v.defaultCategory || '—'}</div>
            <div className="amount-col mono">{formatMUR(v.ytdSpendMUR * 100)}</div>
            <div onClick={(e) => e.stopPropagation()}>
              <button className="btn ghost sm" onClick={() => openVendor('edit', v.id)}>Edit</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsAccounts() {
  const { openBankUpload, openConfirm } = useFinCtx();
  const roleLabel: Record<string, string> = {
    main_pm: 'Main PM',
    field_pm: 'Field PM',
    fx: 'FX holding',
    syndic: 'Syndic',
    interior: 'Interior',
    clearance: 'Clearance',
    admin: 'Admin',
  };
  return (
    <div className="card fin-card">
      <div className="card-header">
        <div>
          <div className="card-title">Bank accounts · {FIN_ACCOUNTS.length}</div>
          <div className="card-subtitle">11 MCB · 3 MauBank · float top-ups distinguished from real expenses</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn ghost sm" onClick={() => openBankUpload()}>Upload statement</button>
          <button className="btn primary sm" onClick={() => openConfirm({
            title: 'Connect bank account',
            body: 'Open Bank-Connect API onboarding for MCB or MauBank. (Phase 2 — backend integration pending.)',
            primaryLabel: 'Continue',
          })}><IconPlus size={12} /> Connect account</button>
        </div>
      </div>
      <div className="fin-tt-table">
        <div className="fin-tt-row fin-tt-head fin-settings-acct-row">
          <div>Account</div>
          <div>Role</div>
          <div>Bank · Ccy</div>
          <div>Source</div>
          <div>Last imported</div>
          <div></div>
        </div>
        {FIN_ACCOUNTS.map((a) => (
          <div key={a.id} className={'fin-tt-row fin-settings-acct-row' + (a.dormant ? ' fin-acct-dormant' : '')}>
            <div>
              <div className="fin-row-title">{a.name}</div>
              {a.cardHolder && <div className="fin-row-sub">Card: {a.cardHolder}</div>}
              {a.description && <div className="fin-row-sub">{a.description}</div>}
            </div>
            <div className="fin-row-sub">{roleLabel[a.role]}</div>
            <div className="mono fin-row-sub">{a.bank} · {a.currency}</div>
            <div className="mono fin-row-sub">{a.source}</div>
            <div className="mono fin-row-sub">{a.lastImportedDate}</div>
            <div>
              {a.dormant
                ? <span className="chip sm">dormant</span>
                : <button className="btn ghost sm" onClick={() => openBankUpload(a.id)}>Upload</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────── PERIOD CLOSE WIZARD ───────────────────────────────────

function PeriodCloseWizard({ onClose }: { onClose: () => void }) {
  const period = CURRENT_PERIOD;
  const [stage, setStage] = useState<number>(period.closeStage ?? 1);

  const stages = [
    { num: 1, label: 'Pre-flight checklist' },
    { num: 2, label: 'FX rate' },
    { num: 3, label: 'Bank reconciliation' },
    { num: 4, label: 'Revenue recon (Mathias)' },
    { num: 5, label: 'Per-property adjustments' },
    { num: 6, label: 'Tourist tax' },
    { num: 7, label: 'P&L preview' },
    { num: 8, label: 'Lock + post' },
  ];

  return (
    <div className="fin-pc-overlay">
      <div className="fin-pc">
        <div className="fin-pc-topbar">
          <div className="fin-pc-period">
            <select className="input" defaultValue={period.id}>
              {FIN_PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <span className="fin-pc-lock">
              <IconClock size={12} /> Locked by {period.lockedBy} at {period.lockedAt}
            </span>
          </div>
          <div className="fin-pc-actions">
            <button className="btn ghost sm" onClick={onClose}>Save & exit</button>
            <button className="fin-drawer-close" onClick={onClose}><IconClose size={14} /></button>
          </div>
        </div>

        <div className="fin-pc-body">
          <aside className="fin-pc-sidebar">
            {stages.map((s) => {
              const done = s.num < stage;
              const current = s.num === stage;
              return (
                <button
                  key={s.num}
                  className={'fin-pc-stage' + (done ? ' done' : '') + (current ? ' current' : '')}
                  onClick={() => setStage(s.num)}
                >
                  <span className="fin-stage-num">{s.num}</span>
                  <span className="fin-stage-label">{s.label}</span>
                  <span className="fin-stage-state">
                    {done ? <IconCheck size={12} /> : current ? '●' : '○'}
                  </span>
                </button>
              );
            })}
          </aside>

          <main className="fin-pc-main">
            {stage === 1 && <PCStage1 />}
            {stage === 2 && <PCStage2 />}
            {stage === 3 && <PCStage3 />}
            {stage === 4 && <PCStage4 />}
            {stage === 5 && <PCStage5 />}
            {stage === 6 && <FinanceTouristTax />}
            {stage === 7 && <PCStage7 />}
            {stage === 8 && <PCStage8 onClose={onClose} />}

            {stage < 8 && (
              <div className="fin-pc-nav">
                {stage > 1 && (
                  <button className="btn ghost" onClick={() => setStage(stage - 1)}>← Back</button>
                )}
                <button className="btn primary" onClick={() => setStage(stage + 1)} style={{ marginLeft: 'auto' }}>
                  Continue to stage {stage + 1} →
                </button>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function PCStage1() {
  const { openConfirm, openBankUpload } = useFinCtx();
  const operationalChecks = [
    { label: 'All Path A captures submitted', detail: '0 drafts in this period', ok: true },
    { label: 'All medium-tier approvals resolved', detail: '4 still pending — see Approvals', ok: false, sub: 'approvals' as const },
    { label: 'No advisory lock held by another user', detail: 'You are the only active runner', ok: true },
  ];
  const docs = FIN_PERIOD_DOCS;
  const received = docs.filter((d) => d.status === 'received').length;
  const partial = docs.filter((d) => d.status === 'partial').length;
  const missing = docs.filter((d) => d.status === 'missing').length;
  const blocked = missing + partial > 0 || operationalChecks.some((c) => !c.ok);

  const openUploadFor = (d: typeof docs[number]) =>
    d.kind === 'bank_statement' ? openBankUpload(d.refId) : openBankUpload(undefined, d.refId);

  return (
    <>
      <h2 className="fin-pc-h2">Stage 1 · Pre-flight</h2>
      <p className="fin-pc-p">
        Drop every document needed for {CURRENT_PERIOD.label} here. Once everything's in and operational checks pass, the rest of close runs.
      </p>

      <div className="card fin-card fin-pc-docs">
        <div className="card-header">
          <div>
            <div className="card-title">Documents · {CURRENT_PERIOD.label}</div>
            <div className="card-subtitle">
              {received} received · {partial} partial · {missing} missing · {docs.length} total
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="btn ghost sm"
              onClick={() => openConfirm({
                title: 'Drop all documents',
                body: <p>Multi-file picker — every dropped file auto-routed by detected pattern (CSV vs PDF · vendor token vs bank reference). Each goes through its appropriate parser and lands as a candidate to commit.</p>,
                primaryLabel: 'Pick files',
              })}
            >Drop multiple…</button>
            <button
              className="btn primary sm"
              onClick={() => openConfirm({
                title: 'Friday will fetch what it can',
                body: <p>Triggers auto-pull integrations — Airbnb / Booking.com APIs + MCB IB scraper. MauBank still requires manual upload (PIN-locked PDFs).</p>,
                primaryLabel: 'Auto-pull',
              })}
            >Auto-pull</button>
          </div>
        </div>
        <div className="fin-pc-docs-grid">
          {docs.map((d) => (
            <div key={d.id} className={'fin-pc-doc-card status-' + d.status}>
              <div className="fin-pc-doc-head">
                <span className={'fin-pc-doc-status status-' + d.status}>
                  {d.status === 'received' ? '✓' : d.status === 'partial' ? '∆' : '○'}
                </span>
                <span className="fin-pc-doc-label">{d.label}</span>
                <span className="fin-pc-doc-format mono">{d.format}</span>
              </div>
              <div className="fin-pc-doc-source">{d.source}</div>
              {d.status === 'received' && d.coverageThrough && (
                <div className="fin-pc-doc-msg fin-pc-doc-msg-ok">
                  Coverage through <span className="mono">{d.coverageThrough}</span>
                </div>
              )}
              {d.status === 'partial' && (
                <div className="fin-pc-doc-msg fin-pc-doc-msg-warn">
                  ⚠ {d.gap} · re-upload to complete
                </div>
              )}
              {d.status === 'missing' && (
                <div className="fin-pc-doc-msg fin-pc-doc-msg-err">
                  ✗ Not yet received for this period
                </div>
              )}
              <div className="fin-pc-doc-actions">
                {d.status === 'received' ? (
                  <>
                    <button className="btn ghost sm" onClick={() => openConfirm({
                      title: `View ${d.label}`,
                      body: <p>Opens the parsed lines from the latest upload — read-only with line-by-line classification status.</p>,
                      primaryLabel: 'View',
                    })}>View</button>
                    <button className="btn ghost sm" onClick={() => openUploadFor(d)}>Re-upload</button>
                  </>
                ) : (
                  <button className="btn primary sm" onClick={() => openUploadFor(d)}>
                    <IconPaperclip size={10} /> Upload
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card fin-card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <div className="card-title">Operational checks</div>
          <div className="card-subtitle">
            {operationalChecks.filter((c) => c.ok).length} of {operationalChecks.length} passed
          </div>
        </div>
        <div className="fin-list">
          {operationalChecks.map((c, i) => (
            <div key={i} className="fin-row-item">
              <div className="fin-row-main">
                <div className="fin-row-title">
                  <span className={'fin-check-dot ' + (c.ok ? 'green' : 'warn')} />
                  {c.label}
                </div>
                <div className="fin-row-sub">{c.detail}</div>
              </div>
              <div className="fin-row-meta">
                {!c.ok && (
                  <button
                    className="btn ghost sm"
                    onClick={() => c.sub
                      ? window.location.assign(`/fad?m=finance&sub=${c.sub}`)
                      : openConfirm({ title: `Resolve · ${c.label}`, body: <p>{c.detail}</p>, primaryLabel: 'Open queue' })}
                  >Resolve</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {!blocked && (
        <div className="fin-pc-ready">
          ✓ All documents and checks complete — Stage 2 (FX rate) ready to run.
        </div>
      )}
    </>
  );
}

function PCStage2() {
  const { openConfirm } = useFinCtx();
  return (
    <>
      <h2 className="fin-pc-h2">Stage 2 · FX rate computation</h2>
      <p className="fin-pc-p">Lock the weighted-average realised rate for {CURRENT_PERIOD.label}. T&C 1.9.</p>

      <div className="fin-row" style={{ marginTop: 14 }}>
        <div className="card fin-card">
          <div className="card-header">
            <div className="card-title">EUR → MUR</div>
            <span className="chip green sm">computed</span>
          </div>
          <div style={{ padding: '20px 16px' }}>
            <div className="fin-pc-rate">{CURRENT_PERIOD.warRateEurMur?.toFixed(4)}</div>
            <div className="fin-row-sub" style={{ marginTop: 4 }}>From 5 EUR payouts · €11.6k total · MUR Rs 608k credited</div>
            <div className="fin-pc-prior">
              <span>Prior 3:</span>
              <span className="mono">52.30 · 52.15 · 52.00</span>
            </div>
          </div>
        </div>

        <div className="card fin-card">
          <div className="card-header">
            <div className="card-title">USD → MUR</div>
            <span className="chip green sm">computed</span>
          </div>
          <div style={{ padding: '20px 16px' }}>
            <div className="fin-pc-rate">{CURRENT_PERIOD.warRateUsdMur?.toFixed(4)}</div>
            <div className="fin-row-sub" style={{ marginTop: 4 }}>From 1 USD payout · $640 total · MUR Rs 30k credited</div>
            <div className="fin-pc-prior">
              <span>Prior 3:</span>
              <span className="mono">47.10 · 46.95 · 46.80</span>
            </div>
          </div>
        </div>
      </div>

      <div className="fin-capture-actions" style={{ marginTop: 14, justifyContent: 'flex-start' }}>
        <button
          className="btn ghost sm"
          onClick={() => openConfirm({
            title: 'Override FX rate',
            body: <p>Editor lets you override the auto-computed weighted-avg rate. Required reason field captures the audit trail. Use sparingly — overrides distort owner statements vs Guesty cross-check.</p>,
            primaryLabel: 'Open override',
          })}
        >Override rate (with reason)</button>
        <button
          className="btn primary sm"
          onClick={() => openConfirm({
            title: `Lock rate for ${CURRENT_PERIOD.label}`,
            body: <p>Locks the WAR rate to <span className="mono">{CURRENT_PERIOD.warRateEurMur?.toFixed(4)} EUR/MUR</span> + <span className="mono">{CURRENT_PERIOD.warRateUsdMur?.toFixed(4)} USD/MUR</span> for this period. Triggers downstream waterfalls. Reversible only via admin reopen.</p>,
            primaryLabel: 'Lock rate',
          })}
        >Lock rate for {CURRENT_PERIOD.label}</button>
      </div>
    </>
  );
}

function PCStage3() {
  const { openConfirm } = useFinCtx();
  const grouped = useMemo(() => {
    const m: Record<string, typeof FIN_BANK_LINES> = {};
    FIN_BANK_LINES.forEach((b) => { (m[b.accountId] = m[b.accountId] || []).push(b); });
    return m;
  }, []);
  const [selectedId, setSelectedId] = useState<string>(FIN_BANK_LINES[0].id);
  const selected = FIN_BANK_LINES.find((b) => b.id === selectedId);

  return (
    <>
      <h2 className="fin-pc-h2">Stage 3 · Bank reconciliation</h2>
      <p className="fin-pc-p">Match every bank line to expense, payout, top-up, or fee. 100% required for MCB CSVs · ≤5% tolerance for MauBank PDFs.</p>

      <div className="fin-pc-recon">
        <div className="fin-pc-recon-list">
          {FIN_ACCOUNTS.map((a) => {
            const lines = grouped[a.id] || [];
            if (lines.length === 0) return null;
            return (
              <div key={a.id} className="fin-pc-recon-account">
                <div className="fin-pc-recon-account-head">
                  <span>{a.name}</span>
                  <span className="mono fin-row-sub">{lines.length} lines</span>
                </div>
                {lines.map((b) => (
                  <button
                    key={b.id}
                    className={'fin-pc-recon-row' + (b.id === selectedId ? ' active' : '')}
                    onClick={() => setSelectedId(b.id)}
                  >
                    <div className="fin-row-main">
                      <div className="fin-row-title fin-pc-recon-desc">{b.description}</div>
                      <div className="fin-row-sub mono">{b.date} · {b.kind}</div>
                    </div>
                    <div className="fin-row-meta">
                      <span className="mono">{formatCurrency(b.amountMinor, b.currency)}</span>
                      <span className={'fin-status fin-status-' + (b.status === 'matched' || b.status === 'classified_topup' || b.status === 'classified_fee' ? 'posted' : 'pending_approval')}>
                        {b.status.replace('_', ' ')}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            );
          })}
        </div>

        <div className="fin-pc-recon-detail">
          {selected && (
            <>
              <div className="fin-section-title" style={{ marginBottom: 8 }}>Detail</div>
              <div className="fin-row-title" style={{ marginBottom: 4 }}>{selected.description}</div>
              <div className="fin-row-sub mono" style={{ marginBottom: 12 }}>{selected.date} · {formatCurrency(selected.amountMinor, selected.currency)}</div>
              {selected.status === 'matched' && (
                <>
                  <div className="fin-row-sub" style={{ marginBottom: 8 }}>Linked to expense / payout</div>
                  <button
                    className="btn ghost sm"
                    onClick={() => openConfirm({
                      title: 'Unlink bank line',
                      body: <p>Removes the link between this bank line and its matched expense/payout. Both records survive — bank line returns to <span className="mono">unmatched</span>; expense stays unchanged.</p>,
                      primaryLabel: 'Unlink',
                    })}
                  >Unlink</button>
                </>
              )}
              {selected.status === 'proposed' && (
                <>
                  <div className="fin-row-sub" style={{ marginBottom: 8 }}>Proposed match: <strong>Climate Tech Ltd · Rs 12,500</strong></div>
                  <div className="fin-capture-actions" style={{ justifyContent: 'flex-start', borderTop: 0, padding: 0, marginTop: 8 }}>
                    <button
                      className="btn primary sm"
                      onClick={() => openConfirm({
                        title: 'Accept proposed match',
                        body: <p>Confirms this bank line settles the expense. Bank-line status moves to <span className="mono">matched</span>; recon status increments.</p>,
                        primaryLabel: 'Accept',
                      })}
                    >Accept match</button>
                    <button
                      className="btn ghost sm"
                      onClick={() => openConfirm({
                        title: 'Reject proposed match',
                        body: <p>Bank line moves to <span className="mono">unmatched</span> — you'll classify or link manually.</p>,
                        primaryLabel: 'Reject',
                      })}
                    >Reject</button>
                  </div>
                </>
              )}
              {selected.status === 'unmatched' && (
                <>
                  <div className="fin-row-sub" style={{ marginBottom: 8 }}>No automatic match. Classify or link manually.</div>
                  <div className="fin-capture-actions" style={{ justifyContent: 'flex-start', borderTop: 0, padding: 0, marginTop: 8, flexWrap: 'wrap' }}>
                    <button className="btn ghost sm" onClick={() => openConfirm({
                      title: 'Find expense to link',
                      body: <p>Opens search across uncommitted expenses · filterable by amount range + date window + property.</p>,
                      primaryLabel: 'Open search',
                    })}>Find expense</button>
                    <button className="btn ghost sm" onClick={() => openConfirm({
                      title: 'Mark as float top-up',
                      body: <p>Classifies as intercompany transfer. Records on the float ledger of the destination account; never charged to an owner.</p>,
                      primaryLabel: 'Mark top-up',
                    })}>Mark top-up</button>
                    <button className="btn ghost sm" onClick={() => openConfirm({
                      title: 'Mark as bank fee',
                      body: <p>Classifies as <span className="mono">FR-ADM-BANK</span> expense. Bills to FR-internal automatically.</p>,
                      primaryLabel: 'Mark fee',
                    })}>Mark fee</button>
                    <button className="btn ghost sm" onClick={() => openConfirm({
                      title: 'Write off bank line',
                      body: <p>Excludes from reconciliation totals. Required reason captured in audit log. Use only for known parser errors.</p>,
                      primaryLabel: 'Write off',
                      primaryTone: 'danger',
                    })}>Write-off</button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function PCStage4() {
  const { openConfirm } = useFinCtx();
  const currentUserId = useCurrentUserId();
  const [, setRev] = useState(0);
  const bumpRev = () => setRev((n) => n + 1);

  // Items A + B detector now drives Stage 4. The seeded fixtures from before
  // (cleaning-fee-missing, length-of-stay) live in `financeAnomalies.ts` as
  // additional rows so the demo data stays comparable. Above-cap = €200 / 30%
  // routes via FAD Inbox per running decisions log §3.1 (was Slack-DM-Ishant
  // — supersedes the originally-locked rule in the UX brief §6).
  const items = detectAllAnomalies();
  // @demo:logic — Tag: PROD-LOGIC-11 — see frontend/DEMO_CRUFT.md
  // Hardcoded refund authority cap. Replace with: GET /api/finance/policies
  // returning per-role authority caps (will likely be tenant-configurable).
  const cap = 200_00; // Mathias refund authority cap, MUR minor (€200 ≈ Rs 200 * 100... use 200_00 as fixture cap)

  const handleApply = (d: PayoutDiscrepancy) => {
    const aboveCap = Math.abs(d.suggestedOwnerChargeMinor) > cap;
    openConfirm({
      title: `Apply · ${DISCREPANCY_KIND_LABEL[d.kind]}`,
      body: (
        <>
          <p><strong>Reservation:</strong> <span className="mono">{d.reservationId}</span> · {d.guestName} ({d.propertyCode})</p>
          <p><strong>Suggested:</strong> {d.suggestedOwnerChargeMinor === 0 ? 'fare-line split (no money diff)' : `Rs ${(d.suggestedOwnerChargeMinor / 100).toLocaleString()}`}</p>
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 8, lineHeight: 1.5 }}>
            {d.detectorReason}
          </p>
          <p style={{ marginTop: 8 }}>
            {d.kind === 'special_offer_collapse'
              ? <>Re-instates the cleaning fee line on the reservation and queues a Stage 5 per-property review entry.</>
              : <>Posts an Owner Charge to <span className="mono">FIN_EXPENSES</span> and queues a Stage 5 per-property review entry. Audit log records Mathias as actor.</>}
          </p>
          {aboveCap && (
            <p style={{ marginTop: 6, color: 'var(--color-text-warning)' }}>
              ⚠ Above Mathias's €200 cap — auto-routes to {TASK_USER_BY_ID_OR_NAME(FIN_ESCALATION_CHAIN.tier1.recipientId)} via FAD Inbox <span className="mono">#finance</span> for approval before posting.
            </p>
          )}
        </>
      ),
      primaryLabel: aboveCap ? 'Send for approval' : 'Apply',
      onConfirm: () => {
        if (aboveCap) {
          requestRefundApproval({
            reservationId: d.reservationId,
            amountMinor: d.suggestedOwnerChargeMinor,
            currency: d.currency,
            requestorId: currentUserId,
            reason: `${DISCREPANCY_KIND_LABEL[d.kind]} · ${d.guestName} · ${d.propertyCode}`,
            urgent: d.severity === 'high',
          });
        } else if (d.kind === 'special_offer_collapse') {
          applyFareCollapseSplit(d, currentUserId);
        } else {
          applyOwnerCharge(d, currentUserId);
        }
        bumpRev();
      },
    });
  };

  return (
    <>
      <h2 className="fin-pc-h2">Stage 4 · Revenue recon (Mathias)</h2>
      <p className="fin-pc-p">
        Auto-detected discrepancies between Guesty and channel-actual payouts (Airbnb host report / Booking.com payouts). Above-cap items route to <span className="mono">#finance</span> in FAD Inbox.
      </p>

      <div className="card fin-card" style={{ marginTop: 14 }}>
        <div className="fin-tt-table">
          <div className="fin-tt-row fin-tt-head fin-pc-rev-row">
            <div>Reservation</div><div>Guest · property</div><div>Issue</div><div className="amount-col">Suggested</div><div></div>
          </div>
          {items.length === 0 && (
            <div className="fin-empty" style={{ padding: 20 }}>All caught up — no discrepancies detected for this period.</div>
          )}
          {items.map((d) => (
            <div key={d.id} className="fin-tt-row fin-pc-rev-row">
              <div className="mono">{d.reservationId}</div>
              <div>
                <div className="fin-row-title">{d.guestName}</div>
                <div className="fin-row-sub mono">{d.propertyCode}</div>
              </div>
              <div>
                <div>{DISCREPANCY_KIND_LABEL[d.kind]}</div>
                <div className="fin-row-sub" style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{d.summary}</div>
              </div>
              <div className="amount-col mono" style={{ color: d.suggestedOwnerChargeMinor === 0 ? 'var(--color-text-tertiary)' : 'var(--color-text-success)' }}>
                {d.suggestedOwnerChargeMinor === 0 ? 'split only' : `+Rs ${(d.suggestedOwnerChargeMinor / 100).toLocaleString()}`}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn primary sm" onClick={() => handleApply(d)}>Apply</button>
                <button
                  className="btn ghost sm"
                  onClick={() => openConfirm({
                    title: `Defer · ${d.reservationId}`,
                    body: <p>Moves this issue to next period's queue. Used when more guest information is needed.</p>,
                    primaryLabel: 'Defer',
                  })}
                >Defer</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// Tiny helper — recipient-id → display name. Dodges importing TASK_USER_BY_ID
// at the top of this file (FinanceModule has many existing imports already).
function TASK_USER_BY_ID_OR_NAME(id: string): string {
  if (id === 'u-ishant') return 'Ishant';
  if (id === 'u-mathias') return 'Mathias';
  if (id === 'u-franny') return 'Franny';
  return id;
}

function PCStage5() {
  return (
    <>
      <h2 className="fin-pc-h2">Stage 5 · Per-property adjustments</h2>
      <p className="fin-pc-p">Review every FAD-vs-Guesty divergence. Three explicit decisions per row.</p>
      <div style={{ marginTop: 12 }}>
        <FinanceOwnerStatements />
      </div>
    </>
  );
}

function PCStage7() {
  const k = FIN_OVERVIEW_KPIS;
  const lines = [
    { lab: 'PMC commission earned', amt: 13_420_000, pos: true },
    { lab: 'Cleaning fee revenue (retained)', amt: 1_549_000, pos: true },
    { lab: 'Linen fee revenue', amt: 0, pos: true, note: 'effective June 2026' },
    { lab: 'Direct booking commission (13%)', amt: 285_000, pos: true },
    { lab: 'FR-OPS expenses', amt: 2_127_000, pos: false },
    { lab: 'FR-ADM expenses', amt: 8_412_000, pos: false },
  ];
  const net = lines.reduce((s, l) => s + (l.pos ? l.amt : -l.amt), 0);
  return (
    <>
      <h2 className="fin-pc-h2">Stage 7 · FR-internal P&L preview</h2>
      <p className="fin-pc-p">Visibility only. Phase 2 pushes journal entries to QuickBooks Online.</p>
      <div className="card fin-card" style={{ marginTop: 14 }}>
        <div className="fin-waterfall">
          {lines.map((l, i) => (
            <div key={i} className={'fin-waterfall-row' + (l.pos ? '' : ' deduction')}>
              <div className="fin-waterfall-label">
                <span>{l.lab}</span>
                {l.note && <span className="fin-waterfall-detail">{l.note}</span>}
              </div>
              <div className={'fin-waterfall-amt mono' + (!l.pos ? ' neg' : '')}>
                {!l.pos ? '−' : ''}{formatMUR(l.amt)}
              </div>
            </div>
          ))}
          <div className="fin-waterfall-row subtotal">
            <div className="fin-waterfall-label"><span>Net result · {CURRENT_PERIOD.label}</span></div>
            <div className="fin-waterfall-amt mono">{formatMUR(net)}</div>
          </div>
        </div>
      </div>
    </>
  );
}

function PCStage8({ onClose }: { onClose: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <h2 className="fin-pc-h2">Stage 8 · Lock + post</h2>
      <p className="fin-pc-p">Single irreversible action. Locks the period, generates owner statement PDFs, releases advisory lock.</p>

      <div className="card fin-card" style={{ marginTop: 14, padding: '20px 24px' }}>
        <div className="fin-row-title" style={{ marginBottom: 8 }}>Close period {CURRENT_PERIOD.label}</div>
        <div className="fin-row-sub" style={{ marginBottom: 12 }}>
          This will lock all expenses, payouts, and adjustments for this period. Further changes require admin unlock with documented reason.
        </div>
        <ul style={{ fontSize: 13, color: 'var(--color-text-secondary)', paddingLeft: 18, marginBottom: 16 }}>
          <li>Final audit-log entries written for every transaction in scope</li>
          <li>Per-property adjustment summary CSV generated</li>
          <li>Owner statement waterfall PDF per property</li>
          <li>Tourist-tax filing reminder queued</li>
          <li>Email notification to team</li>
        </ul>
        {!confirming ? (
          <button className="btn primary" onClick={() => setConfirming(true)}>Confirm close</button>
        ) : (
          <div className="fin-capture-actions" style={{ borderTop: 0, padding: 0, justifyContent: 'flex-start' }}>
            <button className="btn ghost" onClick={() => setConfirming(false)}>Cancel</button>
            <button className="btn primary" onClick={onClose}>Yes, lock period</button>
          </div>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────── BANK STATEMENT UPLOAD DRAWER ───────────────────────────────────

function BankUploadDrawer({
  accountId, payoutPlatform, onClose,
}: { accountId?: string; payoutPlatform?: string; onClose: () => void }) {
  const isPayout = !!payoutPlatform;
  const [stage, setStage] = useState<'pick' | 'parsing' | 'preview' | 'committed'>('pick');
  const [selectedAccount, setSelectedAccount] = useState<string>(accountId || FIN_ACCOUNTS[0].id);
  const [selectedPlatform, setSelectedPlatform] = useState<string>(payoutPlatform || 'airbnb');
  const [fileName, setFileName] = useState<string>('');

  const account = FIN_ACCOUNTS.find((a) => a.id === selectedAccount);
  // @demo:config — Hardcoded importable platforms (Airbnb, BDC, Direct). Tenant-configurable when
  // multi-tenant lands. Replace with GET /api/finance/import-platforms returning supported platforms
  // with label, sourceHint, and expected format per platform. Tag: PROD-CONFIG-4.
  const platformLabel: Record<string, { label: string; sourceHint: string; expected: string }> = {
    airbnb: { label: 'Airbnb', sourceHint: 'CSV download · 7 event types', expected: 'CSV with reservation + payout + adjustment events' },
    bdc: { label: 'Booking.com', sourceHint: 'CSV download · per-statement-descriptor reservation linkage', expected: 'CSV with explicit Exchange Rate column' },
    direct: { label: 'Direct booking', sourceHint: 'FR website export · CSV', expected: 'CSV from the booking widget admin' },
  };
  const platform = platformLabel[selectedPlatform];

  // Mock detected lines after parse — in real product, backend parses CSV/PDF
  const detectedLines = [
    { date: '2026-04-26', desc: 'CLIMATE TECH LTD INV 4421', amount: 1_250_000, status: 'proposed', match: 'e1 · Aircon repair VV-47' },
    { date: '2026-04-26', desc: 'PGA CLEANERS', amount: 432_000, status: 'matched', match: 'e2 · Deep clean BL-12' },
    { date: '2026-04-25', desc: 'AIRBNB PAYMENTS UK LTD AXB-8821', amount: 4_822_000, status: 'matched', match: 'pay1 · Apr Airbnb settlement' },
    { date: '2026-04-23', desc: 'BANK TARIFF — WIRE OUT', amount: 1_200, status: 'classified_fee', match: '' },
    { date: '2026-04-22', desc: 'IB Own Account Transfer 002 Top Up', amount: 2_000_000, status: 'classified_topup', match: 'Float top-up to Bryan PM' },
    { date: '2026-04-19', desc: 'unrecognised — supplier truncated', amount: 67_500, status: 'unmatched', match: '' },
    { date: '2026-04-18', desc: 'STANLEY GARDEN CO', amount: 320_000, status: 'matched', match: 'e4 · Garden maintenance VV-47' },
  ];

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    setStage('parsing');
    setTimeout(() => setStage('preview'), 1200);
  };

  return (
    <>
      <div className="fad-drawer-overlay open" onClick={onClose} />
      <div className="fad-drawer open fin-bank-drawer">
        <div className="fad-drawer-header">
          <div className="fad-drawer-title">{isPayout ? 'Upload payout report' : 'Upload bank statement'}</div>
          <button className="fin-drawer-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="fad-drawer-body">
          {stage === 'pick' && (
            <>
              {isPayout ? (
                <>
                  <div className="fin-field">
                    <div className="fin-field-label">Platform</div>
                    <select className="input" value={selectedPlatform} onChange={(e) => setSelectedPlatform(e.target.value)}>
                      <option value="airbnb">Airbnb</option>
                      <option value="bdc">Booking.com</option>
                      <option value="direct">Direct booking</option>
                    </select>
                  </div>
                  <div className="fin-bank-source-info">
                    {platform.sourceHint} — {platform.expected}
                  </div>
                </>
              ) : (
                <>
                  <div className="fin-field">
                    <div className="fin-field-label">Account</div>
                    <select className="input" value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)}>
                      {FIN_ACCOUNTS.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} · {a.bank} · {a.currency}
                        </option>
                      ))}
                    </select>
                  </div>

                  {account && (
                    <div className="fin-bank-source-info">
                      Expected format: <span className="mono">{account.source}</span>
                      {account.source === 'mcb_csv' && ' · CSV with 11 columns · deterministic parser'}
                      {account.source === 'mcb_pdf' && ' · PDF · pdfplumber + OCR fallback'}
                      {account.source === 'maubank_pdf' && ' · MauBank PDF · vision-LLM fallback for OCR misses'}
                    </div>
                  )}
                </>
              )}

              <div className="fin-field" style={{ marginTop: 12 }}>
                <div className="fin-field-label">{isPayout ? 'Payout report file' : 'Statement file'}</div>
                <label className="fin-bank-dropzone">
                  <IconPaperclip size={18} />
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 14, color: 'var(--color-text-primary)' }}>
                      Drop a file or click to choose
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                      Accepts {isPayout ? '.csv' : (account?.source === 'mcb_csv' ? '.csv' : '.pdf')} · max 10 MB
                    </div>
                  </div>
                  <input
                    type="file"
                    accept={isPayout ? '.csv' : (account?.source === 'mcb_csv' ? '.csv' : '.pdf')}
                    onChange={onPickFile}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>

              <div className="fin-bank-tips">
                <div className="fin-field-label">What happens next</div>
                <ol className="fin-bank-steps">
                  <li>File parsed by backend — every line classified.</li>
                  <li>Auto-matcher proposes expense matches by amount + date + vendor token.</li>
                  <li>You review matched / proposed / unmatched lines, then commit.</li>
                  <li>Period close Stage 3 picks up from the committed lines.</li>
                </ol>
              </div>
            </>
          )}

          {stage === 'parsing' && (
            <div className="fin-bank-parsing">
              <div className="fin-bank-spinner" />
              <div style={{ marginTop: 16, fontWeight: 500 }}>Parsing {fileName}…</div>
              <div className="fin-row-sub" style={{ marginTop: 6 }}>
                Reading lines · classifying · proposing matches
              </div>
            </div>
          )}

          {stage === 'preview' && (
            <>
              <div className="fin-bank-summary">
                <div>
                  <div className="fin-row-sub">File</div>
                  <div className="fin-row-title mono">{fileName}</div>
                </div>
                <div>
                  <div className="fin-row-sub">Account</div>
                  <div className="fin-row-title">{account?.name}</div>
                </div>
                <div>
                  <div className="fin-row-sub">Lines detected</div>
                  <div className="fin-row-title">{detectedLines.length}</div>
                </div>
              </div>

              <div className="fin-bank-summary-chips">
                <span className="chip green sm">{detectedLines.filter((l) => l.status === 'matched').length} matched</span>
                <span className="chip warn sm">{detectedLines.filter((l) => l.status === 'proposed').length} proposed</span>
                <span className="chip warn sm">{detectedLines.filter((l) => l.status === 'unmatched').length} unmatched</span>
                <span className="chip sm">{detectedLines.filter((l) => l.status === 'classified_topup' || l.status === 'classified_fee').length} classified</span>
              </div>

              <div className="fin-bank-preview">
                {detectedLines.map((l, i) => (
                  <div key={i} className="fin-bank-preview-row">
                    <div>
                      <div className="fin-row-title">{l.desc}</div>
                      <div className="fin-row-sub mono">{l.date} · {formatCurrency(l.amount, account?.currency || 'MUR')}</div>
                      {l.match && <div className="fin-row-sub" style={{ marginTop: 2 }}>↳ {l.match}</div>}
                    </div>
                    <div>
                      <span className={'fin-status fin-status-' + (l.status === 'matched' || l.status === 'classified_fee' || l.status === 'classified_topup' ? 'posted' : l.status === 'proposed' ? 'pending_approval' : 'submitted')}>
                        {l.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="fin-capture-actions">
                <button className="btn ghost" onClick={() => setStage('pick')}>Back</button>
                <button className="btn primary" onClick={() => setStage('committed')}>
                  Commit {detectedLines.length} lines
                </button>
              </div>
            </>
          )}

          {stage === 'committed' && (
            <div className="fin-bank-done">
              <div className="fin-locked-icon" style={{ background: 'var(--color-bg-success)', color: 'var(--color-text-success)' }}>✓</div>
              <h3 className="fin-locked-title">{detectedLines.length} lines committed</h3>
              <p className="fin-locked-body">
                {account?.name} · last imported now. Period close Stage 3 will see these on next open.
              </p>
              <button className="btn primary" onClick={onClose}>Done</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────── VENDOR DRAWER ───────────────────────────────────

function VendorDrawer({ mode, vendorId, onClose }: { mode: 'add' | 'edit'; vendorId?: string; onClose: () => void }) {
  const { openConfirm } = useFinCtx();
  const existing = vendorId ? FIN_VENDORS.find((v) => v.id === vendorId) : null;
  const [tab, setTab] = useState<'details' | 'banking' | 'expenses' | 'log'>('details');
  const [name, setName] = useState(existing?.name || '');
  const [patterns, setPatterns] = useState<string[]>(existing?.altNames || []);
  const [patternInput, setPatternInput] = useState('');
  const [defaultCategory, setDefaultCategory] = useState(existing?.defaultCategory || '');
  // @demo:config — 'MCB' hardcoded as default bank in vendor-add form. Replace with first
  // connected bank from GET /api/finance/banks (tenant's configured bank accounts). Tag: PROD-CONFIG-5.
  const [bank, setBank] = useState('MCB');
  const [accountNumber, setAccountNumber] = useState('');
  const [iban, setIban] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'wire' | 'ib_transfer' | 'cash' | 'card'>('wire');
  const [notes, setNotes] = useState('');

  const vendorExpenses = vendorId
    ? FIN_EXPENSES.filter((e) => e.vendorId === vendorId)
    : [];
  const totalSpent = vendorExpenses.reduce((s, e) => s + e.amountMinor, 0);

  const addPattern = () => {
    if (patternInput.trim()) {
      setPatterns((p) => [...p, patternInput.trim()]);
      setPatternInput('');
    }
  };
  const removePattern = (i: number) => setPatterns((p) => p.filter((_, idx) => idx !== i));

  // Mock audit log entries for an existing vendor
  const auditLog = existing ? [
    { time: '2026-04-12 14:32', actor: 'Ishant', action: `Added pattern "${existing.altNames[0] || existing.name}"` },
    { time: '2026-03-28 09:15', actor: 'Mary', action: `Updated default category → ${existing.defaultCategory}` },
    { time: '2026-02-10 11:48', actor: 'Mary', action: 'Created vendor record' },
  ] : [];

  return (
    <>
      <div className="fad-drawer-overlay open" onClick={onClose} />
      <div className="fad-drawer open fin-vendor-drawer">
        <div className="fad-drawer-header">
          <div className="fad-drawer-title">{mode === 'add' ? 'New vendor' : existing?.name || 'Vendor'}</div>
          <button className="fin-drawer-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {existing && FRIDAY_VENDOR_HINTS[existing.id] && (
          <div className={'fin-friday-flag fin-friday-flag-inline tone-' + FRIDAY_VENDOR_HINTS[existing.id].tone}>
            <span className="fin-friday-flag-tag"><IconSparkle size={10} /> Friday</span>
            <span>{FRIDAY_VENDOR_HINTS[existing.id].text}</span>
          </div>
        )}

        <div className="fin-settings-tabs" style={{ padding: '0 16px', marginBottom: 0, borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
          <button className={'fin-settings-tab' + (tab === 'details' ? ' active' : '')} onClick={() => setTab('details')}>Details</button>
          <button className={'fin-settings-tab' + (tab === 'banking' ? ' active' : '')} onClick={() => setTab('banking')}>Banking</button>
          {mode === 'edit' && (
            <>
              <button className={'fin-settings-tab' + (tab === 'expenses' ? ' active' : '')} onClick={() => setTab('expenses')}>Expenses ({vendorExpenses.length})</button>
              <button className={'fin-settings-tab' + (tab === 'log' ? ' active' : '')} onClick={() => setTab('log')}>Audit log</button>
            </>
          )}
        </div>

        <div className="fad-drawer-body">
          {tab === 'details' && (
            <div className="fin-capture-form">
              <FormField label="Canonical name">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pereybere Hardware" />
              </FormField>
              <FormField label="Recognition patterns · matched against bank-line description + receipt OCR">
                <div className="fin-pattern-row">
                  <input
                    className="input"
                    value={patternInput}
                    onChange={(e) => setPatternInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPattern(); } }}
                    placeholder="Add pattern, press Enter"
                  />
                  <button type="button" className="btn sm" onClick={addPattern}>Add</button>
                </div>
                <div className="fin-pattern-list">
                  {patterns.map((p, i) => (
                    <span key={i} className="fin-pattern-chip">
                      {p}
                      <button type="button" className="fin-pattern-remove" onClick={() => removePattern(i)} aria-label="Remove">×</button>
                    </span>
                  ))}
                  {patterns.length === 0 && <span className="fin-row-sub">No patterns yet — add substrings of how this vendor appears on statements.</span>}
                </div>
              </FormField>
              <FormField label="Default category">
                <select className="input" value={defaultCategory} onChange={(e) => setDefaultCategory(e.target.value)}>
                  <option value="">— none · classifier picks per capture —</option>
                  {FIN_CATEGORIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.code} · {c.name}</option>
                  ))}
                </select>
              </FormField>
            </div>
          )}

          {tab === 'banking' && (
            <div className="fin-capture-form">
              <div className="fin-field-label" style={{ marginBottom: 8 }}>Vendor banking — used for outgoing wire / IB transfer</div>
              <div className="fin-form-row">
                <FormField label="Bank" style={{ flex: 1 }}>
                  <select className="input" value={bank} onChange={(e) => setBank(e.target.value)}>
                    <option value="MCB">MCB</option>
                    <option value="MauBank">MauBank</option>
                    <option value="SBM">SBM</option>
                    <option value="ABC">ABC Banking</option>
                    <option value="Other">Other</option>
                  </select>
                </FormField>
                <FormField label="Payment method" style={{ flex: 1 }}>
                  <select className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as 'wire' | 'ib_transfer' | 'cash' | 'card')}>
                    <option value="ib_transfer">Internet banking</option>
                    <option value="wire">Wire</option>
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                  </select>
                </FormField>
              </div>
              <FormField label="Account number">
                <input className="input mono" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="000000000000" />
              </FormField>
              <FormField label="IBAN / SWIFT (international)">
                <input className="input mono" value={iban} onChange={(e) => setIban(e.target.value)} placeholder="MUxx xxxx xxxx xxxx · BIC" />
              </FormField>
              <FormField label="Notes">
                <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything relevant — usual contact, GST/VAT registration, payment terms…" />
              </FormField>
            </div>
          )}

          {tab === 'expenses' && (
            <div>
              <div className="fin-vendor-totals">
                <div>
                  <div className="fin-row-sub">YTD spend</div>
                  <div className="fin-row-title mono">{formatMUR(totalSpent)}</div>
                </div>
                <div>
                  <div className="fin-row-sub">Captures</div>
                  <div className="fin-row-title">{vendorExpenses.length}</div>
                </div>
                <div>
                  <div className="fin-row-sub">Last seen</div>
                  <div className="fin-row-title mono">{vendorExpenses[0]?.occurredAt.split(' ')[0] || '—'}</div>
                </div>
              </div>

              <div className="fin-list" style={{ padding: '4px 0 12px' }}>
                {vendorExpenses.length === 0 ? (
                  <div className="fin-empty">No expenses captured for this vendor yet.</div>
                ) : (
                  vendorExpenses.map((e) => (
                    <div key={e.id} className="fin-row-item">
                      <div className="fin-row-main">
                        <div className="fin-row-title">{e.description}</div>
                        <div className="fin-row-sub">
                          {e.occurredAt.split(' ')[0]} · {e.propertyCode || '—'} · {e.categoryCode} · {e.enteredBy}
                        </div>
                      </div>
                      <div className="fin-row-meta">
                        <div className="fin-row-amount">{formatCurrency(e.amountMinor, e.currency)}</div>
                        <span className={'fin-status fin-status-' + e.status}>{e.status.replace('_', ' ')}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {tab === 'log' && (
            <div className="fin-list" style={{ padding: '4px 0 12px' }}>
              {auditLog.map((l, i) => (
                <div key={i} className="fin-row-item">
                  <div className="fin-row-main">
                    <div className="fin-row-title">{l.action}</div>
                    <div className="fin-row-sub">{l.actor}</div>
                  </div>
                  <div className="fin-row-meta">
                    <div className="fin-row-sub mono">{l.time}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="fin-capture-actions">
            <button className="btn ghost" onClick={onClose}>Cancel</button>
            {mode === 'edit' && (
              <button
                className="btn ghost"
                style={{ color: 'var(--color-text-danger)' }}
                onClick={() => openConfirm({
                  title: `Merge ${existing?.name} with…`,
                  body: (
                    <>
                      <p>Pick the canonical vendor to merge into. Recognition patterns + expense history + banking details are folded in. The merged-from record becomes a redirect.</p>
                      <p style={{ marginTop: 8, color: 'var(--color-text-warning)' }}>⚠ Irreversible. Audit log captures both records' state at merge time.</p>
                    </>
                  ),
                  primaryLabel: 'Pick target',
                  primaryTone: 'danger',
                })}
              >Merge with…</button>
            )}
            <button className="btn primary" onClick={onClose}>
              {mode === 'add' ? 'Create vendor' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function FormField({
  label, children, style,
}: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="fin-field" style={style}>
      {label && <div className="fin-field-label">{label}</div>}
      {children}
    </div>
  );
}
