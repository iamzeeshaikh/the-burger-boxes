// Pricing and minimum order quantity.
//
// Three things the migration inherited that no longer match how the business
// sells. The grids printed a bare amount, which reads as the price of one box
// rather than the unit price a wholesale run starts at. The product pages
// printed no price at all while their Product schema declared one -- a page
// whose markup claims a price it never shows is the mismatch Merchant Center
// looks for. And add-to-cart offered a quantity of 1 on a business with a
// wholesale minimum.
//
// The site now quotes one unit price for every product, held in catalogue.json,
// and every surface -- grids, product pages, the JSON-LD offer, the Merchant
// feed and the cart -- reads from it, so none of them can drift apart.
import catalogue from '../data/catalogue.json' with { type: 'json' };

const bySlug = Object.fromEntries(
  Object.values(catalogue.products).map((p) => [p.slug, p]));

/** Minimum order quantity. Mirrored in public/assets/cart.js as MOQ. */
export const MOQ = 100;

// One price across the catalogue is a deliberate decision, not a coincidence,
// and the markup rewrites below depend on it: a captured amount is replaced
// without first working out which product's tile it sits in. If the catalogue
// ever carries more than one price again, fail the build rather than print a
// figure that is wrong on some of the tiles.
const prices = [...new Set(Object.values(catalogue.products).map((p) => p.price))];
if (prices.length !== 1) {
  throw new Error(
    `src/lib/price.js expects a single catalogue price, found: ${prices.join(', ')}. ` +
    'Rewrite the grid/schema replacements to resolve the price per product first.');
}
const PRICE = prices[0];

const money = (n) => catalogue.currencySymbol + Number(n).toFixed(catalogue.decimals);
const amount = money(PRICE);
const LABEL = 'Starting from';

/** Grid tiles: label the amount, and correct any figure the capture froze in. */
function labelGridPrices(html) {
  return html
    .replace(
      /(<span class="woocommerce-Price-currencySymbol" translate="no">&#36;<\/span>)[\d.,]+/g,
      `$1${Number(PRICE).toFixed(catalogue.decimals)}`)
    .replaceAll(
      '<span class="price"><span class="woocommerce-Price-amount amount">',
      `<span class="price"><span class="tbb-from-label">${LABEL}</span>` +
      '<span class="woocommerce-Price-amount amount">');
}

/** Add-to-cart starts at the minimum run, not at one box. */
function applyMoq(html) {
  return html
    .replace(/data-quantity="\d+"/g, `data-quantity="${MOQ}"`)
    .replace(/(\?|&#038;|&amp;|&)quantity=\d+/g, `$1quantity=${MOQ}`);
}

/** The product page's own from-price, with the minimum stated next to it. */
function productPriceLine() {
  return '<div class="tbb-price-line">' +
    `<span class="tbb-price-label">${LABEL}</span> ` +
    `<span class="tbb-price-amount">${amount}</span> ` +
    '<span class="tbb-price-unit">per unit</span>' +
    `<p class="tbb-price-note">Minimum order ${MOQ} units. Unit price falls as the ` +
    'quantity goes up &mdash; send us your size and quantity for a firm wholesale quote.</p>' +
    '</div>';
}

const SHORT_DESC = '<div class="woocommerce-product-details__short-description">';

/** Page body: prices, the minimum, and the product page's price line. */
export function applyPricing(html, route) {
  let out = applyMoq(labelGridPrices(html));

  if (!route.startsWith('/product/')) return out;
  if (!bySlug[route.split('/')[2]]) return out;

  const line = productPriceLine();
  // Under the title and rating, above the description -- where a buyer looks
  // for it. One product (paper-food-trays) has no short description, so the
  // heading is the fallback anchor.
  const at = out.indexOf(SHORT_DESC);
  if (at !== -1) return out.slice(0, at) + line + out.slice(at);

  const h1 = out.indexOf('</h1>');
  if (h1 !== -1) return out.slice(0, h1 + 5) + line + out.slice(h1 + 5);
  return out;
}

/** The JSON-LD offer in the head, so structured data and page agree. */
export function applySchemaPrice(head) {
  return head.replace(/("price"\s*:\s*")[\d.]+(")/g, `$1${PRICE}$2`);
}
