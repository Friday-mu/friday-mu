'use strict';

// Expense capture — Path A from an Operations task.
//
// Locked design: Notion 34e43ca8849281fa8085f120b211c689 (FAD Finance —
// Capture form UX, Path A & B). This file ships Path A only — the
// operator opens a task in Operations, clicks "Capture expense", fills
// the drawer, submits. Path B (admin direct entry from Finance) reuses
// this router but is gated by a future slice that adds recurring +
// admin-restricted categories.
//
// Endpoints:
//   POST /api/expenses                 — create a new expense (path_a only for now)
//   GET  /api/expenses?task_id=<UUID>  — list expenses linked to a task
//   GET  /api/expenses/categories      — category list (for the dropdown)
//   POST /api/expenses/:id/receipts    — attach receipt(s) to an expense
//
// Authoritative permission model is still being finalized (PROD-AUTH-4
// debt). For now: any logged-in operator can submit Path A expenses;
// admins can list all; non-admins see only their own (slice 3 polish).

const express = require('express');
const crypto = require('crypto');
const { query } = require('../database/client');
const { attachIdentity } = require('../design/auth');

const router = express.Router();

const PATH_A = 'path_a';
const PATH_B = 'path_b';
const ALLOWED_CURRENCIES = new Set(['MUR', 'EUR', 'USD']);
const ALLOWED_STATUS = new Set(['draft', 'submitted', 'pending_approval', 'approved', 'rejected', 'posted']);
const ALLOWED_BILL_TO_PREFIX = /^(internal_(fr|fi|s)|owner_[a-z0-9_-]+)$/;
const MAX_DESCRIPTION_CHARS = 2000;
const MAX_RECEIPT_BYTES = 12 * 1024 * 1024;   // 12 MB per file
const MAX_RECEIPTS_PER_EXPENSE = 4;

