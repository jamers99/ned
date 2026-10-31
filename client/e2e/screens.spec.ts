import { type App, at, test } from './fixtures.ts';

// Not checks: a picture of every screen, in day and night colors, saved to e2e/screens/ to look over.
// `npm run e2e:screens`.

function camera(app: App, theme: string) {
  return async (name: string) => {
    await app.settle();
    await app.page.screenshot({ path: `e2e/screens/${theme}-${name}.png` });
  };
}

test('day colors', async ({ app, page }) => {
  const shot = camera(app, 'day');
  await shot('now');

  await page.locator('.status').click();
  await shot('wake-window');
  await app.button('Got it').click();

  await app.sleepButton.click();
  await app.wait(40);
  await shot('sleep-nap');
  await app.button('Woke up').click();
  await shot('woke');
  await app.done();

  await app.feedButton.click();
  await page.getByRole('button', { name: /^Left/ }).click();
  await app.wait(6);
  await shot('feed-nursing');
  await app.button('Adjust sides').click();
  await shot('feed-adjust-sides');
  await app.button('Done · save feed').click();
  await app.feedButton.click();
  await page.getByRole('tab', { name: 'Bottle' }).click();
  await shot('feed-bottle');
  await app.button('Close').click();

  await page.locator('button.solids').click();
  await app.button('Banana').first().click();
  await app.button('Some').click();
  await shot('solids');
  await app.button('Close').click();

  await app.button('Note').click();
  await page.getByRole('textbox', { name: 'Note' }).fill('Rolled over twice');
  await shot('note');
  await app.button('Save note').click();

  await app.button('Day').click();
  await shot('day');
  await page.locator('button.sleep').first().click();
  await shot('edit-night');
  await app.button('Add a waking').click();
  await shot('edit-night-add-waking');
  await app.button('Cancel').click();
  await app.done();
  await page.getByRole('button', { name: /Nursed · 15m/ }).first().click();
  await shot('edit-feed');
  await app.done();

  await app.button('Insights').click();
  await shot('insights');
  await app.button('Growth').click();
  await shot('growth');
  await app.button('Close').click();

  await app.button('Now').click();
  await app.button('Settings').click();
  await shot('settings');
});

test.describe(() => {
  test.use({ startAt: at(18, '21:30') });

  test('night colors', async ({ app, page }) => {
    const shot = camera(app, 'night');
    await shot('now-evening');

    await app.sleepButton.click();
    await app.wait(120);
    await shot('sleep-night');
    await app.button('Close').click();
    await shot('now-asleep');

    await app.sleepButton.click();
    await app.button("She's awake").click();
    await app.wait(5);
    await shot('sleep-waking');
    await app.button('Feed').click();
    await page.getByRole('button', { name: /^Left/ }).click();
    await app.wait(6);
    await shot('feed');
    await app.button('Done · save feed').click();
    await shot('sleep-waking-fed');
    await app.button('Back asleep').click();
    await app.button('Close').click();

    await app.button('Day').click();
    await shot('day');
    await page.locator('button.sleep').first().click();
    await app.button('Add a waking').click();
    await shot('edit-night-add-waking');
    await app.button('Cancel').click();
    await app.done();
    await page.getByRole('button', { name: /^Nursed/ }).last().click();
    await shot('edit-feed');
    await app.done();
    await app.button('Insights').click();
    await shot('insights');
  });
});

test.describe(() => {
  test.use({ user: 'Natalie' });

  test('sync needs attention', async ({ app, page }) => {
    await page.getByRole('button', { name: /^Not synced/ }).waitFor();
    await camera(app, 'day')('now-not-synced');
  });
});

test.describe(() => {
  test.use({ seeded: false });

  test('sign in', async ({ app }) => {
    await camera(app, 'day')('sign-in');
  });
});
