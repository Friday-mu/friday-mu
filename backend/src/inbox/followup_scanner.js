'use strict';

// Phase 3.3 — FAD-native inquiry follow-up scanner.
//
// Replaces friday-gms/src/services/inquiry-followup-scanner.ts. Two
// passes per tick (every 15min by default):
//
//   1. autoDismissInquiryFollowups() — sweep pending_actions and
//      auto-dismiss inquiry_followup rows where:
//         a. Reservation is now booked/confirmed/checked-in/reserved
//            (Guesty's "reserved" = guest accepted offer, was the
//            2026-05-18 cea6ac30 fix — preserved in this port)
//         b. Check-in date has passed
//         c. Team responded (outbound after last inbound)
//
//   2. scanOnce() — find prospects with stale unresponded inbound,
//      create new pending_actions at the right escalation level, and
//      kick off a follow-up draft via followup_draft_generator.
//
// Cadence rules mirror GMS (per-channel escalation steps in hours).
// Complaint-intent conversations use a faster cadence (1/3/6h).
//
// Disabled by FAD_FOLLOWUP_SCANNER_DISABLED env flag for rollback.

const { query } = require('../database/client');
const { checkAutoRules } = require('./action_suppression');
const { generateFollowupDraft } = require('./followup_draft_generator');

const POLL_INTERVAL_MS = Number(process.env.FOLLOWUP_SCANNER_INTERVAL_MS) || 15 * 60_000;
const DISABLED = process.env.FAD_FOLLOWUP_SCANNER_DISABLED === 'true';

let inFlight = false;
let timer = null;

// ────────────────────────────────────────────────────────────────────
// Intent + cadence
// ────────────────────────────────────────────────────────────────────

// Keyword-based intent classifier. Mirrors GMS detectIntent —
// priority: complaint > new_booking > extension > question > followup
// > unknown. Quick, no LLM.
async function detectIntent(conversationId) {
  try {
    const { rows } = await query(
      `SELECT direction, body FROM messages
        WHERE conversation_id = $1
        ORDER BY created_at DESC LIMIT 5`,
      [conversationId],
    );
    if (rows.length === 0) return 'unknown';

    const inboundText = rows
      .filter((m) => m.direction === 'inbound')
      .map((m) => String(m.body || '').toLowerCase())
      .join(' ');
    if (!inboundText) return 'unknown';

    if (/\b(broken|not working|problem|issue|dirty|complaint|disappointed|unacceptable|disgusting|terrible|horrible|worst)\b/.test(inboundText)) {
      return 'complaint';
    }
    if (/\b(available|book|reserve|dates?|price|rates?|how much|cost|per night|quote|availability|stay)\b/.test(inboundText)) {
      return 'new_booking';
    }
    if (/\b(extend|extra night|stay longer|additional night|one more night|extend stay)\b/.test(inboundText)) {
      return 'extension';
    }
    if (/[?]|\b(how|where|what|when|can i|is there|do you|does it|could you|are there)\b/.test(inboundText)) {
      return 'question';
    }
    const hasOutbound = rows.some((m) => m.direction === 'outbound');
    const hasInbound = rows.some((m) => m.direction === 'inbound');
    if (hasOutbound && !hasInbound) return 'followup';
    return 'unknown';
  } catch (e) {
    console.error('[followup-scanner] intent detection failed:', e.message);
    return 'unknown';
  }
}

const FOLLOWUP_RULES = {
  airbnb:   { cadence: [3, 12],          maxEscalation: 'medium' },
  booking:  { cadence: [3, 12, 24],      maxEscalation: 'high' },
  direct:   { cadence: [3, 12, 24, 168], maxEscalation: 'critical' },
  whatsapp: { cadence: [3, 12, 24, 168], maxEscalation: 'critical' },
  default:  { cadence: [3, 12, 24],      maxEscalation: 'high' },
};

const URGENCY_BY_LEVEL = { 0: 'low', 1: 'medium', 2: 'high', 3: 'critical' };
const URGENCY_ORDER = ['low', 'medium', 'high', 'critical'];

