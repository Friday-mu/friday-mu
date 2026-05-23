'use client';

// Ask Friday Core client — wraps the FAD-hosted Core API at
// /api/ask-friday/core/*. Today the surfaces it exposes are:
//   - KB candidates list + review (approve / reject / needs_info)
//   - (Future slices) action requests, context packs, eval runs, etc.
//
// Backend handlers live in backend/src/ask_friday/index.js.

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../components/types';

// ───────────────────────────────────── Types ─────────────────────────────────────

export type KbCandidateReviewStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'needs_info'
  | 'expired';

export interface KbCandidate {
  candidateId: string;
  candidateType: string;       // 'fact' | 'rule' | 'memory_update' | …
  targetLayer: string;         // 'fad_consult', 'website_owner_enquiry', …
  proposedChange: Record<string, unknown>;
  sourceEventIds: string[];
  evidenceSummary: string | null;
  riskClass: string | null;    // 'safe' | 'review' | 'high' | …
  trustTier: string | null;    // 'tentative' | 'corroborated' | 'verified' | …
  reviewStatus: KbCandidateReviewStatus;
  reviewer: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  approvedSnapshotVersion: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KbReviewPatch {
  reviewStatus: KbCandidateReviewStatus;
  reviewNote?: string;
  approvedSnapshotVersion?: string;
  reviewer?: string;
}

// ───────────────────────────────────── Reads ─────────────────────────────────────

export interface LoadKbCandidatesInput {
  /** Defaults to 'pending'. Pass 'all' to skip the status filter. */
  status?: KbCandidateReviewStatus | 'all';
  targetLayer?: string;
  limit?: number;
}

export function buildKbCandidatesQuery(input: LoadKbCandidatesInput = {}): string {
  const qs = new URLSearchParams();
  if (input.status) qs.set('status', input.status);
  if (input.targetLayer) qs.set('targetLayer', input.targetLayer);
  if (input.limit) qs.set('limit', String(input.limit));
  return qs.toString();
}

export async function loadKbCandidates(input: LoadKbCandidatesInput = {}): Promise<KbCandidate[]> {
  const qs = buildKbCandidatesQuery(input);
  const data = await apiFetch(`/api/ask-friday/core/kb-candidates${qs ? `?${qs}` : ''}`) as { candidates?: KbCandidate[] };
  return data.candidates || [];
}

// ───────────────────────────────────── Hook ─────────────────────────────────────

export interface UseKbCandidatesResult {
  candidates: KbCandidate[] | null;
  loading: boolean;
  isRevalidating: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Live KB candidates with stale-while-revalidate semantics (matches the
 * 2026-05-23 hook sweep — refetches don't blank the previous list).
 */
export function useKbCandidates(input: LoadKbCandidatesInput = {}): UseKbCandidatesResult {
  const [candidates, setCandidates] = useState<KbCandidate[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryKey = buildKbCandidatesQuery(input);

  const refetch = useCallback(() => {
    setIsRevalidating(true);
    setError(null);
    loadKbCandidates(input)
      .then(setCandidates)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load KB candidates'))
      .finally(() => { setLoading(false); setIsRevalidating(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  useEffect(() => { refetch(); }, [refetch]);

  return { candidates, loading, isRevalidating, error, refetch };
}

// ───────────────────────────────────── Writes ─────────────────────────────────────

export async function reviewKbCandidate(candidateId: string, patch: KbReviewPatch): Promise<KbCandidate> {
  const data = await apiFetch(`/api/ask-friday/core/kb-candidates/${encodeURIComponent(candidateId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  }) as { candidate?: KbCandidate };
  if (!data.candidate) throw new Error('No candidate returned from review patch');
  return data.candidate;
}

// ───────────────────────────── Context Packs ─────────────────────────────

export type ContextPackStatus = 'draft' | 'approved' | 'published' | 'retired';

export interface ContextPack {
  packId: string;
  surfaceId: string;
  version: number;
  status: ContextPackStatus;
  knowledgeScopes: string[];
  behaviorRules: unknown[];
  toolPolicy: Record<string, unknown>;
  memoryPolicy: Record<string, unknown>;
  sourceSnapshotRefs: unknown[];
  packPayload: Record<string, unknown>;
  approvedBy: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
}

export interface LoadContextPacksInput {
  status?: ContextPackStatus | 'all';
  surfaceId?: string;
  limit?: number;
}

function buildContextPacksQuery(input: LoadContextPacksInput = {}): string {
  const qs = new URLSearchParams();
  if (input.status) qs.set('status', input.status);
  if (input.surfaceId) qs.set('surfaceId', input.surfaceId);
  if (input.limit) qs.set('limit', String(input.limit));
  return qs.toString();
}

export async function loadContextPacks(input: LoadContextPacksInput = {}): Promise<ContextPack[]> {
  const qs = buildContextPacksQuery(input);
  const data = await apiFetch(`/api/ask-friday/core/context-packs${qs ? `?${qs}` : ''}`) as { contextPacks?: ContextPack[] };
  return data.contextPacks || [];
}

export interface UseContextPacksResult {
  packs: ContextPack[] | null;
  loading: boolean;
  isRevalidating: boolean;
  error: string | null;
  refetch: () => void;
}

export function useContextPacks(input: LoadContextPacksInput = {}): UseContextPacksResult {
  const [packs, setPacks] = useState<ContextPack[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryKey = buildContextPacksQuery(input);

  const refetch = useCallback(() => {
    setIsRevalidating(true);
    setError(null);
    loadContextPacks(input)
      .then(setPacks)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load context packs'))
      .finally(() => { setLoading(false); setIsRevalidating(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  useEffect(() => { refetch(); }, [refetch]);

  return { packs, loading, isRevalidating, error, refetch };
}

export interface UpsertContextPackInput {
  packId: string;
  surfaceId: string;
  version: number;
  status: ContextPackStatus;
  knowledgeScopes?: string[];
  behaviorRules?: unknown[];
  toolPolicy?: Record<string, unknown>;
  memoryPolicy?: Record<string, unknown>;
  sourceSnapshotRefs?: unknown[];
  packPayload?: Record<string, unknown>;
}

export async function upsertContextPack(input: UpsertContextPackInput): Promise<ContextPack> {
  const data = await apiFetch('/api/ask-friday/core/context-packs', {
    method: 'POST',
    body: JSON.stringify(input),
  }) as { contextPack?: ContextPack };
  if (!data.contextPack) throw new Error('No context pack returned');
  return data.contextPack;
}

export interface PublishContextPackInput {
  packId: string;
  surfaceId: string;
  version: number;
  /** Knowledge / source-snapshot data to include in the pack. */
  knowledgeScopes?: string[];
  behaviorRules?: unknown[];
  toolPolicy?: Record<string, unknown>;
  memoryPolicy?: Record<string, unknown>;
  sourceSnapshotRefs?: unknown[];
  packPayload?: Record<string, unknown>;
  /** Approved-candidate IDs to auto-flip to 'approved' as part of publish. */
  approvedCandidateIds?: string[];
  approvedBy?: string;
}

export async function publishContextPack(input: PublishContextPackInput): Promise<{ pack: ContextPack; approvedCount: number }> {
  const data = await apiFetch('/api/ask-friday/core/context-packs/publish', {
    method: 'POST',
    body: JSON.stringify(input),
  }) as { contextPack?: ContextPack; approvedCandidates?: KbCandidate[] };
  if (!data.contextPack) throw new Error('No context pack returned from publish');
  return { pack: data.contextPack, approvedCount: (data.approvedCandidates || []).length };
}
