import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  cleanupTestUser,
  e2eDeleteImportBatchById,
  e2eSeedImportBatchReady,
  e2eShouldRunSlowImportOnCi,
  ensureTwoE2EAccountsForImport,
  signInAsTestUser,
} from './helpers';

/** Ostaje uvezena nakon što se druga stavka isključi. */
const STAVKA_OSTAJE = 'E2E F2 stavka A — ostaje u uvozu';
/** Isključena prije potvrde. */
const STAVKA_ISKLJUCENA = 'E2E F2 stavka B — isključena';

/**
 * F2: cijeli import flow (sporo). U CI presrećemo POST /parse i ponašamo se kao
 * deterministički LLM — bez stvarnog Geminija. `pnpm test:e2e:slow` pokreće samo
 * testove s @slow u imenu; u GitHub CI ovaj test je na jobu „main” grane.
 */
test('F2: cijeli import flow @slow', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-safari', 'PDF upload i tabela za pregled — desktop.');
  test.skip(
    Boolean(process.env.CI) && !e2eShouldRunSlowImportOnCi(),
    'Spori E2E importa na CI samo na main (ne na pull request).',
  );

  test.setTimeout(180_000);

  const session = await signInAsTestUser(page);
  await ensureTwoE2EAccountsForImport(session.userId);

  const pdfPath = join(process.cwd(), 'tests', 'fixtures', 'pdfs', 'raiffeisen-sample.pdf');

  let batchIdForCleanup: string | null = null;

  await page.route('**/api/imports/*/parse', async (route, request) => {
    if (request.method() !== 'POST') {
      await route.continue();
      return;
    }
    const url = new URL(request.url());
    const parsePath =
      /\/api\/imports\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/parse$/iu;
    const m = parsePath.exec(url.pathname);
    if (!m) {
      await route.continue();
      return;
    }
    const batchId = m[1];
    await e2eSeedImportBatchReady({
      batchId,
      userId: session.userId,
      transactions: [
        {
          transaction_date: '2026-04-20',
          amount_minor: -10_000,
          currency: 'BAM',
          raw_description: STAVKA_OSTAJE,
        },
        {
          transaction_date: '2026-04-10',
          amount_minor: -5_000,
          currency: 'BAM',
          raw_description: STAVKA_ISKLJUCENA,
        },
      ],
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        count: 2,
        confidence: 'high',
        warnings: [],
      }),
    });
  });

  try {
    await page.goto('/import', { waitUntil: 'domcontentloaded' });

    // 3. Račun (dva računa nakon ensureTwo* — otvori select i potvrdi odabir)
    const accountTrigger = page.locator('#import-account');
    await accountTrigger.click();
    await page.getByRole('option', { name: /E2E Tekući/u }).click();
    await expect(accountTrigger).toContainText('Tekući');

    await page.locator('#import-pdf').setInputFiles(pdfPath);
    await expect(page.getByTestId('import-selected-file')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Pošalji' }).click();

    await expect(page).toHaveURL(/\/import\/[0-9a-f-]{36}/u, { timeout: 60_000 });
    const u = new URL(page.url());
    const idMatch = /\/import\/([0-9a-f-]{36})/iu.exec(u.pathname);
    if (idMatch) batchIdForCleanup = idMatch[1];

    // 6. Stanje "ready" = Pregled uvoza s tabelom (mock postavlja `ready` u handleru; max 90s).
    const reviewTable = page.getByRole('table', { name: 'Parsirane transakcije za uvoz' });
    await expect(reviewTable).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole('heading', { name: 'Pregled uvoza' })).toBeVisible();

    const dataRows = reviewTable.locator('tbody tr');
    await expect(dataRows).toHaveCount(2);

    // 8. Prva stavka (najnoviji datum) — opis je u <input> value, ne u textContent reda.
    const firstRow = dataRows.nth(0);
    await expect(firstRow.getByPlaceholder('Novi trgovac — dodaj')).toHaveValue(STAVKA_OSTAJE);
    const categoryCombobox = firstRow.getByRole('combobox');
    await categoryCombobox.click();
    await expect(page.getByRole('listbox')).toBeVisible();
    // Duga kategorijska lista + fixed footer: klik u portalu (evaluate) umjesto hit-testa.
    await page.evaluate(() => {
      const list = document.querySelector('[role="listbox"]');
      if (!list) throw new Error('E2E: nema otvorene kategorije listbox');
      for (const n of list.querySelectorAll('[role="option"]')) {
        if ((n as HTMLElement).innerText.includes('Hrana i piće')) {
          (n as HTMLElement).click();
          return;
        }
      }
      throw new Error('E2E: opcija Hrana i piće nije u listi');
    });
    await expect(categoryCombobox).toContainText('Hrana i piće', { timeout: 10_000 });

    // 9. Isključi drugu stavku (uncheck "Uključi u uvoz"); pričekaj server action.
    const secondRow = dataRows.nth(1);
    await expect(secondRow.getByPlaceholder('Novi trgovac — dodaj')).toHaveValue(STAVKA_ISKLJUCENA);
    await secondRow.getByLabel('Uključi u uvoz').uncheck();
    await expect(secondRow.getByLabel('Uključi u uvoz')).not.toBeChecked();
    await expect(page.getByText(/\b1\s+od\s+2\s+označeno za uvoz/u)).toBeVisible({
      timeout: 10_000,
    });

    // 10.
    await page.getByRole('button', { name: 'Potvrdi i importuj' }).click();
    // 11.–12.
    await expect(page).toHaveURL(/\/transakcije/u, { timeout: 60_000 });
    const main = page.getByRole('main');
    await expect(main.getByText(STAVKA_OSTAJE, { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(main.getByText(STAVKA_ISKLJUCENA, { exact: true })).toHaveCount(0, {
      timeout: 5_000,
    });
  } finally {
    try {
      if (!page.isClosed()) {
        await page.unroute('**/api/imports/*/parse');
      }
    } catch {
      /* page već zatvoren nakon timeoute */
    }
    if (batchIdForCleanup) {
      await e2eDeleteImportBatchById(batchIdForCleanup, session.userId);
    }
    await cleanupTestUser(session.userId);
  }
});
