import { test, expect } from '@playwright/test';
import { openLibrary, importFiles, fixture, waitForReader } from './helpers.mjs';

// M7 gate: after the first visit the app loads and opens a stored book with the network disabled (WEB-1).
test('offline: the app loads and opens a stored book without a network', async ({ page, context }) => {
    await openLibrary(page);
    // The published service worker caches every asset on install; wait until it controls the page.
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 60_000 }).toBe(true);
    await expect(page.locator('.folio-library-page, .folio-stage-page')).toBeVisible({ timeout: 90_000 });
    await importFiles(page, [fixture('02_two_column_paper.pdf')]);

    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('.folio-library-page, .folio-stage-page')).toBeVisible({ timeout: 90_000 });
    await page.locator('.folio-book-open, .folio-hero [aria-label^="Open"]').first().click();
    await waitForReader(page);
    await expect(page.locator('.folio-reader-title')).toContainText('Non-Destructive');
    await context.setOffline(false);
});
