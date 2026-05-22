'use strict';

// Public-chat proxy — multi-provider chat-completions for /api/public/chat.
//
// Centralises Kimi (Moonshot) + Anthropic chat surfaces so that
// friday.mu can drop its three direct API integrations (Ask Friday
// hero, owner-enquiry chat, feedback FAB chat) per the FAD-HANDOFF-
// PUBLIC-CHAT-2026-05-18 brief.
//
// Public surface:
//
//   await invokeChat({ system, messages, tools, model, meter })
//     → { ok, message, usage, model, latencyMs, error?, fallbackUsed? }
//
//   await streamChat({ system, messages, tools, model, meter, res })
//     → writes SSE events to `res`:
//        event: text-delta   data: { delta: "..." }
//        event: tool-call    data: { tool_call: {...} }    (optional)
//        event: envelope     data: { message, usage, model }
//        event: error        data: { message, code }       (on failure)
//
// Models:
//   "kimi-k2"          → kimi-k2.6  (Moonshot)
//   "kimi-k2.6"        → kimi-k2.6  (alias)
//   "claude-sonnet-4-6"→ claude-sonnet-4-5  (Anthropic)
//   "auto" (default)   → try Kimi first, fall back to Claude on 429
//
// Tool calls flow through verbatim in OpenAI shape (Kimi already speaks
// it; we convert Anthropic's tool_use blocks to that shape on the way
// out).
//
// Fallback semantics: ONE retry on a different provider when the
// primary returns 429 or upstream-5xx. Surface `fallbackUsed: true` +
// the actual model that answered.

const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const { recordUsage } = require('../tenants/ai_usage');

const KIMI_BASE_URL = process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1';
const KIMI_API_KEY = process.env.KIMI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const KIMI_CHAT_MODEL = process.env.KIMI_CHAT_MODEL || 'kimi-k2.6';
const ANTHROPIC_CHAT_MODEL = process.env.ANTHROPIC_CHAT_MODEL || 'claude-sonnet-4-5';

const KIMI_TIMEOUT_MS = Number(process.env.KIMI_CHAT_TIMEOUT_MS) || 55_000;
const ANTHROPIC_TIMEOUT_MS = Number(process.env.ANTHROPIC_CHAT_TIMEOUT_MS) || 55_000;

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

