import { test, expect } from '@playwright/test';
import { openLibrary, importFiles, fixture, waitForReader } from './helpers.mjs';

// WP4: hover lifts a spine; resting 250 ms on a book, a click or an arrow key presents it; neighbours part; the page tints and
// the title marquee follows. Stage test mode on Chromium (see stage.spec.mjs).
test.skip(({ browserName }) => browserName !== 'chromium', 'Stage checks run on Chromium');

async function realShelf(page) {
    const errors = await openLibrary(page);
    await page.goto('/shelf?stageTest=1');
    await expect(page.locator('.folio-stage-shelf')).toBeVisible({ timeout: 90_000 });
    await importFiles(page, ['01_single_column_book_300p.pdf', '02_two_column_paper.pdf', '03_textbook_figures_tables.pdf', '08_math_and_code.pdf'].map(fixture));
    await page.getByRole('button', { name: 'Dismiss import results' }).click();
    await page.waitForFunction(() => window.__folioStage.settled, null, { timeout: 60_000 });
    return errors;
}

async function syntheticShelf(page, count = 12) {
    await openLibrary(page);
    await page.goto('/shelf?stageTest=1');
    await expect(page.locator('.folio-stage-shelf')).toBeVisible({ timeout: 90_000 });
    await expect.poll(() => page.evaluate(() => !!window.__folioStage?.stage)).toBe(true);
    await page.evaluate(n => {
        const stage = window.__folioStage.stage;
        const books = Array.from({ length: n }, (_, i) => ({ id: `b${i}`, title: `Synthetic Book ${i + 1}`, author: 'Folio Tests', pages: [107, 800, 300, 540, 160, 733, 400, 120, 640, 240, 800, 107][i % 12], coverUrl: null, color: ['#7A2E3B', '#2E5C7A', '#3B7A2E'][i % 3], progress: 0, shelfIds: [] }));
        stage.setLibrary(books, [], null, stage.rowsVersion);
        stage.setScene({ kind: 'shelf', bookId: null, rowIndex: 0, rowsVersion: stage.rowsVersion });
    }, count);
    await page.waitForFunction(() => window.__folioStage.settled, null, { timeout: 60_000 });
}

const state = (page, id) => page.evaluate(id => { const s = window.__folioStage.stage; const m = s.instances.get(`0:${id}`); const st = m.userData.state; return { x: st.x, y: st.y, z: st.z, ry: st.ry, rx: st.rx }; }, id);
const frames = page => page.evaluate(() => window.__folioStage.stats.frames);

test('a hovered spine lifts 8 mm within about 250 ms on the stage clock, and a plain hover does not present', async ({ page }) => {
    await syntheticShelf(page);
    const rest = await state(page, 'b3');
    const f0 = await frames(page);
    await page.evaluate(() => { const s = window.__folioStage.stage; s.setHover('b3'); clearTimeout(s.dwell); });      // hover only: no dwell here
    await page.waitForFunction(() => { const s = window.__folioStage.stage, st = s.instances.get('0:b3').userData.state; return st.y >= s.instances.get('0:b3').userData.state.y && Math.abs(st.y - (-70 + 10.5 - 10 + 0.8)) < 0.04; }, null, { timeout: 30_000 });
    const simulated = ((await frames(page)) - f0) / 60;                                   // test mode advances 1/60 s per frame
    const lifted = await state(page, 'b3');
    expect(lifted.y - rest.y).toBeCloseTo(0.8, 1);
    expect(lifted.z - rest.z).toBeCloseTo(0.4, 1);
    expect(simulated).toBeGreaterThan(0.1); expect(simulated).toBeLessThan(0.4);          // ≈ 250 ms to settle
    expect(Math.abs(lifted.ry - rest.ry)).toBeLessThan(1e-6);                              // still spine-out
    expect(await page.evaluate(() => window.__folioStage.stage.focusId)).not.toBe('b3');
});

