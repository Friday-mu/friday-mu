'use strict';

// /api/guests — FAD-native Guests module.
//
// Phase 1 (T3.11): aggregates Guesty reservation guests into a single
// fad_guests row per distinct email (or phone if no email). Lets us
// store preferences, language, VIP tier, notes, and lifetime stats —
// none of which Guesty tracks for us.
//
// Routes:
//   GET    /                  — list (search, vip_tier filter, paginated)
//   GET    /:id               — single record
//   GET    /:id/reservations  — joined via guesty_reservations on email/phone
//   POST   /                  — manual create (one-off VIP, walk-in, etc.)
//   PATCH  /:id               — update editable fields
//   POST   /lookup            — find by email or phone (used by ReservationDetail)

const express = require('express');
const { query } = require('../database/client');
const { attachIdentity } = require('../design/auth');

const router = express.Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function shapeGuest(row) {
  if (!row) return null;
  return {
    id: row.id,
    primary_email: row.primary_email || null,
    primary_phone: row.primary_phone || null,
    display_name: row.display_name,
    first_name: row.first_name || null,
    last_name: row.last_name || null,
    language_pref: row.language_pref || null,
    country: row.country || null,
    vip_tier: row.vip_tier || 'none',
    notes: row.notes || null,
    first_seen_at: row.first_seen_at,
    last_seen_at: row.last_seen_at,
    total_stays_count: row.total_stays_count != null ? Number(row.total_stays_count) : 0,
    total_revenue_minor: row.total_revenue_minor != null ? Number(row.total_revenue_minor) : 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Normalise a phone string the same way the unique index does, so
// lookups match what the backfill stored.
function normalisePhone(phone) {
  if (!phone) return null;
  return String(phone).trim().replace(/[^0-9+]/g, '') || null;
}

// ────────────────────────────────────────────────────────────────
// GET / — list with optional search + filters
// ────────────────────────────────────────────────────────────────
router.get('/', attachIdentity, async (req, res) => {
  const tenantId = req.tenantId;
  const search = String(req.query.search || '').trim();
  const vipTier = String(req.query.vip_tier || '').trim();
  const limit = Math.min(Number(req.query.limit) || 200, 500);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const wheres = ['tenant_id = $1'];
  const params = [tenantId];

  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    const i = params.length;
    wheres.push(`(
      LOWER(display_name) LIKE $${i}
      OR LOWER(COALESCE(primary_email, '')) LIKE $${i}
      OR COALESCE(primary_phone, '') LIKE $${i}
    )`);
  }
  if (vipTier && ['none', 'silver', 'gold', 'vip'].includes(vipTier)) {
    params.push(vipTier);
    wheres.push(`vip_tier = $${params.length}`);
  }

  try {
    const where = wheres.join(' AND ');
    params.push(limit, offset);
    const { rows } = await query(
      `SELECT * FROM fad_guests
        WHERE ${where}
        ORDER BY last_seen_at DESC NULLS LAST, display_name ASC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const totalRes = await query(
      `SELECT COUNT(*)::int AS count FROM fad_guests WHERE ${where}`,
      params.slice(0, -2),
    );
    const total = totalRes.rows[0]?.count || 0;
    res.json({
      results: rows.map(shapeGuest),
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
    });
  } catch (e) {
    console.error('[guests] list failed:', e.message);
    res.status(500).json({ error: 'Failed to load guests' });
  }
});

// ────────────────────────────────────────────────────────────────
// POST /lookup — find by email or phone (no auto-create)
// Used by ReservationDetail to resolve a guesty_reservation guest →
// existing fad_guests record. Returns null if not found.
// ────────────────────────────────────────────────────────────────
router.post('/lookup', attachIdentity, async (req, res) => {
  const tenantId = req.tenantId;
  const email = String(req.body?.email || '').trim().toLowerCase();
  const phone = normalisePhone(req.body?.phone);
  const name = String(req.body?.name || '').trim().toLowerCase();
  if (!email && !phone && !name) {
    return res.status(400).json({ error: 'email, phone, or name required' });
  }
  try {
    if (email) {
      const { rows } = await query(
        `SELECT * FROM fad_guests
          WHERE tenant_id = $1
            AND LOWER(TRIM(primary_email)) = $2
          LIMIT 1`,
        [tenantId, email],
      );
      if (rows.length) return res.json({ guest: shapeGuest(rows[0]) });
    }
    if (phone) {
      const { rows } = await query(
        `SELECT * FROM fad_guests
          WHERE tenant_id = $1
            AND primary_email IS NULL
            AND REGEXP_REPLACE(TRIM(primary_phone), '[^0-9+]', '', 'g') = $2
          LIMIT 1`,
        [tenantId, phone],
      );
      if (rows.length) return res.json({ guest: shapeGuest(rows[0]) });
    }
    if (name) {
      // Name-bucket fallback: only when email + phone both NULL on the
      // stored row. Matches the index from migration 080.
      const { rows } = await query(
        `SELECT * FROM fad_guests
          WHERE tenant_id = $1
            AND primary_email IS NULL
            AND primary_phone IS NULL
            AND LOWER(TRIM(display_name)) = $2
          ORDER BY total_stays_count DESC, last_seen_at DESC NULLS LAST
          LIMIT 1`,
        [tenantId, name],
      );
      if (rows.length) return res.json({ guest: shapeGuest(rows[0]) });
    }
    res.json({ guest: null });
  } catch (e) {
    console.error('[guests] lookup failed:', e.message);
    res.status(500).json({ error: 'Lookup failed' });
  }
});

// ────────────────────────────────────────────────────────────────
// GET /:id — single guest record
// ────────────────────────────────────────────────────────────────
router.get('/:id', attachIdentity, async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
  try {
    const { rows } = await query(
      `SELECT * FROM fad_guests WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [req.tenantId, req.params.id],
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ guest: shapeGuest(rows[0]) });
  } catch (e) {
    console.error('[guests] get failed:', e.message);
    res.status(500).json({ error: 'Failed to load guest' });
  }
});

