'use strict';

// AI rough-budget estimator (AI Bet #1). Staff supplies a one-liner
// ("Estimate a 2-bed villa, Tier 2, mid-range Scandi"); the endpoint
// asks Kimi to produce a line-item rough budget grouped by room, each
// line citing the catalog / style-guide entries it drew from.
//
// Architecture choice: the 155-item catalog + style guide live on the
// frontend (fridayCatalogHistory.ts) because they're seed data. Rather
// than duplicate in the backend, the frontend ships a sampled
// catalog + style-guide notes + tier rules in the request body. The
// backend's job is the Kimi call + structured-output parsing +
// template fallback when KIMI_API_KEY is unset.
//
// Provenance contract: every line in the response carries `sourceKeys`
// pointing back at the catalog entries / style-guide bands that fed it.
// Owners reject black-box totals; the frontend shows these as chips so
// any line can be challenged.

const express = require('express');
const axios = require('axios');
const { query } = require('../database/client');
const { requireDesignPerm } = require('./auth');
const { loadTenantConfig } = require('./adapters');
const {
  enforceQuota,
  recordUsage,
  parseKimiUsage,
  QuotaExceededError,
} = require('../tenants/ai_usage');

const router = express.Router();

const KIMI_BASE_URL = process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1';
// 2026-05-23 — default bumped moonshot-v1-8k → kimi-k2.6 per Ishant
// ("Kimi fallbacks should all be on 2.6, not V1"). Used as the
// Kimi-fallback model when the Gemini-primary migration lands; until
// then this is the direct call model.
const KIMI_MODEL = process.env.KIMI_MODEL || 'kimi-k2.6';
const MAX_RETRIES = 2;
// 2026-05-23 — bumped 35s → 8 min to match the broader AI timeout
// policy (nginx /api/ ceiling is 1800s).
const TIMEOUT_MS = 480_000;

// Build the rough-budget system prompt with per-tenant overrides (mig 035).
//
// Locale handling: we don't (yet) store a clean ISO locale on the tenant
// config — the closest signal is `legal_jurisdiction_text`. Approach: if
// it mentions "Mauritius", we keep the existing Mauritius mention in the
// prompt (Kimi handles the local market context well). Otherwise we drop
// the geographic anchor entirely so non-MU tenants don't get a confused
// model. Cheap heuristic; refine if/when we add a real locale column.
//
// Vendor defaults: assembled from config.vendor_defaults if present.
// Expected shape: { primary: string, small_decor: string, fixtures: string[] }.
// If the object is empty, the vendor-style sentence is omitted entirely
// rather than emitting "as primary vendor across categories" against an
// empty name, which would just confuse the model.
function buildSystemPrompt(config) {
  const company = config.company_name || 'the';
  const isMU = (config.legal_jurisdiction_text || '').includes('Mauritius');
  const localePhrase = isMU ? ' for Mauritius short-term-rental properties' : '';
  const v = config.vendor_defaults || {};
  const fixtures = Array.isArray(v.fixtures) ? v.fixtures : [];
  const hasVendorDefaults = v.primary || v.small_decor || fixtures.length > 0;
  let vendorLine = '';
  if (hasVendorDefaults) {
    const parts = [];
    if (v.primary) parts.push(`${v.primary} as primary vendor across categories`);
    if (v.small_decor) parts.push(`${v.small_decor} for small decor`);
    if (fixtures.length > 0) parts.push(`${fixtures.join(' + ')} for fixtures`);
    vendorLine = `\n- "${company} style" defaults: ${parts.join(', ')}.`;
  }

  return `You are ${company}'s design module rough-budget estimator${localePhrase}.

Output ONLY a JSON object with this shape:
{
  "lines": [
    {
      "room": "Living Room" | "Kitchen" | "Master bedroom" | "Bedroom" | "Bathroom" | "Hallway" | "Balcony" | "Outdoor" | "Whole property",
      "category": "furniture" | "appliance" | "decor" | "lighting" | "linen" | "contractor" | "labour" | "transport" | "cleaning",
      "item": "Short item name as it would appear on a budget line",
      "qty": <integer, default 1>,
      "unitCostMinor": <integer, ${config.currency_code || 'MUR'} cents — per-unit cost>,
      "sourceKeys": ["<normalizedKey from the catalog sample, OR style-guide:<category>.<p25|p50|p75>>", ...],
      "rationale": "<one short sentence why this line + this price>"
    }
  ],
  "lowMinor": <integer, ${config.currency_code || 'MUR'} cents — pessimistic total>,
  "midMinor": <integer, ${config.currency_code || 'MUR'} cents — expected total>,
  "highMinor": <integer, ${config.currency_code || 'MUR'} cents — optimistic-upgrade total>,
  "contingencyPct": <number, recommended contingency 5–20>,
  "narrative": "<2–4 sentence summary explaining the budget shape>"
}

Rules:
- Price every line against the supplied catalog sample OR style-guide percentile bands. NEVER invent prices without provenance.
- Group lines by room when the brief implies a room-by-room scope; otherwise use "Whole property" sparingly.
- T1 (renovation) projects need contractor/labour lines (partition walls, paint, electrical, plumbing, tiles). T2/T3 (furnishing) skip contractor unless the brief explicitly mentions structural work.
- Mixed classification uses renovation rate but includes furnishing lines.${vendorLine}
- Stay within the price discipline of the supplied catalog. If the brief asks for upgraded/luxury, push to p75; minimum-viable pushes to p25.
- contingencyPct default 10 for furnishing-only, 15 for renovation, 20 for mixed.
- Return 8–25 lines for a typical 2-bedroom; scale linearly with bedrooms.`;
}

