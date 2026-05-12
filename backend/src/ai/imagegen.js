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
// imagen-3.0-generate-002 is the GA Imagen 3 model on the
// generativelanguage REST surface as of 2026-05. When Google rotates the
// SKU, override via env rather than editing this file.
const NANOBANANA_MODEL = process.env.NANOBANANA_MODEL || 'imagen-3.0-generate-002';
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

// 429 + 5xx are retryable. 4xx other than 429 are not — they're caller
// errors (bad prompt / quota exhausted / safety filter) and won't resolve
// by retrying.
function isRetryable(err) {
  const status = err?.response?.status;
  if (status == null) return true; // network/timeout — retry
  if (status === 429) return true;
  if (status >= 500 && status < 600) return true;
  return false;
}

// ────────────────── model call ──────────────────

async function callNanobanana({ prompt, referenceImageUrl, size }) {
  const url = `${NANOBANANA_BASE_URL}/models/${NANOBANANA_MODEL}:predict`;

  // Imagen 3 predict-endpoint body shape. The reference image, if
  // supplied, goes in `instances[].image.bytesBase64Encoded` — we accept
  // a URL and fetch+encode here so callers don't have to. We deliberately
  // skip referenceImageUrl in v1 because the predict surface treats it as
  // an editing operation, not a conditioning hint, and our use case
  // (moodboard / pack inspiration) is purely prompt-driven. When the
  // editing pathway is needed, extend this function with a separate body
  // shape rather than overloading the field.
  const body = {
    instances: [{ prompt: String(prompt || '') }],
    parameters: {
      sampleCount: 1,
      aspectRatio: aspectRatioForSize(size),
    },
  };

  const start = Date.now();
  const { data } = await axios.post(url, body, {
    headers: {
      'x-goog-api-key': process.env.NANOBANANA_API_KEY,
      'Content-Type': 'application/json',
    },
    timeout: 60_000,
  });

  // Imagen returns predictions[].bytesBase64Encoded (raw image bytes).
  // We compute sha256 over those bytes for dedup and surface a data: URL
  // if the API doesn't give us a hosted URL directly. Future work: pipe
  // the bytes to S3 and store the S3 URL in storage_url. For v1 the
  // data: URL is fine — the design surface inlines images on PDF/portal
  // export, not in long-lived HTML.
  const pred = data?.predictions?.[0];
  const b64 = pred?.bytesBase64Encoded;
  if (!b64 || typeof b64 !== 'string') {
    throw new Error('Nanobanana returned no image bytes');
  }
  const bytes = Buffer.from(b64, 'base64');
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const mimeType = pred?.mimeType || 'image/png';
  // Imagen does not host the result; we surface a data: URL. Storage
  // upload happens (eventually) downstream — see ai_images.js.
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
