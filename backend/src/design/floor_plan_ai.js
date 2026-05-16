'use strict';

// Gemini integration for the Conversational Floor-Plan Editor (W3).
//
// Migrated 2026-05-16 from Kimi (Moonshot) → Gemini 2.5 Flash. Reason:
// Mathias's chat sessions were producing geometrically incoherent
// placements (furniture overlapping walls, sofas in corners with no
// clearance, etc.). Gemini 3 leads on ARC-AGI-2 spatial reasoning
// (77.1% vs Claude 68.8% / GPT-5.2 52.9%) and accepts an inline image
// of the current layout as multi-modal context — so we now ship the
// rendered SVG of the floor plan alongside the JSON model. The model
// can SEE the room, not just read coordinates.
//
// We also bolt on an interior-design knowledge base (floor_plan_design_kb
// .js) — clearances, arrangement principles, anti-patterns. Without it
// Gemini still does spatial reasoning but doesn't know that a sofa
// should sit on a rug, or that 0.9 m of clearance is the magic number
// for walkways.
//
// translateToOps(model, userMessage, opts?) keeps the same signature
// as the old Kimi version so floor_plan_chats.js doesn't have to
// change. Optional `opts.roomKind` lets the caller ship only the
// room-specific KB slice when it knows what's being edited.

const axios = require('axios');
const { MODEL_SUMMARY_FOR_KIMI } = require('./floor_plan_catalog');
const { INTERIOR_DESIGN_KB, kbForRoom } = require('./floor_plan_design_kb');
const { renderModelToSvg } = require('./floor_plan_renderer');

// Same env-var family as ai_images.js — Gemini lives on Google AI
// Studio's generativelanguage API and the FR codename is Nanobanana.
// We default to gemini-2.5-flash (text-mode) here, not the image model
// — fast + cheap for op translation. Override via FLOOR_PLAN_AI_MODEL
// if a future run prefers gemini-3-pro or similar.
const GEMINI_BASE_URL = process.env.NANOBANANA_BASE_URL
  || 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_MODEL = process.env.FLOOR_PLAN_AI_MODEL || 'gemini-2.5-flash';
const TIMEOUT_MS = 35_000;

const FALLBACK_REPLY = "Friday couldn't reach the model. Try again in a moment.";
const UNCLEAR_REPLY = "I'm not sure what to change. Could you clarify?";

// Operation grammar — verbatim from the old Kimi prompt. The shapes
// here are the contract applyOps() validates against; keep this list
// in sync with floor_plan_ops.js.
const OP_GRAMMAR = `Operation schema (each entry in "ops" must match one of these shapes):
- { "op": "add_furniture", "category": "<one of the catalog categories>", "near"?: { "kind": "wall"|"item"|"room", "id": "<existing id>", "side"?: "left"|"right"|"top"|"bottom" }, "centre"?: {"x": <m>, "y": <m>}, "width"?: <m>, "depth"?: <m>, "rotation"?: <deg>, "roomId"?: "<id>", "style"?: "<short style label>" }
- { "op": "move_furniture", "itemId": "<existing id>", "to"?: {"x": <m>, "y": <m>}, "delta"?: {"dx": <m>, "dy": <m>} }
- { "op": "remove_furniture", "itemId": "<existing id>" }
- { "op": "rotate_furniture", "itemId": "<existing id>", "rotation": <deg> }
- { "op": "recolor_surface", "surfaceId": "<existing id>", "color": "#RRGGBB" }
- { "op": "retexture_surface", "surfaceId": "<existing id>", "texture": "<short key>" }
- { "op": "set_style_notes", "notes": "<free text passed to the texture renderer>" }
- { "op": "add_wall", "a": {"x": <m>, "y": <m>}, "b": {"x": <m>, "y": <m>}, "thickness"?: <m> }   // ONLY when user explicitly asks
- { "op": "remove_wall", "wallId": "<existing id>" }                                              // ONLY when user explicitly asks`;

