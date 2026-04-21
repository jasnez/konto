# Konto — Design System

**Verzija:** 1.0 · **Datum:** april 2026.
**Status:** Živi dokument. Svaka nova komponenta treba biti dodana ovdje prije nego što se koristi na drugom mjestu.

---

## 1. Design Philosophy

### 1.1 Principi

**1. Poštuj korisnikovu pažnju.** Svaki ekran mora imati jednu dominantnu radnju. Ako nije jasno šta je primarni call-to-action, refactoruj.

**2. Brojevi se čitaju, ne dešifruju.** Novčani iznosi moraju biti pregledni iz prve — veliki, pravilno formatirani, sa valutom, bez da korisnik mora da razmišlja o tome šta vidi.

**3. Mobilni je primarni, desktop je bonus.** Svaku komponentu dizajniraj prvo za 360px širine, pa onda skaliraj. Ako ne radi na mobilnom, ne radi uopšte.

**4. Dark mode nije opcija, nego default.** Većina korisnika otvara finansijsku aplikaciju uveče. Design za dark, verifikuj u light.

**5. Brzina je UX.** Loading spinner duži od 300ms znači da si nešto pogriješio. Optimistic updates, skeleton screens, prefetch.

**6. Prazan stanje je prilika.** Nijedan prazan ekran ne smije biti samo prazna ikona + "Nema podataka". Svaki empty state je onboarding mini-moment.

**7. Greška je razgovor, ne signal.** Nikad "Error 500". Uvijek "Nešto nije u redu. Pokušaj ponovo?" ili konkretniji objasnjenje.

**8. Jezik je UI element.** Copy nije nešto što se piše na kraju. Copy je dio dizajna komponente.

### 1.2 Non-goals

- Skeomorfizam, gradijenti, 3D efekti
- Animacije duže od 300ms
- Ilustracije umjesto UI-a (maskot-stil ilustracije)
- Komponente koje mijenjaju boju pozadine između stranica
- Notifikacije koje nisu acknowledge-ujući korisnikov akt

---

## 2. Visual Language

### 2.1 Color system

**Semantic tokens (Tailwind CSS + CSS vars):**

```css
/* globals.css */
@layer base {
  :root {
    /* Light mode */
    --background: 0 0% 100%;          /* #FFFFFF */
    --foreground: 240 10% 4%;         /* #0A0A0B */
    
    --card: 0 0% 100%;
    --card-foreground: 240 10% 4%;
    
    --muted: 240 5% 96%;
    --muted-foreground: 240 4% 46%;
    
    --border: 240 6% 90%;
    --input: 240 6% 90%;
    --ring: 142 71% 45%;              /* brand green */
    
    /* Brand */
    --primary: 142 71% 45%;           /* #22C55E — green */
    --primary-foreground: 0 0% 100%;
    
    --secondary: 240 5% 96%;
    --secondary-foreground: 240 10% 4%;
    
    --accent: 240 5% 96%;
    --accent-foreground: 240 10% 4%;
    
    /* Financial semantics */
    --income: 142 71% 45%;            /* green, isti kao primary */
    --income-foreground: 0 0% 100%;
    
    --expense: 0 72% 51%;             /* #DC2626 — red */
    --expense-foreground: 0 0% 100%;
    
    --transfer: 217 91% 60%;          /* #3B82F6 — blue */
    --transfer-foreground: 0 0% 100%;
    
    /* States */
    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 100%;
    
    --warning: 38 92% 50%;            /* amber */
    --warning-foreground: 0 0% 100%;
    
    --success: 142 71% 45%;
    --success-foreground: 0 0% 100%;
    
    --radius: 0.75rem;                /* 12px, većina komponenti */
  }
  
  .dark {
    --background: 240 10% 4%;         /* #0A0A0B */
    --foreground: 0 0% 98%;
    
    --card: 240 10% 7%;               /* elevated surface */
    --card-foreground: 0 0% 98%;
    
    --muted: 240 4% 12%;
    --muted-foreground: 240 5% 65%;
    
    --border: 240 4% 16%;
    --input: 240 4% 16%;
    --ring: 142 71% 45%;
    
    --primary: 142 71% 45%;
    --primary-foreground: 0 0% 100%;
    
    --secondary: 240 4% 12%;
    --secondary-foreground: 0 0% 98%;
    
    --income: 142 71% 45%;
    --expense: 0 72% 55%;             /* malo svjetlije u dark */
    --transfer: 217 91% 65%;
    
    --destructive: 0 72% 55%;
    --warning: 38 92% 55%;
    --success: 142 71% 50%;
  }
}
```

