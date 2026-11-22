import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openLibrary, seedLibrary } from './helpers.mjs';

// WP7: Create shelf, Manage shelves and the sidebar use the bracket design; the shelf-name row is gone from the home page;
// the app icon shows in the sidebar.
async function scan(page, name) {
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    const blocking = result.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
    expect(blocking.map(v => `${name}: ${v.id} — ${v.help} (${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')})`)).toEqual([]);
}

for (const scheme of ['dark', 'light']) {
    test(`dialogs and sidebar (${scheme})`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        const errors = await openLibrary(page);
        if (scheme === 'light') await page.getByRole('button', { name: 'Toggle light and dark theme' }).click();

        // The app icon shows beside the wordmark, loaded relative to the base address.
        const logo = page.locator('.folio-brand-logo');
        await expect(logo).toBeVisible();
        expect(await logo.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
        await expect(logo).toHaveAttribute('src', '_content/Folio.UI/images/folio-logo.png');

        // Create shelf: bracket design, Enter submits.
        await page.getByRole('button', { name: 'Create shelf' }).click();
        const dialog = page.locator('.folio-dialog');
        await expect(dialog.locator('.folio-eyebrow')).toHaveText('[ NEW SHELF ]');
        await expect(dialog.getByRole('heading', { name: 'Create a shelf' })).toBeVisible();
        await expect(dialog.locator('.folio-bracket')).toHaveText([/CANCEL/, /CREATE SHELF/]);
        await expect(dialog.locator('.folio-underline-input')).toBeFocused();
        await scan(page, 'create shelf');
        await page.locator('#folio-shelf-name').fill('Design');
        await page.locator('#folio-shelf-name').press('Enter');
        await expect(page.locator('.folio-shelves-list').getByRole('button', { name: 'Design' })).toBeVisible();
        await expect(page.locator('.folio-shelves-list .folio-nav-link small').first()).toHaveText('01');

        // Create another; Escape cancels the dialog.
        await page.getByRole('button', { name: 'Create shelf' }).click();
        await expect(dialog.locator('.folio-underline-input')).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);

        // Manage shelves: inline rename, reorder buttons, in-place delete confirmation.
        await page.getByRole('button', { name: 'Create shelf' }).click();
        await page.locator('#folio-shelf-name').fill('Research');
        await page.locator('#folio-shelf-name').press('Enter');
        await page.getByRole('button', { name: 'Manage shelves' }).click();
        await expect(dialog.locator('.folio-eyebrow')).toHaveText('[ SHELVES ]');
        await scan(page, 'manage shelves');
        await dialog.locator('.folio-manage-shelf').nth(1).getByRole('button', { name: 'Move shelf up' }).click();
        await expect(page.locator('.folio-shelves-list .folio-nav-link').first()).toContainText('Research');
        await dialog.locator('.folio-manage-shelf').nth(0).getByRole('button', { name: /^Delete / }).click();
        await expect(dialog.locator('.folio-manage-confirm')).toContainText('Its books stay in your library.');
        await dialog.getByRole('button', { name: /^Keep shelf/ }).click();
        await expect(dialog.locator('.folio-manage-confirm')).toHaveCount(0);
        await dialog.locator('.folio-manage-shelf').nth(1).getByRole('button', { name: /^Delete / }).click();
        await dialog.getByRole('button', { name: /^Delete shelf Design/ }).click();
        await expect(page.locator('.folio-shelves-list').getByRole('button', { name: 'Design' })).toHaveCount(0);
        await dialog.getByRole('button', { name: 'DONE' }).click();
        await expect(dialog).toHaveCount(0);
        await scan(page, 'sidebar');
        expect(errors).toEqual([]);
    });
}

test('the home page does not repeat the shelf names', async ({ page }) => {
    await openLibrary(page, '/shelf?stageTest=1');
    await seedLibrary(page);
    await page.getByRole('button', { name: 'Create shelf' }).click();
    await page.locator('#folio-shelf-name').fill('Design');
    await page.locator('#folio-shelf-name').press('Enter');
    await expect(page.locator('.folio-shelves-list').getByRole('button', { name: 'Design' })).toBeVisible();
    await expect(page.locator('.folio-row-index')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Shelves' })).toHaveCount(0);
    // The sidebar is the one place to jump between shelves.
    await page.locator('.folio-shelves-list').getByRole('button', { name: 'Design' }).click();
    await expect(page.locator('.folio-stage-shelf h1, .folio-library-page h1').first()).toHaveText(/Design/);
});
