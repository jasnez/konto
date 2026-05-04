'use client';

/**
 * Main onboarding orchestrator (F3-E6-T1).
 *
 * 4-step wizard for fresh users:
 *   1. Create first account
 *   2. Add first transaction (import OR manual)
 *   3. Set first budget
 *   4. Set first savings goal
 *   → Done state with confetti + redirect.
 *
 * Persistence:
 *   - Per-step state lives in `profiles.onboarding_completed` (jsonb) so a
 *     user who closes the tab returns to the first incomplete step.
 *   - The terminal `onboarding_completed_at` is set by:
 *       a) Reaching Done (full wizard or skipping the last step), or
 *       b) Clicking the global "Preskoči" button at the top-right, which
 *          fills every step as true at once.
 *
 * Wizard does NOT show until the parent Server Component renders it — the
 * "fresh user" detection (no accounts, no transactions, no completed_at)
 * lives in `pocetna/page.tsx`.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { BudgetableCategory } from '@/components/budgets/budget-form';
import type { GoalAccount } from '@/components/goals/goal-form';
import {
  completeOnboarding,
  markOnboardingStep,
  type WizardStepNumber,
} from '@/app/(app)/pocetna/onboarding-actions';
import { WizardStepAccount } from './wizard-step-account';
import { WizardStepImport } from './wizard-step-import';
import { WizardStepBudget } from './wizard-step-budget';
import { WizardStepGoal } from './wizard-step-goal';
import { WizardDone } from './wizard-done';

/** Map of "stepN → boolean" with all keys required (the wizard reads each). */
export interface OnboardingProgress {
  step1: boolean;
  step2: boolean;
  step3: boolean;
  step4: boolean;
}

export interface OnboardingWizardProps {
  /** Pre-resolved per-step progress. Wizard derives starting step from this. */
  progress: OnboardingProgress;
  /** User's expense/saving categories (Step 3 BudgetForm input). */
  categories: BudgetableCategory[];
  /** User's accounts (Step 4 GoalForm input). */
  accounts: GoalAccount[];
  /** Profile base currency (default form currency in Steps 3 & 4). */
  baseCurrency: string;
}

type Phase = 'step1' | 'step2' | 'step3' | 'step4' | 'done';

// Typed as readonly Phase[] (not the narrow tuple type) so `indexOf(phase)`
// accepts every Phase including 'done' — for which it returns -1 — without
// needing an unsafe assertion at the call site.
const STEP_PHASES: readonly Phase[] = ['step1', 'step2', 'step3', 'step4'];

function firstIncompletePhase(progress: OnboardingProgress): Phase {
  if (!progress.step1) return 'step1';
  if (!progress.step2) return 'step2';
  if (!progress.step3) return 'step3';
  if (!progress.step4) return 'step4';
  return 'done';
}

function phaseToStepNumber(phase: Phase): WizardStepNumber | null {
  switch (phase) {
    case 'step1':
      return 1;
    case 'step2':
      return 2;
    case 'step3':
      return 3;
    case 'step4':
      return 4;
    case 'done':
      return null;
  }
}

function phaseToIndex(phase: Phase): number {
  return STEP_PHASES.indexOf(phase);
}

export function OnboardingWizard({
  progress,
  categories,
  accounts,
  baseCurrency,
}: OnboardingWizardProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(() => firstIncompletePhase(progress));
  const [pending, startTransition] = useTransition();

  /** Mark current phase done in DB, then advance. Server-side update + local move. */
  function advance(currentPhase: Phase): void {
    const stepNum = phaseToStepNumber(currentPhase);
    const nextPhase = nextPhaseFor(currentPhase);

    // Optimistic UI: advance locally before the Server Action confirms.
    // If the Server Action fails, we toast and stay on the next step
    // anyway — the user's progress isn't lost (worst case a row of jsonb
    // doesn't get marked, which only means they'd resume here on refresh).
    setPhase(nextPhase);

    if (stepNum === null) return;

    startTransition(() => {
      void (async () => {
        if (nextPhase === 'done') {
          // Final step: mark this step + set completion timestamp in one shot.
          // We DON'T pass markRemainingTrue here because the user reached Done
          // via the happy path (or by skipping each individual step), so the
          // jsonb is already coherent.
          const markResult = await markOnboardingStep(stepNum);
          if (!markResult.success) {
            toast.error('Ne mogu spasiti napredak. Pokušaj osvježiti.');
          }
          const completeResult = await completeOnboarding();
          if (!completeResult.success) {
            toast.error('Ne mogu označiti onboarding kao gotov.');
          }
          // router.refresh() not strictly needed — WizardDone schedules a
          // navigation to /pocetna which triggers the next render.
          return;
        }
        const result = await markOnboardingStep(stepNum);
        if (!result.success) {
          toast.error('Ne mogu spasiti napredak. Pokušaj osvježiti.');
        }
      })();
    });
  }

  /** Global skip — fills every remaining step as true and bails to the dashboard. */
  function handleSkipAll(): void {
    startTransition(() => {
      void (async () => {
        const result = await completeOnboarding({ markRemainingTrue: true });
        if (!result.success) {
          toast.error('Ne mogu preskočiti. Pokušaj ponovo.');
          return;
        }
        toast.success('Možeš se vratiti na onboarding kasnije iz Podešavanja.');
        router.refresh();
        router.push('/pocetna');
      })();
    });
  }

  const stepIndex = phaseToIndex(phase);
  const isStepPhase = stepIndex !== -1;
  const progressPercent = isStepPhase
    ? Math.round(((stepIndex + 1) / STEP_PHASES.length) * 100)
    : 100;

  return (
    <div
      className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:gap-8 sm:px-6 sm:py-10"
      data-testid="onboarding-wizard"
      data-phase={phase}
    >
      {/* Progress + Skip header (hidden on Done). */}
      {phase !== 'done' && (
        <header className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Korak {String(stepIndex + 1)} od {String(STEP_PHASES.length)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleSkipAll}
              disabled={pending}
              aria-label="Preskoči ostatak onboardinga"
            >
              Preskoči
            </Button>
          </div>
          <Progress
            value={progressPercent}
            aria-label={`Onboarding napredak ${String(progressPercent)}%`}
            className="h-1.5"
          />
        </header>
      )}

      {/* Active phase. */}
      <div className="flex-1">
        {phase === 'step1' && (
          <WizardStepAccount
            onComplete={() => {
              advance('step1');
            }}
            onSkip={() => {
              advance('step1');
            }}
          />
        )}
        {phase === 'step2' && (
          <WizardStepImport
            onComplete={() => {
              advance('step2');
            }}
          />
        )}
        {phase === 'step3' && (
          <WizardStepBudget
            categories={categories}
            baseCurrency={baseCurrency}
            onComplete={() => {
              advance('step3');
            }}
            onSkip={() => {
              advance('step3');
            }}
          />
        )}
        {phase === 'step4' && (
          <WizardStepGoal
            accounts={accounts}
            baseCurrency={baseCurrency}
            onComplete={() => {
              advance('step4');
            }}
            onSkip={() => {
              advance('step4');
            }}
          />
        )}
        {phase === 'done' && <WizardDone />}
      </div>
    </div>
  );
}

function nextPhaseFor(phase: Phase): Phase {
  switch (phase) {
    case 'step1':
      return 'step2';
    case 'step2':
      return 'step3';
    case 'step3':
      return 'step4';
    case 'step4':
      return 'done';
    case 'done':
      return 'done';
  }
}
