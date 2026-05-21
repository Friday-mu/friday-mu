'use client';

// Expense Capture stage — QA-§5 major bug #5: the Execution tab had
// no panel to record actual_paid_minor (added by migration 019 for the
// bank reconciliation matcher). Without this, the reconciliation
// finalize-gate stays blocked even after staff have actually paid
// suppliers — there's no UI surface to enter the cash-out amount.
//
// This stage lists approved budget items and lets staff record what
// was actually paid per item. Saving PATCHes /budget_items/:id with
// actual_paid_minor; the row contributes to the reconciliation gate
// and the matcher's amount-tolerance score against bank transactions.

import { useEffect, useState } from 'react';
import { designClient, formatMUR, type DesignProject } from '../../../../_data/design';
import { updateBudgetItem, type ApiBudgetItem } from '../../../../_data/designClient';
import { bumpFixtureRev, useFixtureRev } from '../../../../_data/fixtureRev';
import { fireToast } from '../../../Toaster';

interface Props {
  project: DesignProject;
}

export function ExpenseCaptureStage({ project }: Props) {
  // Pull live budget items via the fixture (hydrated on project load).
  // Includes both internal-work and owner-billable; staff capture both.
  const rev = useFixtureRev();
  void rev;
  const allItems = designClient.budgetItems.list(project.id);

  // Local edit state — keyed by item id, MUR major units (not minor).
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  // Seed drafts from the fixture's actualPaidMinor so the inputs
  // reflect what's already been captured (BIGINT coerced to number).
  useEffect(() => {
    const seed: Record<string, string> = {};
    for (const it of allItems) {
      const actual = (it as { actualPaidMinor?: number | null }).actualPaidMinor ?? null;
      if (actual != null && actual > 0) {
        seed[it.id] = String(Math.round(actual / 100));
      }
    }
    setDrafts((cur) => ({ ...seed, ...cur }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, allItems.length]);

  const approvedItems = allItems.filter((it) => it.status === 'approved');
  const draftItems = allItems.filter((it) => it.status !== 'approved');

  const handleSave = async (itemId: string) => {
    const major = drafts[itemId] ?? '';
    const parsed = major.trim() === '' ? null : Number(major.replace(/[^\d]/g, ''));
    if (parsed != null && (!Number.isFinite(parsed) || parsed < 0)) {
      fireToast('Amount must be a non-negative number.');
      return;
    }
    const actualPaidMinor = parsed == null ? null : parsed * 100;
    setSaving((s) => ({ ...s, [itemId]: true }));
    try {
      const updated = await updateBudgetItem(itemId, { actual_paid_minor: actualPaidMinor } as Partial<ApiBudgetItem>);
      // Mutate fixture in place — same pattern as paymentsStage.
      const idx = allItems.findIndex((i) => i.id === itemId);
      if (idx >= 0) {
        // The fixture BudgetItem camelCases actualPaidMinor; assign
        // through unknown to bypass the strict type lookup.
        (allItems[idx] as unknown as Record<string, unknown>).actualPaidMinor = updated.actual_paid_minor ?? null;
      }
      bumpFixtureRev();
      fireToast(`Saved ${formatMUR(actualPaidMinor ?? 0)}.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fireToast(`Save failed: ${msg}`);
    } finally {
      setSaving((s) => ({ ...s, [itemId]: false }));
    }
  };

  const totalApproved = approvedItems.reduce((s, it) => s + (it.finalApprovedCostMinor ?? 0), 0);
  const totalPaid = approvedItems.reduce((s, it) => {
    const actual = (it as { actualPaidMinor?: number | null }).actualPaidMinor ?? 0;
    return s + actual;
  }, 0);
  const remaining = totalApproved - totalPaid;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Expense capture</h3>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Record what was actually paid per approved budget item. Feeds the bank reconciliation matcher (design-be-24).
            </p>
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 11, fontFamily: 'var(--font-mono-fad)' }}>
            <div>
              <div style={{ color: 'var(--color-text-tertiary)' }}>Approved</div>
              <div style={{ fontWeight: 600 }}>{formatMUR(totalApproved)}</div>
            </div>
            <div>
              <div style={{ color: 'var(--color-text-tertiary)' }}>Paid</div>
              <div style={{ fontWeight: 600 }}>{formatMUR(totalPaid)}</div>
            </div>
            <div>
              <div style={{ color: 'var(--color-text-tertiary)' }}>Remaining</div>
              <div style={{ fontWeight: 600, color: remaining > 0 ? 'var(--color-text-warning)' : 'var(--color-text-success)' }}>
                {formatMUR(remaining)}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {approvedItems.length === 0 ? (
        <Card>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-tertiary)', textAlign: 'center', padding: 16 }}>
            No approved budget items yet. Approve items in Final Budget to capture expenses here.
          </p>
        </Card>
      ) : (
        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', minWidth: 640 }}>
              <thead>
                <tr style={{ color: 'var(--color-text-tertiary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  <th style={{ ...cell('left'), width: '35%' }}>Item</th>
                  <th style={cell('left')}>Vendor</th>
                  <th style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)' }}>Approved</th>
                  <th style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)' }}>Actual paid (MUR)</th>
                  <th style={cell('right')}>Action</th>
                </tr>
              </thead>
              <tbody>
                {approvedItems.map((it) => {
                  const draft = drafts[it.id] ?? '';
                  const existing = (it as { actualPaidMinor?: number | null }).actualPaidMinor ?? null;
                  const draftMinor = draft.trim() === '' ? 0 : Number(draft.replace(/[^\d]/g, '')) * 100;
                  const dirty = existing == null ? draft.trim() !== '' : draftMinor !== existing;
                  return (
                    <tr key={it.id} data-expense-row={it.id} style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                      <td style={cell('left')}>{it.itemName}</td>
                      <td style={{ ...cell('left'), color: 'var(--color-text-tertiary)' }}>{it.vendorId || '—'}</td>
                      <td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)' }}>{formatMUR(it.finalApprovedCostMinor ?? 0)}</td>
                      <td style={cell('right')}>
                        <input
                          inputMode="numeric"
                          value={draft}
                          onChange={(e) => setDrafts((s) => ({ ...s, [it.id]: e.target.value }))}
                          placeholder="0"
                          data-expense-amount={it.id}
                          style={{
                            ...inputStyle(),
                            width: 110,
                            textAlign: 'right',
                            fontFamily: 'var(--font-mono-fad)',
                            background: dirty ? 'var(--color-brand-accent-softer)' : 'var(--color-background-primary)',
                          }}
                        />
                      </td>
                      <td style={cell('right')}>
                        <button
                          type="button"
                          onClick={() => handleSave(it.id)}
                          disabled={saving[it.id] || !dirty}
                          data-expense-save={it.id}
                          style={{
                            padding: '4px 12px',
                            fontSize: 11,
                            fontWeight: 500,
                            borderRadius: 'var(--radius-sm)',
                            background: saving[it.id] || !dirty ? 'var(--color-background-tertiary)' : 'var(--color-brand-accent)',
                            color: saving[it.id] || !dirty ? 'var(--color-text-tertiary)' : '#fff',
                            border: 'none',
                            cursor: saving[it.id] || !dirty ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {saving[it.id] ? 'Saving…' : 'Save'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {draftItems.length > 0 && (
        <Card>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            <strong>{draftItems.length}</strong> budget items not yet approved — they&apos;ll appear here once they land in Final Budget.
          </p>
        </Card>
      )}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--color-background-primary)',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--radius-md)',
        padding: 16,
      }}
    >
      {children}
    </div>
  );
}

function cell(align: 'left' | 'right'): React.CSSProperties {
  return { padding: '8px 10px', textAlign: align, verticalAlign: 'middle' };
}

function inputStyle(): React.CSSProperties {
  return {
    padding: '4px 8px',
    fontSize: 12,
    borderRadius: 'var(--radius-sm)',
    border: '0.5px solid var(--color-border-secondary)',
    background: 'var(--color-background-primary)',
    color: 'var(--color-text-primary)',
  };
}
