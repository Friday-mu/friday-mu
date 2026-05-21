'use client';

import { useMemo } from 'react';
import {
  designClient,
  formatMUR,
  type BudgetItem,
  type ProcurementStatus as ProcStatus,
} from '../../../../_data/design';
import { fireToast } from '../../../Toaster';

interface Props {
  item: BudgetItem;
  onClose: () => void;
}

interface ChainStep {
  id: 'sourcing' | 'quote' | 'po' | 'delivery' | 'install' | 'qa';
  label: string;
  /** Procurement statuses that mean this step is complete. */
  completedAtStatuses: ProcStatus[];
}

const STEPS: ChainStep[] = [
  { id: 'sourcing', label: 'Sourcing',  completedAtStatuses: ['quote_received', 'approved_to_buy', 'ordered', 'delivered', 'installed', 'qa_passed'] },
  { id: 'quote',    label: 'Quote',     completedAtStatuses: ['approved_to_buy', 'ordered', 'delivered', 'installed', 'qa_passed'] },
  { id: 'po',       label: 'PO issued', completedAtStatuses: ['ordered', 'delivered', 'installed', 'qa_passed'] },
  { id: 'delivery', label: 'Delivery',  completedAtStatuses: ['delivered', 'installed', 'qa_passed'] },
  { id: 'install',  label: 'Install',   completedAtStatuses: ['installed', 'qa_passed'] },
  { id: 'qa',       label: 'QA pass',   completedAtStatuses: ['qa_passed'] },
];

type StepState = 'done' | 'active' | 'upcoming';

function stepStateFor(step: ChainStep, status: ProcStatus): StepState {
  if (step.completedAtStatuses.includes(status)) return 'done';
  // Active = the step that this procurement status maps onto.
  if (
    (step.id === 'sourcing' && status === 'to_source') ||
    (step.id === 'quote' && status === 'quote_received') ||
    (step.id === 'po' && status === 'approved_to_buy') ||
    (step.id === 'delivery' && status === 'ordered') ||
    (step.id === 'install' && status === 'delivered') ||
    (step.id === 'qa' && status === 'installed')
  ) {
    return 'active';
  }
  return 'upcoming';
}

/**
 * Cont-13 audit A8: shows a single budget item's full procurement chain
 * (sourcing → quote → PO → delivery → install → QA) in one drawer instead
 * of the user chasing the same item across Final Budget / Procurement /
 * Execution / Reconciliation tabs. Industry pattern (DesignFiles, Studio
 * Designer): one linked record per line item.
 *
 * v0.1: read-only view sourced from BudgetItem fields. v0.2 wire — every
 * step gets its own concrete object on the backend (Quote, PurchaseOrder,
 * DeliveryConfirmation, InstallRecord, QAPass) linked by budgetItemId.
 */
