'use strict';

// Smart moodboard prompt synthesis — Kimi (Moonshot) only.
//
// Mirrors translate.js shape: same OpenAI-compatible chat-completions
// surface, same disk cache, same env-gated stub fallback. Where
// translate.js takes a single string and outputs JSON {language,
// translation}, this module takes a flat project context blob and outputs
// JSON {prompt, suggestedAspectRatio, styleNotes[]} — a tight, vivid
// scene description Nanobanana can render in one pass.
//
// Why Kimi (rather than the same Gemini model that runs the image
// generation): Kimi excels at JSON-structured synthesis of long
// heterogeneous inputs and the moonshot-v1-8k context window is more
// than enough for a project's worth of preferences + site-visit notes.
// Running it on the Gemini surface would cost extra tokens against the
// same quota that's drawing the image, and the prompt-builder needs to
// stay cheap because the user iterates on it.
//
// Fallback: when KIMI_API_KEY is unset (dev without keys, or quota
// exhausted) we synthesise a deterministic template prompt from the
// same context — usable, just less colourful. The frontend gets
// promptSource='template-fallback' so it can hint the user that they
// should tweak the result.

const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const KIMI_BASE_URL = process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1';
const KIMI_MODEL = process.env.KIMI_MODEL || 'moonshot-v1-8k';
const MAX_RETRIES = 3;

const SYSTEM_PROMPT = `You write image-generation prompts for interior moodboards. Given a design project's context (property metadata, owner preferences, site-visit notes, goals), synthesize a single 60-100 word vivid scene description suitable for a photorealistic image-generation model (Nanobanana / Gemini 2.5 Flash Image).

Constraints:
- The prompt is one paragraph, no bullets.
- Concrete nouns: materials, colours, light, scale. Avoid abstract adjectives like "luxurious" or "modern" unless qualified ("modernist Bauhaus-influenced cabinetry").
- Anchor in the property's region and construction type when supplied.
- Mention 2-3 of the preference areas the owner cares most about; ignore preference areas with no signal.
- End with a directive like "photorealistic interior design moodboard, late afternoon light".

Output ONLY valid JSON, no commentary, no markdown fences:
{
  "prompt": "<60-100 word prompt>",
  "suggestedAspectRatio": "16:9" | "4:3" | "1:1" | "3:4",
  "styleNotes": ["<1-4 short notes about styling choices made>"]
}`;

// design-be-14: second-stage floor-plan pass. The model sees a clean
// architectural plan + a moodboard reference image and must emit a prompt
// that tells Nanobanana to overlay furniture/fixtures onto the plan, in
// the moodboard's aesthetic, WITHOUT altering walls / doors / windows.
// The system prompt is deliberately narrower than the moodboard one —
// architectural plans demand top-down symbol vocabulary (chair / bed /
// sofa shapes), not photorealism.
const FURNISHING_SYSTEM_PROMPT = `You write image-generation prompts for furnished floor plans. You are an interior designer placing furniture on a clean architectural floor plan. Given the floor plan layout (described in the user message) and a moodboard reference image showing the desired style, synthesize a single 60-120 word prompt that instructs Nanobanana to overlay furniture, lighting, soft furnishings, and fixtures onto the floor plan in the moodboard's aesthetic.

Constraints:
- Keep walls, doors, and windows untouched — the original architectural lines must remain intact.
- Use top-down architectural symbols (chair, bed, sofa, table, rug shapes). Not photorealistic 3D, not isometric, not perspective.
- Anchor furniture choices to the room labels in the plan (bedroom → bed + nightstands, living → sofa + coffee table, etc.).
- Echo the moodboard's palette, materials, and style — 2-3 concrete style descriptors.
- End with a directive like "top-down architectural floor plan with furniture symbols, clean line work, soft fill colours from the moodboard palette".

Output ONLY valid JSON, no commentary, no markdown fences:
{
  "prompt": "<60-120 word prompt>",
  "suggestedAspectRatio": "16:9" | "4:3" | "1:1" | "3:4",
  "styleNotes": ["<1-4 short notes about furniture / styling choices made>"]
}`;

