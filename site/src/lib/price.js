// "Starting from" pricing.
//
// Two problems with how the migration inherited prices. The grids print a bare
// "$0.20", which reads as the price of a box rather than the unit price a
// wholesale run starts at. And the product pages themselves print no price at
// all, while their Product schema declares one -- a page whose markup claims a
// price the page never shows is exactly the mismatch Merchant Center flags.
//
// Both are fixed by saying the true thing in one voice: the figure is where
// pricing starts, and it appears on the page as well as in the schema. Prices
// come from catalogue.json per product (49 start at $0.20, 20 at $0.50), never
// from a hard-coded figure.
import catalogue from '../data/catalogue.json' with { type: 'json' };

const bySlug = Object.fromEntries(
  Object.values(catalogue.products).map((p) => [p.slug, p]));

const money = (n) => catalogue.currencySymbol + Number(n).toFixed(catalogue.decimals);

const LABEL = 'Starting from';

/** The grid tiles: a bare amount becomes a labelled from-price. */
function labelGridPrices(html) {
  return html.replaceAll(
    '<span class="price"><span class="woocommerce-Price-amount amount">',
    `<span class="price"><span class="tbb-from-label">${LABEL}</span>` +
    '<span class="woocommerce-Price-amount amount">');
}

/** The product page: a from-price line of its own, under the title. */
function productPriceLine(product) {
  return `<div class="tbb-price-line">` +
    `<span class="tbb-price-label">${LABEL}</span> ` +
    `<span class="tbb-price-amount">${money(product.price)}</span> ` +
    `<span class="tbb-price-unit">per unit</span>` +
    `<p class="tbb-price-note">Unit price falls as the quantity goes up. ` +
    `Send us your size and quantity for a firm wholesale quote.</p>` +
    `</div>`;
}

const SHORT_DESC = '<div class="woocommerce-product-details__short-description">';

export function applyPricing(html, route) {
  let out = labelGridPrices(html);

  if (!route.startsWith('/product/')) return out;
  const product = bySlug[route.split('/')[2]];
  if (!product) return out;

  const line = productPriceLine(product);

  // Under the title and rating, above the description -- where a shopper looks
  // for it. One product (paper-food-trays) has no short description, so the
  // heading itself is the fallback anchor.
  const at = out.indexOf(SHORT_DESC);
  if (at !== -1) return out.slice(0, at) + line + out.slice(at);

  const h1 = out.indexOf('</h1>');
  if (h1 !== -1) return out.slice(0, h1 + 5) + line + out.slice(h1 + 5);

  return out;
}
