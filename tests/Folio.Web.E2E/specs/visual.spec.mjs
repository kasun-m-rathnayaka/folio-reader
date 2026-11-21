import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { openLibrary, seedLibrary, waitForReader, openFirstDetails } from './helpers.mjs';

// M3 gate: visual snapshots of library, details and reader chrome in light and dark. Chromium only: fonts are bundled,
// motion is off (no transitions), and the date on the details page is masked.
test.skip(({ browserName }) => browserName !== 'chromium', 'Visual baselines are recorded on Chromium');

// In CI, a mismatch prints the actual image (base64) so it can be reviewed and committed as the approved baseline
// without artifact downloads (DECISIONS D-016).
async function snapshot(target, name, testInfo, options) {
    try { await expect(target).toHaveScreenshot(name, options); }
    catch (error) {
        const actual = testInfo.outputPath(name.replace('.png', '-actual.png'));
        if (process.env.CI && existsSync(actual)) console.log(`[visual-actual] ${name} ${(await readFile(actual)).toString('base64')}`);
        throw error;
    }
}

for (const theme of ['dark', 'light']) {
    test(`library, details and reader chrome (${theme})`, async ({ page }, testInfo) => {
        await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
        await openLibrary(page);
        await page.evaluate(theme => localStorage.setItem('folio.preferences', JSON.stringify({ DarkMode: theme === 'dark', Motion: 3, BackupReminderAt: new Date().toISOString() })), theme);
        await page.reload();
        await expect(page.locator('.folio-library-page')).toBeVisible({ timeout: 90_000 });
        await seedLibrary(page);
        await page.evaluate(() => document.fonts.ready);
        await snapshot(page, `library-${theme}.png`, testInfo, { maxDiffPixelRatio: 0.001 });

        await openFirstDetails(page);
        await expect(page.locator('.folio-details')).toBeVisible();
        await page.waitForTimeout(300);
        await snapshot(page, `details-${theme}.png`, testInfo, { maxDiffPixelRatio: 0.001, mask: [page.locator('.folio-details-meta > div:nth-child(4) dd')] });

        await page.getByRole('button', { name: /^Read / }).click();
        await waitForReader(page);
        await snapshot(page.locator('.folio-reader-toolbar'), `reader-toolbar-${theme}.png`, testInfo, { maxDiffPixelRatio: 0.001 });
    });
}
