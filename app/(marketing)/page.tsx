import Link from 'next/link';
import { ShieldCheck, Landmark, Euro } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function LandingPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-20 px-4 py-16 sm:gap-28 sm:px-6 sm:py-24">
      <section className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
          Novac, lokalno i privatno.
        </h1>
        <p className="text-pretty text-lg text-muted-foreground sm:text-xl">
          Lične finansije koje žive na tvom kontu. Bez povezivanja banke.
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
        <Card>
          <CardHeader>
            <ShieldCheck className="mb-2 h-6 w-6 text-primary" aria-hidden />
            <CardTitle>Lokalno u EU</CardTitle>
            <CardDescription>
              Podaci ostaju u Frankfurtu. Bez slanja u treće zemlje.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <Landmark className="mb-2 h-6 w-6 text-primary" aria-hidden />
            <CardTitle>Bez povezivanja banke</CardTitle>
            <CardDescription>
              Uvezi PDF izvod ili unesi ručno. Tvoji prijavni podaci nikad ne napuštaju banku.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <Euro className="mb-2 h-6 w-6 text-primary" aria-hidden />
            <CardTitle>Radi sa BAM i EUR</CardTitle>
            <CardDescription>
              Više računa u različitim valutama — svedeno na jednu baznu.
            </CardDescription>
          </CardHeader>
          <CardContent />
        </Card>
      </section>
    </div>
  );
}
