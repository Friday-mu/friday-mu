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
//
// Migration 035 added six dedicated columns (company_name,
// pdf_footer_text, legal_jurisdiction_text, currency_code,
// date_format, vendor_defaults) alongside the legacy `annex_a`
// JSONB blob. The TenantSettingsModule sends every editable field
// nested inside `body.annex_a`, but the reader (`shapeAnnexA` +
// `loadTenantConfig`) pulls those six from the dedicated columns —
// so we have to extract them here on write or saves are silently
// lost. Anything else in `body.annex_a` stays in the JSONB.
router.put('/', requireDesignPerm('design:settings'), async (req, res) => {
  try {
    const body = req.body || {};
    if (body.annex_a == null) return res.status(400).json({ error: 'annex_a is required' });
    const a = body.annex_a;
    const companyName = typeof a.company_name === 'string' ? a.company_name : null;
    const pdfFooter = typeof a.pdf_footer_text === 'string' ? a.pdf_footer_text : null;
    const legal = typeof a.legal_jurisdiction_text === 'string' ? a.legal_jurisdiction_text : null;
    const currency = typeof a.currency_code === 'string' && a.currency_code.length > 0
      ? a.currency_code.toUpperCase()
      : null;
    const dateFormat = typeof a.date_format === 'string' ? a.date_format : null;
    const vendorDefaults = a.vendor_defaults && typeof a.vendor_defaults === 'object'
      ? a.vendor_defaults
      : {};
    const { rows } = await query(
      `INSERT INTO design_annex_a
         (tenant_id, annex_a, company_name, pdf_footer_text,
          legal_jurisdiction_text, currency_code, date_format,
          vendor_defaults, updated_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (tenant_id) DO UPDATE
       SET annex_a = EXCLUDED.annex_a,
           company_name = EXCLUDED.company_name,
           pdf_footer_text = EXCLUDED.pdf_footer_text,
           legal_jurisdiction_text = EXCLUDED.legal_jurisdiction_text,
           currency_code = EXCLUDED.currency_code,
           date_format = EXCLUDED.date_format,
           vendor_defaults = EXCLUDED.vendor_defaults,
           updated_at = NOW(),
           updated_by_user_id = EXCLUDED.updated_by_user_id
       RETURNING *`,
      [
        req.tenantId,
        a,
        companyName,
        pdfFooter,
        legal,
        currency,
        dateFormat,
        vendorDefaults,
        req.identity.userId || null,
      ],
    );
    res.json(shapeAnnexA(rows[0]));
  } catch (e) {
    console.error('[design/annex_a] put error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
