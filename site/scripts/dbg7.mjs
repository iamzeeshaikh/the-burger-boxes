import { chromium } from 'playwright';
const b = await chromium.launch();
for (const base of ['https://theburgerboxes.com', 'https://the-burger-boxes.vercel.app']) {
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(base + '/product/black-burger-boxes/', { waitUntil: 'load' });
  await p.waitForTimeout(4000);
  const info = await p.evaluate(() => ({
    proFrontend: typeof window.elementorProFrontend,
    modules: window.elementorProFrontend ? typeof window.elementorProFrontend.modules : 'n/a',
    moduleKeys: window.elementorProFrontend?.modules ? Object.keys(window.elementorProFrontend.modules) : null,
    frontendInit: window.elementorFrontend?.isEditMode ? 'ok' : 'ok',
    documents: typeof window.elementorFrontend?.documentsManager,
  }));
  console.log(base.replace('https://', '').padEnd(32), JSON.stringify(info));
  console.log('   pageerrors:', errs.slice(0, 3));
  await p.close();
}
await b.close();
