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
  const now = new Date();
  const mode = modeForKind(effectiveKind);
  const requestId = crypto.randomBytes(8).toString('hex');
  const subjectLine = buildSubjectLine(effectiveKind, token.context, bookingSummary);

  // Slice 3: when effectiveKind === 'reservation', pull the full bundle
  // (fad_reservations + guesty_reservations + guesty_listings + photos)
  // and compose the 8 reservation-mode blocks. Otherwise envelope is
  // thread-only (conversation + attached request summary).
  let reservationBundle = null;
  if (effectiveKind === 'reservation' && reservationId) {
    try {
      reservationBundle = await fetchReservationBundle(token.tenant_id, reservationId);
    } catch (e) {
      console.error('[public/portal] fetchReservationBundle error:', e.message);
      reservationBundle = null;
    }
  }

  // Messages: pulled from inbox_events for thread_id. Visitor messages
  // + staff replies become PortalMessage rows. AI handoff explanations
  // are ops-only — not surfaced to the guest.
  const messages = token.thread_id
    ? await extractThreadMessages(token.thread_id, token.guest_name)
    : [];

  const attached = buildAttachedPayload({
    kind: effectiveKind,
    token,
    bookingSummary,
    reservationBundle,
  });

  const thread = {
    id: token.thread_id || token.inquiry_id || token.token,
    kind: effectiveKind,
    subjectLine,
    createdAt: token.created_at.toISOString(),
    status: deriveThreadStatus(messages),
    messages,
    attached,
  };

  // Reservation-mode-only top-level blocks.
  let reservationBlock, listingBlock, checklistBlock, visibilityBlock,
      arrivalBlock, houseGuideBlock, exploreBlock, addonsBlock;
  let analyticsContext = {};
  if (reservationBundle) {
    visibilityBlock = computeVisibility(reservationBundle, now);
    reservationBlock = buildReservationBlock(reservationBundle);
    listingBlock = buildListingBlock(reservationBundle);
    checklistBlock = buildChecklistBlock(reservationBundle, visibilityBlock);
    arrivalBlock = buildArrivalBlock(reservationBundle, visibilityBlock);
    houseGuideBlock = buildHouseGuideBlock(reservationBundle);
    exploreBlock = buildExploreBlock(reservationBundle);
    addonsBlock = buildAddonsBlock(reservationBundle);
    analyticsContext = {
      reservationId: reservationBlock.id,
      listingId: listingBlock.id,
      channel: reservationBlock.channel,
      stage: visibilityBlock.currentStage,
    };
  }

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
    ...(reservationBundle ? {
      reservationId: reservationBlock.id,
      listingId: listingBlock.id,
      reservation: reservationBlock,
      listing: listingBlock,
      checklist: checklistBlock,
      visibility: visibilityBlock,
      arrival: arrivalBlock,
      houseGuide: houseGuideBlock,
      explore: exploreBlock,
      addons: addonsBlock,
    } : {}),
    analytics: {
      mode,
      threadId: thread.id,
      threadKind: thread.kind,
      ...(token.context?.listingSlug ? { listingSlug: token.context.listingSlug } : {}),
      ...analyticsContext,
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

function buildAttachedPayload({ kind, token, bookingSummary, reservationBundle }) {
  const ctx = token.context || {};
  if (kind === 'reservation' && reservationBundle) {
    return { reservationId: reservationBundle.fad.id };
  }
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
    // Fallback: kind says reservation but bundle missing (FK set but
    // join returned nothing). Return the bookingRequestId pointer so
    // the resolver still renders the conversation surface.
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

// ────────────────────────────────────────────────────────────────
// Slice 3 — reservation-mode envelope builders
// ────────────────────────────────────────────────────────────────
//
// All 8 reservation-mode blocks (reservation/listing/checklist/
// visibility/arrival/houseGuide/explore/addons) plus the conversation
// messages array are derived here from:
//   - fad_reservations   (FAD overlay — notes, access_info_sent_at)
//   - guesty_reservations (raw guest + dates + money)
//   - guesty_listings    (property data + amenities + access codes)
//   - fad_property_photos (editorial gallery, optional)
//
// House guide content is minimal (Wi-Fi card from raw.wifiName,
// emergency card with the on-call line). Editorial expansion is its
// own slice — when fad_property_guide / Sanity content is wired we
// add it here without changing the contract shape.

const STAGE_PRE_ARRIVAL = 'pre_arrival';
const STAGE_ACCESS_WINDOW = 'access_window';
const STAGE_IN_STAY = 'in_stay';
const STAGE_POST_CHECKOUT = 'post_checkout';
const STAGE_POST_BOOKING = 'post_booking';
const STAGE_EXPIRED = 'expired';

// 4-hour access-codes window before declared arrival.
const ACCESS_WINDOW_MS = 4 * 60 * 60 * 1000;
// Portal stays renderable in read-only mode for 90d after checkout.
const POST_CHECKOUT_PORTAL_MS = 90 * 24 * 60 * 60 * 1000;

async function fetchReservationBundle(tenantId, reservationId) {
  const { rows } = await query(
    `
    SELECT
      fr.id                              AS fr_id,
      fr.confirmation_code               AS fr_confirmation_code,
      fr.status                          AS fr_status,
      fr.channel                         AS fr_channel,
      fr.cleaning_arrangement            AS fr_cleaning_arrangement,
      fr.special_requests_notes          AS fr_special_requests_notes,
      fr.internal_notes                  AS fr_internal_notes,
      fr.access_info_sent_at             AS fr_access_info_sent_at,
      fr.actual_arrival                  AS fr_actual_arrival,
      fr.actual_departure                AS fr_actual_departure,
      gr.guesty_id                       AS gr_guesty_id,
      gr.confirmation_code               AS gr_confirmation_code,
      gr.status                          AS gr_status,
      gr.channel                         AS gr_channel,
      gr.check_in_date                   AS gr_check_in_date,
      gr.check_out_date                  AS gr_check_out_date,
      gr.nights                          AS gr_nights,
      gr.adults                          AS gr_adults,
      gr.children                        AS gr_children,
      gr.infants                         AS gr_infants,
      gr.guest_first_name                AS gr_guest_first_name,
      gr.guest_last_name                 AS gr_guest_last_name,
      gr.guest_email                     AS gr_guest_email,
      gr.guest_phone                     AS gr_guest_phone,
      gr.total_amount_minor              AS gr_total_amount_minor,
      gr.currency_code                   AS gr_currency_code,
      gr.raw                             AS gr_raw,
      gl.id                              AS gl_id,
      gl.guesty_id                       AS gl_guesty_id,
      gl.nickname                        AS gl_nickname,
      gl.title                           AS gl_title,
      gl.address_full                    AS gl_address_full,
      gl.address_city                    AS gl_address_city,
      gl.address_country                 AS gl_address_country,
      gl.picture_url                     AS gl_picture_url,
      gl.property_type                   AS gl_property_type,
      gl.bedrooms                        AS gl_bedrooms,
      gl.accommodates                    AS gl_accommodates,
      gl.raw                             AS gl_raw,
      fp.id                              AS fp_id,
      fp.code                            AS fp_code
    FROM fad_reservations fr
    LEFT JOIN guesty_reservations gr
      ON gr.tenant_id = fr.tenant_id AND gr.guesty_id = fr.guesty_id
    LEFT JOIN guesty_listings gl
      ON gl.tenant_id = fr.tenant_id AND gl.guesty_id = gr.listing_guesty_id
    LEFT JOIN fad_properties fp
      ON fp.id = fr.property_id
    WHERE fr.id = $1 AND fr.tenant_id = $2
    LIMIT 1
    `,
    [reservationId, tenantId],
  );
  if (rows.length === 0) return null;
  const r = rows[0];

  // Photo gallery: prefer editorial (fad_property_photos) if any rows
  // exist for this property, else fall back to raw.pictures.
  let photos = [];
  if (r.fp_id) {
    const ph = await query(
      `SELECT url, alt_text, is_hero, display_order
         FROM fad_property_photos
        WHERE property_id = $1
        ORDER BY is_hero DESC, display_order ASC, created_at ASC
        LIMIT 12`,
      [r.fp_id],
    );
    photos = ph.rows.map((row) => ({ src: row.url, alt: row.alt_text || r.gl_title || 'Property photo' }));
  }
  if (photos.length === 0 && Array.isArray(r.gl_raw?.pictures)) {
    photos = r.gl_raw.pictures.slice(0, 12).map((p) => ({
      src: p.original || p.thumbnail || p.url,
      alt: r.gl_title || 'Property photo',
    })).filter((p) => p.src);
  }

  return {
    fad: {
      id: r.fr_id,
      confirmation_code: r.fr_confirmation_code,
      status: r.fr_status,
      channel: r.fr_channel,
      cleaning_arrangement: r.fr_cleaning_arrangement,
      special_requests_notes: r.fr_special_requests_notes,
      internal_notes: r.fr_internal_notes,
      access_info_sent_at: r.fr_access_info_sent_at,
      actual_arrival: r.fr_actual_arrival,
      actual_departure: r.fr_actual_departure,
    },
    guesty: {
      guesty_id: r.gr_guesty_id,
      confirmation_code: r.gr_confirmation_code,
      status: r.gr_status,
      channel: r.gr_channel,
      check_in_date: r.gr_check_in_date,
      check_out_date: r.gr_check_out_date,
      nights: r.gr_nights,
      adults: r.gr_adults || 0,
      children: r.gr_children || 0,
      infants: r.gr_infants || 0,
      guest_first_name: r.gr_guest_first_name,
      guest_last_name: r.gr_guest_last_name,
      guest_email: r.gr_guest_email,
      guest_phone: r.gr_guest_phone,
      total_amount_minor: r.gr_total_amount_minor,
      currency_code: r.gr_currency_code,
      raw: r.gr_raw || {},
    },
    listing: {
      id: r.gl_id,
      guesty_id: r.gl_guesty_id,
      nickname: r.gl_nickname,
      title: r.gl_title,
      address_full: r.gl_address_full,
      address_city: r.gl_address_city,
      address_country: r.gl_address_country,
      picture_url: r.gl_picture_url,
      property_type: r.gl_property_type,
      bedrooms: r.gl_bedrooms,
      accommodates: r.gl_accommodates,
      raw: r.gl_raw || {},
    },
    property: {
      id: r.fp_id,
      code: r.fp_code,
    },
    photos,
  };
}

async function extractThreadMessages(threadId, guestNameFromToken) {
  if (!threadId) return [];
  const { rows } = await query(
    `SELECT id, event_type, payload, created_at
       FROM inbox_events
      WHERE thread_id = $1
        AND event_type IN (
          'website.visitor_message',
          'staff.reply_sent',
          'contact.form_submitted',
          'booking.request_submitted',
          'experience.enquiry_submitted'
        )
      ORDER BY created_at ASC
      LIMIT 50`,
    [threadId],
  );
  const out = [];
  for (const r of rows) {
    const p = r.payload || {};
    if (r.event_type === 'website.visitor_message') {
      const text = pickText(p, ['message', 'text', 'body']);
      if (!text) continue;
      out.push({
        id: r.id,
        author: 'visitor',
        authorDisplayName: guestNameFromToken || p.guest_name || p.fromName || 'You',
        text,
        sentAt: r.created_at.toISOString(),
      });
    } else if (r.event_type === 'staff.reply_sent') {
      const text = pickText(p, ['message', 'text', 'body', 'replyBody']);
      if (!text) continue;
      out.push({
        id: r.id,
        author: 'friday_team',
        authorDisplayName: 'Friday team',
        text,
        sentAt: r.created_at.toISOString(),
      });
    } else if (r.event_type === 'contact.form_submitted'
            || r.event_type === 'booking.request_submitted'
            || r.event_type === 'experience.enquiry_submitted') {
      // Surface the original form message as the visitor's opening
      // turn so the conversation has a starting point.
      const text = pickText(p, ['message', 'notes', 'note', 'requestNote', 'guestNote']);
      if (!text) continue;
      out.push({
        id: r.id,
        author: 'visitor',
        authorDisplayName: guestNameFromToken || p.guestName || p.guest_name || 'You',
        text,
        sentAt: r.created_at.toISOString(),
      });
    }
  }
  return out;
}

function pickText(payload, keys) {
  for (const k of keys) {
    const v = payload?.[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function deriveThreadStatus(messages) {
  if (!messages || messages.length === 0) return 'awaiting_friday';
  const last = messages[messages.length - 1];
  return last.author === 'visitor' ? 'awaiting_friday' : 'awaiting_visitor';
}

function computeVisibility(bundle, now) {
  const ci = parseStayDate(bundle.guesty.check_in_date);
  const co = parseStayDate(bundle.guesty.check_out_date);
  const ciTime = applyTimeOfDay(ci, bundle.listing.raw?.defaultCheckInTime || '15:00');
  const coTime = applyTimeOfDay(co, bundle.listing.raw?.defaultCheckOutTime || '10:00');
  const accessOpensAt = ciTime ? new Date(ciTime.getTime() - ACCESS_WINDOW_MS) : null;
  const portalExpiresAt = coTime ? new Date(coTime.getTime() + POST_CHECKOUT_PORTAL_MS) : null;

  let currentStage = STAGE_POST_BOOKING;
  if (now >= ciTime) currentStage = STAGE_IN_STAY;
  if (now >= coTime) currentStage = STAGE_POST_CHECKOUT;
  if (now < ciTime && accessOpensAt && now >= accessOpensAt) currentStage = STAGE_ACCESS_WINDOW;
  else if (now < ciTime) currentStage = STAGE_PRE_ARRIVAL;
  if (portalExpiresAt && now > portalExpiresAt) currentStage = STAGE_EXPIRED;

  const cancelled = (bundle.guesty.status === 'cancelled') || (bundle.fad.status === 'cancelled');
  const confirmed = !cancelled && (bundle.fad.status === 'confirmed' || bundle.guesty.status === 'confirmed' || bundle.guesty.status === 'inquiry');
  const accessUnlocked = !cancelled && (currentStage === STAGE_ACCESS_WINDOW
    || currentStage === STAGE_IN_STAY
    || !!bundle.fad.access_info_sent_at);
  const inStayOrLater = currentStage === STAGE_IN_STAY
    || currentStage === STAGE_POST_CHECKOUT
    || currentStage === STAGE_ACCESS_WINDOW;

  const reasons = [];
  reasons.push({
    field: 'exactAddress',
    status: confirmed ? 'available' : 'locked',
    code: confirmed ? 'available' : 'reservation_not_confirmed',
    message: confirmed
      ? 'Address visible because the booking is confirmed.'
      : 'Exact address shows once the booking is confirmed.',
  });
  reasons.push({
    field: 'accessCodes',
    status: accessUnlocked ? 'available' : 'locked',
    code: accessUnlocked ? 'available' : 'too_early',
    ...(accessOpensAt && !accessUnlocked ? { availableAt: accessOpensAt.toISOString() } : {}),
    message: accessUnlocked
      ? 'Access codes are available.'
      : 'Access codes show 4 hours before your declared arrival.',
  });
  reasons.push({
    field: 'accessInstructions',
    status: accessUnlocked ? 'available' : 'locked',
    code: accessUnlocked ? 'available' : 'too_early',
    ...(accessOpensAt && !accessUnlocked ? { availableAt: accessOpensAt.toISOString() } : {}),
    message: accessUnlocked
      ? 'Arrival instructions are available.'
      : 'Detailed arrival steps appear with your access codes.',
  });
  reasons.push({
    field: 'wifiPassword',
    status: inStayOrLater ? 'available' : 'locked',
    code: inStayOrLater ? 'available' : 'too_early',
    ...(accessOpensAt && !inStayOrLater ? { availableAt: accessOpensAt.toISOString() } : {}),
    message: inStayOrLater
      ? 'Wi-Fi password is available.'
      : 'Wi-Fi appears alongside access on arrival day.',
  });
  reasons.push({
    field: 'addons',
    status: confirmed && currentStage !== STAGE_EXPIRED ? 'available' : 'locked',
    code: confirmed ? 'available' : 'reservation_not_confirmed',
    message: confirmed
      ? 'Experiences and extras are open.'
      : 'Add-ons unlock when the booking is confirmed.',
  });

  return {
    currentStage,
    canViewExactAddress: confirmed,
    canViewAccessInstructions: accessUnlocked,
    canViewAccessCodes: accessUnlocked,
    canViewWifiPassword: inStayOrLater,
    canSubmitCheckInForm: confirmed && currentStage !== STAGE_EXPIRED,
    canRequestAddons: confirmed && currentStage !== STAGE_EXPIRED,
    reasons,
  };
}

function parseStayDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d;
  // Date columns serialise as YYYY-MM-DD strings; parse as Mauritius
  // local midnight (the stay is anchored to local dates).
  return new Date(`${String(d).slice(0, 10)}T00:00:00+04:00`);
}

function applyTimeOfDay(date, hhmm) {
  if (!date) return null;
  const [hh, mm] = String(hhmm || '15:00').split(':').map((s) => parseInt(s, 10) || 0);
  const out = new Date(date.getTime());
  // Build a fresh Mauritius-local timestamp at hh:mm.
  const isoDate = out.toISOString().slice(0, 10);
  return new Date(`${isoDate}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+04:00`);
}

function buildReservationBlock(bundle) {
  const channel = mapReservationChannel(bundle.fad.channel || bundle.guesty.channel);
  return {
    id: bundle.fad.id,
    confirmationCode: bundle.fad.confirmation_code
      || bundle.guesty.confirmation_code
      || `FR-${String(bundle.fad.id).slice(0, 8).toUpperCase()}`,
    status: mapReservationStatus(bundle.fad.status || bundle.guesty.status),
    channel,
    checkIn: dateOnly(bundle.guesty.check_in_date),
    checkOut: dateOnly(bundle.guesty.check_out_date),
    checkInTime: bundle.listing.raw?.defaultCheckInTime || '15:00',
    checkOutTime: bundle.listing.raw?.defaultCheckOutTime || '10:00',
    nights: bundle.guesty.nights || 0,
    guests: {
      adults: bundle.guesty.adults
        || bundle.guesty.raw?.guestsCount
        || bundle.guesty.raw?.guests
        || 0,
      children: bundle.guesty.children || 0,
      infants: bundle.guesty.infants || 0,
    },
    primaryGuest: {
      displayName: [bundle.guesty.guest_first_name, bundle.guesty.guest_last_name]
        .filter(Boolean).join(' ') || 'Guest',
      ...(bundle.guesty.guest_email ? { emailMasked: maskEmail(bundle.guesty.guest_email) } : {}),
      ...(bundle.guesty.guest_phone ? { phoneMasked: maskPhone(bundle.guesty.guest_phone) } : {}),
    },
    payment: {
      currency: normaliseCurrency(bundle.guesty.currency_code),
      ...(bundle.guesty.total_amount_minor != null
        ? { totalAmount: Number(bundle.guesty.total_amount_minor) / 100 }
        : {}),
      balanceDue: 0,
      status: 'paid',
    },
  };
}

function mapReservationChannel(c) {
  const v = String(c || '').toLowerCase();
  if (v === 'airbnb') return 'airbnb';
  if (v === 'booking' || v === 'bookingcom' || v === 'booking.com') return 'booking';
  if (v === 'vrbo') return 'vrbo';
  if (v === 'direct' || v === 'friday' || v === 'website') return 'friday_mu';
  if (v === 'owner') return 'owner';
  return 'other';
}

function mapReservationStatus(s) {
  const v = String(s || '').toLowerCase();
  if (v === 'checked_in') return 'checked_in';
  if (v === 'checked_out') return 'checked_out';
  if (v === 'cancelled' || v === 'canceled') return 'cancelled';
  if (v === 'hold') return 'hold';
  return 'confirmed';
}

function normaliseCurrency(c) {
  const v = String(c || '').toUpperCase();
  return ['EUR', 'MUR', 'USD'].includes(v) ? v : 'EUR';
}

function maskEmail(e) {
  if (!e) return '';
  const [user, domain] = String(e).split('@');
  if (!domain) return e;
  const head = user.length <= 2 ? user[0] : user.slice(0, 2);
  return `${head}***@${domain}`;
}

function maskPhone(p) {
  if (!p) return '';
  const digits = String(p).replace(/[^0-9+]/g, '');
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)} *** ${digits.slice(-2)}`;
}

function dateOnly(d) {
  if (!d) return '';
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

function buildListingBlock(bundle) {
  const heroPhoto = bundle.photos[0] || (bundle.listing.picture_url
    ? { src: bundle.listing.picture_url, alt: bundle.listing.title || 'Property photo' }
    : null);
  const area = bundle.listing.address_city || extractAreaFromAddress(bundle.listing.address_full) || 'Mauritius';
  return {
    id: bundle.listing.id || bundle.listing.guesty_id || 'unknown',
    propertyCode: bundle.listing.nickname || bundle.property?.code || bundle.fad.confirmation_code || '—',
    name: bundle.listing.title || bundle.listing.nickname || 'Friday property',
    area,
    publicLocationLabel: area,
    ...(heroPhoto ? { image: heroPhoto } : {}),
    ...(bundle.photos.length > 0 ? { photos: bundle.photos } : {}),
    ...(bundle.listing.address_full ? {
      exactAddress: bundle.listing.address_full,
      mapsUrl: `https://maps.google.com/?q=${encodeURIComponent(bundle.listing.address_full)}`,
    } : {}),
  };
}

