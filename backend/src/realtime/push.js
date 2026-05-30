'use strict';

const express = require('express');
const webpush = require('web-push');
const { query } = require('../database/client');
const { attachIdentity } = require('../design/auth');

const router = express.Router();

function vapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
}

function vapidPrivateKey() {
  return process.env.VAPID_PRIVATE_KEY || '';
}

function vapidSubject() {
  return process.env.VAPID_SUBJECT || process.env.VAPID_EMAIL || 'mailto:ops@friday.mu';
}

function configureWebPush() {
  const publicKey = vapidPublicKey();
  const privateKey = vapidPrivateKey();
  if (!publicKey || !privateKey) return false;
  try {
    webpush.setVapidDetails(vapidSubject(), publicKey, privateKey);
    return true;
  } catch (e) {
    console.warn('[push] invalid VAPID configuration:', e.message);
    return false;
  }
}

function pushConfigStatus() {
  const hasPublicKey = Boolean(vapidPublicKey());
  const hasPrivateKey = Boolean(vapidPrivateKey());
  return {
    hasPublicKey,
    configured: hasPublicKey && hasPrivateKey,
  };
}

function isValidSubscription(subscription) {
  return Boolean(
    subscription
    && typeof subscription.endpoint === 'string'
    && subscription.endpoint.length > 0
    && subscription.keys
    && typeof subscription.keys.p256dh === 'string'
    && subscription.keys.p256dh.length > 0
    && typeof subscription.keys.auth === 'string'
    && subscription.keys.auth.length > 0,
  );
}

router.get('/vapid-key', (_req, res) => {
  const status = pushConfigStatus();
  res.json({
    publicKey: vapidPublicKey(),
    configured: status.configured,
  });
});

router.post('/subscribe', attachIdentity, async (req, res) => {
  const subscription = req.body?.subscription || req.body;
  const endpoint = typeof subscription?.endpoint === 'string' ? subscription.endpoint : '';
  const keys = subscription?.keys || {};
  if (!isValidSubscription(subscription)) {
    return res.status(400).json({ error: 'valid push subscription endpoint and keys required' });
  }
  try {
    const { rows } = await query(
      `INSERT INTO push_subscriptions (
         tenant_id, user_id, endpoint, p256dh_key, auth_key, subscription, user_agent,
         last_seen_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, NOW(), NOW())
       ON CONFLICT (user_id, endpoint) DO UPDATE
         SET p256dh_key = EXCLUDED.p256dh_key,
             auth_key = EXCLUDED.auth_key,
             subscription = EXCLUDED.subscription,
             user_agent = EXCLUDED.user_agent,
             last_seen_at = NOW(),
             updated_at = NOW()
       RETURNING id, last_seen_at`,
      [
        req.tenantId,
        req.identity.userId,
        endpoint,
        typeof keys.p256dh === 'string' ? keys.p256dh : null,
        typeof keys.auth === 'string' ? keys.auth : null,
        JSON.stringify(subscription),
        req.get('user-agent') || null,
      ],
    );
    res.json({ ok: true, subscriptionId: rows[0]?.id, lastSeenAt: rows[0]?.last_seen_at });
  } catch (e) {
    console.error('[push] subscribe error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

async function sendPushToUsers({ tenantId, userIds, title, body = '', url = '/fad', tag = undefined, data = {} }) {
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  if (!tenantId || ids.length === 0) return { sent: 0, pruned: 0, failed: 0, subscriptions: 0, skipped: true, reason: 'no_targets' };
  if (!configureWebPush()) return { sent: 0, pruned: 0, failed: 0, subscriptions: 0, skipped: true, reason: 'not_configured' };
  const { rows } = await query(
    `SELECT id, endpoint, subscription
       FROM push_subscriptions
      WHERE tenant_id = $1
        AND user_id = ANY($2::uuid[])
        AND subscription IS NOT NULL`,
    [tenantId, ids],
  );
  if (rows.length === 0) {
    return { sent: 0, pruned: 0, failed: 0, subscriptions: 0, skipped: false, reason: 'no_subscriptions' };
  }
  let sent = 0;
  let pruned = 0;
  let failed = 0;
  await Promise.all(rows.map(async (row) => {
    if (!isValidSubscription(row.subscription)) {
      pruned += 1;
      await query(`DELETE FROM push_subscriptions WHERE id = $1`, [row.id]).catch(() => {});
      return;
    }
    const payload = JSON.stringify({
      title,
      body,
      url,
      tag,
      data,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
    });
    try {
      await webpush.sendNotification(row.subscription, payload, { TTL: 60 * 60 * 6 });
      sent += 1;
    } catch (e) {
      if (e.statusCode === 400 || e.statusCode === 404 || e.statusCode === 410) {
        pruned += 1;
        await query(`DELETE FROM push_subscriptions WHERE id = $1`, [row.id]).catch(() => {});
      } else {
        failed += 1;
        console.warn('[push] delivery failed:', e.statusCode || '', e.message);
      }
    }
  }));
  return { sent, pruned, failed, subscriptions: rows.length, skipped: false };
}

module.exports = { router, sendPushToUsers, _test: { isValidSubscription, pushConfigStatus } };
