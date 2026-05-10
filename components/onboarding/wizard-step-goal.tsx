'use client';

/**
 * Onboarding Step 4: Set the user's first savings goal.
 *
 * Uses the existing `<GoalForm mode="create" />`. After a successful goal,
 * advance to the Done state. Skip just advances.
 */
import { Button } from '@/components/ui/button';
import { GoalForm, type GoalAccount } from '@/components/goals/goal-form';
import { createGoal } from '@/app/(app)/ciljevi/actions';

const ERROR_COPY: Record<string, string> = {
  ACCOUNT_NOT_FOUND: 'Odabrani račun nije pronađen.',
  UNAUTHORIZED: 'Sesija je istekla.',
  DATABASE_ERROR: 'Greška u bazi. Pokušaj ponovo.',
};

export interface WizardStepGoalProps {
  accounts: GoalAccount[];
  baseCurrency: string;
  /** Called after the goal is created. Advances to Done. */
  onComplete: () => void;
  /** Called when the user clicks "Preskoči ovaj korak". Advances to Done. */
  onSkip: () => void;
}

export function WizardStepGoal({
  accounts,
  baseCurrency,
  onComplete,
  onSkip,
}: WizardStepGoalProps) {
  return (
    <section aria-labelledby="wizard-step-goal" className="space-y-6">
      <header className="space-y-2">
        <h2 id="wizard-step-goal" className="text-2xl font-semibold sm:text-3xl">
          Postavi cilj štednje
        </h2>
        <p className="text-sm text-muted-foreground sm:text-base">
          Ljetovanje, novi telefon, hitna rezerva — postavi iznos i rok. Konto izračuna koliko treba
          odvajati mjesečno.
        </p>
      </header>

      <GoalForm
        mode="create"
        accounts={accounts}
        baseCurrency={baseCurrency}
        // OB-1: persist field values to localStorage so a tab close mid-step
        // doesn't lose what the user typed. Cleared automatically on success.
        draftKey="onboarding-step4-goal"
        onSubmit={async (values) => {
          const result = await createGoal(values);
          if (result.success) {
            onComplete();
            return null;
          }
          if (result.error === 'VALIDATION_ERROR') {
            const root = result.details._root;
            return root.length > 0 ? root[0] : 'Provjeri unos i pokušaj ponovo.';
          }
          return ERROR_COPY[result.error] ?? 'Nepoznata greška.';
        }}
      />

      <div className="flex justify-center pt-2">
        <Button type="button" variant="ghost" size="sm" onClick={onSkip}>
          Preskoči ovaj korak
        </Button>
      </div>
    </section>
  );
}