// ────────────────── disk cache ──────────────────
//
// Keyed by sha256 of the canonical-JSON context blob. Survives nodemon
// reload. Cache value is the full result object so a re-call returns
// instantly with `cached: true` (useful when the user re-opens the
// modal on the same project before tweaking anything).

const CACHE_FILE = path.join(__dirname, '..', '..', '.promptbuilder-cache.json');
let cache = readCache();

function readCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return {};
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    return (raw && typeof raw === 'object') ? raw : {};
  } catch { return {}; }
}

function writeCache() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf-8');
  } catch (e) {
    console.warn('[promptbuilder] cache write failed:', e.message);
  }
}

// Canonical JSON serialisation — sort object keys so the same logical
// context always hashes to the same key regardless of property order.
function canonicalize(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalize).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
}

function cacheKey(context, kind = 'moodboard') {
  // Kind-tag the input so the same projectContext under different builders
  // (moodboard vs furnishing) gets distinct cache entries — otherwise the
  // furnishing builder would happily return a moodboard prompt for any
  // project that had previously been hashed.
  const canonical = `${kind}|${canonicalize(context)}`;
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

// ────────────────── stub warning (one-shot) ──────────────────

let stubWarned = false;
function warnStubOnce() {
  if (stubWarned) return;
  stubWarned = true;
  console.warn('[promptbuilder] KIMI_API_KEY not set — using template-fallback synth for all buildMoodboardPrompt() calls. '
    + 'Set KIMI_API_KEY in backend/.env to enable Kimi-powered synthesis.');
}

// ────────────────── retry helper ──────────────────

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function isRetryable(err) {
  const status = err?.response?.status;
  if (status == null) return true; // network / timeout
  if (status === 429) {
    const msg = String(err?.response?.data?.error?.message || err?.message || '').toLowerCase();
    if (msg.includes('quota')) return false;
    return true;
  }
  if (status >= 500 && status < 600) return true;
  return false;
}

// ────────────────── context → user message ──────────────────
//
// Renders the flat project-context object as a human-readable block.
// Plain Markdown beats raw JSON for instruction-tuned models — the
// LLM reasons more naturally over labelled prose than over keys.

function summarizeContext(ctx) {
  const lines = [];
  const project = ctx.project || {};
  const property = ctx.property || {};
  const preferences = ctx.preferences || {};
  const siteVisit = ctx.siteVisit || null;
  const goals = Array.isArray(ctx.goals) ? ctx.goals : [];
  const outcomes = Array.isArray(ctx.outcomes) ? ctx.outcomes : [];
  const classification = ctx.classification || project.classification || null;
  const tier = ctx.tier || project.tier || null;
  const inspirationCaptions = Array.isArray(ctx.inspirationCaptions) ? ctx.inspirationCaptions : [];

  lines.push('# Project');
  if (project.name) lines.push(`- Name: ${project.name}`);
  if (classification) lines.push(`- Classification: ${classification}`);
  if (tier) lines.push(`- Tier: ${tier}`);

  if (property && (property.name || property.city || property.sqft || property.construction_type)) {
    lines.push('');
    lines.push('# Property');
    if (property.name) lines.push(`- Name: ${property.name}`);
    if (property.city || property.state) {
      lines.push(`- Location: ${[property.city, property.state].filter(Boolean).join(', ')}`);
    }
    if (property.sqft) lines.push(`- Size: ${property.sqft} sqft`);
    if (property.construction_type) lines.push(`- Construction: ${property.construction_type}`);
    if (property.year_built) lines.push(`- Year built: ${property.year_built}`);
    if (property.notes) lines.push(`- Notes: ${property.notes}`);
  }

  // Preferences — 16 areas as a JSONB blob. Surface non-empty entries
  // only; the model wastes tokens reasoning over null fields.
  if (preferences && typeof preferences === 'object') {
    const entries = Object.entries(preferences).filter(([, v]) => {
      if (v == null) return false;
      if (typeof v === 'string' && !v.trim()) return false;
      if (Array.isArray(v) && v.length === 0) return false;
      if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) return false;
      return true;
    });
    if (entries.length > 0) {
      lines.push('');
      lines.push('# Preferences (owner-stated)');
      for (const [area, value] of entries) {
        const rendered = renderPreferenceValue(value);
        if (rendered) lines.push(`- ${area}: ${rendered}`);
      }
    }
  }

  if (goals.length > 0) {
    lines.push('');
    lines.push('# Goals');
    for (const g of goals) lines.push(`- ${g}`);
  }
  if (outcomes.length > 0) {
    lines.push('');
    lines.push('# Outcomes');
    for (const o of outcomes) lines.push(`- ${o}`);
  }

  if (siteVisit && (siteVisit.notes || siteVisit.visit_date)) {
    lines.push('');
    lines.push('# Site visit');
    if (siteVisit.visit_date) lines.push(`- Date: ${siteVisit.visit_date}`);
    if (siteVisit.duration_min) lines.push(`- Duration: ${siteVisit.duration_min} min`);
    if (siteVisit.notes) lines.push(`- Notes: ${siteVisit.notes}`);
  }

  if (inspirationCaptions.length > 0) {
    lines.push('');
    lines.push('# Inspiration captions (existing moodboard photos)');
    for (const c of inspirationCaptions.slice(0, 12)) lines.push(`- ${c}`);
  }

  return lines.join('\n');
}

