'use client';

import { useMemo, useState } from 'react';
import {
  designClient,
  formatMUR,
  PAYMENT_GATES as FIXTURE_PAYMENT_GATES,
  PROJECTS as FIXTURE_PROJECTS,
  type DesignProject,
  type GateStatus,
  type PaymentGate,
} from '../../../../_data/design';
import { receivePayment, apiPaymentToFixture, loadProject, apiProjectToFixture } from '../../../../_data/designClient';
import { bumpFixtureRev, useFixtureRev } from '../../../../_data/fixtureRev';
import { useCurrentRole } from '../../../usePermissions';
import { fireToast } from '../../../Toaster';

interface Props {
  project: DesignProject;
}

export function PaymentsStage({ project }: Props) {
  const role = useCurrentRole();
  // Global fixture-rev subscription — picks up cross-stage updates
  // (e.g. a payment marked received from one tab, budget items added
  // elsewhere) without needing this component to remount.
  const rev = useFixtureRev();
  const gates = (() => { void rev; return designClient.payments.list(project.id); })();
  const [modalGate, setModalGate] = useState<PaymentGate | null>(null);
  const [confirming, setConfirming] = useState(false);
  // B3.11: director-only. Drop the Finance branch (single approver in v0.1).
  const canMarkReceived = role === 'director';

  const handleConfirmReceived = async (gate: PaymentGate, amt: number, bankRef: string, notes: string) => {
    setConfirming(true);
    try {
      // The backend gate_id is the GateId enum string ('design_fee_60' etc.),
      // which matches the fixture gateId. Bank ref + notes are concatenated
      // into the `note` payload (backend stores a single TEXT column).
      const noteCombined = bankRef ? `Ref: ${bankRef}${notes ? ` — ${notes}` : ''}` : (notes || null);
      const updated = await receivePayment(project.id, gate.id, {
        amount_minor: amt,
        received_at: new Date().toISOString(),
        note: noteCombined ?? undefined,
      });
      // Mutate fixture in place so the table re-renders with received state.
      const mapped = apiPaymentToFixture(updated);
      const idx = FIXTURE_PAYMENT_GATES.findIndex((g) => g.projectId === project.id && g.id === gate.id);
      if (idx >= 0) {
        Object.assign(FIXTURE_PAYMENT_GATES[idx], mapped);
      } else {
        FIXTURE_PAYMENT_GATES.push(mapped);
      }
      // Also refetch the project row — if the backend advanced
      // current_stage (e.g. payment-gate → floor-plan) or updated
      // any aggregate the project carries, the Summary panel +
      // StageTracker + Overview need the new state. Tolerate
      // failure: a stale row is acceptable; the next per-project
      // hydration will catch up.
      try {
        const refreshedApi = await loadProject(project.id);
        const refreshed = apiProjectToFixture(refreshedApi);
        const pIdx = FIXTURE_PROJECTS.findIndex((p) => p.id === project.id);
        if (pIdx >= 0) FIXTURE_PROJECTS.splice(pIdx, 1, refreshed);
      } catch { /* tolerable */ }
      bumpFixtureRev();
      fireToast(`Marked received: ${gate.label} — ${formatMUR(amt)}`);
      setModalGate(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fireToast(`Failed to mark received: ${msg}`);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Payment gates</h3>
        <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          Bank transfer manual confirmation only. Director-only authority. Override available with logged reason.
        </p>
      </Card>

      <Card>
        {/* Desktop / tablet — table view. Mobile collapses below. */}
        <div className="fad-design-payments-table" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', minWidth: 560 }}>
            <thead>
              <tr style={{ color: 'var(--color-text-tertiary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                <th style={cell('left')}>Gate</th>
                <th style={cell('left')}>Status</th>
                <th style={cell('right')}>Amount</th>
                <th style={cell('left')}>Evidence / ref</th>
                <th style={cell('left')}>Received</th>
                <th style={cell('right')}>Action</th>
              </tr>
            </thead>
            <tbody>
              {gates.map((g) => (
                <tr key={g.id} style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                  <td style={cell('left')}>{g.label}</td>
                  <td style={cell('left')}><StatusChip status={g.status} /></td>
                  <td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)' }}>{formatMUR(g.amountMinor)}</td>
                  <td style={{ ...cell('left'), fontFamily: 'var(--font-mono-fad)', color: 'var(--color-text-tertiary)' }}>{g.bankRef ?? '—'}</td>
                  <td style={{ ...cell('left'), fontFamily: 'var(--font-mono-fad)', color: 'var(--color-text-tertiary)' }}>
                    {g.receivedAt ? g.receivedAt.slice(0, 10) : '—'}
                  </td>
                  <td style={cell('right')}>
                    {g.status === 'awaiting' && (
                      canMarkReceived ? (
                        <button
                          type="button"
                          onClick={() => setModalGate(g)}
                          style={primaryBtn()}
                        >
                          Mark received
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled
                          style={disabledBtn()}
                          title="Only the director can mark payments received."
                        >
                          Mark received
                        </button>
                      )
                    )}
                    {g.status === 'received' && <span style={{ color: 'var(--color-text-success)', fontSize: 11 }}>✓ received</span>}
                    {g.status === 'pending' && <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>(gated)</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Mobile — card list so the action button isn't clipped. */}
        <div className="fad-design-payments-cards" style={{ display: 'none', flexDirection: 'column', gap: 8 }}>
          {gates.map((g) => (
            <div key={g.id} style={{ border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)', padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <strong style={{ fontSize: 13 }}>{g.label}</strong>
                <StatusChip status={g.status} />
              </div>
              <div style={{ marginTop: 6, fontSize: 12, fontFamily: 'var(--font-mono-fad)' }}>{formatMUR(g.amountMinor)}</div>
              {g.bankRef && <div style={{ marginTop: 4, fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono-fad)' }}>Ref: {g.bankRef}</div>}
              {g.receivedAt && <div style={{ marginTop: 2, fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono-fad)' }}>Received {g.receivedAt.slice(0, 10)}</div>}
              <div style={{ marginTop: 8 }}>
                {g.status === 'awaiting' && (
                  canMarkReceived ? (
                    <button type="button" onClick={() => setModalGate(g)} style={primaryBtn()}>
                      Mark received
                    </button>
                  ) : (
                    <button type="button" disabled style={disabledBtn()} title="Only the director can mark payments received.">
                      Mark received
                    </button>
                  )
                )}
                {g.status === 'received' && <span style={{ color: 'var(--color-text-success)', fontSize: 11 }}>✓ received</span>}
                {g.status === 'pending' && <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>(gated)</span>}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <ProjectFundLedger projectId={project.id} gates={gates} />
      <FeeInvoiceLedger gates={gates} />

      {modalGate && (
        <MarkReceivedModal
          gate={modalGate}
          confirming={confirming}
          onClose={() => setModalGate(null)}
          onConfirm={(amt, bankRef, notes) => handleConfirmReceived(modalGate, amt, bankRef, notes)}
        />
      )}
    </div>
  );
}

/**
 * B3.8 EPC funds bookkeeping — read-only Project Fund ledger view.
 *
 * Credits: project_funds gate received (owner deposit into escrow).
 * Debits:  budget item actualPaidMinor where ownerBillable (supplier
 *          payouts disbursed from the fund).
 *
 * Mock data layer; the wiring sprint replaces this with the unified escrow
 * ledger (§7.XX) shared with PM working capital.
 */
function ProjectFundLedger({ projectId, gates }: { projectId: string; gates: PaymentGate[] }) {
  const items = designClient.budgetItems.list(projectId);
  const lines = useMemo(() => {
    const out: { date: string; label: string; creditMinor: number; debitMinor: number }[] = [];
    for (const g of gates) {
      if (g.id === 'project_funds' && g.status === 'received' && g.receivedAt && g.amountMinor) {
        out.push({ date: g.receivedAt.slice(0, 10), label: 'Owner deposit (EPC)', creditMinor: g.amountMinor, debitMinor: 0 });
      }
    }
    for (const it of items) {
      if (it.ownerBillable && !it.internalWork && it.actualPaidMinor != null && it.actualPaidMinor > 0) {
        out.push({
          date: '—',
          label: `Disbursement → ${it.itemName}`,
          creditMinor: 0,
          debitMinor: it.actualPaidMinor,
        });
      }
    }
    return out;
  }, [gates, items]);
  const totalCredit = lines.reduce((acc, l) => acc + l.creditMinor, 0);
  const totalDebit = lines.reduce((acc, l) => acc + l.debitMinor, 0);
  const balance = totalCredit - totalDebit;
  return (
    <Card>
      <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Project Fund (escrow)</h3>
      <p style={{ margin: '4px 0 12px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
        Owner-deposited EPC held against the project. Disbursements are paid out to suppliers as items land. v0.2 wires to the unified escrow primitive (§7.XX).
      </p>
      <LedgerTable lines={lines} balanceLabel="Balance held" balanceMinor={balance} totalCreditMinor={totalCredit} totalDebitMinor={totalDebit} />
    </Card>
  );
}

/**
 * B3.8 — read-only Fee Invoice ledger. Friday revenue lines (design + P&E
 * fees, never the EPC). v0.2 wires to invoicing.
 */
function FeeInvoiceLedger({ gates }: { gates: PaymentGate[] }) {
  const FEE_GATES: PaymentGate['id'][] = ['design_fee_60', 'design_fee_40', 'execution_fee_t1', 'execution_fee_t2', 'final_balance'];
  const lines = useMemo(() => {
    return gates
      .filter((g) => FEE_GATES.includes(g.id) && g.status === 'received' && g.amountMinor != null && g.receivedAt)
      .map((g) => ({
        date: (g.receivedAt ?? '').slice(0, 10),
        label: g.label,
        creditMinor: g.amountMinor as number,
        debitMinor: 0,
      }));
  }, [gates]);
  const totalCredit = lines.reduce((acc, l) => acc + l.creditMinor, 0);
  return (
    <Card>
      <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Fee Invoice (Friday revenue)</h3>
      <p style={{ margin: '4px 0 12px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
        Design fee + procurement & execution fee receipts. Never commingled with the Project Fund. VAT applied separately at invoice.
      </p>
      <LedgerTable lines={lines} balanceLabel="Total received" balanceMinor={totalCredit} totalCreditMinor={totalCredit} totalDebitMinor={0} />
    </Card>
  );
}

interface LedgerLine { date: string; label: string; creditMinor: number; debitMinor: number; }

function LedgerTable({ lines, balanceLabel, balanceMinor, totalCreditMinor, totalDebitMinor }: { lines: LedgerLine[]; balanceLabel: string; balanceMinor: number; totalCreditMinor: number; totalDebitMinor: number }) {
  if (lines.length === 0) {
    return <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-tertiary)' }}>No entries yet.</p>;
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', minWidth: 360 }}>
        <thead>
          <tr style={{ color: 'var(--color-text-tertiary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            <th style={cell('left')}>Date</th>
            <th style={cell('left')}>Description</th>
            <th style={cell('right')}>Credit</th>
            <th style={cell('right')}>Debit</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
              <td style={{ ...cell('left'), fontFamily: 'var(--font-mono-fad)', color: 'var(--color-text-tertiary)' }}>{l.date}</td>
              <td style={cell('left')}>{l.label}</td>
              <td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)', color: l.creditMinor ? 'var(--color-text-success)' : 'var(--color-text-tertiary)' }}>
                {l.creditMinor ? formatMUR(l.creditMinor) : '—'}
              </td>
              <td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)', color: l.debitMinor ? 'var(--color-text-warning)' : 'var(--color-text-tertiary)' }}>
                {l.debitMinor ? formatMUR(l.debitMinor) : '—'}
              </td>
            </tr>
          ))}
          <tr style={{ borderTop: '1px solid var(--color-border-secondary)', fontWeight: 600 }}>
            <td style={cell('left')} colSpan={2}>Totals</td>
            <td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)' }}>{formatMUR(totalCreditMinor)}</td>
            <td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)' }}>{totalDebitMinor ? formatMUR(totalDebitMinor) : '—'}</td>
          </tr>
          <tr>
            <td style={cell('left')} colSpan={3}>{balanceLabel}</td>
            <td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)', fontWeight: 600 }}>{formatMUR(balanceMinor)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function StatusChip({ status }: { status: GateStatus }) {
  const colors = {
    received:    { bg: 'var(--color-bg-success)', fg: 'var(--color-text-success)' },
    awaiting:    { bg: 'var(--color-bg-warning)', fg: 'var(--color-text-warning)' },
    pending:     { bg: 'var(--color-background-tertiary)', fg: 'var(--color-text-tertiary)' },
    overridden:  { bg: 'var(--color-bg-info)', fg: 'var(--color-text-info)' },
  } as const;
  const c = colors[status];
  return (
    <span style={{ padding: '2px 8px', borderRadius: 'var(--radius-full)', background: c.bg, color: c.fg, fontSize: 10, fontWeight: 500 }}>
      {status}
    </span>
  );
}

function MarkReceivedModal({ gate, confirming, onClose, onConfirm }: { gate: PaymentGate; confirming: boolean; onClose: () => void; onConfirm: (amt: number, bankRef: string, notes: string) => void }) {
  const [amount, setAmount] = useState('');
  const [bankRef, setBankRef] = useState('');
  const [notes, setNotes] = useState('');
  const amtMinor = amount ? Math.round(Number(amount.replace(/[^\d]/g, '')) * 100) : 0;
  const canConfirm = !!amount && !!bankRef && !confirming;
  return (
    <div onClick={confirming ? undefined : onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--color-background-primary)', borderRadius: 'var(--radius-md)', padding: 20, width: '100%', maxWidth: 480 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Mark received: {gate.label}</h3>
        <Field label="Amount (MUR)"><input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 51000" style={inputStyle()} disabled={confirming} /></Field>
        <Field label="Bank reference"><input value={bankRef} onChange={(e) => setBankRef(e.target.value)} placeholder="MCB-A4F19" style={inputStyle()} disabled={confirming} /></Field>
        <Field label="Notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...inputStyle(), resize: 'vertical' }} disabled={confirming} /></Field>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button type="button" onClick={onClose} disabled={confirming} style={secondaryBtn()}>Cancel</button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => onConfirm(amtMinor, bankRef, notes)}
            data-payment-confirm-receipt
            style={canConfirm ? primaryBtn() : { ...secondaryBtn(), opacity: 0.5, cursor: 'not-allowed' }}
          >
            {confirming ? 'Confirming…' : 'Confirm receipt'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)', padding: 14 }}>{children}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}
function cell(align: 'left' | 'right'): React.CSSProperties {
  return { padding: '8px 10px', textAlign: align, verticalAlign: 'middle' };
}
function inputStyle(): React.CSSProperties {
  return { width: '100%', padding: '6px 10px', fontSize: 12, borderRadius: 'var(--radius-sm)', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' };
}
function primaryBtn(): React.CSSProperties { return { padding: '4px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--color-brand-accent)', color: '#fff', fontSize: 11, fontWeight: 500 }; }
function disabledBtn(): React.CSSProperties { return { padding: '4px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-tertiary)', color: 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 500, cursor: 'not-allowed' }; }
function secondaryBtn(): React.CSSProperties { return { padding: '8px 16px', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-tertiary)', color: 'var(--color-text-primary)', fontSize: 12 }; }
