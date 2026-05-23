'use strict';

// Audio transcription route — POST /api/transcribe.
//
// Backs the FAD dictation surfaces (feedback FAB today; expanding to
// other input fields). Replaces the browser's Web Speech API path,
// which depends on Chrome's hidden round-trip to Google's STT servers
// and breaks under PWA-standalone-mode, restrictive DNS filters, and
// some VPNs (`SpeechRecognition` returns `network` error). Moving STT
// server-side makes dictation deterministic across browsers, PWAs, and
// networks.
//
// Provider: Gemini (`gemini-2.5-flash` by default) via Google AI
// Studio's generativelanguage REST API. Reuses the same API key as
// imagegen.js (`NANOBANANA_API_KEY`) since a Google AI Studio key is
// universal across Google's generative APIs. A `GEMINI_API_KEY` env
// var is also accepted for clarity once configs split.
//
// Auth: `attachIdentity` — must be a logged-in FAD user. Anonymous
// callers would let any visitor burn our Gemini quota.
//
// Body: multipart/form-data with field `audio` (the recorded blob).
// Optional `lang` form field (e.g. "en-US") biases the prompt; if
// omitted, Gemini auto-detects.

const express = require('express');
const axios = require('axios');
const multer = require('multer');
const { attachIdentity } = require('../design/auth');

const router = express.Router();

// In-memory upload. Dictations are short (<60s typical, <25MB hard cap).
// Multer parses multipart/form-data; the audio Blob comes through as
// req.file with `.buffer`, `.mimetype`, `.size`.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL
  || 'https://generativelanguage.googleapis.com/v1beta';
// 2026-05-23 — default bumped 2.5 → 3.5 per Ishant's "Gemini 3.5 Flash
// everywhere" decision. 3.5-flash supports audio input.
const GEMINI_MODEL = process.env.GEMINI_TRANSCRIBE_MODEL || 'gemini-3.5-flash';
// Either env var works. NANOBANANA_API_KEY is the historical FAD name
// for the same Google AI Studio key; GEMINI_API_KEY is the cleaner
// alias going forward.
const API_KEY = process.env.GEMINI_API_KEY || process.env.NANOBANANA_API_KEY;
// 2026-05-23 — bumped 30s → 90s. Audio transcription is bounded by
// audio length (frontend caps at 60s recording) but tail-latency on
// the Gemini call can spike. Coordinated with nginx proxy_read_timeout
// (60s → 600s).
const REQUEST_TIMEOUT_MS = 90_000;

// attachIdentity 401s on its own if the JWT is missing or invalid; by
// the time we get here req.identity is populated.
router.post('/', attachIdentity, upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no audio uploaded' });
  if (!API_KEY) {
    return res.status(503).json({
      error: 'transcription service not configured',
      detail: 'GEMINI_API_KEY / NANOBANANA_API_KEY missing on the server',
    });
  }

  const rawLang = typeof req.body?.lang === 'string' ? req.body.lang.trim() : '';
  const lang = /^[a-zA-Z]{2,3}([-_][a-zA-Z]{2,4})?$/.test(rawLang) ? rawLang : null;

  // MediaRecorder defaults vary by browser. Chrome → audio/webm;codecs=opus.
  // Safari → audio/mp4. Firefox → audio/ogg;codecs=opus. Gemini handles
  // all three. We pass the original mime through so it can decode.
  const mimeType = (req.file.mimetype || 'audio/webm').split(';')[0];
  const base64 = req.file.buffer.toString('base64');

  const promptText = lang
    ? `Transcribe the audio exactly as spoken in ${lang}. Output ONLY the transcript text — no commentary, no labels, no quotation marks, no prefixes like "Transcript:". If the audio is silent or contains no speech, output an empty string.`
    : `Transcribe the audio exactly as spoken. Output ONLY the transcript text — no commentary, no labels, no quotation marks, no prefixes like "Transcript:". If the audio is silent or contains no speech, output an empty string. Auto-detect the language.`;

  const body = {
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeType, data: base64 } },
        { text: promptText },
      ],
    }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 2048,
    },
  };

  const url = `${GEMINI_BASE_URL}/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(API_KEY)}`;

  try {
    const r = await axios.post(url, body, {
      timeout: REQUEST_TIMEOUT_MS,
      headers: { 'Content-Type': 'application/json' },
    });
    const text = r.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return res.json({
      text: text.trim(),
      lang: lang || undefined,
      mime: mimeType,
      bytes: req.file.size,
    });
  } catch (e) {
    const status = e.response?.status || 502;
    const detail = e.response?.data?.error?.message || e.message;
    console.error('[transcribe] gemini call failed:', status, detail);
    return res.status(status === 429 ? 429 : 502).json({
      error: 'transcription failed',
      detail,
    });
  }
});

module.exports = router;