**Pravila upotrebe:**
- Zeleno = prihod, pozitivno, success
- Crveno = trošak, negativno, destructive
- Plavo = transfer, informacija, neutral akcija
- Nikad ne koristi crveno za income ili zeleno za expense (čak ni kao "low amount = good")
- Ukupni balance na accountu: neutralan (foreground color), bez obzira na iznos
- Delta vs. period: zeleno/crveno zavisno od smjera

### 2.2 Typography

**Fontovi:**
```typescript
// app/layout.tsx
import { Inter, JetBrains_Mono } from 'next/font/google';

const inter = Inter({
  subsets: ['latin', 'latin-ext'],   // latin-ext za bs/sr/hr dijakritike
  variable: '--font-sans',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});
```

**Skala (Tailwind default je dobra, ali koristi konzistentno):**

| Token | Size | Upotreba |
|---|---|---|
| `text-xs` | 12px | Secondary meta (timestamps, labels u tabeli) |
| `text-sm` | 14px | Body text u dense lists |
| `text-base` | 16px | Default body text **(nikad manji na mobilnom)** |
| `text-lg` | 18px | Subheadings |
| `text-xl` | 20px | Section headings |
| `text-2xl` | 24px | Page titles |
| `text-3xl` | 30px | Hero amounts (dashboard total) |
| `text-5xl` | 48px | Onboarding h1, welcome screens |

**Novčani iznosi — posebno pravilo:**
- Koristi `tabular-nums` utility klasu da brojevi budu monoširoki (poravnati)
- Glavni iznos na dashboardu: `text-3xl font-semibold tabular-nums`
- Iznos u listi transakcija: `text-base font-medium tabular-nums`
- Valuta je uvijek vizuelno odvojena ili manji font:
  ```tsx
  <span className="tabular-nums">
    <span className="font-semibold">1.234,56</span>
    <span className="text-muted-foreground ml-1">KM</span>
  </span>
  ```

### 2.3 Spacing

Koristi Tailwind scale. Nepisana pravila:
- **4px (space-1):** minimalan razmak između povezanih elemenata
- **8px (space-2):** standardni inline razmak
- **16px (space-4):** izvan komponenti, između sekcija
- **24px (space-6):** section separators
- **32px (space-8):** između major page regions
- **48px (space-12):** iznad/ispod hero sekcija

**Mobilni safe area:** uvijek `px-4` (16px) na mobilnom, `px-6` (24px) od `md:`, `px-8` od `lg:`. Nikad manje od 16px horizontalnog paddinga na mobilnom.

### 2.4 Elevation i borders

U dark mode-u koristimo **bolje kontrast kroz boju pozadine**, ne sjene (sjene ne rade u dark).

```css
/* Background hijerarhija u dark mode */
body          { background: hsl(var(--background)); }      /* #0A0A0B */
.card         { background: hsl(var(--card)); }            /* #121214 */
.card-nested  { background: hsl(var(--muted)); }           /* #1A1A1E */
```

U light mode-u, dodaj **suptilnu border** umjesto sjene:
```css
.card { border: 1px solid hsl(var(--border)); }
```

Radius:
- Buttons, inputs: `rounded-md` (6px)
- Cards, dialogs, popovers: `rounded-xl` (12px)
- Avatars, chips: `rounded-full`
- Nikad ne koristi 0 radius osim za full-bleed mobile elements

