'use strict';

// Floor-plan renderer (Conversational Floor-Plan Editor — sprint W4).
//
// Two-stage pipeline:
//   1. renderModelToSvg(model)           — pure, deterministic SVG line-art.
//                                           This is the STRUCTURAL AUTHORITY.
//   2. renderModelToStylizedRaster(...)  — feeds the SVG to Nanobanana /
//                                           Gemini as a reference image and
//                                           asks for a photoreal top-down
//                                           render with textures only.
//
// IMPORTANT INVARIANT — the texture pass MUST NOT change geometry. Walls,
// doors, windows, furniture positions, and rotations are fixed by the SVG;
// Gemini is only allowed to paint surfaces. The prompt template repeats
// this constraint several ways because the model tends to "tidy" layouts
// otherwise.
//
// Coordinate system mirrors floorPlanTypes.ts:
//   - metres, origin top-left, X→right, Y→down
//   - fixed 100 px per metre for SVG output
//
// Caching: identical { svg, styleNotes } pairs dedupe via sha256 against
// the design_assets table. prompt_context.kind = 'floor_plan_render' so
// clearRendererCache() can scope its DELETE.

const crypto = require('crypto');
const { query } = require('../database/client');
const { generateImage } = require('../ai/imagegen');
const { getCatalogEntry } = require('./floor_plan_catalog');
const {
  enforceQuota,
  recordUsage,
  parseNanobananaUsage,
  QuotaExceededError,
} = require('../tenants/ai_usage');

const NANOBANANA_MODEL_NAME = process.env.NANOBANANA_MODEL || 'gemini-2.5-flash-image-preview';

// ─────────────────────────── constants ──────────────────────────────

const PX_PER_M = 100;
const RENDER_KIND = 'floor_plan_render';

// Default tenant matches the design_assets table default in 002_design_tables.sql.
const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

// ───────────────────────── small helpers ────────────────────────────

function escapeXml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fmt(n) {
  // 3-decimal precision is plenty at 100px/m. Trim trailing zeros so the
  // diff between two near-identical SVGs stays tight (cache key stability).
  if (!Number.isFinite(n)) return '0';
  const r = Math.round(n * 1000) / 1000;
  return String(r);
}

/** Geometry of a wall in pixel space. */
function wallVector(wall) {
  const ax = wall.a.x * PX_PER_M;
  const ay = wall.a.y * PX_PER_M;
  const bx = wall.b.x * PX_PER_M;
  const by = wall.b.y * PX_PER_M;
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx); // radians, 0 = pointing right
  return { ax, ay, bx, by, dx, dy, length, angle };
}

