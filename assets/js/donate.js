/* Giving, front end.
   No key, no amount and no card field lives here. The server decides the
   amount, Razorpay's hosted checkout collects the card, and the server
   verifies the result before we say thank you. */
(function () {
  var form = document.querySelector('#give');
  if (!form) return;

  var pills   = form.querySelectorAll('.pill');
  var custom  = form.querySelector('#g-custom');
  var payBtn  = form.querySelector('.g-pay');
  var status  = form.querySelector('.g-status');
  var tier    = 't3000';
  var busy    = false;

  function say(msg, kind) {
    status.textContent = msg;
    status.className = 'g-status' + (kind ? ' ' + kind : '');
    status.hidden = !msg;
  }

  pills.forEach(function (p) {
    p.addEventListener('click', function () {
      pills.forEach(function (q) { q.setAttribute('aria-pressed', 'false'); });
      p.setAttribute('aria-pressed', 'true');
      tier = p.dataset.tier;
      if (custom) custom.value = '';
    });
  });

  if (custom) custom.addEventListener('input', function () {
    if (custom.value.trim()) {
      pills.forEach(function (q) { q.setAttribute('aria-pressed', 'false'); });
      tier = '';
    }
  });

  function payload() {
    var body = {
      name:  (form.querySelector('#g-name')  || {}).value || '',
      email: (form.querySelector('#g-email') || {}).value || '',
      phone: (form.querySelector('#g-phone') || {}).value || ''
    };
    var c = custom && custom.value.trim();
    if (c) {
      var rupees = Math.round(Number(c));
      if (!(rupees >= 100 && rupees <= 500000)) return null;
      body.customPaise = rupees * 100;
    } else {
      body.tier = tier;
    }
    return body;
  }

  function loadCheckout() {
    if (window.Razorpay) return Promise.resolve();
    return new Promise(function (ok, no) {
      var s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.onload = ok;
      s.onerror = function () { no(new Error('script')); };
      document.head.appendChild(s);
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;

    var body = payload();
    if (!body) return say('Please enter an amount between ₹100 and ₹5,00,000.', 'bad');
    if (!body.email && !body.phone) return say('Please give an email or a phone number so we can send your receipt.', 'bad');

    busy = true;
    payBtn.disabled = true;
    say('Preparing a secure payment page…');

    fetch('/api/donate-order', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(function (r) { return r.text().then(function (t) { return { s: r.status, d: t ? JSON.parse(t) : {} }; }); })
      .then(function (o) {
        if (o.s !== 200) throw new Error(o.d.error || 'Could not start the payment.');
        return loadCheckout().then(function () { return o.d; });
      })
      .then(function (d) {
        say('');
        var rz = new Razorpay({
          key: d.keyId,
          order_id: d.orderId,
          amount: d.amount,
          currency: d.currency,
          name: 'Moquim Foundation',
          description: 'Donation',
          image: location.origin + '/assets/img2/mark.png',
          theme: { color: '#9E0F2E' },
          prefill: { name: body.name, email: body.email, contact: body.phone },
          retry: { enabled: false },          // no accidental double charge
          modal: {
            ondismiss: function () {
              busy = false; payBtn.disabled = false;
              say('Payment cancelled. Nothing has been charged.', 'warn');
            }
          },
          handler: function (resp) {
            say('Confirming your payment…');
            fetch('/api/donate-verify', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id:   resp.razorpay_order_id,
                razorpay_payment_id: resp.razorpay_payment_id,
                razorpay_signature:  resp.razorpay_signature,
                name: body.name, email: body.email, phone: body.phone
              })
            })
              .then(function (r) { return r.json(); })
              .then(function (v) {
                busy = false; payBtn.disabled = false;
                if (!v.verified) return say(v.error || 'We could not confirm that payment. Please call +91 99370 81575.', 'bad');
                form.querySelector('.g-fields').hidden = true;
                payBtn.hidden = true;
                var done = form.querySelector('.g-done');
                done.hidden = false;
                done.querySelector('.g-receipt').textContent = v.receipt;
                done.querySelector('.g-amount').textContent =
                  '₹' + (v.amountPaise / 100).toLocaleString('en-IN');
                say('');
              })
              .catch(function () {
                busy = false; payBtn.disabled = false;
                say('Your payment went through but we could not confirm it here. Please call +91 99370 81575 with the time of payment.', 'warn');
              });
          }
        });
        rz.on('payment.failed', function () {
          busy = false; payBtn.disabled = false;
          say('That payment did not go through. Nothing has been charged. Please try again or call +91 99370 81575.', 'bad');
        });
        rz.open();
      })
      .catch(function (err) {
        busy = false; payBtn.disabled = false;
        say(err.message || 'Could not start the payment. Please try the bank transfer details alongside, or call +91 99370 81575.', 'bad');
      });
  });
})();
