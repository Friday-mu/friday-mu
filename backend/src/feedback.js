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

// ── Kimi-backed clarifying questions ─────────────────────────────────
//
// The team under-reports bug context ("X is broken" with no repro
// steps). Instead of asking them to pre-structure their report (which
// they won't), we let them brain-dump in one field, then Kimi reads
// what they wrote + the page context and proposes 2–4 short, specific
// follow-up questions that fill the most likely gaps for triage.
// The user can answer some, all, or none and submit either way.

const KIMI_BASE_URL = process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1';
const KIMI_MODEL = process.env.KIMI_MODEL || 'moonshot-v1-8k';
const KIMI_TIMEOUT_MS = 20_000;

const CLARIFYING_SYSTEM_PROMPT = `You are Friday's triage assistant. The user just filed a {{type}} report — bug, feature request, or suggestion — and we want to fill the context gaps BEFORE a human triages it.

Read their description and propose 2–4 short, SPECIFIC follow-up questions that, if answered, would make this report dramatically easier to triage. Cover the most-likely gaps for the report type:

- BUG: reproduction steps, what they expected, what actually happened, frequency (always / sometimes / once), severity / impact, browser or device if relevant.
- FEATURE: who benefits, what problem it solves, concrete example of when they'd use it, success criteria.
- SUGGESTION: what they currently do / current behaviour, the friction it causes, the suggested change.

RULES:
1. DO NOT re-ask anything they already answered in their description. Scan their text first.
2. Each question MUST be short (under 18 words) and ANSWERABLE in one or two sentences.
3. Be specific. "Can you give more detail?" is useless. Ask about the specific thing that's missing.
4. Skip questions that don't apply (e.g. don't ask repro steps if the bug is "the photo doesn't load" — that's already the repro).
5. NEVER more than 4 questions. Fewer is fine — sometimes 2 is the right number.

OUTPUT FORMAT (strict JSON):
{ "questions": ["...", "...", "..."] }

If their description is already complete and there's nothing useful to ask, return { "questions": [] }.`;

// Fallback question banks when KIMI_API_KEY isn't configured. Used so
// the UX still works in dev / CI / before the env var is set on prod.
const FALLBACK_QUESTIONS = {
  bug: [
    'What were you trying to do when this happened?',
    'What did you expect to see instead?',
    'Does this happen every time, or only sometimes?',
  ],
  feature: [
    'Who on the team would use this most?',
    'What problem does it solve that today is painful?',
    'Can you give a concrete example of when you\'d use it?',
  ],
  suggestion: [
    'What\'s the current behaviour you want to change?',
    'Why does the current way feel wrong — what does it cost you?',
  ],
};

function parseModelJson(raw) {
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) s = fenceMatch[1].trim();
  try { return JSON.parse(s); } catch { return null; }
}

async function generateClarifyingQuestions({ type, description, moduleLabel, routeUrl }) {
  if (!process.env.KIMI_API_KEY) {
    return { questions: FALLBACK_QUESTIONS[type] || [], source: 'fallback' };
  }
  const system = CLARIFYING_SYSTEM_PROMPT.replace('{{type}}', type);
  const userContent = [
    `Report type: ${type}`,
    moduleLabel ? `Module: ${moduleLabel}` : null,
    routeUrl ? `Page: ${routeUrl}` : null,
    '',
    'User\'s description:',
    description,
  ].filter(Boolean).join('\n');
  try {
    const { data } = await axios.post(
      `${KIMI_BASE_URL}/chat/completions`,
      {
        model: KIMI_MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
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
    const parsed = parseModelJson(raw);
    const list = Array.isArray(parsed?.questions) ? parsed.questions : [];
    // Defensive: clamp to 4 + drop empty / overlong items.
    const cleaned = list
      .filter((q) => typeof q === 'string' && q.trim().length > 0)
      .map((q) => q.trim().slice(0, 220))
      .slice(0, 4);
    return { questions: cleaned, source: 'kimi' };
  } catch (err) {
    console.warn('[feedback] kimi clarifying-questions failed:', err.message);
    return { questions: FALLBACK_QUESTIONS[type] || [], source: 'fallback-after-error' };
  }
}

router.post('/clarifying-questions', attachIdentity, async (req, res) => {
  try {
    const { type, description, route_url: routeUrl, module_label: moduleLabel } = req.body || {};
    if (!TYPES.has(type)) {
      return res.status(400).json({ error: 'type must be bug, feature, or suggestion' });
    }
    if (typeof description !== 'string' || description.trim().length < 4) {
      return res.status(400).json({ error: 'description is required (min 4 chars)' });
    }
    const result = await generateClarifyingQuestions({
      type,
      description: description.trim().slice(0, 3000),
      moduleLabel: typeof moduleLabel === 'string' ? moduleLabel.slice(0, 100) : null,
      routeUrl: typeof routeUrl === 'string' ? routeUrl.slice(0, 300) : null,
    });
    res.json(result);
  } catch (err) {
    console.error('[feedback] clarifying-questions error:', err.message);
    res.status(500).json({ error: 'Failed to generate questions' });
  }
});

const TYPES = new Set(['bug', 'feature', 'suggestion']);
const SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);
const STATUSES = new Set(['new', 'triaged', 'in_progress', 'resolved', 'wontfix', 'duplicate']);

// 5MB cap on the base64 data URL keeps DB rows bounded. A 0.5-scale
// 0.7-quality JPEG (what html2canvas produces in the frontend) lands
// at ~200-600KB for full-page captures, so 5MB is generous.
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

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
         screenshot_data_url, user_id, user_username, user_display_name
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, type, title, description, severity, route_url, module_label,
                 status, created_at`,
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
    const filters = [];
    const params = [];
    if (req.query.type && TYPES.has(req.query.type)) {
      params.push(req.query.type);
      filters.push(`type = $${params.length}`);
    }
    if (req.query.status && STATUSES.has(req.query.status)) {
      params.push(req.query.status);
      filters.push(`status = $${params.length}`);
    }
    const sql = `
      SELECT id, type, title, description, severity, route_url, module_label,
             user_username, user_display_name, status, resolution_note,
             resolved_at, created_at, updated_at
      FROM feedback
      ${filters.length ? 'WHERE ' + filters.join(' AND ') : ''}
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

// PATCH /api/feedback/:id — admin/director only. Used by the future
// Settings → Feedback inbox to triage status + add resolution notes.
router.patch('/:id', attachIdentity, async (req, res) => {
  if (req.identity.userRole !== 'admin' && req.identity.userRole !== 'director') {
    return res.status(403).json({ error: 'Forbidden — admin/director only' });
  }
  try {
    const { status, resolution_note: resolutionNote } = req.body || {};
    if (status != null && !STATUSES.has(status)) {
      return res.status(400).json({ error: 'invalid status' });
    }
    const sets = [];
    const params = [];
    if (status != null) {
      params.push(status);
      sets.push(`status = $${params.length}`);
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
    if (sets.length === 0) return res.status(400).json({ error: 'nothing to update' });
    sets.push(`updated_at = NOW()`);
    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE feedback SET ${sets.join(', ')} WHERE id = $${params.length}
       RETURNING id, type, status, resolved_at, updated_at`,
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
