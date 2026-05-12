'use strict';

// AI image generation — Nanobanana (Imagen 3) wrapper.
//
// Inserts generated images into the sha256-keyed `design_assets` table
// with source='nanobanana'. Moodboards / packs reference these via the
// `image_ids` JSONB array (sha256 strings). When the API key is unset
// (early-stage scaffolding) imagegen.js returns a stub asset, which we
// still persist so the frontend integration path is end-to-end exercised
// before the real key lands.
//
// Note: the schema (002_design_tables.sql) doesn't have a `kind` column
// on design_assets, but the route accepts `kind: 'moodboard' | 'pack'`
// and stores it as a `[kind:<kind>]` prefix on `generator_prompt`. This
// keeps the GET listing filter (?kind=…) implementable today without a
// migration; if kind ever needs to be queryable cleanly, promote it to a
// dedicated column in a follow-up.

const express = require('express');
const crypto = require('crypto');
const { query } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { DEFAULT_TENANT_ID, shapeAsset } = require('./adapters');
const { generateImage } = require('../ai/imagegen');
const { appendActivity } = require('./activities');

const router = express.Router();

const ALLOWED_KINDS = new Set(['moodboard', 'pack']);
const KIND_PREFIX_RE = /^\[kind:([a-z]+)\]\s+/;

// Nanobanana accepts PDFs inline (no per-page extraction needed) plus
// the usual raster formats. svg/heic deliberately omitted — they break
// the inlineData encoder on Google AI Studio.
const ALLOWED_SITE_PLAN_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']);

// ~5MB raw cap on the source image. base64 expands bytes by 4/3 so the
// pre-decode ceiling is ~6.67MB of b64 text — we recompute the raw size
// (floor(b64.length * 0.75)) per the brief.
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;

// Fixed system directive prepended to the user's optional hint. Phrasing
// is locked to what reliably gets Nanobanana to produce a CAD-style
// cleanup rather than a stylised re-render. Keep this in sync with the
// frontend placeholder copy in SitePlanGenerator.tsx.
const SITE_PLAN_SYSTEM_PROMPT =
  'Clean architectural floor plan, top-down view, single-line walls in dark grey on white background, '
  + 'labelled rooms in a sans-serif font, minimal furniture symbols, north arrow in top-right corner, '
  + 'dimensions in metric, no shadows or color fills, suitable as a base layer for interior design plans. '
  + 'Match the layout of the reference image exactly — same walls, same room arrangement, same door positions.';

function encodeKindIntoPrompt(kind, prompt) {
  return `[kind:${kind}] ${prompt}`;
}

// Strip the `[kind:…]` marker from the stored prompt before handing back
// to the client. The marker is an internal detail; the API shape stays
// clean.
function shapeAiAsset(row) {
  const base = shapeAsset(row);
  if (!base) return null;
  const m = base.generator_prompt?.match(KIND_PREFIX_RE);
  if (m) {
    base.kind = m[1];
    base.generator_prompt = base.generator_prompt.slice(m[0].length);
  } else {
    base.kind = null;
  }
  return base;
}

// ────────────────── POST /generate ──────────────────