function renderPreferenceValue(v) {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.filter((x) => x != null && String(x).trim()).join(', ');
  if (typeof v === 'object') {
    // Common shapes: { selected: [...], notes: "..." } or {value, notes}
    const parts = [];
    if (Array.isArray(v.selected) && v.selected.length) parts.push(v.selected.join(', '));
    if (Array.isArray(v.values) && v.values.length) parts.push(v.values.join(', '));
    if (typeof v.value === 'string' && v.value.trim()) parts.push(v.value.trim());
    if (typeof v.notes === 'string' && v.notes.trim()) parts.push(`(${v.notes.trim()})`);
    return parts.join(' ');
  }
  return '';
}

// ────────────────── parsing ──────────────────

function parseModelJson(raw) {
  if (!raw || typeof raw !== 'string') return null;
  // Strip ```json fences if the model added them despite the instruction.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : raw;
  const match = candidate.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]);
    const prompt = typeof obj.prompt === 'string' && obj.prompt.trim().length > 0
      ? obj.prompt.trim() : null;
    if (!prompt) return null;
    const ratio = typeof obj.suggestedAspectRatio === 'string'
      ? obj.suggestedAspectRatio.trim() : null;
    const allowedRatios = new Set(['16:9', '4:3', '1:1', '3:4', '9:16']);
    const styleNotes = Array.isArray(obj.styleNotes)
      ? obj.styleNotes.filter((s) => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim()).slice(0, 6)
      : [];
    return {
      prompt,
      suggestedAspectRatio: ratio && allowedRatios.has(ratio) ? ratio : '4:3',
      styleNotes,
    };
  } catch { return null; }
}

// ────────────────── model call ──────────────────

async function callKimi(contextSummary, systemPrompt = SYSTEM_PROMPT) {
  const start = Date.now();
  try {
    const { data } = await axios.post(
      `${KIMI_BASE_URL}/chat/completions`,
      {
        model: KIMI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: contextSummary },
        ],
        // Slightly higher temperature than translate.js — we want the
        // model to vary phrasing across regenerations rather than emit
        // an identical sentence each time.
        temperature: 0.6,
        response_format: { type: 'json_object' },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.KIMI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30_000,
      },
    );
    const raw = data?.choices?.[0]?.message?.content;
    const parsed = parseModelJson(raw);
    if (!parsed) return { ok: false, error: 'Kimi returned unparseable JSON', durationMs: Date.now() - start, raw };
    return { ok: true, parsed, durationMs: Date.now() - start };
  } catch (e) {
    return { ok: false, error: e.response?.data?.error?.message || e.message, durationMs: Date.now() - start, err: e };
  }
}

