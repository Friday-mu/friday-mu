'use strict';

// Per-tenant AI cost monitoring (mig 038).
//
// Three public surfaces:
//
//   recordUsage({ tenantId, feature, provider, model, ... })
//     Insert one ai_usage row. Computes cost_minor_usd from the rate
//     table below; never throws — a usage-log write failure should
//     NEVER block the user-facing AI call from returning success.
//
//   getMonthlyUsage(tenantId)
//     Aggregate the current billing period's spend / call count /
//     by-feature breakdown. Used by /tenants/me/ai-usage and the
//     FR-only /tenants/admin/ai-usage view.
//
//   enforceQuota(tenantId)
//     Cheap guard the caller runs BEFORE making the upstream AI
//     request. Reads from a 60s in-process cache. Throws
//     QuotaExceededError when the tenant has burned through their
//     monthly_ai_cost_cap_minor_usd. Callers convert the error to
//     HTTP 402.
//
// Rate table — USD per million tokens (or per image for nanobanana):
//
//   gemini-2.5-flash                $0.075 input / $0.30 output
//   gemini-2.5-flash-image-preview  flat $0.05 per image (v1 simplification —
//                                   real billing is per image token at
//                                   ~$30/M; a typical 1024px image is
//                                   ~1290 tokens => $0.039, so 5¢ is a
//                                   modest over-estimate that protects us)
//   moonshot-v1-8k                  $0.0014 input / $0.0014 output per K
//                                   tokens => $1.40 / $1.40 per M
//   moonshot-v1-32k                 $0.0024 / $0.0024 per K (same shape)
//   moonshot-v1-128k                $0.0060 / $0.0060 per K
//
// Costs land in cents USD (minor units) with at-least-1¢ rounding when
// the call is non-stub — so a 0.01¢ call still costs 1¢. Better to
// slightly over-charge than to silently zero out high-volume cheap
// calls.

const { query } = require('../database/client');

// Cost rates per provider/model. Numbers are USD-per-unit; the
// resolver converts to cents-per-call.
const RATE_TABLE = {
  // Per 1M tokens (input, output).
  'gemini-2.5-flash':              { kind: 'text',  inputUsdPerM:  0.075, outputUsdPerM: 0.30 },
  'gemini-2.5-flash-lite':         { kind: 'text',  inputUsdPerM:  0.04,  outputUsdPerM: 0.15 },
  'gemini-2.5-pro':                { kind: 'text',  inputUsdPerM:  1.25,  outputUsdPerM: 5.0 },
  // Nanobanana — flat per image. The Gemini image preview tokens are
  // ~$30/M (1290 tokens ≈ $0.039 per 1024px), but v1 we just charge
  // a clean 5¢ per generation to avoid token-parsing the inlineData
  // response shape.
  'gemini-2.5-flash-image-preview':{ kind: 'image', flatUsdPerImage: 0.05 },
  'imagen-3.0-generate-002':       { kind: 'image', flatUsdPerImage: 0.04 },
  // Moonshot / Kimi text models — pricing per Moonshot pricing page.
  'moonshot-v1-8k':                { kind: 'text',  inputUsdPerM:  1.40,  outputUsdPerM: 1.40 },
  'moonshot-v1-32k':               { kind: 'text',  inputUsdPerM:  2.40,  outputUsdPerM: 2.40 },
  'moonshot-v1-128k':              { kind: 'text',  inputUsdPerM:  6.00,  outputUsdPerM: 6.00 },
};

// Unknown model? Default to a moderate text rate so we still capture
// SOMETHING. Better than silently zero. Surface a console warning so
// ops can extend RATE_TABLE.
const UNKNOWN_MODEL_RATE = { kind: 'text', inputUsdPerM: 0.30, outputUsdPerM: 1.0 };
const _warnedModels = new Set();

