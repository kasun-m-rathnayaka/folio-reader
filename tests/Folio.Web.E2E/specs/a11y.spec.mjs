import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openLibrary, seedLibrary, waitForReader, openFirstDetails } from './helpers.mjs';

// M3 gate: no serious or critical axe issues on the library, details, settings and reader; reduced motion disables
// transitions.
async function scan(page, name) {
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    const blocking = result.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
    expect(blocking.map(v => `${name}: ${v.id} — ${v.help} (${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')})`)).toEqual([]);
}

for (const colorScheme of ['dark', 'light']) {
    test(`axe: library, details, settings, reader (${colorScheme})`, async ({ page }) => {
        await openLibrary(page);
        if (colorScheme === 'light') await page.getByRole('button', { name: 'Toggle light and dark theme' }).click();
        await seedLibrary(page);
        await scan(page, 'library');
        await openFirstDetails(page);
        await expect(page.locator('.folio-details')).toBeVisible();
        await scan(page, 'details');
        await page.getByRole('button', { name: /^Read / }).click();
        await waitForReader(page);
        await scan(page, 'reader');
        await page.getByRole('button', { name: 'Back to library' }).click();
        await page.getByRole('button', { name: 'Settings' }).click();
        await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
        await scan(page, 'settings');
    });
}

test('reduced motion: system preference resolves to reduced and books do not animate', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openLibrary(page);
    await seedLibrary(page);
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
    const transition = await page.locator('.folio-cssbook-body').first().evaluate(el => getComputedStyle(el).transitionDuration);
    expect(transition.split(',').every(d => parseFloat(d) === 0)).toBe(true);
    await page.locator('.folio-book-card').first().hover();
    const turn = await page.locator('.folio-cssbook').first().evaluate(el => getComputedStyle(el).getPropertyValue('--lift').trim());
    expect(turn).toBe('0px');
});
