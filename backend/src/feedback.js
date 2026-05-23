'use strict';

// Feedback inbox — bug reports, feature requests, and suggestions.
// Mounted at /api/feedback (FAD-wide; not design-scoped). Previously
// the BugReport modal in the frontend just discarded submissions —
// this is the wire that makes them persist.
//
// POST /api/feedback   — any authenticated user
// GET  /api/feedback   — admin/director only (triage inbox)

const express = require('express');
const axios = require('axios');
const { query } = require('./database/client');
const { attachIdentity } = require('./design/auth');

const router = express.Router();

// ── Kimi-backed chat for feedback capture ────────────────────────────
//
// The team under-reports bug context ("X is broken" with no repro
// steps). Asking them to fill a structured form upfront fails — they
// won't. Letting them just braindump fails the other way — we get
// reports with no triage info. The compromise: chat.
//
// User describes the issue in their own words. Kimi reads it and
// responds conversationally, asking 1–2 specific follow-ups per turn.
// Team can answer or just submit at any point after Friday's first
// reply (frontend gates submit on >=1 user msg + >=1 friday reply).
//
// Each frontend turn POSTs the full transcript so far; backend appends
// the new assistant reply. Stateless — no DB persistence of the
// in-flight transcript; only the final submission lands in `feedback`.

const KIMI_BASE_URL = process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1';
const KIMI_MODEL = process.env.KIMI_MODEL || 'moonshot-v1-8k';
// 2026-05-23 — bumped 20s → 90s. Interactive feedback chat clarifier;
// 90s is generous for a single-turn follow-up question. Coordinated
// with nginx proxy_read_timeout (60s → 600s).
const KIMI_TIMEOUT_MS = 90_000;

// Gemini multimodal — used for the chat clarifier when the frontend
// attaches a viewport screenshot. Lets Friday actually see what the user
// is reporting (broken layout, error overlays, the specific element they
// mean) instead of asking blind text follow-ups. Falls through to the
// Kimi text-only path below when no screenshot, no Gemini key, or any
// vision error — never blocks the user.
const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.NANOBANANA_API_KEY;
// 2026-05-23 — default bumped 2.5 → 3.5 per Ishant's "Gemini 3.5 Flash
// everywhere" decision. 3.5-flash supports vision (image input), so the
// screenshot-aware chat clarifier still works.
const GEMINI_FEEDBACK_VISION_MODEL = process.env.GEMINI_FEEDBACK_VISION_MODEL || process.env.GEMINI_CHAT_MODEL || 'gemini-3.5-flash';
const GEMINI_FEEDBACK_TIMEOUT_MS = Number(process.env.GEMINI_FEEDBACK_TIMEOUT_MS) || 90_000;
// 1.5 MB raw base64 cap. The full feedback submission accepts up to 5 MB
// (MAX_SCREENSHOT_BYTES below) for archival; the chat clarifier sees a
// smaller window because we pay model latency on each turn. The final
// submission still attaches the full-resolution screenshot.
const MAX_CHAT_SCREENSHOT_BYTES = 1_500_000;

const CHAT_SYSTEM_PROMPT = `You are Friday, the team's friendly triage assistant. The user is filing a {{type}} report (bug / feature request / suggestion). Your job is to gather enough context so a human can triage and act on it later — nothing more.

Style:
- Conversational, not interrogative. Plain language. Sound like a helpful colleague, not a form.
- Ask AT MOST 1–2 short, specific questions per turn. Never a bulleted list of 5.
- React to what they said. If their answer is great, say so. If it's vague, ask the specific clarifying bit.
- Keep replies SHORT — 1 to 3 sentences total. The user is in a hurry.
- Don't drag this out. 2–3 turns is the sweet spot. If you reach turn 4 without resolution, just thank them and tell them to submit.

What "enough context" means per type:
- BUG: what they did (repro steps), what they expected, what actually happened, how often. Sometimes you need browser/device.
- FEATURE: who benefits, what problem it solves, a concrete example of when they'd use it.
- SUGGESTION: current behaviour, the friction it causes, the proposed change.

Critical rules:
1. NEVER re-ask anything covered in the transcript. Read carefully before you respond.
2. When you have enough context, end with something like: "Sounds clear — feel free to submit whenever you're ready."
3. Do NOT include "Friday:" or any prefix in your reply. Just the message.
4. Do NOT use JSON. Plain text only.
5. The user can submit at any time after your first reply — don't ask them to keep answering if it feels done.`;