// Convert USD cents (fractional ok) to integer minor-units (cents).
// Round to nearest, but never floor a non-zero call to zero — that
// would let a million cheap calls hide in the noise.
function _usdCentsToInteger(cents) {
  if (!Number.isFinite(cents) || cents <= 0) return 0;
  const rounded = Math.round(cents);
  return rounded === 0 ? 1 : rounded;
}

function computeCostMinorUsd({ model, promptTokens, completionTokens, totalTokens, kind }) {
  let rate = RATE_TABLE[model];
  if (!rate) {
    if (!_warnedModels.has(model)) {
      _warnedModels.add(model);
      console.warn(`[ai_usage] unknown model "${model}" — using default text rate. Extend RATE_TABLE in backend/src/tenants/ai_usage.js.`);
    }
    rate = UNKNOWN_MODEL_RATE;
  }
  // Image generation — flat per call.
  if (rate.kind === 'image' || kind === 'image') {
    const usd = rate.flatUsdPerImage ?? 0.05;
    return _usdCentsToInteger(usd * 100);
  }
  // Text — token-priced. Some callers only know totalTokens (no split).
  // Treat it as half-input / half-output in that case; better than 0.
  let inTokens = Number(promptTokens) || 0;
  let outTokens = Number(completionTokens) || 0;
  if (!inTokens && !outTokens && Number(totalTokens) > 0) {
    inTokens = Math.floor(totalTokens / 2);
    outTokens = totalTokens - inTokens;
  }
  const usdIn = (inTokens / 1_000_000) * rate.inputUsdPerM;
  const usdOut = (outTokens / 1_000_000) * rate.outputUsdPerM;
  return _usdCentsToInteger((usdIn + usdOut) * 100);
}

// ────────────────── recordUsage ──────────────────
//
// Never throws. A failed insert is logged + dropped — we don't let
// the usage-log become a load-bearing dependency of the user-facing
// AI call. Quota-enforcement runs BEFORE the call, so a missed log
// row only means the *next* call's quota check is slightly stale.

async function recordUsage({
  tenantId,
  userId = null,
  feature,
  provider,
  model,
  promptTokens = null,
  completionTokens = null,
  totalTokens = null,
  durationMs = null,
  success = true,
  errorCode = null,
  requestContext = {},
  // Allow callers to force the cost computation kind when their
  // provider response doesn't carry tokens (image gen).
  kind = null,
  // Override the computed cost (useful for stub/cached paths that
  // shouldn't get charged). When null, falls back to the rate-table
  // computation.
  costMinorUsdOverride = null,
} = {}) {
  if (!tenantId || !feature || !provider || !model) {
    console.warn('[ai_usage.recordUsage] missing required field(s); dropping log entry', { tenantId, feature, provider, model });
    return null;
  }
  const cost = costMinorUsdOverride != null
    ? Math.max(0, Math.round(Number(costMinorUsdOverride)))
    : computeCostMinorUsd({ model, promptTokens, completionTokens, totalTokens, kind });
  try {
    const { rows } = await query(
      `INSERT INTO ai_usage
         (tenant_id, user_id, feature, provider, model,
          prompt_tokens, completion_tokens, total_tokens,
          cost_minor_usd, duration_ms, success, error_code, request_context)
       VALUES ($1, $2, $3, $4, $5,
               $6, $7, $8,
               $9, $10, $11, $12, $13::jsonb)
       RETURNING id, cost_minor_usd, created_at`,
      [
        tenantId,
        userId,
        feature,
        provider,
        model,
        promptTokens,
        completionTokens,
        totalTokens,
        cost,
        durationMs,
        !!success,
        errorCode,
        JSON.stringify(requestContext || {}),
      ],
    );
    // Successful insert → bust the quota cache so the next
    // enforceQuota() in this process sees the new total.
    _invalidateQuotaCache(tenantId);
    return rows[0];
  } catch (e) {
    // 42P01 = relation does not exist (migration 038 not run). Log
    // once + move on — production sees this exactly once per process
    // restart before the migration lands.
    if (e.code === '42P01') {
      if (!_warnedMissingTable) {
        _warnedMissingTable = true;
        console.warn('[ai_usage.recordUsage] ai_usage table missing — run migration 038. Subsequent log entries silently dropped.');
      }
      return null;
    }
    console.error('[ai_usage.recordUsage] insert failed:', e.message);
    return null;
  }
}
let _warnedMissingTable = false;

