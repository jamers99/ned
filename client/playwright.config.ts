import { defineConfig, devices } from '@playwright/test';

// Screen tests run the dev server in a phone-sized Chromium, on a fixed clock, with no server behind it
// (the app runs as a guest, so nothing syncs). Seeded times are local times in this zone, in Node and the browser.
const timezone = 'America/Chicago';
process.env.TZ = timezone;

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'e2e/results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['Pixel 7'],
    baseURL: 'http://localhost:5199',
    timezoneId: timezone,
    locale: 'en-US',
    trace: 'retain-on-failure'
  },
  projects: [
    // Flows check behavior; `npm run e2e`, and CI.
    { name: 'flows', testIgnore: 'screens.spec.ts' },
    // Screens saves a picture of every screen in day and night colors to e2e/screens/, to look at.
    { name: 'screens', testMatch: 'screens.spec.ts' }
  ],
  webServer: {
    command: 'npx vite --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: !process.env.CI
  }
});
