'use client';

/**
 * Onboarding done screen — confetti + "Spreman si!" + redirect to /pocetna
 * after 2 seconds. The completing Server Action (`completeOnboarding`)
 * has already run in the parent's transition before this renders, so by
 * the time we redirect, the dashboard's `onboarding_completed_at` guard
 * will pass and render the regular layout.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';

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

  return (
    <section
      aria-labelledby="wizard-done-title"
      className="flex flex-col items-center gap-4 py-12 text-center"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="h-9 w-9" aria-hidden />
      </div>
      <h2 id="wizard-done-title" className="text-2xl font-semibold sm:text-3xl">
        Spreman si!
      </h2>
      <p className="max-w-md text-sm text-muted-foreground sm:text-base">
        Dashboard se otvara za par sekundi. Ako želiš odmah, klikni dolje.
      </p>
    </section>
  );
}
