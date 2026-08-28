/* Verify a completed payment. The browser's "success" callback is a claim,
   not proof, so we recompute the signature here and then ask Razorpay
   directly what the payment's real status is. */
import { CFG, hmac, safeEqual, rateLimit, json, sameOrigin, clean, maskEmail } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  if (!sameOrigin(req))      return json(res, 403, { error: 'Forbidden' });
  if (!rateLimit(req, 12, 60_000)) return json(res, 429, { error: 'Too many attempts.' });
  if (!CFG.live())           return json(res, 503, { error: 'Online giving is not switched on.' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body) return json(res, 400, { error: 'Bad request' });

  const orderId   = clean(body.razorpay_order_id, 60);
  const paymentId = clean(body.razorpay_payment_id, 60);
  const signature = clean(body.razorpay_signature, 200);
  if (!orderId || !paymentId || !signature) return json(res, 400, { error: 'Incomplete payment response.' });

  // 1. the signature must be one we could have produced
  const expected = hmac(CFG.keySecret, orderId + '|' + paymentId);
  if (!safeEqual(expected, signature)) {
    console.warn('signature mismatch for order', orderId);
    return json(res, 400, { verified: false, error: 'We could not verify that payment. Nothing has been charged twice. Please call +91 99370 81575.' });
  }

  // 2. and Razorpay itself must agree the money actually arrived
  try {
    const auth = Buffer.from(CFG.keyId + ':' + CFG.keySecret).toString('base64');
    const r = await fetch('https://api.razorpay.com/v1/payments/' + encodeURIComponent(paymentId), {
      headers: { authorization: 'Basic ' + auth }
    });
    const p = await r.json();
    if (!r.ok) return json(res, 502, { verified: false, error: 'Could not confirm the payment. Please call +91 99370 81575.' });

    const ok = (p.status === 'captured' || p.status === 'authorized') && p.order_id === orderId;
    if (!ok) return json(res, 400, { verified: false, error: 'That payment did not complete. Nothing has been charged.' });

    const receipt = 'MF-' + paymentId.replace(/^pay_/, '').toUpperCase();

    // Optional ops notification. Amount and receipt only, no card data.
    if (CFG.notifyUrl) {
      const donorName = clean(body.name, 80);
      fetch(CFG.notifyUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'donation',
          receipt,
          paymentId,
          orderId,
          amountPaise: p.amount,
          currency: p.currency,
          method: p.method,
          name: donorName || null,
          email: body.email ? String(body.email).slice(0, 254) : null,
          phone: body.phone ? String(body.phone).slice(0, 20) : null,
          at: new Date().toISOString()
        })
      }).catch(() => {});
      console.log('donation verified', receipt, p.amount, body.email ? maskEmail(body.email) : '-');
    }

    return json(res, 200, {
      verified: true,
      receipt,
      paymentId,
      amountPaise: p.amount,
      currency: p.currency
    });
  } catch (e) {
    console.error('verify error', e && e.name);
    return json(res, 502, { verified: false, error: 'Could not confirm the payment. Please call +91 99370 81575.' });
  }
}
