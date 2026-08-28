# Moquim Foundation website, security and compliance notes

Read this before the site takes a single rupee.

---

## 1. Environment variables

These live in Vercel only. Never in the code, never in the zip, never in a message.

| Name | Where to get it | Exposed to browser? |
|---|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com | No |
| `RZP_KEY_ID` | Razorpay dashboard, API Keys | Yes, by design |
| `RZP_KEY_SECRET` | Razorpay dashboard, shown once | **No, never** |
| `RZP_WEBHOOK_SECRET` | Razorpay, Settings > Webhooks | **No, never** |
| `DONATION_WEBHOOK` | optional; a Slack or Zapier URL for alerts | No |

Set them for Production, Preview and Development separately. Rotate `RZP_KEY_SECRET` if it is ever pasted anywhere outside Vercel.

**The Anthropic key you pasted into chat earlier must be revoked if you have not already done so.** Anything pasted into a chat window should be treated as compromised.

## 2. Razorpay setup

1. Complete KYC. They will ask for the trust deed, PAN, cancelled cheque and the 12AB order. You have all four.
2. Create API keys. Copy the secret immediately, it is shown once.
3. Add a webhook pointing at `https://YOURDOMAIN/api/donate-webhook`, subscribed to `payment.captured` and `payment.failed`. Set a webhook secret and put it in `RZP_WEBHOOK_SECRET`.
4. Test in Test Mode first. Card `4111 1111 1111 1111`, any future expiry, any CVV.

Until `RZP_KEY_ID` and `RZP_KEY_SECRET` are both set, `/api/donate-order` returns 503 and the page tells donors to use bank transfer. Nothing breaks.

## 3. What this build does and does not do

**Does**

- Decides the donation amount on the server. The browser sends a tier name, never a rupee figure, so a tampered page cannot make a ₹1 payment report as ₹10,000.
- Verifies the payment signature server-side with HMAC-SHA256 and a timing-safe compare, then independently asks Razorpay what the payment's real status is. A "success" in the browser is treated as a claim, not proof.
- Verifies every webhook against the **raw** request body before trusting a byte of it. Body parsing is disabled on that route for exactly this reason.
- Deduplicates webhook retries by event id, and disables Razorpay's retry-in-modal, so a donor cannot be charged twice by accident.
- Restricts `/api/donate-*` to same-origin callers and rate limits every route.
- Keeps donor identifiers out of application logs. Emails are masked before they are printed.
- Ships CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors` and a `no-store` policy on API responses.

**Does not, and this is deliberate**

- **Never sees a card number, CVV, PIN or UPI PIN.** Those are entered on Razorpay's own hosted page. This keeps you in the smallest possible PCI DSS scope (SAQ A). Do not add a card field to this site. If anyone offers to "make checkout feel more native" by collecting card details on your page, refuse.
- Does not store anything. There is no database in this build. Donation records live in your Razorpay dashboard, which is the correct place for them.

## 4. Before you accept real money

- [ ] Custom domain added, HTTPS confirmed, HTTP redirects to HTTPS (Vercel does this)
- [ ] `X-Robots-Tag: noindex` removed from `vercel.json` at launch
- [ ] Razorpay KYC complete and live keys set
- [ ] Webhook registered and secret set
- [ ] One test donation end to end in Test Mode: success, cancellation, and failure
- [ ] Confirm the webhook fires when you close the tab mid-payment
- [ ] MFA enabled on your Vercel account **and** your Razorpay account
- [ ] Razorpay dashboard access limited: finance role for whoever reconciles, not owner for everyone
- [ ] `npm audit` clean, or note why not
- [ ] Refund path agreed internally, and someone owns the help@ inbox

## 5. If you later add a database or an admin panel

That is where the real risk starts. This build has neither, which is why its attack surface is small. If you add one:

- Never store card data. There is no exception to this.
- Hash passwords with argon2id or bcrypt, enforce MFA on every admin, lock accounts after repeated failures.
- Session cookies must be `Secure`, `HttpOnly`, `SameSite=Lax` and short-lived.
- Separate roles: content editor, finance, administrator. Nobody gets all three by default.
- Parameterised queries only. Escape on output. CSRF tokens on every state-changing form.
- Restrict the database to the application's IP or private network. No public listener.
- Encrypt donor contact data at rest. Back up daily and **test a restore**, an untested backup is not a backup.
- Get a penetration test before it handles real donations.

## 6. Indian compliance, as it stands today

- **12AB:** registered. URN `AAGTM7929L25HY01`, granted 17 January 2026, valid AY 2027-28 to 2036-37. The order is published on the site.
- **80G:** **not granted.** The site says so on the giving page, the about page and the terms. Do not let anyone add a "tax benefit" line until you hold the 80G order. A false 80G claim is a serious matter for a trust.
- **CSR-1:** not filed. Required before you can receive CSR funds from a company.
- **FCRA:** not held. Do not accept foreign donations. If an overseas donor tries, refuse and refund.
- **DPDP Act 2023:** privacy policy published, consent taken at the point of collection, data minimised to a name and one contact route, retention stated, rights and the Data Protection Board named.
- **Registration number `392000088`** was marked unverified in your sheet, so it is not published anywhere. Confirm it with the department before it goes on the site.

## 7. Documents

Published: the Form 10AD registration order only, at `/docs/`.

**Deliberately not published:** the trust deed, the PAN card scan and the cancelled cheque. The deed carries trustees' personal details and the cheque carries a signature specimen. Neither belongs on a public website. Share them directly with Razorpay and with donors who ask, not through the site.
