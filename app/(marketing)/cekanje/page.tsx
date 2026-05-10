import type { Metadata } from 'next';
import Link from 'next/link';
import { Mail } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Lista čekanja — Konto',
  description:
    'Konto je trenutno u zatvorenom beta testu. Prijavi se na čekanje da te obavijestimo kad se otvorimo.',
};

/**
 * Placeholder waiting-list page for closed-beta gating.
 *
 * The /prijava and /registracija forms link here when ENABLE_INVITES=true
 * and the user doesn't have a code yet. A future iteration replaces this
 * stub with a real form that writes to a `waiting_list` table.
 */
export default function CekanjePage() {
  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-10 sm:py-16">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold sm:text-3xl">Lista čekanja</h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          Konto je trenutno u zatvorenom beta testu. Otvorit ćemo se kad budemo sigurni da
          aplikacija stoji na svojim nogama. Ako želiš da te obavijestimo, javi se direktno — forma
          za čekanje stiže uskoro.
        </p>
      </div>
      <div className="flex items-center gap-3 rounded-xl border border-dashed p-4 text-sm">
        <Mail className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">
          Pošalji email na{' '}
          <a
            href="mailto:hello@konto.app"
            className="font-medium text-primary underline underline-offset-4 hover:no-underline"
          >
            hello@konto.app
          </a>{' '}
          i dodajemo te na listu.
        </p>
      </div>
      <div className="text-sm">
        <Link href="/" className="text-primary underline underline-offset-4">
          ← Nazad na početnu
        </Link>
      </div>
    </div>
  );
}
