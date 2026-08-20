// Assert the plain-JS shell used by the request-time endpoints produces exactly
// the same document as the Astro layout the static pages are built with.
import fs from 'node:fs';
import { renderDocument } from '../src/lib/shell.js';
import pages from '../src/data/pages.json' with { type: 'json' };

let bad = 0;
for (const page of Object.values(pages)) {
  if (page.slug === '_search') continue;
  const file = page.route === '/404/' ? 'dist/404.html'
    : page.route === '/' ? 'dist/index.html'
    : `dist${page.route}index.html`;
  if (!fs.existsSync(file)) continue;
  const built = fs.readFileSync(file, 'utf8');
  const js = renderDocument(page, page.content);
  if (built !== js) {
    bad++;
    if (bad <= 2) {
      const i = [...built].findIndex((c, n) => c !== js[n]);
      console.log('MISMATCH', page.route, 'at', i);
      console.log(' built:', JSON.stringify(built.slice(Math.max(0, i - 60), i + 60)));
      console.log(' js   :', JSON.stringify(js.slice(Math.max(0, i - 60), i + 60)));
    }
  }
}
console.log(bad ? `shell mismatch on ${bad} pages` : 'shell.js matches Shell.astro on every page');