let _anthropic = null;
function getAnthropic() {
  if (!_anthropic && ANTHROPIC_API_KEY) {
    _anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

function logUsage(meter, fields) {
  if (!meter || !meter.feature) return;
  recordUsage({
    tenantId: meter.tenantId || DEFAULT_TENANT_ID,
    feature: meter.feature,
    provider: fields.provider,
    ...fields,
  }).catch(() => {});
}

// ────────────────────────────────────────────────────────────────────
// Model resolution + provider routing
// ────────────────────────────────────────────────────────────────────

function resolveProvider(model) {
  const m = String(model || 'auto').toLowerCase();
  if (m === 'auto') return 'auto';
  if (m.startsWith('kimi') || m.startsWith('moonshot')) return 'kimi';
  if (m.startsWith('claude')) return 'anthropic';
  return 'auto'; // unknown → safe fallback
}

function resolveKimiModel(model) {
  if (!model || model === 'auto' || model === 'kimi-k2') return KIMI_CHAT_MODEL;
  return String(model);
}

function resolveAnthropicModel(model) {
  if (!model || model === 'auto' || model === 'claude-sonnet-4-6') return ANTHROPIC_CHAT_MODEL;
  return String(model);
}

// ────────────────────────────────────────────────────────────────────
// Kimi — non-streaming + streaming
// ────────────────────────────────────────────────────────────────────

async function invokeKimi({ system, messages, tools, model, maxTokens }) {
  if (!KIMI_API_KEY) {
    return { ok: false, error: 'KIMI_API_KEY not set', status: 500 };
  }
  const start = Date.now();
  const m = resolveKimiModel(model);
  const body = {
    model: m,
    messages: system
      ? [{ role: 'system', content: system }, ...messages]
      : messages,
    // Kimi K2.6 requires temperature=1; older moonshot-v1-* accept lower.
    temperature: m.startsWith('kimi-k') ? 1 : 0.7,
    max_tokens: maxTokens || 4096,
  };
  if (Array.isArray(tools) && tools.length > 0) {
    body.tools = tools;
  }
  try {
    const { data } = await axios.post(`${KIMI_BASE_URL}/chat/completions`, body, {
      headers: { Authorization: `Bearer ${KIMI_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: KIMI_TIMEOUT_MS,
    });
    const choice = data?.choices?.[0];
    const text = choice?.message?.content || '';
    const toolCalls = Array.isArray(choice?.message?.tool_calls) ? choice.message.tool_calls : undefined;
    const finishReason = choice?.finish_reason || 'unknown';
    if (!String(text).trim() && !toolCalls?.length) {
      return {
        ok: false,
        error: `empty response (finish_reason=${finishReason})`,
        status: 502,
        usage: {
          input_tokens: data?.usage?.prompt_tokens ?? null,
          output_tokens: data?.usage?.completion_tokens ?? null,
          total_tokens: data?.usage?.total_tokens ?? null,
        },
        finishReason,
        latencyMs: Date.now() - start,
      };
    }
    return {
      ok: true,
      message: {
        role: 'assistant',
        content: text,
        ...(toolCalls ? { tool_calls: toolCalls } : {}),
      },
      usage: {
        input_tokens: data?.usage?.prompt_tokens ?? null,
        output_tokens: data?.usage?.completion_tokens ?? null,
        total_tokens: data?.usage?.total_tokens ?? null,
      },
      model: m,
      finishReason,
      latencyMs: Date.now() - start,
    };
  } catch (e) {
    return {
      ok: false,
      error: e.response?.data?.error?.message || e.message,
      status: e.response?.status || 500,
      latencyMs: Date.now() - start,
    };
  }
}

// Stream Kimi → emit OpenAI-style SSE events to res in our shape
// (text-delta + envelope). Accumulates the full text + tool_calls so
// the envelope can ship at the end.
async function streamKimi({ system, messages, tools, model, maxTokens, res }) {
  if (!KIMI_API_KEY) {
    return { ok: false, error: 'KIMI_API_KEY not set', status: 500 };
  }
  const start = Date.now();
  const m = resolveKimiModel(model);
  const body = {
    model: m,
    messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
    temperature: m.startsWith('kimi-k') ? 1 : 0.7,
    max_tokens: maxTokens || 4096,
    stream: true,
  };
  if (Array.isArray(tools) && tools.length > 0) body.tools = tools;

  let response;
  try {
    response = await axios.post(`${KIMI_BASE_URL}/chat/completions`, body, {
      headers: { Authorization: `Bearer ${KIMI_API_KEY}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      timeout: KIMI_TIMEOUT_MS,
      responseType: 'stream',
    });
  } catch (e) {
    return {
      ok: false,
      error: e.response?.data?.error?.message || e.message,
      status: e.response?.status || 500,
      latencyMs: Date.now() - start,
    };
  }

  let accText = '';
  let accToolCalls = []; // map by index
  let finishReason = 'unknown';
  let inputTokens = null;
  let outputTokens = null;
  let buffer = '';

  return new Promise((resolve) => {
    response.data.on('data', (chunk) => {
      buffer += chunk.toString('utf-8');
      // SSE: lines ending in \n\n separate events. Each line is `data: <json>` or `data: [DONE]`.
      const events = buffer.split('\n\n');
      buffer = events.pop(); // last (possibly partial) event stays in buffer
      for (const evt of events) {
        for (const line of evt.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const obj = JSON.parse(payload);
            const choice = obj.choices?.[0];
            if (!choice) continue;
            if (choice.delta?.content) {
              accText += choice.delta.content;
              sseWrite(res, 'text-delta', { delta: choice.delta.content });
            }
            if (Array.isArray(choice.delta?.tool_calls)) {
              for (const tc of choice.delta.tool_calls) {
                const idx = tc.index || 0;
                accToolCalls[idx] = accToolCalls[idx] || { id: '', type: 'function', function: { name: '', arguments: '' } };
                if (tc.id) accToolCalls[idx].id = tc.id;
                if (tc.function?.name) accToolCalls[idx].function.name = tc.function.name;
                if (tc.function?.arguments) accToolCalls[idx].function.arguments += tc.function.arguments;
              }
            }
            if (choice.finish_reason) finishReason = choice.finish_reason;
            if (obj.usage) {
              inputTokens = obj.usage.prompt_tokens ?? inputTokens;
              outputTokens = obj.usage.completion_tokens ?? outputTokens;
            }
          } catch { /* malformed chunk; skip */ }
        }
      }
    });

    response.data.on('end', () => {
      const cleanedToolCalls = accToolCalls.filter(Boolean);
      const envelope = {
        message: {
          role: 'assistant',
          content: accText,
          ...(cleanedToolCalls.length > 0 ? { tool_calls: cleanedToolCalls } : {}),
        },
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: (inputTokens != null && outputTokens != null) ? inputTokens + outputTokens : null,
        },
        model: m,
      };
      sseWrite(res, 'envelope', envelope);
      resolve({
        ok: true,
        message: envelope.message,
        usage: envelope.usage,
        model: m,
        finishReason,
        latencyMs: Date.now() - start,
        inputTokens,
        outputTokens,
      });
    });

    response.data.on('error', (err) => {
      resolve({
        ok: false,
        error: err.message,
        status: 502,
        latencyMs: Date.now() - start,
      });
    });
  });
}

// ────────────────────────────────────────────────────────────────────
// Anthropic — non-streaming + streaming
// ────────────────────────────────────────────────────────────────────

// Convert OpenAI-shaped tool defs to Anthropic shape. OpenAI uses
// { type: 'function', function: { name, description, parameters } };
// Anthropic uses { name, description, input_schema }.
function openAIToolsToAnthropic(tools) {
  if (!Array.isArray(tools)) return undefined;
  return tools.map((t) => {
    if (t.type === 'function' && t.function) {
      return {
        name: t.function.name,
        description: t.function.description || '',
        input_schema: t.function.parameters || { type: 'object', properties: {} },
      };
    }
    return t; // assume already Anthropic-shaped
  });
}

// Anthropic emits content as an array of blocks; collapse text blocks
// + tool_use blocks back into OpenAI shape so the response envelope
// is provider-agnostic for the website.
function anthropicResponseToOpenAI(resp) {
  let text = '';
  const toolCalls = [];
  let idx = 0;
  for (const block of resp.content || []) {
    if (block.type === 'text') {
      text += block.text;
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        type: 'function',
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input || {}),
        },
        index: idx,
      });
      idx++;
    }
  }
  return {
    message: {
      role: 'assistant',
      content: text,
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    },
    usage: {
      input_tokens: resp.usage?.input_tokens ?? null,
      output_tokens: resp.usage?.output_tokens ?? null,
      total_tokens: (resp.usage?.input_tokens ?? 0) + (resp.usage?.output_tokens ?? 0) || null,
    },
    model: resp.model,
    finishReason: resp.stop_reason || 'unknown',
  };
}

