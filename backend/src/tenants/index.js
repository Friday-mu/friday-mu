'use strict';

// SaaS-scaffolding routes — tenant signup + tenant CRUD + per-tenant
// module management. Billing/invoices lives in a sibling router
// (./invoices.js) so the gating boundaries are clean: this file's
// /signup endpoint is public, while invoices.js is JWT-gated AND
// requireModule('billing')-gated.
//
// FR-only admin endpoints (anything that lets one tenant see / modify
// another tenant's data) are gated by a hard tenant-id check against
// the canonical FR UUID. Once a real "platform admin" role lands we
// swap that gate for a role check.

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool, query } = require('../database/client');
const { attachIdentity } = require('../design/auth');
const { invalidateModuleCache } = require('./middleware');
const {
  MODULES,
  defaultSignupModuleKeys,
  isKnownModule,
} = require('./modules');
const {
  shapeTenant,
  shapeTenantModule,
} = require('./adapters');

const router = express.Router();

const FR_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const SLUG_REGEX = /^[a-z][a-z0-9-]{2,40}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PG_UNIQUE_VIOLATION = '23505';

// Strip secret fields off a user row before returning to clients.
function _shapeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    role: row.role,
    display_name: row.display_name,
    tenant_id: row.tenant_id,
    is_active: row.is_active,
    must_change_password: row.must_change_password,
    created_at: row.created_at,
  };
}

function _isFrAdmin(req) {
  return req.tenantId === FR_TENANT_ID && req.identity?.userRole === 'admin';
}

// ─────────────────────────── signup (public) ─────────────────────────