function clean(value, max = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}
function cleanMultiline(value, max = MAX_DESCRIPTION_CHARS) {
  return String(value || '').trim().slice(0, max);
}
function asUuid(value) {
  const v = String(value || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : null;
}
function asAmountMinor(value) {
  // Accept either a string number ('1234.50') or a number (1234.50). Convert
  // to minor units (× 100). Reject negative or zero.
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}
function asPropertyCode(value) {
  const v = clean(value, 16).toUpperCase();
  // FR codes: PREFIX-SUFFIX, alphanumeric in each segment, no embedded
  // dashes. Examples: GBH-C8, RC-16, VV-A03. The OFFICE meta code is
  // accepted too — admin / store / office tasks need a category code
  // even though there's no property.
  if (v === 'OFFICE') return v;
  return /^[A-Z]{1,4}-[A-Z0-9]{1,8}$/.test(v) ? v : null;
}
function asCurrency(value) {
  const v = clean(value, 4).toUpperCase();
  return ALLOWED_CURRENCIES.has(v) ? v : null;
}
function asBillTo(value) {
  const v = clean(value, 80).toLowerCase();
  return ALLOWED_BILL_TO_PREFIX.test(v) ? v : null;
}

// ─── Categories ─────────────────────────────────────────────────────
router.get('/categories', attachIdentity, async (req, res) => {
  try {
    const path = clean(req.query.path, 10).toLowerCase();
    const filter = path === 'path_a' || path === 'path_b'
      ? `AND (applies_to_path = $1 OR applies_to_path = 'both')`
      : '';
    const params = filter ? [path] : [];
    const { rows } = await query(
      `SELECT code, name, default_bill_to, applies_to_path, sort_order
         FROM expense_categories
        WHERE is_active = TRUE
          ${filter}
        ORDER BY sort_order, code`,
      params,
    );
    res.json({ categories: rows });
  } catch (e) {
    console.error('[finance/expenses] categories error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── List by task ───────────────────────────────────────────────────
router.get('/', attachIdentity, async (req, res) => {
  try {
    const taskId = asUuid(req.query.task_id);
    if (!taskId) return res.status(400).json({ error: 'task_id is required (UUID)' });
    const { rows } = await query(
      `SELECT e.id, e.entry_mode, e.task_id, e.property_code,
              e.vendor_id, e.vendor_name_freetext, e.vendor_unrecognized,
              e.amount_minor, e.currency, e.category_code, e.bill_to,
              e.bill_to_overridden, e.description,
              e.labour_hours_numeric, e.labour_work_type,
              e.status, e.capturer_user_id,
              e.submitted_at, e.approved_at, e.posted_at, e.created_at,
              v.canonical_name AS vendor_canonical_name,
              u.display_name AS capturer_name,
              c.name AS category_name,
              (SELECT COUNT(*)::int FROM expense_receipts r WHERE r.expense_id = e.id) AS receipt_count
         FROM expenses e
         LEFT JOIN vendors v ON v.id = e.vendor_id
         LEFT JOIN users u ON u.id = e.capturer_user_id
         LEFT JOIN expense_categories c ON c.code = e.category_code
        WHERE e.tenant_id = $1
          AND e.task_id = $2
        ORDER BY e.submitted_at DESC`,
      [req.tenantId, taskId],
    );
    res.json({ expenses: rows });
  } catch (e) {
    console.error('[finance/expenses] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Create ─────────────────────────────────────────────────────────
router.post('/', attachIdentity, async (req, res) => {
  const client = await require('../database/client').getClient();
  try {
    const body = req.body || {};
    const entryMode = clean(body.entry_mode || PATH_A, 10);
    if (entryMode !== PATH_A && entryMode !== PATH_B) {
      return res.status(400).json({ error: 'entry_mode must be path_a or path_b' });
    }
    const taskId = body.task_id ? asUuid(body.task_id) : null;
    if (entryMode === PATH_A && !taskId) {
      return res.status(400).json({ error: 'task_id is required for path_a expenses' });
    }

    // Pull task context to auto-populate property_code in Path A.
    let resolvedPropertyCode = asPropertyCode(body.property_code);
    if (entryMode === PATH_A && taskId) {
      const { rows } = await client.query(
        `SELECT property_code FROM tasks WHERE id = $1 AND tenant_id = $2`,
        [taskId, req.tenantId],
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: 'task not found in this tenant' });
      }
      // Task's property wins for Path A — operator can't override.
      resolvedPropertyCode = rows[0].property_code || resolvedPropertyCode;
    }

    const categoryCode = clean(body.category_code, 30).toUpperCase();
    if (!categoryCode) return res.status(400).json({ error: 'category_code is required' });
    const catCheck = await client.query(
      `SELECT default_bill_to FROM expense_categories WHERE code = $1 AND is_active = TRUE`,
      [categoryCode],
    );
    if (catCheck.rows.length === 0) {
      return res.status(400).json({ error: `unknown category_code: ${categoryCode}` });
    }
    const defaultBillTo = catCheck.rows[0].default_bill_to;

    const amountMinor = asAmountMinor(body.amount);
    if (!amountMinor) return res.status(400).json({ error: 'amount must be > 0 (decimal or numeric)' });
    const currency = asCurrency(body.currency) || 'MUR';

    const labourHours = body.labour_hours != null && body.labour_hours !== ''
      ? Number(body.labour_hours)
      : null;
    if (labourHours != null && (!Number.isFinite(labourHours) || labourHours <= 0)) {
      return res.status(400).json({ error: 'labour_hours must be > 0 when present' });
    }
    const labourWorkType = labourHours != null ? clean(body.labour_work_type, 80) : null;

    // Vendor resolution. If vendor_id provided + valid → use it. If only
    // vendor_name provided → free-text, flag unrecognized. If labour, vendor
    // is optional.
    const vendorId = asUuid(body.vendor_id);
    const vendorNameFreetext = !vendorId ? clean(body.vendor_name, 120) : null;
    const vendorUnrecognized = !vendorId && !!vendorNameFreetext;
    if (!vendorId && !vendorNameFreetext && labourHours == null) {
      return res.status(400).json({ error: 'vendor_id, vendor_name, or labour_hours is required' });
    }

    const description = cleanMultiline(body.description);
    if (!description) return res.status(400).json({ error: 'description is required' });

    const billToInput = asBillTo(body.bill_to);
    const billTo = billToInput || defaultBillTo;
    const billToOverridden = billToInput && billToInput !== defaultBillTo;

    const status = ALLOWED_STATUS.has(body.status) ? body.status : 'submitted';
    const capturerUserId = req.identity?.userId;
    if (!capturerUserId) return res.status(401).json({ error: 'unauthenticated' });

    await client.query('BEGIN');
    const insertRes = await client.query(
      `INSERT INTO expenses (
         tenant_id, entry_mode, task_id, property_code,
         vendor_id, vendor_name_freetext, vendor_unrecognized,
         amount_minor, currency, category_code,
         bill_to, bill_to_overridden, description,
         labour_hours_numeric, labour_work_type,
         status, capturer_user_id, submitted_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now())
       RETURNING id, created_at, submitted_at`,
      [
        req.tenantId, entryMode, taskId, resolvedPropertyCode,
        vendorId, vendorNameFreetext, vendorUnrecognized,
        amountMinor, currency, categoryCode,
        billTo, !!billToOverridden, description,
        labourHours, labourWorkType,
        status, capturerUserId,
      ],
    );
    const expenseId = insertRes.rows[0].id;

    // Attach receipts inline if the caller sent any. Each receipt is
    // {file_name, content_type, base64, ocr_extracted?}. Hash-dedupes
    // per-expense via the unique index.
    const receipts = Array.isArray(body.receipts) ? body.receipts.slice(0, MAX_RECEIPTS_PER_EXPENSE) : [];
    const attachedReceipts = [];
    for (const r of receipts) {
      const base64 = typeof r?.base64 === 'string' ? r.base64 : null;
      if (!base64) continue;
      const byteSize = Math.floor(base64.length * 0.75);  // approx
      if (byteSize > MAX_RECEIPT_BYTES) {
        await client.query('ROLLBACK');
        return res.status(413).json({ error: `receipt exceeds ${MAX_RECEIPT_BYTES} bytes` });
      }
      const sha256 = crypto.createHash('sha256').update(base64).digest('hex');
      try {
        const recRes = await client.query(
          `INSERT INTO expense_receipts (
             expense_id, storage_kind, inline_base64, file_name, content_type,
             byte_size, sha256_hash, ocr_extracted
           )
           VALUES ($1,'inline_base64',$2,$3,$4,$5,$6,$7)
           RETURNING id, file_name, byte_size, uploaded_at`,
          [
            expenseId, base64,
            clean(r.file_name, 200) || null,
            clean(r.content_type, 100) || null,
            byteSize, sha256,
            r.ocr_extracted ? JSON.stringify(r.ocr_extracted) : null,
          ],
        );
        attachedReceipts.push(recRes.rows[0]);
      } catch (err) {
        if (err.code === '23505') {
          // Duplicate hash — skip silently per locked design (hash-dedup).
          continue;
        }
        throw err;
      }
    }

    await client.query('COMMIT');
    return res.status(201).json({
      id: expenseId,
      entry_mode: entryMode,
      task_id: taskId,
      property_code: resolvedPropertyCode,
      amount_minor: amountMinor,
      currency,
      category_code: categoryCode,
      bill_to: billTo,
      bill_to_overridden: !!billToOverridden,
      vendor_id: vendorId,
      vendor_name_freetext: vendorNameFreetext,
      vendor_unrecognized: vendorUnrecognized,
      status,
      submitted_at: insertRes.rows[0].submitted_at,
      created_at: insertRes.rows[0].created_at,
      receipts: attachedReceipts,
    });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[finance/expenses] create error:', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

module.exports = {
  router,
  _test: {
    asAmountMinor,
    asCurrency,
    asPropertyCode,
    asBillTo,
    clean,
    cleanMultiline,
  },
};
