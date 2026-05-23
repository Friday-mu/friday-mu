'use strict';

// Smart Operations task creation intent parser.
//
// Replaces the regex `parseNl` in frontend's CreateTaskDrawer (tag
// PROD-LOGIC-4 in DEMO_CRUFT.md). The operator types a free-text
// instruction; Friday returns a structured task proposal plus an
// optional clarifying question so it can converse for a second turn
// when something's genuinely ambiguous.
//
// Multi-tenant: tenantId comes from req.tenantId via attachIdentity.
// AI usage is metered per-tenant + per-feature so this lands in the
// cost-cap calculation.
//
// Contract:
//   POST /api/intent/parse-task
//   Body: {
//     text: string,                                  // operator's latest turn
//     history?: Array<{role:'user'|'assistant', content:string}>,  // prior turns
//     focus?: {                                      // contextual hints from the URL / source thread
//       module?: string,
//       threadId?: string,
//       reservationId?: string,
//       propertyCode?: string,
//     },
//     reference?: {
//       properties?: Array<{ code:string, name?:string, zone?:string }>,
//       assignees?: Array<{ id:string, name:string, role?:string, skills?:string[] }>,
//       today?: string,                              // YYYY-MM-DD in Mauritius
//     },
//   }
//
//   Returns: {
//     proposed: {
//       title?: string,
//       description?: string,
//       propertyCode?: string,
//       department?: 'cleaning'|'inspection'|'maintenance'|'office',
//       subdepartment?: string,
//       priority?: 'urgent'|'high'|'medium'|'low'|'lowest',
//       assigneeIds?: string[],
//       dueDate?: string,            // YYYY-MM-DD
//       dueTime?: string,            // HH:MM
//       estimatedMinutes?: number,
//       tags?: string[],
//       template?: string,
//       category?: string,
//     },
//     clarifyingQuestion?: string,   // ask back if input is ambiguous
//     reasoning: string,
//     confidence: 'high'|'medium'|'low',
//     source: 'gemini'|'kimi'|'template-fallback',
//     durationMs: number,
//   }

const express = require('express');
const { attachIdentity } = require('../design/auth');
const { runTextCompletion } = require('../ai/gemini_first');
const { enforceQuota, QuotaExceededError } = require('../tenants/ai_usage');

const router = express.Router();

const MAX_INPUT_CHARS = 1200;
const MAX_HISTORY_TURNS = 8;
const MAX_REFERENCE_PROPERTIES = 80;
const MAX_REFERENCE_ASSIGNEES = 40;
const TIMEOUT_MS = 90_000;

const DEPARTMENTS = new Set(['cleaning', 'inspection', 'maintenance', 'office']);
const PRIORITIES = new Set(['urgent', 'high', 'medium', 'low', 'lowest']);

function cleanString(value, max = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanMultilineString(value, max = 4000) {
  return String(value || '').trim().slice(0, max);
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.slice(-MAX_HISTORY_TURNS).map((turn) => {
    const role = turn?.role === 'assistant' ? 'assistant' : 'user';
    const content = cleanMultilineString(turn?.content, 2000);
    return content ? { role, content } : null;
  }).filter(Boolean);
}

function sanitizeProperties(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, MAX_REFERENCE_PROPERTIES).map((p) => ({
    code: cleanString(p?.code, 12),
    name: cleanString(p?.name, 80),
    zone: cleanString(p?.zone, 60),
  })).filter((p) => p.code);
}

function sanitizeAssignees(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, MAX_REFERENCE_ASSIGNEES).map((u) => ({
    id: cleanString(u?.id, 60),
    name: cleanString(u?.name, 80),
    role: cleanString(u?.role, 40),
    skills: Array.isArray(u?.skills) ? u.skills.slice(0, 8).map((s) => cleanString(s, 30)).filter(Boolean) : [],
  })).filter((u) => u.id && u.name);
}

function sanitizeFocus(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const module = cleanString(raw.module, 40).toLowerCase();
  const threadId = cleanString(raw.threadId || raw.thread_id, 80);
  const reservationId = cleanString(raw.reservationId || raw.reservation_id, 80);
  const propertyCode = cleanString(raw.propertyCode || raw.property_code, 12).toUpperCase();
  if (!module && !threadId && !reservationId && !propertyCode) return null;
  return {
    module: module || null,
    threadId: threadId || null,
    reservationId: reservationId || null,
    propertyCode: propertyCode || null,
  };
}

