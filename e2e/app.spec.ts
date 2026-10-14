import { expect, test, type Page } from '@playwright/test';

/** Uncaught errors in the page fail the test. */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test('landing page introduces the station and its voices', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /AI radio, in your language/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Hear a sample/i }).first()).toBeVisible();
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('the radio page loads with every station on the dial', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/listen');
  await expect(page.getByRole('heading', { name: /Pick a station, then tune/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Tune in to Hindi 91\.1/i })).toBeVisible();
  for (const language of ['Hindi', 'Marathi', 'Tamil', 'Bangla', 'Gujarati']) {
    await expect(page.getByText(language, { exact: false }).first()).toBeAttached();
  }
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('studio line shows where each call is on its way to air', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?preview=ui');
  const studio = page.locator('section.studio');
  await studio.scrollIntoViewIfNeeded();
  await expect(studio.getByRole('heading', { name: 'Call the studio' })).toBeVisible();
  await expect(studio.getByText('On air now')).toBeVisible();
  await expect(studio.getByText('Up next', { exact: true })).toBeVisible();
  await expect(studio.getByText('Read on air')).toBeVisible();
  await expect(studio.getByText(/Kahani request:/)).toBeVisible();
  // Masked numbers only
  await expect(studio.getByText(/\+91 ••••• \d{4}/).first()).toBeVisible();
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('API answers with JSON errors, never HTML', async ({ request }) => {
  const res = await request.get('/api/does-not-exist');
  expect(res.status()).toBe(404);
  expect((await res.json()).error.code).toBe('not_found');
  const health = await request.get('/api/health');
  expect((await health.json()).ok).toBe(true);
});
