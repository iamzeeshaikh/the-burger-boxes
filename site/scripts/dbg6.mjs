import { chromium } from 'playwright';
const base = 'https://the-burger-boxes.vercel.app';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
p.on('pageerror', (e) => console.log('PAGEERROR:', e.message, '\n  STACK:', String(e.stack).split('\n').slice(0,6).join('\n  ')));
p.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text().slice(0, 160)); });
p.on('response', async (r) => {
  if (r.url().includes('admin-ajax')) {
    console.log('AJAX', r.status(), (await r.text().catch(() => '')).slice(0, 200));
  }
});
p.on('framenavigated', (f) => { if (f === p.mainFrame()) console.log('NAVIGATED ->', f.url()); });

await p.goto(base + '/product/black-burger-boxes/', { waitUntil: 'load' });
await p.waitForTimeout(3000);
const form = p.locator('form.elementor-form[name="Instant Quote"]').first();
await form.scrollIntoViewIfNeeded();
await form.locator('input[name="form_fields[name]"]').fill('Kenneth C. Ellsworth');
await form.locator('input[name="form_fields[email]"]').fill('kenneth.ellsworth0@gmail.com');
await form.locator('input[name="form_fields[field_f54cfcb]"]').fill('00000000');
await form.locator('textarea[name="form_fields[message]"]').fill('browser test');

// stand in for a solved checkbox: staging accepts any token
await p.evaluate(() => {
  const el = document.querySelector('form[name="Instant Quote"] textarea[name="g-recaptcha-response"]');
  if (el) { el.value = 'staging-test'; return 'set on existing textarea'; }
  const ta = document.createElement('textarea');
  ta.name = 'g-recaptcha-response'; ta.value = 'staging-test'; ta.style.display = 'none';
  document.querySelector('form[name="Instant Quote"]').appendChild(ta);
  return 'appended textarea';
}).then((r) => console.log('recaptcha token:', r));

console.log('--- which Elementor handlers are attached to the form widget ---');
console.log(await p.evaluate(() => {
  try {
    const w = document.querySelector('.elementor-widget-form');
    const ids = w ? w.dataset.id : null;
    return JSON.stringify({
      widgetId: ids,
      proFrontend: typeof window.elementorProFrontend,
      ajaxurl: window.ElementorProFrontendConfig?.ajaxurl,
    });
  } catch (e) { return 'ERR ' + e.message; }
}));

await form.locator('button[type="submit"]').click();
await p.waitForTimeout(6000);
console.log('final url:', p.url());
console.log('inline message:', await p.locator('form[name="Instant Quote"] .elementor-message').first().innerText().catch(() => '(none)'));
await b.close();
