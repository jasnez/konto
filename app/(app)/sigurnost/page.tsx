import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export const metadata: Metadata = {
  title: 'Sigurnost i privatnost — Konto',
  description: 'Kako Konto tretira tvoje podatke, uključujući uvoz bankarskih PDF-ova.',
};

export default function SigurnostPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-4 sm:space-y-10 sm:px-6 sm:py-6">
      <div className="space-y-2">
        <h1 className="text-headline">Sigurnost i privatnost</h1>
        <p className="text-base text-muted-foreground">
          Sve bitno o tome kako Konto čuva tvoje podatke — bez sitnih slova.
        </p>
      </div>

      <section id="uvoz-pdf-izvoda" className="scroll-mt-20 space-y-4">
        <h2 className="text-lg font-medium tracking-tight">Uvoz PDF izvoda</h2>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kako obrađujemo tvoj PDF</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              Tvoj PDF ide u <strong className="text-foreground">zaštićeno skladište</strong> vezano
              samo za tvoj nalog. Iz PDF-a izvlačimo tekst (a za skenirane stranice koristimo OCR).{' '}
              <strong className="text-foreground">Prije</strong> slanja u AI model, automatski{' '}
              <strong className="text-foreground">redaktujemo osjetljive podatke</strong> (vidi
              odlomak ispod). Tako AI vidi opise transakcija — ne tvoj IBAN, JMBG ili broj kartice.
            </p>
            <p>
              AI nam vrati strukturirane transakcije (datum, iznos, valuta, opis, referenca). Ti ih
              uvijek pregledaš i po želji urediš prije nego što uđu u Konto.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Šta je redaktovano prije slanja u AI</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <p>Automatizovano uklanjamo ili zamijenjujemo, između ostalog:</p>
            <ul className="list-inside list-disc space-y-1">
              <li>
                <strong className="text-foreground">IBAN</strong> s regionalnih formata (npr. BA,
                HR, SI, RS, ME, MK) — zamjena fiksnim oznakama poput{' '}
                <code className="rounded bg-muted px-1">[IBAN-REDACTED]</code>.
              </li>
              <li>
                <strong className="text-foreground">Broj platne kartice</strong> (Luhn) — maska u
                obliku <code className="rounded bg-muted px-1">****1234</code> (vidljive zadnje
                četiri cifre).
              </li>
              <li>
                <strong className="text-foreground">JMBG</strong> (trinaest cifara) —{' '}
                <code className="rounded bg-muted px-1">[JMBG-REDACTED]</code>.
              </li>
            </ul>
            <p>
              I dalje budi oprezan/oprezna: PDF može sadržavati i druge osjetljive podatke koje
              automatika ne prepozna. Pregled u aplikaciji je zadnja linija provjere prije uvoza.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Koliko dugo čuvamo PDF</CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-relaxed text-muted-foreground">
            <p>
              Sirovi PDF nije za arhiviranje. Zadržavamo fajl najviše{' '}
              <strong className="text-foreground">24 sata</strong> (zastarjeli fajlovi se brišu
              periodično u pozadini). Nakon{' '}
              <strong className="text-foreground">potvrde uvoza</strong> pokušavamo odmah obrisati
              fajl. Ne računaj da PDF ostaje dostupan duže od toga.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Koji AI koristimo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <p>
              Za strukturiranje teksta iz PDF-a koristimo{' '}
              <strong className="text-foreground">Gemini 2.5 Flash-Lite</strong> (Google) s niskom
              temperaturom i ograničenim trajanjem zahtjeva. Pozive šaljemo s{' '}
              <strong className="text-foreground">EU konfiguracijom</strong> (region i podešavanja
              Google Cloud projekta). Modelu ide samo redaktovan tekst tvog izvoda — ništa drugo i
              nikad podaci drugih korisnika.
            </p>
          </CardContent>
        </Card>
      </section>

      <Separator />

      <section id="uvidi-engine" className="scroll-mt-20 space-y-4">
        <h2 className="text-lg font-medium tracking-tight">Uvidi — analiza tvojih podataka</h2>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Šta analiza radi (i šta ne radi)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              Konto svake noći pokreće{' '}
              <strong className="text-foreground">analizu tvojih transakcija</strong> da bi
              otkrio/la anomalije (npr. potrošnja u kategoriji veća od prosjeka), prilike za uštedu,
              prijetnje budžetu i neaktivne pretplate. Rezultat vidiš samo ti.
            </p>
            <p>
              <strong className="text-foreground">Sve se dešava na našem serveru.</strong> Tvoji
              podaci ne idu trećim stranama — analiza radi sa zbrojevima po kategoriji, mjesecu i
              prosjekima. <strong className="text-foreground">Ništa ne šalje van Konta</strong> — ni
              AI modelima, ni analitici, ni reklamnim mrežama.
            </p>
            <p>
              <strong className="text-foreground">Kako je izolovano:</strong>
            </p>
            <ul className="ml-5 list-disc space-y-1.5">
              <li>
                Analiza se pokreće svake noći u <strong className="text-foreground">04:00</strong>{' '}
                (po BiH vremenu), zasebno za svakog korisnika. Nikad ne kombinujemo podatke više
                korisnika.
              </li>
              <li>
                Tekst uvida nikad ne sadrži IBAN, JMBG, broj kartice ni email — samo imena tvojih
                kategorija i prodavača i iznose u tvojoj valuti.
              </li>
              <li>
                Kad odbiješ uvid (klikneš X), ostaje u bazi 90 dana radi historije, pa se trajno
                briše.
              </li>
              <li>
                U razvojnom modu možeš ručno pokrenuti analizu — limit je jedan poziv u 60 sekundi.
              </li>
            </ul>
            <p>
              Detalji o tome šta tačno analiza traži:{' '}
              <Link href="/pomoc#uvidi-engine" className="font-medium text-primary hover:underline">
                Pomoć — uvidi
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </section>

      <Separator />

      <section id="prijava-ranjivosti" className="scroll-mt-20 space-y-4">
        <h2 className="text-lg font-medium tracking-tight">Prijava sigurnosnih ranjivosti</h2>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pronađena ranjivost?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              Ako pronađeš ranjivost koja može uticati na povjerljivost, integritet ili dostupnost
              korisničkih podataka, javi nam direktno na{' '}
              <a
                href="mailto:security@konto.app"
                className="font-medium text-primary hover:underline"
              >
                security@konto.app
              </a>
              . Odgovaramo unutar 72 sata.
            </p>
            <p>
              Za prvi kontakt dovoljan je opis problema i koraci za reprodukciju — exploit detalje
              ne moraš slati u istom mailu. Molimo te da ne pokrećeš testove koji opterećuju servis
              (DDoS, masovni scraping) ni da pristupaš tuđim nalozima; ozbiljnost prijave cijenimo,
              ali ne na štetu drugih korisnika.
            </p>
            <p>
              Strojno čitljiva verzija je na{' '}
              <a
                href="/.well-known/security.txt"
                className="font-medium text-primary hover:underline"
              >
                /.well-known/security.txt
              </a>{' '}
              (RFC 9116).
            </p>
          </CardContent>
        </Card>
      </section>

      <Separator />

      <p className="text-sm text-muted-foreground">
        Korisnički vodič (FAQ):{' '}
        <Link href="/pomoc" className="font-medium text-primary hover:underline">
          /pomoc
        </Link>
        .
      </p>
    </div>
  );
}
