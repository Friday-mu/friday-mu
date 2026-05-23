'use strict';

// Receipt OCR + structured-field extraction.
//
// Ishant 2026-05-23: "someone should be able to upload a picture of the
// receipt and an LLM that extracts the information from from that
// receipt. And that should should be the same LLM we have everywhere,
// uh, which is generally three point five flash, um, Gemini."
//
// Mirrors the parse-task pattern (src/intent/task_parser.js). Sibling
// endpoint under /api/intent.
//
// Contract:
//   POST /api/intent/parse-receipt
//   Body: { image_base64, content_type, hint? }
//     - image_base64: required, the receipt image (JPG/PNG/WebP/PDF).
//     - content_type: MIME hint (default 'image/jpeg').
//     - hint: optional free-text context, e.g. "this is for a plumbing
//       repair at GBH-C8" — helps the model guess category/property.
//   Returns: {
//     extracted: {
//       vendor_name?, amount?, currency?, date?, category_hint?,
//       line_items?: [{ description, amount }], notes?
//     },
//     confidence: 'high'|'medium'|'low',
//     source: 'gemini'|'kimi'|'unknown',
//     model, durationMs
//   }
//
// We do NOT persist the image here — the expense create endpoint stores
// it. This is a pure extraction call.

const express = require('express');
const axios = require('axios');
const { attachIdentity } = require('../design/auth');
const { recordUsage, enforceQuota, QuotaExceededError } = require('../tenants/ai_usage');

const router = express.Router();

const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.NANOBANANA_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_DRAFT_MODEL || 'gemini-3.5-flash';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;  // 10 MB after base64 decode
const TIMEOUT_MS = 60_000;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']);

function buildSystemPrompt() {
  return `You are a receipt-extraction assistant for Friday Retreats' Operations team.

The operator uploaded a photo of a paper receipt or a PDF invoice. Pull out the structured fields and return JSON.

OUTPUT JSON ONLY, shape:
{
  "vendor_name": "<merchant / supplier as printed on the receipt>" | null,
  "amount": <number — the GRAND TOTAL the operator paid> | null,
  "currency": "MUR" | "EUR" | "USD" | null,
  "date": "YYYY-MM-DD" | null,
  "category_hint": "<short text — e.g. 'plumbing supplies', 'cleaning consumables', 'fuel'>" | null,
  "line_items": [
    { "description": "<short>", "amount": <number> }
  ] | null,
  "notes": "<anything else worth flagging — handwriting, blurriness, missing total>" | null,
  "confidence": "high" | "medium" | "low"
}

Rules:
- The amount is the GRAND TOTAL. If the receipt has subtotal + VAT + total, return TOTAL.
- Mauritius is the primary market. Default currency = "MUR" if the receipt has no symbol and the country looks Mauritian (any address in Mauritius / Rs symbol / vendors like Pereybere Hardware, Winners, Super U). Use "EUR" only if EUR / € is clearly stamped.
- date is the receipt date, formatted YYYY-MM-DD. If only a relative date is visible, return null.
- Vendor name: take the most-prominent business name. Don't include the receipt header chrome ("RECEIPT", "INVOICE", phone numbers).
- category_hint: a short noun phrase that helps the operator pick from FR-OPS-CLEAN / FR-OPS-MAINT / FR-OPS-GARDEN / FR-OPS-CONSUM / FR-OPS-FUEL / FR-OPS-OTHER / FR-ADM-*. Don't return a code — return human text. "plumbing supplies" not "FR-OPS-MAINT".
- line_items: only include if individual lines are clearly readable. If the receipt is summarized or partial, omit (return null). 5 items max.
- confidence: "high" if every field is clearly readable; "medium" if amount + vendor are clear but date or items are guessed; "low" if you had to extrapolate the total or guess the vendor name.
- Return ONLY the JSON. No prose, no fences.`;
}

