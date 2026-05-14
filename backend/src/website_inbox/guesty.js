'use strict';

// Guesty Open API client extracted from server.js so the website-inbox
// module can call createReservation / updateReservation without
// duplicating token caching. server.js mounts its own listings +
// reviews calls on the existing `guestyAPI` instance — when this
// module's home grows beyond v1 we should pull both call sites onto
// this single client; for now we share the env-driven creds and use
// our own axios instance to keep imports tidy.

const axios = require('axios');

const BASE_URL = process.env.GUESTY_BASE_URL || 'https://open-api.guesty.com/v1';
const TOKEN_URL = process.env.GUESTY_TOKEN_URL || 'https://open-api.guesty.com/oauth2/token';
const CLIENT_ID = process.env.GUESTY_CLIENT_ID;
const CLIENT_SECRET = process.env.GUESTY_CLIENT_SECRET;

// 60s safety buffer before the cached token expires.
const TOKEN_SAFETY_MS = 60_000;

let tokenCache = { token: null, expiresAt: 0 };

async function getAccessToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - TOKEN_SAFETY_MS) {
    return tokenCache.token;
  }
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('Guesty credentials not configured (GUESTY_CLIENT_ID / GUESTY_CLIENT_SECRET)');
  }
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: 'open-api',
  });
  const { data } = await axios.post(TOKEN_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15_000,
  });
  if (!data?.access_token) throw new Error('Guesty token response missing access_token');
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 86400) * 1000,
  };
  return tokenCache.token;
}

async function guestyRequest({ method, path, data, params }) {
  const token = await getAccessToken();
  return axios.request({
    method,
    baseURL: BASE_URL,
    url: path,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    timeout: 25_000,
    data,
    params,
  });
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

module.exports = {
  createReservation,
  confirmReservation,
  isRetryable,
};
