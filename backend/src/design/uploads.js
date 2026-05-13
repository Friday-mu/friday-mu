'use strict';

// Generic file uploads for the design module — replaces the "paste a
// URL" pattern across DocRequest, Preferences inspiration, Moodboard
// inspiration, Selection product images, Design Pack PDF versions,
// and Site Visit walkthrough videos.
//
// One endpoint, three kinds (image / document / video), each with its
// own mime allowlist + size cap. Files land at
// /var/www/fad-uploads/files/<project_id>/<kind>/<uuid>.<ext> and are
// served back via the existing nginx alias (/uploads/ → /var/www/fad-uploads/).
//
// The endpoint returns { url, size, mime, original_name } — the frontend
// caller is responsible for persisting the URL onto whatever record
// owns it (doc-request row, preferences inspirationLinks array, etc.).
// That keeps this module concern-free: no FK to specific tables, no
// schema coupling. Future: presigned-URL handoff to Cloudinary / S3
// without changing the frontend response shape.

const express = require('express');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const multer = require('multer');
const { requireDesignPerm } = require('./auth');

const router = express.Router();

const UPLOAD_ROOT = process.env.FAD_GENERIC_UPLOAD_DIR
  || path.join(__dirname, '../../uploads/files');
const UPLOAD_PUBLIC_PREFIX = process.env.FAD_GENERIC_UPLOAD_PUBLIC_PREFIX
  || '/uploads/files';

const KIND_CONFIG = {
  image: {
    mimes: new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif']),
    maxBytes: 10 * 1024 * 1024, // 10 MB
  },
  document: {
    mimes: new Set([
      'application/pdf',
      'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    ]),
    maxBytes: 20 * 1024 * 1024, // 20 MB
  },
  video: {
    mimes: new Set(['video/mp4', 'video/quicktime', 'video/webm']),
    maxBytes: 50 * 1024 * 1024, // 50 MB — small cap for v1; large videos
                                //         should still go to Drive as a URL.
  },
};

try { fs.mkdirSync(UPLOAD_ROOT, { recursive: true }); } catch (e) {
  console.warn('[design/uploads] could not pre-create upload dir:', e.message);
}

function makeUploader(kind) {
  const cfg = KIND_CONFIG[kind];
  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        const projectId = req.params.project_id || 'unscoped';
        const dest = path.join(UPLOAD_ROOT, projectId, kind);
        fs.mkdirSync(dest, { recursive: true });
        cb(null, dest);
      },
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase().slice(0, 10) || '.bin';
        cb(null, `${randomUUID()}${ext}`);
      },
    }),
    limits: { fileSize: cfg.maxBytes },
    fileFilter: (req, file, cb) => {
      if (!cfg.mimes.has(file.mimetype)) {
        cb(new Error(`Unsupported file type for ${kind}: ${file.mimetype}`));
        return;
      }
      cb(null, true);
    },
  }).single('file');
}

router.post('/:project_id/:kind', requireDesignPerm('design:write'), (req, res) => {
  const kind = req.params.kind;
  const cfg = KIND_CONFIG[kind];
  if (!cfg) {
    return res.status(400).json({ error: 'kind must be one of: image, document, video' });
  }
  const uploader = makeUploader(kind);
  uploader(req, res, (err) => {
    if (err) {
      const status = /File too large/i.test(err.message) ? 413 : 400;
      return res.status(status).json({ error: err.message });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const projectId = req.params.project_id;
    const filename = path.basename(req.file.path);
    const publicUrl = `${UPLOAD_PUBLIC_PREFIX}/${projectId}/${kind}/${filename}`;
    res.json({
      url: publicUrl,
      size: req.file.size,
      mime: req.file.mimetype,
      original_name: req.file.originalname,
      kind,
    });
  });
});

module.exports = router;
