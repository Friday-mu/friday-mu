'use client';

import { useMemo, useState } from 'react';
import {
  designClient,
  formatMUR,
  CHANGE_ORDERS as FIXTURE_CHANGE_ORDERS,
  type BudgetCategory,
  type BudgetItem,
  type ChangeOrder,
  type ChangeOrderLineItem,
  type DesignProject,
} from '../../../../_data/design';
import { createChangeOrder as apiCreateChangeOrder, apiChangeOrderToFixture } from '../../../../_data/designClient';
import { bumpFixtureRev, useFixtureRev } from '../../../../_data/fixtureRev';
import { fireToast } from '../../../Toaster';
import { AIPlaceholder } from '../AIPlaceholder';

/**
 * Mock-only stand-in for the authenticated FAD user. Phase 5 lock — Ishant is
 * the sole approver, so the magic-link issuance logs his ID. v0.2 reads from
 * real auth.
 *
 * @demo:auth — Replace with real session id. Tag: PROD-DESIGN-PORTAL-AUTH.
 */
const MOCK_BY_USER_ID = 'u-ishant';

function sendPackageForApproval(project: DesignProject, pkgId: string) {
  const link = designClient.magicLinks.issue({
    projectId: project.id,
    byUserId: MOCK_BY_USER_ID,
    forArtifactId: pkgId,
    forArtifactType: 'budget_package',
  });
  if (!link) {
    fireToast(`Couldn't send: project not found`);
    return;
  }
  fireToast(`Magic link issued for ${pkgId} — paste from activity log into WhatsApp`);
}

interface Props {
  project: DesignProject;
}