// ────────────────── deterministic fallback ──────────────────
//
// Synthesises a usable (if generic) prompt from the same context.
// Triggered when KIMI_API_KEY is unset OR Kimi failed after retries.
// Style: pull the strongest signals from property + a handful of
// preference areas, stitch them with conventional connectives.

function fallbackPrompt(ctx) {
  const project = ctx.project || {};
  const property = ctx.property || {};
  const preferences = ctx.preferences || {};
  const classification = ctx.classification || project.classification || null;
  const tier = ctx.tier || project.tier || null;

  const region = property.city || property.state || 'tropical coastal';
  const construction = property.construction_type || null;
  const sqft = property.sqft || null;

  // Cherry-pick a few preference values. We don't know exact area
  // names a priori (they're defined in the frontend), so we grep for
  // a handful of common keys.
  const findPref = (...names) => {
    for (const n of names) {
      const v = preferences[n];
      const rendered = renderPreferenceValue(v);
      if (rendered) return rendered;
    }
    return null;
  };
  const palette = findPref('palette', 'colour_palette', 'colours');
  const materials = findPref('materials', 'finishes');
  const furnishing = findPref('furnishing', 'furniture');
  const lighting = findPref('lighting', 'light');
  const mood = findPref('mood', 'style', 'aesthetic');

  const parts = [];
  parts.push(`A ${region} interior moodboard`);
  if (classification) parts.push(`for a ${classification.toLowerCase()} project`);
  if (tier) parts.push(`(tier: ${tier})`);
  if (construction) parts.push(`set in a ${construction.toLowerCase()} structure`);
  if (sqft) parts.push(`approximately ${sqft} sqft`);
  if (palette) parts.push(`palette of ${palette}`);
  if (materials) parts.push(`materials including ${materials}`);
  if (furnishing) parts.push(`furnished with ${furnishing}`);
  if (lighting) parts.push(`lighting: ${lighting}`);
  if (mood) parts.push(`overall mood ${mood}`);
  parts.push('photorealistic interior design moodboard, late afternoon natural light');

  // Aspect-ratio heuristic: wide for living spaces, square for detail
  // shots. Default to 4:3 which Nanobanana renders cleanly.
  const aspect = '4:3';

  return {
    prompt: parts.join(', ') + '.',
    suggestedAspectRatio: aspect,
    styleNotes: [
      classification ? `Classification ${classification}` : null,
      tier ? `Tier ${tier}` : null,
      palette ? 'Palette derived from owner preferences' : null,
    ].filter(Boolean),
  };
}

// ────────────────── public API ──────────────────

async function buildMoodboardPrompt({ projectContext } = {}) {
  if (!projectContext || typeof projectContext !== 'object') {
    throw new Error('buildMoodboardPrompt: projectContext is required');
  }

  const start = Date.now();

  // ── cache (skip in fallback path — fallback is deterministic and
  // cheap, no need to round-trip disk) ──
  const key = cacheKey(projectContext);
  const hit = cache[key];
  if (hit) {
    return { ...hit, cached: true, durationMs: Date.now() - start };
  }

  // ── stub / fallback path when key is missing ──
  if (!process.env.KIMI_API_KEY) {
    warnStubOnce();
    const fb = fallbackPrompt(projectContext);
    return {
      prompt: fb.prompt,
      suggestedAspectRatio: fb.suggestedAspectRatio,
      styleNotes: fb.styleNotes,
      durationMs: Date.now() - start,
      source: 'template-fallback',
      cached: false,
    };
  }

  // ── Kimi call with retry ──
  const contextSummary = summarizeContext(projectContext);
  let lastErr = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const result = await callKimi(contextSummary);
    if (result.ok) {
      const out = {
        prompt: result.parsed.prompt,
        suggestedAspectRatio: result.parsed.suggestedAspectRatio,
        styleNotes: result.parsed.styleNotes,
        durationMs: result.durationMs,
        source: 'kimi',
        cached: false,
      };
      cache[key] = out;
      writeCache();
      return out;
    }
    lastErr = result;
    if (!isRetryable(result.err) || attempt === MAX_RETRIES - 1) break;
    const delay = 500 * Math.pow(2, attempt);
    console.warn(`[promptbuilder] attempt ${attempt + 1}/${MAX_RETRIES} failed (${result.error}); retrying in ${delay}ms`);
    await sleep(delay);
  }

  // ── Kimi unrecoverable — fall back to template. We still log the
  // failure so ops can spot quota / outage issues. ──
  console.warn('[promptbuilder] Kimi unavailable, using template fallback:', lastErr?.error);
  const fb = fallbackPrompt(projectContext);
  return {
    prompt: fb.prompt,
    suggestedAspectRatio: fb.suggestedAspectRatio,
    styleNotes: fb.styleNotes,
    durationMs: Date.now() - start,
    source: 'template-fallback',
    error: lastErr?.error || null,
    cached: false,
  };
}

