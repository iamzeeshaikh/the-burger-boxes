import { chromium } from 'playwright';
const b = await chromium.launch();
for (const base of ['https://theburgerboxes.com', 'https://site-dun-ten-91.vercel.app']) {
  const p = await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
  await p.goto(base + '/product/black-burger-boxes/', { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  const info = await p.evaluate(() => {
    const lis = [...document.querySelectorAll('ul.wc-tabs li')];
    return {
      count: lis.length,
      display: lis.map(l => getComputedStyle(l).display),
      ulDisplay: document.querySelector('ul.wc-tabs') ? getComputedStyle(document.querySelector('ul.wc-tabs')).display : null,
      panels: [...document.querySelectorAll('.wc-tab')].map(x => ({id:x.id, display:getComputedStyle(x).display})),
      customTabs: !!document.querySelector('.custom-tabs, .bhww'),
    };
  });
  console.log(base, JSON.stringify(info));
  await p.close();
}
await b.close();