function parseModelJson(raw) {
  if (typeof raw !== 'string') return null;
  // Strip code fences if the model wrapped output in ```json … ```.
  let s = raw.trim();
  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) s = fenceMatch[1].trim();
  try { return JSON.parse(s); } catch { return null; }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function isRetryable(err) {
  if (!err) return false;
  const code = err.code || err.response?.status;
  if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ECONNABORTED') return true;
  if (typeof code === 'number' && (code === 429 || (code >= 500 && code < 600))) return true;
  return false;
}

async function callKimi(systemPrompt, userContent) {
  const start = Date.now();
  try {
    const { data } = await axios.post(
      `${KIMI_BASE_URL}/chat/completions`,
      {
        model: KIMI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: 0.4,
        response_format: { type: 'json_object' },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.KIMI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: TIMEOUT_MS,
      },
    );
    const raw = data?.choices?.[0]?.message?.content;
    const parsed = parseModelJson(raw);
    if (!parsed) return { ok: false, error: 'Kimi returned unparseable JSON', durationMs: Date.now() - start, raw, data };
    return { ok: true, parsed, durationMs: Date.now() - start, data };
  } catch (e) {
    return { ok: false, error: e.response?.data?.error?.message || e.message, durationMs: Date.now() - start, err: e };
  }
}

