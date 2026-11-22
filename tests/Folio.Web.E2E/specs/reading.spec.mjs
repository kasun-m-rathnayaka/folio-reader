import { test, expect } from '@playwright/test';
import { openLibrary, importFiles, fixture, pathOf, setPreferences } from './helpers.mjs';

// WP6: 3D reading. Stage test mode on Chromium: the stage clock advances 1/60 s per frame, so durations are counted in frames
// (software GL stretches real time). Real-time smoothness is checked on hardware (PROGRESS-V2).
test.skip(({ browserName }) => browserName !== 'chromium', 'Stage checks run on Chromium');

async function library(page) {
    const errors = await openLibrary(page, '/?stageTest=1');
    await importFiles(page, [fixture('01_single_column_book_300p.pdf')]);
    await page.getByRole('button', { name: 'Dismiss import results' }).click();
    await expect(page.locator('.folio-stage-hero')).toBeVisible();
    await page.waitForFunction(() => window.__folioStage.settled, null, { timeout: 60_000 });
    return errors;
}

const bookId = page => page.locator('.folio-hero [data-book-id]').first().getAttribute('data-book-id');
const reading = page => page.evaluate(() => window.__folioStage.stats.reading);
const frames = page => page.evaluate(() => window.__folioStage.stats.frames);
const interactive = page => page.waitForFunction(() => window.__folioStage.stats.reading?.interactive, null, { timeout: 120_000 });

async function openAt(page, pageNumber) {
    const id = await bookId(page);
    await page.evaluate(([id, n]) => window.Blazor.navigateTo(`/book/${id}/read?page=${n}`), [id, pageNumber]);
    return id;
}

test('open → riffle → spread completes in about 1.6 s on the stage clock, with the saved page on the spread', async ({ page }, testInfo) => {
    const errors = await library(page);
    const f0 = await frames(page);
    await openAt(page, 120);
    await page.waitForFunction(() => window.__folioStage.stats.reading?.phase === 'opening', null, { timeout: 60_000 });
    const started = await frames(page);
    await interactive(page);
    const simulated = ((await frames(page)) - started) / 60;
    const state = await reading(page);
    console.log('[metrics] read-open', JSON.stringify({ simulatedSeconds: +simulated.toFixed(2), spread: state.spread }));
    await testInfo.attach('open-sequence', { body: JSON.stringify({ simulatedSeconds: simulated, state }, null, 2), contentType: 'application/json' });
    expect(simulated).toBeGreaterThan(1.2); expect(simulated).toBeLessThan(2.6);       // ≈ 1.6 s: forward, cover, lay open, riffle, settle
    expect(state.spread).toBe(60);                                                     // page 120 is on spread 60
    await expect(page.locator('.folio-spread-count')).toHaveText('120 OF 300');
    await expect(page.locator('.folio-spread-toolbar')).toBeVisible();
    expect(await frames(page)).toBeGreaterThan(f0);
    expect(errors.filter(e => !/GL Driver/.test(e))).toEqual([]);
});

test('any key during the sequence skips straight to the spread', async ({ page }) => {
    await library(page);
    await openAt(page, 200);
    await page.waitForFunction(() => window.__folioStage.stats.reading?.phase === 'opening', null, { timeout: 60_000 });
    await page.keyboard.press('Space');
    const before = await frames(page);
    await interactive(page);
    expect(((await frames(page)) - before) / 60).toBeLessThan(0.8);                    // far quicker than the full sequence
    await page.waitForFunction(() => window.__folioStage.stats.reading?.spread === 100, null, { timeout: 60_000 });   // lands on the page once the document arrives
});

test('arrow keys turn one page with a curl, the address follows, and a turn stays within the frame budget', async ({ page }) => {
    await library(page);
    await openAt(page, 120);
    await interactive(page);
    await page.waitForFunction(() => document.querySelector('.folio-page-wrapper[style*="fixed"]'), null, { timeout: 60_000 });
    await page.evaluate(() => window.__folioStage.resetFrameTimes());
    const before = await frames(page);
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => window.__folioStage.stats.reading?.phase === 'turning' || window.__folioStage.stats.reading?.spread === 61, null, { timeout: 30_000 });
    expect((await reading(page)).flights <= 1).toBe(true);                             // a neighbour spread is one curl, not a riffle
    await page.waitForFunction(() => window.__folioStage.stats.reading?.interactive && window.__folioStage.stats.reading.spread === 61, null, { timeout: 60_000 });
    const turnSeconds = ((await frames(page)) - before) / 60;
    expect(turnSeconds).toBeGreaterThan(0.3); expect(turnSeconds).toBeLessThan(0.8);   // about 400 ms
    await expect(page.locator('.folio-spread-count')).toHaveText('122 OF 300');
    await expect.poll(() => pathOf(page)).toMatch(/\/read\?page=122$/);                // the address updates on every turn
    const p95 = await page.evaluate(() => window.__folioStage.stats.p95CpuMs);
    console.log('[metrics] turn', JSON.stringify({ turnSeconds, p95CpuMs: p95 }));
    expect(p95).toBeLessThanOrEqual(16.7);
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => window.__folioStage.stats.reading?.interactive && window.__folioStage.stats.reading.spread === 60, null, { timeout: 60_000 });
    await expect.poll(() => pathOf(page)).toMatch(/\/read\?page=120$/);
});