### 2.5 Icons

**Lucide React isključivo.** Nikad ne miješaj icon biblioteke.

- Default size: `size-5` (20px)
- U nav items: `size-5`
- U compact list items: `size-4` (16px)
- U hero elements: `size-6` do `size-8`
- Stroke width: default (2), za fine touch `stroke-[1.5]`

Semantic icons:
- `Wallet` → accounts
- `ArrowLeftRight` → transfers
- `Receipt` → transactions
- `Target` → goals
- `PieChart` → insights
- `Settings` → settings
- `Plus` → primary add action
- `Upload` → upload PDF
- `Sparkles` → AI-generated

---

## 3. Core Components (shadcn/ui customizations)

### 3.1 Instalacija

```bash
pnpm dlx shadcn@latest init
# Style: Default
# Base color: Neutral
# CSS variables: Yes
# Tailwind config: yes

# Core komponente (instaliraj odmah):
pnpm dlx shadcn@latest add button card input label
pnpm dlx shadcn@latest add dialog sheet dropdown-menu
pnpm dlx shadcn@latest add form select tabs badge
pnpm dlx shadcn@latest add skeleton toast avatar
pnpm dlx shadcn@latest add command popover calendar
pnpm dlx shadcn@latest add switch checkbox radio-group
pnpm dlx shadcn@latest add alert alert-dialog
```

### 3.2 Component inventory

| Komponenta | Korišten od | Custom? | Zašto custom |
|---|---|---|---|
| Button | svuda | Ne | Default OK |
| Input | forme | Minor | Veći touch target na mobilnom (h-11) |
| Card | svuda | Minor | Border umjesto shadow u light |
| Dialog (desktop) / Sheet (mobile) | modal | Ne | Standardni |
| Toast (Sonner) | notifikacije | Yes | Bosanska defaults |
| MoneyDisplay | amount display | **Da** | Složena logika, formatiranje |
| MoneyInput | amount input | **Da** | Cents handling, currency selector |
| CategoryIcon | inline kategorije | **Da** | Emoji + color chip |
| MerchantCell | lista transakcija | **Da** | Avatar + name + fallback |
| DateRangePicker | filter | Minor | Srpski labeli, week starts Mon |
| CurrencySelect | forms | **Da** | BAM first, smart default |

### 3.3 Custom komponente — spec

#### 3.3.1 `<MoneyDisplay />`

```typescript
// components/money-display.tsx
type MoneyDisplayProps = {
  cents: bigint;
  currency: string;
  locale?: string;
  variant?: 'default' | 'large' | 'compact';
  showSign?: boolean;             // + prefix za pozitivne
  signFromAmount?: boolean;        // boja se određuje iz znaka
  className?: string;
};
```

Pravila rendera:
- `cents = 0n` → "0,00 KM" u muted boji
- Negative → "−123,45 KM" u expense boji (ne "-", nego pravi minus Unicode `−`)
- Positive sa `showSign=true` → "+123,45 KM" u income boji
- `variant='large'` → `text-3xl tabular-nums font-semibold`
- Uvijek `tabular-nums`

#### 3.3.2 `<MoneyInput />`

```typescript
type MoneyInputProps = {
  value: bigint;                   // cents, controlled
  onChange: (cents: bigint) => void;
  currency: string;
  onCurrencyChange?: (c: string) => void;
  placeholder?: string;
  max?: bigint;
  disabled?: boolean;
};
```

Ponašanje:
- User tipka `12,50` → interno postane `1250n`
- Auto-formatiranje na blur: `12,50` (BAM), `1,250.50` (USD)
- Decimalni separator prati locale, thousands separator tek na blur
- Currency selector prikazan kao suffix (desno)
- Mobilni: `inputMode="decimal"` da otvori brojčanu tastaturu sa zarezom
- Selection: `focus` → cijeli broj selected (brzo zamijeni)

#### 3.3.3 `<QuickAddBar />`

