# VIVACE 2026 Loyalty Card

A stamp/bingo-style loyalty card web app for the VIVACE SMU CCA Fair 2026. Participants collect stamps by visiting booths, and the card is rendered in the browser.

## Tech Stack

- **Runtime:** Node.js (20.6+ required for built-in `.env` loading)
- **Framework:** Express.js
- **Templating:** EJS
- **Deployment:** Vercel

## Running Locally

### Prerequisites

- Node.js 20.6 or newer (`node -v` to check)

### Steps

```bash
# 1. Clone the repo
git clone <repo-url>
cd Vivace-loyalty-Card

# 2. Install dependencies
npm install

# 3. Create your local .env file with booth codes
cp .env.example .env
# Then open .env and fill in real codes for BOOTH_CODE_B0..B11

# 4. Start the dev server
npm run dev        # auto-restarts on file changes
# or
npm start          # no auto-restart
```

Then open **http://localhost:8000** in your browser.

> If any booth code env var is missing when the server starts, that booth is assigned a random unguessable code and a warning is printed to the server log — the app will still boot, but that booth will be uncompletable until you set the code.

## Project Structure

```
Vivace-loyalty-Card/
├── server.js          # Express entry point (port 8000, override with PORT env var)
├── routes/            # URL → controller mapping
├── controllers/       # Request handler logic
├── models/            # booths.js, prizes.js — data only
├── views/             # EJS templates (index.ejs + partials/)
├── public/            # Static assets (CSS, JS, images)
├── utils/             # Helper utilities (hash.js)
├── .env.example       # Template for local .env (booth codes)
└── vercel.json        # Vercel deployment config
```

---

## Booth Codes & Environment Variables

Booth codes are **never** committed to the repo. They live in environment variables, and only their hashes are ever sent to the browser.

### The variables

| Variable | Purpose |
|---|---|
| `BOOTH_CODE_B0` | Code for booth `b0` (the mandatory START HERE booth — Vivace's Gamebooth) |
| `BOOTH_CODE_B1` … `BOOTH_CODE_B11` | Codes for the remaining 11 booths |
| `PORT` | (Optional) Override the default port `8000` for local dev |

### Local dev — `.env` file

1. Copy the template: `cp .env.example .env`
2. Open `.env` and set a value for every `BOOTH_CODE_B*`
3. Restart the server — Node auto-loads `.env` on boot via `process.loadEnvFile()`

`.env` is git-ignored (see `.gitignore`) — commits will never include it.

### Production — Vercel dashboard

When you migrate to a **Vercel Pro account**, you'll need to set the same variables there.

**Option 1 — Dashboard (recommended for a one-time setup):**

1. Go to https://vercel.com/dashboard
2. Open the project → **Settings** → **Environment Variables**
3. For each `BOOTH_CODE_B0` through `BOOTH_CODE_B11`:
   - **Key:** the variable name (e.g. `BOOTH_CODE_B0`)
   - **Value:** the booth code you want to use
   - **Environments:** tick **Production**, **Preview**, and **Development**
4. Click **Save**
5. Go to **Deployments** → find the most recent → click **⋯** → **Redeploy**
   - Env vars only apply to *new* deployments; existing ones keep their old vars.

**Option 2 — Vercel CLI:**

```bash
# One-time link (only needed on a fresh machine)
vercel link

# Add each variable interactively — you'll be prompted for the value and env
for i in 0 1 2 3 4 5 6 7 8 9 10 11; do
  vercel env add BOOTH_CODE_B$i production
done

# Pull them down to a local .env.production if you want to inspect them
vercel env pull .env.production.local

# Redeploy so the new env vars take effect
vercel --prod
```

### Rotating codes

If you need to change codes (recommended after any suspected leak or before a new event):

1. Update the values in the Vercel dashboard (or via `vercel env rm && vercel env add`)
2. **Redeploy** — env vars don't hot-reload
3. Update your local `.env` to match if you want dev to mirror prod

No source code changes required.

---

## Why environment variables, and why it matters even for private repos

Booth codes are what unlocks a stamp on the card. If someone gets them, they can complete the entire card without visiting a single booth — which defeats the point of the event.

### Before the fix: codes lived in `models/booths.js`

```js
codeHash: simpleHash('vivace'),   // plaintext 'vivace' committed to git
codeHash: simpleHash('grace'),
// … etc
```

Anyone who could see the repo could read the codes. That included:

- **Everyone on GitHub** (the repo was public — this is how it was actually leaked)
- Anyone who ever forked or cloned it
- Anyone who searched GitHub for `simpleHash(` or common code patterns
- Anyone who found the deployed URL and looked at `models/booths.js` in the git history

### After the fix: codes live in env vars

```js
codeHash: simpleHash(boothCode('b0')),   // boothCode() reads process.env.BOOTH_CODE_B0
```

The source code says *"read whatever the deployment platform is holding for `BOOTH_CODE_B0`"* — the actual value never appears in git.

### "But my repo will be private — do I still need env vars?"

**Yes, and here's why.** Making the repo private is one layer of defence, but env vars give you several more that private-repo status can't replace:

| Concern | Private repo alone | Env vars |
|---|---|---|
| **New teammate joins the org** but doesn't need booth codes (e.g. a designer) | They see everything in git → they see the codes | They see the code but not the values |
| **Repo is made public later** (open-sourcing, portfolio, transfer to another org) | Every code in *history* is now public — you'd need to rewrite git history to remove them, and even that's leaky | History has no codes to leak |
| **A screenshot of the code goes into a slide / Slack / bug report** | Someone reading over your shoulder sees the codes | The screenshot shows `process.env.BOOTH_CODE_B0`, which is meaningless without access to the env store |
| **A leaked laptop / GitHub credential** | Attacker clones the repo and has your codes | Attacker has the repo but not the Vercel env vars — they'd have to also breach your Vercel account |
| **You want to rotate a code mid-event** | Edit code → commit → wait for deploy. Old code lingers in git history. | Change the env var → redeploy. Nothing to rewrite. |
| **Different codes per environment** (e.g. staging uses different codes so testers can't cheat) | Same file → same codes everywhere, or messy branch-based hackery | Vercel lets you set different values for Production, Preview, and Development |

The principle is called **separating configuration from code**. Even if your code is 100% private today, keeping secrets out of source code buys you flexibility, rotation ease, and defence against tomorrow's mistake — which you can't predict now.

### What actually reaches the user's browser?

Only the *hashes*. The client-side JavaScript (`public/js/state.js`) hashes whatever the user types into the code input, then compares against the pre-computed hash embedded in the page. The plaintext code never leaves the server — not to the browser, not to logs, not to Vercel's build output.

That's why `simpleHash` doesn't have to be a cryptographic hash for the *leak* to be fixed — the fix is that plaintext codes stopped existing outside the env-var store. (For defence in depth against someone brute-forcing the hashes, you could swap `simpleHash` for `crypto.createHash('sha256')` with a secret salt env var — worth considering for future events.)

---

## Deployment

Push to `main` and Vercel auto-deploys. Or manually:

```bash
vercel                # preview deployment
vercel --prod         # production deployment
```

Remember: **any env var change requires a redeploy** to take effect.
