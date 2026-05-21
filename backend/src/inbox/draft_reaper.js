'use strict';

// Stuck-draft reaper.
//
// friday-gms's draft-generator has a known footgun: if the process
// crashes mid-Kimi call, the `friday_drafting` row sits forever — no
// background sweep flips it to `generation_failed`. FAD-native fixes
// this here.
//
// Strategy: every N minutes, find drafts that have been in
// `friday_drafting` for longer than the reaper threshold and flip them
// to `generation_failed`. Threshold should comfortably exceed the
// worst-case Kimi-call wall time (3 retries × 45s timeout + backoff =
// ~3min). Default 5 minutes gives ~40% headroom.
//
// Safe to run concurrently with active draft-gen. The state check in
// the UPDATE WHERE clause is the race-safety: only rows still in
// `friday_drafting` get flipped. A draft that transitioned to
// `draft_ready` in the gap between SELECT and UPDATE is untouched.

const { query } = require('../database/client');

const REAPER_INTERVAL_MS = Number(process.env.DRAFT_REAPER_INTERVAL_MS) || 60_000;
const STUCK_THRESHOLD_MS = Number(process.env.DRAFT_STUCK_THRESHOLD_MS) || 5 * 60_000;
const MISSED_DRAFT_LOOKBACK_HOURS = Number(process.env.MISSED_DRAFT_LOOKBACK_HOURS) || 72;
const MISSED_DRAFT_RECOVERY_LIMIT = Number(process.env.MISSED_DRAFT_RECOVERY_LIMIT) || 10;
const ACTIONABLE_STATES_SQL = "('friday_drafting', 'draft_ready', 'under_review', 'generation_failed', 'send_queued', 'send_failed')";

let inFlight = false;
let timer = null;

async function reapOnce() {
  if (inFlight) return;
  inFlight = true;
  try {
    const thresholdSeconds = Math.floor(STUCK_THRESHOLD_MS / 1000);
    const { rows } = await query(
      `UPDATE drafts
          SET state = 'generation_failed', updated_at = NOW()
        WHERE state = 'friday_drafting'
          AND created_at < NOW() - INTERVAL '${thresholdSeconds} seconds'
        RETURNING id, message_id, conversation_id, created_at`,
    );
    if (rows.length > 0) {
      const ageSummary = rows
        .map((r) => `${r.id.slice(0, 8)}(${Math.floor((Date.now() - new Date(r.created_at).getTime()) / 1000)}s)`)
        .join(', ');
      console.warn(`[draft-reaper] reaped ${rows.length} stuck drafts: ${ageSummary}`);
    }
    await recoverMissedAutoDraftsOnce();
  } catch (e) {
    console.error('[draft-reaper] tick failed:', e.message);
  } finally {
    inFlight = false;
  }
}

async function recoverMissedAutoDraftsOnce() {
  const { triggerDraftGeneration } = require('./draft_generator');
  const lookbackHours = Math.max(1, Math.floor(MISSED_DRAFT_LOOKBACK_HOURS));
  const limit = Math.max(1, Math.floor(MISSED_DRAFT_RECOVERY_LIMIT));
  const { rows } = await query(
    `WITH latest_substantive AS (
       SELECT DISTINCT ON (m.conversation_id)
              m.id AS message_id,
              m.conversation_id,
              m.direction,
              m.created_at
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
        WHERE COALESCE(m.is_auto_response, false) = false
          AND m.created_at >= NOW() - INTERVAL '${lookbackHours} hours'
          AND COALESCE(c.status, 'active') NOT IN ('done', 'spam')
        ORDER BY m.conversation_id, m.created_at DESC, m.id::text DESC
     )
     SELECT l.message_id, l.conversation_id
       FROM latest_substantive l
      WHERE l.direction = 'inbound'
        AND NOT EXISTS (
        SELECT 1
          FROM drafts d
         WHERE d.conversation_id = l.conversation_id
           AND d.message_id = l.message_id
           AND d.state IN ${ACTIONABLE_STATES_SQL}
      )
      ORDER BY l.created_at ASC
      LIMIT ${limit}`,
  );
  if (rows.length === 0) return;
  console.warn(`[draft-reaper] recovering ${rows.length} missed inbound auto-drafts`);
  for (const row of rows) {
    triggerDraftGeneration(row.message_id, row.conversation_id, { recoveryReason: 'missed_auto_draft_reaper' })
      .catch((e) => console.error(`[draft-reaper] missed-draft recovery failed for ${row.message_id}:`, e.message));
  }
}

function start() {
  if (timer) return;
  console.log(`[draft-reaper] starting (interval=${REAPER_INTERVAL_MS}ms, threshold=${STUCK_THRESHOLD_MS}ms)`);
  setTimeout(() => { reapOnce().catch(() => {}); }, 10_000);
  timer = setInterval(() => { reapOnce().catch(() => {}); }, REAPER_INTERVAL_MS);
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { start, stop, reapOnce, recoverMissedAutoDraftsOnce };
