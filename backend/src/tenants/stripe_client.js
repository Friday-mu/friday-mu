'use strict';

// Thin Stripe API client — raw fetch against https://api.stripe.com/v1/.
// Deliberately avoids the official `stripe` npm dep so we don't carry
// the weight (and the transitive plaintext-version churn) until Ishant's
// Stripe account is live. Once we're live we can swap to the official
// SDK behind this interface.
//
// Auth: STRIPE_SECRET_KEY is the only required env. STRIPE_WEBHOOK_SECRET
// is read by verifyWebhookSignature; STRIPE_DESIGN_PRICE_ID by
// createSubscription / createCheckoutSession.
//
// Stub behaviour: if STRIPE_SECRET_KEY is unset, every method except
// verifyWebhookSignature logs a warning and returns null. The webhook
// handler can still verify signatures (it has its own secret) so the
// route is testable end-to-end against Stripe's CLI before billing
// goes live.

const crypto = require('node:crypto');

const STRIPE_API_BASE = 'https://api.stripe.com/v1';

// Stripe's webhook signature timestamp tolerance. 5 minutes matches both
// Stripe's own recommended default and the website_inbox webhook —
// generous enough for clock drift, tight enough that replays are
// impractical.
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

function _hasSecretKey() {
  return !!process.env.STRIPE_SECRET_KEY;
}

function _warnNoKey(method) {
  console.warn(
    `[stripe_client] STRIPE_SECRET_KEY unset — ${method} returning null. ` +
      `Set the env var to enable Stripe.`,
  );
}

