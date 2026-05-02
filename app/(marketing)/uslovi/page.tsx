import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Uslovi korištenja — Konto',
  description: 'Šta očekivati od Konto-a, šta se očekuje od tebe, i pravna pitanja.',
};

const LAST_UPDATED = '2. maj 2026.';

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-3">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export default function UsloviPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12 sm:px-6 sm:py-16">
      <header className="space-y-3">
        <p className="text-sm font-mono text-muted-foreground">Uslovi</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Uslovi korištenja</h1>
        <p className="text-base text-muted-foreground">
          Sažetak: Konto je alat koji ti pomaže da pratiš svoje finansije; ne pružamo savjete i ne
          povezujemo se na tvoju banku. Ti ostaješ vlasnik svojih podataka.
        </p>
        <p className="text-xs text-muted-foreground">
          Zadnja izmjena: <strong className="text-foreground">{LAST_UPDATED}</strong>
        </p>
      </header>

      <aside
        aria-label="Najvažnije ukratko"
        className="rounded-xl border-l-4 border-primary bg-primary/5 px-4 py-3 text-sm"
      >
        <p className="font-medium text-foreground">Najvažnije ukratko:</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
          <li>
            Aplikacija je u <strong className="text-foreground">zatvorenom beta režimu</strong> —
            može imati greške i mijenjati se brzo.
          </li>
          <li>
            <strong className="text-foreground">Ne pružamo financijske savjete</strong>; provjeri
            važne brojke prije donošenja odluka.
          </li>
          <li>Možeš preuzeti sve svoje podatke i obrisati nalog kad god, bez objašnjenja.</li>
        </ul>
      </aside>

      <nav aria-label="Sadržaj" className="rounded-xl border bg-muted/30 p-4 text-sm">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Sadržaj
        </p>
        <ol className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          <li>
            <a href="#prihvatanje" className="text-primary hover:underline">
              1. Prihvatanje uslova
            </a>
          </li>
          <li>
            <a href="#sta-je" className="text-primary hover:underline">
              2. Šta je Konto (i šta nije)
            </a>
          </li>
          <li>
            <a href="#ko-moze" className="text-primary hover:underline">
              3. Ko može koristiti
            </a>
          </li>
          <li>
            <a href="#nalog" className="text-primary hover:underline">
              4. Tvoj nalog
            </a>
          </li>
          <li>
            <a href="#podaci" className="text-primary hover:underline">
              5. Tvoji podaci
            </a>
          </li>
          <li>
            <a href="#pravila" className="text-primary hover:underline">
              6. Pravila korištenja
            </a>
          </li>
          <li>
            <a href="#bez-savjeta" className="text-primary hover:underline">
              7. Bez financijskih savjeta
            </a>
          </li>
          <li>
            <a href="#bez-garancija" className="text-primary hover:underline">
              8. Bez garancija
            </a>
          </li>
          <li>
            <a href="#odgovornost" className="text-primary hover:underline">
              9. Ograničenje odgovornosti
            </a>
          </li>
          <li>
            <a href="#raskid" className="text-primary hover:underline">
              10. Trajanje i raskid
            </a>
          </li>
          <li>
            <a href="#izmjene" className="text-primary hover:underline">
              11. Izmjene uslova
            </a>
          </li>
          <li>
            <a href="#pravo" className="text-primary hover:underline">
              12. Mjerodavno pravo
            </a>
          </li>
          <li>
            <a href="#kontakt" className="text-primary hover:underline">
              13. Kontakt
            </a>
          </li>
        </ol>
      </nav>

      <Section id="prihvatanje" title="1. Prihvatanje uslova">
        <p>
          Korištenjem Konto-a (kreiranjem naloga, prijavom, ili na bilo koji drugi način aktivnim
          pristupom aplikaciji) potvrđuješ da si pročitao/la i prihvatio/la ove uslove i našu{' '}
          <Link href="/privatnost" className="font-medium text-primary hover:underline">
            Politiku privatnosti
          </Link>
          . Ako se ne slažeš sa nekim dijelom, najjednostavnije je da ne koristiš aplikaciju ili da{' '}
          <Link href="/podesavanja/obrisi" className="font-medium text-primary hover:underline">
            obrišeš nalog
          </Link>
          .
        </p>
      </Section>

      <Section id="sta-je" title="2. Šta je Konto (i šta nije)">
        <p>
          <strong className="text-foreground">Konto je</strong> alat za lično praćenje finansija
          (lokalno: BiH, HR, SR i šire). Pomaže ti da:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>vodiš evidenciju računa, transakcija i kategorija;</li>
          <li>
            opciono uvezeš PDF bankarski izvod, gdje AI model pomaže oko prepoznavanja stavki;
          </li>
          <li>vidiš pregled potrošnje, prihoda i obrazaca u svojim podacima.</li>
        </ul>
        <p>
          <strong className="text-foreground">Konto nije</strong>:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong className="text-foreground">Bankarska aplikacija</strong> — ne držimo tvoj
            novac, ne izvršavamo plaćanja, ne primamo uplate u tvoje ime.
          </li>
          <li>
            <strong className="text-foreground">Open Banking integracija</strong> — ne povezujemo se
            na tvoju banku, ne čitamo direktno transakcije iz banke. Sve podatke ti unosiš ili
            uvoziš ručno (kroz PDF izvod).
          </li>
          <li>
            <strong className="text-foreground">Financijski savjetnik</strong> — vidi sekciju 7.
          </li>
          <li>
            <strong className="text-foreground">Računovodstveni sistem</strong> za firme — Konto je
            namijenjen ličnoj upotrebi.
          </li>
        </ul>
      </Section>

      <Section id="ko-moze" title="3. Ko može koristiti">
        <p>
          Konto mogu koristiti punoljetne osobe (18+). Ako si mlađi/a, koristi aplikaciju samo uz
          odobrenje roditelja ili staratelja.
        </p>
        <p>
          Aplikacija je dostupna globalno, ali pisana je primarno za korisnike u Bosni i Hercegovini
          i regiji (BiH, HR, SR, ME, MK, SI). Ne moraš biti rezident BiH da bi je koristio/la, ali
          jezik aplikacije je bosanski.
        </p>
      </Section>

      <Section id="nalog" title="4. Tvoj nalog">
        <p>Kad otvoriš nalog, prihvataš da:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            koristiš <strong className="text-foreground">tačnu email adresu</strong> kojoj zaista
            imaš pristup (ne radi recovery ako nemaš pristup mailu);
          </li>
          <li>
            <strong className="text-foreground">čuvaš pristup svom mailu</strong> — login se vrši
            kroz magic link, pa ko god kontroliše tvoj email kontroliše i tvoj Konto nalog;
          </li>
          <li>jedan korisnik = jedan nalog (ne dijeli kredencijale s drugima);</li>
          <li>
            ako primijetiš sumnjivu aktivnost, javiš nam na{' '}
            <a
              href="mailto:security@konto.app"
              className="font-medium text-primary hover:underline"
            >
              security@konto.app
            </a>
            .
          </li>
        </ul>
      </Section>

      <Section id="podaci" title="5. Tvoji podaci">
        <p>
          Ti ostaješ vlasnik svih podataka koje uneseš ili uvezeš u Konto. Kako čuvamo, dijelimo i
          brišemo te podatke detaljno je opisano u{' '}
          <Link href="/privatnost" className="font-medium text-primary hover:underline">
            Politici privatnosti
          </Link>
          .
        </p>
        <p>
          Možeš u svakom trenutku{' '}
          <Link href="/podesavanja/izvoz" className="font-medium text-primary hover:underline">
            preuzeti svoje podatke u JSON formatu
          </Link>{' '}
          ili{' '}
          <Link href="/podesavanja/obrisi" className="font-medium text-primary hover:underline">
            obrisati nalog
          </Link>{' '}
          (sa 30-dnevnim grace periodom za predomišljanje).
        </p>
      </Section>

      <Section id="pravila" title="6. Pravila korištenja">
        <p>
          Korištenjem Konto-a slažeš se da <strong className="text-foreground">nećeš</strong>:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            pokušati pristupiti tuđim nalozima, podacima ili infrastrukturi (penetration testing
            samo uz prethodnu pisanu saglasnost — vidi{' '}
            <a
              href="mailto:security@konto.app"
              className="font-medium text-primary hover:underline"
            >
              security@konto.app
            </a>
            );
          </li>
          <li>
            namjerno opteretiti servis (DDoS, scraping, brute force) ili ometati rad za druge
            korisnike;
          </li>
          <li>
            koristiti aplikaciju za prevaru, pranje novca, financiranje terorizma ili druge
            nezakonite aktivnosti;
          </li>
          <li>
            uploadovati maliciozni sadržaj (malware, exploit fajlove, phishing materijal) ili
            sadržaj koji krši autorska prava trećih lica;
          </li>
          <li>
            reverse-engineerovati, dekompajlirati ili pokušati izvući source kod aplikacije izvan
            onoga što je javno objavljeno;
          </li>
          <li>
            zaobići rate limit-e, autentifikaciju ili autorizaciju (RLS) drugim sredstvima nego što
            aplikacija normalno predviđa.
          </li>
        </ul>
        <p>
          Ako prekršiš ova pravila, zadržavamo pravo da privremeno ili trajno suspendujemo tvoj
          nalog, sa prethodnim upozorenjem kad god je to praktično.
        </p>
      </Section>

      <Section id="bez-savjeta" title="7. Bez financijskih savjeta">
        <p>
          <strong className="text-foreground">
            Konto ne pruža financijske, investicione, poreske ili pravne savjete.
          </strong>{' '}
          Sve što vidiš u aplikaciji — kategorije, sumarne brojke, trendovi, grafovi — su mehaničke
          kalkulacije nad podacima koje si ti unio/la. To nije preporuka šta bi trebao/la uraditi sa
          svojim novcem.
        </p>
        <p>
          Prije bilo koje važne financijske odluke (kredit, investicija, kupovina, poreska prijava)
          konsultuj se sa kvalifikovanim stručnjakom i provjeri brojke iz primarnih izvora (banka,
          knjigovodja, advokat).
        </p>
      </Section>

      <Section id="bez-garancija" title="8. Bez garancija">
        <p>
          Aplikacija se pruža <strong className="text-foreground">"kao što jeste"</strong> ("as is")
          i <strong className="text-foreground">"kako je dostupna"</strong> ("as available"). U
          mjeri u kojoj zakon dozvoljava, ne dajemo izričite niti prećutne garancije, uključujući
          (bez ograničenja):
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            garancije neprekidnog rada, dostupnosti ili odsustva grešaka — naročito tokom beta faze;
          </li>
          <li>
            garancije tačnosti automatske kategorizacije ili AI parsiranja PDF izvoda — uvijek
            pregledaj prije potvrde uvoza;
          </li>
          <li>
            garancije pogodnosti za određenu svrhu (npr. službena računovodstvena evidencija ili
            poreska prijava).
          </li>
        </ul>
      </Section>

      <Section id="odgovornost" title="9. Ograničenje odgovornosti">
        <p>
          U mjeri u kojoj zakon dozvoljava, Konto i osobe iza projekta nisu odgovorni za indirektne,
          slučajne, posljedične ili posebne štete koje proisteknu iz korištenja ili nemogućnosti
          korištenja aplikacije, uključujući (bez ograničenja) izgubljen profit, izgubljene podatke
          ili poslovne prilike.
        </p>
        <p>
          Naša ukupna odgovornost prema tebi, za bilo koji zahtjev vezan za uslove ili aplikaciju,
          neće preći iznos koji si platio/la za uslugu u zadnjih 12 mjeseci (a ako je aplikacija
          besplatna, naša ukupna odgovornost se ograničava na vraćanje tvojih podataka u JSON
          formatu).
        </p>
        <p>
          Ovo ne ograničava bilo koje pravo koje imaš po obaveznim odredbama zakona o zaštiti
          potrošača koji se ne mogu ugovorom isključiti.
        </p>
      </Section>

      <Section id="raskid" title="10. Trajanje i raskid">
        <p>
          <strong className="text-foreground">Sa tvoje strane:</strong> možeš obrisati nalog u bilo
          kom trenutku kroz{' '}
          <Link href="/podesavanja/obrisi" className="font-medium text-primary hover:underline">
            Podešavanja → Obriši nalog
          </Link>
          . Imaš 30 dana grace perioda da otkažeš.
        </p>
        <p>
          <strong className="text-foreground">Sa naše strane:</strong> možemo suspendovati ili
          ugasiti nalog ako prekršiš pravila iz sekcije 6, ako duže vrijeme nije korišten, ili ako
          zatvorimo aplikaciju u cjelini. U slučaju zatvaranja aplikacije, javljamo minimum 30 dana
          unaprijed mailom i omogućavamo ti izvoz svih podataka prije gašenja.
        </p>
      </Section>

      <Section id="izmjene" title="11. Izmjene uslova">
        <p>
          Materijalne izmjene ovih uslova (npr. promjena prava korisnika, novi sub-procesori,
          promjena modela monetizacije) najavljujemo mailom svim korisnicima minimum 14 dana
          unaprijed, sa rezimeom šta se mijenja. Manje izmjene (jezičke korekcije, jasnoća)
          objavljujemo bez najave; datum zadnje izmjene je vidljiv na vrhu, a sva istorija se čuva u
          Git-u.
        </p>
        <p>
          Ako se ne slažeš s izmjenama, jednostavno obriši nalog prije nego što izmjene stupe na
          snagu.
        </p>
      </Section>

      <Section id="pravo" title="12. Mjerodavno pravo i sporovi">
        <p>
          Na ove uslove primjenjuje se pravo Bosne i Hercegovine. Spor pokušavamo riješiti
          dobronamjerno i mailom prije nego što ide na sud — javi nam na{' '}
          <a href="mailto:hello@konto.app" className="font-medium text-primary hover:underline">
            hello@konto.app
          </a>{' '}
          i odgovaramo unutar 30 dana.
        </p>
        <p>
          Ako se ne riješi sporazumno, nadležan je stvarno nadležni sud u Bosni i Hercegovini. Ako
          si potrošač iz EU-a, zadržavaš sva prava po Uredbi (EU) 1215/2012 o nadležnosti i
          priznavanju sudskih odluka u građanskim i trgovačkim stvarima.
        </p>
      </Section>

      <Section id="kontakt" title="13. Kontakt">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Opća pitanja, podrška →{' '}
            <a href="mailto:hello@konto.app" className="font-medium text-primary hover:underline">
              hello@konto.app
            </a>
          </li>
          <li>
            Privatnost / podaci →{' '}
            <a
              href="mailto:privatnost@konto.app"
              className="font-medium text-primary hover:underline"
            >
              privatnost@konto.app
            </a>
          </li>
          <li>
            Sigurnost / prijava ranjivosti →{' '}
            <a
              href="mailto:security@konto.app"
              className="font-medium text-primary hover:underline"
            >
              security@konto.app
            </a>
          </li>
        </ul>
      </Section>
    </div>
  );
}
