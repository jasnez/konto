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
          <Link href="/uvezi" className="font-medium text-primary hover:underline">
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
        Trenutno ne nametamo zatvorenu listu banki: pokušavamo parsirati standardne redove
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

  // ─── Budgets / goals / forecast / insights FAQ ──────────────────────────────

  {
    id: 'budzeti-period',
    title: 'Šta je budžet i kako se računa potrošnja?',
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>
          Na stranici{' '}
          <Link href="/budzeti" className="font-medium text-primary hover:underline">
            Budžeti
          </Link>{' '}
          postavljaš mjesečni ili sedmični{' '}
          <strong className="text-foreground">limit po kategoriji</strong>. Konto sabira sve
          transakcije te kategorije u trenutnom periodu (mjesec, sedmica) i pokazuje koliko si
          potrošio od limita.
        </p>
        <p>
          <strong className="text-foreground">Boje na progress bar-u:</strong> zelena ispod 70%,
          žuta od 70% do 95%, crvena iznad 95%. Footer kartice ti kaže koliko dana je ostalo do
          kraja perioda i koliko BAM-a još smiješ potrošiti.
        </p>
        <p>
          Transferi između računa se{' '}
          <strong className="text-foreground">ne računaju u budžet</strong> — oni nisu trošak. Isto
          vrijedi za transakcije koje si označio kao “isključeno iz budžeta”.
        </p>
      </div>
    ),
  },

  {
    id: 'pretplate-detekcija',
    title: 'Kako Konto detektuje pretplate?',
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>
          Pretplate (recurring transakcije) se{' '}
          <strong className="text-foreground">automatski predlažu</strong> na osnovu tvoje
          historije. Algoritam grupiše transakcije po trgovcu i opisu, gleda razmake između datuma
          (sedmično, dvosedmično, mjesečno, kvartalno, godišnje), tolerise blagu varijaciju iznosa
          (~5%), i traži <strong className="text-foreground">barem 3 ponavljanja</strong> da se
          grupa kvalifikuje.
        </p>
        <p>
          Kandidate vidiš na stranici{' '}
          <Link href="/pretplate" className="font-medium text-primary hover:underline">
            Pretplate
          </Link>{' '}
          gdje ih potvrđuješ ili ignorišeš. Potvrđena pretplata se uračunava u prognozu salda i u
          "mjesečni ekvivalent" prikaz.
        </p>
        <p>
          Ako neka pretplata duže ne stiže (npr. ti ili banka su je otkazali), Konto je označava kao{' '}
          <strong className="text-foreground">neaktivnu</strong> i predlaže pauziranje preko uvida.
        </p>
      </div>
    ),
  },

  {
    id: 'ciljevi-stednje',
    title: 'Kako rade ciljevi štednje?',
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>
          Cilj je iznos koji želiš sakupiti, opciono sa rokom. Na stranici{' '}
          <Link href="/ciljevi" className="font-medium text-primary hover:underline">
            Ciljevi
          </Link>{' '}
          unosiš ime, ciljani iznos, valutu, opcionalno datum i ikonu.
        </p>
        <p>Postoje dva načina praćenja napretka:</p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            <strong className="text-foreground">Ručno</strong> — koristiš dugme "Dodaj uplatu" kad
            odvojiš novac. Konto inkrementira trenutni iznos.
          </li>
          <li>
            <strong className="text-foreground">Vezano za račun</strong> — povežeš cilj sa štednim
            računom. Trenutni saldo tog računa postaje napredak ka cilju, automatski.
          </li>
        </ul>
        <p>
          Kad postaviš datum, Konto računa{' '}
          <strong className="text-foreground">preporučeni mjesečni iznos</strong> da postigneš cilj
          na vrijeme. Kad pređeš ciljani iznos, dobijaš confetti i cilj prelazi u sekciju
          "Postignuti".
        </p>
      </div>
    ),
  },

  {
    id: 'uvidi-engine',
    title: 'Šta su uvidi i kako se generišu?',
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>
          Uvidi su <strong className="text-foreground">automatski generisana zapažanja</strong> o
          tvojim financijama — anomalije, prilike za uštedu, upozorenja. Vidiš ih na dashboardu (top
          3) ili u potpunoj listi na stranici{' '}
          <Link href="/uvidi" className="font-medium text-primary hover:underline">
            Uvidi
          </Link>
          .
        </p>
        <p>Konto pokreće 6 detektora svake noći u 03:00 UTC:</p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            <strong className="text-foreground">Anomalija kategorije</strong> — potrošnja u
            kategoriji veća od 130% prosjeka zadnja 3 mjeseca.
          </li>
          <li>
            <strong className="text-foreground">Ušteda</strong> — kategorija na manje od 80% od
            prosjeka (pohvalno).
          </li>
          <li>
            <strong className="text-foreground">Neobična transakcija</strong> — single tx više od 2σ
            iznad prosjeka kategorije.
          </li>
          <li>
            <strong className="text-foreground">Promjena cijene pretplate</strong> — najnovija
            transakcija +10% iznad prosjeka recurringa.
          </li>
          <li>
            <strong className="text-foreground">Prijetnja budžetu</strong> — projektovana potrošnja
            prelazi limit prije kraja perioda.
          </li>
          <li>
            <strong className="text-foreground">Neaktivna pretplata</strong> — recurring koji nije
            naplaćen 1.5× duže od očekivanog perioda.
          </li>
        </ul>
        <p>
          Sva analiza je <strong className="text-foreground">server-strana, samo agregati</strong>.
          Detalji o privatnosti:{' '}
          <Link href="/sigurnost#uvidi-engine" className="font-medium text-primary hover:underline">
            Sigurnost — uvidi
          </Link>
          .
        </p>
      </div>
    ),
  },

  {
    id: 'prognoza-saldo',
    title: 'Kako Konto projektuje saldo (prognoza)?',
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>
          Widget "Projekcija" na dashboardu pokazuje očekivani saldo narednih{' '}
          <strong className="text-foreground">30, 60 ili 90 dana</strong>. Algoritam:
        </p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>Polazna tačka — ukupan saldo svih računa danas (bez dugoročnih kredita).</li>
          <li>Plus očekivani prilivi (plata, recurring sa positive amount).</li>
          <li>Minus očekivani odlivi (recurring + linearna projekcija ostale potrošnje).</li>
        </ul>
        <p>
          Ako linija prelazi u crveno prije kraja prozora, Konto prikazuje{' '}
          <strong className="text-foreground">runway upozorenje</strong> sa datumom kad se očekuje
          negativan saldo. Ako saldo izdrži cijeli prozor, dobijaš zelenu poruku sa najnižom tačkom.
        </p>
      </div>
    ),
  },

  {
    id: 'onboarding-wizard',
    title: 'Šta je onboarding wizard?',
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>
          Kad se prvi put prijaviš (i nemaš još ni račun ni transakciju), Konto te vodi kroz{' '}
          <strong className="text-foreground">4-step wizard</strong>:
        </p>
        <ol className="ml-5 list-decimal space-y-1.5">
          <li>Dodaj prvi račun</li>
          <li>Uvezi PDF izvod ili dodaj transakciju ručno</li>
          <li>Postavi prvi budžet</li>
          <li>Postavi cilj štednje</li>
        </ol>
        <p>
          Svaki korak ima opciju "Preskoči ovaj korak". Možeš preskočiti i cijeli wizard u gornjem
          desnom uglu — onda dolaziš pravo na dashboard. Konto pamti dokle si stigao, tako da ako
          zatvoriš tab i vratiš se kasnije, nastavljaš sa istog koraka.
        </p>
      </div>
    ),
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-4 sm:space-y-8 sm:px-6 sm:py-6">
      <div className="space-y-2">
        <h1 className="text-headline">Pomoć</h1>
        <p className="text-base text-muted-foreground">
          Kratki odgovori na česta pitanja. Za potpun vodič kroz aplikaciju, pogledaj{' '}
          <Link href="/vodic" className="font-medium text-primary hover:underline">
            Vodič kroz Konto
          </Link>
          . Detaljne smjernice o podacima:{' '}
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