function getUrgencyForLevel(level, maxEscalation) {
  const urgency = URGENCY_BY_LEVEL[level] || 'critical';
  const maxIdx = URGENCY_ORDER.indexOf(maxEscalation);
  const currIdx = URGENCY_ORDER.indexOf(urgency);
  if (maxIdx >= 0 && currIdx > maxIdx) return maxEscalation;
  return urgency;
}

function buildMessage(guestName, propertyName, hoursElapsed, level, channel) {
  const propStr = propertyName ? ` at ${propertyName}` : '';
  const hours = Math.round(hoursElapsed);
  const timeStr = hoursElapsed >= 168 ? '1 week' : `${hours}h`;
  if (level >= 3) return `🔴 Inquiry from ${guestName}${propStr} — ${timeStr} without response`;
  if (level >= 2) return `⚠️ Inquiry from ${guestName}${propStr} — ${timeStr} without response. Risk of losing booking.`;
  if (level >= 1) return `Inquiry from ${guestName} — ${timeStr} without response`;
  if (channel === 'airbnb') return `Inquiry from ${guestName}${propStr} — no response yet (${timeStr}). Note: Airbnb tracks response time.`;
  return `Inquiry from ${guestName}${propStr} — no response yet (${timeStr})`;
}

// ────────────────────────────────────────────────────────────────────
// Pass 1 — auto-dismiss stale pending_actions
// ────────────────────────────────────────────────────────────────────

async function autoDismissInquiryFollowups() {
  let dismissed = 0;
  try {
    // 1a. Reservation now booked/confirmed/checked-in/reserved.
    //
    // 'reserved' was added 2026-05-18 (cea6ac30) — Guesty's canonical
    // "guest accepted offer" state (Booking.com et al). The dismiss
    // path also LEFT JOINs r2 by guesty_reservation_id so we catch
    // rows whose reservation_id FK never got backfilled.
    const booked = await query(`
      WITH dismissed AS (
        UPDATE pending_actions pa
        SET status = 'auto_dismissed', dismissed_reason = 'booking_confirmed', completed_at = now()
        FROM conversations c
        LEFT JOIN reservations r ON r.id = c.reservation_id
        LEFT JOIN reservations r2 ON r2.guesty_reservation_id = c.guesty_reservation_id AND r.id IS NULL
        WHERE pa.conversation_id = c.id
          AND pa.action_type = 'inquiry_followup'
          AND pa.status = 'pending'
          AND LOWER(COALESCE(r.status, r2.status, '')) IN ('confirmed', 'booked', 'checked_in', 'reserved')
        RETURNING pa.id
      )
      SELECT COUNT(*)::int AS n FROM dismissed
    `);
    dismissed += Number(booked.rows[0]?.n || 0);

    // 1b. Check-in date in the past.
    const checkin = await query(`
      WITH dismissed AS (
        UPDATE pending_actions pa
        SET status = 'auto_dismissed', dismissed_reason = 'checkin_passed', completed_at = now()
        FROM conversations c
        WHERE pa.conversation_id = c.id
          AND pa.action_type = 'inquiry_followup'
          AND pa.status = 'pending'
          AND c.check_in_date IS NOT NULL
          AND c.check_in_date::date < CURRENT_DATE
        RETURNING pa.id
      )
      SELECT COUNT(*)::int AS n FROM dismissed
    `);
    dismissed += Number(checkin.rows[0]?.n || 0);

    // 1c. Team responded after the last inbound (manual outbound,
    // not an auto-response). Mirrors GMS line ~163.
    const responded = await query(`
      WITH dismissed AS (
        UPDATE pending_actions pa
        SET status = 'auto_dismissed', dismissed_reason = 'team_responded', completed_at = now()
        FROM conversations c
        WHERE pa.conversation_id = c.id
          AND pa.action_type = 'inquiry_followup'
          AND pa.status = 'pending'
          AND EXISTS (
            SELECT 1 FROM messages m_out
            WHERE m_out.conversation_id = c.id
              AND m_out.direction = 'outbound'
              AND m_out.is_auto_response IS NOT TRUE
              AND m_out.created_at > (
                SELECT MAX(m_in.created_at) FROM messages m_in
                WHERE m_in.conversation_id = c.id AND m_in.direction = 'inbound'
              )
          )
        RETURNING pa.id
      )
      SELECT COUNT(*)::int AS n FROM dismissed
    `);
    dismissed += Number(responded.rows[0]?.n || 0);

    if (dismissed > 0) {
      console.log(`[followup-scanner] auto-dismissed ${dismissed} stale inquiry_followup actions`);
    }
  } catch (e) {
    console.error('[followup-scanner] auto-dismiss pass failed:', e.message);
  }
}

