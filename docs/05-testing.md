# Konto — Testing Strategy

**Verzija:** 1.0 · **Datum:** april 2026.
**Status:** Živi dokument. Test kritičnih flow-ova je dio "definition of done" za svaki task.

---

## 1. Testing philosophy

**Tri principa:**

1. **Test što je kritično, ne što je lako.** Money math, RLS, duplicate detection, FX — ovo mora imati testove. Button hover state — ne mora.
2. **Testovi su dio koda, ne post-production.** Ako task nema test, task nije završen.
3. **Test pyramid je vodilja, ne dogma.** Solo founder ne može imati 80% code coverage. Ali kritični putevi moraju imati 100% coverage.

---

## 2. Test pyramid (target)

```
         ┌─────────────┐
         │  E2E (10%)  │     Playwright
         │  ~10 tests  │     Critical user journeys
         └─────────────┘
       ┌─────────────────┐
       │ Integration     │   Vitest + Supabase test db
       │ (30%) ~50 tests │   Server Actions, RLS, DB logic
       └─────────────────┘
    ┌───────────────────────┐
    │ Unit (60%) ~100 tests │  Vitest
    │                        │  Pure functions, utilities
    └───────────────────────┘
```

**Praktični target za Fazu 0–1 (solo):**

- 100% coverage: monetary math, FX, dedup logic
- 100% coverage: RLS policies (najmanje jedan test per tabela)
- 80% coverage: Server Actions
- 50% coverage: UI komponente (samo komponente sa logikom)
- Ne mjerimo coverage od CSS/layout-a

---

## 3. Tools

| Sloj              | Alat                               | Razlog                                  |
| ----------------- | ---------------------------------- | --------------------------------------- |
| Unit test runner  | **Vitest** 1.x                     | Brz, ESM native, kompatibilan s Vite-om |
| Component testing | **Vitest + Testing Library**       | React Testing Library patterns          |
| E2E               | **Playwright** 1.x                 | Industry standard, mobile emulation     |
| Mocking HTTP      | **MSW** (Mock Service Worker)      | Intercept fetch, oba environments       |
| Supabase mocking  | **Supabase CLI local** + test seed | Realistic DB bez produkcije             |
| CI                | **GitHub Actions**                 | Besplatan za javne/private              |
| Coverage          | **v8 (built into vitest)**         | Native TypeScript support               |

Install:

```bash
pnpm add -D vitest @vitest/ui @vitejs/plugin-react
pnpm add -D @testing-library/react @testing-library/jest-dom @testing-library/user-event
pnpm add -D @playwright/test
pnpm add -D msw
pnpm add -D jsdom
```

---

## 4. File organization

```
konto/
├── app/
│   └── (app)/
│       └── transakcije/
│           ├── actions.ts
│           └── actions.test.ts           ← unit test za actions
├── components/
│   ├── money-input.tsx
│   └── money-input.test.tsx              ← component test
├── lib/
│   ├── format/
│   │   ├── parse-money.ts
│   │   └── parse-money.test.ts           ← pure function test
│   └── fx/
│       ├── convert.ts
│       └── convert.test.ts
├── __tests__/
│   ├── integration/
│   │   ├── rls-transactions.test.ts      ← integration
│   │   └── create-transaction-flow.test.ts
│   └── e2e/
│       ├── signin.spec.ts                ← Playwright
│       └── add-transaction.spec.ts
├── vitest.config.ts
├── playwright.config.ts
└── __fixtures__/
    ├── pdfs/
    │   └── raiffeisen-sample.pdf         ← real redacted PDFs za parser tests
    └── transactions.ts                   ← factory functions
```

---

