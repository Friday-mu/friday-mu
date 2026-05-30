'use strict';

// Compact prompt helpers for fallback model calls.
//
// The full composer output is intentionally rich, but Kimi sometimes
// times out or returns finish_reason=length on long inbox threads. When
// callers fall back to a smaller prompt, keep the high-signal KB and
// dynamic learning context instead of dropping down to generic behavior.

function truncateBlock(value, maxLength) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 24)).trimEnd()}\n[truncated for fallback]`;
}

function extractMarkdownSection(systemMessage, heading) {
  const text = String(systemMessage || '');
  const marker = `## ${heading}`;
  const start = text.indexOf(marker);
  if (start === -1) return '';
  const next = text.indexOf('\n## ', start + marker.length);
  return text.slice(start, next === -1 ? undefined : next).trim();
}

function addSection(parts, label, body, maxLength) {
  const clipped = truncateBlock(body, maxLength);
  if (clipped) parts.push(`### ${label}\n${clipped}`);
}

function lazyHeadingsForSurface(surface) {
  switch (surface) {
    case 'inbox-drafts':
      return [
        'surfaces/inbox-drafts/discount-bounds',
        'surfaces/inbox-drafts/refund-bounds',
      ];
    case 'inbox-advisory':
      return [
        'surfaces/inbox-advisory/platform-compliance',
        'surfaces/inbox-advisory/ops-workflows',
      ];
    case 'inquiry-followup':
      return ['surfaces/inquiry-followup/tone-cadence'];
    default:
      return [];
  }
}

function buildCompactKnowledgeAppendix({
  systemMessage,
  surface,
  propertyCode,
  activeTeachingBlock,
  actionFeedbackBlock,
  runtimeKnowledgeBlock,
}) {
  const parts = [
    '[Compact KB + Learning Context]\nUse this as binding context during fallback. If a fact is not in the thread, property card, active teachings, or compact KB below, do not invent it.',
  ];

  addSection(parts, 'critical rules', extractMarkdownSection(systemMessage, 'global/critical-rules'), 1400);
  addSection(parts, 'brand voice', extractMarkdownSection(systemMessage, 'global/brand-voice'), 1000);
  addSection(parts, 'drafting discipline', extractMarkdownSection(systemMessage, 'global/drafting-discipline'), 1000);
  addSection(parts, 'business config', extractMarkdownSection(systemMessage, 'global/business-config'), 900);

  if (surface) {
    addSection(parts, 'surface rules', extractMarkdownSection(systemMessage, `surfaces/${surface}`), 1200);
    for (const heading of lazyHeadingsForSurface(surface)) {
      addSection(parts, heading.replace(`surfaces/${surface}/`, 'surface fragment: '), extractMarkdownSection(systemMessage, heading), 900);
    }
  }

  if (propertyCode) {
    addSection(parts, `property card ${propertyCode}`, extractMarkdownSection(systemMessage, `property:${propertyCode}`), 2200);
  }

  addSection(parts, 'active teachings', activeTeachingBlock, 2600);
  addSection(parts, 'team action feedback', actionFeedbackBlock, 1800);
  addSection(parts, 'runtime STR / platform / ops / sales context', runtimeKnowledgeBlock, 4200);

  return `\n\n${parts.join('\n\n')}`;
}

module.exports = {
  truncateBlock,
  extractMarkdownSection,
  buildCompactKnowledgeAppendix,
};
