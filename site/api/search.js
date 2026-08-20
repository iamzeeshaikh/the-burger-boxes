// WordPress' search results at /?s=<query>, rendered at request time.
//
// The theme's markup, the head Yoast produced and the page chrome all come from
// the captured search page; only the query, the result count, the result cards
// and the pagination are recomputed. Matching follows WordPress: every term must
// appear in the title, excerpt or content, newest first, ten to a page.
import pages from '../src/data/pages.json' with { type: 'json' };
import index from '../src/data/searchindex.json' with { type: 'json' };
import { renderDocument } from '../src/lib/shell.js';

const SITE = 'https://theburgerboxes.com';
const PER_PAGE = 10;
const template = pages._search;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function terms(query) {
  return query.toLowerCase().split(/\s+/).map((t) => t.trim()).filter(Boolean);
}

function search(query) {
  const t = terms(query);
  if (!t.length) return index;
  return index.filter((e) => t.every((term) => e.haystack.includes(term)));
}

function imageTag(img) {
  if (!img) return '';
  return `<img width="${img.width}" height="${img.height}" src="${img.src}" ` +
    `class="attachment-full size-full" alt="${esc(img.alt)}" loading="lazy" ` +
    `lazyload-type="fade"  decoding="async" srcset="${img.srcset}" sizes="${img.sizes}" />`;
}

function card(e) {
  const cats = e.categories.length
    ? `\n\t\t\t\t\t<div class="post-meta-inner">\n\t\t\t\t<span class="cat-links meta-common dot">\n` +
      e.categories.map((c) =>
        `\t\t\t\t\t\t\t\t\t\t\t<a \n\t\t\t\t\t\thref="${c.url}" \n\t\t\t\t\t\trel="category tag">\n\t\t\t\t\t\t\t${esc(c.name)}\t\t\t\t\t\t</a>\n`).join('') +
      `\t\t\t\t\t\t\t\t\t</span>\n\t\t\t</div>\n`
    : '\n\t\t';
  return `<article id="post-${e.id}" class="post-${e.id} ${e.classes}" >
	<div class="blog-post-lay">
        <div class="post-content">
			<div class="entry-content-main-wrap">
						<figure class="rishi-featured-image image-contain ">
			<a class="post-thumbnail" href="${e.url}" title=${esc(e.image ? e.image.alt : e.title)}>${imageTag(e.image)}</a>		</figure>
	${cats}		<h2 class="entry-title"><a href="${e.url}" rel="bookmark">${esc(e.title)}</a></h2>			<div class="post-meta-wrapper">
				<div class="post-meta-inner dot" data-position="First">
							<span class="posted-by author vcard meta-common"   >
			By<span class="author vcard"><a class= url fn n href="${SITE}/author/shanimazhar82gmail-com/" ><span >info@theburgerboxes.com</span></a></span>		</span>
		<span class="posted-on meta-common"><time class="entry-date published updated" datetime="${e.date}" >${e.dateDisplay}</time><time class="updated" datetime="${e.modified}" >${e.modifiedDisplay}</time></span><span class="comment-link-wrap meta-common"><a href="${e.url}#respond">Write a Comment<span class="screen-reader-text"> on ${esc(e.title)}</span></a></span>				</div>
			</div>
												<div class="entry-content-wrap clear" >
										${e.excerpt}
									</div><!-- .entry-content -->
									<span class="blank-space" data-position="First"></span>		<footer class="entry-footer rishi-flex">
			<div class="readmore-btn-wrap"><a href="${e.url}" class="btn-readmore" data-arrow="yes">Read More</a></div>		</footer><!-- .entry-footer -->
					</div><!-- .entry-content-main-wrap -->
		</div><!-- .post-content -->
	</div><!-- .blog-post-lay -->
</article><!-- #post-## search-->`;
}

function pageLink(n, query, label, cls, aria) {
  const href = `${SITE}${n === 1 ? '/' : `/page/${n}/`}?s=${encodeURIComponent(query).replace(/%20/g, '+')}`;
  return `<a ${aria ? `aria-label="${aria}" ` : ''}class="${cls}" href="${href}">${label}</a>`;
}

function pagination(total, current, query) {
  const last = Math.ceil(total / PER_PAGE);
  if (last <= 1) return '';
  const numbers = new Set([1, last, current, current - 1, current + 1]);
  const shown = [...numbers].filter((n) => n >= 1 && n <= last).sort((a, b) => a - b);
  const parts = [];
  if (current > 1) parts.push(pageLink(current - 1, query, 'Previous', 'prev page-numbers'));
  let prev = 0;
  for (const n of shown) {
    if (prev && n - prev > 1) parts.push('<span class="page-numbers dots">&hellip;</span>');
    parts.push(n === current
      ? `<span aria-label="Page ${n}" aria-current="page" class="page-numbers current"><span class="meta-nav screen-reader-text">Page </span>${n}</span>`
      : pageLink(n, query, `<span class="meta-nav screen-reader-text">Page </span>${n}`, 'page-numbers', `Page ${n}`));
    prev = n;
  }
  if (current < last) parts.push(pageLink(current + 1, query, 'Next', 'next page-numbers'));
  return `\n\t<nav class="navigation pagination" aria-label="Posts pagination">\n` +
    `\t\t<h2 class="screen-reader-text">Posts pagination</h2>\n` +
    `\t\t<div class="nav-links">${parts.join('\n')}</div>\n\t</nav>\t\t`;
}

export default function handler(req, res) {
  const url = new URL(req.url, SITE);
  const query = url.searchParams.get('s') || '';
  const m = url.pathname.match(/^\/page\/(\d+)\/?$/);
  const current = Math.max(1, m ? parseInt(m[1], 10) : 1);

  const hits = search(query);
  const start = (current - 1) * PER_PAGE;
  const shown = hits.slice(start, start + PER_PAGE);

  const pageUrl = `${SITE}${current === 1 ? '/' : `/page/${current}/`}?s=${encodeURIComponent(query).replace(/%20/g, '+')}`;
  const title = `You searched for ${query} - The Burger Boxes`;
  const head = template.head
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${SITE}/search/${esc(query)}/$2`)
    .replace(/(<link rel="alternate"[^>]*Search Results for[^>]*>)/,
      `<link rel="alternate" type="application/rss+xml" title="The Burger Boxes &raquo; Search Results for &#8220;${esc(query)}&#8221; Feed" href="${SITE}/search/${encodeURIComponent(query).replace(/%20/g, '+')}/feed/rss2/" />`);

  const content = template.content;
  const first = content.indexOf('<article id="post-');
  const lastMarker = '</article><!-- #post-## search-->';
  const last = content.lastIndexOf(lastMarker) + lastMarker.length;
  const navStart = content.indexOf('<nav class="navigation pagination"', last);
  const navEnd = content.indexOf('</nav>', navStart) + '</nav>\t\t'.length;

  const prefix = content.slice(0, first)
    .replace(/Search Result for:  [^<]*/, `Search Result for:  ${esc(query)}`)
    .replace(/(<input type="search" class="search-field" placeholder="Search" value=")[^"]*(")/,
      `$1${esc(query)}$2`)
    .replace(/Showing \d+ of \d+ Results/, `Showing ${shown.length} of ${hits.length} Results`);
  const between = content.slice(last, navStart >= 0 ? navStart : navEnd);
  const suffix = content.slice(navEnd >= 0 && navStart >= 0 ? navEnd : last);

  const body = prefix + shown.map(card).join('\n') + between +
    pagination(hits.length, current, query) + suffix;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, follow');
  res.status(200).send(renderDocument({ ...template, url: pageUrl }, body));
}
