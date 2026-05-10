'use client';

import { useEffect, useRef } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

/**
 * OB-1: Persist react-hook-form values to `localStorage` with a debounce
 * and hydrate them on mount. Used by onboarding wizard step forms so a
 * user who closes the tab mid-step doesn't lose their typed values.
 *
 * The hook is **opt-in via `draftKey`** — pass `undefined` (or omit the
 * prop on the calling form) and the hook is a no-op. Forms that have
 * other consumers (e.g. `AccountForm` rendered both by `/racuni/novi`
 * and the wizard) only enable drafts when explicitly invoked from the
 * onboarding flow.
 *
 * **Successful submit MUST clear the draft** via the returned
 * `clearDraft()` — otherwise the next mount would re-hydrate stale
 * values. Each calling form is responsible for invoking it inside its
 * `onSuccess` path.
 *
 * Storage key shape: `konto:form-draft:<draftKey>`. We do NOT namespace
 * by `userId` because:
 *
 *   - Onboarding only runs for a fresh user in their own session; cross-
 *     user shared-browser scenarios are out of scope for beta.
 *   - The values being persisted are not sensitive (account name like
 *     "Tekući", budget limit, goal name) — even if a different user
 *     later sees the previous draft, no privacy boundary is crossed.
 *   - Plumbing `userId` through to every form would require either a
 *     context or a top-down prop chain — overkill for this scope.
 *
 * Implementation notes:
 *
 *   - **Hydration runs once.** A `hydratedRef` guard prevents loops if
 *     the form re-mounts mid-edit (e.g. a parent re-render).
 *   - **`form.reset(values, { keepDefaultValues: true })`** so the
 *     form's `defaultValues` for unmount-reset still match the original
 *     props, not the hydrated draft. Otherwise reset-to-defaults after
 *     a partial submit could re-stick the draft values.
 *   - **`form.watch(callback)` returns a subscription** with
 *     `unsubscribe()` — we tear down on unmount or when `draftKey`
 *     changes (which shouldn't happen in practice but the deps are
 *     wired correctly).
 *   - **Debounce 500 ms** picked to feel instant on tab close but not
 *     hammer localStorage on every keystroke. 99 % of users won't hit
 *     the gap (forms are slow to fill out vs the debounce).
 *   - **`typeof window === 'undefined'` guard** so the hook is SSR-safe
 *     even though all wizard step forms are `'use client'`. The early
 *     return inside `useEffect` is also fine — `useEffect` doesn't run
 *     on the server.
 *   - **JSON.parse / JSON.stringify** silently ignore failures (corrupt
 *     localStorage, quota exceeded, disabled). Form keeps working with
 *     fresh defaults.
 *   - **BigInt safety:** every monetary field that the wizard exposes
 *     (`amount_cents`, `target_amount_cents`, `initial_balance_cents`)
 *     is already a `string` in its Zod schema — JSON-safe. If a future
 *     form adds a real `bigint` field, JSON.stringify would throw and
 *     the catch block would skip the save (no crash, just no draft).
 */

const STORAGE_PREFIX = 'konto:form-draft:';
const DEBOUNCE_MS = 500;

export interface UseFormDraftReturn {
  /**
   * Remove the persisted draft for this `draftKey`. Call from `onSuccess`
   * after a successful Server Action to prevent stale-draft hydration on
   * the next mount.
   */
  clearDraft: () => void;
}

export function useFormDraft<T extends FieldValues>(
  draftKey: string | undefined,
  form: UseFormReturn<T>,
): UseFormDraftReturn {
  const hydratedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Hydrate once on mount ────────────────────────────────────────────
  useEffect(() => {
    if (draftKey === undefined || hydratedRef.current) return;
    if (typeof window === 'undefined') return;
    hydratedRef.current = true;
    try {
      const raw = window.localStorage.getItem(STORAGE_PREFIX + draftKey);
      if (raw === null) return;
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return;
      // `keepDefaultValues: true` preserves the form's original `defaultValues`
      // so a future `form.reset()` (e.g. after submit) still produces a clean
      // form, not the hydrated draft.
      form.reset(parsed as T, { keepDefaultValues: true });
    } catch {
      // Stale or malformed draft — ignore. The form mounts with its own
      // defaultValues which is the safe fallback.
    }
  }, [draftKey, form]);

  // ── Save on change with debounce ─────────────────────────────────────
  useEffect(() => {
    if (draftKey === undefined) return;
    if (typeof window === 'undefined') return;
    const subscription = form.watch((values) => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        try {
          window.localStorage.setItem(STORAGE_PREFIX + draftKey, JSON.stringify(values));
        } catch {
          // Storage full / disabled — skip silently. Form keeps working.
        }
      }, DEBOUNCE_MS);
    });
    return () => {
      subscription.unsubscribe();
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [draftKey, form]);

  function clearDraft(): void {
    if (draftKey === undefined) return;
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(STORAGE_PREFIX + draftKey);
    } catch {
      // ignore
    }
  }

  return { clearDraft };
}
