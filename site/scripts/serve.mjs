// Local stand-in for the Vercel deployment: serves dist/ with directory
// indexes and applies the same routing rules vercel.json declares, so the QA
// harness exercises the real thing (410 add-to-cart, /?s= search, the
// admin-ajax form endpoint, the order endpoint, redirects).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(process.argv[2] || 'dist');
const PORT = Number(process.argv[3] || 4399);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.xml': 'text/xml; charset=UTF-8',
  '.txt': 'text/plain', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject', '.otf': 'font/otf',
  '.map': 'application/json', '.pdf': 'application/pdf', '.mp4': 'video/mp4',
  '.xsl': 'text/xsl',
};

const REDIRECTS = JSON.parse(fs.readFileSync('src/data/redirects.json', 'utf8'));
const REWRITES = new Map(Object.entries(JSON.parse(fs.readFileSync('src/data/rewrites.json', 'utf8'))));

const handlers = {};
async function handlerFor(name) {
  if (!handlers[name]) handlers[name] = (await import('../api/' + name + '.js')).default;
  return handlers[name];
}

function shim(res) {
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return res; };
  res.send = (b) => { res.end(b); return res; };
  return res;
}

http.createServer(async (req, res) => {
  shim(res);
  const parsed = url.parse(req.url);
  const pathname = decodeURIComponent(parsed.pathname || '/');
  const query = new URLSearchParams(parsed.query || '');

  if (query.has('add-to-cart')) return (await handlerFor('gone'))(req, res);
  if (query.has('s') && (pathname === '/' || /^\/page\/\d+\/$/.test(pathname))) {
    return (await handlerFor('search'))(req, res);
  }
  if (pathname === '/wp-admin/admin-ajax.php') return (await handlerFor('admin-ajax'))(req, res);
  if (pathname === '/api/order' || pathname === '/api/order/') return (await handlerFor('order'))(req, res);

  const redirect = REDIRECTS[pathname];
  if (redirect) {
    res.writeHead(redirect.status, { Location: redirect.to });
    return res.end();
  }
  const rewritten = REWRITES.get(pathname) || pathname;

  let file = path.join(ROOT, rewritten);
  if (rewritten.endsWith('/')) file = path.join(file, 'index.html');
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }

  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const alt = path.join(ROOT, rewritten, 'index.html');
    if (fs.existsSync(alt)) {
      res.writeHead(308, { Location: rewritten + '/' + (parsed.search || '') });
      return res.end();
    }
    const notFound = path.join(ROOT, '404.html');
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.existsSync(notFound) ? fs.readFileSync(notFound) : 'Not found');
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log('serving', ROOT, 'on http://localhost:' + PORT));