Primarna mobilna komponenta za dodavanje transakcije — FAB style, dostupan na svim ekranima.

Layout:
```
┌──────────────────────────────────┐
│ [Iznos: 12,50 KM] [🛒 Namirnice] │
│ [Konzum ▼] [danas]        [Spasi] │
└──────────────────────────────────┘
```

Ponašanje:
- Focus se automatski stavlja na Amount field
- Ako user zapiše amount i pritisne Enter → fokus se pomjera na Merchant
- Ako user odabere merchant iz istorije → kategorija se auto-predlaže
- Submit: optimistic update (iznos se pojavi u listi odmah), rollback na error
- Duration targets: open → amount → merchant → submit < 5 sekundi

#### 3.3.4 `<TransactionRow />`

```
┌────────────────────────────────────────────┐
│ [🛒]  Konzum                      −43,50 KM│
│       Namirnice · 15.4. · Raiffeisen       │
└────────────────────────────────────────────┘
```

- Lijevo: category icon (emoji + color chip background)
- Middle: merchant name (bold), metadata row (kategorija · datum · račun)
- Desno: iznos sa znakom i valutom
- Tap → expand ili navigate na detail
- Swipe left (mobilno) → Edit / Delete quick actions
- Long-press → select mode (bulk actions)

#### 3.3.5 `<CategoryIcon />`

```typescript
type CategoryIconProps = {
  category: { icon: string | null; color: string | null; name: string };
  size?: 'sm' | 'md' | 'lg';
};
```

Render:
- Circle sa background color-om iz kategorije (default: `bg-muted`)
- Emoji ili Lucide icon centriran
- Fallback: prvo slovo kategorije ako nema icon

---

## 4. Layout & Navigation

### 4.1 App shell (responsive)

**Mobilni (< 768px):**
```
┌────────────────────────┐
│ Header (account switch)│  ← 56px
├────────────────────────┤
│                        │
│                        │
│   Main content         │
│                        │
│                        │
├────────────────────────┤
│ [FAB +]                │  ← floating
├────────────────────────┤
│ Home · Tx · Insight · … │  ← 64px bottom nav
└────────────────────────┘
```

- **Bottom nav:** Home, Transakcije, Dodaj (FAB u sredini), Insight, Više
- **FAB primary action:** Quick add transakcija
- **Top header:** account/profil switcher + kontekstualne akcije

**Desktop (≥ 768px):**
```
┌─────────┬──────────────────────────┐
│         │ Header                   │
│ Sidebar ├──────────────────────────┤
│         │                          │
│ · Home  │                          │
│ · Tx    │      Main content        │
│ · Insig │                          │
│ · ...   │                          │
│         │                          │
│ [+ Add] │                          │
└─────────┴──────────────────────────┘
```

- **Sidebar:** collapsed na 240px, može da se skupi na 64px (icons only)
- **Primary "+ Add" button** na vrhu sidebara

### 4.2 Route struktura (Next.js App Router)

```
app/
├── (marketing)/                    # publicni, pre-login
│   ├── page.tsx                    # landing
│   ├── cjene/page.tsx
│   ├── privatnost/page.tsx
│   └── layout.tsx                  # marketing header
│
├── (auth)/
│   ├── prijava/page.tsx            # magic link request
│   ├── verifikuj/page.tsx          # callback nakon klika na link
│   └── layout.tsx                  # minimalan layout
│
├── (app)/                          # iza login-a
│   ├── layout.tsx                  # app shell sa nav
│   ├── pocetna/page.tsx            # dashboard
│   ├── racuni/
│   │   ├── page.tsx                # lista računa
│   │   └── [id]/page.tsx           # detalj računa
│   ├── transakcije/
│   │   ├── page.tsx                # lista + filteri
│   │   ├── [id]/page.tsx           # detalj
│   │   └── novi/page.tsx           # manualni unos
│   ├── kategorije/page.tsx
│   ├── budzet/page.tsx
│   ├── ciljevi/page.tsx
│   ├── uvidi/page.tsx              # insights
│   ├── uvoz/
│   │   ├── page.tsx                # upload PDF
│   │   └── [batchId]/page.tsx      # review
│   └── podesavanja/
│       ├── page.tsx
│       ├── privatnost/page.tsx
│       └── izvoz/page.tsx
│
└── api/                            # Route Handlers samo za webhooks
    └── webhooks/
```

