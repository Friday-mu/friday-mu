'use strict';

// GET /api/public/returning-guest?email=...
//
// Repeat-guest detection for friday.mu booking requests. Reads FAD's
// Guesty reservation cache instead of letting the website query Guesty.

const express = require('express');
const crypto = require('crypto');
const { query } = require('../database/client');
const { attachApiClient, requireScope } = require('../auth/api_clients');

function publicError(res, status, code, message) {
  return res.status(status).json({
    error: code,
    message: message || code,
    request_id: crypto.randomUUID(),
  });
}

function validEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function mapReturningGuest(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const last = rows[0];
  return {
    firstName: last.guest_first_name || null,
    lastCheckOut: String(last.check_out_date).slice(0, 10),
    lastListingName: last.listing_nickname || last.listing_title || null,
    totalStays: rows.length,
  };
}

const router = express.Router();

router.get('/', attachApiClient, requireScope('reservations:read'), async (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!validEmail(email)) return publicError(res, 400, 'invalid_request', 'valid email is required');

  try {
    const { rows } = await query(
      `SELECT r.guest_first_name,
              r.check_out_date::text AS check_out_date,
              l.nickname AS listing_nickname,
              l.title AS listing_title
         FROM guesty_reservations r
         LEFT JOIN guesty_listings l
           ON l.tenant_id = r.tenant_id
          AND l.guesty_id = r.listing_guesty_id
        WHERE r.tenant_id = $1
          AND LOWER(COALESCE(r.guest_email, '')) = $2
          AND r.check_out_date IS NOT NULL
          AND r.check_out_date < CURRENT_DATE
          AND COALESCE(LOWER(r.status), '') NOT IN ('canceled', 'cancelled', 'declined', 'rejected')
        ORDER BY r.check_out_date DESC
        LIMIT 20`,
      [req.apiClient.tenantId, email],
    );
    res.set('Cache-Control', 'private, max-age=300');
    return res.json({ guest: mapReturningGuest(rows) });
  } catch (e) {
    console.error('[public/returning-guest] error:', e.message);
    return publicError(res, 500, 'server_error', e.message);
  }
});

module.exports = {
  router,
  _test: {
    mapReturningGuest,
    validEmail,
  },
};
