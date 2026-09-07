# Pushing this site from VS Code

## Before you start, one thing that matters

The folder on your computer still contains files that must **not** go into
the repository: photographs taken inside a political party office, the old
misspelled "nayeema" pages, and code for features that were removed.

`.gitignore` keeps all of them out. **Do not delete it, and do not use
"Add to git" on an ignored file.** Git history is permanent. Anything
committed once is very difficult to remove, and on a public repository it
stays visible in the history even after you delete the file.

Verified with git itself: **1,031 files will be committed, 538 are ignored.**

---

## Steps

**1. Open the right folder.**
In VS Code, File → Open Folder → select the **`Website`** folder, not the
`MOQUIM FOUNDATION` folder above it. Opening the parent would pull in the
raw photo archive, the trust deed and the Aadhaar-bearing PDFs.

**2. Initialise.**
Source Control panel (the branch icon, or `Ctrl+Shift+G`) →
**Initialize Repository**.

**3. Check what is staged before you commit.**
You should see roughly **1,031 files**. Type `covid-21` into the Source
Control search. If it appears, stop, `.gitignore` is not being read.

**4. Commit.**
Message: `Moquim Foundation website` → **Commit**.

**5. Publish.**
**Publish Branch** → choose **Private** unless you have a reason not to.
VS Code will create the GitHub repository and push.

**6. Connect Vercel.**
vercel.com → Add New → Project → import the repository.
Framework preset: **Other**. Root directory: leave empty. Deploy.

From then on, every commit you push deploys automatically.

---

## Set the environment variables

In Vercel → Project → Settings → Environment Variables. These are the only
place keys should ever live.

| Name | Where it comes from |
|---|---|
| `RZP_KEY_ID` | Razorpay dashboard, API Keys |
| `RZP_KEY_SECRET` | Razorpay, shown once only |
| `RZP_WEBHOOK_SECRET` | a long random string you invent |

Redeploy after adding them. Environment variables do not take effect until
a new build runs.

Until they are set, the donate button returns a clear message pointing
people at the bank transfer details. Nothing breaks.

---

## About the size

The repository is about **161 MB**, mostly photographs and five videos.
That is fine for GitHub. The largest single file is roughly 10 MB, well
under the 100 MB per-file limit. Cloning will take a minute on a slow
connection, which is the only real cost.

---

## After the first deploy

1. Visit `yourdomain/about-us.html`. It should land on the About page, not
   a 404. That is the redirect for your old URL working.
2. Open Google Search Console → Pages → **Not found (404)**. Anything still
   listed there is an old URL I did not anticipate. Send it to me and it
   takes a minute to add.
3. Check the homepage on a phone. One button in the bottom bar, four in the
   floating rail.

---

## If something goes wrong

**Push rejected, file too large.** A video slipped past the ignore rules.
Remove it from staging rather than committing and deleting afterwards.

**Vercel builds but pages 404.** Check the root directory setting is empty
and that `index.html` sits at the top level of the repository.

**Donate button says giving is not switched on.** That is correct until the
Razorpay keys are set. It is not an error.
