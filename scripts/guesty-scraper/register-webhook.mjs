#!/usr/bin/env node
// One-shot: register/repoint our Guesty webhook via the Open API.
//
// Why this exists: registering or updating a webhook can only be done
// via the API (Guesty UI is read-only for webhook config per support).
// Run this once after the OAuth token-mint quota recovers.
//
// Behavior:
//   1. Mints an OAuth token using GUESTY_CLIENT_ID / GUESTY_CLIENT_SECRET.
//   2. Lists existing webhooks. If one already points at our target URL,
//      it just enables it + updates events. Otherwise it picks the
//      legacy `judiths-mac-mini` one (or any disabled one) and rewrites it.
//      Falls back to POST /webhooks (create) if nothing reusable.
//   3. Fetches the Svix secret (`whsec_…`) for the endpoint and prints it.
//
// Usage:
//   GUESTY_CLIENT_ID=... GUESTY_CLIENT_SECRET=... \
//     TARGET_URL=https://admin.friday.mu/api/integrations/guesty/webhook \
//     node scripts/guesty-scraper/register-webhook.mjs
//
// On the VPS, the env vars are already in /var/www/fad-backend/.env —
// `set -a && . /var/www/fad-backend/.env && set +a && node …` works.

const CLIENT_ID = process.env.GUESTY_CLIENT_ID;
const CLIENT_SECRET = process.env.GUESTY_CLIENT_SECRET;
const BASE_URL = process.env.GUESTY_BASE_URL || 'https://open-api.guesty.com/v1';
const TOKEN_URL = process.env.GUESTY_TOKEN_URL || 'https://open-api.guesty.com/oauth2/token';
const TARGET_URL = process.env.TARGET_URL || 'https://admin.friday.mu/api/integrations/guesty/webhook';
const EVENTS = (process.env.EVENTS || 'reservation.messageReceived,reservation.messageSent,reservation.created,reservation.updated,reservation.canceled').split(',').map((s) => s.trim()).filter(Boolean);

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing GUESTY_CLIENT_ID / GUESTY_CLIENT_SECRET. Source the .env first.');
  process.exit(1);
}

function logErr(label, e) {
  console.error(`[${label}] ${e?.message || e}`);
  if (e?.response) console.error(`  status=${e.response.status} body=${JSON.stringify(e.response.data).slice(0, 400)}`);
}

async function mintToken() {
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: 'open-api',
  });
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const body = await r.text();
  if (!r.ok) throw new Error(`token mint ${r.status} ${body.slice(0, 200)}`);
  const data = JSON.parse(body);
  if (!data.access_token) throw new Error(`no access_token in response: ${body.slice(0, 200)}`);
  return data.access_token;
}

async function guesty(token, method, path, body) {
  const r = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch {}
  if (!r.ok) {
    const e = new Error(`${method} ${path} → ${r.status}`);
    e.response = { status: r.status, data: parsed || text };
    throw e;
  }
  return parsed;
}

async function main() {
  console.log(`Target URL: ${TARGET_URL}`);
  console.log(`Events: ${EVENTS.join(', ')}`);

  console.log('→ Minting token…');
  const token = await mintToken();
  console.log(`  got token (${token.slice(0, 20)}…)`);

  console.log('→ Listing existing webhooks…');
  const list = await guesty(token, 'GET', '/webhooks');
  const hooks = list?.results || list?.data || list || [];
  console.log(`  ${hooks.length} existing endpoints`);
  for (const h of hooks) {
    console.log(`   - ${h._id || h.id} | ${h.url} | enabled=${h.enabled ?? h.isActive ?? '?'}`);
  }

  let existing = hooks.find((h) => h.url === TARGET_URL);
  let action;
  if (existing) {
    action = 'update-existing-at-target';
  } else {
    existing = hooks.find((h) => h.url && h.url.includes('judiths-mac-mini'));
    action = existing ? 'repoint-legacy-mac-mini' : null;
  }
  if (!existing) {
    action = hooks.find((h) => (h.enabled === false || h.isActive === false)) ? 'enable-other-disabled' : 'create-new';
    if (action === 'enable-other-disabled') {
      existing = hooks.find((h) => (h.enabled === false || h.isActive === false));
    }
  }
  console.log(`→ Strategy: ${action}`);

  let webhookId;
  if (action === 'create-new') {
    console.log('→ POST /webhooks (creating)…');
    const created = await guesty(token, 'POST', '/webhooks', {
      url: TARGET_URL,
      events: EVENTS,
      enabled: true,
    });
    webhookId = created._id || created.id;
    console.log(`  created ${webhookId}`);
  } else {
    webhookId = existing._id || existing.id;
    console.log(`→ PUT /webhooks/${webhookId} (updating)…`);
    await guesty(token, 'PUT', `/webhooks/${webhookId}`, {
      url: TARGET_URL,
      events: EVENTS,
      enabled: true,
    });
    console.log('  updated');
  }

  console.log(`→ GET /webhooks/${webhookId}/secret (Svix secret)…`);
  try {
    const secret = await guesty(token, 'GET', `/webhooks/${webhookId}/secret`);
    const whsec = secret?.secret || secret?.key || secret;
    console.log(`\n  Svix secret (whsec_…): ${typeof whsec === 'string' ? whsec : JSON.stringify(whsec)}\n`);
    console.log('  → Add to /var/www/fad-backend/.env:');
    console.log(`     GUESTY_SVIX_SECRET=${typeof whsec === 'string' ? whsec : '<see above>'}`);
    console.log('     Then: pm2 restart fad-backend\n');
  } catch (e) {
    logErr('secret-fetch', e);
    console.log('  (Endpoint may be /webhooks/secret without id — try that manually.)');
  }

  console.log('Done. Verify deliveries land within ~5 min.');
}

main().catch((e) => { logErr('fatal', e); process.exit(2); });
