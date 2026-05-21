'use strict';

const BAD_SUMMARY_PATTERNS = [
  /\bi['’]?m ready to help summarize conversations\b/i,
  /\bplease (?:provide|share) the actual conversation\b/i,
  /\bi don['’]?t see a conversation history\b/i,
  /\bthere is no conversation (?:history|provided)\b/i,
];

function isUnusableConversationSummary(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  return BAD_SUMMARY_PATTERNS.some((pattern) => pattern.test(text));
}

function safeConversationSummary(value) {
  const text = String(value || '').trim();
  if (!text || isUnusableConversationSummary(text)) return null;
  return text;
}

module.exports = {
  safeConversationSummary,
  isUnusableConversationSummary,
};
