'use client';

// Live system status — backed by /api/system/status. Replaces the SettingsPage
// hardcoded "configured" badges with reality. Never exposes secrets — the
// endpoint returns booleans + non-sensitive metadata only.

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../../../components/types';

export interface IntegrationStatus {
  configured: boolean;
  baseUrl?: string;
}

export interface GuestyStatus extends IntegrationStatus {
  tokenCached: boolean;
  tokenExpiresAt: string | null;
  listingsCached: number;
  listingsLastRefreshAt: string | null;
}

export interface SystemStatus {
  guesty: GuestyStatus;
  gms: IntegrationStatus;
  breezeway: IntegrationStatus;
  kimi: IntegrationStatus;
  anthropic: IntegrationStatus;
  openai: IntegrationStatus;
  channels: Record<string, number>;
}

export async function loadSystemStatus(): Promise<SystemStatus> {
  return (await apiFetch('/api/system/status')) as SystemStatus;
}

export async function testIntegration(name: 'guesty' | 'gms'): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  return (await apiFetch(`/api/system/test/${name}`, { method: 'POST' })) as { ok: boolean; latencyMs: number; error?: string };
}

export interface UseSystemStatusResult {
  status: SystemStatus | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useSystemStatus(): UseSystemStatusResult {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setLoading(true);
    setError(null);
    loadSystemStatus()
      .then((s) => setStatus(s))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load system status'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { status, loading, error, refetch };
}