// ────────────────────────────────────────────────────────────────────
// Pass 2 — scan + create new follow-ups
// ────────────────────────────────────────────────────────────────────

async function scanOnce() {
  try {
    await autoDismissInquiryFollowups();

    // Prospect query: active conversations, last inbound has no team
    // outbound after it, reservation is missing or in a non-committed
    // state. 'reserved' is REMOVED from the prospect list since
    // Guesty's "reserved" = guest accepted offer (cea6ac30 fix).
    const { rows } = await query(`
      SELECT
        c.id AS conversation_id,
        c.guest_name,
        c.property_name,
        c.channel,
        c.check_in_date,
        m_last_in.created_at AS last_inbound_at,
        EXTRACT(EPOCH FROM (now() - m_last_in.created_at)) / 3600 AS hours_since_inbound,
        pa_existing.id AS existing_action_id,
        pa_existing.escalation_level AS existing_level
      FROM conversations c
      JOIN LATERAL (
        SELECT created_at FROM messages
        WHERE conversation_id = c.id AND direction = 'inbound'
        ORDER BY created_at DESC LIMIT 1
      ) m_last_in ON true
      LEFT JOIN LATERAL (
        SELECT id FROM messages
        WHERE conversation_id = c.id
          AND direction = 'outbound'
          AND created_at > m_last_in.created_at
          AND is_auto_response IS NOT TRUE
        LIMIT 1
      ) m_outbound ON true
      LEFT JOIN reservations r ON r.id = c.reservation_id
      LEFT JOIN reservations r2 ON r2.guesty_reservation_id = c.guesty_reservation_id AND r.id IS NULL
      LEFT JOIN pending_actions pa_existing ON pa_existing.conversation_id = c.id
        AND pa_existing.action_type = 'inquiry_followup'
        AND pa_existing.status = 'pending'
      WHERE c.status IN ('active')
        AND m_outbound.id IS NULL
        AND (
          (r.id IS NULL AND r2.id IS NULL)
          OR LOWER(COALESCE(r.status, r2.status, '')) IN ('inquiry', 'pending', 'awaiting_payment', '')
        )
        AND COALESCE(c.conversion_status, 'unknown') != 'booked'
        AND EXTRACT(EPOCH FROM (now() - m_last_in.created_at)) / 3600 >= 3
    `);

    let created = 0;
    let escalated = 0;

    for (const row of rows) {
      const intent = await detectIntent(row.conversation_id);
      await query(
        `UPDATE conversations SET conversation_intent = $1 WHERE id = $2`,
        [intent, row.conversation_id],
      ).catch(() => {});

      // Question intent only gets the first cadence step (3h) — after
      // that, drop. Mirrors GMS pattern: questions are usually
      // self-resolving once we answer them, don't badger the guest.
      const hoursElapsed = parseFloat(row.hours_since_inbound);
      if (intent === 'question' && hoursElapsed > 6) continue;

      const channel = String(row.channel || 'default').toLowerCase();
      const rules = intent === 'complaint'
        ? { cadence: [1, 3, 6], maxEscalation: 'critical' }
        : (FOLLOWUP_RULES[channel] || FOLLOWUP_RULES.default);

      let targetLevel = -1;
      for (let i = rules.cadence.length - 1; i >= 0; i--) {
        if (hoursElapsed >= rules.cadence[i]) {
          targetLevel = i;
          break;
        }
      }
      if (targetLevel < 0) continue;

      const urgency = getUrgencyForLevel(targetLevel, rules.maxEscalation);
      const message = buildMessage(
        row.guest_name || 'Unknown guest',
        row.property_name,
        hoursElapsed,
        targetLevel,
        channel,
      );

      if (row.existing_action_id) {
        // Escalate if level increased.
        const currentLevel = Number(row.existing_level || 0);
        if (targetLevel > currentLevel) {
          await query(
            `UPDATE pending_actions
                SET action_text = $1, urgency = $2, escalation_level = $3
              WHERE id = $4`,
            [message, urgency, targetLevel, row.existing_action_id],
          );
          escalated++;
        }
      } else {
        // Auto-rule pre-check.
        const ruleCheck = await checkAutoRules({
          source: 'auto',
          action_type: 'inquiry_followup',
          action_text: message,
          conversation_id: row.conversation_id,
          urgency,
        });
        if (ruleCheck.matched && ruleCheck.action === 'suppress') {
          continue;
        }

        const { rows: ins } = await query(
          `INSERT INTO pending_actions
             (conversation_id, guest_name, property_code, action_text,
              status, source, action_type, urgency, escalation_level)
           VALUES ($1, $2, $3, $4, 'pending', 'auto', 'inquiry_followup', $5, $6)
           RETURNING id`,
          [
            row.conversation_id,
            row.guest_name || 'Unknown guest',
            row.property_name || null,
            message,
            urgency,
            targetLevel,
          ],
        );

        if (ruleCheck.matched && ruleCheck.action !== 'suppress') {
          const newStatus = ruleCheck.action === 'auto_dismiss' ? 'dismissed' : 'completed';
          await query(
            `UPDATE pending_actions
                SET status = $1, completed_at = NOW(), completed_by = 'auto_rule', completion_note = $2
              WHERE id = $3`,
            [newStatus, `Auto-${newStatus} by rule: ${ruleCheck.rule.rule_name}`, ins[0].id],
          );
        }

        created++;

        // Fire the draft generation async — slow Kimi call shouldn't
        // hold up the rest of the scanner loop.
        generateFollowupDraft({
          conversationId: row.conversation_id,
          guestName: row.guest_name || 'Unknown guest',
          propertyName: row.property_name,
          propertyCode: row.property_name, // FAD assumption: property_name IS the code (AO-11 etc.)
          hoursElapsed,
          channel,
        }).catch((err) => {
          console.error(`[followup-scanner] draft gen error for conv ${row.conversation_id}:`, err.message);
        });
      }
    }

    if (created > 0 || escalated > 0) {
      console.log(`[followup-scanner] scan: ${created} created, ${escalated} escalated`);
    }
  } catch (e) {
    console.error('[followup-scanner] scan failed:', e.message);
  }
}

async function tick() {
  if (DISABLED) return;
  if (inFlight) return;
  inFlight = true;
  try {
    await scanOnce();
  } finally {
    inFlight = false;
  }
}

function start() {
  if (timer) return;
  if (DISABLED) {
    console.log('[followup-scanner] disabled by FAD_FOLLOWUP_SCANNER_DISABLED');
    return;
  }
  console.log(`[followup-scanner] starting (interval=${POLL_INTERVAL_MS}ms)`);
  // Delay first tick by 30s so startup logs land cleanly + the DB is
  // settled before the first scan.
  setTimeout(() => { tick().catch(() => {}); }, 30_000);
  timer = setInterval(() => { tick().catch(() => {}); }, POLL_INTERVAL_MS);
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  start,
  stop,
  scanOnce,
  autoDismissInquiryFollowups,
  detectIntent,
  FOLLOWUP_RULES,
};
