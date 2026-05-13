'use strict';

// Design module router aggregator. Sub-routers (projects / leads /
// counterparties / vendors / etc.) are mounted here as subsequent slices
// land. server.js wires `/api/design` to this aggregator.
//
// design-be-1: just the health probe + module identity. Routes themselves
// arrive in design-be-2..5.

const express = require('express');
const { requireDesignPerm } = require('./auth');
const { runAutoTaskScan } = require('./jobs/auto_tasks');

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

// One-shot admin route — fires the auto-task scanner immediately and
// returns its result. Useful for debugging without waiting for the 5min
// scheduler tick. Same Director write-perm as the rest of the surface;
// no body needed.
router.post('/jobs/run-auto-tasks', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const result = await runAutoTaskScan();
    res.json(result);
  } catch (e) {
    console.error('[design/jobs] run-auto-tasks error:', e.message);
    res.status(500).json({ error: e.message });
  }
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
router.use('/rough_budget_versions', require('./rough_budget_versions'));
router.use('/agreements', require('./agreements'));
router.use('/payment_gates', require('./payment_gates'));
router.use('/moodboards', require('./moodboards'));
router.use('/packs', require('./packs'));
router.use('/selections', require('./selections'));
router.use('/change_orders', require('./change_orders'));
router.use('/budget_items', require('./budget_items'));

// Bank reconciliation (design-be-24). Two mounts because the URL shapes
// are nested: project-scoped statements/transactions/matches under
// /projects/:project_id/bank-*, and flat /bank-matches/:id/{confirm,reject}.
const bankRecon = require('./bank_reconciliation');
router.use('/projects', bankRecon.projectBankRouter);
router.use('/bank-matches', bankRecon.bankMatchRouter);
router.use('/closeout_binders', require('./closeout_binders'));
router.use('/approvals', require('./approvals'));
router.use('/magic_links', require('./magic_links'));
router.use('/annex_a', require('./annex_a'));
router.use('/analytics', require('./analytics'));
router.use('/ai_images', require('./ai_images'));

// Portal — magic-link gated (NOT JWT). Mount after the staff routes so
// the auth middleware short-circuits before any staff-perm check.
router.use('/portal', require('./portal'));

module.exports = router;
