'use client';

import { useMemo, useState } from 'react';
import { type Task } from '../../../_data/tasks';
import { suggestOwnerCharge } from '../../../_data/breezeway';
import { addCost } from '../../../_data/tasksClient';
import { useCurrentUserId } from '../../usePermissions';
import { fireToast } from '../../Toaster';
import { IconClose, IconSparkle } from '../../icons';

interface Props {
  open: boolean;
  task: Task;
  onClose: () => void;
  onAdded: () => void;
}

const COST_TYPES = [
  { value: 'labor', label: 'Labor' },
  { value: 'material', label: 'Material' },
  { value: 'expense', label: 'Expense' },
  { value: 'tax', label: 'Tax' },
  { value: 'skilled_labor', label: 'Skilled labor' },
  { value: 'unskilled_labor', label: 'Unskilled labor' },
  { value: 'mileage', label: 'Mileage' },
  { value: 'markup', label: 'Markup' },
] as const;

export function AddCostDrawer({ open, task, onClose, onAdded }: Props) {
  const currentUserId = useCurrentUserId();
  const [type, setType] = useState<typeof COST_TYPES[number]['value']>('material');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'MUR' | 'EUR'>('MUR');
  const [description, setDescription] = useState('');
  const [ownerCharge, setOwnerCharge] = useState<boolean | null>(null);
  const [feedback, setFeedback] = useState<'accepted' | 'overridden' | null>(null);

  const numericAmount = parseFloat(amount) || 0;
  const suggestion = useMemo(() => {
    if (description.length < 8) return null;
    return suggestOwnerCharge({
      description,
      type,
      amountMinor: Math.round(numericAmount * 100),
    });
  }, [description, type, numericAmount]);

  // Default ownerCharge to AI suggestion when it first appears.
  const effectiveOwnerCharge = ownerCharge ?? suggestion?.suggested ?? false;

  const acceptSuggestion = () => {
    if (!suggestion) return;
    setOwnerCharge(suggestion.suggested);
    setFeedback('accepted');
    // eslint-disable-next-line no-console
    console.debug('[ai] accept ownerCharge suggestion', suggestion.suggested);
  };

  const overrideSuggestion = (value: boolean) => {
    setOwnerCharge(value);
    setFeedback('overridden');
    // eslint-disable-next-line no-console
    console.debug('[ai] override ownerCharge → ', value);
  };

  const submit = async () => {
    if (numericAmount <= 0 || !description.trim()) return;
    await addCost({
      taskId: task.id,
      type,
      amount: numericAmount,
      currency,
      description,
      ownerCharge: effectiveOwnerCharge,
      addedBy: currentUserId,
    });
    onAdded();
  };

  if (!open) return null;
  return (
    <>
      <div className="fad-drawer-overlay open" onClick={onClose} />
      <aside className="fad-drawer open" style={{ maxWidth: 460 }}>
        <div className="fad-drawer-header">
          <div className="fad-drawer-title">Add cost · {task.propertyCode}</div>
          <button className="fad-util-btn" onClick={onClose} title="Close" style={{ marginLeft: 'auto' }}>
            <IconClose />
          </button>
        </div>
        <div className="fad-drawer-body" style={{ padding: 16 }}>
          <Field label="Type">
            <select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              {COST_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
            <Field label="Amount">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
              />
            </Field>
            <Field label="Currency">
              <select value={currency} onChange={(e) => setCurrency(e.target.value as 'MUR' | 'EUR')}>
                <option value="MUR">MUR</option>
                <option value="EUR">EUR</option>
              </select>
            </Field>
          </div>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What was this cost for?"
              style={{ minHeight: 60, fontFamily: 'inherit' }}
            />
          </Field>

          {suggestion && (
            <div
              style={{
                padding: 12,
                background: 'var(--color-brand-accent-softer)',
                borderLeft: '3px solid var(--color-brand-accent)',
                borderRadius: 6,
                marginBottom: 14,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <IconSparkle size={11} />
                <span style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-brand-accent)' }}>
                  Owner-billable suggestion
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                  {Math.round(suggestion.confidence * 100)}%
                </span>
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 10 }}>
                {suggestion.reasoning}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    checked={effectiveOwnerCharge === true}
                    onChange={() => (suggestion.suggested ? acceptSuggestion() : overrideSuggestion(true))}
                  />
                  Owner-billable (passthrough)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    checked={effectiveOwnerCharge === false}
                    onChange={() => (suggestion.suggested ? overrideSuggestion(false) : acceptSuggestion())}
                  />
                  Internal (Friday absorbs)
                </label>
              </div>
              {feedback && (
                <div style={{ marginTop: 6, fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                  Feedback: {feedback}
                </div>
              )}
            </div>
          )}

          {!suggestion && description.length >= 8 && (
            <div style={{ marginBottom: 14, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={effectiveOwnerCharge}
                  onChange={(e) => setOwnerCharge(e.target.checked)}
                />
                Owner-billable (flows to Finance)
              </label>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn ghost" onClick={onClose}>Cancel</button>
            <button
              className="btn primary"
              onClick={submit}
              disabled={!description.trim() || numericAmount <= 0}
            >
              Add cost
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label
      style={{
        display: 'block',
        marginBottom: 12,
        fontSize: 11,
        color: 'var(--color-text-secondary)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}
    >
      {label}
      <div style={{ marginTop: 4, textTransform: 'none' }}>{children}</div>
    </label>
  );
}
