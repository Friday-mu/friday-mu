'use strict';

process.env.JWT_SECRET = 'test-secret';

const express = require('express');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

jest.mock('../database/client', () => ({
  query: jest.fn(),
}));

jest.mock('../tenants/email', () => ({
  sendEmail: jest.fn(() => Promise.resolve()),
  tplPasswordReset: jest.fn(({ resetUrl }) => ({
    subject: 'Reset your Friday Admin password',
    html: resetUrl,
    text: resetUrl,
  })),
}));

const { query } = require('../database/client');
const { sendEmail } = require('../tenants/email');
const router = require('./session');
const { resolveFadRole, signUserToken, shapeUser } = require('./session');

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/auth', router);
  return a;
}

function user(overrides = {}) {
  return {
    id: 'user-1',
    username: 'ishant',
    email: 'ishant@friday.mu',
    password_hash: bcrypt.hashSync('Friday2026!', 10),
    role: 'admin',
    display_name: 'Ishant Ayadassen',
    tenant_id: 'tenant-1',
    is_active: true,
    must_change_password: false,
    ...overrides,
  };
}

describe('FAD-native session auth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('logs in against the local users table and mints a FAD JWT', async () => {
    query.mockResolvedValueOnce({ rows: [user()] });

    const res = await request(app())
      .post('/api/auth/login')
      .send({ username: 'ishant@friday.mu', password: 'Friday2026!' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.username).toBe('ishant@friday.mu');
    const payload = jwt.verify(res.body.token, 'test-secret');
    expect(payload.user_id).toBe('user-1');
    expect(payload.tenant_id).toBe('tenant-1');
  });

  test('rejects invalid local passwords with a generic error', async () => {
    query.mockResolvedValueOnce({ rows: [user()] });

    const res = await request(app())
      .post('/api/auth/login')
      .send({ username: 'ishant@friday.mu', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
  });

  test('auth/me verifies the JWT locally and refreshes the user row', async () => {
    const token = jwt.sign({ user_id: 'user-1' }, 'test-secret');
    query.mockResolvedValueOnce({ rows: [user({ display_name: 'Ishant Updated' })] });

    const res = await request(app())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.display_name).toBe('Ishant Updated');
    expect(res.body.email).toBe('ishant@friday.mu');
  });

  test('JWT carries the FAD-specific fad_role claim (drives PermissionsProvider)', async () => {
    query.mockResolvedValueOnce({ rows: [user({ fad_role: 'field' })] });
    const res = await request(app())
      .post('/api/auth/login')
      .send({ username: 'bryan@friday.mu', password: 'Friday2026!' });
    expect(res.status).toBe(200);
    const payload = jwt.verify(res.body.token, 'test-secret');
    expect(payload.fad_role).toBe('field');
    expect(res.body.fad_role).toBe('field');
  });

  test('fad_role falls back to coarse-role mapping when migration column is null', () => {
    expect(resolveFadRole({ role: 'admin', fad_role: null })).toBe('director');
    expect(resolveFadRole({ role: 'agent', fad_role: null })).toBe('field');
    expect(resolveFadRole({ role: 'agent', fad_role: 'ops_manager' })).toBe('ops_manager');
    // Unknown coarse role with no fad_role → safe minimum (field).
    expect(resolveFadRole({ role: 'unknown', fad_role: null })).toBe('field');
  });

  test('signUserToken and shapeUser both surface fad_role consistently', () => {
    const token = signUserToken(user({ fad_role: 'ops_manager' }));
    expect(jwt.verify(token, 'test-secret').fad_role).toBe('ops_manager');
    expect(shapeUser(user({ fad_role: 'commercial_marketing' })).fad_role).toBe('commercial_marketing');
  });

  test('account password reset request emails the authenticated user only', async () => {
    const token = jwt.sign({ user_id: 'user-1' }, 'test-secret');
    query
      .mockResolvedValueOnce({ rows: [user()] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app())
      .post('/api/auth/password-reset/me/request')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(query.mock.calls[1][0]).toContain('reset_token');
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'ishant@friday.mu' }));
  });
});
