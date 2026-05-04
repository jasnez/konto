'use client';

/**
 * Onboarding Step 3: Set the user's first budget.
 *
 * Uses the existing `<BudgetForm mode="create" />` and intercepts onSubmit
 * to call `createBudget` directly, then advance the wizard. The form's
 * normal Dialog wrapper isn't used — we render it inline as a wizard step.
 */
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BudgetForm, type BudgetableCategory } from '@/components/budgets/budget-form';
import { createBudget } from '@/app/(app)/budzeti/actions';

const ERROR_COPY: Record<string, string> = {
  CATEGORY_NOT_BUDGETABLE: 'Kategorija nije pogodna za budžet (mora biti tip troška ili štednje).',
  DUPLICATE_ACTIVE: 'Već imaš aktivan budžet za ovu kategoriju.',
  UNAUTHORIZED: 'Sesija je istekla.',
  DATABASE_ERROR: 'Greška u bazi. Pokušaj ponovo.',
};

export interface WizardStepBudgetProps {
  categories: BudgetableCategory[];
  baseCurrency: string;
  /** Called after the budget is created. Advances to step 4. */
  onComplete: () => void;
  /** Called when the user clicks "Preskoči ovaj korak". Advances to step 4. */
  onSkip: () => void;
}

export function WizardStepBudget({
  categories,
  baseCurrency,
  onComplete,
  onSkip,
}: WizardStepBudgetProps) {
  // No categories means the user hasn't seeded categories yet (e.g., didn't
  // do step 2 import which would create them). The default seed runs on
  // signup, so this branch is rare — but guard against it cleanly.
  if (categories.length === 0) {
    return (
      <section aria-labelledby="wizard-step-budget" className="space-y-6">
        <header className="space-y-2">
          <h2 id="wizard-step-budget" className="text-2xl font-semibold sm:text-3xl">
            Postavi prvi budžet
          </h2>
          <p className="text-sm text-muted-foreground sm:text-base">
            Trenutno nemaš kategorija troška. Kreiraj jednu i vrati se na ovaj korak —
            ili preskoči pa ćeš dodati budžete kasnije.
          </p>
        </header>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">
            <Link href="/kategorije" className="font-medium text-primary underline">
              Otvori kategorije
            </Link>{' '}
            i dodaj barem jednu kategoriju troška, pa se vrati ovdje.
          </p>
        </Card>
        <div className="flex justify-center pt-2">
          <Button type="button" variant="ghost" size="sm" onClick={onSkip}>
            Preskoči ovaj korak
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="wizard-step-budget" className="space-y-6">
      <header className="space-y-2">
        <h2 id="wizard-step-budget" className="text-2xl font-semibold sm:text-3xl">
          Postavi prvi budžet
        </h2>
        <p className="text-sm text-muted-foreground sm:text-base">
          Mjesečni ili sedmični limit po kategoriji. Vidjećeš upozorenje kad si blizu kraja.
        </p>
      </header>

      <BudgetForm
        mode="create"
        categories={categories}
        baseCurrency={baseCurrency}
        onSubmit={async (values) => {
          const result = await createBudget(values);
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
