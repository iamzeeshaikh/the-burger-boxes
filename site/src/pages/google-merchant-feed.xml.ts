// Google Merchant Center product feed.
//
// Item ids are the ones Merchant Center already holds (gla_<post id>), so the
// products keep their history there. Everything else is read from the site's
// own product data, so the feed cannot drift from what the pages say.
import type { APIRoute } from 'astro';
import feed from '../data/merchant.json';

const SITE = 'https://theburgerboxes.com';

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c] as string));

const cdata = (s: unknown) => `<![CDATA[${String(s ?? '').replace(/]]>/g, ']]&gt;')}]]>`;

export const GET: APIRoute = () => {
  const items = feed.items.map((p: any) => {
    const rows = [
      `      <g:id>${esc(p.id)}</g:id>`,
      `      <title>${cdata(p.title)}</title>`,
      `      <description>${cdata(p.description)}</description>`,
      `      <link>${esc(p.link)}</link>`,
      p.image_link ? `      <g:image_link>${esc(p.image_link)}</g:image_link>` : '',
      ...(p.additional_image_link || []).map(
        (u: string) => `      <g:additional_image_link>${esc(u)}</g:additional_image_link>`),
      `      <g:condition>${esc(p.condition)}</g:condition>`,
      `      <g:availability>${esc(p.availability)}</g:availability>`,
      `      <g:price>${esc(p.price)}</g:price>`,
      `      <g:brand>${cdata(p.brand)}</g:brand>`,
      p.product_type ? `      <g:product_type>${cdata(p.product_type)}</g:product_type>` : '',
      `      <g:identifier_exists>${esc(p.identifier_exists)}</g:identifier_exists>`,
      ...(p.shipping_countries || []).map((c: string) =>
        `      <g:shipping>\n        <g:country>${esc(c)}</g:country>\n` +
        `        <g:service>Free shipping</g:service>\n` +
        `        <g:price>0.00 USD</g:price>\n      </g:shipping>`),
    ].filter(Boolean);
    return `    <item>\n${rows.join('\n')}\n    </item>`;
  });

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n` +
    `  <channel>\n` +
    `    <title>${cdata('The Burger Boxes')}</title>\n` +
    `    <link>${SITE}/</link>\n` +
    `    <description>${cdata('Custom burger packaging - product feed for Google Merchant Center')}</description>\n` +
    `${items.join('\n')}\n` +
    `  </channel>\n` +
    `</rss>\n`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
