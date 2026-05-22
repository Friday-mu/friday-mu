'use strict';

const { _test } = require('./friday');

describe('FAD Ask Friday helpers', () => {
  test('builds an action-aware staff assistant system prompt', () => {
    const prompt = _test.buildSystemPrompt();
    expect(prompt).toContain('command surface');
    expect(prompt).toContain('create_task');
    expect(prompt).toContain('request_approval');
    expect(prompt).toContain('concrete next step');
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

  test('all of FAD scope loads every owned context family', () => {
    const modules = ['inbox', 'operations', 'hr', 'reviews', 'design', 'reservations', 'properties'];
    for (const module of modules) {
      expect(_test.shouldLoad({ question: 'What needs attention?', scope: 'All of FAD' }, module)).toBe(true);
    }
  });

  test('keeps enough output budget for Kimi K2.6 visible answers', () => {
    expect(_test.ASK_FRIDAY_MAX_TOKENS).toBeGreaterThanOrEqual(4096);
  });

  test('parses strict JSON and falls back to raw text', () => {
    expect(_test.parseModelResponse(JSON.stringify({
      answer: 'Check Operations first.',
      confidence: 'high',
      followups: ['Open schedule'],
      sourcesUsed: ['operations'],
      actions: [
        {
          type: 'navigate',
          risk: 'navigation',
          label: 'Open Operations',
          module: 'operations',
          payload: {},
        },
      ],
    }))).toMatchObject({
      answer: 'Check Operations first.',
      confidence: 'high',
      followups: ['Open schedule'],
      sourcesUsed: ['operations'],
      actions: [expect.objectContaining({ type: 'navigate', module: 'operations' })],
    });
    expect(_test.parseModelResponse('plain answer')).toMatchObject({
      answer: 'plain answer',
      confidence: 'medium',
      actions: [],
    });
  });

  test('sanitizes Ask Friday actions before rendering or execution', () => {
    expect(_test.sanitizeActions([
      { type: 'navigate', module: 'operations', label: 'Open Ops' },
      { type: 'create_task', label: 'Create task', payload: { title: 'Check AC', priority: 'high' } },
      { type: 'delete_everything', label: 'Nope' },
      { type: 'navigate', label: 'Missing module' },
    ])).toEqual([
      expect.objectContaining({ type: 'navigate', risk: 'navigation', module: 'operations' }),
      expect.objectContaining({ type: 'create_task', risk: 'safe', payload: expect.objectContaining({ title: 'Check AC' }) }),
    ]);
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
