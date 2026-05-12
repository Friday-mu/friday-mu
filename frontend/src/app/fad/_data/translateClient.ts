'use client';

// On-demand translation client. Backed by /api/ai/translate. Used to render
// non-English reviews in English by default. Backend short-circuits English
// text (no LLM call) so it's cheap to ask even when source is unknown.
//
// Results are also cached client-side in a module-level Map keyed by
// cacheKey — across renders within a session this avoids re-hitting the
// backend even though backend itself caches too.

import { useEffect, useState } from 'react';
import { apiFetch } from '../../../components/types';

export interface TranslateResult {
  translated: string | null;
  original: string;
  sourceLang: string | null;
  cached: boolean;
  model?: string | null;
  latencyMs?: number | null;
  error?: string;
  reason?: string;
}

const memo = new Map<string, TranslateResult>();
const pending = new Map<string, Promise<TranslateResult>>();

export async function translate(text: string, cacheKey: string, sourceLang?: string): Promise<TranslateResult> {
  if (memo.has(cacheKey)) return memo.get(cacheKey)!;
  if (pending.has(cacheKey)) return pending.get(cacheKey)!;
  const p = (async () => {
    const result = (await apiFetch('/api/ai/translate', {
      method: 'POST',
      body: JSON.stringify({ text, cacheKey, sourceLang }),
    })) as TranslateResult;
    memo.set(cacheKey, result);
    pending.delete(cacheKey);
    return result;
  })();
  pending.set(cacheKey, p);
  return p;
}

export interface UseTranslationResult {
  result: TranslateResult | null;
  loading: boolean;
  error: string | null;
}

/**
 * Translate `text` to English. Returns the result lazily; caller decides
 * whether to render translated or original. When `text` is empty, returns
 * null (no fetch fires).
 */
export function useTranslation(text: string | undefined, cacheKey: string, sourceLang?: string): UseTranslationResult {
  const [result, setResult] = useState<TranslateResult | null>(() => memo.get(cacheKey) ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!text) {
      setResult(null);
      return;
    }
    // Already cached → instant return (no fetch).
    const cached = memo.get(cacheKey);
    if (cached) {
      setResult(cached);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    translate(text, cacheKey, sourceLang)
      .then((r) => { if (alive) setResult(r); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Translation failed'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [text, cacheKey, sourceLang]);

  return { result, loading, error };
}