/** Centroid of a polygon (rooms.outline). */
function polygonCentroid(points) {
  if (!Array.isArray(points) || points.length === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}

// ───────────────────────── door / window arcs ───────────────────────

/**
 * Door rendered as a quarter-circle arc on the swing side of the wall.
 * Convention: arc starts at the hinge (wall.a side of the door span) and
 * sweeps perpendicular to the wall in the indicated swing direction.
 */
function doorPath(door, wall) {
  const v = wallVector(wall);
  if (v.length === 0) return '';

  const widthPx = door.width * PX_PER_M;
  const ux = v.dx / v.length; // unit along wall
  const uy = v.dy / v.length;
  // Perpendicular (left of wall vector in screen coords — Y is down,
  // so the standard 2D "left normal" is (-uy, ux)).
  const px = -uy;
  const py = ux;
  const sign = door.swing === 'left' ? 1 : -1;

  // Hinge sits at the centre of the door, minus half-width along the wall.
  const cx = v.ax + ux * (door.positionRatio * v.length);
  const cy = v.ay + uy * (door.positionRatio * v.length);
  const hingeX = cx - ux * (widthPx / 2);
  const hingeY = cy - uy * (widthPx / 2);
  const endX = hingeX + ux * widthPx; // doorstop along the wall
  const endY = hingeY + uy * widthPx;
  const swungX = hingeX + sign * px * widthPx; // open-door tip
  const swungY = hingeY + sign * py * widthPx;

  // The arc sweeps from doorstop to swung position around the hinge.
  // SVG arc: M end → A r r 0 0 sweepFlag swung. sweepFlag depends on the
  // swing direction; we computed swung relative to hinge so we just pick
  // sweep-flag=0 for left and 1 for right (or vice versa — both look
  // identical for a single quarter arc).
  return `M ${fmt(endX)} ${fmt(endY)} A ${fmt(widthPx)} ${fmt(widthPx)} 0 0 ${door.swing === 'left' ? 0 : 1} ${fmt(swungX)} ${fmt(swungY)}`;
}

/**
 * Window rendered as a pair of parallel lines straddling the wall centre-
 * line. Span runs along the wall from positionRatio with the requested
 * width.
 */
function windowPath(win, wall) {
  const v = wallVector(wall);
  if (v.length === 0) return null;
  const widthPx = win.width * PX_PER_M;
  const ux = v.dx / v.length;
  const uy = v.dy / v.length;
  const px = -uy;
  const py = ux;

  const cx = v.ax + ux * (win.positionRatio * v.length);
  const cy = v.ay + uy * (win.positionRatio * v.length);
  const ax = cx - ux * (widthPx / 2);
  const ay = cy - uy * (widthPx / 2);
  const bx = cx + ux * (widthPx / 2);
  const by = cy + uy * (widthPx / 2);

  const offset = (wall.thickness * PX_PER_M) / 3;
  return {
    x1a: ax + px * offset, y1a: ay + py * offset,
    x2a: bx + px * offset, y2a: by + py * offset,
    x1b: ax - px * offset, y1b: ay - py * offset,
    x2b: bx - px * offset, y2b: by - py * offset,
  };
}

// ───────────────────────── Function 1 ───────────────────────────────

/**
 * renderModelToSvg(model) — pure deterministic SVG generator.
 *
 * Returns an SVG string sized to `model.canvas` (metres × PX_PER_M).
 * No I/O, no randomness — same input always produces the same bytes,
 * so the sha256 cache key is meaningful.
 */
function renderModelToSvg(model) {
  if (!model || typeof model !== 'object') {
    throw new Error('renderModelToSvg: model is required');
  }
  const canvas = model.canvas || { width: 10, height: 10 };
  const W = canvas.width * PX_PER_M;
  const H = canvas.height * PX_PER_M;

  const wallsById = new Map((model.walls || []).map((w) => [w.id, w]));
  const parts = [];

  // Header — structural-authority disclaimer travels with the SVG so any
  // downstream consumer (Gemini included) sees the contract.
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" `
    + `width="${fmt(W)}" height="${fmt(H)}" `
    + `viewBox="0 0 ${fmt(W)} ${fmt(H)}">`
  );
  parts.push(
    `<!-- Friday floor-plan SVG. This is the STRUCTURAL AUTHORITY. `
    + `The texture pass MUST NOT change geometry — walls, doors, windows, `
    + `and furniture positions/rotations are fixed. Coordinate system: `
    + `metres × ${PX_PER_M} px/m. -->`
  );

  // Background.
  parts.push(`<rect x="0" y="0" width="${fmt(W)}" height="${fmt(H)}" fill="#ffffff"/>`);

  // Rooms (dashed grey outline + centroid label). Drawn first so walls
  // and furniture overdraw them.
  for (const room of model.rooms || []) {
    if (!Array.isArray(room.outline) || room.outline.length < 3) continue;
    const pts = room.outline.map((p) => `${fmt(p.x * PX_PER_M)},${fmt(p.y * PX_PER_M)}`).join(' ');
    parts.push(
      `<polygon points="${pts}" fill="none" stroke="#999999" stroke-width="1" stroke-dasharray="6 4"/>`
    );
    const c = polygonCentroid(room.outline);
    parts.push(
      `<text x="${fmt(c.x * PX_PER_M)}" y="${fmt(c.y * PX_PER_M)}" `
      + `text-anchor="middle" dominant-baseline="middle" `
      + `font-family="sans-serif" font-size="14" fill="#666666">`
      + `${escapeXml(room.label || room.id)}</text>`
    );
  }

  // Walls.
  for (const wall of model.walls || []) {
    const strokePx = (wall.thickness || 0.1) * PX_PER_M;
    parts.push(
      `<line x1="${fmt(wall.a.x * PX_PER_M)}" y1="${fmt(wall.a.y * PX_PER_M)}" `
      + `x2="${fmt(wall.b.x * PX_PER_M)}" y2="${fmt(wall.b.y * PX_PER_M)}" `
      + `stroke="#000000" stroke-width="${fmt(strokePx)}" stroke-linecap="square"/>`
    );
  }

  // Doors — arc + the doorstop short line. We also white-mask the wall
  // segment under the door so the arc reads as an opening.
  for (const door of model.doors || []) {
    const wall = wallsById.get(door.wallId);
    if (!wall) continue;
    const v = wallVector(wall);
    if (v.length === 0) continue;
    const widthPx = door.width * PX_PER_M;
    const ux = v.dx / v.length;
    const uy = v.dy / v.length;
    const cx = v.ax + ux * (door.positionRatio * v.length);
    const cy = v.ay + uy * (door.positionRatio * v.length);
    const ax = cx - ux * (widthPx / 2);
    const ay = cy - uy * (widthPx / 2);
    const bx = cx + ux * (widthPx / 2);
    const by = cy + uy * (widthPx / 2);
    parts.push(
      `<line x1="${fmt(ax)}" y1="${fmt(ay)}" x2="${fmt(bx)}" y2="${fmt(by)}" `
      + `stroke="#ffffff" stroke-width="${fmt((wall.thickness || 0.1) * PX_PER_M + 1)}" stroke-linecap="butt"/>`
    );
    parts.push(
      `<path d="${doorPath(door, wall)}" fill="none" stroke="#000000" stroke-width="1.5"/>`
    );
  }

  // Windows — same opening mask + parallel double lines.
  for (const win of model.windows || []) {
    const wall = wallsById.get(win.wallId);
    if (!wall) continue;
    const v = wallVector(wall);
    if (v.length === 0) continue;
    const widthPx = win.width * PX_PER_M;
    const ux = v.dx / v.length;
    const uy = v.dy / v.length;
    const cx = v.ax + ux * (win.positionRatio * v.length);
    const cy = v.ay + uy * (win.positionRatio * v.length);
    const ax = cx - ux * (widthPx / 2);
    const ay = cy - uy * (widthPx / 2);
    const bx = cx + ux * (widthPx / 2);
    const by = cy + uy * (widthPx / 2);
    parts.push(
      `<line x1="${fmt(ax)}" y1="${fmt(ay)}" x2="${fmt(bx)}" y2="${fmt(by)}" `
      + `stroke="#ffffff" stroke-width="${fmt((wall.thickness || 0.1) * PX_PER_M + 1)}" stroke-linecap="butt"/>`
    );
    const wp = windowPath(win, wall);
    if (wp) {
      parts.push(
        `<line x1="${fmt(wp.x1a)}" y1="${fmt(wp.y1a)}" x2="${fmt(wp.x2a)}" y2="${fmt(wp.y2a)}" stroke="#000000" stroke-width="1"/>`
      );
      parts.push(
        `<line x1="${fmt(wp.x1b)}" y1="${fmt(wp.y1b)}" x2="${fmt(wp.x2b)}" y2="${fmt(wp.y2b)}" stroke="#000000" stroke-width="1"/>`
      );
    }
  }

  // Furniture.
  for (const item of model.furniture || []) {
    const entry = getCatalogEntry(item.category);
    const displayName = entry ? entry.displayName : item.category;
    const wPx = item.width * PX_PER_M;
    const dPx = item.depth * PX_PER_M;
    const cxPx = item.centre.x * PX_PER_M;
    const cyPx = item.centre.y * PX_PER_M;
    const xPx = cxPx - wPx / 2;
    const yPx = cyPx - dPx / 2;
    const rotate = item.rotation || 0;
    const transform = rotate ? ` transform="rotate(${fmt(rotate)} ${fmt(cxPx)} ${fmt(cyPx)})"` : '';
    // Silhouette: circle for round items, rect otherwise. 'L' falls back
    // to rect for v1 — L-shape rendering can be tackled when we have a
    // concrete need.
    if (entry && entry.silhouette === 'circle') {
      const r = Math.min(wPx, dPx) / 2;
      parts.push(
        `<g${transform}><circle cx="${fmt(cxPx)}" cy="${fmt(cyPx)}" r="${fmt(r)}" `
        + `fill="#e6e6e6" stroke="#000000" stroke-width="0.5"/>`
        + `<text x="${fmt(cxPx)}" y="${fmt(cyPx)}" text-anchor="middle" dominant-baseline="middle" `
        + `font-family="sans-serif" font-size="10" fill="#333333">${escapeXml(displayName)}</text></g>`
      );
    } else {
      parts.push(
        `<g${transform}><rect x="${fmt(xPx)}" y="${fmt(yPx)}" width="${fmt(wPx)}" height="${fmt(dPx)}" `
        + `fill="#e6e6e6" stroke="#000000" stroke-width="0.5"/>`
        + `<text x="${fmt(cxPx)}" y="${fmt(cyPx)}" text-anchor="middle" dominant-baseline="middle" `
        + `font-family="sans-serif" font-size="10" fill="#333333">${escapeXml(displayName)}</text></g>`
      );
    }
  }

  // Surfaces deliberately not rendered — they're hints for the texture
  // pass, not structural geometry.

  parts.push(`</svg>`);
  return parts.join('\n');
}

