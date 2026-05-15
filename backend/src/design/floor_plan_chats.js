'use strict';

// Chat turns for the Conversational Floor-Plan Editor (W3). Each
// turn:
//   1. user types instruction
//   2. we load the latest plan version for the project
//   3. Kimi translates instruction → FloorPlanOperation[]
//   4. applyOps() runs the operations against the model
//   5. on success → insert a new floor_plans row with the new model
//   6. update the chat row: status, friday_reply, ops, resulting_version_id
//
// Failure modes:
//   - Kimi unclear or empty ops      → status='rejected', no new version
//   - applyOps validation throws     → status='rejected', no new version
//   - unexpected exception           → status='failed' (chat row still lands)
//
// We render lazily (GET /floor-plans/:id/render). This endpoint
// returns as soon as the chat row + new plan version are persisted,
// so the user gets near-instant feedback.

const express = require('express');
const { query, pool } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { shapeFloorPlanChat, shapeFloorPlanVersion } = require('./adapters');
const { appendActivity } = require('./activities');
const { applyOps } = require('./floor_plan_ops');
// Migrated 2026-05-16: Kimi → Gemini for op translation. Same exported
// signature (translateToOps(model, userMessage[, opts])) so this call
// site doesn't need to change.
const { translateToOps } = require('./floor_plan_ai');

const router = express.Router();

// ── GET / (chat history for a project, ASC by created_at) ──────────

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
      `SELECT * FROM design_floor_plan_chats WHERE project_id = $1 ORDER BY created_at ASC`,
      [projectId],
    );
    res.json({ results: rows.map(shapeFloorPlanChat) });
  } catch (e) {
    console.error('[design/floor_plan_chats] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST / (process a user instruction) ───────────────────────────

router.post('/', requireDesignPerm('design:write'), async (req, res) => {
  const body = req.body || {};
  const projectId = body.project_id;
  const userMessage = typeof body.user_message === 'string' ? body.user_message.trim() : '';
  if (!projectId) return res.status(400).json({ error: 'project_id is required' });
  if (!userMessage) return res.status(400).json({ error: 'user_message is required' });

  // Chat row id needs to outlive the try block — we fall through to
  // status='failed' if anything blows up after the row lands.
  let chatRowId = null;

  try {
    // Tenant + project check first; no chat row for missing projects.
    const ownerCheck = await query(
      `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [req.tenantId, projectId],
    );
    if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Project not found' });

    // Load the latest floor plan version.
    const { rows: planRows } = await query(
      `SELECT * FROM design_floor_plans WHERE project_id = $1 ORDER BY version DESC LIMIT 1`,
      [projectId],
    );
    if (planRows.length === 0) {
      return res.status(400).json({ error: 'No floor plan exists for this project. Create v1 first via POST /floor-plans.' });
    }
    const latest = planRows[0];

    // Insert the chat row as 'pending'. If the rest of the pipeline
    // crashes we'll still have a record of the user's message.
    const { rows: chatRows } = await query(
      `INSERT INTO design_floor_plan_chats (project_id, user_message, status, operations)
       VALUES ($1, $2, 'pending', '[]'::jsonb) RETURNING *`,
      [projectId, userMessage],
    );
    chatRowId = chatRows[0].id;

    // Gemini pass. room_kind is optional — when the frontend sends it
    // we ship only the relevant slice of the KB; otherwise we ship the
    // whole thing (still well within Gemini's context budget).
    const roomKind = typeof body.room_kind === 'string' && body.room_kind.trim()
      ? body.room_kind.trim()
      : null;
    const { ops, reply } = await translateToOps(latest.model, userMessage, { roomKind });

    if (!Array.isArray(ops) || ops.length === 0) {
      const { rows: rejected } = await query(
        `UPDATE design_floor_plan_chats
         SET status = 'rejected', friday_reply = $1, operations = $2::jsonb
         WHERE id = $3 RETURNING *`,
        [reply, JSON.stringify(ops || []), chatRowId],
      );
      return res.json({ chat: shapeFloorPlanChat(rejected[0]), version: null });
    }

    // Apply ops. Any validation failure → rejected.
    let nextModel;
    try {
      const result = applyOps(latest.model, ops);
      nextModel = result.model;
    } catch (applyErr) {
      const { rows: rejected } = await query(
        `UPDATE design_floor_plan_chats
         SET status = 'rejected',
             friday_reply = $1,
             operations = $2::jsonb
         WHERE id = $3 RETURNING *`,
        [`I tried but the change wasn't valid: ${applyErr.message}`, JSON.stringify(ops), chatRowId],
      );
      return res.json({ chat: shapeFloorPlanChat(rejected[0]), version: null });
    }

    // Persist new floor plan version + update chat row in a single tx.
    const client = await pool.connect();
    let newVersionRow;
    let appliedChatRow;
    try {
      await client.query('BEGIN');
      const { rows: maxRows } = await client.query(
        `SELECT COALESCE(MAX(version), 0) + 1 AS next FROM design_floor_plans WHERE project_id = $1`,
        [projectId],
      );
      const nextVersion = Number(maxRows[0].next);
      const label = userMessage.slice(0, 80);
      const { rows: vRows } = await client.query(
        `INSERT INTO design_floor_plans (project_id, version, source_image_url, model, label)
         VALUES ($1, $2, $3, $4::jsonb, $5) RETURNING *`,
        [projectId, nextVersion, latest.source_image_url || null, JSON.stringify(nextModel), label],
      );
      newVersionRow = vRows[0];
      const { rows: cRows } = await client.query(
        `UPDATE design_floor_plan_chats
         SET status = 'applied',
             resulting_version_id = $1,
             friday_reply = $2,
             operations = $3::jsonb
         WHERE id = $4 RETURNING *`,
        [newVersionRow.id, reply, JSON.stringify(ops), chatRowId],
      );
      appliedChatRow = cRows[0];
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }

    appendActivity({
      projectId,
      actorUserId: req.identity?.userId,
      actorName: req.identity?.displayName || req.identity?.username,
      action: 'floor_plan_chat.applied',
      payload: {
        chat_id: appliedChatRow.id,
        floor_plan_id: newVersionRow.id,
        version: newVersionRow.version,
        op_count: ops.length,
      },
      visibility: 'internal',
    }).catch(() => {});

    return res.status(201).json({
      chat: shapeFloorPlanChat(appliedChatRow),
      version: shapeFloorPlanVersion(newVersionRow),
    });
  } catch (e) {
    console.error('[design/floor_plan_chats] pipeline error:', e.message);
    // If we already created a chat row, mark it as 'failed' so the
    // UI can show "something went wrong" rather than an orphan pending.
    if (chatRowId) {
      try {
        const { rows: failed } = await query(
          `UPDATE design_floor_plan_chats
           SET status = 'failed', friday_reply = $1
           WHERE id = $2 RETURNING *`,
          [`Something went wrong: ${e.message}`, chatRowId],
        );
        return res.status(500).json({
          chat: failed.length > 0 ? shapeFloorPlanChat(failed[0]) : null,
          version: null,
          error: e.message,
        });
      } catch (updErr) {
        console.error('[design/floor_plan_chats] fallback update failed:', updErr.message);
      }
    }
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
