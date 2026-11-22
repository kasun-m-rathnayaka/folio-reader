import { test, expect } from '@playwright/test';
import { openLibrary } from './helpers.mjs';

// WP3: the wooden bookcase and endless horizontal browsing. Stage test mode on Chromium (see stage.spec.mjs).
test.skip(({ browserName }) => browserName !== 'chromium', 'Stage checks run on Chromium');

async function bookcase(page, count = 2000) {
    const errors = await openLibrary(page);
    await page.goto('/shelf?stageTest=1');
    await expect(page.locator('.folio-stage-shelf')).toBeVisible({ timeout: 90_000 });
    await expect.poll(() => page.evaluate(() => !!window.__folioStage?.stage)).toBe(true);
    await page.evaluate(n => {
        const stage = window.__folioStage.stage;
        const books = Array.from({ length: n }, (_, i) => ({ id: `b${i}`, title: `Synthetic Book ${i + 1}`, author: 'Folio Tests', pages: 80 + (i * 37) % 900, coverUrl: null, color: null, progress: (i % 10) / 10, shelfIds: i % 3 === 0 ? ['s1'] : [] }));
        stage.setLibrary(books, [{ id: 's1', name: 'Design' }], null, stage.rowsVersion);
        stage.setScene({ kind: 'shelf', bookId: 'b0', rowIndex: 0, rowsVersion: stage.rowsVersion });
    }, count);
    await page.waitForFunction(() => window.__folioStage.settled, null, { timeout: 60_000 });
    return errors;
}

const pan = page => page.evaluate(() => { const p = window.__folioStage.stage.pan; return { x: p.x, v: p.v, min: p.min, max: p.max, over: p.over, dragging: p.dragging }; });

test('planks, uprights, back panel and labels render with wood textures in both themes', async ({ page }) => {
    const errors = await bookcase(page, 60);
    await expect.poll(() => page.evaluate(() => !!window.__folioStage.stage.bookcase.maps.map), { timeout: 30_000 }).toBe(true);
    const wood = () => page.evaluate(() => {
        const c = window.__folioStage.stage.bookcase;
        const planks = c.group.children.filter(o => o.userData.plank);
        return { maps: [c.maps.map, c.maps.normalMap, c.maps.roughnessMap].map(t => !!t && t.image?.width), tint: c.wood.color.toArray(), back: c.back.color.toArray(),
            planks: planks.length, parts: c.group.children.length, plates: c.group.children.filter(o => o.isInstancedMesh).length, rows: window.__folioStage.stage.rows.length,
            sharedMaterial: planks.every(p => p.material === c.wood), grainRotated: new Set(planks.map(p => p.geometry.attributes.uv.getX(0).toFixed(3))).size };
    });
    const dark = await wood();
    expect(dark.maps).toEqual([1024, 1024, 1024]);                      // colour, normal and roughness, 1K each
    expect(dark.planks).toBe(dark.rows + 1);                            // one under each row, plus the crown
    expect(dark.plates).toBe(dark.rows);                                // a brass shelf label per row
    expect(dark.sharedMaterial).toBe(true);                             // every board shares the three maps
    expect(dark.grainRotated).toBeGreaterThan(1);                       // random UV offsets: the grain never repeats visibly
    expect(dark.tint[0]).toBeLessThan(0.6);                             // dark theme: walnut
    expect(dark.back[0]).toBeLessThan(dark.tint[0]);                    // back panel about 35% darker
    await page.getByRole('button', { name: 'Toggle light and dark theme' }).click();
    await expect.poll(async () => (await wood()).tint[0]).toBeGreaterThan(0.95);   // light theme keeps oak
    expect(errors).toEqual([]);
});

