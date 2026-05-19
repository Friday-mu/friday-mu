'use strict';

// Guesty Open API client extracted from server.js so the website-inbox
// module can call createReservation / updateReservation without
// duplicating token caching. server.js mounts its own listings +
// reviews calls on the existing `guestyAPI` instance — when this
// module's home grows beyond v1 we should pull both call sites onto
// this single client; for now we share the env-driven creds and use
// our own axios instance to keep imports tidy.
//
// Token caching is THREE tiers:
//   1. in-memory  — fast path, alive for the life of this process
//   2. shared file on disk — written by both fad-backend and friday-gms,
//      so a token minted by one is picked up by the other. Critical
//      because Guesty caps OAuth mints at 5/clientId/24h (per audit
//      2026-05-16) and the two backends share one clientId.
//   3. fresh mint — last resort. Updates layers 2 + 1 on success.

const axios = require('axios');
const fs = require('node:fs');

const BASE_URL = process.env.GUESTY_BASE_URL || 'https://open-api.guesty.com/v1';
const TOKEN_URL = process.env.GUESTY_TOKEN_URL || 'https://open-api.guesty.com/oauth2/token';
const CLIENT_ID = process.env.GUESTY_CLIENT_ID;
const CLIENT_SECRET = process.env.GUESTY_CLIENT_SECRET;

// 60s safety buffer before the cached token expires.
const TOKEN_SAFETY_MS = 60_000;

// Shared on-disk cache. Default points at friday-gms's location —
// override via GUESTY_SHARED_TOKEN_PATH if topology changes.
const SHARED_TOKEN_PATH =
  process.env.GUESTY_SHARED_TOKEN_PATH || '/var/www/friday-gms/.guesty-token.json';
// Shared mint-quota meta (GMS hotfix 9a091da introduced this — tracks
// the 5/24h Guesty mint limit per UTC day). FAD respects the same
// file so the two backends coordinate. Without this, FAD could mint
// past GMS's counter and re-burn quota.
const SHARED_TOKEN_META_PATH =
  process.env.GUESTY_SHARED_TOKEN_META_PATH || '/var/www/friday-gms/.guesty-token-meta.json';
const DAILY_MINT_LIMIT = 5;

let tokenCache = { token: null, expiresAt: 0 };

// Single-flight mutex: when a refresh is in flight, every other caller
// awaits the same promise instead of independently calling /oauth2/token.
// Matches friday-gms's guard. Today the only caller is the serial poller
// so this is dormant; becomes load-bearing once FAD is the org-wide
// single Guesty consumer (parallel calls from website /api/public/*).
let tokenRefreshInflight = null;

function loadTokenFromDisk() {
  try {
    const raw = fs.readFileSync(SHARED_TOKEN_PATH, 'utf-8');
    const data = JSON.parse(raw);
    // friday-gms historically used `expiresAt`; older versions may
    // have used `expires_at` or `expiry`. Accept any of them.
    const expiresAt = Number(data.expiresAt || data.expires_at || data.expiry || 0);
    const access = data.access_token || data.accessToken;
    if (access && expiresAt > Date.now() + TOKEN_SAFETY_MS) {
      return { token: String(access), expiresAt };
    }
  } catch {
    // File missing / unreadable / malformed — fall through to mint.
  }
  return null;
}

function saveTokenToDisk(token, expiresAt) {
  try {
    const payload = JSON.stringify({ access_token: token, expiresAt }, null, 2);
    // Atomic write so friday-gms doesn't read a torn file while we
    // overwrite. Keep the same path so friday-gms's existing loader
    // picks it up on its next cache miss / restart.
    const tmp = `${SHARED_TOKEN_PATH}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, payload, { mode: 0o644 });
    fs.renameSync(tmp, SHARED_TOKEN_PATH);
  } catch (e) {
    console.warn('[guesty] could not write shared token cache:', e.message);
  }
}

function utcDate() {
  return new Date().toISOString().slice(0, 10);
}

function readMintMeta() {
  try {
    const raw = fs.readFileSync(SHARED_TOKEN_META_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed?.date === utcDate() && typeof parsed.refreshCount === 'number') {
      return { date: parsed.date, refreshCount: parsed.refreshCount };
    }
  } catch {
    // file missing / unreadable — treat as fresh day
  }
  return { date: utcDate(), refreshCount: 0 };
}

function writeMintMeta(meta) {
  try {
    const payload = JSON.stringify(meta, null, 2);
    const tmp = `${SHARED_TOKEN_META_PATH}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, payload, { mode: 0o644 });
    fs.renameSync(tmp, SHARED_TOKEN_META_PATH);
  } catch (e) {
    console.warn('[guesty] could not write mint meta:', e.message);
  }
}