// Static directive block — invariant per process so Gemini's prefix
// cache (when available) sees a stable head. Per-turn content (KB
// slice, model JSON, user instruction, SVG) is appended in
// buildPromptParts() below.
const RESPONSE_CONTRACT = `You are the operation translator for Friday's conversational floor-plan editor.
You receive the current vector floor plan (JSON + rendered SVG image of the layout) and a user instruction.
You output a single JSON object: { "ops": [...], "reply": "..." }
- "ops" is an array of operations from the schema below
- "reply" is a one-sentence summary of what you did (shown to the user in chat)

Hard rules:
- Walls are FIXED. Don't add or remove walls unless the user explicitly says.
- If you can't understand the instruction, return { "ops": [], "reply": "${UNCLEAR_REPLY}" }.
- Don't invent items the user didn't ask for.
- Use item ids from the current model when referring to existing items.
- All coordinates are in metres.
- Apply the interior-design knowledge base when deciding placements, sizes, and rotations.
- Look at the SVG image to verify your placements won't collide with walls or other items.
- Output JSON only — no commentary, no markdown fences, no prose outside the JSON object.

Style intent (set_style_notes):
- Whenever the user message contains an aesthetic descriptor — e.g. "modern
  coastal", "industrial loft", "japandi", "boho", "scandi", "mid-century
  modern", "minimalist", "warm earthy tones", "brass fixtures", "rattan and
  linen" — emit a "set_style_notes" op with a concise notes string capturing
  the cumulative style direction.
- The styleNotes value persists across versions: if the current model has
  styleNotes already, MERGE the new descriptor in (e.g. existing
  "modern coastal" + new "more brass fixtures" → "modern coastal, brass
  fixtures"). Don't overwrite unless the user explicitly says "change the
  style to ...".
- Style cues may appear standalone ("let's go modern coastal") with no
  furniture op required — in that case the response should be ONLY the
  set_style_notes op.
- They may also appear alongside a furniture op ("add a rattan armchair") —
  emit both the add_furniture op AND a set_style_notes op so the aesthetic
  is preserved for subsequent renders.

Learning from prior turns:
- If a previous turn was rejected for a clearance violation, do NOT retry the
  same placement. Read the rejection reason in the conversation history and
  choose a different location or smaller item.`;

// Strip optional ```json fences before JSON.parse. Gemini occasionally
// wraps responses in fences despite "JSON only" instructions; the
// fallback is cheap.
function _parseModelJson(raw) {
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  try { return JSON.parse(s); } catch { return null; }
}

