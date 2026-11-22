import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';

export const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), '../../../fixtures/pdf');
export const fixture = name => resolve(fixtures, name);

/** Opens the app on a fresh origin storage and waits until the library is ready. */
export async function openLibrary(page, url = '/') {
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const logs = [];
    page.on('console', message => logs.push(`${message.type()}: ${message.text()}`));
    await page.goto(url);
    const ready = page.locator('.folio-library-page, .folio-stage-page, #app [role="alert"]').first();
    try { await ready.waitFor({ timeout: 90_000 }); }
    catch (error) { throw new Error(`Library did not open. Page: ${(await page.locator('#app').innerText().catch(() => '?')).slice(0, 400)}\nConsole:\n${logs.slice(-25).join('\n')}`); }
    if (await page.locator('#app [role="alert"]').count())
        throw new Error(`Library failed to open: ${await page.locator('#app [role="alert"]').first().innerText()}\nConsole:\n${logs.slice(-25).join('\n')}`);
    return errors;
}

export async function importFiles(page, files) {
    const chooser = page.waitForEvent('filechooser');
    await page.locator('header').getByRole('button', { name: 'Add books' }).click();
    await (await chooser).setFiles(files);
    await expect(page.locator('.folio-import-panel')).toContainText('Import complete', { timeout: 120_000 });
}

export async function openBook(page, title) {
    await page.locator('.folio-book-card, .folio-book-list-row', { hasText: title }).first().click();
    await expect(page.locator('.folio-reader')).toBeVisible();
    await page.waitForFunction(() => window.folioReader?.engine?.pages?.[0]?.rendered === true || window.folioReader?.engine?.pages?.some(p => p.rendered), null, { timeout: 60_000 });
}

/** A small, deterministic library: three fixtures, toast dismissed. */
export async function seedLibrary(page) {
    await importFiles(page, ['01_single_column_book_300p.pdf', '02_two_column_paper.pdf', '03_textbook_figures_tables.pdf'].map(fixture));
    await page.getByRole('button', { name: 'Dismiss import results' }).click();
}

export async function waitForReader(page) {
    await page.waitForFunction(() => window.folioReader?.engine?.pages?.some(p => p.rendered), null, { timeout: 60_000 });
}

export const pathOf = page => new URL(page.url()).pathname + new URL(page.url()).search;

/** Focuses the first book card and opens its details from the bottom bar's VIEW DETAILS. */
export async function openFirstDetails(page) {
    await page.locator('.folio-book-card').first().hover();
    await page.locator('.folio-bottom-bar').getByRole('button', { name: /^View details of / }).click();
    await page.locator('.folio-details').waitFor();
}
