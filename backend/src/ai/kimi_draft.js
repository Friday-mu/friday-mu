'use strict';

// Long-context Kimi client for draft generation.
//
// Separate from ai/translate.js because:
//   - drafts emit plain text, not JSON (translate forces response_format
//     json_object — would corrupt the output)
//   - drafts need a bigger model than translation's moonshot-v1-8k; the
//     structured composer system prompt averages ~18K tokens by itself
//     (per FAD shadow-log analysis 2026-05-18), so we need at least 32K
//     context. Default `kimi-k2.6` covers 262K — plenty of head-room
//   - retry/timeout policy differs: draft calls are slower (multi-second)
//     and worth more retries than translate's fast-fail pattern
//
// Provider: Moonshot AI's OpenAI-compatible endpoint. Auth via Bearer
// of the KIMI_API_KEY env var — shared with translate.js (same account).
//
// On model selection: K2.6 is the locked choice per Ishant 2026-05-18.
// Override via KIMI_DRAFT_MODEL if we need to A/B test a different model
// without code changes.

const axios = require('axios');
const { recordUsage } = require('../tenants/ai_usage');

const KIMI_BASE_URL = process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1';
const DRAFT_MODEL = process.env.KIMI_DRAFT_MODEL || 'kimi-k2.6';
const CLASSIFY_MODEL = process.env.KIMI_CLASSIFY_MODEL || 'moonshot-v1-8k';

// Gemini primary path — added 2026-05-23 per Ishant's "Gemini 3.5 Flash
// everywhere, Kimi backup everywhere" decision. callWithRetry below
// tries Gemini once per generation call; on failure (no key, bad
// payload, model error, timeout) it falls back to the Kimi path for
// this call AND all retries — never blocks the user on a vision-path
// hiccup, and never bursts Gemini on retry storms.
//
// Why we don't route through chat_proxy.invokeChat() here: kimi_draft
// is the shared draft-generation helper consumed by 5+ inbox surfaces
// (consult, drafts, followup_draft_generator, plus extractStructuredOutput
// for action_detector + auto_resolve). chat_proxy currently doesn't
// support JSON-mode (`response_format: json_object`) for Gemini, which
// extractStructuredOutput depends on. Inline Gemini call here keeps the
// migration self-contained without forking the chat_proxy contract.
const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.NANOBANANA_API_KEY;
const GEMINI_DRAFT_MODEL = process.env.GEMINI_DRAFT_MODEL || 'gemini-3.5-flash';

// Default tenant — FAD is FR-only today. Callers can override via
// `meter.tenantId` if multi-tenant logging is needed later.
const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

// Helper: fire-and-forget recordUsage. Never throws (recordUsage is
// already swallow-safe; this is the belt-and-braces version).
function logUsage(meter, fields) {
  if (!meter || !meter.feature) return;
  recordUsage({
    tenantId: meter.tenantId || DEFAULT_TENANT_ID,
    feature: meter.feature,
    provider: 'moonshot',
    ...fields,
  }).catch(() => {}); // never block on usage log
}

// Generation parameters. Kimi K2.6 rejects any temperature ≠ 1 with
// a 400 ("invalid temperature: only 1 is allowed for this model"),
// the same pattern Anthropic's Opus 4.7 follows. The env override
// stays so a fallback model (moonshot-v1-32k etc.) can use a lower
// temperature if we ever flip — those models DO accept 0.x.
const DRAFT_TEMPERATURE = Number(process.env.KIMI_DRAFT_TEMPERATURE) || 1;

// Hard cap on output length. Bumped 1200 → 4096 (2026-05-19) after
// production observed `finish_reason=length` with empty visible
// content — K2.6 is a reasoning-style model that burns output budget
// on hidden chain-of-thought before emitting the final reply. 1200
// was too tight: the model would consume it all on CoT and stop with
// no surfaced content. 4096 gives ~3K tokens of reasoning headroom
// plus a ~1K reply, which is comfortably above the longest draft
// the team produces (sales replies with several pricing scenarios
// rarely exceed 800 tokens).
const DRAFT_MAX_TOKENS = Number(process.env.KIMI_DRAFT_MAX_TOKENS) || 4096;

