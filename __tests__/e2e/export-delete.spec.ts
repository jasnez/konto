import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  cleanupTestUser,
  clickDomButton,
  e2eFill,
  e2eWebKitPressFillProject,
  setProfileDeletedAt,
  signInAsTestUser,
} from './helpers';

test('JSON export — Preuzmi export, download i validan JSON', async ({ page }, testInfo) => {
  test.setTimeout(60_000);

  const session = await signInAsTestUser(page);
  const outDir = join(process.cwd(), 'test-results');
  await mkdir(outDir, { recursive: true });
  const savePath = join(outDir, `e2e-export-${testInfo.project.name}-${String(Date.now())}.json`);
  try {
    await page.goto('/podesavanja/izvoz', { waitUntil: 'domcontentloaded' });
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Preuzmi export' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/konto-export-.+\.json/u);
    await download.saveAs(savePath);
    const parsed: unknown = JSON.parse(await readFile(savePath, 'utf8'));
    expect(parsed).toMatchObject({
      export_version: expect.any(Number),
      exported_at: expect.any(String),
    });
  } finally {
    await cleanupTestUser(session.userId);
  }
});

test('zahtjev za brisanje naloga → /obrisan', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const isMobileSafari = testInfo.project.name === 'mobile-safari';
  const webKitFill = e2eWebKitPressFillProject(testInfo.project.name);

  const session = await signInAsTestUser(page);
  try {
    await page.goto('/podesavanja/obrisi', { waitUntil: 'domcontentloaded' });
    const emailInput = page.getByLabel('Unesi svoj email da potvrdiš', { exact: true });
    await e2eFill(emailInput, session.email, webKitFill);
    await expect(emailInput).toHaveValue(session.email);
    if (isMobileSafari) {
      await page
        .getByRole('checkbox', { name: /Razumijem da se ova akcija ne može poništiti/u })
        .click();
      await clickDomButton(page.getByRole('button', { name: 'Obriši nalog' }));
    } else {
      await page.getByLabel(/Razumijem da se ova akcija ne može poništiti/u).check();
      await page.getByRole('button', { name: 'Obriši nalog' }).click();
    }
    await expect(page).toHaveURL(/\/obrisan(?:\?.*)?$/u, { timeout: 30_000 });
  } finally {
    await cleanupTestUser(session.userId);
  }
});

test('middleware: profil označen za brisanje → /obrisan', async ({ page }) => {
  test.setTimeout(90_000);

  const session = await signInAsTestUser(page);
  try {
    await setProfileDeletedAt(session.userId, new Date().toISOString());
    await page.goto('/pocetna', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/obrisan(?:\?.*)?$/u, { timeout: 20_000 });
  } finally {
    await cleanupTestUser(session.userId);
  }
});
