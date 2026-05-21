'use strict';

const express = require('express');
const { query } = require('../database/client');
const { attachIdentity } = require('../design/auth');
const { defaultComposer } = require('../knowledge/composer');
const { generateDraftReply, DRAFT_MODEL } = require('../ai/kimi_draft');
const { loadActionFeedbackBlock } = require('./learning_context');
const {
  resolvePropertyCode,
  formatMessageForContext,
  detectTaskSignals,
} = require('./draft_generator');
const { publishFadEvent } = require('../realtime');

const router = express.Router();
const CONSULT_TIMEOUT_MS = Number(process.env.KIMI_CONSULT_TIMEOUT_MS) || 45_000;
const CONSULT_MAX_RETRIES = Number(process.env.KIMI_CONSULT_MAX_RETRIES) || 0;
const CONSULT_MAX_TOKENS = Number(process.env.KIMI_CONSULT_MAX_TOKENS) || 1800;

const VALID_CONTEXTS = new Set([
  'revision',
  'compose',
  'draft_review',
  'pending_action',
  'next_step',
  'teaching',
  'learning_candidate',
  'message_review',
]);

const CONVERSATION_REQUIRED_CONTEXTS = new Set([
  'revision',
  'compose',
  'draft_review',
  'message_review',
]);

const CONTEXT_TO_SURFACE = {
  revision: 'inbox-drafts',
  compose: 'inbox-drafts',
  draft_review: 'inbox-advisory',
  pending_action: 'pending-actions',
  next_step: 'pending-actions',
  teaching: 'inbox-advisory',
  learning_candidate: 'learning-analyzer',
  message_review: 'inbox-advisory',
};

const conversationLocks = new Map();

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function conversationIdForSession(value) {
  return isUuid(value) ? value : null;
}

function withConversationLock(conversationId, fn) {
  const key = conversationId || '__global__';
  const prev = conversationLocks.get(key) || Promise.resolve();
  let release;
  const lock = new Promise((resolve) => { release = resolve; });
  conversationLocks.set(key, lock);
  return prev.then(fn).finally(() => {
    release();
    if (conversationLocks.get(key) === lock) conversationLocks.delete(key);
  });
}

function actorName(req) {
  return req.identity?.displayName
    || req.identity?.username
    || req.identity?.userId
    || 'fad-user';
}

function actorId(req) {
  return req.identity?.userId || req.identity?.username || null;
}