// Timeout for one provider call. Bumped 90s → 8 min on 2026-05-23 per
// Ishant's "if we're putting a timeout it should be 5-10 min, the
// model needs time to do its thing" decision. Backed by a coordinated
// nginx proxy_read_timeout bump (was effectively 60s default, now 600s
// for /api/) — without the nginx side, app-side timeouts > 60s are
// dead because nginx returns 504 first. Gemini path is typically
// 5-20s; the long ceiling is mainly for Kimi K2.6's reasoning step on
// generic prompts (TRR-4/MV-1/VA-3/VA-4 missing property cards force
// the composer to a larger prompt) and edge cases where the provider
// itself is slow.
const DRAFT_TIMEOUT_MS = Number(process.env.KIMI_DRAFT_TIMEOUT_MS) || 480_000;

// Retry policy. Matches GMS's draft-generator: 3 retries, exponential
// backoff. Each retry doubles the wait — 2s, 4s, 8s. Total worst-case
// budget: 14s of waiting + 4 attempts × 45s timeout = ~3min ceiling.
const MAX_RETRIES = Number(process.env.KIMI_DRAFT_MAX_RETRIES) || 3;
const RETRY_BASE_MS = 2_000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Tolerant JSON parse for extractStructuredOutput. Models occasionally
// wrap their JSON in ```json fences or surround it with prose; this
// pulls out the first {...} block as a fallback before giving up.
// Returns the parsed object or null.
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

// One-shot Gemini call. Same return shape as callKimiOnce so the
// caller can drop one in for the other. JSON-mode is opt-in via the
// `responseJson` flag (sets responseMimeType=application/json) — used
// by extractStructuredOutput to keep the strict-JSON guarantee that
// Kimi's response_format gives us.
async function callGeminiOnce({ system, user, model, maxTokens, temperature, timeoutMs, responseJson }) {
  if (!GEMINI_API_KEY) {
    return { ok: false, error: 'GEMINI_API_KEY not set' };
  }
  const start = Date.now();
  const m = model || GEMINI_DRAFT_MODEL;
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
        timeout: timeoutMs,
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
        inputTokens: usage.promptTokenCount ?? null,
        outputTokens: usage.candidatesTokenCount ?? null,
      };
    }
    return {
      ok: true,
      text,
      finishReason,
      inputTokens: usage.promptTokenCount ?? null,
      outputTokens: usage.candidatesTokenCount ?? null,
      model: m,
      latencyMs: Date.now() - start,
    };
  } catch (e) {
    return {
      ok: false,
      error: e.response?.data?.error?.message || e.message,
      status: e.response?.status,
      latencyMs: Date.now() - start,
    };
  }
}

// One-shot Kimi call. Returns { ok, text, inputTokens, outputTokens,
// model, latencyMs } on success or { ok:false, error, ... } on failure.
async function callKimiOnce({ system, user, model, maxTokens, temperature, timeoutMs, responseJson }) {
  if (!process.env.KIMI_API_KEY) {
    return { ok: false, error: 'KIMI_API_KEY not set' };
  }
  const start = Date.now();
  try {
    const { data } = await axios.post(
      `${KIMI_BASE_URL}/chat/completions`,
      {
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature,
        max_tokens: maxTokens,
        ...(responseJson ? { response_format: { type: 'json_object' } } : {}),
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.KIMI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: timeoutMs,
      },
    );
    const text = data?.choices?.[0]?.message?.content;
    const finishReason = data?.choices?.[0]?.finish_reason || 'unknown';
    if (typeof text !== 'string' || text.length === 0) {
      // Empty content is usually deterministic — content-filter block,
      // max_tokens=0, or upstream malformed prompt. Surface the finish
      // reason so the caller's retry logic can decide whether to retry
      // (transient) or fail fast (deterministic).
      return {
        ok: false,
        error: `empty response (finish_reason=${finishReason})`,
        finishReason,
        latencyMs: Date.now() - start,
        inputTokens: data?.usage?.prompt_tokens ?? null,
        outputTokens: data?.usage?.completion_tokens ?? null,
      };
    }
    return {
      ok: true,
      text,
      finishReason,
      inputTokens: data?.usage?.prompt_tokens ?? null,
      outputTokens: data?.usage?.completion_tokens ?? null,
      model,
      latencyMs: Date.now() - start,
    };
  } catch (e) {
    return {
      ok: false,
      error: e.response?.data?.error?.message || e.message,
      status: e.response?.status,
      latencyMs: Date.now() - start,
    };
  }
}