export function FinalBudgetStage({ project }: Props) {
  // Subscribe to global fixture-rev so adds in other stages
  // (rooms in SiteVisitStage, items in ChangeOrdersSection, payments)
  // re-render the final-budget totals + chips without remount.
  const fixtureRev = useFixtureRev();
  void fixtureRev;
  const allItems = designClient.budgetItems.list(project.id);
  const rooms = designClient.rooms.list(project.id);
  const [ownerView, setOwnerView] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(rooms.map((r) => r.id)));
  const [tab, setTab] = useState<'items' | 'quotes'>('items');
  // Single rev bumper drives both the totals chip and the change-orders list.
  // Mutations from ChangeOrdersSection lift this to keep the projected
  // delta in sync with the underlying CO state.
  const [coRev, setCoRev] = useState(0);
  const bumpCoRev = () => setCoRev((r) => r + 1);

  const totals = useMemo(() => {
    const approvedSum = allItems.filter((i) => i.status === 'approved').reduce((s, i) => s + (i.finalApprovedCostMinor ?? 0), 0);
    const paidSum = allItems.reduce((s, i) => s + (i.actualPaidMinor ?? 0), 0);
    const remaining = approvedSum - paidSum;
    const pendingApproval = allItems.filter((i) => i.status === 'pending').length;
    return { approvedSum, paidSum, remaining, pendingApproval };
  }, [allItems]);

  const toggleRoom = (id: string) =>
    setExpanded((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Final procurement budget</h3>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              16-column structure (Stage 11 lock). Per-package approval. Owner view strips retail / negotiated / internal columns.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-secondary)' }}>
              <input type="checkbox" checked={ownerView} onChange={(e) => setOwnerView(e.target.checked)} />
              Owner view
            </label>
            <AIPlaceholder feature="final-budget-suggest" label="Suggest items" size="sm" />
          </div>
        </div>
        <div role="tablist" aria-label="Final budget views" style={{ display: 'flex', gap: 4, marginTop: 12, borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
          {(['items', 'quotes'] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              style={{
                padding: '8px 14px',
                fontSize: 12,
                fontWeight: tab === id ? 600 : 500,
                color: tab === id ? 'var(--color-brand-accent)' : 'var(--color-text-secondary)',
                borderBottom: tab === id ? '2px solid var(--color-brand-accent)' : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {id === 'items' ? 'Items' : 'Quotes'}
            </button>
          ))}
        </div>
      </Card>

      {tab === 'quotes' && (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 16px', textAlign: 'center', gap: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 'var(--radius-full)', background: 'var(--color-brand-accent-soft)', color: 'var(--color-brand-accent)' }}>
              Coming in the wiring sprint
            </div>
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Quote comparison</h4>
            <p style={{ margin: 0, maxWidth: 480, fontSize: 12, color: 'var(--color-text-secondary)' }}>
              Side-by-side view of vendor quotes per package (e.g. masonry, M&amp;E, custom cabinetry). Procurement staff capture quotes here so the director can approve the cheapest reasonable bid in one click. Routes through the wiring sprint when the vendor module ships its quotes endpoint.
            </p>
          </div>
        </Card>
      )}

      {tab === 'items' && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Project totals — coRev forces re-read of the change-order delta */}
      <BudgetTotals project={project} totals={totals} coRev={coRev} />

      <ChangeOrdersSection project={project} onChanged={bumpCoRev} />

      {/* Per-room sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rooms.map((r) => {
          const items = allItems.filter((i) => i.roomId === r.id);
          if (items.length === 0) return null;
          const roomApproved = items.filter((i) => i.status === 'approved').reduce((s, i) => s + (i.finalApprovedCostMinor ?? 0), 0);
          const roomPaid = items.reduce((s, i) => s + (i.actualPaidMinor ?? 0), 0);
          const roomPending = items.filter((i) => i.status === 'pending').length;
          const isExpanded = expanded.has(r.id);
          // Group by packageId so user can approve a whole package
          const packageIds = Array.from(new Set(items.map((i) => i.packageId)));
          return (
            <div key={r.id} style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => toggleRoom(r.id)}
                style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', textAlign: 'left' }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                    {items.length} items · {packageIds.length} package{packageIds.length === 1 ? '' : 's'}
                    {roomPending > 0 && <span style={{ color: 'var(--color-text-warning)', marginLeft: 6 }}>· {roomPending} pending owner approval</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ textAlign: 'right', fontSize: 11 }}>
                    <div><strong>{formatMUR(roomApproved)}</strong> approved</div>
                    <div style={{ color: 'var(--color-text-tertiary)' }}>{formatMUR(roomPaid)} paid</div>
                  </div>
                  <span style={{ color: 'var(--color-text-tertiary)' }}>{isExpanded ? '▾' : '▸'}</span>
                </div>
              </button>

              {isExpanded && (
                <div style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                  {packageIds.map((pkgId) => {
                    const pkgItems = items.filter((i) => i.packageId === pkgId);
                    const pkgApproved = pkgItems.every((i) => i.status === 'approved');
                    const pkgPending = pkgItems.some((i) => i.status === 'pending');
                    return (
                      <div key={pkgId} style={{ padding: '8px 14px', borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
                          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                            Package · <code style={{ fontFamily: 'var(--font-mono-fad)' }}>{pkgId}</code>{' '}
                            {pkgApproved && <span style={{ color: 'var(--color-text-success)' }}>· approved</span>}
                            {pkgPending && <span style={{ color: 'var(--color-text-warning)' }}>· pending</span>}
                          </div>
                          {!ownerView && pkgPending && (
                            <button
                              type="button"
                              onClick={() => sendPackageForApproval(project, pkgId)}
                              style={primaryBtn()}
                            >
                              Send package for approval
                            </button>
                          )}
                        </div>
                        <ItemTable items={pkgItems} ownerView={ownerView} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      </div>
      )}
    </div>
  );
}

function ItemTable({ items, ownerView }: { items: BudgetItem[]; ownerView: boolean }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', minWidth: 700 }}>
        <thead>
          <tr style={{ color: 'var(--color-text-tertiary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            <th style={cell('left')}>Item</th>
            <th style={cell('left')}>Cat.</th>
            <th style={cell('right')}>Qty</th>
            <th style={cell('left')}>Vendor</th>
            {!ownerView && <th style={cell('right')}>Retail</th>}
            {!ownerView && <th style={cell('right')}>Negotiated</th>}
            <th style={cell('right')}>Approved</th>
            <th style={cell('right')}>Paid</th>
            <th style={cell('right')}>VAT</th>
            <th style={cell('left')}>Status</th>
            <th style={cell('left')}>Procurement</th>
            {!ownerView && <th style={cell('left')}>Owner-bill</th>}
            {!ownerView && <th style={cell('left')}>Internal</th>}
            <th style={cell('left')}>Receipt</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => {
            const v = i.vendorId ? designClient.vendors.get(i.vendorId) : null;
            return (
              <tr key={i.id} style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                <td style={cell('left')}>
                  <div style={{ fontWeight: 500 }}>{i.itemName}</div>
                  {i.itemDescription && <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{i.itemDescription}</div>}
                </td>
                <td style={{ ...cell('left'), color: 'var(--color-text-tertiary)' }}>{i.category}</td>
                <td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)' }}>{i.qty}</td>
                <td style={cell('left')}>{v?.name ?? '—'}</td>
                {!ownerView && <td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)', color: 'var(--color-text-tertiary)' }}>{formatMUR(i.retailCostMinor)}</td>}
                {!ownerView && <td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)', color: 'var(--color-text-tertiary)' }}>{formatMUR(i.negotiatedCostMinor)}</td>}
                <td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)', fontWeight: 600 }}>{formatMUR(i.finalApprovedCostMinor)}</td>
                <td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)' }}>{formatMUR(i.actualPaidMinor)}</td>
                <td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)', color: 'var(--color-text-tertiary)' }}>{formatMUR(i.vatMinor)}</td>
                <td style={cell('left')}><StatusChip status={i.status} /></td>
                <td style={cell('left')}><span style={{ color: 'var(--color-text-info)', fontSize: 10 }}>{i.procurement}</span></td>
                {!ownerView && <td style={cell('left')}>{i.ownerBillable ? '✓' : '—'}</td>}
                {!ownerView && <td style={cell('left')}>{i.internalWork ? '⚙️' : '—'}</td>}
                <td style={cell('left')}>{i.receiptUrl ? <a href={i.receiptUrl} style={{ color: 'var(--color-text-info)', fontSize: 10 }}>📄</a> : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StatusChip({ status }: { status: BudgetItem['status'] }) {
  const c =
    status === 'approved' ? { bg: 'var(--color-bg-success)', fg: 'var(--color-text-success)' } :
    status === 'pending'  ? { bg: 'var(--color-bg-warning)', fg: 'var(--color-text-warning)' } :
    status === 'rejected' ? { bg: 'var(--color-bg-danger)',  fg: 'var(--color-text-danger)' } :
                             { bg: 'var(--color-bg-info)',    fg: 'var(--color-text-info)' };
  return <span style={{ padding: '1px 6px', background: c.bg, color: c.fg, borderRadius: 'var(--radius-full)', fontSize: 9 }}>{status}</span>;
}

// ─────────────────────────── BUDGET TOTALS w/ change-order delta (cont-17) ───────────────────────────

interface BudgetTotalsValue {
  approvedSum: number;
  paidSum: number;
  remaining: number;
  pendingApproval: number;
}

function BudgetTotals({ project, totals, coRev: _coRev }: { project: DesignProject; totals: BudgetTotalsValue; coRev: number }) {
  // _coRev unused — its purpose is to invalidate via prop change and trigger a re-read.
  const coDelta = designClient.changeOrders.sumDelta(project.id);
  const projectedTotal = totals.approvedSum + coDelta.approvedMinor + coDelta.pendingMinor;
  const hasChangeOrders = coDelta.approvedMinor !== 0 || coDelta.pendingMinor !== 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <MetricCard label="Approved total" value={formatMUR(totals.approvedSum)} />
        <MetricCard label="Actual paid" value={formatMUR(totals.paidSum)} tone="info" />
        <MetricCard label="Remaining" value={formatMUR(totals.remaining)} tone="warning" />
        <MetricCard label="Pending approval" value={`${totals.pendingApproval} items`} tone="accent" />
      </div>
      {hasChangeOrders && (
        <div
          data-design-co-delta-chip
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
            padding: '8px 12px',
            background: 'var(--color-background-tertiary)',
            border: '0.5px solid var(--color-border-tertiary)',
            borderRadius: 'var(--radius-md)',
            fontSize: 11,
          }}
        >
          <div style={{ color: 'var(--color-text-secondary)' }}>
            Change orders affect this budget
            {coDelta.approvedMinor !== 0 && (
              <>
                {' · '}
                <strong style={{ color: coDelta.approvedMinor >= 0 ? 'var(--color-text-warning)' : 'var(--color-text-success)' }}>
                  {coDelta.approvedMinor >= 0 ? '+' : ''}{formatMUR(coDelta.approvedMinor)}
                </strong>{' '}
                approved
              </>
            )}
            {coDelta.pendingMinor !== 0 && (
              <>
                {' · '}
                <strong style={{ color: 'var(--color-text-info)' }}>
                  {coDelta.pendingMinor >= 0 ? '+' : ''}{formatMUR(coDelta.pendingMinor)}
                </strong>{' '}
                pending owner
              </>
            )}
          </div>
          <div style={{ fontFamily: 'var(--font-mono-fad)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            Projected: {formatMUR(projectedTotal)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── CHANGE ORDERS (cont-17, audit A7) ───────────────────────────

const CO_CATEGORIES: BudgetCategory[] = [
  'furniture', 'appliance', 'decor', 'lighting', 'linen', 'contractor', 'labour', 'transport', 'cleaning',
];

function ChangeOrdersSection({ project, onChanged }: { project: DesignProject; onChanged: () => void }) {
  // Local rev keeps this component re-rendering after mutations; onChanged
  // notifies the parent so the totals chip re-reads the delta in lockstep.
  const [, setRev] = useState(0);
  const bump = () => { setRev((r) => r + 1); onChanged(); };
  const [showCreate, setShowCreate] = useState(false);
  const [openCoId, setOpenCoId] = useState<string | null>(null);

  const orders = designClient.changeOrders.list(project.id);
  const drafts = orders.filter((c) => c.state === 'draft');
  const sent = orders.filter((c) => c.state === 'sent');
  const decided = orders.filter((c) => c.state === 'approved' || c.state === 'rejected');

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <div>
          <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Change orders</h4>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            Scope changes after the budget is signed. Owner sees the delta inline and approves once — feeds back into the budget on accept.
            {' · '}{drafts.length} draft · {sent.length} awaiting · {decided.length} decided
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          style={primaryBtnLarge()}
          data-design-co-new
        >
          {showCreate ? 'Cancel' : '+ New change order'}
        </button>
      </div>

      {showCreate && (
        <NewChangeOrderForm
          project={project}
          onCancel={() => setShowCreate(false)}
          onCreated={(co) => {
            setShowCreate(false);
            setOpenCoId(co.id);
            bump();
          }}
        />
      )}

      {orders.length === 0 && !showCreate ? (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', padding: '12px 0' }}>
          No change orders yet. Create one when scope shifts after the budget is signed — extra rooms, swapped fixtures, owner upgrades.
        </div>
      ) : (
        <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {orders.map((co) => (
            <ChangeOrderRow
              key={co.id}
              co={co}
              isOpen={openCoId === co.id}
              onToggle={() => setOpenCoId((id) => (id === co.id ? null : co.id))}
              onChanged={bump}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function NewChangeOrderForm({
  project,
  onCancel,
  onCreated,
}: {
  project: DesignProject;
  onCancel: () => void;
  onCreated: (co: ChangeOrder) => void;
}) {
  const [title, setTitle] = useState('');
  const [reason, setReason] = useState('');
  const [creating, setCreating] = useState(false);
  const canCreate = title.trim().length > 0 && !creating;
  return (
    <div
      data-design-co-new-form
      style={{
        background: 'var(--color-background-tertiary)',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--radius-md)',
        padding: 12,
        marginBottom: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <label style={fieldLabel()}>
        Title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder='e.g. "Add powder-room makeover (scope expansion)"'
          style={inputStyle()}
        />
      </label>
      <label style={fieldLabel()}>
        Reason (owner reads this)
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why the change. The owner sees this on the approval card."
          rows={3}
          style={{ ...inputStyle(), resize: 'vertical', minHeight: 60 }}
        />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          disabled={!canCreate}
          onClick={async () => {
            setCreating(true);
            try {
              const apiCo = await apiCreateChangeOrder({
                project_id: project.id,
                title: title.trim(),
                reason: reason.trim(),
                line_items: [],
              });
              const fixtureCo = apiChangeOrderToFixture(apiCo);
              FIXTURE_CHANGE_ORDERS.push(fixtureCo);
              bumpFixtureRev();
              fireToast(`Draft ${fixtureCo.number} created — add line items before sending.`);
              onCreated(fixtureCo);
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              fireToast(`Failed to create change order: ${msg}`);
            } finally {
              setCreating(false);
            }
          }}
          style={canCreate ? primaryBtnLarge() : { ...primaryBtnLarge(), opacity: 0.5, cursor: 'not-allowed' }}
        >
          {creating ? 'Creating…' : 'Create draft'}
        </button>
        <button type="button" onClick={onCancel} disabled={creating} style={secondaryBtnLarge()}>Cancel</button>
      </div>
    </div>
  );
}

function ChangeOrderRow({
  co,
  isOpen,
  onToggle,
  onChanged,
}: {
  co: ChangeOrder;
  isOpen: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const total = designClient.changeOrders.total(co);
  const isDraft = co.state === 'draft';
  return (
    <li
      data-design-co-row={co.id}
      style={{
        background: 'var(--color-background-primary)',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--radius-md)',
        padding: 12,
      }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap', cursor: 'pointer' }}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        data-design-co-toggle={co.id}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500, fontSize: 13 }}>
            <span style={{ fontFamily: 'var(--font-mono-fad)', color: 'var(--color-text-tertiary)', marginRight: 6, whiteSpace: 'nowrap' }}>{co.number}</span>
            {co.title || <em style={{ color: 'var(--color-text-tertiary)' }}>Untitled</em>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
            {co.lineItems.length} line item{co.lineItems.length === 1 ? '' : 's'}
            {co.sentAt && ` · sent ${co.sentAt.slice(0, 10)}`}
            {co.decidedAt && ` · decided ${co.decidedAt.slice(0, 10)}`}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'var(--font-mono-fad)', fontWeight: 600, fontSize: 13, color: total >= 0 ? 'var(--color-text-warning)' : 'var(--color-text-success)' }}>
            {total >= 0 ? '+' : ''}{formatMUR(total)}
          </span>
          <ChangeOrderStateChip state={co.state} />
          <span aria-hidden style={{ color: 'var(--color-text-tertiary)', fontSize: 12, lineHeight: 1, transition: 'transform 0.15s ease', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▾</span>
        </div>
      </div>

      {isOpen && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '0.5px solid var(--color-border-tertiary)' }}>
          {co.reason && (
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5, marginBottom: 12 }}>
              {co.reason}
            </div>
          )}
          {isDraft ? (
            <DraftCoEditor co={co} onChanged={onChanged} />
          ) : (
            <SentCoReadOnly co={co} />
          )}
        </div>
      )}
    </li>
  );
}

function DraftCoEditor({ co, onChanged }: { co: ChangeOrder; onChanged: () => void }) {
  const [showAddLine, setShowAddLine] = useState(false);
  const total = designClient.changeOrders.total(co);
  const canSend = co.lineItems.length >= 1 && co.title.trim().length > 0;
  const project = designClient.projects.get(co.projectId);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Line items</div>
      {co.lineItems.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          No line items yet. Add at least one before sending. Use a negative cost for removals.
        </div>
      ) : (
        <CoLineItemsTable
          lineItems={co.lineItems}
          onRemove={(lineId) => {
            if (designClient.changeOrders.removeLine(co.id, lineId)) {
              fireToast('Line removed.');
              onChanged();
            }
          }}
        />
      )}

      {showAddLine ? (
        <AddCoLineForm
          onCancel={() => setShowAddLine(false)}
          onSubmit={(input) => {
            if (designClient.changeOrders.addLine(co.id, input)) {
              fireToast('Line added.');
              setShowAddLine(false);
              onChanged();
            }
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowAddLine(true)}
          style={secondaryBtnLarge()}
          data-design-co-add-line={co.id}
        >
          + Add line item
        </button>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Delete draft ${co.number}? This cannot be undone.`)) {
              if (designClient.changeOrders.delete(co.id)) {
                fireToast('Draft deleted.');
                onChanged();
              }
            }
          }}
          style={dangerLinkBtn()}
          data-design-co-delete={co.id}
        >
          Delete draft
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Draft total</span>
          <span style={{ fontFamily: 'var(--font-mono-fad)', fontWeight: 600, fontSize: 13, color: total >= 0 ? 'var(--color-text-warning)' : 'var(--color-text-success)' }}>
            {total >= 0 ? '+' : ''}{formatMUR(total)}
          </span>
          {project && (
            <a
              href={`/design-docs/change-order?pid=${project.id}&co=${co.id}`}
              target="_blank"
              rel="noopener"
              data-doc-link="change-order"
              style={{ ...secondaryBtnLarge(), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
            >
              Preview ↗
            </a>
          )}
          <button
            type="button"
            disabled={!canSend}
            onClick={() => {
              if (designClient.changeOrders.send(co.id)) {
                fireToast(`${co.number} sent to owner — visible in their Approvals tab.`);
                onChanged();
              }
            }}
            style={canSend ? primaryBtnLarge() : { ...primaryBtnLarge(), opacity: 0.5, cursor: 'not-allowed' }}
            title={canSend ? '' : 'Need a title and at least 1 line item.'}
            data-design-co-send={co.id}
          >
            Send to owner
          </button>
        </div>
      </div>
    </div>
  );
}

function CoLineItemsTable({
  lineItems,
  onRemove,
}: {
  lineItems: ChangeOrderLineItem[];
  onRemove?: (lineId: string) => void;
}) {
  return (
    <div style={{ overflowX: 'auto', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)' }}>
      <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', minWidth: 460 }}>
        <thead>
          <tr style={{ color: 'var(--color-text-tertiary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, background: 'var(--color-background-tertiary)' }}>
            <th style={cell('left')}>Item</th>
            <th style={cell('left')}>Cat.</th>
            <th style={cell('right')}>Qty</th>
            <th style={cell('right')}>Per unit</th>
            <th style={cell('right')}>Line total</th>
            {onRemove && <th style={cell('right')}> </th>}
          </tr>
        </thead>
        <tbody>
          {lineItems.map((li) => {
            const lineTotal = li.qty * li.costMinor;
            return (
              <tr key={li.id} style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                <td style={cell('left')}>
                  <div style={{ fontWeight: 500 }}>{li.itemName}</div>
                  {li.itemDescription && <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{li.itemDescription}</div>}
                </td>
                <td style={{ ...cell('left'), color: 'var(--color-text-tertiary)' }}>{li.category}</td>
                <td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)' }}>{li.qty}</td>
                <td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)' }}>{formatMUR(li.costMinor)}</td>
                <td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)', fontWeight: 600, color: lineTotal >= 0 ? 'var(--color-text-warning)' : 'var(--color-text-success)' }}>
                  {lineTotal >= 0 ? '+' : ''}{formatMUR(lineTotal)}
                </td>
                {onRemove && (
                  <td style={cell('right')}>
                    <button
                      type="button"
                      onClick={() => onRemove(li.id)}
                      style={dangerLinkBtn()}
                    >
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface AddCoLineFormValues {
  itemName: string;
  itemDescription: string | null;
  category: BudgetCategory;
  qty: number;
  costMinor: number;
  budgetItemId: string | null;
}

function AddCoLineForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (input: AddCoLineFormValues) => void;
}) {
  const [itemName, setItemName] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [category, setCategory] = useState<BudgetCategory>('furniture');
  const [qty, setQty] = useState<number>(1);
  const [costMinor, setCostMinor] = useState<number | ''>('');
  const [isRemoval, setIsRemoval] = useState(false);

  const canSubmit = itemName.trim().length > 0 && costMinor !== '' && qty > 0;

  return (
    <div
      data-design-co-add-line-form
      style={{
        background: 'var(--color-background-tertiary)',
        border: '0.5px dashed var(--color-border-secondary)',
        borderRadius: 'var(--radius-md)',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <label style={fieldLabel()}>
        Item name
        <input
          value={itemName}
          onChange={(e) => setItemName(e.target.value)}
          placeholder='e.g. "Wall-mounted basin + brass tap"'
          style={inputStyle()}
        />
      </label>
      <label style={fieldLabel()}>
        Description (optional)
        <input
          value={itemDescription}
          onChange={(e) => setItemDescription(e.target.value)}
          placeholder='e.g. "White ceramic basin, brass mixer."'
          style={inputStyle()}
        />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
        <label style={fieldLabel()}>
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value as BudgetCategory)} style={inputStyle()}>
            {CO_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label style={fieldLabel()}>
          Qty
          <input
            inputMode="numeric"
            value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value.replace(/[^\d]/g, '')) || 1))}
            style={inputStyle()}
          />
        </label>
        <label style={fieldLabel()}>
          Per-unit cost (Rs)
          <MUInput value={costMinor} onChange={setCostMinor} />
        </label>
      </div>
      <label style={{ ...fieldLabel(), flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          checked={isRemoval}
          onChange={(e) => setIsRemoval(e.target.checked)}
        />
        <span>Removal — record this as a credit (negative line total)</span>
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => onSubmit({
            itemName: itemName.trim(),
            itemDescription: itemDescription.trim() === '' ? null : itemDescription.trim(),
            category,
            qty,
            costMinor: isRemoval ? -(costMinor as number) : (costMinor as number),
            budgetItemId: null,
          })}
          style={canSubmit ? primaryBtnLarge() : { ...primaryBtnLarge(), opacity: 0.5, cursor: 'not-allowed' }}
          data-design-co-add-line-submit
        >
          Add line
        </button>
        <button type="button" onClick={onCancel} style={secondaryBtnLarge()}>Cancel</button>
      </div>
    </div>
  );
}

function SentCoReadOnly({ co }: { co: ChangeOrder }) {
  const total = designClient.changeOrders.total(co);
  const project = designClient.projects.get(co.projectId);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <CoLineItemsTable lineItems={co.lineItems} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          {co.state === 'sent' && 'Sent to owner. Locked from edits — they either approve or reject.'}
          {co.state === 'approved' && '✓ Approved. Budget reflects this delta.'}
          {co.state === 'rejected' && 'Rejected by owner. Scope reverts to pre-CO baseline.'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {project && (
            <a
              href={`/design-docs/change-order?pid=${project.id}&co=${co.id}`}
              target="_blank"
              rel="noopener"
              data-doc-link="change-order"
              style={{ fontSize: 11, color: 'var(--color-brand-accent)', textDecoration: 'none' }}
            >
              Preview ↗
            </a>
          )}
          <span style={{ fontFamily: 'var(--font-mono-fad)', fontWeight: 600, fontSize: 13, color: total >= 0 ? 'var(--color-text-warning)' : 'var(--color-text-success)' }}>
            Net {total >= 0 ? '+' : ''}{formatMUR(total)}
          </span>
        </div>
      </div>
      {co.ownerComment && (
        <div
          style={{
            padding: 10,
            background: co.state === 'rejected' ? 'var(--color-bg-warning)' : 'var(--color-background-tertiary)',
            color: co.state === 'rejected' ? 'var(--color-text-warning)' : 'var(--color-text-secondary)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 12,
          }}
        >
          <strong>Owner:</strong> "{co.ownerComment}"
        </div>
      )}
    </div>
  );
}

function ChangeOrderStateChip({ state }: { state: ChangeOrder['state'] }) {
  const c =
    state === 'draft'    ? { bg: 'var(--color-background-tertiary)', fg: 'var(--color-text-tertiary)', label: 'draft' } :
    state === 'sent'     ? { bg: 'var(--color-bg-info)',             fg: 'var(--color-text-info)',     label: 'awaiting owner' } :
    state === 'approved' ? { bg: 'var(--color-bg-success)',          fg: 'var(--color-text-success)',  label: 'approved' } :
                            { bg: 'var(--color-bg-warning)',         fg: 'var(--color-text-warning)',  label: 'rejected' };
  return <span style={{ padding: '2px 8px', background: c.bg, color: c.fg, borderRadius: 'var(--radius-full)', fontSize: 10, fontWeight: 500, alignSelf: 'flex-start' }}>{c.label}</span>;
}

function MUInput({ value, onChange }: { value: number | ''; onChange: (v: number | '') => void }) {
  return (
    <input
      inputMode="numeric"
      value={value === '' ? '' : Math.round((value as number) / 100).toString()}
      onChange={(e) => {
        const cleaned = e.target.value.replace(/[^\d]/g, '');
        if (cleaned === '') return onChange('');
        onChange(Number(cleaned) * 100);
      }}
      placeholder="MUR amount"
      style={inputStyle()}
    />
  );
}

function fieldLabel(): React.CSSProperties {
  return { fontSize: 11, color: 'var(--color-text-tertiary)', display: 'flex', flexDirection: 'column', gap: 4 };
}
function inputStyle(): React.CSSProperties {
  return {
    padding: '6px 8px',
    fontSize: 12,
    border: '0.5px solid var(--color-border-tertiary)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-background-primary)',
    color: 'var(--color-text-primary)',
  };
}
function dangerLinkBtn(): React.CSSProperties {
  return { padding: '4px 0', fontSize: 11, color: 'var(--color-text-danger)', background: 'transparent', textDecoration: 'underline', fontWeight: 500 };
}
function primaryBtnLarge(): React.CSSProperties {
  return { padding: '6px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--color-brand-accent)', color: '#fff', fontSize: 12, fontWeight: 500 };
}
function secondaryBtnLarge(): React.CSSProperties {
  return { padding: '6px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-tertiary)', color: 'var(--color-text-primary)', fontSize: 12, fontWeight: 500, border: '0.5px solid var(--color-border-tertiary)' };
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone?: 'info' | 'warning' | 'accent' }) {
  const color = tone === 'info' ? 'var(--color-text-info)' : tone === 'warning' ? 'var(--color-text-warning)' : tone === 'accent' ? 'var(--color-brand-accent)' : 'var(--color-text-primary)';
  return (
    <div style={{ padding: 12, background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)' }}>
      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color, marginTop: 4, fontFamily: 'var(--font-mono-fad)' }}>{value}</div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)', padding: 14 }}>{children}</div>;
}
function cell(align: 'left' | 'right'): React.CSSProperties {
  return { padding: '6px 8px', textAlign: align, verticalAlign: 'top', whiteSpace: 'nowrap' };
}
function primaryBtn(): React.CSSProperties { return { padding: '4px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--color-brand-accent)', color: '#fff', fontSize: 11, fontWeight: 500 }; }
