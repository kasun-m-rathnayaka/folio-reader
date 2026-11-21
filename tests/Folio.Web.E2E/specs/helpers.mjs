import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';

export const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), '../../../fixtures/pdf');
export const fixture = name => resolve(fixtures, name);

/** Opens the app on a fresh origin storage and waits until the library is ready. */
export async function openLibrary(page) {
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/');
    await expect(page.locator('.folio-library-page')).toBeVisible({ timeout: 90_000 });
    return errors;
}

export async function importFiles(page, files) {
    const chooser = page.waitForEvent('filechooser');
    await page.locator('header .folio-primary-btn', { hasText: 'Add books' }).click();
    await (await chooser).setFiles(files);
    await expect(page.locator('.folio-import-panel')).toContainText('Import complete', { timeout: 120_000 });
}

export async function openBook(page, title) {
    await page.locator('.folio-book-card, .folio-book-list-row', { hasText: title }).first().click();
    await expect(page.locator('.folio-reader')).toBeVisible();
    await page.waitForFunction(() => window.folioReader?.engine?.pages?.[0]?.rendered === true || window.folioReader?.engine?.pages?.some(p => p.rendered), null, { timeout: 60_000 });
}