// Wrapper with retry + exp backoff. Retries on 5xx, timeouts, parse
// failures. Does NOT retry on:
//   - 4xx (auth/quota/validation — deterministic)
//   - finish_reason in (content_filter | stop with empty content |
//     length-with-zero) — these are deterministic outcomes that won't
//     change on a fresh call with the same prompt.
async function callWithRetry(opts) {
  let lastError = null;
  let geminiTried = false;
  const maxRetries = Number.isFinite(Number(opts.maxRetries))
    ? Math.max(0, Number(opts.maxRetries))
    : MAX_RETRIES;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Gemini primary, Kimi fallback (per Ishant 2026-05-23 decision).
    // Only try Gemini on the FIRST attempt of this generation — if it
    // failed once we don't waste a second call on it; the rest of the
    // retry budget goes to Kimi. Callers that explicitly pin a Kimi
    // model (e.g. moonshot-v1-128k for long-context jobs) bypass the
    // Gemini path so the model pin is respected.
    const wantsExplicitKimi = typeof opts.model === 'string' && (opts.model.startsWith('kimi') || opts.model.startsWith('moonshot'));
    let result;
    if (!geminiTried && !wantsExplicitKimi && GEMINI_API_KEY) {
      geminiTried = true;
      result = await callGeminiOnce({
        system: opts.system,
        user: opts.user,
        model: GEMINI_DRAFT_MODEL,
        maxTokens: opts.maxTokens,
        temperature: opts.temperature,
        timeoutMs: opts.timeoutMs,
        responseJson: opts.responseJson,
      });
      if (!result.ok) {
        console.warn(`[ai/draft] gemini failed (${result.error || 'unknown'}); falling back to kimi`);
        result = await callKimiOnce(opts);
      }
    } else {
      result = await callKimiOnce(opts);
    }
    if (result.ok) {
      if (attempt > 0) {
        console.log(`[ai/kimi-draft] succeeded on retry ${attempt} (latency=${result.latencyMs}ms)`);
      }
      return result;
    }
    lastError = result;
    // Don't retry on hard client-side errors.
    if (result.status && result.status >= 400 && result.status < 500) {
      console.warn(`[ai/kimi-draft] non-retryable error ${result.status}: ${result.error}`);
      return result;
    }
    // Don't retry on deterministic empty/blocked responses. A fresh
    // call with the same prompt will hit the same wall and burn
    // budget for no value.
    //
    // 'length' is deterministic regardless of output token count —
    // hitting max_tokens with the same prompt will reproduce the
    // result. 'content_filter' likewise. Only 'stop' with empty
    // output is ambiguous enough to deserve a retry (probably a
    // transient model hiccup).
    if (
      result.finishReason
      && ['content_filter', 'length'].includes(result.finishReason)
    ) {
      console.warn(`[ai/kimi-draft] non-retryable: empty content with finish_reason=${result.finishReason} (in=${result.inputTokens} out=${result.outputTokens})`);
      return result;
    }
    if (
      result.finishReason === 'stop'
      && (result.outputTokens === 0 || result.outputTokens == null)
    ) {
      console.warn(`[ai/kimi-draft] non-retryable: stop with no output (in=${result.inputTokens})`);
      return result;
    }
    if (attempt < maxRetries) {
      const wait = RETRY_BASE_MS * Math.pow(2, attempt);
      console.warn(`[ai/kimi-draft] attempt ${attempt + 1} failed (${result.error}); retrying in ${wait}ms`);
      await sleep(wait);
    }
  }
  return lastError;
}

