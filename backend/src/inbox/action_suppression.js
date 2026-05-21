'use strict';

// Auto-dismiss rule check for pending_actions.
//
// Port of friday-gms/src/services/action-suppression.ts (checkAutoRules).
// Behaviour is identical except for the runtime cache reset hook —
// invalidateRulesCache() should be called from any FAD-side route that
// mutates the auto_dismiss_rules table (AutoDismissRulesPanel CRUD).
//
// Rules table: auto_dismiss_rules. Each row defines a set of criteria
// (source_type, category, action_type, tier, text_pattern,
// conversation_status, min_age_hours, urgency). For a rule to match, ALL
// non-null criteria must match the candidate action. First match wins;
// no priority ordering today.
//
// Three action verbs:
//   - 'suppress'      — caller skips inserting the action entirely
//   - 'auto_dismiss'  — insert + immediately flip to 'dismissed'
//   - 'auto_complete' — insert + immediately flip to 'completed'

const { query } = require('../database/client');

const CACHE_TTL_MS = 5 * 60 * 1000;
let rulesCache = null;
let rulesCacheTime = 0;

async function loadRules() {
  const now = Date.now();
  if (rulesCache && now - rulesCacheTime < CACHE_TTL_MS) return rulesCache;
  const { rows } = await query(
    `SELECT id, rule_name, source_type, category, action_type, tier,
            text_pattern, conversation_status, min_age_hours, urgency,
            action, enabled
       FROM auto_dismiss_rules
       WHERE enabled = true`,
  );
  rulesCache = rows;
  rulesCacheTime = now;
  return rulesCache;
}

function invalidateRulesCache() {
  rulesCache = null;
  rulesCacheTime = 0;
}

async function checkAutoRules(actionData) {
  try {
    const rules = await loadRules();
    for (const rule of rules) {
      let match = true;

      if (rule.source_type && rule.source_type !== actionData.source) match = false;
      if (match && rule.category && rule.category !== actionData.category) match = false;
      if (match && rule.action_type && rule.action_type !== actionData.action_type) match = false;
      if (match && rule.tier && rule.tier !== actionData.tier) match = false;
      if (match && rule.urgency && rule.urgency !== actionData.urgency) match = false;

      // text_pattern: ILIKE-style with % wildcards, evaluated as a
      // case-insensitive regex anchored start-to-end.
      if (match && rule.text_pattern && actionData.action_text) {
        const pattern = String(rule.text_pattern)
          .replace(/%/g, '.*')
          .replace(/_/g, '.');
        const regex = new RegExp(`^${pattern}$`, 'i');
        if (!regex.test(actionData.action_text)) match = false;
      } else if (match && rule.text_pattern && !actionData.action_text) {
        match = false;
      }

      // conversation_status: look up the conversation's status if the
      // rule specifies one.
      if (match && rule.conversation_status && actionData.conversation_id) {
        try {
          const { rows } = await query(
            `SELECT status FROM conversations WHERE id = $1`,
            [actionData.conversation_id],
          );
          if (rows.length === 0 || rows[0].status !== rule.conversation_status) {
            match = false;
          }
        } catch {
          match = false;
        }
      } else if (match && rule.conversation_status && !actionData.conversation_id) {
        match = false;
      }

      // min_age_hours: only relevant for existing actions (periodic
      // cleanup sweep). For freshly-detected actions, this clause means
      // the rule doesn't apply.
      if (match && rule.min_age_hours != null) {
        if (actionData.created_at) {
          const ageHours = (Date.now() - new Date(actionData.created_at).getTime()) / (1000 * 60 * 60);
          if (ageHours < rule.min_age_hours) match = false;
        } else {
          match = false;
        }
      }

      if (match) {
        return { matched: true, rule, action: rule.action };
      }
    }
    return { matched: false };
  } catch (e) {
    console.error('[action-suppression] rule check failed:', e.message);
    return { matched: false };
  }
}

module.exports = { checkAutoRules, invalidateRulesCache };
