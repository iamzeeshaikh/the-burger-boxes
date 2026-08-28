// The cart's copy of the catalogue.
//
// This used to be a second, hand-maintained file in public/assets/. It drifted:
// when every product moved to one unit price, src/data/catalogue.json was
// updated and the public copy was not, so the pages quoted one price and the
// cart charged another. Serving it from the same module the pages read makes
// that impossible.
import type { APIRoute } from 'astro';
import catalogue from '../../data/catalogue.json';

export const GET: APIRoute = () =>
  new Response(JSON.stringify(catalogue), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Prices live in here; it must never be cached as immutable.
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
