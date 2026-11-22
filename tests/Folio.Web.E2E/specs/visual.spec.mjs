import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { openLibrary, seedLibrary, waitForReader, openFirstBook } from './helpers.mjs';

// M3 gate: visual snapshots of the library and reader chrome in light and dark. Chromium only: fonts are bundled,
// motion is off (no transitions).
test.skip(({ browserName }) => browserName !== 'chromium', 'Visual baselines are recorded on Chromium');

// In CI, a mismatch prints the actual image (base64) so it can be reviewed and committed as the approved baseline
// without artifact downloads (DECISIONS D-016).
// Soft: every snapshot in the test is compared (and printed) even when an earlier one differs.
async function snapshot(target, name, testInfo, options) {
    const failuresBefore = testInfo.errors.length;
    await expect.soft(target).toHaveScreenshot(name, options);
    const actual = testInfo.outputPath(name.replace('.png', '-actual.png'));
    if (testInfo.errors.length > failuresBefore && process.env.CI && existsSync(actual))
        console.log(`[visual-actual] ${name} ${(await readFile(actual)).toString('base64')}`);
}

for (const theme of ['dark', 'light']) {
    test(`library and reader chrome (${theme})`, async ({ page }, testInfo) => {
        await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
        await openLibrary(page);
        await page.evaluate(theme => localStorage.setItem('folio.preferences', JSON.stringify({ DarkMode: theme === 'dark', Motion: 3, BackupReminderAt: new Date().toISOString() })), theme);
        await page.reload();
        await expect(page.locator('.folio-library-page')).toBeVisible({ timeout: 90_000 });
        await seedLibrary(page);
        await page.evaluate(() => document.fonts.ready);
        // The chrome that does not depend on which books were imported (their generated covers differ per book id): the sidebar and
        // the header. A modest tolerance absorbs anti-aliasing differences between machines while a moved or restyled element fails.
        await snapshot(page.locator('.folio-sidebar'), `sidebar-${theme}.png`, testInfo, { maxDiffPixelRatio: 0.02 });
        await snapshot(page.locator('.folio-app-header'), `header-${theme}.png`, testInfo, { maxDiffPixelRatio: 0.02 });

        await openFirstBook(page);
        await waitForReader(page);
        await snapshot(page.locator('.folio-reader-toolbar'), `reader-toolbar-${theme}.png`, testInfo, { maxDiffPixelRatio: 0.02 });
    });
}
