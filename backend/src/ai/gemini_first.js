'use strict';

// Shared Gemini-primary / Kimi-fallback completion helper.
// 2026-05-23 — extracted to consolidate the pattern across the 7
// remaining direct-Kimi call sites (ai/translate.js, drafts_send
// translateOutbound, design/ai_rough_budget.js, design/ai_ask.js,
// design/ai_annex_b_edit.js, design/ai_images.js inline prompt
// building, ai/promptbuilder.js, outbound/index.js translateOutbound).
//
// Per Ishant's "Gemini 3.5 Flash everywhere, Kimi 2.6 as backup
// everywhere" decision. Each migrated caller drops a Kimi axios.post
// for a single runTextCompletion() call; the helper handles provider
// preference, JSON-mode adapter, retry-on-transient-failure, and
// usage logging.
//
// Why not chat_proxy.invokeChat(): chat_proxy is the streaming/Tools-
// capable surface used by Ask Friday + public chat. The simpler
// callers in this file's consumer list want a single round-trip with
// optional JSON-mode strict output. Mirroring kimi_draft.js's existing
// helper shape keeps the migration mechanical: drop-in replacement.

const axios = require('axios');
const { recordUsage } = require('../tenants/ai_usage');

const KIMI_BASE_URL = process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1';
const KIMI_MODEL = process.env.KIMI_MODEL || 'kimi-k2.6';
const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.NANOBANANA_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_DRAFT_MODEL || 'gemini-3.5-flash';

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEFAULT_TIMEOUT_MS = 480_000; // 8 min — matches the broader AI ceiling

function logUsage(meter, fields) {
  if (!meter) return;
  recordUsage({
    tenantId: meter.tenantId || DEFAULT_TENANT_ID,
    feature: meter.feature || 'ai_completion',
    ...fields,
  }).catch((err) => console.warn('[ai/gemini_first] usage log failed:', err.message));
}

// Tolerant JSON parse — strips ```json fences and recovers the first
// {...} block. Returns null if nothing parseable.
function parseJsonish(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch { /* fall through */ }
  }
  return null;
}

// Single-shot Gemini call. Returns the unified result shape used by
// runTextCompletion below.
async function callGemini({ system, user, model, maxTokens, temperature, timeoutMs, responseJson }) {
  if (!GEMINI_API_KEY) {
    return { ok: false, error: 'GEMINI_API_KEY not set', provider: 'gemini' };
  }
  const m = model || GEMINI_MODEL;
  const start = Date.now();
  try {
    const { data } = await axios.post(
      `${GEMINI_BASE_URL}/models/${encodeURIComponent(m)}:generateContent`,
      {
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: Number.isFinite(Number(temperature)) ? Number(temperature) : 0.4,
          ...(responseJson ? { responseMimeType: 'application/json' } : {}),
        },
      },
      {
        headers: { 'x-goog-api-key': GEMINI_API_KEY, 'Content-Type': 'application/json' },
        timeout: timeoutMs || DEFAULT_TIMEOUT_MS,
      },
    );
    const candidate = data?.candidates?.[0];
    const text = candidate?.content?.parts?.map((p) => p.text ?? '').join('') || '';
    const finishReason = candidate?.finishReason || 'unknown';
    const usage = data?.usageMetadata || {};
    if (typeof text !== 'string' || text.length === 0) {
      return {
        ok: false,
        error: `empty response (finish_reason=${finishReason})`,
        finishReason,
        latencyMs: Date.now() - start,
        provider: 'gemini',
        inputTokens: usage.promptTokenCount ?? null,
        outputTokens: usage.candidatesTokenCount ?? null,
      };
    }
    return {
      ok: true,
      text,
      parsed: responseJson ? parseJsonish(text) : null,
      finishReason,
      latencyMs: Date.now() - start,
      provider: 'gemini',
      model: m,
      inputTokens: usage.promptTokenCount ?? null,
      outputTokens: usage.candidatesTokenCount ?? null,
    };
  } catch (e) {
    return {
      ok: false,
      error: e.response?.data?.error?.message || e.message,
      status: e.response?.status,
      latencyMs: Date.now() - start,
      provider: 'gemini',
    };
  }
}

