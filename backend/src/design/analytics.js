'use strict';

// Analytics endpoints — aggregations across projects. Stage entries here
// match the fixture's `analytics` namespace shape: timeInStage(range),
// funnel(), spendCurve(range), revenueCurve(range).
//
// v0.1 returns lightweight aggregations computed in-pg. v0.2 may move
// the heavier queries to a materialized view if response time degrades.

const express = require('express');
const { query } = require('../database/client');
const { requireDesignPerm } = require('./auth');

const router = express.Router();

// GET /api/design/analytics/time-in-stage?days=90 — mean days each project
// spent in each stage over the window. Joins design_stages → projects.
router.get('/time-in-stage', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days, 10) || 90, 365);
    const { rows } = await query(
      `SELECT s.stage_key,
              COUNT(*) FILTER (WHERE s.completed_at IS NOT NULL) AS completed_count,
              AVG(EXTRACT(EPOCH FROM (COALESCE(s.completed_at, NOW()) - s.entered_at)) / 86400)::numeric(10,2) AS mean_days
       FROM design_stages s
       JOIN design_projects p ON p.id = s.project_id
       WHERE p.tenant_id = $1
         AND s.entered_at IS NOT NULL
         AND s.entered_at >= NOW() - ($2 || ' days')::interval
       GROUP BY s.stage_key
       ORDER BY s.stage_key`,
      [req.tenantId, String(days)],
    );
    res.json({ window_days: days, results: rows });
  } catch (e) {
    console.error('[design/analytics] time-in-stage error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/design/analytics/funnel — lead → qualified → converted →
// project lifecycle distribution. Single-row response with counts.
router.get('/funnel', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const leadCounts = await query(
      `SELECT status, COUNT(*)::int AS count FROM design_leads WHERE tenant_id = $1 GROUP BY status`,
      [req.tenantId],
    );
    const projectCounts = await query(
      `SELECT lifecycle_status, COUNT(*)::int AS count FROM design_projects WHERE tenant_id = $1 GROUP BY lifecycle_status`,
      [req.tenantId],
    );
    const stageCounts = await query(
      `SELECT current_stage, COUNT(*)::int AS count
       FROM design_projects WHERE tenant_id = $1 AND lifecycle_status = 'active'
       GROUP BY current_stage`,
      [req.tenantId],
    );
    const leadsByStatus = {};
    for (const r of leadCounts.rows) leadsByStatus[r.status] = r.count;
    const projectsByLifecycle = {};
    for (const r of projectCounts.rows) projectsByLifecycle[r.lifecycle_status] = r.count;
    const projectsByStage = {};
    for (const r of stageCounts.rows) projectsByStage[r.current_stage] = r.count;
    res.json({
      leads_by_status: leadsByStatus,
      projects_by_lifecycle: projectsByLifecycle,
      projects_by_stage: projectsByStage,
    });
  } catch (e) {
    console.error('[design/analytics] funnel error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/design/analytics/spend-curve?days=90 — daily spend rollup
// from budget items (negotiated_cost for staff, fall back to unit cost).
// Director-sensitive: requires read_sensitive.
router.get('/spend-curve', requireDesignPerm('design:read_sensitive'), async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days, 10) || 90, 365);
    const { rows } = await query(
      `SELECT DATE(b.created_at) AS day,
              SUM(COALESCE(b.negotiated_cost_minor, b.unit_cost_minor) * COALESCE(b.quantity, 1))::bigint AS spend_minor
       FROM design_budget_items b
       JOIN design_projects p ON p.id = b.project_id
       WHERE p.tenant_id = $1 AND b.created_at >= NOW() - ($2 || ' days')::interval
       GROUP BY day
       ORDER BY day`,
      [req.tenantId, String(days)],
    );
    res.json({ window_days: days, results: rows });
  } catch (e) {
    console.error('[design/analytics] spend-curve error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/design/analytics/revenue-curve?days=180 — daily received fee
// rollup from payment_gates. Director-sensitive.
//
// Two-ledger filter (migration 006): only fee_invoice rows count as
// Friday revenue. project_fund credits are owner-deposited escrow money
// (we hold it, we don't earn it) and would silently double the revenue
// curve if not excluded. The filter is explicit rather than relying on
// the DEFAULT 'fee_invoice' because rows from migration 006's backfill
// have ledger_type set, and any future project_fund row that lands
// here without the filter would corrupt the timeline.
router.get('/revenue-curve', requireDesignPerm('design:read_sensitive'), async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days, 10) || 180, 730);
    const { rows } = await query(
      `SELECT DATE(g.received_at) AS day,
              SUM(COALESCE(g.received_amount_minor, g.amount_minor, 0))::bigint AS revenue_minor
       FROM design_payment_gates g
       JOIN design_projects p ON p.id = g.project_id
       WHERE p.tenant_id = $1
         AND g.status = 'received'
         AND g.ledger_type = 'fee_invoice'
         AND g.received_at >= NOW() - ($2 || ' days')::interval
       GROUP BY day
       ORDER BY day`,
      [req.tenantId, String(days)],
    );
    res.json({ window_days: days, results: rows });
  } catch (e) {
    console.error('[design/analytics] revenue-curve error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/design/analytics/vendor-performance — cross-project rollup
// per vendor (item count, total spend, internal_work ratio). Director-only.
router.get('/vendor-performance', requireDesignPerm('design:read_sensitive'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT v.id AS vendor_id, v.name AS vendor_name, v.category,
              COUNT(b.id)::int AS item_count,
              SUM(COALESCE(b.negotiated_cost_minor, b.unit_cost_minor) * COALESCE(b.quantity, 1))::bigint AS total_spend_minor,
              SUM(CASE WHEN b.internal_work THEN 1 ELSE 0 END)::int AS internal_work_count
       FROM design_vendors v
       LEFT JOIN design_budget_items b ON b.vendor_id = v.id
       LEFT JOIN design_projects p ON p.id = b.project_id AND p.tenant_id = $1
       WHERE v.tenant_id = $1
       GROUP BY v.id, v.name, v.category
       ORDER BY total_spend_minor DESC NULLS LAST`,
      [req.tenantId],
    );
    res.json({ results: rows });
  } catch (e) {
    console.error('[design/analytics] vendor-performance error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