test('Home and End riffle to the first and last pages; a find result on another page turns there', async ({ page }) => {
    await library(page);
    await openAt(page, 120);
    await interactive(page);
    await page.keyboard.press('End');
    await page.waitForFunction(() => window.__folioStage.stats.reading?.interactive && window.__folioStage.stats.reading.spread === 150, null, { timeout: 120_000 });
    await page.keyboard.press('Home');
    await page.waitForFunction(() => window.__folioStage.stats.reading?.interactive && window.__folioStage.stats.reading.spread === 0, null, { timeout: 120_000 });
    await expect(page.locator('.folio-spread-count')).toHaveText('1 OF 300');
    // Find in book: "Paragraph 15.1" is on page 15 (index 14), which is on spread 7 (pages 14 and 15).
    await page.keyboard.press('Control+f');
    await page.locator('.folio-find-bar input').fill('Paragraph 15.1');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__folioStage.stats.reading?.interactive && window.__folioStage.stats.reading.spread === 7, null, { timeout: 120_000 });
});

test('the text layer sits within 2 px of the page corners; selecting text and highlighting persists across a reload', async ({ page }) => {
    await library(page);
    const id = await openAt(page, 120);
    await interactive(page);
    await page.waitForFunction(() => [...document.querySelectorAll('.folio-page-wrapper')].filter(w => w.style.position === 'fixed' && w.querySelector('.folio-text-layer span')).length === 2, null, { timeout: 90_000 });
    const corners = await page.evaluate(() => {
        const r = window.__folioStage.stage.reading, pages = r.measure();
        const dom = [...document.querySelectorAll('.folio-page-wrapper')].filter(w => w.style.display === 'block').map(w => ({ index: +w.dataset.pageIndex, rect: w.getBoundingClientRect() }));
        const diff = (a, b) => Math.max(Math.abs(a.x - b.left), Math.abs(a.y - b.top), Math.abs(a.x + a.width - b.right), Math.abs(a.y + a.height - b.bottom));
        return [pages.left, pages.right].map(p => ({ index: p.index, error: diff(p.rect, dom.find(d => d.index === p.index).rect) }));
    });
    expect(corners).toHaveLength(2);
    for (const c of corners) expect(c.error, `page ${c.index}`).toBeLessThanOrEqual(2);

    // Select a line of text on the right page and highlight it.
    await page.evaluate(() => {
        const wrapper = [...document.querySelectorAll('.folio-page-wrapper')].find(w => w.style.display === 'block' && w.dataset.pageIndex === '120');
        const span = wrapper.querySelector('.folio-text-layer span');
        const range = document.createRange(); range.selectNodeContents(span);
        const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
        wrapper.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        document.dispatchEvent(new Event('selectionchange'));
    });
    const quickBar = page.locator('.folio-selection-quick-bar');
    await expect(quickBar).toBeVisible({ timeout: 30_000 });
    await quickBar.locator('button[title="Highlight Yellow"]').click();
    await expect(page.locator('.folio-page-wrapper .folio-annotation-item').first()).toBeAttached({ timeout: 30_000 });
    await page.waitForTimeout(500);

    await page.goto(`/book/${id}/read?page=120&stageTest=1`);                          // reload: the book opens again with its highlight
    await page.waitForFunction(() => window.__folioStage?.stats.reading?.interactive, null, { timeout: 120_000 });
    await expect(page.locator('.folio-page-wrapper .folio-annotation-item').first()).toBeAttached({ timeout: 60_000 });
});

test('Z crossfades to the flat reader at the same page, Esc returns to the spread, and Esc then closes the book to its place', async ({ page }) => {
    await library(page);
    await openAt(page, 40);
    await interactive(page);
    await expect(page.locator('.folio-reader.reading-3d')).toHaveCount(1);
    await page.keyboard.press('z');
    await expect(page.locator('.folio-reader.reading-3d')).toHaveCount(0);               // flat pages
    await page.waitForFunction(() => window.folioReader?.engine?.layoutMode !== 'spread' && window.folioReader.engine.pages.some(p => p.rendered), null, { timeout: 60_000 });
    await expect(page.locator('.folio-page-indicator')).toContainText('40');            // the same page
    await page.keyboard.press('Escape');                                                 // back to the spread
    await expect(page.locator('.folio-reader.reading-3d')).toHaveCount(1);
    await expect(page.locator('.folio-spread-toolbar')).toBeVisible();
    await page.waitForFunction(() => [...document.querySelectorAll('.folio-page-wrapper')].filter(w => w.style.position === 'fixed' && w.style.display === 'block').length >= 1, null, { timeout: 60_000 });
    await page.keyboard.press('Escape');                                                 // and now it closes
    await expect.poll(() => pathOf(page), { timeout: 60_000 }).toBe('/');
    await page.waitForFunction(() => window.__folioStage.stats.reading === null, null, { timeout: 60_000 });
    await expect(page.locator('.folio-stage-hero')).toBeVisible();
});

test('reduced motion: no riffle, the book still opens as a spread on the right page', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await library(page);
    await openAt(page, 120);
    const f0 = await frames(page);
    await interactive(page);
    expect(((await frames(page)) - f0) / 60).toBeLessThan(0.8);                          // no timeline to wait for
    expect((await reading(page)).spread).toBe(60);
});

test('with Reading view set to Flat pages the book opens in the flat reader', async ({ page }) => {
    await library(page);
    await setPreferences(page, { ReadingView: 1 }, '/?stageTest=1');
    await openAt(page, 12);
    await page.waitForFunction(() => window.folioReader?.engine?.pages?.some(p => p.rendered), null, { timeout: 90_000 });
    await expect(page.locator('.folio-reader.reading-3d')).toHaveCount(0);
    expect(await reading(page)).toBeNull();
    await expect(page.locator('.folio-page-indicator')).toContainText('12');
});