## 5. Vitest config

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['app/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/node_modules/**', '**/types.ts'],
      thresholds: {
        'lib/fx/**': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'lib/format/**': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'app/**/actions.ts': { statements: 80, branches: 70, functions: 80, lines: 80 },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
```

```typescript
// vitest.setup.ts
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
```

---

## 6. Critical test cases by domain

### 6.1 Monetary math (🔒 100% coverage required)

```typescript
// lib/format/parse-money.test.ts
import { describe, it, expect } from 'vitest';
import { parseMoneyString } from './parse-money';

describe('parseMoneyString', () => {
  it('parses integer', () => {
    expect(parseMoneyString('1234', 'bs-BA')).toBe(123400n);
  });

  it('parses with decimal comma (bs-BA)', () => {
    expect(parseMoneyString('12,50', 'bs-BA')).toBe(1250n);
  });

  it('parses with decimal period (en-US)', () => {
    expect(parseMoneyString('12.50', 'en-US')).toBe(1250n);
  });

  it('parses with thousands separator (bs-BA)', () => {
    expect(parseMoneyString('1.234,50', 'bs-BA')).toBe(123450n);
  });

  it('parses negative', () => {
    expect(parseMoneyString('-12,50', 'bs-BA')).toBe(-1250n);
  });

  it('handles Unicode minus', () => {
    expect(parseMoneyString('−12,50', 'bs-BA')).toBe(-1250n);
  });

  it('returns null for invalid input', () => {
    expect(parseMoneyString('abc', 'bs-BA')).toBeNull();
    expect(parseMoneyString('', 'bs-BA')).toBeNull();
    expect(parseMoneyString('12,50,30', 'bs-BA')).toBeNull();
  });

  it('handles whitespace', () => {
    expect(parseMoneyString('  12,50  ', 'bs-BA')).toBe(1250n);
    expect(parseMoneyString('12 .50', 'bs-BA')).toBeNull();
  });

  it('handles single decimal', () => {
    expect(parseMoneyString('12,5', 'bs-BA')).toBe(1250n);
  });

  it('handles three decimals (error)', () => {
    expect(parseMoneyString('12,501', 'bs-BA')).toBeNull();
  });

  it('handles zero', () => {
    expect(parseMoneyString('0', 'bs-BA')).toBe(0n);
    expect(parseMoneyString('0,00', 'bs-BA')).toBe(0n);
  });

  it('handles large numbers', () => {
    expect(parseMoneyString('1.234.567,89', 'bs-BA')).toBe(123456789n);
  });
});
```

### 6.2 FX konverzija (🔒 100% coverage)

```typescript
// lib/fx/convert.test.ts
import { describe, it, expect, vi } from 'vitest';
import { convertToBase, BAM_EUR_RATE } from './convert';

describe('convertToBase', () => {
  it('identity: same currency returns same amount', async () => {
    const result = await convertToBase(1000n, 'EUR', 'EUR', '2026-01-15');
    expect(result.baseCents).toBe(1000n);
    expect(result.fxRate).toBe(1);
    expect(result.fxStale).toBe(false);
  });

  it('BAM to EUR uses currency board constant', async () => {
    // 100 BAM = ~51,13 EUR
    const result = await convertToBase(10000n, 'BAM', 'EUR', '2026-01-15');
    expect(result.baseCents).toBe(5113n);
    expect(result.fxRate).toBeCloseTo(1 / BAM_EUR_RATE, 6);
    expect(result.fxSource).toBe('currency_board');
  });

  it('EUR to BAM uses currency board constant', async () => {
    // 100 EUR = 195,58 BAM
    const result = await convertToBase(10000n, 'EUR', 'BAM', '2026-01-15');
    expect(result.baseCents).toBe(19558n);
    expect(result.fxRate).toBeCloseTo(BAM_EUR_RATE, 6);
  });

  it('BAM to USD goes through EUR', async () => {
    // Mock EUR/USD rate
    vi.mock('./fetch-rate', () => ({ fetchEurRate: () => Promise.resolve(1.1) }));
    const result = await convertToBase(10000n, 'BAM', 'USD', '2026-01-15');
    // 100 BAM → ~51.13 EUR → ~56.24 USD
    expect(Number(result.baseCents)).toBeCloseTo(5624, -1);
  });

  it('flags stale when rate unavailable', async () => {
    vi.mock('./fetch-rate', () => ({ fetchEurRate: () => Promise.reject() }));
    const result = await convertToBase(10000n, 'USD', 'EUR', '2026-01-15');
    expect(result.fxStale).toBe(true);
  });

  it('uses date-specific rate, not current', async () => {
    // Past date should use historical rate
    const historical = await convertToBase(10000n, 'USD', 'EUR', '2020-01-15');
    const today = await convertToBase(10000n, 'USD', 'EUR', '2026-04-21');
    // Just sanity check; exact values depend on mocks
    expect(historical.fxRateDate).toBe('2020-01-15');
    expect(today.fxRateDate).toBe('2026-04-21');
  });
});
```

### 6.3 RLS policies (🔒 integration test)

```typescript
// __tests__/integration/rls-transactions.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

// Lokalni Supabase instance (supabase start)
const supabaseUrl = process.env.SUPABASE_URL_TEST!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY_TEST!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY_TEST!;

describe('Transactions RLS', () => {
  let userA: { id: string; token: string };
  let userB: { id: string; token: string };

  beforeAll(async () => {
    // Setup dva test korisnika
    userA = await createTestUser('a@test.com');
    userB = await createTestUser('b@test.com');

    // A ima jedan račun i jednu transakciju
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: account } = await adminClient
      .from('accounts')
      .insert({
        user_id: userA.id,
        name: 'Test Račun',
        type: 'checking',
        currency: 'BAM',
      })
      .select()
      .single();

    await adminClient.from('transactions').insert({
      user_id: userA.id,
      account_id: account!.id,
      original_amount_cents: -1000n,
      original_currency: 'BAM',
      base_amount_cents: -1000n,
      base_currency: 'BAM',
      transaction_date: '2026-04-20',
      source: 'manual',
    });
  });

  it('User A can read own transactions', async () => {
    const client = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${userA.token}` } },
    });
    const { data } = await client.from('transactions').select('*');
    expect(data).toHaveLength(1);
  });

  it('User B cannot read User A transactions', async () => {
    const client = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${userB.token}` } },
    });
    const { data } = await client.from('transactions').select('*');
    expect(data).toHaveLength(0);
  });

  it('User B cannot insert transaction with User A user_id (RLS block)', async () => {
    const client = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${userB.token}` } },
    });
    const { error } = await client.from('transactions').insert({
      user_id: userA.id,
      // ... rest
    });
    expect(error).toBeTruthy();
  });

  it('User B cannot update User A transaction', async () => {
    const client = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${userB.token}` } },
    });
    const { data } = await client
      .from('transactions')
      .update({ notes: 'hacked' })
      .eq('user_id', userA.id);
    expect(data).toEqual([]); // nothing updated
  });

  // ... i tako redom za svaki mutation
});
```

### 6.4 Dedup logic

```typescript
// lib/dedup.test.ts
describe('computeDedupHash', () => {
  it('produces stable hash for same input', () => {
    const input = {
      account_id: 'a1',
      amount_cents: -1250n,
      date: '2026-04-20',
      merchant: 'KONZUM',
    };
    expect(computeDedupHash(input)).toBe(computeDedupHash(input));
  });

  it('differs when account changes', () => {
    const base = { account_id: 'a1', amount_cents: -1250n, date: '2026-04-20', merchant: 'KONZUM' };
    expect(computeDedupHash(base)).not.toBe(computeDedupHash({ ...base, account_id: 'a2' }));
  });

  it('normalizes merchant whitespace and case', () => {
    expect(computeDedupHash({ ...base, merchant: 'KONZUM' })).toBe(
      computeDedupHash({ ...base, merchant: '  konzum  ' }),
    );
  });

  it('handles null merchant', () => {
    expect(computeDedupHash({ ...base, merchant: null })).toBeTruthy();
  });
});
```

### 6.5 Transfer detection

```typescript
// lib/transfers/detect.test.ts
describe('detectTransferPairs', () => {
  it('detects obvious pair', () => {
    const txs = [
      {
        id: '1',
        account_id: 'raiffeisen',
        amount_cents: -10000n,
        currency: 'EUR',
        date: '2026-04-15',
      },
      { id: '2', account_id: 'revolut', amount_cents: 10000n, currency: 'EUR', date: '2026-04-15' },
    ];
    const pairs = detectTransferPairs(txs);
    expect(pairs).toEqual([{ outflow: '1', inflow: '2', confidence: expect.any(Number) }]);
  });

  it('tolerates small amount difference (FX)', () => {
    const txs = [
      {
        id: '1',
        account_id: 'raiffeisen',
        amount_cents: -10000n,
        currency: 'EUR',
        date: '2026-04-15',
      },
      { id: '2', account_id: 'revolut', amount_cents: 9980n, currency: 'EUR', date: '2026-04-16' },
    ];
    const pairs = detectTransferPairs(txs, { amountTolerance: 0.005, dayTolerance: 3 });
    expect(pairs).toHaveLength(1);
  });

  it('does not pair same-account', () => {
    const txs = [
      {
        id: '1',
        account_id: 'raiffeisen',
        amount_cents: -10000n,
        currency: 'EUR',
        date: '2026-04-15',
      },
      {
        id: '2',
        account_id: 'raiffeisen',
        amount_cents: 10000n,
        currency: 'EUR',
        date: '2026-04-15',
      },
    ];
    expect(detectTransferPairs(txs)).toEqual([]);
  });

  it('does not pair outside tolerance', () => {
    const txs = [
      {
        id: '1',
        account_id: 'raiffeisen',
        amount_cents: -10000n,
        currency: 'EUR',
        date: '2026-04-15',
      },
      { id: '2', account_id: 'revolut', amount_cents: 10000n, currency: 'EUR', date: '2026-04-25' }, // 10 dana
    ];
    expect(detectTransferPairs(txs, { dayTolerance: 3 })).toEqual([]);
  });
});
```

### 6.6 Parser accuracy (Faza 2)

```typescript
// lib/parsers/raiffeisen-ba.test.ts
import { readFileSync } from 'fs';
import { parseRaiffeisenBa } from './raiffeisen-ba';

