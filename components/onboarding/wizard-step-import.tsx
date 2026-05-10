'use client';

/**
 * Onboarding Step 2: Import a statement OR add a transaction manually.
 *
 * Not a form — two CTA cards plus a Skip link. The user picks ONE path:
 *   - "Uvezi PDF" → full navigation to /skeniraj. When they finish there
 *     (or come back later), step 2 is already marked done.
 *   - "Dodaj ručno" → opens the existing QuickAdd dialog (programmatic via
 *     `useUiStore.openQuickAdd()`). After they save (or close), the
 *     wizard advances. We mark the step on click — not on QuickAdd success
 *     — because:
 *       1. QuickAdd has no "did the user actually submit" event hook, and
 *       2. The wizard only treats step 2 as "engaged with", not "must add
 *          a transaction" — a user who explored the modal is already past
 *          the introduction we wanted to surface.
 *   - "Preskoči" → just advances.
 */
import Link from 'next/link';
import { ArrowRight, FileUp, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useUiStore } from '@/stores/ui';

export interface WizardStepImportProps {
  /** Called when the user picks one of the two CTAs OR clicks Skip. Marks step 2. */
  onComplete: () => void;
}

export function WizardStepImport({ onComplete }: WizardStepImportProps) {
  const openQuickAdd = useUiStore((s) => s.openQuickAdd);

  function handleManualClick() {
    openQuickAdd();
    onComplete();
  }

  return (
    <section aria-labelledby="wizard-step-import" className="space-y-6">
      <header className="space-y-2">
        <h2 id="wizard-step-import" className="text-2xl font-semibold sm:text-3xl">
          Dodaj prvu transakciju
        </h2>
        <p className="text-sm text-muted-foreground sm:text-base">
          Najbrže: uvezi PDF izvod iz banke. Sporije, ali isto fino: dodaj jednu ručno.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/skeniraj"
          onClick={onComplete}
          className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
        >
          <Card className="flex h-full flex-col gap-3 p-5 transition-colors hover:bg-muted/40">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <FileUp className="h-5 w-5" aria-hidden />
            </div>
            <h3 className="font-semibold">Uvezi PDF izvod</h3>
            <p className="text-sm text-muted-foreground">
              Sve transakcije odjednom, već raspoređene po kategorijama.
            </p>
            <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-primary">
              Otvori uvoz
              <ArrowRight className="h-4 w-4" aria-hidden />
            </span>
          </Card>
        </Link>

        <button type="button" onClick={handleManualClick} className="text-left">
          <Card className="flex h-full flex-col gap-3 p-5 transition-colors hover:bg-muted/40">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Pencil className="h-5 w-5" aria-hidden />
            </div>
            <h3 className="font-semibold">Dodaj ručno</h3>
            <p className="text-sm text-muted-foreground">
              Iznos, kategorija, datum — gotovo za 30 sekundi.
            </p>
            <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-primary">
              Otvori unos
              <ArrowRight className="h-4 w-4" aria-hidden />
            </span>
          </Card>
        </button>
      </div>

      <div className="flex justify-center pt-2">
        <Button type="button" variant="ghost" size="sm" onClick={onComplete}>
          Preskoči ovaj korak
        </Button>
      </div>
    </section>
  );
}
