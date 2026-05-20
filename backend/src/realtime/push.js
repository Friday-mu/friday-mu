'use strict';

const express = require('express');
const { query } = require('../database/client');
const { attachIdentity } = require('../design/auth');

const router = express.Router();

router.get('/vapid-key', (_req, res) => {
  res.json({
    publicKey: process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '',
  });
});

router.post('/subscribe', attachIdentity, async (req, res) => {
  const subscription = req.body?.subscription || req.body;
  const endpoint = typeof subscription?.endpoint === 'string' ? subscription.endpoint : '';
  const keys = subscription?.keys || {};
  if (!endpoint) {
    return res.status(400).json({ error: 'subscription.endpoint required' });
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

module.exports = { router };