// POST /api/tenants/signup
// Public — no auth. Creates tenant + admin user + module subscriptions
// + Annex A skeleton + trial invoice in a single transaction. Returns
// a freshly minted JWT so the new admin can land in the dashboard
// without a second login round-trip.
router.post('/signup', async (req, res) => {
  const {
    company_name,
    slug,
    admin_email,
    admin_password,
    admin_display_name,
    country,
    locale,
  } = req.body || {};

  // ── validation ──
  if (!company_name || typeof company_name !== 'string') {
    return res.status(400).json({ error: 'company_name is required' });
  }
  if (!slug || !SLUG_REGEX.test(slug)) {
    return res.status(400).json({
      error: 'slug must match ^[a-z][a-z0-9-]{2,40}$ (lowercase, starts with letter, 3–41 chars)',
    });
  }
  if (!admin_email || !EMAIL_REGEX.test(admin_email)) {
    return res.status(400).json({ error: 'admin_email must be a valid email' });
  }
  if (!admin_password || typeof admin_password !== 'string' || admin_password.length < 8) {
    return res.status(400).json({ error: 'admin_password must be ≥ 8 characters' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) tenant
    const tenantRes = await client.query(
      `INSERT INTO tenants
         (name, slug, subscription_status, trial_ends_at, payment_method, country, locale, billing_email, active)
       VALUES
         ($1, $2, 'trial', NOW() + INTERVAL '14 days', 'bank_transfer', $3, $4, $5, true)
       RETURNING *`,
      [company_name, slug, country || null, locale || null, admin_email],
    );
    const tenant = tenantRes.rows[0];

    // 2) admin user
    const passwordHash = bcrypt.hashSync(admin_password, 10);
    const userRes = await client.query(
      `INSERT INTO users
         (username, email, password_hash, role, display_name, tenant_id, is_active, must_change_password)
       VALUES
         ($1, $1, $2, 'admin', $3, $4, true, false)
       RETURNING *`,
      [
        admin_email,
        passwordHash,
        admin_display_name || admin_email,
        tenant.id,
      ],
    );
    const user = userRes.rows[0];

    // 3) tenant_modules — every key from defaultSignupModuleKeys()
    const moduleKeys = defaultSignupModuleKeys();
    for (const key of moduleKeys) {
      await client.query(
        `INSERT INTO tenant_modules (tenant_id, module_key, enabled)
         VALUES ($1, $2, true)
         ON CONFLICT (tenant_id, module_key) DO NOTHING`,
        [tenant.id, key],
      );
    }

    // 4) design_annex_a skeleton. Stash company_name in the JSONB; the
    //    design module's settings UI fills in the rest later.
    await client.query(
      `INSERT INTO design_annex_a (tenant_id, annex_a)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (tenant_id) DO NOTHING`,
      [tenant.id, JSON.stringify({ company_name })],
    );

    // 5) Trial invoice — $0, paid, marker row so /api/tenants/me/invoices
    //    shows a complete history including the trial.
    await client.query(
      `INSERT INTO invoices
         (tenant_id, invoice_number, amount_minor, currency_code,
          period_start, period_end, status, due_date,
          paid_at, paid_by, notes)
       VALUES
         ($1, $2, 0, 'USD',
          NOW()::date, (NOW() + INTERVAL '14 days')::date, 'paid', (NOW() + INTERVAL '14 days')::date,
          NOW(), 'auto-trial', 'Trial — no charge')`,
      [tenant.id, `INV-T-${slug}-001`],
    );

    await client.query('COMMIT');

    // Mint a JWT mirroring the GMS/login shape so the frontend can
    // drop straight into the dashboard.
    const token = jwt.sign(
      {
        user_id: user.id,
        username: user.username,
        role: user.role,
        display_name: user.display_name,
        tenant_id: tenant.id,
      },
      process.env.JWT_SECRET || '',
      { algorithm: 'HS256', expiresIn: '7d' },
    );

    res.status(201).json({
      tenant: shapeTenant(tenant),
      user: _shapeUser(user),
      token,
    });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    if (e && e.code === PG_UNIQUE_VIOLATION) {
      // Distinguish slug vs email so the frontend can route the error
      // to the right form field.
      const detail = String(e.detail || e.message || '').toLowerCase();
      if (detail.includes('slug')) {
        return res.status(409).json({ error: 'slug already taken', field: 'slug' });
      }
      if (detail.includes('email') || detail.includes('username')) {
        return res.status(409).json({ error: 'email already registered', field: 'admin_email' });
      }
      return res.status(409).json({ error: 'unique constraint violation', detail: e.detail });
    }
    console.error('[tenants/signup] error:', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ─────────────────────────── tenant CRUD (auth) ──────────────────────

// GET /api/tenants/me — current tenant row.
router.get('/me', attachIdentity, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM tenants WHERE id = $1`,
      [req.tenantId],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Tenant not found' });
    res.json(shapeTenant(rows[0]));
  } catch (e) {
    console.error('[tenants/me] get error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/tenants/me/modules — the enabled-set + the full available
// catalogue, so the frontend can render "your modules" + upsells in
// the same view.
router.get('/me/modules', attachIdentity, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT module_key, enabled FROM tenant_modules
       WHERE tenant_id = $1 AND enabled = true`,
      [req.tenantId],
    );
    const enabledSet = new Set(rows.map((r) => r.module_key));
    const available = Object.entries(MODULES).map(([key, m]) => ({
      key,
      name: m.name,
      description: m.description,
      saleable: m.saleable,
      monthly_price_usd: m.monthly_price_usd,
      enabled: enabledSet.has(key),
    }));
    res.json({
      enabled: Array.from(enabledSet),
      available,
    });
  } catch (e) {
    console.error('[tenants/me/modules] get error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/tenants/me — admin-only self-service tenant edits. The
// fields you can NOT edit yourself: slug (URL-stable), subscription_*
// (lifecycle, owned by billing flow), payment_method (admin action).
router.patch('/me', attachIdentity, async (req, res) => {
  if (req.identity?.userRole !== 'admin') {
    return res.status(403).json({ error: 'Forbidden — admin role required' });
  }
  const { name, country, locale, billing_email, notes } = req.body || {};
  const sets = [];
  const vals = [];
  let i = 1;
  if (name !== undefined) { sets.push(`name = $${i++}`); vals.push(name); }
  if (country !== undefined) { sets.push(`country = $${i++}`); vals.push(country); }
  if (locale !== undefined) { sets.push(`locale = $${i++}`); vals.push(locale); }
  if (billing_email !== undefined) { sets.push(`billing_email = $${i++}`); vals.push(billing_email); }
  if (notes !== undefined) { sets.push(`notes = $${i++}`); vals.push(notes); }
  if (sets.length === 0) return res.status(400).json({ error: 'no editable fields supplied' });
  sets.push(`updated_at = NOW()`);
  vals.push(req.tenantId);
  try {
    const { rows } = await query(
      `UPDATE tenants SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      vals,
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Tenant not found' });
    res.json(shapeTenant(rows[0]));
  } catch (e) {
    console.error('[tenants/me] patch error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/tenants/:tenant_id/modules/:module_key — FR-only flip.
// Used by the (future) platform-admin UI to enable/disable modules
// for a tenant. Hits invalidateModuleCache so the change is visible
// immediately instead of waiting on the 60s TTL.
router.patch('/:tenant_id/modules/:module_key', attachIdentity, async (req, res) => {
  if (!_isFrAdmin(req)) {
    return res.status(403).json({ error: 'Forbidden — FR admin only' });
  }
  const { tenant_id, module_key } = req.params;
  const { enabled, notes } = req.body || {};
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled (boolean) is required' });
  }
  if (!isKnownModule(module_key)) {
    return res.status(400).json({ error: `unknown module key "${module_key}"` });
  }
  try {
    const { rows } = await query(
      `INSERT INTO tenant_modules (tenant_id, module_key, enabled, notes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, module_key) DO UPDATE
         SET enabled = EXCLUDED.enabled,
             notes = COALESCE(EXCLUDED.notes, tenant_modules.notes),
             enabled_at = CASE WHEN EXCLUDED.enabled = true THEN NOW() ELSE tenant_modules.enabled_at END,
             disabled_at = CASE WHEN EXCLUDED.enabled = false THEN NOW() ELSE NULL END
       RETURNING *`,
      [tenant_id, module_key, enabled, notes || null],
    );
    invalidateModuleCache(tenant_id, module_key);
    res.json(shapeTenantModule(rows[0]));
  } catch (e) {
    console.error('[tenants/modules] patch error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/tenants/admin/list — FR-only — every tenant with module
// counts + latest invoice status. Used by the (future) platform-admin
// "All tenants" view; ships now to unblock the frontend.
router.get('/admin/list', attachIdentity, async (req, res) => {
  if (!_isFrAdmin(req)) {
    return res.status(403).json({ error: 'Forbidden — FR admin only' });
  }
  try {
    const { rows } = await query(
      `SELECT
         t.*,
         (SELECT COUNT(*)::int FROM tenant_modules tm
            WHERE tm.tenant_id = t.id AND tm.enabled = true) AS enabled_module_count,
         (SELECT status FROM invoices i
            WHERE i.tenant_id = t.id
            ORDER BY i.issued_at DESC LIMIT 1) AS latest_invoice_status,
         (SELECT issued_at FROM invoices i
            WHERE i.tenant_id = t.id
            ORDER BY i.issued_at DESC LIMIT 1) AS latest_invoice_issued_at
       FROM tenants t
       ORDER BY t.created_at DESC`,
    );
    res.json(
      rows.map((row) => ({
        ...shapeTenant(row),
        enabled_module_count: row.enabled_module_count,
        latest_invoice_status: row.latest_invoice_status,
        latest_invoice_issued_at: row.latest_invoice_issued_at,
      })),
    );
  } catch (e) {
    console.error('[tenants/admin/list] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
