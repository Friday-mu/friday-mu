'use strict';

// Annex A — singleton settings (one row per tenant). Holds the tier
// fee tables that drive every project's auto-calc. Updates are
// retroactive — the live config is what's read at runtime; historical
// projects don't snapshot their applicable Annex A. (v0.2 may add an
// annex_a_version_at column on projects if that becomes a problem.)

const express = require('express');
const { query } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { shapeAnnexA } = require('./adapters');

const router = express.Router();

router.get('/', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM design_annex_a WHERE tenant_id = $1`,
      [req.tenantId],
    );
    if (rows.length === 0) {
      return res.json({
        tenant_id: req.tenantId,
        annex_a: {},
        updated_at: null,
        updated_by_user_id: null,
      });
    }
    res.json(shapeAnnexA(rows[0]));
  } catch (e) {
    console.error('[design/annex_a] get error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/design/annex_a — director-only.
router.put('/', requireDesignPerm('design:settings'), async (req, res) => {
  try {
    const body = req.body || {};
    if (body.annex_a == null) return res.status(400).json({ error: 'annex_a is required' });
    const { rows } = await query(
      `INSERT INTO design_annex_a (tenant_id, annex_a, updated_by_user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id) DO UPDATE
       SET annex_a = EXCLUDED.annex_a,
           updated_at = NOW(),
           updated_by_user_id = EXCLUDED.updated_by_user_id
       RETURNING *`,
      [req.tenantId, body.annex_a, req.identity.userId || null],
    );
    res.json(shapeAnnexA(rows[0]));
  } catch (e) {
    console.error('[design/annex_a] put error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
