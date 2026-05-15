'use strict';

// Project documents — drawings, contracts, quotes, signed annexes.
// Stored as URL refs; the actual blob storage is external (S3 / Box /
// other) and out of scope for v0.1. Upload UI passes through the URL.

const express = require('express');
const { query } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { shapeDocument } = require('./adapters');

const router = express.Router();

const WRITABLE_FIELDS = ['doc_type', 'name', 'url', 'version', 'signed_by', 'signed_at'];

// GET /api/design/documents?project_id=...
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
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const docType = typeof req.query.doc_type === 'string' ? req.query.doc_type : null;
    const sql = docType
      ? `SELECT * FROM design_documents WHERE project_id = $1 AND doc_type = $2 ORDER BY created_at DESC`
      : `SELECT * FROM design_documents WHERE project_id = $1 ORDER BY created_at DESC`;
    const params = docType ? [projectId, docType] : [projectId];
    const { rows } = await query(sql, params);
    res.json({ results: rows.map(shapeDocument) });
  } catch (e) {
    console.error('[design/documents] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT d.* FROM design_documents d
       JOIN design_projects p ON p.id = d.project_id
       WHERE p.tenant_id = $1 AND d.id = $2`,
      [req.tenantId, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Document not found' });
    res.json(shapeDocument(rows[0]));
  } catch (e) {
    console.error('[design/documents] detail error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.project_id) return res.status(400).json({ error: 'project_id is required' });
    if (!body.doc_type) return res.status(400).json({ error: 'doc_type is required' });
    if (!body.name) return res.status(400).json({ error: 'name is required' });
    const ownerCheck = await query(
      `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [req.tenantId, body.project_id],
    );
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const { rows } = await query(
      `INSERT INTO design_documents (project_id, doc_type, name, url, version, signed_by, signed_at, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        body.project_id, body.doc_type, body.name, body.url || null,
        body.version || 1, body.signed_by || null, body.signed_at || null,
        req.identity.userId || null,
      ],
    );
    res.status(201).json(shapeDocument(rows[0]));
  } catch (e) {
    console.error('[design/documents] create error:', e.message);
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
    const sql = `UPDATE design_documents d SET ${sets.join(', ')}
                 FROM design_projects p
                 WHERE p.id = d.project_id AND p.tenant_id = $1 AND d.id = $2
                 RETURNING d.*`;
    const { rows } = await query(sql, params);
    if (rows.length === 0) return res.status(404).json({ error: 'Document not found' });
    res.json(shapeDocument(rows[0]));
  } catch (e) {
    console.error('[design/documents] patch error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const { rows } = await query(
      `DELETE FROM design_documents d USING design_projects p
       WHERE p.id = d.project_id AND p.tenant_id = $1 AND d.id = $2
       RETURNING d.id`,
      [req.tenantId, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Document not found' });
    res.status(204).end();
  } catch (e) {
    console.error('[design/documents] delete error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
