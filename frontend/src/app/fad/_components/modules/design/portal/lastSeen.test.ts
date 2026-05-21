// Coverage for the per-tab last-seen utility (cont-22).
//
// jsdom in this repo's vitest config exposes `window.localStorage` as a
// plain `{}` — it doesn't ship the real Storage API. We polyfill a minimal
// in-memory implementation here so the round-trip semantics actually run.

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getLastSeen, markSeen, isNewSince } from './lastSeen';

beforeAll(() => {
  if (typeof window !== 'undefined' && typeof window.localStorage.setItem !== 'function') {
    const store: Record<string, string> = {};
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
        setItem: (k: string, v: string) => { store[k] = String(v); },
        removeItem: (k: string) => { delete store[k]; },
        clear: () => { for (const k of Object.keys(store)) delete store[k]; },
        key: (i: number) => Object.keys(store)[i] ?? null,
        get length() { return Object.keys(store).length; },
      },
    });
  }
});

afterEach(() => {
  if (typeof window !== 'undefined') {
    window.localStorage.clear();
  }
});

describe('lastSeen utility', () => {
  it('getLastSeen returns null when no entry exists', () => {
    expect(getLastSeen('test-slug', 'overview')).toBeNull();
  });

  it('markSeen + getLastSeen round-trip', () => {
    markSeen('test-slug-a', 'approvals', '2026-05-04T12:00:00.000Z');
    expect(getLastSeen('test-slug-a', 'approvals')).toBe('2026-05-04T12:00:00.000Z');
  });

  it('per-tab keys are independent', () => {
    markSeen('test-slug-b', 'approvals', '2026-05-04T12:00:00.000Z');
    expect(getLastSeen('test-slug-b', 'approvals')).toBe('2026-05-04T12:00:00.000Z');
    expect(getLastSeen('test-slug-b', 'documents')).toBeNull();
  });

  it('per-slug keys are independent', () => {
    markSeen('slug-x', 'approvals', '2026-05-04T12:00:00.000Z');
    expect(getLastSeen('slug-x', 'approvals')).toBe('2026-05-04T12:00:00.000Z');
    expect(getLastSeen('slug-y', 'approvals')).toBeNull();
  });

  it('markSeen defaults to current time', () => {
    const before = new Date().toISOString();
    markSeen('test-slug-c', 'overview');
    const stored = getLastSeen('test-slug-c', 'overview');
    expect(stored).not.toBeNull();
    expect(stored! >= before).toBe(true);
  });
});

describe('isNewSince predicate', () => {
  it('null candidate is never new', () => {
    expect(isNewSince(null, '2026-01-01T00:00:00.000Z')).toBe(false);
    expect(isNewSince(null, null)).toBe(false);
  });

  it('null lastSeen treats every candidate as new (first visit)', () => {
    expect(isNewSince('2026-01-01T00:00:00.000Z', null)).toBe(true);
  });

  it('strictly-newer candidates count as new', () => {
    expect(isNewSince('2026-05-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z')).toBe(true);
  });

  it('equal timestamps are not new', () => {
    const at = '2026-05-01T00:00:00.000Z';
    expect(isNewSince(at, at)).toBe(false);
  });

  it('older candidates are not new', () => {
    expect(isNewSince('2026-03-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z')).toBe(false);
  });
});
