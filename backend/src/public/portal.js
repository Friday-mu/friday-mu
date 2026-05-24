'use strict';

// Portal v2 public API — slice 1.
//
// Two endpoints, both Bearer-auth via attachApiClient + scoped:
//
//   POST /api/public/threads/claim    (scope: portal:write)
//   POST /api/public/stays/resolve    (scope: portal:read)
//
// Why /api/public/stays/resolve and not /api/public/portal/resolve:
// the website's `lib/fad-client/portal.ts` already calls
// `${REQUEST_BASE}/resolve` where REQUEST_BASE = '/api/public/stays'.
// Locked contract v2 also requires the stayToken in the request body,
// not the URL — so the path is fixed and the token is `{ stayToken }`
// in the JSON body, never in query string or path.
//
// Spec for response shapes: the canonical TypeScript types live at
// /Users/judith/Friday Website/lib/fad-client/portal.ts (website
// repo). PublicPortalResponse / PortalThread / PortalBookingRequestSummary
// / etc. The demo fixtures at the bottom of that file are the literal
// rendering spec — when this endpoint returns the same shape for a
// real token, the portal renders identically to demo mode.
//
// Idempotency for claim: (tenant_id, kind, request_id) unique index
// in mig 091. Repeat claims with the same (kind, requestId) return
// the existing token, never mint a second one.
//
// Kind-switch in resolve: when a booking_request has
// `converted_to_reservation_id IS NOT NULL` (set by FAD admin UI in
// slice 2 when ops marks funds received), the same stayToken resolves
// as reservation-mode automatically. Website doesn't need to know
// about the FK; it just calls resolve and renders whatever kind comes
// back.

const express = require('express');
const crypto = require('node:crypto');
const { query } = require('../database/client');
const { attachApiClient, requireScope } = require('../auth/api_clients');
const { sendSaveLinkEmail } = require('./portal_email');

const router = express.Router();

const VALID_KINDS = new Set([
  'reservation',
  'booking_request',
  'contact',
  'trip_inquiry',
  'owner_enquiry',
  'experience_enquiry',
]);

// PortalMode discriminant maps from PortalThreadKind. Used for the
// `mode` field on the response envelope.
function modeForKind(kind) {
  if (kind === 'reservation') return 'reservation';
  if (kind === 'owner_enquiry') return 'owner';
  return 'enquiry'; // contact / trip_inquiry / booking_request / experience_enquiry
}

// Per-kind token TTL (matches the demo fixtures + locked contract).
// Booking requests are short-lived (30d) because they should convert
// or expire fast; owner enquiries longer (90d) because deals take time.
function tokenTtlDays(kind) {
  if (kind === 'booking_request') return 30;
  if (kind === 'owner_enquiry') return 90;
  return 60; // contact / trip_inquiry / experience_enquiry / reservation
}

// `portalAvailableUntil` is always 1 year — even after the link itself
// expires, the portal stays renderable in read-only mode for guests
// who saved the URL.
const PORTAL_AVAILABLE_DAYS = 365;

// PORTAL_BASE_URL defaults to friday.mu but is overridable for staging
// (set PORTAL_BASE_URL=https://friday-website-pink.vercel.app on the
// staging FAD backend).
function portalBaseUrl() {
  return (process.env.PORTAL_BASE_URL || 'https://friday.mu').replace(/\/$/, '');
}

function buildPortalUrl(locale, token) {
  const lang = locale === 'fr' ? 'fr' : 'en';
  return `${portalBaseUrl()}/${lang}/stay/${token}`;
}

function mintToken() {
  return `fsp_${crypto.randomBytes(16).toString('hex')}`;
}

// Tenant id payload uses the friendly slug ("friday-mu"), not the
// internal UUID. Hardcoded for now since FR is the only tenant; when
// we go multi-tenant we'll add a `slug` column on tenants and read
// it via req.apiClient.tenantId.
function tenantPayload() {
  return {
    id: 'friday-mu',
    brand: 'friday.mu',
    timezone: 'Indian/Mauritius',
  };
}

const SUPPORT_COMMON = {
  primaryChannel: 'whatsapp',
  emergencyPhone: '+2304084119',
  whatsappUrl: 'https://wa.me/2304084119',
  email: 'info@friday.mu',
  categories: [
    { id: 'other', label: 'Question for the team', priority: 'normal' },
    { id: 'addon', label: 'About my request', priority: 'normal' },
  ],
};

