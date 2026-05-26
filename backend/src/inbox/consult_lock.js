'use strict';

const crypto = require('node:crypto');
const { query } = require('../database/client');

const DEFAULT_SCOPE = 'consult_turn';
const DEFAULT_TTL_MS = Number(process.env.CONSULT_LOCK_TTL_MS) || 20 * 60 * 1000;
const DEFAULT_WAIT_MS = Number(process.env.CONSULT_LOCK_WAIT_MS) || 90 * 1000;
const DEFAULT_POLL_MS = Number(process.env.CONSULT_LOCK_POLL_MS) || 750;
const DEFAULT_HEARTBEAT_MS = Number(process.env.CONSULT_LOCK_HEARTBEAT_MS) || 60 * 1000;

function delay(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

function lockToken() {
  return `consult_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

function cleanLockPart(value, fallback) {
  const text = String(value || '').trim();
  return (text || fallback).slice(0, 240);
}

function normalizeLockKey(conversationId) {
  return cleanLockPart(conversationId, '__global__');
}

function lockTimeoutError(lockKey) {
  const err = new Error(`Consult conversation is busy: ${lockKey}`);
  err.status = 409;
  return err;
}

function ttlSeconds(ttlMs) {
  return Math.max(30, Math.ceil(Number(ttlMs || DEFAULT_TTL_MS) / 1000));
}

async function tryAcquire({ tenantId, lockKey, scope, holderToken, holderRef, ttlMs, metadata }) {
  const { rows } = await query(
    `INSERT INTO consult_conversation_locks (
       tenant_id, lock_key, lock_scope, holder_token, holder_ref,
       acquired_at, heartbeat_at, expires_at, metadata
     ) VALUES (
       $1, $2, $3, $4, $5,
       NOW(), NOW(), NOW() + ($6::int * INTERVAL '1 second'), $7::jsonb
     )
     ON CONFLICT (tenant_id, lock_key, lock_scope) DO UPDATE SET
       holder_token = EXCLUDED.holder_token,
       holder_ref = EXCLUDED.holder_ref,
       acquired_at = NOW(),
       heartbeat_at = NOW(),
       expires_at = EXCLUDED.expires_at,
       metadata = EXCLUDED.metadata
     WHERE consult_conversation_locks.expires_at < NOW()
     RETURNING holder_token`,
    [
      tenantId,
      lockKey,
      scope,
      holderToken,
      holderRef,
      ttlSeconds(ttlMs),
      JSON.stringify(metadata || {}),
    ],
  );
  return rows.length > 0;
}

async function releaseLock({ tenantId, lockKey, scope, holderToken }) {
  await query(
    `DELETE FROM consult_conversation_locks
      WHERE tenant_id = $1
        AND lock_key = $2
        AND lock_scope = $3
        AND holder_token = $4`,
    [tenantId, lockKey, scope, holderToken],
  );
}

async function heartbeatLock({ tenantId, lockKey, scope, holderToken, ttlMs }) {
  await query(
    `UPDATE consult_conversation_locks
        SET heartbeat_at = NOW(),
            expires_at = NOW() + ($5::int * INTERVAL '1 second')
      WHERE tenant_id = $1
        AND lock_key = $2
        AND lock_scope = $3
        AND holder_token = $4`,
    [tenantId, lockKey, scope, holderToken, ttlSeconds(ttlMs)],
  );
}

async function withConsultConversationLease(options, fn) {
  const tenantId = options?.tenantId;
  if (!tenantId) throw new Error('tenantId is required for Consult lock');
  const lockKey = normalizeLockKey(options.conversationId);
  const scope = cleanLockPart(options.scope, DEFAULT_SCOPE);
  const holderToken = lockToken();
  const holderRef = cleanLockPart(options.holderRef, process.pid ? `pid:${process.pid}` : 'fad-backend');
  const ttlMs = Number(options.ttlMs) || DEFAULT_TTL_MS;
  const waitMs = Number(options.waitMs) || DEFAULT_WAIT_MS;
  const pollMs = Number(options.pollMs) || DEFAULT_POLL_MS;
  const deadline = Date.now() + waitMs;

  while (true) {
    if (await tryAcquire({
      tenantId,
      lockKey,
      scope,
      holderToken,
      holderRef,
      ttlMs,
      metadata: options.metadata,
    })) {
      break;
    }
    if (Date.now() >= deadline) throw lockTimeoutError(lockKey);
    await delay(pollMs);
  }

  let heartbeatTimer = null;
  const heartbeatMs = Math.min(Math.max(DEFAULT_HEARTBEAT_MS, 10_000), Math.max(ttlMs / 2, 10_000));
  if (heartbeatMs > 0) {
    heartbeatTimer = setInterval(() => {
      heartbeatLock({ tenantId, lockKey, scope, holderToken, ttlMs })
        .catch((e) => console.warn('[consult-lock] heartbeat failed:', e.message));
    }, heartbeatMs);
    heartbeatTimer.unref?.();
  }

  try {
    return await fn();
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    await releaseLock({ tenantId, lockKey, scope, holderToken }).catch((e) => {
      console.warn('[consult-lock] release failed:', e.message);
    });
  }
}

module.exports = {
  withConsultConversationLease,
  _test: {
    heartbeatLock,
    lockTimeoutError,
    normalizeLockKey,
    releaseLock,
    tryAcquire,
    ttlSeconds,
  },
};
