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
const { getMonthlyUsage } = require('./ai_usage');
const { sendEmail, tplWelcome } = require('./email');

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

    // Fire-and-forget welcome email. Never block the signup response on
    // SMTP — if RESEND_API_KEY is unset (dev), sendEmail no-ops.
    const welcomeRecipient = tenant.billing_email || user.email;
    if (welcomeRecipient) {
      const tpl = tplWelcome({
        tenant,
        adminUser: user,
        trialEndsAt: tenant.trial_ends_at,
      });
      sendEmail({ to: welcomeRecipient, ...tpl }).catch(() => {});
    }

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

// Whitelist of payment_instructions JSONB keys we accept on write. We
// intentionally don't accept arbitrary keys — keeps the shape stable
// for the renderer in BillingModule and prevents accidental footguns.
const PAYMENT_INSTRUCTION_KEYS = [
  'bank_name',
  'account_name',
  'account_number',
  'iban',
  'swift',
  'currency',
  'instructions',
];

function _sanitisePaymentInstructions(value) {
  // Accept null/undefined as "clear it" → empty object.
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('payment_instructions must be an object');
  }
  const out = {};
  for (const key of PAYMENT_INSTRUCTION_KEYS) {
    if (value[key] === undefined) continue;
    if (value[key] === null) { out[key] = null; continue; }
    if (typeof value[key] !== 'string') {
      throw new Error(`payment_instructions.${key} must be a string or null`);
    }
    out[key] = value[key];
  }
  return out;
}

