// Cache-busted URLs for the two assets that carry live data.
//
// /assets/cart.js and /assets/catalogue.json are served from stable paths but
// their contents change with the catalogue, and they were going out with
// `max-age=31536000, immutable`. A stale cart.js kept adding a quantity of 1
// after the minimum order became 100, and it would have kept doing so for a
// year. The response headers are fixed in vercel.json; this version tag is what
// gets the new file to browsers and edges that already hold the old one.
import { createHash } from 'node:crypto';
import cartJs from '../../public/assets/cart.js?raw';
import catalogue from '../data/catalogue.json' with { type: 'json' };

const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 8);

export const CATALOGUE_URL = `/assets/catalogue.json?v=${hash(JSON.stringify(catalogue))}`;
export const CART_JS_URL = `/assets/cart.js?v=${hash(cartJs + CATALOGUE_URL)}`;
