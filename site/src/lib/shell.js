// Plain-JS twin of layouts/Shell.astro, for the request-time endpoints
// (/?s= search results) that cannot use an Astro component. scripts/audit-shell.mjs
// asserts the two produce identical documents.
import chromeData from '../data/chrome.json' with { type: 'json' };
import { region, skipLink, joinchat } from './chrome.js';
import { rewrite } from './site.js';

const OPEN_MAIN = '<div id="main-container" class="site">\n\t\t\t';
const SEP_HEADER = '\n\t\t\t\t';
const SEP_OFFCANVAS = '\n\t\t\n\t\t';
const SEP_CONTENT = '\n\t\t\t\t\t\t';
const SEP_FOOTER = '\n\t\t\t\t\t\t';
const CLOSE_MAIN = '\n\t\t\t\t</div><!-- #page -->';

export function renderDocument(page, content) {
  const [tailBefore, tailAfter = ''] = rewrite(page.bodyTail).split('<!--JOINCHAT-->');
  return '<!DOCTYPE html>\n<html lang="en-US"><head>' + rewrite(page.head) + '</head>\n\n' +
    '<body class="' + page.bodyClass + '">' +
    rewrite(page.bodyOpen) + OPEN_MAIN + skipLink + SEP_HEADER +
    region('header', page) + SEP_OFFCANVAS + region('offcanvas', page) + SEP_CONTENT +
    content + SEP_FOOTER + region('footer', page) + CLOSE_MAIN +
    tailBefore + joinchat(page) + tailAfter +
    '<script src="/assets/cart.js" defer></script></body>\n</html>';
}

export { chromeData };
