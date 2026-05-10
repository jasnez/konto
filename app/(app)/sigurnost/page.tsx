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
          Sažetak onoga što trebaš znati o tome kako Konto čuva i obrađuje tvoje podatke.
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
              Fajl se učitava u <strong className="text-foreground">zaštićeno skladište</strong>{' '}
              povezano s tvojim nalogom. Na serveru iz PDF-a pokušavamo izvući strojno čitljiv tekst
              (i pri potrebi OCR za slike stranice).{' '}
              <strong className="text-foreground">Prije</strong> slanja u model, tekst prolazi kroz
              pripremu i <strong className="text-foreground">redakciju osjetljivih podataka</strong>{' '}
              (vidi odlomak ispod). Tako modelu šaljemo sadržaj koji u najvećoj mjeri opisuje
              transakcije, a ne tvoje lične/brojčane identitete u punom obliku.
            </p>
            <p>
              Odgovor modela tumačimo u strukturirane transakcije (datum, iznos, valuta, opis,
              referenca). Nakon toga u aplikaciji uvek pregledaš i po želji urediš prije konačnog
              uvođenja u Konto.
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
              I dalje sačuvaj očekivani nivo opreza: PDF može sadržavati i druge osetljive podatke;
              pregled u aplikaciji je zadnja linija provjere prije uvođenja.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Koliko dugo čuvamo PDF</CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-relaxed text-muted-foreground">
            <p>
              Izvod u skladištu nije namenjen arhiviranju. Zadržavamo fajl najviše{' '}
              <strong className="text-foreground">24 sata</strong> (i brisanje zastarjelih stavki
              radi periodično u pozadini). Nakon{' '}
              <strong className="text-foreground">potvrde uvođenja</strong> pokušavamo odmah
              obrisati objekat; u svakom slučaju ne oslanjaj se na dugotrajno čuvanje sirovog PDF-a
              u aplikaciji.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Koji AI koristimo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <p>
              Za strukturiranje transakcija iz redaktovanog teksta koristimo{' '}
              <strong className="text-foreground">Google Generative Language API</strong> s modelom{' '}
              <strong className="text-foreground">Gemini 2.5 Flash-Lite</strong> (niska temperatura,
              ograničeno trajanje zahtjeva u kodu). Google navodi mogućnost{' '}
              <strong className="text-foreground">obrade u EU</strong> kroz prilagođenje projekata i
              regiona — u produkciji oslanjamo se na API ključ i konfiguraciju koje ispunjavaju
              važeće zahtjeve. Podaci otvorenog sadržaja ne šaljemo više korisnicima: samo ono što
              prethodi redakciji i sâm upit modelu, po ovim pravilima.
            </p>
          </CardContent>
        </Card>
      </section>

      <Separator />

      <section id="uvidi-engine" className="scroll-mt-20 space-y-4">
        <h2 className="text-lg font-medium tracking-tight">
          Uvidi (insights) — analiza tvojih podataka
        </h2>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Šta radi engine i šta NE radi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              Konto svake noći pokreće{' '}
              <strong className="text-foreground">analizu tvojih transakcija</strong> da bi otkrio
              anomalije (npr. potrošnja u kategoriji veća od prosjeka), prilike za uštedu, prijetnje
              budžetu i neaktivne pretplate. Rezultat ide u tabelu{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">insights</code> na koju samo ti
              imaš pristup (RLS).
            </p>
            <p>
              <strong className="text-foreground">Sve se dešava na našem serveru.</strong> Tvoji
              podaci ne idu trećim stranama — analiza koristi samo agregate (sume po kategoriji po
              mjesecu, prosjeke, standardne devijacije). Engine{' '}
              <strong className="text-foreground">ne šalje ništa</strong> ka eksternim API-jima: ni
              LLM-ovima, ni analytics provajderima, ni reklamnim mrežama.
            </p>
            <p>
              <strong className="text-foreground">Tehnička izolacija:</strong>
            </p>
            <ul className="ml-5 list-disc space-y-1.5">
              <li>
                Cron job (Vercel) trča u 03:00 UTC i obrađuje svakog korisnika zasebno; nema
                cross-user agregacije.
              </li>
              <li>
                Sva polja u <code className="rounded bg-muted px-1 py-0.5 text-xs">insights</code>{' '}
                tabeli (naslov, body, metadata) su generisana na našem serveru, nikad ne sadrže
                IBAN, JMBG, broj kartice ni email — samo imena tvojih kategorija/trgovaca i iznose u
                tvojoj valuti.
              </li>
              <li>
                Kad odbiješ uvid (klikneš X), označava se kao{' '}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">dismissed_at</code> i ostaje
                u bazi 90 dana radi historije, nakon čega se trajno briše.
              </li>
              <li>
                Možeš ručno pokrenuti analizu (dugme "Generiši ponovo" u dev modu); rate-limited na
                jedan poziv u 60 sekundi.
              </li>
            </ul>
            <p>
              Detalji o tome šta tačno engine traži:{' '}
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
            <CardTitle className="text-base">Otkrio si problem?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              Ako si pronašao ranjivost koja može uticati na povjerljivost, integritet ili
              dostupnost korisničkih podataka, javi nam direktno na{' '}
              <a
                href="mailto:security@konto.app"
                className="font-medium text-primary hover:underline"
              >
                security@konto.app
              </a>
              . Odgovaramo unutar 72 sata.
            </p>
            <p>
              Za prvi kontakt dovoljan je opis problema i koraci za reprodukciju — eksploit detalje
              ne moraš slati u istom mailu. Molimo te da ne pokrećeš testove koji opterećuju servis
              (DDoS, masovno scraping) niti da pristupaš tuđim nalozima; ozbiljnost prijave
              cijenimo, ali ne na štetu drugih korisnika.
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
