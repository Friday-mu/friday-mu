'use strict';

// Dual-model translation pipeline — Kimi (Moonshot) + Anthropic (Claude).
//
// Mirrors the GMS detect+translate pattern from
// `friday-gms/src/services/draft-generator.ts:detectLanguage()` — a single
// LLM call returns BOTH the source language ISO code AND the English
// translation (null when already English). FAD then runs this against
// two providers in parallel for the current evaluation phase and picks
// between them. Long-term direction is Kimi-only; this file is the
// single point to retire when that happens.

const axios = require('axios');
const fs = require('fs');
const path = require('path');

let Anthropic = null;
try {
  Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');
} catch (e) {
  console.warn('[translate] @anthropic-ai/sdk not available:', e.message);
}

const KIMI_BASE_URL = process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1';
// `moonshot-v1-8k` is the broadly-available Moonshot model on standard plans.
// Newer K2/K2.6 previews require a different plan tier — override via
// KIMI_MODEL env var when those become available on this account.
const KIMI_MODEL = process.env.KIMI_MODEL || 'moonshot-v1-8k';
// Per user direction: Opus during the dual-model evaluation phase. Long-
// term will swap to Haiku-class (which is what GMS uses for detectLanguage,
// at ~5% the cost). Set ANTHROPIC_MODEL=claude-haiku-4-5-20251001 to switch.
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-7';

const SYSTEM_PROMPT = `You are a language detection and translation assistant. Detect the language of the user's text and translate it to English if it is not already English. Support ALL languages: Chinese (zh / zh-TW), Japanese (ja), Korean (ko), Thai (th), Vietnamese (vi), Hindi (hi), Bahasa Indonesia (id), Bahasa Malay (ms), Russian (ru), Arabic (ar), Hebrew (he), French (fr), German (de), Spanish (es), Italian (it), Portuguese (pt), Dutch (nl), Danish (da), Swedish (sv), Norwegian (no), Finnish (fi), Polish (pl), Czech (cs), Turkish (tr), and any other. Use ISO 639-1 codes. Preserve tone, emoji, and punctuation. Respond with ONLY valid JSON, no other text:
{ "language": "xx", "translation": "<english translation>" }
If the text is already English, set translation to null:
{ "language": "en", "translation": null }`;

// Codes the LLM occasionally hallucinates that we want to ignore (treat as
// unknown — fall back to 'en' downstream). Mirrors GMS BLOCKED_LANG_CODES.
const BLOCKED_LANG_CODES = ['xx', 'und', 'unk', 'unknown', ''];

// ────────────────── short-circuit English ──────────────────
// Cheap regex pre-check to skip LLM calls on text that's obviously English.
// Conservative on purpose — false negatives are fine (we just spend a few
// extra cents per non-English call); false positives mean a non-English
// review never gets translated, which is the worse failure.

const ENGLISH_MARKERS = new Set([
  'the', 'and', 'was', 'were', 'with', 'that', 'this', 'has', 'have',
  'been', 'will', 'would', 'should', 'could', 'about', 'their', 'they',
  'what', 'when', 'where', 'which', 'really', 'very', 'thank', 'thanks',
  'great', 'nice', 'beautiful', 'amazing', 'perfect', 'recommend',
]);

function looksEnglish(text) {
  if (!text || typeof text !== 'string') return true;
  const trimmed = text.trim();
  if (trimmed.length < 15) return true;
  const words = trimmed.toLowerCase().match(/\b[a-zà-ÿ]+\b/g) || [];
  if (words.length < 6) return true;
  const distinctHits = new Set();
  for (const w of words) if (ENGLISH_MARKERS.has(w)) distinctHits.add(w);
  const density = distinctHits.size === 0 ? 0 :
    [...distinctHits].reduce((n, w) => n + words.filter((x) => x === w).length, 0) / words.length;
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
  } catch { return {}; }
}
function writeCache() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf-8');
  } catch (e) {
    console.warn('[translate] cache write failed:', e.message);
  }
}

// ────────────────── parsing ──────────────────

function parseModelJson(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]);
    const lang = typeof obj.language === 'string' ? obj.language.toLowerCase().trim() : null;
    const translation = (typeof obj.translation === 'string' && obj.translation.trim().length > 0)
      ? obj.translation.trim() : null;
    return {
      language: lang && !BLOCKED_LANG_CODES.includes(lang) ? lang : null,
      translation,
    };
  } catch { return null; }
}

// ────────────────── model calls ──────────────────