test('presenting turns a book to face the camera, parts its neighbours without intersection, recentres the row and tints the page', async ({ page }) => {
    await syntheticShelf(page, 40);                       // a row wider than the view, so it can recentre
    await page.evaluate(() => { const s = window.__folioStage.stage; s.focusBook('b9'); });
    await page.waitForFunction(() => window.__folioStage.settled, null, { timeout: 60_000 });
    await page.waitForFunction(() => { const s = window.__folioStage.stage; return s.pan.target == null && !s.pan.active; }, null, { timeout: 60_000 });
    const result = await page.evaluate(() => {
        const s = window.__folioStage.stage, layout = s.rows[0].layout;
        const edges = layout.books.map((b, i) => { const m = s.instances.get(`0:${b.id}`); if (!m) return null; const st = m.userData.state, t = m.userData.thickness;
            return b.id === 'b9' ? { id: b.id, lo: st.x - 7, hi: st.x + 7, ry: st.ry, z: st.z, rx: st.rx } : { id: b.id, lo: st.x - t / 2, hi: st.x + t / 2, ry: st.ry }; });
        const present = edges.find(e => e?.id === 'b9');
        let minGap = Infinity;
        for (let i = 0; i + 1 < edges.length; i++) if (edges[i] && edges[i + 1]) minGap = Math.min(minGap, edges[i + 1].lo - edges[i].hi);
        const bg = s.world.background, target = s.backgroundTarget;
        return { present, minGap, panX: s.pan.x, focusX: layout.positions.get('b9').x, tint: target ? target.getHex() : null, background: bg.getHex(), base: s.baseBackground.getHex(),
            others: edges.filter(e => e && e.id !== 'b9').every(e => Math.abs(e.ry - Math.PI / 2) < 1e-3) };
    });
    expect(result.present.ry).toBeCloseTo(0, 2);                       // facing the camera
    expect(result.present.z).toBeCloseTo(9, 1);                        // 9 cm forward
    expect(result.present.rx).toBeCloseTo(-2 * Math.PI / 180, 2);      // leaning back 2°
    expect(result.minGap).toBeGreaterThanOrEqual(0.34);                // no two books intersect (3.5 mm between spines, 1 cm of air at the cover)
    expect(result.others).toBe(true);                                  // everything else is back to spine-out
    expect(Math.abs(result.panX - result.focusX)).toBeLessThan(0.1);   // the row recentred on the presented book
    expect(result.tint).not.toBeNull();                                // the contrast-checked accent tint follows the presented book
    expect(result.background).toBe(result.tint);                       // and the page arrived at it
    expect(result.background).not.toBe(result.base);
});

test('resting on a book for 250 ms presents it, a click presents, and clicking the presented book opens it', async ({ page }) => {
    const errors = await realShelf(page);
    const ids = await page.locator('.folio-focus-book').evaluateAll(buttons => buttons.map(b => b.id.replace('folio-book-', '')));
    const dashed = h => `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    const target = dashed(ids[2]);
    const at = id => page.evaluate(id => window.__folioStage.stage.screenPoint(id), id);
    const focused = () => page.evaluate(() => window.__folioStage.stage.focusId);

    const first = await focused();
    expect(first).not.toBe(target);
    const p = await at(target);
    await page.mouse.move(p.x - 40, p.y - 120); await page.mouse.move(p.x, p.y, { steps: 4 });
    await expect.poll(focused, { timeout: 15_000 }).toBe(target);                       // dwell present
    await expect(page.locator('.folio-bottom-bar .folio-bottom-book')).toHaveText(await page.locator(`#folio-book-${target.replaceAll('-', '')}`).textContent());

    const other = dashed(ids[0]);
    await page.waitForFunction(() => window.__folioStage.settled, null, { timeout: 60_000 });
    const q = await at(other);
    await page.mouse.click(q.x, q.y);                                                    // click presents
    await expect.poll(focused, { timeout: 15_000 }).toBe(other);
    await expect(page.locator('.folio-reader')).toHaveCount(0);
    await page.waitForFunction(() => window.__folioStage.settled, null, { timeout: 60_000 });
    const r = await at(other);
    await page.mouse.click(r.x, r.y);                                                    // clicking the presented book opens it
    await waitForReader(page);
    expect(errors).toEqual([]);
});

test('the title marquee follows the presented book', async ({ page }) => {
    await realShelf(page);
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('ArrowRight');
    const current = page.locator('.folio-shelf-marquee .is-current');
    await expect(current).toHaveCount(1);
    const first = await current.textContent();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => current.textContent()).not.toBe(first);
    await expect(page.locator('.folio-bottom-bar .folio-bottom-book')).toHaveText((await current.textContent()).trim());
    await expect(page.locator('.folio-shelf-marquee')).toHaveAttribute('aria-hidden', 'true');
});

test('reduced motion: books do not lift and presenting snaps without easing', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await syntheticShelf(page);
    const rest = await state(page, 'b3');
    await page.evaluate(() => { const s = window.__folioStage.stage; s.setHover('b3'); clearTimeout(s.dwell); });
    await page.waitForTimeout(300);
    expect((await state(page, 'b3')).y).toBeCloseTo(rest.y, 3);
    await page.evaluate(() => window.__folioStage.stage.focusBook('b3'));
    await expect.poll(async () => (await state(page, 'b3')).ry, { timeout: 15_000 }).toBeCloseTo(0, 3);
    expect((await state(page, 'b3')).z).toBeCloseTo(9, 2);
});
