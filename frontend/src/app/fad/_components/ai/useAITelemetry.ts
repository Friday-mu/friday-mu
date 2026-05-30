'use client';

import { useCallback } from 'react';

// Surfaces named per brief §9 — centralizes telemetry across the app.
// Phase 1: console + localStorage append. Phase 2: real analytics endpoint.

export type AISurface =
  | 'roster_draft'
  | 'workload_heatmap'
  | 'daily_brief'
  | 'auto_triage'
  | 'risk_flag'
  | 'suggested_assignment'
  | 'thread_summary'
  | 'reservation_urgency'
  | 'email_to_task'
  | 'property_staff_insight'
  | 'standby_fairness'
  | 'roster_constraint'
  | 'owner_charge'
  | 'nl_task_create';

interface BaseEvent {
  surface: AISurface;
  timestamp: string;
  context?: Record<string, unknown>;
}

interface AcceptEvent extends BaseEvent { kind: 'accept' }
interface OverrideEvent extends BaseEvent { kind: 'override'; original?: unknown; chosen?: unknown }
interface DismissEvent extends BaseEvent { kind: 'dismiss' }
interface RegenerateEvent extends BaseEvent { kind: 'regenerate' }

type Event = AcceptEvent | OverrideEvent | DismissEvent | RegenerateEvent;

const STORAGE_KEY = 'fad:ai-telemetry';
const MAX_STORED = 200;

function persist(event: Event) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list: Event[] = raw ? JSON.parse(raw) : [];
    list.push(event);
    while (list.length > MAX_STORED) list.shift();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // localStorage unavailable; skip.
  }
}

function emit(event: Event) {
  // eslint-disable-next-line no-console
  console.debug('[ai]', event.kind, event.surface, event.context ?? {});
  persist(event);
}

export function useAITelemetry() {
  const recordAccept = useCallback((surface: AISurface, context?: Record<string, unknown>) => {
    emit({ kind: 'accept', surface, timestamp: new Date().toISOString(), context });
  }, []);

  const recordOverride = useCallback(
    (surface: AISurface, context?: Record<string, unknown>) => {
      emit({ kind: 'override', surface, timestamp: new Date().toISOString(), context });
    },
    [],
  );

  const recordDismiss = useCallback((surface: AISurface, context?: Record<string, unknown>) => {
    emit({ kind: 'dismiss', surface, timestamp: new Date().toISOString(), context });
  }, []);

  const recordRegenerate = useCallback((surface: AISurface, context?: Record<string, unknown>) => {
    emit({ kind: 'regenerate', surface, timestamp: new Date().toISOString(), context });
  }, []);

  return {
    recordAccept,
    recordOverride,
    recordDismiss,
    recordRegenerate,
  };
}

/** Useful for the Insights page in Phase 2 — exposes raw telemetry log. */
export function readTelemetry(): Event[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
