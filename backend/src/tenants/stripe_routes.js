'use strict';

// Stripe billing routes.
//
// Three surfaces:
//   POST /api/tenants/stripe/webhook            ← public (Stripe-signed)
//   POST /api/tenants/me/stripe/checkout-session ← tenant admin auth
//   POST /api/tenants/me/stripe/portal-session   ← tenant admin auth
//
// The webhook needs the RAW request body to verify Stripe's signature,
// so server.js excludes its path from the global express.json() parser
// (same trick as the website-inbox webhook). It mounts its own
// express.raw() locally.
//
// Checkout + portal sessions are gated by attachIdentity + admin role.
// Both routes 503 with a friendly stub message if STRIPE_SECRET_KEY is
// unset — the rest of the plumbing still loads + verifies fine without
// a key, so the route shell stays callable in dev.

const express = require('express');
const { query } = require('../database/client');
const { attachIdentity } = require('../design/auth');
const {
  createCustomer,
  createCheckoutSession,
  createBillingPortalSession,
  verifyWebhookSignature,
} = require('./stripe_client');
const { invalidateSubscriptionCache } = require('./middleware');

const router = express.Router();

const STUB_503_MESSAGE =
  'Stripe is not yet enabled on this environment. ' +
  'Set STRIPE_SECRET_KEY and STRIPE_DESIGN_PRICE_ID in backend/.env to go live.';

// ─────────────────────────── webhook (public) ───────────────────────

// POST /api/tenants/stripe/webhook
//
// Stripe-signed webhook receiver. Express.raw() is mounted locally so
// req.body is the raw bytes — verifyWebhookSignature needs them intact.
// We respond 200 quickly so Stripe doesn't retry on slow handlers; if
// something downstream fails (DB blip), we still log + return 200 to
// avoid a poison-pill retry loop. Stripe events are durable on their
// side, so a missed event can be replayed manually from the dashboard.
router.post('/stripe/webhook',
  express.raw({ type: 'application/json', limit: '1mb' }),
  async (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    if (!rawBody) {
      return res.status(400).json({ error: 'empty body' });
    }
    const signature = req.header('Stripe-Signature') || req.header('stripe-signature');
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      console.warn('[stripe_routes/webhook] STRIPE_WEBHOOK_SECRET unset — rejecting');
      return res.status(503).json({ error: STUB_503_MESSAGE });
    }
    if (!verifyWebhookSignature(rawBody, signature, secret)) {
      console.warn('[stripe_routes/webhook] signature verification failed');
      return res.status(400).json({ error: 'invalid signature' });
    }

    let event;
    try { event = JSON.parse(rawBody); }
    catch { return res.status(400).json({ error: 'invalid JSON' }); }

    // Hand the parsed event to the dispatcher; never throw past this
    // point — any error becomes a 200-with-log so Stripe doesn't retry.
    try {
      await _handleStripeEvent(event);
    } catch (e) {
      console.error('[stripe_routes/webhook] handler error:', e.message, '(event type:', event?.type, ')');
    }
    return res.status(200).json({ received: true });
  },
);

// Dispatch a Stripe event to the right side-effect. Each case is
// best-effort — we log every event and tolerate "row not found" silently
// (a webhook for a stripe_customer_id we don't know about means our
// customer-creation path hasn't run yet; nothing to do).
async function _handleStripeEvent(event) {
  console.log(`[stripe_routes/webhook] received event ${event?.id || '?'} type=${event?.type}`);
  const obj = event?.data?.object || {};

  switch (event?.type) {
    case 'customer.subscription.updated': {
      // obj.status: 'active' | 'past_due' | 'canceled' | …
      const customerId = obj.customer;
      const subscriptionId = obj.id;
      const stripeStatus = obj.status;
      if (!customerId) return;
      // Map Stripe's status vocabulary to our tenants.subscription_status
      // CHECK constraint vocabulary. We treat 'active' + 'trialing' both
      // as 'active' on our side; everything else falls through.
      let mapped = null;
      if (stripeStatus === 'active' || stripeStatus === 'trialing') mapped = 'active';
      else if (stripeStatus === 'past_due' || stripeStatus === 'unpaid') mapped = 'past_due';
      else if (stripeStatus === 'canceled' || stripeStatus === 'incomplete_expired') mapped = 'cancelled';

      const sets = ['stripe_subscription_id = $2', 'updated_at = NOW()'];
      const vals = [customerId, subscriptionId];
      if (mapped) {
        sets.unshift(`subscription_status = $${vals.length + 1}`);
        vals.push(mapped);
      }
      const result = await query(
        `UPDATE tenants SET ${sets.join(', ')} WHERE stripe_customer_id = $1 RETURNING id`,
        vals,
      );
      if (result.rowCount > 0) {
        invalidateSubscriptionCache(result.rows[0].id);
      }
      return;
    }

    case 'customer.subscription.deleted': {
      const customerId = obj.customer;
      if (!customerId) return;
      const result = await query(
        `UPDATE tenants
            SET subscription_status = 'cancelled',
                updated_at = NOW()
          WHERE stripe_customer_id = $1
          RETURNING id`,
        [customerId],
      );
      if (result.rowCount > 0) {
        invalidateSubscriptionCache(result.rows[0].id);
      }
      return;
    }

    case 'invoice.paid': {
      const stripeInvoiceId = obj.id;
      if (!stripeInvoiceId) return;
      await query(
        `UPDATE invoices
            SET status = 'paid',
                paid_at = NOW(),
                paid_by = $2,
                updated_at = NOW()
          WHERE stripe_invoice_id = $1
            AND status <> 'paid'`,
        [stripeInvoiceId, `stripe:${stripeInvoiceId}`],
      );
      return;
    }

    case 'invoice.payment_failed': {
      const stripeInvoiceId = obj.id;
      const customerId = obj.customer;
      if (stripeInvoiceId) {
        await query(
          `UPDATE invoices
              SET status = 'overdue',
                  updated_at = NOW()
            WHERE stripe_invoice_id = $1
              AND status NOT IN ('paid','void')`,
          [stripeInvoiceId],
        );
      }
      if (customerId) {
        const result = await query(
          `UPDATE tenants
              SET subscription_status = 'past_due',
                  updated_at = NOW()
            WHERE stripe_customer_id = $1
            RETURNING id`,
          [customerId],
        );
        if (result.rowCount > 0) {
          invalidateSubscriptionCache(result.rows[0].id);
        }
      }
      return;
    }

    default:
      // We only handle the four event types we subscribe to. Anything
      // else is logged + acked so Stripe doesn't retry; if we start
      // caring about new events, add a case here.
      return;
  }
}