// ────────────────────────────────────────────────────────────────
// Helpers — DB upsert + thread/inquiry materialisation
// ────────────────────────────────────────────────────────────────

// Upsert an inbox_threads row for the guest email (one thread per
// guest per tenant, mig 087's unique index). Returns the thread id.
// Reuses existing thread if the guest has emailed before — keeps the
// conversation continuous across multiple form submissions.
async function ensureInboxThread({ tenantId, guestEmail, guestName, guestPhone }) {
  const { rows } = await query(
    `
    INSERT INTO inbox_threads (
      tenant_id, guest_email, guest_email_raw, guest_name, guest_phone,
      last_event_type, last_event_at
    )
    VALUES ($5::uuid, LOWER($1), $1, $2, $3, $4, NOW())
    ON CONFLICT (tenant_id, (LOWER(guest_email))) DO UPDATE SET
      guest_name      = COALESCE(EXCLUDED.guest_name, inbox_threads.guest_name),
      guest_phone     = COALESCE(EXCLUDED.guest_phone, inbox_threads.guest_phone),
      last_event_type = EXCLUDED.last_event_type,
      last_event_at   = NOW(),
      updated_at      = NOW()
    RETURNING id
    `,
    [guestEmail, guestName || null, guestPhone || null, 'portal.claim', tenantId],
  );
  return rows[0].id;
}

// Materialise the booking_request sidecar (mig 092). Pulls dates +
// listing info from the context payload sent by the website.
async function ensureBookingRequestSidecar({ tenantId, threadId, requestId, context }) {
  const c = context || {};
  const { rows } = await query(
    `
    INSERT INTO fad_portal_booking_requests (
      tenant_id, thread_id, request_id,
      listing_slug, listing_title,
      check_in, check_out, nights,
      party_adults, party_children, party_infants,
      quoted_total_amount_minor, quoted_total_currency,
      status
    ) VALUES (
      $1::uuid, $2::uuid, $3,
      $4, $5,
      $6, $7, $8,
      $9, $10, $11,
      $12, $13,
      'pending_review'
    )
    ON CONFLICT (tenant_id, request_id) DO UPDATE SET
      thread_id     = COALESCE(fad_portal_booking_requests.thread_id, EXCLUDED.thread_id),
      listing_slug  = COALESCE(EXCLUDED.listing_slug, fad_portal_booking_requests.listing_slug),
      listing_title = COALESCE(EXCLUDED.listing_title, fad_portal_booking_requests.listing_title),
      check_in      = COALESCE(EXCLUDED.check_in, fad_portal_booking_requests.check_in),
      check_out     = COALESCE(EXCLUDED.check_out, fad_portal_booking_requests.check_out),
      nights        = COALESCE(EXCLUDED.nights, fad_portal_booking_requests.nights),
      party_adults  = COALESCE(EXCLUDED.party_adults, fad_portal_booking_requests.party_adults),
      party_children = COALESCE(EXCLUDED.party_children, fad_portal_booking_requests.party_children),
      party_infants  = COALESCE(EXCLUDED.party_infants, fad_portal_booking_requests.party_infants),
      quoted_total_amount_minor = COALESCE(EXCLUDED.quoted_total_amount_minor, fad_portal_booking_requests.quoted_total_amount_minor),
      quoted_total_currency     = COALESCE(EXCLUDED.quoted_total_currency, fad_portal_booking_requests.quoted_total_currency),
      updated_at = NOW()
    RETURNING id
    `,
    [
      tenantId, threadId, requestId,
      c.listingSlug || null, c.listingTitle || null,
      c.checkIn || null, c.checkOut || null,
      Number.isFinite(c.nights) ? c.nights : null,
      Number.isFinite(c.partySize?.adults) ? c.partySize.adults : null,
      Number.isFinite(c.partySize?.children) ? c.partySize.children : null,
      Number.isFinite(c.partySize?.infants) ? c.partySize.infants : null,
      Number.isFinite(c.quotedTotal?.amount) ? Math.round(c.quotedTotal.amount * 100) : null,
      c.quotedTotal?.currency && ['EUR', 'MUR', 'USD'].includes(c.quotedTotal.currency)
        ? c.quotedTotal.currency : null,
    ],
  );
  return rows[0].id;
}

