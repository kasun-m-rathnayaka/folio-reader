import { test, expect } from '@playwright/test';
import { openLibrary, importFiles, fixture } from './helpers.mjs';

// M2 gate: import a fixture, open it, add a highlight, reload — the book and the highlight persist.
test('imported book and highlight survive a reload', async ({ page }) => {
    const errors = await openLibrary(page);
    await importFiles(page, [fixture('01_single_column_book_300p.pdf')]);
    await expect(page.locator('.folio-library-count')).toHaveText('1 book');

    await page.locator('.folio-book-open').first().click();
    await page.waitForFunction(() => window.folioReader?.engine?.pages?.[0]?.rendered, null, { timeout: 60_000 });

    // Select the first body paragraph and highlight it from the selection bar.
    await page.evaluate(() => {
        const span = Array.from(document.querySelectorAll('[data-page-index="0"] .textLayer span')).find(s => s.textContent.startsWith('In a world'));
        const range = document.createRange(); range.selectNodeContents(span);
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        span.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await page.getByTitle('Highlight Yellow').click();
    await expect(page.locator('[data-page-index="0"] .folio-annotation-item')).toHaveCount(1);
    await page.getByRole('button', { name: 'Back to library' }).first().click().catch(() => page.keyboard.press('Escape'));
    await expect(page.locator('.folio-library-page')).toBeVisible();

    await page.reload();
    await expect(page.locator('.folio-library-page')).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('.folio-library-count')).toHaveText('1 book');
    await page.locator('.folio-book-open').first().click();
    await page.waitForFunction(() => window.folioReader?.engine?.pages?.[0]?.rendered, null, { timeout: 60_000 });
    await expect(page.locator('[data-page-index="0"] .folio-annotation-item')).toHaveCount(1);
    expect(errors).toEqual([]);
});
