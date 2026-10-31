import { at, expect, test } from './fixtures.ts';

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

test('a waking missed in the night is added from the night afterwards', async ({ app, page }) => {
  await page.locator('button.sleep').first().click();
  await expect(page.locator('.wakings')).toHaveText('2:10 – 2:30 AM');
  await app.button('Add a waking').click();
  await app.pickTime('Woke at', '04:15');
  await app.pickTime('Back asleep at', '04:35');
  await app.button('Soothing').click();
  await app.button('Save waking').click();
  await expect(page.locator('.wakings')).toContainText('4:15');
  await app.done();
  await expect(page.locator('.during').first().getByText(/^Woke · 20m/)).toHaveCount(2);
});

test("a waking can't reach past the night's end", async ({ app, page }) => {
  await page.locator('button.sleep').first().click();
  await app.button('Add a waking').click();
  await app.pickTime('Woke at', '06:00');
  await app.pickTime('Back asleep at', '07:30');
  await expect(page.locator('.add .time-value').last()).toHaveText('6:30 AM');
  await app.pickTime('Woke at', '06:45');
  await expect(app.button('Save waking')).toBeDisabled();
});

test("a feed's sides are typed in", async ({ app, page }) => {
  await page.getByRole('button', { name: /Nursed · 15m/ }).click();
  const left = page.getByLabel('Left minutes');
  await expect(left).toHaveValue('8');
  await left.fill('12');
  await left.press('Enter');
  await app.button('Right less').click();
  await app.done();
  await expect(page.getByText('L 12m · R 6m')).toBeVisible();
});

test('steps back a day', async ({ app, page }) => {
  await app.button('Previous day').click();
  await expect(page.getByText('Saturday, Oct 17')).toBeVisible();
  await expect(page.locator('.total').filter({ hasText: 'naps' })).toContainText('2 naps');
});

test.describe('tonight', () => {
  test.use({ startAt: at(18, '21:00') });

  test('shows on today while it runs, without counting toward today, and moves to its morning', async ({ app, page }) => {
    await app.button('Now').click();
    await app.sleepButton.click();
    await app.wait(60);
    await app.button("She's awake").click();
    await app.button('Feed').click();
    await page.getByRole('button', { name: /^Left/ }).click();
    await app.wait(5);
    await app.button('Done · save feed').click();
    await app.button('Back asleep').click();
    await page.getByRole('button', { name: 'Close' }).click();
    await app.button('Day').click();

    await expect(page.locator('.sleep-meta', { hasText: /^Since 9:00 PM/ })).toBeVisible();
    await expect(page.locator('.during').last()).toContainText('Nursed · 5m');
    await expect(page.locator('.total').filter({ hasText: 'feeds' })).toContainText('3 feeds');

    await app.wait(180);
    await app.button('Now').click();
    await app.button('Day').click();
    await expect(page.getByText('Today', { exact: true })).toBeVisible();
    await expect(page.locator('.sleep-meta', { hasText: /^Since 9:00 PM/ })).toBeVisible();
    await expect(page.locator('.total').filter({ hasText: 'feed' })).toContainText('1 feed');
  });
});
