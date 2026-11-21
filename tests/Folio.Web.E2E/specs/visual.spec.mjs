import { test, expect } from '@playwright/test';
import { openLibrary, seedLibrary, waitForReader, openFirstDetails } from './helpers.mjs';

// M3 gate: visual snapshots of library, details and reader chrome in light and dark. Chromium only: fonts are bundled,
// motion is off (no transitions), and the date on the details page is masked.
test.skip(({ browserName }) => browserName !== 'chromium', 'Visual baselines are recorded on Chromium');

for (const theme of ['dark', 'light']) {
    test(`library, details and reader chrome (${theme})`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
        await openLibrary(page);
        await page.evaluate(theme => localStorage.setItem('folio.preferences', JSON.stringify({ DarkMode: theme === 'dark', Motion: 3 })), theme);
        await page.reload();
        await expect(page.locator('.folio-library-page')).toBeVisible({ timeout: 90_000 });
        await seedLibrary(page);
        await page.evaluate(() => document.fonts.ready);
        await expect(page).toHaveScreenshot(`library-${theme}.png`, { maxDiffPixelRatio: 0.001 });

        await openFirstDetails(page);
        await expect(page.locator('.folio-details')).toBeVisible();
        await page.waitForTimeout(300);
        await expect(page).toHaveScreenshot(`details-${theme}.png`, { maxDiffPixelRatio: 0.001, mask: [page.locator('.folio-details-meta > div:nth-child(4) dd')] });

        await page.getByRole('button', { name: /^Read / }).click();
        await waitForReader(page);
        await expect(page.locator('.folio-reader-toolbar')).toHaveScreenshot(`reader-toolbar-${theme}.png`, { maxDiffPixelRatio: 0.001 });
    });
}
