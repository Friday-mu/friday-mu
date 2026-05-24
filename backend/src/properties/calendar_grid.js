'use strict';

// /api/calendar/grid?from&to — per-property × per-day price + availability
// over a window. Powers the Multi-calendar v0.2 per-cell €PRICE chips.
//
// Pricing source: guesty_calendar (synced by the standard Guesty calendar
// worker). Cells where the cache has no row return {price_minor: null,
// available: null} so the UI can show a neutral state.
//
// v0.5 — fad_calendar_blocks overlay (mig 090): any (listing, date)
// pair with a FAD-side block flips `available` to false regardless
// of what Guesty's cache says. block.reason + block.notes flow back
// so the UI can colour the chip + show a tooltip.

const express = require('express');
const { query } = require('../database/client');
const { attachIdentity } = require('../design/auth');

const router = express.Router();

const isoRe = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_REASONS = new Set([
  'owner_stay', 'maintenance', 'private_use', 'channel_block', 'other',
]);

router.get('/grid', attachIdentity, async (req, res) => {
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  if (!isoRe.test(from) || !isoRe.test(to)) {
    return res.status(400).json({ error: 'from + to required as YYYY-MM-DD' });
  }
  if (from > to) return res.status(400).json({ error: 'to must be >= from' });

  try {
    const { rows } = await query(
      `SELECT
         gc.listing_guesty_id,
         gc.date::text AS date,
         gc.price_minor,
         gc.is_available,
         gc.currency_code
       FROM guesty_calendar gc
       WHERE gc.tenant_id = $1
         AND gc.date >= $2::date
         AND gc.date <= $3::date
       ORDER BY gc.listing_guesty_id, gc.date`,
      [req.tenantId, from, to],
    );

    // Pull all FAD-side blocks in the window in one round-trip.
    const blocksRes = await query(
      `SELECT listing_guesty_id, date::text AS date, reason, notes
         FROM fad_calendar_blocks
        WHERE tenant_id = $1
          AND date >= $2::date
          AND date <= $3::date`,
      [req.tenantId, from, to],
    );
    const blockKey = (listingId, date) => `${listingId}|${date}`;
    const blocksByKey = new Map();
    for (const b of blocksRes.rows) {
      blocksByKey.set(blockKey(b.listing_guesty_id, b.date), {
        reason: b.reason || null,
        notes: b.notes || null,
      });
    }

    // Bucket by listing_guesty_id → {date: {price_minor, available, currency, blocked, reason, notes}}
    const byListing = new Map();
    for (const r of rows) {
      const map = byListing.get(r.listing_guesty_id) || {};
      const block = blocksByKey.get(blockKey(r.listing_guesty_id, r.date));
      map[r.date] = {
        price_minor: r.price_minor != null ? Number(r.price_minor) : null,
        // FAD block overrides Guesty availability — staff intent wins.
        available: block ? false : r.is_available,
        currency: r.currency_code || null,
        blocked: !!block,
        block_reason: block?.reason || null,
        block_notes: block?.notes || null,
      };
      byListing.set(r.listing_guesty_id, map);
    }
    // Also surface block rows for listings that have no Guesty cache
    // entry on that date (e.g. far-future blocks).
    for (const b of blocksRes.rows) {
      const map = byListing.get(b.listing_guesty_id) || {};
      if (!map[b.date]) {
        map[b.date] = {
          price_minor: null,
          available: false,
          currency: null,
          blocked: true,
          block_reason: b.reason || null,
          block_notes: b.notes || null,
        };
        byListing.set(b.listing_guesty_id, map);
      }
    }

    const properties = Array.from(byListing.entries()).map(([listing_guesty_id, prices_by_date]) => ({
      listing_guesty_id,
      prices_by_date,
    }));

    res.json({
      window: { from, to },
      properties,
      cell_count: rows.length,
      block_count: blocksRes.rows.length,
    });
  } catch (e) {
    console.error('[calendar/grid] failed:', e.message);
    res.status(500).json({ error: 'Grid query failed' });
  }
});

// ────────────────────────────────────────────────────────────────
// Block / unblock dates (Calendar v0.5)
// ────────────────────────────────────────────────────────────────
//
// POST   /api/calendar/block   — block a list of (listing, date) pairs
// DELETE /api/calendar/block   — unblock a list
//
// Body: { listing_guesty_id, dates: ["YYYY-MM-DD", ...], reason?, notes? }
//
// Phase 1: FAD-local only. Phase 2: write-through to Guesty when the
// channel-manager work lands.

function parseBlockBody(body) {
  const listingId = typeof body?.listing_guesty_id === 'string' ? body.listing_guesty_id.trim() : '';
  const dates = Array.isArray(body?.dates) ? body.dates.filter((d) => typeof d === 'string' && isoRe.test(d)) : [];
  if (!listingId) return { error: 'listing_guesty_id required' };
  if (dates.length === 0) return { error: 'dates required (non-empty array of YYYY-MM-DD strings)' };
  if (dates.length > 365) return { error: 'too many dates in one request (max 365)' };
  return { listingId, dates };
}

router.post('/block', attachIdentity, async (req, res) => {
  const parsed = parseBlockBody(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const { listingId, dates } = parsed;
  const reason = typeof req.body?.reason === 'string' && req.body.reason ? req.body.reason : null;
  const notes = typeof req.body?.notes === 'string' && req.body.notes.trim() ? req.body.notes.trim() : null;
  if (reason && !ALLOWED_REASONS.has(reason)) {
    return res.status(400).json({ error: 'invalid reason' });
  }
  try {
    // Confirm the listing exists in this tenant before writing.
    const listingCheck = await query(
      `SELECT 1 FROM guesty_listings WHERE tenant_id = $1 AND guesty_id = $2 LIMIT 1`,
      [req.tenantId, listingId],
    );
    if (listingCheck.rows.length === 0) {
      return res.status(404).json({ error: 'listing not found for this tenant' });
    }
    // Single round-trip insert via unnest — much faster than N queries.
    const { rows } = await query(
      `INSERT INTO fad_calendar_blocks
         (tenant_id, listing_guesty_id, date, reason, notes, created_by_user_id)
       SELECT $1::uuid, $2::text, d::date, $3::text, $4::text, $5::uuid
         FROM unnest($6::date[]) AS d
       ON CONFLICT (tenant_id, listing_guesty_id, date) DO UPDATE
         SET reason = EXCLUDED.reason,
             notes = EXCLUDED.notes,
             updated_at = NOW()
       RETURNING listing_guesty_id, date::text AS date, reason, notes`,
      [
        req.tenantId, listingId, reason, notes,
        req.identity?.userId || null,
        dates,
      ],
    );
    res.status(201).json({ ok: true, blocked_count: rows.length, blocks: rows });
  } catch (e) {
    console.error('[calendar/block] post error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/block', attachIdentity, async (req, res) => {
  const parsed = parseBlockBody(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const { listingId, dates } = parsed;
  try {
    const { rowCount } = await query(
      `DELETE FROM fad_calendar_blocks
        WHERE tenant_id = $1
          AND listing_guesty_id = $2
          AND date = ANY($3::date[])`,
      [req.tenantId, listingId, dates],
    );
    res.json({ ok: true, unblocked_count: rowCount });
  } catch (e) {
    console.error('[calendar/block] delete error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
