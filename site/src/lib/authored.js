// Page records for pages we author after the migration.
//
// Everything captured from WordPress is served from pages.json through the
// catch-all route. A page that never existed there still needs the same head,
// body classes and chrome, so it borrows them from a captured record the way
// the cart-flow pages borrow /cart/ -- here /about-us/, because it is an
// ordinary indexable content page. Only the page's identity is swapped.
import pages from '../data/pages.json' with { type: 'json' };
import { PROD_ORIGIN } from './site.js';

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function authoredPage({ route, title, description }) {
  const base = pages['about-us'];
  const url = PROD_ORIGIN + route;
  const t = esc(title);
  const d = esc(description);

  let head = base.head
    .replace(/<title>[^<]*<\/title>/, `<title>${t}</title>`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${t}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${t}$2`);

  // /about-us/ carries no description of its own, so both are inserted.
  head = head.replace(/(<title>[^<]*<\/title>)/,
    `$1\n\t<meta name="description" content="${d}" />`);
  head = head.replace(/(<meta property="og:type" content="[^"]*" \/>)/,
    `$1\n\t<meta property="og:description" content="${d}" />`);

  return {
    ...base,
    route,
    url,
    head,
    bodyClass: base.bodyClass.replace(/\bpage-id-\d+\b/, '').replace(/\s+/g, ' ').trim(),
  };
}
