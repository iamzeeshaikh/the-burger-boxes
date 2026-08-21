import { chromium } from 'playwright';
const base = 'https://site-dun-ten-91.vercel.app';
async function run(block) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  if (block) await p.route('**/frontend/cart.min.js*', (r) => r.abort());
  const posts = [];
  p.on('request', (r) => { if (r.method() === 'POST') posts.push(r.url()); });
  await p.goto(base + '/product/black-burger-boxes/', { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  await p.locator('a.elementor-button[href*="add-to-cart="]').first().scrollIntoViewIfNeeded();
  await p.locator('a.elementor-button[href*="add-to-cart="]').first().click();
  await p.waitForTimeout(2500);
  await p.locator('input[data-qty]').first().fill('5');
  await p.locator('[data-update-cart]').first().click();
  await p.waitForTimeout(1500);
  const state = await p.evaluate(() => ({
    rows: document.querySelectorAll('.woocommerce-cart-form__cart-item').length,
    empty: document.querySelectorAll('.wp-block-woocommerce-empty-cart-block').length,
    subtotal: document.querySelector('.cart-subtotal .amount')?.textContent?.trim() || null,
  }));
  console.log(block ? 'cart.min.js BLOCKED ' : 'cart.min.js loaded  ', JSON.stringify(state), 'POSTs:', posts.length);
  await b.close();
}
await run(false);
await run(true);