// Public API — long-context draft generation (K2.6 by default).
//
// `meter` is optional. When provided as { tenantId, feature }, every
// call (success or fail) logs to ai_usage. Examples of `feature`
// values: 'inbox_draft', 'inbox_followup_draft'. tenantId defaults
// to FR when omitted.
async function generateDraftReply({ system, user, meter, timeoutMs, maxRetries, maxTokens, model, temperature }) {
  const result = await callWithRetry({
    system,
    user,
    model: model || DRAFT_MODEL,
    maxTokens: maxTokens || DRAFT_MAX_TOKENS,
    temperature: Number.isFinite(Number(temperature)) ? Number(temperature) : DRAFT_TEMPERATURE,
    timeoutMs: timeoutMs || DRAFT_TIMEOUT_MS,
    maxRetries,
  });
  logUsage(meter, {
    model: result.model || model || DRAFT_MODEL,
    promptTokens: result.inputTokens,
    completionTokens: result.outputTokens,
    durationMs: result.latencyMs,
    success: !!result.ok,
    errorCode: result.ok ? null : (result.error || 'unknown'),
  });
  return result;
}

// Public API — fast classification call (small model, low cost).
// Returns one of: routine | question | complaint | request | emergency | other.
// Used by draft_generator to bucket the inbound message for confidence
// scoring + prompt-build signals.
const VALID_CATEGORIES = ['routine', 'question', 'complaint', 'request', 'emergency', 'other'];
const CLASSIFY_SYSTEM = `You are a message classifier. Read the guest message and respond with EXACTLY ONE of these category labels and nothing else: routine, question, complaint, request, emergency, other.

- routine: friendly chat, thanks, acknowledgments
- question: asking for information
- complaint: dissatisfaction, problem, negative feedback
- request: asking us to do something (late checkout, extra towels, etc.)
- emergency: urgent safety, security, or critical-failure issue
- other: anything that doesn't fit above`;

async function classifyMessageWithKimi(text, meter) {
  if (!text || typeof text !== 'string') return 'other';
  const trimmed = text.slice(0, 1000); // classify the head, not the whole body
  const result = await callKimiOnce({
    system: CLASSIFY_SYSTEM,
    user: trimmed,
    model: CLASSIFY_MODEL,
    maxTokens: 10,
    temperature: 0.0,
    timeoutMs: 15_000,
  });
  logUsage(meter, {
    model: CLASSIFY_MODEL,
    promptTokens: result.inputTokens,
    completionTokens: result.outputTokens,
    durationMs: result.latencyMs,
    success: !!result.ok,
    errorCode: result.ok ? null : (result.error || 'unknown'),
  });
  if (!result.ok) {
    console.warn(`[ai/kimi-draft] classifyMessage failed: ${result.error}`);
    return 'other';
  }
  const raw = String(result.text).trim().toLowerCase().split(/[^a-z]/)[0];
  return VALID_CATEGORIES.includes(raw) ? raw : 'other';
}

// Public API — structured (JSON) extraction. Used by action_detector
// (Phase 3.2) and later by consult/learning surfaces that need a small
// reliably-parseable JSON envelope. Defaults to moonshot-v1-8k for
// cost since these calls are typically a few hundred output tokens.
//
// Returns { ok, parsed, raw, inputTokens, outputTokens, model, latencyMs, error? }.
// On parse failure, returns { ok: false, error, raw } so the caller can
// log/inspect what the model actually returned.
const EXTRACT_MODEL = process.env.KIMI_EXTRACT_MODEL || 'moonshot-v1-8k';
const EXTRACT_MAX_TOKENS = Number(process.env.KIMI_EXTRACT_MAX_TOKENS) || 800;
// Bumped 20s → 90s on 2026-05-23 (Gemini path typically <5s, Kimi
// fallback ~10-20s; 90s headroom covers tail-latency tasks). Coordinated
// with nginx proxy_read_timeout bump.
const EXTRACT_TIMEOUT_MS = Number(process.env.KIMI_EXTRACT_TIMEOUT_MS) || 90_000;
const GEMINI_EXTRACT_MODEL = process.env.GEMINI_EXTRACT_MODEL || 'gemini-3.5-flash';

