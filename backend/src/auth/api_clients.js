'use strict';

// OAuth 2.0 client_credentials issuer + verifier for the /api/public/*
// surface. Per ADR-003 (locked 2026-05-18, roadmap §5.2.1).
//
// Two halves:
//
//   POST /api/auth/token  — form-encoded body, returns short-lived JWT
//     mounted in server.js below the body-parsing skip list since this
//     endpoint specifically wants application/x-www-form-urlencoded
//     (the OAuth 2.0 RFC 6749 §4.4 body shape).
//
//   attachApiClient middleware — verifies the JWT, attaches scopes +
//     tenant_id to req.apiClient. requireScope(name) is a small helper
//     to gate routes per-scope.
//
// JWT payload shape:
//   {
//     sub:       <client_id>,
//     scopes:    [...],
//     tenant_id: <uuid>,
//     iss:       'fad',
//     aud:       'fad-public-api',
//     iat, exp,  jti
//   }
//
// Signing: HMAC-SHA256 with process.env.JWT_SECRET (same as the FAD
// user-session JWT). Verifier accepts only this aud so user JWTs can't
// be used as API tokens and vice-versa.

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query } = require('../database/client');

const TOKEN_TTL_SECONDS = 900; // 15 min — the website caches 14 min.
const AUDIENCE = 'fad-public-api';
const ISSUER = 'fad';

// ────────────────────────────────────────────────────────────────────
// Token issuance route
// ────────────────────────────────────────────────────────────────────

const router = express.Router();

// This route MUST read x-www-form-urlencoded bodies per RFC 6749 §4.4.
// server.js mounts express.json() at the top level; we add urlencoded
// here so the same /api/auth/token handler can accept either shape.
router.use(express.urlencoded({ extended: false, limit: '8kb' }));
router.use(express.json({ limit: '8kb' }));

router.post('/', async (req, res) => {
  const body = req.body || {};
  const grantType = String(body.grant_type || '').toLowerCase();
  const clientId = String(body.client_id || '').trim();
  const clientSecret = String(body.client_secret || '').trim();
  const requestedScope = String(body.scope || '').trim();

  // Audit fields. Captured even on refusal so ops can grep abuse.
  const requestIp = req.ip || req.headers['x-forwarded-for'] || null;
  const requestUa = String(req.headers['user-agent'] || '').slice(0, 500);

  const refuse = async (status, code, reason) => {
    try {
      await query(
        `INSERT INTO api_client_audit (client_id, event, reason, request_ip, request_ua)
         VALUES ($1, 'token_refused', $2, $3, $4)`,
        [clientId || '<unknown>', reason || code, requestIp, requestUa],
      );
    } catch { /* audit best-effort */ }
    return res.status(status).json({ error: code, error_description: reason });
  };

  if (grantType !== 'client_credentials') {
    return refuse(400, 'unsupported_grant_type', 'only client_credentials is supported');
  }
  if (!clientId || !clientSecret) {
    return refuse(400, 'invalid_request', 'client_id and client_secret are required');
  }

  let row;
  try {
    const { rows } = await query(
      `SELECT id, client_id, client_secret_hash, tenant_id, scopes
         FROM api_clients
         WHERE client_id = $1 AND revoked_at IS NULL
         LIMIT 1`,
      [clientId],
    );
    row = rows[0];
  } catch (e) {
    console.error('[auth/token] db lookup failed:', e.message);
    return refuse(500, 'server_error', 'database unavailable');
  }
  if (!row) {
    return refuse(401, 'invalid_client', 'no matching active client');
  }

  let ok = false;
  try {
    ok = await bcrypt.compare(clientSecret, row.client_secret_hash);
  } catch (e) {
    console.error('[auth/token] bcrypt failed:', e.message);
    return refuse(500, 'server_error', 'credential verification failed');
  }
  if (!ok) {
    return refuse(401, 'invalid_client', 'client_secret mismatch');
  }

  // Scope filtering: if the caller requested a subset, intersect with
  // what's granted. Otherwise return everything granted.
  const grantedScopes = Array.isArray(row.scopes) ? row.scopes : [];
  const requested = requestedScope ? requestedScope.split(/\s+/).filter(Boolean) : grantedScopes;
  const finalScopes = requested.filter((s) => grantedScopes.includes(s));
  if (requestedScope && finalScopes.length === 0) {
    return refuse(400, 'invalid_scope', 'none of the requested scopes are granted');
  }

  if (!process.env.JWT_SECRET) {
    console.error('[auth/token] JWT_SECRET not configured');
    return refuse(500, 'server_error', 'token signing unavailable');
  }

  const jti = crypto.randomUUID();
  const accessToken = jwt.sign(
    {
      sub: row.client_id,
      scopes: finalScopes,
      tenant_id: row.tenant_id,
    },
    process.env.JWT_SECRET,
    {
      algorithm: 'HS256',
      issuer: ISSUER,
      audience: AUDIENCE,
      expiresIn: TOKEN_TTL_SECONDS,
      jwtid: jti,
    },
  );

  // Audit + last_used_at update — best-effort, doesn't block the response.
  query(
    `UPDATE api_clients SET last_used_at = NOW() WHERE id = $1`,
    [row.id],
  ).catch((e) => console.warn('[auth/token] last_used_at update failed:', e.message));
  query(
    `INSERT INTO api_client_audit (client_id, event, request_ip, request_ua, metadata)
     VALUES ($1, 'token_issued', $2, $3, $4)`,
    [row.client_id, requestIp, requestUa, JSON.stringify({ jti, scopes: finalScopes })],
  ).catch((e) => console.warn('[auth/token] audit insert failed:', e.message));

  res.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: TOKEN_TTL_SECONDS,
    scope: finalScopes.join(' '),
  });
});

// ────────────────────────────────────────────────────────────────────
// JWT verifier — middleware for /api/public/*
// ────────────────────────────────────────────────────────────────────

function attachApiClient(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'invalid_token', error_description: 'missing Bearer token' });
  }
  const token = auth.slice('Bearer '.length).trim();
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ error: 'server_error', error_description: 'token verification unavailable' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    req.apiClient = {
      clientId: decoded.sub,
      scopes: Array.isArray(decoded.scopes) ? decoded.scopes : [],
      tenantId: decoded.tenant_id,
      jti: decoded.jti,
    };
    next();
  } catch (e) {
    return res.status(401).json({
      error: 'invalid_token',
      error_description: e.name === 'TokenExpiredError' ? 'token expired' : 'token verification failed',
    });
  }
}

// Per-route scope check. Use as a second middleware after attachApiClient.
function requireScope(...required) {
  return (req, res, next) => {
    const have = req.apiClient?.scopes || [];
    for (const need of required) {
      if (!have.includes(need)) {
        return res.status(403).json({
          error: 'insufficient_scope',
          error_description: `missing scope: ${need}`,
          required: required,
          granted: have,
        });
      }
    }
    next();
  };
}

module.exports = { router, attachApiClient, requireScope };
