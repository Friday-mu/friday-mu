'use strict';

const BAD_SUMMARY_PATTERNS = [
  /\bi['’]?m ready to help summarize conversations\b/i,
  /\bplease (?:provide|share) the actual conversation\b/i,
  /\bi don['’]?t see a conversation history\b/i,
  /\bthere is no conversation (?:history|provided)\b/i,
];

const TOPIC_PATTERNS = {
  water: /\b(?:water|eau|hot\s*water|chauffe[-\s]?eau|ballon\s+d['’]?eau|toilet|toilettes?|pump|pompe|alimentation|supply|r[eé]tabli|restored?)\b/i,
  refund: /\b(?:refund|reimburse|remboursement|rembourser|compensation|geste\s+commercial)\b/i,
  access: /\b(?:access|acc[eè]s|permission|enter|entrer|absence|lockbox|bo[iî]te\s+[àa]\s+cl[eé]s)\b/i,
  checkin: /\b(?:check[-\s]?in|arrival|arriv[eé]e|instructions?|adresse|address|code|wifi)\b/i,
};

function isUnusableConversationSummary(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  return BAD_SUMMARY_PATTERNS.some((pattern) => pattern.test(text));
}

function topicSet(text) {
  const out = new Set();
  for (const [topic, pattern] of Object.entries(TOPIC_PATTERNS)) {
    if (pattern.test(String(text || ''))) out.add(topic);
  }
  return out;
}

function recentMessageText(messages) {
  if (!Array.isArray(messages)) return '';
  return messages
    .slice(-16)
    .map((m) => `${m.body || ''}\n${m.translated_body || ''}`)
    .join('\n');
}

function hasSummaryTopicDrift(summary, messages) {
  const summaryTopics = topicSet(summary);
  const recentTopics = topicSet(recentMessageText(messages));
  if (recentTopics.size === 0) return false;

  // Check-in summaries are common and harmless during pre-arrival, but
  // dangerous once a thread has become an active incident/refund/access
  // workflow: they pull the model back to stale logistics.
  const incidentTopics = ['water', 'refund', 'access'].filter((topic) => recentTopics.has(topic));
  if (incidentTopics.length === 0) return false;
  return incidentTopics.every((topic) => !summaryTopics.has(topic));
}

function safeConversationSummary(value, opts = {}) {
  const text = String(value || '').trim();
  if (!text || isUnusableConversationSummary(text)) return null;
  if (hasSummaryTopicDrift(text, opts.messages)) return null;
  return text;
}

module.exports = {
  safeConversationSummary,
  isUnusableConversationSummary,
  hasSummaryTopicDrift,
};