// ══════════════════ design-be-14: furnishing prompt ══════════════════
//
// Second-stage floor-plan pass. Given a clean architectural plan + an
// approved moodboard reference image, Kimi synthesises a prompt that
// tells Nanobanana to overlay furniture/fixtures onto the plan in the
// moodboard's aesthetic. Mirrors buildMoodboardPrompt's shape:
// Kimi-with-template-fallback, kind-tagged disk cache, same retry &
// JSON-parsing helpers.
//
// Caller contract (projectContext, moodboardContext):
//   projectContext  — same flat blob as buildMoodboardPrompt (used for
//                     classification, goals, preferences).
//   moodboardContext — { id?, name?, version_number?, captions[],
//                        sentAt?, approvedAt?, linkCount? }. Captions
//                     are the strongest signal — the model echoes their
//                     tone into the furniture choices.

function summarizeFurnishingContext(projectContext, moodboardContext) {
  // Reuse the moodboard summariser for the project half — same fields,
  // same emphasis. Then bolt on a moodboard section describing the
  // approved reference.
  const projectBlock = summarizeContext(projectContext || {});
  const lines = [projectBlock];
  const mb = moodboardContext || {};
  const captions = Array.isArray(mb.captions) ? mb.captions.filter((c) => typeof c === 'string' && c.trim()) : [];
  if (mb.name || mb.version_number || captions.length > 0) {
    lines.push('');
    lines.push('# Approved moodboard (style reference)');
    if (mb.name) lines.push(`- Name: ${mb.name}`);
    if (mb.version_number) lines.push(`- Version: ${mb.version_number}`);
    if (mb.approvedAt) lines.push(`- Approved: ${mb.approvedAt}`);
    if (captions.length > 0) {
      lines.push('- Inspiration captions:');
      for (const c of captions.slice(0, 12)) lines.push(`  - ${c}`);
    }
  }
  lines.push('');
  lines.push('# Task');
  lines.push('Place furniture, lighting, soft furnishings, and fixtures on the clean architectural floor plan that will be supplied as an inline image. The moodboard reference image will also be supplied inline — match its palette, materials, and styling. Walls, doors, and windows must stay untouched. Use top-down architectural symbols.');
  return lines.join('\n');
}

