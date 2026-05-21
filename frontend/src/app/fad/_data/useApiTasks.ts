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
import {
  fetchTasks,
  fetchTasksPage,
  type FetchTasksPageInput,
  type FetchTasksPageResult,
} from './tasksClient';
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
const filteredCache = new Map<string, CacheState>();
const filteredInFlight = new Map<string, Promise<void>>();
const filteredSubscribers = new Set<() => void>();

interface PageCacheState extends FetchTasksPageResult {
  loading: boolean;
  error: string | null;
  loaded: boolean;
}

const emptyPage: FetchTasksPageResult = {
  tasks: [],
  total: 0,
  limit: 0,
  offset: 0,
  hasMore: false,
};

const pageCache = new Map<string, PageCacheState>();
const pageInFlight = new Map<string, Promise<void>>();
const pageSubscribers = new Set<() => void>();

function notify(): void {
  subscribers.forEach((fn) => fn());
}

function notifyFiltered(): void {
  filteredSubscribers.forEach((fn) => fn());
}

function notifyPages(): void {
  pageSubscribers.forEach((fn) => fn());
}

function invalidatePageCache(): void {
  pageCache.clear();
  notifyPages();
}

function invalidateFilteredCache(): void {
  filteredCache.clear();
  notifyFiltered();
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

async function loadFiltered(key: string, filter: FetchTasksPageInput): Promise<void> {
  const current = filteredCache.get(key) || { tasks: [], loading: false, error: null, loaded: false };
  const existing = filteredInFlight.get(key);
  if (existing) return existing;
  filteredCache.set(key, { ...current, loading: true, error: null });
  notifyFiltered();
  const promise = (async () => {
    try {
      const tasks = await fetchTasks(filter);
      filteredCache.set(key, { tasks, loading: false, error: null, loaded: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      filteredCache.set(key, { ...current, loading: false, error: msg, loaded: true });
    } finally {
      filteredInFlight.delete(key);
      notifyFiltered();
    }
  })();
  filteredInFlight.set(key, promise);
  return promise;
}

export function useApiTasks(filter?: FetchTasksPageInput): UseApiTasksResult {
  const [, force] = useState(0);
  const key = filter ? pageKey(filter) : '';

  useEffect(() => {
    if (!filter) return undefined;
    const sub = () => force((v) => v + 1);
    filteredSubscribers.add(sub);
    const cached = filteredCache.get(key);
    if (!cached?.loaded && !cached?.loading) {
      void loadFiltered(key, filter);
    }
    return () => {
      filteredSubscribers.delete(sub);
    };
  }, [filter, key]);

  useEffect(() => {
    if (filter) return undefined;
    const sub = () => force((v) => v + 1);
    subscribers.add(sub);
    if (!cache.loaded && !cache.loading) {
      void load();
    }
    return () => {
      subscribers.delete(sub);
    };
  }, [filter]);

  if (filter) {
    const state = filteredCache.get(key) || { tasks: [], loading: false, error: null, loaded: false };
    return {
      ...state,
      refetch: () => {
        filteredCache.delete(key);
        void loadFiltered(key, filter);
      },
    };
  }

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

function pageKey(filter: FetchTasksPageInput): string {
  const ordered = Object.keys(filter)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = filter[key as keyof FetchTasksPageInput];
      return acc;
    }, {});
  return JSON.stringify(ordered);
}

async function loadPage(key: string, filter: FetchTasksPageInput): Promise<void> {
  const current = pageCache.get(key) || { ...emptyPage, loading: false, error: null, loaded: false };
  const existing = pageInFlight.get(key);
  if (existing) return existing;
  pageCache.set(key, { ...current, loading: true, error: null });
  notifyPages();
  const promise = (async () => {
    try {
      const page = await fetchTasksPage(filter);
      pageCache.set(key, { ...page, loading: false, error: null, loaded: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      pageCache.set(key, { ...current, loading: false, error: msg, loaded: true });
    } finally {
      pageInFlight.delete(key);
      notifyPages();
    }
  })();
  pageInFlight.set(key, promise);
  return promise;
}

export interface UseApiTasksPageResult extends PageCacheState {
  refetch: () => void;
}

export function useApiTasksPage(filter: FetchTasksPageInput): UseApiTasksPageResult {
  const [, force] = useState(0);
  const key = pageKey(filter);

  useEffect(() => {
    const sub = () => force((v) => v + 1);
    pageSubscribers.add(sub);
    const cached = pageCache.get(key);
    if (!cached?.loaded && !cached?.loading) {
      void loadPage(key, filter);
    }
    return () => {
      pageSubscribers.delete(sub);
    };
  }, [key]);

  const state = pageCache.get(key) || { ...emptyPage, loading: false, error: null, loaded: false };
  return {
    ...state,
    refetch: () => {
      pageCache.delete(key);
      void loadPage(key, filter);
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
  invalidateFilteredCache();
  invalidatePageCache();
  notify();
}

export function addTaskToCache(created: Task): void {
  cache = {
    ...cache,
    // Idempotent create calls (for example pending_action:<id>) can
    // legitimately return an existing task. Keep the local list unique.
    tasks: [created, ...cache.tasks.filter((t) => t.id !== created.id)],
  };
  invalidateFilteredCache();
  invalidatePageCache();
  notify();
}

export function removeTaskFromCache(taskId: string): void {
  cache = {
    ...cache,
    tasks: cache.tasks.filter((t) => t.id !== taskId),
  };
  invalidateFilteredCache();
  invalidatePageCache();
  notify();
}

/** Test/SSR escape hatch. */
export function _resetTasksCacheForTests(): void {
  cache = { tasks: [], loading: false, error: null, loaded: false };
  inFlight = null;
  filteredCache.clear();
  filteredInFlight.clear();
  pageCache.clear();
  pageInFlight.clear();
}
