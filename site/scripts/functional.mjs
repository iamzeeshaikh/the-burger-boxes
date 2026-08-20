// Phase 5 -- drive the deployed site in a real browser and check the things a
// visitor uses: menus, search, galleries, tabs, the cart flow, the quote form's
// client-side behaviour and the tracking calls.
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] || 'http://localhost:4399';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  -- ' + detail : ''));
};

// Elementor reveals sections with a scroll animation, so anything below the
// fold has to be scrolled to before it counts as visible.
async function reveal(page, selector) {
  try {
    await page.locator(selector).first().scrollIntoViewIfNeeded({ timeout: 15000 });
    await page.waitForTimeout(900);
  } catch { /* nothing to scroll to */ }
}

async function step(name, fn) {
  try {
    const r = await fn();
    if (r !== undefined) check(name, r === true || (Array.isArray(r) ? r[0] : false),
      Array.isArray(r) ? r[1] : '');
  } catch (e) {
    check(name, false, String(e.message).split('\n')[0].slice(0, 120));
  }
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

// ---------------------------------------------------------------- header
await page.goto(base + '/', { waitUntil: 'load' });
await page.waitForTimeout(2000);

check('logo links home', await page.locator('a.site-logo').first().getAttribute('href')
  .then((h) => /theburgerboxes\.com\/?$/.test(h || '')));

const topItems = await page.locator('#menu-main-menu > li').count();
// Home + the five product-category dropdowns
check('main menu top-level items', topItems === 6, topItems + ' items');

// hover a dropdown parent and confirm the submenu becomes visible
const parent = page.locator('#menu-main-menu > li.menu-item-has-children').first();
await parent.hover();
await page.waitForTimeout(600);
check('dropdown opens on hover', await parent.locator('ul.sub-menu').first().isVisible());

// search modal
await page.locator('button.rishi-header-search').first().click();
await page.waitForTimeout(600);
check('search modal opens', await page.locator('.search-toggle-form input.search-field').first().isVisible());
await page.locator('.search-toggle-form input.search-field').first().fill('kraft');
await Promise.all([
  page.waitForNavigation({ waitUntil: 'load' }),
  page.locator('.search-toggle-form input.search-submit').first().click(),
]);
check('search returns results', (await page.locator('article.rishi-post').count()) > 0,
  (await page.locator('.srch-results-cnt').first().innerText().catch(() => '')).trim());

// ------------------------------------------------------------ mobile menu
const mobile = await ctx.newPage();
await mobile.setViewportSize({ width: 390, height: 844 });
await mobile.goto(base + '/', { waitUntil: 'load' });
await mobile.waitForTimeout(2000);
await mobile.locator('#rishi-header-trigger button, #rishi-header-trigger').first().click();
await mobile.waitForTimeout(800);
check('mobile drawer opens', await mobile.locator('#rishi-offcanvas').first().isVisible());
const sub = mobile.locator('#rishi-mobile-menu li.menu-item-has-children').first();
await sub.locator('.submenu-toggle').first().click();
await mobile.waitForTimeout(600);
check('mobile submenu toggles', await sub.locator('ul.sub-menu').first().isVisible());
await mobile.close();

// ------------------------------------------------------------ product page
await page.goto(base + '/product/black-burger-boxes/', { waitUntil: 'load' });
await page.waitForTimeout(2500);
check('product h1', (await page.locator('h1').first().innerText()) === 'Black Burger Boxes');
check('product gallery images', (await page.locator('.woocommerce-product-gallery__image').count()) === 4);
check('gallery is visible after JS', await page.locator('.woocommerce-product-gallery').first().isVisible());
await reveal(page, 'ul.wc-tabs');
const tabs = await page.locator('ul.wc-tabs li').allInnerTexts();
check('product tabs', tabs.length === 4, tabs.map((t) => t.trim()).join(' | '));
await step('tab switching works', async () => {
  await page.locator('#tab-title-faqs_tab a').click();
  await page.waitForTimeout(500);
  return await page.locator('#tab-faqs_tab').isVisible();
});
await step('specifications tab switching works', async () => {
  await page.locator('#tab-title-specifications_tab a').click();
  await page.waitForTimeout(500);
  return await page.locator('#tab-specifications_tab').isVisible();
});
await reveal(page, 'form.elementor-form[name="Instant Quote"]');
check('quote form present', await page.locator('form.elementor-form[name="Instant Quote"]').first().isVisible());
const attribution = await page.locator('form.elementor-form[name="Instant Quote"] input[name="referer_title"]').first().inputValue();
check('quote form names this product', attribution.includes('Black Burger Boxes'), attribution);
check('reCAPTCHA widget rendered',
  (await page.locator('.elementor-g-recaptcha iframe').count()) > 0);
check('phone link', (await page.locator('a[href^="tel:"]').count()) > 0);
check('email link', (await page.locator('a[href^="mailto:"]').count()) > 0,
  await page.locator('a[href^="mailto:"]').first().getAttribute('href'));
check('WhatsApp widget', (await page.locator('.joinchat').count()) > 0);
check('live chat widget script', (await page.locator('script[src*="chat.zeeops.dev"]').count()) > 0);

// the form must post to this deployment, never back to the WordPress host
await step('quote form posts to this site', async () => {
  const form = page.locator('form.elementor-form[name="Instant Quote"]').first();
  await form.locator('input[name="form_fields[name]"]').fill('QA Bot');
  await form.locator('input[name="form_fields[email]"]').fill('qa@example.com');
  await form.locator('input[name="form_fields[field_f54cfcb]"]').fill('5551234567');
  const [request] = await Promise.all([
    page.waitForRequest((r) => r.url().includes('admin-ajax.php') && r.method() === 'POST',
      { timeout: 20000 }),
    form.locator('button[type="submit"]').click(),
  ]);
  const sameOrigin = request.url().startsWith(base);
  return [sameOrigin, request.url()];
});
await step('form shows the server response inline', async () => {
  await page.waitForTimeout(3000);
  const msg = await page.locator('form.elementor-form[name="Instant Quote"] .elementor-message')
    .first().innerText().catch(() => '');
  return [msg.trim().length > 0, msg.trim()];
});

// -------------------------------------------------------------- cart flow
await reveal(page, 'a.elementor-button[href*="add-to-cart="]');
await page.locator('a.elementor-button[href*="add-to-cart="]').first().click();
await page.waitForTimeout(2500);
check('add to cart lands on the cart page', page.url().includes('/cart/'), page.url());
check('cart shows the product',
  (await page.locator('.woocommerce-cart-form__cart-item .product-name').first().innerText()
    .catch(() => '')).includes('Black Burger Boxes'));
const subtotal = await page.locator('.cart-subtotal .amount').first().innerText().catch(() => '');
check('cart subtotal', subtotal.replace(/\s/g, '') === '$0.20', subtotal);

await page.locator('input[data-qty]').first().fill('5');
await page.locator('[data-update-cart]').first().click();
await page.waitForTimeout(800);
const subtotal5 = await page.locator('.cart-subtotal .amount').first().innerText().catch(() => '');
check('quantity update recalculates', subtotal5.replace(/\s/g, '') === '$1.00', subtotal5);

await page.locator('a.checkout-button').first().click();
await page.waitForTimeout(1500);
check('proceed to checkout', page.url().includes('/checkout/'), page.url());
// the checkout is rendered once the catalogue has loaded
await page.waitForSelector('.woocommerce-checkout-review-order-table', { timeout: 20000 }).catch(() => {});
check('checkout shows the order', (await page.locator('.woocommerce-checkout-review-order-table').count()) > 0);
check('cash on delivery offered', (await page.locator('#payment_method_cod').count()) > 0);

await page.locator('#place_order').click();
await page.waitForTimeout(800);
check('checkout validates required fields',
  (await page.locator('.woocommerce-error').count()) > 0);

await page.goto(base + '/cart/', { waitUntil: 'load' });
await page.waitForSelector('a.remove[data-remove]', { timeout: 20000 }).catch(() => {});
await step('removing the last item shows the empty cart', async () => {
  const removals = await page.locator('a.remove[data-remove]').count();
  for (let i = 0; i < removals; i++) {
    await page.locator('a.remove[data-remove]').first().click();
    await page.waitForTimeout(500);
  }
  const state = await page.evaluate(() => ({
    stored: localStorage.getItem('tbb_cart'),
    rows: document.querySelectorAll('.woocommerce-cart-form__cart-item').length,
    empty: document.querySelectorAll('.wp-block-woocommerce-empty-cart-block').length,
    emptyStyle: document.querySelector('.wp-block-woocommerce-empty-cart-block')?.getAttribute('style'),
  }));
  const visible = await page.locator('.wp-block-woocommerce-empty-cart-block').first()
    .isVisible().catch(() => false);
  return [visible, JSON.stringify(state)];
});

// ------------------------------------------------------------ status codes
for (const [path, want] of [['/?add-to-cart=500', 410], ['/nonexistent-page-xyz/', 404]]) {
  const r = await page.request.get(base + path, { maxRedirects: 0 });
  check(`status ${path}`, r.status() === want, String(r.status()));
}

check('no JavaScript errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
fs.writeFileSync('scripts/functional.json', JSON.stringify(results, null, 1));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
