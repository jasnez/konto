import { test, expect } from '@playwright/test';
import { cleanupTestUser, getMagicLinkActionForEmail, signInAsTestUser } from './helpers';

test('landing → prijava → email → Provjeri inbox, zatim magic link (admin)', async ({ page }) => {
  test.setTimeout(90_000);

  const nonce = `${String(Date.now())}-${String(Math.floor(Math.random() * 1_000_000))}`;
  const email = `qa-signin-ui-${nonce}@example.com`;

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'Prijavi se' }).click();
  await expect(page).toHaveURL(/\/prijava(?:\?.*)?$/);

  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Pošalji kod' }).click();
  // CardTitle is a styled `div`, not a semantic heading — assert on copy.
  await expect(page.getByText('Provjeri inbox', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('Poslali smo kod na', { exact: false })).toBeVisible();
  await expect(page.getByPlaceholder('123456')).toBeVisible({ timeout: 30_000 });

  const { actionUrl, userId } = await getMagicLinkActionForEmail(email);
  try {
    await page.goto(actionUrl, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/pocetna/u, { timeout: 30_000 });
  } finally {
    await cleanupTestUser(userId);
  }
});

test('test user session + odjava', async ({ page }) => {
  test.setTimeout(60_000);

  const session = await signInAsTestUser(page);
  try {
    await expect(
      page.locator('main').getByRole('heading', { name: 'Računi' }).first(),
    ).toBeVisible();

    await page.goto('/podesavanja');
    await expect(page.getByText('Prijavljen si kao')).toBeVisible();
    await page.getByRole('button', { name: 'Odjavi se' }).click();
    await expect(page).toHaveURL(/\/prijava(?:\?.*)?$/);
  } finally {
    await cleanupTestUser(session.userId);
  }
});
