'use strict';

// Kimi integration for the Conversational Floor-Plan Editor (W3).
//
// translateToOps(model, userMessage) takes the current FloorPlanModel
// + the user's chat message, asks Kimi to produce a list of
// FloorPlanOperation objects, and returns `{ ops, reply }`. The ops
// array is then handed to applyOps() (floor_plan_ops.js) by the
// /api/design/floor-plan-chats POST route.
//
// We reuse the axios + JSON-mode pattern from ai_rough_budget.js but
// keep this file self-contained — copying ~30 lines of Kimi-call
// boilerplate is cheaper than a refactor that risks breaking the
// existing rough-budget endpoint mid-sprint.

const axios = require('axios');
const { MODEL_SUMMARY_FOR_KIMI } = require('./floor_plan_catalog');

const KIMI_BASE_URL = process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1';
const KIMI_MODEL = process.env.KIMI_MODEL || 'moonshot-v1-8k';
const TIMEOUT_MS = 35_000;

const FALLBACK_REPLY = "Friday couldn't reach Kimi. Try again in a moment.";
const UNCLEAR_REPLY = "I'm not sure what to change. Could you clarify?";

// System prompt template. The catalog summary is interpolated once
// at require time; the prompt itself is constant per process so
// Kimi's cache (if any) gets a stable prefix.
const SYSTEM_PROMPT = `You are the operation translator for Friday's conversational floor-plan editor.
You receive the current vector floor plan and a user instruction. You output
a JSON object: { "ops": [...], "reply": "..." } where "ops" is an array of
operations from the schema below, and "reply" is a one-sentence summary of
what you did for the user to see in chat.

Hard rules:
- Walls are FIXED. Don't add or remove walls unless the user explicitly says.
- If you can't understand the instruction, return { "ops": [], "reply": "${UNCLEAR_REPLY}" }.
- Don't invent items the user didn't ask for.
- Use item ids from the current model when referring to existing items.
- All coordinates are in metres.
- Output JSON only — no commentary outside the JSON object.

Operation schema (each entry in "ops" must match one of these shapes):
- { "op": "add_furniture", "category": "<one of the catalog categories>", "near"?: { "kind": "wall"|"item"|"room", "id": "<existing id>", "side"?: "left"|"right"|"top"|"bottom" }, "centre"?: {"x": <m>, "y": <m>}, "width"?: <m>, "depth"?: <m>, "rotation"?: <deg>, "roomId"?: "<id>", "style"?: "<short style label>" }
- { "op": "move_furniture", "itemId": "<existing id>", "to"?: {"x": <m>, "y": <m>}, "delta"?: {"dx": <m>, "dy": <m>} }
- { "op": "remove_furniture", "itemId": "<existing id>" }
- { "op": "rotate_furniture", "itemId": "<existing id>", "rotation": <deg> }
- { "op": "recolor_surface", "surfaceId": "<existing id>", "color": "#RRGGBB" }
- { "op": "retexture_surface", "surfaceId": "<existing id>", "texture": "<short key>" }
- { "op": "set_style_notes", "notes": "<free text passed to the texture renderer>" }
- { "op": "add_wall", "a": {"x": <m>, "y": <m>}, "b": {"x": <m>, "y": <m>}, "thickness"?: <m> }   // ONLY when user explicitly asks
- { "op": "remove_wall", "wallId": "<existing id>" }                                              // ONLY when user explicitly asks

Furniture catalog (use the exact category strings on the left):
${MODEL_SUMMARY_FOR_KIMI}`;

// Strip optional ```json fences before JSON.parse.
function _parseModelJson(raw) {
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  try { return JSON.parse(s); } catch { return null; }
}

// Coerce a Kimi response into our { ops, reply } contract.
// - ops must be an array; non-array → []
// - each op must be an object with an "op" string field; otherwise dropped
// - reply must be a string; otherwise empty string
//
// We don't validate the inner op shape here — that's applyOps()'s
// job. Doing it twice would double the maintenance surface.
function _shapeKimiResponse(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return { ops: [], reply: UNCLEAR_REPLY };
  }
  const ops = Array.isArray(parsed.ops)
    ? parsed.ops.filter((o) => o && typeof o === 'object' && typeof o.op === 'string')
    : [];
  const reply = typeof parsed.reply === 'string' && parsed.reply.trim()
    ? parsed.reply.trim()
    : (ops.length === 0 ? UNCLEAR_REPLY : 'Done.');
  return { ops, reply };
}

// Compact-stringify the model for the user message. For v1 we send
// the full model — moonshot-v1-8k has plenty of headroom. If models
// get bigger we'll compress (drop room outlines, summarise furniture)
// here.
function _serialiseModelForPrompt(model) {
  return JSON.stringify(model, null, 0);
}

async function translateToOps(model, userMessage) {
  if (!process.env.KIMI_API_KEY) {
    return { ops: [], reply: FALLBACK_REPLY };
  }
  const userContent = JSON.stringify({
    instruction: String(userMessage || '').trim(),
    current_model: _serialiseModelForPrompt(model),
  });
  try {
    const { data } = await axios.post(
      `${KIMI_BASE_URL}/chat/completions`,
      {
        model: KIMI_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        temperature: 0.2,
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
    const parsed = _parseModelJson(raw);
    if (!parsed) {
      console.warn('[floor_plan_kimi] Kimi returned unparseable JSON');
      return { ops: [], reply: UNCLEAR_REPLY };
    }
    return _shapeKimiResponse(parsed);
  } catch (e) {
    console.error('[floor_plan_kimi] Kimi call failed:', e.response?.data?.error?.message || e.message);
    return { ops: [], reply: FALLBACK_REPLY };
  }
}

module.exports = {
  translateToOps,
  // Exported for tests / debugging only.
  SYSTEM_PROMPT,
  FALLBACK_REPLY,
  UNCLEAR_REPLY,
};
