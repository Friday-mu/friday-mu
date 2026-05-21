'use strict';

// Rough-budget versioning. Each version is a snapshot of the budget
// envelope (low/mid/high, tier, design+procurement fee, narrative
// fields, status) plus the line items that belong to it (joined via
// design_rough_budgets.version_id).
//
// version_number is server-assigned (next MAX+1 per project) on POST.
// PATCH lets the staff refine the envelope; line items are managed
// separately via /rough_budgets (with version_id supplied).

const express = require('express');
const { query } = require('../database/client');
const { requireDesignPerm } = require('./auth');

const router = express.Router();

const WRITABLE_FIELDS = [
  'low_minor',
  'mid_minor',
  'high_minor',
  'tier',
  'classification_override',
  'design_fee_minor',
  'procurement_fee_minor',
  'assumptions',
  'exclusions',
  'risk_items',
  'next_steps',
  'status',
];

// Reflect the latest rough-budget version's headline numbers onto the
// project row so Summary panels, Annex B auto-fill, the Overview fee
// cards — every surface that reads from design_projects — stay in
// sync with what the team last saved as the rough budget. Without
// this, the project row's epc_minor / fees were frozen at lead-intake
// time and rough-budget edits were invisible everywhere outside the
// RoughBudget stage itself.
//
// "Latest" = MAX(version_number) per project. Only fields that are
// non-null in the latest version are written; partial budgets don't
// clobber existing project values. The manual override columns
// (design_fee_minor_override, procurement_fee_minor_override) are
// untouched — they remain explicit user actions.
async function syncProjectFromLatestRoughBudget(projectId) {
  const { rows } = await query(
    `SELECT mid_minor, design_fee_minor, procurement_fee_minor
     FROM design_rough_budget_versions
     WHERE project_id = $1
     ORDER BY version_number DESC LIMIT 1`,
    [projectId],
  );
  if (rows.length === 0) return;
  const v = rows[0];
  const sets = [];
  const params = [projectId];
  let idx = 2;
  if (v.mid_minor != null) {
    sets.push(`epc_minor = $${idx++}`);
    params.push(v.mid_minor);
  }
  if (v.design_fee_minor != null) {
    sets.push(`design_fee_minor = $${idx++}`);
    params.push(v.design_fee_minor);
  }
  if (v.procurement_fee_minor != null) {
    sets.push(`procurement_fee_minor = $${idx++}`);
    params.push(v.procurement_fee_minor);
  }
  if (sets.length === 0) return;
  sets.push('updated_at = NOW()');
  await query(
    `UPDATE design_projects SET ${sets.join(', ')} WHERE id = $1`,
    params,
  );
}

