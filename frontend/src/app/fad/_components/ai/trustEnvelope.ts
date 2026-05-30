// Trust-envelope adapter — normalizes the response shapes of FAD's 4 distinct AI
// backends into ONE envelope the V2 trust components consume uniformly, so
// <AITrustStrip>/<StateBanner> can drop onto any surface from its real signals:
//
//   global  /api/friday/ask                : { confidence(band), sourcesUsed[], fallbackUsed, contextSummary.sourceStatus[] }
//   consult /api/{inbox,operations,ai}/consult : { confidence(0-1), metadata{fallbackUsed,degraded,modelTimeout,deterministicFallbackUsed,compactFallbackUsed}, missingKnowledge[], sources? }
//   draft   draft_generator (inbox.draft_ready) : { confidence(0-100) }
//
// No simulation — every field comes from the real response (or the caller's
// thrown-error flag). Health precedence lives in deriveAIHealth.
// Tag: PROD-AI-TRUST-1.
import {
  deriveAIHealth,
  provenanceItems,
  type AIHealthState,
  type AIHealthSignals,
  type AISourceStatus,
  type ConfidenceBand,
  type ProvenanceItem,
} from './aiHealth';

export interface TrustEnvelope {
  health: AIHealthState;
  confidence: ConfidenceBand | number | null;
  provenance: ProvenanceItem[];
  source: string;
  /** Raw derived signals, exposed for callers that want deriveAIHealth re-use. */
  signals: AIHealthSignals;
}

const EMPTY: TrustEnvelope = {
  health: 'healthy',
  confidence: null,
  provenance: [],
  source: 'Friday',
  signals: {},
};

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Global Ask Friday (`/api/friday/ask`). */
export function envelopeFromGlobal(resp: any, opts?: { error?: boolean; source?: string }): TrustEnvelope {
  if (!resp && !opts?.error) return { ...EMPTY, source: opts?.source || 'Friday' };
  const sourceStatus: AISourceStatus[] = resp?.contextSummary?.sourceStatus || resp?.sourceStatus || [];
  const signals: AIHealthSignals = {
    error: !!opts?.error,
    fallbackUsed: !!resp?.fallbackUsed,
    sourceStatus,
  };
  return {
    health: deriveAIHealth(signals),
    confidence: resp?.confidence ?? null,
    provenance: provenanceItems({ sourcesUsed: resp?.sourcesUsed, sourceStatus }),
    source: opts?.source || 'Friday',
    signals,
  };
}

/** Consult surfaces (inbox / ops / legacy GMS) — the generateDraftReply shape. */
export function envelopeFromConsult(resp: any, opts?: { error?: boolean; source?: string }): TrustEnvelope {
  const md = resp?.metadata || {};
  const fallbackUsed = !!(md.fallbackUsed || md.deterministicFallbackUsed || md.compactFallbackUsed);
  const degraded =
    !!(md.degraded || md.modelTimeout) ||
    (Array.isArray(resp?.missingKnowledge) && resp.missingKnowledge.length > 0);
  const sourceStatus: AISourceStatus[] = Array.isArray(resp?.sources)
    ? resp.sources.map((s: any) => ({
        name: String(s?.name ?? s),
        ok: s?.ok !== false,
        source: s?.source ?? null,
        error: s?.error ?? null,
      }))
    : [];
  // Represent "degraded / missing knowledge" as a partial source so deriveAIHealth
  // surfaces the partial banner without inventing a richer signal than we have.
  if (degraded && !sourceStatus.some((s) => s.ok === false)) {
    sourceStatus.push({ name: 'context', ok: false, error: 'degraded' });
  }
  const signals: AIHealthSignals = { error: !!opts?.error, fallbackUsed, sourceStatus };
  return {
    health: deriveAIHealth(signals),
    confidence: resp?.confidence ?? null,
    provenance: provenanceItems({ sourcesUsed: resp?.sourcesUsed, sourceStatus }),
    source: opts?.source || 'Friday',
    signals,
  };
}

/** Background draft generation (draft_generator) — essentially a numeric confidence. */
export function envelopeFromDraft(draft: any, opts?: { error?: boolean; source?: string }): TrustEnvelope {
  const signals: AIHealthSignals = {
    error: !!opts?.error,
    fallbackUsed: !!draft?.fallbackUsed,
    sourceStatus: [],
  };
  return {
    health: deriveAIHealth(signals),
    confidence: typeof draft?.confidence === 'number' ? draft.confidence : null,
    provenance: provenanceItems({ sourcesUsed: draft?.sourcesUsed }),
    source: opts?.source || 'Friday',
    signals,
  };
}

export type TrustSurfaceKind = 'global' | 'consult' | 'draft';

/** Dispatcher: pick the right mapper for a surface kind. */
export function toTrustEnvelope(
  kind: TrustSurfaceKind,
  resp: any,
  opts?: { error?: boolean; source?: string },
): TrustEnvelope {
  switch (kind) {
    case 'global':
      return envelopeFromGlobal(resp, opts);
    case 'consult':
      return envelopeFromConsult(resp, opts);
    case 'draft':
      return envelopeFromDraft(resp, opts);
    default:
      return EMPTY;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
