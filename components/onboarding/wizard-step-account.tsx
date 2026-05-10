'use client';

/**
 * Onboarding Step 1: Create the user's first account.
 *
 * Embeds the existing `<AccountForm mode="create" />` and intercepts its
 * success callback so we can advance the wizard to step 2 without leaving
 * the page. The form's normal redirect to `/racuni` is suppressed by the
 * `onSuccess` prop (added in F3-E6 refactor).
 */
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AccountForm } from '@/components/accounts/account-form';

export interface WizardStepAccountProps {
  /** Called after the account is created successfully. Advances to step 2. */
  onComplete: () => void;
  /** Called when the user clicks "Preskoči ovaj korak". Advances to step 2. */
  onSkip: () => void;
}

export function WizardStepAccount({ onComplete, onSkip }: WizardStepAccountProps) {
  return (
    <section aria-labelledby="wizard-step-account" className="space-y-6">
      <header className="space-y-2">
        <h2 id="wizard-step-account" className="text-2xl font-semibold sm:text-3xl">
          Dodaj prvi račun
        </h2>
        <p className="text-sm text-muted-foreground sm:text-base">
          Tekući, štedni, kreditna kartica ili gotovina — sve gdje držiš novac. Više možeš dodati
          kasnije kroz{' '}
          <Link href="/racuni" className="underline">
            Računi
          </Link>
          .
        </p>
      </header>

      <AccountForm
        mode="create"
        onSuccess={onComplete}
        successToast="Račun kreiran. Nastavljamo na sljedeći korak."
        // OB-1: persist field values to localStorage so a tab close mid-step
        // doesn't lose what the user typed. Cleared automatically on success.
        draftKey="onboarding-step1-account"
      />

      <div className="flex justify-center pt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onSkip}
          aria-label="Preskoči ovaj korak"
        >
          Preskoči ovaj korak
        </Button>
      </div>
    </section>
  );
}
