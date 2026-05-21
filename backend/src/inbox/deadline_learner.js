'use strict';

// Learned-deadline lookup for pending_actions.
//
// Port of friday-gms/src/services/deadline-learner.ts
// (getLearnedDeadlineHours only — computeLearnedDeadlines analytics
// is currently unused by the runtime path).
//
// Looks up the historical median resolution time for a given action
// category. Used by action_detector to set smarter due_by than the
// AI's suggested_due_hours when we have enough data.
//
// Returns null if fewer than 3 completed actions in this category —
// not enough signal. Caller falls back to AI suggestion.

const { query } = require('../database/client');

async function getLearnedDeadlineHours(category) {
  try {
    const { rows } = await query(
      `SELECT
         PERCENTILE_CONT(0.5) WITHIN GROUP (
           ORDER BY EXTRACT(EPOCH FROM (completed_at - detected_at)) / 3600
         )::numeric(10,1) AS median_hours,
         COUNT(*)::int AS sample_size
       FROM pending_actions
       WHERE completed_at IS NOT NULL
         AND detected_at IS NOT NULL
         AND category = $1
         AND status NOT IN ('dismissed', 'auto_dismissed', 'auto_converted')`,
      [category],
    );
    const row = rows[0];
    if (!row || (row.sample_size || 0) < 3) return null;
    return parseFloat(row.median_hours);
  } catch (e) {
    console.warn('[deadline-learner] lookup failed:', e.message);
    return null;
  }
}

module.exports = { getLearnedDeadlineHours };
