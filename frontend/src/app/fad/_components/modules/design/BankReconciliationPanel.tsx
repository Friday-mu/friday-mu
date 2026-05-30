'use client';

// Bank reconciliation panel (design-be-24).
//
// Mounted inside ReconciliationStage. Renders three sections:
//   1. Uploaded statements (table)
//   2. Match worklist — per transaction, grouped by status
//   3. Reconciliation summary + finalize-reconciliation gate
//
// All data flows through the live API (designClient helpers). The
// summary computation (computeReconciliationSummary) is exported so it
// can be unit-tested without rendering.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type ApiBankMatch,
  type ApiBankStatement,
  type ApiBankTransaction,
  type ApiBudgetItem,
  type CreateBankStatementPayload,
  confirmBankMatch,
  createBankStatement,
  createManualBankMatch,
  deleteBankMatch,
  listBankMatches,
  listBankStatements,
  listBankTransactions,
  loadBudgetItems,
  rejectBankMatch,
} from '../../../_data/designClient';
import { fireToast } from '../../Toaster';
import { formatMUR } from '../../../_data/design';
import { BankStatementUpload } from './BankStatementUpload';

interface Props {
  projectId: string;
  /**
   * Callback fired when the panel believes reconciliation is fully done
   * (all transactions confirmed/rejected + all actual-paid items
   * matched). The parent uses this to flip the stage's finalize button.
   */
  onReconciliationReady?: (ready: boolean) => void;
}

// ─────────────────────────── Summary computation ───────────────────────────

export interface ReconciliationSummary {
  confirmed: number;
  pending: number;     // suggested or unmatched debits
  rejected: number;
  totalDebits: number;
  /** Active-matched budget items / total items with actual_paid_minor set. */
  itemsMatched: number;
  itemsRequiringMatch: number;
  /** Both gates green => ready to finalize. */
  ready: boolean;
}

/**
 * Compute the reconciliation summary used by the finalize gate. Pure
 * function over the API arrays — exported for unit testing.
 *
 * The gate has TWO conditions:
 *   a) Every debit transaction is either CONFIRMED or REJECTED (no
 *      "suggested" left, no untouched debits).
 *   b) Every budget item with actual_paid_minor != null has at least one
 *      CONFIRMED match.
 *
 * Credits (positive amount_minor) are ignored — they're not project
 * expenses (refunds, deposits, transfers). Pending matches don't
 * count as "matched" for either gate.
 */
export function computeReconciliationSummary(
  transactions: ApiBankTransaction[],
  matches: ApiBankMatch[],
  budgetItems: ApiBudgetItem[],
): ReconciliationSummary {
  const debits = transactions.filter((t) => t.amount_minor < 0);
  const confirmedByTxn = new Map<string, ApiBankMatch>();
  const rejectedByTxn = new Map<string, ApiBankMatch>();
  const suggestedByTxn = new Map<string, ApiBankMatch>();
  for (const m of matches) {
    if (m.status === 'confirmed') confirmedByTxn.set(m.transaction_id, m);
    else if (m.status === 'rejected') rejectedByTxn.set(m.transaction_id, m);
    else if (m.status === 'suggested') suggestedByTxn.set(m.transaction_id, m);
  }

  let confirmed = 0;
  let pending = 0;
  let rejected = 0;
  for (const t of debits) {
    if (confirmedByTxn.has(t.id)) confirmed++;
    else if (rejectedByTxn.has(t.id)) rejected++;
    else pending++; // suggested or untouched both count as pending for the gate
  }

  const itemsRequiringMatch = budgetItems.filter((b) => typeof b.actual_paid_minor === 'number' && b.actual_paid_minor !== 0).length;
  const confirmedItemIds = new Set<string>();
  for (const m of matches) {
    if (m.status === 'confirmed') confirmedItemIds.add(m.budget_item_id);
  }
  const itemsMatched = confirmedItemIds.size;

  const txnGate = debits.length === 0 || pending === 0;
  const itemGate = itemsRequiringMatch === 0 || itemsMatched >= itemsRequiringMatch;

  return {
    confirmed,
    pending,
    rejected,
    totalDebits: debits.length,
    itemsMatched,
    itemsRequiringMatch,
    ready: txnGate && itemGate,
  };
}

// ─────────────────────────── Panel ───────────────────────────