// ────────────────────────────────────────────────────────────────
// GET /:id/reservations — reservations attributed to this guest
// (matched by email or normalised phone against guesty_reservations).
// ────────────────────────────────────────────────────────────────
router.get('/:id/reservations', attachIdentity, async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
  try {
    const { rows: gRows } = await query(
      `SELECT primary_email, primary_phone, display_name FROM fad_guests
        WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [req.tenantId, req.params.id],
    );
    if (!gRows.length) return res.status(404).json({ error: 'Not found' });
    const email = gRows[0].primary_email
      ? String(gRows[0].primary_email).trim().toLowerCase()
      : null;
    const phone = normalisePhone(gRows[0].primary_phone);
    const nameKey = (!email && !phone && gRows[0].display_name)
      ? String(gRows[0].display_name).trim().toLowerCase()
      : null;

    const wheres = ['r.tenant_id = $1'];
    const params = [req.tenantId];
    const matchClauses = [];
    if (email) {
      params.push(email);
      matchClauses.push(`LOWER(TRIM(r.guest_email)) = $${params.length}`);
    }
    if (phone) {
      params.push(phone);
      matchClauses.push(`REGEXP_REPLACE(TRIM(COALESCE(r.guest_phone, '')), '[^0-9+]', '', 'g') = $${params.length}`);
    }
    if (nameKey) {
      params.push(nameKey);
      matchClauses.push(
        `(NULLIF(LOWER(TRIM(r.guest_email)), '') IS NULL
          AND NULLIF(TRIM(r.guest_phone), '') IS NULL
          AND LOWER(TRIM(CONCAT_WS(' ', r.guest_first_name, r.guest_last_name))) = $${params.length})`,
      );
    }
    if (!matchClauses.length) return res.json({ reservations: [] });
    wheres.push(`(${matchClauses.join(' OR ')})`);

    const { rows } = await query(
      `SELECT
         r.guesty_id,
         r.confirmation_code,
         r.listing_guesty_id,
         l.nickname AS listing_nickname,
         r.status,
         r.channel,
         r.check_in_date,
         r.check_out_date,
         r.nights,
         r.guests_count,
         r.total_amount_minor,
         r.currency_code,
         r.synced_at
       FROM guesty_reservations r
       LEFT JOIN guesty_listings l
         ON l.tenant_id = r.tenant_id AND l.guesty_id = r.listing_guesty_id
       WHERE ${wheres.join(' AND ')}
       ORDER BY r.check_in_date DESC NULLS LAST
       LIMIT 200`,
      params,
    );
    res.json({
      reservations: rows.map((r) => ({
        guesty_id: r.guesty_id,
        confirmation_code: r.confirmation_code,
        listing_guesty_id: r.listing_guesty_id,
        listing_nickname: r.listing_nickname,
        status: r.status,
        channel: r.channel,
        check_in_date: r.check_in_date,
        check_out_date: r.check_out_date,
        nights: r.nights != null ? Number(r.nights) : null,
        guests_count: r.guests_count != null ? Number(r.guests_count) : null,
        total_amount_minor: r.total_amount_minor != null ? Number(r.total_amount_minor) : null,
        currency_code: r.currency_code,
        synced_at: r.synced_at,
      })),
    });
  } catch (e) {
    console.error('[guests] reservations failed:', e.message);
    res.status(500).json({ error: 'Failed to load guest reservations' });
  }
});

// ────────────────────────────────────────────────────────────────
// POST / — manual create
// ────────────────────────────────────────────────────────────────
router.post('/', attachIdentity, async (req, res) => {
  const tenantId = req.tenantId;
  const b = req.body || {};
  const displayName = String(b.display_name || '').trim();
  if (!displayName) return res.status(400).json({ error: 'display_name required' });
  const email = b.primary_email ? String(b.primary_email).trim().toLowerCase() : null;
  const phone = b.primary_phone ? String(b.primary_phone).trim() : null;
  const langOK = !b.language_pref || ['en', 'fr', 'es', 'de', 'it', 'pt'].includes(b.language_pref);
  if (!langOK) return res.status(400).json({ error: 'invalid language_pref' });
  const vipOK = !b.vip_tier || ['none', 'silver', 'gold', 'vip'].includes(b.vip_tier);
  if (!vipOK) return res.status(400).json({ error: 'invalid vip_tier' });

  try {
    const { rows } = await query(
      `INSERT INTO fad_guests (
         tenant_id, primary_email, primary_phone, display_name,
         first_name, last_name, language_pref, country, vip_tier, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        tenantId,
        email,
        phone,
        displayName,
        b.first_name || null,
        b.last_name || null,
        b.language_pref || null,
        b.country || null,
        b.vip_tier || 'none',
        b.notes || null,
      ],
    );
    res.status(201).json({ guest: shapeGuest(rows[0]) });
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ error: 'A guest with this email or phone already exists' });
    }
    console.error('[guests] create failed:', e.message);
    res.status(500).json({ error: 'Failed to create guest' });
  }
});

