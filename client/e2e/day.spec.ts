import { expect, test } from './fixtures.ts';

test.beforeEach(async ({ app, page }) => {
  await app.button('Day').click();
});

test('a night hangs its waking and feed off its block, then the wake window', async ({ page }) => {
  await expect(page.locator('.total').filter({ hasText: 'feeds' })).toContainText('3 feeds');
  const night = page.locator('.during');
  await expect(night).toContainText('Woke · 20m');
  await expect(night).toContainText('Nursed · 13m');
  await expect(night).not.toContainText('Nursed · 15m');
  await expect(page.locator('.window').first()).toHaveText('Awake 2h 35m');
});

test('an entry is edited, then deleted', async ({ app, page }) => {
  await page.getByRole('button', { name: /Bottle · 4 oz/ }).click();
  await app.button('Amount more').click();
  await app.done();
  await expect(page.getByText('Bottle · 4.5 oz')).toBeVisible();

  await page.getByRole('button', { name: /Bottle · 4.5 oz/ }).click();
  page.once('dialog', dialog => dialog.accept());
  await app.button('Delete').click();
  await expect(page.getByText('Bottle · 4.5 oz')).toBeHidden();
});

test('steps back a day', async ({ app, page }) => {
  await app.button('Previous day').click();
  await expect(page.getByText('Saturday, Oct 17')).toBeVisible();
  await expect(page.locator('.total').filter({ hasText: 'naps' })).toContainText('2 naps');
});
