'use strict';

// Ask Friday Core analyzer scheduler — periodic worker that runs the
// analyzer against recent learning events and writes new KB candidates
// (+ eval cases) to the queue. The candidates land in
// `ask_friday_kb_candidates` with reviewStatus='pending' and surface
// in the Ask Friday review module for director approval.
//
// Slice 4 of the Ask Friday Core operationalization plan (per the
// 2026-05-23 essential-systems handover):
//
//   "Move from manual analyzer to controlled operational workflow.
//    Add explicit staff-triggered dry-run and commit modes, or a
//    scheduled worker with dry-run default. Never auto-approve. Add
//    idempotency guard so repeated runs do not spam duplicate
//    candidates."
//
// Idempotency: runAnalyzer's underlying insertCandidate uses
//   INSERT ... ON CONFLICT (tenant_id, candidate_id) DO UPDATE
// so re-running over the same event window is safe — existing
// candidates get refreshed timestamps, not duplicated rows.
//
// Behavior:
//   - Runs every ASK_FRIDAY_ANALYZER_INTERVAL_MS (default: 30 min)
//   - First tick fires ASK_FRIDAY_ANALYZER_FIRST_DELAY_MS after start
//     (default: 90s, after the rest of the boot settles)
//   - Looks back ASK_FRIDAY_ANALYZER_LOOKBACK_HOURS (default: 24h)
//   - Tenant scope: FR by default (multi-tenant fan-out is a follow-up
//     slice once we have non-FR tenants with real Ask Friday traffic)
//   - dryRun=false — real candidates land in the queue.
//
// Disable in any environment by setting ASK_FRIDAY_ANALYZER_DISABLED=1
// (e.g. for local dev where you don't want background DB writes).

const { runAnalyzer } = require('./analyzer');

const FR_TENANT_ID = process.env.ASK_FRIDAY_ANALYZER_TENANT_ID
  || '00000000-0000-0000-0000-000000000001';

const INTERVAL_MS = Number(process.env.ASK_FRIDAY_ANALYZER_INTERVAL_MS)
  || 30 * 60 * 1000;

const FIRST_DELAY_MS = Number(process.env.ASK_FRIDAY_ANALYZER_FIRST_DELAY_MS)
  || 90 * 1000;

const LOOKBACK_HOURS = Number(process.env.ASK_FRIDAY_ANALYZER_LOOKBACK_HOURS)
  || 24;

let timer = null;
let firstTickTimer = null;

async function tick() {
  const t0 = Date.now();
  try {
    const result = await runAnalyzer({
      tenantId: FR_TENANT_ID,
      sinceHours: LOOKBACK_HOURS,
      limit: 500,
      minClusterSize: 2,
      dryRun: false,
    });
    const latency = Date.now() - t0;
    if (result.insertedCandidates > 0 || result.insertedEvalCases > 0) {
      console.log(
        `[ask-friday/analyzer] tick ok in ${latency}ms — `
        + `inspected=${result.inspectedEvents}, clusters=${result.clusters}, `
        + `+${result.insertedCandidates} candidates, +${result.insertedEvalCases} evals`,
      );
    } else {
      // Quieter log when nothing new — common when no traffic landed in the
      // lookback window or the analyzer found no clusterable patterns.
      console.log(
        `[ask-friday/analyzer] tick ok in ${latency}ms — `
        + `inspected=${result.inspectedEvents}, clusters=${result.clusters}, no new candidates`,
      );
    }
  } catch (e) {
    console.error(`[ask-friday/analyzer] tick failed in ${Date.now() - t0}ms:`, e.message);
  }
}

function start() {
  if (process.env.ASK_FRIDAY_ANALYZER_DISABLED === '1') {
    console.log('[ask-friday/analyzer] disabled via ASK_FRIDAY_ANALYZER_DISABLED');
    return;
  }
  if (timer) return;
  console.log(
    `[ask-friday/analyzer] starting (`
    + `firstDelay=${FIRST_DELAY_MS}ms, interval=${INTERVAL_MS}ms, lookback=${LOOKBACK_HOURS}h)`,
  );
  firstTickTimer = setTimeout(() => {
    tick().catch(() => {});
    timer = setInterval(() => { tick().catch(() => {}); }, INTERVAL_MS);
  }, FIRST_DELAY_MS);
}

function stop() {
  if (firstTickTimer) {
    clearTimeout(firstTickTimer);
    firstTickTimer = null;
  }
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { start, stop, tick };
