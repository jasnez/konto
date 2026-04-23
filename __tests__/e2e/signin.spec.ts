import { test, expect } from '@playwright/test';
import { cleanupTestUser, signInAsTestUser } from './helpers';

test('signin smoke + signout flow', async ({ page }) => {
  test.setTimeout(60_000);

  await page.goto('/prijava', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Prijavi se')).toBeVisible();

  const session = await signInAsTestUser(page);
  try {
    await expect(page.getByText('Ovo je privremena početna stranica.')).toBeVisible();

    await page.goto('/podesavanja');
    await expect(page.getByText('Prijavljen si kao')).toBeVisible();
    await page.getByRole('button', { name: 'Odjavi se' }).click();
    await expect(page).toHaveURL(/\/prijava(?:\?.*)?$/);
  } finally {
    await cleanupTestUser(session.userId);
  }
});
