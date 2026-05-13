// Bank reconciliation unit tests (design-be-24).
//
// Covers the four primitives the brief calls out:
//   1. suggestMatches scoring + threshold + de-duplication
//   2. match status transitions (computeReconciliationSummary readiness)
//   3. reconciliation summary computation
//   4. parseMcbCsv handles MCB date + amount formats

import { describe, expect, it } from 'vitest';

import {
  parseMcbCsv,
  parseMauritiusDate,
  parseAmountToMinor,
} from './BankStatementUpload';
import { computeReconciliationSummary } from './BankReconciliationPanel';
import type {
  ApiBankMatch,
  ApiBankTransaction,
  ApiBudgetItem,
} from '../../../_data/designClient';

// The match scoring is shared between backend + frontend tests, so it lives
// in backend/src/design/match_scoring.js with NO top-level deps. Vitest can
// require it directly from the relative path.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const { suggestMatches } = require('../../../../../../../backend/src/design/match_scoring');

// ─────────────────────────── parseMauritiusDate / parseAmountToMinor ───────────────────────────

describe('parseMauritiusDate', () => {
  it('parses DD/MM/YYYY MCB format', () => {
    expect(parseMauritiusDate('13/05/2026')).toBe('2026-05-13');
  });
  it('parses single-digit day/month', () => {
    expect(parseMauritiusDate('3/5/2026')).toBe('2026-05-03');
  });
  it('parses DD-MM-YYYY variant', () => {
    expect(parseMauritiusDate('13-05-2026')).toBe('2026-05-13');
  });
  it('passes ISO through unchanged', () => {
    expect(parseMauritiusDate('2026-05-13')).toBe('2026-05-13');
  });
  it('expands 2-digit year', () => {
    expect(parseMauritiusDate('13/05/26')).toBe('2026-05-13');
  });
  it('returns null on garbage', () => {
    expect(parseMauritiusDate('not a date')).toBeNull();
    expect(parseMauritiusDate('')).toBeNull();
    expect(parseMauritiusDate('32/01/2026')).toBeNull();
    expect(parseMauritiusDate('15/13/2026')).toBeNull();
  });
});

describe('parseAmountToMinor', () => {
  it('parses "1,234.56" comma-thousand decimal', () => {
    expect(parseAmountToMinor('1,234.56')).toBe(123456);
  });
  it('parses negative amounts', () => {
    expect(parseAmountToMinor('-50.00')).toBe(-5000);
  });
  it('parses parenthesised negatives (accounting notation)', () => {
    expect(parseAmountToMinor('(123.45)')).toBe(-12345);
  });
  it('strips Rs prefix', () => {
    expect(parseAmountToMinor('Rs 1,500.00')).toBe(150000);
  });
  it('returns null on empty / garbage', () => {
    expect(parseAmountToMinor('')).toBeNull();
    expect(parseAmountToMinor('abc')).toBeNull();
  });
});

// ─────────────────────────── parseMcbCsv ───────────────────────────

describe('parseMcbCsv — separate debit/credit columns', () => {
  const csv = [
    'Posted Date,Value Date,Descriptor,Debit,Credit,Balance',
    '13/05/2026,13/05/2026,PAYMENT TO COURTS LTD,"15,000.00",,"123,456.78"',
    '14/05/2026,14/05/2026,TRANSFER FROM OWNER,,"50,000.00","173,456.78"',
    '15/05/2026,15/05/2026,PAYMENT TO JAABIR LTD,"8,500.00",,"164,956.78"',
  ].join('\n');

  it('produces signed amounts (debit negative, credit positive)', () => {
    const r = parseMcbCsv(csv);
    expect(r.ok).toBe(true);
    expect(r.transactions).toHaveLength(3);
    expect(r.transactions[0].amount_minor).toBe(-1500000); // 15000.00 debit
    expect(r.transactions[1].amount_minor).toBe(5000000);  // 50000.00 credit
    expect(r.transactions[2].amount_minor).toBe(-850000);  // 8500.00 debit
  });

  it('parses descriptor + dates', () => {
    const r = parseMcbCsv(csv);
    expect(r.transactions[0].descriptor).toBe('PAYMENT TO COURTS LTD');
    expect(r.transactions[0].posted_date).toBe('2026-05-13');
  });

  it('infers period from data', () => {
    const r = parseMcbCsv(csv);
    expect(r.inferred_period_start).toBe('2026-05-13');
    expect(r.inferred_period_end).toBe('2026-05-15');
  });
});

