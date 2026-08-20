import chrome from '../data/chrome.json' with { type: 'json' };
import { rewrite } from './site.js';

const TAG_SPLIT = /(<[^>]+>)/;

const tokens = {
  header: chrome.header.split(TAG_SPLIT),
  offcanvas: chrome.offcanvas.split(TAG_SPLIT),
  footer: chrome.footer.split(TAG_SPLIT),
};

/**
 * Rebuild a chrome region for one page.
 *
 * Header, off-canvas drawer and footer are byte-identical across the site apart
 * from menu state (current-menu-item and friends, aria-current) and the
 * loading / fetchpriority hints WordPress recomputes per page. `chromeDiff`
 * holds those differing tags by position, so one shared markup blob reproduces
 * every page exactly.
 */
export function region(name, page) {
  const diff = page.chromeDiff?.[name];
  if (!diff) return rewrite(chrome[name]);
  const out = tokens[name].slice();
  for (const [i, tag] of Object.entries(diff)) out[i] = tag;
  return rewrite(out.join(''));
}

export const skipLink = rewrite(chrome.skip);

export function joinchat(page) {
  return rewrite(chrome.joinchat).replace('%%JC%%', rewrite(page.joinchatSettings));
}
