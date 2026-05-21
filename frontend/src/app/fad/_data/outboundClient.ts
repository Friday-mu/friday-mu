'use client';

// Unified outbound client — single entry point for all message sends
// (guest reply, team channel, team DM, owner/vendor email, …). Maps
// to backend's POST /api/outbound/send.
//
// Why this exists: per locked decision §2 (2026-05-17) FAD has ONE
// outbound abstraction so future channels (Meta Hub, autonomous send)
// drop in at the backend without callers needing to know which API
// to hit. The legacy per-channel client helpers (sendCompose,
// sendChannelMessage, sendDmMessage) now route through this. Their
// callers don't need to change.

import { apiFetch } from '../../../components/types';

export type OutboundAudience = 'guest' | 'owner' | 'vendor' | 'team' | 'unclassified';
export type OutboundChannel =
  | 'whatsapp' | 'airbnb' | 'booking' | 'email'
  | 'team-channel' | 'team-dm';

export interface OutboundSendOpts {
  audience: OutboundAudience;
  channel: OutboundChannel;
  contextId: string;
  body: string;
  meta?: Record<string, unknown>;
}

export interface OutboundSendResp {
  ok: boolean;
  messageId?: string | null;
  draftId?: string | null;
  sentAt?: string;
  upstream?: unknown;
}

export async function outboundSend(opts: OutboundSendOpts): Promise<OutboundSendResp> {
  return apiFetch('/api/outbound/send', {
    method: 'POST',
    body: JSON.stringify(opts),
  }) as Promise<OutboundSendResp>;
}