describe('Raiffeisen BA parser', () => {
  it('parses sample statement', () => {
    const text = readFileSync('./__fixtures__/pdfs/raiffeisen-sample.txt', 'utf-8');
    const result = parseRaiffeisenBa(text);

    expect(result.account.institution).toBe('Raiffeisen Bank d.d. Bosna i Hercegovina');
    expect(result.account.currency).toBe('BAM');
    expect(result.transactions).toHaveLength(42);

    // First transaction sanity
    expect(result.transactions[0]).toMatchObject({
      transaction_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      amount_cents: expect.any(BigInt),
      currency: 'BAM',
    });
  });

  it('handles decimal comma', () => {
    const text = `15.04.2026.  KONZUM BL      12,50`;
    const result = parseRaiffeisenBa(text);
    expect(result.transactions[0].amount_cents).toBe(-1250n);
  });

  it('reconciles balance', () => {
    const result = parseRaiffeisenBa(text);
    const sum = result.transactions.reduce((s, t) => s + t.amount_cents, 0n);
    const expected = result.account.balance_end_cents - result.account.balance_start_cents;
    expect(sum).toBe(expected);
  });

  it('flags reconciliation mismatch', () => {
    const corruptedText = /* missing a transaction */;
    const result = parseRaiffeisenBa(corruptedText);
    expect(result.warnings).toContainEqual(expect.objectContaining({ type: 'reconciliation_mismatch' }));
  });
});
```

---

## 7. E2E tests (Playwright)

### 7.1 Playwright config

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './__tests__/e2e',
  fullyParallel: false, // Suprotno: dijele bazu
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Solo dev
  reporter: [['html'], ['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

### 7.2 Critical flows koji MORAJU imati E2E

1. **Sign in flow** (magic link mock)
2. **Dodavanje manualne transakcije** (quick-add + forma)
3. **Upload PDF izvoda** (Faza 2+, sa fixture PDF-om)
4. **Review i approve parsed transactions** (Faza 2+)
5. **Izvoz podataka (JSON)**
6. **Brisanje naloga** (multi-step, 24h flow skip za test)
7. **Promjena base currency** (mora re-kalkulisati balansi)

### 7.3 Primjer E2E testa

```typescript
// __tests__/e2e/add-transaction.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Add transaction', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsTestUser(page);
  });

  test('quick add happy path', async ({ page }) => {
    await page.goto('/pocetna');

    // Otvori quick-add
    await page.click('[aria-label="Dodaj transakciju"]');

    // Unesi iznos
    await page.fill('[name="amount"]', '12,50');

    // Izaberi merchant
    await page.fill('[name="merchant"]', 'Konzum');
    await page.click('[role="option"]:has-text("Konzum")');

    // Submit
    await page.click('button[type="submit"]:has-text("Spasi")');

    // Provjeri toast
    await expect(page.locator('text=Transakcija je dodata.')).toBeVisible();

    // Provjeri da se pojavila u listi
    await expect(page.locator('text=Konzum').first()).toBeVisible();
    await expect(page.locator('text=−12,50 KM').first()).toBeVisible();
  });

  test('validation: zero amount', async ({ page }) => {
    await page.goto('/pocetna');
    await page.click('[aria-label="Dodaj transakciju"]');
    await page.fill('[name="amount"]', '0');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Iznos mora biti')).toBeVisible();
  });

  test('mobile quick-add is reachable via bottom nav', async ({ page, isMobile }) => {
    test.skip(!isMobile);
    await page.goto('/pocetna');
    await page.click('[data-testid="fab-add"]');
    await expect(page.locator('[role="dialog"]')).toBeVisible();
  });
});
```

---

## 8. Manual testing checklists

E2E ne pokriva sve — zadrži manual QA checkliste za osjetljive flow-ove.

### 8.1 Pre-deployment checklist (solo)

Prije svakog deploy-a u produkciju:

- [ ] `pnpm test` prolazi 100%
- [ ] `pnpm test:e2e` prolazi 100%
- [ ] `pnpm build` bez errors ili warnings
- [ ] Lighthouse mobile na dashboard ≥ 90 Performance
- [ ] Manual: prijava magic linkom radi
- [ ] Manual: dodavanje transakcije radi
- [ ] Manual: brisanje transakcije radi
- [ ] Manual: sign out i sign in u drugom brauzeru
- [ ] Manual: dark mode se prebacuje
- [ ] Sentry error dashboard: nema novih errora sa staging-a

### 8.2 Feature-specific checklist — PDF upload (Faza 2)

Prije nego što marknes Epic 2 kao done:

- [ ] Upload Raiffeisen izvoda iz svoje banke → tačno parsirano
- [ ] Upload korumpiranog PDF-a (texteditor fake) → graceful error
- [ ] Upload PDF-a >10MB → rejected with clear message
- [ ] Upload non-PDF (slika sa .pdf ekstenzijom) → magic bytes catch
- [ ] Istovremeni upload 5 PDF-ova → radi, queue-uje
- [ ] Refresh stranice tokom parsing-a → resume-uje ili jasan status
- [ ] PDF izbrisan nakon 24h (manual check storage)
- [ ] Reconciliation mismatch flaguje batch kao "review"
- [ ] User A ne vidi User B batch-eve (RLS check)
- [ ] Cost tracking: parser_cost_cents je upisan

---

## 9. CI/CD test matrix

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck

  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm test --coverage
      - uses: codecov/codecov-action@v4 # optional, solo može bez

  e2e:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: supabase/postgres:15.1.1.54
        env:
          POSTGRES_PASSWORD: postgres
        ports: [5432:5432]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm exec supabase start
      - run: pnpm test:e2e
```

---

## 10. Definition of Done (per task)

Task nije završen dok svi ovi nisu tačni:

- [ ] Kod kompajlira bez errors/warnings
- [ ] Unit testovi postoje za novu biznis logiku
- [ ] Integracioni testovi postoje za nove Server Actions koji dirnu bazu
- [ ] E2E test dodan ako feature je u "critical flow" listi
- [ ] Manual testing prošao na localhost-u
- [ ] Manual testing prošao na Vercel preview URL-u
- [ ] Ako Faza 2+: testirano i na mobile emulaciji
- [ ] Dokumentacija (docs/) ažurirana ako je feature značajan
- [ ] Commit poruka follows conventional commits
- [ ] PR merge-ovan (ili direct commit za solo)

---

## 11. Change Log

| Datum      | Verzija | Promjena           |
| ---------- | ------- | ------------------ |
| 2026-04-21 | 1.0     | Inicijalna verzija |
