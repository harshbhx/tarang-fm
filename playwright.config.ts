import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests against the production build served by `vite preview` (app + Worker, no Sarvam key needed).
 * The preview runs every binding locally (LOCAL_BINDINGS=1, see vite.config.ts), so no Cloudflare credentials are
 * needed and no test touches the real Workers AI or Vectorize. CI installs Chromium; locally an existing one is used.
 */
const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    env: { LOCAL_BINDINGS: '1' },
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
