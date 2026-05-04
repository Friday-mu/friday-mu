'use client';

import { useMemo, useState } from 'react';
import {
  designClient,
  formatMUR,
  type BudgetItem,
  type DesignProject,
} from '../../../../_data/design';
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
  const allItems = designClient.budgetItems.list(project.id);
  const rooms = designClient.rooms.list(project.id);
  const [ownerView, setOwnerView] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(rooms.map((r) => r.id)));
  const [tab, setTab] = useState<'items' | 'quotes'>('items');

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
      {/* Project totals */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <MetricCard label="Approved total" value={formatMUR(totals.approvedSum)} />
        <MetricCard label="Actual paid" value={formatMUR(totals.paidSum)} tone="info" />
        <MetricCard label="Remaining" value={formatMUR(totals.remaining)} tone="warning" />
        <MetricCard label="Pending approval" value={`${totals.pendingApproval} items`} tone="accent" />
      </div>

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