// Coerce + drop any keys outside the allowed set + normalize types. The
// model occasionally returns string numbers, lowercase department names
// with whitespace, alternate priority synonyms — normalize aggressively
// so the frontend can apply the proposal without further parsing.
function shapeProposed(raw, reference) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  const propertyCodes = new Set((reference?.properties || []).map((p) => p.code));
  const assigneeIds = new Set((reference?.assignees || []).map((u) => u.id));

  if (typeof raw.title === 'string') {
    // Hard cap at 72 chars to match the system-prompt directive. Gemini
    // sometimes ignores the constraint and returns a 100+ char sentence;
    // Franny reported this 2026-05-23 (feedback 12728dbe) — the AI draft
    // was being copy-pasted verbatim into the task title. We truncate
    // at the last word boundary before 72 so the title stays readable
    // ("Refill linen at VV-47…" rather than "Refill linen at VV-47 next").
    const cleaned = cleanString(raw.title, 180);
    if (cleaned) {
      let t = cleaned;
      if (t.length > 72) {
        const cut = t.slice(0, 72);
        const lastSpace = cut.lastIndexOf(' ');
        t = (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
      }
      out.title = t.charAt(0).toUpperCase() + t.slice(1);
    }
  }
  if (typeof raw.description === 'string') {
    const d = cleanMultilineString(raw.description, 2000);
    if (d) out.description = d;
  }
  if (typeof raw.propertyCode === 'string') {
    const code = cleanString(raw.propertyCode, 12).toUpperCase();
    if (code && (propertyCodes.size === 0 || propertyCodes.has(code))) out.propertyCode = code;
  }
  if (typeof raw.department === 'string') {
    const d = cleanString(raw.department, 30).toLowerCase();
    if (DEPARTMENTS.has(d)) out.department = d;
  }
  if (typeof raw.subdepartment === 'string') {
    const s = cleanString(raw.subdepartment, 30).toLowerCase().replace(/\s+/g, '_');
    if (s) out.subdepartment = s;
  }
  if (typeof raw.priority === 'string') {
    const p = cleanString(raw.priority, 20).toLowerCase().replace(/\s+priority$/, '');
    if (PRIORITIES.has(p)) out.priority = p;
  }
  if (Array.isArray(raw.assigneeIds)) {
    const ids = raw.assigneeIds.map((id) => cleanString(id, 60)).filter(Boolean);
    const filtered = assigneeIds.size > 0 ? ids.filter((id) => assigneeIds.has(id)) : ids;
    if (filtered.length > 0) out.assigneeIds = Array.from(new Set(filtered));
  }
  if (typeof raw.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.dueDate)) {
    out.dueDate = raw.dueDate;
  }
  if (typeof raw.dueTime === 'string' && /^\d{2}:\d{2}$/.test(raw.dueTime)) {
    out.dueTime = raw.dueTime;
  }
  if (raw.estimatedMinutes != null) {
    const m = Number(raw.estimatedMinutes);
    if (Number.isFinite(m) && m > 0 && m <= 24 * 60) out.estimatedMinutes = Math.round(m);
  }
  if (Array.isArray(raw.tags)) {
    const tags = raw.tags.map((t) => cleanString(t, 40).toLowerCase()).filter(Boolean);
    if (tags.length > 0) out.tags = Array.from(new Set(tags)).slice(0, 8);
  }
  if (typeof raw.template === 'string') {
    const t = cleanString(raw.template, 80);
    if (t) out.template = t;
  }
  if (typeof raw.category === 'string') {
    const c = cleanString(raw.category, 60);
    if (c) out.category = c;
  }
  return out;
}

