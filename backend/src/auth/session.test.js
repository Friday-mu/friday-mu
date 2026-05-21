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

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/auth', router);
  return a;
}

function user(overrides = {}) {
  return {
    id: 'user-1',
    username: 'judith',
    email: 'judith@friday.mu',
    password_hash: bcrypt.hashSync('Friday2026!', 10),
    role: 'admin',
    display_name: 'Judith Friday',
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
      .send({ username: 'judith@friday.mu', password: 'Friday2026!' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.username).toBe('judith@friday.mu');
    const payload = jwt.verify(res.body.token, 'test-secret');
    expect(payload.user_id).toBe('user-1');
    expect(payload.tenant_id).toBe('tenant-1');
  });

  test('rejects invalid local passwords with a generic error', async () => {
    query.mockResolvedValueOnce({ rows: [user()] });

    const res = await request(app())
      .post('/api/auth/login')
      .send({ username: 'judith@friday.mu', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
  });

  test('auth/me verifies the JWT locally and refreshes the user row', async () => {
    const token = jwt.sign({ user_id: 'user-1' }, 'test-secret');
    query.mockResolvedValueOnce({ rows: [user({ display_name: 'Judith Updated' })] });

    const res = await request(app())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.display_name).toBe('Judith Updated');
    expect(res.body.email).toBe('judith@friday.mu');
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
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'judith@friday.mu' }));
  });
});