// ────────────────── getMonthlyUsage ──────────────────
//
// Period boundary: prefer tenants.ai_quota_period_start (so cap +
// rollover stay in sync); fall back to the calendar-month UTC start
// when null. The first call of a billing cycle stamps the column via
// the period helper below.

async function _resolvePeriodStart(tenantId) {
  try {
    const { rows } = await query(
      `SELECT ai_quota_period_start FROM tenants WHERE id = $1`,
      [tenantId],
    );
    const stored = rows[0]?.ai_quota_period_start;
    if (stored) {
      // Postgres returns DATE as a JS Date in UTC.
      return new Date(stored);
    }
  } catch (e) {
    // 42703 = column missing (mig 038 not applied) — fall through
    // to calendar-month default. Don't spam logs here, recordUsage
    // already warned on the table-missing case.
    if (e.code !== '42703') {
      console.warn('[ai_usage._resolvePeriodStart] tenant fetch failed:', e.message);
    }
  }
  // Default — first day of current UTC month.
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function getMonthlyUsage(tenantId) {
  if (!tenantId) return { total_cost_minor_usd: 0, total_calls: 0, by_feature: {}, period_start: null };
  const periodStart = await _resolvePeriodStart(tenantId);
  try {
    const totalsP = query(
      `SELECT
         COALESCE(SUM(cost_minor_usd), 0)::bigint AS total_cost,
         COUNT(*)::int AS total_calls
       FROM ai_usage
       WHERE tenant_id = $1 AND created_at >= $2`,
      [tenantId, periodStart],
    );
    const byFeatureP = query(
      `SELECT feature,
              COUNT(*)::int AS calls,
              COALESCE(SUM(cost_minor_usd), 0)::bigint AS cost_minor_usd
       FROM ai_usage
       WHERE tenant_id = $1 AND created_at >= $2
       GROUP BY feature`,
      [tenantId, periodStart],
    );
    const [totalsRes, byFeatureRes] = await Promise.all([totalsP, byFeatureP]);
    const totals = totalsRes.rows[0] || { total_cost: 0, total_calls: 0 };
    const by_feature = {};
    for (const r of byFeatureRes.rows) {
      by_feature[r.feature] = {
        calls: r.calls,
        cost_minor_usd: Number(r.cost_minor_usd),
      };
    }
    return {
      total_cost_minor_usd: Number(totals.total_cost),
      total_calls: totals.total_calls,
      by_feature,
      period_start: periodStart.toISOString(),
    };
  } catch (e) {
    if (e.code === '42P01') {
      // Table not migrated yet — return zeros so callers can render.
      return {
        total_cost_minor_usd: 0,
        total_calls: 0,
        by_feature: {},
        period_start: periodStart.toISOString(),
      };
    }
    console.error('[ai_usage.getMonthlyUsage] error:', e.message);
    throw e;
  }
}

// ────────────────── enforceQuota ──────────────────
//
// 60-second per-tenant cache. We don't need second-precision here —
// the alternative (DB roundtrip per AI call) is wasted load given
// how spiky AI usage is. Worst case after a hit, a tenant gets 60s
// of grace beyond their cap. Acceptable.

const QUOTA_CACHE_TTL_MS = 60 * 1000;
const _quotaCache = new Map(); // tenantId → { exceeded, totalCost, cap, expiresAt }

function _invalidateQuotaCache(tenantId) {
  _quotaCache.delete(tenantId);
}

class QuotaExceededError extends Error {
  constructor(message, { tenantId, totalCostMinorUsd, capMinorUsd } = {}) {
    super(message);
    this.name = 'QuotaExceededError';
    this.code = 'QUOTA_EXCEEDED';
    this.tenantId = tenantId;
    this.totalCostMinorUsd = totalCostMinorUsd;
    this.capMinorUsd = capMinorUsd;
  }
}

async function _fetchQuotaState(tenantId) {
  let cap = null;
  try {
    const { rows } = await query(
      `SELECT monthly_ai_cost_cap_minor_usd FROM tenants WHERE id = $1`,
      [tenantId],
    );
    cap = rows[0]?.monthly_ai_cost_cap_minor_usd;
    if (cap != null) cap = Number(cap);
  } catch (e) {
    if (e.code !== '42703') {
      console.warn('[ai_usage._fetchQuotaState] cap fetch failed:', e.message);
    }
  }
  // No cap configured → enforce a generous default so we still
  // catch runaway loops while permitting normal use.
  if (!Number.isFinite(cap) || cap < 0) cap = 1000;
  const usage = await getMonthlyUsage(tenantId);
  return {
    exceeded: usage.total_cost_minor_usd >= cap,
    totalCost: usage.total_cost_minor_usd,
    cap,
  };
}

async function enforceQuota(tenantId) {
  if (!tenantId) return; // No tenant ctx → skip; downstream auth handles.
  const cached = _quotaCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.exceeded) {
      throw new QuotaExceededError(
        `Monthly AI cost cap reached ($${(cached.totalCost / 100).toFixed(2)} of $${(cached.cap / 100).toFixed(2)}). Upgrade or contact support.`,
        { tenantId, totalCostMinorUsd: cached.totalCost, capMinorUsd: cached.cap },
      );
    }
    return;
  }
  const state = await _fetchQuotaState(tenantId);
  _quotaCache.set(tenantId, { ...state, expiresAt: Date.now() + QUOTA_CACHE_TTL_MS });
  if (state.exceeded) {
    throw new QuotaExceededError(
      `Monthly AI cost cap reached ($${(state.totalCost / 100).toFixed(2)} of $${(state.cap / 100).toFixed(2)}). Upgrade or contact support.`,
      { tenantId, totalCostMinorUsd: state.totalCost, capMinorUsd: state.cap },
    );
  }
}

