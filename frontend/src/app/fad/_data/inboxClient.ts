'use client';

// Live conversations + thread detail fetched from /api/inbox/* (FAD backend
// → GMS). Coexists with the INBOX_THREADS fixture in fixtures.ts; the inbox
// UI migrates to useLiveConversations() / useThreadDetail() at its own pace
// (InboxModule wiring lands in bw-6).
//
// Adapter philosophy: GMS owns the data, FAD owns the display shape. The
// transformer narrows GMS's broader record into FAD's InboxThread interface
// with neutral fallbacks so a malformed entry never crashes the page.

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE, apiFetch, formatConfidencePercent, getToken } from '../../../components/types';
import type { InboxThread, InboxMessage, InboxChannel, InboxReservation, InboxDraft, DraftState, WebsiteAIHandoff } from './fixtures';

// ───────── enum mappers ─────────

function mapChannelKey(channel: unknown): InboxChannel {
  const s = String(channel ?? '').toLowerCase();
  if (s.includes('airbnb')) return 'airbnb';
  if (s.includes('booking') || s === 'bdc' || s === 'bookingcom') return 'booking';
  if (s.includes('whatsapp') || s === 'wa') return 'whatsapp';
  if (s.includes('email') || s === 'mail') return 'email';
  if (s.includes('vrbo')) return 'airbnb'; // FAD enum has no vrbo; collapse to airbnb visually
  return 'email';
}

function mapTriage(status: unknown): InboxThread['triageStatus'] {
  const s = String(status ?? '').toLowerCase();
  if (s === 'done' || s === 'completed') return 'done';
  if (s === 'snoozed' || s === 'review') return 'review';
  if (s === 'spam') return 'done';
  return 'open';
}

function mapUrgent(sentiment: unknown, urgencyScore: number | undefined): InboxThread['urgent'] {
  const s = String(sentiment ?? '').toLowerCase();
  if (urgencyScore !== undefined && urgencyScore >= 0.8) return 'red';
  if (s === 'negative') return 'red';
  if (s === 'mixed' || (urgencyScore !== undefined && urgencyScore >= 0.5)) return 'amber';
  return undefined;
}

function mapSentiment(s: unknown): InboxThread['sentiment'] {
  const v = String(s ?? '').toLowerCase();
  if (v === 'positive') return 'positive';
  if (v === 'negative') return 'negative';
  if (v === 'urgent') return 'urgent';
  return 'neutral';
}

function mapLanguage(lang: unknown): InboxThread['language'] {
  const v = String(lang ?? 'en').toLowerCase().slice(0, 2);
  if (v === 'fr') return 'FR';
  if (v === 'pt') return 'PT';
  if (v === 'it') return 'IT';
  if (v === 'nl') return 'NL';
  return 'EN';
}

function channelLabel(key: InboxChannel): string {
  return {
    airbnb: 'Airbnb',
    booking: 'Booking',
    whatsapp: 'WhatsApp',
    email: 'Email',
    website: 'Website',
    owner_email: 'Owner email',
    owner_whatsapp: 'Owner WhatsApp',
    vendor_breezeway: 'Breezeway',
    vendor_driver: 'Driver',
    vendor_chef: 'Chef',
  }[key];
}

function confidenceRatio(value: unknown): number | undefined {
  const percent = formatConfidencePercent(value as number | string | null | undefined);
  return percent == null ? undefined : percent / 100;
}

