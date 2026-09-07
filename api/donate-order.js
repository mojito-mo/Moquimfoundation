/* Create a Razorpay order. The amount is chosen here, on the server.
   No card data ever reaches this function; Razorpay's hosted checkout
   collects it and we only ever see an order id and a payment id. */
import { CFG, resolveAmount, rateLimit, json, sameOrigin, clean, validEmail, validPhone } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  if (!sameOrigin(req))      return json(res, 403, { error: 'Forbidden' });
  if (!rateLimit(req, 8, 60_000)) return json(res, 429, { error: 'Too many attempts. Please wait a minute.' });

  if (!CFG.live()) {
    return json(res, 503, {
      error: 'Online giving is not switched on yet. Please use the bank transfer details on this page, or call +91 99370 81575.'
    });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== 'object') return json(res, 400, { error: 'Bad request' });

  const amount = resolveAmount(body);
  if (!amount) return json(res, 400, { error: 'Please choose an amount between ₹100 and ₹5,00,000.' });

  // We collect the least we can: a name to put on the receipt, and one way to send it.
  const name  = clean(body.name, 80);
  const email = clean(body.email, 254);
  const phone = clean(body.phone, 20);
  if (email && !validEmail(email)) return json(res, 400, { error: 'That email address does not look right.' });
  if (phone && !validPhone(phone)) return json(res, 400, { error: 'That phone number does not look right.' });
  if (!email && !phone)            return json(res, 400, { error: 'Please give an email or a phone number so we can send your receipt.' });

  // Idempotency: the same browser retrying within a minute reuses one receipt.
  const receipt = 'MF' + Date.now().toString(36).toUpperCase();

  const auth = Buffer.from(CFG.keyId + ':' + CFG.keySecret).toString('base64');

  try {
    const r = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Basic ' + auth },
      body: JSON.stringify({
        amount,
        currency: 'INR',
        receipt,
        payment_capture: 1,
        /* Notes carry the donor's name and our receipt number, and nothing
           else. The webhook is the only place a donation is recorded, and it
           has no other way to learn who gave. Razorpay already holds the
           card; a name alongside it adds nothing it does not have. No
           address, no amount breakdown, no identity document. */
        notes: {
          purpose: 'Donation to Moquim Foundation',
          donor_name: name || '',
          receipt
        }
      })
    });

    const data = await r.json();
    if (!r.ok) {
      console.error('razorpay order failed', r.status, data && data.error && data.error.code);
      return json(res, 502, { error: 'The payment provider did not respond. Please try again shortly.' });
    }

    // Only what the browser needs to open checkout. Never the secret.
    return json(res, 200, {
      orderId: data.id,
      amount: data.amount,
      currency: data.currency,
      receipt,
      keyId: CFG.keyId
    });
  } catch (e) {
    console.error('razorpay order error', e && e.name);
    return json(res, 502, { error: 'Could not reach the payment provider. Please try again shortly.' });
  }
}
