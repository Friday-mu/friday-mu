'use strict';

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../database/client', () => ({
  query: jest.fn(),
}));
jest.mock('../ai/translate', () => ({
  translateText: jest.fn(),
}));
jest.mock('../realtime', () => ({
  publishFadEvent: jest.fn(() => Promise.resolve()),
}));

const { query } = require('../database/client');
const { translateText } = require('../ai/translate');
const conversationsRouter = require('./conversations_read');

const JWT_SECRET = 'conversation-translate-test-secret';
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const CONVERSATION_ID = '55555555-5555-4555-8555-555555555555';

function app() {
  const server = express();
  server.use(express.json());
  server.use('/api/inbox/conversations', conversationsRouter);
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

describe('conversation translate route', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    query.mockReset();
    translateText.mockReset();
  });

  test('translates conversation messages through the FAD translation helper', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: CONVERSATION_ID, tenant_id: TENANT_ID }] })
      .mockResolvedValueOnce({
        rows: [
          { id: 'msg-1', body: 'Bonjour', original_language: null, translated_body: null, direction: 'inbound' },
          { id: 'msg-2', body: 'Hello', original_language: null, translated_body: null, direction: 'outbound' },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    translateText
      .mockResolvedValueOnce({ sourceLang: 'fr', translated: 'Hello', cached: false })
      .mockResolvedValueOnce({ sourceLang: 'en', translated: 'Hello', cached: false });

    const res = await request(app())
      .post(`/api/inbox/conversations/${CONVERSATION_ID}/translate`)
      .set('Authorization', `Bearer ${token()}`)
      .send({})
      .expect(200);

    expect(res.body.translated_count).toBe(2);
    expect(res.body.messages[0]).toMatchObject({
      id: 'msg-1',
      original_language: 'fr',
      translated_body: 'Hello',
    });
    expect(res.body.messages[1]).toMatchObject({
      id: 'msg-2',
      original_language: 'en',
      translated_body: null,
    });
    expect(translateText).toHaveBeenCalledWith('Bonjour', {
      conversationId: CONVERSATION_ID,
      sourceLang: undefined,
      cacheKey: 'message:msg-1',
    });
    expect(query.mock.calls[2][0]).toContain('UPDATE messages');
    expect(query.mock.calls[4][0]).toContain('UPDATE conversations');
  });
});

describe('conversation list route', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    query.mockReset();
    translateText.mockReset();
  });

  test('only surfaces actionable drafts tied to the latest inbound message', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await request(app())
      .get('/api/inbox/conversations')
      .set('Authorization', `Bearer ${token()}`)
      .expect(200);

    const sql = query.mock.calls[0][0];
    expect(sql).toContain("d.state IN ('draft_ready', 'under_review', 'friday_drafting', 'generation_failed', 'send_queued', 'send_failed')");
    expect(sql).toContain("draft_message.direction = 'inbound'");
    expect(sql).toContain('COALESCE(draft_message.is_auto_response, false) = false');
    expect(sql).toContain('COALESCE(newer_message.is_auto_response, false) = false');
    expect(sql).toContain('newer_message');
  });
});