function fallbackFurnishingPrompt(projectContext, moodboardContext) {
  const ctx = projectContext || {};
  const mb = moodboardContext || {};
  const project = ctx.project || {};
  const property = ctx.property || {};
  const preferences = ctx.preferences || {};
  const classification = ctx.classification || project.classification || null;
  const tier = ctx.tier || project.tier || null;

  const findPref = (...names) => {
    for (const n of names) {
      const v = preferences[n];
      const rendered = renderPreferenceValue(v);
      if (rendered) return rendered;
    }
    return null;
  };
  const palette = findPref('palette', 'colour_palette', 'colours');
  const materials = findPref('materials', 'finishes');
  const furnishing = findPref('furnishing', 'furniture');
  const mood = findPref('mood', 'style', 'aesthetic');

  const captionHint = Array.isArray(mb.captions) && mb.captions.length > 0
    ? mb.captions.slice(0, 3).join('; ')
    : null;

  const parts = [];
  parts.push('Top-down architectural floor plan with furniture symbols overlaid');
  if (classification) parts.push(`for a ${String(classification).toLowerCase()} project`);
  if (tier) parts.push(`(tier ${tier})`);
  if (property.sqft) parts.push(`approximately ${property.sqft} sqft`);
  parts.push('place beds in bedrooms, sofas and coffee tables in living areas, dining tables in dining rooms, and appropriate fixtures in kitchens and bathrooms');
  if (furnishing) parts.push(`furniture style: ${furnishing}`);
  if (palette) parts.push(`palette of ${palette}`);
  if (materials) parts.push(`material accents including ${materials}`);
  if (mood) parts.push(`overall mood ${mood}`);
  if (captionHint) parts.push(`echoing the approved moodboard (${captionHint})`);
  parts.push('keep walls doors and windows exactly as drawn, clean line work, soft fill colours, no shadows or photorealistic rendering');

  return {
    prompt: parts.join(', ') + '.',
    suggestedAspectRatio: '4:3',
    styleNotes: [
      classification ? `Classification ${classification}` : null,
      palette ? 'Palette derived from owner preferences' : null,
      captionHint ? 'Furniture inflected by approved moodboard captions' : null,
    ].filter(Boolean),
  };
}

async function buildFurnishingPrompt({ projectContext, moodboardContext } = {}) {
  if (!projectContext || typeof projectContext !== 'object') {
    throw new Error('buildFurnishingPrompt: projectContext is required');
  }

  const start = Date.now();

  // Kind-tag the cache so we never serve a moodboard prompt where the
  // caller wanted a furnishing prompt.
  const key = cacheKey({ projectContext, moodboardContext: moodboardContext || null }, 'furnishing');
  const hit = cache[key];
  if (hit) {
    return { ...hit, cached: true, durationMs: Date.now() - start };
  }

  if (!process.env.KIMI_API_KEY) {
    warnStubOnce();
    const fb = fallbackFurnishingPrompt(projectContext, moodboardContext);
    return {
      prompt: fb.prompt,
      suggestedAspectRatio: fb.suggestedAspectRatio,
      styleNotes: fb.styleNotes,
      durationMs: Date.now() - start,
      source: 'template-fallback',
      cached: false,
    };
  }

  const contextSummary = summarizeFurnishingContext(projectContext, moodboardContext);
  let lastErr = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const result = await callKimi(contextSummary, FURNISHING_SYSTEM_PROMPT);
    if (result.ok) {
      const out = {
        prompt: result.parsed.prompt,
        suggestedAspectRatio: result.parsed.suggestedAspectRatio,
        styleNotes: result.parsed.styleNotes,
        durationMs: result.durationMs,
        source: 'kimi',
        cached: false,
      };
      cache[key] = out;
      writeCache();
      return out;
    }
    lastErr = result;
    if (!isRetryable(result.err) || attempt === MAX_RETRIES - 1) break;
    const delay = 500 * Math.pow(2, attempt);
    console.warn(`[promptbuilder] furnishing attempt ${attempt + 1}/${MAX_RETRIES} failed (${result.error}); retrying in ${delay}ms`);
    await sleep(delay);
  }

  console.warn('[promptbuilder] Kimi unavailable for furnishing prompt, using template fallback:', lastErr?.error);
  const fb = fallbackFurnishingPrompt(projectContext, moodboardContext);
  return {
    prompt: fb.prompt,
    suggestedAspectRatio: fb.suggestedAspectRatio,
    styleNotes: fb.styleNotes,
    durationMs: Date.now() - start,
    source: 'template-fallback',
    error: lastErr?.error || null,
    cached: false,
  };
}

function getCacheStats() {
  return { size: Object.keys(cache).length, file: CACHE_FILE };
}

module.exports = {
  buildMoodboardPrompt,
  buildFurnishingPrompt,
  getCacheStats,
  // exposed for tests / debugging — not part of the public contract
  _cacheKey: cacheKey,
  _summarizeContext: summarizeContext,
  _summarizeFurnishingContext: summarizeFurnishingContext,
  _fallbackPrompt: fallbackPrompt,
  _fallbackFurnishingPrompt: fallbackFurnishingPrompt,
};
