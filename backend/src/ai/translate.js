'use strict';

// Translation pipeline — Kimi (Moonshot) only.
//
// Functional parity with friday-gms/src/services/draft-generator.ts:
// detectLanguage() — same JSON `{language, translation}` contract, same
// language coverage (~25 named + "any other" catch-all), same BLOCKED_LANG_
// CODES filter, same emoji-only short-circuit. Long-term direction is
// Kimi-only across all FR AI work; this file is the single point of contact
// for translation.

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const KIMI_BASE_URL = process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1';
// 2026-05-23 — default bumped moonshot-v1-8k → kimi-k2.6 per Ishant
// ("Kimi fallbacks should all be on 2.6, not V1"). The earlier comment
// about K2.6 requiring a different plan tier is no longer accurate —
// the prod KIMI_API_KEY has access. Override via KIMI_MODEL env var
// if a different Moonshot model is preferred.
const KIMI_MODEL = process.env.KIMI_MODEL || 'kimi-k2.6';

const SYSTEM_PROMPT = `You are a language detection and translation assistant. Detect the language of the user's text and translate it to English if it is not already English. Support ALL languages: Chinese (Simplified zh, Traditional zh-TW), Japanese (ja), Korean (ko), Thai (th), Vietnamese (vi), Hindi (hi), Bahasa Indonesia (id), Bahasa Malay (ms), Russian (ru), Ukrainian (uk), Arabic (ar), Hebrew (he), French (fr), German (de), Spanish (es), Italian (it), Portuguese (pt), Dutch (nl), Danish (da), Swedish (sv), Norwegian (no), Finnish (fi), Polish (pl), Czech (cs), Turkish (tr), Greek (el), Romanian (ro), Hungarian (hu), Bulgarian (bg), and any other. Use ISO 639-1 codes. Preserve tone, emoji, and punctuation. Respond with ONLY valid JSON, no other text:
{ "language": "xx", "translation": "<english translation>" }
If the text is already English, set translation to null:
{ "language": "en", "translation": null }`;

// Codes the LLM occasionally hallucinates that we want to ignore. Mirrors
// the BLOCKED_LANG_CODES filter in friday-gms detectLanguage().
const BLOCKED_LANG_CODES = ['xx', 'und', 'unk', 'unknown', ''];

// ────────────────── emoji-only short-circuit ──────────────────
// Matches GMS's isEmojiOnly() — text consisting entirely of emoji +
// whitespace is meaningless to translate. Returns language='en',
// translation=null (caller renders original). Without this, a single 🙏
// message would cost a full LLM call for no useful output.
const EMOJI_RANGES = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{1F300}-\u{1F9FF}‍️]/u;
const NON_EMOJI = /[^\s\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{1F300}-\u{1F9FF}‍️]/u;

function isEmojiOnly(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  if (!t) return false;
  // Has at least one emoji AND no non-emoji-non-whitespace characters.
  return EMOJI_RANGES.test(t) && !NON_EMOJI.test(t);
}

// ────────────────── English short-circuit ──────────────────
// Skip the LLM round-trip for clearly English text. Conservative on
// purpose — false negatives just spend a few extra cents per call;
// false positives leave non-English text untranslated which is worse.

const ENGLISH_MARKERS = new Set([
  'the', 'and', 'was', 'were', 'with', 'that', 'this', 'has', 'have',
  'been', 'will', 'would', 'should', 'could', 'about', 'their', 'they',
  'what', 'when', 'where', 'which', 'really', 'very', 'thank', 'thanks',
  'great', 'nice', 'beautiful', 'amazing', 'perfect', 'recommend',
]);

// Matches a single character outside the Latin / Latin-Extended scripts —
// CJK, Cyrillic, Arabic, Hebrew, Thai, Devanagari, Greek, Korean, etc.
// Any presence of these is a strong "not English" signal.
const NON_LATIN_SCRIPT = /[Ͱ-ϿЀ-ӿԀ-ԯ֐-׿؀-ۿ฀-๿ऀ-ॿ一-鿿぀-ゟ゠-ヿ가-힯]/;

function looksEnglish(text) {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  // Any non-Latin script character → definitely not English. Must NOT
  // short-circuit, must call the LLM. (Earlier bug: Japanese / Russian
  // text returned 0 Latin words and falsely tripped the "too short" gate.)
  if (NON_LATIN_SCRIPT.test(trimmed)) return false;
  // Removed the previous `length < 15` short-circuit per Ishant
  // 2026-05-18 — it false-positived short non-English greetings
  // ("Bonjour", "Merci", "Danke" etc.) as English and they never got
  // translated. Cost of dropping is one extra Kimi call per short
  // message; trade is worth it for correctness.
  const words = trimmed.toLowerCase().match(/\b[a-zà-ÿ]+\b/g) || [];
  if (words.length < 6) return false; // Latin script but too few words to be confident
  const distinctHits = new Set();
  for (const w of words) if (ENGLISH_MARKERS.has(w)) distinctHits.add(w);
  const density = distinctHits.size === 0 ? 0 :
    [...distinctHits].reduce((n, w) => n + words.filter((x) => x === w).length, 0) / words.length;
  return distinctHits.size >= 2 && density >= 0.08;
}

