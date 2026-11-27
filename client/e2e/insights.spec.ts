import { expect, test } from './fixtures.ts';

test('insights sum up the week, and Growth lists the measurements', async ({ app, page }) => {
  await app.button('Insights').click();
  await expect(page.locator('.stat', { hasText: 'Avg bedtime' })).toContainText('8:15 PM');
  await expect(page.locator('.chart', { hasText: 'Night wakings' }).locator('.bar-value').last()).toHaveText('1.0');
  await expect(page.getByText('Kennedy · 8 months')).toBeVisible();
  const feeds = page.locator('.stat', { hasText: 'Feeds a day' });
  await expect(feeds).toContainText('1 by day');
  await expect(feeds).toContainText('1 at night');
  await expect(feeds).toContainText('Typical: 0–1 at night');

  await app.button('Growth').click();
  await expect(page.getByText('16 lb 5 oz · 26.2 in · head 16.5 in')).toBeVisible();
  await app.button('Close').click();
});

test('tapping an insight card explains it with the numbers behind it', async ({ app, page }) => {
  await app.button('Insights').click();
  await page.locator('.chart', { hasText: 'Night wakings' }).click();
  await expect(page.getByText('1.0 a night this week')).toBeVisible();
  await expect(page.getByText('100% ended with a feed.')).toBeVisible();
  await app.button('Got it').click();
  await expect(page.getByText('1.0 a night this week')).toBeHidden();

  await page.locator('.stat', { hasText: 'Feeds a day' }).click();
  await expect(page.getByText('Typical at 8 months: 0–1 at night.')).toBeVisible();
  await expect(page.getByText('More night feeds than usual at this age.', { exact: false })).toBeHidden();
});