export function ProcurementChainDrawer({ item, onClose }: Props) {
  const vendor = useMemo(() => (item.vendorId ? designClient.vendors.get(item.vendorId) : null), [item.vendorId]);
  const project = designClient.projects.get(item.projectId);
  const rooms = useMemo(() => designClient.rooms.list(item.projectId), [item.projectId]);
  const room = rooms.find((r) => r.id === item.roomId);
  const tasks = useMemo(
    () => designClient.tasks.list(item.projectId).filter((t) => t.budgetItemId === item.id),
    [item.id, item.projectId],
  );

  const saved =
    item.retailCostMinor !== null &&
    item.negotiatedCostMinor !== null &&
    item.retailCostMinor > item.negotiatedCostMinor
      ? item.retailCostMinor - item.negotiatedCostMinor
      : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="proc-chain-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 720,
          height: '100%',
          background: 'var(--color-background-tertiary)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 0 24px rgba(0,0,0,0.35)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', background: 'var(--color-background-primary)', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{project?.name ?? '—'}</div>
              <h2 id="proc-chain-title" style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 600, fontFamily: 'var(--font-friday-fad)' }}>
                {item.itemName}
              </h2>
              {item.itemDescription && (
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>{item.itemDescription}</div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '4px 10px',
                fontSize: 12,
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-background-tertiary)',
                color: 'var(--color-text-secondary)',
                border: '0.5px solid var(--color-border-tertiary)',
              }}
              data-proc-chain-close
            >
              Close
            </button>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            <span><strong style={{ color: 'var(--color-text-primary)' }}>{room?.name ?? '—'}</strong> · {item.category}</span>
            <span>qty <strong style={{ color: 'var(--color-text-primary)' }}>{item.qty}</strong></span>
            <span>vendor <strong style={{ color: 'var(--color-text-primary)' }}>{vendor?.name ?? 'unset'}</strong></span>
            {item.dueDate && <span>due <span style={{ fontFamily: 'var(--font-mono-fad)' }}>{item.dueDate}</span></span>}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Budget context — pulls from B3.1 disclosure shape so the user sees the savings inline. */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 8,
            }}
          >
            <Stat label="Retail" valueMinor={item.retailCostMinor} mono strike />
            <Stat label="Negotiated" valueMinor={item.negotiatedCostMinor} mono />
            <Stat label="Saved" valueMinor={saved} mono tone="success" />
            <Stat label="Approved" valueMinor={item.finalApprovedCostMinor} mono tone="info" highlight />
            <Stat label="Actual paid" valueMinor={item.actualPaidMinor} mono />
          </div>

          {/* Timeline */}
          <div>
            <h3 style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
              Procurement chain
            </h3>
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {STEPS.map((step, idx) => {
                const state = stepStateFor(step, item.procurement);
                return (
                  <li key={step.id}>
                    <ChainStepRow
                      step={step}
                      state={state}
                      isLast={idx === STEPS.length - 1}
                      item={item}
                      vendorName={vendor?.name ?? null}
                    />
                  </li>
                );
              })}
            </ol>
          </div>

          {/* Linked tasks */}
          <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)', padding: 12 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
              Tasks ({tasks.length})
            </h3>
            {tasks.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>No tasks tied to this item yet.</div>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {tasks.map((t) => (
                  <li
                    key={t.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                      fontSize: 12,
                      padding: '4px 0',
                      borderBottom: '0.5px dashed var(--color-border-tertiary)',
                    }}
                  >
                    <span>
                      {t.title}{' '}
                      <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>· {t.kind}</span>
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        padding: '1px 8px',
                        borderRadius: 'var(--radius-full)',
                        background:
                          t.status === 'completed'
                            ? 'var(--color-bg-success)'
                            : t.status === 'in_progress'
                            ? 'var(--color-bg-info)'
                            : t.status === 'blocked'
                            ? 'var(--color-bg-danger)'
                            : 'var(--color-background-tertiary)',
                        color:
                          t.status === 'completed'
                            ? 'var(--color-text-success)'
                            : t.status === 'in_progress'
                            ? 'var(--color-text-info)'
                            : t.status === 'blocked'
                            ? 'var(--color-text-danger)'
                            : 'var(--color-text-tertiary)',
                      }}
                    >
                      {t.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChainStepRow({
  step,
  state,
  isLast,
  item,
  vendorName,
}: {
  step: ChainStep;
  state: StepState;
  isLast: boolean;
  item: BudgetItem;
  vendorName: string | null;
}) {
  const dotColor = state === 'done' ? 'var(--color-text-success)' : state === 'active' ? 'var(--color-brand-accent)' : 'var(--color-border-tertiary)';
  const dotFill = state === 'done' ? 'var(--color-text-success)' : state === 'active' ? 'var(--color-brand-accent)' : 'transparent';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            border: `2px solid ${dotColor}`,
            background: dotFill,
            marginTop: 6,
            flex: '0 0 auto',
          }}
        />
        {!isLast && (
          <div
            style={{
              flex: 1,
              width: 2,
              minHeight: 24,
              background: state === 'done' ? 'var(--color-text-success)' : 'var(--color-border-tertiary)',
              marginTop: 4,
            }}
          />
        )}
      </div>
      <div
        style={{
          background: 'var(--color-background-primary)',
          border: state === 'active' ? '1px solid var(--color-brand-accent)' : '0.5px solid var(--color-border-tertiary)',
          borderRadius: 'var(--radius-md)',
          padding: 12,
          marginBottom: isLast ? 0 : 4,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{step.label}</div>
          <span
            style={{
              fontSize: 10,
              padding: '1px 8px',
              borderRadius: 'var(--radius-full)',
              background:
                state === 'done' ? 'var(--color-bg-success)'
                : state === 'active' ? 'var(--color-bg-info)'
                : 'var(--color-background-tertiary)',
              color:
                state === 'done' ? 'var(--color-text-success)'
                : state === 'active' ? 'var(--color-text-info)'
                : 'var(--color-text-tertiary)',
              fontWeight: 500,
            }}
          >
            {state === 'done' ? 'Done' : state === 'active' ? 'Now' : 'Upcoming'}
          </span>
        </div>
        <ChainStepBody step={step} state={state} item={item} vendorName={vendorName} />
      </div>
    </div>
  );
}

function ChainStepBody({
  step,
  state,
  item,
  vendorName,
}: {
  step: ChainStep;
  state: StepState;
  item: BudgetItem;
  vendorName: string | null;
}) {
  const detailStyle: React.CSSProperties = { fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6 };
  const ctaPrimary: React.CSSProperties = {
    padding: '4px 10px',
    fontSize: 11,
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-brand-accent)',
    color: '#fff',
    marginTop: 8,
    fontWeight: 500,
  };

  switch (step.id) {
    case 'sourcing':
      return (
        <>
          <div style={detailStyle}>
            Vendor target: <strong>{vendorName ?? 'unassigned'}</strong>.
            {item.productLink ? (
              <> Product link: <a href={item.productLink} style={{ color: 'var(--color-text-info)' }}>{item.productLink}</a></>
            ) : ' No product link recorded yet.'}
          </div>
          {state === 'active' && (
            <button type="button" onClick={() => fireToast('Request quote (mock — wires to vendor in v0.2)')} style={ctaPrimary}>
              Request quote
            </button>
          )}
        </>
      );
    case 'quote':
      return (
        <>
          <div style={detailStyle}>
            Retail {formatMUR(item.retailCostMinor)} · Friday-negotiated{' '}
            <strong>{formatMUR(item.negotiatedCostMinor)}</strong>
            {item.retailCostMinor && item.negotiatedCostMinor && item.retailCostMinor > item.negotiatedCostMinor && (
              <> (saving {formatMUR(item.retailCostMinor - item.negotiatedCostMinor)})</>
            )}
          </div>
          {state === 'active' && (
            <button type="button" onClick={() => fireToast('Approve quote → ready to buy (mock)')} style={ctaPrimary}>
              Approve quote
            </button>
          )}
        </>
      );
    case 'po':
      return (
        <>
          <div style={detailStyle}>
            {state === 'done' || state === 'active'
              ? `PO issued for ${formatMUR(item.finalApprovedCostMinor)} to ${vendorName ?? 'vendor'}.`
              : 'PO will be issued once the quote is approved.'}
          </div>
          {state === 'active' && (
            <button type="button" onClick={() => fireToast('Generate PO PDF (mock — wires to PO module in v0.2)')} style={ctaPrimary}>
              Generate PO
            </button>
          )}
        </>
      );
    case 'delivery':
      return (
        <>
          <div style={detailStyle}>
            {state === 'done'
              ? 'Delivered.'
              : state === 'active'
              ? `Awaiting delivery${item.dueDate ? ` (target ${item.dueDate})` : ''}.`
              : 'Will track once the PO is issued.'}
          </div>
          {state === 'active' && (
            <button type="button" onClick={() => fireToast('Mark delivered (mock — wires to receiving)')} style={ctaPrimary}>
              Mark delivered
            </button>
          )}
        </>
      );
    case 'install':
      return (
        <>
          <div style={detailStyle}>
            {state === 'done'
              ? 'Installed on site.'
              : state === 'active'
              ? `Ready to install${item.assignedUserId ? ` (${item.assignedUserId.replace('u-', '')})` : ''}.`
              : 'Will track once the item is delivered.'}
          </div>
          {state === 'active' && (
            <button type="button" onClick={() => fireToast('Mark installed (mock)')} style={ctaPrimary}>
              Mark installed
            </button>
          )}
        </>
      );
    case 'qa':
      return (
        <>
          <div style={detailStyle}>
            {state === 'done'
              ? 'QA passed and signed off — item closed for reconciliation.'
              : state === 'active'
              ? 'Awaiting QA walkthrough + sign-off photos.'
              : 'QA happens after install.'}
          </div>
          {state === 'active' && (
            <button type="button" onClick={() => fireToast('Mark QA passed (mock)')} style={ctaPrimary}>
              Mark QA passed
            </button>
          )}
        </>
      );
  }
}

function Stat({
  label,
  valueMinor,
  mono,
  strike,
  tone,
  highlight,
}: {
  label: string;
  valueMinor: number | null;
  mono?: boolean;
  strike?: boolean;
  tone?: 'success' | 'info';
  highlight?: boolean;
}) {
  const colour =
    tone === 'success'
      ? 'var(--color-text-success)'
      : tone === 'info'
      ? 'var(--color-text-info)'
      : 'var(--color-text-primary)';
  return (
    <div
      style={{
        background: highlight ? 'var(--color-brand-accent-soft)' : 'var(--color-background-primary)',
        border: highlight ? '1px solid var(--color-brand-accent)' : '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--radius-md)',
        padding: 10,
      }}
    >
      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </div>
      <div
        style={{
          marginTop: 4,
          fontFamily: mono ? 'var(--font-mono-fad)' : undefined,
          fontSize: 14,
          fontWeight: 600,
          color: valueMinor === null ? 'var(--color-text-tertiary)' : colour,
          textDecoration: strike && valueMinor !== null ? 'line-through' : 'none',
        }}
      >
        {valueMinor === null ? '—' : formatMUR(valueMinor)}
      </div>
    </div>
  );
}
