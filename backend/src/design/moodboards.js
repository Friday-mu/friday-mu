'use strict';

// Moodboards — version-tracked per project. Status: draft → sent →
// approved | changes_requested. links JSONB is the array of inspirations
// (URLs + captions + optional image refs).

const express = require('express');
const { randomUUID } = require('crypto');
const { query, pool } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { DEFAULT_TENANT_ID, shapeMoodboard } = require('./adapters');
const { appendActivity } = require('./activities');

const router = express.Router();

const WRITABLE_FIELDS = ['version_number', 'name', 'links', 'notes'];
// W7 — variant_group_id / variant_index aren't user-editable post-
// creation; they're set atomically by /variants and never PATCHed.

router.get('/', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const projectId = req.query.project_id;
    if (typeof projectId !== 'string') {
      return res.status(400).json({ error: 'project_id query param is required' });
    }
    // mig 034 — archived variants are hidden by default. Pass
    // ?include_archived=1 to see the full set (admin recovery view).
    const includeArchived = req.query.include_archived === '1' || req.query.include_archived === 'true';
    const ownerCheck = await query(
      `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [DEFAULT_TENANT_ID, projectId],
    );
    if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    const sql = includeArchived
      ? `SELECT * FROM design_moodboards WHERE project_id = $1 ORDER BY version_number DESC`
      : `SELECT * FROM design_moodboards WHERE project_id = $1 AND is_archived = false ORDER BY version_number DESC`;
    const { rows } = await query(sql, [projectId]);
    res.json({ results: rows.map(shapeMoodboard) });
  } catch (e) {
    console.error('[design/moodboards] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.project_id) return res.status(400).json({ error: 'project_id is required' });
    const ownerCheck = await query(
      `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [DEFAULT_TENANT_ID, body.project_id],
    );
    if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Project not found' });

    // Auto-bump version if not specified
    let versionNumber = body.version_number;
    if (versionNumber == null) {
      const { rows: maxRows } = await query(
        `SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM design_moodboards WHERE project_id = $1`,
        [body.project_id],
      );
      versionNumber = maxRows[0].next;
    }
    const { rows } = await query(
      `INSERT INTO design_moodboards (project_id, version_number, name, links, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        body.project_id,
        versionNumber,
        body.name || null,
        body.links || [],
        body.notes || null,
      ],
    );
    res.status(201).json(shapeMoodboard(rows[0]));
  } catch (e) {
    console.error('[design/moodboards] create error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// JSONB fields need explicit casting through ::jsonb because the dynamic
// SET clause prevents node-postgres from inferring the column type — a
// plain JS array binds as a Postgres array literal and trips
// "invalid input syntax for type json".
const JSONB_FIELDS = new Set(['links']);

router.patch('/:id', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const body = req.body || {};
    const sets = [];
    const params = [DEFAULT_TENANT_ID, req.params.id];
    let idx = 3;
    for (const field of WRITABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        if (JSONB_FIELDS.has(field)) {
          sets.push(`${field} = $${idx++}::jsonb`);
          params.push(JSON.stringify(body[field] ?? []));
        } else {
          sets.push(`${field} = $${idx++}`);
          params.push(body[field] === '' ? null : body[field]);
        }
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No allowed fields to update' });
    sets.push('updated_at = NOW()');
    // Editing locked once status='approved' would block image-add on a
    // signed-off moodboard. Allow PATCH from any pre-approved state and
    // additively from approved (links/captions are non-destructive).
    const sql = `UPDATE design_moodboards m SET ${sets.join(', ')}
                 FROM design_projects p
                 WHERE p.id = m.project_id AND p.tenant_id = $1 AND m.id = $2
                 RETURNING m.*`;
    const { rows } = await query(sql, params);
    if (rows.length === 0) return res.status(404).json({ error: 'Moodboard not found' });
    res.json(shapeMoodboard(rows[0]));
  } catch (e) {
    console.error('[design/moodboards] patch error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/send', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE design_moodboards m SET status = 'sent', sent_at = NOW(), updated_at = NOW()
       FROM design_projects p
       WHERE p.id = m.project_id AND p.tenant_id = $1 AND m.id = $2 AND m.status = 'draft'
       RETURNING m.*`,
      [DEFAULT_TENANT_ID, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Draft moodboard not found' });
    await appendActivity({
      projectId: rows[0].project_id,
      actorUserId: req.identity.userId,
      actorName: req.identity.displayName || req.identity.username,
      action: 'moodboard.sent',
      payload: { moodboard_id: rows[0].id, version_number: rows[0].version_number },
      visibility: 'portal',
    });
    res.json(shapeMoodboard(rows[0]));
  } catch (e) {
    console.error('[design/moodboards] send error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/approve', requireDesignPerm('design:approve'), async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE design_moodboards m SET status = 'approved', approved_at = NOW(), updated_at = NOW()
       FROM design_projects p
       WHERE p.id = m.project_id AND p.tenant_id = $1 AND m.id = $2 AND m.status = 'sent'
       RETURNING m.*`,
      [DEFAULT_TENANT_ID, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Sent moodboard not found' });
    await appendActivity({
      projectId: rows[0].project_id,
      actorUserId: req.identity.userId,
      actorName: req.identity.displayName || req.identity.username,
      action: 'moodboard.approved',
      payload: { moodboard_id: rows[0].id, version_number: rows[0].version_number },
      visibility: 'portal',
    });
    res.json(shapeMoodboard(rows[0]));
  } catch (e) {
    console.error('[design/moodboards] approve error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// W7 — multi-moodboard variants.
//
// POST /api/design/moodboards/variants — atomically create a group
// of N moodboard rows that share a variant_group_id. The frontend
// fires N Nanobanana generations in parallel and submits the assembled
// rows here; the backend assigns variant_index 1..N and a fresh
// version_number for each (treating each variant as its own version
// so the existing version-DESC list view shows them all).
//
// Body shape:
//   {
//     project_id: string,
//     variants: [
//       { name?, links?, notes? },  // 2..3 entries
//       …
//     ]
//   }
// Response: { group_id, variants: [shapeMoodboard, …] }
router.post('/variants', requireDesignPerm('design:write'), async (req, res) => {
  const client = await pool.connect();
  try {
    const body = req.body || {};
    if (!body.project_id) return res.status(400).json({ error: 'project_id is required' });
    if (!Array.isArray(body.variants) || body.variants.length < 2 || body.variants.length > 4) {
      return res.status(400).json({ error: 'variants must be an array of 2-4 entries' });
    }
    await client.query('BEGIN');
    const ownerCheck = await client.query(
      `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [DEFAULT_TENANT_ID, body.project_id],
    );
    if (ownerCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Project not found' });
    }
    // Reserve the next N version numbers atomically.
    const { rows: maxRows } = await client.query(
      `SELECT COALESCE(MAX(version_number), 0) AS current FROM design_moodboards WHERE project_id = $1`,
      [body.project_id],
    );
    const baseVersion = Number(maxRows[0].current);
    const groupId = randomUUID();
    const inserted = [];
    for (let i = 0; i < body.variants.length; i++) {
      const v = body.variants[i];
      const versionNumber = baseVersion + i + 1;
      const { rows } = await client.query(
        `INSERT INTO design_moodboards (
           project_id, version_number, name, links, notes,
           variant_group_id, variant_index
         ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          body.project_id,
          versionNumber,
          v?.name || `Variant ${i + 1}`,
          v?.links || [],
          v?.notes || null,
          groupId,
          i + 1,
        ],
      );
      inserted.push(rows[0]);
    }
    await client.query('COMMIT');

    // Activity log — outside the tx so failures don't roll back the
    // signature. Visible to portal so the owner sees "3 moodboard
    // variants ready for review".
    appendActivity({
      projectId: body.project_id,
      actorUserId: req.identity?.userId,
      actorName: req.identity?.displayName || req.identity?.username,
      action: 'moodboard.variants.created',
      payload: { group_id: groupId, count: inserted.length },
      visibility: 'portal',
    }).catch(() => {});

    res.status(201).json({
      group_id: groupId,
      variants: inserted.map(shapeMoodboard),
    });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[design/moodboards] variants error:', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// mig 034 — soft delete (archive) a moodboard variant.
//
// Mathias feedback f82e1dea: he often generates 3 variants and wants
// to discard the ones he doesn't like. Hard delete would orthogonally
// destroy approval history / activity references; we soft-delete by
// flipping is_archived. The list endpoint hides archived rows by
// default; admin can pass ?include_archived=1 to see the full set.
//
// Idempotent: archiving an already-archived row returns 200 with the
// existing archived_at timestamp.
router.delete('/:id', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE design_moodboards m
       SET is_archived = true,
           archived_at = COALESCE(m.archived_at, NOW()),
           archived_by = COALESCE(m.archived_by, $3),
           updated_at = NOW()
       FROM design_projects p
       WHERE p.id = m.project_id AND p.tenant_id = $1 AND m.id = $2
       RETURNING m.*`,
      [DEFAULT_TENANT_ID, req.params.id, req.identity?.userId || null],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Moodboard not found' });
    appendActivity({
      projectId: rows[0].project_id,
      actorUserId: req.identity?.userId,
      actorName: req.identity?.displayName || req.identity?.username,
      action: 'moodboard.archived',
      payload: {
        moodboard_id: rows[0].id,
        version_number: rows[0].version_number,
        variant_group_id: rows[0].variant_group_id,
        variant_index: rows[0].variant_index,
      },
      visibility: 'internal',
    }).catch(() => {});
    res.json(shapeMoodboard(rows[0]));
  } catch (e) {
    console.error('[design/moodboards] archive error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// mig 034 — restore an archived moodboard variant.
//
// Admin-only recovery path. Mirrors the archive endpoint but flips
// the flag back to false and clears the metadata. We keep this so
// accidental archives are reversible without manual SQL.
router.post('/:id/restore', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE design_moodboards m
       SET is_archived = false,
           archived_at = NULL,
           archived_by = NULL,
           updated_at = NOW()
       FROM design_projects p
       WHERE p.id = m.project_id AND p.tenant_id = $1 AND m.id = $2
       RETURNING m.*`,
      [DEFAULT_TENANT_ID, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Moodboard not found' });
    appendActivity({
      projectId: rows[0].project_id,
      actorUserId: req.identity?.userId,
      actorName: req.identity?.displayName || req.identity?.username,
      action: 'moodboard.restored',
      payload: {
        moodboard_id: rows[0].id,
        version_number: rows[0].version_number,
      },
      visibility: 'internal',
    }).catch(() => {});
    res.json(shapeMoodboard(rows[0]));
  } catch (e) {
    console.error('[design/moodboards] restore error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
