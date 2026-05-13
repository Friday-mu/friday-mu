'use strict';

// Bank reconciliation (design-be-24). The reconciliation stage (#17) gates
// "finalize budget" on every actual-paid budget item having a confirmed
// match against a real MCB statement transaction.
//
// Routing exports TWO sub-routers because the URL shapes are nested:
//   - `projectBankRouter`  mounted on `/api/design/projects` and serves
//     `/:project_id/bank-statements`, `/:project_id/bank-transactions`,
//     `/:project_id/bank-matches`.
//   - `bankMatchRouter`    mounted on `/api/design/bank-matches` and
//     serves `/:id/confirm`, `/:id/reject`, plus DELETE for orphan suggestions.
// index.js wires both.
//
// suggestMatches() is exported for unit testing (it's a pure function
// over arrays — no DB I/O). The HTTP handler calls it after the bulk
// insert of transactions, then writes the suggested matches in a single
// batch.

const express = require('express');
const { query } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { DEFAULT_TENANT_ID } = require('./adapters');

const PARSE_STATUSES = new Set(['pending', 'parsed', 'failed']);
const BANK_CODES = new Set(['mcb', 'maubank']);
const MATCH_STATUSES = new Set(['suggested', 'confirmed', 'rejected']);

// ─────────────────────────── Adapters ───────────────────────────

