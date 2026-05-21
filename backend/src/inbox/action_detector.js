'use strict';

// Phase 3.2 — FAD-native commitment / pending-action detector.
//
// Replaces friday-gms/src/services/action-detector.ts.detectActions.
// Scans an OUTBOUND/sent message body for promises the team just made
// ("we'll check with the owner", "we'll send you the address tomorrow")
// and writes pending_actions rows that the inbox UI surfaces as
// reminders.
//
// Trigger site (FAD-native): backend/src/inbox/drafts_send.js after a
// draft successfully sends. GMS counterpart gated behind
// GMS_ACTION_DETECTOR_DISABLED so we don't double-write.
//
// Structural differences from the GMS source:
//   - Structured composer (`pending-actions` surface) instead of
//     20-line monolithic knowledgeContext.
//   - Kimi (extractStructuredOutput, response_format json_object)
//     instead of Anthropic. Locked 2026-05-18 per Phase 3.1 decision.
//   - Same suppression-rule + learned-deadline + deferred-followup
//     semantics — those are load-bearing UX behaviours, not GMS-isms.

const { query } = require('../database/client');
const { defaultComposer } = require('../knowledge/composer');
const { extractStructuredOutput, EXTRACT_MODEL } = require('../ai/kimi_draft');
const { loadTeachingsBlock } = require('./learning_context');
const { checkAutoRules } = require('./action_suppression');
const { getLearnedDeadlineHours } = require('./deadline_learner');

const SKIP_RESERVATION_STATUSES = new Set([
  'inquiry', 'cancelled', 'expired', 'declined', 'closed',
]);

const VALID_CATEGORIES = new Set([
  'guest_communication', 'internal_admin', 'property_maintenance', 'financial',
]);

const VALID_OWNERS = new Set(['team', 'guest', 'system']);

const VALID_URGENCIES = new Set(['low', 'medium', 'high', 'critical']);

// Deferred-followup pattern set. Mirrors the GMS list; these are
// phrases that signal an action's resolution is parked until close to
// check-in, so we proactively re-surface the action 7d + 2d ahead.
const DEFERRED_PATTERNS = [
  'contact before arrival',
  'check back',
  'confirm closer to date',
  'days before',
  'before check-in',
  'before check in',
  'early check-in',
  'early checkin',
  'late checkout',
  'late check-out',
  'closer to the date',
  'nearer the time',
  'before arrival',
];

function isDeferredAction(actionText) {
  if (!actionText) return false;
  const lower = String(actionText).toLowerCase();
  return DEFERRED_PATTERNS.some((p) => lower.includes(p));
}

// Build the system prompt's task framing — appended after the composed
// KB so the model knows what to extract and in what shape. Includes
// reservation dates when known so the AI can date-anchor follow-ups.
function buildTaskInstruction({ checkInDate, checkOutDate }) {
  let dateBlock = '';
  if (checkInDate || checkOutDate) {
    dateBlock = `[Reservation Dates]
Check-in: ${checkInDate || 'unknown'} | Check-out: ${checkOutDate || 'unknown'}
Use these dates to determine when actions are due. Access instructions should be due 1 day before check-in. Checkout-related actions should be due by the day before check-out.

`;
  }
  return `${dateBlock}TASK — Analyse the team's reply (below in the user message) and extract every commitment, promise, or follow-up action the team made. Look for phrases like:
- "we'll check / confirm / verify / get back to you / follow up / look into"
- "we are still checking / working on / arranging"
- "we'll send you / share / provide"
- "let us check with [owner/team/maintenance]"
- Any promise that requires someone to act and report back to the guest.

For each commitment, classify:

1. Owner (who needs to act next):
   - "team": Our team must do something (check availability, send info, fix issue, call vendor)
   - "guest": We're waiting on the guest to respond, confirm, pay, or take action
   - "system": Automated system action (auto-close, scheduled check)

2. Category:
   - "guest_communication": follow-ups, messages, confirmations to the guest
   - "internal_admin": documentation, notes, reservation management
   - "property_maintenance": physical property issues, repairs, cleaning
   - "financial": payments, refunds, invoices, pricing

3. Urgency: low | medium | high | critical

Return JSON in this exact shape:
{
  "actions": [
    {
      "action_text": "Check late checkout availability for April 15 and confirm to guest",
      "urgency": "high",
      "suggested_due_hours": 2,
      "suggested_due_date": "2026-04-14",
      "owner": "team",
      "category": "guest_communication"
    }
  ]
}

If reservation dates are present, use "suggested_due_date" (YYYY-MM-DD) for date-anchored actions. Use "suggested_due_hours" for time-relative actions.

If the reply contains NO commitments, return: { "actions": [] }

Be precise. "Enjoy your stay" is not a commitment. "We'll check with the owner" IS. Respond with ONLY the JSON.`;
}

// ────────────────────────────────────────────────────────────────────
// Main entry
// ────────────────────────────────────────────────────────────────────