// Coerce a Gemini response into our { ops, reply } contract. Same
// validation shape as the old Kimi version — applyOps() does the deep
// op-shape validation; we only enforce the outer envelope here.
function _shapeResponse(parsed) {
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

// Compact JSON for the user message. v1 sent the full model to Kimi —
// Gemini 2.5 Flash has 1M-token context so we can keep that, plus the
// SVG, comfortably.
function _serialiseModelForPrompt(model) {
  return JSON.stringify(model);
}

// Format recent chat turns for the prompt. `history` is oldest-first.
// We trim to the last 5 turns, skip `failed` status entirely (those are
// infra errors, no signal for Gemini), and keep `applied` + `rejected`
// turns. Rejected turns carry the rejection reason in friday_reply so
// Gemini learns not to retry the same violation.
const _MAX_HISTORY_TURNS = 5;
function _formatHistory(history) {
  if (!Array.isArray(history) || history.length === 0) return '';
  const usable = history
    .filter((h) => h && typeof h === 'object' && h.status !== 'failed')
    .filter((h) => typeof h.user_message === 'string' && h.user_message.trim());
  if (usable.length === 0) return '';
  const trimmed = usable.slice(-_MAX_HISTORY_TURNS);
  const lines = ['Recent conversation history (oldest first):'];
  trimmed.forEach((h, i) => {
    const userText = String(h.user_message).replace(/\s+/g, ' ').trim();
    const replyText = typeof h.friday_reply === 'string'
      ? h.friday_reply.replace(/\s+/g, ' ').trim()
      : '';
    const status = h.status === 'rejected' ? 'rejected' : 'applied';
    const replyLine = replyText
      ? `   Friday: "${replyText}" (status: ${status})`
      : `   Friday: (no reply) (status: ${status})`;
    lines.push(`${i + 1}. User: "${userText}"`);
    lines.push(replyLine);
  });
  return lines.join('\n');
}

// Render the current model as an SVG, then base64-encode it as an
// image/svg+xml data part for Gemini's multi-modal input. Returns null
// if rendering fails — we'd rather degrade to text-only than fail the
// whole turn.
function _renderSvgPart(model) {
  try {
    const svg = renderModelToSvg(model);
    const b64 = Buffer.from(svg, 'utf-8').toString('base64');
    return {
      inlineData: {
        mimeType: 'image/svg+xml',
        data: b64,
      },
    };
  } catch (e) {
    console.warn('[floor_plan_ai] SVG render failed (degrading to text-only):', e.message);
    return null;
  }
}

// Build the full `contents[0].parts` array for the Gemini request.
// Order matters: KB + grammar + catalog + response contract (system-ish
// preamble) → SVG image of current state → JSON model + user
// instruction. Gemini's documented few-shot pattern wants images
// adjacent to the text that references them.
function buildPromptParts(model, userMessage, opts = {}) {
  const kb = opts.roomKind ? kbForRoom(opts.roomKind) : INTERIOR_DESIGN_KB;
  const systemBlock = [
    RESPONSE_CONTRACT,
    '',
    kb,
    '',
    OP_GRAMMAR,
    '',
    'Furniture catalog (use the exact category strings on the left):',
    MODEL_SUMMARY_FOR_KIMI,
  ].join('\n');

  const parts = [{ text: systemBlock }];

  const svgPart = _renderSvgPart(model);
  if (svgPart) {
    parts.push({ text: 'Current layout (rendered SVG, top-down view, metres):' });
    parts.push(svgPart);
  }

  // Conversation history — included before the current user turn so
  // Gemini sees what was already tried and what was rejected. Empty
  // string when there's no usable history.
  const historyBlock = _formatHistory(opts.history);
  if (historyBlock) {
    parts.push({ text: historyBlock });
  }

  const userBlock = JSON.stringify({
    instruction: String(userMessage || '').trim(),
    current_model: _serialiseModelForPrompt(model),
  });
  parts.push({ text: `User turn:\n${userBlock}` });

  return parts;
}

async function translateToOps(model, userMessage, opts = {}) {
  if (!process.env.NANOBANANA_API_KEY) {
    return { ops: [], reply: FALLBACK_REPLY };
  }
  const parts = buildPromptParts(model, userMessage, opts);
  const url = `${GEMINI_BASE_URL}/models/${GEMINI_MODEL}:generateContent`;
  const body = {
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.2,
      // Gemini honours response_mime_type for strict JSON when set —
      // saves us from having to defensive-parse fences in the happy
      // path. _parseModelJson is still there as a belt-and-braces.
      responseMimeType: 'application/json',
    },
  };
  try {
    const { data } = await axios.post(url, body, {
      headers: {
        'x-goog-api-key': process.env.NANOBANANA_API_KEY,
        'Content-Type': 'application/json',
      },
      timeout: TIMEOUT_MS,
    });
    const respParts = data?.candidates?.[0]?.content?.parts || [];
    // With responseMimeType=application/json Gemini returns the JSON
    // string in a text part; fall back to scanning all text parts in
    // case future SDKs change the shape.
    const raw = respParts.map((p) => p?.text).filter(Boolean).join('') || '';
    const parsed = _parseModelJson(raw);
    if (!parsed) {
      console.warn('[floor_plan_ai] Gemini returned unparseable JSON:', raw.slice(0, 200));
      return { ops: [], reply: UNCLEAR_REPLY };
    }
    return _shapeResponse(parsed);
  } catch (e) {
    console.error(
      '[floor_plan_ai] Gemini call failed:',
      e.response?.data?.error?.message || e.message,
    );
    return { ops: [], reply: FALLBACK_REPLY };
  }
}

module.exports = {
  translateToOps,
  // Exported for tests / debugging only.
  buildPromptParts,
  FALLBACK_REPLY,
  UNCLEAR_REPLY,
  GEMINI_MODEL,
};
