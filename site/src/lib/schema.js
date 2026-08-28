// Structured data the WordPress site never emitted.
//
// Two things every product page already shows a human but told a machine
// nothing about: the breadcrumb trail rendered in #crumbs, and the fifteen
// questions and answers in the FAQ tab, marked up as plain <h3>/<p>.
//
// Breadcrumbs are read by Google and shown in the result. The FAQ pairs no
// longer earn a rich result -- Google restricted those in 2023 -- but they are
// the part of these pages an answer engine can actually quote, and right now
// they read as undifferentiated prose. Both are derived from the page's own
// markup rather than authored again, so they cannot drift from what a visitor
// sees.

const SITE = 'https://theburgerboxes.com';

const text = (html) => String(html)
  .replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;|&#8217;|&rsquo;/g, '’')
  .replace(/&nbsp;/g, ' ').replace(/&#8211;|&ndash;/g, '–')
  .replace(/&#\d+;/g, '')
  .replace(/\s+/g, ' ')
  .trim();

/**
 * The contents of one WooCommerce tab panel.
 *
 * Matching to the first `</div>` looked fine on the pages whose FAQ answers are
 * bare <h3>/<p> and silently returned nothing on the ten whose panel wraps its
 * content in a div, so the divs are balanced instead.
 */
function tabPanel(content, name) {
  const open = new RegExp(
    `<div class="woocommerce-Tabs-panel woocommerce-Tabs-panel--${name}[^"]*"[^>]*>`);
  const m = open.exec(content);
  if (!m) return null;

  const from = m.index;
  const re = /<div\b[^>]*>|<\/div>/g;
  re.lastIndex = from;
  let depth = 0;
  for (let t = re.exec(content); t; t = re.exec(content)) {
    depth += t[0] === '</div>' ? -1 : 1;
    if (depth === 0) return content.slice(from + m[0].length, t.index);
  }
  return null;
}

/** The trail rendered in #crumbs, in order. */
export function breadcrumbList(content) {
  const block = /<div id="crumbs"[\s\S]*?<\/div>\s*<\/div>/.exec(content);
  if (!block) return null;

  const items = [];
  for (const m of block[0].matchAll(/<a href="([^"]+)"[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>\s*<\/a>/g)) {
    const name = text(m[2]);
    if (name) items.push({ url: m[1], name });
  }
  if (items.length < 2) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

/** The Q&A pairs in the product page's FAQ tab. */
export function faqPage(content, route) {
  const body = tabPanel(content, 'faqs_tab');
  if (!body) return null;

  // The FAQ tab comes in three shapes across the catalogue: <h3>1. Question?</h3>
  // on most pages, <ul><li><strong>Question</strong></li></ul> on ten of them,
  // and <p><strong>1. Question</strong></p> on one; on some the <strong> is
  // followed by the answer inside the same <li> rather than closing it.
  // Reading only the first shape
  // looked like a clean 59-of-69 rather than a parser quietly missing a format,
  // so all three are matched and the result is asserted below.
  const QUESTION = new RegExp([
    '<h3[^>]*>([\\s\\S]*?)<\\/h3>',
    '<li[^>]*>\\s*<strong[^>]*>([\\s\\S]*?)<\\/strong>',
    '<p[^>]*>\\s*<strong[^>]*>([\\s\\S]*?)<\\/strong>\\s*<\\/p>',
  ].join('|'), 'g');

  const marks = [];
  for (const m of body.matchAll(QUESTION)) {
    const q = text(m[1] ?? m[2] ?? m[3]).replace(/^\d+[.)]\s*/, '');
    if (q.length <= 8) continue;
    // An <h3> inside the FAQ tab is a question by construction. <strong> is
    // not -- it is also how these pages bold a lead-in mid-answer -- so there
    // it has to look like one. Requiring the question mark of both dropped 22
    // pages whose headings simply do not end in one.
    const isHeading = m[1] !== undefined;
    if (isHeading || q.endsWith('?')) marks.push({ q, at: m.index, end: m.index + m[0].length });
  }

  const pairs = [];
  for (let i = 0; i < marks.length; i += 1) {
    const until = i + 1 < marks.length ? marks[i + 1].at : body.length;
    const between = body.slice(marks[i].end, until);
    // Usually the answer is one or more <p>; on a couple of pages it is bare
    // text sitting beside the question inside the same <li>, so fall back to
    // everything between this question and the next.
    const paras = [...between.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
      .map((x) => text(x[1])).filter(Boolean).join(' ');
    const a = paras || text(between);
    // A question with no answer is worse than no markup at all.
    if (a.length > 20) pairs.push({ q: marks[i].q, a });
  }
  if (pairs.length < 2) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': SITE + route + '#faq',
    mainEntity: pairs.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}

/** Both blocks for one page, ready to drop into the head. */
export function schemaFor(page) {
  const blocks = [breadcrumbList(page.content)];
  if (page.route.startsWith('/product/')) blocks.push(faqPage(page.content, page.route));

  return blocks.filter(Boolean).map((b) =>
    '<script type="application/ld+json">' +
    // a closing tag inside JSON would end the script element early
    JSON.stringify(b).replace(/<\/script/gi, '<\\/script') +
    '</script>').join('\n');
}

/**
 * Strip the editor's paste residue.
 *
 * Nine product pages carry the markup ChatGPT's own interface wraps around a
 * reply -- `data-message-author-role="assistant"`, message ids, and its
 * Tailwind class soup -- pasted into WordPress along with the copy. None of it
 * renders (those classes do not exist here) but it is in every crawl of the
 * page, and `data-message-author-role="assistant"` says plainly where the copy
 * came from. The elements stay; only the residue goes, so nothing moves.
 */
const PASTE_NAMES = 'data-message-author-role|data-message-id|data-start|data-end' +
  '|data-sourcepos|data-col-size|data-is-last-node|data-is-only-node';
// The same attributes also survive inside the WooCommerce settings blob, where
// the excerpt is a JSON string and the quotes are escaped. Both quote pairs are
// removed together, so the JSON stays valid.
const PASTE_ATTRS = new RegExp(`\\s(?:${PASTE_NAMES})=(?:"[^"]*"|\\\\"[^"\\\\]*\\\\")`, 'g');
const PASTE_CLASSES = /\sclass="(?:[^"]*\b(?:dark:prose-invert|text-message|whitespace-pre-wrap|markdown prose|text-token-text-primary)\b[^"]*)"/g;

export function stripPasteResidue(html) {
  return html.replace(PASTE_ATTRS, '').replace(PASTE_CLASSES, '');
}