function extractAreaFromAddress(addr) {
  if (!addr) return null;
  // Guesty addresses look like "Royal Road, Flic en Flac, Mauritius" —
  // middle segment is usually the area.
  const parts = String(addr).split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 2];
  return parts[0] || null;
}

function buildChecklistBlock(bundle, visibility) {
  const items = [];
  items.push({
    id: 'payment',
    label: 'Booking confirmed and paid',
    status: 'complete',
  });
  items.push({
    id: 'check_in_form',
    label: 'Pre-arrival form complete',
    status: visibility.canSubmitCheckInForm ? 'required' : 'locked',
    ...(visibility.canSubmitCheckInForm ? { href: '#check-in' } : {}),
  });
  items.push({
    id: 'identity_documents',
    label: 'Passports / IDs on file',
    status: 'required',
    reason: 'Upload via the pre-arrival form.',
  });
  items.push({
    id: 'arrival_time',
    label: 'Arrival time shared',
    status: 'optional',
    href: '#check-in',
  });
  items.push({
    id: 'house_rules',
    label: 'House rules accepted',
    status: 'required',
  });
  items.push({
    id: 'access_ready',
    label: 'Access details available',
    status: visibility.canViewAccessCodes ? 'complete' : 'locked',
    ...(visibility.canViewAccessCodes ? {} : { reason: 'Reveals 4 hours before your declared arrival.' }),
  });
  return items;
}

