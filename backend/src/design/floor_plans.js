'use strict';

// Floor plan versions — versioned per project, single-table-per-row.
// One row per accepted chat turn (W3) plus the initial vN=1 created
// when Mathias starts a project from a source image. The vector model
// lives in the `model` JSONB column; the rendered raster URL is
// populated lazily by GET /:id/render so chat turns stay fast.
//
// See backend/migrations/032_floor_plans.sql for the schema and
// frontend/src/app/fad/_data/floorPlanTypes.ts for the wire shape.

const express = require('express');
const { query, pool } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { shapeFloorPlanVersion } = require('./adapters');
const { appendActivity } = require('./activities');
const { validateModel } = require('./floor_plan_ops');

// The renderer module is built in a parallel slice (W4). Require it
// defensively so this file boots even if the renderer hasn't landed
// yet. The /:id/render endpoint will 503 until it does.
let renderer = null;
try {
  // eslint-disable-next-line global-require
  renderer = require('./floor_plan_renderer');
} catch (e) {
  console.warn('[design/floor_plans] floor_plan_renderer not yet available:',
    e.code === 'MODULE_NOT_FOUND' ? 'module missing (W4 not landed)' : e.message);
}

const router = express.Router();

// ── Helpers ────────────────────────────────────────────────────────

