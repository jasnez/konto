import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Politika privatnosti — Konto',
  description: 'Kako Konto čuva tvoje podatke i koja su tvoja prava.',
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

export default function PrivatnostPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12 sm:px-6 sm:py-16">
      <header className="space-y-3">
        <p className="text-sm font-mono text-muted-foreground">Privatnost</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Politika privatnosti</h1>
        <p className="text-base text-muted-foreground">
          Sažetak: čuvamo samo ono što ti aktivno daješ aplikaciji, držimo to u EU, ne prodajemo
          trećim stranama, i daješ ti potpunu kontrolu nad brisanjem i izvozom.
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
          <li>Tvoje podatke nikad ne prodajemo i nikad ne dijelimo s reklamnim mrežama.</li>
          <li>Sve čuvamo u EU (Frankfurt).</li>
          <li>Možeš preuzeti sve svoje podatke i obrisati nalog kad god poželiš.</li>
        </ul>
      </aside>

      <nav aria-label="Sadržaj" className="rounded-xl border bg-muted/30 p-4 text-sm">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Sadržaj
        </p>
        <ol className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          <li>
            <a href="#kontroler" className="text-primary hover:underline">
              1. Ko obrađuje podatke
            </a>
          </li>
          <li>
            <a href="#sta" className="text-primary hover:underline">
              2. Šta prikupljamo
            </a>
          </li>
          <li>
            <a href="#zasto" className="text-primary hover:underline">
              3. Zašto i na osnovu čega
            </a>
          </li>
          <li>
            <a href="#kome" className="text-primary hover:underline">
              4. Kome dijelimo
            </a>
          </li>
          <li>
            <a href="#koliko" className="text-primary hover:underline">
              5. Koliko čuvamo
            </a>
          </li>
          <li>
            <a href="#prava" className="text-primary hover:underline">
              6. Tvoja prava
            </a>
          </li>
          <li>
            <a href="#sigurnost" className="text-primary hover:underline">
              7. Sigurnost
            </a>
          </li>
          <li>
            <a href="#kontakt" className="text-primary hover:underline">
              8. Kontakt
            </a>
          </li>
          <li>
            <a href="#izmjene" className="text-primary hover:underline">
              9. Izmjene politike
            </a>
          </li>
        </ol>
      </nav>

      <Section id="kontroler" title="1. Ko obrađuje tvoje podatke">
        <p>
          Konto razvija nezavisni developer iz Bosne i Hercegovine. Aplikacija je trenutno u
          zatvorenom beta režimu. Pravno ime entiteta i registrirana adresa dopuniti će se prije
          javnog launch-a; do tada možeš nas kontaktirati direktno preko maila.
        </p>
        <p>
          Za sva pitanja vezana za obradu tvojih podataka, piši na{' '}
          <a
            href="mailto:privatnost@konto.app"
            className="font-medium text-primary hover:underline"
          >
            privatnost@konto.app
          </a>
          .
        </p>
      </Section>

      <Section id="sta" title="2. Koje podatke prikupljamo">
        <p>Prikupljamo samo ono što ti aktivno daješ aplikaciji:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong className="text-foreground">Email adresa</strong> — za prijavu (magic link) i
            komunikaciju o nalogu (potvrde, brisanje).
          </li>
          <li>
            <strong className="text-foreground">Finansijski podaci</strong> koje ti unosiš ili
            uvoziš: računi, transakcije, kategorije, prodavači, bilješke.
          </li>
          <li>
            <strong className="text-foreground">PDF izvodi</strong> koje opciono učitavaš — kratko,
            do 24 sata (vidi sekciju 5).
          </li>
          <li>
            <strong className="text-foreground">Audit log</strong> sigurnosnih događaja (prijave,
            izmjene postavki, brisanja) — za istragu eventualnih incidenata.
          </li>
          <li>
            <strong className="text-foreground">Tehnički podaci</strong> (IP adresa, user-agent
            string) — za rate limiting i odbranu od zloupotrebe.
          </li>
        </ul>
        <p>
          <strong className="text-foreground">Šta NE prikupljamo:</strong>
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Ne povezujemo se na tvoju banku — Open Banking ne koristimo.</li>
          <li>
            Nema third-party reklamnih trackera (Facebook Pixel, Google Analytics, Hotjar i slično).
          </li>
          <li>Ne snimamo tipkanje u input poljima.</li>
        </ul>
      </Section>

      <Section id="zasto" title="3. Zašto i na osnovu čega">
        <p>Pravna osnova obrade je određena svrhom:</p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-muted/50 text-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Svrha</th>
                <th className="px-3 py-2 font-medium">Pravna osnova (GDPR čl. 6)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr>
                <td className="px-3 py-2">Auth + nalog</td>
                <td className="px-3 py-2">Ugovor (čl. 6.1.b)</td>
              </tr>
              <tr>
                <td className="px-3 py-2">Finansijski podaci (skladištenje, kategorizacija)</td>
                <td className="px-3 py-2">Ugovor (čl. 6.1.b)</td>
              </tr>
              <tr>
                <td className="px-3 py-2">PDF parsiranje (LLM)</td>
                <td className="px-3 py-2">Ugovor (čl. 6.1.b)</td>
              </tr>
              <tr>
                <td className="px-3 py-2">Email komunikacija o nalogu</td>
                <td className="px-3 py-2">Ugovor (čl. 6.1.b)</td>
              </tr>
              <tr>
                <td className="px-3 py-2">Sigurnosni log + rate limiting</td>
                <td className="px-3 py-2">Legitimni interes (čl. 6.1.f)</td>
              </tr>
              <tr>
                <td className="px-3 py-2">Marketing email (ako bude opcioni)</td>
                <td className="px-3 py-2">Pristanak (čl. 6.1.a) — opt-in, nikad default</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="kome" title="4. Kome dijelimo (sub-procesori)">
        <p>
          Da bi aplikacija radila, određeni broj infrastrukturnih partnera tehnički obrađuje
          dijelove tvojih podataka. Sa svakim imamo standardni Data Processing Agreement.
        </p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-muted/50 text-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Partner</th>
                <th className="px-3 py-2 font-medium">Šta obrađuje</th>
                <th className="px-3 py-2 font-medium">Lokacija</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr>
                <td className="px-3 py-2 font-medium text-foreground">Supabase</td>
                <td className="px-3 py-2">Baza, auth, skladište fajlova</td>
                <td className="px-3 py-2">EU (Frankfurt)</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-medium text-foreground">Vercel</td>
                <td className="px-3 py-2">Hosting i edge</td>
                <td className="px-3 py-2">EU regije</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-medium text-foreground">Google Cloud (Gemini)</td>
                <td className="px-3 py-2">
                  Strukturiranje teksta iz PDF-a (nakon redakcije osjetljivih podataka)
                </td>
                <td className="px-3 py-2">EU (kroz API podešavanja)</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-medium text-foreground">Resend</td>
                <td className="px-3 py-2">Slanje email-ova (potvrde brisanja, magic link)</td>
                <td className="px-3 py-2">EU</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          <strong className="text-foreground">Ne dijelimo</strong> tvoje podatke s reklamnim
          mrežama, brokerima podataka, niti bilo kim izvan ove liste. Nikad nismo i nikad nećemo
          prodavati tvoje podatke.
        </p>
      </Section>

      <Section id="koliko" title="5. Koliko dugo čuvamo">
        <div className="overflow-x-auto rounded-lg border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-muted/50 text-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Vrsta</th>
                <th className="px-3 py-2 font-medium">Period</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr>
                <td className="px-3 py-2">Aktivni nalog + podaci</td>
                <td className="px-3 py-2">Dok god je nalog aktivan</td>
              </tr>
              <tr>
                <td className="px-3 py-2">Obrisani nalog</td>
                <td className="px-3 py-2">30 dana soft delete, pa trajno brisanje</td>
              </tr>
              <tr>
                <td className="px-3 py-2">PDF izvodi (sirovi fajl)</td>
                <td className="px-3 py-2">
                  <strong className="text-foreground">24 sata</strong>
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2">Audit log</td>
                <td className="px-3 py-2">90 dana</td>
              </tr>
              <tr>
                <td className="px-3 py-2">Backup baze</td>
                <td className="px-3 py-2">30 dana</td>
              </tr>
              <tr>
                <td className="px-3 py-2">Email logovi (Resend)</td>
                <td className="px-3 py-2">30 dana</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="prava" title="6. Tvoja prava">
        <p>Po GDPR-u i bh. Zakonu o zaštiti ličnih podataka, imaš pravo na:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-foreground">Pristup</strong> — preuzmi sve svoje podatke u JSON
            formatu kroz{' '}
            <Link href="/podesavanja/izvoz" className="font-medium text-primary hover:underline">
              Podešavanja → Izvoz podataka
            </Link>
            .
          </li>
          <li>
            <strong className="text-foreground">Brisanje</strong> — pokreni proces brisanja kroz{' '}
            <Link href="/podesavanja/obrisi" className="font-medium text-primary hover:underline">
              Podešavanja → Obriši nalog
            </Link>
            . Imaš 30 dana da otkažeš ako se predomisliš.
          </li>
          <li>
            <strong className="text-foreground">Ispravku</strong> — sve podatke možeš urediti kroz
            aplikaciju.
          </li>
          <li>
            <strong className="text-foreground">Prenos</strong> — JSON izvoz iz tačke "Pristup" je
            mašinski čitljiv i možeš ga koristiti za prenos u drugi servis.
          </li>
          <li>
            <strong className="text-foreground">Prigovor</strong> na obradu po legitimnom interesu —
            javi nam mailom.
          </li>
          <li>
            <strong className="text-foreground">Žalbu</strong> nadzornom tijelu — u BiH je to
            Agencija za zaštitu ličnih podataka BiH.
          </li>
        </ul>
      </Section>

      <Section id="sigurnost" title="7. Sigurnost">
        <p>Tehničke mjere koje primjenjujemo:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>TLS 1.3 za sav promet (HTTP nikad).</li>
          <li>Disk enkripcija na nivou platforme (Supabase, Vercel).</li>
          <li>
            Row-Level Security u bazi — svaki korisnik vidi samo svoje redove, čak i kad bi
            aplikativni kod bio kompromitovan.
          </li>
          <li>
            Redakcija osjetljivih podataka (IBAN, brojevi platnih kartica, JMBG) prije slanja PDF
            teksta u AI model.
          </li>
          <li>24-satni limit na čuvanje sirovih PDF izvoda (vidi sekciju 5).</li>
          <li>
            Magic link auth — bez lozinki, bez SMS-a (jer i jedno i drugo nose vlastite rizike).
          </li>
        </ul>
        <p>
          <strong className="text-foreground">Ako otkriješ ranjivost</strong> u Konto-u, javi na{' '}
          <a href="mailto:security@konto.app" className="font-medium text-primary hover:underline">
            security@konto.app
          </a>
          . Odgovaramo unutar 72 sata.
        </p>
      </Section>

      <Section id="kontakt" title="8. Kontakt">
        <ul className="list-disc space-y-1 pl-5">
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
            Sigurnost →{' '}
            <a
              href="mailto:security@konto.app"
              className="font-medium text-primary hover:underline"
            >
              security@konto.app
            </a>
          </li>
          <li>
            Sve ostalo →{' '}
            <a href="mailto:hello@konto.app" className="font-medium text-primary hover:underline">
              hello@konto.app
            </a>
          </li>
        </ul>
      </Section>

      <Section id="izmjene" title="9. Izmjene politike">
        <p>
          Materijalne izmjene (npr. novi sub-procesor, promjena retention perioda) najavljujemo
          mailom svim korisnicima minimum 14 dana unaprijed. Manje izmjene (npr. tipfeleri, jasnoća)
          objavljujemo bez najave; datum zadnje izmjene je vidljiv na vrhu, a sva istorija se čuva u
          Git-u.
        </p>
      </Section>
    </div>
  );
}
