import { test, expect } from '@playwright/test';
import { openLibrary, seedLibrary, waitForReader, pathOf, openFirstDetails } from './helpers.mjs';

// M3 gate: Back and Forward work across all routes on the web; deep links load directly.
test('back and forward walk every route', async ({ page }) => {
    await openLibrary(page);
    await seedLibrary(page);
    const visited = [];
    const go = async (action, expectedPath, ready) => { await action(); await expect.poll(() => pathOf(page)).toMatch(expectedPath); await expect(ready).toBeVisible(); visited.push(pathOf(page)); };

    visited.push(pathOf(page));
    await go(() => page.getByRole('button', { name: 'Want to read' }).click(), /^\/shelf\?status=WantToRead$/, page.locator('.folio-library-page'));
    await go(() => page.getByRole('button', { name: 'Trash' }).click(), /^\/trash$/, page.getByRole('heading', { name: 'Trash', exact: true }));
    await go(() => page.getByRole('button', { name: 'Settings' }).click(), /^\/settings$/, page.getByRole('heading', { name: 'Settings', exact: true }));
    await go(() => page.getByRole('button', { name: 'Library' }).click(), /^\/$/, page.locator('.folio-library-page'));
    await go(() => openFirstDetails(page), /^\/book\/[0-9a-f-]{36}$/, page.locator('.folio-details'));
    await go(() => page.getByRole('button', { name: /^Read / }).click(), /^\/book\/[0-9a-f-]{36}\/read$/, page.locator('.folio-reader'));
    await waitForReader(page);
    await go(() => page.getByRole('button', { name: 'Back to library' }).click(), /^\/book\/[0-9a-f-]{36}$/, page.locator('.folio-details'));

    // Walk back to the start, then forward again, checking each address renders its view.
    for (let i = visited.length - 2; i >= 0; i--) { await page.goBack(); await expect.poll(() => pathOf(page)).toBe(visited[i]); }
    await expect(page.locator('.folio-library-page')).toBeVisible();
    for (let i = 1; i < visited.length; i++) { await page.goForward(); await expect.poll(() => pathOf(page)).toBe(visited[i]); }
    await expect(page.locator('.folio-details')).toBeVisible();

    // Deep link with a page number opens the reader on that page after a reload.
    await page.goto('/');
    await expect(page.locator('.folio-library-page')).toBeVisible({ timeout: 90_000 });
    const id = await page.locator('.folio-book-card', { hasText: 'Folio Classical Studies' }).getAttribute('data-book-id');
    await page.goto(`/book/${id}/read?page=12`);
    await waitForReader(page);
    await expect(page.locator('.folio-page-indicator')).toContainText('12');
});