// PATCH /api/tenants/me — admin-only self-service tenant edits. The
// fields you can NOT edit yourself: slug (URL-stable), subscription_*
// (lifecycle, owned by billing flow). payment_method is editable IFF
// it's the bank_transfer ↔ stripe toggle — anything else 400s.
router.patch('/me', attachIdentity, async (req, res) => {
  if (req.identity?.userRole !== 'admin') {
    return res.status(403).json({ error: 'Forbidden — admin role required' });
  }
  const { name, country, locale, billing_email, notes, payment_instructions, payment_method } = req.body || {};
  const sets = [];
  const vals = [];
  let i = 1;
  if (name !== undefined) { sets.push(`name = $${i++}`); vals.push(name); }
  if (country !== undefined) { sets.push(`country = $${i++}`); vals.push(country); }
  if (locale !== undefined) { sets.push(`locale = $${i++}`); vals.push(locale); }
  if (billing_email !== undefined) { sets.push(`billing_email = $${i++}`); vals.push(billing_email); }
  if (notes !== undefined) { sets.push(`notes = $${i++}`); vals.push(notes); }
  if (payment_instructions !== undefined) {
    let sanitised;
    try { sanitised = _sanitisePaymentInstructions(payment_instructions); }
    catch (e) { return res.status(400).json({ error: e.message }); }
    sets.push(`payment_instructions = $${i++}::jsonb`);
    vals.push(JSON.stringify(sanitised));
  }
  if (payment_method !== undefined) {
    // Whitelist enforced both here AND by the tenants_payment_method_check
    // constraint (mig 036). Belt-and-braces — returning 400 here gives a
    // cleaner error than the Postgres constraint violation.
    if (payment_method !== 'bank_transfer' && payment_method !== 'stripe') {
      return res.status(400).json({ error: "payment_method must be 'bank_transfer' or 'stripe'" });
    }
    sets.push(`payment_method = $${i++}`);
    vals.push(payment_method);
  }
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

// PATCH /api/tenants/:tenant_id — FR-admin-only. Set the same editable
// fields as PATCH /me, but for any tenant. v0 use case: FR admin
// configures a new tenant's payment_instructions (e.g. a Wise account
// for a US tenant) before sending the first invoice.
router.patch('/:tenant_id', attachIdentity, async (req, res) => {
  if (!_isFrAdmin(req)) {
    return res.status(403).json({ error: 'Forbidden — FR admin only' });
  }
  const { tenant_id } = req.params;
  const { name, country, locale, billing_email, notes, payment_instructions } = req.body || {};
  const sets = [];
  const vals = [];
  let i = 1;
  if (name !== undefined) { sets.push(`name = $${i++}`); vals.push(name); }
  if (country !== undefined) { sets.push(`country = $${i++}`); vals.push(country); }
  if (locale !== undefined) { sets.push(`locale = $${i++}`); vals.push(locale); }
  if (billing_email !== undefined) { sets.push(`billing_email = $${i++}`); vals.push(billing_email); }
  if (notes !== undefined) { sets.push(`notes = $${i++}`); vals.push(notes); }
  if (payment_instructions !== undefined) {
    let sanitised;
    try { sanitised = _sanitisePaymentInstructions(payment_instructions); }
    catch (e) { return res.status(400).json({ error: e.message }); }
    sets.push(`payment_instructions = $${i++}::jsonb`);
    vals.push(JSON.stringify(sanitised));
  }
  if (sets.length === 0) return res.status(400).json({ error: 'no editable fields supplied' });
  sets.push(`updated_at = NOW()`);
  vals.push(tenant_id);
  try {
    const { rows } = await query(
      `UPDATE tenants SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      vals,
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Tenant not found' });
    res.json(shapeTenant(rows[0]));
  } catch (e) {
    console.error('[tenants/:tenant_id] patch error:', e.message);
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

// GET /api/tenants/me/ai-usage — current tenant's monthly AI spend +
// remaining quota. Cheap aggregation against ai_usage (mig 038).
// Anyone authenticated for the tenant can read; the frontend uses
// this to render a usage card in tenant settings.
router.get('/me/ai-usage', attachIdentity, async (req, res) => {
  try {
    const usage = await getMonthlyUsage(req.tenantId);
    const { rows } = await query(
      `SELECT monthly_ai_cost_cap_minor_usd FROM tenants WHERE id = $1`,
      [req.tenantId],
    );
    const cap = rows[0]?.monthly_ai_cost_cap_minor_usd != null
      ? Number(rows[0].monthly_ai_cost_cap_minor_usd)
      : 1000;
    const remaining = Math.max(0, cap - usage.total_cost_minor_usd);
    res.json({
      ...usage,
      cap_minor_usd: cap,
      remaining_minor_usd: remaining,
      currency: 'USD',
    });
  } catch (e) {
    console.error('[tenants/me/ai-usage] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/tenants/admin/ai-usage — FR-only — current-month AI spend
// across all tenants. Used by the platform-admin overview view.
// Returns one row per tenant with totals + by-feature breakdown.
router.get('/admin/ai-usage', attachIdentity, async (req, res) => {
  if (!_isFrAdmin(req)) {
    return res.status(403).json({ error: 'Forbidden — FR admin only' });
  }
  try {
    // List all tenants. For each we fetch monthly usage; cap parallelism
    // implicitly via Promise.all because the count is small (single
    // digits to tens, in v0). If tenant count grows, swap for a single
    // aggregate query keyed on COALESCE(ai_quota_period_start, …).
    const { rows: tenants } = await query(
      `SELECT id, name, slug, monthly_ai_cost_cap_minor_usd,
              ai_quota_period_start
       FROM tenants
       WHERE active = true
       ORDER BY created_at DESC`,
    );
    const enriched = await Promise.all(
      tenants.map(async (t) => {
        const usage = await getMonthlyUsage(t.id);
        const cap = t.monthly_ai_cost_cap_minor_usd != null
          ? Number(t.monthly_ai_cost_cap_minor_usd)
          : 1000;
        return {
          tenant_id: t.id,
          tenant_name: t.name,
          tenant_slug: t.slug,
          cap_minor_usd: cap,
          total_cost_minor_usd: usage.total_cost_minor_usd,
          total_calls: usage.total_calls,
          remaining_minor_usd: Math.max(0, cap - usage.total_cost_minor_usd),
          period_start: usage.period_start,
          by_feature: usage.by_feature,
        };
      }),
    );
    res.json({ tenants: enriched, currency: 'USD' });
  } catch (e) {
    console.error('[tenants/admin/ai-usage] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/tenants/admin/dashboard — FR-only — platform-wide KPIs for
// the Admin Analytics module. Single multi-CTE query against tenants +
// invoices + ai_usage; computes MRR by joining tenant_modules against
// the in-process MODULES registry's monthly_price_usd. Scale is single-
// digit tenants today, so performance is non-issue.
//
// MRR semantics: sum of monthly_price_usd × 100 (minor units) across
// saleable modules enabled for tenants in status active OR past_due.
// Trial tenants don't count toward MRR — they're not paying yet.
router.get('/admin/dashboard', attachIdentity, async (req, res) => {
  if (!_isFrAdmin(req)) {
    return res.status(403).json({ error: 'Forbidden — FR admin only' });
  }
  try {
    // Build the saleable-module price map from the in-process registry
    // so the SQL doesn't need to hardcode prices.
    const saleablePrices = Object.entries(MODULES)
      .filter(([, m]) => m.saleable && m.monthly_price_usd != null)
      .map(([key, m]) => ({ key, price_minor: Math.round(m.monthly_price_usd * 100) }));

    // VALUES rows for the price lookup; injected as a CTE so it can be
    // joined against tenant_modules.
    const priceValues = saleablePrices.length > 0
      ? saleablePrices.map((p) => `('${p.key.replace(/'/g, "''")}', ${p.price_minor})`).join(',')
      : `('__none__', 0)`;

    const sql = `
      WITH tenant_counts AS (
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE subscription_status = 'active')::int AS active,
          COUNT(*) FILTER (WHERE subscription_status = 'trial')::int AS trial,
          COUNT(*) FILTER (WHERE subscription_status = 'past_due')::int AS past_due,
          COUNT(*) FILTER (WHERE subscription_status = 'cancelled')::int AS cancelled,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS new_signups_30d,
          COUNT(*) FILTER (
            WHERE subscription_status = 'active'
              AND subscription_started_at >= NOW() - INTERVAL '30 days'
          )::int AS trial_conversions_30d,
          COUNT(*) FILTER (
            WHERE subscription_status = 'cancelled'
              AND updated_at >= NOW() - INTERVAL '30 days'
          )::int AS churn_30d
        FROM tenants
      ),
      module_prices(module_key, price_minor) AS (VALUES ${priceValues}),
      mrr_calc AS (
        SELECT COALESCE(SUM(mp.price_minor), 0)::bigint AS mrr_minor
        FROM tenant_modules tm
        JOIN tenants t ON t.id = tm.tenant_id
        JOIN module_prices mp ON mp.module_key = tm.module_key
        WHERE tm.enabled = true
          AND t.subscription_status IN ('active', 'past_due')
      ),
      ai_30d AS (
        SELECT COALESCE(SUM(cost_minor_usd), 0)::bigint AS total_minor
        FROM ai_usage
        WHERE created_at >= NOW() - INTERVAL '30 days'
      ),
      ai_top10 AS (
        SELECT au.tenant_id, t.name AS tenant_name, SUM(au.cost_minor_usd)::bigint AS cost_minor
        FROM ai_usage au
        JOIN tenants t ON t.id = au.tenant_id
        WHERE au.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY au.tenant_id, t.name
        ORDER BY cost_minor DESC
        LIMIT 10
      ),
      outstanding AS (
        SELECT
          COUNT(*)::int AS count,
          COALESCE(SUM(amount_minor), 0)::bigint AS amount_minor
        FROM invoices
        WHERE status IN ('pending', 'paid_pending_confirmation', 'overdue')
      ),
      recent AS (
        SELECT id, name, created_at, subscription_status
        FROM tenants
        ORDER BY created_at DESC
        LIMIT 10
      )
      SELECT
        (SELECT row_to_json(tc) FROM tenant_counts tc) AS counts,
        (SELECT mrr_minor FROM mrr_calc) AS mrr_minor,
        (SELECT total_minor FROM ai_30d) AS ai_cost_30d_minor,
        (SELECT COALESCE(json_agg(ai_top10), '[]'::json) FROM ai_top10) AS ai_top10,
        (SELECT row_to_json(o) FROM outstanding o) AS outstanding,
        (SELECT COALESCE(json_agg(recent), '[]'::json) FROM recent) AS recent
    `;
    const { rows } = await query(sql);
    const row = rows[0] || {};
    const counts = row.counts || {};
    const outstanding = row.outstanding || { count: 0, amount_minor: 0 };
    res.json({
      tenants_total: counts.total || 0,
      tenants_active: counts.active || 0,
      tenants_trial: counts.trial || 0,
      tenants_past_due: counts.past_due || 0,
      tenants_cancelled: counts.cancelled || 0,
      mrr_usd_minor: Number(row.mrr_minor || 0),
      new_signups_30d: counts.new_signups_30d || 0,
      trial_conversions_30d: counts.trial_conversions_30d || 0,
      churn_30d: counts.churn_30d || 0,
      ai_cost_30d_usd_minor: Number(row.ai_cost_30d_minor || 0),
      ai_cost_by_tenant_top10: (row.ai_top10 || []).map((r) => ({
        tenant_id: r.tenant_id,
        tenant_name: r.tenant_name,
        cost_minor_usd: Number(r.cost_minor),
      })),
      invoices_outstanding_count: outstanding.count || 0,
      invoices_outstanding_amount_minor: Number(outstanding.amount_minor || 0),
      recent_signups: (row.recent || []).map((r) => ({
        tenant_id: r.id,
        name: r.name,
        created_at: r.created_at,
        subscription_status: r.subscription_status,
      })),
    });
  } catch (e) {
    console.error('[tenants/admin/dashboard] error:', e.message);
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