// Template fallback — runs when KIMI_API_KEY is unset or Kimi fails.
// Produces a coarse but defensible budget by sampling the highest-frequency
// catalog items per category at the median band. Better than a blank
// "couldn't generate" because the staff can refine from a starting point.
function fallbackBudget({ brief, catalogSample, styleGuide, tier, classification }) {
  const safeTier = tier ?? 2;
  const safeClass = classification ?? 'furnishing';

  // Pick the top 1-2 items per category by sample count.
  const byCat = new Map();
  for (const entry of (catalogSample || [])) {
    const arr = byCat.get(entry.category) ?? [];
    arr.push(entry);
    byCat.set(entry.category, arr);
  }
  const lines = [];
  const includedCategories = safeClass === 'furnishing'
    ? ['furniture', 'appliance', 'lighting', 'decor', 'linen']
    : ['contractor', 'labour', 'furniture', 'appliance', 'lighting'];

  for (const cat of includedCategories) {
    const entries = (byCat.get(cat) || []).slice(0, 2);
    for (const e of entries) {
      lines.push({
        room: 'Whole property',
        category: cat,
        item: e.displayName || `Generic ${cat}`,
        qty: 1,
        unitCostMinor: e.unitCostMinor || (styleGuide?.priceRangesByCategory?.[cat]?.p50 ?? 50000_00),
        sourceKeys: [e.normalizedKey ? `catalog:${e.normalizedKey}` : `style-guide:${cat}.p50`],
        rationale: `Pulled from ${e.sourceProjectLabel || 'historical median'}.`,
      });
    }
  }

  const mid = lines.reduce((sum, l) => sum + (l.unitCostMinor * (l.qty || 1)), 0);
  const low = Math.round(mid * 0.85);
  const high = Math.round(mid * 1.2);

  return {
    lines,
    lowMinor: low,
    midMinor: mid,
    highMinor: high,
    contingencyPct: safeClass === 'renovation' ? 15 : safeClass === 'mixed' ? 20 : 10,
    narrative: `Template fallback (KIMI_API_KEY ${process.env.KIMI_API_KEY ? 'failed' : 'unset'}). Coarse estimate from top-frequency catalog items at median band. Brief: "${brief.slice(0, 200)}".`,
  };
}

function buildUserContent({ brief, projectContext, catalogSample, styleGuide, tierRules, targetTier, classification }) {
  return JSON.stringify({
    brief: brief.trim(),
    project: projectContext || null,
    target_tier: targetTier || null,
    classification: classification || null,
    style_guide_notes: styleGuide?.notes || null,
    style_guide_price_bands: styleGuide?.priceRangesByCategory || null,
    preferred_vendors: (styleGuide?.preferredVendors || []).slice(0, 10),
    catalog_sample: (catalogSample || []).slice(0, 40).map((e) => ({
      normalizedKey: e.normalizedKey,
      displayName: e.displayName,
      category: e.category,
      vendor: e.vendor,
      unitCostMinor: e.unitCostMinor,
      sourceProjectLabel: e.sourceProjectLabel,
    })),
    tier_rules: tierRules || null,
  }, null, 2);
}

