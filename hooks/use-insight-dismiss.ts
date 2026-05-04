/**
 * Shared dismiss/restore handler for insights (F3-E5-T2).
 *
 * Both the dashboard widget and the /uvidi page need the same flow:
 *   1. Optimistically remove from local state.
 *   2. Call `dismissInsight` Server Action in a transition.
 *   3. On success → toast.success with "Vrati" undo action.
 *   4. On error → rollback (caller's responsibility) + toast.error.
 *   5. Undo click → call `undismissInsight`. Handle CONFLICT (unique partial
 *      index) with a tailored toast.
 *
 * Hook is generic over the parent's optimistic state shape — caller passes
 * `onOptimisticRemove(id)` and `onRollback()`. The hook owns the transition
 * + toast wiring; the parent owns the list state.
 */
'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  dismissInsight,
  undismissInsight,
  type DismissInsightResult,
  type UndismissInsightResult,
} from '@/app/(app)/uvidi/actions';

const DISMISS_ERROR_COPY: Record<string, string> = {
  NOT_FOUND: 'Uvid više ne postoji.',
  UNAUTHORIZED: 'Sesija je istekla. Prijavi se ponovo.',
  DATABASE_ERROR: 'Greška u bazi. Pokušaj ponovo.',
  VALIDATION_ERROR: 'Nevažeći zahtjev.',
};

const UNDISMISS_ERROR_COPY: Record<string, string> = {
  NOT_FOUND: 'Uvid više ne postoji.',
  CONFLICT: 'Postoji noviji uvid sa istim ključem.',
  UNAUTHORIZED: 'Sesija je istekla. Prijavi se ponovo.',
  DATABASE_ERROR: 'Greška u bazi. Pokušaj ponovo.',
  VALIDATION_ERROR: 'Nevažeći zahtjev.',
};

export interface UseInsightDismissOptions {
  /**
   * Called immediately when the user clicks dismiss — caller should remove
   * the row from local state for instant UI feedback.
   */
  onOptimisticRemove?: (id: string) => void;
  /**
   * Called when the dismiss Server Action errors. Caller should restore
   * the row (or call `router.refresh()` to re-fetch from the server).
   */
  onRollback?: (id: string) => void;
  /**
   * Called when the dismiss is confirmed by the server. Caller may want
   * to refresh server data; the hook also calls `router.refresh()`.
   */
  onDismissConfirmed?: (id: string) => void;
  /**
   * Called when undismiss succeeds (the user clicked "Vrati" in the toast,
   * or restored from the Arhiva tab). Caller may want to insert the row
   * back into local state if it was the active list.
   */
  onUndismissConfirmed?: (id: string) => void;
}

export interface UseInsightDismissReturn {
  /** Click handler: optimistic dismiss + Server Action + undo toast. */
  handleDismiss: (id: string) => void;
  /** Click handler: undismiss without optimistic UI (e.g., Arhiva "Vrati"). */
  handleRestore: (id: string) => void;
  /** True while any in-flight transition is running. */
  pending: boolean;
}

export function useInsightDismiss(
  options: UseInsightDismissOptions = {},
): UseInsightDismissReturn {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleDismiss(id: string): void {
    options.onOptimisticRemove?.(id);
    startTransition(() => {
      void (async () => {
        const result: DismissInsightResult = await dismissInsight(id);
        if (!result.success) {
          options.onRollback?.(id);
          router.refresh();
          toast.error(DISMISS_ERROR_COPY[result.error] ?? 'Greška.');
          return;
        }
        options.onDismissConfirmed?.(id);
        toast.success('Uvid sklonjen.', {
          duration: 8000,
          action: {
            label: 'Vrati',
            onClick: () => {
              startTransition(() => {
                void (async () => {
                  const r: UndismissInsightResult = await undismissInsight(id);
                  if (r.success) {
                    options.onUndismissConfirmed?.(id);
                    router.refresh();
                    toast.success('Uvid vraćen.');
                  } else {
                    toast.error(UNDISMISS_ERROR_COPY[r.error] ?? 'Greška.');
                  }
                })();
              });
            },
          },
        });
      })();
    });
  }

  function handleRestore(id: string): void {
    startTransition(() => {
      void (async () => {
        const result: UndismissInsightResult = await undismissInsight(id);
        if (result.success) {
          options.onUndismissConfirmed?.(id);
          router.refresh();
          toast.success('Uvid vraćen.');
        } else {
          toast.error(UNDISMISS_ERROR_COPY[result.error] ?? 'Greška.');
        }
      })();
    });
  }

  return { handleDismiss, handleRestore, pending };
}
