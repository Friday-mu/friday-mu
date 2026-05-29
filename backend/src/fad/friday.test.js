'use strict';

const express = require('express');
const request = require('supertest');

jest.mock('../database/client', () => ({ query: jest.fn() }));
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
jest.mock('../ask_friday/action_writer', () => ({ recordActionRequest: jest.fn() }));

const { query } = require('../database/client');
const { callTool } = require('../mcp');
const { recordActionRequest } = require('../ask_friday/action_writer');
const { router, _test } = require('./friday');

function app() {
  const server = express();
  server.use(express.json());
  server.use('/friday', router);
  return server;
}

describe('FAD Ask Friday helpers', () => {
  beforeEach(() => {
    query.mockReset();
    callTool.mockReset();
    recordActionRequest.mockReset();
  });

  test('builds an action-aware staff assistant system prompt', () => {
    const prompt = _test.buildSystemPrompt();
    expect(prompt).toContain('command surface');
    expect(prompt).toContain('create_task');
    expect(prompt).toContain('request_approval');
    expect(prompt).toContain('concrete next step');
    expect(prompt).toContain('Inbox');
    expect(prompt).toContain('TeamInbox');
    expect(prompt).toContain('Operations');
    expect(prompt).toContain('HR');
    expect(prompt).toContain('Reviews');
    expect(prompt).toContain('Design');
    expect(prompt).toContain('mauritiusCalendar');
    expect(prompt).toContain('context.dataTruth');
    expect(prompt).toContain('context.askFridayCore');
    expect(prompt).toContain('published context packs');
    expect(prompt).toContain('demo/fixture');
    expect(prompt).toContain('Do not use markdown tables');
    expect(prompt).toContain('Return JSON only');
    // Focus rule — when the operator is anchored to a specific thread,
    // the model must answer on THAT thread not the recent slice.
    expect(prompt).toContain('focused_inbox_thread');
    expect(prompt).toContain('background context');
    expect(prompt).toContain('staff-only internal discussion/evidence');
    expect(prompt).toContain('not canonical truth');
  });

  test('parses inbox focus thread ids — UUID conversation vs website handoff prefix', () => {
    const uuid = '8b8914d9-66cd-4bcc-ab3e-1266fae27c69';
    expect(_test.parseInboxFocusThreadId(uuid)).toEqual({ kind: 'guesty', id: uuid, raw: uuid });
    expect(_test.parseInboxFocusThreadId(`web-${uuid}`)).toEqual({ kind: 'website', id: uuid, raw: `web-${uuid}` });
    expect(_test.parseInboxFocusThreadId('not-a-uuid')).toBeNull();
    expect(_test.parseInboxFocusThreadId('')).toBeNull();
    expect(_test.parseInboxFocusThreadId(null)).toBeNull();
  });

  test('loads focused Guesty inbox threads without selecting removed guest_phone column', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          id: '8b8914d9-66cd-4bcc-ab3e-1266fae27c69',
          guest_name: 'Maria Guest',
          property_name: 'MV-1',
          status: 'open',
          communication_channel: 'airbnb',
          last_message_at: '2026-05-28T09:00:00.000Z',
          updated_at: '2026-05-28T09:01:00.000Z',
          guesty_id: 'guesty-thread',
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const focused = await _test.loadFocusedGuestyThread(
      '00000000-0000-0000-0000-000000000001',
      '8b8914d9-66cd-4bcc-ab3e-1266fae27c69',
    );

    expect(focused).toEqual(expect.objectContaining({
      kind: 'guesty_conversation',
      guest: 'Maria Guest',
      property: 'MV-1',
    }));
    expect(query.mock.calls[0][0]).not.toContain('guest_phone');
  });

  test('loads focused website handoff threads without requiring guest_phone column', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          id: '8b8914d9-66cd-4bcc-ab3e-1266fae27c69',
          guest_email: 'guest@example.com',
          guest_name: 'Website Guest',
          status: 'handoff',
          last_event_type: 'website.ai_handoff',
          last_event_at: '2026-05-28T09:00:00.000Z',
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const focused = await _test.loadFocusedWebsiteThread(
      '00000000-0000-0000-0000-000000000001',
      '8b8914d9-66cd-4bcc-ab3e-1266fae27c69',
    );

    expect(focused).toEqual(expect.objectContaining({
      kind: 'website_ai_handoff_thread',
      guest: 'Website Guest',
    }));
    expect(query.mock.calls[0][0]).toContain("to_jsonb(t)->>'guest_phone'");
    expect(query.mock.calls[0][0]).not.toContain('guest_name, guest_phone');
  });

  test('sanitizes operator focus payload — drops empty + caps lengths', () => {
    expect(_test.sanitizeFocus(null)).toBeNull();
    expect(_test.sanitizeFocus({})).toBeNull();
    expect(_test.sanitizeFocus({
      module: 'Operations',
      threadId: 'web-8b8914d9-66cd-4bcc-ab3e-1266fae27c69',
      teamTarget: 'channel:6c4c13d0-d780-4b1c-b2de-4051a9bdd555',
      pageUrl: '/fad?m=inbox&thread=web-8b8914d9-66cd-4bcc-ab3e-1266fae27c69',
      surfaceId: 'fad_ops_assistant',
      host: 'fad_right_panel',
      route: '/fad?m=operations',
      view: 'Schedule Planner',
      focusedObject: {
        type: 'task',
        id: 'task_123',
        label: 'Fix AC at GBH-C8',
        secret: 'drop me',
      },
      selection: {
        selectedIds: ['task_123', 'task_456'],
        cursorRange: 'rows 1-3',
      },
      visibleState: {
        summary: 'Weekly schedule view with unassigned tasks visible.',
        activeTab: 'schedule',
        filters: { date: '2026-05-29', team: 'field', nested: { label: 'visible only' } },
        counts: { tasks: 18, unassigned: 3 },
      },
      allowedActions: ['create_task', 'assign_task', 'apply_schedule_after_approval'],
      privacyClass: 'staff_private',
      stalenessMs: 1500.4,
    })).toEqual({
      module: 'operations',
      threadId: 'web-8b8914d9-66cd-4bcc-ab3e-1266fae27c69',
      focusMessageId: null,
      teamTarget: 'channel:6c4c13d0-d780-4b1c-b2de-4051a9bdd555',
      pageUrl: '/fad?m=inbox&thread=web-8b8914d9-66cd-4bcc-ab3e-1266fae27c69',
      surfaceId: 'fad_ops_assistant',
      host: 'fad_right_panel',
      route: '/fad?m=operations',
      view: 'schedule planner',
      focusedObject: {
        type: 'task',
        id: 'task_123',
        label: 'Fix AC at GBH-C8',
      },
      selection: {
        selectedIds: ['task_123', 'task_456'],
        cursorRange: 'rows 1-3',
        summary: null,
      },
      visibleState: {
        summary: 'Weekly schedule view with unassigned tasks visible.',
        activeTab: 'schedule',
        filters: { date: '2026-05-29', team: 'field', nested: 'visible only' },
        counts: { tasks: 18, unassigned: 3 },
      },
      allowedActions: ['create_task', 'assign_task', 'apply_schedule_after_approval'],
      privacyClass: 'staff_private',
      stalenessMs: 1500,
    });
  });

  test('infers context modules from page focus for shared right panel', () => {
    expect(_test.contextModulesFromFocus({
      module: 'ops',
      view: 'roster_planner',
      focusedObject: { type: 'task', id: 'task_1' },
    })).toEqual(['operations']);
    expect(_test.contextModulesFromFocus({
      route: '/fad?m=properties',
      focusedObject: { type: 'reservation', id: 'res_1' },
    })).toEqual(['properties', 'reservations']);
    expect(_test.contextModulesFromFocus({
      teamTarget: 'channel:ops',
      pageUrl: '/fad?m=team_inbox',
    })).toEqual(['team']);
  });

  test('parses TeamInbox focus targets for channel and DM context', () => {
    const channelId = '6c4c13d0-d780-4b1c-b2de-4051a9bdd555';
    const dmId = '8b8914d9-66cd-4bcc-ab3e-1266fae27c69';
    expect(_test.parseTeamTarget(`channel:${channelId}`)).toEqual({
      kind: 'channel',
      value: channelId,
      raw: `channel:${channelId}`,
    });
    expect(_test.parseTeamTarget('channel:ops')).toEqual({
      kind: 'channel',
      value: 'ops',
      raw: 'channel:ops',
    });
    expect(_test.parseTeamTarget(`dm:${dmId}`)).toEqual({
      kind: 'dm',
      value: dmId,
      raw: `dm:${dmId}`,
    });
    expect(_test.parseTeamTarget('dm:not-a-uuid')).toBeNull();
    expect(_test.parseTeamTarget('ops')).toBeNull();
    expect(_test.questionWantsDmContext('what did Mary DM me?')).toBe(true);
    expect(_test.questionWantsDmContext('what is in the ops channel?')).toBe(false);
  });

  test('surfaces operatorFocus in the model prompt body', () => {
    const focus = {
      module: 'inbox',
      threadId: 'web-8b8914d9-66cd-4bcc-ab3e-1266fae27c69',
      teamTarget: null,
      focusMessageId: null,
      pageUrl: null,
    };
    const payload = JSON.parse(_test.buildUserPrompt({
      question: 'Explain this AI handoff',
      scope: 'Inbox',
      focus,
      context: { requestedModules: ['inbox'], sections: [] },
    }));
    expect(payload.operatorFocus).toEqual(focus);
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

  test('declares live-only context truth and excluded fixture modules', () => {
    expect(_test.contextDataTruth()).toEqual(expect.objectContaining({
      mode: 'live-only',
      fixtureDataExcluded: true,
      excludedModules: expect.arrayContaining(['finance', 'calendar', 'training', 'notifications']),
    }));
  });

  test('maps page modules to Ask Friday Core surface ids', () => {
    expect(_test.coreSurfaceIdsForContext(
      ['operations', 'properties', 'team'],
      { surfaceId: 'fad_reservations_calendar_assistant' },
    )).toEqual([
      'fad_global_ask_friday',
      'fad_ops_assistant',
      'fad_properties_assistant',
      'fad_reservations_calendar_assistant',
    ]);
  });

  test('loads Ask Friday Core surface state for runtime governance context', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        surface_id: 'fad_global_ask_friday',
        display_name: 'Ask Friday',
        source_system: 'fad',
        access_class: 'staff',
        status: 'active',
        allowed_knowledge_scopes: ['fad_live_context'],
        allowed_tools: ['load_fad_context'],
        allowed_actions: ['create_task'],
        memory_policy: { durableMemory: 'approved_canonical_only' },
        handoff_policy: {},
        model_policy: {},
        context_budget: {},
        eval_suite_ids: ['fad_global'],
        draft_pack_id: null,
        draft_version: null,
        draft_status: null,
        draft_behavior_rules: null,
        draft_tool_policy: null,
        draft_memory_policy: null,
        draft_pack_payload: null,
        draft_approved_by: null,
        draft_approved_at: null,
        draft_published_at: null,
        draft_updated_at: null,
        published_pack_id: 'fad_global_ask_friday_v2',
        published_version: 2,
        published_status: 'published',
        published_behavior_rules: [{ id: 'source_truth', priority: 'must', rule: 'Use live FAD context.' }],
        published_tool_policy: { allowedTools: ['load_fad_context'] },
        published_memory_policy: { durableMemory: 'approved_canonical_only' },
        published_pack_payload: { contextPackClass: 'staff_global_v1', includedContext: ['live module context'] },
        published_approved_by: 'Ishant',
        published_approved_at: '2026-05-29T08:00:00.000Z',
        published_published_at: '2026-05-29T08:01:00.000Z',
        published_updated_at: '2026-05-29T08:01:00.000Z',
      }, {
        surface_id: 'fad_ops_assistant',
        display_name: 'Ops Assistant',
        source_system: 'fad',
        access_class: 'staff',
        status: 'active',
        allowed_knowledge_scopes: ['ops_tasks'],
        allowed_tools: ['load_calendar_context'],
        allowed_actions: ['request_approval'],
        memory_policy: {},
        handoff_policy: {},
        model_policy: {},
        context_budget: {},
        eval_suite_ids: ['ops_planning'],
        draft_pack_id: 'fad_ops_assistant_v1_draft',
        draft_version: 1,
        draft_status: 'draft',
        draft_behavior_rules: [{ id: 'occupancy', priority: 'must', rule: 'Respect occupied properties.' }],
        draft_tool_policy: { allowedActions: ['request_approval'] },
        draft_memory_policy: {},
        draft_pack_payload: { contextPackClass: 'staff_ops_shell', reviewBlockersBeforePublish: ['Ishant review'] },
        draft_approved_by: null,
        draft_approved_at: null,
        draft_published_at: null,
        draft_updated_at: '2026-05-29T08:05:00.000Z',
        published_pack_id: null,
        published_version: null,
        published_status: null,
        published_behavior_rules: null,
        published_tool_policy: null,
        published_memory_policy: null,
        published_pack_payload: null,
        published_approved_by: null,
        published_approved_at: null,
        published_published_at: null,
        published_updated_at: null,
      }],
    });

    const result = await _test.loadAskFridayCoreSurfaceState(
      '00000000-0000-0000-0000-000000000001',
      ['operations'],
      null,
    );

    expect(result).toMatchObject({
      ok: true,
      source: 'ask_friday_core',
      surfaceIds: ['fad_global_ask_friday', 'fad_ops_assistant'],
    });
    expect(result.surfaces).toEqual([
      expect.objectContaining({
        surfaceId: 'fad_global_ask_friday',
        contextPackStatus: 'published',
        latestPublished: expect.objectContaining({
          packId: 'fad_global_ask_friday_v2',
          behaviorRules: [expect.objectContaining({ id: 'source_truth' })],
        }),
      }),
      expect.objectContaining({
        surfaceId: 'fad_ops_assistant',
        contextPackStatus: 'draft',
        latestDraft: expect.objectContaining({
          packId: 'fad_ops_assistant_v1_draft',
          packPayload: expect.objectContaining({
            reviewBlockersBeforePublish: ['Ishant review'],
          }),
        }),
      }),
    ]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual([
      '00000000-0000-0000-0000-000000000001',
      ['fad_global_ask_friday', 'fad_ops_assistant'],
    ]);
  });

  test('selects module context from question and scope', () => {
    expect(_test.shouldLoad({ question: 'Any urgent maintenance?', scope: 'Operations' }, 'operations')).toBe(true);
    expect(_test.shouldLoad({ question: 'What are we discussing in TeamInbox about RC-16?', scope: 'All of FAD' }, 'team')).toBe(true);
    expect(_test.shouldLoad({ question: 'Summarize Villa Azur reviews', scope: 'All of FAD' }, 'reviews')).toBe(true);
    expect(_test.shouldLoad({ question: 'Who is on leave this week?', scope: 'HR' }, 'hr')).toBe(true);
    expect(_test.shouldLoad({ question: 'What is the design blocker?', scope: 'Design' }, 'design')).toBe(true);
  });

  test('broad all of FAD question loads every owned context family', () => {
    const modules = ['inbox', 'team', 'operations', 'hr', 'reviews', 'design', 'reservations', 'properties'];
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

  test('loads TeamInbox recent context through staff visibility gates', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          id: 'msg-channel-1',
          channel_id: 'channel-1',
          channel_key: 'ops',
          channel_name: 'Operations',
          visibility: 'public',
          author_display_name: 'Franny',
          text: 'Can someone check RC-16 before arrival?',
          kind: 'text',
          created_at: '2026-05-29T08:00:00.000Z',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'msg-dm-1',
          dm_id: 'dm-1',
          participant_count: 2,
          author_display_name: 'Mary',
          text: 'I already asked the guest for a Saturday slot.',
          kind: 'text',
          created_at: '2026-05-29T08:05:00.000Z',
        }],
      });

    const context = await _test.loadTeamContext(
      '00000000-0000-0000-0000-000000000001',
      { userId: '11111111-1111-4111-8111-111111111111' },
      null,
      { includeDms: true },
    );

    expect(context.policy).toContain('staff-only operational evidence');
    expect(context.sections).toEqual([
      expect.objectContaining({
        name: 'team_inbox_recent_channels',
        ok: true,
        data: [expect.objectContaining({
          kind: 'channel',
          channelKey: 'ops',
          excerpt: 'Can someone check RC-16 before arrival?',
        })],
      }),
      expect.objectContaining({
        name: 'team_inbox_recent_dms',
        ok: true,
        data: [expect.objectContaining({
          kind: 'dm',
          participantCount: 2,
          excerpt: 'I already asked the guest for a Saturday slot.',
        })],
      }),
    ]);
    expect(query.mock.calls[0][0]).toContain("(c.visibility = 'public' OR mem.user_id IS NOT NULL)");
    expect(query.mock.calls[1][0]).toContain('$2 = ANY(dm.participant_user_ids)');
  });

  test('skips recent DM context unless focused or explicitly requested', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const context = await _test.loadTeamContext(
      '00000000-0000-0000-0000-000000000001',
      { userId: '11111111-1111-4111-8111-111111111111' },
      null,
    );

    expect(context.sections[1]).toEqual(expect.objectContaining({
      name: 'team_inbox_recent_dms',
      ok: true,
      data: [],
      skipped: 'dm_context_requires_dm_focus_or_explicit_request',
    }));
    expect(query).toHaveBeenCalledTimes(1);
  });

  test('does not load private focused TeamInbox channels for non-members', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 'channel-private',
        channel_key: 'finance-private',
        name: 'Finance Private',
        visibility: 'private',
        is_member: false,
      }],
    });

    const focused = await _test.loadFocusedTeamContext(
      '00000000-0000-0000-0000-000000000001',
      { userId: '11111111-1111-4111-8111-111111111111' },
      { kind: 'channel', value: 'finance-private', raw: 'channel:finance-private' },
    );

    expect(focused).toEqual(expect.objectContaining({
      kind: 'channel',
      access: 'forbidden',
      channelKey: 'finance-private',
      visibility: 'private',
    }));
    expect(query).toHaveBeenCalledTimes(1);
  });

  test('loads focused TeamInbox channel messages when the staff member has access', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          id: 'channel-ops',
          channel_key: 'ops',
          name: 'Operations',
          visibility: 'private',
          is_member: true,
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'msg-2',
          channel_id: 'channel-ops',
          channel_key: 'ops',
          channel_name: 'Operations',
          visibility: 'private',
          author_display_name: 'Franny',
          text: 'Assign the plumbing check after guest checkout.',
          kind: 'text',
          created_at: '2026-05-29T08:10:00.000Z',
        }],
      });

    const focused = await _test.loadFocusedTeamContext(
      '00000000-0000-0000-0000-000000000001',
      { userId: '11111111-1111-4111-8111-111111111111' },
      { kind: 'channel', value: 'ops', raw: 'channel:ops' },
    );

    expect(focused).toEqual(expect.objectContaining({
      kind: 'channel',
      access: 'allowed',
      channelKey: 'ops',
      messages: [expect.objectContaining({
        excerpt: 'Assign the plumbing check after guest checkout.',
      })],
    }));
  });

  test('keeps enough output budget for Kimi K2.6 visible answers', () => {
    expect(_test.ASK_FRIDAY_MAX_TOKENS).toBeGreaterThanOrEqual(4096);
  });

  test('uses Gemini Flash by default with provider timeouts within the new generous nginx edge ceiling', () => {
    // 2026-05-23 — nginx /api/ proxy_read_timeout bumped 60s → 600s so
    // app-side timeouts can be generous. Provider timeout is allowed
    // up to 8 min (480s); auto-mode stays snappier (interactive) at
    // ≤90s. Both must stay strictly under the nginx ceiling so a
    // hanging model is still cut server-side (not by nginx 504).
    expect(_test.ASK_FRIDAY_MODEL).toBe('gemini-3.5-flash');
    expect(_test.ASK_FRIDAY_PROVIDER_TIMEOUT_MS).toBeLessThanOrEqual(540_000);
    expect(_test.ASK_FRIDAY_AUTO_PROVIDER_TIMEOUT_MS).toBeLessThanOrEqual(120_000);
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

  test('rejects direct execution when action risk does not match the registry', () => {
    expect(_test.actionPolicyError({
      type: 'create_task',
      risk: 'approval',
      label: 'Create risky task',
      module: 'operations',
      payload: { title: 'Change access code' },
    })).toContain('risk mismatch');

    expect(_test.actionPolicyError({
      type: 'request_approval',
      risk: 'approval',
      label: 'Request approval',
      module: 'reservations',
      payload: { actionType: 'reservation_change' },
    })).toBeNull();
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

  test('maps global Ask Friday loaded modules to Core knowledge scopes', () => {
    expect(_test.knowledgeScopesForAskFriday({
      requestedModules: ['inbox', 'team', 'operations', 'reservations', 'properties'],
    }, {
      sourcesUsed: ['team_messages', 'design'],
    })).toEqual([
      'fad_live_context',
      'staff_inbox',
      'ops_tasks',
      'reservations',
      'properties',
      'design_projects',
    ]);
  });

  test('filters learning-event knowledge scopes to the event surface allowlist', () => {
    expect(_test.knowledgeScopesForAskFriday({
      requestedModules: ['inbox', 'operations', 'properties'],
      askFridayCore: {
        surfaces: [{
          surfaceId: 'fad_global_ask_friday',
          allowedKnowledgeScopes: ['fad_live_context', 'ops_tasks'],
        }, {
          surfaceId: 'fad_consult',
          allowedKnowledgeScopes: ['staff_inbox', 'teachings', 'property_cards'],
        }],
      },
    }, {
      sourcesUsed: ['inbox', 'properties'],
    })).toEqual([
      'fad_live_context',
      'ops_tasks',
    ]);
  });
});

describe('FAD Ask Friday action execution', () => {
  beforeEach(() => {
    callTool.mockReset();
    recordActionRequest.mockReset();
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
    expect(recordActionRequest).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: '00000000-0000-0000-0000-000000000001',
      action: expect.objectContaining({
        sourceSystem: 'fad',
        surfaceId: 'fad_global_ask_friday',
        actionType: 'create_task',
        riskClass: 'low',
        status: 'executed',
        approvalRequired: false,
      }),
    }));
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

  test('does not execute approval-risk actions through safe tools', async () => {
    const res = await request(app())
      .post('/friday/actions/execute')
      .send({
        action: {
          type: 'create_task',
          risk: 'approval',
          label: 'Create access task',
          module: 'operations',
          payload: { title: 'Change a guest access code' },
        },
      })
      .expect(400);

    expect(callTool).not.toHaveBeenCalled();
    expect(res.body).toMatchObject({
      error: 'ask_friday_action_policy_rejected',
    });
  });
});