function buildArrivalBlock(bundle, visibility) {
  const out = {
    checkInTime: bundle.listing.raw?.defaultCheckInTime || '15:00',
    checkOutTime: bundle.listing.raw?.defaultCheckOutTime || '10:00',
  };
  const directions = bundle.listing.raw?.publicDescription?.transit
    || bundle.listing.raw?.publicDescription?.gettingAround
    || null;
  if (directions) out.publicDirections = String(directions).slice(0, 600);
  out.fallbackInstructions = 'If anything is unclear or the codes do not work, call the team on +230 408 4119. We are on standby through your check-in window.';
  if (visibility.canViewAccessCodes) {
    const codes = [];
    const doorCode = bundle.listing.raw?.doorCode;
    const lockCode = bundle.listing.raw?.lockCode;
    if (doorCode) codes.push({ label: 'Door code', value: String(doorCode).trim() });
    if (lockCode && String(lockCode).trim() !== String(doorCode || '').trim()) {
      codes.push({ label: 'Lock code', value: String(lockCode).trim() });
    }
    if (codes.length > 0) out.accessCodes = codes;
  }
  return out;
}

function buildHouseGuideBlock(bundle) {
  const sections = [];
  const wifiCards = [];
  const wifiName = bundle.listing.raw?.wifiName;
  const wifiPassword = bundle.listing.raw?.wifiPassword;
  if (wifiName) {
    wifiCards.push({
      id: 'wifi-main',
      category: 'wifi_tech',
      title: 'Wi-Fi',
      body: wifiPassword
        ? `Network: ${wifiName}. Password unlocks alongside your access codes on arrival.`
        : `Network: ${wifiName}. Password shows alongside your access codes on arrival.`,
      surface: 'guest_facing',
      sensitivity: 'access_sensitive',
    });
  }
  if (wifiCards.length > 0) sections.push({ id: 'wifi-tech', title: 'Wi-Fi and tech', cards: wifiCards });

  const amenities = Array.isArray(bundle.listing.raw?.amenities) ? bundle.listing.raw.amenities : [];
  if (amenities.length > 0) {
    sections.push({
      id: 'amenities',
      title: 'In the residence',
      cards: [{
        id: 'amenities-summary',
        category: 'appliances',
        title: 'Amenities at a glance',
        body: amenities.slice(0, 20).join(' · '),
        surface: 'guest_facing',
        sensitivity: 'stay_only',
      }],
    });
  }

  sections.push({
    id: 'emergency',
    title: 'Emergency',
    cards: [{
      id: 'emergency-numbers',
      category: 'emergency',
      title: 'Emergency contacts',
      body: 'Police 999 · Ambulance 114 · Fire 115. Friday on-call line is +230 408 4119.',
      surface: 'guest_facing',
      sensitivity: 'public',
    }],
  });

  return sections;
}

function buildExploreBlock(_bundle) {
  // Curated content source not wired yet (Sanity / Notion). Returning
  // a single nearby-essentials section so the surface renders.
  return [];
}

function buildAddonsBlock(_bundle) {
  // Bokun feed not wired yet — addons section renders empty on the
  // portal until the experiences slice lands.
  return [];
}

module.exports = router;
