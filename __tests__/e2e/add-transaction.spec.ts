import { platform } from 'node:os';
import { expect, test } from '@playwright/test';
import {
  cleanupTestUser,
  clickDomButton,
  e2eFill,
  e2eWebKitPressFillProject,
  signInAsTestUser,
} from './helpers';

function modPlusK(): string {
  return platform() === 'darwin' ? 'Meta+k' : 'Control+k';
}

test('desktop: Cmd+K → modal → Spasi → vidi u listi', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-safari');
  test.setTimeout(90_000);

  const session = await signInAsTestUser(page);
  const merchant = `E2E Desktop ${String(Date.now()).slice(-8)}`;

  try {
    await page.goto('/transakcije', { waitUntil: 'domcontentloaded' });
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press(modPlusK());
    const quickDialog = page.getByRole('dialog').filter({ hasText: 'Brzi unos' });
    await expect(quickDialog).toBeVisible();

    await quickDialog.getByLabel('Iznos').fill('12,50');
    await quickDialog.getByPlaceholder('npr. Konzum').fill(merchant);
    await quickDialog.getByRole('button', { name: 'Spasi' }).click();

    await expect(page.getByText('Transakcija je dodata.')).toBeVisible();
    await expect(page.getByText(merchant).first()).toBeVisible({ timeout: 20_000 });
  } finally {
    await cleanupTestUser(session.userId);
  }
});

test('mobile: FAB → sheet → Spasi → vidi na početnoj', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-safari');
  test.setTimeout(90_000);

  const webKitFill = e2eWebKitPressFillProject(testInfo.project.name);
  const session = await signInAsTestUser(page);
  const merchant = `E2E Mobile ${String(Date.now()).slice(-8)}`;

  try {
    await page.goto('/transakcije', { waitUntil: 'domcontentloaded' });
    const fab = page.getByTestId('fab-brzi-unos');
    await fab.scrollIntoViewIfNeeded();
    await clickDomButton(fab);
    const quickSheet = page.getByRole('dialog').filter({ hasText: 'Brzi unos' });
    await expect(quickSheet).toBeVisible();

    const iznos = quickSheet.getByLabel('Iznos');
    await e2eFill(iznos, '7,00', webKitFill);
    await expect(iznos).toHaveValue(/7/u);
    const merchantInput = quickSheet.getByPlaceholder('npr. Konzum');
    await e2eFill(merchantInput, merchant, webKitFill);
    await expect(merchantInput).toHaveValue(merchant);
    await clickDomButton(quickSheet.getByRole('button', { name: 'Spasi' }));

    await expect(page.getByText('Transakcija je dodata.')).toBeVisible();
    await expect(page.getByText(merchant).first()).toBeVisible({ timeout: 20_000 });
  } finally {
    await cleanupTestUser(session.userId);
  }
});