async function getAccessToken() {
  // Tier 1: in-memory. Fast path — no mutex needed.
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - TOKEN_SAFETY_MS) {
    return tokenCache.token;
  }
  // Slow path: coalesce concurrent callers on a single in-flight promise.
  // The inner refresh handles disk-cache + mint + 429 retry on its own;
  // its recursive retry call sees tokenRefreshInflight === this promise
  // so it bypasses the mutex and proceeds directly (no deadlock).
  if (tokenRefreshInflight) {
    return tokenRefreshInflight;
  }
  tokenRefreshInflight = (async () => {
    try {
      return await refreshAccessToken({ retries: 1 });
    } finally {
      tokenRefreshInflight = null;
    }
  })();
  return tokenRefreshInflight;
}

async function refreshAccessToken({ retries = 1 } = {}) {
  // Tier 2: shared disk cache — covers the case where friday-gms
  // already minted a fresh token in the last 24h.
  const fromDisk = loadTokenFromDisk();
  if (fromDisk) {
    tokenCache = fromDisk;
    return fromDisk.token;
  }
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('Guesty credentials not configured (GUESTY_CLIENT_ID / GUESTY_CLIENT_SECRET)');
  }
  // Tier 3: fresh mint. Both backends share one clientId with a
  // 5/24h ceiling. Check the shared meta file first — if GMS has
  // already minted 5x today, refuse without making the API call.
  // This matches friday-gms's hotfix 9a091da behavior so the two
  // backends can't collectively burn past quota.
  const meta = readMintMeta();
  if (meta.refreshCount >= DAILY_MINT_LIMIT) {
    throw new Error(
      `Guesty token daily mint limit reached (${meta.refreshCount}/${DAILY_MINT_LIMIT} on ${meta.date}). Waits until UTC midnight.`,
    );
  }
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: 'open-api',
  });
  try {
    const { data } = await axios.post(TOKEN_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15_000,
    });
    if (!data?.access_token) throw new Error('Guesty token response missing access_token');
    const expiresAt = Date.now() + (data.expires_in || 86400) * 1000;
    tokenCache = { token: data.access_token, expiresAt };
    saveTokenToDisk(data.access_token, expiresAt);
    // Update the shared mint-counter so GMS sees our mint.
    writeMintMeta({ date: utcDate(), refreshCount: meta.refreshCount + 1 });
    return tokenCache.token;
  } catch (e) {
    // The token endpoint is in the same rate-limit bucket as the
    // regular API. Same single-retry treatment — burn 30s waiting on
    // Retry-After (or default), then bubble. Without this the 5-min
    // poller can't recover from a transient 429 burst because every
    // call starts with this token fetch. Retry stays inside the same
    // in-flight promise so coalesced callers still see one outcome.
    if (retries > 0 && e?.response?.status === 429) {
      const retryAfterSec = Number(e.response.headers?.['retry-after']) || 30;
      const waitMs = Math.min(retryAfterSec * 1000, 60_000);
      await new Promise((r) => setTimeout(r, waitMs));
      return refreshAccessToken({ retries: retries - 1 });
    }
    throw e;
  }
}

async function guestyRequest({ method, path, data, params, retries = 1 }) {
  const token = await getAccessToken();
  try {
    return await axios.request({
      method,
      baseURL: BASE_URL,
      url: path,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 25_000,
      data,
      params,
    });
  } catch (e) {
    // Single in-process retry with Retry-After honoured. Guesty's rate
    // limit is shared across all consumers (fad-backend, friday.mu,
    // friday-gms), so collisions are common — burning one retry inline
    // is cheaper than letting the caller fail + the 5-min poller waiting
    // a full window. For deeper failures the caller catches + decides.
    if (retries > 0 && e?.response?.status === 429) {
      const retryAfterSec = Number(e.response.headers?.['retry-after']) || 30;
      const waitMs = Math.min(retryAfterSec * 1000, 60_000);
      await new Promise((r) => setTimeout(r, waitMs));
      return guestyRequest({ method, path, data, params, retries: retries - 1 });
    }
    throw e;
  }
}

