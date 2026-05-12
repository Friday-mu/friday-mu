'use strict';

// Design module router aggregator. Sub-routers (projects / leads /
// counterparties / vendors / etc.) are mounted here as subsequent slices
// land. server.js wires `/api/design` to this aggregator.
//
// design-be-1: just the health probe + module identity. Routes themselves
// arrive in design-be-2..5.

const express = require('express');
const { requireDesignPerm } = require('./auth');

const router = express.Router();

// Module probe — Director-gated so unauthenticated clients can't enumerate
// the design surface. Mirrors the /api/system/status pattern.
router.get('/health', requireDesignPerm('design:read'), (req, res) => {
  res.json({
    module: 'design',
    version: '0.1',
    entity_id: 'FD',
    user: req.identity.userId,
    role: req.identity.userRole,
  });
});

// Sub-routers. Each owns a single resource family; see the per-file
// header for endpoint inventory.
router.use('/projects', require('./projects'));
router.use('/leads', require('./leads'));
router.use('/counterparties', require('./counterparties'));
router.use('/properties', require('./properties'));
router.use('/vendors', require('./vendors'));
router.use('/stages', require('./stages'));
router.use('/documents', require('./documents'));
router.use('/decisions', require('./decisions'));
router.use('/activities', require('./activities'));
router.use('/tasks', require('./tasks'));
router.use('/site_visits', require('./site_visits'));
router.use('/rooms', require('./rooms'));
router.use('/photos', require('./photos'));
router.use('/preferences', require('./preferences'));
router.use('/rough_budgets', require('./rough_budgets'));
router.use('/agreements', require('./agreements'));
router.use('/payment_gates', require('./payment_gates'));

module.exports = router;
