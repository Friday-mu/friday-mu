'use strict';

// Soft tenant deletion + GDPR-style CSV data export.
//
// Routes:
//   POST   /api/tenants/me/delete-request    — tenant admin soft-cancels
//   POST   /api/tenants/admin/:id/restore    — FR admin un-cancels
//   POST   /api/tenants/admin/:id/hard-delete — FR admin expunges (cascading)
//   GET    /api/tenants/me/data-export       — tenant admin downloads a zip of CSVs
//
// Hard-delete requires a header `X-Confirm-Hard-Delete: <slug>` matching
// the tenant. The cascading delete is wrapped in a transaction; we log
// per-table row counts at info level.
//
// The soft-delete flips tenants.active=false + subscription_status=
// 'cancelled'. The requireModule cache TTL is 60s so the tenant is
// locked out within one TTL. We also invalidateSubscriptionCache() so
// the same-process flip is immediate.

const express = require('express');
const archiver = require('archiver');
const { pool, query } = require('../database/client');
const { attachIdentity } = require('../design/auth');
const {
  FR_TENANT_ID,
  invalidateModuleCache,
  invalidateSubscriptionCache,
} = require('./middleware');

const router = express.Router();

function _isFrAdmin(req) {
  return req.tenantId === FR_TENANT_ID && req.identity?.userRole === 'admin';
}

function _isTenantAdmin(req) {
  return req.identity?.userRole === 'admin';
}

// ─────────────────────────────────────────────────────────────
// CSV helper — RFC 4180-ish. Wraps every value, escapes embedded
// double-quotes. Null / undefined → empty cell. Date objects → ISO
// string. Objects → JSON string. Booleans → 'true' / 'false'.
// ─────────────────────────────────────────────────────────────

function _csvCell(v) {
  if (v === null || v === undefined) return '';
  let s;
  if (v instanceof Date) s = v.toISOString();
  else if (typeof v === 'object') s = JSON.stringify(v);
  else s = String(v);
  // Always quote — keeps the output unambiguous when a column happens
  // to contain commas, newlines, or quotes. The size hit is small and
  // the safety is worth it.
  return `"${s.replace(/"/g, '""')}"`;
}

function _rowsToCsv(rows, columns) {
  // columns: optional ordered list of column names. If absent, infer
  // from the first row's keys (insertion order — pg-node preserves the
  // SELECT order).
  const cols = columns
    || (rows.length > 0 ? Object.keys(rows[0]) : []);
  const lines = [cols.map(_csvCell).join(',')];
  for (const row of rows) {
    lines.push(cols.map((c) => _csvCell(row[c])).join(','));
  }
  // Trailing newline is conventional and a couple of CSV parsers care.
  return lines.join('\n') + '\n';
}

// ─────────────────────────────────────────────────────────────
// POST /api/tenants/me/delete-request — tenant admin soft-cancel
// ─────────────────────────────────────────────────────────────

