// Capture the post-JavaScript DOM of a list of URLs.
// Usage: node scripts/dom-capture.mjs <urls-file> <out-dir> [origin-to-strip]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const [urlFile, outDir, stripOrigin] = process.argv.slice(2);
const urls = fs.readFileSync(urlFile, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
fs.mkdirSync(outDir, { recursive: true });
// the origin these captures came from, so the comparison can normalise hosts
fs.writeFileSync(path.join(outDir, '_host.txt'), new URL(urls[0]).origin);

const slugFor = (u) => {
  const p = new URL(u).pathname.replace(/^\/|\/$/g, '');
  return p === '' ? '__home__' : p.replace(/\//g, '__');
};

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
});
const log = [];
for (const url of urls) {
  const page = await ctx.newPage();
  const errors = [];
  const failed = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  page.on('requestfailed', (r) => failed.push(r.url() + ' :: ' + (r.failure()?.errorText || '')));
  page.on('response', (r) => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url()); });
  let status = 0;
  try {
    const resp = await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    status = resp ? resp.status() : 0;
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    const html = await page.content();
    fs.writeFileSync(path.join(outDir, slugFor(url) + '.html'), html);
  } catch (e) {
    errors.push('NAV ' + e.message);
  }
  log.push({ url, status, errors, failed });
  console.log(status, url, 'err=' + errors.length, 'failed=' + failed.length);
  await page.close();
}
fs.writeFileSync(path.join(outDir, '_log.json'), JSON.stringify(log, null, 1));
await browser.close();