// Conversation-language fallback chain. Ported from friday-gms
// draft-generator.ts getConversationLanguageFallback. Used when the
// LLM can't detect a language confidently — e.g. emoji-only messages,
// very short text, or model parse failure. Chain:
//   1. conversations.last_detected_language (cached on the row)
//   2. most-recent non-NULL inbound original_language in the thread
//   3. 'en' as final fallback (never error / fail-open)
async function getConversationLanguageFallback(conversationId) {
  if (!conversationId) return 'en';
  try {
    const cached = await require('../database/client').query(
      'SELECT last_detected_language FROM conversations WHERE id = $1',
      [conversationId],
    );
    const lang = cached.rows[0]?.last_detected_language;
    if (lang) return lang;
    const inbound = await require('../database/client').query(
      `SELECT original_language FROM messages
         WHERE conversation_id = $1
           AND direction = 'inbound'
           AND original_language IS NOT NULL
         ORDER BY created_at DESC LIMIT 1`,
      [conversationId],
    );
    return inbound.rows[0]?.original_language || 'en';
  } catch {
    return 'en';
  }
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

// ────────────────── model call ──────────────────

// 2026-05-23 — migrated from direct Kimi axios to the shared Gemini-
// primary / Kimi-fallback helper (ai/gemini_first.js). Function name
// kept as callKimi() for callsite stability; behaviour is now
// Gemini-3.5-flash-first with Kimi-2.6 fallback.
const { runTextCompletion } = require('./gemini_first');

async function callKimi(text) {
  const result = await runTextCompletion({
    system: SYSTEM_PROMPT,
    user: text,
    temperature: 0.2,
    timeoutMs: 90_000,
    responseJson: true,
    feature: 'inbox_translate',
  });
  if (!result.ok) {
    return { ok: false, error: result.error || 'completion failed', latencyMs: result.latencyMs };
  }
  // gemini_first does its own JSON parsing into result.parsed; we still
  // need translate.js's narrower parseModelJson() to apply language-
  // code allow-listing on the resulting object. If gemini_first
  // returned raw text (json mode declined), fall back to parsing the
  // raw text the same way as before.
  const parsed = result.parsed
    ? parseModelJsonObject(result.parsed)
    : parseModelJson(result.text);
  if (!parsed) {
    return { ok: false, error: `${result.provider} returned unparseable JSON`, latencyMs: result.latencyMs, raw: result.text };
  }
  return { ok: true, parsed, latencyMs: result.latencyMs, model: result.model };
}

// Same lang/translation extraction logic as parseModelJson(raw), but
// operating on a pre-parsed object so we don't re-stringify.
function parseModelJsonObject(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const lang = typeof obj.language === 'string' ? obj.language.toLowerCase().trim() : null;
  const translation = (typeof obj.translation === 'string' && obj.translation.trim().length > 0)
    ? obj.translation.trim() : null;
  return {
    language: lang && !BLOCKED_LANG_CODES.includes(lang) ? lang : null,
    translation,
  };
}

// ────────────────── public API ──────────────────

async function translateText(text, opts = {}) {
  if (!text || typeof text !== 'string') return emptyResult(text);
  const trimmed = text.trim();
  if (!trimmed) return emptyResult(text);

  // Emoji-only short-circuit (matches GMS). Source language must
  // fall back through the conversation's prior detected language,
  // not hard-code 'en' — otherwise a guest who has been chatting in
  // German sends "👍" and we'd switch their language to English on
  // the next outbound translate. Per Ishant's smiley rule: default
  // to the last known language, fall through to 'en' only when
  // there is no prior language on the thread.
  if (isEmojiOnly(trimmed)) {
    const sourceLang = opts.conversationId
      ? await getConversationLanguageFallback(opts.conversationId)
      : 'en';
    return { translated: trimmed, original: trimmed, sourceLang, cached: false, model: null, latencyMs: 0, reason: 'emoji-only' };
  }

  // Channel-supplied language hint (Booking has content.language_code).
  const hint = opts.sourceLang ? String(opts.sourceLang).toLowerCase() : null;
  if (hint === 'en' || hint === 'en-us' || hint === 'en-gb') {
    return englishResult(trimmed, 'en');
  }

  if (!hint && looksEnglish(trimmed)) {
    return englishResult(trimmed, 'en (heuristic)');
  }

  // Disk cache. Backend cache survives nodemon restarts; frontend hook
  // also memoizes within a session.
  const key = opts.cacheKey || hashKey(trimmed);
  const hit = cache[key];
  if (hit && hit.original === trimmed) {
    return { ...hit, cached: true };
  }

  const kimi = await callKimi(trimmed);
  if (!kimi.ok) {
    return {
      translated: null,
      original: trimmed,
      sourceLang: null,
      cached: false,
      model: KIMI_MODEL,
      latencyMs: kimi.latencyMs ?? null,
      error: kimi.error,
    };
  }

  // When Kimi parses but returns no language (blocked code, missing
  // field, JSON malformed past the parser's recovery) — fall back to
  // the conversation's known language so we never write NULL and the
  // worker doesn't keep retrying the same row.
  const detectedLang = kimi.parsed.language
    || (opts.conversationId ? await getConversationLanguageFallback(opts.conversationId) : 'en');
  // LLM says English → no translation needed, return original.
  const finalTranslated = (detectedLang === 'en' || !kimi.parsed.translation)
    ? trimmed
    : kimi.parsed.translation;

  const result = {
    translated: finalTranslated,
    original: trimmed,
    sourceLang: detectedLang,
    cached: false,
    model: KIMI_MODEL,
    latencyMs: kimi.latencyMs,
  };

  cache[key] = result;
  writeCache();
  return result;
}

function emptyResult(text) {
  return { translated: null, original: text || '', sourceLang: null, cached: false, model: null, latencyMs: 0 };
}
function englishResult(text, lang) {
  return { translated: text, original: text, sourceLang: lang, cached: false, model: null, latencyMs: 0, reason: 'english short-circuit' };
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
  isEmojiOnly,
  getConversationLanguageFallback,
  getCacheStats,
};
