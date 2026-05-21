'use strict';

// Dynamic-learning prompt-blocks for inbox AI surfaces.
//
// GMS's draft-generator.ts:726-751 + :941-960 + action-detector.ts
// inject two DB-sourced blocks into every system prompt:
//
//   [Team Instructions (learned from revisions)] — active rows from
//   the `teachings` table, scope-filtered to the conversation's
//   property (or global). Hand-authored by the team via revise/teach
//   on the inbox surface.
//
//   [Action Feedback from team] — last 20 teach/reject events from
//   `action_feedback`. Calibrates the model on what kinds of actions
//   the team accepts vs rejects.
//
// Sprint 9 composer refactor (V2 KB / Skills folder) intentionally
// preserved these injections — per both sprint audits, Sprint 8 + 9
// were KB-file-layer changes, runtime contract unchanged. The Phase
// 3.1 FAD-native port dropped them by accident (the structured
// composer's system_message wasn't augmented with these dynamic
// blocks). This module restores parity.
//
// Append to system prompt AFTER composer.system_message + BEFORE the
// caller's task directive. Both blocks are best-effort: DB errors
// return empty string so a transient teachings query failure doesn't
// fail the entire draft.

const { query } = require('../database/client');

/**
 * Load active teachings for this conversation's property scope.
 * Mirrors GMS draft-generator.ts:726-751 — multi-property aware
 * (`property_codes` array) + falls back to single `property_code`.
 *
 * @param {string|null} propertyCode — the property code resolved
 *   from conversations.property_name (e.g. "AO-11"). Null/empty
 *   yields global-only teachings.
 * @returns {Promise<string>} formatted block or '' if no relevant
 *   teachings.
 */
async function loadTeachingsBlock(propertyCode) {
  try {
    const { rows } = await query(
      `SELECT instruction, scope, property_code, property_codes
         FROM teachings
        WHERE status = 'active'
        ORDER BY taught_at ASC`,
    );
    if (rows.length === 0) return '';

    const code = propertyCode ? String(propertyCode).trim() : null;
    const relevant = rows.filter((t) => {
      if (t.scope === 'global') return true;
      if (t.scope !== 'property') return false;
      if (!code) return false;
      if (Array.isArray(t.property_codes) && t.property_codes.length > 0) {
        return t.property_codes.includes(code);
      }
      return t.property_code === code;
    });
    if (relevant.length === 0) return '';

    let block = '\n[Team Instructions (learned from revisions)]\n';
    relevant.forEach((t, i) => {
      block += `${i + 1}. ${t.instruction}\n`;
    });
    block += '\n';
    return block;
  } catch (e) {
    console.warn('[learning-context] teachings load failed:', e.message);
    return '';
  }
}

/**
 * Load the most recent 20 teach/reject action feedback rows. Used to
 * calibrate the model: GOOD examples (teach) reinforce what the team
 * accepts; AVOID examples (reject) signal patterns to drop.
 * Mirrors GMS draft-generator.ts:941-960 verbatim.
 *
 * @returns {Promise<string>} formatted block or '' if no feedback.
 */
async function loadActionFeedbackBlock() {
  try {
    const { rows } = await query(
      `SELECT feedback_type, original_text, edited_text, rejection_reason
         FROM action_feedback
        WHERE feedback_type IN ('teach', 'reject')
        ORDER BY created_at DESC LIMIT 20`,
    );
    if (rows.length === 0) return '';

    let block = '\n[Action Feedback from team]\nThese are actions the team has confirmed or rejected. Use this to calibrate what commitments to make:\n';
    for (const f of rows) {
      const original = String(f.original_text || '');
      if (f.feedback_type === 'teach') {
        const refined = f.edited_text ? ` (refined: "${f.edited_text}")` : '';
        block += `- GOOD: "${original}"${refined}\n`;
      } else {
        const reason = f.rejection_reason ? ` (reason: ${f.rejection_reason})` : '';
        block += `- AVOID: "${original}"${reason}\n`;
      }
    }
    return block;
  } catch (e) {
    console.warn('[learning-context] action_feedback load failed:', e.message);
    return '';
  }
}

module.exports = {
  loadTeachingsBlock,
  loadActionFeedbackBlock,
};
