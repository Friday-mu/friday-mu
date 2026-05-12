'use strict';

// Nanobanana image generation pipeline. Mirrors translate.js shape:
// (a) env-gated — returns a stub if NANOBANANA_API_KEY is unset, so the
//     route stays wired and the frontend can integrate before the key
//     lands without 500s, (b) disk-cached so identical re-generates are
//     free (Imagen calls aren't cheap), (c) 3x retry with exponential
//     backoff to absorb transient 429/5xx from generativelanguage.googleapis.
//
// "Nanobanana" is the FR internal name for Google's Gemini-based image gen
// surface — currently the `imagen-3.0-generate-002` model on the
// generativelanguage REST API. Endpoint and model may move; we pin them
// via env (NANOBANANA_MODEL / NANOBANANA_BASE_URL) and default to the
// latest known-good Imagen 3 SKU. The body shape differs from text
// Gemini — Imagen returns base64-encoded image bytes under
// `predictions[].bytesBase64Encoded` rather than `candidates[].content`.

const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const NANOBANANA_BASE_URL = process.env.NANOBANANA_BASE_URL
  || 'https://generativelanguage.googleapis.com/v1beta';
// "Nanobanana" is Google's codename for the Gemini 2.5 Flash Image
// model, served via Google AI Studio's generativelanguage REST API on
// the generateContent endpoint (NOT the Vertex AI predict endpoint —
// Imagen 3 lives there and needs a different key kind). We support
// both surfaces via the model-name detector below: anything starting
// with "imagen" goes Vertex/predict, anything else goes Gemini/
// generateContent. Default is the current Nanobanana SKU.
const NANOBANANA_MODEL = process.env.NANOBANANA_MODEL || 'gemini-2.5-flash-image-preview';
const USES_PREDICT_API = /^imagen/i.test(NANOBANANA_MODEL);
const MAX_RETRIES = 3;
const STUB_IMAGE_URL = 'https://via.placeholder.com/1024x768.png?text=Nanobanana+stub+(no+API+key+set)';

// ────────────────── disk cache ──────────────────
//
// Keyed by sha256(prompt + referenceImageUrl). Survives nodemon reload.
// Cache value is the full result object so a re-call returns immediately
// with `cached: true` (callers can use this to skip re-uploading).

const CACHE_FILE = path.join(__dirname, '..', '..', '.nanobanana-cache.json');
let cache = readCache();

function readCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return {};
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    return (raw && typeof raw === 'object') ? raw : {};
  } catch { return {}; }
}

function writeCache() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf-8');
  } catch (e) {
    console.warn('[imagegen] cache write failed:', e.message);
  }
}

function cacheKey(prompt, referenceImageUrl) {
  const h = crypto.createHash('sha256');
  h.update(String(prompt || ''));
  h.update('\n');
  h.update(String(referenceImageUrl || ''));
  return h.digest('hex');
}

// ────────────────── stub warning (one-shot) ──────────────────

let stubWarned = false;
function warnStubOnce() {
  if (stubWarned) return;
  stubWarned = true;
  console.warn('[imagegen] NANOBANANA_API_KEY not set — returning stub image for all generate() calls. '
    + 'Set NANOBANANA_API_KEY in backend/.env to enable real generation.');
}

// ────────────────── retry helper ──────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// 429 + 5xx are retryable in theory, but Google AI Studio returns 429
// for BOTH per-minute rate limits AND daily-quota exhaustion. Retrying
// on quota-exhausted burns more of the budget without recovering, so
// we inspect the error message and refuse to retry when 'quota' is
// mentioned. Pure 4xx (bad prompt / safety filter) never retries.
function isRetryable(err) {
  const status = err?.response?.status;
  if (status == null) return true; // network/timeout — retry
  if (status === 429) {
    const msg = String(err?.response?.data?.error?.message || err?.message || '').toLowerCase();
    if (msg.includes('quota')) return false;
    return true; // pure rate-limit — backoff helps
  }
  if (status >= 500 && status < 600) return true;
  return false;
}

// ────────────────── model call ──────────────────

async function callNanobanana({ prompt, referenceImageUrl, size }) {
  return USES_PREDICT_API
    ? callImagenPredict({ prompt, referenceImageUrl, size })
    : callGeminiGenerateContent({ prompt, referenceImageUrl, size });
}

