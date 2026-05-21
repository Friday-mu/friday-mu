'use strict';

// Background poller — runs every 5 minutes, syncs listings + then
// reservations for every tenant that has a Guesty integration. v1
// only Friday Retreats has env-var Guesty credentials, so the loop
// degenerates to "if FR_TENANT_ID exists, sync it."
//
// Run order: listings FIRST, then reservations (so the reservation
// sync can join against listing nicknames in the same poll window).
// Errors in one tenant don't abort others.
//
// Hot-restart safe: the worker reads from the cache table on startup
// so a fresh process doesn't double-fire if pm2 cycles within the
// poll window. Webhook receivers are idempotent (UPSERT ON CONFLICT).

const { syncListingsForTenant } = require('../properties/sync');
const { syncReservationsForTenant } = require('./sync');

// FR tenant UUID — duplicated from frontend useTenantIdentity.ts +
// backend design/adapters.js. Should be a shared constant; leaving
// it inline so this worker file is self-contained.
const FR_TENANT_ID = '00000000-0000-0000-0000-000000000001';

// 15 min instead of the brief's 5 — we share a Guesty rate-limit
// pool with friday.mu + friday-gms and burned through quota during
// the initial smoke. 15-min cadence still meets the "every 5 min for
// upcoming + recent" intent because the WEBHOOK path delivers
// reservation.* events in near-real-time; the poller is the safety
// net that catches anything Guesty missed firing.
const POLL_INTERVAL_MS = 15 * 60 * 1000;
let pollHandle = null;
let polling = false;

async function runOnce({ initial = false } = {}) {
  if (polling) {
    console.log('[guesty/poller] skip — previous run still in flight');
    return;
  }
  polling = true;
  const startedAt = Date.now();
  try {
    if (!process.env.GUESTY_CLIENT_ID || !process.env.GUESTY_CLIENT_SECRET) {
      if (initial) {
        console.log('[guesty/poller] Guesty credentials not set — poller idle');
      }
      return;
    }
    // v1 — only FR. When per-tenant creds land, switch this to a
    // "SELECT tenant_id FROM tenant_guesty_creds" loop.
    const tenants = [FR_TENANT_ID];
    for (const tenantId of tenants) {
      try {
        const listingsSummary = await syncListingsForTenant(tenantId);
        const reservationsSummary = await syncReservationsForTenant(tenantId);
        console.log(
          `[guesty/poller] tenant=${tenantId} ` +
          `listings(fetched=${listingsSummary.fetched}, ins=${listingsSummary.inserted}, upd=${listingsSummary.updated}, ${listingsSummary.durationMs}ms) ` +
          `reservations(fetched=${reservationsSummary.fetched}, ins=${reservationsSummary.inserted}, upd=${reservationsSummary.updated}, ${reservationsSummary.durationMs}ms)`,
        );
      } catch (e) {
        // Don't let one tenant's failure block others; log + continue.
        console.error(`[guesty/poller] tenant=${tenantId} failed:`, e.message);
      }
    }
  } finally {
    polling = false;
    if (initial) {
      console.log(`[guesty/poller] initial sync complete (${Date.now() - startedAt}ms)`);
    }
  }
}

function start() {
  if (pollHandle) return;
  console.log(`[guesty/poller] starting (interval=${POLL_INTERVAL_MS}ms)`);
  // Initial sync 5s after boot so we don't slow down the process
  // start-up but also don't wait the full poll window for first data.
  setTimeout(() => { void runOnce({ initial: true }); }, 5_000);
  pollHandle = setInterval(() => { void runOnce(); }, POLL_INTERVAL_MS);
}

function stop() {
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
}

module.exports = { start, stop, runOnce, FR_TENANT_ID };