function shapeStatement(row) {
  if (!row) return null;
  return {
    id: row.id,
    project_id: row.project_id,
    account_label: row.account_label,
    bank_code: row.bank_code,
    statement_period_start: row.statement_period_start,
    statement_period_end: row.statement_period_end,
    uploaded_at: row.uploaded_at,
    uploaded_by_user_id: row.uploaded_by_user_id,
    raw_source_url: row.raw_source_url,
    parse_status: row.parse_status,
    parse_error: row.parse_error,
    txn_count: Number(row.txn_count ?? 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function shapeTransaction(row) {
  if (!row) return null;
  return {
    id: row.id,
    statement_id: row.statement_id,
    project_id: row.project_id,
    posted_date: row.posted_date,
    value_date: row.value_date,
    amount_minor: Number(row.amount_minor),
    descriptor: row.descriptor,
    reference: row.reference,
    balance_minor: row.balance_minor != null ? Number(row.balance_minor) : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function shapeMatch(row) {
  if (!row) return null;
  return {
    id: row.id,
    project_id: row.project_id,
    budget_item_id: row.budget_item_id,
    transaction_id: row.transaction_id,
    status: row.status,
    confidence: row.confidence != null ? Number(row.confidence) : null,
    match_reason: row.match_reason,
    confirmed_at: row.confirmed_at,
    confirmed_by_user_id: row.confirmed_by_user_id,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ─────────────────────────── suggestMatches ───────────────────────────

/**
 * Score every debit transaction against every still-unmatched budget item
 * that has actual_paid_minor set, and emit at most one suggested match
 * per transaction (highest-scoring item). Pure function — no DB I/O.
 *
 * Scoring weights (locked decisions): amount 50% / date 30% / descriptor 20%.
 * Threshold: 0.6.
 *
 * Inputs:
 *   transactions: [{ id, posted_date, amount_minor, descriptor, ... }]
 *   budgetItems:  [{ id, actual_paid_minor, description, vendor_name?, due_date? }]
 *   alreadyMatchedItemIds: Set<string>   — items with an existing active match
 *   alreadyMatchedTxnIds:  Set<string>   — txns with an existing active match
 *
 * Output:
 *   [{ transaction_id, budget_item_id, confidence, match_reason }]
 */
function suggestMatches(transactions, budgetItems, alreadyMatchedItemIds = new Set(), alreadyMatchedTxnIds = new Set()) {
  const suggestions = [];
  const eligibleItems = budgetItems.filter(
    (b) => typeof b.actual_paid_minor === 'number'
      && b.actual_paid_minor !== 0
      && !alreadyMatchedItemIds.has(b.id),
  );

  // Mutable copy so we don't suggest the same item twice across txns.
  const usedItems = new Set();

  for (const txn of transactions) {
    if (alreadyMatchedTxnIds.has(txn.id)) continue;
    // Only debits — money out — are eligible to match a project expense.
    // Credits stay unmatched (refunds, owner deposits, transfers).
    if (typeof txn.amount_minor !== 'number' || txn.amount_minor >= 0) continue;

    let best = null;
    for (const item of eligibleItems) {
      if (usedItems.has(item.id)) continue;

      const txnAmount = Math.abs(txn.amount_minor);
      const itemAmount = Math.abs(item.actual_paid_minor);
      const amountDelta = itemAmount === 0 ? 1 : Math.abs(txnAmount - itemAmount) / itemAmount;
      const amountMatch = amountDelta < 0.02 ? 1.0 : 0.0;

      const dateProximity = computeDateProximity(txn.posted_date, item.due_date);
      const descriptorFuzzy = computeDescriptorFuzzy(txn.descriptor, item);

      const score = amountMatch * 0.5 + dateProximity * 0.3 + descriptorFuzzy * 0.2;

      if (score >= 0.6 && (!best || score > best.score)) {
        best = {
          item,
          score,
          reason: buildMatchReason(amountMatch, dateProximity, descriptorFuzzy),
        };
      }
    }

    if (best) {
      usedItems.add(best.item.id);
      suggestions.push({
        transaction_id: txn.id,
        budget_item_id: best.item.id,
        confidence: Number(best.score.toFixed(2)),
        match_reason: best.reason,
      });
    }
  }

  return suggestions;
}

function computeDateProximity(txnDate, itemDate) {
  if (!txnDate || !itemDate) return 0;
  const a = new Date(txnDate).getTime();
  const b = new Date(itemDate).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  const diffDays = Math.abs(a - b) / (1000 * 60 * 60 * 24);
  if (diffDays <= 3) return 1.0;
  if (diffDays <= 7) return 0.5;
  return 0;
}

function computeDescriptorFuzzy(descriptor, item) {
  if (!descriptor) return 0;
  const haystack = String(descriptor).toLowerCase();
  // Try vendor_name first (joined), then fall back to the item description.
  const candidates = [];
  if (item.vendor_name) candidates.push(String(item.vendor_name).toLowerCase());
  if (item.description) candidates.push(String(item.description).toLowerCase());
  for (const needle of candidates) {
    if (!needle || needle.length < 3) continue;
    if (haystack.includes(needle)) return 1.0;
    // Try first significant word (split on whitespace, take first 5+ chars).
    const firstWord = needle.split(/\s+/).find((w) => w.length >= 4);
    if (firstWord && haystack.includes(firstWord)) return 0.5;
  }
  return 0;
}

function buildMatchReason(amountMatch, dateProximity, descriptorFuzzy) {
  const parts = [];
  if (amountMatch >= 1) parts.push('amount');
  if (dateProximity >= 1) parts.push('date (≤3d)');
  else if (dateProximity >= 0.5) parts.push('date (≤7d)');
  if (descriptorFuzzy >= 1) parts.push('descriptor');
  else if (descriptorFuzzy >= 0.5) parts.push('descriptor (partial)');
  return parts.length > 0 ? `${parts.join(' + ')} match` : 'low-confidence match';
}

// ─────────────────────────── Project-scoped router ───────────────────────────

const projectBankRouter = express.Router({ mergeParams: true });

async function assertProject(projectId) {
  const ownerCheck = await query(
    `SELECT id FROM design_projects WHERE tenant_id = $1 AND id = $2`,
    [DEFAULT_TENANT_ID, projectId],
  );
  return ownerCheck.rows.length > 0;
}

// GET /api/design/projects/:project_id/bank-statements
projectBankRouter.get('/:project_id/bank-statements', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const { project_id } = req.params;
    if (!(await assertProject(project_id))) return res.status(404).json({ error: 'Project not found' });
    const { rows } = await query(
      `SELECT * FROM design_bank_statements WHERE project_id = $1 ORDER BY statement_period_end DESC, uploaded_at DESC`,
      [project_id],
    );
    res.json({ results: rows.map(shapeStatement) });
  } catch (e) {
    console.error('[design/bank_reconciliation] list statements error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/design/projects/:project_id/bank-statements
projectBankRouter.post('/:project_id/bank-statements', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const { project_id } = req.params;
    if (!(await assertProject(project_id))) return res.status(404).json({ error: 'Project not found' });
    const body = req.body || {};
    const {
      account_label,
      bank_code = 'mcb',
      statement_period_start,
      statement_period_end,
      raw_source_url = null,
      transactions = [],
    } = body;

    if (!account_label || typeof account_label !== 'string') {
      return res.status(400).json({ error: 'account_label is required' });
    }
    if (!BANK_CODES.has(bank_code)) {
      return res.status(400).json({ error: `bank_code must be one of ${[...BANK_CODES].join(', ')}` });
    }
    if (!statement_period_start || !statement_period_end) {
      return res.status(400).json({ error: 'statement_period_start and statement_period_end are required (YYYY-MM-DD)' });
    }
    if (!Array.isArray(transactions)) {
      return res.status(400).json({ error: 'transactions must be an array' });
    }

    // Insert the statement row.
    const stmtInsert = await query(
      `INSERT INTO design_bank_statements
         (project_id, account_label, bank_code, statement_period_start, statement_period_end,
          raw_source_url, uploaded_by_user_id, parse_status, txn_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)
       RETURNING *`,
      [
        project_id,
        account_label,
        bank_code,
        statement_period_start,
        statement_period_end,
        raw_source_url,
        req.identity?.userId || null,
        transactions.length,
      ],
    );
    const statement = stmtInsert.rows[0];

    // Bulk-insert transactions. Hand-rolled VALUES to keep one round-trip.
    let insertedTxns = [];
    if (transactions.length > 0) {
      const cols = ['statement_id', 'project_id', 'posted_date', 'value_date', 'amount_minor', 'descriptor', 'reference', 'balance_minor'];
      const tuples = [];
      const params = [];
      let p = 1;
      for (const t of transactions) {
        if (!t || typeof t !== 'object') continue;
        if (!t.posted_date || typeof t.amount_minor !== 'number' || !t.descriptor) {
          // Mark statement failed; roll back.
          await query(
            `UPDATE design_bank_statements SET parse_status = 'failed', parse_error = $2, updated_at = NOW() WHERE id = $1`,
            [statement.id, 'malformed transaction: posted_date, amount_minor, descriptor required'],
          );
          return res.status(400).json({ error: 'malformed transaction: posted_date, amount_minor, descriptor required' });
        }
        tuples.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
        params.push(
          statement.id,
          project_id,
          t.posted_date,
          t.value_date || null,
          Math.trunc(t.amount_minor),
          String(t.descriptor),
          t.reference || null,
          t.balance_minor != null ? Math.trunc(t.balance_minor) : null,
        );
      }
      if (tuples.length > 0) {
        const sql = `INSERT INTO design_bank_transactions (${cols.join(', ')}) VALUES ${tuples.join(', ')} RETURNING *`;
        const txnRes = await query(sql, params);
        insertedTxns = txnRes.rows;
      }
    }

    // Mark parsed; tee up the matcher.
    await query(
      `UPDATE design_bank_statements SET parse_status = 'parsed', updated_at = NOW() WHERE id = $1`,
      [statement.id],
    );

    // Run suggestMatches: fetch unmatched budget items + currently active matches.
    // updated_at is used as the proxy "paid date" for date-proximity scoring —
    // when an item is marked actual-paid the row's updated_at moves with it.
    // A dedicated paid_at column is a v2 enhancement.
    const budgetRes = await query(
      `SELECT b.id, b.description, b.actual_paid_minor, b.notes, b.updated_at AS due_date,
              v.name AS vendor_name
         FROM design_budget_items b
         LEFT JOIN design_vendors v ON v.id = b.vendor_id
        WHERE b.project_id = $1
          AND b.actual_paid_minor IS NOT NULL`,
      [project_id],
    );
    const activeMatchesRes = await query(
      `SELECT budget_item_id, transaction_id FROM design_bank_matches
        WHERE project_id = $1 AND status IN ('suggested', 'confirmed')`,
      [project_id],
    );
    const matchedItemIds = new Set(activeMatchesRes.rows.map((r) => r.budget_item_id));
    const matchedTxnIds  = new Set(activeMatchesRes.rows.map((r) => r.transaction_id));

    const suggestions = suggestMatches(
      insertedTxns.map(shapeTransaction),
      budgetRes.rows,
      matchedItemIds,
      matchedTxnIds,
    );

    let insertedMatches = [];
    if (suggestions.length > 0) {
      const cols = ['project_id', 'budget_item_id', 'transaction_id', 'status', 'confidence', 'match_reason'];
      const tuples = [];
      const params = [];
      let p = 1;
      for (const s of suggestions) {
        tuples.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
        params.push(project_id, s.budget_item_id, s.transaction_id, 'suggested', s.confidence, s.match_reason);
      }
      const sql = `INSERT INTO design_bank_matches (${cols.join(', ')}) VALUES ${tuples.join(', ')}
                   ON CONFLICT ON CONSTRAINT design_bank_matches_unique_active DO NOTHING
                   RETURNING *`;
      const mRes = await query(sql, params);
      insertedMatches = mRes.rows;
    }

    res.status(201).json({
      statement: shapeStatement({ ...statement, parse_status: 'parsed' }),
      transactions: insertedTxns.map(shapeTransaction),
      matches: insertedMatches.map(shapeMatch),
    });
  } catch (e) {
    console.error('[design/bank_reconciliation] create statement error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/design/projects/:project_id/bank-transactions?statement_id=...
projectBankRouter.get('/:project_id/bank-transactions', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const { project_id } = req.params;
    if (!(await assertProject(project_id))) return res.status(404).json({ error: 'Project not found' });
    const filters = ['project_id = $1'];
    const params = [project_id];
    let idx = 2;
    if (typeof req.query.statement_id === 'string') {
      filters.push(`statement_id = $${idx++}`);
      params.push(req.query.statement_id);
    }
    const sql = `SELECT * FROM design_bank_transactions WHERE ${filters.join(' AND ')} ORDER BY posted_date DESC, created_at ASC`;
    const { rows } = await query(sql, params);
    res.json({ results: rows.map(shapeTransaction) });
  } catch (e) {
    console.error('[design/bank_reconciliation] list transactions error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/design/projects/:project_id/bank-matches
projectBankRouter.get('/:project_id/bank-matches', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const { project_id } = req.params;
    if (!(await assertProject(project_id))) return res.status(404).json({ error: 'Project not found' });
    const filters = ['project_id = $1'];
    const params = [project_id];
    let idx = 2;
    if (typeof req.query.status === 'string') {
      if (!MATCH_STATUSES.has(req.query.status)) {
        return res.status(400).json({ error: `status must be one of ${[...MATCH_STATUSES].join(', ')}` });
      }
      filters.push(`status = $${idx++}`);
      params.push(req.query.status);
    }
    const sql = `SELECT * FROM design_bank_matches WHERE ${filters.join(' AND ')} ORDER BY created_at DESC`;
    const { rows } = await query(sql, params);
    res.json({ results: rows.map(shapeMatch) });
  } catch (e) {
    console.error('[design/bank_reconciliation] list matches error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/design/projects/:project_id/bank-matches — manual match.
projectBankRouter.post('/:project_id/bank-matches', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const { project_id } = req.params;
    if (!(await assertProject(project_id))) return res.status(404).json({ error: 'Project not found' });
    const { budget_item_id, transaction_id, notes = null } = req.body || {};
    if (!budget_item_id || !transaction_id) {
      return res.status(400).json({ error: 'budget_item_id and transaction_id are required' });
    }
    // Confirm both belong to the same project before linking.
    const checkRes = await query(
      `SELECT
         (SELECT 1 FROM design_budget_items WHERE id = $1 AND project_id = $3) AS item_ok,
         (SELECT 1 FROM design_bank_transactions WHERE id = $2 AND project_id = $3) AS txn_ok`,
      [budget_item_id, transaction_id, project_id],
    );
    if (!checkRes.rows[0]?.item_ok || !checkRes.rows[0]?.txn_ok) {
      return res.status(400).json({ error: 'budget_item_id or transaction_id does not belong to this project' });
    }
    const ins = await query(
      `INSERT INTO design_bank_matches (project_id, budget_item_id, transaction_id, status, match_reason, notes)
       VALUES ($1, $2, $3, 'suggested', 'manual entry', $4)
       ON CONFLICT ON CONSTRAINT design_bank_matches_unique_active DO NOTHING
       RETURNING *`,
      [project_id, budget_item_id, transaction_id, notes],
    );
    if (ins.rows.length === 0) {
      return res.status(409).json({ error: 'A suggested match already exists for this transaction. Reject it first.' });
    }
    res.status(201).json(shapeMatch(ins.rows[0]));
  } catch (e) {
    console.error('[design/bank_reconciliation] manual match error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────── Match-id-scoped router ───────────────────────────

const bankMatchRouter = express.Router();

// POST /api/design/bank-matches/:id/confirm
bankMatchRouter.post('/:id/confirm', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const upd = await query(
      `UPDATE design_bank_matches
          SET status = 'confirmed',
              confirmed_at = NOW(),
              confirmed_by_user_id = $2,
              updated_at = NOW()
        WHERE id = $1 AND status = 'suggested'
        RETURNING *`,
      [req.params.id, req.identity?.userId || null],
    );
    if (upd.rows.length === 0) return res.status(404).json({ error: 'Match not found or not in suggested state' });
    res.json(shapeMatch(upd.rows[0]));
  } catch (e) {
    console.error('[design/bank_reconciliation] confirm error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/design/bank-matches/:id/reject
bankMatchRouter.post('/:id/reject', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const upd = await query(
      `UPDATE design_bank_matches
          SET status = 'rejected',
              updated_at = NOW()
        WHERE id = $1 AND status IN ('suggested', 'confirmed')
        RETURNING *`,
      [req.params.id],
    );
    if (upd.rows.length === 0) return res.status(404).json({ error: 'Match not found or already rejected' });
    res.json(shapeMatch(upd.rows[0]));
  } catch (e) {
    console.error('[design/bank_reconciliation] reject error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/design/bank-matches/:id — only for suggested.
// Returns 200 with { ok: true } (not 204) to keep client.json() parsing happy.
bankMatchRouter.delete('/:id', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const del = await query(
      `DELETE FROM design_bank_matches WHERE id = $1 AND status = 'suggested' RETURNING id`,
      [req.params.id],
    );
    if (del.rows.length === 0) {
      return res.status(409).json({ error: 'Only suggested matches can be deleted. Use reject for confirmed matches.' });
    }
    res.json({ ok: true, id: del.rows[0].id });
  } catch (e) {
    console.error('[design/bank_reconciliation] delete error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = {
  projectBankRouter,
  bankMatchRouter,
  suggestMatches,
  shapeStatement,
  shapeTransaction,
  shapeMatch,
};
