import { at, expect, test } from './fixtures.ts';

test('Now shows the wake window, the last feed and the last solids', async ({ app, page }) => {
  await expect(page.getByText('since 10:35 AM')).toBeVisible();
  await expect(page.locator('.status .big')).toHaveText('2h 25m');
  await expect(app.sleepButton).toContainText('Start nap');
  await expect(app.feedButton).toContainText('Fed 2h 00m ago');
  await expect(page.locator('button.solids')).toContainText('Ate 4h 30m ago · Banana, Oatmeal');
  await expect(page.getByText('Night 9h 55m · 1 waking')).toBeVisible();
});

test('tapping the wake window explains it', async ({ app, page }) => {
  await page.locator('.status').click();
  await expect(page.getByText('The wake window')).toBeVisible();
  await expect(page.getByText('The shaded zone')).toBeVisible();
  await app.button('Got it').click();
  await expect(page.getByText('The wake window')).toBeHidden();
});

test.describe('late afternoon without nap 2', () => {
  test.use({ startAt: at(18, '17:00') });

  test('aims for bedtime instead of the missed nap', async ({ page }) => {
    await expect(page.locator('.status')).toContainText('Bedtime 8:00 PM');
  });
});

test.describe('fresh install', () => {
  test.use({ seeded: false });

  test('can be tried without an account, and shows no sync cloud', async ({ app, page }) => {
    await app.button('Try it without an account').click();
    await expect(page.getByText('Log a sleep to see her wake window.')).toBeVisible();
    await expect(page.getByRole('button', { name: /synced/i })).toHaveCount(0);
  });
});
