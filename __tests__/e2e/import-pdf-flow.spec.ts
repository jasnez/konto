import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { cleanupTestUser, e2eSeedImportBatchReady, signInAsTestUser } from './helpers';

/** Distinct substring so the transakcije list is easy to assert. */
const SEED_DESCRIPTION = 'E2E bank uvoz stavka';

/**
 * End-to-end: upload PDF → batch stranica → (mock) parse → pregled → potvrda → transakcije.
 * Presreće POST /api/imports/:id/parse i puni staging service role klijentom — bez Geminija.
 */
test('PDF uvoz → pregled → potvrda → vidi na transakcijama', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-safari', 'PDF upload i pregled tabele na desktopu.');
  test.setTimeout(120_000);

  const session = await signInAsTestUser(page);
  const pdfPath = join(process.cwd(), 'tests', 'parser', 'golden', 'revolut-01.pdf');

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
          transaction_date: '2026-04-15',
          amount_minor: -12_550,
          currency: 'BAM',
          raw_description: SEED_DESCRIPTION,
        },
      ],
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        count: 1,
        confidence: 'high',
        warnings: [],
      }),
    });
  });

  try {
    await page.goto('/import', { waitUntil: 'domcontentloaded' });

    await page.locator('#import-pdf').setInputFiles(pdfPath);

    await expect(page.getByTestId('import-selected-file')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Pošalji' }).click();

    await expect(page).toHaveURL(/\/import\/[0-9a-f-]{36}/iu, { timeout: 60_000 });

    // Opis je u native <input> — asertuj vrijednost unutar tabele pregleda.
    const reviewTable = page.getByRole('table', { name: 'Parsirane transakcije za uvoz' });
    await expect(reviewTable.getByPlaceholder('Novi merchant — dodaj')).toHaveValue(
      SEED_DESCRIPTION,
      {
        timeout: 60_000,
      },
    );
    await expect(page.getByRole('button', { name: 'Potvrdi i importuj' })).toBeEnabled({
      timeout: 30_000,
    });

    await page.getByRole('button', { name: 'Potvrdi i importuj' }).click();

    await expect(page).toHaveURL(/\/transakcije/u, { timeout: 45_000 });
    await expect(page.getByText(SEED_DESCRIPTION).first()).toBeVisible({ timeout: 30_000 });
  } finally {
    await page.unroute('**/api/imports/*/parse');
    await cleanupTestUser(session.userId);
  }
});