// Fallback replies for when KIMI_API_KEY isn't configured (dev / CI).
// Keeps the chat UX working with a single canned response per type.
const FALLBACK_REPLIES = {
  bug: 'Got it. Quick check — does this happen every time, or only sometimes? And were you on desktop or mobile?',
  feature: 'Thanks for raising this. Two quick things: who on the team would benefit most, and can you give a concrete example of when you\'d use it?',
  suggestion: 'Thanks — tell me a bit more: what does the current behaviour cost you, and what would the ideal version look like?',
};

const MAX_TRANSCRIPT_MESSAGES = 16; // 8 turns max
const MAX_MESSAGE_LENGTH = 2000;

function normalizeTranscript(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && (m.role === 'user' || m.role === 'friday') && typeof m.text === 'string')
    .map((m) => ({ role: m.role, text: m.text.trim().slice(0, MAX_MESSAGE_LENGTH) }))
    .filter((m) => m.text.length > 0)
    .slice(-MAX_TRANSCRIPT_MESSAGES);
}

// Validate + clamp the chat-screenshot data URL the frontend sent. We
// only accept image/* base64 of bounded size; anything else returns null
// and we fall through to the text-only chat path. (The final feedback
// submission has its own larger 5 MB ceiling — see MAX_SCREENSHOT_BYTES
// further down.)
function validateChatScreenshot(raw) {
  if (typeof raw !== 'string') return null;
  const m = raw.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i);
  if (!m) return null;
  const mimeType = m[1].toLowerCase();
  const base64 = m[2];
  // base64 expands ~4/3 vs raw bytes; cap by base64 length to keep the
  // inline_data payload bounded.
  if (base64.length > Math.ceil(MAX_CHAT_SCREENSHOT_BYTES * 4 / 3)) return null;
  return { mimeType, data: base64 };
}

function safeStringifyDiagnostics(obj, maxChars = 600) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return '';
  try {
    return JSON.stringify(obj, (_k, v) => {
      if (typeof v === 'string') return v.slice(0, 240);
      if (Array.isArray(v)) return v.slice(0, 10);
      return v;
    }, 2).slice(0, maxChars);
  } catch {
    return '';
  }
}

