'use strict';

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../database/client', () => ({
  query: jest.fn(),
}));
jest.mock('./draft_generator', () => ({
  triggerDraftGeneration: jest.fn(),
}));
jest.mock('./action_detector', () => ({
  detectActions: jest.fn(),
}));
jest.mock('./auto_resolve', () => ({
  checkAutoResolve: jest.fn(),
}));
jest.mock('../realtime', () => ({
  publishFadEvent: jest.fn(() => Promise.resolve()),
  notifyUsers: jest.fn(() => Promise.resolve()),
  resolveGmWatchers: jest.fn(() => Promise.resolve([])),
}));
jest.mock('../website_inbox/guesty', () => ({
  guestyRequest: jest.fn(),
}));

const { query } = require('../database/client');
const { triggerDraftGeneration } = require('./draft_generator');
const draftsRouter = require('./drafts_send');

const JWT_SECRET = 'draft-revise-test-secret';
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const DRAFT_ID = '33333333-3333-4333-8333-333333333333';
const MESSAGE_ID = '44444444-4444-4444-8444-444444444444';
const CONVERSATION_ID = '55555555-5555-4555-8555-555555555555';

function app() {
  const server = express();
  server.use(express.json());
  server.use('/api/inbox/drafts', draftsRouter);
  return server;
}

function token() {
  return jwt.sign({
    user_id: USER_ID,
    role: 'admin',
    username: 'ishant',
    display_name: 'Ishant Sagoo',
    tenant_id: TENANT_ID,
  }, JWT_SECRET);
}

function draftRow(overrides = {}) {
  return {
    id: DRAFT_ID,
    conversation_id: CONVERSATION_ID,
    message_id: MESSAGE_ID,
    draft_body: 'Current draft body',
    state: 'draft_ready',
    revision_number: 1,
    tenant_id: TENANT_ID,
    property_name: 'MV-1',
    conversation_tenant_id: TENANT_ID,
    ...overrides,
  };
}

describe('draft revise route', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    query.mockReset();
    triggerDraftGeneration.mockReset();
    triggerDraftGeneration.mockResolvedValue({ draftId: 'new-draft', state: 'draft_ready' });
  });

  test('records a revision request and starts FAD-native draft generation', async () => {
    query
      .mockResolvedValueOnce({ rows: [draftRow()] })
      .mockResolvedValueOnce({ rows: [{ id: MESSAGE_ID, direction: 'inbound' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app())
      .post(`/api/inbox/drafts/${DRAFT_ID}/revise`)
      .set('Authorization', `Bearer ${token()}`)
      .send({ revision_instruction: 'Make this warmer', mode: 'standard' })
      .expect(202);

    expect(res.body).toEqual({
      ok: true,
      previous_draft_id: DRAFT_ID,
      revision_number: 2,
      state: 'revision_requested',
    });
    expect(triggerDraftGeneration).toHaveBeenCalledWith(MESSAGE_ID, CONVERSATION_ID, {
      revisionInstruction: 'Make this warmer',
      revisionNumber: 2,
    });
    expect(query.mock.calls[2][0]).toContain("state = 'revision_requested'");
    expect(query.mock.calls[3][0]).toContain('INSERT INTO revision_log');
    expect(query.mock.calls[4][0]).toContain('INSERT INTO learning_events');
  });

  test('supersedes stale drafts instead of revising after a newer outbound message', async () => {
    query
      .mockResolvedValueOnce({ rows: [draftRow()] })
      .mockResolvedValueOnce({ rows: [{ id: '66666666-6666-4666-8666-666666666666', direction: 'outbound' }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app())
      .post(`/api/inbox/drafts/${DRAFT_ID}/revise`)
      .set('Authorization', `Bearer ${token()}`)
      .send({ revision_instruction: 'Make this shorter' })
      .expect(409);

    expect(res.body.error).toBe('draft_stale');
    expect(query.mock.calls[2][0]).toContain("state = 'superseded'");
    expect(triggerDraftGeneration).not.toHaveBeenCalled();
  });
});

describe('draft approve route', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    query.mockReset();
    triggerDraftGeneration.mockReset();
  });

  test('blocks and supersedes a stale draft before any Guesty send', async () => {
    query
      .mockResolvedValueOnce({
        rows: [draftRow({
          guesty_conversation_id: 'guesty-conversation-id',
          channel: 'airbnb',
          communication_channel: null,
          last_inbound_at: null,
          guest_name: 'Guest',
        })],
      })
      .mockResolvedValueOnce({ rows: [{ id: '66666666-6666-4666-8666-666666666666', direction: 'outbound' }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app())
      .post(`/api/inbox/drafts/${DRAFT_ID}/approve`)
      .set('Authorization', `Bearer ${token()}`)
      .send({ sent_via: 'airbnb' })
      .expect(409);

    expect(res.body.error).toBe('draft_stale');
    expect(query.mock.calls[2][0]).toContain("state = 'superseded'");
  });
});
