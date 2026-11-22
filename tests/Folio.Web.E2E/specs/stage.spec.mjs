import { test, expect } from '@playwright/test';
import { openLibrary, importFiles, fixture, waitForReader, setPreferences } from './helpers.mjs';

// M4 gates. Headless browsers draw WebGL in software, which the fallback rules reject, so 3D checks run in stage test
// mode (?stageTest=1: software allowed, fixed clock, no idle motion). Chromium only: the WebGL path is the same code.
test.skip(({ browserName }) => browserName !== 'chromium', 'Stage checks run on Chromium');

async function readOnce(page, title) {
    await page.locator('.folio-book-card', { hasText: title }).locator('.folio-book-open').click();
    await waitForReader(page);
    await page.getByRole('button', { name: 'Back to library' }).click();
}

test('hero renders real covers in 3D and stops drawing when idle', async ({ page }, testInfo) => {
    const errors = await openLibrary(page, '/?stageTest=1');
    // An empty library in 3D is an empty shelf with an Add books action (LIB-7).
    await expect(page.locator('.folio-stage-shelf')).toContainText('Make room for a good book');
    await importFiles(page, ['01_single_column_book_300p.pdf', '02_two_column_paper.pdf'].map(fixture));
    await page.getByRole('button', { name: 'Dismiss import results' }).click();

    // Before anything is read, the hero shows the newest additions (LIB-1).
    await expect(page.locator('.folio-stage.is-visible')).toBeVisible();
    await expect(page.locator('.folio-stage-hero h1')).not.toBeEmpty();
    await expect.poll(() => page.evaluate(() => window.__folioStage?.stats.looks ?? 0), { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
    await expect.poll(() => page.evaluate(() => window.__folioStage.stats.textures)).toBeGreaterThanOrEqual(2); // cover + spine
    expect(await page.evaluate(() => window.__folioStage.stats.scene)).toBe('hero');
    await testInfo.attach('hero', { body: await page.screenshot(), contentType: 'image/png' });

    // Zero frames rendered after 2 s with no input (SPEC: rendering). Test mode advances a fixed step per frame, so on
    // software GL the scene first needs to finish settling in real time; then not a single frame may be drawn.
    await page.mouse.move(5, 5);
    await expect.poll(() => page.evaluate(() => window.__folioStage.settled), { timeout: 30_000 }).toBe(true);
    const before = await page.evaluate(() => window.__folioStage.stats.frames);
    await page.waitForTimeout(2000);
    expect(await page.evaluate(() => window.__folioStage.stats.frames)).toBe(before);

    // With flat pages the stage pauses under the reader (in the 3D book it keeps drawing the open book: reading.spec.mjs).
    await setPreferences(page, { ReadingView: 1 }, '/?stageTest=1');
    await expect(page.locator('.folio-stage-hero')).toBeVisible({ timeout: 60_000 });
    await page.locator('.folio-hero').getByRole('button', { name: /^Open / }).click();
    await waitForReader(page);
    await expect.poll(() => page.evaluate(() => window.__folioStage.stats.paused)).toBe(true);
    expect(errors).toEqual([]);
});

test('without WebGL the 2D library is used with no errors', async ({ page }) => {
    await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
            return type === 'webgl2' || type === 'webgl' ? null : original.call(this, type, ...rest);
        };
    });
    const errors = await openLibrary(page);
    await page.goto('/?stageTest=1');
    await expect(page.locator('.folio-library-page')).toBeVisible({ timeout: 90_000 });
    await importFiles(page, [fixture('01_single_column_book_300p.pdf')]);
    await page.getByRole('button', { name: 'Dismiss import results' }).click();
    await readOnce(page, 'Folio Classical Studies');
    await expect(page.locator('.folio-hero .folio-cssbook')).toBeVisible();
    await expect(page.locator('.folio-stage.is-visible')).toHaveCount(0);
    expect(await page.evaluate(() => typeof window.__folioStage)).toBe('undefined');
    expect(errors).toEqual([]);
});

test('a software renderer outside test mode falls back to 2D', async ({ page }) => {
    const errors = await openLibrary(page);
    await importFiles(page, [fixture('01_single_column_book_300p.pdf')]);
    await page.getByRole('button', { name: 'Dismiss import results' }).click();
    await readOnce(page, 'Folio Classical Studies');
    await expect(page.locator('.folio-hero .folio-cssbook')).toBeVisible();
    expect(errors).toEqual([]);
});