function buildVisionEvidence(type, moduleLabel, routeUrl, diagnostics) {
  const focus =
    type === 'bug'
      ? 'Look at the screenshot for visual clues — broken layout, error overlays, unexpected state, which component is affected. Cite the specific element if you can see it.'
      : type === 'feature'
        ? 'Look at the screenshot to ground your follow-up — what part of this surface prompted the request, what nearby UI affordance is missing or insufficient.'
        : 'Look at the screenshot — what specific element, copy, or layout choice may be the friction the user is reacting to.';
  const diag = safeStringifyDiagnostics(diagnostics);
  return [
    `Feedback type: ${type}.`,
    moduleLabel ? `Module: ${moduleLabel}.` : null,
    routeUrl ? `Route: ${routeUrl}.` : null,
    focus,
    diag ? `Safe diagnostics:\n${diag}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

// Vision-aware chat reply. Returns null when the vision path isn't
// available (no key, invalid screenshot, model error) so the caller can
// fall through to generateChatReply() text-only. Never throws.
async function generateChatReplyWithVision({ type, transcript, moduleLabel, routeUrl, screenshotParsed, diagnostics }) {
  if (!GEMINI_API_KEY) return null;
  if (!screenshotParsed) return null;
  const system = CHAT_SYSTEM_PROMPT.replace('{{type}}', type);
  const evidence = buildVisionEvidence(type, moduleLabel, routeUrl, diagnostics);

  // Gemini multimodal: the screenshot rides as inline_data inside the
  // first user turn alongside the evidence text. Subsequent turns are
  // text-only — the model carries the visual context forward.
  const contents = [
    {
      role: 'user',
      parts: [
        { text: evidence },
        { inline_data: { mime_type: screenshotParsed.mimeType, data: screenshotParsed.data } },
      ],
    },
    ...transcript.map((m) => ({
      role: m.role === 'friday' ? 'model' : 'user',
      parts: [{ text: m.text }],
    })),
  ];

  try {
    const { data } = await axios.post(
      `${GEMINI_BASE_URL}/models/${encodeURIComponent(GEMINI_FEEDBACK_VISION_MODEL)}:generateContent`,
      {
        contents,
        systemInstruction: { parts: [{ text: system }] },
        generationConfig: { temperature: 0.5, maxOutputTokens: 800 },
      },
      {
        headers: { 'x-goog-api-key': GEMINI_API_KEY, 'Content-Type': 'application/json' },
        timeout: GEMINI_FEEDBACK_TIMEOUT_MS,
      },
    );
    const raw = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim();
    if (!raw) return null;
    const cleaned = raw
      .replace(/^(friday|assistant)\s*[:\-]\s*/i, '')
      .slice(0, 800);
    return { reply: cleaned, source: 'gemini-vision' };
  } catch (err) {
    console.warn('[feedback] gemini vision chat failed:', err.message);
    return null;
  }
}

async function generateChatReply({ type, transcript, moduleLabel, routeUrl }) {
  if (!process.env.KIMI_API_KEY) {
    return { reply: FALLBACK_REPLIES[type] || FALLBACK_REPLIES.bug, source: 'fallback' };
  }
  const system = CHAT_SYSTEM_PROMPT.replace('{{type}}', type);
  // Inject the page context as a system-level pre-pend so Kimi can use
  // it but it doesn't appear as part of the user's message.
  const contextHeader = [
    moduleLabel ? `[user is on the "${moduleLabel}" module]` : null,
    routeUrl ? `[page URL: ${routeUrl}]` : null,
  ].filter(Boolean).join(' ');
  const kimiMessages = [
    { role: 'system', content: system },
    ...(contextHeader ? [{ role: 'system', content: contextHeader }] : []),
    ...transcript.map((m) => ({
      role: m.role === 'friday' ? 'assistant' : 'user',
      content: m.text,
    })),
  ];
  try {
    const { data } = await axios.post(
      `${KIMI_BASE_URL}/chat/completions`,
      {
        model: KIMI_MODEL,
        messages: kimiMessages,
        temperature: 0.5,
        // No response_format here — we want plain text, not JSON.
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.KIMI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: KIMI_TIMEOUT_MS,
      },
    );
    const raw = data?.choices?.[0]?.message?.content;
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      return { reply: FALLBACK_REPLIES[type] || FALLBACK_REPLIES.bug, source: 'kimi-empty' };
    }
    // Strip any stray "Friday:" prefix the model might emit despite the
    // system prompt; clamp to a sane length.
    const cleaned = raw
      .trim()
      .replace(/^(friday|assistant)\s*[:\-]\s*/i, '')
      .slice(0, 800);
    return { reply: cleaned, source: 'kimi' };
  } catch (err) {
    console.warn('[feedback] kimi chat failed:', err.message);
    return { reply: FALLBACK_REPLIES[type] || FALLBACK_REPLIES.bug, source: 'fallback-after-error' };
  }
}

router.post('/chat', attachIdentity, async (req, res) => {
  try {
    const {
      type,
      transcript,
      route_url: routeUrl,
      module_label: moduleLabel,
      screenshot_data_url: screenshotRaw,
      diagnostics,
    } = req.body || {};
    if (!TYPES.has(type)) {
      return res.status(400).json({ error: 'type must be bug, feature, or suggestion' });
    }
    const normalized = normalizeTranscript(transcript);
    if (normalized.length === 0) {
      return res.status(400).json({ error: 'transcript must include at least one user message' });
    }
    // Last message must be from the user — otherwise we'd be replying
    // to ourselves.
    if (normalized[normalized.length - 1].role !== 'user') {
      return res.status(400).json({ error: 'last transcript message must be from the user' });
    }
    const baseArgs = {
      type,
      transcript: normalized,
      moduleLabel: typeof moduleLabel === 'string' ? moduleLabel.slice(0, 100) : null,
      routeUrl: typeof routeUrl === 'string' ? routeUrl.slice(0, 300) : null,
    };
    // Try the vision path first when the frontend attached a screenshot.
    // generateChatReplyWithVision returns null on any failure (no key,
    // bad payload, model error) so we fall through to the Kimi text-only
    // path below — the user never blocks on the upgrade.
    const screenshotParsed = validateChatScreenshot(screenshotRaw);
    if (screenshotParsed) {
      const visionResult = await generateChatReplyWithVision({
        ...baseArgs,
        screenshotParsed,
        diagnostics,
      });
      if (visionResult) return res.json(visionResult);
    }
    const result = await generateChatReply(baseArgs);
    res.json(result);
  } catch (err) {
    console.error('[feedback] chat error:', err.message);
    res.status(500).json({ error: 'Friday is having trouble — try again or submit as-is' });
  }
});

const TYPES = new Set(['bug', 'feature', 'suggestion']);
const SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);
const STATUSES = new Set(['new', 'triaged', 'in_progress', 'resolved', 'wontfix', 'duplicate']);
// `source` identifies which app/surface filed the feedback so the
// inbox can split FAD operator reports from website visitor reports
// (and mobile / portals when they ship). DB has a matching CHECK.
const SOURCES = new Set(['fad', 'website', 'mobile', 'design-portal', 'owner-portal']);

// 5MB cap on the base64 data URL keeps DB rows bounded. A 0.5-scale
// 0.7-quality JPEG (what html2canvas produces in the frontend) lands
// at ~200-600KB for full-page captures, so 5MB is generous.
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

function normalizeOptionalText(value, max = 2000) {
  if (value == null) return undefined;
  const trimmed = value.toString().trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function normalizeOptionalTimestamp(value) {
  if (value == null) return undefined;
  if (value === 'now') return new Date().toISOString();
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function selectFeedbackFields({ includeScreenshot = false } = {}) {
  return `
    id, type, title, description, severity, route_url, module_label,
    user_username, user_display_name, status, resolution_note,
    resolved_at, source, created_at, updated_at,
    triaged_at, fixed_commit, fixed_branch, fix_deployed_at,
    fix_verified_at, fix_verification_note, root_cause,
    (screenshot_data_url IS NOT NULL AND length(screenshot_data_url) > 0) AS has_screenshot
    ${includeScreenshot ? ', screenshot_data_url' : ''}
  `;
}

// Slack webhook fan-out — fire-and-forget on every submission so the
// team sees real-time feedback in a Slack channel. Set
// SLACK_FEEDBACK_WEBHOOK_URL on the VPS env to enable. Falsy / unset
// → no-op. We deliberately don't await this call; a slow Slack call
// must not block the feedback POST response to the user.
async function notifySlack({ type, title, description, severity, routeUrl, moduleLabel, userDisplayName, userUsername, id }) {
  const url = process.env.SLACK_FEEDBACK_WEBHOOK_URL;
  if (!url) return;
  const icon = type === 'bug' ? '🐛' : type === 'feature' ? '💡' : '✨';
  const reporter = userDisplayName || userUsername || 'unknown';
  const sevLabel = severity ? `*Severity:* ${severity}\n` : '';
  const contextLine = [
    moduleLabel ? `module: \`${moduleLabel}\`` : null,
    routeUrl ? `route: \`${routeUrl}\`` : null,
  ].filter(Boolean).join(' · ');
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `${icon} New ${type} from ${reporter}` } },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${title || '(no title)'}*\n${sevLabel}${contextLine}`.trim(),
      },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: '>>> ' + description.slice(0, 2500) },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `Feedback id: \`${id}\` · open inbox: <https://gms.friday.mu/fad?m=settings|Settings → Feedback inbox>` }],
    },
  ];
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks, text: `${icon} New ${type} from ${reporter}: ${title || description.slice(0, 80)}` }),
    });
    if (!res.ok) {
      console.warn('[feedback] slack webhook returned', res.status);
    }
  } catch (err) {
    console.warn('[feedback] slack webhook failed:', err.message);
  }
}

