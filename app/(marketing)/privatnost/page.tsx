import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privatnost — Konto',
};

export default function PrivatnostPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-16 sm:px-6">
      <p className="text-sm font-mono text-muted-foreground">Privatnost</p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Kako čuvamo tvoje podatke
      </h1>
      <p className="text-muted-foreground">
        Puna politika privatnosti stiže uskoro. Dok ne bude objavljena, kratko: podaci žive u EU
        (Frankfurt), ne prodajemo ih trećim stranama, i ne povezujemo se na tvoju banku.
      </p>
      <p className="text-muted-foreground">
        Za bilo šta u međuvremenu, piši nam na{' '}
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
