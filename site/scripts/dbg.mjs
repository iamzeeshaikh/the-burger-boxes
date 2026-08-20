import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext()).newPage();
p.on('response', async (r) => { if (r.status()>=400) console.log(r.status(), r.request().method(), r.url(), 'type=', r.request().resourceType(), 'headers=', JSON.stringify(r.request().headers()).slice(0,300)); });
p.on('pageerror', e=>console.log('PAGEERROR:', e.message, '\n', String(e.stack).slice(0,600)));
await p.goto('http://localhost:4321/about-us/', {waitUntil:'load'});
await p.waitForTimeout(4000);
await b.close();