router.post('/generate', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const body = req.body || {};
    const { project_id: projectId, prompt, reference_image_url: referenceImageUrl, kind, style, size } = body;
    if (!projectId) return res.status(400).json({ error: 'project_id is required' });
    if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'prompt is required' });
    if (!kind || !ALLOWED_KINDS.has(kind)) {
      return res.status(400).json({ error: `kind must be one of ${[...ALLOWED_KINDS].join(', ')}` });
    }

    // Tenant-scoped project ownership guard — mirrors every other write
    // route in this module.
    const ownerCheck = await query(
      `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [DEFAULT_TENANT_ID, projectId],
    );
    if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Project not found' });

    let result;
    try {
      result = await generateImage({ prompt, referenceImageUrl, style, size });
    } catch (e) {
      console.error('[design/ai_images] generation error:', e.message);
      return res.status(502).json({ error: `Image generation failed: ${e.message}` });
    }

    const storedPrompt = encodeKindIntoPrompt(kind, result.generatorPrompt);

    // ON CONFLICT (sha256) DO NOTHING — identical re-generates (same
    // prompt → same bytes for deterministic models, or cache hits) dedupe
    // naturally on the PK. We then SELECT to return the canonical row.
    const insert = await query(
      `INSERT INTO design_assets
         (sha256, tenant_id, mime_type, byte_size, storage_url, source, generator_prompt, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (sha256) DO NOTHING
       RETURNING *`,
      [
        result.sha256,
        DEFAULT_TENANT_ID,
        result.mimeType || 'image/png',
        result.byteSize || null,
        result.imageUrl,
        'nanobanana',
        storedPrompt,
        req.identity.userId,
      ],
    );

    let row = insert.rows[0];
    if (!row) {
      const existing = await query(
        `SELECT * FROM design_assets WHERE sha256 = $1 AND tenant_id = $2`,
        [result.sha256, DEFAULT_TENANT_ID],
      );
      row = existing.rows[0];
    }
    if (!row) {
      return res.status(500).json({ error: 'Asset row missing after insert' });
    }

    const shaped = shapeAiAsset(row);
    // Echo the generation metadata that isn't persisted on the row —
    // useful for the frontend to surface latency / stub indicator without
    // a second round-trip.
    shaped.stub = result.stub === true;
    shaped.duration_ms = result.durationMs ?? null;
    shaped.cached = result.cached === true;
    return res.status(201).json(shaped);
  } catch (e) {
    console.error('[design/ai_images] generate error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ────────────────── POST /generate-site-plan ──────────────────
//
// Takes a messy client floor plan (PDF / sketch / photo) and asks
// Nanobanana to redraw it as a clean top-view layout we can use as the
// canvas for design packs. Unlike /generate, this route accepts an
// inline source image rather than just a prompt — Nanobanana 2.5 Flash
// Image supports multi-modal inputs.
//
// Body:
//   project_id            — required, ownership-checked
//   source_image          — required, { mimeType, base64 }
//   prompt_hint           — optional, free-text guidance appended to the
//                            system directive
//   set_as_project_plan   — optional bool. When true, also UPDATEs
//                            design_projects.site_plan_image_id with the
//                            new asset sha256 so the project pins this
//                            canonical site plan.
//
// Response: 201 with the standard asset row shape plus
//   { project_updated: boolean, original_input_sha256: string }
// — the input sha lets the frontend reference what client image this
// derives from without us persisting the raw upload.

router.post('/generate-site-plan', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const body = req.body || {};
    const { project_id: projectId, source_image: sourceImage, prompt_hint: promptHint, set_as_project_plan: setAsProjectPlan } = body;
    if (!projectId) return res.status(400).json({ error: 'project_id is required' });
    if (!sourceImage || typeof sourceImage !== 'object') {
      return res.status(400).json({ error: 'source_image is required' });
    }
    const { mimeType, base64 } = sourceImage;
    if (!base64 || typeof base64 !== 'string' || base64.length === 0) {
      return res.status(400).json({ error: 'source_image.base64 is required (non-empty)' });
    }
    if (!ALLOWED_SITE_PLAN_MIME.has(mimeType)) {
      return res.status(400).json({
        error: `source_image.mimeType must be one of ${[...ALLOWED_SITE_PLAN_MIME].join(', ')}`,
      });
    }
    // Approximate decoded size — floor(b64.length * 0.75) matches the
    // brief's spec. We avoid actually decoding into a Buffer here to dodge
    // memory pressure on oversize uploads (Buffer.from would still allocate
    // the full byte range before we could reject it).
    const rawBytes = Math.floor(base64.length * 0.75);
    if (rawBytes > MAX_SOURCE_BYTES) {
      return res.status(413).json({
        error: `source_image too large (${rawBytes} bytes, max ${MAX_SOURCE_BYTES})`,
      });
    }

    const ownerCheck = await query(
      `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [DEFAULT_TENANT_ID, projectId],
    );
    if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Project not found' });

    // Compose the prompt — system directive is locked, the optional hint
    // is appended verbatim so designers can steer (e.g. "north points
    // to the top of the page, label master bedroom as Suite Parentale").
    const hintTrimmed = typeof promptHint === 'string' ? promptHint.trim() : '';
    const prompt = hintTrimmed
      ? `${SITE_PLAN_SYSTEM_PROMPT} ${hintTrimmed}`
      : SITE_PLAN_SYSTEM_PROMPT;

    // sha256 of the raw input bytes — surfaced to the frontend so it can
    // reference "this clean plan was derived from upload XYZ" without us
    // persisting the messy original (which is the client's, not ours).
    const inputBuf = Buffer.from(base64, 'base64');
    const originalInputSha256 = crypto.createHash('sha256').update(inputBuf).digest('hex');

    let result;
    try {
      result = await generateImage({
        prompt,
        inlineImages: [{ mimeType, base64 }],
      });
    } catch (e) {
      console.error('[design/ai_images] site-plan generation error:', e.message);
      return res.status(502).json({ error: `Image generation failed: ${e.message}` });
    }

    // Tag the stored prompt as a site_plan kind so /generate listings
    // can filter it later if needed. Reuses the same [kind:…] prefix
    // marker convention as moodboard/pack, but skips ALLOWED_KINDS since
    // site_plan isn't part of the kind-filter API.
    const storedPrompt = `[kind:site_plan] ${result.generatorPrompt}`;

    const insert = await query(
      `INSERT INTO design_assets
         (sha256, tenant_id, mime_type, byte_size, storage_url, source, generator_prompt, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (sha256) DO NOTHING
       RETURNING *`,
      [
        result.sha256,
        DEFAULT_TENANT_ID,
        result.mimeType || 'image/png',
        result.byteSize || null,
        result.imageUrl,
        'nanobanana',
        storedPrompt,
        req.identity.userId,
      ],
    );

    let row = insert.rows[0];
    if (!row) {
      const existing = await query(
        `SELECT * FROM design_assets WHERE sha256 = $1 AND tenant_id = $2`,
        [result.sha256, DEFAULT_TENANT_ID],
      );
      row = existing.rows[0];
    }
    if (!row) {
      return res.status(500).json({ error: 'Asset row missing after insert' });
    }

    // Pin the asset as the project's canonical site plan when requested.
    // The migration's FK ensures the asset exists before we set the
    // pointer (it does — we just inserted it).
    let projectUpdated = false;
    if (setAsProjectPlan === true) {
      const upd = await query(
        `UPDATE design_projects
           SET site_plan_image_id = $3, updated_at = NOW()
         WHERE tenant_id = $1 AND id = $2
         RETURNING id`,
        [DEFAULT_TENANT_ID, projectId, result.sha256],
      );
      projectUpdated = upd.rows.length > 0;
    }

    // Activity row — internal only. Owners don't need to see every
    // regenerate; the cleaned plan itself surfaces once attached to a
    // pack. Best-effort: failure to log shouldn't fail the request.
    try {
      await appendActivity({
        projectId,
        actorUserId: req.identity.userId,
        actorName: req.identity.displayName || req.identity.username,
        action: 'project.site_plan.generated',
        payload: {
          asset_sha256: result.sha256,
          original_input_sha256: originalInputSha256,
          source_mime: mimeType,
          set_as_project_plan: projectUpdated,
          stub: result.stub === true,
          cached: result.cached === true,
        },
        visibility: 'internal',
      });
    } catch (e) {
      console.warn('[design/ai_images] activity log failed:', e.message);
    }

    const shaped = shapeAiAsset(row);
    shaped.stub = result.stub === true;
    shaped.duration_ms = result.durationMs ?? null;
    shaped.cached = result.cached === true;
    shaped.project_updated = projectUpdated;
    shaped.original_input_sha256 = originalInputSha256;
    return res.status(201).json(shaped);
  } catch (e) {
    console.error('[design/ai_images] generate-site-plan error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ────────────────── GET /:sha256 ──────────────────
// Used by the frontend to resolve sha256 references (stored in
// moodboards.links / packs.image_ids) into URLs and metadata.

router.get('/:sha256', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM design_assets WHERE tenant_id = $1 AND sha256 = $2`,
      [DEFAULT_TENANT_ID, req.params.sha256],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Asset not found' });
    res.json(shapeAiAsset(rows[0]));
  } catch (e) {
    console.error('[design/ai_images] get error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ────────────────── GET / ──────────────────
// Admin gallery — filter by source and/or kind. Newest first.

router.get('/', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const filters = ['tenant_id = $1'];
    const params = [DEFAULT_TENANT_ID];
    let idx = 2;
    if (typeof req.query.source === 'string') {
      filters.push(`source = $${idx++}`);
      params.push(req.query.source);
    }
    if (typeof req.query.kind === 'string') {
      if (!ALLOWED_KINDS.has(req.query.kind)) {
        return res.status(400).json({ error: `kind must be one of ${[...ALLOWED_KINDS].join(', ')}` });
      }
      filters.push(`generator_prompt LIKE $${idx++}`);
      params.push(`[kind:${req.query.kind}]%`);
    }
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const sql = `SELECT * FROM design_assets
                 WHERE ${filters.join(' AND ')}
                 ORDER BY created_at DESC
                 LIMIT ${limit}`;
    const { rows } = await query(sql, params);
    res.json({ results: rows.map(shapeAiAsset) });
  } catch (e) {
    console.error('[design/ai_images] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
