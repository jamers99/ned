import { expect, test } from './fixtures.ts';

test('nursing switches sides and saves', async ({ app, page }) => {
  await app.feedButton.click();
  await page.getByRole('button', { name: /^Left/ }).click();
  await app.wait(5);
  await page.getByRole('button', { name: /^Right/ }).click();
  await app.wait(3);
  await page.getByRole('button', { name: /^Right/ }).click();
  await expect(page.locator('.total .big')).toHaveText(/^8:0\d$/);

  await app.button('Close').click();
  await expect(app.feedButton).toContainText(/8:0\d · paused/);
  await app.feedButton.click();
  await app.button('Done · save feed').click();
  await expect(app.feedButton).toContainText('Fed 8m ago');

  await app.button('Day').click();
  await expect(page.getByText('Nursed · 8m')).toBeVisible();
  await expect(page.getByText('L 5m · R 3m')).toBeVisible();
});

test("a running side's minutes are typed in, and it keeps counting", async ({ app, page }) => {
  await app.feedButton.click();
  await page.getByRole('button', { name: /^Left/ }).click();
  await app.wait(2);
  await app.button('Adjust sides').click();
  const left = page.getByLabel('Left minutes');
  await expect(left).toHaveValue('2');
  await left.fill('10');
  await left.press('Enter');
  await expect(page.locator('.total .big')).toHaveText('10:00');
  await app.wait(1);
  await expect(left).toHaveValue('11');
  await app.button('Right more').click();
  await expect(page.locator('.total .big')).toHaveText('12:00');
});

test('a bottle starts from the last amount', async ({ app, page }) => {
  await app.feedButton.click();
  await page.getByRole('tab', { name: 'Bottle' }).click();
  await expect(page.getByText('4 oz')).toBeVisible();
  await app.button('More').click();
  await app.button('More').click();
  await app.button('Save bottle').click();

  await app.button('Day').click();
  await expect(page.getByText('Bottle · 5 oz')).toBeVisible();
});

test('solids adds a new food and it shows on Now and in Recent', async ({ app, page }) => {
  await page.locator('button.solids').click();
  await page.getByLabel('Find or add a food').fill('Kiwi');
  await app.button('Add “Kiwi”').click();
  await app.button('A taste').click();
  await app.button('Save · 1 food').click();
  await expect(page.locator('button.solids')).toContainText('Ate just now · Kiwi');

  await page.locator('button.solids').click();
  await expect(page.locator('.group', { hasText: 'Recent' })).toContainText('Kiwi');
});

test('picking a searched food clears the search and keeps it focused', async ({ app, page }) => {
  await page.locator('button.solids').click();
  const search = page.getByLabel('Find or add a food');
  await search.fill('mang');
  await app.button('Mango').click();
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();

  await search.fill('Kiwi');
  await app.button('Add “Kiwi”').click();
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await expect(app.button('Save · 2 foods')).toBeVisible();
});

test('a note is saved from the square beside Solids', async ({ app, page }) => {
  await app.button('Note').click();
  await page.getByRole('textbox', { name: 'Note' }).fill('First tooth!');
  await app.button('Save note').click();

  await app.button('Day').click();
  await expect(page.getByText('First tooth!')).toBeVisible();
});
