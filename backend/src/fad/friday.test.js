'use strict';

const { _test } = require('./friday');

describe('FAD Ask Friday helpers', () => {
  test('builds a read-only staff assistant system prompt', () => {
    const prompt = _test.buildSystemPrompt();
    expect(prompt).toContain('read-only');
    expect(prompt).toContain('Inbox');
    expect(prompt).toContain('Operations');
    expect(prompt).toContain('HR');
    expect(prompt).toContain('Reviews');
    expect(prompt).toContain('Design');
    expect(prompt).toContain('Return JSON only');
  });

  test('selects module context from question and scope', () => {
    expect(_test.shouldLoad({ question: 'Any urgent maintenance?', scope: 'Operations' }, 'operations')).toBe(true);
    expect(_test.shouldLoad({ question: 'Summarize Villa Azur reviews', scope: 'All of FAD' }, 'reviews')).toBe(true);
    expect(_test.shouldLoad({ question: 'Who is on leave this week?', scope: 'HR' }, 'hr')).toBe(true);
    expect(_test.shouldLoad({ question: 'What is the design blocker?', scope: 'Design' }, 'design')).toBe(true);
  });

  test('parses strict JSON and falls back to raw text', () => {
    expect(_test.parseModelResponse(JSON.stringify({
      answer: 'Check Operations first.',
      confidence: 'high',
      followups: ['Open schedule'],
      sourcesUsed: ['operations'],
    }))).toMatchObject({
      answer: 'Check Operations first.',
      confidence: 'high',
      followups: ['Open schedule'],
      sourcesUsed: ['operations'],
    });
    expect(_test.parseModelResponse('plain answer')).toMatchObject({
      answer: 'plain answer',
      confidence: 'medium',
    });
  });

  test('sanitizes prior chat history for the model', () => {
    const history = _test.sanitizeHistory([
      { role: 'user', content: 'hello' },
      { role: 'ai', text: 'answer' },
      { role: 'assistant', content: 'previous' },
    ]);
    expect(history).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'answer' },
      { role: 'assistant', content: 'previous' },
    ]);
  });
});
