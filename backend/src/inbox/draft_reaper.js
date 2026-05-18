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
  } catch (e) {
    console.error('[draft-reaper] tick failed:', e.message);
  } finally {
    inFlight = false;
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

module.exports = { start, stop, reapOnce };
