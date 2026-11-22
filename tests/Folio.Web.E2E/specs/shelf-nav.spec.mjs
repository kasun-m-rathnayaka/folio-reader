import { test, expect } from '@playwright/test';
import { openLibrary, importFiles, fixture } from './helpers.mjs';

// WP2: one gesture or key press moves exactly one shelf, always with the vertical camera move, and the stage and the page
// always agree on which row is which. Runs in stage test mode on Chromium (see stage.spec.mjs).
test.skip(({ browserName }) => browserName !== 'chromium', 'Stage checks run on Chromium');

async function createShelf(page, name) {
    await page.getByRole('button', { name: 'Create shelf' }).click();
    await page.locator('#folio-shelf-name').fill(name);
    await page.locator('#folio-shelf-name').press('Enter');
    await expect(page.locator('.folio-shelves-list').getByRole('button', { name })).toBeVisible();
}

async function bookcase(page, shelves) {
    const errors = await openLibrary(page);
    await page.goto('/shelf?stageTest=1');
    await expect(page.locator('.folio-stage-shelf')).toBeVisible({ timeout: 90_000 });
    await importFiles(page, ['01_single_column_book_300p.pdf', '02_two_column_paper.pdf'].map(fixture));
    await page.getByRole('button', { name: 'Dismiss import results' }).click();
    for (const name of shelves) await createShelf(page, name);
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('.folio-stage-shelf h1')).toHaveText('All books');
    return errors;
}

const title = page => page.locator('.folio-stage-shelf h1');
const row = page => page.evaluate(() => window.__folioStage.stage.rowIndex);
const rowName = page => page.evaluate(() => { const s = window.__folioStage.stage; return s.rows[s.rowIndex]?.name; });

/** Records the camera height on every frame until stopped; the camera must only ever move one way during a step. */
const startSampling = async page => {
    await page.waitForFunction(() => window.__folioStage.settled);   // the previous move's tail must be over
    await page.evaluate(() => {
    const stage = window.__folioStage.stage; const samples = []; let on = true;
    const loop = () => { if (!on) return; if (stage.cameraState) samples.push(stage.cameraState.py); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    window.__stopSampling = () => { on = false; return samples; };
    });
};
const stopSampling = page => page.evaluate(() => window.__stopSampling());
function expectMonotonic(samples, direction) {
    expect(samples.length).toBeGreaterThan(3);
    for (let i = 1; i < samples.length; i++) expect((samples[i] - samples[i - 1]) * direction, `frame ${i}: ${samples[i - 1]} → ${samples[i]}`).toBeGreaterThanOrEqual(-1e-6);
}

async function swipe(page, sign) {
    await page.mouse.move(700, 450);
    // 30 wheel events over 1.2 s with decaying momentum, like a trackpad swipe.
    for (let i = 0; i < 30; i++) { await page.mouse.wheel(0, sign * Math.max(2, Math.round(60 * Math.exp(-i / 8)))); await page.waitForTimeout(40); }
}

test('a trackpad swipe moves exactly one shelf, and a sideways swipe moves none', async ({ page }) => {
    const errors = await bookcase(page, ['Design', 'Research', 'Archive']);
    await startSampling(page);
    await swipe(page, 1);
    await expect(title(page)).toHaveText('Design');
    await page.waitForTimeout(1500);                       // momentum is long over: no second step
    await expect(title(page)).toHaveText('Design');
    expect(await row(page)).toBe(1);
    expectMonotonic(await stopSampling(page), -1);          // going down the case, the camera only ever descends

    await page.mouse.move(700, 450);
    for (let i = 0; i < 30; i++) { await page.mouse.wheel(30, i % 5 === 0 ? 4 : 1); await page.waitForTimeout(30); }
    await page.waitForTimeout(800);
    await expect(title(page)).toHaveText('Design');         // a horizontal gesture never changes shelf

    await swipe(page, 1);                                    // a second, separate swipe: one more shelf
    await expect(title(page)).toHaveText('Research');
    await page.waitForTimeout(1200);
    await swipe(page, -1);
    await expect(title(page)).toHaveText('Design');
    await page.waitForTimeout(1200);
    expect(await row(page)).toBe(1);
    expect(errors).toEqual([]);
});

test('a held arrow key moves one shelf, and arrows step one shelf per press', async ({ page }) => {
    await bookcase(page, ['Design', 'Research', 'Archive']);
    await startSampling(page);
    await page.keyboard.down('ArrowDown');
    for (let i = 0; i < 12; i++) { await page.waitForTimeout(40); await page.keyboard.down('ArrowDown'); }   // auto-repeat
    await page.keyboard.up('ArrowDown');
    await expect(title(page)).toHaveText('Design');
    await page.waitForTimeout(1500);
    await expect(title(page)).toHaveText('Design');
    expectMonotonic(await stopSampling(page), -1);
    await page.keyboard.press('ArrowDown');
    await expect(title(page)).toHaveText('Research');
    await page.waitForTimeout(1200);
    await page.keyboard.press('ArrowUp');
    await expect(title(page)).toHaveText('Design');
});

test('keys 1–9 and the sidebar land on the right row with one continuous camera move', async ({ page }) => {
    await bookcase(page, ['Design', 'Research', 'Archive']);
    await startSampling(page);
    await page.keyboard.press('3');
    await expect(title(page)).toHaveText('Archive');
    expect(await rowName(page)).toBe('Archive');
    await page.waitForTimeout(1000);
    expectMonotonic(await stopSampling(page), -1);

    await startSampling(page);
    await page.locator('.folio-shelves-list').getByRole('button', { name: 'Design' }).click();
    await expect(title(page)).toHaveText('Design');
    expect(await rowName(page)).toBe('Design');
    await page.waitForTimeout(1000);
    expectMonotonic(await stopSampling(page), 1);           // back up the case
});

test('creating, renaming and reordering shelves keeps the stage and the page on the same row', async ({ page }) => {
    const errors = await bookcase(page, ['Design', 'Research']);
    // Create a shelf and switch to it at once.
    await createShelf(page, 'Zeta');
    await startSampling(page);
    await page.locator('.folio-shelves-list').getByRole('button', { name: 'Zeta' }).click();
    await expect(title(page)).toHaveText('Zeta');
    await expect.poll(() => rowName(page)).toBe('Zeta');
    expect(await row(page)).toBe(3);
    await page.waitForTimeout(1000);
    expectMonotonic(await stopSampling(page), -1);

    // Rename and reorder through Manage shelves, then visit every shelf: stage row name === page title each time.
    await page.getByRole('button', { name: 'Manage shelves' }).click();
    const zeta = page.locator('.folio-manage-shelf').nth(2);
    await zeta.locator('input').fill('Omega');
    await zeta.locator('input').press('Enter');                 // inline rename: Enter (or leaving the field) saves
    await expect(page.locator('.folio-shelves-list').getByRole('button', { name: 'Omega' })).toBeVisible();
    await page.locator('.folio-manage-shelf').nth(2).getByRole('button', { name: 'Move shelf up' }).click();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.locator('.folio-shelves-list').getByRole('button').nth(1)).toHaveText(/Omega/);
    for (const name of ['Omega', 'Design', 'Research', 'Omega']) {
        await page.locator('.folio-shelves-list').getByRole('button', { name }).click();
        await expect(title(page)).toHaveText(name);
        await expect.poll(() => rowName(page)).toBe(name);
    }
    await page.waitForTimeout(800);
    expect(errors).toEqual([]);
});