async function invokeAnthropic({ system, messages, tools, model, maxTokens }) {
  const client = getAnthropic();
  if (!client) {
    return { ok: false, error: 'ANTHROPIC_API_KEY not set', status: 500 };
  }
  const start = Date.now();
  const m = resolveAnthropicModel(model);
  try {
    const resp = await client.messages.create({
      model: m,
      max_tokens: maxTokens || 4096,
      ...(system ? { system } : {}),
      messages: anthropicMessages(messages),
      ...(tools ? { tools: openAIToolsToAnthropic(tools) } : {}),
    }, { timeout: ANTHROPIC_TIMEOUT_MS });
    const conv = anthropicResponseToOpenAI(resp);
    return {
      ok: true,
      ...conv,
      latencyMs: Date.now() - start,
    };
  } catch (e) {
    return {
      ok: false,
      error: e.message,
      status: e.status || 500,
      latencyMs: Date.now() - start,
    };
  }
}

// Strip OpenAI's "system" roles from the messages array — Anthropic
// takes them via the top-level `system` field, not as a turn.
function anthropicMessages(messages) {
  return (messages || []).filter((m) => m.role !== 'system').map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: typeof m.content === 'string' ? m.content : (m.content || ''),
  }));
}

async function streamAnthropic({ system, messages, tools, model, maxTokens, res }) {
  const client = getAnthropic();
  if (!client) {
    return { ok: false, error: 'ANTHROPIC_API_KEY not set', status: 500 };
  }
  const start = Date.now();
  const m = resolveAnthropicModel(model);
  let accText = '';
  const toolCalls = [];
  let currentToolCall = null;
  let inputTokens = null;
  let outputTokens = null;
  let finishReason = 'unknown';

  try {
    const stream = await client.messages.stream({
      model: m,
      max_tokens: maxTokens || 4096,
      ...(system ? { system } : {}),
      messages: anthropicMessages(messages),
      ...(tools ? { tools: openAIToolsToAnthropic(tools) } : {}),
    });

    stream.on('text', (delta) => {
      accText += delta;
      sseWrite(res, 'text-delta', { delta });
    });
    stream.on('contentBlock', (block) => {
      if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input || {}),
          },
          index: toolCalls.length,
        });
      }
    });
    stream.on('inputJson', () => { /* per-token tool-arg deltas — we capture via contentBlock above */ });

    const finalResp = await stream.finalMessage();
    inputTokens = finalResp.usage?.input_tokens ?? null;
    outputTokens = finalResp.usage?.output_tokens ?? null;
    finishReason = finalResp.stop_reason || 'unknown';

    const envelope = {
      message: {
        role: 'assistant',
        content: accText,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      },
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: (inputTokens != null && outputTokens != null) ? inputTokens + outputTokens : null,
      },
      model: m,
    };
    sseWrite(res, 'envelope', envelope);
    return {
      ok: true,
      message: envelope.message,
      usage: envelope.usage,
      model: m,
      finishReason,
      latencyMs: Date.now() - start,
      inputTokens,
      outputTokens,
    };
  } catch (e) {
    return {
      ok: false,
      error: e.message,
      status: e.status || 500,
      latencyMs: Date.now() - start,
    };
  }
}