const BAD_SUMMARY_PATTERNS = [
  /\bi['’]?m ready to help summarize conversations\b/i,
  /\bplease (?:provide|share) the actual conversation\b/i,
  /\bi don['’]?t see a conversation history\b/i,
  /\bthere is no conversation (?:history|provided)\b/i,
];

export function usableConversationSummary(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return undefined;
  if (BAD_SUMMARY_PATTERNS.some((pattern) => pattern.test(text))) return undefined;
  return text;
}

// ───────── shape adapters ─────────
//
// Real GMS conversation shape (verified 2026-05-12):
//   list (GET /api/inbox/conversations) returns { conversations: [...], total }.
//   Each conversation row: id, guesty_conversation_id, guesty_reservation_id,
//     property_id, guest_name, guest_email, property_name, channel, status
//     (active|done|spam|snoozed), last_message_at, check_in_date,
//     check_out_date, num_guests, notes, conversation_summary, created_at,
//     updated_at, reservation_id, first_response_minutes, sentiment,
//     last_detected_language, latest_draft_state, latest_draft_id,
//     latest_draft_confidence, inbound_count, last_message_body,
//     last_message_direction, is_unread.
//
//   detail (GET /api/inbox/conversations/:id) returns BUNDLE:
//     { conversation, messages, drafts, reservation, whatsapp_window_open,
//       whatsapp_window_expires_at, available_channels, recommended_channel,
//       seen_by }
//   No separate /messages call needed.
//
// Real GMS message shape: id, conversation_id, guesty_message_id, direction
//   ('inbound'|'outbound'), body, original_language, translated_body,
//   sender_name, created_at, sentiment, is_auto_response, sent_by,
//   sent_via_system, attachments, module_type.

// Human-readable labels for Guesty's module_type enum. Keeps the bubble
// caption short ("WhatsApp" not "whatsapp", "Airbnb" not "airbnb2").
const MODULE_TYPE_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  airbnb: 'Airbnb',
  airbnb2: 'Airbnb',
  booking: 'Booking',
  bookingcom: 'Booking',
  bookingCom: 'Booking',
  email: 'Email',
  sms: 'SMS',
  log: 'Note',
};

function transformGmsMessage(raw: Record<string, unknown>): InboxMessage {
  const direction = String(raw.direction ?? 'inbound');
  // When GMS's translateConversationMessages populated translated_body,
  // display the English translation by default and stash the original so
  // the UI can offer a "Show original" toggle.
  const translated = raw.translated_body ? String(raw.translated_body) : '';
  const original = raw.body ? String(raw.body) : '';
  const hasTranslation = translated && translated !== original;

  // For outbound, prefer the raw `sent_by` column (the reviewer's
  // actual name) over `sender_name` (which gets concatenated as
  // "Judith via Friday" by the GMS-side compose path — messy in UI).
  // Fall back to sender_name with the " via Friday" suffix stripped,
  // then to a sensible default.
  let name: string;
  if (direction === 'outbound') {
    const sentBy = raw.sent_by ? String(raw.sent_by).trim() : '';
    const senderRaw = raw.sender_name ? String(raw.sender_name).trim() : '';
    const senderCleaned = senderRaw.replace(/\s+via\s+Friday$/i, '').trim();
    name = sentBy || senderCleaned || 'Friday';
  } else {
    name = String(raw.sender_name || 'Guest');
  }

  // Where the message went out. module_type is the per-channel marker
  // (whatsapp / airbnb2 / etc.); sent_via_system is "friday" for
  // FAD-originated sends and may be missing on webhook-arrived rows.
  // We surface module_type as the primary "via" since that's what the
  // operator cares about (which channel did it actually go on).
  let via: string | undefined;
  let viaChannel: string | undefined;
  const moduleType = raw.module_type ? String(raw.module_type) : '';
  if (moduleType) {
    viaChannel = MODULE_TYPE_LABEL[moduleType.toLowerCase()] || MODULE_TYPE_LABEL[moduleType] || moduleType;
    via = viaChannel;
  } else if (raw.sent_via_system) {
    via = String(raw.sent_via_system) === 'friday' ? 'Friday' : String(raw.sent_via_system);
  }
  const sentViaSystem = raw.sent_via_system ? String(raw.sent_via_system) : '';
  const viaSystem = sentViaSystem === 'friday'
    ? 'FAD'
    : sentViaSystem === 'guesty'
      ? 'Guesty'
      : direction === 'outbound' && /via\s+Friday$/i.test(String(raw.sender_name || ''))
        ? 'FAD'
        : 'Guesty';

  return {
    from: direction === 'outbound' ? 'us' : 'them',
    name,
    time: String(raw.created_at || new Date().toISOString()),
    body: hasTranslation ? translated : (original || translated),
    bodyOriginal: hasTranslation ? original : undefined,
    bodyLang: raw.original_language ? String(raw.original_language) : undefined,
    via,
    viaSystem,
    viaChannel,
  };
}

interface WhatsAppWindowInfo {
  open: boolean;
  expiresAt?: string;
}

function transformGmsReservation(raw: Record<string, unknown>): InboxReservation {
  const num = (v: unknown): number | undefined =>
    v == null ? undefined : (Number.isFinite(Number(v)) ? Number(v) : undefined);
  const money = (major: unknown, minor: unknown): number | undefined => {
    const majorValue = num(major);
    if (majorValue !== undefined) return majorValue;
    const minorValue = num(minor);
    return minorValue === undefined ? undefined : minorValue / 100;
  };
  const guestName = raw.guest_name
    ? String(raw.guest_name)
    : [raw.guest_first_name, raw.guest_last_name].filter(Boolean).map(String).join(' ').trim();
  const availabilityRaw = raw.availability_context && typeof raw.availability_context === 'object'
    ? raw.availability_context as Record<string, unknown>
    : undefined;
  return {
    id: String(raw.id || raw.guesty_reservation_id || raw.guesty_id || ''),
    guestyReservationId: raw.guesty_reservation_id
      ? String(raw.guesty_reservation_id)
      : (raw.guesty_id ? String(raw.guesty_id) : undefined),
    confirmationCode: raw.confirmation_code ? String(raw.confirmation_code) : undefined,
    source: raw.operational_context_source ? String(raw.operational_context_source) : (raw.source ? String(raw.source) : undefined),
    listingName: raw.listing_name
      ? String(raw.listing_name)
      : (raw.listing_nickname ? String(raw.listing_nickname) : (raw.listing_guesty_id ? String(raw.listing_guesty_id) : undefined)),
    listingGuestyId: raw.listing_guesty_id ? String(raw.listing_guesty_id) : undefined,
    status: raw.status ? String(raw.status) : undefined,
    channel: raw.channel ? String(raw.channel) : (raw.source ? String(raw.source) : undefined),
    checkIn: raw.check_in ? String(raw.check_in) : (raw.check_in_date ? String(raw.check_in_date) : undefined),
    checkOut: raw.check_out ? String(raw.check_out) : (raw.check_out_date ? String(raw.check_out_date) : undefined),
    numberOfNights: num(raw.number_of_nights ?? raw.nights),
    numGuests: num(raw.num_guests ?? raw.guests_count),
    adults: num(raw.adults),
    children: num(raw.children),
    infants: num(raw.infants),
    guestName: guestName || undefined,
    guestEmail: raw.guest_email ? String(raw.guest_email) : undefined,
    guestPhone: raw.guest_phone ? String(raw.guest_phone) : undefined,
    totalPrice: money(raw.total_price, raw.total_amount_minor),
    amountPaid: num(raw.amount_paid),
    outstandingBalance: num(raw.outstanding_balance),
    paymentStatus: raw.payment_status ? String(raw.payment_status) : undefined,
    currency: raw.currency ? String(raw.currency) : (raw.currency_code ? String(raw.currency_code) : undefined),
    accommodationFare: num(raw.accommodation_fare),
    cleaningFee: num(raw.cleaning_fee),
    nightlyRate: num(raw.nightly_rate),
    specialRequests: raw.special_requests ? String(raw.special_requests) : undefined,
    availability: availabilityRaw ? {
      status: availabilityRaw.status ? String(availabilityRaw.status) : undefined,
      rowsCached: num(availabilityRaw.rows_cached),
      nightsRequested: num(availabilityRaw.nights_requested),
      blockedDates: Array.isArray(availabilityRaw.blocked_dates)
        ? availabilityRaw.blocked_dates.map(String)
        : undefined,
      minPrice: num(availabilityRaw.min_price),
      maxPrice: num(availabilityRaw.max_price),
      currency: availabilityRaw.currency ? String(availabilityRaw.currency) : undefined,
      message: availabilityRaw.message ? String(availabilityRaw.message) : undefined,
    } : undefined,
  };
}

export function transformGmsDraft(raw: Record<string, unknown>): InboxDraft {
  const num = (v: unknown): number | undefined =>
    v == null ? undefined : (Number.isFinite(Number(v)) ? Number(v) : undefined);
  const state = (raw.state ? String(raw.state) : 'draft_ready') as DraftState;
  const sentAt = raw.sent_at || raw.delivered_at || (state === 'sent' ? raw.updated_at : null);
  return {
    id: String(raw.id || ''),
    state,
    body: String(raw.draft_body || raw.body || ''),
    bodyTranslated: raw.translated_content
      ? String(raw.translated_content)
      : raw.draft_translated
        ? String(raw.draft_translated)
        : undefined,
    confidence: confidenceRatio(raw.confidence),
    revisionNumber: num(raw.revision_number),
    revisionInstruction: raw.revision_instruction ? String(raw.revision_instruction) : undefined,
    modelUsed: raw.model_used ? String(raw.model_used) : undefined,
    createdAt: String(sentAt || raw.created_at || raw.updated_at || new Date().toISOString()),
    sentAt: sentAt ? String(sentAt) : undefined,
    retryCount: num(raw.retry_count),
    nextRetryAt: raw.next_retry_at ? String(raw.next_retry_at) : undefined,
    rejectionReason: raw.rejection_reason ? String(raw.rejection_reason) : undefined,
  };
}

export function transformGmsConversation(
  raw: Record<string, unknown>,
  messagesRaw?: Record<string, unknown>[],
  waWindow?: WhatsAppWindowInfo,
  reservationRaw?: Record<string, unknown>,
  draftsRaw?: Record<string, unknown>[],
  availableChannels?: string[],
  recommendedChannel?: string,
): InboxThread {
  const channelKey = mapChannelKey(raw.channel ?? raw.communication_channel);
  const status = raw.status;
  const sentiment = raw.sentiment;
  const confidence = confidenceRatio(raw.latest_draft_confidence);
  // Treat low-confidence drafts as "amber" urgency signal alongside sentiment.
  // (1 - confidence) gives an urgency proxy; 0.5+ confidence-gap → amber.
  const draftUrgency = confidence !== undefined ? 1 - confidence : undefined;

  const summary = usableConversationSummary(raw.conversation_summary);
  const preview = String(raw.last_message_body || summary || '').slice(0, 200);
  // GMS has no subject field — guests just send messages. Use summary as
  // "subject line" when present; fall back to first 80 chars of preview.
  const subject = summary
    ? summary.split(/[.!?]/)[0].slice(0, 100)
    : (preview ? preview.slice(0, 80) : '(no subject)');

  const messages: InboxMessage[] | undefined = messagesRaw
    ? messagesRaw.map(transformGmsMessage)
    : undefined;

  // WhatsApp window: GMS gives `whatsapp_window_open` (bool) +
  // `whatsapp_window_expires_at` (ISO timestamp). Convert to "minutes until
  // expiry" for the existing FAD UI chip.
  let whatsappWindow: InboxThread['whatsappWindow'];
  if (channelKey === 'whatsapp' && waWindow) {
    let expiresInMinutes: number | undefined;
    if (waWindow.expiresAt) {
      const ms = new Date(waWindow.expiresAt).getTime() - Date.now();
      expiresInMinutes = Math.max(0, Math.round(ms / 60_000));
    }
    whatsappWindow = { open: waWindow.open, expiresInMinutes, expiresAt: waWindow.expiresAt };
  }

  const drafts: InboxDraft[] | undefined = draftsRaw
    ? draftsRaw.map(transformGmsDraft)
    : undefined;
  const guestEmail = raw.guest_email ? String(raw.guest_email) : undefined;
  const guestPhone = raw.guest_phone ? String(raw.guest_phone) : undefined;
  const reservation = reservationRaw ? transformGmsReservation(reservationRaw) : undefined;
  if (reservation) {
    reservation.guestEmail ||= guestEmail;
    reservation.guestPhone ||= guestPhone;
    reservation.guestName ||= raw.guest_name ? String(raw.guest_name) : undefined;
  }

  return {
    id: String(raw.id || `conv-${Math.random().toString(36).slice(2, 9)}`),
    unread: Boolean(raw.is_unread),
    urgent: mapUrgent(sentiment, draftUrgency),
    guest: String(raw.guest_name || 'Guest'),
    subject,
    preview,
    channel: channelLabel(channelKey),
    entity: 'guest',
    channelKey,
    property: String(raw.property_name || ''),
    time: String(raw.last_message_at || raw.updated_at || raw.created_at || new Date().toISOString()),
    triageStatus: mapTriage(status),
    stayStatus: undefined, // could derive from reservation.check_in/out_date in detail view
    reservationId: raw.reservation_id ? String(raw.reservation_id) : undefined,
    mentionsMe: false, // GMS has no @-mention concept yet
    messages,
    summary,
    sentiment: mapSentiment(sentiment),
    language: mapLanguage(raw.last_detected_language),
    whatsappWindow,
    guestEmail,
    guestPhone,
    reservation,
    drafts,
    availableChannels,
    recommendedChannel,
    latestDraftState: raw.latest_draft_state ? (String(raw.latest_draft_state) as DraftState) : undefined,
    latestDraftConfidence: confidenceRatio(raw.latest_draft_confidence),
  };
}

// ───────── load functions ─────────

interface ConvListResp {
  conversations?: unknown;
  total?: number;
}

interface ConvDetailResp {
  conversation: Record<string, unknown>;
  messages?: Record<string, unknown>[];
  drafts?: Record<string, unknown>[];
  reservation?: Record<string, unknown>;
  whatsapp_window_open?: boolean;
  whatsapp_window_expires_at?: string;
  available_channels?: string[];
  recommended_channel?: string;
}

function websiteEventBody(eventType: string, payload?: Record<string, unknown>): string {
  if (!payload) return eventType;
  if (eventType === 'website.ai_handoff') {
    const extracted = payload.extracted && typeof payload.extracted === 'object' && !Array.isArray(payload.extracted)
      ? Object.entries(payload.extracted as Record<string, unknown>)
      : [];
    const tail = Array.isArray(payload.transcriptTail)
      ? (payload.transcriptTail as Array<Record<string, unknown>>).slice(-4)
      : [];
    return [
      'Website AI handoff.',
      payload.surface ? `Surface: ${payload.surface}` : null,
      payload.confidence ? `Confidence: ${payload.confidence}` : null,
      payload.aiReplyState ? `AI state: ${payload.aiReplyState}` : null,
      payload.escalationReason ? `Escalation: ${payload.escalationReason}` : null,
      payload.recommendedNextAction ? `Next: ${payload.recommendedNextAction}` : null,
      payload.visitorTurn ? `Latest visitor turn: ${payload.visitorTurn}` : null,
      payload.conversationSummary ? `Summary: ${payload.conversationSummary}` : null,
      extracted.length
        ? `Extracted:\n${extracted.slice(0, 8).map(([k, v]) => `- ${k}: ${String(v)}`).join('\n')}`
        : null,
      tail.length
        ? `Transcript tail:\n${tail.map((m) => `${m.role || 'message'}: ${String(m.content || '')}`).join('\n')}`
        : null,
    ].filter(Boolean).join('\n\n');
  }
  if (eventType === 'website.ai_handoff_takeover') {
    const takenBy = payload.takenBy && typeof payload.takenBy === 'object'
      ? payload.takenBy as Record<string, unknown>
      : {};
    return [
      'Human takeover started.',
      'Website AI must not double-reply.',
      takenBy.displayName ? `By: ${takenBy.displayName}` : null,
      payload.reason ? `Reason: ${payload.reason}` : null,
    ].filter(Boolean).join('\n');
  }
  if (eventType === 'website.visitor_message') {
    const message = payload.body || payload.message || payload.visitorTurn;
    return typeof message === 'string' && message.trim() ? message.trim() : 'Visitor sent a follow-up message.';
  }
  const body = payload.body || payload.message;
  if (typeof body === 'string' && body.trim()) return body.trim();
  if (eventType === 'booking.request_submitted') {
    return [
      'Booking request submitted.',
      payload.residence_slug ? `Residence: ${payload.residence_slug}` : null,
      payload.check_in && payload.check_out ? `Dates: ${payload.check_in} - ${payload.check_out}` : null,
      payload.party_size ? `Guests: ${payload.party_size}` : null,
      payload.reference ? `Reference: ${payload.reference}` : null,
    ].filter(Boolean).join('\n');
  }
  if (eventType === 'booking.proof_uploaded') {
    return [
      'Payment proof uploaded.',
      payload.proof_url ? `Proof: ${payload.proof_url}` : null,
      payload.reference ? `Reference: ${payload.reference}` : null,
    ].filter(Boolean).join('\n');
  }
  return `${eventType}\n${JSON.stringify(payload, null, 2).slice(0, 400)}`;
}

function aiHandoffFromEvents(events: Array<{
  event_type?: string;
  type?: string;
  source?: string;
  created_at?: string;
  ts?: string;
  payload?: Record<string, unknown>;
}>): WebsiteAIHandoff | undefined {
  const handoffs = events.filter((e) => String(e.event_type || e.type || '') === 'website.ai_handoff');
  const latest = handoffs[handoffs.length - 1];
  if (!latest?.payload) return undefined;
  const latestConversationKey = latest.payload.conversationKey ? String(latest.payload.conversationKey) : '';
  const windowHandoffs = latestConversationKey
    ? handoffs.filter((e) => e.payload?.conversationKey && String(e.payload.conversationKey) === latestConversationKey)
    : [latest];
  const windowStart = windowHandoffs.reduce((earliest, e) => {
    const ts = new Date(e.created_at || e.ts || 0).getTime();
    return Number.isFinite(ts) ? Math.min(earliest, ts) : earliest;
  }, Number.POSITIVE_INFINITY);
  const hasTakeover = events.some((e) => {
    const eventType = String(e.event_type || e.type || '');
    if (eventType !== 'website.ai_handoff_takeover' && eventType !== 'staff.reply_sent') return false;
    const ts = new Date(e.created_at || e.ts || 0).getTime();
    return Number.isFinite(ts) && Number.isFinite(windowStart) && ts >= windowStart;
  });
  const payload = latest.payload;
  return {
    handoffId: payload.handoffId ? String(payload.handoffId) : undefined,
    surface: payload.surface ? String(payload.surface) : undefined,
    confidence: payload.confidence ? String(payload.confidence) : undefined,
    aiReplyState: payload.aiReplyState ? String(payload.aiReplyState) : undefined,
    takeoverState: hasTakeover ? 'human_takeover' : (payload.takeoverState ? String(payload.takeoverState) : 'ai_active'),
    aiMayReply: hasTakeover ? false : payload.aiMayReply !== false,
    escalationReason: payload.escalationReason ? String(payload.escalationReason) : undefined,
    recommendedNextAction: payload.recommendedNextAction ? String(payload.recommendedNextAction) : undefined,
    pageUrl: payload.pageUrl ? String(payload.pageUrl) : undefined,
    visitorTurn: payload.visitorTurn ? String(payload.visitorTurn) : undefined,
    conversationSummary: payload.conversationSummary ? String(payload.conversationSummary) : undefined,
  };
}

export async function loadConversations(): Promise<InboxThread[]> {
  const data = await apiFetch('/api/inbox/conversations') as ConvListResp;
  const raw = (data?.conversations || []) as Record<string, unknown>[];
  return raw.map((c) => transformGmsConversation(c));
}

export async function loadThreadDetail(id: string): Promise<InboxThread> {
  // Website-inbox threads carry a 'web-' prefix (see websiteInboxClient).
  // Route them to the website detail endpoint; everything else goes to
  // GMS's conversation bundle.
  if (id.startsWith('web-')) {
    const webId = id.slice(4);
    const data = await apiFetch(`/api/inbox/website/threads/${webId}`) as {
      thread?: {
        id: string;
        guest_email?: string | null;
        guest_email_raw?: string | null;
        guest_name?: string | null;
        guest_phone?: string | null;
        status: string;
        notes?: string | null;
        last_event_at?: string | null;
        last_event_type?: string | null;
      };
      events?: Array<{
        id: string;
        event_type?: string;
        type?: string;
        source?: string;
        created_at?: string;
        ts?: string;
        payload?: Record<string, unknown>;
      }>;
      drafts?: Record<string, unknown>[];
    };
    const t = data?.thread;
    const events = data?.events || [];
    const aiHandoff = aiHandoffFromEvents(events);
    const guest = aiHandoff
      ? `Website AI · ${aiHandoff.surface || 'handoff'}`
      : (t?.guest_name || t?.guest_email_raw || t?.guest_email || 'Anonymous');
    const visibleEvents = events.filter((e) => !String(e.event_type || e.type || '').startsWith('ai.'));
    const messages: InboxMessage[] = visibleEvents.map((e) => {
      const eventType = String(e.event_type || e.type || 'website.event');
      const fromUs = e.source === 'fad' || eventType.startsWith('staff.');
      const fromWebsiteAi = eventType.startsWith('website.ai_');
      const payloadChannel = typeof e.payload?.channel === 'string' ? e.payload.channel : '';
      const sentChannel = payloadChannel === 'website' ? 'Website live' : 'Email';
      return {
        from: fromUs ? 'us' as const : 'them' as const,
        name: fromUs ? 'Friday' : (fromWebsiteAi ? 'Website AI' : guest),
        time: e.created_at || e.ts || new Date().toISOString(),
        body: websiteEventBody(eventType, e.payload),
        via: fromUs ? sentChannel : (fromWebsiteAi ? 'AI handoff' : 'Website'),
        viaSystem: fromUs ? 'FAD' : (fromWebsiteAi ? 'Website AI' : 'Website'),
        viaChannel: fromUs ? sentChannel : (fromWebsiteAi ? 'AI handoff' : 'Website'),
      };
    });
    const drafts = (data.drafts || []).map(transformGmsDraft);
    const latestDraft = drafts.find((d) => d.state === 'draft_ready' || d.state === 'under_review' || d.state === 'friday_drafting' || d.state === 'generation_failed');
    const subject = aiHandoff
      ? `AI handoff · ${aiHandoff.surface || 'website'} · ${aiHandoff.confidence || 'unknown'} confidence`
      : (t?.notes ? String(t.notes).slice(0, 100) : 'Website inquiry');
    return {
      id,
      unread: t?.status === 'open' || aiHandoff?.aiMayReply === true,
      guest,
      subject,
      preview: visibleEvents[visibleEvents.length - 1]?.event_type || visibleEvents[visibleEvents.length - 1]?.type || 'inquiry',
      channel: aiHandoff ? 'Website AI' : 'Website',
      entity: aiHandoff?.surface === 'guest' ? 'guest' : aiHandoff?.surface === 'owner' ? 'owner' : 'unclassified',
      channelKey: 'website',
      property: '',
      time: t?.last_event_at || new Date().toISOString(),
      triageStatus: t?.status === 'closed' ? 'done' : 'open',
      mentionsMe: false,
      messages,
      summary: t?.notes || undefined,
      sentiment: 'neutral',
      language: 'EN',
      guestEmail: aiHandoff ? undefined : (t?.guest_email_raw || t?.guest_email || undefined),
      guestPhone: t?.guest_phone || undefined,
      drafts,
      availableChannels: aiHandoff ? ['website'] : ['email'],
      recommendedChannel: aiHandoff ? 'website' : 'email',
      latestDraftState: latestDraft?.state,
      latestDraftConfidence: latestDraft?.confidence,
      aiHandoff,
    };
  }

  // GMS /:id bundles conversation + messages + drafts + reservation +
  // whatsapp window state + channel options in one response.
  const data = await apiFetch(`/api/inbox/conversations/${id}`) as ConvDetailResp;
  const conv = data.conversation || {};
  const messages = data.messages || [];
  const waWindow: WhatsAppWindowInfo = {
    open: !!data.whatsapp_window_open,
    expiresAt: data.whatsapp_window_expires_at,
  };
  return transformGmsConversation(
    conv,
    messages,
    waWindow,
    data.reservation,
    data.drafts,
    data.available_channels,
    data.recommended_channel,
  );
}

// ───────── hooks ─────────

export interface UseLiveConversationsResult {
  threads: InboxThread[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useLiveConversations(): UseLiveConversationsResult {
  const [threads, setThreads] = useState<InboxThread[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setLoading(true);
    setError(null);
    loadConversations()
      .then(setThreads)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load inbox'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    if (typeof EventSource === 'undefined') return undefined;
    const token = getToken();
    if (!token) return undefined;
    const es = new EventSource(`${API_BASE}/api/events/stream?token=${encodeURIComponent(token)}`);
    const refresh = () => refetch();
    const eventTypes = [
      'inbox.message_received',
      'inbox.draft_ready',
      'inbox.message_sent',
      'inbox.consult_message',
    ];
    eventTypes.forEach((type) => es.addEventListener(type, refresh));
    es.onerror = () => {
      // EventSource auto-reconnects. The manual refetch button remains
      // the fallback if the stream is unavailable.
    };
    return () => {
      eventTypes.forEach((type) => es.removeEventListener(type, refresh));
      es.close();
    };
  }, [refetch]);

  return { threads, loading, error, refetch };
}

export interface UseThreadDetailResult {
  thread: InboxThread | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useThreadDetail(threadId: string | null): UseThreadDetailResult {
  const [thread, setThread] = useState<InboxThread | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshSeq, setRefreshSeq] = useState(0);
  const activeRequestRef = useRef(0);

  const refetch = useCallback(() => {
    setRefreshSeq((seq) => seq + 1);
  }, []);

  useEffect(() => {
    if (!threadId) {
      setThread(null);
      setLoading(false);
      setError(null);
      return;
    }
    const requestId = activeRequestRef.current + 1;
    activeRequestRef.current = requestId;
    setThread(null);
    setLoading(true);
    setError(null);
    loadThreadDetail(threadId)
      .then((nextThread) => {
        if (activeRequestRef.current !== requestId) return;
        if (nextThread.id !== threadId) return;
        setThread(nextThread);
      })
      .catch((e) => {
        if (activeRequestRef.current !== requestId) return;
        setError(e instanceof Error ? e.message : 'Failed to load thread');
      })
      .finally(() => {
        if (activeRequestRef.current !== requestId) return;
        setLoading(false);
      });
  }, [threadId, refreshSeq]);

  useEffect(() => {
    if (!threadId || typeof EventSource === 'undefined') return undefined;
    const token = getToken();
    if (!token) return undefined;
    const es = new EventSource(`${API_BASE}/api/events/stream?token=${encodeURIComponent(token)}`);
    const refreshIfThreadMatches = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data || '{}') as { payload?: Record<string, unknown> };
        const payload = data.payload || {};
        const eventConversationId = payload.conversationId ? String(payload.conversationId) : null;
        const eventThreadId = payload.threadId ? `web-${String(payload.threadId)}` : null;
        if (eventConversationId === threadId || eventThreadId === threadId) refetch();
      } catch {
        refetch();
      }
    };
    const eventTypes = [
      'inbox.draft_ready',
      'inbox.message_received',
      'inbox.message_sent',
      'website_inbox.thread_updated',
      'website_ai.handoff_received',
      'website_ai.takeover',
    ];
    eventTypes.forEach((type) => es.addEventListener(type, refreshIfThreadMatches));
    es.onerror = () => {};
    return () => {
      eventTypes.forEach((type) => es.removeEventListener(type, refreshIfThreadMatches));
      es.close();
    };
  }, [threadId, refetch]);

  return { thread, loading, error, refetch };
}
