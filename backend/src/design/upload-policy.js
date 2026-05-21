'use strict';

// Upload allowlist + per-family size caps. Single source of truth for
// uploads.js (generic /uploads/:project_id/:kind) and photos.js
// (legacy /photos/upload/:project_id). Frontend reads the policy via
// GET /api/design/uploads/policy if it needs to show caps in UI.
//
// Decision context: docs/scoping/uploads-and-ai-context.md (NOT
// parked) — widen the allowlist significantly and add per-family
// size caps. Current narrow allowlist (jpeg/png/webp/heic, 10MB)
// rejects HEIC from iPhones intermittently and most office docs
// outright, which forces staff to round-trip via Drive.
//
// Caps come straight from the scoping doc:
//   images: 50 MB, documents: 25 MB, design files: 500 MB, video: 50 MB.
//
// SVG is deliberately NOT in the image allowlist. Browsers run JS in
// served SVGs; until we either strip <script>/on* server-side or
// serve them with Content-Disposition: attachment, SVG stays gated.
// Flag this when SVG support becomes a real ask.

// MIME allowlists. Lookups are exact-match against the request's
// reported mimetype. Browsers / OSes are inconsistent for some
// formats (raw camera, Sketch/Fig/XD) — those fall through to the
// extension check below.
const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
  'image/avif',
  'image/tiff',
  'image/bmp',
  // Raw camera formats — MIME varies by browser/OS. We accept the
  // commonly-reported ones and use the extension check as a backup.
  'image/x-canon-cr2',
  'image/x-canon-cr3',
  'image/x-nikon-nef',
  'image/x-sony-arw',
  'image/x-adobe-dng',
  'image/x-dng',
]);

const DOCUMENT_MIMES = new Set([
  'application/pdf',
  // Office (modern)
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  // Office (legacy)
  'application/msword', // doc
  'application/vnd.ms-powerpoint', // ppt
  'application/vnd.ms-excel', // xls
  // OpenDocument
  'application/vnd.oasis.opendocument.text', // odt
  'application/vnd.oasis.opendocument.spreadsheet', // ods
  'application/vnd.oasis.opendocument.presentation', // odp
  // Text
  'application/rtf',
  'text/rtf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/tab-separated-values',
  // Archives
  'application/zip',
  'application/x-zip-compressed',
  // Allow image-kinds inside the document endpoint too — site visits
  // mix PDFs and inline photos in the same upload field.
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
]);

const VIDEO_MIMES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);

// Design files: MIMEs are unreliable (Sketch, Fig, XD often arrive as
// application/octet-stream). We accept by extension here and let
// multer enforce the size cap.
const DESIGN_FILE_EXTS = new Set([
  '.psd',  // Photoshop
  '.ai',   // Illustrator
  '.indd', // InDesign
  '.sketch',
  '.fig',
  '.xd',
]);

// Best-effort MIME hints for the design_file kind. Extension wins;
// these just unblock the fileFilter when the browser reports them.
const DESIGN_FILE_MIME_HINTS = new Set([
  'application/octet-stream',
  'image/vnd.adobe.photoshop',
  'application/photoshop',
  'application/postscript',
  'application/illustrator',
  'application/x-indesign',
]);

// Raw camera formats — extension-based fallback for the image kind
// when the browser reports application/octet-stream.
const RAW_CAMERA_EXTS = new Set([
  '.cr2', '.cr3', '.nef', '.arw', '.dng', '.raf', '.orf', '.rw2',
]);

// Per-kind config consumed by multer.
const KIND_CONFIG = {
  image: {
    mimes: IMAGE_MIMES,
    extFallback: RAW_CAMERA_EXTS,
    maxBytes: 50 * 1024 * 1024, // 50 MB
  },
  document: {
    mimes: DOCUMENT_MIMES,
    extFallback: null,
    maxBytes: 25 * 1024 * 1024, // 25 MB
  },
  video: {
    mimes: VIDEO_MIMES,
    extFallback: null,
    maxBytes: 50 * 1024 * 1024, // 50 MB
  },
  design_file: {
    mimes: DESIGN_FILE_MIME_HINTS,
    extFallback: DESIGN_FILE_EXTS,
    maxBytes: 500 * 1024 * 1024, // 500 MB — these files really are huge
  },
};

// Convenience for photos.js — its existing endpoint is image-only.
const IMAGE_CONFIG = KIND_CONFIG.image;

// Decide whether to accept a multer-parsed file for the given kind.
// Returns true / false; the caller wraps the error message.
function isAcceptable(kind, file) {
  const cfg = KIND_CONFIG[kind];
  if (!cfg) return false;
  if (cfg.mimes.has(file.mimetype)) return true;
  if (!cfg.extFallback) return false;
  const ext = (file.originalname || '').toLowerCase().match(/\.[a-z0-9]+$/);
  if (!ext) return false;
  return cfg.extFallback.has(ext[0]);
}

// Render the public-facing policy. Excludes mime sets (verbose, mostly
// internal) — frontends use the caps + family hint for UX text.
function publicPolicy() {
  return {
    families: {
      image:       { max_bytes: KIND_CONFIG.image.maxBytes,       max_mb: 50,  hint: 'JPG, PNG, HEIC, WEBP, AVIF, TIFF, BMP, GIF, raw camera (CR2/NEF/ARW/DNG)' },
      document:    { max_bytes: KIND_CONFIG.document.maxBytes,    max_mb: 25,  hint: 'PDF, DOCX, PPTX, XLSX, ODT/ODS/ODP, RTF, TXT, MD, CSV, ZIP' },
      video:       { max_bytes: KIND_CONFIG.video.maxBytes,       max_mb: 50,  hint: 'MP4, MOV, WEBM' },
      design_file: { max_bytes: KIND_CONFIG.design_file.maxBytes, max_mb: 500, hint: 'PSD, AI, INDD, SKETCH, FIG, XD' },
    },
    notes: [
      'SVG is not currently accepted — pending server-side sanitisation.',
      'Files above the cap are rejected with HTTP 413.',
      'Unknown MIMEs are rejected with HTTP 400 — for design files the extension is checked as a fallback.',
    ],
  };
}

module.exports = {
  KIND_CONFIG,
  IMAGE_CONFIG,
  IMAGE_MIMES,
  DOCUMENT_MIMES,
  VIDEO_MIMES,
  DESIGN_FILE_EXTS,
  RAW_CAMERA_EXTS,
  isAcceptable,
  publicPolicy,
};
