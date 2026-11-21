import { test, expect } from '@playwright/test';
import { openLibrary, importFiles, fixture, waitForReader, pathOf } from './helpers.mjs';

// M6 gates, in stage test mode on Chromium. Durations are measured on the stage clock (test mode advances it by a fixed
// 1/60 s per frame, so software GL does not stretch them); real-time speed is confirmed on hardware at M8.
test.skip(({ browserName }) => browserName !== 'chromium', 'Stage checks run on Chromium');

async function library(page) {
    const errors = await openLibrary(page, '/?stageTest=1');
    await importFiles(page, ['01_single_column_book_300p.pdf', '02_two_column_paper.pdf'].map(fixture));
    await page.getByRole('button', { name: 'Dismiss import results' }).click();
    await expect(page.locator('.folio-stage-hero')).toBeVisible();
    return errors;
}

async function expectHandoff(page, testInfo, name) {
    await waitForReader(page);
    await expect.poll(() => page.evaluate(() => window.__folioStage.stats.handoff?.cornerError ?? null), { timeout: 30_000 }).not.toBeNull();
    const handoff = await page.evaluate(() => window.__folioStage.stats.handoff);
    // Reader accepts input once the crossfade ends and the library chrome no longer covers it.
    await page.waitForFunction(() => !/stage-(opening|handoff)/.test(document.querySelector('.folio-app').className));
    const readyAfterMs = await page.evaluate(at => performance.now() - at, handoff.at);
    const metrics = { name, cornerErrorPx: handoff.cornerError, openStageMs: handoff.elapsedMs, readerReadyAfterMs: Math.round(readyAfterMs), target: handoff.target, projected: handoff.projected };
    console.log('[metrics] open', JSON.stringify(metrics));
    await testInfo.attach(`handoff-${name}`, { body: JSON.stringify(metrics, null, 2), contentType: 'application/json' });
    expect(handoff.cornerError).toBeLessThanOrEqual(2);      // 3D page and reader page within 2 px at the corners
    expect(handoff.elapsedMs).toBeLessThanOrEqual(900);      // open completes in ≤ 900 ms
    return { handoff, readyAfterMs };
}

test('opening from details lands on the reader page and closing returns', async ({ page }, testInfo) => {
    const errors = await library(page);
    await page.locator('.folio-hero').getByRole('button', { name: /^View details of / }).click();
    await expect(page.locator('.folio-details.is-3d')).toBeVisible();
    const details = pathOf(page);
    await page.keyboard.press('Enter');
    await expectHandoff(page, testInfo, 'details');
    // The reader takes input after the 120 ms crossfade. Its real-time latency is recorded above; on software GL the main
    // thread is saturated, so the 300 ms target is confirmed on hardware at M8 (DECISIONS D-020).
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.folio-page-indicator')).toContainText('2');

    await page.keyboard.press('Escape');
    await expect.poll(() => pathOf(page)).toBe(details);
    await expect(page.locator('.folio-details')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.querySelector('.folio-app').className.includes('stage-closing'))).toBe(false);
    expect(errors).toEqual([]);
});

test('a search result opens with the book transition on its page', async ({ page }, testInfo) => {
    await library(page);
    await page.locator('#folio-library-search').fill('Paragraph 15.1');
    await page.locator('#folio-library-search').press('Enter');
    await page.locator('.folio-search-result').first().click({ timeout: 120_000 });
    await expectHandoff(page, testInfo, 'search');
    await expect(page.locator('.folio-page-indicator')).toContainText('15');
});

test('reduced motion skips the 3D opening', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await library(page);
    await page.locator('.folio-hero').getByRole('button', { name: /^Open / }).click();
    await waitForReader(page);
    expect(await page.evaluate(() => window.__folioStage.stats.handoff)).toBeNull();
});
