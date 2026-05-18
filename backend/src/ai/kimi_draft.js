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

const KIMI_BASE_URL = process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1';
const DRAFT_MODEL = process.env.KIMI_DRAFT_MODEL || 'kimi-k2.6';
const CLASSIFY_MODEL = process.env.KIMI_CLASSIFY_MODEL || 'moonshot-v1-8k';

// Generation parameters. Kimi K2.6 rejects any temperature ≠ 1 with
// a 400 ("invalid temperature: only 1 is allowed for this model"),
// the same pattern Anthropic's Opus 4.7 follows. The env override
// stays so a fallback model (moonshot-v1-32k etc.) can use a lower
// temperature if we ever flip — those models DO accept 0.x.
const DRAFT_TEMPERATURE = Number(process.env.KIMI_DRAFT_TEMPERATURE) || 1;

// Hard cap on output length. Most drafts are <500 tokens; cap at 1200
// to allow long-form when needed (sales replies with several pricing
// scenarios, for example) without giving the model rope to ramble.
const DRAFT_MAX_TOKENS = Number(process.env.KIMI_DRAFT_MAX_TOKENS) || 1200;

// Timeout for one Kimi call. K2.6 with a 18K-token system prompt
// typically responds in 6-12s; 45s is generous for tail latency.
const DRAFT_TIMEOUT_MS = Number(process.env.KIMI_DRAFT_TIMEOUT_MS) || 45_000;

// Retry policy. Matches GMS's draft-generator: 3 retries, exponential
// backoff. Each retry doubles the wait — 2s, 4s, 8s. Total worst-case
// budget: 14s of waiting + 4 attempts × 45s timeout = ~3min ceiling.
const MAX_RETRIES = Number(process.env.KIMI_DRAFT_MAX_RETRIES) || 3;
const RETRY_BASE_MS = 2_000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// One-shot Kimi call. Returns { ok, text, inputTokens, outputTokens,
// model, latencyMs } on success or { ok:false, error, ... } on failure.
async function callKimiOnce({ system, user, model, maxTokens, temperature, timeoutMs }) {
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
    if (typeof text !== 'string' || text.length === 0) {
      return { ok: false, error: 'empty response', latencyMs: Date.now() - start };
    }
    return {
      ok: true,
      text,
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
// failures. Does NOT retry on 4xx (auth/quota/validation) — those won't
// succeed on a retry and would burn budget.
async function callWithRetry(opts) {
  let lastError = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const result = await callKimiOnce(opts);
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
    if (attempt < MAX_RETRIES) {
      const wait = RETRY_BASE_MS * Math.pow(2, attempt);
      console.warn(`[ai/kimi-draft] attempt ${attempt + 1} failed (${result.error}); retrying in ${wait}ms`);
      await sleep(wait);
    }
  }
  return lastError;
}

// Public API — long-context draft generation (K2.6 by default).
async function generateDraftReply({ system, user }) {
  return callWithRetry({
    system,
    user,
    model: DRAFT_MODEL,
    maxTokens: DRAFT_MAX_TOKENS,
    temperature: DRAFT_TEMPERATURE,
    timeoutMs: DRAFT_TIMEOUT_MS,
  });
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

async function classifyMessageWithKimi(text) {
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
const EXTRACT_TIMEOUT_MS = Number(process.env.KIMI_EXTRACT_TIMEOUT_MS) || 20_000;

async function extractStructuredOutput({ system, user, model, maxTokens, timeoutMs }) {
  if (!process.env.KIMI_API_KEY) {
    return { ok: false, error: 'KIMI_API_KEY not set' };
  }
  const start = Date.now();
  const m = model || EXTRACT_MODEL;
  try {
    const { data } = await axios.post(
      `${KIMI_BASE_URL}/chat/completions`,
      {
        model: m,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.0,
        max_tokens: maxTokens || EXTRACT_MAX_TOKENS,
        response_format: { type: 'json_object' },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.KIMI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: timeoutMs || EXTRACT_TIMEOUT_MS,
      },
    );
    const raw = data?.choices?.[0]?.message?.content;
    if (typeof raw !== 'string') {
      return { ok: false, error: 'no response text', latencyMs: Date.now() - start };
    }
    // Most models honour response_format and emit clean JSON, but a few
    // wrap it in code fences. Strip a single ```json fence if present.
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      return {
        ok: true,
        parsed,
        raw,
        inputTokens: data?.usage?.prompt_tokens ?? null,
        outputTokens: data?.usage?.completion_tokens ?? null,
        model: m,
        latencyMs: Date.now() - start,
      };
    } catch (parseErr) {
      // Fallback: try to pull the first {...} block out of the raw text.
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return {
            ok: true,
            parsed: JSON.parse(match[0]),
            raw,
            inputTokens: data?.usage?.prompt_tokens ?? null,
            outputTokens: data?.usage?.completion_tokens ?? null,
            model: m,
            latencyMs: Date.now() - start,
          };
        } catch { /* fall through */ }
      }
      return { ok: false, error: `JSON parse failed: ${parseErr.message}`, raw, latencyMs: Date.now() - start };
    }
  } catch (e) {
    return {
      ok: false,
      error: e.response?.data?.error?.message || e.message,
      status: e.response?.status,
      latencyMs: Date.now() - start,
    };
  }
}

module.exports = {
  generateDraftReply,
  classifyMessageWithKimi,
  extractStructuredOutput,
  DRAFT_MODEL,
  CLASSIFY_MODEL,
  EXTRACT_MODEL,
};
