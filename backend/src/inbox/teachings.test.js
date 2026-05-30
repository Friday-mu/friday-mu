'use strict';

const express = require('express');
const request = require('supertest');

jest.mock('../database/client', () => ({ query: jest.fn() }));
jest.mock('../design/auth', () => ({
  attachIdentity: (req, _res, next) => {
    req.identity = {
      userId: '99999999-9999-4999-8999-999999999999',
      displayName: 'Ishant',
      username: 'ishant@friday.mu',
    };
    req.tenantId = '00000000-0000-0000-0000-000000000001';
    next();
  },
}));

const { query } = require('../database/client');
const teachingsRouter = require('./teachings');

function app() {
  const server = express();
  server.use(express.json());
  server.use('/api/inbox/teachings', teachingsRouter);
  return server;
}

describe('inbox teachings router', () => {
  beforeEach(() => {
    query.mockReset();
  });

  test('creates teachings with typed placeholders for actor fields', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 'teaching-1',
        instruction: 'Always greet guests before giving the answer.',
        scope: 'global',
        property_code: null,
        property_codes: null,
        source: 'friday_consult',
        status: 'active',
        taught_by: 'Ishant',
        approved_by: 'Ishant',
        evidence_count: 1,
        confidence: 1,
        polarity: 'positive',
      }],
    });

    const res = await request(app())
      .post('/api/inbox/teachings')
      .send({
        instruction: 'Always greet guests before giving the answer.',
        scope: 'global',
        source: 'friday_consult',
      })
      .expect(201);

    expect(res.body.teaching).toMatchObject({
      instruction: 'Always greet guests before giving the answer.',
      status: 'active',
    });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('$5::text[]');
    expect(sql).toContain('$7::text, NOW(), NOW(), $8::text');
    expect(sql).toContain('1, 1, $9::text');
    expect(params).toEqual([
      '00000000-0000-0000-0000-000000000001',
      'Always greet guests before giving the answer.',
      'global',
      null,
      null,
      'friday_consult',
      'Ishant',
      'Ishant',
      'positive',
    ]);
  });

  test('normalises unknown teaching sources to direct but preserves Friday Consult', () => {
    expect(teachingsRouter._test.normaliseSource('friday_consult')).toBe('friday_consult');
    expect(teachingsRouter._test.normaliseSource(' manual ')).toBe('manual');
    expect(teachingsRouter._test.normaliseSource('random-ui-source')).toBe('direct');
    expect(teachingsRouter._test.normaliseSource(null)).toBe('direct');
  });
});
