import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Vodič — Konto',
  description:
    'Sveobuhvatan vodič kroz Konto: brzi start, računi, transakcije, uvoz izvoda, budžeti, pretplate i još.',
};

interface Section {
  id: string;
  title: string;
  body: React.ReactNode;
}

const sections: Section[] = [
  {
    id: 'brzi-start',
    title: 'Brzi start (onboarding + 3 koraka)',
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>
          Konto je tvoja lična financijska aplikacija — bez povezivanja banke, sa podacima u EU.
          Ovaj vodič te vodi kroz sve glavne funkcionalnosti. Procijenjeno čitanje: 10–12 minuta.
        </p>
        <p>
          <strong className="text-foreground">Onboarding wizard.</strong> Pri prvoj prijavi (kad još
          nemaš ni račun ni transakciju) Konto te automatski vodi kroz 4-step wizard: (1) prvi
          račun, (2) prva transakcija ili PDF uvoz, (3) prvi budžet, (4) prvi cilj štednje. Svaki
          korak možeš <strong className="text-foreground">preskočiti</strong> (link u gornjem desnom
          uglu), ili izaći potpuno i vratiti se kasnije — Konto pamti dokle si stigao i nastavlja
          odakle si stao.
        </p>
        <p>Ako preskočiš wizard ili počinješ ručno, evo 3 koraka:</p>
        <ol className="list-inside list-decimal space-y-2">
          <li>
            <strong className="text-foreground">Dodaj račun</strong> na{' '}
            <Link href="/racuni" className="font-medium text-primary hover:underline">
              /racuni
            </Link>{' '}
            — klik na <em>Novi račun</em>, odaberi vrstu (banka, gotovina, Revolut, kreditna
            kartica…), ime, valutu i početno stanje.
          </li>
          <li>
            <strong className="text-foreground">Unesi prvu transakciju</strong> na{' '}
            <Link href="/transakcije" className="font-medium text-primary hover:underline">
              /transakcije
            </Link>{' '}
            — odaberi vrstu, iznos, kategoriju i račun. Na mobilnom imaš centralno{' '}
            <strong className="text-foreground">+</strong> dugme (FAB) na dnu ekrana.
          </li>
          <li>
            <strong className="text-foreground">Pogledaj rezultat</strong> na{' '}
            <Link href="/pocetna" className="font-medium text-primary hover:underline">
              /pocetna
            </Link>{' '}
            — vidiš ukupno stanje, mjesečne metrike, top budžete, prve uvide i zadnje transakcije.
          </li>
        </ol>
        <p>
          <strong className="text-foreground">Imaš PDF izvod banke?</strong> Preskoči ručni unos —
          idi direktno na{' '}
          <Link href="#uvoz" className="font-medium text-primary hover:underline">
            Uvoz izvoda
          </Link>{' '}
          i Konto će izvući transakcije za tebe.
        </p>
      </div>
    ),
  },
  {
    id: 'pocetna',
    title: 'Početna (dashboard)',
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>
          Početna stranica je tvoj „centar komande". Sve metrike su u baznoj valuti (podrazumijevano
          BAM, mijenjaš u <em>Podešavanja → Profil</em>).
        </p>
        <ul className="list-inside list-disc space-y-2">
          <li>
            <strong className="text-foreground">Stanje aktiva</strong> — sva imovina (računi sa
            pozitivnim stanjem) minus obaveze (krediti, kreditne kartice).
          </li>
          <li>
            <strong className="text-foreground">Mjesečne metrike</strong> — potrošnja, prihod,
            štednja i dnevni prosjek za tekući mjesec.
          </li>
          <li>
            <strong className="text-foreground">Top 3 budžeta</strong> — budžeti sa najvećom
            iskorištenošću, da odmah vidiš gdje se približavaš limitu.
          </li>
          <li>
            <strong className="text-foreground">Projekcija novca (30/60/90 dana)</strong> — Konto
            koristi auto-detektovane pretplate i historijske trendove da prognozira buduće stanje;
            ako linija prelazi u minus prije kraja prozora, dobijaš <em>runway upozorenje</em> sa
            očekivanim datumom.
          </li>
          <li>
            <strong className="text-foreground">Top 3 uvida</strong> — najvažnije anomalije i
            prilike za uštedu sa{' '}
            <Link href="/uvidi" className="font-medium text-primary hover:underline">
              /uvidi
            </Link>{' '}
            stranice; bell ikona u top-baru pokazuje broj nepročitanih.
          </li>
          <li>
            <strong className="text-foreground">Zadnjih 10 transakcija</strong> — brzi pristup, klik
            na red vodi na detalje.
          </li>
        </ul>
        <p>
          <strong className="text-foreground">Mobilno:</strong> povuci ekran prema dolje (
          <em>pull-to-refresh</em>) za osvježavanje podataka.
        </p>
        <p>
          <strong className="text-foreground">Edge case:</strong> ako tek počinješ i nemaš još
          računa ili transakcija, vidjet ćeš onboarding poruku umjesto widgeta — to je normalno.
        </p>
      </div>
    ),
  },
  {
    id: 'racuni',
    title: 'Računi',
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>Račun = bilo koji izvor ili odredište novca. Konto podržava više vrsta:</p>
        <ul className="list-inside list-disc space-y-1">
          <li>tekući račun (banka)</li>
          <li>gotovina (novčanik)</li>
          <li>Revolut, Wise i sl.</li>
          <li>kreditna kartica (vodi se kao obaveza, dakle minus stanje)</li>
          <li>kredit (npr. stambeni)</li>
          <li>štedni račun ili investicija</li>
        </ul>
        <p>
          <strong className="text-foreground">Multi-currency.</strong> Svaki račun ima svoju valutu
          (BAM, EUR, USD, RSD…). Na listi vidiš stanje u izvornoj valuti, a u zaglavlju („Stanje
          aktiva") sumu u tvojoj baznoj valuti, preračunatu po aktuelnom tečaju.
        </p>
        <p>
          <strong className="text-foreground">Pretraga i filteri.</strong> Pretraži po imenu ili
          instituciji, filtriraj po vrsti i valuti. Dostupni filteri valute se dinamički ažuriraju
          (vidiš samo valute koje imaš).
        </p>
        <p>
          <strong className="text-foreground">Sparkline.</strong> Mali graf pored svakog računa
          pokazuje kretanje stanja kroz zadnjih 30 dana — odmah vidiš trend bez otvaranja detalja.
        </p>
        <p>
          <strong className="text-foreground">Edge case 1:</strong> kada filtriraš listu, „Stanje
          aktiva" u zaglavlju i dalje prikazuje ukupno (nefiltrirano) — namjerno, da uvijek imaš
          stalan pregled cjeline.
        </p>
        <p>
          <strong className="text-foreground">Edge case 2 — zastarjeli tečaj:</strong> ako FX
          tečajevi nisu osvježeni više od nekoliko dana, vidjet ćeš oznaku upozorenja pored
          preračunatih iznosa. Stvarno stanje u izvornoj valuti je uvijek tačno; samo je suma u
          baznoj valuti aproksimacija dok se tečaj ne osvježi.
        </p>
      </div>
    ),
  },
  {
    id: 'transakcije',
    title: 'Transakcije',
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>
          Glavna evidencija novca. Svaka transakcija ima vrstu, iznos, datum, račun, kategoriju,
          opis i opcionalno bilješke.
        </p>
        <p>
          <strong className="text-foreground">Vrste:</strong>
        </p>
        <ul className="list-inside list-disc space-y-1">
          <li>
            <strong className="text-foreground">Prihod</strong> — plata, honorar, povraćaj.
          </li>
          <li>
            <strong className="text-foreground">Rashod</strong> — sve što trošiš.
          </li>
          <li>
            <strong className="text-foreground">Transfer</strong> — premještaj novca između tvojih
            računa (vidi sljedeći odjeljak).
          </li>
          <li>
            <strong className="text-foreground">Štednja / investicija</strong> — odvajanje za cilj
            (ne troši se, ali je odvojeno od slobodnih sredstava).
          </li>
        </ul>
        <p>
          <strong className="text-foreground">Filteri.</strong> Pretraga po opisu, prodavcu i
          bilješkama; period, račun, kategorija i vrsta. Podrazumijevano se prikazuje tekući mjesec,
          paginacija 50 po stranici.
        </p>
        <p>
          <strong className="text-foreground">Detalji i izmjene.</strong> Klik na red otvara modal
          sa detaljima — možeš editovati, brisati ili premještati u drugi račun/kategoriju.
          Kategorijska ikona pored opisa pomaže u brzom skeniranju.
        </p>
        <p>
          <strong className="text-foreground">Multi-currency prikaz.</strong> Iznos je u valuti
          računa. Ako transakcija ima zastarjeli FX tečaj, vidjet ćeš to u prikazu — stvarni iznos
          ostaje tačan, ali konverzija u baznu valutu je aproksimacija.
        </p>
      </div>
    ),
  },
  {
    id: 'transferi',
    title: 'Transferi između računa',
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>
          Kada premještaš novac sa jednog svog računa na drugi (npr. iz banke u Revolut, ili sa
          tekućeg na štednju), to nije ni prihod ni rashod — to je{' '}
          <strong className="text-foreground">transfer</strong>.
        </p>
        <p>
          <strong className="text-foreground">Kako:</strong> nova transakcija → vrsta{' '}
          <em>Transfer</em> → odaberi račun-izvor (sa kojeg ide) i račun-odredište (na koji ide).
          Konto kreira dvije povezane stavke: minus na izvoru, plus na odredištu. Izmjena ili
          brisanje jedne automatski ažurira drugu.
        </p>
        <p>
          <strong className="text-foreground">Zašto je važno:</strong> ako transfer označiš kao
          rashod, mjesečna potrošnja na dashboardu bit će lažno napuhana. Uvijek koristi vrstu{' '}
          <em>Transfer</em> za premještanje vlastitog novca.
        </p>
        <p>
          <strong className="text-foreground">Edge case — transfer između valuta:</strong> kada
          šalješ EUR sa Wise računa na BAM tekući, sistem traži tečaj. Možeš ga override-ati ako je
          banka primijenila drugačiji kurs nego tržišni.
        </p>
      </div>
    ),
  },
  {
    id: 'kategorije',
    title: 'Kategorije',
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>
          Kategorije su način da grupišeš transakcije („Hrana", „Stanovanje", „Zabava"…). Konto
          dolazi sa standardnim setom; ti dodaješ svoje po potrebi.
        </p>
        <ul className="list-inside list-disc space-y-2">
          <li>
            <strong className="text-foreground">Sistemske kategorije</strong> su zaključane (ne mogu
            se obrisati, ali možeš mijenjati ime/ikonu/boju).
          </li>
          <li>
            <strong className="text-foreground">Vlastite kategorije</strong> se slobodno dodaju,
            edituju i brišu (transakcije sa obrisanom kategorijom se vrate u „Bez kategorije").
          </li>
          <li>
            <strong className="text-foreground">Vrste:</strong> rashod, prihod, transfer, štednja,
            investicija — svaka kategorija ima svoju vrstu i pojavljuje se samo u relevantnom
            kontekstu.
          </li>
          <li>
            <strong className="text-foreground">Boje i ikone</strong> — vizualno razdvajanje na
            grafovima i u listama.
          </li>
        </ul>
        <p>
          <strong className="text-foreground">Vraćanje podrazumijevanih:</strong> ako ti nedostaje
          neka standardna kategorija (npr. nalog je star), idi na{' '}
          <Link href="/podesavanja" className="font-medium text-primary hover:underline">
            /podesavanja
          </Link>{' '}
          → <em>Vrati podrazumijevane kategorije</em>. Ovo dodaje samo one koje nedostaju, ne briše
          tvoje.
        </p>
      </div>
    ),
  },
  {
    id: 'merchants',
    title: 'Prodavači (merchants)',
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>
          Prodavač je entitet iz čijeg imena dolazi transakcija — npr. „BINGO", „Konzum", „Netflix".
          Konto ih automatski izvuče iz opisa transakcija (i iz uvezenih PDF izvoda).
        </p>
        <p>
          <strong className="text-foreground">Default kategorija po prodavcu.</strong> Kad jednom
          dodijeliš kategoriju prodavcu (npr. „BINGO" → „Hrana"), sve buduće transakcije sa istim
          prodavcem automatski idu u tu kategoriju. Manje ručnog rada na duge staze.
        </p>
        <p>
          <strong className="text-foreground">Masovne izmjene.</strong> Na{' '}
          <Link href="/merchants" className="font-medium text-primary hover:underline">
            /merchants
          </Link>{' '}
          možeš jednim klikom promijeniti kategoriju za sve historijske + buduće transakcije jednog
          prodavca. Korisno kad shvatiš da je nešto pogrešno klasifikovano.
        </p>
        <p>
          <strong className="text-foreground">Sistem uči.</strong> Što više ispravki napraviš (u
          uvozu PDF-a, u listi transakcija, na merchant stranici), to je predviđanje predvidljivije.
          Aliasi i pravila se pamte automatski.
        </p>
      </div>
    ),
  },
  {
    id: 'skeniraj',
    title: 'Skeniraj račun (foto)',
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>
          Brz način da uneseš transakciju iz fotografije računa (prodavnica, restoran). AI model
          izvuče polja umjesto tebe.
        </p>
        <p>
          <strong className="text-foreground">Kako:</strong> idi na{' '}
          <Link href="/skeniraj" className="font-medium text-primary hover:underline">
            /skeniraj
          </Link>
          , odaberi sliku iz galerije ili snimi novu, sačekaj 5–15 sekundi obrade. Vidjet ćeš
          predložena polja: <em>datum, iznos, prodavac, valuta</em>. Pregledaš, edituješ ako treba,
          dodaš račun i kategoriju, snimiš.
        </p>
        <p>
          <strong className="text-foreground">Auto-povezivanje prodavca.</strong> Konto pri snimanju
          pokušava prepoznati prodavca i povezati ga sa tvojom postojećom listom: prvo tačno
          poklapanje, pa fuzzy match (sličnost). Ako ništa ne odgovara, pravi novog. Tako buduće
          transakcije sa istim prodavcem ulaze u istu kategoriju automatski.
        </p>
        <p>
          <strong className="text-foreground">Edge case:</strong> ako je slika mutna ili presjajna,
          neka polja možda neće biti izvučena. Sve što fali, dopuni ručno prije snimanja — manualni
          unos je uvijek dostupan.
        </p>
        <p>
          <strong className="text-foreground">Privatnost:</strong> slika ide u sigurno skladište u
          Frankfurtu, AI obrada je u EU regiji. Detalji:{' '}
          <Link href="/sigurnost#skeniraj" className="font-medium text-primary hover:underline">
            Sigurnost — skeniranje
          </Link>
          .
        </p>
      </div>
    ),
  },
  {
    id: 'uvoz',
    title: 'Uvezi izvod (PDF)',
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>
          Najbrži način da popuniš mjesec ili više: uvezi PDF izvod direktno iz banke. Konto izvuče
          sve transakcije i ti samo potvrdiš.
        </p>
        <p>
          <strong className="text-foreground">Kako:</strong> idi na{' '}
          <Link href="/import" className="font-medium text-primary hover:underline">
            /import
          </Link>
          , odaberi račun na koji ide uvoz, povuci PDF u zonu za upload (ili klik za odabir).
          Aplikacija:
        </p>
        <ol className="list-inside list-decimal space-y-2">
          <li>spremi PDF u sigurno skladište (EU, Frankfurt);</li>
          <li>izvuče tekst (uključujući OCR ako je PDF skeniran);</li>
          <li>
            <strong className="text-foreground">redaktira PII</strong> — IBAN, broj kartice, JMBG —{' '}
            <em>prije</em> slanja AI modelu;
          </li>
          <li>
            AI parsira redove i vraća predloženu listu transakcija sa datumom, iznosom, opisom i
            prodavcem;
          </li>
          <li>ti otvoriš pregled, urediš ono što treba, i potvrdiš uvoz.</li>
        </ol>
        <p>
          <strong className="text-foreground">Pregled prije uvoza:</strong> možeš mijenjati opis,
          kategoriju, isključivati pojedine stavke, ili koristiti <em>masovni način</em>
          („Označi sve") za grupne izmjene više stavki odjednom.
        </p>
        <p>
          <strong className="text-foreground">Historija uvoza.</strong> Sve prošle uvoze vidiš u
          tabeli sa statusom: <em>pripremljen, u obradi, spreman, odbačen, ne uspijeva</em>. Ako se
          uvoz „zaglavi", aplikacija ga automatski reset-uje pri sljedećem otvaranju stranice.
        </p>
        <p>
          <strong className="text-foreground">PDF se briše unutar 24h</strong> nakon obrade — ne
          čuvamo ga dugoročno.
        </p>
        <p>
          <strong className="text-foreground">Edge case — ne parsira:</strong> provjeri da je fajl
          pravi PDF (ne fotografija sa ekstenzijom .pdf), pokušaj drugi izvod iste banke, osvježi
          stranicu. Ako ni to ne pomogne, unesi ručno dok ne proširimo podršku za taj oblik. Više
          detalja u{' '}
          <Link href="/help#uvoz-ne-parsira" className="font-medium text-primary hover:underline">
            FAQ — Izvod se ne parsira
          </Link>
          .
        </p>
      </div>
    ),
  },
  {
    id: 'budzeti',
    title: 'Budžeti',
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>
          Budžet = limit potrošnje za jednu kategoriju u određenom periodu. Konto te informiše, ne
          sprječava — odluka je uvijek tvoja.
        </p>
        <p>
          <strong className="text-foreground">Kreiranje:</strong>{' '}
          <Link href="/budzeti" className="font-medium text-primary hover:underline">
            /budzeti
          </Link>{' '}
          → <em>Novi budžet</em> → odaberi kategoriju, iznos i period (mjesečni, sedmični ili
          dnevni). Opcionalno uključi <strong className="text-foreground">rollover</strong>: višak
          iz prethodnog perioda se prenosi u sljedeći.
        </p>
        <p>
          <strong className="text-foreground">Praćenje:</strong> svaki budžet pokazuje koliko si
          potrošio, koliko ti ostaje, % iskorištenosti i koliko dana ostaje do kraja perioda. Traka
          mijenja boju: zelena ispod 70%, žuta 70–95%, crvena iznad 95%.
        </p>
        <p>
          <strong className="text-foreground">Šta se ne računa u budžet:</strong> transferi između
          tvojih računa (oni nisu trošak) i transakcije koje označiš kao{' '}
          <em>isključeno iz budžeta</em> u detaljima.
        </p>
        <p>
          <strong className="text-foreground">Top 3 na dashboardu</strong> — budžeti sa najvišim %
          iskorištenosti se ističu na{' '}
          <Link href="/pocetna" className="font-medium text-primary hover:underline">
            /pocetna
          </Link>
          .
        </p>
        <p>
          <strong className="text-foreground">Edge case — pređen limit:</strong> traka postaje
          crvena, ali transakcije se i dalje normalno bilježe. Konto ne blokira potrošnju —
          informiše te i, ako se trend nastavi, generiše uvid „Prijetnja budžetu".
        </p>
      </div>
    ),
  },
  {
    id: 'ciljevi',
    title: 'Ciljevi štednje',
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>
          Cilj = iznos koji želiš sakupiti, opciono sa rokom (npr. „Ljetovanje 2.000 BAM do 1.7.").
          Vidiš ih kao kartice sa SVG progress kružićem na{' '}
          <Link href="/ciljevi" className="font-medium text-primary hover:underline">
            /ciljevi
          </Link>
          .
        </p>
        <p>
          <strong className="text-foreground">Kreiranje:</strong> klik na <em>+</em> → ime, ciljani
          iznos, valuta, opcionalno datum, ikona i boja.
        </p>
        <p>
          <strong className="text-foreground">Dva načina praćenja napretka:</strong>
        </p>
        <ul className="list-inside list-disc space-y-2">
          <li>
            <strong className="text-foreground">Ručno</strong> — koristiš dugme{' '}
            <em>Dodaj uplatu</em> kad odvojiš novac. Konto inkrementira trenutni iznos.
          </li>
          <li>
            <strong className="text-foreground">Vezano za račun</strong> — povežeš cilj sa štednim
            računom; trenutni saldo tog računa automatski postaje napredak ka cilju.
          </li>
        </ul>
        <p>
          <strong className="text-foreground">Preporučeni mjesečni iznos.</strong> Ako postaviš
          datum, Konto izračuna koliko bi trebao odvajati svakog mjeseca da postigneš cilj na
          vrijeme.
        </p>
        <p>
          <strong className="text-foreground">Tabovi:</strong> aktivni, postignuti, arhivirani. Kad
          pređeš ciljani iznos dobijaš confetti i cilj prelazi u <em>Postignuti</em>. Možeš ga
          arhivirati, izmijeniti ili obrisati.
        </p>
        <p>
          <strong className="text-foreground">Veza sa pretplatama:</strong> ciljevi nisu mjesečni
          rashod — ne računaju se u budžet, ne pojavljuju u projekciji.
        </p>
      </div>
    ),
  },
  {
    id: 'pretplate',
    title: 'Pretplate',
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>
          Konto automatski detektuje ponavljajuće transakcije (Netflix, osiguranje, teretana,
          struja) i predlaže ih kao pretplate. Ne moraš ručno dodavati — samo potvrdi prijedloge.
        </p>
        <p>
          <strong className="text-foreground">Kako radi.</strong> Algoritam pretražuje historiju
          transakcija i traži obrasce: isti prodavac, sličan iznos, regularan period (mjesečno,
          godišnje…). Svaki prijedlog ima{' '}
          <strong className="text-foreground">confidence score</strong> — koliko je sistem siguran u
          detekciju.
        </p>
        <p>
          <strong className="text-foreground">Šta vidiš na</strong>{' '}
          <Link href="/pretplate" className="font-medium text-primary hover:underline">
            /pretplate
          </Link>
          :
        </p>
        <ul className="list-inside list-disc space-y-1">
          <li>aktivne pretplate sa prosječnim iznosom, periodom i sljedećim očekivanim datumom;</li>
          <li>kandidati (prijedlozi) — potvrdi, odbij ili sačekaj;</li>
          <li>pauzirane pretplate — historija ostaje, ali se ne računaju u projekciju.</li>
        </ul>
        <p>
          <strong className="text-foreground">Edge case — varijabilan iznos:</strong> ako je iznos
          stalno različit (struja, internet sa varijabilnom potrošnjom), confidence je niži.
          Pretplata svejedno može biti stvarna — ti odlučuješ da li je potvrdiš.
        </p>
      </div>
    ),
  },
  {
    id: 'rate',
    title: 'Kartice na rate',
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>
          Kupio si nešto na 12 rata? Konto ti pomaže da pratiš plan i ne izgubiš pregled koliko ti
          je ostalo.
        </p>
        <p>
          <strong className="text-foreground">Kreiranje plana</strong> na{' '}
          <Link href="/kartice-rate" className="font-medium text-primary hover:underline">
            /kartice-rate
          </Link>
          : ukupan iznos, broj rata, datum prve rate, vezana kartica/račun.
        </p>
        <p>
          <strong className="text-foreground">Šta vidiš:</strong>
        </p>
        <ul className="list-inside list-disc space-y-1">
          <li>raspored svih rata sa datumima;</li>
          <li>koje su plaćene, koje na čekanju, kada slijedi sljedeća;</li>
          <li>ukupno preostalo i % završenosti plana.</li>
        </ul>
        <p>
          <strong className="text-foreground">Veza sa transakcijama:</strong> kad rata legne kao
          stvarna transakcija (npr. preko uvoza izvoda ili ručno), Konto je automatski mapira na
          plan. Ne moraš dvaput unositi.
        </p>
        <p>
          <strong className="text-foreground">Edge case:</strong> ako se iznos rate razlikuje od
          planiranog (zaokruživanje, kamata), ručno korigovati u detaljima rate.
        </p>
      </div>
    ),
  },
  {
    id: 'uvidi',
    title: 'Uvidi',
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>
          Uvidi su <strong className="text-foreground">automatski generisana zapažanja</strong> o
          tvojim financijama — anomalije, prilike za uštedu i upozorenja. Dashboard pokazuje top 3,
          puna lista je na{' '}
          <Link href="/uvidi" className="font-medium text-primary hover:underline">
            /uvidi
          </Link>
          ; bell ikona u top-baru sa brojem ukazuje na nepročitane.
        </p>
        <p>
          <strong className="text-foreground">Šest detektora</strong> radi svake noći u 03:00 UTC:
        </p>
        <ul className="list-inside list-disc space-y-1">
          <li>
            <strong className="text-foreground">Anomalija kategorije</strong> — potrošnja u
            kategoriji preko 130% prosjeka zadnja 3 mjeseca.
          </li>
          <li>
            <strong className="text-foreground">Ušteda</strong> — kategorija ispod 80% prosjeka
            (pohvalno).
          </li>
          <li>
            <strong className="text-foreground">Neobična transakcija</strong> — pojedinačna
            transakcija više od 2σ iznad prosjeka kategorije.
          </li>
          <li>
            <strong className="text-foreground">Promjena cijene pretplate</strong> — najnovija
            transakcija +10% iznad prosjeka recurring-a.
          </li>
          <li>
            <strong className="text-foreground">Prijetnja budžetu</strong> — projekcija pokazuje da
            ćeš preći limit prije kraja perioda.
          </li>
          <li>
            <strong className="text-foreground">Neaktivna pretplata</strong> — recurring koji nije
            naplaćen 1.5× duže od očekivanog perioda.
          </li>
        </ul>
        <p>
          <strong className="text-foreground">Filtriranje i odbacivanje.</strong> Na{' '}
          <Link href="/uvidi" className="font-medium text-primary hover:underline">
            /uvidi
          </Link>{' '}
          imaš dvije liste — <em>Aktivni</em> i <em>Arhivirani</em>. Filtriraš po ozbiljnosti (info
          / oprez / upozorenje) i tipu (anomalija / prilika / alarm) preko chip dugmadi. Nepoželjne
          uvide odbacuješ X dugmetom; iz arhive ih vraćaš preko <em>Vrati</em>.
        </p>
        <p>
          <strong className="text-foreground">Privatnost:</strong> sva analiza je server-strana,
          rade se samo agregati — bez slanja sirovih transakcija na vanjske servise.
        </p>
      </div>
    ),
  },
  {
    id: 'podesavanja',
    title: 'Podešavanja',
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>
          Sve postavke računa se nalaze na{' '}
          <Link href="/podesavanja" className="font-medium text-primary hover:underline">
            /podesavanja
          </Link>
          .
        </p>
        <ul className="list-inside list-disc space-y-2">
          <li>
            <strong className="text-foreground">Profil</strong> — ime za prikaz, bazna valuta (BAM,
            EUR, USD…), jezik (bs-BA, hr-HR, sr-RS).
          </li>
          <li>
            <strong className="text-foreground">Tema</strong> — svjetla, tamna ili sistemska (prati
            postavku tvog uređaja).
          </li>
          <li>
            <strong className="text-foreground">Vrati podrazumijevane kategorije</strong> — dopuni
            standardni set ako ti nedostaje (ne briše tvoje).
          </li>
          <li>
            <strong className="text-foreground">Brisanje računa</strong> — pokreće 30-dnevni period
            čekanja. Tokom tog perioda možeš poništiti brisanje preko emaila koji ti pošaljemo.
          </li>
          <li>
            <strong className="text-foreground">Odjava</strong> — briše sesiju samo na ovom uređaju.
          </li>
        </ul>
      </div>
    ),
  },
  {
    id: 'sigurnost',
    title: 'Sigurnost i privatnost',
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>
          Tvoji podaci ostaju u EU (Frankfurt). Bez slanja u treće zemlje, bez prodaje trećim
          stranama, bez analitike koja te identifikuje.
        </p>
        <ul className="list-inside list-disc space-y-2">
          <li>
            <strong className="text-foreground">PII redakcija</strong> prije AI obrade — IBAN, broj
            kartice i JMBG se zamijene placeholder-ima prije slanja modelu.
          </li>
          <li>
            <strong className="text-foreground">PDF se briše unutar 24h</strong> nakon obrade.
          </li>
          <li>
            <strong className="text-foreground">Bez povezivanja banke.</strong> Tvoji prijavni
            podaci za banku nikad ne dolaze u Konto — radimo isključivo sa tvojim PDF izvodom ili
            ručnim unosom.
          </li>
          <li>
            <strong className="text-foreground">Šifrovan transport i mirovanje.</strong> Sav
            saobraćaj je preko HTTPS, baza podataka je šifrovana.
          </li>
        </ul>
        <p>
          Detaljno objašnjenje:{' '}
          <Link href="/sigurnost" className="font-medium text-primary hover:underline">
            Sigurnost i privatnost
          </Link>
          .
        </p>
      </div>
    ),
  },
  {
    id: 'valute',
    title: 'Savjeti za rad sa više valuta',
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>
          Konto je dizajniran oko <strong className="text-foreground">multi-currency</strong>{' '}
          stvarnosti — račun u BAM, kartica u EUR, Wise u USD.
        </p>
        <ul className="list-inside list-disc space-y-2">
          <li>
            <strong className="text-foreground">Svaki račun u svojoj valuti.</strong> Nikad nemoj
            mijenjati valutu računa nakon kreiranja — postojeće transakcije ostaju u izvornoj
            valuti, što stvara nekonzistentnost.
          </li>
          <li>
            <strong className="text-foreground">Bazna valuta</strong> je samo prikazna jedinica za
            sume na dashboardu i u izvještajima. Mijenjaš je u{' '}
            <Link href="/podesavanja" className="font-medium text-primary hover:underline">
              Podešavanjima
            </Link>{' '}
            kad god želiš — historijske transakcije se ne diraju.
          </li>
          <li>
            <strong className="text-foreground">FX tečajevi</strong> se ažuriraju automatski. Oznaka
            upozorenja se pojavi kad su tečajevi zastarjeli — stvarno stanje računa u izvornoj
            valuti je tačno, samo je suma u baznoj valuti aproksimacija dok se tečaj ne osvježi.
          </li>
          <li>
            <strong className="text-foreground">Transferi između valuta</strong> koriste tečaj za
            datum transakcije. Možeš override-ati tečaj ako je banka primijenila drugačiji kurs.
          </li>
        </ul>
      </div>
    ),
  },
];

