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
const { query } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { DEFAULT_TENANT_ID, shapeAsset } = require('./adapters');
const { generateImage } = require('../ai/imagegen');

const router = express.Router();

const ALLOWED_KINDS = new Set(['moodboard', 'pack']);
const KIND_PREFIX_RE = /^\[kind:([a-z]+)\]\s+/;

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
