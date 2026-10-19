import { at, expect, test } from './fixtures.ts';

test.describe('a nap', () => {
  test('starts with one tap, moves its start, and ends with Woke up', async ({ app, page }) => {
    await app.sleepButton.click();
    await expect(page.getByText('Asleep since 1:00 PM')).toBeVisible();
    await app.pickTime('Sleep start time', '12:50');
    await expect(page.getByText('Asleep since 12:50 PM')).toBeVisible();

    await app.button('Close').click();
    await expect(app.sleepButton).toContainText('Nap 2');
    await expect(app.sleepButton).toContainText('Asleep');
    await expect(page.locator('.status')).toContainText('Naps usually run 1h 00m–1h 15m');

    await app.wait(60);
    await app.sleepButton.click();
    await app.button('Woke up').click();
    await expect(page.getByText('Nap 2 saved')).toBeVisible();
    await expect(page.locator('.saved .big')).toHaveText('1h 10m');
    await app.button('Happy').click();
    await app.done();
    await expect(app.sleepButton).toContainText('Start nap');
  });

  test('started by mistake is deleted with one tap, or after asking once it is older', async ({ app, page }) => {
    await app.sleepButton.click();
    await app.button('Delete').click();
    await expect(app.sleepButton).toContainText('Start nap');

    await app.sleepButton.click();
    await app.wait(10);
    page.once('dialog', dialog => dialog.dismiss());
    await app.button('Delete').click();
    await expect(app.drawer).toContainText('Asleep since 1:00 PM');

    page.once('dialog', dialog => dialog.accept());
    await app.button('Delete').click();
    await expect(app.sleepButton).toContainText('Start nap');
  });

  test('running long asks if she is still asleep', async ({ app, page }) => {
    await app.sleepButton.click();
    await app.button('Close').click();
    await app.wait(120);
    await expect(page.getByText('Still asleep? Tap to check.')).toBeVisible();

    await page.locator('.status').click();
    await app.button('Still asleep').click();
    await expect(page.getByText('Still asleep?')).toBeHidden();
    await app.button('Close').click();
    await expect(page.getByText('Still asleep? Tap to check.')).toBeHidden();
  });

  test('a missed Woke up ends the nap at the time picked', async ({ app, page }) => {
    await app.sleepButton.click();
    await app.pickTime('Sleep start time', '13:00'); // on the minute, so the length comes out even
    await app.wait(120);
    await app.pickTime('Woke at', '14:30');
    await expect(page.getByText('Nap 2 saved')).toBeVisible();
    await expect(page.locator('.saved .big')).toHaveText('1h 30m');
  });
});

test.describe('a night', () => {
  test.use({ startAt: at(18, '21:00') });

  test('a waking with a feed goes back to the drawer, then back asleep', async ({ app, page }) => {
    await expect(app.sleepButton).toContainText('Start night');
    await app.sleepButton.click();
    await expect(app.drawer).toContainText('No wakings yet');

    await app.wait(180);
    await app.button("She's awake").click();
    await expect(page.getByText('Slept 3h 00m before this')).toBeVisible();
    await app.button('Feed').click();
    await page.getByRole('button', { name: /^Left/ }).click();
    await app.wait(8);
    await app.button('Done · save feed').click();

    // Back in the drawer: she fed, so one button settles her "by feeding".
    await expect(page.getByText(/^Nursed 8m/)).toBeVisible();
    await app.button('Back asleep').click();
    await expect(app.drawer).toContainText('1 waking so far');

    await app.button('Add a waking').click();
    await app.pickTime('Woke at', '22:00');
    await app.pickTime('Back asleep at', '22:20');
    await app.button('Soothing').click();
    await app.button('Save waking').click();
    await expect(app.drawer).toContainText('2 wakings so far');

    await app.button('Up for the day').click();
    await expect(page.getByText('Night saved')).toBeVisible();
  });

  test('up for the day during a waking ends the night when she woke, and leaves no stray waking', async ({ app, page }) => {
    await app.sleepButton.click();
    await app.wait(600);
    await app.button("She's awake").click();
    await app.wait(1);
    await app.button('Up for the day').click();
    await expect(page.locator('.time-value').last()).toHaveText('7:00 AM');

    // Woke a bit earlier than that: still no waking left outside the night.
    await app.pickTime('Woke at', '06:45');
    await app.done();
    await app.button('Day').click();
    await expect(page.locator('.during')).toHaveCount(0);
    await expect(page.getByText(/^Woke ·/)).toBeHidden();
  });
});
