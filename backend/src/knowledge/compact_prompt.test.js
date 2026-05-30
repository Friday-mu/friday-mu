'use strict';

const {
  extractMarkdownSection,
  buildCompactKnowledgeAppendix,
} = require('./compact_prompt');

describe('compact prompt helpers', () => {
  const systemMessage = [
    '## global/critical-rules',
    'Never invent operational commitments.',
    '',
    '## global/brand-voice',
    'Warm, concise, Friday Retreats tone.',
    '',
    '## surfaces/inbox-drafts',
    'Draft replies in English for the operator.',
    '',
    '## surfaces/inbox-drafts/refund-bounds',
    'Refund claims require manager confirmation.',
    '',
    '## property:RC-15',
    '{"nickname":"Residence Camelia 15","check_in":"14:00"}',
  ].join('\n');

  test('extracts one markdown heading section without bleeding into the next one', () => {
    expect(extractMarkdownSection(systemMessage, 'global/critical-rules')).toBe([
      '## global/critical-rules',
      'Never invent operational commitments.',
    ].join('\n'));
  });

  test('builds compact fallback context from KB, property card, teachings, and feedback', () => {
    const appendix = buildCompactKnowledgeAppendix({
      systemMessage,
      surface: 'inbox-drafts',
      propertyCode: 'RC-15',
      activeTeachingBlock: '[Active Teachings]\nT1: Verify incident status before replying.',
      actionFeedbackBlock: '[Action Feedback]\n- AVOID: duplicate check-ins',
    });

    expect(appendix).toContain('Compact KB + Learning Context');
    expect(appendix).toContain('Never invent operational commitments');
    expect(appendix).toContain('Draft replies in English');
    expect(appendix).toContain('Refund claims require manager confirmation');
    expect(appendix).toContain('property card RC-15');
    expect(appendix).toContain('Verify incident status');
    expect(appendix).toContain('duplicate check-ins');
  });
});
