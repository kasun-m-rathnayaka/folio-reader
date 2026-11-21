import { test, expect } from '@playwright/test';
import { openLibrary, importFiles, fixture } from './helpers.mjs';

// M2 gate: library search returns a known phrase from the 300-page fixture. Indexing time is recorded (SPEC M2 step 3).
test('library search finds a phrase inside the 300-page fixture', async ({ page }, testInfo) => {
    await openLibrary(page);
    await importFiles(page, [fixture('01_single_column_book_300p.pdf')]);
    const started = Date.now();
    await page.locator('#folio-library-search').fill('Paragraph 15.1');
    await page.locator('#folio-library-search').press('Enter');
    const result = page.locator('.folio-search-result').first();
    await expect(result).toBeVisible({ timeout: 170_000 });
    const indexMs = Date.now() - started;
    await expect(result).toContainText('Page 15');
    testInfo.annotations.push({ type: 'index-300-pages-ms', description: String(indexMs) });
    console.log(`[metrics] ${testInfo.project.name}: indexed and searched 300 pages in ${indexMs} ms`);
});
