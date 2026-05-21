'use strict';

// POST /api/public/chat — multi-provider chat-completions for the
// friday.mu website + future public consumers.
//
// Per FAD-HANDOFF-PUBLIC-CHAT-2026-05-18.md. Centralises three website
// chat surfaces (Ask Friday hero, owner-enquiry, feedback FAB) onto
// FAD-owned credentials. Website drops MOONSHOT_API_KEY +
// ANTHROPIC_API_KEY from Vercel env after cutover.
//
// Auth: short-lived JWT via /api/auth/token (scope `ai:chat`).
// Streaming: SSE when `stream: true` in body. Non-streaming JSON
// when false (default).
//
// Request body:
//   {
//     "system": "string",                   // optional
//     "messages": [{ role, content }, ...], // required
//     "tools": [/* OpenAI-shape */],        // optional
//     "model": "auto"|"kimi-k2"|"claude-sonnet-4-6",  // default "auto"
//     "stream": false                       // default false
//   }
//
// Non-streaming response (200):
//   { "message": { role, content, tool_calls? },
//     "usage":   { input_tokens, output_tokens, total_tokens },
//     "model":   "...",
//     "fallback_used": false                  // true if primary 429d
//   }
//
// Streaming response (200, text/event-stream):
//   event: text-delta   data: { delta: "..." }
//   ... (many)
//   event: envelope     data: { message, usage, model }
//   event: error        data: { message, code }      (on failure)

const express = require('express');
const crypto = require('crypto');
const { attachApiClient, requireScope } = require('../auth/api_clients');
const { invokeChat, streamChat } = require('../ai/chat_proxy');

const router = express.Router();

// Request body is JSON; server.js's global express.json() middleware
// already parses it before this route fires (no skip-list entry for
// /api/public/chat). Output is either JSON or SSE depending on
// `body.stream`; we set SSE headers inside chat_proxy.streamChat
// only when streaming.

// Allow CORS preflights from the website's edge — fad-backend's
// top-level cors() is permissive but explicit doesn't hurt.
router.options('/', (req, res) => res.sendStatus(204));

function publicError(res, status, code, message) {
  return res.status(status).json({
    error: code,
    message: message || code,
    request_id: crypto.randomUUID(),
  });
}

// Validate request body. Returns a normalised object or null + writes
// the error response.
function validateChatBody(body, res) {
  if (!body || typeof body !== 'object') {
    publicError(res, 400, 'invalid_request', 'request body must be an object');
    return null;
  }
  const messages = Array.isArray(body.messages) ? body.messages : null;
  if (!messages || messages.length === 0) {
    publicError(res, 400, 'invalid_request', 'messages[] is required and must be non-empty');
    return null;
  }
  // Light validation per message — defensive but not strict (Anthropic
  // / Moonshot already reject malformed shapes upstream).
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m || typeof m !== 'object') {
      publicError(res, 400, 'invalid_request', `messages[${i}] must be an object`);
      return null;
    }
    if (!['user', 'assistant', 'system', 'tool'].includes(m.role)) {
      publicError(res, 400, 'invalid_request', `messages[${i}].role must be user|assistant|system|tool`);
      return null;
    }
    if (typeof m.content !== 'string' && !Array.isArray(m.content)) {
      publicError(res, 400, 'invalid_request', `messages[${i}].content must be string or array`);
      return null;
    }
  }
  const system = typeof body.system === 'string' ? body.system : undefined;
  const tools = Array.isArray(body.tools) ? body.tools : undefined;
  const model = typeof body.model === 'string' ? body.model : 'auto';
  const stream = !!body.stream;
  const maxTokens = Number.isFinite(body.max_tokens) ? Number(body.max_tokens) : undefined;
  return { system, messages, tools, model, stream, maxTokens };
}

router.post('/', attachApiClient, requireScope('ai:chat'), async (req, res) => {
  const parsed = validateChatBody(req.body, res);
  if (!parsed) return;

  const meter = {
    tenantId: req.apiClient?.tenantId,
    feature: parsed.stream ? 'public_chat_stream' : 'public_chat',
  };

  if (!parsed.stream) {
    // Non-streaming path — invoke + return JSON.
    try {
      const result = await invokeChat({
        system: parsed.system,
        messages: parsed.messages,
        tools: parsed.tools,
        model: parsed.model,
        maxTokens: parsed.maxTokens,
        meter,
      });
      if (!result.ok) {
        return publicError(
          res,
          result.status === 429 ? 429 : (result.status >= 400 && result.status < 600 ? result.status : 502),
          result.status === 429 ? 'rate_limited' : 'upstream_error',
          result.error || 'upstream chat failed',
        );
      }
      return res.json({
        message: result.message,
        usage: result.usage,
        model: result.model,
        fallback_used: !!result.fallbackUsed,
      });
    } catch (e) {
      console.error('[public/chat] unhandled invoke error:', e.message);
      return publicError(res, 500, 'internal_error', 'unexpected error');
    }
  }

  // Streaming path. streamChat sets headers + writes events + ends.
  try {
    await streamChat({
      system: parsed.system,
      messages: parsed.messages,
      tools: parsed.tools,
      model: parsed.model,
      maxTokens: parsed.maxTokens,
      meter,
      res,
    });
  } catch (e) {
    // streamChat handles its own errors via SSE error event + end;
    // this catch is for the case where something throws before
    // headers were written.
    console.error('[public/chat] stream invoke error:', e.message);
    if (!res.headersSent) {
      return publicError(res, 500, 'internal_error', e.message);
    }
    try {
      res.write(`event: error\ndata: ${JSON.stringify({ message: e.message, code: 500 })}\n\n`);
      res.end();
    } catch { /* socket already closed */ }
  }
});

module.exports = router;