async function detectActions(params) {
  const { draftBody, conversationId, guestName, propertyCode } = params;
  if (!draftBody || !conversationId) {
    return { skipped: 'missing_required' };
  }
  if (!process.env.KIMI_API_KEY) {
    return { skipped: 'no_kimi_key' };
  }

  try {
    // 1. Reservation status + date gate.
    let checkInDate = null;
    let checkOutDate = null;
    try {
      const { rows } = await query(
        `SELECT r.status, r.check_in, r.check_out
           FROM reservations r
           JOIN conversations c ON c.reservation_id = r.id
           WHERE c.id = $1
           LIMIT 1`,
        [conversationId],
      );
      if (rows.length > 0) {
        const r = rows[0];
        if (r.status && SKIP_RESERVATION_STATUSES.has(String(r.status).toLowerCase())) {
          console.log(`[action-detector] skip: reservation status "${r.status}" (conv=${conversationId})`);
          return { skipped: `reservation_${r.status}` };
        }
        checkInDate = r.check_in ? new Date(r.check_in).toISOString().slice(0, 10) : null;
        checkOutDate = r.check_out ? new Date(r.check_out).toISOString().slice(0, 10) : null;
      }
    } catch (e) {
      // Don't block detection on a reservation lookup failure — the
      // skip rule is a quality optimisation, not a safety guarantee.
      console.warn(`[action-detector] reservation lookup failed (conv=${conversationId}): ${e.message}`);
    }

    // 2. Compose system prompt.
    let composed;
    try {
      composed = defaultComposer().load('pending-actions', {
        property_code: propertyCode || undefined,
        context_text: String(draftBody).slice(0, 2000),
      });
    } catch (e) {
      console.warn(`[action-detector] composer with property_code=${propertyCode} failed (${e.message}); retrying without property card`);
      composed = defaultComposer().load('pending-actions', {
        context_text: String(draftBody).slice(0, 2000),
      });
    }

    // Dynamic teachings injection — restored after Sprint 8/9 audit
    // (2026-05-19). GMS action-detector.ts always pulled active
    // teachings into the system prompt; my Phase 3.2 port dropped it.
    // Action_feedback isn't injected here (GMS doesn't do that for the
    // detector — feedback shapes pending_actions, doesn't shape detection).
    const teachingsBlock = await loadTeachingsBlock(propertyCode);

    const taskInstruction = buildTaskInstruction({ checkInDate, checkOutDate });
    const systemPrompt = `${composed.system_message}${teachingsBlock}\n\n${taskInstruction}`;
    const userMessage = `Reply text:\n"""\n${draftBody}\n"""`;

    // 3. Kimi extraction.
    const result = await extractStructuredOutput({
      system: systemPrompt,
      user: userMessage,
      meter: { feature: 'inbox_action_detect' },
    });
    if (!result.ok) {
      console.warn(`[action-detector] Kimi extraction failed (conv=${conversationId}): ${result.error}`);
      return { error: result.error };
    }

    const actions = Array.isArray(result.parsed?.actions) ? result.parsed.actions : [];
    if (actions.length === 0) {
      console.log(`[action-detector] no commitments found (conv=${conversationId})`);
      return { count: 0 };
    }

    // 4. Filter previously-rejected similar actions. Heuristic: the
    // rejected text is contained in (or contains) the new action text.
    let rejectedTexts = [];
    try {
      const { rows } = await query(
        `SELECT original_text FROM action_feedback
           WHERE feedback_type = 'reject'
             AND action_type = 'pending_action'
           ORDER BY created_at DESC LIMIT 20`,
      );
      rejectedTexts = rows.map((r) => String(r.original_text || '').toLowerCase());
    } catch { /* best-effort */ }

    // 5. Iterate + insert.
    const inserted = [];
    for (const action of actions) {
      const actionText = String(action.action_text || '').trim();
      if (!actionText) continue;

      const actionLower = actionText.toLowerCase();
      if (rejectedTexts.some((rt) => rt && (actionLower.includes(rt) || rt.includes(actionLower)))) {
        console.log(`[action-detector] skip: similar to previously-rejected (${actionText.slice(0, 60)}…)`);
        continue;
      }

      const actionType = actionText.split(/\s+/).slice(0, 3).join('_').toLowerCase().slice(0, 60);
      const category = VALID_CATEGORIES.has(action.category) ? action.category : 'guest_communication';
      const owner = VALID_OWNERS.has(action.owner) ? action.owner : 'team';
      const urgency = VALID_URGENCIES.has(action.urgency) ? action.urgency : 'medium';

      // 6. Auto-rules check.
      const ruleCheck = await checkAutoRules({
        source: 'auto',
        category,
        action_type: actionType,
        tier: 'active',
        action_text: actionText,
        conversation_id: conversationId,
        urgency,
      });
      if (ruleCheck.matched && ruleCheck.action === 'suppress') {
        console.log(`[action-detector] suppressed by rule "${ruleCheck.rule.rule_name}": ${actionText.slice(0, 60)}…`);
        continue;
      }

      // 7. Compute due_by — prefer AI date when valid, then learned
      // category deadline, then AI suggested hours, then a 4h default.
      let dueBy;
      if (action.suggested_due_date && /^\d{4}-\d{2}-\d{2}$/.test(String(action.suggested_due_date))) {
        dueBy = new Date(`${action.suggested_due_date}T12:00:00`);
      } else {
        let dueHours = Number(action.suggested_due_hours) || 4;
        const learned = await getLearnedDeadlineHours(category);
        if (learned != null && learned > 0) {
          dueHours = learned;
        }
        dueBy = new Date(Date.now() + dueHours * 60 * 60 * 1000);
      }

      // Clamp due_by to [now, now+30d].
      const nowMs = Date.now();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      if (dueBy.getTime() < nowMs) {
        dueBy = new Date(nowMs + 4 * 60 * 60 * 1000);
      } else if (dueBy.getTime() > nowMs + thirtyDaysMs) {
        dueBy = new Date(nowMs + thirtyDaysMs);
      }

      // 8. Insert.
      const { rows: insertResult } = await query(
        `INSERT INTO pending_actions
           (conversation_id, guest_name, property_code, action_text,
            due_by, urgency, owner, category)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          conversationId,
          guestName || null,
          propertyCode || null,
          actionText,
          dueBy,
          urgency,
          owner,
          category,
        ],
      );
      const actionId = insertResult[0].id;
      let actionClosedByRule = false;

      // 9. Auto-rule transitions (dismiss / complete) — for non-suppress
      // rule outcomes, insert then flip status.
      if (ruleCheck.matched && ruleCheck.action !== 'suppress') {
        const newStatus = ruleCheck.action === 'auto_dismiss' ? 'dismissed' : 'completed';
        await query(
          `UPDATE pending_actions
              SET status = $1, completed_at = NOW(), completed_by = 'auto_rule', completion_note = $2
            WHERE id = $3`,
          [newStatus, `Auto-${newStatus} by rule: ${ruleCheck.rule.rule_name}`, actionId],
        );
        actionClosedByRule = true;
        console.log(`[action-detector] auto-${newStatus} by rule "${ruleCheck.rule.rule_name}": ${actionText.slice(0, 60)}…`);
      }

      // 10. Deferred-followup expansion: for guest-owned date-anchored
      // requests ("we'll check before arrival" etc.), spawn proactive
      // team follow-ups 7d + 2d before check-in. Mirrors the GMS logic.
      if (owner === 'guest' && checkInDate && isDeferredAction(actionText)) {
        const checkInMs = new Date(`${checkInDate}T12:00:00`).getTime();
        const daysToCheckIn = (checkInMs - nowMs) / (24 * 60 * 60 * 1000);

        const subject = actionText
          .replace(/^(follow up|check|confirm|contact guest)\s*(about|regarding|re|on)?\s*/i, '')
          .slice(0, 80);

        const followUps = [];
        if (daysToCheckIn > 7) {
          followUps.push({
            dueBy: new Date(checkInMs - 7 * 24 * 60 * 60 * 1000),
            text: `Follow up with ${guestName || 'guest'} about ${subject} — we now have better visibility on availability`,
          });
        }
        if (daysToCheckIn > 2) {
          followUps.push({
            dueBy: new Date(checkInMs - 2 * 24 * 60 * 60 * 1000),
            text: `Final check: confirm ${guestName || 'guest'}'s ${subject} — check-in is in 2 days`,
          });
        }

        for (const fu of followUps) {
          await query(
            `INSERT INTO pending_actions
               (conversation_id, guest_name, property_code, action_text,
                due_by, urgency, owner, category, parent_action_id)
             VALUES ($1, $2, $3, $4, $5, 'medium', 'team', 'guest_communication', $6)`,
            [
              conversationId,
              guestName || null,
              propertyCode || null,
              fu.text,
              fu.dueBy,
              actionId,
            ],
          );
        }

        if (followUps.length > 0) {
          await query(
            `UPDATE pending_actions
                SET status = 'auto_converted',
                    completion_note = $1
              WHERE id = $2`,
            [`Converted to ${followUps.length} proactive team follow-up(s)`, actionId],
          );
          console.log(`[action-detector] converted deferred guest action to ${followUps.length} team follow-up(s): ${actionText.slice(0, 60)}…`);
        }
      }

      inserted.push({ id: actionId, text: actionText, owner, dueBy, closedByRule: actionClosedByRule });
    }

    console.log(
      `[action-detector] detected ${inserted.length}/${actions.length} actions for conv=${conversationId} ` +
      `model=${result.model || EXTRACT_MODEL} tokens=${result.inputTokens}+${result.outputTokens} latency=${result.latencyMs}ms`,
    );
    return { count: inserted.length, actions: inserted };
  } catch (e) {
    console.error(`[action-detector] failed (conv=${conversationId}): ${e.message}`);
    return { error: e.message };
  }
}

module.exports = {
  detectActions,
  isDeferredAction, // exposed for tests
};
