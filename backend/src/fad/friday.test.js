'use strict';

const express = require('express');
const request = require('supertest');

jest.mock('../design/auth', () => ({
  attachIdentity: (req, _res, next) => {
    req.identity = {
      userId: '11111111-1111-4111-8111-111111111111',
      userRole: 'admin',
      username: 'ishant@friday.mu',
      displayName: 'Ishant',
    };
    req.tenantId = '00000000-0000-0000-0000-000000000001';
    next();
  },
}));
jest.mock('../mcp', () => ({ callTool: jest.fn() }));

const { callTool } = require('../mcp');
const { router, _test } = require('./friday');

function app() {
  const server = express();
  server.use(express.json());
  server.use('/friday', router);
  return server;
}

describe('FAD Ask Friday helpers', () => {
  beforeEach(() => {
    callTool.mockReset();
  });

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
    expect(prompt).toContain('mauritiusCalendar');
    expect(prompt).toContain('Do not use markdown tables');
    expect(prompt).toContain('Return JSON only');
  });

  test('supplies Mauritius calendar dates to the model prompt', () => {
    const payload = JSON.parse(_test.buildUserPrompt({
      question: 'Create a task tomorrow',
      scope: 'All of FAD',
      context: { requestedModules: ['operations'], sections: [] },
    }));

    expect(payload.mauritiusCalendar).toEqual({
      today: _test.todayInMauritius(),
      tomorrow: _test.addDays(_test.todayInMauritius(), 1),
    });
  });

  test('selects module context from question and scope', () => {
    expect(_test.shouldLoad({ question: 'Any urgent maintenance?', scope: 'Operations' }, 'operations')).toBe(true);
    expect(_test.shouldLoad({ question: 'Summarize Villa Azur reviews', scope: 'All of FAD' }, 'reviews')).toBe(true);
    expect(_test.shouldLoad({ question: 'Who is on leave this week?', scope: 'HR' }, 'hr')).toBe(true);
    expect(_test.shouldLoad({ question: 'What is the design blocker?', scope: 'Design' }, 'design')).toBe(true);
  });

  test('broad all of FAD question loads every owned context family', () => {
    const modules = ['inbox', 'operations', 'hr', 'reviews', 'design', 'reservations', 'properties'];
    for (const module of modules) {
      expect(_test.shouldLoad({ question: 'What needs attention?', scope: 'All of FAD' }, module)).toBe(true);
    }
  });

  test('specific all of FAD questions keep context narrow', () => {
    const modules = ['inbox', 'operations', 'hr', 'reviews', 'design', 'reservations', 'properties'];
    const loadedForHandoff = modules.filter((module) =>
      _test.shouldLoad({ question: 'Any website AI handoffs waiting for takeover?', scope: 'All of FAD' }, module),
    );
    const loadedForReviews = modules.filter((module) =>
      _test.shouldLoad({ question: 'What should we learn from recent guest reviews?', scope: 'All of FAD' }, module),
    );
    const loadedForTask = modules.filter((module) =>
      _test.shouldLoad({ question: 'Create a task to check the AC at RC-16 tomorrow', scope: 'All of FAD' }, module),
    );

    expect(loadedForHandoff).toEqual(['inbox']);
    expect(loadedForReviews).toEqual(['reviews']);
    expect(loadedForTask).toEqual(['operations', 'properties']);
  });

  test('keeps enough output budget for Kimi K2.6 visible answers', () => {
    expect(_test.ASK_FRIDAY_MAX_TOKENS).toBeGreaterThanOrEqual(4096);
  });

  test('uses Claude by default and keeps provider timeouts below the edge gateway timeout', () => {
    expect(_test.ASK_FRIDAY_MODEL).toMatch(/^claude/);
    expect(_test.ASK_FRIDAY_PROVIDER_TIMEOUT_MS).toBeLessThanOrEqual(50_000);
    expect(_test.ASK_FRIDAY_AUTO_PROVIDER_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });

  test('shapes Airbnb Guesty reviews from rawReview fields for Ask Friday context', () => {
    const listingIndex = _test.buildListingIndex([
      { _id: 'listing-1', nickname: 'GBH-C5', title: 'Grand Baie Heights C5' },
    ]);

    expect(_test.shapeReview({
      _id: 'review-1',
      channelId: 'airbnb2',
      guestId: 'guest-abcdef',
      listingId: 'listing-1',
      reviewReplies: [],
      rawReview: {
        overall_rating: 4.8,
        public_review: 'Beautiful stay and very responsive team.',
        submitted_at: '2026-05-20T10:00:00.000Z',
      },
    }, listingIndex)).toEqual(expect.objectContaining({
      id: 'review-1',
      guest: 'Guest abcdef',
      rating: 4.8,
      listing: 'GBH-C5',
      propertyTitle: 'Grand Baie Heights C5',
      channel: 'airbnb',
      replyStatus: 'unreplied',
      excerpt: 'Beautiful stay and very responsive team.',
    }));
  });

  test('shapes Booking.com Guesty reviews with normalized ratings and reply status', () => {
    expect(_test.shapeReview({
      _id: 'review-2',
      channelId: 'bookingCom',
      propertyNickname: 'MV-7',
      rawReview: {
        created_timestamp: '2026-05-21T12:00:00.000Z',
        reviewer: { name: 'Maria Guest' },
        scoring: { review_score: 8 },
        content: {
          headline: 'Good stay',
          positive: 'Great location.',
          negative: 'Check-in instructions were hard to find.',
        },
        reply: { text: 'Thank you' },
      },
    })).toEqual(expect.objectContaining({
      id: 'review-2',
      guest: 'Maria Guest',
      rating: 4,
      listing: 'MV-7',
      channel: 'booking.com',
      replyStatus: 'replied',
      excerpt: 'Good stay Positive: Great location. Negative: Check-in instructions were hard to find.',
    }));
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

  test('normalizes model task action aliases into MCP task arguments', () => {
    expect(_test.cleanAction({
      type: 'create_task',
      label: 'Create task',
      payload: {
        taskTitle: 'Check the AC',
        propertyCode: 'RC-16',
        dueDate: '2026-05-24',
        assigneeUserIds: ['11111111-1111-4111-8111-111111111111'],
        priority: 'High priority',
      },
    })).toEqual(expect.objectContaining({
      type: 'create_task',
      payload: expect.objectContaining({
        title: 'Check the AC',
        property_code: 'RC-16',
        due_date: '2026-05-24',
        assignee_user_ids: ['11111111-1111-4111-8111-111111111111'],
        priority: 'high',
      }),
    }));
  });

  test('drops team message actions that cannot be routed safely', () => {
    expect(_test.cleanAction({
      type: 'send_team_message',
      label: 'Message Ops',
      payload: { text: 'Can someone check RC-16?' },
    })).toBeNull();
    expect(_test.cleanAction({
      type: 'send_team_message',
      label: 'Message Ops',
      payload: { channel_key: 'ops', message: 'Can someone check RC-16?' },
    })).toEqual(expect.objectContaining({
      payload: expect.objectContaining({ channelKey: 'ops', text: 'Can someone check RC-16?' }),
    }));
  });

  test('adds deterministic task action when operator asks Ask Friday to create an ops task', () => {
    const actions = _test.deterministicActions({
      question: 'Create an operations task to check the AC at RC-16 tomorrow morning. Make it high priority.',
      context: { requestedModules: ['operations'] },
      modelActions: [],
    });

    expect(actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'create_task',
        risk: 'safe',
        module: 'operations',
        payload: expect.objectContaining({
          title: 'Check the AC at RC-16',
          property_code: 'RC-16',
          priority: 'high',
          department: 'maintenance',
          tags: ['ask-friday'],
        }),
      }),
    ]));
    expect(actions[0].payload.due_date).toMatch(/^20\d{2}-\d{2}-\d{2}$/);
  });

  test('deterministic task fields correct model-created task actions', () => {
    const actions = _test.deterministicActions({
      question: 'Create an operations task to check the AC at RC-16 tomorrow morning. Make it high priority.',
      context: { requestedModules: ['operations', 'properties'] },
      modelActions: [{
        type: 'create_task',
        risk: 'safe',
        label: 'Create AC Check Task',
        module: 'operations',
        payload: {
          title: 'Check AC at RC-16',
          property_code: 'RC-16',
          priority: 'medium',
          due_date: _test.todayInMauritius(),
          due_time: '08:00',
          tags: ['model'],
        },
      }],
    });

    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual(expect.objectContaining({
      label: 'Create AC Check Task',
      type: 'create_task',
      payload: expect.objectContaining({
        title: 'Check the AC at RC-16',
        property_code: 'RC-16',
        priority: 'high',
        due_date: _test.addDays(_test.todayInMauritius(), 1),
        due_time: '08:00',
        tags: ['model', 'ask-friday'],
      }),
    }));
  });

  test('adds deterministic inbox navigation for website handoff questions', () => {
    const actions = _test.deterministicActions({
      question: 'Any website AI handoffs waiting for takeover?',
      context: { requestedModules: ['inbox'] },
      modelActions: [],
    });

    expect(actions).toEqual([
      expect.objectContaining({ type: 'navigate', module: 'inbox', label: 'Open Inbox' }),
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

describe('FAD Ask Friday action execution', () => {
  beforeEach(() => {
    callTool.mockReset();
  });

  test('executes a create-task action through the MCP task tool', async () => {
    callTool.mockResolvedValueOnce({ task: { id: 'task-1', title: 'Check the AC' } });

    const res = await request(app())
      .post('/friday/actions/execute')
      .send({
        action: {
          type: 'create_task',
          label: 'Create Ops Task',
          module: 'operations',
          payload: {
            taskTitle: 'Check the AC',
            propertyCode: 'RC-16',
            dueDate: '2026-05-24',
            priority: 'High priority',
            tags: ['ask-friday'],
          },
        },
      })
      .expect(200);

    expect(callTool).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'user',
      userId: '11111111-1111-4111-8111-111111111111',
      tenantId: '00000000-0000-0000-0000-000000000001',
      scopes: ['mcp:read', 'mcp:write', 'mcp:high-risk'],
    }), 'tasks.create', expect.objectContaining({
      title: 'Check the AC',
      property_code: 'RC-16',
      due_date: '2026-05-24',
      priority: 'high',
      tags: ['ask-friday'],
    }));
    expect(res.body).toMatchObject({
      ok: true,
      tool: 'tasks.create',
      summary: 'Task created: Check the AC',
    });
  });

  test('routes approval actions through the MCP approval ledger instead of executing directly', async () => {
    callTool.mockResolvedValueOnce({ request: { id: 'approval-1' } });

    const res = await request(app())
      .post('/friday/actions/execute')
      .send({
        action: {
          type: 'request_approval',
          label: 'Request approval',
          summary: 'Ask for approval before changing reservation dates.',
          module: 'reservations',
          payload: { risk_level: 'critical' },
        },
      })
      .expect(200);

    expect(callTool).toHaveBeenCalledWith(expect.any(Object), 'action.request.create', expect.objectContaining({
      actionType: 'reservation_change',
      riskLevel: 'critical',
      payload: expect.objectContaining({
        requestedAction: 'Request approval',
        module: 'reservations',
      }),
    }));
    expect(res.body.summary).toBe('Approval request created: approval-1');
  });
});
