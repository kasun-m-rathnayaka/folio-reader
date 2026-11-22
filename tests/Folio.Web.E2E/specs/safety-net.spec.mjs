import { test, expect } from '@playwright/test';
import { openLibrary, pathOf } from './helpers.mjs';

// WP0: an exception in any page shows the recovery panel and the app keeps running.
test('a failing view shows the recovery panel and the library still works', async ({ page }) => {
    await openLibrary(page);
    await page.evaluate(() => window.Blazor.navigateTo('/__fault'));
    const panel = page.locator('.folio-error-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('This view could not be shown');
    // The rest of the chrome keeps working: the sidebar still navigates, and a new address gets a fresh try.
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await page.evaluate(() => window.Blazor.navigateTo('/__fault'));
    await expect(panel).toBeVisible();
    await page.getByRole('button', { name: 'Back to library' }).click();
    await expect.poll(() => pathOf(page)).toBe('/');
    await expect(page.locator('.folio-library-page, .folio-stage-page').first()).toBeVisible();
    await expect(page.locator('#blazor-error-ui')).toBeHidden();
});
