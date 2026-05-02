'use client';

import { useState } from 'react';
import {
  designClient,
  formatMUR,
  type DesignProject,
  type GateStatus,
  type PaymentGate,
} from '../../../../_data/design';
import { useCurrentRole } from '../../../usePermissions';
import { fireToast } from '../../../Toaster';

interface Props {
  project: DesignProject;
}

export function PaymentsStage({ project }: Props) {
  const role = useCurrentRole();
  const gates = designClient.payments.list(project.id);
  const [modalGate, setModalGate] = useState<PaymentGate | null>(null);
  const canMarkReceived = role === 'director' || role === 'commercial_marketing';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Payment gates</h3>
        <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          Bank transfer manual confirmation only. Authority: Admin or Finance. Override available with logged reason.
        </p>
      </Card>

      <Card>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
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
                  {g.status === 'awaiting' && canMarkReceived && (
                    <button
                      type="button"
                      onClick={() => setModalGate(g)}
                      style={primaryBtn()}
                    >
                      Mark received
                    </button>
                  )}
                  {g.status === 'received' && <span style={{ color: 'var(--color-text-success)', fontSize: 11 }}>✓ received</span>}
                  {g.status === 'pending' && <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>(gated)</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {modalGate && (
        <MarkReceivedModal
          gate={modalGate}
          onClose={() => setModalGate(null)}
          onConfirm={(amt, bankRef, notes) => {
            fireToast(`Marked received: ${modalGate.label} — ${formatMUR(amt)} (${bankRef})`);
            setModalGate(null);
          }}
        />
      )}
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

function MarkReceivedModal({ gate, onClose, onConfirm }: { gate: PaymentGate; onClose: () => void; onConfirm: (amt: number, bankRef: string, notes: string) => void }) {
  const [amount, setAmount] = useState('');
  const [bankRef, setBankRef] = useState('');
  const [notes, setNotes] = useState('');
  const amtMinor = amount ? Math.round(Number(amount.replace(/[^\d]/g, '')) * 100) : 0;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--color-background-primary)', borderRadius: 'var(--radius-md)', padding: 20, width: '100%', maxWidth: 480 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Mark received: {gate.label}</h3>
        <Field label="Amount (MUR)"><input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 51000" style={inputStyle()} /></Field>
        <Field label="Bank reference"><input value={bankRef} onChange={(e) => setBankRef(e.target.value)} placeholder="MCB-A4F19" style={inputStyle()} /></Field>
        <Field label="Notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...inputStyle(), resize: 'vertical' }} /></Field>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button type="button" onClick={onClose} style={secondaryBtn()}>Cancel</button>
          <button type="button" disabled={!amount || !bankRef} onClick={() => onConfirm(amtMinor, bankRef, notes)} style={amount && bankRef ? primaryBtn() : { ...secondaryBtn(), opacity: 0.5, cursor: 'not-allowed' }}>
            Confirm receipt
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
function secondaryBtn(): React.CSSProperties { return { padding: '8px 16px', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-tertiary)', color: 'var(--color-text-primary)', fontSize: 12 }; }
