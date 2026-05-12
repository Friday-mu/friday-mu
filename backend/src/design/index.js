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

module.exports = router;
