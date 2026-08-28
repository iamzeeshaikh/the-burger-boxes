// A quote block for the product-category archives.
//
// WordPress gave the seven /product-category/ pages no form at all -- the
// nearest call to action was the footer "Contact Us" link at 97% scroll depth.
// Those pages carry 15,668 search impressions between them, so they are the
// site's largest lead-capture gap. The block reuses the homepage's Instant
// Quote widget (form b0c910d) verbatim, so the endpoint, honeypot, reCAPTCHA
// and thank-you redirect all behave exactly as they do everywhere else.
import form from '../data/quote-form.html?raw';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The category name, read from the archive's own H1. */
function categoryName(page) {
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(page.content);
  const text = h1 ? h1[1].replace(/<[^>]+>/g, '').trim() : '';
  return text || 'Burger Boxes';
}

export function quoteSection(page) {
  const name = categoryName(page);
  // Names the source page in the enquiry email, the way Elementor's own
  // referer_title does on every other form.
  const body = form.replace('%%TITLE%%', esc(`${name} - The Burger Boxes`));

  return `<section class="tbb-quote-section" aria-labelledby="tbb-quote-heading">
	<div class="tbb-quote-inner">
		<div class="tbb-quote-intro">
			<h2 id="tbb-quote-heading">Get a Free Quote on ${esc(name)}</h2>
			<p>Tell us the size, style and quantity you need and we will come back with wholesale pricing and a production timeline. Free design and free shipping on every order.</p>
			<ul class="tbb-quote-points">
				<li>Custom sizes and styles, made to your dimensions</li>
				<li>Gloss, matte and spot UV finishes</li>
				<li>Free design service and free shipping</li>
			</ul>
			<p class="tbb-quote-call">Prefer to talk it through? Call <a href="tel:+15033580443">(503) 358-0443</a>.</p>
		</div>
		<div class="tbb-quote-form">${body}</div>
	</div>
</section>`;
}
