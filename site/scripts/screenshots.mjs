// Full-page screenshots at the four audit widths.
// Usage: node scripts/screenshots.mjs <base-url> <out-dir> [delayMs]
//
// Lazy images are forced in by scrolling the page; CSS animations/transitions
// are frozen and the two chat widgets are given time to settle, so two runs of
// the same page produce the same pixels.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import routes from '../src/data/pages.json' with { type: 'json' };

const [base, outDir, delayArg] = process.argv.slice(2);
const delay = Number(delayArg || 0);
const WIDTHS = [1440, 768, 390, 320];
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;

const all = Object.values(routes)
  .filter((p) => p.slug !== '_search' && p.slug !== '_404')
  .map((p) => p.route)
  .filter((r) => !only || only.includes(r));

// Every one of the 69 product pages is rendered by the same Elementor template
// (id 241), so below 1440px a spread of them is screenshotted and the rest are
// still loaded and measured for horizontal overflow -- which is the thing that
// varies with content length.
const products = all.filter((r) => r.startsWith('/product/'));
const others = all.filter((r) => !r.startsWith('/product/'));
const step = Math.ceil(products.length / 12);
const sampled = products.filter((_, i) => i % step === 0);
const shotList = (w) => (w === 1440 ? all : [...others, ...sampled]);
const measureOnly = (w) => (w === 1440 ? [] : products.filter((r) => !sampled.includes(r)));

const FREEZE = `
  *, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important;
    transition-duration: 0s !important; transition-delay: 0s !important;
    animation-iteration-count: 1 !important; caret-color: transparent !important; }
  html { scroll-behavior: auto !important; }
`;

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const results = [];
for (const width of WIDTHS) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 1,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    reducedMotion: 'reduce',
  });
  for (const route of [...shotList(width), ...measureOnly(width)]) {
    const shot = shotList(width).includes(route);
    const name = (route === '/' ? 'home' : route.replace(/^\/|\/$/g, '').replace(/\//g, '__')) + '@' + width;
    const page = await ctx.newPage();
    try {
      await page.goto(base + route, { waitUntil: 'load', timeout: 90000 });
      await page.addStyleTag({ content: FREEZE });
      await page.waitForTimeout(900);
      // walk the page so lazy images and background images load
      await page.evaluate(async () => {
        const step = window.innerHeight * 2;
        for (let y = 0; y < document.body.scrollHeight; y += step) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 60));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(1400);
      await page.evaluate(() => {
        // the sticky header renders differently mid-scroll; pin it to the top state
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        offenders: [...document.querySelectorAll('body *')]
          .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
          .slice(0, 5)
          .map((el) => el.tagName + '.' + (el.className || '').toString().split(' ').slice(0, 3).join('.')),
      }));
      if (shot) await page.screenshot({ path: path.join(outDir, name + '.png'), fullPage: true });
      results.push({ route, width, screenshot: shot, ...overflow });
    } catch (e) {
      results.push({ route, width, error: String(e.message).slice(0, 120) });
      console.log('ERR', route, width, e.message.slice(0, 80));
    }
    await page.close();
    if (delay) await new Promise((r) => setTimeout(r, delay));
  }
  await ctx.close();
  console.log('width', width, 'done');
}
await browser.close();
fs.writeFileSync(path.join(outDir, '_overflow.json'), JSON.stringify(results, null, 1));
const bad = results.filter((r) => r.scrollWidth > r.clientWidth + 1);
console.log('pages measured:', results.length, ' screenshots:', results.filter((r) => r.screenshot).length);
console.log('pages with horizontal overflow:', bad.length);
for (const b of bad.slice(0, 20)) console.log('  ', b.width, b.route, b.scrollWidth, '>', b.clientWidth, b.offenders);
