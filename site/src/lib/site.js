export const PROD_ORIGIN = 'https://theburgerboxes.com';

// Absolute URLs (canonicals, schema, breadcrumbs, internal links) are carried
// over from WordPress verbatim. A QA build (SITE_ORIGIN=http://localhost:PORT)
// points them at the local server so the copy can be crawled and screenshotted
// without touching the live site.
export const ORIGIN = process.env.SITE_ORIGIN || PROD_ORIGIN;

export function rewrite(html) {
  if (ORIGIN === PROD_ORIGIN || !html) return html;
  return html.split(PROD_ORIGIN).join(ORIGIN);
}
