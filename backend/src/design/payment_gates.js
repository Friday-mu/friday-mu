'use strict';

// Payment gates — two-ledger split per migration 006:
//
//   fee_invoice (default): Friday revenue gates per Annex A milestones
//     (agreement_signed, design_fee_60, design_fee_40, execution_fee_t1,
//     execution_fee_t2, final_balance). One row per (project, gate_id),
//     idempotent upsert via PUT, pending → received | waived.
//
//   project_fund: Owner-deposited EPC funds held in escrow (gate_id =
//     'project_funds'). Append-only — top-ups (credit) and drawdowns
//     (debit) each insert a new row. Inserted via the dedicated
//     /:project_id/project_fund/movement endpoint, NOT via PUT.
//
// Logging a fee receipt or a project-fund movement fires a portal-visible
// activity event with action namespaced by ledger.

const express = require('express');
const { query } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { shapePaymentGate } = require('./adapters');
const { appendActivity } = require('./activities');

const router = express.Router();

const LEDGER_TYPES = new Set(['fee_invoice', 'project_fund']);
const DIRECTIONS = new Set(['debit', 'credit']);

async function assertProjectExists(projectId, tenantId) {
  const ownerCheck = await query(
    `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
    [tenantId, projectId],
  );
  return ownerCheck.rows.length > 0;
}

// GET /api/design/payment_gates?project_id=<id>[&ledger_type=fee_invoice|project_fund]
router.get('/', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const projectId = req.query.project_id;
    if (typeof projectId !== 'string') {
      return res.status(400).json({ error: 'project_id query param is required' });
    }
    const ledgerType = typeof req.query.ledger_type === 'string' ? req.query.ledger_type : null;
    if (ledgerType !== null && !LEDGER_TYPES.has(ledgerType)) {
      return res.status(400).json({ error: 'ledger_type must be fee_invoice or project_fund' });
    }
    if (!(await assertProjectExists(projectId, req.tenantId))) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const sql = ledgerType
      ? `SELECT * FROM design_payment_gates
         WHERE project_id = $1 AND ledger_type = $2
         ORDER BY due_date NULLS LAST, created_at`
      : `SELECT * FROM design_payment_gates
         WHERE project_id = $1
         ORDER BY due_date NULLS LAST, created_at`;
    const params = ledgerType ? [projectId, ledgerType] : [projectId];
    const { rows } = await query(sql, params);
    res.json({ results: rows.map(shapePaymentGate) });
  } catch (e) {
    console.error('[design/payment_gates] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/design/payment_gates/reconciliation?project_id=<id>
// Two-ledger handover rollup. Returns:
//   fee_invoice: { total_billed_minor, total_received_minor,
//                  outstanding_minor, gates: [...] }
//   project_fund: { total_deposited_minor, total_drawn_minor,
//                   balance_minor, movements: [...] }
// All money values are stringified BigInts to avoid JS-Number precision
// loss on large minor-unit sums. Waived fee_invoice rows are excluded
// from both billed and received (they were neither billed nor paid).
router.get('/reconciliation', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const projectId = req.query.project_id;
    if (typeof projectId !== 'string') {
      return res.status(400).json({ error: 'project_id query param is required' });
    }
    if (!(await assertProjectExists(projectId, req.tenantId))) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const { rows } = await query(
      `SELECT * FROM design_payment_gates
       WHERE project_id = $1
       ORDER BY ledger_type, due_date NULLS LAST, created_at`,
      [projectId],
    );

    const feeRows = rows.filter((r) => (r.ledger_type || 'fee_invoice') === 'fee_invoice');
    const fundRows = rows.filter((r) => r.ledger_type === 'project_fund');

    // fee_invoice: billed = sum(amount_minor) excluding waived rows.
    // received = sum(received_amount_minor) on status='received'.
    let feeBilled = 0n;
    let feeReceived = 0n;
    for (const r of feeRows) {
      if (r.status === 'waived') continue;
      feeBilled += BigInt(r.amount_minor || 0);
      if (r.status === 'received') {
        feeReceived += BigInt(
          r.received_amount_minor != null ? r.received_amount_minor : r.amount_minor || 0,
        );
      }
    }

    // project_fund: credit movements (top-ups) deposit, debit movements
    // draw. Balance = deposited - drawn. Movements always insert with
    // received_amount_minor populated (see /project_fund/movement), so
    // we read from that field with amount_minor as a fallback.
    let fundDeposited = 0n;
    let fundDrawn = 0n;
    for (const r of fundRows) {
      const amount = BigInt(
        r.received_amount_minor != null ? r.received_amount_minor : r.amount_minor || 0,
      );
      if (r.direction === 'debit') fundDrawn += amount;
      else fundDeposited += amount;
    }

    res.json({
      project_id: projectId,
      fee_invoice: {
        total_billed_minor: feeBilled.toString(),
        total_received_minor: feeReceived.toString(),
        outstanding_minor: (feeBilled - feeReceived).toString(),
        gates: feeRows.map(shapePaymentGate),
      },
      project_fund: {
        total_deposited_minor: fundDeposited.toString(),
        total_drawn_minor: fundDrawn.toString(),
        balance_minor: (fundDeposited - fundDrawn).toString(),
        movements: fundRows.map(shapePaymentGate),
      },
    });
  } catch (e) {
    console.error('[design/payment_gates] reconciliation error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/design/payment_gates/:project_id/:gate_id — upsert (set
// amount + due_date for a fee_invoice gate). Idempotent.
//
// Body: { amount_minor?, due_date?, ledger_type?, direction? }
// Defaults: ledger_type='fee_invoice', direction='credit'. The partial
// unique index in migration 006 only covers fee_invoice rows, so passing
// ledger_type='project_fund' here would NOT collide on conflict — use
// POST /:project_id/project_fund/movement for those instead.
router.put('/:project_id/:gate_id', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const { project_id: projectId, gate_id: gateId } = req.params;
    if (!(await assertProjectExists(projectId, req.tenantId))) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const body = req.body || {};
    const ledgerType = body.ledger_type || 'fee_invoice';
    const direction = body.direction || 'credit';
    if (!LEDGER_TYPES.has(ledgerType)) {
      return res.status(400).json({ error: 'ledger_type must be fee_invoice or project_fund' });
    }
    if (!DIRECTIONS.has(direction)) {
      return res.status(400).json({ error: 'direction must be debit or credit' });
    }
    if (ledgerType === 'project_fund') {
      return res.status(400).json({
        error: 'project_fund movements are append-only; use POST /:project_id/project_fund/movement',
      });
    }
    const { rows } = await query(
      `INSERT INTO design_payment_gates (project_id, gate_id, amount_minor, due_date, ledger_type, direction)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (project_id, gate_id) WHERE ledger_type = 'fee_invoice' DO UPDATE
       SET amount_minor = EXCLUDED.amount_minor,
           due_date = EXCLUDED.due_date,
           direction = EXCLUDED.direction,
           updated_at = NOW()
       RETURNING *`,
      [projectId, gateId, body.amount_minor || null, body.due_date || null, ledgerType, direction],
    );
    res.json(shapePaymentGate(rows[0]));
  } catch (e) {
    console.error('[design/payment_gates] upsert error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/design/payment_gates/:project_id/:gate_id/receive
// Marks a fee_invoice gate as received. The partial unique index keeps
// fee_invoice rows unique per (project, gate), so this UPDATE hits exactly
// one row. project_fund movements should not call this endpoint — they
// post via /project_fund/movement which inserts a new row.
router.post('/:project_id/:gate_id/receive', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const { project_id: projectId, gate_id: gateId } = req.params;
    const { amount_minor, received_at, note } = req.body || {};
    const { rows } = await query(
      `UPDATE design_payment_gates
       SET status = 'received',
           received_amount_minor = $3,
           received_at = COALESCE($4::timestamptz, NOW()),
           received_note = $5,
           direction = 'credit',
           updated_at = NOW()
       WHERE project_id = $1 AND gate_id = $2
         AND ledger_type = 'fee_invoice' AND status = 'pending'
       RETURNING *`,
      [projectId, gateId, amount_minor || null, received_at || null, note || null],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Pending fee_invoice gate not found' });
    await appendActivity({
      projectId,
      actorUserId: req.identity.userId,
      actorName: req.identity.displayName || req.identity.username,
      action: 'payment.fee_invoice.received',
      payload: { ledger_type: 'fee_invoice', gate_id: gateId, amount_minor: amount_minor || null },
      visibility: 'portal',
    });
    res.json(shapePaymentGate(rows[0]));
  } catch (e) {
    console.error('[design/payment_gates] receive error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/design/payment_gates/:project_id/:gate_id/waive
router.post('/:project_id/:gate_id/waive', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const { project_id: projectId, gate_id: gateId } = req.params;
    const { note } = req.body || {};
    const { rows } = await query(
      `UPDATE design_payment_gates
       SET status = 'waived', received_note = $3, updated_at = NOW()
       WHERE project_id = $1 AND gate_id = $2
         AND ledger_type = 'fee_invoice' AND status = 'pending'
       RETURNING *`,
      [projectId, gateId, note || null],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Pending fee_invoice gate not found' });
    await appendActivity({
      projectId,
      actorUserId: req.identity.userId,
      actorName: req.identity.displayName || req.identity.username,
      action: 'payment.fee_invoice.waived',
      payload: { ledger_type: 'fee_invoice', gate_id: gateId, note: note || null },
      visibility: 'internal',
    });
    res.json(shapePaymentGate(rows[0]));
  } catch (e) {
    console.error('[design/payment_gates] waive error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/design/payment_gates/:project_id/project_fund/movement
// Append-only insert for a project_fund movement. Body:
//   { direction: 'debit'|'credit', amount_minor: number, due_date?: ISO, note?: string }
// Credit = owner top-up (deposit). Debit = drawdown (spend). The
// reconciliation rollup nets these to a running balance.
router.post('/:project_id/project_fund/movement', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const { project_id: projectId } = req.params;
    if (!(await assertProjectExists(projectId, req.tenantId))) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const body = req.body || {};
    const direction = body.direction;
    if (!DIRECTIONS.has(direction)) {
      return res.status(400).json({ error: 'direction is required (debit or credit)' });
    }
    if (typeof body.amount_minor !== 'number' && typeof body.amount_minor !== 'string') {
      return res.status(400).json({ error: 'amount_minor is required' });
    }
    const amountMinor = body.amount_minor;
    const dueDate = body.due_date || null;
    const note = body.note || null;
    // Movements record the realised amount immediately. status = 'received'
    // marks the row as fully posted (vs the fee_invoice 'pending' lifecycle).
    // received_at = now so the row is properly time-stamped for reconciliation.
    const { rows } = await query(
      `INSERT INTO design_payment_gates
         (project_id, gate_id, ledger_type, direction,
          amount_minor, received_amount_minor, due_date,
          status, received_at, received_note)
       VALUES ($1, 'project_funds', 'project_fund', $2,
               $3, $3, $4,
               'received', NOW(), $5)
       RETURNING *`,
      [projectId, direction, amountMinor, dueDate, note],
    );
    await appendActivity({
      projectId,
      actorUserId: req.identity.userId,
      actorName: req.identity.displayName || req.identity.username,
      action: direction === 'credit'
        ? 'payment.project_fund.deposit'
        : 'payment.project_fund.drawdown',
      payload: {
        ledger_type: 'project_fund',
        direction,
        amount_minor: amountMinor,
        note,
      },
      visibility: 'internal',
    });
    res.status(201).json(shapePaymentGate(rows[0]));
  } catch (e) {
    console.error('[design/payment_gates] project_fund movement error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
