'use strict';

// AI Annex B edit (first W-class AI in the design module).
//
// Annex B holds the project-specific terms inside an interior-design
// agreement: client identity, classification, tier, fees, dates,
// and a free-text customInclusions block + two boolean flags.
//
// This endpoint lets the user type a natural-language instruction —
// "shorten the carve-out", "add a clause about kitchen plumbing" —
// and Kimi proposes a mutation set bounded to a safe subset. Fees,
// EPC, tier, and classification are NEVER mutated by AI (they
// derive from the rate table + project state, and getting them wrong
// has financial consequences). Dates and the narrative-ish fields
// are fair game.
//
// Contract:
//   POST /api/design/ai/annex-b-edit
//   Body: { project_id, current_annex_b, instruction }
//   Returns: { proposed: {…}, reasoning: string, confidence: 'high'|'medium'|'low', source, durationMs }
//
// The user reviews the proposed diff and clicks Apply. The mutation
// is applied locally to the Annex B form state — there's no server
// write here. The existing "Send for signature" flow persists.

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
const KIMI_MODEL = process.env.KIMI_MODEL || 'moonshot-v1-8k';
const MAX_RETRIES = 2;
const TIMEOUT_MS = 30_000;

// Fields the AI is allowed to propose changes to. Anything outside
// this set is stripped from the response before it returns to the
// frontend. Keep this tight on purpose — Annex B is contractual.
const ALLOWED_FIELDS = new Set([
  'customInclusions',
  'saleOfFurniture',
  'strWorkingCapital',
  'startDate',
  'estimatedCompletion',
]);

// System prompt built per request so per-tenant config (mig 035) can
// thread company name + locale phrasing. See ai_rough_budget.js for the
// rationale on the Mauritius-mention heuristic.
function buildSystemPrompt(config) {
  const company = config.company_name || 'the';
  const isMU = (config.legal_jurisdiction_text || '').includes('Mauritius');
  const localePhrase = isMU ? ' in Mauritius' : '';
  return `You are ${company}'s Annex B (project terms) editor for interior-design contracts${localePhrase}.

The user gives you an instruction ("shorten clause 7", "add a custom inclusion about kitchen plumbing", "move start date to mid-July"). You propose a JSON mutation to the Annex B fields.

Output ONLY a JSON object with this shape:
{
  "proposed": {
    "customInclusions": "<full replacement string OR null to clear>" | undefined,
    "saleOfFurniture": true | false | undefined,
    "strWorkingCapital": true | false | undefined,
    "startDate": "YYYY-MM-DD" | null | undefined,
    "estimatedCompletion": "YYYY-MM-DD" | null | undefined
  },
  "reasoning": "<one-paragraph explanation tying the proposal to the user's instruction>",
  "confidence": "high" | "medium" | "low"
}

STRICT RULES:
1. You may only propose changes to: customInclusions, saleOfFurniture, strWorkingCapital, startDate, estimatedCompletion. Other Annex B fields (clientName, address, NIC, classification, tier, EPC, design / procurement fees, effectiveDate) are read-only — they're derived from project state or set by the director and not safe to AI-mutate.
2. If the instruction asks you to change a field outside that set, return proposed: {} and explain why in reasoning. Don't refuse rudely; the team uses you in flow.
3. customInclusions is a free-text addendum — usually 1–4 sentences. When the user asks to "add" something, return the FULL new string (existing text + your addition). When they ask to "remove" or "shorten", return the trimmed full string.
4. Dates are calendar dates in YYYY-MM-DD form. Assume the current year unless the user is explicit.
5. confidence = "high" when the instruction is unambiguous and within scope; "medium" when you had to guess phrasing; "low" when the instruction is ambiguous or partially out of scope.
6. Never invent contractual obligations not implied by the instruction. If the user says "add carve-out for kitchen", don't also add scope changes to bathrooms.
7. Return ONLY the JSON object. No prose before or after.`;
}

function parseModelJson(raw) {
  if (typeof raw !== 'string') return null;
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
        temperature: 0.3,
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
    if (!parsed) return { ok: false, error: 'Kimi returned unparseable JSON', durationMs: Date.now() - start, data };
    return { ok: true, parsed, durationMs: Date.now() - start, data };
  } catch (e) {
    return { ok: false, error: e.response?.data?.error?.message || e.message, durationMs: Date.now() - start, err: e };
  }
}

