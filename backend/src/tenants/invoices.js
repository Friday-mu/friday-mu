'use strict';

// Invoice / billing routes. Tenant-facing routes are gated by
// requireModule('billing') (always-on per modules.js, but the gate is
// cheap and forward-compatible with a future "billing-portal" pay-tier).
// FR-only admin routes are gated by a hard FR tenant-id + admin role
// check — swap for a platform-admin role when one exists.

const express = require('express');
const { query } = require('../database/client');
const { attachIdentity } = require('../design/auth');
const { requireModule } = require('./middleware');
const { shapeInvoice } = require('./adapters');

const router = express.Router();

const FR_TENANT_ID = '00000000-0000-0000-0000-000000000001';

function _isFrAdmin(req) {
  return req.tenantId === FR_TENANT_ID && req.identity?.userRole === 'admin';
}

// Compute the next per-year invoice number. Format: INV-YYYY-NNNN with
// NNNN zero-padded to 4 digits. Cheap MAX-scan; we'll move to a
// dedicated sequence if the volume warrants it.
async function _nextInvoiceNumber() {
  const year = new Date().getUTCFullYear();
  const prefix = `INV-${year}-`;
  const { rows } = await query(
    `SELECT invoice_number FROM invoices
     WHERE invoice_number LIKE $1
     ORDER BY invoice_number DESC LIMIT 1`,
    [`${prefix}%`],
  );
  let next = 1;
  if (rows.length > 0) {
    const tail = rows[0].invoice_number.slice(prefix.length);
    const n = parseInt(tail, 10);
    if (!Number.isNaN(n)) next = n + 1;
  }
  return `${prefix}${String(next).padStart(4, '0')}`;
}

// ─────────────────────────── tenant-facing ───────────────────────────

// GET /api/tenants/me/invoices — tenant pulls their own invoice
// history. Pagination capped at 200 (well above what a yearly bank-
// transfer cadence will produce).
router.get('/me/invoices', attachIdentity, requireModule('billing'), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const { rows } = await query(
      `SELECT * FROM invoices
       WHERE tenant_id = $1
       ORDER BY issued_at DESC
       LIMIT $2 OFFSET $3`,
      [req.tenantId, limit, offset],
    );
    res.json({ invoices: rows.map(shapeInvoice), limit, offset });
  } catch (e) {
    console.error('[tenants/invoices] me list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/tenants/me/invoices/:id/mark-paid — tenant claims they've
// transferred the funds. Flips status pending → paid_pending_confirmation.
// FR admin then has to confirm via /admin/invoices/:id/confirm-payment.
router.post('/me/invoices/:id/mark-paid', attachIdentity, requireModule('billing'), async (req, res) => {
  const { id } = req.params;
  const { bank_transfer_ref } = req.body || {};
  try {
    const { rows } = await query(
      `UPDATE invoices
       SET status = 'paid_pending_confirmation',
           bank_transfer_ref = COALESCE($3, bank_transfer_ref),
           updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND status = 'pending'
       RETURNING *`,
      [id, req.tenantId, bank_transfer_ref || null],
    );
    if (rows.length === 0) {
      // Could be: invoice doesn't exist, belongs to another tenant, or
      // is in the wrong status. Disambiguate so the UI can show useful
      // copy.
      const probe = await query(
        `SELECT status FROM invoices WHERE id = $1 AND tenant_id = $2`,
        [id, req.tenantId],
      );
      if (probe.rows.length === 0) {
        return res.status(404).json({ error: 'invoice not found' });
      }
      return res.status(409).json({
        error: `invoice cannot be marked paid from status "${probe.rows[0].status}"`,
        status: probe.rows[0].status,
      });
    }
    res.json(shapeInvoice(rows[0]));
  } catch (e) {
    console.error('[tenants/invoices] mark-paid error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────── FR-admin only ───────────────────────────

// POST /api/tenants/admin/invoices — FR issues a new invoice. Body:
//   tenant_id, amount_minor, currency_code?, period_start, period_end,
//   due_date, notes?
router.post('/admin/invoices', attachIdentity, async (req, res) => {
  if (!_isFrAdmin(req)) {
    return res.status(403).json({ error: 'Forbidden — FR admin only' });
  }
  const {
    tenant_id,
    amount_minor,
    currency_code,
    period_start,
    period_end,
    due_date,
    notes,
  } = req.body || {};
  if (!tenant_id) return res.status(400).json({ error: 'tenant_id is required' });
  if (amount_minor == null || !Number.isFinite(Number(amount_minor))) {
    return res.status(400).json({ error: 'amount_minor (numeric, minor units) is required' });
  }
  if (!period_start || !period_end || !due_date) {
    return res.status(400).json({ error: 'period_start, period_end, due_date are all required (ISO date)' });
  }
  try {
    const invoiceNumber = await _nextInvoiceNumber();
    const { rows } = await query(
      `INSERT INTO invoices
         (tenant_id, invoice_number, amount_minor, currency_code,
          period_start, period_end, status, due_date, notes)
       VALUES
         ($1, $2, $3, $4, $5, $6, 'pending', $7, $8)
       RETURNING *`,
      [
        tenant_id,
        invoiceNumber,
        Number(amount_minor),
        currency_code || 'USD',
        period_start,
        period_end,
        due_date,
        notes || null,
      ],
    );
    res.status(201).json(shapeInvoice(rows[0]));
  } catch (e) {
    console.error('[tenants/invoices] admin create error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/tenants/admin/invoices/:id/confirm-payment — FR confirms a
// pending-confirmation invoice. Flips → paid; stamps paid_at + paid_by.
router.post('/admin/invoices/:id/confirm-payment', attachIdentity, async (req, res) => {
  if (!_isFrAdmin(req)) {
    return res.status(403).json({ error: 'Forbidden — FR admin only' });
  }
  const { id } = req.params;
  try {
    // Read first so we can stash the bank_transfer_ref into paid_by
    // (audit trail: who paid + which transfer settled it).
    const probe = await query(`SELECT * FROM invoices WHERE id = $1`, [id]);
    if (probe.rows.length === 0) return res.status(404).json({ error: 'invoice not found' });
    if (probe.rows[0].status !== 'paid_pending_confirmation') {
      return res.status(409).json({
        error: `invoice in status "${probe.rows[0].status}" — only paid_pending_confirmation can be confirmed`,
        status: probe.rows[0].status,
      });
    }
    const ref = probe.rows[0].bank_transfer_ref || '';
    const { rows } = await query(
      `UPDATE invoices
       SET status = 'paid',
           paid_at = NOW(),
           paid_by = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, `bank_transfer:${ref}`],
    );
    res.json(shapeInvoice(rows[0]));
  } catch (e) {
    console.error('[tenants/invoices] confirm-payment error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/tenants/admin/invoices — FR sees every invoice across
// tenants. Pending first (so the action queue is at the top), then by
// most recently issued. Joins tenants for the display name.
router.get('/admin/invoices', attachIdentity, async (req, res) => {
  if (!_isFrAdmin(req)) {
    return res.status(403).json({ error: 'Forbidden — FR admin only' });
  }
  try {
    const { rows } = await query(
      `SELECT i.*, t.name AS tenant_name
       FROM invoices i
       JOIN tenants t ON t.id = i.tenant_id
       ORDER BY
         CASE i.status
           WHEN 'pending' THEN 0
           WHEN 'paid_pending_confirmation' THEN 1
           WHEN 'overdue' THEN 2
           ELSE 3
         END,
         i.issued_at DESC`,
    );
    res.json({ invoices: rows.map(shapeInvoice) });
  } catch (e) {
    console.error('[tenants/invoices] admin list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