export function BankReconciliationPanel({ projectId, onReconciliationReady }: Props) {
  const [statements, setStatements] = useState<ApiBankStatement[]>([]);
  const [transactions, setTransactions] = useState<ApiBankTransaction[]>([]);
  const [matches, setMatches] = useState<ApiBankMatch[]>([]);
  const [budgetItems, setBudgetItems] = useState<ApiBudgetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, t, m, b] = await Promise.all([
        listBankStatements(projectId),
        listBankTransactions(projectId),
        listBankMatches(projectId),
        loadBudgetItems(projectId),
      ]);
      setStatements(s);
      setTransactions(t);
      setMatches(m);
      setBudgetItems(b);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void refetch(); }, [refetch]);

  const summary = useMemo(
    () => computeReconciliationSummary(transactions, matches, budgetItems),
    [transactions, matches, budgetItems],
  );

  useEffect(() => { onReconciliationReady?.(summary.ready); }, [summary.ready, onReconciliationReady]);

  const handleUpload = useCallback(async (payload: CreateBankStatementPayload) => {
    try {
      const result = await createBankStatement(projectId, payload);
      const suggested = result.matches.filter((m) => m.status === 'suggested').length;
      fireToast(`Uploaded ${result.transactions.length} transactions. ${suggested} suggested match${suggested === 1 ? '' : 'es'}.`);
      setShowUpload(false);
      await refetch();
    } catch (e) {
      fireToast(`Upload failed: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    }
  }, [projectId, refetch]);

  const handleConfirm = async (matchId: string) => {
    try {
      await confirmBankMatch(matchId);
      fireToast('Match confirmed.');
      await refetch();
    } catch (e) {
      fireToast(`Confirm failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleReject = async (matchId: string) => {
    try {
      await rejectBankMatch(matchId);
      fireToast('Match rejected.');
      await refetch();
    } catch (e) {
      fireToast(`Reject failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleUnconfirm = async (matchId: string) => {
    // Unconfirm = reject the confirmed match, leaving the transaction
    // open for a new manual or suggested match.
    try {
      await rejectBankMatch(matchId);
      fireToast('Match unconfirmed.');
      await refetch();
    } catch (e) {
      fireToast(`Unconfirm failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleManualMatch = async (transactionId: string, budgetItemId: string) => {
    try {
      // If there's a rejected match for the same (txn, item) we'd need
      // to delete it first; for v1, the constraint is per-status so a
      // new 'suggested' row is creatable as long as no active suggested
      // exists. The backend returns 409 if there's already a suggested
      // match — caller should reject that first.
      await createManualBankMatch(projectId, { budget_item_id: budgetItemId, transaction_id: transactionId });
      fireToast('Manual match created — confirm to lock it in.');
      await refetch();
    } catch (e) {
      fireToast(`Manual match failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleDeleteSuggestion = async (matchId: string) => {
    try {
      await deleteBankMatch(matchId);
      fireToast('Suggestion removed.');
      await refetch();
    } catch (e) {
      fireToast(`Delete failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div style={cardStyle()} data-design-bank-recon>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          style={{
            background: 'transparent', padding: 0, fontSize: 13, fontWeight: 600,
            color: 'var(--color-text-primary)', display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          <span>🏦 Bank reconciliation</span>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            {collapsed ? '▸' : '▾'}
          </span>
        </button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <SummaryChip summary={summary} />
          <button type="button" onClick={() => setShowUpload(true)} style={primaryBtnSm()} data-design-bank-upload-open>
            Upload statement
          </button>
        </div>
      </div>

      {!collapsed && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && (
            <div style={{ padding: 10, background: 'var(--color-bg-danger)', color: 'var(--color-text-danger)', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
              {error}
            </div>
          )}
          {loading ? (
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Loading bank data…</div>
          ) : (
            <>
              <StatementsList statements={statements} />
              <MatchWorklist
                transactions={transactions}
                matches={matches}
                budgetItems={budgetItems}
                onConfirm={handleConfirm}
                onReject={handleReject}
                onUnconfirm={handleUnconfirm}
                onManualMatch={handleManualMatch}
                onDeleteSuggestion={handleDeleteSuggestion}
              />
              <SummaryBar summary={summary} />
            </>
          )}
        </div>
      )}

      {showUpload && (
        <BankStatementUpload
          projectId={projectId}
          onSubmit={handleUpload}
          onCancel={() => setShowUpload(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────── Subcomponents ───────────────────────────

function StatementsList({ statements }: { statements: ApiBankStatement[] }) {
  if (statements.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
        No statements uploaded yet. Upload an MCB CSV to begin reconciliation.
      </div>
    );
  }
  return (
    <div data-design-bank-statements>
      <h5 style={subhead()}>Uploaded statements ({statements.length})</h5>
      <div style={{ overflowX: 'auto', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)' }}>
        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', minWidth: 480 }}>
          <thead>
            <tr style={{ color: 'var(--color-text-tertiary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, background: 'var(--color-background-tertiary)' }}>
              <th style={cell('left')}>Account</th>
              <th style={cell('left')}>Period</th>
              <th style={cell('right')}>Txns</th>
              <th style={cell('left')}>Status</th>
              <th style={cell('left')}>Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {statements.map((s) => (
              <tr key={s.id} style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                <td style={cell('left')}>
                  <div style={{ fontWeight: 500 }}>{s.account_label}</div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>{s.bank_code}</div>
                </td>
                <td style={cell('left')}>{s.statement_period_start} → {s.statement_period_end}</td>
                <td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)' }}>{s.txn_count}</td>
                <td style={cell('left')}><ParseStatusChip status={s.parse_status} /></td>
                <td style={cell('left')}>{s.uploaded_at.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ParseStatusChip({ status }: { status: ApiBankStatement['parse_status'] }) {
  const c =
    status === 'parsed' ? { bg: 'var(--color-bg-success)', fg: 'var(--color-text-success)' } :
    status === 'failed' ? { bg: 'var(--color-bg-danger)',  fg: 'var(--color-text-danger)' } :
                          { bg: 'var(--color-background-tertiary)', fg: 'var(--color-text-tertiary)' };
  return <span style={{ padding: '2px 8px', background: c.bg, color: c.fg, borderRadius: 'var(--radius-full)', fontSize: 10, fontWeight: 500 }}>{status}</span>;
}

interface MatchWorklistProps {
  transactions: ApiBankTransaction[];
  matches: ApiBankMatch[];
  budgetItems: ApiBudgetItem[];
  onConfirm: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  onUnconfirm: (id: string) => Promise<void>;
  onManualMatch: (txnId: string, itemId: string) => Promise<void>;
  onDeleteSuggestion: (id: string) => Promise<void>;
}

function MatchWorklist(props: MatchWorklistProps) {
  const { transactions, matches, budgetItems } = props;

  // Lookup helpers.
  const activeMatchByTxn = useMemo(() => {
    const map = new Map<string, ApiBankMatch>();
    // confirmed wins over suggested; rejected ignored for the active state.
    for (const m of matches) {
      if (m.status === 'confirmed') map.set(m.transaction_id, m);
    }
    for (const m of matches) {
      if (m.status === 'suggested' && !map.has(m.transaction_id)) map.set(m.transaction_id, m);
    }
    return map;
  }, [matches]);

  const itemById = useMemo(() => new Map(budgetItems.map((b) => [b.id, b])), [budgetItems]);

  // Group transactions for display: pending → confirmed → rejected → credits.
  const groups = useMemo(() => {
    const pending: ApiBankTransaction[] = [];
    const confirmed: ApiBankTransaction[] = [];
    const credits: ApiBankTransaction[] = [];
    for (const t of transactions) {
      if (t.amount_minor >= 0) { credits.push(t); continue; }
      const m = activeMatchByTxn.get(t.id);
      if (m?.status === 'confirmed') confirmed.push(t);
      else pending.push(t);
    }
    return { pending, confirmed, credits };
  }, [transactions, activeMatchByTxn]);

  if (transactions.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
        No transactions to reconcile yet.
      </div>
    );
  }

  return (
    <div data-design-bank-worklist style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h5 style={subhead()}>Match worklist</h5>
      <GroupTable
        {...props}
        title={`Pending (${groups.pending.length})`}
        transactions={groups.pending}
        activeMatchByTxn={activeMatchByTxn}
        itemById={itemById}
        kind="pending"
      />
      <GroupTable
        {...props}
        title={`Confirmed (${groups.confirmed.length})`}
        transactions={groups.confirmed}
        activeMatchByTxn={activeMatchByTxn}
        itemById={itemById}
        kind="confirmed"
      />
      {groups.credits.length > 0 && (
        <GroupTable
          {...props}
          title={`Credits (${groups.credits.length}) — not reconciled`}
          transactions={groups.credits}
          activeMatchByTxn={activeMatchByTxn}
          itemById={itemById}
          kind="credits"
        />
      )}
    </div>
  );
}

interface GroupTableProps extends MatchWorklistProps {
  title: string;
  transactions: ApiBankTransaction[];
  activeMatchByTxn: Map<string, ApiBankMatch>;
  itemById: Map<string, ApiBudgetItem>;
  kind: 'pending' | 'confirmed' | 'credits';
}

function GroupTable(props: GroupTableProps) {
  const { title, transactions, activeMatchByTxn, itemById, budgetItems, kind,
    onConfirm, onReject, onUnconfirm, onManualMatch, onDeleteSuggestion } = props;

  if (transactions.length === 0) {
    return (
      <details style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)', padding: 8 }}>
        <summary style={{ fontSize: 12, cursor: 'pointer', color: 'var(--color-text-tertiary)' }}>{title}</summary>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', padding: '6px 4px' }}>None.</div>
      </details>
    );
  }
  return (
    <details
      open={kind === 'pending'}
      style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)', padding: 8 }}
    >
      <summary style={{ fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: 6 }}>{title}</summary>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', minWidth: 700 }}>
          <thead>
            <tr style={{ color: 'var(--color-text-tertiary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              <th style={cell('left')}>Date</th>
              <th style={cell('left')}>Descriptor</th>
              <th style={cell('right')}>Amount</th>
              <th style={cell('left')}>Match</th>
              <th style={cell('right')}> </th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => {
              const m = activeMatchByTxn.get(t.id);
              const item = m ? itemById.get(m.budget_item_id) ?? null : null;
              return (
                <tr key={t.id} style={{ borderTop: '0.5px dashed var(--color-border-tertiary)' }} data-design-bank-txn-row data-txn-id={t.id}>
                  <td style={{ ...cell('left'), fontFamily: 'var(--font-mono-fad)', whiteSpace: 'nowrap' }}>{t.posted_date}</td>
                  <td style={cell('left')}>
                    <div style={{ fontWeight: 500 }}>{t.descriptor}</div>
                    {t.reference && <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>ref: {t.reference}</div>}
                  </td>
                  <td style={{ ...cell('right'), fontFamily: 'var(--font-mono-fad)', color: t.amount_minor < 0 ? 'var(--color-text-warning)' : 'var(--color-text-success)' }}>
                    {t.amount_minor < 0 ? '−' : '+'}{formatMUR(Math.abs(t.amount_minor))}
                    <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'inherit' }}>
                      {t.amount_minor < 0 ? 'Debit' : 'Credit'}
                    </div>
                  </td>
                  <td style={cell('left')}>
                    {m && item ? (
                      <div>
                        <div style={{ fontSize: 11 }}>{item.description ?? `Item ${item.id.slice(0, 6)}`}</div>
                        {m.match_reason && <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{m.match_reason}{m.confidence != null ? ` · ${(m.confidence * 100).toFixed(0)}%` : ''}</div>}
                      </div>
                    ) : kind === 'credits' ? (
                      <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>credit — not reconciled</span>
                    ) : (
                      <ManualMatchPicker
                        transactionId={t.id}
                        budgetItems={budgetItems}
                        existingMatches={Array.from(activeMatchByTxn.values())}
                        onPick={onManualMatch}
                      />
                    )}
                  </td>
                  <td style={cell('right')}>
                    {m?.status === 'suggested' && (
                      <span style={{ display: 'inline-flex', gap: 6 }}>
                        <button type="button" onClick={() => void onConfirm(m.id)} style={primaryBtnXs()} data-design-bank-confirm>Confirm</button>
                        <button type="button" onClick={() => void onReject(m.id)} style={dangerBtnXs()} data-design-bank-reject>Reject</button>
                        <button type="button" onClick={() => void onDeleteSuggestion(m.id)} style={linkBtnSm()} title="Remove suggestion">×</button>
                      </span>
                    )}
                    {m?.status === 'confirmed' && (
                      <button type="button" onClick={() => void onUnconfirm(m.id)} style={linkBtnSm()} data-design-bank-unconfirm>Unconfirm</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function ManualMatchPicker({
  transactionId, budgetItems, existingMatches, onPick,
}: {
  transactionId: string;
  budgetItems: ApiBudgetItem[];
  existingMatches: ApiBankMatch[];
  onPick: (txnId: string, itemId: string) => Promise<void>;
}) {
  const [pick, setPick] = useState<string>('');
  const usedItemIds = useMemo(() => new Set(existingMatches.map((m) => m.budget_item_id)), [existingMatches]);
  const candidates = useMemo(
    () => budgetItems.filter((b) => typeof b.actual_paid_minor === 'number' && b.actual_paid_minor !== 0 && !usedItemIds.has(b.id)),
    [budgetItems, usedItemIds],
  );
  if (candidates.length === 0) {
    return <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>no unmatched items</span>;
  }
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }} data-design-bank-manual-picker>
      <select
        value={pick}
        onChange={(e) => setPick(e.target.value)}
        style={{ padding: '4px 6px', fontSize: 11, border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-primary)' }}
      >
        <option value="">— pick item —</option>
        {candidates.map((b) => (
          <option key={b.id} value={b.id}>
            {(b.description ?? `Item ${b.id.slice(0, 6)}`)}
            {b.actual_paid_minor != null ? ` · ${formatMUR(Math.abs(b.actual_paid_minor))}` : ''}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!pick}
        onClick={() => { if (pick) void onPick(transactionId, pick); setPick(''); }}
        style={pick ? primaryBtnXs() : { ...primaryBtnXs(), opacity: 0.4, cursor: 'not-allowed' }}
      >
        Match
      </button>
    </span>
  );
}

function SummaryChip({ summary }: { summary: ReconciliationSummary }) {
  return (
    <span style={{
      display: 'inline-flex', gap: 6, alignItems: 'center',
      padding: '4px 10px', borderRadius: 'var(--radius-full)',
      background: summary.ready ? 'var(--color-bg-success)' : 'var(--color-background-tertiary)',
      color: summary.ready ? 'var(--color-text-success)' : 'var(--color-text-tertiary)',
      fontSize: 10, fontWeight: 500,
    }}>
      {summary.ready ? '✓ ready' : `${summary.confirmed}/${summary.totalDebits} debits · ${summary.itemsMatched}/${summary.itemsRequiringMatch} items`}
    </span>
  );
}

function SummaryBar({ summary }: { summary: ReconciliationSummary }) {
  const txnPct = summary.totalDebits === 0 ? 100 : Math.round((summary.confirmed / summary.totalDebits) * 100);
  const itemPct = summary.itemsRequiringMatch === 0 ? 100 : Math.round((summary.itemsMatched / summary.itemsRequiringMatch) * 100);
  return (
    <div data-design-bank-summary style={{ background: 'var(--color-background-tertiary)', padding: 12, borderRadius: 'var(--radius-sm)' }}>
      <h5 style={subhead()}>Reconciliation summary</h5>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <ProgressRow label="Debit transactions" current={summary.confirmed} total={summary.totalDebits} pct={txnPct} sublabel={`${summary.pending} pending · ${summary.rejected} rejected`} />
        <ProgressRow label="Actual-paid items" current={summary.itemsMatched} total={summary.itemsRequiringMatch} pct={itemPct} sublabel={summary.itemsRequiringMatch === 0 ? 'no items to match' : `${summary.itemsRequiringMatch - summary.itemsMatched} still unmatched`} />
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: summary.ready ? 'var(--color-text-success)' : 'var(--color-text-tertiary)' }}>
        {summary.ready
          ? '✓ All gates clear — finalize is unblocked above.'
          : 'Resolve all pending debits and match every actual-paid item to enable finalize.'}
      </div>
    </div>
  );
}

function ProgressRow({ label, current, total, pct, sublabel }: { label: string; current: number; total: number; pct: number; sublabel: string }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono-fad)', color: 'var(--color-text-primary)' }}>{current} / {total}</span>
      </div>
      <div style={{ height: 6, background: 'var(--color-background-primary)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? 'var(--color-text-success)' : 'var(--color-brand-accent)' }} />
      </div>
      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4 }}>{sublabel}</div>
    </div>
  );
}

// ─────────────────────────── Styles ───────────────────────────

function cardStyle(): React.CSSProperties { return { background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)', padding: 14 }; }
function subhead(): React.CSSProperties { return { margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }; }
function cell(align: 'left' | 'right'): React.CSSProperties { return { padding: '6px 8px', textAlign: align }; }
function primaryBtnSm(): React.CSSProperties { return { padding: '6px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--color-brand-accent)', color: '#fff', fontSize: 12, fontWeight: 500 }; }
function primaryBtnXs(): React.CSSProperties { return { padding: '4px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--color-brand-accent)', color: '#fff', fontSize: 11 }; }
function dangerBtnXs(): React.CSSProperties { return { padding: '4px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-danger)', color: 'var(--color-text-danger)', fontSize: 11, border: '0.5px solid var(--color-text-danger)' }; }
function linkBtnSm(): React.CSSProperties { return { padding: 0, background: 'transparent', fontSize: 11, color: 'var(--color-text-tertiary)', textDecoration: 'underline' }; }
