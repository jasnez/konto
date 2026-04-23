import { expect, test } from '@playwright/test';
import { cleanupTestUser, signInAsTestUser } from './helpers';

test('accounts create, edit, delete', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const isMobile = testInfo.project.name === 'mobile-safari';

  const session = await signInAsTestUser(page);
  const accountName = `QA-${String(Date.now())}`;

  try {
    await page.goto('/racuni');
    await page.getByRole('link', { name: 'Dodaj račun' }).first().click();
    await expect(page).toHaveURL(/\/racuni\/novi$/);

    await page.getByLabel('Naziv').fill(accountName);
    if (isMobile) {
      await page.keyboard.press('Enter');
    } else {
      await page.getByRole('button', { name: 'Dodaj račun' }).click();
    }
    await expect(page.getByText('Račun je kreiran.')).toBeVisible({ timeout: 20_000 });
    if (isMobile) {
      await expect(page).toHaveURL(/\/racuni$/);
      await expect(page.getByText(accountName)).toBeVisible({ timeout: 20_000 });
      return;
    }

    await page.goto('/racuni');
    await expect(page.getByText(accountName)).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: 'Meni za račun' }).first().click();
    await page.getByRole('menuitem', { name: 'Obriši' }).click();
    await page.getByRole('button', { name: 'Obriši' }).click();

    await expect(page).toHaveURL(/\/racuni$/);
    await expect(page.getByText(accountName)).toHaveCount(0);
  } finally {
    await cleanupTestUser(session.userId);
  }
});
