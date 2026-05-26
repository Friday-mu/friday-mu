'use client';

// Portal v2 slice 2 — operator-side mutations for the
// fad_portal_booking_requests sidecar.
//
// Backend routes (admin auth, not the public-Bearer flow):
//   GET   /api/inbox/threads/:threadId/booking-request
//   PATCH /api/inbox/threads/:threadId/booking-request   action ∈ {
//     set_payment_terms | mark_proof_received | upload_proof_elsewhere |
//     mark_funds_received | queue_guesty_reservation_create |
//     decline | reset_to_review
//   }
//
// Mutating status here is what drives the website portal's
// /api/public/stays/resolve response — guest sees the new state on
// the next poll / SSE event.

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../components/types';

export type BookingRequestStatus =
  | 'pending_review'
  | 'awaiting_payment'
  | 'proof_received'
  | 'confirmed'
  | 'declined';

export type PaymentChoice = 'deposit_50' | 'full';
export type PaymentCurrency = 'EUR' | 'MUR' | 'USD';

export interface BookingRequestRecord {
  id: string;
  thread_id: string;
  request_id: string;
  listing_slug: string | null;
  listing_title: string | null;
  check_in: string | null;
  check_out: string | null;
  nights: number | null;
  party_adults: number | null;
  party_children: number | null;
  party_infants: number | null;
  quoted_total_amount_minor: number | null;
  quoted_total_currency: PaymentCurrency | null;
  status: BookingRequestStatus;
  payment_choice: PaymentChoice | null;
  payment_currency: PaymentCurrency | null;
  paid_amount_minor: number | null;
  confirmation_deadline: string | null;
  proof_url: string | null;
  proof_viewer_url: string | null;
  proof_file_name: string | null;
  proof_file_type: string | null;
  proof_file_size: number | null;
  proof_received_at: string | null;
  proof_source: string | null;
  proof_event_id: string | null;
  converted_to_reservation_id: string | null;
  declined_at: string | null;
  declined_reason: string | null;
  last_status_actor_id: string | null;
  last_status_change_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SetPaymentTermsInput {
  paymentChoice: PaymentChoice;
  paymentCurrency: PaymentCurrency;
  confirmationDeadline?: string; // ISO datetime
}

export interface MarkFundsReceivedInput {
  paidAmount: number;          // major units
  reservationId?: string;      // optional — triggers kind-switch on next resolve
}

export interface UploadProofInput {
  proofUrl?: string;
  proofViewerUrl?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  notes?: string;
}

async function loadBookingRequest(threadId: string): Promise<BookingRequestRecord | null> {
  try {
    return (await apiFetch(
      `/api/inbox/website/threads/${encodeURIComponent(threadId)}/booking-request`,
    )) as BookingRequestRecord;
  } catch (e) {
    // 404 = not a booking_request thread; treat as null.
    if (e instanceof Error && /404|not.?found/i.test(e.message)) return null;
    throw e;
  }
}

export function useBookingRequest(threadId: string | null | undefined): {
  record: BookingRequestRecord | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [record, setRecord] = useState<BookingRequestRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rev, setRev] = useState(0);

  useEffect(() => {
    if (!threadId) {
      setRecord(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadBookingRequest(threadId)
      .then((r) => { if (!cancelled) setRecord(r); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load booking request'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [threadId, rev]);

  const refetch = useCallback(() => setRev((r) => r + 1), []);
  return { record, loading, error, refetch };
}

export async function setPaymentTerms(
  threadId: string,
  input: SetPaymentTermsInput,
): Promise<BookingRequestRecord> {
  return (await apiFetch(`/api/inbox/website/threads/${encodeURIComponent(threadId)}/booking-request`, {
    method: 'PATCH',
    body: JSON.stringify({
      action: 'set_payment_terms',
      payment_choice: input.paymentChoice,
      payment_currency: input.paymentCurrency,
      confirmation_deadline: input.confirmationDeadline || null,
    }),
  })) as BookingRequestRecord;
}

export async function markFundsReceived(
  threadId: string,
  input: MarkFundsReceivedInput,
): Promise<BookingRequestRecord> {
  return (await apiFetch(`/api/inbox/website/threads/${encodeURIComponent(threadId)}/booking-request`, {
    method: 'PATCH',
    body: JSON.stringify({
      action: 'mark_funds_received',
      paid_amount: input.paidAmount,
      reservation_id: input.reservationId || null,
    }),
  })) as BookingRequestRecord;
}

export async function markProofReceived(threadId: string): Promise<BookingRequestRecord> {
  return (await apiFetch(`/api/inbox/website/threads/${encodeURIComponent(threadId)}/booking-request`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'mark_proof_received' }),
  })) as BookingRequestRecord;
}

export async function uploadProofReceivedElsewhere(
  threadId: string,
  input: UploadProofInput,
): Promise<BookingRequestRecord> {
  return (await apiFetch(`/api/inbox/website/threads/${encodeURIComponent(threadId)}/booking-request`, {
    method: 'PATCH',
    body: JSON.stringify({
      action: 'upload_proof_elsewhere',
      proof_url: input.proofUrl || null,
      proof_viewer_url: input.proofViewerUrl || input.proofUrl || null,
      file_name: input.fileName || null,
      file_type: input.fileType || null,
      file_size: input.fileSize || null,
      notes: input.notes || null,
    }),
  })) as BookingRequestRecord;
}

export async function queueGuestyReservationCreate(threadId: string): Promise<BookingRequestRecord & { guesty_create_queued?: boolean }> {
  return (await apiFetch(`/api/inbox/website/threads/${encodeURIComponent(threadId)}/booking-request`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'queue_guesty_reservation_create' }),
  })) as BookingRequestRecord & { guesty_create_queued?: boolean };
}

export async function declineBookingRequest(
  threadId: string,
  reason?: string,
): Promise<BookingRequestRecord> {
  return (await apiFetch(`/api/inbox/website/threads/${encodeURIComponent(threadId)}/booking-request`, {
    method: 'PATCH',
    body: JSON.stringify({
      action: 'decline',
      reason: reason || null,
    }),
  })) as BookingRequestRecord;
}

export async function resetBookingRequestToReview(threadId: string): Promise<BookingRequestRecord> {
  return (await apiFetch(`/api/inbox/website/threads/${encodeURIComponent(threadId)}/booking-request`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'reset_to_review' }),
  })) as BookingRequestRecord;
}

export const STATUS_LABEL: Record<BookingRequestStatus, string> = {
  pending_review: 'Pending review',
  awaiting_payment: 'Awaiting proof',
  proof_received: 'Proof received · verifying funds',
  confirmed: 'Confirmed',
  declined: 'Declined',
};

export function formatBookingMoney(minor: number | null, currency: PaymentCurrency | null): string {
  if (minor == null) return '—';
  const major = minor / 100;
  const sym = currency === 'EUR' ? '€' : currency === 'MUR' ? 'Rs ' : currency === 'USD' ? '$' : '';
  return `${sym}${major.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}
