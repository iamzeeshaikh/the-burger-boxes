// Compare every redirect / rewrite / special status against the live server.
import fs from 'node:fs';

const STAGING = process.argv[2] || 'https://site-dun-ten-91.vercel.app';
const LIVE = 'https://theburgerboxes.com';
const redirects = JSON.parse(fs.readFileSync('src/data/redirects.json', 'utf8'));
const rewrites = JSON.parse(fs.readFileSync('src/data/rewrites.json', 'utf8'));

const paths = [
  ...Object.keys(redirects),
  ...Object.keys(rewrites),
  '/?add-to-cart=500',
  '/cart/?add-to-cart=1457',
  '/nonexistent-page-xyz/',
  '/shop/',
  '/product-tag/burger/',
  '/robots.txt',
  '/sitemap.xml',
  '/product-sitemap.xml',
];

// The live host sits behind a bot filter that answers a non-browser request
// with a 202 challenge interstitial, so probes send browser headers.
const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
};

async function probe(base, path) {
  try {
    const r = await fetch(base + path, { redirect: 'manual', headers: HEADERS });
    const loc = r.headers.get('location') || '';
    return { status: r.status, location: loc.replace(STAGING, '').replace(LIVE, '') };
  } catch (e) {
    return { status: 0, location: 'ERR ' + e.message };
  }
}

const rows = [];
for (const p of paths) {
  const [live, astro] = [await probe(LIVE, p), await probe(STAGING, p)];
  const match = live.status === astro.status && live.location === astro.location;
  rows.push({ path: p, live, astro, match });
  console.log(`${match ? 'MATCH' : 'DIFF '}  ${p}\n        live ${live.status} ${live.location}\n        astro ${astro.status} ${astro.location}`);
}
fs.writeFileSync('scripts/redirectcheck.json', JSON.stringify(rows, null, 1));
const bad = rows.filter((r) => !r.match);
console.log(`\n${rows.length - bad.length}/${rows.length} match the live server`);
