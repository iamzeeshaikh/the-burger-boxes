// The live server answers 410 Gone for any URL carrying an add-to-cart
// parameter (an .htaccess rule the site owner added); this reproduces it,
// body and all, so those URLs keep the status search engines already have.
export default function handler(req, res) {
  res.status(410);
  res.setHeader('Content-Type', 'text/html; charset=iso-8859-1');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.send('<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">\n' +
    '<html><head>\n<title>410 Gone</title>\n</head><body>\n<h1>Gone</h1>\n' +
    '<p>The requested resource is no longer available on this server and there is no forwarding address.\n' +
    'Please remove all references to this resource.</p>\n</body></html>\n');
}