// Strict-JSON extraction with Gemini primary / Kimi fallback. Gemini's
// responseMimeType=application/json mirrors Kimi's response_format
// = {type: 'json_object'}. On any Gemini failure (no key, parse error,
// upstream miss) we fall through to the existing Kimi call — exactly
// the same contract as before, just faster on the happy path.
async function extractStructuredOutput({ system, user, model, maxTokens, timeoutMs, meter }) {
  const start = Date.now();
  const km = model || EXTRACT_MODEL;
  const gm = GEMINI_EXTRACT_MODEL;
  const tokenCap = maxTokens || EXTRACT_MAX_TOKENS;
  const callTimeout = timeoutMs || EXTRACT_TIMEOUT_MS;
  let result;
  let usedProvider = 'gemini';
  let usedModel = gm;

  // Caller may pin a Kimi model (kimi-* / moonshot-*) when they want
  // Kimi specifically (long-context jobs etc.). Honour that bypass.
  const wantsExplicitKimi = typeof model === 'string' && (model.startsWith('kimi') || model.startsWith('moonshot'));

  if (!wantsExplicitKimi && GEMINI_API_KEY) {
    const geminiOnce = await callGeminiOnce({
      system,
      user,
      model: gm,
      maxTokens: tokenCap,
      temperature: 0.0,
      timeoutMs: callTimeout,
      responseJson: true,
    });
    if (geminiOnce.ok && typeof geminiOnce.text === 'string') {
      const parsed = parseJsonish(geminiOnce.text);
      if (parsed) {
        result = {
          ok: true,
          parsed,
          raw: geminiOnce.text,
          inputTokens: geminiOnce.inputTokens,
          outputTokens: geminiOnce.outputTokens,
          model: gm,
          latencyMs: geminiOnce.latencyMs,
        };
      } else {
        console.warn(`[ai/extract] gemini returned non-JSON; falling back to kimi`);
      }
    } else if (!geminiOnce.ok) {
      console.warn(`[ai/extract] gemini failed (${geminiOnce.error || 'unknown'}); falling back to kimi`);
    }
  }

  if (!result) {
    if (!process.env.KIMI_API_KEY) {
      return { ok: false, error: 'KIMI_API_KEY not set (and gemini path unavailable)' };
    }
    usedProvider = 'kimi';
    usedModel = km;
    try {
      const { data } = await axios.post(
        `${KIMI_BASE_URL}/chat/completions`,
        {
          model: km,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0.0,
          max_tokens: tokenCap,
          response_format: { type: 'json_object' },
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.KIMI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: callTimeout,
        },
      );
      const raw = data?.choices?.[0]?.message?.content;
      const promptTokens = data?.usage?.prompt_tokens ?? null;
      const completionTokens = data?.usage?.completion_tokens ?? null;
      const latencyMs = Date.now() - start;
      if (typeof raw !== 'string') {
        result = { ok: false, error: 'no response text', latencyMs, _meterTokens: { promptTokens, completionTokens } };
      } else {
        const parsed = parseJsonish(raw);
        result = parsed != null
          ? { ok: true, parsed, raw, inputTokens: promptTokens, outputTokens: completionTokens, model: km, latencyMs }
          : { ok: false, error: 'JSON parse failed', raw, latencyMs, _meterTokens: { promptTokens, completionTokens } };
      }
    } catch (e) {
      result = {
        ok: false,
        error: e.response?.data?.error?.message || e.message,
        status: e.response?.status,
        latencyMs: Date.now() - start,
      };
    }
  }
  void usedProvider; void usedModel;

  // Single exit point so we log usage exactly once, even on parse-fail
  // recovery and API-error paths. Tokens come from data.usage when the
  // request reached Moonshot; otherwise null (counts as 0 in
  // computeCostMinorUsd which still records the failed call shape).
  logUsage(meter, {
    model: m,
    promptTokens: result.inputTokens ?? result._meterTokens?.promptTokens ?? null,
    completionTokens: result.outputTokens ?? result._meterTokens?.completionTokens ?? null,
    durationMs: result.latencyMs,
    success: !!result.ok,
    errorCode: result.ok ? null : (result.error || 'unknown'),
  });
  // Strip the internal-only field before returning.
  if (result._meterTokens) delete result._meterTokens;
  return result;
}

module.exports = {
  generateDraftReply,
  classifyMessageWithKimi,
  extractStructuredOutput,
  DRAFT_MODEL,
  CLASSIFY_MODEL,
  EXTRACT_MODEL,
};