// ─────────────────────────── checkout (auth) ────────────────────────

function _requireAdmin(req, res) {
  if (req.identity?.userRole !== 'admin') {
    res.status(403).json({ error: 'Forbidden — admin role required' });
    return false;
  }
  return true;
}

async function _getOrCreateStripeCustomer(tenantId) {
  const { rows } = await query(`SELECT * FROM tenants WHERE id = $1`, [tenantId]);
  if (rows.length === 0) return { error: 'tenant not found' };
  const tenant = rows[0];
  if (tenant.stripe_customer_id) {
    return { tenant, customerId: tenant.stripe_customer_id, created: false };
  }
  // Lazily create on first checkout. createCustomer returns null when
  // STRIPE_SECRET_KEY is unset; callers handle that as 503.
  const customerId = await createCustomer({ tenant });
  if (!customerId) return { tenant, customerId: null, created: false };
  await query(
    `UPDATE tenants SET stripe_customer_id = $1, updated_at = NOW() WHERE id = $2`,
    [customerId, tenantId],
  );
  return { tenant, customerId, created: true };
}

function _frontendUrl() {
  return process.env.FRONTEND_URL || 'http://localhost:3000';
}

// POST /api/tenants/me/stripe/checkout-session
router.post('/me/stripe/checkout-session', attachIdentity, async (req, res) => {
  if (!_requireAdmin(req, res)) return;
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({ error: STUB_503_MESSAGE });
  }
  try {
    const got = await _getOrCreateStripeCustomer(req.tenantId);
    if (got.error) return res.status(404).json({ error: got.error });
    if (!got.customerId) return res.status(503).json({ error: STUB_503_MESSAGE });

    const baseUrl = _frontendUrl();
    const session = await createCheckoutSession({
      customerId: got.customerId,
      // priceId picked up from STRIPE_DESIGN_PRICE_ID env in the client.
      successUrl: `${baseUrl}/fad?stripe=success`,
      cancelUrl: `${baseUrl}/fad?stripe=cancelled`,
    });
    if (!session?.url) {
      return res.status(502).json({ error: 'Stripe returned no checkout URL' });
    }
    return res.json({ checkout_url: session.url });
  } catch (e) {
    console.error('[stripe_routes/checkout-session] error:', e.message);
    return res.status(e.status || 500).json({ error: e.message });
  }
});

// POST /api/tenants/me/stripe/portal-session
router.post('/me/stripe/portal-session', attachIdentity, async (req, res) => {
  if (!_requireAdmin(req, res)) return;
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({ error: STUB_503_MESSAGE });
  }
  try {
    const { rows } = await query(
      `SELECT stripe_customer_id FROM tenants WHERE id = $1`,
      [req.tenantId],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'tenant not found' });
    const customerId = rows[0].stripe_customer_id;
    if (!customerId) {
      return res.status(409).json({
        error: 'no_stripe_customer',
        message: 'Tenant has no Stripe customer yet — run checkout first.',
      });
    }
    const session = await createBillingPortalSession({
      customerId,
      returnUrl: `${_frontendUrl()}/fad`,
    });
    if (!session?.url) {
      return res.status(502).json({ error: 'Stripe returned no portal URL' });
    }
    return res.json({ portal_url: session.url });
  } catch (e) {
    console.error('[stripe_routes/portal-session] error:', e.message);
    return res.status(e.status || 500).json({ error: e.message });
  }
});

module.exports = router;
