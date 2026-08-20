// Cash-on-delivery order handler.
//
// WooCommerce is not running, so an order is not stored -- it is emailed to the
// store and confirmed to the customer, using the same SMTP account and the same
// "Cash on delivery / Pay with cash upon delivery." wording the store had
// configured. Prices are re-read from the catalogue on the server so the total
// cannot be tampered with from the browser.
import nodemailer from 'nodemailer';
import catalogue from '../src/data/catalogue.json' with { type: 'json' };

const STORE_NAME = 'The Burger Boxes';
const STORE_ADDRESS = '409 N 7th Ave Unit #529 Phoenix, AZ 85013';
const STORE_PHONE = '(503) 358-0443';

const REQUIRED = [
  'billing_first_name', 'billing_last_name', 'billing_address_1', 'billing_city',
  'billing_state', 'billing_postcode', 'billing_country', 'billing_phone', 'billing_email',
];

const LABELS = {
  billing_first_name: 'First name', billing_last_name: 'Last name',
  billing_company: 'Company', billing_address_1: 'Address', billing_city: 'Town / City',
  billing_state: 'State / County', billing_postcode: 'Postcode / ZIP',
  billing_country: 'Country / Region', billing_phone: 'Phone', billing_email: 'Email',
  order_comments: 'Order notes',
};

const money = (n) => catalogue.currencySymbol + Number(n).toFixed(catalogue.decimals);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 1e6) reject(new Error('payload too large'));
    });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, message: 'Method not allowed.' });
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    return res.status(400).json({ ok: false, message: 'Sorry, your order could not be read.' });
  }

  const billing = body.billing || {};
  const missing = REQUIRED.filter((k) => !String(billing[k] || '').trim());
  if (missing.length) {
    return res.status(400).json({
      ok: false,
      message: 'Please fill in the required fields before placing your order.',
    });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(billing.billing_email)) {
    return res.status(400).json({ ok: false, message: 'Please enter a valid email address.' });
  }

  // rebuild the order from the catalogue: never trust prices from the client
  const items = [];
  for (const line of Array.isArray(body.items) ? body.items : []) {
    const product = catalogue.products[String(line.id)];
    const qty = Math.max(1, Math.min(100000, parseInt(line.qty, 10) || 0));
    if (!product || !qty) continue;
    items.push({ ...product, qty, total: product.price * qty });
  }
  if (!items.length) {
    return res.status(400).json({ ok: false, message: 'Your cart is empty.' });
  }
  const total = items.reduce((t, i) => t + i.total, 0);

  const now = new Date();
  const orderNumber = 'TBB-' + now.toISOString().slice(0, 10).replace(/-/g, '') + '-' +
    Math.floor(1000 + Math.random() * 9000);
  const date = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const rows = items.map((i) =>
    `<tr><td>${esc(i.name)} &times; ${i.qty}<br><small>SKU ${esc(i.sku)} &middot; ` +
    `${i.url}</small></td>` +
    `<td align="right">${money(i.total)}</td></tr>`).join('');

  const details = Object.entries(LABELS)
    .filter(([k]) => String(billing[k] || '').trim())
    .map(([k, label]) => `<tr><td><strong>${label}</strong></td><td>${esc(billing[k])}</td></tr>`)
    .join('');

  const orderHtml =
    `<h2>Order ${esc(orderNumber)}</h2>` +
    `<p>${esc(date)} &middot; Payment method: <strong>Cash on delivery</strong></p>` +
    `<table cellpadding="6" cellspacing="0" border="0">${rows}` +
    `<tr><td align="right"><strong>Subtotal</strong></td><td align="right">${money(total)}</td></tr>` +
    `<tr><td align="right"><strong>Total</strong></td><td align="right">${money(total)}</td></tr>` +
    `</table><h3>Billing details</h3>` +
    `<table cellpadding="6" cellspacing="0" border="0">${details}</table>`;

  const text = [
    `Order ${orderNumber}`, date, 'Payment method: Cash on delivery', '',
    ...items.map((i) => `${i.name} x ${i.qty} — ${money(i.total)}`),
    '', `Total: ${money(total)}`, '', 'Billing details',
    ...Object.entries(LABELS)
      .filter(([k]) => String(billing[k] || '').trim())
      .map(([k, label]) => `${label}: ${billing[k]}`),
  ].join('\n');

  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  const from = `"${process.env.MAIL_FROM_NAME || STORE_NAME}" <${process.env.MAIL_FROM_EMAIL}>`;
  // recipients come from the environment; the store's own public address is the
  // fallback so a missing variable can never send orders nowhere
  const storeTo = (process.env.ORDER_TO_OVERRIDE || process.env.ORDER_TO ||
    process.env.MAIL_FROM_EMAIL)
    .split(',').map((s) => s.trim()).filter(Boolean);

  try {
    await transport.sendMail({
      from,
      to: storeTo,
      replyTo: billing.billing_email,
      subject: `[${STORE_NAME}] New order ${orderNumber} — ${money(total)} (Cash on delivery)`,
      text,
      html: orderHtml,
    });
  } catch (err) {
    console.error('order email failed', err);
    return res.status(502).json({
      ok: false,
      message: 'Sorry, your order could not be placed. Please try again or call ' + STORE_PHONE + '.',
    });
  }

  // customer confirmation is best-effort: the order is already with the store
  try {
    await transport.sendMail({
      from,
      to: billing.billing_email,
      subject: `Your ${STORE_NAME} order ${orderNumber}`,
      text: `Thank you. Your order has been received.\n\n${text}\n\n` +
        `Pay with cash upon delivery.\n\n${STORE_NAME}\n${STORE_ADDRESS}\n${STORE_PHONE}`,
      html: `<p>Thank you. Your order has been received.</p>${orderHtml}` +
        `<p>Pay with cash upon delivery.</p>` +
        `<p>${STORE_NAME}<br>${STORE_ADDRESS}<br>${STORE_PHONE}</p>`,
    });
  } catch (err) {
    console.error('customer confirmation failed', err);
  }

  return res.status(200).json({ ok: true, orderNumber, date, total });
}