**Pravilo ruta 🔒:**
- Bosanske rute (`/pocetna`, `/racuni`, `/transakcije`), ne engleske
- Slug-ovi uvijek latinica bez dijakritike (`budzet`, ne `budžet`)
- Nikad mijenjaj rutu kad je već u produkciji (bookmark-i, share links)

### 4.3 Page templates

Svaka stranica ima jedan od sljedeća 4 obrasca:

**A. List page** (transakcije, računi)
```
Header (title + primary action)
Filters bar (sticky)
List / Table
Pagination
```

**B. Detail page** (transakcija, račun)
```
Back button + title + actions
Key fact hero (amount, status)
Tabbed detail sections
Activity / history
```

**C. Dashboard** (početna, uvidi)
```
Greeting / context banner
Primary metric card
Grid od 2-3 secondary metric cards
List of recent items
CTA bar
```

**D. Form page** (novi/edit)
```
Back + title
Form sections (max 3)
Sticky bottom action bar (mobilni) / Buttons inline (desktop)
```

---

## 5. Interaction Patterns

### 5.1 Loading states

Pravilo prioriteta (brzo → sporo):
1. **Optimistic update** — UI se ažurira odmah, pretpostavljamo success
2. **Skeleton screen** — ako nemamo podatke za optimistic
3. **Spinner** — samo ako ni skeleton nije moguć, i akcija traje >500ms

**Skeleton pattern:**
```tsx
{isLoading ? (
  <div className="space-y-2">
    {Array.from({ length: 5 }).map((_, i) => (
      <Skeleton key={i} className="h-16 rounded-xl" />
    ))}
  </div>
) : (
  <TransactionList items={data} />
)}
```

### 5.2 Empty states

Svaki prazan ekran ima:
1. **Ikonu ili ilustraciju** (jednostavna, single color)
2. **Naslov** (1 linija, ljudski ton)
3. **Objasnjenje** (1-2 linije, zašto je prazno)
4. **Primary action** (dugme za brzo popunjavanje)

Primjeri:

**Prazna lista transakcija (neregistrovan korisnik):**
> 📝
> **Još nema transakcija**
> Počni tako što ćeš dodati račun ili uvesti izvod iz banke.
> [+ Dodaj račun] [Uvezi izvod]

**Prazan dashboard (novi korisnik):**
> 👋
> **Dobro došao u Konto**
> Tvoja privatnost je prva. Da bismo počeli, dodaj svoj prvi račun.
> [Dodaj račun]

**Prazan rezultat pretrage:**
> 🔍
> **Nema rezultata za "konzum"**
> Provjeri kucanje ili pokušaj drugi pojam.
> [Resetuj filter]

### 5.3 Error states

Hijerarhija:
1. **Inline field errors** — validacija ispod polja, crveno, ikona alert
2. **Toast errors** — za async ops (save failed, import failed)
3. **Alert banners** — za persistent issues (FX stale, storage full)
4. **Full page errors** — 404, 500, auth required

Copy za greške:
- Nikad "Error 500" ili tehnički ID bez objasnjenja
- Uvijek: šta se desilo + šta korisnik može uraditi
- Ako nije user fault: ponudi retry ili support link

```tsx
// Primjeri
"Nešto je krenulo naopako. Pokušaj ponovo za par sekundi." + [Retry]
"Iznos mora biti veći od 0."
"Nismo mogli učitati izvod. Provjeri da li je PDF validan."
"Nemaš pristup ovom resursu."
```

### 5.4 Feedback patterns

