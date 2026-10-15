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

test('landing page introduces the station: one headline, one button, the radio', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /AI radio, in your language/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tune in now' }).first()).toBeVisible();
  // Preset keys play a station's ID; they don't navigate
  await expect(page.getByRole('button', { name: /Play the Hindi 91\.1 station ID/ })).toBeAttached();
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

test('landing page: the dial band and the four section titles, in order', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  // The band names every station for screen readers
  const band = page.getByRole('img', { name: /Five stations: Hindi 91\.1, Marathi 94\.3, Tamil 98\.3, Bangla 102\.7, Gujarati 106\.1/ });
  await band.scrollIntoViewIfNeeded();
  await expect(band).toBeVisible();
  const titles = await page.getByRole('heading', { level: 2 }).allTextContents();
  expect(titles).toEqual(['Tonight’s show, written for you.', 'Talk back.', 'Five languages. Twenty-seven voices.', 'Dil se suniye.']);
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});

/** Scrolls so a story beat sits on the reading line (mid-viewport, or 72% down when the stage is pinned on top). */
async function readBeat(page: Page, index: number) {
  await page.locator('.lp-beat').nth(index).scrollIntoViewIfNeeded();
  await page.evaluate((i) => {
    const beat = document.querySelectorAll('.lp-beat')[i].getBoundingClientRect();
    const stage = document.querySelector('.lp-stage')!.getBoundingClientRect();
    const line = window.innerHeight * (stage.width >= window.innerWidth * 0.85 ? 0.72 : 0.5);
    window.scrollBy({ top: beat.top + beat.height / 2 - line, behavior: 'instant' });
  }, index);
}

test('the evening: scrolling the beats changes what the on-air stage shows', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  const beats = page.locator('.lp-beat');
  await expect(beats).toHaveCount(4);
  const stage = page.locator('.lp-stage');
  // Reading the Kahani beat puts the Kahani on the stage; picking another story changes the voice
  await readBeat(page, 3);
  await expect(stage.locator('.lp-stage-lamps li[data-on="true"]')).toHaveText('Kahani');
  await expect(stage.getByText('shubh_hi_stories_dramatic')).toBeVisible();
  await expect(beats.nth(3)).toHaveAttribute('data-active', 'true');
  const monsoon = stage.getByRole('button', { name: /Monsoon romance/ });
  await monsoon.click();
  await expect(monsoon).toHaveAttribute('aria-pressed', 'true');
  await expect(stage.getByText('sanchita_hi_romantic')).toBeVisible();
  // Typing a name on the RJ beat puts it in the greeting (and keeps it for the radio)
  await readBeat(page, 0);
  await stage.getByPlaceholder('Your first name').fill('Harsh');
  await expect(stage.locator('.lp-stage-line .lp-native')).toContainText('नमस्ते Harsh!');
  expect(await page.evaluate(() => localStorage.getItem('tarang.listenerName'))).toBe('Harsh');
  // The studio line: the number, once, as a tel link
  const number = page.locator('.lp-studio-number');
  await number.scrollIntoViewIfNeeded();
  await expect(number).toHaveText('+91 79 6585 4148');
  await expect(number).toHaveAttribute('href', 'tel:+917965854148');
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('five stations on one light page, each with its own voice', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  const rows = page.locator('.lp-station-row');
  await expect(rows).toHaveCount(5);
  await expect(rows.nth(2).locator('.lp-station-native')).toHaveText('தரங் தமிழ்');
  await expect(rows.nth(2).getByRole('button', { name: /Hear the Tamil 98\.3 station ID/ })).toBeAttached();
  await expect(rows.nth(2).getByRole('button', { name: /Tune in.*Tamil/ })).toBeAttached();
  // The sign-off button wears its star
  await expect(page.locator('.lp-final .star-border-star')).toBeAttached();
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('hold to talk: the caller is heard while held and the call moves stop by stop on release', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  const hold = page.getByRole('button', { name: /Hold to talk/ });
  await hold.scrollIntoViewIfNeeded();
  const box = (await hold.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(hold).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.lp-steps li').nth(0)).toHaveAttribute('data-on', 'true');
  await page.waitForTimeout(900);
  // Words arrive while the button is held (no microphone here, so the sample caller speaks)
  const you = page.locator('.lp-line--you .lp-native');
  await expect(you).toContainText('आज');
  await page.mouse.up();
  await expect(page.locator('.lp-steps li').nth(2)).toHaveAttribute('data-on', 'true');
  await expect(you).toContainText('special बोल दो ना!');
  // The reply stop lights, then the sample reply plays (or, without a Sarvam key here, reports no signal)
  await expect(page.locator('.lp-steps li').nth(3)).toHaveAttribute('data-on', 'true', { timeout: 5000 });
  await expect(page.locator('.lp-talk-hint')).not.toHaveText(/Press and hold/);
  // Too short a press is told so
  const again = (await hold.boundingBox())!;
  await page.mouse.move(again.x + again.width / 2, again.y + again.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator('.lp-talk-hint')).toContainText('too short');
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('on air, the radio and the live caption fit one screen above the controls', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?preview=ui');
  const caption = page.locator('.caption-current').first();
  await expect(caption).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  // The preview's own toolbar sits above the radio; measure against it like the real page would
  const { captionBottom, dockTop, toolbar } = await page.evaluate(() => {
    const bar = document.querySelector('.radio')?.getBoundingClientRect().top ?? 0;
    const text = document.querySelector('.caption-current .caption-text') ?? document.querySelector('.caption-current');
    return {
      captionBottom: text!.getBoundingClientRect().bottom,
      dockTop: document.querySelector('.dock')!.getBoundingClientRect().top,
      toolbar: Math.max(0, bar),
    };
  });
  expect(captionBottom - toolbar).toBeLessThanOrEqual(dockTop + 2);
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('full screen shows only the radio and the caption, and F toggles it', async ({ page }) => {
  await page.goto('/?preview=ui');
  const radio = page.locator('.radio');
  await page.getByRole('button', { name: 'Full screen' }).click();
  await expect(radio).toHaveAttribute('data-immersive', 'true');
  await expect(page.locator('.below')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Exit full screen' })).toBeVisible();
  await page.locator('body').press('f');
  await expect(radio).toHaveAttribute('data-immersive', 'false');
  await expect(page.locator('.below')).toBeVisible();
});

test('the app can be installed: manifest and icons are served', async ({ request, page }) => {
  await page.goto('/listen');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe('/manifest.webmanifest');
  const manifest = await (await request.get(href!)).json();
  expect(manifest.start_url).toBe('/listen');
  expect(manifest.display).toBe('standalone');
  for (const icon of manifest.icons as { src: string; sizes: string }[]) {
    const res = await request.get(icon.src);
    expect(res.status(), icon.src).toBe(200);
    expect(res.headers()['content-type']).toContain('image/png');
  }
});
