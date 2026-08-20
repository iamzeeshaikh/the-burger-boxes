/*
 * Cart and Cash-on-Delivery checkout.
 *
 * The live WordPress site links Add To Cart at /?add-to-cart=<id>, which its
 * server returned 410 Gone for -- the button was broken for every visitor. The
 * migration was asked to make it work, so the cart lives in localStorage and
 * the order is emailed by /api/order.
 *
 * The markup below is WooCommerce's own classic cart / checkout /
 * order-received markup, because the theme's stylesheets already style those
 * classes -- nothing new is designed here.
 *
 * Prices, product ids, SKUs, names and thumbnails all come from
 * src/data/catalogue.json, which is generated from the captured product pages.
 */
(function () {
  'use strict';

  var STORE_KEY = 'tbb_cart';
  var ORDER_KEY = 'tbb_last_order';
  var catalogue = null;

  // ------------------------------------------------------------------ state
  function read() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      var out = {};
      for (var id in raw) {
        var q = parseInt(raw[id], 10);
        if (q > 0) out[id] = q;
      }
      return out;
    } catch (e) {
      return {};
    }
  }

  function write(cart) {
    localStorage.setItem(STORE_KEY, JSON.stringify(cart));
    document.dispatchEvent(new CustomEvent('tbb:cart-changed'));
  }

  function add(id, qty) {
    var cart = read();
    cart[id] = (cart[id] || 0) + (qty || 1);
    write(cart);
  }

  function lines() {
    var cart = read();
    var out = [];
    for (var id in cart) {
      var p = catalogue.products[id];
      if (!p) continue;
      out.push({ product: p, qty: cart[id], total: p.price * cart[id] });
    }
    out.sort(function (a, b) { return a.product.name.localeCompare(b.product.name); });
    return out;
  }

  function subtotal(ls) {
    return ls.reduce(function (t, l) { return t + l.total; }, 0);
  }

  function count(ls) {
    return ls.reduce(function (t, l) { return t + l.qty; }, 0);
  }

  // ----------------------------------------------------------------- render
  function money(amount) {
    return '<span class="woocommerce-Price-amount amount"><bdi>' +
      '<span class="woocommerce-Price-currencySymbol">' + catalogue.currencySymbol +
      '</span>' + amount.toFixed(catalogue.decimals) + '</bdi></span>';
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function cartTable(ls) {
    // .rishi-cart-wrapper is the container the theme scopes its cart table,
    // thumbnail and totals styling to
    return '<div class="rishi-cart-wrapper">' +
      '<form class="woocommerce-cart-form" method="post">' +
      '<table class="shop_table shop_table_responsive cart woocommerce-cart-form__contents">' +
      '<thead><tr>' +
      '<th class="product-remove">&nbsp;</th>' +
      '<th class="product-thumbnail">&nbsp;</th>' +
      '<th class="product-name">Product</th>' +
      '<th class="product-price">Price</th>' +
      '<th class="product-quantity">Quantity</th>' +
      '<th class="product-subtotal">Subtotal</th>' +
      '</tr></thead><tbody>' +
      ls.map(function (l) {
        return '<tr class="woocommerce-cart-form__cart-item cart_item" data-id="' + l.product.id + '">' +
          '<td class="product-remove"><a href="#" class="remove" aria-label="Remove ' +
            esc(l.product.name) + ' from your cart" data-remove="' + l.product.id + '">&times;</a></td>' +
          '<td class="product-thumbnail"><a href="' + l.product.url + '">' +
            '<img width="100" height="100" src="' + l.product.image + '" class="attachment-woocommerce_thumbnail" alt="' +
            esc(l.product.name) + '" loading="lazy" /></a></td>' +
          '<td class="product-name" data-title="Product"><a href="' + l.product.url + '">' +
            esc(l.product.name) + '</a></td>' +
          '<td class="product-price" data-title="Price">' + money(l.product.price) + '</td>' +
          '<td class="product-quantity" data-title="Quantity"><div class="quantity">' +
            '<label class="screen-reader-text" for="qty-' + l.product.id + '">' +
            esc(l.product.name) + ' quantity</label>' +
            '<input type="number" id="qty-' + l.product.id + '" class="input-text qty text" ' +
            'step="1" min="1" name="qty[' + l.product.id + ']" value="' + l.qty + '" ' +
            'data-qty="' + l.product.id + '" /></div></td>' +
          '<td class="product-subtotal" data-title="Subtotal">' + money(l.total) + '</td>' +
        '</tr>';
      }).join('') +
      '<tr><td colspan="6" class="actions">' +
        '<button type="button" class="button" name="update_cart" data-update-cart>Update cart</button>' +
      '</td></tr>' +
      '</tbody></table></form>' +
      '<div class="cart-collaterals"><div class="cart_totals">' +
        '<h2>Cart totals</h2>' +
        '<table cellspacing="0" class="shop_table shop_table_responsive">' +
        '<tbody>' +
        '<tr class="cart-subtotal"><th>Subtotal</th><td data-title="Subtotal">' +
          money(subtotal(ls)) + '</td></tr>' +
        '<tr class="order-total"><th>Total</th><td data-title="Total"><strong>' +
          money(subtotal(ls)) + '</strong></td></tr>' +
        '</tbody></table>' +
        '<div class="wc-proceed-to-checkout">' +
          '<a href="/checkout/" class="checkout-button button alt wc-forward">Proceed to checkout</a>' +
        '</div>' +
      '</div></div></div>';
  }

  function reviewTable(ls) {
    return '<table class="shop_table woocommerce-checkout-review-order-table">' +
      '<thead><tr><th class="product-name">Product</th>' +
      '<th class="product-total">Subtotal</th></tr></thead><tbody>' +
      ls.map(function (l) {
        return '<tr class="cart_item"><td class="product-name">' + esc(l.product.name) +
          ' <strong class="product-quantity">&times;&nbsp;' + l.qty + '</strong></td>' +
          '<td class="product-total">' + money(l.total) + '</td></tr>';
      }).join('') +
      '</tbody><tfoot>' +
      '<tr class="cart-subtotal"><th>Subtotal</th><td>' + money(subtotal(ls)) + '</td></tr>' +
      '<tr class="order-total"><th>Total</th><td><strong>' + money(subtotal(ls)) + '</strong></td></tr>' +
      '</tfoot></table>';
  }

  // -------------------------------------------------------------- cart page
  function renderCart() {
    var root = document.querySelector('.wp-block-woocommerce-cart');
    if (!root) return;
    var empty = root.querySelector('.wp-block-woocommerce-empty-cart-block');
    var filled = document.getElementById('tbb-cart-filled');
    var ls = lines();

    if (!ls.length) {
      if (filled) filled.remove();
      if (empty) empty.style.removeProperty('display');
      return;
    }
    if (empty) empty.style.display = 'none';
    if (!filled) {
      filled = document.createElement('div');
      filled.id = 'tbb-cart-filled';
      filled.className = 'woocommerce';
      root.appendChild(filled);
    }
    filled.innerHTML = cartTable(ls);
  }

  // ---------------------------------------------------------- checkout page
  function billingField(id, label, type, required, opts) {
    var wide = opts && opts.wide;
    return '<p class="form-row ' + (wide ? 'form-row-wide' : 'form-row-first') +
      ' validate-required" id="' + id + '_field">' +
      '<label for="' + id + '">' + label +
      (required ? ' <abbr class="required" title="required">*</abbr>' : ' <span class="optional">(optional)</span>') +
      '</label><span class="woocommerce-input-wrapper">' +
      (type === 'textarea'
        ? '<textarea name="' + id + '" id="' + id + '" class="input-text" rows="3"></textarea>'
        : '<input type="' + type + '" class="input-text" name="' + id + '" id="' + id + '"' +
          (required ? ' required' : '') + ' autocomplete="off" />') +
      '</span></p>';
  }

  function renderCheckout() {
    var root = document.getElementById('tbb-checkout');
    if (!root) return;
    var ls = lines();

    if (!ls.length) {
      root.innerHTML = '<div class="woocommerce"><div class="woocommerce-notices-wrapper">' +
        '<div class="woocommerce-info">Your cart is currently empty.</div></div>' +
        '<p><a class="button wc-backward" href="/products/">Return to shop</a></p></div>';
      return;
    }

    root.innerHTML = '<div class="woocommerce">' +
      '<div class="woocommerce-notices-wrapper" id="tbb-checkout-notices"></div>' +
      // novalidate so the WooCommerce-style error notice is shown instead of
      // only the browser's own tooltip; :invalid still drives the check
      '<form name="checkout" method="post" novalidate class="checkout woocommerce-checkout" id="tbb-checkout-form">' +
      '<div class="col2-set" id="customer_details"><div class="col-1">' +
        '<div class="woocommerce-billing-fields"><h3>Billing details</h3>' +
        '<div class="woocommerce-billing-fields__field-wrapper">' +
          billingField('billing_first_name', 'First name', 'text', true) +
          billingField('billing_last_name', 'Last name', 'text', true) +
          billingField('billing_company', 'Company name', 'text', false, { wide: true }) +
          billingField('billing_address_1', 'Street address', 'text', true, { wide: true }) +
          billingField('billing_city', 'Town / City', 'text', true, { wide: true }) +
          billingField('billing_state', 'State / County', 'text', true) +
          billingField('billing_postcode', 'Postcode / ZIP', 'text', true) +
          billingField('billing_country', 'Country / Region', 'text', true, { wide: true }) +
          billingField('billing_phone', 'Phone', 'tel', true) +
          billingField('billing_email', 'Email address', 'email', true) +
        '</div></div></div>' +
        '<div class="col-2"><div class="woocommerce-additional-fields">' +
          '<h3>Additional information</h3>' +
          '<div class="woocommerce-additional-fields__field-wrapper">' +
          billingField('order_comments', 'Order notes', 'textarea', false, { wide: true }) +
          '</div></div></div>' +
      '</div>' +
      '<div class="form-order-wrapper">' +
      '<h3 id="order_review_heading" class="order_review_heading">Your order</h3>' +
      '<div id="order_review" class="woocommerce-checkout-review-order">' +
        reviewTable(ls) +
        '<div id="payment" class="woocommerce-checkout-payment">' +
          '<ul class="wc_payment_methods payment_methods methods">' +
            '<li class="wc_payment_method payment_method_cod">' +
              '<input id="payment_method_cod" type="radio" class="input-radio" ' +
                'name="payment_method" value="cod" checked="checked" />' +
              '<label for="payment_method_cod">Cash on delivery</label>' +
              '<div class="payment_box payment_method_cod"><p>Pay with cash upon delivery.</p></div>' +
            '</li>' +
          '</ul>' +
          '<div class="form-row place-order">' +
            '<button type="submit" class="button alt woocommerce-Button" ' +
              'name="woocommerce_checkout_place_order" id="place_order" ' +
              'value="Place order">Place order</button>' +
          '</div>' +
        '</div>' +
      '</div></div></form></div>';

    document.getElementById('tbb-checkout-form')
      .addEventListener('submit', placeOrder);
  }

  function placeOrder(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var notices = document.getElementById('tbb-checkout-notices');
    notices.innerHTML = '';

    var invalid = form.querySelectorAll(':invalid');
    if (invalid.length) {
      Array.prototype.forEach.call(form.querySelectorAll('.woocommerce-invalid'), function (n) {
        n.classList.remove('woocommerce-invalid');
      });
      Array.prototype.forEach.call(invalid, function (field) {
        var row = field.closest('.form-row');
        if (row) row.classList.add('woocommerce-invalid');
      });
      notices.innerHTML = '<ul class="woocommerce-error" role="alert"><li>' +
        'Please fill in the required fields before placing your order.</li></ul>';
      invalid[0].focus();
      return;
    }

    var button = document.getElementById('place_order');
    button.disabled = true;
    form.classList.add('processing');

    var ls = lines();
    var payload = {
      items: ls.map(function (l) {
        return { id: l.product.id, sku: l.product.sku, name: l.product.name,
                 url: l.product.url, price: l.product.price, qty: l.qty, total: l.total };
      }),
      total: subtotal(ls),
      paymentMethod: 'cod',
      billing: {},
    };
    Array.prototype.forEach.call(form.querySelectorAll('input, textarea'), function (field) {
      if (field.name && field.name !== 'payment_method') payload.billing[field.name] = field.value;
    });

    fetch('/api/order/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (res) {
        button.disabled = false;
        form.classList.remove('processing');
        if (!res || !res.ok) {
          notices.innerHTML = '<ul class="woocommerce-error" role="alert"><li>' +
            esc((res && res.message) || 'Sorry, your order could not be placed. Please try again.') +
            '</li></ul>';
          notices.scrollIntoView({ block: 'center' });
          return;
        }
        localStorage.setItem(ORDER_KEY, JSON.stringify({
          number: res.orderNumber, date: res.date, items: payload.items,
          total: payload.total, billing: payload.billing,
        }));
        write({});
        location.assign('/checkout/order-received/');
      })
      .catch(function () {
        button.disabled = false;
        form.classList.remove('processing');
        notices.innerHTML = '<ul class="woocommerce-error" role="alert"><li>' +
          'Sorry, your order could not be placed. Please try again.</li></ul>';
      });
  }

  // --------------------------------------------------------- order received
  function renderOrderReceived() {
    var root = document.getElementById('tbb-order-received');
    if (!root) return;
    var order;
    try { order = JSON.parse(localStorage.getItem(ORDER_KEY) || 'null'); } catch (e) { order = null; }
    if (!order) {
      root.innerHTML = '<div class="woocommerce"><div class="woocommerce-notices-wrapper">' +
        '<div class="woocommerce-info">No recent order to show.</div></div>' +
        '<p><a class="button wc-backward" href="/products/">Return to shop</a></p></div>';
      return;
    }
    var name = [order.billing.billing_first_name, order.billing.billing_last_name]
      .filter(Boolean).join(' ');
    root.innerHTML = '<div class="woocommerce"><div class="woocommerce-order">' +
      '<p class="woocommerce-notice woocommerce-notice--success woocommerce-thankyou-order-received">' +
        'Thank you. Your order has been received.</p>' +
      '<ul class="woocommerce-order-overview woocommerce-thankyou-order-details order_details">' +
        '<li class="woocommerce-order-overview__order order">Order number: <strong>' +
          esc(order.number) + '</strong></li>' +
        '<li class="woocommerce-order-overview__date date">Date: <strong>' +
          esc(order.date) + '</strong></li>' +
        '<li class="woocommerce-order-overview__email email">Email: <strong>' +
          esc(order.billing.billing_email || '') + '</strong></li>' +
        '<li class="woocommerce-order-overview__total total">Total: <strong>' +
          money(order.total) + '</strong></li>' +
        '<li class="woocommerce-order-overview__payment-method method">Payment method: <strong>' +
          'Cash on delivery</strong></li>' +
      '</ul>' +
      '<p>Pay with cash upon delivery.</p>' +
      '<section class="woocommerce-order-details"><h2 class="woocommerce-order-details__title">Order details</h2>' +
        '<table class="woocommerce-table woocommerce-table--order-details shop_table order_details">' +
        '<thead><tr><th class="woocommerce-table__product-name product-name">Product</th>' +
        '<th class="woocommerce-table__product-table product-total">Total</th></tr></thead><tbody>' +
        order.items.map(function (i) {
          return '<tr class="woocommerce-table__line-item order_item">' +
            '<td class="woocommerce-table__product-name product-name">' +
              '<a href="' + i.url + '">' + esc(i.name) + '</a> ' +
              '<strong class="product-quantity">&times;&nbsp;' + i.qty + '</strong></td>' +
            '<td class="woocommerce-table__product-total product-total">' + money(i.total) + '</td></tr>';
        }).join('') +
        '</tbody><tfoot>' +
        '<tr><th scope="row">Subtotal:</th><td>' + money(order.total) + '</td></tr>' +
        '<tr><th scope="row">Payment method:</th><td>Cash on delivery</td></tr>' +
        '<tr><th scope="row">Total:</th><td>' + money(order.total) + '</td></tr>' +
        '</tfoot></table></section>' +
      '<section class="woocommerce-customer-details">' +
        '<h2 class="woocommerce-column__title">Billing address</h2>' +
        '<address>' + esc(name) + '<br />' +
          (order.billing.billing_company ? esc(order.billing.billing_company) + '<br />' : '') +
          esc(order.billing.billing_address_1 || '') + '<br />' +
          esc(order.billing.billing_city || '') + ' ' + esc(order.billing.billing_state || '') + ' ' +
          esc(order.billing.billing_postcode || '') + '<br />' +
          esc(order.billing.billing_country || '') +
          '<p class="woocommerce-customer-details--phone">' + esc(order.billing.billing_phone || '') + '</p>' +
          '<p class="woocommerce-customer-details--email">' + esc(order.billing.billing_email || '') + '</p>' +
        '</address></section>' +
      '</div></div>';
  }

  // -------------------------------------------------------------- behaviour
  function addToCartHref(link) {
    var m = (link.getAttribute('href') || '').match(/[?&]add-to-cart=(\d+)/);
    if (m) return m[1];
    return link.dataset.product_id || null;
  }

  function redirectFor(link) {
    // Elementor's product-page button carries ?e-redirect=<url>; WooCommerce
    // sent the shopper there after adding. Archive buttons have no redirect.
    var m = (link.getAttribute('href') || '').match(/[?&]e-redirect=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function wire() {
    // capture phase: WooCommerce's own add-to-cart.min.js delegates from
    // document.body, so stopping propagation here keeps it from firing an
    // AJAX request at an endpoint that no longer exists.
    document.addEventListener('click', function (e) {
      var link = e.target.closest && e.target.closest('a[href*="add-to-cart="], a.add_to_cart_button');
      if (link) {
        var id = addToCartHref(link);
        if (id && catalogue.products[id]) {
          e.preventDefault();
          e.stopImmediatePropagation();
          var qty = parseInt(link.dataset.quantity || '1', 10) || 1;
          add(id, qty);
          var to = redirectFor(link);
          if (to) { location.assign(to.replace(/^https?:\/\/[^/]+/, '')); return; }
          link.classList.add('added');
          if (!link.parentNode.querySelector('.added_to_cart')) {
            var view = document.createElement('a');
            view.href = '/cart/';
            view.className = 'added_to_cart wc-forward';
            view.title = 'View cart';
            view.textContent = 'View cart';
            link.parentNode.insertBefore(view, link.nextSibling);
          }
        }
        return;
      }
      var remove = e.target.closest && e.target.closest('[data-remove]');
      if (remove) {
        e.preventDefault();
        var cart = read();
        delete cart[remove.dataset.remove];
        write(cart);
        return;
      }
      if (e.target.closest && e.target.closest('[data-update-cart]')) {
        e.preventDefault();
        var next = read();
        Array.prototype.forEach.call(document.querySelectorAll('[data-qty]'), function (input) {
          var q = parseInt(input.value, 10);
          if (q > 0) next[input.dataset.qty] = q;
          else delete next[input.dataset.qty];
        });
        write(next);
      }
    }, true);

    document.addEventListener('tbb:cart-changed', function () {
      renderCart();
      renderCheckout();
    });
  }

  fetch('/assets/catalogue.json')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      catalogue = data;
      wire();
      renderCart();
      renderCheckout();
      renderOrderReceived();
    })
    .catch(function (err) { console.error('cart catalogue failed to load', err); });
})();
