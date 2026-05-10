'use client';

/**
 * Dev-only "Reset onboarding" affordance.
 *
 * Renders a destructive button that clears `onboarding_completed_at` AND
 * `onboarding_completed` in the user's profile. Useful while iterating on
 * the wizard — visit /podesavanja, click reset, then /pocetna shows the
 * wizard again.
 *
 * Defense-in-depth:
 *   1. Caller only renders this when `process.env.NODE_ENV === 'development'`.
 *   2. The Server Action itself refuses to run in production regardless,
 *      so even if the button leaked into a prod build it would no-op.
 */
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { resetOnboarding } from '@/app/(app)/pocetna/onboarding-actions';

export function ResetOnboardingButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick(): void {
    startTransition(() => {
      void (async () => {
        const result = await resetOnboarding();
        if (result.success) {
          toast.success('Onboarding je resetovan.', {
            description: 'Otvori početnu da vidiš wizard ponovo.',
          });
          router.refresh();
          return;
        }
        if (result.error === 'FORBIDDEN') {
          toast.error('Reset je dostupan samo u razvojnom modu.');
          return;
        }
        toast.error('Reset nije uspio. Pokušaj ponovo.');
      })();
    });
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={pending}>
      🧪 Reset onboarding
    </Button>
  );
}
