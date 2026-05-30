// AI trust / health derivation — FAD V2 "States & Trust" vocabulary.
//
// The V2 design (design bundle `fad-states.jsx`) defines five operating states
// every AI surface must show instead of only the happy path:
//
//   healthy · stale · partial · fallback · failed
//
// The design PROTOTYPE simulated these with a manual toggle. The design README is
// explicit: in production these must be DERIVED FROM REAL SIGNALS, never a manual
// switch. This module does exactly that — it maps the real signals already returned
// by the Ask Friday Core / consult backends (`/api/friday/ask`, inbox/ops consult)
// into the five states. No simulator ships.
//
// Real signals used (all already emitted by backend/src/fad/friday.js et al.):
//   - error            → the model/API call itself failed (network, 5xx, timeout)
//   - fallbackUsed     → backend used a deterministic/ungrounded fallback answer
//   - sourceStatus[]   → per-source load result (contextSummary.sourceStatus):
//                        { ok, source:{ freshness }, error }
//
// Tag: PROD-AI-TRUST-1 — this is production logic, not demo cruft.

export type AIHealthState = 'healthy' | 'stale' | 'partial' | 'fallback' | 'failed';

/** Per-source load status, mirrors AskFridayResponse.contextSummary.sourceStatus[]. */
export interface AISourceStatus {
  name: string;
  ok: boolean;
  source?: {
    kind?: string;
    demo?: boolean;
    freshness?: string;
    checkedAt?: string;
  } | null;
  error?: string | null;
}

export interface AIHealthSignals {
  /** The model/API call itself errored (network failure, 5xx, timeout). */
  error?: boolean;
  /** Backend answered from a deterministic/ungrounded fallback (not your data). */
  fallbackUsed?: boolean;
  /** Per-source load status from the response's contextSummary. */
  sourceStatus?: AISourceStatus[];
}

// Freshness values (from source loaders) that mean "not live".
const STALE_FRESHNESS = new Set(['stale', 'cached', 'expired', 'lagging']);

/**
 * Derive the trust state from real backend signals. Order matters — the most
 * severe condition wins, mirroring the design's precedence
 * (failed > fallback > partial > stale > healthy).
 */
export function deriveAIHealth(sig: AIHealthSignals | null | undefined): AIHealthState {
  if (!sig) return 'healthy';
  if (sig.error) return 'failed';
  if (sig.fallbackUsed) return 'fallback';
  const sources = sig.sourceStatus || [];
  if (sources.some((s) => s && s.ok === false)) return 'partial';
  if (
    sources.some(
      (s) => s && s.source && STALE_FRESHNESS.has(String(s.source.freshness || '').toLowerCase()),
    )
  ) {
    return 'stale';
  }
  return 'healthy';
}

export type ConfidenceBand = 'high' | 'medium' | 'low';

/**
 * Normalise a confidence value to a 0–100 percentage. Accepts a real numeric
 * confidence (0–1 from the consult APIs, or 0–100) OR a band string from
 * `/api/friday/ask`. Returns null when there is genuinely no confidence signal
 * (so the UI can omit the meter rather than fabricate one).
 */
export function confidencePct(
  confidence: ConfidenceBand | number | null | undefined,
): number | null {
  if (confidence == null) return null;
  if (typeof confidence === 'number') {
    if (!Number.isFinite(confidence)) return null;
    const pct = confidence <= 1 ? confidence * 100 : confidence;
    return Math.max(0, Math.min(100, Math.round(pct)));
  }
  // Band → discrete level. We intentionally use round, non-precise levels so the
  // meter never implies false precision the model did not provide.
  switch (confidence) {
    case 'high':
      return 100;
    case 'medium':
      return 66;
    case 'low':
      return 33;
    default:
      return null;
  }
}

/** True when the value is a coarse band rather than a real percentage. */
export function isConfidenceBand(
  confidence: ConfidenceBand | number | null | undefined,
): confidence is ConfidenceBand {
  return confidence === 'high' || confidence === 'medium' || confidence === 'low';
}

/**
 * Coerce any confidence input to a coarse band — `high | medium | low` — or null
 * when there's no signal. Numeric thresholds match the finalised design
 * (fad-states.jsx CONF_BANDS): ≥80 → high, ≥60 → medium, else low. The UI never
 * shows the underlying number (locked decision: confidence is a BAND, never a %).
 */
export function confidenceBandOf(
  confidence: ConfidenceBand | number | null | undefined,
): ConfidenceBand | null {
  if (isConfidenceBand(confidence)) return confidence;
  const pct = confidencePct(confidence);
  if (pct == null) return null;
  return pct >= 80 ? 'high' : pct >= 60 ? 'medium' : 'low';
}

export interface ProvenanceItem {
  label: string;
  /** Optional glyph hint; defaults to a neutral source dot. */
  icon?: 'doc' | 'home' | 'spark' | 'source';
}

/**
 * Build provenance chips ("grounded in …") from the real response signals.
 * Prefers the named per-source status (which carries human labels); falls back
 * to the flat `sourcesUsed` list when source status is absent.
 */
export function provenanceItems(input: {
  sourcesUsed?: string[];
  sourceStatus?: AISourceStatus[];
}): ProvenanceItem[] {
  const status = (input.sourceStatus || []).filter((s) => s && s.ok !== false);
  if (status.length) {
    return status.map((s) => ({ label: s.name, icon: 'source' as const }));
  }
  return (input.sourcesUsed || [])
    .map((s) => String(s).trim())
    .filter(Boolean)
    .map((label) => ({ label, icon: 'source' as const }));
}
