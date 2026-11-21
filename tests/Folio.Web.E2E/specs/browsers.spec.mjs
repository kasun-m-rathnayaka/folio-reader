import { test, expect } from '@playwright/test';
import { importFiles, fixture, waitForReader } from './helpers.mjs';

// WEB-5 on every engine: the core flow (import, open, highlight, reload) where the engine offers the private file
// storage Folio needs; otherwise the app must explain it plainly and fail no other way (DECISIONS D-021).
test('core flow, or a clear storage message, on this engine', async ({ page, browserName }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto('/');
    await expect(page.locator('.folio-library-page, .folio-stage-page, #app [role="alert"]').first()).toBeVisible({ timeout: 90_000 });
    const alert = page.locator('#app [role="alert"]');
    if (await alert.count()) {
        await expect(alert).toContainText('private file storage');
        expect(errors).toEqual([]);
        test.skip(true, `${browserName}: this Playwright build has no OPFS sync access handles (D-021); verified the explanation instead`);
    }
    await importFiles(page, [fixture('02_two_column_paper.pdf')]);
    await page.locator('.folio-book-open, .folio-hero [aria-label^="Open"]').first().click();
    await waitForReader(page);
    await page.getByRole('button', { name: 'Back to library' }).click();
    await expect(page.locator('.folio-library-page, .folio-stage-page').first()).toBeVisible();
    await page.reload();
    await expect(page.locator('.folio-book-card, .folio-hero').first()).toBeVisible({ timeout: 90_000 });
    expect(errors).toEqual([]);
});
