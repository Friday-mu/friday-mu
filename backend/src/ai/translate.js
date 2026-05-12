'use strict';

// Dual-model translation pipeline — Kimi (Moonshot) + Anthropic (Claude Opus).
//
// Current evaluation phase: both models run in parallel on each translation
// request. The result-picking heuristic picks Kimi when both succeed (Kimi is
// the long-term target — cost + alignment with FR's primary AI vendor), falls
// back to Anthropic if Kimi fails, and surfaces an error if both fail.
//
// Long-term direction: drop the Anthropic path once Kimi's translation
// quality is validated against operational use. This file is the single
// place to retire — search for `picked` in callers.

const axios = require('axios');
const fs = require('fs');
const path = require('path');

let Anthropic = null;
try {
  Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');
} catch (e) {
  // SDK not installed yet — translations fall back to Kimi-only when this happens.
  console.warn('[translate] @anthropic-ai/sdk not available:', e.message);
}

const KIMI_BASE_URL = process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1';
// Cheap + fast Kimi model. Quality model for prod use can be swapped here.
const KIMI_MODEL = process.env.KIMI_MODEL || 'moonshot-v1-8k';
// Most-capable Anthropic model for the eval phase. Cost: ~$0.045 per typical
// review translation. Once we settle on a smaller default, swap to claude-sonnet.
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-7';

const TRANSLATION_PROMPT = (text) => `Translate the following text to English. Preserve the tone, sentiment, and any emoji/punctuation. Return ONLY the translated English text — no preamble, no explanation, no quotes around the translation.

Text:
${text}`;

// ────────────────── language detection ──────────────────

// High-precision English markers. Each of these is rare-to-absent in the
// other languages FR sees in reviews (French / Danish / Dutch / Italian /
// Portuguese / German / Norwegian). Single-letter words (a / i) and tiny
// prepositions (to / of / in) are deliberately excluded — they overlap
// with Danish "i" / "to", Dutch "in", etc.
const ENGLISH_MARKERS = new Set([
  'the', 'and', 'was', 'were', 'with', 'that', 'this', 'has', 'have',
  'been', 'will', 'would', 'should', 'could', 'about', 'their', 'they',
  'what', 'when', 'where', 'which', 'really', 'very', 'thank', 'thanks',
  'great', 'nice', 'beautiful', 'amazing', 'perfect', 'recommend',
]);

/** Lightweight English check. Errs on the side of false (= "non-English →
 *  attempt translation"); a cached LLM translation of already-English text
 *  is wasted dollars but cosmetically identical. */
function looksEnglish(text) {
  if (!text || typeof text !== 'string') return true;
  const trimmed = text.trim();
  if (trimmed.length < 15) return true; // too short to translate meaningfully
  const words = trimmed.toLowerCase().match(/\b[a-zà-ÿ]+\b/g) || [];
  if (words.length < 6) return true;
  const distinctHits = new Set();
  for (const w of words) if (ENGLISH_MARKERS.has(w)) distinctHits.add(w);
  // Require both: density (≥8% of tokens) AND diversity (≥2 distinct markers).
  // Single repeated word doesn't qualify — e.g. a Danish text mentioning the
  // brand "The" repeatedly wouldn't pass.
  const density = distinctHits.size === 0 ? 0 : [...distinctHits].reduce((n, w) => n + words.filter((x) => x === w).length, 0) / words.length;
  return distinctHits.size >= 2 && density >= 0.08;
}

// ────────────────── disk cache ──────────────────

const CACHE_FILE = path.join(__dirname, '..', '..', '.translations-cache.json');

let cache = readCache();
function readCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return {};
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    return (raw && typeof raw === 'object') ? raw : {};
  } catch {
    return {};
  }
}
function writeCache() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf-8');
  } catch (e) {
    console.warn('[translate] cache write failed:', e.message);
  }
}

// ────────────────── model calls ──────────────────

