// Load every route in a real browser and report failed requests and JS errors.
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] || 'http://localhost:4321';
const routes = JSON.parse(fs.readFileSync('src/data/pages.json', 'utf8'));
const list = process.argv[3]
  ? [process.argv[3]]
  : Object.values(routes).map((p) => p.route);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const problems = [];
for (const route of list) {
  const page = await ctx.newPage();
  const errors = [], failed = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  page.on('requestfailed', (r) => failed.push('FAILED ' + r.url()));
  page.on('response', (r) => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url()); });
  try {
    await page.goto(base + route, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);
  } catch (e) {
    errors.push('NAV ' + e.message);
  }
  if (errors.length || failed.length) problems.push({ route, errors, failed });
  await page.close();
}
await browser.close();
const uniq = new Map();
for (const p of problems) {
  for (const f of [...p.errors, ...p.failed]) {
    const key = f.replace(base, '');
    if (!uniq.has(key)) uniq.set(key, []);
    uniq.get(key).push(p.route);
  }
}
console.log('routes with problems:', problems.length, '/', list.length);
for (const [k, v] of [...uniq.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(String(v.length).padStart(4), k.slice(0, 170), v.length < 4 ? '  <- ' + v.join(', ') : '');
}
fs.writeFileSync('scripts/runtime-check.json', JSON.stringify(problems, null, 1));
