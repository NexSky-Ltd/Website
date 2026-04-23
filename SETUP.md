# NexSky Members Area — Deployment Guide

Three components. ~45 minutes end-to-end.

## Files in this folder

| File | Purpose |
|---|---|
| `members.html` | Protected dashboard page — upload to `nexsky.io/members` |
| `worker.js` | Cloudflare Worker — data proxy that aggregates Yahoo + FRED + ECB |
| `SETUP.md` | This file |

---

## Step 1 — Get a free FRED API key (30 seconds)

Go to <https://fredaccount.stlouisfed.org/apikeys> → create account (free, no verification delay) → request API key → copy the 32-character key.

You'll paste this into the Worker config in Step 3.

## Step 2 — Deploy the Cloudflare Worker

This is the data proxy that fetches from Yahoo, FRED, and ECB and returns one JSON blob. It's free on Cloudflare's tier (100k requests/day).

### Option A — Cloudflare dashboard (no tooling)

1. In the Cloudflare dashboard → select your `nexsky.io` account → **Workers & Pages** → **Create application** → **Create Worker**.
2. Name it `nexsky-markets` → **Deploy**.
3. Click **Edit code** → replace the default code with the contents of `worker.js` → **Save and deploy**.
4. Click **Settings** → **Variables and Secrets** → **Add variable** (as a *secret*):
   - Name: `FRED_KEY`
   - Value: your FRED API key from Step 1
   - Encrypt: yes
5. Click **Settings** → **Triggers** → **Add Custom Domain**:
   - Enter `api.nexsky.io` → Save. Cloudflare auto-provisions the SSL cert.
6. Test: open `https://api.nexsky.io/markets` in a browser. You should see a JSON payload with equities/yields/spreads/crypto/commods/sectors.

### Option B — wrangler CLI (if you prefer)

```bash
npm install -g wrangler
wrangler login
wrangler init nexsky-markets --yes
# Paste worker.js contents into src/index.js
wrangler secret put FRED_KEY   # paste key when prompted
wrangler deploy
# Then add api.nexsky.io as a custom domain in the dashboard (same as Option A step 5)
```

---

## Step 3 — Deploy the members page

Upload `members.html` to your host as `nexsky.io/members` (either as `members.html` at root, or `members/index.html` as a folder). Before uploading, open the file and confirm line ~300:

```js
const WORKER_URL = "https://api.nexsky.io/markets";
```

This is the only edit. If you put the Worker somewhere else (e.g. the same origin as `/api/markets`), change this URL to match.

## Step 4 — Add the Members link on your main page

In your existing `index.html`, find:

```html
<ul class="nav-links" id="navLinks">
  <li><a href="#about">About</a></li>
  <li><a href="#services">Services</a></li>
  <li><a href="#principles">Principles</a></li>
  <li><a href="#fees">Fees</a></li>
  <li><a href="#team">Team</a></li>
  <li><a href="#contact" class="nav-cta">Contact</a></li>
</ul>
```

Insert one line before Contact:

```html
  <li><a href="/members">Members</a></li>
```

## Step 5 — Protect `/members` with Cloudflare Access

Cloudflare Zero Trust free tier covers 50 users. The flow: user enters email → Cloudflare emails a 6-digit PIN → user enters PIN → in.

1. Cloudflare dashboard → **Zero Trust** (left sidebar). Create a team if prompted, name it `nexsky`.
2. Pick the **Free** plan. No card needed.
3. **Access → Applications → Add an application → Self-hosted**:
   - Name: `NexSky Members`
   - Session duration: `24 hours`
   - Application domain: `nexsky.io` / path `members`
   - Click **Next**.
4. Add policy → name `Allow members`, action `Allow`, **Include → Emails** → paste the email addresses of authorized users → save.
5. Test in an incognito window: `https://nexsky.io/members` → Cloudflare login → email → PIN → access.

Add/remove users any time by editing the Emails list in the policy. Changes are instant.

---

## What the user experiences

1. Clicks "Members" from your nav
2. Cloudflare intercepts → shows the login page (email field)
3. Types email → clicks continue
4. Cloudflare emails a 6-digit code (subject: "Your Cloudflare Access code")
5. Enters the code → lands on `members.html`
6. Sees their email top-right, a "Sign out" button, and the full dashboard
7. Session persists 24h; no re-login within that window

## What's on the dashboard

**01 — Cross-asset heatmap** with time-horizon toggle (Day / Week / Month / YTD / 1Y / 3Y / 5Y). 22 tiles in five groups:
- Equities (SPX, NDX, SX5E, NKY, HSI, EM)
- Sovereign Yields (US 3M, 2Y, 10Y; DE 3M, 2Y, 10Y — yield level in %, change in bp)
- Credit Spreads (US IG, US HY, EU IG*, EU HY — OAS level in bp, change in bp)
- Crypto (BTC, ETH)
- Commodities (Brent, WTI, Gold, Silver)

*EU IG OAS is not cleanly published on FRED free tier. The Worker returns a fallback; if you need a true euro-IG spread, we can swap to iShares iBoxx EUR IG ETF (IEAC) total-return as a proxy in a one-line edit.

**02 — Equity sectors** (US + EU) with same horizon toggle:
- 11 US GICS sectors via SPDR ETFs (XLK, XLF, XLV, XLY, XLP, XLE, XLI, XLB, XLU, XLRE, XLC)
- 11 EU STOXX 600 sectors via iShares XETRA ETFs (EXV3 tech, EXV1 banks, EXH4 healthcare, EXV7 autos, etc.)
- Plus TradingView's stock-heatmap treemaps for S&P 500 and STOXX 600 drill-down — sized by market cap, colored by day change

**03 — Focus chart** — full TradingView Advanced Chart (editable — search any symbol) plus Technicals gauge.

**04 — Economic calendar** — upcoming high-impact releases across major economies.

Ticker tape runs across the top of the whole page.

## Data pipeline

```
Yahoo Finance ──┐
FRED ──────────┼──► Cloudflare Worker (10-min cache) ──► members.html (fetch on load)
ECB via DBnomics┘
```

- Free at every layer.
- 10-minute edge cache at the Worker means even if 100 users hit the page per minute, upstream APIs see one request every 10 minutes.
- All computation (multi-horizon returns, bp changes) done server-side in the Worker. The page just renders.

## Customization

**Change instruments**: edit the arrays at the top of `worker.js` (`EQUITIES`, `SECTORS_US`, etc.) → redeploy. Yahoo symbols can be found via search on tradingview.com or finance.yahoo.com.

**Swap EU IG spread** for a proxy: in `worker.js`, change the `euig` entry in `SPREADS` to use a European IG corp bond ETF (e.g. `yahoo: "IEAC.L"`) and move it to the equities-style fetch. Or keep the FRED series and accept the fallback.

**Adjust heatmap color intensity**: in `members.html`, edit the `scale` values in `tintFor` calls inside `renderCategory` — lower scale = more aggressive coloring.

**Change refresh frequency**: the Worker caches 10 min by default. Edit `Cache-Control: max-age=600` in `worker.js` to adjust.