- **Success toast:** 3 sekunde, zeleno, checkmark icon, koncizan
- **Error toast:** dok ga korisnik ne dismissuje, crveno, sa akcijom retry
- **Warning toast:** 5 sekundi, amber, razumno objasnjenje
- **Info toast:** 3 sekunde, neutral

Koristi **Sonner** (shadcn dodatak), ne native Toast.

### 5.5 Destruktivne akcije

Svaka destruktivna akcija zahtijeva eksplicitno potvrđivanje:

```
Delete transakcija  → Dialog sa "Jesi siguran?" + [Otkaži] [Obriši]
Bulk delete         → Dialog koji traži unos broja ("Obrišite 47 transakcija")
Delete account      → Multi-step: email confirmation + waiting period
Delete budget       → Dialog sa "Obriši" + warnings ako su transakcije povezane
```

**Nikad bez dijaloga:** delete, reset, logout svih sesija, export (jer može biti osjetljivo ako neko gleda).

---

## 6. Mobile-specific Patterns

### 6.1 Touch targets

- **Minimum 44×44px** (Apple HIG), praktično 48×48px
- Lista items: `min-h-16` (64px) za komforni touch
- Buttons: `h-11` (44px) na mobilnom, `h-10` (40px) na desktopu
- Spacing između tap-able elemenata: najmanje 8px

### 6.2 Gestures

| Gesture | Akcija | Gdje |
|---|---|---|
| Tap | Navigate / primary action | Svuda |
| Long press | Select / context menu | Lista transakcija |
| Swipe left | Edit / Delete quick actions | Lista transakcija |
| Swipe right | Back navigation | Detail screens |
| Pull to refresh | Refresh data | Dashboard, lista |

**Pravilo:** nikad ne koristi gesture kao JEDINI način za akciju. Uvijek mora postojati i tap-based alternativa.

### 6.3 Virtual keyboard handling

- Inputs sa brojevima: `inputMode="decimal"` (tastatura sa zarezom)
- Email inputs: `inputMode="email"` + `autoComplete="email"`
- Sticky bottom action bar se pomjera gore zajedno sa tastaturom (CSS env var `keyboard-inset-height`)
- Forma nikad ne skrolira ispod tastature — use `scroll-into-view` na focused field

### 6.4 Bottom navigation details

```
┌──────┬──────┬──────┬──────┬──────┐
│ Home │ Tx   │  +   │Insig │ More │
│  🏠  │ 📋   │ FAB  │ 📊   │  ⋯   │
└──────┴──────┴──────┴──────┴──────┘
   ↑ aktivan: bold + primary color
```

- Aktivan tab: icon + label bold, primary color
- Neaktivni: icon muted, label muted
- FAB je **iznad** nav bara, floating, primary color
- Scroll na dugoj listi: nav se može sakrivati (scroll down = sakrij, scroll up = pokaži)

### 6.5 Safe areas (iOS notches, Android gestures)

```css
/* globals.css */
.safe-top { padding-top: env(safe-area-inset-top); }
.safe-bottom { padding-bottom: env(safe-area-inset-bottom); }
```

Bottom nav uvijek ima `pb-[env(safe-area-inset-bottom)]` da se ne seče sa Android home indicator-om ili iOS home bar-om.

---

## 7. Content & Copy Guide

### 7.1 Jezik (bosanski primarni)

**Ton:** prijateljski, jasan, nikad patroniziranje. Nikad slang. Nikad službeni ("poštovani korisniče"). "Ti" umjesto "Vi".

**Pravila:**
- Uvijek pišemo `Konto` (capitalized), brand name
- Iznose pišemo evropski: `1.234,56 KM`, ne `1,234.56 KM`
- Datume: `15.4.2026.` kratko, `15. april 2026.` dugo (bosanski sa tačkom iza godine)
- Vrijeme: `14:35` (24h format, nikad AM/PM)
- Broj bez jedinice: `43` transakcije, ne `43tx`

**Copy library (referenca):**