// ───────────────────────── Function 2 ───────────────────────────────

/**
 * renderModelToStylizedRaster(model, styleNotes, opts)
 *
 * Returns { url, sha256, cached, stub? }.
 *
 * Pipeline:
 *   1. Compute deterministic SVG.
 *   2. sha256 over { svg, styleNotes } → cache key.
 *   3. Look up design_assets by sha256 (scoped by tenantId). Hit → return.
 *   4. Miss → call Gemini with the SVG as a reference image + a constraint-
 *      heavy prompt. Persist to design_assets with prompt_context tagging
 *      kind = 'floor_plan_render'.
 *
 * Notes:
 *   - SVG is shipped as `image/svg+xml` inline. Gemini sometimes refuses
 *     SVG inlineData (see comment in ai_images.js). When the upstream call
 *     fails — including the "no API key" stub path — we degrade gracefully:
 *     return the SVG itself as a data URL so the chat UI has something to
 *     render. Caller can inspect `stub: true` to surface a banner.
 */
async function renderModelToStylizedRaster(model, styleNotes, opts = {}) {
  const tenantId = opts.tenantId || DEFAULT_TENANT_ID;
  const createdByUserId = opts.userId || null;
  const styleText = typeof styleNotes === 'string' && styleNotes.trim().length > 0
    ? styleNotes.trim()
    : (model && typeof model.styleNotes === 'string' && model.styleNotes.trim().length > 0
      ? model.styleNotes.trim()
      : 'modern, neutral palette, natural materials');

  const svg = renderModelToSvg(model);
  const modelHash = crypto.createHash('sha256').update(svg).update('\n').update(styleText).digest('hex');

  // ── cache lookup ──
  // Match the model hash in prompt_context. We can't key directly on the
  // image content sha256 here (that's the OUTPUT hash, not the INPUT
  // hash), so we scan by prompt_context. The table is small enough for
  // this to be acceptable; a GIN index on prompt_context is the future
  // fix if this gets hot.
  try {
    const hit = await query(
      `SELECT * FROM design_assets
        WHERE tenant_id = $1
          AND prompt_context->>'kind' = $2
          AND prompt_context->>'model_hash' = $3
        ORDER BY created_at DESC
        LIMIT 1`,
      [tenantId, RENDER_KIND, modelHash],
    );
    if (hit.rows.length > 0) {
      const row = hit.rows[0];
      return { url: row.storage_url, sha256: row.sha256, cached: true };
    }
  } catch (e) {
    // 42703 = prompt_context column missing (migration 008 not run). Skip
    // cache lookup and continue — we just won't dedupe in that environment.
    if (e.code !== '42703') {
      console.warn('[floor_plan_renderer] cache lookup failed:', e.message);
    }
  }

  // ── prompt ──
  const prompt =
    `Render this floor plan as a photorealistic top-down architectural visualization.\n`
    + `Critical constraints:\n`
    + `- The geometry (walls, doors, windows, furniture positions) MUST stay EXACTLY as in the reference.\n`
    + `- Walls must remain at their exact positions and angles.\n`
    + `- Furniture must stay at the same positions and rotations.\n`
    + `- Do NOT add or remove anything.\n`
    + `- You may paint textures (wood floor, wall colour, furniture material) consistent with the style notes.\n\n`
    + `Style notes: ${styleText}`;

  // ── encode SVG → PNG for Gemini ──
  // 2026-05-16: confirmed via prod logs that Gemini 2.5 Flash Image
  // rejects image/svg+xml inlineData with "Unsupported MIME type".
  // We pre-rasterise to PNG via @resvg/resvg-js (pure-Node, no native
  // compile). Render at 2× the canvas px (so 2000×2000 for the default
  // 10m × 10m canvas at 100 px/m) — Gemini downsamples internally
  // and the extra resolution helps furniture labels survive. PNG is
  // small enough not to bloat the inline data even at that size.
  let pngBase64;
  let inlineMime;
  try {
    // eslint-disable-next-line global-require
    const { Resvg } = require('@resvg/resvg-js');
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'zoom', value: 2 },
      background: 'white',
    });
    const pngBuffer = resvg.render().asPng();
    pngBase64 = pngBuffer.toString('base64');
    inlineMime = 'image/png';
  } catch (rasteriseErr) {
    // Fallback to SVG (which Gemini will reject and the catch below
    // handles) — but log so we know rasterisation broke.
    console.warn('[floor_plan_renderer] SVG → PNG rasterisation failed:', rasteriseErr.message);
    pngBase64 = Buffer.from(svg, 'utf-8').toString('base64');
    inlineMime = 'image/svg+xml';
  }

  // Quota guard — only enforce when the caller passed a real tenant
  // (legacy callers may not). DEFAULT_TENANT_ID is a sentinel for
  // "FR" so it's safe to enforce against that too.
  if (tenantId) {
    try {
      await enforceQuota(tenantId);
    } catch (e) {
      if (e instanceof QuotaExceededError) {
        // Re-throw so the caller (a chat-pipeline handler) can convert
        // to 402. Don't degrade to SVG-only here — that would hide
        // billing state behind a stub.
        throw e;
      }
      throw e;
    }
  }

  let result;
  let degraded = false;
  try {
    result = await generateImage({
      prompt,
      inlineImages: [{ mimeType: inlineMime, base64: pngBase64 }],
    });
  } catch (e) {
    console.warn('[floor_plan_renderer] generateImage failed, returning SVG fallback:', e.message);
    degraded = true;
    if (tenantId) {
      recordUsage({
        tenantId,
        userId: createdByUserId,
        feature: 'floor_plan_render',
        provider: 'nanobanana',
        model: NANOBANANA_MODEL_NAME,
        success: false,
        errorCode: String(e.code || 'generation_failed').slice(0, 64),
        requestContext: { model_hash: modelHash, kind: RENDER_KIND },
      }).catch(() => {});
    }
  }

  if (!degraded && result && !result.stub && !result.cached && tenantId) {
    const usage = parseNanobananaUsage(result);
    recordUsage({
      tenantId,
      userId: createdByUserId,
      feature: 'floor_plan_render',
      provider: 'nanobanana',
      model: NANOBANANA_MODEL_NAME,
      durationMs: result.durationMs || null,
      success: true,
      requestContext: { model_hash: modelHash, kind: RENDER_KIND, byte_size: usage.byteSize },
      kind: 'image',
    }).catch(() => {});
  }

  if (degraded || !result || result.stub === true) {
    // Stub / fallback path — surface the SVG itself so the UI has
    // something to render. The cache row is INTENTIONALLY not written:
    // we don't want a stub poisoning future cache hits once the real
    // key lands. Caller sees `stub: true`.
    const svgDataUrl = `data:image/svg+xml;base64,${svgBase64}`;
    const fakeSha = 'svgstub-' + crypto.createHash('sha256').update(modelHash).digest('hex').slice(0, 16);
    return { url: svgDataUrl, sha256: fakeSha, cached: false, stub: true };
  }

  // ── persist ──
  const contextBlob = {
    kind: RENDER_KIND,
    model_hash: modelHash,
    style_notes: styleText,
    // The model itself isn't stored verbatim — it can be large, and the
    // version row already owns the canonical copy. We just store enough
    // to identify which render this was for.
    canvas: model.canvas || null,
    counts: {
      walls: (model.walls || []).length,
      doors: (model.doors || []).length,
      windows: (model.windows || []).length,
      furniture: (model.furniture || []).length,
      rooms: (model.rooms || []).length,
    },
  };

  try {
    await query(
      `INSERT INTO design_assets
         (sha256, tenant_id, mime_type, byte_size, storage_url, source,
          generator_prompt, prompt_context, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (tenant_id, sha256) DO NOTHING`,
      [
        result.sha256,
        tenantId,
        result.mimeType || 'image/png',
        result.byteSize || null,
        result.imageUrl,
        'nanobanana',
        `[kind:${RENDER_KIND}] ${result.generatorPrompt || prompt}`,
        contextBlob,
        createdByUserId,
      ],
    );
  } catch (e) {
    // 42703 = prompt_context column missing. Retry without it so deploys
    // without migration 008 don't 500. Forward-compat mirrors the pattern
    // in ai_images.js.
    if (e.code === '42703') {
      console.warn('[floor_plan_renderer] prompt_context column missing — retrying without it (run migration 008)');
      try {
        await query(
          `INSERT INTO design_assets
             (sha256, tenant_id, mime_type, byte_size, storage_url, source,
              generator_prompt, created_by_user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (tenant_id, sha256) DO NOTHING`,
          [
            result.sha256,
            tenantId,
            result.mimeType || 'image/png',
            result.byteSize || null,
            result.imageUrl,
            'nanobanana',
            `[kind:${RENDER_KIND}] ${result.generatorPrompt || prompt}`,
            createdByUserId,
          ],
        );
      } catch (e2) {
        console.warn('[floor_plan_renderer] asset persist failed (legacy path):', e2.message);
      }
    } else {
      // Non-fatal — we still return the generated URL. Logging only.
      console.warn('[floor_plan_renderer] asset persist failed:', e.message);
    }
  }

  return { url: result.imageUrl, sha256: result.sha256, cached: false };
}