function cleanInstruction(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function stripProtocolTags(text) {
  return String(text || '')
    .replace(/\[DRAFT_UPDATE\][\s\S]*?\[\/DRAFT_UPDATE\]/g, '')
    .replace(/\[TEACH\][\s\S]*?\[\/TEACH\]/g, '')
    .trim();
}

function parseDraftUpdate(responseText) {
  const match = String(responseText || '').match(/\[DRAFT_UPDATE\]([\s\S]*?)\[\/DRAFT_UPDATE\]/);
  return match ? match[1].trim() || null : null;
}

function parseTeachingActions(responseText, teachingIdMap = {}) {
  const actions = [];
  const matches = [...String(responseText || '').matchAll(/\[TEACH\]([\s\S]*?)\[\/TEACH\]/g)];
  for (const match of matches) {
    const raw = match[1].trim();
    try {
      const parsed = JSON.parse(raw);
      actions.push({
        action: parsed.action || 'create',
        instruction: String(parsed.instruction || '').trim(),
        scope: parsed.scope || 'global',
        propertyCode: parsed.property_code || parsed.propertyCode || null,
        reason: parsed.reason || null,
        existingTeachingId: parsed.existing
          ? teachingIdMap[parsed.existing] || parsed.existingTeachingId || null
          : (parsed.existingTeachingId || null),
        conflictingTeachingId: parsed.conflicting
          ? teachingIdMap[parsed.conflicting] || parsed.conflictingTeachingId || null
          : (parsed.conflictingTeachingId || null),
        conflictingTeachingIndex: parsed.conflicting || null,
      });
    } catch {
      actions.push({
        action: 'create',
        instruction: raw,
        scope: 'global',
      });
    }
  }
  return actions.filter((a) => a.instruction);
}

function selectConsultSurface(context) {
  return CONTEXT_TO_SURFACE[context] || 'inbox-advisory';
}

function contextTaskInstruction(context) {
  switch (context) {
    case 'revision':
      return `Task: Help revise the current draft. If you rewrite it, put the full updated message in [DRAFT_UPDATE]...[/DRAFT_UPDATE]. Briefly explain what changed outside the tag.`;
    case 'compose':
      return `Task: Help compose a guest-facing message. When writing or rewriting message text, put the full message in [DRAFT_UPDATE]...[/DRAFT_UPDATE]. Do not paste the same draft outside the tag.`;
    case 'draft_review':
      return `Task: Review the draft only against Friday rules, active teachings, property facts, and platform constraints. If the operator asks for a rewrite, provide [DRAFT_UPDATE].`;
    case 'pending_action':
    case 'next_step':
      return `Task: Advise the team on the pending action or next operational step. If it should become an Ops task, say so plainly and include who should own it if known.`;
    case 'teaching':
    case 'learning_candidate':
      return `Task: Decide whether this pattern is worth learning. Use [TEACH] JSON only when the operator should confirm a durable rule.`;
    case 'message_review':
      return `Task: Review the guest/team message for accuracy, tone, and operational risk. Suggest a concise correction when needed.`;
    default:
      return `Task: Answer the operator directly and concisely.`;
  }
}

function buildConsultUserMessage({
  instruction,
  context,
  conversation,
  messages,
  draftBody,
  sessionHistory,
  currentSessionSummary,
}) {
  const parts = [];
  parts.push(`[Consult context]\n- Mode: ${context}`);
  if (conversation) {
    const convLines = [
      `Conversation ID: ${conversation.id}`,
      `Guest: ${conversation.guest_name || 'unknown'}`,
      `Property: ${conversation.property_name || 'unknown'}`,
      `Channel: ${conversation.channel || conversation.communication_channel || 'unknown'}`,
      `Check-in: ${conversation.check_in_date || 'n/a'} -> check-out: ${conversation.check_out_date || 'n/a'}`,
      `Guests: ${conversation.num_guests || 'n/a'}`,
      `Status: ${conversation.status || 'unknown'}`,
    ];
    if (conversation.conversation_summary) convLines.push(`Prior summary: ${conversation.conversation_summary}`);
    if (conversation.notes) convLines.push(`Staff notes: ${conversation.notes}`);
    parts.push(`[Conversation]\n${convLines.map((l) => `- ${l}`).join('\n')}`);
  }
  if (messages && messages.length > 0) {
    parts.push(`[Recent thread messages]\n${messages.map(formatMessageForContext).join('\n\n')}`);
  }
  if (draftBody) {
    parts.push(`[Current working draft]\n${draftBody}`);
  }
  if (currentSessionSummary) {
    parts.push(`[Previous compacted Consult context]\n${currentSessionSummary}`);
  }
  if (sessionHistory && sessionHistory.length > 0) {
    const recent = sessionHistory.slice(-10).map((m) => {
      const role = m.role === 'assistant' ? 'Friday' : (m.sender || 'Operator');
      return `${role}: ${m.content || m.text || ''}`;
    }).join('\n\n');
    if (recent.trim()) parts.push(`[Recent Ask Friday turns]\n${recent}`);
  }
  parts.push(contextTaskInstruction(context));
  parts.push(`[Operator request]\n${instruction}`);
  return parts.join('\n\n');
}

function composeSystemPrompt({ context, propertyCode, instruction, draftBody, activeTeachingBlock, actionFeedbackBlock }) {
  const surface = selectConsultSurface(context);
  const acceptsPropertyCard = surface !== 'learning-analyzer';
  const composerOpts = {
    property_code: acceptsPropertyCard ? (propertyCode || undefined) : undefined,
    context_text: [instruction, draftBody].filter(Boolean).join('\n\n').slice(0, 3000),
    task_signals: detectTaskSignals([instruction, draftBody].filter(Boolean).join('\n\n')),
  };

  let composed;
  let missingKnowledge = false;
  try {
    composed = defaultComposer().load(surface, composerOpts);
  } catch (e) {
    if (propertyCode && acceptsPropertyCard) {
      missingKnowledge = true;
      composed = defaultComposer().load(surface, {
        ...composerOpts,
        property_code: undefined,
      });
    } else {
      throw e;
    }
  }

  const protocol = `You are Friday, Friday Retreats' AI operations assistant inside FAD.

Always respond in English.

DRAFT UPDATE PROTOCOL:
- When you write or modify a guest-facing draft/message, wrap the complete final text in [DRAFT_UPDATE]...[/DRAFT_UPDATE].
- Never repeat the draft text outside [DRAFT_UPDATE]. Outside the tag, use a short acknowledgement or short reasoning.
- Draft update text must be English only. Translation happens later at send time.

TEACHING PROTOCOL:
- If the operator gives a durable rule, correction, property fact, or recurring operational preference, emit one [TEACH] JSON block for the UI to confirm.
- Use property scope for property facts. Use global scope only for rules that apply across Friday.
- If the new rule conflicts with an active T-number teaching, use action "flag_conflict" and reference the T-number in "conflicting".
- Format examples:
[TEACH]{"action":"create","instruction":"Keep checkout messages to 1-2 sentences","scope":"global"}[/TEACH]
[TEACH]{"action":"create","instruction":"No daily cleaning. Linen change on Wednesdays only.","scope":"property","property_code":"LB-C"}[/TEACH]
[TEACH]{"action":"flag_conflict","conflicting":"T2","instruction":"Always mention pool hours for this property","reason":"T2 says keep messages brief"}[/TEACH]

Be concise. Surface missing knowledge honestly. Do not invent prices, availability, property features, refunds, or operational commitments.`;

  return {
    systemPrompt: `${protocol}\n\n${composed.system_message}${activeTeachingBlock || ''}${actionFeedbackBlock || ''}`,
    missingKnowledge,
    metadata: composed.metadata,
  };
}

async function loadConversationBundle(conversationId, tenantId) {
  if (!conversationId) return { conversation: null, messages: [] };
  if (!isUuid(conversationId)) return { conversation: null, messages: [] };
  const [convResult, messagesResult] = await Promise.all([
    query('SELECT * FROM conversations WHERE id = $1 AND tenant_id = $2', [conversationId, tenantId]),
    query(
      `SELECT * FROM messages
        WHERE conversation_id = $1
        ORDER BY created_at ASC
        LIMIT 80`,
      [conversationId],
    ),
  ]);
  if (convResult.rows.length === 0) {
    const err = new Error('Conversation not found');
    err.statusCode = 404;
    throw err;
  }
  return {
    conversation: convResult.rows[0],
    messages: messagesResult.rows,
  };
}

async function loadTeachingBlockWithIds(tenantId, propertyCode) {
  const { rows } = await query(
    `SELECT id, instruction, scope, property_code, property_codes
       FROM teachings
      WHERE tenant_id = $1 AND status = 'active'
      ORDER BY taught_at ASC`,
    [tenantId],
  );
  const code = propertyCode ? String(propertyCode).trim() : null;
  const relevant = rows.filter((t) => {
    if (t.scope === 'global') return true;
    if (t.scope !== 'property' || !code) return false;
    if (Array.isArray(t.property_codes) && t.property_codes.length > 0) {
      return t.property_codes.includes(code);
    }
    return t.property_code === code;
  });
  const teachingIdMap = {};
  if (relevant.length === 0) return { block: '', teachingIdMap };
  let block = '\n[Active Teachings — durable team rules]\n';
  relevant.forEach((t, i) => {
    const key = `T${i + 1}`;
    teachingIdMap[key] = t.id;
    const scope = t.scope === 'property'
      ? `property:${Array.isArray(t.property_codes) && t.property_codes.length > 0 ? t.property_codes.join(',') : t.property_code}`
      : 'global';
    block += `${key} (${scope}): ${t.instruction}\n`;
  });
  block += '\n';
  return { block, teachingIdMap };
}

async function getOrCreateSession({ req, sessionId, conversationId, context, draftId, propertyCode }) {
  if (sessionId) {
    const { rows } = await query(
      `SELECT * FROM consult_sessions
        WHERE id = $1 AND tenant_id = $2
        LIMIT 1`,
      [sessionId, req.tenantId],
    );
    if (rows[0]) return rows[0];
  }

  const { rows } = await query(
    `INSERT INTO consult_sessions
       (tenant_id, user_name, conversation_id, context, property_code, draft_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      req.tenantId,
      actorName(req),
      conversationId || null,
      context,
      propertyCode || null,
      draftId || null,
    ],
  );
  return rows[0];
}

async function updateSessionAfterTurn({ sessionId, inputTokens, outputTokens, history, missingKnowledge }) {
  const sets = [
    'turn_count = turn_count + 1',
    'total_input_tokens = total_input_tokens + $1',
    'total_output_tokens = total_output_tokens + $2',
    'conversation_history = $3::jsonb',
    'last_activity_at = NOW()',
  ];
  const params = [inputTokens || 0, outputTokens || 0, JSON.stringify(history || [])];
  if (missingKnowledge) {
    sets.push('missing_knowledge = TRUE');
  }
  params.push(sessionId);
  await query(
    `UPDATE consult_sessions
        SET ${sets.join(', ')}
      WHERE id = $${params.length}`,
    params,
  );
}

async function generateConsultSummary(sessionId, tenantId) {
  const { rows } = await query(
    `SELECT conversation_history
       FROM consult_sessions
      WHERE id = $1 AND tenant_id = $2`,
    [sessionId, tenantId],
  );
  const history = rows[0]?.conversation_history || [];
  if (!Array.isArray(history) || history.length === 0) return null;
  const result = await generateDraftReply({
    system: 'Summarize this Ask Friday consultation session for future context. Preserve decisions, draft state, teachings proposed, unresolved questions, and operator preferences. Keep it concise.',
    user: JSON.stringify(history).slice(0, 50000),
    meter: { tenantId, feature: 'inbox_consult_summary' },
  });
  if (!result.ok) throw new Error(result.error || 'summary generation failed');
  const summary = stripProtocolTags(result.text);
  await query(
    `UPDATE consult_sessions
        SET summary = $1,
            summary_generated_at = NOW()
      WHERE id = $2 AND tenant_id = $3`,
    [summary, sessionId, tenantId],
  );
  return summary;
}

router.post('/', attachIdentity, async (req, res) => {
  let activeSessionId = req.body?.sessionId || null;
  try {
    const context = req.body?.context;
    const instruction = cleanInstruction(req.body?.text || req.body?.instruction);
    const conversationId = req.body?.conversationId || null;
    const sessionConversationId = conversationIdForSession(conversationId);
    const draftId = req.body?.draftId || null;
    const draftBody = cleanInstruction(req.body?.draftBody);

    if (!instruction || !context) {
      return res.status(400).json({ error: 'Missing required fields: instruction (or text), context' });
    }
    if (!VALID_CONTEXTS.has(context)) {
      return res.status(400).json({ error: `context must be one of: ${Array.from(VALID_CONTEXTS).join(', ')}` });
    }
    if (CONVERSATION_REQUIRED_CONTEXTS.has(context) && !conversationId) {
      return res.status(400).json({ error: 'conversationId is required for this context type' });
    }

    const processTurn = async () => {
      const { conversation, messages } = await loadConversationBundle(conversationId, req.tenantId);
      const propertyCode = conversation ? resolvePropertyCode(conversation) : null;
      const session = await getOrCreateSession({
        req,
        sessionId: activeSessionId,
        conversationId: sessionConversationId,
        context,
        draftId,
        propertyCode,
      });
      activeSessionId = session.id;

      const sessionHistory = Array.isArray(session.conversation_history)
        ? session.conversation_history
        : (Array.isArray(req.body?.history) ? req.body.history : []);

      const [{ block: teachingsBlock, teachingIdMap }, actionFeedbackBlock] = await Promise.all([
        loadTeachingBlockWithIds(req.tenantId, propertyCode),
        loadActionFeedbackBlock(),
      ]);

      const composed = composeSystemPrompt({
        context,
        propertyCode,
        instruction,
        draftBody,
        activeTeachingBlock: teachingsBlock,
        actionFeedbackBlock,
      });

      const userMessage = buildConsultUserMessage({
        instruction,
        context,
        conversation,
        messages,
        draftBody,
        sessionHistory,
        currentSessionSummary: session.running_summary || session.summary || null,
      });

      const result = await generateDraftReply({
        system: composed.systemPrompt,
        user: userMessage,
        meter: { tenantId: req.tenantId, feature: 'inbox_consult' },
        timeoutMs: CONSULT_TIMEOUT_MS,
        maxRetries: CONSULT_MAX_RETRIES,
        maxTokens: CONSULT_MAX_TOKENS,
      });
      if (!result.ok) throw new Error(result.error || 'Consult model call failed');

      const responseTextForHistory = result.text;
      const draftUpdate = parseDraftUpdate(result.text);
      const teachingActions = parseTeachingActions(result.text, teachingIdMap);
      let responseTextForClient = stripProtocolTags(result.text);
      if (!responseTextForClient && draftUpdate) {
        responseTextForClient = 'Done — I updated the draft in the editor.';
      }
      if (!responseTextForClient && teachingActions.length > 0) {
        responseTextForClient = 'I found a teaching candidate for you to confirm.';
      }

      const userHistory = {
        role: 'user',
        content: instruction,
        sender: actorName(req),
        senderId: actorId(req),
      };
      const assistantHistory = {
        role: 'assistant',
        content: responseTextForHistory,
      };
      const nextHistory = [...sessionHistory, userHistory, assistantHistory].slice(-120);
      await updateSessionAfterTurn({
        sessionId: activeSessionId,
        inputTokens: result.inputTokens || 0,
        outputTokens: result.outputTokens || 0,
        history: nextHistory,
        missingKnowledge: composed.missingKnowledge,
      });

      if (conversationId) {
        publishFadEvent({
          tenantId: req.tenantId,
          type: 'inbox.consult_message',
          payload: {
            conversationId,
            sessionId: activeSessionId,
            context,
            draftId,
            actorName: actorName(req),
            hasDraftUpdate: !!draftUpdate,
            teachingActionCount: teachingActions.length,
          },
        }).catch(() => {});
      }

      let confidence;
      if (composed.missingKnowledge) confidence = 0.55;
      else if (draftUpdate) confidence = 0.82;
      else confidence = 0.78;

      res.json({
        response: responseTextForClient,
        model: result.model || DRAFT_MODEL,
        confidence,
        ...(draftUpdate ? { draft_update: draftUpdate } : {}),
        ...(teachingActions.length > 0 ? { teaching_actions: teachingActions, teaching_action: teachingActions[0] } : {}),
        sessionId: activeSessionId,
        metadata: {
          surface: composed.metadata.surface,
          loadedSkills: composed.metadata.loaded_skills,
          tokenEstimate: composed.metadata.token_estimate,
          propertyCode: composed.metadata.property_code,
        },
        ...(composed.missingKnowledge ? { missingKnowledge: true } : {}),
      });
    };

    if (conversationId) {
      await withConversationLock(conversationId, processTurn);
    } else {
      await processTurn();
    }
  } catch (e) {
    console.error('[consult] error:', e.message);
    if (activeSessionId) {
      await query(
        `UPDATE consult_sessions
            SET errors = COALESCE(errors, '[]'::jsonb) || $1::jsonb
          WHERE id = $2`,
        [JSON.stringify([{ message: e.message, timestamp: new Date().toISOString(), context: req.body?.context }]), activeSessionId],
      ).catch(() => {});
    }
    res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Consultation failed', details: e.message });
  }
});

router.get('/session/active', attachIdentity, async (req, res) => {
  const conversationId = typeof req.query.conversationId === 'string' ? req.query.conversationId : '';
  const sessionConversationId = conversationIdForSession(conversationId);
  const context = typeof req.query.context === 'string' ? req.query.context : 'compose';
  const draftId = typeof req.query.draftId === 'string' ? req.query.draftId : null;
  if (!conversationId) return res.status(400).json({ error: 'conversationId query parameter required' });
  if (!sessionConversationId) return res.json({ session: null, sessionId: null });

  try {
    const { rows } = await query(
      `SELECT id, conversation_history, last_activity_at, context, draft_id
         FROM consult_sessions
        WHERE tenant_id = $1
          AND conversation_id = $2
          AND context = $3
          AND draft_id IS NOT DISTINCT FROM $4
          AND status IN ('active', 'compacted')
        ORDER BY last_activity_at DESC
        LIMIT 1`,
      [req.tenantId, sessionConversationId, context, draftId],
    );
    const session = rows[0];
    if (!session) return res.json({ session: null, sessionId: null });
    res.json({
      sessionId: session.id,
      session: {
        id: session.id,
        sessionId: session.id,
        history: session.conversation_history || [],
        context: session.context,
        draftId: session.draft_id,
      },
    });
  } catch (e) {
    console.error('[consult] active session error:', e.message);
    res.status(500).json({ error: 'Failed to load active Consult session', details: e.message });
  }
});

router.get('/history/:conversationId', attachIdentity, async (req, res) => {
  const sessionConversationId = conversationIdForSession(req.params.conversationId);
  if (!sessionConversationId) return res.json({ sessions: [] });
  try {
    const { rows } = await query(
      `SELECT id, user_name, conversation_history, summary, status, context,
              draft_id, created_at, ended_at, end_reason
         FROM consult_sessions
        WHERE tenant_id = $1 AND conversation_id = $2
        ORDER BY created_at ASC`,
      [req.tenantId, sessionConversationId],
    );
    res.json({
      sessions: rows.map((s) => ({
        id: s.id,
        userName: s.user_name,
        messages: s.conversation_history || [],
        summary: s.summary,
        status: s.status,
        context: s.context,
        draftId: s.draft_id,
        createdAt: s.created_at,
        endedAt: s.ended_at,
        endReason: s.end_reason,
      })),
    });
  } catch (e) {
    console.error('[consult] history error:', e.message);
    res.status(500).json({ error: 'Failed to load Consult history', details: e.message });
  }
});

router.post('/session/end', attachIdentity, async (req, res) => {
  const sessionId = req.body?.sessionId;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
  try {
    await query(
      `UPDATE consult_sessions
          SET status = 'ended',
              ended_at = NOW(),
              conversation_history = COALESCE($3::jsonb, conversation_history),
              end_reason = COALESCE($4, end_reason)
        WHERE id = $1 AND tenant_id = $2 AND status IN ('active', 'compacted')`,
      [
        sessionId,
        req.tenantId,
        req.body?.history ? JSON.stringify(req.body.history) : null,
        req.body?.endReason || 'manual',
      ],
    );
    if (process.env.KIMI_API_KEY) {
      generateConsultSummary(sessionId, req.tenantId).catch((e) => {
        console.warn('[consult] background summary failed:', e.message);
      });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[consult] end session error:', e.message);
    res.status(500).json({ error: 'Failed to end Consult session', details: e.message });
  }
});

router.post('/:sessionId/summarize', attachIdentity, async (req, res) => {
  try {
    if (!process.env.KIMI_API_KEY) {
      return res.status(503).json({ error: 'KIMI_API_KEY not set' });
    }
    const summary = await generateConsultSummary(req.params.sessionId, req.tenantId);
    res.json({ summary });
  } catch (e) {
    console.error('[consult] summarize error:', e.message);
    res.status(500).json({ error: 'Summary generation failed', details: e.message });
  }
});

module.exports = router;

module.exports._test = {
  isUuid,
  conversationIdForSession,
  stripProtocolTags,
  parseDraftUpdate,
  parseTeachingActions,
  selectConsultSurface,
  contextTaskInstruction,
  buildConsultUserMessage,
  composeSystemPrompt,
};
