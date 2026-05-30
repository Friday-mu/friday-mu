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
//   [Action Feedback from team] — last 20 human accept/edit/promote/
//   reject events from `action_feedback`. Calibrates the model on what
//   kinds of actions the team accepts vs rejects.
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
async function loadTeachingsBlock(propertyCode, tenantId = null) {
  try {
    const params = [];
    let tenantWhere = '';
    if (tenantId) {
      params.push(tenantId);
      tenantWhere = 'AND tenant_id = $1';
    }
    const { rows } = await query(
      `SELECT instruction, scope, property_code, property_codes
         FROM teachings
        WHERE status = 'active'
          ${tenantWhere}
        ORDER BY taught_at ASC`,
      params,
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
 * Load the most recent 20 human action feedback rows. GMS used
 * `teach`/`reject`; FAD now records `accept`/`edit`/`promote`/`reject`.
 * Skip `auto_reject` here because those rows are system-suppression
 * noise, not durable human preference.
 *
 * @returns {Promise<string>} formatted block or '' if no feedback.
 */
async function loadActionFeedbackBlock(tenantId = null) {
  try {
    const params = [];
    let tenantWhere = '';
    if (tenantId) {
      params.push(tenantId);
      tenantWhere = 'AND tenant_id = $1';
    }
    const { rows } = await query(
      `SELECT feedback_type, action_type, original_text, edited_text, rejection_reason
         FROM action_feedback
        WHERE feedback_type IN ('teach', 'accept', 'edit', 'promote', 'reject')
          ${tenantWhere}
        ORDER BY created_at DESC LIMIT 20`,
      params,
    );
    if (rows.length === 0) return '';

    let block = '\n[Action Feedback from team]\nThese are human decisions on proposed actions/drafts. Use accepted/promoted/edited items as positive calibration and rejected items as patterns to avoid:\n';
    for (const f of rows) {
      const original = String(f.original_text || '');
      const kind = f.action_type ? ` (${f.action_type})` : '';
      if (f.feedback_type === 'teach' || f.feedback_type === 'accept' || f.feedback_type === 'promote') {
        const refined = f.edited_text ? ` (refined: "${f.edited_text}")` : '';
        block += `- GOOD${kind}: "${original}"${refined}\n`;
      } else if (f.feedback_type === 'edit') {
        const edited = f.edited_text ? ` -> "${f.edited_text}"` : '';
        block += `- CORRECTED${kind}: "${original}"${edited}\n`;
      } else if (f.feedback_type === 'reject') {
        const reason = f.rejection_reason ? ` (reason: ${f.rejection_reason})` : '';
        block += `- AVOID${kind}: "${original}"${reason}\n`;
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