function _authHeaders() {
  // Basic auth with secret-key as the username. Stripe accepts both
  // Bearer-style and Basic; Basic is what the official SDKs use.
  const token = Buffer.from(`${process.env.STRIPE_SECRET_KEY}:`).toString('base64');
  return {
    Authorization: `Basic ${token}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
}

// Stripe expects application/x-www-form-urlencoded with bracket-style
// nesting (metadata[tenant_id]=…). URLSearchParams handles the encoding;
// we just flatten one level of nesting for metadata.
function _encodeForm(params) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    if (typeof v === 'object' && !Array.isArray(v)) {
      for (const [nk, nv] of Object.entries(v)) {
        if (nv == null) continue;
        usp.append(`${k}[${nk}]`, String(nv));
      }
    } else if (Array.isArray(v)) {
      // line_items[0][price]=… style — caller passes flat keys with
      // brackets already; arrays unused at v0.
      v.forEach((entry, i) => {
        if (entry && typeof entry === 'object') {
          for (const [nk, nv] of Object.entries(entry)) {
            if (nv == null) continue;
            usp.append(`${k}[${i}][${nk}]`, String(nv));
          }
        } else {
          usp.append(`${k}[${i}]`, String(entry));
        }
      });
    } else {
      usp.append(k, String(v));
    }
  }
  return usp.toString();
}

async function _stripeRequest(method, path, body) {
  const url = `${STRIPE_API_BASE}${path}`;
  const init = { method, headers: _authHeaders() };
  if (body) init.body = _encodeForm(body);
  const res = await fetch(url, init);
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* swallow */ }
  if (!res.ok) {
    const msg = parsed?.error?.message || `Stripe ${method} ${path} → ${res.status}`;
    console.error('[stripe_client] request failed:', msg);
    const err = new Error(msg);
    err.status = res.status;
    err.stripe = parsed;
    throw err;
  }
  return parsed;
}

// ─────────────────────────── customers ──────────────────────────────

async function createCustomer({ tenant }) {
  if (!_hasSecretKey()) { _warnNoKey('createCustomer'); return null; }
  if (!tenant) throw new Error('createCustomer: tenant is required');
  const billingEmail = tenant.billing_email || null;
  const data = await _stripeRequest('POST', '/customers', {
    name: tenant.name,
    email: billingEmail,
    metadata: { tenant_id: tenant.id, tenant_slug: tenant.slug },
  });
  return data?.id || null;
}

// ─────────────────────────── subscriptions ──────────────────────────

async function createSubscription({ customerId, priceId }) {
  if (!_hasSecretKey()) { _warnNoKey('createSubscription'); return null; }
  if (!customerId) throw new Error('createSubscription: customerId is required');
  const price = priceId || process.env.STRIPE_DESIGN_PRICE_ID;
  if (!price) throw new Error('createSubscription: STRIPE_DESIGN_PRICE_ID unset and no priceId override given');
  // Stripe accepts `items[0][price]=…` — encode via the array branch.
  const data = await _stripeRequest('POST', '/subscriptions', {
    customer: customerId,
    items: [{ price }],
  });
  return data;
}

async function cancelSubscription({ subscriptionId }) {
  if (!_hasSecretKey()) { _warnNoKey('cancelSubscription'); return null; }
  if (!subscriptionId) throw new Error('cancelSubscription: subscriptionId is required');
  const data = await _stripeRequest('DELETE', `/subscriptions/${encodeURIComponent(subscriptionId)}`);
  return data;
}

// ─────────────────────────── checkout + portal ──────────────────────

// Hosted checkout session — preferred onboarding flow for tenants
// switching from bank_transfer to Stripe. Returns the session object
// (caller extracts `.url`).
async function createCheckoutSession({ customerId, priceId, successUrl, cancelUrl }) {
  if (!_hasSecretKey()) { _warnNoKey('createCheckoutSession'); return null; }
  if (!customerId) throw new Error('createCheckoutSession: customerId is required');
  const price = priceId || process.env.STRIPE_DESIGN_PRICE_ID;
  if (!price) throw new Error('createCheckoutSession: STRIPE_DESIGN_PRICE_ID unset');
  if (!successUrl || !cancelUrl) {
    throw new Error('createCheckoutSession: successUrl and cancelUrl are required');
  }
  const data = await _stripeRequest('POST', '/checkout/sessions', {
    mode: 'subscription',
    customer: customerId,
    success_url: successUrl,
    cancel_url: cancelUrl,
    line_items: [{ price, quantity: 1 }],
  });
  return data;
}

// Self-service billing portal — lets the tenant manage card / invoice
// history / cancellation without a support touch.
async function createBillingPortalSession({ customerId, returnUrl }) {
  if (!_hasSecretKey()) { _warnNoKey('createBillingPortalSession'); return null; }
  if (!customerId) throw new Error('createBillingPortalSession: customerId is required');
  if (!returnUrl) throw new Error('createBillingPortalSession: returnUrl is required');
  const data = await _stripeRequest('POST', '/billing_portal/sessions', {
    customer: customerId,
    return_url: returnUrl,
  });
  return data;
}

// ─────────────────────────── webhook verification ───────────────────

// Stripe signs each webhook with the format:
//   t=<unix-timestamp>,v1=<hex-signature>[,v0=<legacy-hex>]
// The signed payload is `${timestamp}.${rawBody}`, HMAC-SHA256 keyed
// by STRIPE_WEBHOOK_SECRET. Multiple v1 entries are possible during
// secret rotation; any match is sufficient.
//
// We accept an optional `now` argument so tests can pin time.
function verifyWebhookSignature(rawBody, signatureHeader, secret, opts = {}) {
  if (!secret) return false;
  if (!signatureHeader || typeof signatureHeader !== 'string') return false;

  // Parse the comma-separated header. Stripe-CLI prefixes with whitespace
  // sometimes — trim defensively.
  const parts = signatureHeader.split(',').map((p) => p.trim());
  let timestamp = null;
  const v1Signatures = [];
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq);
    const value = part.slice(eq + 1);
    if (key === 't') timestamp = value;
    else if (key === 'v1') v1Signatures.push(value);
  }
  if (!timestamp || v1Signatures.length === 0) return false;

  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) return false;

  // Replay window. Stripe sends seconds, not ms.
  const nowSec = opts.now != null ? Math.floor(opts.now / 1000) : Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - tsNum) > WEBHOOK_TOLERANCE_SECONDS) return false;

  // Body must be the raw bytes Stripe signed; re-serialising via
  // JSON.stringify after express.json() would break the signature.
  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedPayload, 'utf8')
    .digest('hex');

  // Constant-time compare against every offered v1. Stripe rotates by
  // sending multiple v1 entries during the overlap window; any one
  // matching is success.
  const expectedBuf = Buffer.from(expected, 'hex');
  for (const candidate of v1Signatures) {
    let candidateBuf;
    try { candidateBuf = Buffer.from(candidate, 'hex'); } catch { continue; }
    if (candidateBuf.length !== expectedBuf.length) continue;
    if (crypto.timingSafeEqual(candidateBuf, expectedBuf)) return true;
  }
  return false;
}

module.exports = {
  createCustomer,
  createSubscription,
  cancelSubscription,
  createCheckoutSession,
  createBillingPortalSession,
  verifyWebhookSignature,
  // Exposed for diagnostics; never called by route code.
  _internal: { STRIPE_API_BASE, WEBHOOK_TOLERANCE_SECONDS },
};