function buildSystemPrompt() {
  return `You are the Operations task drafter inside FAD, Friday Retreats' staff cockpit.

The operator describes a task in plain language — sometimes complete, sometimes a fragment, sometimes ambiguous. Your job:
1. Propose a structured task object the operator can review and accept.
2. If the input is genuinely ambiguous (no property, no person mentioned where one is plainly needed, contradictory dates), return a single short clarifying question instead of guessing.
3. Stay terse. The operator types quickly; you write JSON, not prose.

OUTPUT JSON ONLY, shape:
{
  "proposed": {
    "title": "<short imperative title, <=72 chars, no 'please' / 'can you'>",
    "description": "<one to three sentences capturing the user's full ask>",
    "propertyCode": "<code from the reference.properties list — exact match>" | undefined,
    "department": "cleaning" | "inspection" | "maintenance" | "office",
    "subdepartment": "<one of: standard_clean, deep_clean, turnover, amenities, pre_arrival, post_clean, mid_stay, plumbing, electrical, aircon, garden, pool, structural, appliances, admin, supplies, vendor_coord>",
    "priority": "urgent" | "high" | "medium" | "low" | "lowest",
    "assigneeIds": ["<id from reference.assignees>"] | undefined,
    "dueDate": "YYYY-MM-DD" | undefined,
    "dueTime": "HH:MM" | undefined,
    "estimatedMinutes": number | undefined,
    "tags": ["owner-billable" | "access" | "arrival" | "follow-up" | "vendor" | ...],
    "template": "<one of: Deep clean, Standard clean, Inspection follow-up, Post-clean inspection, Preventative maintenance, Amenities form, Vendor coordination, Maintenance follow-up, Guest service follow-up, Manager review> | undefined",
    "category": "<element like AC, Pool, Linen, Lock, Shower, Garden — short noun>"
  },
  "clarifyingQuestion": "<single short follow-up question, plain text>" | null,
  "reasoning": "<one sentence: why this department/priority/etc.>",
  "confidence": "high" | "medium" | "low"
}

Rules:
- Pick propertyCode ONLY from reference.properties. If the user typed "GBH-C8" verify it exists; if not, omit propertyCode and ask in clarifyingQuestion.
- Pick assigneeIds ONLY from reference.assignees, by matching the name the operator mentioned (case-insensitive, first name OK). "Brian" → match "Bryan" if Bryan is the only close match. Multiple matches → ask in clarifyingQuestion.
- Department/subdepartment must be from the enum lists above. Match the keyword spirit: leak/sink/toilet/shower/drain/water → maintenance/plumbing; AC/aircon/cooling → maintenance/aircon; deep clean → cleaning/deep_clean; pre-arrival inspection → inspection/pre_arrival.
- Priority defaults to "medium" unless cues say otherwise: urgent/now/asap/before guest/before arrival → urgent; today/high/soon → high; low priority/no rush → low.
- Dates: relative cues use reference.today (Mauritius time). "tomorrow" = today + 1, "next week" = today + 6. If the user gave an absolute YYYY-MM-DD, copy it verbatim.
- Times: "morning"=09:00, "afternoon"=14:00, "evening"/"end of day"/"EOD"=17:00, "noon"=12:00. "at 9am" → 09:00. "at 14h00"/"at 14:00" → 14:00. Omit if not stated.
- title: drop "please", "can you", "schedule", "assign X to" — keep the actual ask. Capitalize first letter.
- description: paraphrase, do not just echo. Include the operator's full intent so a triager has context.
- Multi-turn: if reference.history is present, treat the latest user turn as the primary signal but USE earlier turns to fill gaps (e.g. property mentioned in turn 1 carries to turn 2).
- Clarifying questions: ask ONLY when the request genuinely cannot be drafted safely. Examples worth asking: missing property when several were mentioned; multiple matching assignee names; "the leak" without a property to scope. Do NOT ask when the request is just terse but unambiguous.
- Always return BOTH a "proposed" object AND "clarifyingQuestion" — if no follow-up is needed, set clarifyingQuestion to null (not omitted).
- Never invent property codes, assignee IDs, reservations, or guest names not in the supplied context.
- Return ONLY the JSON. No prose before or after, no fences.`;
}

function buildUserPrompt({ text, history, focus, reference }) {
  return JSON.stringify({
    instruction: cleanMultilineString(text, MAX_INPUT_CHARS),
    history,
    focus,
    reference: {
      today: reference?.today || null,
      properties: reference?.properties || [],
      assignees: reference?.assignees || [],
    },
  }, null, 2);
}

router.post('/parse-task', attachIdentity, async (req, res) => {
  try {
    const text = cleanMultilineString(req.body?.text, MAX_INPUT_CHARS);
    if (!text || text.length < 2) {
      return res.status(400).json({ error: 'text is required (the operator instruction)' });
    }

    const history = sanitizeHistory(req.body?.history);
    const focus = sanitizeFocus(req.body?.focus);
    const reference = {
      today: cleanString(req.body?.reference?.today, 10) || null,
      properties: sanitizeProperties(req.body?.reference?.properties),
      assignees: sanitizeAssignees(req.body?.reference?.assignees),
    };

    const start = Date.now();

    // Quota guard before upstream — matches design/* pattern.
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

    const result = await runTextCompletion({
      system: buildSystemPrompt(),
      user: buildUserPrompt({ text, history, focus, reference }),
      temperature: 0.25,
      timeoutMs: TIMEOUT_MS,
      responseJson: true,
      meter: { tenantId: req.tenantId, feature: 'intent_parse_task' },
      feature: 'intent_parse_task',
    });

    if (!result.ok || !result.parsed) {
      // Soft fallback so the drawer still surfaces something usable —
      // mirror what the existing regex did when AI is down.
      return res.status(502).json({
        error: result.error || 'task parser failed',
        source: `${result.provider || 'unknown'}-error`,
        durationMs: Date.now() - start,
      });
    }

    const parsed = result.parsed;
    const proposed = shapeProposed(parsed.proposed, reference);
    const clarifyingQuestion = typeof parsed.clarifyingQuestion === 'string' && parsed.clarifyingQuestion.trim()
      ? cleanString(parsed.clarifyingQuestion, 280)
      : null;
    const reasoning = typeof parsed.reasoning === 'string' ? cleanString(parsed.reasoning, 240) : '';
    const confidence = ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium';

    return res.json({
      proposed,
      clarifyingQuestion,
      reasoning,
      confidence,
      source: result.provider || 'unknown',
      model: result.model || null,
      durationMs: Date.now() - start,
    });
  } catch (e) {
    console.error('[intent/parse-task] error:', e.message);
    return res.status(500).json({ error: e.message });
  }
});

module.exports = {
  router,
  _test: {
    shapeProposed,
    sanitizeHistory,
    sanitizeFocus,
    sanitizeProperties,
    sanitizeAssignees,
    buildSystemPrompt,
    buildUserPrompt,
  },
};
