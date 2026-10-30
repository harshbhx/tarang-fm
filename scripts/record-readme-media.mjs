// Records the short UI loops used in the README (docs/media/*) against a running Tarang FM.
// Runs in GitHub Actions (.github/workflows/readme-media.yml); not meant for a small machine.
//
//   BASE_URL=https://tarang-fm.dualmindlab.tech node scripts/record-readme-media.mjs out-dir
//
// Most clips use the app's built-in mock-data views (?preview=ui, ?preview=live) and the landing page's sample
// caller, so they cost no Sarvam credits. Only the "tune-in" clip plays one real, short show.
import { chromium } from '@playwright/test';
import { mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const base = (process.env.BASE_URL ?? 'http://localhost:4173').replace(/\/$/, '');
const out = process.argv[2] ?? 'media-raw';
const only = process.env.ONLY?.split(',');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

async function clip(name, viewport, run, opts = {}) {
  if (only && !only.includes(name)) return;
  const dir = join(out, `${name}-tmp`);
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    isMobile: opts.mobile ?? false,
    hasTouch: opts.mobile ?? false,
    recordVideo: { dir, size: viewport },
  });
  const page = await context.newPage();
  try {
    await run(page);
  } catch (err) {
    console.error(`clip ${name} failed:`, err.message);
    process.exitCode = 1;
  }
  const video = page.video();
  await context.close();
  renameSync(await video.path(), join(out, `${name}.webm`));
  console.log('recorded', name);
}

const desktop = { width: 1100, height: 680 };
const phone = { width: 390, height: 780 };
const smoothScroll = (page, y, ms) =>
  page.evaluate(([to, dur]) => new Promise((done) => {
    const from = window.scrollY, t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      window.scrollTo(0, from + (to - from) * (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2));
      k < 1 ? requestAnimationFrame(step) : done();
    };
    requestAnimationFrame(step);
  }), [y, ms]);

// 1. Landing page: hero, then the evening scrolling by
await clip('landing', desktop, async (page) => {
  await page.goto(base + '/');
  await page.waitForTimeout(2500);
  const total = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  await smoothScroll(page, Math.min(total, 5200), 9000);
  await page.waitForTimeout(800);
  await smoothScroll(page, 0, 1500);
  await page.waitForTimeout(500);
});

// 2. Call button: hold to talk on the landing page (the sample caller speaks, no microphone, no credits)
await clip('call-button', desktop, async (page) => {
  await page.goto(base + '/');
  const hold = page.getByRole('button', { name: /Hold to talk/ });
  await hold.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  const box = await hold.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
  await page.waitForTimeout(400);
  await page.mouse.down();
  await page.waitForTimeout(3200);
  await page.mouse.up();
  await page.waitForTimeout(5500);
});

// 3. Radio player: every state of the on-air radio, from mock data
await clip('radio-player', desktop, async (page) => {
  await page.goto(base + '/?preview=ui');
  await page.locator('.radio').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(2500);
  const cc = page.getByRole('button', { name: /subtitles/i }).first();
  if (await cc.count()) await cc.click().catch(() => {});
  await page.waitForTimeout(2500);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(1800);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(1800);
  await page.getByRole('button', { name: 'Full screen' }).click().catch(() => {});
  await page.waitForTimeout(2500);
});

// 4. Radio on a phone
await clip('radio-phone', phone, async (page) => {
  await page.goto(base + '/?preview=ui');
  await page.locator('.radio').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(3000);
  await smoothScroll(page, 500, 2500);
  await page.waitForTimeout(2500);
}, { mobile: true });

// 5. Live room: Listen together, every state from mock data
await clip('live-room', desktop, async (page) => {
  await page.goto(base + '/?preview=live');
  await page.waitForTimeout(3000);
  await smoothScroll(page, 600, 3000);
  await page.waitForTimeout(3000);
  await smoothScroll(page, 1400, 3000);
  await page.waitForTimeout(2500);
});

// 6. Tune in: one real, short show on the radio (a few seconds of Sarvam speech)
await clip('tune-in', desktop, async (page) => {
  await page.goto(base + '/listen');
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: /Tune in to Hindi 91\.1/i }).click();
  await page.waitForTimeout(24000);
});

await browser.close();