| Scenarij | Copy |
|---|---|
| Welcome (novi korisnik) | "Dobro došli u Konto." |
| Signin CTA | "Prijavi se" |
| Signup CTA | "Napravi nalog" |
| Magic link sent | "Poslali smo ti link na email. Klikni da se prijaviš." |
| Save success | "Sačuvano." |
| Save error | "Nije uspjelo. Pokušaj ponovo." |
| Delete confirm | "Jesi siguran? Ova akcija se ne može poništiti." |
| Empty state | varira po ekranu — vidi 5.2 |
| Loading | Nikad "Loading..." — koristi skeleton ili ništa |
| Success toast | "Transakcija je dodata." (prošlo vrijeme, jer se već desilo) |
| Generic error | "Nešto nije u redu. Pokušaj opet za par sekundi." |

### 7.2 Forme

- **Labels iznad polja**, ne placeholder umjesto label-a (accessibility)
- **Placeholder** daje primjer, ne ponavlja label
- **Helper text** ispod polja za dodatna objašnjenja
- **Required indicator:** crveni asterisk na label-u
- **Error message:** ispod polja, crveno, sa Alert icon-om

Primjer:
```
Iznos *                             ← label, bold
┌─────────────────────────┐
│ 12,50              KM ▼ │          ← placeholder je "0,00"
└─────────────────────────┘
Može biti negativan za trošak.      ← helper text, muted
```

### 7.3 Brojevi i valute

**Prikazivanje po kontekstu:**

| Kontekst | Format | Primjer |
|---|---|---|
| Dashboard hero | `{amount} {currency}` large | `2.450,00 KM` |
| Transaction row | `{sign}{amount} {currency}` | `−43,50 KM` |
| Chart label | `{amount}k` ako > 10k | `12,3k KM` |
| Compact list | `{amount}` (valuta iz konteksta) | `−43,50` |

**Minus znak:** koristi Unicode minus `−` (U+2212), ne hyphen `-`. U tipografiji izgleda bolje i čitljivije je.

**Thousands separator:** tačka za bs/sr/hr lokale, zarez za en/us.
**Decimal separator:** zarez za bs/sr/hr, tačka za en/us.

Koristi uvijek `Intl.NumberFormat` iz standardne lib, ne ručno:
```typescript
new Intl.NumberFormat('bs-BA', { 
  style: 'currency', 
  currency: 'BAM',
  currencyDisplay: 'code'  // "KM" umjesto "BAM"
}).format(amount);
```

### 7.4 Datumi

| Kontekst | Format | Primjer |
|---|---|---|
| Today / yesterday | "Danas" / "Juče" | `Danas, 14:35` |
| Ova sedmica | weekday | `Pon, 14:35` |
| Ova godina | d. mmm. | `15. apr.` |
| Starije | d.m.yyyy. | `15.4.2025.` |
| Full datetime | d. mmm yyyy. u HH:mm | `15. apr. 2026. u 14:35` |

Koristi **date-fns** sa `bs` lokalom:
```typescript
import { format, formatDistanceToNow } from 'date-fns';
import { bs } from 'date-fns/locale';

format(new Date(), "d. MMM yyyy.", { locale: bs }); // "15. apr. 2026."
```

---

## 8. Accessibility

### 8.1 Non-negotiable

- **Keyboard navigation** svuda — tab order logički, svaka akcija reachable
- **Focus visible** — nikad ne uklanjaj focus ring (`outline: none` bez replacement-a = fail)
- **ARIA labels** na icon-only buttons (`aria-label="Dodaj transakciju"`)
- **Color not the only indicator** — income/expense boja + znak (− ili +), ne samo boja
- **Form errors announced** — `aria-live="polite"` na error container
- **Alt text** na svim slikama (ili `alt=""` za decorative)

### 8.2 Target metrics

- **WCAG 2.1 AA** minimum
- Contrast ratios: 4.5:1 za text, 3:1 za large text i UI elements
- Alat za testiranje: **axe DevTools** + Lighthouse Accessibility score ≥ 95

### 8.3 Screen reader notes

