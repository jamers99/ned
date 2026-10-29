import { devices } from '@playwright/test';
import { expect, test } from './fixtures.ts';

// The first screen, opened in a browser tab rather than from the home screen.
test.use({ seeded: false });

test('on Android, the first screen says how to install from Chrome', async ({ page }) => {
  await expect(page.getByText('Ned works best as an app')).toBeVisible();
  await expect(page.getByText('Add to Home screen')).toBeVisible();
});

test("on Android, Chrome's install offer becomes one button", async ({ app, page }) => {
  await page.evaluate(() => {
    const offer = Object.assign(new Event('beforeinstallprompt'), {
      prompt: async () => {},
      userChoice: Promise.resolve({ outcome: 'accepted' })
    });
    dispatchEvent(offer);
  });
  await app.button('Install Ned').click();
  await expect(page.getByText('Installed. Open Ned from your home screen.')).toBeVisible();
});

test.describe('iPhone', () => {
  test.use({ userAgent: devices['iPhone 13'].userAgent });

  test("says how to add Ned to Safari's Home Screen", async ({ page }) => {
    await expect(page.getByText('Ned works best as an app')).toBeVisible();
    await expect(page.getByText('Add to Home Screen', { exact: true })).toBeVisible();
  });
});
