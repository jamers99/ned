import { expect, test } from './fixtures.ts';

test('insights sum up the week, and Growth lists the measurements', async ({ app, page }) => {
  await app.button('Insights').click();
  await expect(page.locator('.stat', { hasText: 'Avg bedtime' })).toContainText('8:15 PM');
  await expect(page.locator('.wakings .bar-value').last()).toHaveText('1.0');
  await expect(page.locator('.stat', { hasText: 'Feeds a day' })).toContainText('1.3 by day');
  await expect(page.locator('.stat', { hasText: 'Feeds a day' })).toContainText('1 at night');

  await app.button('Growth').click();
  await expect(page.getByText('16 lb 5 oz · 26.2 in · head 16.5 in')).toBeVisible();
  await app.button('Close').click();
});
