'use client';

import { useMemo, useState } from 'react';
import {
  designClient,
  formatMUR,
  type DesignProject,
  type DesignTask,
} from '../../../../_data/design';
import { fireToast } from '../../../Toaster';
import { AIPlaceholder } from '../AIPlaceholder';

interface Props {
  project: DesignProject;
}

export function ExecutionStage({ project }: Props) {
  const tasks = designClient.tasks.list(project.id);
  const items = designClient.budgetItems.list(project.id);
  const [groupBy, setGroupBy] = useState<'item' | 'kind'>('item');
  const [captureFor, setCaptureFor] = useState<DesignTask | null>(null);

  const groups = useMemo(() => {
    if (groupBy === 'kind') {
      const kinds = ['source','buy','delivery','install','qa','photo','other'] as const;
      return kinds.map((k) => ({ key: k, label: k, tasks: tasks.filter((t) => t.kind === k) })).filter((g) => g.tasks.length > 0);
    }
    const byItem = new Map<string, DesignTask[]>();
    for (const t of tasks) {
      const key = t.budgetItemId ?? '__loose';
      if (!byItem.has(key)) byItem.set(key, []);
      byItem.get(key)!.push(t);
    }
    return Array.from(byItem.entries()).map(([key, ts]) => {
      const item = items.find((i) => i.id === key);
      return { key, label: item?.itemName ?? 'Misc tasks', tasks: ts };
    });
  }, [tasks, items, groupBy]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Execution tasks</h3>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Auto-generated from approved budget items: source → buy → delivery → install → QA. Bryan / procurement own these.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Group by:</span>
            <button type="button" onClick={() => setGroupBy('item')} style={groupBy === 'item' ? primaryBtn() : secondaryBtn()}>Item</button>
            <button type="button" onClick={() => setGroupBy('kind')} style={groupBy === 'kind' ? primaryBtn() : secondaryBtn()}>Kind</button>
          </div>
        </div>
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {groups.map((g) => (
          <Card key={g.key}>
            <h4 style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600 }}>
              {g.label} <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}>· {g.tasks.length} tasks</span>
            </h4>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {g.tasks.map((t) => (
                <li
                  key={t.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    border: '0.5px solid var(--color-border-tertiary)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                    <KindBadge kind={t.kind} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
                      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                        {t.assignedUserId?.replace('u-', '') ?? 'unassigned'} · due {t.dueDate ?? '—'} · evidence: {t.evidenceRequired ?? 'none'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <StatusBadge status={t.status} />
                    {t.kind === 'buy' && t.status !== 'completed' && (
                      <button type="button" onClick={() => setCaptureFor(t)} style={primaryBtn()}>
                        Capture expense
                      </button>
                    )}
                    {t.evidenceUrl && <a href={t.evidenceUrl} style={{ fontSize: 11, color: 'var(--color-text-info)' }}>📄</a>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      {captureFor && <ExpenseCaptureModal task={captureFor} onClose={() => setCaptureFor(null)} />}
    </div>
  );
}

function ExpenseCaptureModal({ task, onClose }: { task: DesignTask; onClose: () => void }) {
  const [supplier, setSupplier] = useState('');
  const [amount, setAmount] = useState('');
  const [vat, setVat] = useState('');
  const [notes, setNotes] = useState('');
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--color-background-primary)', borderRadius: 'var(--radius-md)', padding: 20, width: '100%', maxWidth: 540 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>Capture expense — {task.title}</h3>
          <AIPlaceholder feature="receipt-scan" label="Scan receipt" size="sm" />
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          Embeds the §7.II Finance capture component. v0.1 mocks the form; v0.2 reuses the live component.
        </p>
        <Field label="Supplier"><input value={supplier} onChange={(e) => setSupplier(e.target.value)} style={inputStyle()} /></Field>
        <Field label="Amount (MUR)"><input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} style={inputStyle()} /></Field>
        <Field label="VAT (MUR)"><input inputMode="numeric" value={vat} onChange={(e) => setVat(e.target.value.replace(/[^\d]/g, ''))} style={inputStyle()} /></Field>
        <Field label="Notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...inputStyle(), resize: 'vertical' }} /></Field>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Linked to budget item: {task.budgetItemId ?? '—'}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} style={secondaryBtn()}>Cancel</button>
            <button
              type="button"
              disabled={!supplier || !amount}
              onClick={() => { fireToast(`Expense captured: ${supplier} · ${formatMUR(Number(amount) * 100)}`); onClose(); }}
              style={supplier && amount ? primaryBtn() : { ...secondaryBtn(), opacity: 0.5, cursor: 'not-allowed' }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function KindBadge({ kind }: { kind: DesignTask['kind'] }) {
  const colors: Record<DesignTask['kind'], string> = {
    source: '#8a8780', buy: '#2B4A93', delivery: '#9A6A16', install: '#2F7D4F', qa: '#5680CA', photo: '#a08bc1', other: '#888',
  };
  return (
    <span style={{ width: 6, height: 24, background: colors[kind], borderRadius: 2, flex: '0 0 6px' }} title={kind} />
  );
}

function StatusBadge({ status }: { status: DesignTask['status'] }) {
  const c =
    status === 'completed'   ? { bg: 'var(--color-bg-success)', fg: 'var(--color-text-success)' } :
    status === 'in_progress' ? { bg: 'var(--color-bg-info)',    fg: 'var(--color-text-info)' } :
    status === 'blocked'     ? { bg: 'var(--color-bg-danger)',  fg: 'var(--color-text-danger)' } :
                                { bg: 'var(--color-background-tertiary)', fg: 'var(--color-text-tertiary)' };
  return <span style={{ padding: '1px 6px', background: c.bg, color: c.fg, borderRadius: 'var(--radius-full)', fontSize: 9 }}>{status.replace(/_/g, ' ')}</span>;
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
function inputStyle(): React.CSSProperties {
  return { width: '100%', padding: '6px 10px', fontSize: 12, borderRadius: 'var(--radius-sm)', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' };
}
function primaryBtn(): React.CSSProperties { return { padding: '4px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--color-brand-accent)', color: '#fff', fontSize: 11, fontWeight: 500 }; }
function secondaryBtn(): React.CSSProperties { return { padding: '4px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-tertiary)', color: 'var(--color-text-primary)', fontSize: 11 }; }
