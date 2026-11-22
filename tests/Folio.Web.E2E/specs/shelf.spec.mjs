import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { openLibrary, importFiles, fixture, waitForReader, pathOf, openBookMenu } from './helpers.mjs';

// M5 gates, in stage test mode on Chromium (see stage.spec.mjs).
test.skip(({ browserName }) => browserName !== 'chromium', 'Stage checks run on Chromium');

async function createShelf(page, name) {
    await page.getByRole('button', { name: 'Create shelf' }).click();
    await page.locator('#folio-shelf-name').fill(name);
    await page.locator('#folio-shelf-name').press('Enter');
    await expect(page.locator('.folio-shelves-list').getByRole('button', { name })).toBeVisible();
}

async function putOnShelf(page, bookId, shelf) {
    // The old details address redirects to the shelf with the book in focus; its book menu holds Move to shelf.
    await page.evaluate(url => window.Blazor.navigateTo(url), `/book/${bookId}`);
    await expect(page.locator(`#folio-book-${bookId.replaceAll('-', '')}.is-focused`)).toBeVisible();
    await openBookMenu(page);
    await page.locator('.mud-popover-open .mud-menu-item', { hasText: shelf }).click();
    await expect(page.locator('.mud-popover-open')).toHaveCount(0);
}

async function collectRow(page, count) {
    const names = new Set(); let last = null;
    const read = async () => {
        await page.waitForTimeout(80);
        const label = await page.evaluate(() => document.activeElement?.closest('.folio-focus-layer') ? document.activeElement.getAttribute('aria-label') : null);
        if (label) { last = label.split(',')[0]; names.add(last); }
    };
    for (let i = 0; i < count + 1; i++) { await page.keyboard.press('ArrowLeft'); await read(); }    // start from the first book
    for (let i = 0; i < count + 1; i++) { await page.keyboard.press('ArrowRight'); await read(); }
    return [...[...names].filter(n => n !== last), last];   // the book focused last comes last
}

test('keyboard only: reach every book on three shelves, open one, return', async ({ page }) => {
    const errors = await openLibrary(page);
    await page.goto('/shelf?stageTest=1');
    await expect(page.locator('.folio-stage-shelf')).toBeVisible({ timeout: 90_000 });
    await importFiles(page, ['01_single_column_book_300p.pdf', '02_two_column_paper.pdf', '03_textbook_figures_tables.pdf', '08_math_and_code.pdf'].map(fixture));
    await page.getByRole('button', { name: 'Dismiss import results' }).click();
    const ids = await page.locator('.folio-focus-book').evaluateAll(buttons => buttons.map(b => b.id.replace('folio-book-', '')).map(h => `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`));
    expect(ids).toHaveLength(4);
    await createShelf(page, 'Design');
    await createShelf(page, 'Research');
    await putOnShelf(page, ids[0], 'Design');
    await putOnShelf(page, ids[1], 'Design');
    await putOnShelf(page, ids[2], 'Research');
    await putOnShelf(page, ids[3], 'Research');
    await page.evaluate(() => window.Blazor.navigateTo('/shelf'));
    await expect(page.locator('.folio-stage-shelf h1')).toHaveText('All books');
    await page.locator('body').click({ position: { x: 5, y: 5 } }); // start from the page, as a keyboard user would after load

    const all = await collectRow(page, 4);
    expect(all).toHaveLength(4);
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.folio-stage-shelf h1')).toHaveText('Design');
    expect(await collectRow(page, 2)).toHaveLength(2);
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.folio-stage-shelf h1')).toHaveText('Research');
    const research = await collectRow(page, 2);
    expect(research).toHaveLength(2);
    const shelfPath = pathOf(page);

    await page.keyboard.press('Enter');
    await waitForReader(page);
    await expect(page.locator('.folio-reader-title')).toHaveText(research.at(-1));
    await page.keyboard.press('Escape');
    await expect.poll(() => pathOf(page)).toBe(shelfPath);
    await expect(page.locator('.folio-stage-shelf h1')).toHaveText('Research');
    await expect(page.locator('.folio-stage-shelf [role="status"]')).toContainText('Shelf: Research, 2 books');
    expect(errors).toEqual([]);
});

test('300 books: frame time on the shelf scene', async ({ page }, testInfo) => {
    await openLibrary(page);
    await page.goto('/shelf?stageTest=1');
    await expect(page.locator('.folio-stage-shelf')).toBeVisible({ timeout: 90_000 });
    await expect.poll(() => page.evaluate(() => !!window.__folioStage)).toBe(true);
    const result = await page.evaluate(async () => {
        const stage = window.__folioStage.stage;
        const shelves = [{ id: 's1', name: 'One' }, { id: 's2', name: 'Two' }];
        const books = Array.from({ length: 300 }, (_, i) => ({ id: `b${i}`, title: `Synthetic Book ${i + 1}`, author: 'Folio Tests', pages: 80 + (i * 37) % 900, coverUrl: null, color: null, progress: (i % 10) / 10, shelfIds: i % 3 === 0 ? ['s1'] : i % 3 === 1 ? ['s2'] : [] }));
        stage.setLibrary(books, shelves);
        stage.setScene({ kind: 'shelf', bookId: 'b150' });
        await new Promise(r => setTimeout(r, 1500));
        const p95FrameMs = await window.__folioStage.measure(5000);
        return { p95FrameMs, ...window.__folioStage.stats };
    });
    const metrics = { books: 300, p95FrameMs: result.p95FrameMs, p95CpuMs: result.p95CpuMs, drawCalls: result.drawCalls, textures: result.textures, renderer: result.renderer, looks: result.looks };
    console.log('[metrics] shelf-300', JSON.stringify(metrics));
    await mkdir('../../.artifacts/web-e2e', { recursive: true });
    await writeFile('../../.artifacts/web-e2e/perf-shelf-300.json', JSON.stringify(metrics, null, 2));
    await testInfo.attach('perf-shelf-300', { body: JSON.stringify(metrics, null, 2), contentType: 'application/json' });
    // CI has no GPU (software GL), so the gate is the main-thread cost per frame; the 60 fps target on real hardware is
    // confirmed at M8 (SPEC: testing). Texture memory stays bounded by the LRU.
    expect(result.p95CpuMs).toBeLessThanOrEqual(16.7);
    expect(result.looks).toBeLessThanOrEqual(120);
});