// ────────────────────────────────────────────────────────────────────
// SSE helper
// ────────────────────────────────────────────────────────────────────

function sseWrite(res, event, data) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch { /* socket closed; ignore */ }
}

function sseEnd(res) {
  try { res.end(); } catch { /* already closed */ }
}

// ────────────────────────────────────────────────────────────────────
// Public surface — orchestrators with provider routing + fallback
// ────────────────────────────────────────────────────────────────────

// True when a primary-provider error should trigger fallback to the
// alternate provider. 429 is the canonical case; 5xx is also worth
// retrying.
function shouldFallback(result) {
  if (!result || result.ok) return false;
  const s = result.status;
  return s === 429 || (s >= 500 && s < 600);
}

async function invokeChat({ system, messages, tools, model, maxTokens, meter }) {
  const provider = resolveProvider(model);
  const order = provider === 'auto' ? ['kimi', 'anthropic'] : [provider];
  let result;
  let fallbackUsed = false;

  for (let i = 0; i < order.length; i++) {
    const p = order[i];
    result = p === 'kimi'
      ? await invokeKimi({ system, messages, tools, model, maxTokens })
      : await invokeAnthropic({ system, messages, tools, model, maxTokens });
    logUsage(meter, {
      provider: p === 'kimi' ? 'moonshot' : 'anthropic',
      model: result.model || (p === 'kimi' ? resolveKimiModel(model) : resolveAnthropicModel(model)),
      promptTokens: result.usage?.input_tokens,
      completionTokens: result.usage?.output_tokens,
      durationMs: result.latencyMs,
      success: !!result.ok,
      errorCode: result.ok ? null : (result.error || 'unknown'),
      requestContext: { surface: 'public_chat', fallback: i > 0 },
    });
    if (result.ok) break;
    if (!shouldFallback(result)) break;
    if (i + 1 < order.length) {
      console.warn(`[chat-proxy] ${p} failed (${result.status} ${result.error}); falling back to ${order[i + 1]}`);
      fallbackUsed = true;
    }
  }

  if (fallbackUsed && result.ok) result.fallbackUsed = true;
  return result;
}

async function streamChat({ system, messages, tools, model, maxTokens, meter, res }) {
  const provider = resolveProvider(model);
  const order = provider === 'auto' ? ['kimi', 'anthropic'] : [provider];

  // Start SSE response headers ONCE up front. If the primary fails
  // before emitting any chunk, the fallback also writes to this same
  // stream — only one envelope ever ships.
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // disable nginx response buffering for SSE
  });

  let result;
  let fallbackUsed = false;

  for (let i = 0; i < order.length; i++) {
    const p = order[i];
    result = p === 'kimi'
      ? await streamKimi({ system, messages, tools, model, maxTokens, res })
      : await streamAnthropic({ system, messages, tools, model, maxTokens, res });
    logUsage(meter, {
      provider: p === 'kimi' ? 'moonshot' : 'anthropic',
      model: result.model || (p === 'kimi' ? resolveKimiModel(model) : resolveAnthropicModel(model)),
      promptTokens: result.inputTokens ?? result.usage?.input_tokens,
      completionTokens: result.outputTokens ?? result.usage?.output_tokens,
      durationMs: result.latencyMs,
      success: !!result.ok,
      errorCode: result.ok ? null : (result.error || 'unknown'),
      requestContext: { surface: 'public_chat_stream', fallback: i > 0 },
    });
    if (result.ok) break;
    if (!shouldFallback(result)) break;
    if (i + 1 < order.length) {
      console.warn(`[chat-proxy stream] ${p} failed (${result.status} ${result.error}); falling back to ${order[i + 1]}`);
      fallbackUsed = true;
    }
  }

  if (!result.ok) {
    sseWrite(res, 'error', { message: result.error || 'upstream chat failed', code: result.status || 502 });
  }
  sseEnd(res);

  if (fallbackUsed && result.ok) result.fallbackUsed = true;
  return result;
}

module.exports = {
  invokeChat,
  streamChat,
  // Exported for unit tests / inspection
  resolveProvider,
  resolveKimiModel,
  resolveAnthropicModel,
};