// ────────────────────────────────────────────────────────────────
// PATCH /:id — update editable fields
// ────────────────────────────────────────────────────────────────
router.patch('/:id', attachIdentity, async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  const sets = [];
  const vals = [req.tenantId, req.params.id];

  function push(col, val) {
    vals.push(val);
    sets.push(`${col} = $${vals.length}`);
  }

  if ('display_name' in b) {
    const dn = String(b.display_name || '').trim();
    if (!dn) return res.status(400).json({ error: 'display_name cannot be empty' });
    push('display_name', dn);
  }
  if ('first_name' in b) push('first_name', b.first_name || null);
  if ('last_name' in b) push('last_name', b.last_name || null);
  if ('language_pref' in b) {
    if (b.language_pref && !['en', 'fr', 'es', 'de', 'it', 'pt'].includes(b.language_pref)) {
      return res.status(400).json({ error: 'invalid language_pref' });
    }
    push('language_pref', b.language_pref || null);
  }
  if ('country' in b) push('country', b.country || null);
  if ('vip_tier' in b) {
    if (b.vip_tier && !['none', 'silver', 'gold', 'vip'].includes(b.vip_tier)) {
      return res.status(400).json({ error: 'invalid vip_tier' });
    }
    push('vip_tier', b.vip_tier || 'none');
  }
  if ('notes' in b) push('notes', b.notes || null);

  if (!sets.length) return res.status(400).json({ error: 'No editable fields provided' });

  try {
    const { rows } = await query(
      `UPDATE fad_guests SET ${sets.join(', ')}
        WHERE tenant_id = $1 AND id = $2
        RETURNING *`,
      vals,
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ guest: shapeGuest(rows[0]) });
  } catch (e) {
    console.error('[guests] patch failed:', e.message);
    res.status(500).json({ error: 'Failed to update guest' });
  }
});

module.exports = router;