// ────────────────── token-shape helpers ──────────────────
//
// Each provider returns token counts in a different envelope. These
// helpers extract { promptTokens, completionTokens, totalTokens }
// from the raw response so callers don't have to litter knowledge of
// each shape across the codebase.
//
//   parseGeminiUsage(geminiResponseData)
//     candidates[0].finishReason etc + usageMetadata: {
//       promptTokenCount, candidatesTokenCount, totalTokenCount }
//
//   parseKimiUsage(kimiResponseData)
//     OpenAI-shape: usage: {
//       prompt_tokens, completion_tokens, total_tokens }
//
//   parseNanobananaUsage(generateImageResult)
//     Nanobanana's generateImage() wrapper returns { sha256, byteSize,
//     stub, cached, durationMs }. No tokens — image-based pricing is
//     flat per call. We surface byteSize so the rate table can
//     evolve to per-byte pricing later without API changes.

function parseGeminiUsage(data) {
  const um = data?.usageMetadata || {};
  return {
    promptTokens: Number(um.promptTokenCount) || null,
    completionTokens: Number(um.candidatesTokenCount) || null,
    totalTokens: Number(um.totalTokenCount) || null,
  };
}

function parseKimiUsage(data) {
  const u = data?.usage || {};
  return {
    promptTokens: Number(u.prompt_tokens) || null,
    completionTokens: Number(u.completion_tokens) || null,
    totalTokens: Number(u.total_tokens) || null,
  };
}

function parseNanobananaUsage(result) {
  return {
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    byteSize: result?.byteSize || null,
  };
}

module.exports = {
  recordUsage,
  getMonthlyUsage,
  enforceQuota,
  QuotaExceededError,
  computeCostMinorUsd,
  parseGeminiUsage,
  parseKimiUsage,
  parseNanobananaUsage,
  RATE_TABLE,
  // For tests / debugging only.
  _invalidateQuotaCache,
};
