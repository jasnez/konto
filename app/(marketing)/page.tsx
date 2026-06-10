import Link from 'next/link';
import { ShieldCheck, Landmark, Euro } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const valueProps = [
  {
    icon: Landmark,
    title: 'Bez povezivanja banke',
    description:
      'Uvezi PDF izvod ili unesi transakcije ručno. Tvoji prijavni podaci banke nikad ne napuštaju banku.',
  },
  {
    icon: Euro,
    title: 'BAM, EUR i još',
    description:
      'Više računa u različitim valutama — sve svedeno na jednu baznu valutu koju ti biraš.',
  },
  {
    icon: ShieldCheck,
    title: 'Ti vladaš podacima',
    description:
      'Bez reklama, bez trackera, bez prodaje podataka. Izvezi sve ili obriši nalog kad god poželiš.',
  },
] as const;

const steps = [
  {
    title: 'Dodaj račune',
    description: 'Tekući, štednja, gotovina ili kartica — u BAM, EUR ili drugoj valuti.',
  },
  {
    title: 'Unesi ili uvezi',
    description: 'Ukucaj transakciju za par sekundi ili uvezi PDF izvod banke — Konto ga sredi.',
  },
  {
    title: 'Vidi cijelu sliku',
    description: 'Budžeti, kategorije, mjesečni pregled i uvidi o potrošnji — na jednom mjestu.',
  },
] as const;

export default function LandingPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-20 px-4 py-16 sm:gap-28 sm:px-6 sm:py-24">
      <section className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
          Novac, lokalno i privatno.
        </h1>
        <p className="text-pretty text-lg text-muted-foreground sm:text-xl">
          Lične finansije koje žive na tvom kontu — domaće, u tvojoj valuti i bez povezivanja banke.
        </p>
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="h-11">
            <Link href="/registracija">Napravi nalog besplatno</Link>
          </Button>
          <Button asChild size="lg" variant="ghost" className="h-11">
            <Link href="/prijava">Već imam nalog</Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {valueProps.map(({ icon: Icon, title, description }) => (
          <Card key={title}>
            <CardHeader>
              <Icon className="mb-2 h-6 w-6 text-primary" aria-hidden />
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>

      <section className="flex flex-col gap-10">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Tri koraka do pregleda
          </h2>
          <p className="mt-3 text-pretty text-muted-foreground">
            Bez tabela u Excelu i bez ručnog prepisivanja izvoda.
          </p>
        </div>
        <ol className="grid gap-6 sm:grid-cols-3">
          {steps.map(({ title, description }, i) => (
            <li key={title} className="flex flex-col gap-3">
              <span
                aria-hidden
                className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary"
              >
                {i + 1}
              </span>
              <h3 className="text-lg font-medium">{title}</h3>
              <p className="text-sm text-muted-foreground">{description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-2xl border bg-muted/30 px-6 py-10 sm:px-10">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
          <ShieldCheck className="h-8 w-8 text-primary" aria-hidden />
          <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
            Privatnost nije naknadna misao
          </h2>
          <p className="text-pretty text-muted-foreground">
            Ne prodajemo tvoje podatke i ne puštamo reklamne trackere. Pristup tvojim podacima
            zaštićen je na nivou baze, a sve možeš izvesti ili trajno obrisati u svakom trenutku.
          </p>
          <Button asChild variant="outline">
            <Link href="/privatnost">Pročitaj politiku privatnosti</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto flex max-w-2xl flex-col items-center gap-6 text-center">
        <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          Spreman za pregled nad novcem?
        </h2>
        <Button asChild size="lg" className="h-11">
          <Link href="/registracija">Napravi nalog besplatno</Link>
        </Button>
      </section>
    </div>
  );
}