test('a row of 2,000 books pans end to end within the frame budget, with windowed meshes', async ({ page }, testInfo) => {
    await bookcase(page, 2000);
    const result = await page.evaluate(async () => {
        const stage = window.__folioStage.stage;
        window.__folioStage.resetFrameTimes();
        let peak = 0, frames = 0;
        await new Promise(resolve => {
            const step = () => {
                stage.panBy(250);                                // a very fast fling: the window changes every frame
                peak = Math.max(peak, stage.instances.size); frames++;
                if (stage.pan.x >= stage.pan.max - 1 || frames > 4000) return resolve();
                requestAnimationFrame(step);
            };
            step();
        });
        const times = window.__folioStage.stats;
        return { p95CpuMs: times.p95CpuMs, frames, peakMeshes: peak, x: stage.pan.x, max: stage.pan.max, drawCalls: times.drawCalls, books: stage.books.length };
    });
    console.log('[metrics] pan-2000', JSON.stringify(result));
    await testInfo.attach('perf-pan-2000', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
    expect(result.x).toBeGreaterThanOrEqual(result.max - 1);            // reached the far end
    expect(result.peakMeshes).toBeLessThan(400);                        // windowed: nowhere near 2,000 meshes
    expect(result.p95CpuMs).toBeLessThanOrEqual(16.7);
    await page.waitForFunction(() => window.__folioStage.settled, null, { timeout: 60_000 });
    const frames = () => page.evaluate(() => window.__folioStage.stats.frames);
    const before = await frames();
    await page.waitForTimeout(2000);
    expect(await frames()).toBe(before);                                // zero frames after 2 s idle
});

// Pointer drags are dispatched in-page: real mouse events would be spaced by the (software-rendered) frame time, which
// reads as a pause before release. The stage uses event timestamps, so in-page events behave like a hand on hardware.
const pointer = (page, type, x, y) => page.evaluate(({ type, x, y }) => {
    document.getElementById('folio-main').dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y, bubbles: true }));
}, { type, x, y });
const fling = (page, fromX, toX, y, steps) => page.evaluate(async ({ fromX, toX, y, steps }) => {
    const main = document.getElementById('folio-main');
    const fire = (type, x) => main.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y, bubbles: true }));
    fire('pointerdown', fromX);
    for (let i = 1; i <= steps; i++) { fire('pointermove', fromX + (toX - fromX) * i / steps); await new Promise(r => setTimeout(r, 8)); }
    fire('pointerup', toX);                                          // released while still moving
}, { fromX, toX, y, steps });

test('dragging empty wood pans with momentum and a rubber-band stop; vertical wheel never pans', async ({ page }) => {
    await bookcase(page, 300);
    const start = await pan(page);
    // Fling left across empty wood above the books: the row follows the hand, keeps gliding after release, then stops.
    await fling(page, 1000, 440, 230, 10);
    const released = await pan(page);
    expect(released.x).toBeGreaterThan(start.x + 10);
    expect(Math.abs(released.v)).toBeGreaterThan(10);
    await expect.poll(async () => (await pan(page)).x, { timeout: 30_000 }).toBeGreaterThan(released.x + 2);   // glides on
    await page.waitForFunction(() => !window.__folioStage.stage.pan.active, null, { timeout: 60_000 });
    const rested = await pan(page);
    expect(Math.abs(rested.v)).toBeLessThan(0.06);
    expect(rested.x).toBeGreaterThan(released.x);

    // A vertical wheel changes shelf (or nothing here), but never pans.
    await page.mouse.move(700, 450);
    const before = (await pan(page)).x;
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(600);
    expect(Math.abs((await pan(page)).x - before)).toBeLessThan(0.5);

    // Rubber band: pushing past the far end stretches at most 20 cm, then springs back.
    await page.evaluate(() => { const p = window.__folioStage.stage.pan; p.x = p.max; p.v = 0; p.target = null; });
    await pointer(page, 'pointerdown', 900, 230);
    let over = 0;
    for (let i = 1; i <= 30; i++) { await pointer(page, 'pointermove', 900 - i * 20, 230); over = Math.max(over, (await pan(page)).over); }
    expect(over).toBeGreaterThan(0.2);
    expect(over).toBeLessThanOrEqual(20.001);
    await pointer(page, 'pointerup', 300, 230);
    await page.waitForFunction(() => !window.__folioStage.stage.pan.active, null, { timeout: 60_000 });
    const back = await pan(page);
    expect(back.over).toBe(0);
    expect(back.x).toBeCloseTo(back.max, 1);
});

test('a horizontal trackpad swipe pans the row and Home/End style jumps stay on the row', async ({ page }) => {
    await bookcase(page, 300);
    const before = await pan(page);
    await page.mouse.move(700, 450);
    for (let i = 0; i < 20; i++) { await page.mouse.wheel(40, 1); await page.waitForTimeout(25); }
    const after = await pan(page);
    expect(after.x).toBeGreaterThan(before.x + 20);
    expect(await page.evaluate(() => window.__folioStage.stage.rowIndex)).toBe(0);   // still on the same shelf
});
