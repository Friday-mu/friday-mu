'use strict';

// Invoice / billing routes. Tenant-facing routes are gated by
// requireModule('billing') (always-on per modules.js, but the gate is
// cheap and forward-compatible with a future "billing-portal" pay-tier).
// FR-only admin routes are gated by a hard FR tenant-id + admin role
// check — swap for a platform-admin role when one exists.

const express = require('express');
const { query } = require('../database/client');
const { attachIdentity } = require('../design/auth');
const { loadTenantConfig } = require('../design/adapters');
const { requireModule } = require('./middleware');
const { shapeInvoice } = require('./adapters');
const { renderInvoicePdf } = require('./invoice_pdf');
const {
  sendEmail,
  tplInvoiceIssued,
  tplPaymentConfirmed,
} = require('./email');

const router = express.Router();

// Resolve the best email address to use for tenant billing notices.
// Preference order: tenants.billing_email → tenant's admin user email.
// Returns { tenant, email } or null if no email is available.
async function _resolveTenantNotifyEmail(tenantId) {
  const { rows: tRows } = await query(
    `SELECT * FROM tenants WHERE id = $1`,
    [tenantId],
  );
  if (tRows.length === 0) return null;
  const tenant = tRows[0];
  if (tenant.billing_email) {
    return { tenant, email: tenant.billing_email };
  }
  const { rows: uRows } = await query(
    `SELECT email FROM users
     WHERE tenant_id = $1 AND role = 'admin' AND is_active = true
     ORDER BY created_at ASC LIMIT 1`,
    [tenantId],
  );
  if (uRows.length > 0 && uRows[0].email) {
    return { tenant, email: uRows[0].email };
  }
  return { tenant, email: null };
}

const FR_TENANT_ID = '00000000-0000-0000-0000-000000000001';

// Fetch the invoice + tenant rows needed to render a PDF. Encapsulates
// the joined-query so both tenant-self and FR-admin endpoints reuse it.
// Returns { invoice, tenant } or null if the invoice row doesn't exist.
async function _loadInvoiceForPdf(invoiceId, opts = {}) {
  const { tenantId } = opts;
  const params = [invoiceId];
  let whereTenant = '';
  if (tenantId) {
    params.push(tenantId);
    whereTenant = ' AND i.tenant_id = $2';
  }
  const { rows } = await query(
    `SELECT i.*,
            t.id   AS t_id,
            t.name AS t_name,
            t.slug AS t_slug,
            t.billing_email AS t_billing_email,
            t.country AS t_country,
            t.locale AS t_locale
       FROM invoices i
       JOIN tenants t ON t.id = i.tenant_id
      WHERE i.id = $1${whereTenant}`,
    params,
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    invoice: r,
    tenant: {
      id: r.t_id,
      name: r.t_name,
      slug: r.t_slug,
      billing_email: r.t_billing_email,
      country: r.t_country,
      locale: r.t_locale,
      // payment_instructions JSONB lives on the tenants row in a later
      // migration; pull it defensively. Undefined → fallback path in
      // renderInvoicePdf kicks in (BdM hardcoded).
      payment_instructions: r.t_payment_instructions || r.payment_instructions || null,
    },
  };
}

// Side-effect: stamp invoices.pdf_url to the server-served URL so the
// frontend can persist a download link. Idempotent — skips if already
// set. Fire-and-forget; PDF generation already succeeded by the time we
// call this, so we don't fail the response on a stamping error.
async function _stampPdfUrlIfMissing(invoiceId, pdfUrl) {
  try {
    await query(
      `UPDATE invoices
          SET pdf_url = $2, updated_at = NOW()
        WHERE id = $1 AND pdf_url IS NULL`,
      [invoiceId, pdfUrl],
    );
  } catch (e) {
    console.error('[tenants/invoices] pdf_url stamp failed:', e.message);
  }
}

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