async function callKimi(text) {
  if (!process.env.KIMI_API_KEY) return { ok: false, error: 'KIMI_API_KEY not set' };
  const start = Date.now();
  try {
    const { data } = await axios.post(
      `${KIMI_BASE_URL}/chat/completions`,
      {
        model: KIMI_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.KIMI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      },
    );
    const raw = data?.choices?.[0]?.message?.content;
    const parsed = parseModelJson(raw);
    if (!parsed) return { ok: false, error: 'Kimi returned unparseable JSON', latencyMs: Date.now() - start, raw };
    return { ok: true, parsed, latencyMs: Date.now() - start, model: KIMI_MODEL };
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
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: text }],
    });
    const raw = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const parsed = parseModelJson(raw);
    if (!parsed) return { ok: false, error: 'Anthropic returned unparseable JSON', latencyMs: Date.now() - start, raw };
    return { ok: true, parsed, latencyMs: Date.now() - start, model: ANTHROPIC_MODEL };
  } catch (e) {
    return { ok: false, error: e.message, latencyMs: Date.now() - start };
  }
}

// ────────────────── pick best ──────────────────

/** Picks between two model responses. Prefer Kimi when both ok (long-term
 *  target). When one fails, take the other. When both fail, null. */
function pickBest(kimi, anthropic) {
  if (kimi.ok && anthropic.ok) {
    return { picked: 'kimi', ...kimi.parsed, reason: 'both ok — preferring kimi' };
  }
  if (kimi.ok) return { picked: 'kimi', ...kimi.parsed, reason: 'anthropic failed' };
  if (anthropic.ok) return { picked: 'anthropic', ...anthropic.parsed, reason: 'kimi failed' };
  return null;
}

// ────────────────── public API ──────────────────

async function translateText(text, opts = {}) {
  if (!text || typeof text !== 'string') {
    return emptyResult(text);
  }
  const trimmed = text.trim();
  if (!trimmed) return emptyResult(text);

  // Source-language hint short-circuit. Booking gives content.language_code
  // straight in the review payload; trust it.
  const hint = opts.sourceLang ? String(opts.sourceLang).toLowerCase() : null;
  if (hint === 'en' || hint === 'en-us' || hint === 'en-gb') {
    return englishResult(trimmed, 'en');
  }

  // Heuristic short-circuit. Saves a round-trip to both models for clearly
  // English text. False negatives just mean we hit the LLMs needlessly —
  // safe failure mode.
  if (!hint && looksEnglish(trimmed)) {
    return englishResult(trimmed, 'en (heuristic)');
  }

  // Cache hit. Backend cache survives nodemon restarts via disk; frontend
  // hook also memoizes within a session.
  const key = opts.cacheKey || hashKey(trimmed);
  const hit = cache[key];
  if (hit && hit.original === trimmed) {
    return { ...hit, cached: true };
  }

  // Both models run in parallel. Each one's failure is independent.
  const [kimi, anthropic] = await Promise.all([callKimi(trimmed), callAnthropic(trimmed)]);
  const picked = pickBest(kimi, anthropic);

  const detectedLang = picked?.language || kimi.parsed?.language || anthropic.parsed?.language || null;
  // If LLM says English, we don't have a translation — use the original.
  const finalTranslated = (detectedLang === 'en' || !picked?.translation) ? trimmed : picked.translation;

  const result = {
    translated: finalTranslated,
    original: trimmed,
    sourceLang: detectedLang,
    picked: picked?.picked ?? null,
    pickReason: picked?.reason ?? null,
    kimi: kimi.ok
      ? { ok: true, latencyMs: kimi.latencyMs, language: kimi.parsed.language, translation: kimi.parsed.translation }
      : { ok: false, error: kimi.error, latencyMs: kimi.latencyMs },
    anthropic: anthropic.ok
      ? { ok: true, latencyMs: anthropic.latencyMs, language: anthropic.parsed.language, translation: anthropic.parsed.translation }
      : { ok: false, error: anthropic.error, latencyMs: anthropic.latencyMs },
    cached: false,
  };

  // Cache only successful translations (not failures — retry next call).
  if (picked) {
    cache[key] = result;
    writeCache();
  }
  return result;
}

function emptyResult(text) {
  return { translated: null, original: text || '', sourceLang: null, picked: null, pickReason: null, kimi: null, anthropic: null, cached: false };
}
function englishResult(text, lang) {
  return { translated: text, original: text, sourceLang: lang, picked: null, pickReason: 'english short-circuit', kimi: null, anthropic: null, cached: false };
}

function hashKey(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return `t${h}`;
}

function getCacheStats() {
  return { size: Object.keys(cache).length, file: CACHE_FILE };
}

module.exports = {
  translateText,
  looksEnglish,
  getCacheStats,
};
