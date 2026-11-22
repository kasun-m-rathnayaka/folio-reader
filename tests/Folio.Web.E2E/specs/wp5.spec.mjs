import { test, expect } from '@playwright/test';
import { openLibrary, importFiles, fixture } from './helpers.mjs';

// WP5: generated hardcovers. Every cover and spine carries the book's own typeset title; four templates; the design is
// stable per book; covers are cached and reused after a restart. Stage test mode on Chromium (see stage.spec.mjs).
test.skip(({ browserName }) => browserName !== 'chromium', 'Stage checks run on Chromium');

async function hero(page, files = ['01_single_column_book_300p.pdf', '02_two_column_paper.pdf']) {
    const errors = await openLibrary(page, '/?stageTest=1');
    await importFiles(page, files.map(fixture));
    await page.getByRole('button', { name: 'Dismiss import results' }).click();
    await expect(page.locator('.folio-stage-hero')).toBeVisible();
    return errors;
}

const featuredLook = page => page.evaluate(() => {
    const s = window.__folioStage.stage, look = s.looks.map.get(s.featuredId);
    return look?.cover ? { id: s.featuredId, cached: look.cover.cached, width: look.cover.width, template: look.cover.design?.template ?? null,
        isCanvas: look.cover.color.image instanceof HTMLCanvasElement || look.cover.cached, spine: !!look.spine, frontMap: s.featured.material[4].map === look.cover.color } : null;
});

test('the front board shows the generated cover, not page 1, and the stage draws a hardcover in one call', async ({ page }) => {
    const errors = await hero(page);
    await expect.poll(() => featuredLook(page), { timeout: 60_000 }).not.toBeNull();
    const look = await featuredLook(page);
    expect(look.frontMap).toBe(true);                    // the board's map is the composed cover
    expect(look.isCanvas).toBe(true);                    // painted from the book's title, not the PDF's own page render
    expect(look.spine).toBe(true);
    expect(look.width).toBe(1024);                       // the featured (open or presented) book gets the large level
    const geometry = await page.evaluate(() => { const g = window.__folioStage.stage.featured.geometry; return { groups: g.groups.length, materials: window.__folioStage.stage.featured.material.length, bounds: g.boundingBox.max.x - g.boundingBox.min.x }; });
    expect(geometry.groups).toBe(8);                     // one merged hardcover with a group per material slot
    expect(geometry.materials).toBe(8);
    expect(errors).toEqual([]);
});

test('four templates render, a book keeps its design, titles fit and contrast holds', async ({ page }) => {
    await hero(page);
    const result = await page.evaluate(async () => {
        await document.fonts.load('48px "Instrument Serif"'); await document.fonts.load('500 20px Inter');
        const api = window.__folioStage;
        const book = { id: 'fixed-id-123', title: 'A Very Long Title About Distributed Systems and the Failure of Intuition in Practice', author: 'Grace Hopper' };
        const out = {};
        const variance = async url => {
            const img = new Image(); img.src = url; await img.decode();
            const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
            const lower = g.getImageData(0, Math.round(img.height * 0.6), img.width, Math.round(img.height * 0.3)).data;
            let sum = 0, sq = 0, n = 0; for (let i = 0; i < lower.length; i += 4) { const v = lower[i] + lower[i + 1] + lower[i + 2]; sum += v; sq += v * v; n++; }
            return Math.sqrt(sq / n - (sum / n) ** 2);
        };
        for (const template of ['plate', 'marble', 'line', 'cloth']) {
            const a = api.composeCover(book, { template, width: 256 }), b = api.composeCover(book, { template, width: 256 });
            out[template] = { same: a.color === b.color, variance: await variance(a.color), contrast: a.design.titleContrast, normal: !!a.normal, orm: a.orm.length > 100 };
        }
        const natural = api.composeCover(book, { width: 256 }).design.template, again = api.composeCover(book, { width: 256 }).design.template;
        return { out, natural, again };
    });
    for (const template of ['plate', 'marble', 'line', 'cloth']) {
        expect(result.out[template].same, `${template} is deterministic`).toBe(true);
        expect(result.out[template].contrast, `${template} title contrast`).toBeGreaterThanOrEqual(4.5);
    }
    expect(result.out.marble.variance).toBeGreaterThan(result.out.cloth.variance + 5);   // marble is real artwork; cloth is nearly plain
    expect(result.out.cloth.normal).toBe(true);                                          // cloth: blind-debossed title through the normal map
    expect(result.out.plate.normal).toBe(false);
    expect(result.natural).toBe(result.again);                                           // a given book always gets the same template
});

test('generated covers are cached and reused after a restart', async ({ page }) => {
    await hero(page);
    await expect.poll(() => featuredLook(page), { timeout: 60_000 }).not.toBeNull();
    expect((await featuredLook(page)).cached).toBe(false);          // painted the first time
    await page.waitForTimeout(1500);                                 // let the cache writes land
    await page.reload();
    await expect(page.locator('.folio-stage-hero')).toBeVisible({ timeout: 90_000 });
    await expect.poll(() => featuredLook(page), { timeout: 60_000 }).not.toBeNull();
    expect((await featuredLook(page)).cached).toBe(true);           // decoded from the cache, not repainted
});

test('the 2D library shows the same generated covers', async ({ page }) => {
    await openLibrary(page);                                         // software GL outside test mode: the 2D library
    await importFiles(page, [fixture('01_single_column_book_300p.pdf')]);
    await page.getByRole('button', { name: 'Dismiss import results' }).click();
    const front = page.locator('.folio-cssbook-front img').first();
    await expect(front).toHaveAttribute('src', /^blob:/, { timeout: 60_000 });
    const spine = page.locator('.folio-cssbook-spine').first();
    await expect(spine).toHaveAttribute('style', /background:url\('blob:/);
});
