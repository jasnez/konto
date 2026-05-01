import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Pomoć — Konto',
  description: 'Često postavljana pitanja o uvozu izvoda, bankama i kategorijama.',
};

const faqBlocks = [
  {
    id: 'uvoz-pdf',
    title: 'Kako radi uvoz bankarskog PDF-a?',
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>
          Na stranici{' '}
          <Link href="/import" className="font-medium text-primary hover:underline">
            Uvezi izvod
          </Link>{' '}
          biraš račun, učitavaš PDF, aplikacija ga sprema u zaštićeno skladište, izvuče tekst i
          šalje ga modelu umjetne inteligencije. Dobiješ listu predloženih transakcija; možeš
          urediti opis, kategoriju, isključiti stavke, pa potvrditi uvoz.
        </p>
        <p>
          Tehničke detalje o privati i modelu:{' '}
          <Link
            href="/sigurnost#uvoz-pdf-izvoda"
            className="font-medium text-primary hover:underline"
          >
            Sigurnost i privatnost — uvoz PDF
          </Link>
          .
        </p>
      </div>
    ),
  },
  {
    id: 'uvoz-ne-parsira',
    title: 'Izvod se ne parsira — šta raditi?',
    body: (
      <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
        <li>
          Provjeri da je fajl pravi <strong className="text-foreground">PDF</strong> (ne sken slike
          u nekom formatu oštećenog PDF-a).
        </li>
        <li>
          Pokušaj s manjim dijelom izvoda ili drugim izvodom iste banke (neki PDF-ovi su zaštićeni
          ili u potpunosti slikovni).
        </li>
        <li>
          Ako nakon nekoliko minuta i dalje vidiš grešku,{' '}
          <strong className="text-foreground">osvježi stranicu</strong> i provjeri internet.
        </li>
        <li>
          Ako se problem ponavlja, unesi stavke ručno (brzi unos) dok ne proširimo podršku za taj
          oblik PDF-a.
        </li>
      </ul>
    ),
  },
  {
    id: 'banke',
    title: 'Koje banke podržavamo?',
    body: (
      <p className="text-sm leading-relaxed text-muted-foreground">
        U Fazi 2 ne nametamo zatvorenu listu banki: pokušavamo parsirati standardne redove
        transakcija s izvoda na bosanskom/hrvatskom/srpskom tržištu. Rezultat ovisi o tome jesu li
        podaci u PDF-u strojno čitljivi (tekst) i jasno strukturirani. Kako produkt sazrijeva,
        nadograđujemo primjere i učenje. Ako nešto ne prođe, javi kroz povrat (kad bude u
        aplikaciji) ili se osloni na ručni unos.
      </p>
    ),
  },
  {
    id: 'kategorije-ucenje',
    title: 'Kako se učiti kategorije?',
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>
          Kad pridružiš <strong className="text-foreground">trgovca</strong> (merchant) stavci ili
          promijeniš kategoriju u pregledu prije uvođenja, sustav to pamti (aliasi, pravila,
          povijest). Sljedeći sličan opis ide prema toj kategoriji — što više ispravki, to
          predvidljivije ponašanje.
        </p>
        <p>
          Možeš urediti kategoriju i nakon uvođenja u listi transakcija. Masovne promjene radeš
          putem
          <strong className="text-foreground"> masovnog načina</strong> u pregledu uvo za više
          stavki odjednom.
        </p>
      </div>
    ),
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-4 sm:space-y-8 sm:px-6 sm:py-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Pomoć</h1>
        <p className="text-base text-muted-foreground">
          Kratki odgovori na česta pitanja. Detaljne smjernice o podacima:{' '}
          <Link href="/sigurnost" className="font-medium text-primary hover:underline">
            Sigurnost i privatnost
          </Link>
          .
        </p>
      </div>

      <div className="space-y-4" role="region" aria-label="Često postavljana pitanja">
        {faqBlocks.map((block) => (
          <Card key={block.id} id={block.id} className="scroll-mt-20">
            <CardHeader>
              <CardTitle className="text-lg font-semibold leading-snug tracking-tight">
                {block.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">{block.body}</CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
