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
const axios = require('axios');
const crypto = require('crypto');
const { query } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { DEFAULT_TENANT_ID, shapeAsset } = require('./adapters');
const { generateImage } = require('../ai/imagegen');
const { buildMoodboardPrompt } = require('../ai/promptbuilder');
const { appendActivity } = require('./activities');

const router = express.Router();

const ALLOWED_KINDS = new Set(['moodboard', 'pack']);
const KIND_PREFIX_RE = /^\[kind:([a-z]+)\]\s+/;

// design-be-7: per-photo size cap when fetching reference images for
// inline-conditioning. Larger files blow the Gemini request body and
// chew quota; better to skip + fall back to text-only than to fail
// the whole generation. The brief specifies passthrough at "~5MB
// each" — we cap at exactly 5MB.
const MAX_INLINE_IMAGE_BYTES = 5 * 1024 * 1024;
const INLINE_PHOTO_KINDS = new Set(['interior', 'exterior', 'detail']);
const DEFAULT_MAX_PHOTOS = 3;
// Mapping from Kimi's suggestedAspectRatio output to the `size` hint
// imagegen accepts. 16:9 and 1:1 have direct equivalents; everything
// else uses the default 4:3.
const ASPECT_TO_SIZE = {
  '16:9': 'wide',
  '9:16': 'tall',
  '1:1': 'square',
  '3:4': 'portrait',
  '4:3': null,
};

// design-be-11 (floor plan): Nanobanana accepts PDFs inline alongside the
// usual raster formats. svg / heic deliberately omitted — they break the
// inlineData encoder on Google AI Studio.
const ALLOWED_FLOOR_PLAN_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']);

// ~5MB raw cap on the source image. base64 expands bytes by 4/3 so the
// pre-decode ceiling is ~6.67MB of b64 text — we recompute the raw size
// via floor(b64.length * 0.75) to reject before buffer allocation.
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;

// Fixed system directive prepended to the user's optional hint. Phrasing
// is locked to what reliably gets Nanobanana to produce a CAD-style
// cleanup rather than a stylised re-render. Keep in sync with the
// frontend placeholder copy in FloorPlanGenerator.tsx.
const FLOOR_PLAN_SYSTEM_PROMPT =
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

// ────────────────── POST /generate-from-project ──────────────────
//
// design-be-7-smart-prompt: gather the full design-module context for a
// project, run it through Kimi to synthesise the Nanobanana prompt
// (unless the caller supplied an override), download up to N property
// reference photos as inline image parts so Gemini can condition on the
// actual property, render, and persist as a moodboard asset.
//
// Body: { project_id, override_prompt?, include_property_photos?: bool,
//         max_photos?: number, kind: 'moodboard' | 'pack' }
// Response: shapeAiAsset(row) + { used_prompt, used_image_count,
//                                  prompt_source, prompt_style_notes,
//                                  suggested_aspect_ratio }
//
// Failure modes:
//   - project not found → 404
//   - prompt synthesis exceptions → 502 (we never throw from imagegen
//     stub path, so 502 here means the Kimi-fallback path also crashed)
//   - reference photo fetch errors → silently skipped per photo (logged);
//     the user still gets a generation, just without those inline parts

