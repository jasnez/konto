import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Kontakt — Konto',
};

export default function KontaktPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-16 sm:px-6">
      <p className="text-sm font-mono text-muted-foreground">Kontakt</p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Javi se</h1>
      <p className="text-muted-foreground">
        Pitanje, prijedlog ili greška? Najbrže preko maila:{' '}
        <a
          href="mailto:hello@konto.app"
          className="text-primary underline-offset-4 hover:underline"
        >
          hello@konto.app
        </a>
        .
      </p>
      <p className="text-muted-foreground">
        Za pitanja vezana za podatke i privatnost,{' '}
        <a
          href="mailto:privatnost@konto.app"
          className="text-primary underline-offset-4 hover:underline"
        >
          privatnost@konto.app
        </a>
        .
      </p>
    </div>
  );
}
