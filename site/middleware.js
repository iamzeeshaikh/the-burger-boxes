// Vercel routes redirects, then the filesystem, then rewrites -- so a rule that
// has to beat an existing file (the 410 for add-to-cart URLs, and /?s= search
// results, which both live at paths that resolve to real pages) must run in
// middleware instead.
import { rewrite, next } from '@vercel/edge';

export const config = {
  // every page path; static assets are left alone
  matcher: '/((?!wp-content/|wp-includes/|wp-admin/|assets/|api/|favicon).*)',
};

export default function middleware(request) {
  const url = new URL(request.url);

  // .htaccess on the WordPress server returns 410 Gone for every add-to-cart URL
  if (url.searchParams.has('add-to-cart')) {
    return rewrite(new URL('/api/gone', url));
  }

  // WordPress' search results, including their /page/N/?s= pagination
  if (url.searchParams.has('s') &&
      (url.pathname === '/' || /^\/page\/\d+\/$/.test(url.pathname))) {
    return rewrite(new URL('/api/search' + url.search, url));
  }

  return next();
}
