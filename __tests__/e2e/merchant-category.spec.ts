import { expect, test } from '@playwright/test';
import { cleanupTestUser, signInAsTestUser } from './helpers';

test('category and merchant core flow', async ({ page }) => {
  test.setTimeout(120_000);

  const session = await signInAsTestUser(page);
  const suffix = String(Date.now()).slice(-6);
  const categoryName = `QA Cat ${suffix}`;
  const categoryRenamed = `${categoryName} uredjena`;
  const merchantName = `QA Merchant ${suffix}`;
  const merchantRenamed = `${merchantName} Updated`;

  try {
    await page.goto('/kategorije');
    await page.getByRole('button', { name: 'Dodaj kategoriju' }).click();
    await page.getByLabel('Naziv').fill(categoryName);
    await page.keyboard.press('Tab');
    await page.getByRole('button', { name: 'Sačuvaj' }).click();
    await expect(page.getByText(categoryName)).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: categoryName }).click();
    await page.getByLabel('Naziv').fill(categoryRenamed);
    await page.getByRole('button', { name: 'Sačuvaj' }).click();
    await expect(page.getByText(categoryRenamed)).toBeVisible();

    const categoryRow = page.locator('li', { hasText: categoryRenamed }).first();
    await categoryRow.getByRole('button', { name: 'Meni za kategoriju' }).click();
    await page.getByRole('menuitem', { name: 'Obriši' }).click();
    await page.getByRole('button', { name: 'Obriši' }).click();
    await expect(page.getByText(categoryRenamed)).toHaveCount(0);

    await page.goto('/merchants');
    await expect(page.getByRole('heading', { name: 'Prodavači' }).first()).toBeVisible();
    await expect(page.getByText('Ne mogu učitati prodavače.')).toHaveCount(0);
    await page.getByRole('button', { name: 'Dodaj merchant' }).first().click();
    await page.getByLabel('Kanonsko ime').fill(merchantName);
    await page.getByLabel('Prikazno ime').fill(merchantName);
    await page.getByRole('button', { name: 'Sačuvaj' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: merchantName }).first()).toBeVisible({
      timeout: 20_000,
    });

    const merchantRow = page.locator('li', { hasText: merchantName }).first();
    await merchantRow.getByRole('button', { name: 'Meni' }).click();
    await page.getByRole('menuitem', { name: 'Uredi' }).click();
    await page.getByLabel('Prikazno ime').fill(merchantRenamed);
    await page.getByRole('button', { name: 'Sačuvaj' }).click();
    await expect(
      page.getByRole('listitem').filter({ hasText: merchantRenamed }).first(),
    ).toBeVisible({ timeout: 20_000 });

    const editedMerchantRow = page.locator('li', { hasText: merchantRenamed }).first();
    await editedMerchantRow.getByRole('button', { name: 'Meni' }).click();
    await page.getByRole('menuitem', { name: 'Obriši' }).click();
    await page.getByRole('button', { name: 'Obriši' }).click();
    await expect(page.getByText(merchantRenamed)).toHaveCount(0);
  } finally {
    await cleanupTestUser(session.userId);
  }
});
