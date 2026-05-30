'use strict';

// /api/quotes — quote-link generator + tracker.
//
// Phase 7 (T4.40) of the overnight autonomous run. v1 generates a
// Friday Website Vercel-preview link with property codes + dates
// baked in; the website surface handles the actual quote rendering.

const express = require('express');
const { query } = require('../database/client');
const { attachIdentity } = require('../design/auth');

const router = express.Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Friday Website Vercel preview. Final URL TBD — operators validate the
// destination after the first send (Open question in the overnight plan).
const DEFAULT_QUOTE_BASE_URL = process.env.QUOTE_BASE_URL
  || 'https://preview-friday-website.vercel.app/search';

function buildShareUrl(input) {
  const u = new URL(DEFAULT_QUOTE_BASE_URL);
  u.searchParams.set('codes', input.property_codes.join(','));
  u.searchParams.set('from', input.check_in);
  u.searchParams.set('to', input.check_out);
  u.searchParams.set('guests', String(input.guests_adults + (input.guests_children || 0)));
  if (input.guests_children) u.searchParams.set('children', String(input.guests_children));
  return u.toString();
}

function shapeQuote(row) {
  return {
    id: row.id,
    property_codes: row.property_codes,
    check_in: row.check_in,
    check_out: row.check_out,
    guests_adults: row.guests_adults,
    guests_children: row.guests_children,
    share_url: row.share_url,
    expires_at: row.expires_at,
    status: row.status,
    opened_at: row.opened_at,
    converted_reservation_id: row.converted_reservation_id,
    created_by_user_id: row.created_by_user_id,
    metadata: row.metadata,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ────────────────────────────────────────────────────────────────
// GET / — recent quotes
// ────────────────────────────────────────────────────────────────
router.get('/', attachIdentity, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  try {
    const { rows } = await query(
      `SELECT * FROM fad_quotes
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [req.tenantId, limit],
    );
    res.json({ quotes: rows.map(shapeQuote), total: rows.length });
  } catch (e) {
    console.error('[quotes] list failed:', e.message);
    res.status(500).json({ error: 'Failed to load quotes' });
  }
});

// ────────────────────────────────────────────────────────────────
// POST / — generate a new quote link
// ────────────────────────────────────────────────────────────────
router.post('/', attachIdentity, async (req, res) => {
  const b = req.body || {};
  const codes = Array.isArray(b.property_codes) ? b.property_codes.map(String).filter(Boolean) : [];
  if (!codes.length) return res.status(400).json({ error: 'property_codes required (non-empty array)' });
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(b.check_in || '')) return res.status(400).json({ error: 'check_in (YYYY-MM-DD) required' });
  if (!iso.test(b.check_out || '')) return res.status(400).json({ error: 'check_out (YYYY-MM-DD) required' });
  if (b.check_out <= b.check_in) return res.status(400).json({ error: 'check_out must be after check_in' });
  const adults = Math.max(1, Math.min(Number(b.guests_adults) || 1, 30));
  const children = Math.max(0, Math.min(Number(b.guests_children) || 0, 20));
  const expiresInDays = b.expires_in_days != null ? Math.max(1, Math.min(Number(b.expires_in_days), 60)) : 14;
  const expiresAt = new Date(Date.now() + expiresInDays * 86400000).toISOString();

  const shareUrl = buildShareUrl({
    property_codes: codes,
    check_in: b.check_in,
    check_out: b.check_out,
    guests_adults: adults,
    guests_children: children,
  });

  try {
    const { rows } = await query(
      `INSERT INTO fad_quotes (
         tenant_id, created_by_user_id, property_codes,
         check_in, check_out, guests_adults, guests_children,
         share_url, expires_at, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        req.tenantId,
        req.identity?.userId || null,
        codes,
        b.check_in,
        b.check_out,
        adults,
        children,
        shareUrl,
        expiresAt,
        JSON.stringify(b.metadata || {}),
      ],
    );
    res.status(201).json({ quote: shapeQuote(rows[0]) });
  } catch (e) {
    console.error('[quotes] create failed:', e.message);
    res.status(500).json({ error: 'Failed to create quote' });
  }
});

// ────────────────────────────────────────────────────────────────
// GET /:id  ·  POST /:id/mark-opened
// ────────────────────────────────────────────────────────────────
router.get('/:id', attachIdentity, async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
  try {
    const { rows } = await query(
      `SELECT * FROM fad_quotes WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [req.tenantId, req.params.id],
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ quote: shapeQuote(rows[0]) });
  } catch (e) {
    console.error('[quotes] get failed:', e.message);
    res.status(500).json({ error: 'Failed to load quote' });
  }
});

router.post('/:id/mark-opened', attachIdentity, async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
  try {
    const { rows } = await query(
      `UPDATE fad_quotes
          SET status = 'opened', opened_at = COALESCE(opened_at, NOW())
        WHERE tenant_id = $1 AND id = $2 AND status IN ('sent', 'opened')
        RETURNING *`,
      [req.tenantId, req.params.id],
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ quote: shapeQuote(rows[0]) });
  } catch (e) {
    console.error('[quotes] mark-opened failed:', e.message);
    res.status(500).json({ error: 'Failed' });
  }
});

module.exports = router;