async function _ownsProject(tenantId, projectId) {
  const { rows } = await query(
    `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
    [tenantId, projectId],
  );
  return rows.length > 0;
}

// ── GET / (list versions for a project) ────────────────────────────

router.get('/', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const projectId = req.query.project_id;
    if (typeof projectId !== 'string') {
      return res.status(400).json({ error: 'project_id query param is required' });
    }
    if (!(await _ownsProject(req.tenantId, projectId))) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const { rows } = await query(
      `SELECT * FROM design_floor_plans WHERE project_id = $1 ORDER BY version DESC`,
      [projectId],
    );
    res.json({ results: rows.map(shapeFloorPlanVersion) });
  } catch (e) {
    console.error('[design/floor_plans] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /:id (single version) ──────────────────────────────────────

router.get('/:id', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT fp.* FROM design_floor_plans fp
       JOIN design_projects p ON p.id = fp.project_id
       WHERE p.tenant_id = $1 AND fp.id = $2`,
      [req.tenantId, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Floor plan version not found' });
    res.json(shapeFloorPlanVersion(rows[0]));
  } catch (e) {
    console.error('[design/floor_plans] get error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /:id/render (lazy renderer) ────────────────────────────────
//
// If rendered_image_url is already set, return it directly. Otherwise
// kick off the renderer, persist the URL, return it. The renderer is
// expensive (Gemini call); we serve from cache 100% of the time
// after the first hit.

router.get('/:id/render', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT fp.* FROM design_floor_plans fp
       JOIN design_projects p ON p.id = fp.project_id
       WHERE p.tenant_id = $1 AND fp.id = $2`,
      [req.tenantId, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Floor plan version not found' });
    const row = rows[0];
    if (row.rendered_image_url) {
      return res.json({
        url: row.rendered_image_url,
        rendered_image_url: row.rendered_image_url, // legacy key
        cached: true,
      });
    }
    if (!renderer || typeof renderer.renderModelToStylizedRaster !== 'function') {
      return res.status(503).json({
        error: 'Renderer not available — floor_plan_renderer module not yet loaded',
      });
    }
    // Renderer returns { url, sha256, cached, stub? } per Phase 1C
    // contract. The stub path (no NANOBANANA key) returns the SVG as
    // a data URL so the UI still shows something structural.
    const result = await renderer.renderModelToStylizedRaster(
      row.model,
      row.model?.styleNotes || '',
      { tenantId: req.tenantId, userId: req.identity?.userId },
    );
    if (!result || !result.url) {
      return res.status(502).json({ error: 'Renderer returned no URL' });
    }
    // Only persist non-stub URLs; stub data-URLs are huge and per-tenant
    // — caching them in the DB would bloat the row and break the lazy-
    // refresh-after-key-set workflow.
    if (!result.stub) {
      await query(
        `UPDATE design_floor_plans SET rendered_image_url = $1, updated_at = NOW() WHERE id = $2`,
        [result.url, row.id],
      );
    }
    res.json({
      url: result.url,
      rendered_image_url: result.stub ? null : result.url, // legacy key
      sha256: result.sha256,
      cached: result.cached === true,
      stub: result.stub === true,
    });
  } catch (e) {
    console.error('[design/floor_plans] render error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST / (create new version — used to seed v1 or by callers
// that already have a finished model) ─────────────────────────────

router.post('/', requireDesignPerm('design:write'), async (req, res) => {
  const client = await pool.connect();
  try {
    const body = req.body || {};
    if (!body.project_id) return res.status(400).json({ error: 'project_id is required' });
    if (!body.model) return res.status(400).json({ error: 'model is required' });
    try {
      validateModel(body.model);
    } catch (validationErr) {
      return res.status(400).json({ error: `Invalid model: ${validationErr.message}` });
    }
    await client.query('BEGIN');
    const ownerCheck = await client.query(
      `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [req.tenantId, body.project_id],
    );
    if (ownerCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Project not found' });
    }
    const { rows: maxRows } = await client.query(
      `SELECT COALESCE(MAX(version), 0) + 1 AS next FROM design_floor_plans WHERE project_id = $1`,
      [body.project_id],
    );
    const nextVersion = Number(maxRows[0].next);
    const { rows } = await client.query(
      `INSERT INTO design_floor_plans (project_id, version, source_image_url, model, label)
       VALUES ($1, $2, $3, $4::jsonb, $5) RETURNING *`,
      [
        body.project_id,
        nextVersion,
        body.source_image_url || null,
        JSON.stringify(body.model),
        body.label || null,
      ],
    );
    await client.query('COMMIT');
    appendActivity({
      projectId: body.project_id,
      actorUserId: req.identity?.userId,
      actorName: req.identity?.displayName || req.identity?.username,
      action: 'floor_plan.created',
      payload: { floor_plan_id: rows[0].id, version: nextVersion, label: rows[0].label || null },
      visibility: 'internal',
    }).catch(() => {});
    res.status(201).json(shapeFloorPlanVersion(rows[0]));
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[design/floor_plans] create error:', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ── PATCH /:id (update latest version model / label) ───────────────
//
// Reject if a newer version exists for the project AND this version
// is_final. Otherwise allow the patch — Mathias can fiddle with a
// not-yet-final draft.

router.patch('/:id', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const body = req.body || {};
    if (body.model) {
      try { validateModel(body.model); }
      catch (validationErr) {
        return res.status(400).json({ error: `Invalid model: ${validationErr.message}` });
      }
    }
    // Tenant ownership + fetch the row.
    const { rows: cur } = await query(
      `SELECT fp.* FROM design_floor_plans fp
       JOIN design_projects p ON p.id = fp.project_id
       WHERE p.tenant_id = $1 AND fp.id = $2`,
      [req.tenantId, req.params.id],
    );
    if (cur.length === 0) return res.status(404).json({ error: 'Floor plan version not found' });
    const row = cur[0];
    // Is there a newer version on the same project?
    const { rows: newer } = await query(
      `SELECT 1 FROM design_floor_plans WHERE project_id = $1 AND version > $2 LIMIT 1`,
      [row.project_id, row.version],
    );
    if (newer.length > 0 && row.is_final) {
      return res.status(409).json({ error: 'Cannot patch — a newer version exists and this one is finalised' });
    }
    const sets = [];
    const params = [req.params.id];
    let idx = 2;
    if (Object.prototype.hasOwnProperty.call(body, 'model')) {
      sets.push(`model = $${idx++}::jsonb`);
      params.push(JSON.stringify(body.model));
      // Clear rendered_image_url — the model changed so the cached
      // raster is stale.
      sets.push('rendered_image_url = NULL');
    }
    if (Object.prototype.hasOwnProperty.call(body, 'label')) {
      sets.push(`label = $${idx++}`);
      params.push(body.label === '' ? null : body.label);
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No allowed fields to update' });
    sets.push('updated_at = NOW()');
    const sql = `UPDATE design_floor_plans SET ${sets.join(', ')} WHERE id = $1 RETURNING *`;
    const { rows } = await query(sql, params);
    res.json(shapeFloorPlanVersion(rows[0]));
  } catch (e) {
    console.error('[design/floor_plans] patch error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /:id/finalize ─────────────────────────────────────────────
//
// Mark this version is_final=true, flipping any prior final off.
// Transactional so the unique partial index never sees two finals.

router.post('/:id/finalize', requireDesignPerm('design:write'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: cur } = await client.query(
      `SELECT fp.* FROM design_floor_plans fp
       JOIN design_projects p ON p.id = fp.project_id
       WHERE p.tenant_id = $1 AND fp.id = $2 FOR UPDATE`,
      [req.tenantId, req.params.id],
    );
    if (cur.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Floor plan version not found' });
    }
    const row = cur[0];
    await client.query(
      `UPDATE design_floor_plans SET is_final = FALSE, updated_at = NOW()
       WHERE project_id = $1 AND id <> $2 AND is_final = TRUE`,
      [row.project_id, row.id],
    );
    const { rows: updated } = await client.query(
      `UPDATE design_floor_plans SET is_final = TRUE, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [row.id],
    );
    await client.query('COMMIT');
    appendActivity({
      projectId: row.project_id,
      actorUserId: req.identity?.userId,
      actorName: req.identity?.displayName || req.identity?.username,
      action: 'floor_plan.finalized',
      payload: { floor_plan_id: row.id, version: row.version },
      visibility: 'portal',
    }).catch(() => {});
    res.json(shapeFloorPlanVersion(updated[0]));
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[design/floor_plans] finalize error:', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ── POST /:id/revert ───────────────────────────────────────────────
//
// Duplicate this version as a new latest version. The new row
// inherits the model and source image but starts is_final=false and
// rendered_image_url=null (it'll re-render on demand).

router.post('/:id/revert', requireDesignPerm('design:write'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: cur } = await client.query(
      `SELECT fp.* FROM design_floor_plans fp
       JOIN design_projects p ON p.id = fp.project_id
       WHERE p.tenant_id = $1 AND fp.id = $2`,
      [req.tenantId, req.params.id],
    );
    if (cur.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Floor plan version not found' });
    }
    const row = cur[0];
    const { rows: maxRows } = await client.query(
      `SELECT COALESCE(MAX(version), 0) + 1 AS next FROM design_floor_plans WHERE project_id = $1`,
      [row.project_id],
    );
    const nextVersion = Number(maxRows[0].next);
    const label = `Revert of v${row.version}${row.label ? ` (${row.label})` : ''}`;
    const { rows } = await client.query(
      `INSERT INTO design_floor_plans (project_id, version, source_image_url, model, label)
       VALUES ($1, $2, $3, $4::jsonb, $5) RETURNING *`,
      [row.project_id, nextVersion, row.source_image_url, JSON.stringify(row.model), label],
    );
    await client.query('COMMIT');
    appendActivity({
      projectId: row.project_id,
      actorUserId: req.identity?.userId,
      actorName: req.identity?.displayName || req.identity?.username,
      action: 'floor_plan.reverted',
      payload: {
        new_floor_plan_id: rows[0].id,
        new_version: nextVersion,
        reverted_from_id: row.id,
        reverted_from_version: row.version,
      },
      visibility: 'internal',
    }).catch(() => {});
    res.status(201).json(shapeFloorPlanVersion(rows[0]));
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[design/floor_plans] revert error:', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

module.exports = router;