const tocItems: { id: string; label: string }[] = sections.map((s) => ({
  id: s.id,
  label: s.title,
}));

export default function VodicPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-4 sm:space-y-8 sm:px-6 sm:py-6">
      <div className="space-y-2">
        <h1 className="text-headline">Vodič kroz Konto</h1>
        <p className="text-base text-muted-foreground">
          Sve glavne funkcionalnosti na jednom mjestu. Brzi sadržaj ti dozvoljava da preskočiš
          direktno na ono što te zanima. Ako tražiš kratke odgovore na česta pitanja, idi na{' '}
          <Link href="/help" className="font-medium text-primary hover:underline">
            Pomoć (FAQ)
          </Link>
          .
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold leading-snug tracking-tight">
            Brzi sadržaj
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <nav aria-label="Sadržaj vodiča">
            <ol className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
              {tocItems.map((item, i) => (
                <li key={item.id}>
                  <Link href={`#${item.id}`} className="font-medium text-primary hover:underline">
                    {i + 1}. {item.label}
                  </Link>
                </li>
              ))}
            </ol>
          </nav>
        </CardContent>
      </Card>

      <div className="space-y-4" role="region" aria-label="Vodič kroz Konto">
        {sections.map((section) => (
          <Card key={section.id} id={section.id} className="scroll-mt-20">
            <CardHeader>
              <CardTitle className="text-lg font-semibold leading-snug tracking-tight">
                {section.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">{section.body}</CardContent>
          </Card>
        ))}
      </div>

      <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
        <p>
          Nešto nedostaje ili nije jasno?{' '}
          <Link href="/help" className="font-medium text-primary hover:underline">
            Pomoć (FAQ)
          </Link>{' '}
          ima kratke odgovore;{' '}
          <Link href="/sigurnost" className="font-medium text-primary hover:underline">
            Sigurnost i privatnost
          </Link>{' '}
          objašnjava kako čuvamo podatke.
        </p>
      </div>
    </div>
  );
}