// Strip any keys outside ALLOWED_FIELDS + coerce types. The model
// may attempt to propose fee changes; we silently drop them here so
// the response is always safe to apply.
function shapeProposed(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const key of Object.keys(raw)) {
    if (!ALLOWED_FIELDS.has(key)) continue;
    const v = raw[key];
    if (key === 'customInclusions') {
      if (v === null || typeof v === 'string') out[key] = v;
      continue;
    }
    if (key === 'saleOfFurniture' || key === 'strWorkingCapital') {
      if (typeof v === 'boolean') out[key] = v;
      continue;
    }
    if (key === 'startDate' || key === 'estimatedCompletion') {
      if (v === null) { out[key] = null; continue; }
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) out[key] = v;
      continue;
    }
  }
  return out;
}

router.post('/annex-b-edit', requireDesignPerm('design:write'), async (req, res) => {
  try {
    const { project_id, current_annex_b, instruction } = req.body || {};
    if (!project_id) return res.status(400).json({ error: 'project_id is required' });
    if (!instruction || typeof instruction !== 'string' || !instruction.trim()) {
      return res.status(400).json({ error: 'instruction is required (one-line description of what to change)' });
    }
    if (!current_annex_b || typeof current_annex_b !== 'object') {
      return res.status(400).json({ error: 'current_annex_b is required (the form state being edited)' });
    }

    const ownerCheck = await query(
      `SELECT 1 FROM design_projects WHERE tenant_id = $1 AND id = $2`,
      [req.tenantId, project_id],
    );
    if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Project not found' });

    const start = Date.now();

    // No KIMI_API_KEY → templated "AI unavailable" response. Still
    // returns 200 so the frontend can render the proposal panel and
    // show a helpful message rather than a generic fetch error.
    if (!process.env.KIMI_API_KEY) {
      return res.json({
        proposed: {},
        reasoning: 'AI is not available right now (KIMI_API_KEY unset). Make the edit manually in the Annex B form above.',
        confidence: 'low',
        source: 'template-fallback',
        durationMs: Date.now() - start,
      });
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

    const userContent = JSON.stringify({
      instruction: instruction.trim(),
      current_annex_b,
      allowed_fields: Array.from(ALLOWED_FIELDS),
    }, null, 2);

    const tenantConfig = await loadTenantConfig(req.tenantId);
    const systemPrompt = buildSystemPrompt(tenantConfig);

    let lastErr = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const result = await callKimi(systemPrompt, userContent);
      if (result.ok) {
        const parsed = result.parsed;
        const proposed = shapeProposed(parsed.proposed);
        const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : '';
        const confidence = ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium';
        // Log usage on success.
        const usage = parseKimiUsage(result.data);
        recordUsage({
          tenantId: req.tenantId,
          userId: req.identity?.userId,
          feature: 'ai_annex_b_edit',
          provider: 'kimi',
          model: KIMI_MODEL,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
          durationMs: result.durationMs,
          success: true,
          requestContext: { project_id, confidence },
        }).catch(() => {});
        return res.json({
          proposed,
          reasoning,
          confidence,
          source: 'kimi',
          durationMs: Date.now() - start,
        });
      }
      lastErr = result;
      if (!isRetryable(result.err)) break;
      await sleep(400 * (attempt + 1));
    }

    // Failure — log so the cap reflects retries.
    recordUsage({
      tenantId: req.tenantId,
      userId: req.identity?.userId,
      feature: 'ai_annex_b_edit',
      provider: 'kimi',
      model: KIMI_MODEL,
      durationMs: Date.now() - start,
      success: false,
      errorCode: String(lastErr?.err?.response?.status || lastErr?.error || 'unknown_error').slice(0, 64),
      requestContext: { project_id },
    }).catch(() => {});

    return res.status(502).json({
      error: lastErr?.error || 'Kimi call failed',
      source: 'kimi-error',
      durationMs: Date.now() - start,
    });
  } catch (e) {
    console.error('[design/ai/annex-b-edit] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
