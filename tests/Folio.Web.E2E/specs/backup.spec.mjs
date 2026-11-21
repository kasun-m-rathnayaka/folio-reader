import { test, expect } from '@playwright/test';
import { openLibrary, importFiles, fixture, waitForReader } from './helpers.mjs';

// M7 gate: a backup restores books, highlights, bookmarks and positions into an empty browser profile (WEB-4).
test('backup round trip restores books, highlights, bookmarks and positions', async ({ browser }, testInfo) => {
    const first = await browser.newContext();
    const page = await first.newPage();
    await openLibrary(page);
    await importFiles(page, [fixture('01_single_column_book_300p.pdf')]);
    await page.locator('.folio-book-open').first().click();
    await waitForReader(page);

    // A highlight on page 1, a bookmark on page 12, and a reading position on page 12.
    await page.evaluate(() => {
        const span = Array.from(document.querySelectorAll('[data-page-index="0"] .textLayer span')).find(s => s.textContent.startsWith('In a world'));
        const range = document.createRange(); range.selectNodeContents(span);
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        span.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await page.getByTitle('Highlight Yellow').click();
    await expect(page.locator('[data-page-index="0"] .folio-annotation-item')).toHaveCount(1);
    await page.evaluate(() => window.folioReader.goToPage(11));
    await expect(page.locator('.folio-page-indicator')).toContainText('12');
    await page.keyboard.press('Control+d');
    await expect(page.locator('[data-page-index="11"] .folio-dog-ear.active')).toHaveCount(1);
    await page.getByRole('button', { name: 'Back to library' }).click();
    await expect(page.locator('.folio-library-page')).toBeVisible();

    await page.getByRole('button', { name: 'Settings' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export backup/i }).click();
    const archive = testInfo.outputPath('folio-backup.zip');
    await (await download).saveAs(archive);
    await first.close();

    // A fresh profile: empty storage.
    const second = await browser.newContext();
    const restored = await second.newPage();
    await openLibrary(restored);
    await expect(restored.locator('.folio-library-count, .folio-stage-empty')).toBeVisible();
    await restored.getByRole('button', { name: 'Settings' }).click();
    await restored.getByRole('button', { name: /Restore from backup/i }).click();
    const chooser = restored.waitForEvent('filechooser');
    await restored.getByRole('button', { name: 'Choose backup' }).click();
    await (await chooser).setFiles(archive);
    await expect(restored.locator('.folio-library-page, .folio-stage-page')).toBeVisible({ timeout: 90_000 });
    await expect(restored.locator('.folio-book-card')).toHaveCount(1, { timeout: 30_000 });

    await restored.locator('.folio-book-open').first().click();
    await waitForReader(restored);
    await expect(restored.locator('.folio-page-indicator')).toContainText('12');                       // position
    await expect(restored.locator('[data-page-index="11"] .folio-dog-ear.active')).toHaveCount(1);     // bookmark
    await restored.evaluate(() => window.folioReader.goToPage(0));
    await expect(restored.locator('[data-page-index="0"] .folio-annotation-item')).toHaveCount(1);     // highlight
    await second.close();
});