// Single-shot Kimi (Moonshot) call. Same return shape as callGemini.
async function callKimi({ system, user, model, maxTokens, temperature, timeoutMs, responseJson }) {
  if (!process.env.KIMI_API_KEY) {
    return { ok: false, error: 'KIMI_API_KEY not set', provider: 'kimi' };
  }
  const m = model || KIMI_MODEL;
  // K2.6 rejects any temperature ≠ 1 with HTTP 400 ("invalid temperature:
  // only 1 is allowed for this model"). Same constraint applies to a
  // small handful of newer Moonshot models. If we're calling K2.6 — the
  // default — clamp the temperature regardless of what the caller passed
  // so the Kimi fallback path doesn't silently 400 out. Older Moonshot
  // models (v1-8k / v1-32k / v1-128k) still accept arbitrary temperatures.
  const isStrictTemp1Model = typeof m === 'string' && m.startsWith('kimi-k');
  const tempInput = Number.isFinite(Number(temperature)) ? Number(temperature) : 0.4;
  const effectiveTemp = isStrictTemp1Model ? 1 : tempInput;
  const start = Date.now();
  try {
    const { data } = await axios.post(
      `${KIMI_BASE_URL}/chat/completions`,
      {
        model: m,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: effectiveTemp,
        max_tokens: maxTokens,
        ...(responseJson ? { response_format: { type: 'json_object' } } : {}),
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.KIMI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: timeoutMs || DEFAULT_TIMEOUT_MS,
      },
    );
    const text = data?.choices?.[0]?.message?.content;
    const finishReason = data?.choices?.[0]?.finish_reason || 'unknown';
    if (typeof text !== 'string' || text.length === 0) {
      return {
        ok: false,
        error: `empty response (finish_reason=${finishReason})`,
        finishReason,
        latencyMs: Date.now() - start,
        provider: 'kimi',
        inputTokens: data?.usage?.prompt_tokens ?? null,
        outputTokens: data?.usage?.completion_tokens ?? null,
      };
    }
    return {
      ok: true,
      text,
      parsed: responseJson ? parseJsonish(text) : null,
      finishReason,
      latencyMs: Date.now() - start,
      provider: 'kimi',
      model: m,
      inputTokens: data?.usage?.prompt_tokens ?? null,
      outputTokens: data?.usage?.completion_tokens ?? null,
    };
  } catch (e) {
    return {
      ok: false,
      error: e.response?.data?.error?.message || e.message,
      status: e.response?.status,
      latencyMs: Date.now() - start,
      provider: 'kimi',
    };
  }
}

// Public API — single-round completion with Gemini-primary / Kimi-
// fallback. Callers pass system + user prompts plus the standard knobs;
// the helper handles provider preference and (optionally) returns
// strict JSON. Never throws — failures land as { ok:false, error, ... }.
//
// Caller pins: pass `model: 'kimi-k2.6'` (or any moonshot-*) to force
// Kimi only. Pass `model: 'gemini-*'` to force Gemini only. Omit for
// the default Gemini-primary / Kimi-fallback order.
async function runTextCompletion({ system, user, model, maxTokens, temperature, timeoutMs, responseJson, meter, feature }) {
  const wantsKimiOnly = typeof model === 'string' && (model.startsWith('kimi') || model.startsWith('moonshot'));
  const wantsGeminiOnly = typeof model === 'string' && model.startsWith('gemini');
  const args = { system, user, maxTokens, temperature, timeoutMs, responseJson };

  // Provider 1: Gemini (unless caller pinned Kimi).
  if (!wantsKimiOnly && GEMINI_API_KEY) {
    const r = await callGemini({ ...args, model: wantsGeminiOnly ? model : undefined });
    if (r.ok && (!responseJson || r.parsed != null)) {
      logUsage(meter || (feature ? { feature } : null), {
        provider: 'google',
        model: r.model,
        promptTokens: r.inputTokens,
        completionTokens: r.outputTokens,
        durationMs: r.latencyMs,
        success: true,
        errorCode: null,
        requestContext: { surface: feature || meter?.feature || 'ai_completion', fallback: false },
      });
      return r;
    }
    if (!wantsGeminiOnly) {
      console.warn(`[ai/gemini_first] gemini failed (${r.error || 'JSON unparseable'}); falling back to kimi`);
    } else {
      return r;
    }
  }

  // Provider 2: Kimi.
  const r = await callKimi({ ...args, model: wantsKimiOnly ? model : undefined });
  logUsage(meter || (feature ? { feature } : null), {
    provider: 'moonshot',
    model: r.model,
    promptTokens: r.inputTokens,
    completionTokens: r.outputTokens,
    durationMs: r.latencyMs,
    success: !!r.ok,
    errorCode: r.ok ? null : (r.error || 'unknown'),
    requestContext: { surface: feature || meter?.feature || 'ai_completion', fallback: !wantsKimiOnly && !wantsGeminiOnly },
  });
  return r;
}

module.exports = {
  runTextCompletion,
  callGemini,
  callKimi,
  parseJsonish,
  KIMI_MODEL,
  GEMINI_MODEL,
};