router.post('/', attachIdentity, async (req, res) => {
  try {
    const {
      type,
      title,
      description,
      severity,
      route_url: routeUrl,
      module_label: moduleLabel,
      screenshot_data_url: screenshotDataUrl,
      source: rawSource,
    } = req.body || {};

    if (!TYPES.has(type)) {
      return res.status(400).json({ error: 'type must be bug, feature, or suggestion' });
    }
    if (typeof description !== 'string' || description.trim().length === 0) {
      return res.status(400).json({ error: 'description is required' });
    }
    if (severity != null && !SEVERITIES.has(severity)) {
      return res.status(400).json({ error: 'severity must be low|medium|high|critical' });
    }
    // Default to 'fad' for callers that don't send a source — that
    // covers the existing FAD shell which doesn't pass the field.
    const source = rawSource == null ? 'fad' : rawSource;
    if (!SOURCES.has(source)) {
      return res.status(400).json({ error: `source must be one of: ${[...SOURCES].join(', ')}` });
    }

    let screenshot = null;
    if (typeof screenshotDataUrl === 'string' && screenshotDataUrl.length > 0) {
      if (!screenshotDataUrl.startsWith('data:image/')) {
        return res.status(400).json({ error: 'screenshot must be a data:image/... URL' });
      }
      if (screenshotDataUrl.length > MAX_SCREENSHOT_BYTES) {
        return res.status(413).json({ error: 'screenshot too large (>5MB)' });
      }
      screenshot = screenshotDataUrl;
    }

    const { rows } = await query(
      `INSERT INTO feedback (
         type, title, description, severity, route_url, module_label,
         screenshot_data_url, user_id, user_username, user_display_name,
         tenant_id, source
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, type, title, description, severity, route_url, module_label,
                 status, source, created_at`,
      [
        type,
        (title || '').toString().trim() || null,
        description.trim(),
        severity || null,
        (routeUrl || '').toString().slice(0, 500) || null,
        (moduleLabel || '').toString().slice(0, 100) || null,
        screenshot,
        req.identity.userId,
        req.identity.username,
        req.identity.displayName,
        req.tenantId,
        source,
      ],
    );

    // Fan out to Slack if configured. Fire-and-forget — must not block
    // the POST response on a slow/failing webhook.
    notifySlack({
      type: rows[0].type,
      title: rows[0].title,
      description: rows[0].description,
      severity: rows[0].severity,
      routeUrl: rows[0].route_url,
      moduleLabel: rows[0].module_label,
      userDisplayName: req.identity.displayName,
      userUsername: req.identity.username,
      id: rows[0].id,
    }).catch(() => { /* logged inside notifySlack */ });

    res.json(rows[0]);
  } catch (err) {
    console.error('[feedback] POST error:', err.message);
    res.status(500).json({ error: 'Failed to save feedback' });
  }
});

