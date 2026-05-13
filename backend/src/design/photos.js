'use strict';

// Photos — URL refs, kind-classified. Two ingest paths:
//   1. POST /                  — JSON body with a pre-existing URL (Drive,
//                                 Imgur, etc.). The v0.1 staff workflow.
//   2. POST /upload            — multipart/form-data direct file upload.
//                                 v0.2 pipeline: backend writes the file to
//                                 a local directory served by nginx and
//                                 inserts the row with the public URL.
//
// Storage:
//   • dev:  ./uploads/photos/<project_id>/<uuid>.<ext>
//   • prod: /var/www/fad-uploads/photos/<project_id>/<uuid>.<ext>
//   served at /uploads/photos/... via nginx alias.
//
// Upgrade path to Cloudinary / S3 presigned uploads when scale requires:
//   replace the multer storage strategy with a signed-URL handoff —
//   no frontend changes needed if the response still returns a public URL.

const express = require('express');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const multer = require('multer');
const { query } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { DEFAULT_TENANT_ID, shapePhoto } = require('./adapters');

const router = express.Router();

const UPLOAD_DIR = process.env.FAD_UPLOAD_DIR || path.join(__dirname, '../../uploads/photos');
const UPLOAD_PUBLIC_PREFIX = process.env.FAD_UPLOAD_PUBLIC_PREFIX || '/uploads/photos';
const MAX_FILE_SIZE = parseInt(process.env.FAD_PHOTO_MAX_BYTES || '10485760', 10); // 10MB
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);

// Ensure the upload root exists at boot. Per-project subdirs are
// created on demand by multer.
try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (e) {
  console.warn('[design/photos] could not pre-create upload dir:', e.message);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const projectId = req.params.project_id || req.body?.project_id || 'unscoped';
    const dest = path.join(UPLOAD_DIR, projectId);
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 8) || '.bin';
    cb(null, `${randomUUID()}${ext}`);
  },
});
const uploader = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error(`Unsupported mime type: ${file.mimetype}. Use jpeg/png/webp/heic.`));
      return;
    }
    cb(null, true);
  },
});

const WRITABLE_FIELDS = ['kind', 'caption', 'url', 'room_id'];

router.get('/', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const projectId = req.query.project_id;
    if (typeof projectId !== 'string') {
      return res.status(400).json({ error: 'project_id query param is required' });
    }
    const ownerCheck = await query(
      `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [DEFAULT_TENANT_ID, projectId],
    );
    if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    const filters = ['project_id = $1'];
    const params = [projectId];
    let idx = 2;
    if (typeof req.query.kind === 'string') {
      filters.push(`kind = $${idx++}`);
      params.push(req.query.kind);
    }
    if (typeof req.query.room_id === 'string') {
      filters.push(`room_id = $${idx++}`);
      params.push(req.query.room_id);
    }
    const sql = `SELECT * FROM design_photos WHERE ${filters.join(' AND ')} ORDER BY uploaded_at DESC`;
    const { rows } = await query(sql, params);
    res.json({ results: rows.map(shapePhoto) });
  } catch (e) {
    console.error('[design/photos] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.project_id) return res.status(400).json({ error: 'project_id is required' });
    if (!body.kind) return res.status(400).json({ error: 'kind is required' });
    if (!body.url) return res.status(400).json({ error: 'url is required' });
    const ownerCheck = await query(
      `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [DEFAULT_TENANT_ID, body.project_id],
    );
    if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    const { rows } = await query(
      `INSERT INTO design_photos (project_id, room_id, kind, caption, url)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [body.project_id, body.room_id || null, body.kind, body.caption || null, body.url],
    );
    res.status(201).json(shapePhoto(rows[0]));
  } catch (e) {
    console.error('[design/photos] create error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const body = req.body || {};
    const sets = [];
    const params = [DEFAULT_TENANT_ID, req.params.id];
    let idx = 3;
    for (const field of WRITABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        sets.push(`${field} = $${idx++}`);
        params.push(body[field] === '' ? null : body[field]);
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No allowed fields to update' });
    const sql = `UPDATE design_photos ph SET ${sets.join(', ')}
                 FROM design_projects p
                 WHERE p.id = ph.project_id AND p.tenant_id = $1 AND ph.id = $2
                 RETURNING ph.*`;
    const { rows } = await query(sql, params);
    if (rows.length === 0) return res.status(404).json({ error: 'Photo not found' });
    res.json(shapePhoto(rows[0]));
  } catch (e) {
    console.error('[design/photos] patch error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const { rows } = await query(
      `DELETE FROM design_photos ph USING design_projects p
       WHERE p.id = ph.project_id AND p.tenant_id = $1 AND ph.id = $2
       RETURNING ph.id`,
      [DEFAULT_TENANT_ID, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Photo not found' });
    res.status(204).end();
  } catch (e) {
    console.error('[design/photos] delete error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/design/photos/upload — direct file upload via multipart.
// Form fields:
//   file        — required, image/jpeg|png|webp|heic, ≤ 10MB
//   project_id  — required
//   room_id     — optional
//   kind        — required (matches the design_photos kind enum)
//   caption     — optional
// Returns the inserted photo row.
router.post('/upload', requireDesignPerm('design:write'), uploader.single('file'), async (req, res) => {
  try {
    const body = req.body || {};
    if (!req.file) return res.status(400).json({ error: 'file is required (multipart field "file")' });
    if (!body.project_id) {
      try { fs.unlinkSync(req.file.path); } catch { /* swallow */ }
      return res.status(400).json({ error: 'project_id is required' });
    }
    if (!body.kind) {
      try { fs.unlinkSync(req.file.path); } catch { /* swallow */ }
      return res.status(400).json({ error: 'kind is required' });
    }
    const ownerCheck = await query(
      `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [DEFAULT_TENANT_ID, body.project_id],
    );
    if (ownerCheck.rows.length === 0) {
      try { fs.unlinkSync(req.file.path); } catch { /* swallow */ }
      return res.status(404).json({ error: 'Project not found' });
    }

    // Build the public URL. The filename is already a UUID so we can
    // safely concat without sanitising.
    const url = `${UPLOAD_PUBLIC_PREFIX}/${body.project_id}/${req.file.filename}`;
    const { rows } = await query(
      `INSERT INTO design_photos (project_id, room_id, kind, caption, url)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [body.project_id, body.room_id || null, body.kind, body.caption || null, url],
    );
    res.status(201).json(shapePhoto(rows[0]));
  } catch (e) {
    // Multer errors come through as Error instances; surface size /
    // mime failures as 400, not 500.
    if (e instanceof multer.MulterError) {
      return res.status(400).json({ error: e.message });
    }
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch { /* swallow */ }
    }
    console.error('[design/photos] upload error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
