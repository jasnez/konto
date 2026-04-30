'use client';

import { useCallback } from 'react';

/**
 * Lightweight tactile feedback for primary interactions on touch devices.
 * Wraps the Web Vibration API with feature detection — falls through silently
 * on unsupported browsers (iOS Safari, desktop) so callers can fire it
 * unconditionally.
 *
 * Patterns are tuned to feel intentional but not intrusive:
 *   - `tap` (10ms) — a single soft confirmation, suitable for nav/button taps.
 *   - `success` (15ms) — a slightly longer single pulse for completed actions.
 *   - `error` (50ms) — distinct error feedback (still single-pulse to avoid
 *     spammy patterns).
 *
 * Reduced-motion users: `prefers-reduced-motion: reduce` disables haptic too.
 * Vibration is a motion-adjacent sensory effect; users who opt out of motion
 * generally also want quieter haptics.
 */
type HapticIntensity = 'tap' | 'success' | 'error';

const PATTERNS: Record<HapticIntensity, number> = {
  tap: 10,
  success: 15,
  error: 50,
};

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function vibrationSupported(): boolean {
  if (typeof navigator === 'undefined') return false;
  return typeof navigator.vibrate === 'function';
}

export function useHapticFeedback(): (intensity?: HapticIntensity) => void {
  return useCallback((intensity: HapticIntensity = 'tap') => {
    if (!vibrationSupported()) return;
    if (prefersReducedMotion()) return;
    navigator.vibrate(PATTERNS[intensity]);
  }, []);
}
