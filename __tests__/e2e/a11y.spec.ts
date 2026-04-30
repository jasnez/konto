import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';
import { signInAsTestUser, cleanupTestUser } from './helpers';

/**
 * A11y audit using axe-core on the post-mobile-redesign key pages.
 *
 * Mode: warning, not blocking — these tests fail only on `critical` or
 * `serious` impact violations. `moderate` and `minor` issues are logged
 * to test output for awareness but don't fail CI; they accumulate as
 * cleanup work for future polish PRs.
 *
 * Disabled rule: `color-contrast`. axe-core's color contrast detection
 * runs against rendered text colors, but our dark-mode tokens are
 * verified manually via the design system; running the contrast rule
 * in headless Playwright produces noisy false positives on Radix
 * components that delegate styling to portals.
 */

const KEY_PAGES = [
  { path: '/pocetna', label: 'Dashboard' },
  { path: '/transakcije', label: 'Transactions list' },
  { path: '/racuni', label: 'Accounts list' },
  { path: '/podesavanja', label: 'Settings' },
] as const;

test.describe('a11y — key pages (post-mobile-redesign)', () => {
  for (const { path, label } of KEY_PAGES) {
    test(`${label} (${path}) has no critical or serious a11y violations`, async ({ page }) => {
      const session = await signInAsTestUser(page);
      try {
        await page.goto(path, { waitUntil: 'networkidle' });
        await expect(page).toHaveURL(new RegExp(`${path}(?:\\?.*)?$`));

        // Wait briefly for any deferred client-side hydration or Suspense
        // boundaries to settle before axe runs.
        await page.waitForTimeout(500);

        const results = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();

        // Always log moderate/minor for visibility
        const moderate = results.violations.filter(
          (v) => v.impact === 'moderate' || v.impact === 'minor',
        );
        if (moderate.length > 0) {
          console.warn(
            `[a11y warning] ${path} — ${String(moderate.length)} moderate/minor:`,
            moderate.map((v) => `${v.id} (${String(v.impact)}, ${String(v.nodes.length)} nodes)`),
          );
        }

        // Hard-fail only on critical/serious
        const blocking = results.violations.filter(
          (v) => v.impact === 'critical' || v.impact === 'serious',
        );
        expect(
          blocking,
          `Critical/serious violations on ${path}:\n${blocking
            .map((v) => `  - ${v.id} (${String(v.impact)}): ${v.help}`)
            .join('\n')}`,
        ).toEqual([]);
      } finally {
        await cleanupTestUser(session.userId);
      }
    });
  }
});

test.describe('a11y — Quick-Add modal (post-mobile-redesign)', () => {
  test('Quick-Add open dialog has no critical or serious a11y violations', async ({ page }) => {
    const session = await signInAsTestUser(page);
    try {
      await page.goto('/pocetna', { waitUntil: 'networkidle' });

      // Open Quick-Add — keyboard shortcut Cmd/Ctrl+K is the most reliable
      // way (sidebar button accessible name varies with Plus icon rendering).
      await page.keyboard.press('ControlOrMeta+k');
      await page.waitForTimeout(500);

      const dialog = page.getByRole('dialog').first();
      await expect(dialog).toBeVisible();

      const results = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();

      const blocking = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(
        blocking,
        `Critical/serious violations in Quick-Add dialog:\n${blocking
          .map((v) => `  - ${v.id} (${String(v.impact)}): ${v.help}`)
          .join('\n')}`,
      ).toEqual([]);
    } finally {
      await cleanupTestUser(session.userId);
    }
  });
});

test.describe('a11y — Transaction filter sheet (post-mobile-redesign)', () => {
  test('filter sheet open has no critical or serious a11y violations', async ({ page }) => {
    const session = await signInAsTestUser(page);
    try {
      await page.goto('/transakcije', { waitUntil: 'networkidle' });

      // Open the bottom sheet via Filteri trigger
      const filtersBtn = page.getByRole('button', { name: /^Filteri/ });
      await filtersBtn.click();
      await page.waitForTimeout(500);

      const dialog = page.getByRole('dialog').first();
      await expect(dialog).toBeVisible();

      const results = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();

      const blocking = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(
        blocking,
        `Critical/serious violations in filter sheet:\n${blocking
          .map((v) => `  - ${v.id} (${String(v.impact)}): ${v.help}`)
          .join('\n')}`,
      ).toEqual([]);
    } finally {
      await cleanupTestUser(session.userId);
    }
  });
});
