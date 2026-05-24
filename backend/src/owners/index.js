'use strict';

// /api/owners — FAD-native Owners module.
//
// Phase 2 (T3.12): backend-back the owner entity behind every property.
// Backfilled from Guesty's listing-owner IDs (placeholder names) so the
// frontend can stop using 'o-guesty-unknown' immediately. Admins can
// patch real names + contact details in.
//
// Routes:
//   GET    /                    — list (search, archived filter, paginated)
//   GET    /:id                 — single record
//   GET    /:id/properties      — properties this owner owns (via fad_property_owners)
//   POST   /                    — manual create
//   PATCH  /:id                 — update editable fields
//   POST   /:id/archive         — soft-archive (preserves history)
//   POST   /:id/unarchive       — restore

const express = require('express');
const { query } = require('../database/client');
const { attachIdentity } = require('../design/auth');

const router = express.Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function shapeOwner(row, propertyCount) {
  if (!row) return null;
  return {
    id: row.id,
    guesty_owner_id: row.guesty_owner_id || null,
    display_name: row.display_name,
    legal_entity_name: row.legal_entity_name || null,
    contact_email: row.contact_email || null,
    contact_phone: row.contact_phone || null,
    address: row.address || null,
    country: row.country || null,
    payment_pref: row.payment_pref || null,
    language: row.language || null,
    statement_day: row.statement_day != null ? Number(row.statement_day) : null,
    commission_pct_default: row.commission_pct_default != null ? Number(row.commission_pct_default) : null,
    notes: row.notes || null,
    archived_at: row.archived_at,
    property_count: propertyCount != null ? Number(propertyCount) : null,
    has_bank_details: !!row.bank_details_encrypted,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ────────────────────────────────────────────────────────────────
// GET / — list with optional search + filter + property counts
// ────────────────────────────────────────────────────────────────
router.get('/', attachIdentity, async (req, res) => {
  const tenantId = req.tenantId;
  const search = String(req.query.search || '').trim();
  const archivedFlag = String(req.query.archived || '');
  const limit = Math.min(Number(req.query.limit) || 200, 500);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const wheres = ['o.tenant_id = $1'];
  const params = [tenantId];

  if (archivedFlag === 'true') wheres.push('o.archived_at IS NOT NULL');
  else if (archivedFlag !== 'all') wheres.push('o.archived_at IS NULL');

  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    const i = params.length;
    wheres.push(`(
      LOWER(o.display_name) LIKE $${i}
      OR LOWER(COALESCE(o.legal_entity_name, '')) LIKE $${i}
      OR LOWER(COALESCE(o.contact_email, '')) LIKE $${i}
    )`);
  }

  try {
    const where = wheres.join(' AND ');
    params.push(limit, offset);
    const { rows } = await query(
      `SELECT o.*,
          (SELECT COUNT(*) FROM fad_property_owners po
             WHERE po.tenant_id = o.tenant_id
               AND po.owner_id = o.guesty_owner_id) AS property_count
         FROM fad_owners o
        WHERE ${where}
        ORDER BY o.display_name ASC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const totalRes = await query(
      `SELECT COUNT(*)::int AS count FROM fad_owners o WHERE ${where}`,
      params.slice(0, -2),
    );
    const total = totalRes.rows[0]?.count || 0;
    res.json({
      results: rows.map((r) => shapeOwner(r, r.property_count)),
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
    });
  } catch (e) {
    console.error('[owners] list failed:', e.message);
    res.status(500).json({ error: 'Failed to load owners' });
  }
});

// ────────────────────────────────────────────────────────────────
// GET /:id
// ────────────────────────────────────────────────────────────────
router.get('/:id', attachIdentity, async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
  try {
    const { rows } = await query(
      `SELECT o.*,
         (SELECT COUNT(*) FROM fad_property_owners po
            WHERE po.tenant_id = o.tenant_id
              AND po.owner_id = o.guesty_owner_id) AS property_count
         FROM fad_owners o
        WHERE o.tenant_id = $1 AND o.id = $2 LIMIT 1`,
      [req.tenantId, req.params.id],
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ owner: shapeOwner(rows[0], rows[0].property_count) });
  } catch (e) {
    console.error('[owners] get failed:', e.message);
    res.status(500).json({ error: 'Failed to load owner' });
  }
});

// ────────────────────────────────────────────────────────────────
// GET /:id/properties
// ────────────────────────────────────────────────────────────────
router.get('/:id/properties', attachIdentity, async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
  try {
    const { rows: oRows } = await query(
      `SELECT guesty_owner_id FROM fad_owners WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [req.tenantId, req.params.id],
    );
    if (!oRows.length) return res.status(404).json({ error: 'Not found' });
    const guestyOwnerId = oRows[0].guesty_owner_id;
    if (!guestyOwnerId) return res.json({ properties: [] });

    const { rows } = await query(
      `SELECT
         p.id AS property_id,
         p.code,
         l.nickname,
         l.address_full,
         l.picture_url,
         po.ownership_pct,
         po.is_primary
       FROM fad_property_owners po
       JOIN fad_properties p ON p.id = po.property_id AND p.tenant_id = po.tenant_id
       LEFT JOIN guesty_listings l ON l.tenant_id = p.tenant_id AND l.guesty_id = p.guesty_id
       WHERE po.tenant_id = $1 AND po.owner_id = $2
       ORDER BY po.is_primary DESC, l.nickname NULLS LAST`,
      [req.tenantId, guestyOwnerId],
    );
    res.json({
      properties: rows.map((r) => ({
        property_id: r.property_id,
        code: r.code,
        nickname: r.nickname,
        address_full: r.address_full,
        picture_url: r.picture_url,
        ownership_pct: r.ownership_pct != null ? Number(r.ownership_pct) : 100,
        is_primary: !!r.is_primary,
      })),
    });
  } catch (e) {
    console.error('[owners] properties failed:', e.message);
    res.status(500).json({ error: 'Failed to load owner properties' });
  }
});

// ────────────────────────────────────────────────────────────────
// POST /
// ────────────────────────────────────────────────────────────────
router.post('/', attachIdentity, async (req, res) => {
  const b = req.body || {};
  const displayName = String(b.display_name || '').trim();
  if (!displayName) return res.status(400).json({ error: 'display_name required' });
  if (b.payment_pref && !['bank_transfer', 'mcb_juice', 'cheque', 'cash'].includes(b.payment_pref)) {
    return res.status(400).json({ error: 'invalid payment_pref' });
  }
  if (b.language && !['en', 'fr', 'es'].includes(b.language)) {
    return res.status(400).json({ error: 'invalid language' });
  }
  if (b.statement_day != null && (Number(b.statement_day) < 1 || Number(b.statement_day) > 28)) {
    return res.status(400).json({ error: 'statement_day must be between 1 and 28' });
  }
  try {
    const { rows } = await query(
      `INSERT INTO fad_owners (
         tenant_id, display_name, legal_entity_name, contact_email,
         contact_phone, address, country, payment_pref, language,
         statement_day, commission_pct_default, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        req.tenantId,
        displayName,
        b.legal_entity_name || null,
        b.contact_email || null,
        b.contact_phone || null,
        b.address || null,
        b.country || 'MU',
        b.payment_pref || null,
        b.language || 'en',
        b.statement_day != null ? Number(b.statement_day) : null,
        b.commission_pct_default != null ? Number(b.commission_pct_default) : null,
        b.notes || null,
      ],
    );
    res.status(201).json({ owner: shapeOwner(rows[0], 0) });
  } catch (e) {
    console.error('[owners] create failed:', e.message);
    res.status(500).json({ error: 'Failed to create owner' });
  }
});

// ────────────────────────────────────────────────────────────────
// PATCH /:id
// ────────────────────────────────────────────────────────────────
router.patch('/:id', attachIdentity, async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  const sets = [];
  const vals = [req.tenantId, req.params.id];
  function push(col, val) { vals.push(val); sets.push(`${col} = $${vals.length}`); }

  if ('display_name' in b) {
    const dn = String(b.display_name || '').trim();
    if (!dn) return res.status(400).json({ error: 'display_name cannot be empty' });
    push('display_name', dn);
  }
  if ('legal_entity_name' in b) push('legal_entity_name', b.legal_entity_name || null);
  if ('contact_email' in b) push('contact_email', b.contact_email || null);
  if ('contact_phone' in b) push('contact_phone', b.contact_phone || null);
  if ('address' in b) push('address', b.address || null);
  if ('country' in b) push('country', b.country || null);
  if ('payment_pref' in b) {
    if (b.payment_pref && !['bank_transfer', 'mcb_juice', 'cheque', 'cash'].includes(b.payment_pref)) {
      return res.status(400).json({ error: 'invalid payment_pref' });
    }
    push('payment_pref', b.payment_pref || null);
  }
  if ('language' in b) {
    if (b.language && !['en', 'fr', 'es'].includes(b.language)) {
      return res.status(400).json({ error: 'invalid language' });
    }
    push('language', b.language || null);
  }
  if ('statement_day' in b) {
    if (b.statement_day != null && (Number(b.statement_day) < 1 || Number(b.statement_day) > 28)) {
      return res.status(400).json({ error: 'statement_day must be between 1 and 28' });
    }
    push('statement_day', b.statement_day != null ? Number(b.statement_day) : null);
  }
  if ('commission_pct_default' in b) {
    push('commission_pct_default', b.commission_pct_default != null ? Number(b.commission_pct_default) : null);
  }
  if ('notes' in b) push('notes', b.notes || null);

  if (!sets.length) return res.status(400).json({ error: 'No editable fields provided' });

  try {
    const { rows } = await query(
      `UPDATE fad_owners SET ${sets.join(', ')}
        WHERE tenant_id = $1 AND id = $2
        RETURNING *`,
      vals,
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ owner: shapeOwner(rows[0]) });
  } catch (e) {
    console.error('[owners] patch failed:', e.message);
    res.status(500).json({ error: 'Failed to update owner' });
  }
});

// ────────────────────────────────────────────────────────────────
// POST /:id/archive  ·  POST /:id/unarchive
// ────────────────────────────────────────────────────────────────
router.post('/:id/archive', attachIdentity, async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
  try {
    const { rows } = await query(
      `UPDATE fad_owners SET archived_at = NOW()
        WHERE tenant_id = $1 AND id = $2 AND archived_at IS NULL
        RETURNING *`,
      [req.tenantId, req.params.id],
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found or already archived' });
    res.json({ owner: shapeOwner(rows[0]) });
  } catch (e) {
    console.error('[owners] archive failed:', e.message);
    res.status(500).json({ error: 'Failed to archive owner' });
  }
});

router.post('/:id/unarchive', attachIdentity, async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
  try {
    const { rows } = await query(
      `UPDATE fad_owners SET archived_at = NULL
        WHERE tenant_id = $1 AND id = $2 AND archived_at IS NOT NULL
        RETURNING *`,
      [req.tenantId, req.params.id],
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found or already active' });
    res.json({ owner: shapeOwner(rows[0]) });
  } catch (e) {
    console.error('[owners] unarchive failed:', e.message);
    res.status(500).json({ error: 'Failed to unarchive owner' });
  }
});

module.exports = router;
