// Stand-in for wp-comments-post.php, the endpoint WooCommerce's review form
// posts to. WordPress holds every submission for moderation (the store requires
// a previously approved comment, and none of the 557 submissions in the backup
// was ever approved), so nothing was ever published from it. Here the review is
// emailed to the store instead of being dropped, and the visitor is returned to
// the product page -- the same outcome they see today: their review does not
// appear.
import nodemailer from 'nodemailer';

const SITE = 'https://theburgerboxes.com';
const LEAD_RECIPIENTS = ['shanimazhar82@gmail.com', 'dev@zeecustomboxes.com'];

function readForm(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 200000) reject(new Error('payload too large'));
    });
    req.on('end', () => resolve(new URLSearchParams(raw)));
    req.on('error', reject);
  });
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).send('');
  }

  let form;
  try {
    form = await readForm(req);
  } catch {
    return res.status(400).send('');
  }

  const comment = (form.get('comment') || '').trim();
  const author = (form.get('author') || '').trim();
  const email = (form.get('email') || '').trim();
  const rating = (form.get('rating') || '').trim();
  const postId = (form.get('comment_post_ID') || '').trim();
  const referer = req.headers.referer || SITE;

  if (!comment || !author || !email) {
    return res.status(400).send('<p>Error: please fill the required fields (name, email, review).</p>');
  }

  const rows = [['Product ID', postId], ['Rating', rating], ['Name', author],
                ['Email', email], ['Page', referer], ['Review', comment]];
  try {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transport.sendMail({
      from: `"${process.env.MAIL_FROM_NAME || 'The Burger Boxes'}" <${process.env.MAIL_FROM_EMAIL}>`,
      to: LEAD_RECIPIENTS,
      replyTo: email,
      subject: 'New product review awaiting moderation',
      text: rows.map(([k, v]) => `${k}: ${v}`).join('\n'),
      html: '<table cellpadding="6" cellspacing="0" border="0">' +
        rows.map(([k, v]) => `<tr><td><strong>${esc(k)}</strong></td><td>${esc(v)}</td></tr>`).join('') +
        '</table>',
    });
  } catch (err) {
    console.error('review email failed', err);
  }

  // back to the product page, the way WordPress redirects after a submission
  const back = referer.split('#')[0] + '#respond';
  res.setHeader('Location', back);
  return res.status(302).send('');
}