// ────────────────────────────────────────────────────────────────
// POST /api/public/threads/claim
// ────────────────────────────────────────────────────────────────

router.post('/threads/claim', attachApiClient, requireScope('portal:write'), async (req, res) => {
  const body = req.body || {};
  const kind = typeof body.kind === 'string' ? body.kind : null;
  const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : '';
  const guestEmail = typeof body.guestEmail === 'string' ? body.guestEmail.trim().toLowerCase() : '';
  const guestName = typeof body.guestName === 'string' ? body.guestName.trim() : '';
  const guestPhone = typeof body.guestPhone === 'string' ? body.guestPhone.trim() : '';
  const context = body.context && typeof body.context === 'object' ? body.context : {};
  const locale = context.locale === 'fr' ? 'fr' : 'en';
  const tenantId = req.apiClient.tenantId;

  if (!kind || !VALID_KINDS.has(kind)) {
    return res.status(400).json({ error: 'invalid_kind', message: `kind must be one of ${[...VALID_KINDS].join(', ')}` });
  }
  if (!requestId) {
    return res.status(400).json({ error: 'missing_request_id', message: 'requestId required' });
  }
  if (!guestEmail || !guestEmail.includes('@')) {
    return res.status(400).json({ error: 'invalid_email', message: 'guestEmail required (valid email)' });
  }

  try {
    // Idempotency: did we already mint a token for this (tenant, kind, requestId)?
    const existing = await query(
      `SELECT token, locale FROM portal_tokens
        WHERE tenant_id = $1 AND kind = $2 AND request_id = $3
        LIMIT 1`,
      [tenantId, kind, requestId],
    );
    if (existing.rows.length > 0) {
      const token = existing.rows[0].token;
      const tokenLocale = existing.rows[0].locale || locale;
      return res.json({
        stayToken: token,
        portalUrl: buildPortalUrl(tokenLocale, token),
        emailedTo: guestEmail,
      });
    }

    // New token. Materialise the joined records per-kind.
    const token = mintToken();
    const ttlDays = tokenTtlDays(kind);
    let threadId = null;
    let inquiryId = null;

    if (kind === 'trip_inquiry') {
      // Trip inquiries land in fad_inquiries (mig 078 — the first-class
      // inquiry queue ops use for quote workflow).
      const inq = await query(
        `INSERT INTO fad_inquiries
           (tenant_id, guest_name, guest_email, guest_phone, source, status, notes)
         VALUES ($1::uuid, $2, $3, $4, 'website', 'pending_quote', $5)
         RETURNING id`,
        [
          tenantId,
          guestName || guestEmail.split('@')[0],
          guestEmail,
          guestPhone || null,
          context.subject || null,
        ],
      );
      inquiryId = inq.rows[0].id;
    } else {
      // All other kinds get an inbox_threads row (reservation /
      // booking_request / contact / owner_enquiry / experience_enquiry).
      // The thread carries the conversation; per-kind sidecars carry
      // structured data.
      threadId = await ensureInboxThread({ tenantId, guestEmail, guestName, guestPhone });
      if (kind === 'booking_request') {
        await ensureBookingRequestSidecar({ tenantId, threadId, requestId, context });
      }
    }

    await query(
      `
      INSERT INTO portal_tokens
        (token, tenant_id, kind, request_id, thread_id, inquiry_id,
         guest_email, guest_name, guest_phone, locale, context,
         expires_at)
      VALUES
        ($1, $2::uuid, $3, $4, $5, $6,
         $7, $8, $9, $10, $11::jsonb,
         NOW() + ($12 || ' days')::interval)
      `,
      [
        token, tenantId, kind, requestId, threadId, inquiryId,
        guestEmail, guestName || null, guestPhone || null, locale,
        JSON.stringify(context),
        String(ttlDays),
      ],
    );

    const portalUrl = buildPortalUrl(locale, token);

    // Fire-and-forget email — response returns immediately even if
    // Resend is slow / down.
    sendSaveLinkEmail({ to: guestEmail, name: guestName, portalUrl, locale });

    res.status(201).json({
      stayToken: token,
      portalUrl,
      emailedTo: guestEmail,
    });
  } catch (e) {
    console.error('[public/portal] claim error:', e.message);
    res.status(500).json({ error: 'server_error', message: e.message });
  }
});