// ───────────────────────── Function 3 ───────────────────────────────

/**
 * clearRendererCache() — test/dev helper. Drops all design_assets rows
 * tagged with prompt_context.kind = 'floor_plan_render'. Useful when
 * iterating on the prompt template — old cache entries would otherwise
 * mask the new behaviour.
 */
async function clearRendererCache(opts = {}) {
  const tenantId = opts.tenantId || null;
  try {
    if (tenantId) {
      const r = await query(
        `DELETE FROM design_assets
          WHERE tenant_id = $1
            AND prompt_context->>'kind' = $2`,
        [tenantId, RENDER_KIND],
      );
      return { deleted: r.rowCount || 0 };
    }
    const r = await query(
      `DELETE FROM design_assets
        WHERE prompt_context->>'kind' = $1`,
      [RENDER_KIND],
    );
    return { deleted: r.rowCount || 0 };
  } catch (e) {
    if (e.code === '42703') {
      console.warn('[floor_plan_renderer] clearRendererCache: prompt_context column missing (migration 008 not run); nothing to delete');
      return { deleted: 0 };
    }
    throw e;
  }
}

module.exports = {
  renderModelToSvg,
  renderModelToStylizedRaster,
  clearRendererCache,
  // Exposed for tests:
  _wallVector: wallVector,
  _doorPath: doorPath,
  _windowPath: windowPath,
  _PX_PER_M: PX_PER_M,
};