router.get('/', attachIdentity, async (req, res) => {
  if (req.identity.userRole !== 'admin' && req.identity.userRole !== 'director') {
    return res.status(403).json({ error: 'Forbidden — admin/director only' });
  }
  try {
    // tenant_id is always the first filter — admins/directors only ever
    // see feedback from their own tenant (mig 037 added the column).
    const filters = ['tenant_id = $1'];
    const params = [req.tenantId];
    if (req.query.type && TYPES.has(req.query.type)) {
      params.push(req.query.type);
      filters.push(`type = $${params.length}`);
    }
    if (req.query.status && STATUSES.has(req.query.status)) {
      params.push(req.query.status);
      filters.push(`status = $${params.length}`);
    }
    if (req.query.source && SOURCES.has(req.query.source)) {
      params.push(req.query.source);
      filters.push(`source = $${params.length}`);
    }
    const sql = `
      SELECT ${selectFeedbackFields()}
      FROM feedback
      WHERE ${filters.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT 200
    `;
    const { rows } = await query(sql, params);
    res.json({ results: rows });
  } catch (err) {
    console.error('[feedback] GET error:', err.message);
    res.status(500).json({ error: 'Failed to list feedback' });
  }
});

router.get('/:id', attachIdentity, async (req, res) => {
  if (req.identity.userRole !== 'admin' && req.identity.userRole !== 'director') {
    return res.status(403).json({ error: 'Forbidden — admin/director only' });
  }
  try {
    const { rows } = await query(
      `SELECT ${selectFeedbackFields({ includeScreenshot: true })}
       FROM feedback
       WHERE id = $1 AND tenant_id = $2
       LIMIT 1`,
      [req.params.id, req.tenantId],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'feedback not found' });
    res.json({ feedback: rows[0] });
  } catch (err) {
    console.error('[feedback] GET detail error:', err.message);
    res.status(500).json({ error: 'Failed to load feedback' });
  }
});