router.post('/generate-from-project', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const body = req.body || {};
    const {
      project_id: projectId,
      override_prompt: overridePrompt,
      include_property_photos: includePhotos = true,
      max_photos: maxPhotos = DEFAULT_MAX_PHOTOS,
      kind,
    } = body;
    if (!projectId) return res.status(400).json({ error: 'project_id is required' });
    if (!kind || !ALLOWED_KINDS.has(kind)) {
      return res.status(400).json({ error: `kind must be one of ${[...ALLOWED_KINDS].join(', ')}` });
    }
    const photoLimit = Math.max(0, Math.min(parseInt(maxPhotos, 10) || DEFAULT_MAX_PHOTOS, 6));

    // ── load all context in parallel ──
    // One round-trip per resource keeps this readable; the pool can
    // handle a handful of concurrent queries comfortably.
    const [projectRes, prefRes, siteVisitRes, photoRes] = await Promise.all([
      query(
        `SELECT * FROM design_projects WHERE tenant_id = $1 AND id = $2`,
        [DEFAULT_TENANT_ID, projectId],
      ),
      query(
        `SELECT * FROM design_preferences WHERE project_id = $1`,
        [projectId],
      ),
      // Most recent site visit only — the model doesn't need every
      // visit's notes, just the freshest signal.
      query(
        `SELECT * FROM design_site_visits WHERE project_id = $1
         ORDER BY visit_date DESC LIMIT 1`,
        [projectId],
      ),
      // Pull more than `photoLimit` so we have headroom to drop oversize
      // ones without falling short of N. Filter by kind in SQL to keep
      // junk (concept screenshots, as-built sketches) out of the pool.
      query(
        `SELECT * FROM design_photos
         WHERE project_id = $1
           AND kind = ANY($2::text[])
         ORDER BY uploaded_at DESC
         LIMIT $3`,
        [projectId, [...INLINE_PHOTO_KINDS], photoLimit * 3],
      ),
    ]);

    if (projectRes.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    const project = projectRes.rows[0];

    // Property is optional — projects without a linked property still
    // generate, just without the location/sqft signal.
    let property = null;
    if (project.property_id) {
      const propRes = await query(
        `SELECT * FROM design_properties WHERE tenant_id = $1 AND id = $2`,
        [DEFAULT_TENANT_ID, project.property_id],
      );
      property = propRes.rows[0] || null;
    }

    // ── inspiration captions: pull existing moodboard links so the
    // model can echo their tone. Cheap to load alongside; only ship
    // the captions (not URLs) to keep tokens lean.
    let inspirationCaptions = [];
    try {
      const mbRes = await query(
        `SELECT links FROM design_moodboards
         WHERE project_id = $1 ORDER BY version_number DESC LIMIT 3`,
        [projectId],
      );
      for (const row of mbRes.rows) {
        const links = Array.isArray(row.links) ? row.links : [];
        for (const l of links) {
          if (l && typeof l.caption === 'string' && l.caption.trim()) {
            inspirationCaptions.push(l.caption.trim());
          }
        }
      }
      // Dedup; cap to keep token spend predictable.
      inspirationCaptions = [...new Set(inspirationCaptions)].slice(0, 12);
    } catch (e) {
      // Non-fatal — moodboards table missing or column renamed shouldn't
      // break generation. Log and move on.
      console.warn('[design/ai_images] moodboard caption fetch skipped:', e.message);
    }

    const projectContext = {
      project: {
        id: project.id,
        name: project.name,
        classification: project.classification,
        tier: project.tier,
        goals: project.goals || [],
        outcomes: project.outcomes || [],
      },
      property: property
        ? {
            name: property.name,
            city: property.city,
            state: property.state,
            sqft: property.sqft,
            construction_type: property.construction_type,
            year_built: property.year_built,
            notes: property.notes,
          }
        : null,
      preferences: prefRes.rows[0]?.preferences || {},
      siteVisit: siteVisitRes.rows[0]
        ? {
            visit_date: siteVisitRes.rows[0].visit_date,
            duration_min: siteVisitRes.rows[0].duration_min,
            notes: siteVisitRes.rows[0].notes,
          }
        : null,
      goals: project.goals || [],
      outcomes: project.outcomes || [],
      classification: project.classification,
      tier: project.tier,
      inspirationCaptions,
    };

    // ── prompt: override wins; else synth via Kimi/fallback ──
    let usedPrompt = null;
    let promptSource = null;
    let styleNotes = [];
    let suggestedAspectRatio = null;
    if (typeof overridePrompt === 'string' && overridePrompt.trim().length > 0) {
      usedPrompt = overridePrompt.trim();
      promptSource = 'override';
    } else {
      let synth;
      try {
        synth = await buildMoodboardPrompt({ projectContext });
      } catch (e) {
        console.error('[design/ai_images] prompt synthesis failed:', e.message);
        return res.status(502).json({ error: `Prompt synthesis failed: ${e.message}` });
      }
      usedPrompt = synth.prompt;
      promptSource = synth.source; // 'kimi' | 'template-fallback'
      styleNotes = synth.styleNotes || [];
      suggestedAspectRatio = synth.suggestedAspectRatio || null;
    }

    // ── reference photos: fetch in parallel, filter unreachable / too
    // large / non-image. Skip the lot if includePhotos=false. ──
    let inlineImages = [];
    if (includePhotos && photoLimit > 0) {
      const candidates = photoRes.rows.slice(0, photoLimit * 3);
      const fetches = candidates.map(async (photo) => {
        try {
          const r = await axios.get(photo.url, {
            responseType: 'arraybuffer',
            timeout: 8_000,
            maxContentLength: MAX_INLINE_IMAGE_BYTES,
            // Don't follow redirects to a non-image origin — but axios
            // doesn't easily gate on response content-type before body,
            // so we validate after the fact.
          });
          const contentType = String(r.headers['content-type'] || '').toLowerCase();
          if (!contentType.startsWith('image/')) {
            return null;
          }
          const buf = Buffer.from(r.data);
          if (buf.length > MAX_INLINE_IMAGE_BYTES) return null;
          return {
            mimeType: contentType.split(';')[0],
            base64: buf.toString('base64'),
          };
        } catch (e) {
          // 404, network, oversized — quietly skip this one. Log with
          // photo id so ops can investigate if every photo is failing.
          console.warn(`[design/ai_images] reference photo ${photo.id} skipped:`, e.message);
          return null;
        }
      });
      const results = await Promise.all(fetches);
      inlineImages = results.filter(Boolean).slice(0, photoLimit);
    }

    // ── size hint from suggested aspect ratio (only when not overridden) ──
    const sizeHint = ASPECT_TO_SIZE[suggestedAspectRatio] || undefined;

    let result;
    try {
      result = await generateImage({
        prompt: usedPrompt,
        size: sizeHint,
        inlineImages,
      });
    } catch (e) {
      console.error('[design/ai_images] generation error:', e.message);
      return res.status(502).json({ error: `Image generation failed: ${e.message}` });
    }

    const storedPrompt = encodeKindIntoPrompt(kind, result.generatorPrompt);

    // Persist with the structured context for audit + debug. Migration
    // 008 adds the prompt_context JSONB column; the route stays
    // forward-compatible if the column is missing (catch & retry without
    // it) — useful if a deployment lands the code before the migration.
    const contextBlob = {
      ...projectContext,
      promptSource,
      usedImageCount: inlineImages.length,
      styleNotes,
      suggestedAspectRatio,
    };

    let row;
    try {
      const insert = await query(
        `INSERT INTO design_assets
           (sha256, tenant_id, mime_type, byte_size, storage_url, source,
            generator_prompt, prompt_context, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
          contextBlob,
          req.identity.userId,
        ],
      );
      row = insert.rows[0];
      if (!row) {
        const existing = await query(
          `SELECT * FROM design_assets WHERE sha256 = $1 AND tenant_id = $2`,
          [result.sha256, DEFAULT_TENANT_ID],
        );
        row = existing.rows[0];
      }
    } catch (e) {
      // 42703 = undefined_column (Postgres). Migration 008 hasn't run
      // yet → retry without prompt_context so we don't 500 the caller.
      if (e.code === '42703') {
        console.warn('[design/ai_images] prompt_context column missing — retrying without it (run migration 008)');
        const insert = await query(
          `INSERT INTO design_assets
             (sha256, tenant_id, mime_type, byte_size, storage_url, source,
              generator_prompt, created_by_user_id)
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
        row = insert.rows[0];
        if (!row) {
          const existing = await query(
            `SELECT * FROM design_assets WHERE sha256 = $1 AND tenant_id = $2`,
            [result.sha256, DEFAULT_TENANT_ID],
          );
          row = existing.rows[0];
        }
      } else {
        throw e;
      }
    }
    if (!row) {
      return res.status(500).json({ error: 'Asset row missing after insert' });
    }

    const shaped = shapeAiAsset(row);
    shaped.stub = result.stub === true;
    shaped.duration_ms = result.durationMs ?? null;
    shaped.cached = result.cached === true;
    shaped.used_prompt = usedPrompt;
    shaped.used_image_count = inlineImages.length;
    shaped.prompt_source = promptSource;
    shaped.prompt_style_notes = styleNotes;
    shaped.suggested_aspect_ratio = suggestedAspectRatio;
    return res.status(201).json(shaped);
  } catch (e) {
    console.error('[design/ai_images] generate-from-project error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ────────────────── POST /generate-floor-plan ──────────────────
//
// design-be-11: takes a messy client floor plan (PDF / sketch / photo)
// and asks Nanobanana to redraw it as a clean top-view layout we can
// use as the canvas for design packs. Unlike /generate, this route
// accepts an inline source image rather than just a prompt — Gemini
// 2.5 Flash Image's multi-modal contract handles the conditioning.
//
// Body:
//   project_id            — required, ownership-checked
//   source_image          — required, { mimeType, base64 }
//   prompt_hint           — optional, free-text guidance appended to the
//                            system directive
//   set_as_project_plan   — optional bool. When true, also UPDATEs
//                            design_projects.floor_plan_image_id with the
//                            new asset sha256 so the project pins this
//                            canonical floor plan. (Field name kept for
//                            API-contract stability across the rename.)
//
// Response: 201 with the standard asset row shape plus
//   { project_updated: boolean, original_input_sha256: string }
router.post('/generate-floor-plan', requireDesignPerm('design:write'), async (req, res) => {
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
    if (!ALLOWED_FLOOR_PLAN_MIME.has(mimeType)) {
      return res.status(400).json({
        error: `source_image.mimeType must be one of ${[...ALLOWED_FLOOR_PLAN_MIME].join(', ')}`,
      });
    }
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

    const hintTrimmed = typeof promptHint === 'string' ? promptHint.trim() : '';
    const prompt = hintTrimmed
      ? `${FLOOR_PLAN_SYSTEM_PROMPT} ${hintTrimmed}`
      : FLOOR_PLAN_SYSTEM_PROMPT;

    const inputBuf = Buffer.from(base64, 'base64');
    const originalInputSha256 = crypto.createHash('sha256').update(inputBuf).digest('hex');

    let result;
    try {
      result = await generateImage({
        prompt,
        inlineImages: [{ mimeType, base64 }],
      });
    } catch (e) {
      console.error('[design/ai_images] floor-plan generation error:', e.message);
      return res.status(502).json({ error: `Image generation failed: ${e.message}` });
    }

    const storedPrompt = `[kind:floor_plan] ${result.generatorPrompt}`;

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

    let projectUpdated = false;
    if (setAsProjectPlan === true) {
      const upd = await query(
        `UPDATE design_projects
           SET floor_plan_image_id = $3, updated_at = NOW()
         WHERE tenant_id = $1 AND id = $2
         RETURNING id`,
        [DEFAULT_TENANT_ID, projectId, result.sha256],
      );
      projectUpdated = upd.rows.length > 0;
    }

    try {
      await appendActivity({
        projectId,
        actorUserId: req.identity.userId,
        actorName: req.identity.displayName || req.identity.username,
        action: 'project.floor_plan.generated',
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
    console.error('[design/ai_images] generate-floor-plan error:', e.message);
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
