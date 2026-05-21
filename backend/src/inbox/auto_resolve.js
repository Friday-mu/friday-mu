'use strict';

// Phase 3.4 — FAD-native auto-resolve.
//
// Replaces friday-gms/src/services/auto-resolve.ts. Called from
// drafts_send.js after a draft successfully sends. Scans the just-sent
// outbound message against this conversation's pending_actions and
// flips any that the team's message has resolved.
//
// Example: pending_action says "Check late checkout availability and
// confirm to guest". Team sends "Late checkout at 1pm is confirmed,
// thanks for letting us know." → Kimi maps the outbound to that
// action's ID → status flips to 'completed'.
//
// Note: GMS also had an "auto-summarize" worker; per consolidation
// doc §5.1.5 it was killed (AUTO_SUMMARIZER_ENABLED=false default,
// hot-fix). No active consumer, so we don't port it in Phase 3.4.

const { query } = require('../database/client');
const { extractStructuredOutput } = require('../ai/kimi_draft');

const AUTO_RESOLVE_SYSTEM = `You analyse the team's outbound message and decide which of the listed pending actions it resolves. An action is resolved when the message confirms the action was completed or the question answered. Vague reassurance ("we'll look into it") does NOT resolve an action — only concrete confirmation does.

Respond with valid JSON in this exact shape:

{ "resolved_action_ids": ["<id1>", "<id2>"] }

If none are resolved, respond { "resolved_action_ids": [] }. Return ONLY the JSON.`;

async function checkAutoResolve(conversationId, outboundMessage) {
  if (!conversationId || !outboundMessage) return { skipped: 'missing_args' };
  if (!process.env.KIMI_API_KEY) return { skipped: 'no_kimi_key' };

  try {
    const { rows: actions } = await query(
      `SELECT id, action_text
         FROM pending_actions
        WHERE conversation_id = $1
          AND status = 'pending'
          AND tier = 'active'`,
      [conversationId],
    );
    if (actions.length === 0) return { count: 0 };

    const actionList = actions
      .map((a, i) => `${i + 1}. [${a.id}] ${a.action_text}`)
      .join('\n');

    const userMessage = `Team sent: "${outboundMessage}"\n\nPending actions:\n${actionList}\n\nWhich action IDs are resolved by the team's message? JSON only.`;

    const result = await extractStructuredOutput({
      system: AUTO_RESOLVE_SYSTEM,
      user: userMessage,
      maxTokens: 400,
      meter: { feature: 'inbox_auto_resolve' },
    });

    if (!result.ok) {
      console.warn(`[auto-resolve] Kimi extraction failed (conv=${conversationId}): ${result.error}`);
      return { error: result.error };
    }

    const resolvedIds = Array.isArray(result.parsed?.resolved_action_ids)
      ? result.parsed.resolved_action_ids
      : [];
    if (resolvedIds.length === 0) return { count: 0 };

    let resolved = 0;
    for (const id of resolvedIds) {
      // Defensive: only resolve IDs that were in the list we sent. If
      // Kimi hallucinates an unrelated UUID, we'd otherwise flip an
      // action that wasn't in this conversation.
      if (!actions.some((a) => a.id === id)) continue;
      const { rowCount } = await query(
        `UPDATE pending_actions
            SET status = 'completed',
                completed_at = NOW(),
                completed_by = 'system',
                completion_note = 'Auto-resolved: team confirmed resolution in conversation'
          WHERE id = $1 AND status = 'pending'`,
        [id],
      );
      if (rowCount > 0) {
        resolved++;
        console.log(`[auto-resolve] action ${id.slice(0, 8)} auto-completed (conv=${conversationId})`);
      }
    }

    if (resolved > 0) {
      console.log(`[auto-resolve] resolved ${resolved}/${actions.length} actions for conv=${conversationId}`);
    }
    return { count: resolved };
  } catch (e) {
    console.error(`[auto-resolve] failed (conv=${conversationId}): ${e.message}`);
    return { error: e.message };
  }
}

module.exports = { checkAutoResolve };
