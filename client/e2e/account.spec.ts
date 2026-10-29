import { expect, test } from './fixtures.ts';

test("the baby's name and pronouns come from Settings", async ({ app, page }) => {
  await expect(page.getByText('Kennedy', { exact: true })).toBeVisible();
  await app.button('Settings').click();
  await page.getByPlaceholder('Baby').fill('Ollie');
  await page.getByPlaceholder('Baby').press('Enter');
  await app.button('They / them').click();
  await expect(page.getByText('When they usually go down for the night.')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  await expect(page.getByText('Ollie', { exact: true })).toBeVisible();
  await app.sleepButton.click();
  await expect(app.drawer.getByRole('button', { name: 'On their own' })).toBeVisible();
});

test.describe('fresh install', () => {
  test.use({ seeded: false });

  test('a new parent can create an account, with an invite code if they have one', async ({ app, page }) => {
    await page.getByRole('tab', { name: 'Create account' }).click();
    await expect(page.getByText('Invite code')).toBeVisible();
    await expect(page.getByText('Leave it empty to start a new log.')).toBeVisible();
    await expect(app.button('Create account')).toBeVisible();

    await page.getByRole('tab', { name: 'Sign in' }).click();
    await expect(page.getByText('Invite code')).toBeHidden();
  });
});