describe('parseMcbCsv — signed amount column', () => {
  it('handles a single signed amount column', () => {
    const csv = [
      'Date,Description,Amount,Balance',
      '13/05/2026,PAYMENT TO COURTS LTD,"-15,000.00","123,456.78"',
      '14/05/2026,TRANSFER FROM OWNER,"50,000.00","173,456.78"',
    ].join('\n');
    const r = parseMcbCsv(csv);
    expect(r.ok).toBe(true);
    expect(r.transactions).toHaveLength(2);
    expect(r.transactions[0].amount_minor).toBe(-1500000);
    expect(r.transactions[1].amount_minor).toBe(5000000);
  });
});

describe('parseMcbCsv — error cases', () => {
  it('reports missing required columns', () => {
    const csv = 'a,b,c\n1,2,3';
    expect(parseMcbCsv(csv).ok).toBe(false);
  });
  it('handles empty input', () => {
    expect(parseMcbCsv('').ok).toBe(false);
  });
  it('skips rows with malformed dates silently', () => {
    const csv = [
      'Posted Date,Descriptor,Debit,Credit',
      '13/05/2026,GOOD,"100.00",',
      'not-a-date,BAD,"100.00",',
      '14/05/2026,GOOD2,"200.00",',
    ].join('\n');
    const r = parseMcbCsv(csv);
    expect(r.ok).toBe(true);
    expect(r.transactions).toHaveLength(2);
  });
});

// ─────────────────────────── suggestMatches ───────────────────────────

describe('suggestMatches', () => {
  it('scores amount+date+descriptor and suggests above 0.6 threshold', () => {
    const txns = [
      { id: 't1', posted_date: '2026-05-13', amount_minor: -1500000, descriptor: 'PAYMENT TO COURTS LTD' },
    ];
    const items = [
      { id: 'i1', actual_paid_minor: 1500000, description: 'Sofa from Courts', vendor_name: 'Courts Ltd', due_date: '2026-05-12' },
    ];
    const r = suggestMatches(txns, items);
    expect(r).toHaveLength(1);
    expect(r[0].transaction_id).toBe('t1');
    expect(r[0].budget_item_id).toBe('i1');
    expect(r[0].confidence).toBeGreaterThanOrEqual(0.6);
    expect(r[0].match_reason).toContain('amount');
  });

  it('refuses to suggest below the 0.6 threshold', () => {
    // Only descriptor matches (0.2 weight) — well below 0.6.
    const txns = [
      { id: 't1', posted_date: '2026-01-01', amount_minor: -999999, descriptor: 'PAYMENT TO COURTS LTD' },
    ];
    const items = [
      { id: 'i1', actual_paid_minor: 1500000, description: 'Sofa', vendor_name: 'Courts Ltd', due_date: '2026-12-31' },
    ];
    const r = suggestMatches(txns, items);
    expect(r).toHaveLength(0);
  });

  it('skips credit transactions', () => {
    const txns = [
      { id: 't1', posted_date: '2026-05-13', amount_minor: 1500000, descriptor: 'TRANSFER FROM OWNER' },
    ];
    const items = [
      { id: 'i1', actual_paid_minor: 1500000, description: 'Anything', vendor_name: 'Anyone', due_date: '2026-05-13' },
    ];
    expect(suggestMatches(txns, items)).toHaveLength(0);
  });

  it('skips items with null actual_paid_minor', () => {
    const txns = [
      { id: 't1', posted_date: '2026-05-13', amount_minor: -1500000, descriptor: 'X' },
    ];
    const items = [
      { id: 'i1', actual_paid_minor: null, description: 'X', vendor_name: 'X', due_date: '2026-05-13' },
    ];
    expect(suggestMatches(txns, items)).toHaveLength(0);
  });

  it('uses one item at most per run, picking the best txn match', () => {
    // Two txns, one item. The closer-amount txn should win.
    const item = { id: 'i1', actual_paid_minor: 1500000, description: 'Sofa', vendor_name: 'Courts', due_date: '2026-05-13' };
    const txns = [
      { id: 't_far', posted_date: '2026-05-13', amount_minor: -2000000, descriptor: 'PAYMENT TO COURTS' }, // wrong amount, right vendor
      { id: 't_near', posted_date: '2026-05-13', amount_minor: -1500000, descriptor: 'PAYMENT TO COURTS' }, // right amount
    ];
    const r = suggestMatches(txns, [item]);
    // t_near should win (amount perfect + date + descriptor = 1.0)
    // t_far has only date+descriptor = 0.5; below threshold so not suggested.
    expect(r).toHaveLength(1);
    expect(r[0].transaction_id).toBe('t_near');
  });

  it('honours alreadyMatchedItemIds and alreadyMatchedTxnIds', () => {
    const txns = [
      { id: 't1', posted_date: '2026-05-13', amount_minor: -1500000, descriptor: 'COURTS LTD' },
    ];
    const items = [
      { id: 'i1', actual_paid_minor: 1500000, description: 'Sofa', vendor_name: 'Courts Ltd', due_date: '2026-05-13' },
    ];
    expect(suggestMatches(txns, items, new Set(['i1']))).toHaveLength(0);
    expect(suggestMatches(txns, items, new Set(), new Set(['t1']))).toHaveLength(0);
  });
});