// ─── Create a reservation in `reserved` status with a 48h auto-expire.
// Guest details + listing ID + check-in/out from the booking.proof
// payload. `expirationDate` is a Guesty Open API field — if no manual
// confirm happens by then, the reservation auto-drops.
async function createReservation({
  listingId,
  checkInDateUtc,        // ISO date string, e.g. '2026-06-12'
  checkOutDateUtc,
  guests,                // { firstName, lastName, email, phone }
  guestsCount,           // total occupants
  reference,             // friday.mu reference for the Guesty `confirmationCode` field
  proofUrl,              // Vercel Blob URL — goes into the staff note
  expirationHours = 48,
}) {
  if (!listingId) throw new Error('createReservation: listingId is required');
  const expirationDate = new Date(Date.now() + expirationHours * 3600_000).toISOString();
  const staffNote = [
    'Awaiting payment verification — proof uploaded via friday.mu.',
    proofUrl ? `Proof: ${proofUrl}` : null,
    reference ? `Ref: ${reference}` : null,
  ].filter(Boolean).join('\n');

  const body = {
    listingId,
    checkInDateLocalized: checkInDateUtc,
    checkOutDateLocalized: checkOutDateUtc,
    status: 'reserved',
    expirationDate,
    guestsCount: guestsCount || 1,
    source: 'friday.mu',
    confirmationCode: reference || undefined,
    // Guesty expects nested guest details.
    guest: {
      firstName: guests?.firstName || guests?.first_name || guests?.name || 'Guest',
      lastName: guests?.lastName || guests?.last_name || '',
      email: guests?.email,
      phone: guests?.phone,
    },
    notes: staffNote,
  };
  const { data } = await guestyRequest({
    method: 'POST',
    path: '/reservations',
    data: body,
  });
  return data;
}

// ─── Flip a reserved reservation to confirmed once ops verifies the
// payment. Guesty Open API uses PUT /reservations/:id with the new
// status. We also clear expirationDate so the reservation no longer
// auto-drops.
async function confirmReservation({ reservationId }) {
  if (!reservationId) throw new Error('confirmReservation: reservationId is required');
  const { data } = await guestyRequest({
    method: 'PUT',
    path: `/reservations/${encodeURIComponent(reservationId)}`,
    data: {
      status: 'confirmed',
      expirationDate: null,
    },
  });
  return data;
}

// Lightweight retry decision — true for the usual transient classes.
function isRetryable(err) {
  const code = err?.response?.status;
  if (!code) return true; // network / DNS / timeout
  if (code === 429) return true;
  if (code >= 500 && code < 600) return true;
  return false;
}

// ─── Listings sync ────────────────────────────────────────────────
//
// Guesty's `/listings` endpoint paginates with `limit` + `skip`.
// FR has 26 listings today; we cap at 100/page and follow the cursor
// to be safe if the account grows. Returns the flat array of raw
// listing objects.
async function listListings({ limit = 100, maxPages = 20 } = {}) {
  const all = [];
  let skip = 0;
  for (let page = 0; page < maxPages; page++) {
    const { data } = await guestyRequest({
      method: 'GET',
      path: '/listings',
      params: { limit, skip },
    });
    const results = data?.results || (Array.isArray(data) ? data : []);
    if (!Array.isArray(results) || results.length === 0) break;
    all.push(...results);
    if (results.length < limit) break;
    skip += limit;
  }
  return all;
}

// ─── Reservations sync ────────────────────────────────────────────
//
// Same pagination contract. Default windows the sync to "recent +
// upcoming" — past 30 days through future 365 — so we don't pull the
// historical archive on every poll. Caller can widen via opts when
// doing a full backfill.
async function listReservations({
  limit = 100,
  maxPages = 50,
  fromDate,   // ISO date — checkInDate >= fromDate
  toDate,     // ISO date — checkInDate <= toDate
} = {}) {
  const all = [];
  let skip = 0;
  const filters = [];
  if (fromDate) filters.push({ field: 'checkInDateLocalized', operator: '$gte', value: fromDate });
  if (toDate) filters.push({ field: 'checkInDateLocalized', operator: '$lte', value: toDate });
  for (let page = 0; page < maxPages; page++) {
    const params = { limit, skip };
    if (filters.length > 0) params.filters = JSON.stringify(filters);
    const { data } = await guestyRequest({
      method: 'GET',
      path: '/reservations',
      params,
    });
    const results = data?.results || (Array.isArray(data) ? data : []);
    if (!Array.isArray(results) || results.length === 0) break;
    all.push(...results);
    if (results.length < limit) break;
    skip += limit;
  }
  return all;
}

async function getReservation({ reservationId }) {
  if (!reservationId) throw new Error('getReservation: reservationId is required');
  const { data } = await guestyRequest({
    method: 'GET',
    path: `/reservations/${encodeURIComponent(reservationId)}`,
  });
  return data;
}

module.exports = {
  createReservation,
  confirmReservation,
  isRetryable,
  listListings,
  listReservations,
  getReservation,
  // Exposed so server.js can route its legacy `guestyAPI` instance
  // through the same 3-tier cache (in-memory + shared disk + mint).
  getAccessToken,
  // Generic Guesty HTTP helper. Used by backend/src/inbox/drafts_send.js
  // for the FAD-native outbound send. Was missing from exports since
  // Stage 2.1 ship (bc2b61f) — surfaced as
  // "guestyRequest is not a function" in prod 2026-05-19 05:22 UTC
  // when Ishant first tried to send.
  guestyRequest,
};