router.post('/me/delete-request', attachIdentity, async (req, res) => {
  if (!_isTenantAdmin(req)) {
    return res.status(403).json({ error: 'Forbidden — admin role required' });
  }
  if (req.tenantId === FR_TENANT_ID) {
    // The FR tenant is the platform admin — can't self-cancel.
    return res.status(400).json({ error: 'FR tenant cannot self-delete' });
  }
  const { reason } = req.body || {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: tenantRows } = await client.query(
      `UPDATE tenants
         SET active = false,
             subscription_status = 'cancelled',
             updated_at = NOW()
       WHERE id = $1
       RETURNING id, slug, name`,
      [req.tenantId],
    );
    if (tenantRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Tenant not found' });
    }
    const { rows: reqRows } = await client.query(
      `INSERT INTO tenant_deletion_requests
         (tenant_id, requested_by_user_id, reason, status)
       VALUES ($1, $2, $3, 'requested')
       RETURNING *`,
      [req.tenantId, req.identity?.userId || null, reason || null],
    );
    await client.query('COMMIT');

    // Flush in-process caches so the lockout is immediate for this
    // worker. Other workers pick up the change within the 60s TTL.
    invalidateSubscriptionCache(req.tenantId);
    invalidateModuleCache(req.tenantId);

    console.info(
      `[tenants/delete-request] tenant=${tenantRows[0].slug} (${req.tenantId}) cancelled by user=${req.identity?.userId || 'unknown'}`,
    );

    res.status(201).json({
      ok: true,
      tenant_id: req.tenantId,
      deletion_request: reqRows[0],
    });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[tenants/delete-request] error:', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/tenants/admin/:id/restore — FR admin un-cancel
// ─────────────────────────────────────────────────────────────

router.post('/admin/:id/restore', attachIdentity, async (req, res) => {
  if (!_isFrAdmin(req)) {
    return res.status(403).json({ error: 'Forbidden — FR admin only' });
  }
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: tenantRows } = await client.query(
      `UPDATE tenants
         SET active = true,
             subscription_status = 'active',
             updated_at = NOW()
       WHERE id = $1
       RETURNING id, slug, name`,
      [id],
    );
    if (tenantRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Tenant not found' });
    }
    // Mark the most recent open deletion-request as cancelled. This
    // is a soft mark; the row stays as a paper trail.
    await client.query(
      `UPDATE tenant_deletion_requests
         SET status = 'cancelled',
             cancelled_at = NOW()
       WHERE tenant_id = $1
         AND status = 'requested'`,
      [id],
    );
    await client.query('COMMIT');

    invalidateSubscriptionCache(id);
    invalidateModuleCache(id);

    console.info(
      `[tenants/restore] tenant=${tenantRows[0].slug} (${id}) restored by user=${req.identity?.userId || 'unknown'}`,
    );

    res.json({ ok: true, tenant_id: id });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[tenants/restore] error:', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/tenants/admin/:id/hard-delete — FR admin expunge
// ─────────────────────────────────────────────────────────────
//
// Confirmation: must send X-Confirm-Hard-Delete: <slug>. Mismatched
// header → 400. This deletes the tenant and every owned row across:
//   design_floor_plan_chats, design_floor_plans, design_projects,
//   design_annex_a, design_assets, invoices, tenant_modules,
//   tenant_invitations, ai_usage, users, tenants.
// Most of these CASCADE off tenants(id) or design_projects(id) already,
// but we issue explicit DELETEs so the per-table row counts land in
// the audit log.

const HARD_DELETE_TABLES = [
  // Child-most first; foreign-key order matters when CASCADE isn't set.
  // design_floor_plan_chats → design_projects via project_id.
  // design_floor_plans      → design_projects via project_id.
  // The rest reference tenants(id) directly.
  {
    name: 'design_floor_plan_chats',
    sql: `DELETE FROM design_floor_plan_chats
            WHERE project_id IN (
              SELECT id FROM design_projects WHERE tenant_id = $1
            )`,
  },
  {
    name: 'design_floor_plans',
    sql: `DELETE FROM design_floor_plans
            WHERE project_id IN (
              SELECT id FROM design_projects WHERE tenant_id = $1
            )`,
  },
  { name: 'design_projects', sql: `DELETE FROM design_projects WHERE tenant_id = $1` },
  { name: 'design_annex_a', sql: `DELETE FROM design_annex_a WHERE tenant_id = $1` },
  { name: 'design_assets', sql: `DELETE FROM design_assets WHERE tenant_id = $1` },
  { name: 'invoices', sql: `DELETE FROM invoices WHERE tenant_id = $1` },
  { name: 'tenant_modules', sql: `DELETE FROM tenant_modules WHERE tenant_id = $1` },
  { name: 'tenant_invitations', sql: `DELETE FROM tenant_invitations WHERE tenant_id = $1` },
  { name: 'ai_usage', sql: `DELETE FROM ai_usage WHERE tenant_id = $1` },
  { name: 'users', sql: `DELETE FROM users WHERE tenant_id = $1` },
];

router.post('/admin/:id/hard-delete', attachIdentity, async (req, res) => {
  if (!_isFrAdmin(req)) {
    return res.status(403).json({ error: 'Forbidden — FR admin only' });
  }
  const { id } = req.params;
  if (id === FR_TENANT_ID) {
    return res.status(400).json({ error: 'Refusing to hard-delete the FR tenant' });
  }

  // Look up slug first so we can match the confirmation header. Two
  // small queries beats one query + manual parsing.
  const { rows: lookupRows } = await query(
    `SELECT id, slug, name FROM tenants WHERE id = $1`,
    [id],
  );
  if (lookupRows.length === 0) {
    return res.status(404).json({ error: 'Tenant not found' });
  }
  const tenant = lookupRows[0];

  const confirmHeader = req.headers['x-confirm-hard-delete'];
  if (!confirmHeader || confirmHeader !== tenant.slug) {
    return res.status(400).json({
      error: `Missing or mismatched X-Confirm-Hard-Delete header — expected "${tenant.slug}"`,
    });
  }

  const client = await pool.connect();
  const counts = {};
  try {
    await client.query('BEGIN');
    for (const t of HARD_DELETE_TABLES) {
      const r = await client.query(t.sql, [id]);
      counts[t.name] = r.rowCount;
    }
    // Mark the deletion-request row before the tenant row is gone
    // (ON DELETE CASCADE on tenant_deletion_requests would wipe it
    // otherwise). Keep it as 'hard_deleted' for the audit trail.
    await client.query(
      `UPDATE tenant_deletion_requests
         SET status = 'hard_deleted',
             hard_deleted_at = NOW()
       WHERE tenant_id = $1
         AND status IN ('requested', 'cancelled')`,
      [id],
    );
    const r = await client.query(`DELETE FROM tenants WHERE id = $1`, [id]);
    counts.tenants = r.rowCount;
    await client.query('COMMIT');

    invalidateSubscriptionCache(id);
    invalidateModuleCache(id);

    console.info(
      `[tenants/hard-delete] tenant=${tenant.slug} (${id}) expunged by user=${req.identity?.userId || 'unknown'} — counts=${JSON.stringify(counts)}`,
    );

    res.json({ ok: true, tenant_id: id, counts });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[tenants/hard-delete] error:', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/tenants/me/data-export — tenant admin downloads CSV zip
// ─────────────────────────────────────────────────────────────
//
// Streams a zip file with one CSV per logical entity + a JSON dump of
// the payment_instructions JSONB. Excludes raw AI prompt content
// (ai_usage.request_context) — we ship only the audit-relevant fields.

router.get('/me/data-export', attachIdentity, async (req, res) => {
  if (!_isTenantAdmin(req)) {
    return res.status(403).json({ error: 'Forbidden — admin role required' });
  }
  const tenantId = req.tenantId;
  let tenantSlug = 'tenant';

  try {
    // Lookup slug for the filename. Don't include in the CSV if the
    // tenant row's gone (shouldn't happen — admin auth implies row).
    const slugRes = await query(
      `SELECT slug FROM tenants WHERE id = $1`,
      [tenantId],
    );
    if (slugRes.rows[0]?.slug) tenantSlug = slugRes.rows[0].slug;

    // Fetch everything in parallel — these are small per-tenant
    // tables (single-digit MBs at most), so we don't bother streaming
    // each query. We DO stream the zip output.
    const [
      tenantRes,
      usersRes,
      invoicesRes,
      projectsRes,
      floorPlansRes,
      chatsRes,
      aiUsageRes,
    ] = await Promise.all([
      query(`SELECT * FROM tenants WHERE id = $1`, [tenantId]),
      query(
        `SELECT id, username, email, role, display_name, is_active,
                must_change_password, created_at
           FROM users WHERE tenant_id = $1
           ORDER BY created_at ASC`,
        [tenantId],
      ),
      query(
        `SELECT * FROM invoices WHERE tenant_id = $1
           ORDER BY issued_at DESC NULLS LAST, created_at DESC`,
        [tenantId],
      ),
      query(
        `SELECT * FROM design_projects WHERE tenant_id = $1
           ORDER BY created_at DESC`,
        [tenantId],
      ),
      query(
        `SELECT fp.*
           FROM design_floor_plans fp
           JOIN design_projects p ON p.id = fp.project_id
           WHERE p.tenant_id = $1
           ORDER BY fp.created_at DESC`,
        [tenantId],
      ),
      query(
        `SELECT c.*
           FROM design_floor_plan_chats c
           JOIN design_projects p ON p.id = c.project_id
           WHERE p.tenant_id = $1
           ORDER BY c.created_at DESC`,
        [tenantId],
      ),
      // Excludes request_context (raw prompts) per the brief — only
      // the audit columns ship to the export.
      query(
        `SELECT id, feature, model, provider, cost_minor_usd, created_at
           FROM ai_usage WHERE tenant_id = $1
           ORDER BY created_at DESC`,
        [tenantId],
      ),
    ]);

    const paymentInstructions = tenantRes.rows[0]?.payment_instructions || {};

    // Strip payment_instructions out of the tenant.csv blob — it's in
    // its own JSON file. Keeps the CSV simpler to read in Excel.
    const tenantRow = { ...tenantRes.rows[0] };
    delete tenantRow.payment_instructions;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${tenantSlug}-data-export.zip"`,
    );

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      console.error('[tenants/data-export] archive error:', err.message);
      // Headers are already sent — best we can do is destroy the
      // socket so the client gets a truncated download error.
      try { res.destroy(err); } catch (_) { /* noop */ }
    });
    archive.pipe(res);

    archive.append(_rowsToCsv([tenantRow]), { name: 'tenant.csv' });
    archive.append(_rowsToCsv(usersRes.rows), { name: 'users.csv' });
    archive.append(_rowsToCsv(invoicesRes.rows), { name: 'invoices.csv' });
    archive.append(_rowsToCsv(projectsRes.rows), { name: 'projects.csv' });
    archive.append(_rowsToCsv(floorPlansRes.rows), { name: 'floor_plans.csv' });
    archive.append(_rowsToCsv(chatsRes.rows), { name: 'chats.csv' });
    archive.append(
      _rowsToCsv(aiUsageRes.rows, [
        'id', 'feature', 'model', 'provider', 'cost_minor_usd', 'created_at',
      ]),
      { name: 'ai_usage.csv' },
    );
    archive.append(JSON.stringify(paymentInstructions, null, 2), {
      name: 'payment_instructions.json',
    });

    await archive.finalize();
  } catch (e) {
    console.error('[tenants/data-export] error:', e.message);
    // If headers aren't sent yet we can return JSON; otherwise the
    // archive error handler has already destroyed the stream.
    if (!res.headersSent) {
      res.status(500).json({ error: e.message });
    }
  }
});

module.exports = router;
