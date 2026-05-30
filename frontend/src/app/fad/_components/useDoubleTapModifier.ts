'use client';

// Detect a "double-tap" of a modifier key (e.g. Cmd, Ctrl, Shift).
// Both presses must be standalone — no other key pressed between the
// keydown and keyup of each tap, and total hold must be short. The
// second tap has to land within `windowMs` of the first to count.
//
// Used today by the feedback FAB to trigger voice dictation from
// anywhere in FAD without dedicating an additional combo key.
//
// Why this is the right abstraction:
//   - Standalone modifier taps are extremely rare in normal typing —
//     this shortcut never fires accidentally during text input or while
//     using other Cmd/Ctrl combos.
//   - Doesn't conflict with browser/OS shortcuts. Those involve another
//     key held with the modifier; we explicitly disqualify any modifier
//     press that overlapped another keydown ("used in combo").
//   - Familiar precedent: JetBrains' Shift-Shift opens Search
//     Everywhere; double-tap-Cmd is muscle memory for an increasing
//     number of dictation / palette-launch UIs.
//
// Cross-platform: pass `['Meta', 'Control']` to accept whichever
// modifier the user reaches for (Cmd on Mac, Ctrl on Win/Linux).

import { useEffect, useRef } from 'react';

export interface UseDoubleTapModifierOptions {
  /**
   * Modifier key(s) to watch. KeyboardEvent.key values such as
   * 'Meta' (Cmd on Mac), 'Control', 'Shift', 'Alt'. Pass an array to
   * accept any of them (typical cross-platform usage:
   * `['Meta', 'Control']`).
   */
  keys: string | string[];
  /** Called on double-tap. Latest closure is always used. */
  onDoubleTap: () => void;
  /** Max ms between the two tap-ups to count as a double-tap. Default 400. */
  windowMs?: number;
  /**
   * Max ms a single tap is allowed to be "held" before it stops being
   * a tap (becomes a hold). Default 250 — keeps detection feeling
   * snappy without rejecting slow finger-up timings on touch keyboards.
   */
  maxHoldMs?: number;
  /** Disable the listener entirely. */
  disabled?: boolean;
}

export function useDoubleTapModifier({
  keys,
  onDoubleTap,
  windowMs = 400,
  maxHoldMs = 250,
  disabled = false,
}: UseDoubleTapModifierOptions): void {
  // Stable callback ref — we don't want to rebind the window listeners
  // on every render just because the parent passes a fresh arrow fn.
  const onDoubleTapRef = useRef(onDoubleTap);
  useEffect(() => {
    onDoubleTapRef.current = onDoubleTap;
  }, [onDoubleTap]);

  // Normalise to a stable key-list signature so the effect's deps don't
  // change identity each render when the parent passes an inline array.
  const keyListSignature = Array.isArray(keys) ? keys.join('|') : keys;

  useEffect(() => {
    if (disabled) return;

    const keyList = keyListSignature.split('|');
    const isWatchedKey = (key: string) => keyList.includes(key);

    let downAt: number | null = null;
    let usedInCombo = false;
    let lastTapAt = 0;

    const onKeyDown = (e: KeyboardEvent) => {
      if (isWatchedKey(e.key)) {
        // Browser auto-repeat fires keydown over and over while the key
        // is held. Treat the first one as the start of this tap and
        // ignore the repeats so a long hold doesn't keep restarting the
        // timer.
        if (downAt === null) {
          downAt = Date.now();
          usedInCombo = false;
        }
        return;
      }
      // Any non-watched key pressed while our modifier is down means
      // this is a combo (Cmd+S, Cmd+C, etc.), not a clean tap.
      if (downAt !== null) {
        usedInCombo = true;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (!isWatchedKey(e.key) || downAt === null) return;
      const heldMs = Date.now() - downAt;
      const wasUsed = usedInCombo;
      downAt = null;
      usedInCombo = false;
      if (wasUsed || heldMs > maxHoldMs) return;

      const now = Date.now();
      if (now - lastTapAt < windowMs) {
        lastTapAt = 0;
        onDoubleTapRef.current();
      } else {
        lastTapAt = now;
      }
    };

    // If focus leaves the window mid-sequence (e.g. user Cmd-Tabs away)
    // the matching keyup never arrives. Reset so we don't get a phantom
    // double-tap when the user returns.
    const onBlur = () => {
      downAt = null;
      usedInCombo = false;
      lastTapAt = 0;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [disabled, keyListSignature, windowMs, maxHoldMs]);
}
