import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Uslovi korištenja — Konto',
};

export default function UsloviPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-16 sm:px-6">
      <p className="text-sm font-mono text-muted-foreground">Uslovi</p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Uslovi korištenja</h1>
      <p className="text-muted-foreground">
        Puni uslovi korištenja stižu uskoro. Ukratko: Konto je alat za lične financije — ti unosiš
        ili uvoziš podatke, mi ih čuvamo i pomažemo da ih pregledaš.
      </p>
      <p className="text-muted-foreground">
        Ne pružamo financijske savjete niti garantujemo tačnost kalkulacija — provjeri bitne brojke
        prije donošenja odluka.
      </p>
    </div>
  );
}