function shapeRoughBudgetVersion(row) {
  if (!row) return null;
  const toNum = (v) => (v == null ? null : Number(v));
  return {
    id: row.id,
    project_id: row.project_id,
    version_number: row.version_number,
    low_minor: toNum(row.low_minor),
    mid_minor: toNum(row.mid_minor),
    high_minor: toNum(row.high_minor),
    tier: row.tier,
    classification_override: row.classification_override,
    design_fee_minor: toNum(row.design_fee_minor),
    procurement_fee_minor: toNum(row.procurement_fee_minor),
    assumptions: row.assumptions,
    exclusions: row.exclusions,
    risk_items: row.risk_items,
    next_steps: row.next_steps,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

router.get('/', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const projectId = req.query.project_id;
    if (typeof projectId !== 'string') {
      return res.status(400).json({ error: 'project_id query param is required' });
    }
    const ownerCheck = await query(
      `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [req.tenantId, projectId],
    );
    if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    const { rows } = await query(
      `SELECT * FROM design_rough_budget_versions
       WHERE project_id = $1
       ORDER BY version_number DESC`,
      [projectId],
    );
    res.json({ results: rows.map(shapeRoughBudgetVersion) });
  } catch (e) {
    console.error('[design/rough_budget_versions] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.project_id) return res.status(400).json({ error: 'project_id is required' });
    const ownerCheck = await query(
      `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [req.tenantId, body.project_id],
    );
    if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Project not found' });

    // Server-assigned version_number — next MAX+1 per project.
    const { rows: numRows } = await query(
      `SELECT COALESCE(MAX(version_number), 0) + 1 AS next
       FROM design_rough_budget_versions WHERE project_id = $1`,
      [body.project_id],
    );
    const versionNumber = numRows[0].next;

    // Insert the envelope.
    const { rows: vRows } = await query(
      `INSERT INTO design_rough_budget_versions (
         project_id, version_number,
         low_minor, mid_minor, high_minor,
         tier, classification_override,
         design_fee_minor, procurement_fee_minor,
         assumptions, exclusions, risk_items, next_steps,
         status
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
       ) RETURNING *`,
      [
        body.project_id, versionNumber,
        body.low_minor ?? null, body.mid_minor ?? null, body.high_minor ?? null,
        body.tier ?? null, body.classification_override ?? null,
        body.design_fee_minor ?? null, body.procurement_fee_minor ?? null,
        body.assumptions ?? null, body.exclusions ?? null, body.risk_items ?? null, body.next_steps ?? null,
        body.status ?? 'draft',
      ],
    );
    const version = shapeRoughBudgetVersion(vRows[0]);

    // Optional line_items array on the body — write them all in one
    // transaction-style batch (we accept best-effort: if any single
    // insert fails we keep the envelope and report the count).
    const items = Array.isArray(body.line_items) ? body.line_items : [];
    const insertedItems = [];
    for (const it of items) {
      try {
        const { rows: liRows } = await query(
          `INSERT INTO design_rough_budgets (
             project_id, version_id,
             category_code, description, unit_cost_minor, quantity, notes, catalog_source_id
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [
            body.project_id, version.id,
            it.category_code ?? null,
            it.description ?? '',
            it.unit_cost_minor ?? null,
            it.quantity ?? null,
            it.notes ?? null,
            it.catalog_source_id ?? null,
          ],
        );
        insertedItems.push(liRows[0]);
      } catch (liErr) {
        console.error('[design/rough_budget_versions] line item insert failed:', liErr.message);
      }
    }

    // Propagate the new version's mid/fees onto the project row so
    // Summary, Annex B auto-fill, and Overview cards stay in sync.
    // Best-effort: a sync failure shouldn't fail the save.
    try {
      await syncProjectFromLatestRoughBudget(body.project_id);
    } catch (syncErr) {
      console.error('[design/rough_budget_versions] project sync after POST failed:', syncErr.message);
    }

    res.status(201).json({ ...version, line_items_inserted: insertedItems.length });
  } catch (e) {
    console.error('[design/rough_budget_versions] create error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const body = req.body || {};
    const sets = [];
    const params = [req.tenantId, req.params.id];
    let idx = 3;
    for (const field of WRITABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        sets.push(`${field} = $${idx++}`);
        params.push(body[field] === '' ? null : body[field]);
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No allowed fields to update' });
    sets.push('updated_at = NOW()');
    const sql = `UPDATE design_rough_budget_versions v SET ${sets.join(', ')}
                 FROM design_projects p
                 WHERE p.id = v.project_id AND p.tenant_id = $1 AND v.id = $2
                 RETURNING v.*`;
    const { rows } = await query(sql, params);
    if (rows.length === 0) return res.status(404).json({ error: 'Rough budget version not found' });

    // Propagate to the project row. If the patched row was the latest
    // version, the project picks up the edits; if it was an older
    // version, the latest's values are re-asserted (idempotent).
    try {
      await syncProjectFromLatestRoughBudget(rows[0].project_id);
    } catch (syncErr) {
      console.error('[design/rough_budget_versions] project sync after PATCH failed:', syncErr.message);
    }

    res.json(shapeRoughBudgetVersion(rows[0]));
  } catch (e) {
    console.error('[design/rough_budget_versions] patch error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