async function callKimi(text) {
  if (!process.env.KIMI_API_KEY) {
    return { ok: false, error: 'KIMI_API_KEY not set' };
  }
  const start = Date.now();
  try {
    const { data } = await axios.post(
      `${KIMI_BASE_URL}/chat/completions`,
      {
        model: KIMI_MODEL,
        messages: [{ role: 'user', content: TRANSLATION_PROMPT(text) }],
        temperature: 0.2,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.KIMI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      },
    );
    const translated = data?.choices?.[0]?.message?.content?.trim();
    if (!translated) return { ok: false, error: 'Kimi returned empty translation', latencyMs: Date.now() - start };
    return { ok: true, text: translated, latencyMs: Date.now() - start, model: KIMI_MODEL };
  } catch (e) {
    return { ok: false, error: e.response?.data?.error?.message || e.message, latencyMs: Date.now() - start };
  }
}

async function callAnthropic(text) {
  if (!Anthropic || !process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: 'ANTHROPIC_API_KEY not set or SDK missing' };
  }
  const start = Date.now();
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 2000,
      messages: [{ role: 'user', content: TRANSLATION_PROMPT(text) }],
    });
    const translated = msg.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    if (!translated) return { ok: false, error: 'Anthropic returned empty translation', latencyMs: Date.now() - start };
    return { ok: true, text: translated, latencyMs: Date.now() - start, model: ANTHROPIC_MODEL };
  } catch (e) {
    return { ok: false, error: e.message, latencyMs: Date.now() - start };
  }
}

// ────────────────── pick best ──────────────────

/** Picks between two translations. Current heuristic: prefer Kimi when both
 *  succeed (cost + long-term alignment). If only one succeeds, return that.
 *  If both fail, return null with an error. */
function pickBest(kimi, anthropic) {
  if (kimi.ok && anthropic.ok) {
    return { picked: 'kimi', text: kimi.text, reason: 'both ok — preferring kimi (long-term target)' };
  }
  if (kimi.ok) return { picked: 'kimi', text: kimi.text, reason: 'anthropic failed' };
  if (anthropic.ok) return { picked: 'anthropic', text: anthropic.text, reason: 'kimi failed' };
  return null;
}

// ────────────────── public API ──────────────────

/**
 * Translate `text` to English. Idempotent — same input returns cached output.
 *
 * @param {string} text — source text
 * @param {object} opts
 *   @param {string} [opts.cacheKey] — explicit cache key (e.g. review id). If
 *     omitted, the body itself keys the cache.
 *   @param {string} [opts.sourceLang] — ISO code hint. When 'en', short-
 *     circuits the model calls.
 * @returns {Promise<{translated: string|null, original: string, sourceLang: string|null, picked: string|null, kimi, anthropic, cached: boolean}>}
 */
async function translateText(text, opts = {}) {
  if (!text || typeof text !== 'string') {
    return { translated: null, original: text, sourceLang: null, picked: null, kimi: null, anthropic: null, cached: false };
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return { translated: null, original: text, sourceLang: null, picked: null, kimi: null, anthropic: null, cached: false };
  }

  // Skip translation if source is English (per hint or heuristic).
  const lang = opts.sourceLang ? String(opts.sourceLang).toLowerCase() : null;
  if (lang === 'en' || lang === 'en-us' || lang === 'en-gb') {
    return { translated: trimmed, original: trimmed, sourceLang: 'en', picked: null, kimi: null, anthropic: null, cached: false };
  }
  if (!lang && looksEnglish(trimmed)) {
    return { translated: trimmed, original: trimmed, sourceLang: 'en (heuristic)', picked: null, kimi: null, anthropic: null, cached: false };
  }

  const key = opts.cacheKey || hashKey(trimmed);
  const hit = cache[key];
  if (hit && hit.original === trimmed) {
    return { ...hit, cached: true };
  }

  // Both models run in parallel — each one's failure mode is independent.
  const [kimi, anthropic] = await Promise.all([callKimi(trimmed), callAnthropic(trimmed)]);
  const picked = pickBest(kimi, anthropic);
  const result = {
    translated: picked?.text ?? null,
    original: trimmed,
    sourceLang: lang || null,
    picked: picked?.picked ?? null,
    kimi,
    anthropic,
    cached: false,
  };

  if (result.translated) {
    cache[key] = result;
    writeCache();
  }
  return result;
}

function hashKey(s) {
  // Cheap, stable, collision-tolerant for caching. Not cryptographic.
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return `t${h}`;
}

function getCacheStats() {
  return {
    size: Object.keys(cache).length,
    file: CACHE_FILE,
  };
}

module.exports = {
  translateText,
  looksEnglish,
  getCacheStats,
};
