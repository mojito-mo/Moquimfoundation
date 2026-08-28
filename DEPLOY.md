# Deploying to Vercel

## Drag and drop

1. Go to **[vercel.com/new](https://vercel.com/new)** and sign in (GitHub, GitLab or email — free).
2. Look for **"Deploy a template or drag and drop"** — or go straight to **[vercel.com/new/clone](https://vercel.com/new)** and find the drop zone.
3. Drag **`moquim-foundation-site.zip`** onto it. Do not unzip it first — Vercel takes the zip directly.
4. Give the project a name, e.g. `moquim-foundation`.
5. Click **Deploy**. It takes about a minute.

You'll get a URL like `moquim-foundation.vercel.app`. Share that link for review.

**If drag-and-drop isn't offered on your account,** unzip the folder and use the CLI instead:

```
npm i -g vercel
cd Website
vercel
```

Answer the prompts with the defaults. Same result.

---

## Switching on the chat assistant

The chatbot is built and wired up, but it will stay politely switched off until you add an API key. Without one it tells visitors to call the office instead — so it degrades gracefully and you can deploy today.

**1. Get a key.** Go to [console.anthropic.com](https://console.anthropic.com), create an account, and generate an API key under *API Keys*. Add some credit — $5 goes a very long way at this scale.

**2. Add it to Vercel.** Project → Settings → Environment Variables:

| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | your key, starting `sk-ant-` |

Optionally also add `ENQUIRY_WEBHOOK` — any URL that accepts a POST (a Zapier or Make webhook, or a Google Form endpoint). When the assistant captures someone's name and phone, it posts them there. Leave it unset and capture simply doesn't fire.

**3. Redeploy.** This step is the one people miss. Environment variables only apply to deployments made *after* they were added — setting the key does nothing to a deployment that already exists. In Vercel go to **Deployments**, open the most recent one, and choose **Redeploy**.

**4. Check it.** Open `/api/health` on your deployed site — for example `moquim-foundation.vercel.app/api/health`. It returns a short report telling you exactly where things stand:

| What you see | What it means |
|---|---|
| `404` page not found | The functions aren't running at all. See troubleshooting below. |
| `"apiKeyPresent": false` | Key not set, or set but not redeployed since. |
| `"apiKeyLooksValid": false` | The key doesn't start with `sk-ant-` — check for stray quotes or spaces. |
| `"anthropicStatus": 401` | Key rejected. Probably copied incompletely, or revoked. |
| `"anthropicStatus": 429` | Out of credit. Top up at console.anthropic.com → Billing. |
| `"verdict": "All good..."` | It's live. Go and ask it something. |

The health check never reveals your key — only whether one is present and whether Anthropic accepts it.

### If /api/health returns 404

That means Vercel deployed the site as pure static files and ignored the `api` folder. Two fixes, in order of ease:

1. Confirm `api/chat.js`, `api/health.js`, `package.json` and `vercel.json` all sit at the **top level** of the deployment, not inside a nested folder. If you unzipped and dragged the parent folder, Vercel may have taken one level too high.
2. Deploy with the CLI instead, which is more reliable for functions than drag-and-drop:

```
npm i -g vercel
cd Website
vercel --prod
```

**Cost.** It runs on Claude Haiku. At roughly 4,000 tokens per conversation, a thousand conversations a month costs well under ₹200. Set a spend limit in the Anthropic console anyway.

**Keeping it accurate.** All the facts live in one file: `api/knowledge.js`. Edit that, redeploy, and the assistant updates. You do not need to touch anything else. When your 80G and registration numbers come through, add them there and remove the paragraph telling it to decline those questions.

**What it will and won't do.** It answers only from that file. It refuses to invent dates or numbers, marks unconfirmed figures as estimates, never claims donations are tax-deductible, never gives out a bank account number, and never gives medical advice. It explains the Metro Group connection honestly but will not pitch property on a charity site.

---

## Before you go live on the real domain

The site is currently set to **stay out of Google**. This is deliberate — a preview URL competing with `moquimfoundation.org` in search results would be bad for you.

When you're ready to launch on the real domain, open **`vercel.json`** and delete this one line:

```json
{ "key": "X-Robots-Tag", "value": "noindex, nofollow" },
```

Then redeploy. Everything else in that file — caching, security headers — should stay.

---

## Pointing your domain at it

In Vercel: **Project → Settings → Domains → Add**, enter `moquimfoundation.org`.

Vercel will show you the DNS records to create. At your domain registrar, add:

- An **A record** for `@` pointing to the IP Vercel gives you
- A **CNAME** for `www` pointing to `cname.vercel-dns.com`

SSL is issued automatically within a few minutes. Do not do this until the Foundation has approved the content — the live site is currently serving from somewhere else, and switching DNS will replace it.

---

## What's already configured

- **Caching.** Images and video are cached for a year, CSS and JS for a week. Repeat visits load almost instantly.
- **Security headers.** `nosniff`, `SAMEORIGIN`, a strict referrer policy, and camera/microphone/geolocation switched off.
- **Clean 404.** A custom not-found page that matches the site and offers the main sections.
- **XML sitemap** at `/sitemap.xml`, referenced from `/robots.txt`.
- **Canonical tags** on all 36 pages, pointing at `moquimfoundation.org` — so even if the preview does get crawled, credit goes to the real domain.

---

## Still to do before this is a live site

These are things I cannot do for you.

1. **Registration numbers.** The Legal panel on the About page still shows `[ to be added ]` for the registration number, PAN, 12A, 80G and CSR-1. This is the first thing a CSR partner will look for.
2. **Payment gateway.** Razorpay or Cashfree registration, with KYC. Budget a week for approval. Until then the donate page runs a contact-to-give flow.
3. **Form handling.** The contact, volunteer and donation forms currently validate but do not send. They need an endpoint — Vercel Forms, Formspree, or an SMTP relay.
4. **Confirm the estimates.** Every figure marked with an asterisk is my estimate from the photographic record. Replace them with your real numbers.
5. **Odia review.** The interface translation needs checking by a native speaker before launch.
6. **Analytics.** Add the Google Analytics 4 tag and verify the property in Search Console once the domain is live.