// GET /api/tenants/me/invoices/:id/pdf — tenant downloads their own
// invoice as a PDF. Regenerated on every fetch (cheap, idempotent).
// Side-effect: stamps invoices.pdf_url to this endpoint's URL so the
// frontend can hold a persistent download link without re-fetching the
// whole invoice row.
router.get('/me/invoices/:id/pdf', attachIdentity, requireModule('billing'), async (req, res) => {
  const { id } = req.params;
  try {
    const bundle = await _loadInvoiceForPdf(id, { tenantId: req.tenantId });
    if (!bundle) return res.status(404).json({ error: 'invoice not found' });

    const tenantConfig = await loadTenantConfig(bundle.tenant.id);
    const buf = await renderInvoicePdf({
      invoice: bundle.invoice,
      tenant: bundle.tenant,
      tenantConfig,
    });

    // Persistent link the frontend can save. We use the tenant-self
    // endpoint URL (relative) so it works in dev + prod without env.
    const pdfUrl = `/api/tenants/me/invoices/${id}/pdf`;
    void _stampPdfUrlIfMissing(id, pdfUrl);

    const filename = `invoice-${bundle.invoice.invoice_number || id}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buf.length));
    res.end(buf);
  } catch (e) {
    console.error('[tenants/invoices] me pdf error:', e.message);
    if (!res.headersSent) {
      res.status(500).json({ error: e.message });
    } else {
      try { res.end(); } catch { /* swallow */ }
    }
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
    const newInvoice = rows[0];

    // Fire-and-forget "invoice issued" email. Never block the API
    // response on SMTP. sendEmail no-ops if RESEND_API_KEY is unset.
    _resolveTenantNotifyEmail(tenant_id)
      .then((res) => {
        if (!res || !res.email) return;
        const tpl = tplInvoiceIssued({
          tenant: res.tenant,
          invoice: newInvoice,
          tenantConfig: res.tenant,
        });
        return sendEmail({ to: res.email, ...tpl });
      })
      .catch(() => {});

    res.status(201).json(shapeInvoice(newInvoice));
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
    const confirmed = rows[0];

    // Fire-and-forget payment-confirmed receipt. Same pattern as the
    // issuance email — never block the response.
    _resolveTenantNotifyEmail(confirmed.tenant_id)
      .then((r) => {
        if (!r || !r.email) return;
        const tpl = tplPaymentConfirmed({ tenant: r.tenant, invoice: confirmed });
        return sendEmail({ to: r.email, ...tpl });
      })
      .catch(() => {});

    res.json(shapeInvoice(confirmed));
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

// GET /api/tenants/admin/invoices/:id/pdf — FR admin downloads any
// tenant's invoice. Same render path as /me/invoices/:id/pdf; the only
// difference is no tenant_id ownership filter. Useful for support flows
// where FR needs to re-send a tenant their invoice.
router.get('/admin/invoices/:id/pdf', attachIdentity, async (req, res) => {
  if (!_isFrAdmin(req)) {
    return res.status(403).json({ error: 'Forbidden — FR admin only' });
  }
  const { id } = req.params;
  try {
    const bundle = await _loadInvoiceForPdf(id);
    if (!bundle) return res.status(404).json({ error: 'invoice not found' });

    const tenantConfig = await loadTenantConfig(bundle.tenant.id);
    const buf = await renderInvoicePdf({
      invoice: bundle.invoice,
      tenant: bundle.tenant,
      tenantConfig,
    });

    // Stamp the tenant-self URL (not the admin one) so the link the
    // tenant sees in their own UI keeps pointing at their own endpoint.
    const pdfUrl = `/api/tenants/me/invoices/${id}/pdf`;
    void _stampPdfUrlIfMissing(id, pdfUrl);

    const filename = `invoice-${bundle.invoice.invoice_number || id}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buf.length));
    res.end(buf);
  } catch (e) {
    console.error('[tenants/invoices] admin pdf error:', e.message);
    if (!res.headersSent) {
      res.status(500).json({ error: e.message });
    } else {
      try { res.end(); } catch { /* swallow */ }
    }
  }
});

module.exports = router;