// PATCH /api/feedback/:id — admin/director only. Used by the future
// Settings → Feedback inbox to triage status + add resolution notes.
router.patch('/:id', attachIdentity, async (req, res) => {
  if (req.identity.userRole !== 'admin' && req.identity.userRole !== 'director') {
    return res.status(403).json({ error: 'Forbidden — admin/director only' });
  }
  try {
    const {
      status,
      resolution_note: resolutionNote,
      fixed_commit: fixedCommit,
      fixed_branch: fixedBranch,
      fix_deployed_at: fixDeployedAt,
      fix_verified_at: fixVerifiedAt,
      fix_verification_note: fixVerificationNote,
      root_cause: rootCause,
    } = req.body || {};
    if (status != null && !STATUSES.has(status)) {
      return res.status(400).json({ error: 'invalid status' });
    }
    const sets = [];
    const params = [];
    if (status != null) {
      params.push(status);
      sets.push(`status = $${params.length}`);
      if (status === 'triaged' || status === 'in_progress') {
        sets.push(`triaged_at = COALESCE(triaged_at, NOW())`);
        params.push(req.identity.userId);
        sets.push(`triaged_by = COALESCE(triaged_by, $${params.length})`);
      }
      if (status === 'resolved' || status === 'wontfix' || status === 'duplicate') {
        sets.push(`resolved_at = NOW()`);
        params.push(req.identity.userId);
        sets.push(`resolved_by = $${params.length}`);
      }
    }
    if (resolutionNote != null) {
      params.push(resolutionNote.toString().trim() || null);
      sets.push(`resolution_note = $${params.length}`);
    }
    const normalizedRootCause = normalizeOptionalText(rootCause, 4000);
    if (normalizedRootCause !== undefined) {
      params.push(normalizedRootCause);
      sets.push(`root_cause = $${params.length}`);
    }
    const normalizedCommit = normalizeOptionalText(fixedCommit, 80);
    if (normalizedCommit !== undefined) {
      params.push(normalizedCommit);
      sets.push(`fixed_commit = $${params.length}`);
    }
    const normalizedBranch = normalizeOptionalText(fixedBranch, 120);
    if (normalizedBranch !== undefined) {
      params.push(normalizedBranch);
      sets.push(`fixed_branch = $${params.length}`);
    }
    const normalizedDeployedAt = normalizeOptionalTimestamp(fixDeployedAt);
    if (normalizedDeployedAt !== undefined) {
      if (normalizedDeployedAt === null) return res.status(400).json({ error: 'invalid fix_deployed_at' });
      params.push(normalizedDeployedAt);
      sets.push(`fix_deployed_at = $${params.length}`);
    }
    const normalizedVerifiedAt = normalizeOptionalTimestamp(fixVerifiedAt);
    if (normalizedVerifiedAt !== undefined) {
      if (normalizedVerifiedAt === null) return res.status(400).json({ error: 'invalid fix_verified_at' });
      params.push(normalizedVerifiedAt);
      sets.push(`fix_verified_at = $${params.length}`);
      params.push(req.identity.userId);
      sets.push(`fix_verified_by = $${params.length}`);
    }
    const normalizedVerifyNote = normalizeOptionalText(fixVerificationNote, 4000);
    if (normalizedVerifyNote !== undefined) {
      params.push(normalizedVerifyNote);
      sets.push(`fix_verification_note = $${params.length}`);
    }
    if (sets.length === 0) return res.status(400).json({ error: 'nothing to update' });
    sets.push(`updated_at = NOW()`);
    params.push(req.params.id);
    const idParamIdx = params.length;
    // tenant-scope the UPDATE so an admin can only touch their own
    // tenant's rows (mig 037). RETURNING is gated by the same WHERE.
    params.push(req.tenantId);
    const tenantParamIdx = params.length;
    const { rows } = await query(
      `UPDATE feedback SET ${sets.join(', ')}
       WHERE id = $${idParamIdx} AND tenant_id = $${tenantParamIdx}
       RETURNING ${selectFeedbackFields({ includeScreenshot: true })}`,
      params,
    );
    if (rows.length === 0) return res.status(404).json({ error: 'feedback not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[feedback] PATCH error:', err.message);
    res.status(500).json({ error: 'Failed to update feedback' });
  }
});

module.exports = router;