router.post('/parse-receipt', attachIdentity, async (req, res) => {
  const start = Date.now();
  try {
    const body = req.body || {};
    const imageBase64 = typeof body.image_base64 === 'string' ? body.image_base64 : '';
    if (!imageBase64) return res.status(400).json({ error: 'image_base64 is required' });
    const contentType = String(body.content_type || 'image/jpeg').toLowerCase();
    if (!ALLOWED_TYPES.has(contentType)) {
      return res.status(415).json({ error: `unsupported content_type: ${contentType}` });
    }
    const approxBytes = Math.floor(imageBase64.length * 0.75);
    if (approxBytes > MAX_IMAGE_BYTES) {
      return res.status(413).json({ error: `image exceeds ${MAX_IMAGE_BYTES} bytes` });
    }
    const hint = String(body.hint || '').trim().slice(0, 600);

    if (!GEMINI_API_KEY) {
      return res.status(503).json({
        error: 'AI receipt extraction is not configured (GEMINI_API_KEY unset)',
        source: 'template-fallback',
        durationMs: Date.now() - start,
      });
    }

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

    // Build the multimodal user content. Gemini wants the image as
    // inline_data with the same base64 string we received.
    const userParts = [
      { text: hint ? `Operator hint: ${hint}\n\nExtract the receipt fields:` : 'Extract the receipt fields:' },
      { inline_data: { mime_type: contentType, data: imageBase64 } },
    ];

    const { data } = await axios.post(
      `${GEMINI_BASE_URL}/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,
      {
        systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
        contents: [{ role: 'user', parts: userParts }],
        generationConfig: {
          maxOutputTokens: 1024,
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      },
      {
        headers: { 'x-goog-api-key': GEMINI_API_KEY, 'Content-Type': 'application/json' },
        timeout: TIMEOUT_MS,
      },
    );

    const candidate = data?.candidates?.[0];
    const text = candidate?.content?.parts?.map((p) => p.text ?? '').join('') || '';
    const usage = data?.usageMetadata || {};

    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Recover the first {...} block.
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { /* fall through */ }
      }
    }
    if (!parsed) {
      // Log + return so the frontend can still show a useful error.
      recordUsage({
        tenantId: req.tenantId,
        feature: 'intent_parse_receipt',
        provider: 'google',
        model: GEMINI_MODEL,
        promptTokens: usage.promptTokenCount ?? null,
        completionTokens: usage.candidatesTokenCount ?? null,
        durationMs: Date.now() - start,
        success: false,
        errorCode: 'unparseable_json',
      }).catch(() => {});
      return res.status(502).json({
        error: 'AI returned an unparseable response',
        source: 'gemini-error',
        durationMs: Date.now() - start,
      });
    }

    // Shape the output — drop anything we don't whitelist.
    const extracted = {
      vendor_name: typeof parsed.vendor_name === 'string' && parsed.vendor_name.trim()
        ? parsed.vendor_name.trim().slice(0, 200) : null,
      amount: Number.isFinite(Number(parsed.amount)) && Number(parsed.amount) > 0
        ? Number(parsed.amount) : null,
      currency: ['MUR', 'EUR', 'USD'].includes(parsed.currency) ? parsed.currency : null,
      date: typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)
        ? parsed.date : null,
      category_hint: typeof parsed.category_hint === 'string' ? parsed.category_hint.trim().slice(0, 120) : null,
      line_items: Array.isArray(parsed.line_items)
        ? parsed.line_items.slice(0, 5).map((li) => ({
            description: typeof li?.description === 'string' ? li.description.trim().slice(0, 120) : '',
            amount: Number.isFinite(Number(li?.amount)) ? Number(li.amount) : null,
          })).filter((li) => li.description)
        : null,
      notes: typeof parsed.notes === 'string' ? parsed.notes.trim().slice(0, 400) : null,
    };
    const confidence = ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium';

    recordUsage({
      tenantId: req.tenantId,
      feature: 'intent_parse_receipt',
      provider: 'google',
      model: GEMINI_MODEL,
      promptTokens: usage.promptTokenCount ?? null,
      completionTokens: usage.candidatesTokenCount ?? null,
      durationMs: Date.now() - start,
      success: true,
    }).catch(() => {});

    return res.json({
      extracted,
      confidence,
      source: 'gemini',
      model: GEMINI_MODEL,
      durationMs: Date.now() - start,
    });
  } catch (e) {
    console.error('[intent/parse-receipt] error:', e.message);
    res.status(500).json({ error: e.message, durationMs: Date.now() - start });
  }
});

module.exports = { router };
