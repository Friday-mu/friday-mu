'use strict';

// Operations settings — per-tenant editable config (task templates,
// booking-trigger policies, recurring rules). Replaces the static
// SETTINGS_* fixtures (PROD-CONFIG-10). Stored as one JSONB blob per
// tenant (migration 114). GET returns the stored config or the seeded
// defaults; PUT validates + upserts.
//
// The automation job that consumes booking-trigger / recurring rules is a
// separate future slice — this module persists + serves the config and its
// live/paused state.

const crypto = require('crypto');
const express = require('express');
const { query } = require('../database/client');
const { attachIdentity } = require('../design/auth');

const router = express.Router();

// Seed managers see before customizing — mirrors the former fixtures, now
// each item carries an id + enabled (live/paused) flag.
const DEFAULT_OPERATIONS_SETTINGS = {
  templates: [
    { id: 'std-clean', name: 'Standard cleaning', route: 'cleaning > standard_clean', estimate: '2h', enabled: true },
    { id: 'post-clean', name: 'Post-clean inspection', route: 'inspection > post_clean', estimate: '30m', enabled: true },
    { id: 'pre-arrival', name: 'Pre-arrival inspection', route: 'inspection > pre_arrival', estimate: '45m', enabled: true },
    { id: 'deep-clean', name: 'Deep clean', route: 'cleaning > deep_clean', estimate: '6h', enabled: true },
    { id: 'pool', name: 'Pool clarity check', route: 'maintenance > pool', estimate: '45m', enabled: true },
  ],
  bookingPolicies: [
    { id: 'checkout', trigger: 'Checkout received', actions: ['Create standard cleaning for checkout day', 'Create post-clean inspection after cleaning is due'], enabled: false },
    { id: 'pre-checkin', trigger: 'Two days before check-in', actions: ['If property is empty more than 3 days or flagged, create pre-arrival inspection', 'Otherwise skip to avoid noise'], enabled: false },
  ],
  recurringRules: [
    { id: 'pest', trigger: 'Pest control per property', actions: ['Every 3 months'], enabled: true },
    { id: 'ac', trigger: 'AC servicing per property', actions: ['Every 6 months'], enabled: true },
    { id: 'preventative', trigger: 'Preventative maintenance', actions: ['Monthly - all properties'], enabled: true },
    { id: 'aesthetic', trigger: 'Aesthetic check', actions: ['Monthly - all properties'], enabled: true },
    { id: 'amenities', trigger: 'Amenities form gap analysis', actions: ['Monthly - sequential'], enabled: true },
  ],
};

const str = (v, n = 200) => (typeof v === 'string' ? v.slice(0, n) : '');
const arr = (v) => (Array.isArray(v) ? v : []);
const newId = () => `it-${crypto.randomBytes(5).toString('hex')}`;

function normTemplate(it) {
  return {
    id: str(it && it.id, 60) || newId(),
    name: str(it && it.name),
    route: str(it && it.route),
    estimate: str(it && it.estimate, 40),
    enabled: !(it && it.enabled === false),
  };
}
function normRule(it) {
  return {
    id: str(it && it.id, 60) || newId(),
    trigger: str(it && it.trigger),
    actions: arr(it && it.actions).map((a) => str(a, 500)).filter(Boolean).slice(0, 20),
    enabled: !(it && it.enabled === false),
  };
}
function normalizeConfig(c) {
  return {
    templates: arr(c && c.templates).slice(0, 100).map(normTemplate),
    bookingPolicies: arr(c && c.bookingPolicies).slice(0, 100).map(normRule),
    recurringRules: arr(c && c.recurringRules).slice(0, 100).map(normRule),
  };
}

router.get('/settings', attachIdentity, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT config, updated_at FROM operations_settings WHERE tenant_id = $1',
      [req.tenantId],
    );
    const stored = rows[0] && rows[0].config;
    const hasStored = stored && typeof stored === 'object' && Object.keys(stored).length > 0;
    res.json({
      config: hasStored ? normalizeConfig(stored) : DEFAULT_OPERATIONS_SETTINGS,
      updated_at: (rows[0] && rows[0].updated_at) || null,
      is_default: !hasStored,
    });
  } catch (e) {
    console.error('[operations/settings] get error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.put('/settings', attachIdentity, async (req, res) => {
  try {
    const config = req.body && req.body.config;
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return res.status(400).json({ error: 'config object required' });
    }
    const normalized = normalizeConfig(config);
    const { rows } = await query(
      `INSERT INTO operations_settings (tenant_id, config, updated_by, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (tenant_id) DO UPDATE
         SET config = EXCLUDED.config, updated_by = EXCLUDED.updated_by, updated_at = now()
       RETURNING config, updated_at`,
      [req.tenantId, JSON.stringify(normalized), (req.identity && req.identity.userId) || null],
    );
    res.json({ config: rows[0].config, updated_at: rows[0].updated_at, is_default: false });
  } catch (e) {
    console.error('[operations/settings] put error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
module.exports.DEFAULT_OPERATIONS_SETTINGS = DEFAULT_OPERATIONS_SETTINGS;