- Novčani iznos: `<span aria-label="43 konvertibilne marke i 50 feninga">43,50 KM</span>` — ili jednostavniji pristup sa `<span aria-label="minus 43 i po marke">−43,50 KM</span>`
- Test na VoiceOver (iOS) i TalkBack (Android)

---

## 9. Motion & Animation

### 9.1 Principi

- **Funkcionalna, nije dekorativna** — animacija mora imati svrhu (state change, orientation)
- **Brza** — 150–250ms za micro, 300–400ms za transitions
- **Ease-out za entries, ease-in za exits**
- **Respect `prefers-reduced-motion`** — isključi sve osim critical (loading)

### 9.2 Biblioteka

- **Framer Motion** (`motion`) za complex animacije
- **CSS transitions** za jednostavne state changes
- **Tailwind animacije** iz `tailwindcss-animate` za shadcn default

### 9.3 Standardne animacije

| Akcija | Animacija | Trajanje |
|---|---|---|
| Toast enter | Slide from top-right + fade | 200ms |
| Dialog open | Fade + scale (0.95 → 1) | 200ms |
| Sheet open (mobile) | Slide from bottom | 250ms |
| Tab change | Crossfade | 150ms |
| List item delete | Slide out + collapse | 300ms |
| Amount update | Number roll (framer-motion) | 400ms |
| Skeleton | Shimmer | 1500ms loop |

---

## 10. Component Composition Examples

### 10.1 Primjer: Dashboard hero card

```tsx
<Card className="p-6">
  <div className="flex items-start justify-between">
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">Ukupno stanje</p>
      <MoneyDisplay 
        cents={totalBalance} 
        currency="BAM" 
        variant="large" 
      />
    </div>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreHorizontal className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      {/* ... */}
    </DropdownMenu>
  </div>
  
  <div className="mt-4 flex items-center gap-2 text-sm">
    <Badge variant={monthlyChange > 0 ? "success" : "destructive"}>
      {monthlyChange > 0 ? '↑' : '↓'} {Math.abs(monthlyChange)}%
    </Badge>
    <span className="text-muted-foreground">ovaj mjesec</span>
  </div>
</Card>
```

### 10.2 Primjer: Transaction list row

```tsx
<button 
  className="flex w-full items-center gap-3 rounded-lg p-3 hover:bg-muted/50 transition-colors"
  onClick={() => router.push(`/transakcije/${tx.id}`)}
>
  <CategoryIcon category={tx.category} size="md" />
  
  <div className="flex-1 min-w-0 text-left">
    <p className="font-medium truncate">
      {tx.merchant?.display_name ?? tx.merchant_raw ?? 'Nepoznato'}
    </p>
    <p className="text-sm text-muted-foreground truncate">
      {tx.category?.name ?? 'Nerazvrstano'} · {formatDate(tx.transaction_date)}
    </p>
  </div>
  
  <MoneyDisplay 
    cents={tx.original_amount_cents}
    currency={tx.original_currency}
    signFromAmount
  />
</button>
```

---

## 11. Design Tokens Summary (za Cursor referenca)

```typescript
// lib/design-tokens.ts
export const tokens = {
  colors: {
    semantic: {
      income: 'hsl(var(--income))',
      expense: 'hsl(var(--expense))',
      transfer: 'hsl(var(--transfer))',
    },
  },
  radius: {
    sm: '0.375rem',     // 6px — buttons, inputs
    md: '0.5rem',       // 8px
    lg: '0.75rem',      // 12px — cards
    full: '9999px',     // avatars, chips
  },
  spacing: {
    mobileGutter: '1rem',   // 16px
    desktopGutter: '1.5rem', // 24px
    sectionGap: '2rem',      // 32px
  },
  timing: {
    micro: 150,
    standard: 250,
    large: 400,
  },
  breakpoints: {
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
  },
} as const;
```

---

## 12. Change Log

| Datum | Verzija | Promjena |
|---|---|---|
| 2026-04-21 | 1.0 | Inicijalna verzija |
