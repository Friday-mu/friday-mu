'use client';

// Lightweight global fixture-revision counter — the missing piece
// behind the "feels not live" complaint. Without it, mutating a
// fixture array (push a new room, mark a payment received, save a
// preference) was only visible in the component that did the mutation
// because each component held its own local `useState(rev)` and bumped
// only its own. Siblings stayed stale until they remounted (often only
// achievable with a hard refresh).
//
// Architecture: module-level rev counter + listener set. Mutations
// call `bumpFixtureRev()`; React components call `useFixtureRev()` to
// subscribe. The hook returns the current rev so callers can include
// it in their memo / effect dependency lists.
//
// Not a Context — explicit pub/sub is simpler when the only payload is
// "something changed" and there's no provider tree to thread. Works
// across stage boundaries because the rev lives in module scope, not
// component scope.

import { useEffect, useState } from 'react';

let _rev = 0;
const _listeners = new Set<() => void>();

/** Bump the global rev. Any component using useFixtureRev() re-renders.
 *  Call this AFTER mutating a fixture array (push / splice / Object.assign). */
export function bumpFixtureRev(): void {
  _rev += 1;
  _listeners.forEach((l) => {
    try { l(); } catch { /* swallow per-listener errors so one bad subscriber doesn't break others */ }
  });
}

/** Subscribe to the global fixture-rev counter. Returns the current
 *  rev so consumers can include it in dep lists. */
export function useFixtureRev(): number {
  const [rev, setRev] = useState(_rev);
  useEffect(() => {
    const listener = () => setRev(_rev);
    _listeners.add(listener);
    return () => {
      _listeners.delete(listener);
    };
  }, []);
  return rev;
}

/** Read the current rev without subscribing. Useful for callbacks /
 *  effects that need to know if anything changed since they last ran
 *  without forcing a re-render. */
export function peekFixtureRev(): number {
  return _rev;
}
