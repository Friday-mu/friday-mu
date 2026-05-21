'use client';

// React hook for the API-driven tasks list. Replaces the old direct
// imports of the `TASKS` array fixture in OperationsModule. Provides
// the same effective surface (a reactive array of `Task`) plus a
// `refetch()` so mutations elsewhere (CreateTaskDrawer, TaskDetail
// patches, AddCostDrawer) can trigger a refresh.
//
// Cache is module-level (per-session) so navigating between modules
// + back doesn't re-fetch. The hook subscribes to a notify channel
// so any mutation in any component triggers all consumers to
// re-render. Mutations that take the optimistic path can call
// `setLocal(...)` to update the cache in place.

import { useEffect, useState } from 'react';
import { fetchTasks } from './tasksClient';
import type { Task } from './tasks';

interface CacheState {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  loaded: boolean;
}

let cache: CacheState = { tasks: [], loading: false, error: null, loaded: false };
let inFlight: Promise<void> | null = null;
const subscribers = new Set<() => void>();

function notify(): void {
  subscribers.forEach((fn) => fn());
}

async function load(): Promise<void> {
  if (inFlight) return inFlight;
  cache = { ...cache, loading: true, error: null };
  notify();
  inFlight = (async () => {
    try {
      const tasks = await fetchTasks();
      cache = { tasks, loading: false, error: null, loaded: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      cache = { ...cache, loading: false, error: msg, loaded: true };
    } finally {
      inFlight = null;
      notify();
    }
  })();
  return inFlight;
}

export interface UseApiTasksResult {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  loaded: boolean;
  refetch: () => void;
}

export function useApiTasks(): UseApiTasksResult {
  const [, force] = useState(0);

  useEffect(() => {
    const sub = () => force((v) => v + 1);
    subscribers.add(sub);
    if (!cache.loaded && !cache.loading) {
      void load();
    }
    return () => {
      subscribers.delete(sub);
    };
  }, []);

  return {
    tasks: cache.tasks,
    loading: cache.loading,
    error: cache.error,
    loaded: cache.loaded,
    refetch: () => {
      void load();
    },
  };
}

// Optimistic single-task patch — used by TaskDetail after a successful
// API write so the OperationsModule list reflects the change without a
// full refetch round-trip. The server is the source of truth, so
// pass the full updated Task object back; this just replaces it in
// the cache.
export function replaceTaskInCache(updated: Task): void {
  cache = {
    ...cache,
    tasks: cache.tasks.map((t) => (t.id === updated.id ? updated : t)),
  };
  notify();
}

export function addTaskToCache(created: Task): void {
  cache = {
    ...cache,
    tasks: [created, ...cache.tasks],
  };
  notify();
}

export function removeTaskFromCache(taskId: string): void {
  cache = {
    ...cache,
    tasks: cache.tasks.filter((t) => t.id !== taskId),
  };
  notify();
}

/** Test/SSR escape hatch. */
export function _resetTasksCacheForTests(): void {
  cache = { tasks: [], loading: false, error: null, loaded: false };
  inFlight = null;
}