// ─────────────────────────── computeReconciliationSummary ───────────────────────────

const t = (id: string, amount: number): ApiBankTransaction => ({
  id, statement_id: 's1', project_id: 'p1',
  posted_date: '2026-05-13', value_date: null,
  amount_minor: amount, descriptor: `txn ${id}`,
  reference: null, balance_minor: null,
  created_at: '2026-05-13T00:00:00Z', updated_at: '2026-05-13T00:00:00Z',
});

const m = (id: string, txnId: string, itemId: string, status: ApiBankMatch['status']): ApiBankMatch => ({
  id, project_id: 'p1', transaction_id: txnId, budget_item_id: itemId,
  status, confidence: 0.9, match_reason: 'test', confirmed_at: null,
  confirmed_by_user_id: null, notes: null,
  created_at: '2026-05-13T00:00:00Z', updated_at: '2026-05-13T00:00:00Z',
});

const b = (id: string, actualPaid: number | null): ApiBudgetItem => ({
  id, project_id: 'p1', description: `item ${id}`,
  actual_paid_minor: actualPaid,
  created_at: '2026-05-13T00:00:00Z', updated_at: '2026-05-13T00:00:00Z',
});

describe('computeReconciliationSummary — transaction gate', () => {
  it('counts only debits as needing reconciliation', () => {
    const s = computeReconciliationSummary([t('t1', -1000), t('t2', 5000)], [], []);
    expect(s.totalDebits).toBe(1);
    expect(s.pending).toBe(1);
    expect(s.confirmed).toBe(0);
    expect(s.ready).toBe(false);
  });

  it('moves status from suggested → confirmed → ready', () => {
    const txns = [t('t1', -1000)];
    const items = [b('i1', 1000)];

    // No match yet — pending.
    let s = computeReconciliationSummary(txns, [], items);
    expect(s.confirmed).toBe(0);
    expect(s.pending).toBe(1);
    expect(s.ready).toBe(false);

    // Suggested match — still pending.
    s = computeReconciliationSummary(txns, [m('m1', 't1', 'i1', 'suggested')], items);
    expect(s.confirmed).toBe(0);
    expect(s.pending).toBe(1);
    expect(s.ready).toBe(false);

    // Confirmed — both gates pass.
    s = computeReconciliationSummary(txns, [m('m1', 't1', 'i1', 'confirmed')], items);
    expect(s.confirmed).toBe(1);
    expect(s.pending).toBe(0);
    expect(s.itemsMatched).toBe(1);
    expect(s.ready).toBe(true);
  });

  it('treats rejected debits as resolved (not pending)', () => {
    const txns = [t('t1', -1000)];
    const items: ApiBudgetItem[] = [];
    const s = computeReconciliationSummary(txns, [m('m1', 't1', 'i1', 'rejected')], items);
    expect(s.rejected).toBe(1);
    expect(s.pending).toBe(0);
    expect(s.ready).toBe(true);
  });

  it('blocks ready when an actual-paid item has no confirmed match', () => {
    const txns = [t('t1', -1000)];
    const items = [b('i1', 1000), b('i2', 2000)];
    // Only one item confirmed; the other still needs a match.
    const s = computeReconciliationSummary(txns, [m('m1', 't1', 'i1', 'confirmed')], items);
    expect(s.itemsMatched).toBe(1);
    expect(s.itemsRequiringMatch).toBe(2);
    expect(s.ready).toBe(false);
  });

  it('ignores items with null actual_paid_minor for the item gate', () => {
    const items = [b('i1', null), b('i2', null)];
    const s = computeReconciliationSummary([], [], items);
    expect(s.itemsRequiringMatch).toBe(0);
    expect(s.ready).toBe(true);
  });

  it('is ready when there are no debits and no items', () => {
    const s = computeReconciliationSummary([t('credit', 1000)], [], []);
    expect(s.totalDebits).toBe(0);
    expect(s.ready).toBe(true);
  });
});