// ────────────────────────────────────────────────────────────────
// POST /api/public/stays/resolve
// ────────────────────────────────────────────────────────────────

router.post('/stays/resolve', attachApiClient, requireScope('portal:read'), async (req, res) => {
  const stayToken = typeof req.body?.stayToken === 'string' ? req.body.stayToken.trim() : '';
  if (!stayToken) {
    return res.status(400).json({ error: 'missing_token', message: 'stayToken required in body' });
  }
  try {
    const tokenRow = await query(
      `SELECT token, tenant_id, kind, request_id, thread_id, inquiry_id,
              guest_email, guest_name, locale, context,
              created_at, expires_at
         FROM portal_tokens
        WHERE token = $1 AND tenant_id = $2 AND expires_at > NOW()
        LIMIT 1`,
      [stayToken, req.apiClient.tenantId],
    );
    if (tokenRow.rows.length === 0) {
      return res.status(404).json({ error: 'token_not_found', message: 'stayToken invalid or expired' });
    }
    const t = tokenRow.rows[0];

    // For booking_request, check if it's been converted to a
    // reservation (status='confirmed' + ops created the reservation).
    // If so, return reservation-mode envelope instead — the "transparent
    // kind-switch" from §3b.
    let effectiveKind = t.kind;
    let reservationId = null;
    let bookingSummary = null;
    if (t.kind === 'booking_request') {
      const br = await query(
        `SELECT id, listing_slug, listing_title, check_in, check_out,
                nights, party_adults, party_children, party_infants,
                quoted_total_amount_minor, quoted_total_currency,
                status, converted_to_reservation_id
           FROM fad_portal_booking_requests
          WHERE tenant_id = $1 AND request_id = $2
          LIMIT 1`,
        [t.tenant_id, t.request_id],
      );
      bookingSummary = br.rows[0] || null;
      if (bookingSummary?.converted_to_reservation_id) {
        effectiveKind = 'reservation';
        reservationId = bookingSummary.converted_to_reservation_id;
      }
    }

    // Update last_resolved_at — fire-and-forget; don't block response.
    query(
      `UPDATE portal_tokens SET last_resolved_at = NOW() WHERE token = $1`,
      [stayToken],
    ).catch(() => { /* ignore */ });

    const envelope = await buildResponseEnvelope({
      token: t,
      effectiveKind,
      bookingSummary,
      reservationId,
    });
    res.json(envelope);
  } catch (e) {
    console.error('[public/portal] resolve error:', e.message);
    res.status(500).json({ error: 'server_error', message: e.message });
  }
});

// ────────────────────────────────────────────────────────────────
// Response envelope builder
// ────────────────────────────────────────────────────────────────

async function buildResponseEnvelope({ token, effectiveKind, bookingSummary, reservationId }) {
  void reservationId; // Reservation-mode is wired in slice 2; for now we keep returning booking_request mode
  const now = new Date();
  const mode = modeForKind(effectiveKind);
  const requestId = crypto.randomBytes(8).toString('hex');
  const subjectLine = buildSubjectLine(effectiveKind, token.context, bookingSummary);

  // Slice 1: messages array stays empty (slice 2 wires the conversation).
  // Note from website session: minimal kinds (contact / experience_enquiry)
  // can return [] + empty attached and still render correctly.
  const messages = [];

  const attached = buildAttachedPayload({ kind: effectiveKind, token, bookingSummary });

  const thread = {
    id: token.thread_id || token.inquiry_id || token.token,
    kind: effectiveKind,
    subjectLine,
    createdAt: token.created_at.toISOString(),
    status: 'awaiting_friday',
    messages,
    attached,
  };

  return {
    ok: true,
    requestId,
    serverTime: now.toISOString(),
    tenant: tenantPayload(),
    token: {
      status: 'valid',
      expiresAt: token.expires_at.toISOString(),
      portalAvailableUntil: new Date(token.created_at.getTime() + PORTAL_AVAILABLE_DAYS * 86400000).toISOString(),
    },
    mode,
    thread,
    support: SUPPORT_COMMON,
    analytics: {
      mode,
      threadId: thread.id,
      threadKind: thread.kind,
      ...(token.context?.listingSlug ? { listingSlug: token.context.listingSlug } : {}),
    },
  };
}