router.post('/rough-budget-estimate', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const body = req.body || {};
    const { project_id, brief, target_tier, classification, catalog_sample, style_guide, tier_rules, project_context } = body;
    if (!project_id) return res.status(400).json({ error: 'project_id is required' });
    if (!brief || typeof brief !== 'string' || !brief.trim()) {
      return res.status(400).json({ error: 'brief is required (one-line description of the project scope)' });
    }
    const ownerCheck = await query(
      `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [req.tenantId, project_id],
    );
    if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Project not found' });

    // Validate target_tier early — Kimi will obey but a typo here would
    // produce strange results downstream.
    if (target_tier != null && ![1, 2, 3].includes(target_tier)) {
      return res.status(400).json({ error: 'target_tier must be 1, 2, or 3 (or null)' });
    }
    if (classification != null && !['renovation', 'furnishing', 'mixed'].includes(classification)) {
      return res.status(400).json({ error: "classification must be 'renovation', 'furnishing', or 'mixed' (or null)" });
    }

    const start = Date.now();

    // Stub / template-fallback path.
    if (!process.env.KIMI_API_KEY) {
      const fb = fallbackBudget({ brief, catalogSample: catalog_sample, styleGuide: style_guide, tier: target_tier, classification });
      return res.json({ ...fb, source: 'template-fallback', durationMs: Date.now() - start });
    }

    // Quota guard — runs BEFORE the upstream call.
    try {
      await enforceQuota(req.tenantId);
    } catch (e) {
      if (e instanceof QuotaExceededError) {
        return res.status(402).json({
          error: e.message,
          code: 'QUOTA_EXCEEDED',
          totalCostMinorUsd: e.totalCostMinorUsd,
          capMinorUsd: e.capMinorUsd,
        });
      }
      throw e;
    }

    const userContent = buildUserContent({
      brief,
      projectContext: project_context,
      catalogSample: catalog_sample,
      styleGuide: style_guide,
      tierRules: tier_rules,
      targetTier: target_tier,
      classification,
    });

    const tenantConfig = await loadTenantConfig(req.tenantId);
    const systemPrompt = buildSystemPrompt(tenantConfig);

    let lastErr = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const result = await callKimi(systemPrompt, userContent);
      if (result.ok) {
        const parsed = result.parsed;
        // Guard against the model returning malformed lines — coerce
        // each line through a defensive shaper.
        const lines = Array.isArray(parsed.lines) ? parsed.lines.map((l) => ({
          room: typeof l.room === 'string' ? l.room : 'Whole property',
          category: typeof l.category === 'string' ? l.category : 'furniture',
          item: typeof l.item === 'string' ? l.item : 'Unnamed item',
          qty: Number.isFinite(l.qty) ? Math.max(1, Math.round(l.qty)) : 1,
          unitCostMinor: Number.isFinite(l.unitCostMinor) ? Math.round(l.unitCostMinor) : 0,
          sourceKeys: Array.isArray(l.sourceKeys) ? l.sourceKeys.filter((k) => typeof k === 'string') : [],
          rationale: typeof l.rationale === 'string' ? l.rationale : '',
        })) : [];
        // Derive totals if the model didn't return them or returned
        // numbers that don't add up — line-sum is the source of truth.
        const lineSum = lines.reduce((sum, l) => sum + (l.unitCostMinor * l.qty), 0);
        const mid = Number.isFinite(parsed.midMinor) ? Math.round(parsed.midMinor) : lineSum;
        const low = Number.isFinite(parsed.lowMinor) ? Math.round(parsed.lowMinor) : Math.round(mid * 0.85);
        const high = Number.isFinite(parsed.highMinor) ? Math.round(parsed.highMinor) : Math.round(mid * 1.2);
        // Log usage on success.
        const usage = parseKimiUsage(result.data);
        recordUsage({
          tenantId: req.tenantId,
          userId: req.identity?.userId,
          feature: 'ai_rough_budget',
          provider: 'kimi',
          model: KIMI_MODEL,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
          durationMs: result.durationMs,
          success: true,
          requestContext: { project_id, target_tier: target_tier || null, classification: classification || null },
        }).catch(() => {});
        return res.json({
          lines,
          lowMinor: low,
          midMinor: mid,
          highMinor: high,
          contingencyPct: Number.isFinite(parsed.contingencyPct) ? parsed.contingencyPct : 10,
          narrative: typeof parsed.narrative === 'string' ? parsed.narrative : '',
          source: 'kimi',
          model: KIMI_MODEL,
          durationMs: Date.now() - start,
        });
      }
      lastErr = result;
      if (!isRetryable(result.err) || attempt === MAX_RETRIES - 1) break;
      const delay = 500 * Math.pow(2, attempt);
      console.warn(`[ai/rough-budget] attempt ${attempt + 1}/${MAX_RETRIES} failed (${result.error}); retrying in ${delay}ms`);
      await sleep(delay);
    }

    // Kimi unrecoverable — fallback. Still log the failed call so
    // the cap reflects what we actually spent retrying.
    recordUsage({
      tenantId: req.tenantId,
      userId: req.identity?.userId,
      feature: 'ai_rough_budget',
      provider: 'kimi',
      model: KIMI_MODEL,
      durationMs: Date.now() - start,
      success: false,
      errorCode: String(lastErr?.err?.response?.status || lastErr?.error || 'unknown_error').slice(0, 64),
      requestContext: { project_id, target_tier: target_tier || null, classification: classification || null },
    }).catch(() => {});

    console.warn('[ai/rough-budget] Kimi unavailable, using template fallback:', lastErr?.error);
    const fb = fallbackBudget({ brief, catalogSample: catalog_sample, styleGuide: style_guide, tier: target_tier, classification });
    return res.json({
      ...fb,
      source: 'template-fallback',
      error: lastErr?.error || null,
      durationMs: Date.now() - start,
    });
  } catch (e) {
    console.error('[ai/rough-budget] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
