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
const { shapePhoto } = require('./adapters');
const { isAcceptable, KIND_CONFIG } = require('./upload-policy');

const router = express.Router();

const UPLOAD_DIR = process.env.FAD_UPLOAD_DIR || path.join(__dirname, '../../uploads/photos');
const UPLOAD_PUBLIC_PREFIX = process.env.FAD_UPLOAD_PUBLIC_PREFIX || '/uploads/photos';
// Allow env override to tighten the cap below the shared policy. The
// shared image policy (mig 034 sister change) is 50 MB; keeping the
// env override lets ops dial it down without a code change if needed.
const MAX_FILE_SIZE = parseInt(process.env.FAD_PHOTO_MAX_BYTES || String(KIND_CONFIG.image.maxBytes), 10);

// Ensure the upload root exists at boot. Per-project subdirs are
// created on demand by multer.
try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (e) {
  console.warn('[design/photos] could not pre-create upload dir:', e.message);
}

// Note on multer ordering: req.body is NOT populated by the time
// destination() runs (multer processes the file stream first, then
// the remaining fields). So we read project_id from req.params, which
// IS available — hence the route shape POST /upload/:project_id.
//
// Multitenant v0 (2026-05-16): new uploads land under
// <UPLOAD_DIR>/<tenant_id>/<project_id>/<uuid>.<ext>. Existing files
// at <UPLOAD_DIR>/<project_id>/<uuid>.<ext> stay reachable — the
// nginx alias serves both shapes since it just exposes the whole
// directory tree. No migration needed for legacy files; their URLs
// in the DB remain valid as-is.
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const projectId = req.params.project_id || 'unscoped';
    // req.tenantId is set by requireDesignPerm (runs before this
    // multer middleware), so it's reliably present here.
    const tenantId = req.tenantId || 'unknown-tenant';
    const dest = path.join(UPLOAD_DIR, tenantId, projectId);
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
    // Photos endpoint accepts the full image family from the shared
    // policy — that's JPG, PNG, HEIC, HEIF, WEBP, AVIF, GIF, TIFF,
    // BMP and raw camera formats. Previously this was a narrow
    // jpeg/png/webp/heic set, which rejected HEIF from newer iPhones.
    if (!isAcceptable('image', file)) {
      cb(new Error(`Unsupported image type: ${file.mimetype} (${file.originalname || 'no filename'})`));
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
      [req.tenantId, projectId],
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
      [req.tenantId, body.project_id],
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
    const params = [req.tenantId, req.params.id];
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
      [req.tenantId, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Photo not found' });
    res.status(204).end();
  } catch (e) {
    console.error('[design/photos] delete error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/design/photos/upload/:project_id — direct file upload via
// multipart. project_id MUST be in the URL (not body) so multer's
// destination function can resolve the target subdir before parsing
// the rest of the form.
// Form fields:
//   file        — required, image/jpeg|png|webp|heic, ≤ 10MB
//   kind        — required (matches the design_photos kind enum)
//   room_id     — optional
//   caption     — optional
// Returns the inserted photo row.
router.post('/upload/:project_id', requireDesignPerm('design:write'), uploader.single('file'), async (req, res) => {
  try {
    const body = req.body || {};
    const projectId = req.params.project_id;
    if (!req.file) return res.status(400).json({ error: 'file is required (multipart field "file")' });
    if (!body.kind) {
      try { fs.unlinkSync(req.file.path); } catch { /* swallow */ }
      return res.status(400).json({ error: 'kind is required' });
    }
    const ownerCheck = await query(
      `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [req.tenantId, projectId],
    );
    if (ownerCheck.rows.length === 0) {
      try { fs.unlinkSync(req.file.path); } catch { /* swallow */ }
      return res.status(404).json({ error: 'Project not found' });
    }

    // Build the public URL. The filename is already a UUID so we can
    // safely concat without sanitising. Includes the tenant prefix so
    // the on-disk layout (tenant/project/file) round-trips through
    // the URL. Legacy URLs without the tenant segment continue to
    // serve from disk too — nginx is path-agnostic.
    const url = `${UPLOAD_PUBLIC_PREFIX}/${req.tenantId}/${projectId}/${req.file.filename}`;
    const { rows } = await query(
      `INSERT INTO design_photos (project_id, room_id, kind, caption, url)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [projectId, body.room_id || null, body.kind, body.caption || null, url],
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
