'use client';

/**
 * Onboarding done screen — confetti + "Sve je spremno." + redirect to /pocetna
 * after 2 seconds, with a visible "Otvori početnu" button so the user has
 * agency if the auto-redirect lags. The completing Server Action
 * (`completeOnboarding`) has already run in the parent's transition before
 * this renders, so by the time we redirect, the dashboard's
 * `onboarding_completed_at` guard will pass and render the regular layout.
 *
 * Copy uses impersonal "Sve je spremno." (not gendered "Spreman si!") so
 * the moment lands the same for every user.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const REDIRECT_DELAY_MS = 2000;

async function fireConfetti(): Promise<void> {
  try {
    const confetti = (await import('canvas-confetti')).default;
    void confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'],
    });
  } catch {
    // Confetti is decoration; swallow any import/runtime error.
  }
}

export function WizardDone() {
  const router = useRouter();

  useEffect(() => {
    void fireConfetti();
    const timer = setTimeout(() => {
      router.refresh();
      router.push('/pocetna');
    }, REDIRECT_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [router]);

  function goToDashboard(): void {
    router.refresh();
    router.push('/pocetna');
  }

  return (
    <section
      aria-labelledby="wizard-done-title"
      className="flex flex-col items-center gap-4 py-12 text-center"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="h-9 w-9" aria-hidden />
      </div>
      <h2 id="wizard-done-title" className="text-2xl font-semibold sm:text-3xl">
        Sve je spremno.
      </h2>
      <p className="max-w-md text-sm text-muted-foreground sm:text-base">
        Početna se otvara za par sekundi. Ili otvori odmah.
      </p>
      <Button type="button" onClick={goToDashboard} className="mt-2">
        Otvori početnu
      </Button>
    </section>
  );
}