// Gemini 2.5 Flash Image (Nanobanana) — Google AI Studio surface.
// Body shape: { contents: [{parts: [{text}]}], generationConfig: { responseModalities: ['IMAGE'] } }
// Response: candidates[0].content.parts[*].inlineData.{mimeType, data(base64)}.
async function callGeminiGenerateContent({ prompt, size }) {
  const url = `${NANOBANANA_BASE_URL}/models/${NANOBANANA_MODEL}:generateContent`;
  const body = {
    contents: [{ parts: [{ text: String(prompt || '') }] }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      // aspectRatio hint via prompt suffix — generationConfig.imageConfig
      // is only honoured on some preview surfaces; embedding in the
      // prompt is the documented portable path.
    },
  };
  const aspect = aspectRatioForSize(size);
  if (aspect && aspect !== '4:3') {
    body.contents[0].parts[0].text += ` (aspect ratio: ${aspect})`;
  }
  const start = Date.now();
  const { data } = await axios.post(url, body, {
    headers: {
      'x-goog-api-key': process.env.NANOBANANA_API_KEY,
      'Content-Type': 'application/json',
    },
    timeout: 60_000,
  });
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find((p) => p?.inlineData?.data);
  if (!imgPart) {
    throw new Error('Nanobanana returned no image part (candidates[0].content.parts had no inlineData)');
  }
  const b64 = imgPart.inlineData.data;
  const mimeType = imgPart.inlineData.mimeType || 'image/png';
  const bytes = Buffer.from(b64, 'base64');
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const imageUrl = `data:${mimeType};base64,${b64}`;
  return {
    imageUrl,
    sha256,
    mimeType,
    byteSize: bytes.length,
    durationMs: Date.now() - start,
  };
}

// Imagen 3 (Vertex AI) — predict endpoint, base64 bytes under
// predictions[].bytesBase64Encoded. Requires a Vertex API key, not a
// Google AI Studio one. Kept for ops who switch to Vertex.
async function callImagenPredict({ prompt, size }) {
  const url = `${NANOBANANA_BASE_URL}/models/${NANOBANANA_MODEL}:predict`;
  const body = {
    instances: [{ prompt: String(prompt || '') }],
    parameters: { sampleCount: 1, aspectRatio: aspectRatioForSize(size) },
  };
  const start = Date.now();
  const { data } = await axios.post(url, body, {
    headers: {
      'x-goog-api-key': process.env.NANOBANANA_API_KEY,
      'Content-Type': 'application/json',
    },
    timeout: 60_000,
  });
  const pred = data?.predictions?.[0];
  const b64 = pred?.bytesBase64Encoded;
  if (!b64 || typeof b64 !== 'string') {
    throw new Error('Imagen returned no image bytes');
  }
  const bytes = Buffer.from(b64, 'base64');
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const mimeType = pred?.mimeType || 'image/png';
  const imageUrl = `data:${mimeType};base64,${b64}`;
  return {
    imageUrl,
    sha256,
    mimeType,
    byteSize: bytes.length,
    durationMs: Date.now() - start,
  };
}

function aspectRatioForSize(size) {
  // Imagen accepts a small enum of aspect ratios. We map common
  // size hints to the nearest supported value. Default to 4:3 since
  // moodboards and design packs are typically landscape.
  if (!size) return '4:3';
  const s = String(size).toLowerCase();
  if (s === 'square' || s === '1024x1024' || s === '1:1') return '1:1';
  if (s === 'portrait' || s === '3:4' || s === '768x1024') return '3:4';
  if (s === '16:9' || s === 'wide') return '16:9';
  if (s === '9:16' || s === 'tall') return '9:16';
  return '4:3';
}

// ────────────────── public API ──────────────────

async function generateImage({ prompt, referenceImageUrl, style, size } = {}) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('generateImage: prompt is required');
  }
  // style is folded into the prompt — Imagen doesn't have a separate
  // style channel, and prepending the directive is the documented
  // recommendation. Keep style optional so callers can pass a clean prompt.
  const generatorPrompt = style ? `${style}. ${prompt}` : prompt;

  // ── stub path ──
  if (!process.env.NANOBANANA_API_KEY) {
    warnStubOnce();
    return {
      imageUrl: STUB_IMAGE_URL,
      sha256: 'stub-' + Date.now(),
      generatorPrompt,
      durationMs: 0,
      stub: true,
    };
  }

  // ── cache ──
  const key = cacheKey(generatorPrompt, referenceImageUrl);
  const hit = cache[key];
  if (hit) {
    return { ...hit, cached: true };
  }

  // ── retry loop ──
  let lastErr;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await callNanobanana({ prompt: generatorPrompt, referenceImageUrl, size });
      const out = {
        imageUrl: result.imageUrl,
        sha256: result.sha256,
        mimeType: result.mimeType,
        byteSize: result.byteSize,
        generatorPrompt,
        durationMs: result.durationMs,
        stub: false,
      };
      cache[key] = out;
      writeCache();
      return out;
    } catch (e) {
      lastErr = e;
      if (!isRetryable(e) || attempt === MAX_RETRIES - 1) break;
      // Exponential backoff: 500ms, 1000ms, 2000ms.
      const delay = 500 * Math.pow(2, attempt);
      console.warn(`[imagegen] attempt ${attempt + 1}/${MAX_RETRIES} failed (${e.message}); retrying in ${delay}ms`);
      await sleep(delay);
    }
  }
  const msg = lastErr?.response?.data?.error?.message || lastErr?.message || 'unknown error';
  throw new Error(`Nanobanana generation failed after ${MAX_RETRIES} attempts: ${msg}`);
}

function getCacheStats() {
  return { size: Object.keys(cache).length, file: CACHE_FILE };
}

module.exports = {
  generateImage,
  getCacheStats,
  // exposed for tests / debugging — not part of the public contract
  _cacheKey: cacheKey,
};