function buildSubjectLine(kind, context, bookingSummary) {
  const ctx = context || {};
  const title = ctx.listingTitle || bookingSummary?.listing_title;
  if (kind === 'booking_request') {
    return title ? `Booking request, ${title}` : 'Booking request';
  }
  if (kind === 'reservation') {
    return title ? `Your stay, ${title}` : 'Your stay';
  }
  if (kind === 'owner_enquiry') {
    return ctx.subject || 'Owner enquiry';
  }
  if (kind === 'trip_inquiry') {
    return ctx.subject || 'Trip planning';
  }
  if (kind === 'experience_enquiry') {
    return ctx.subject || 'Experience enquiry';
  }
  return ctx.subject || 'Message to Friday';
}

function buildAttachedPayload({ kind, token, bookingSummary }) {
  const ctx = token.context || {};
  if (kind === 'booking_request' && bookingSummary) {
    return {
      bookingRequestId: token.request_id,
      bookingRequestSummary: {
        listingTitle: bookingSummary.listing_title || ctx.listingTitle || '—',
        ...(bookingSummary.listing_slug ? { listingSlug: bookingSummary.listing_slug } : {}),
        ...(bookingSummary.check_in ? { checkIn: bookingSummary.check_in instanceof Date
          ? bookingSummary.check_in.toISOString().slice(0, 10)
          : String(bookingSummary.check_in).slice(0, 10) } : {}),
        ...(bookingSummary.check_out ? { checkOut: bookingSummary.check_out instanceof Date
          ? bookingSummary.check_out.toISOString().slice(0, 10)
          : String(bookingSummary.check_out).slice(0, 10) } : {}),
        ...(bookingSummary.nights != null ? { nights: Number(bookingSummary.nights) } : {}),
        ...(bookingSummary.party_adults != null || bookingSummary.party_children != null || bookingSummary.party_infants != null
          ? { partySize: {
              adults: Number(bookingSummary.party_adults || 0),
              children: Number(bookingSummary.party_children || 0),
              infants: Number(bookingSummary.party_infants || 0),
            } }
          : {}),
        ...(bookingSummary.quoted_total_amount_minor != null && bookingSummary.quoted_total_currency
          ? { quotedTotal: {
              amount: Number(bookingSummary.quoted_total_amount_minor) / 100,
              currency: bookingSummary.quoted_total_currency,
            } }
          : {}),
        status: bookingSummary.status,
      },
    };
  }
  if (kind === 'reservation') {
    // Reservation-mode envelope is wired in slice 2. For now return
    // the bookingRequestId pointer so the resolver doesn't 500.
    return { bookingRequestId: token.request_id };
  }
  if (kind === 'owner_enquiry') {
    return {
      ownerEnquirySummary: {
        ...(ctx.propertyType ? { propertyType: ctx.propertyType } : {}),
        ...(ctx.area ? { area: ctx.area } : {}),
        ...(ctx.bedrooms ? { bedrooms: ctx.bedrooms } : {}),
        ...(ctx.numberOfProperties ? { numberOfProperties: ctx.numberOfProperties } : {}),
        ...(ctx.tierInterest ? { tierInterest: ctx.tierInterest } : {}),
        ...(ctx.timing ? { timing: ctx.timing } : {}),
        ...(ctx.notes ? { notes: ctx.notes } : {}),
      },
    };
  }
  if (kind === 'trip_inquiry' || kind === 'experience_enquiry') {
    return {
      tripSummary: {
        items: Array.isArray(ctx.items) ? ctx.items : [],
        ...(ctx.guestNote ? { guestNote: ctx.guestNote } : {}),
        ...(ctx.preferredDates ? { preferredDates: ctx.preferredDates } : {}),
        ...(ctx.partySize ? { partySize: ctx.partySize } : {}),
      },
    };
  }
  if (kind === 'contact') {
    return {
      contactSummary: {
        ...(ctx.subject ? { subject: ctx.subject } : {}),
        ...(ctx.topic ? { topic: ctx.topic } : {}),
        ...(ctx.preferredChannel ? { preferredChannel: ctx.preferredChannel } : {}),
      },
    };
  }
  return {};
}

module.exports = router;
