import { expect, test } from '@playwright/test';
import {
  cleanupTestUser,
  clickDomButton,
  e2eFill,
  e2eWebKitPressFillProject,
  signInAsTestUser,
} from './helpers';

test('račun: kreiraj → uredi → obriši', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const isMobileSafari = testInfo.project.name === 'mobile-safari';
  const webKitFill = e2eWebKitPressFillProject(testInfo.project.name);

  const session = await signInAsTestUser(page);
  const baseName = `QA-${String(Date.now())}`;
  const editedName = `${baseName} uredjen`;

  try {
    await page.goto('/racuni/novi', { waitUntil: 'domcontentloaded' });
    await e2eFill(page.getByLabel('Naziv'), baseName, webKitFill);
    await expect(page.getByLabel('Naziv')).toHaveValue(baseName);
    const addBtn = page.getByRole('button', { name: 'Dodaj račun' });
    if (isMobileSafari) {
      await clickDomButton(addBtn);
    } else {
      await addBtn.click();
    }
    await expect(page.getByText('Račun je kreiran.')).toBeVisible({ timeout: 25_000 });
    await expect(page).toHaveURL(/\/racuni$/);
    await expect(page.getByText(baseName)).toBeVisible({ timeout: 25_000 });

    await page.getByRole('button', { name: 'Meni za račun' }).first().click();
    await page.getByRole('menuitem', { name: 'Uredi' }).click();
    await expect(page).toHaveURL(/\/racuni\/.+\/uredi$/);
    await e2eFill(page.getByLabel('Naziv'), editedName, webKitFill);
    await expect(page.getByLabel('Naziv')).toHaveValue(editedName);
    const saveBtn = page.getByRole('button', { name: 'Sačuvaj' });
    if (isMobileSafari) {
      await clickDomButton(saveBtn);
    } else {
      await saveBtn.click();
    }
    await expect(page.getByText('Račun je ažuriran.')).toBeVisible({ timeout: 25_000 });
    await expect(page).toHaveURL(/\/racuni$/);
    await expect(page.getByText(editedName)).toBeVisible({ timeout: 25_000 });

    await page.getByRole('button', { name: 'Meni za račun' }).first().click();
    await page.getByRole('menuitem', { name: 'Obriši' }).click();
    const confirmDelete = page
      .getByRole('alertdialog', { name: 'Obrisati račun?' })
      .getByRole('button', { name: 'Obriši' });
    if (isMobileSafari) {
      await clickDomButton(confirmDelete);
    } else {
      await confirmDelete.click();
    }

    await expect(page).toHaveURL(/\/racuni$/);
    await expect(page.getByText(editedName)).toHaveCount(0);
  } finally {
    await cleanupTestUser(session.userId);
  }
});
