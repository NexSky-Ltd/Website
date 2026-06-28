# NexSky — nexsky.io

Public marketing site + password-protected Members dashboard.

## Structure

| File | Served at | Purpose |
|---|---|---|
| `index.html` | `nexsky.io/` | Public marketing site |
| `members.html` | `nexsky.io/members` | Protected live markets dashboard |
| `christophe-schaillee.jpg` | `nexsky.io/christophe-schaillee.jpg` | Founder headshot (Team section) |
| `CNAME` | — | Tells GitHub Pages to serve on `nexsky.io` |
| `worker.js` | `api.nexsky.io/markets` | Cloudflare Worker (deployed separately, not served from this repo) |
| `SETUP.md` | — | Deployment walkthrough |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         nexsky.io                           │
│                  (Cloudflare proxy, orange cloud)           │
└──────────┬──────────────────────────────┬───────────────────┘
           │                              │
           │ / and /*                     │ /members (Cloudflare Access auth wall)
           ↓                              ↓
  ┌──────────────────┐          ┌──────────────────┐
  │  GitHub Pages    │          │  GitHub Pages    │
  │   index.html     │          │  members.html    │
  └──────────────────┘          └──────────┬───────┘
                                           │ fetch()
                                           ↓
                                  ┌──────────────────┐
                                  │  api.nexsky.io   │
                                  │  (Cloudflare     │
                                  │   Worker)        │
                                  └──────────┬───────┘
                                             │
                         ┌───────────────────┼───────────────────┐
                         ↓                   ↓                   ↓
                   Yahoo Finance          FRED API        DBnomics / ECB
               (equities, sectors,     (US yields,       (DE yields)
                commodities, crypto)    OAS spreads)
```

## Deployment

One-time setup, four independent steps:

1. **GitHub Pages** — push this repo to GitHub, enable Pages in repo Settings → Pages (source: main branch). The `CNAME` file tells GitHub to serve at `nexsky.io`.
2. **Cloudflare DNS + Proxy** — point `nexsky.io` CNAME to `<username>.github.io` with proxy (orange cloud) enabled.
3. **Cloudflare Worker** — deploy `worker.js` to Workers, set `FRED_KEY` secret, add custom domain `api.nexsky.io`. See `SETUP.md`.
4. **Cloudflare Access** — add policy on path `members` with the allowed email addresses.

Full step-by-step in `SETUP.md`.

## Analytics & privacy

All analytics live in `index.html` (no analytics on the Members page).

- **Cloudflare Web Analytics** — cookieless, privacy-first. Beacon embedded before `</body>` (`data-cf-beacon` token). Requires no consent; runs for every visitor.
- **Google Analytics 4** (`G-LFRBN1ZES3`) — loaded via `gtag.js` in `<head>` with **Consent Mode**, defaulted to `denied`. A slim consent banner (bottom of page) lets the visitor opt in; the choice is stored in `localStorage` under the key `nexsky-consent`. GA4 analytics cookies fire only after **Accept** — compliant for EU/Monaco visitors.
- **Google Search Console** — verified via the `google-site-verification` meta tag in `<head>`. Bing Webmaster Tools imports its data from Search Console.

To revoke/change consent during testing: clear the `nexsky-consent` key in the browser's localStorage and reload.

## Updating users

Cloudflare dashboard → **Zero Trust → Access → Applications → NexSky Members → Policies → edit Emails list**. Instant.

## Data refresh

Market data cached 10 minutes at the Worker edge. Member tiles refresh on page load.

## Members dashboard notes

- Cross-asset heatmap, sector tiles, and macro data are driven by the Worker (`api.nexsky.io/markets`).
- The market heatmap is a single full-width TradingView treemap defaulting to `dataSource` `SPX500` (S&P 500); users switch index via the widget's toolbar (`isDataSetEnabled` + `hasTopBar`). The ticker tape uses TradingView `TVC:` feeds for indices/VIX for reliability.

## Stack

Zero backend to maintain. Cloudflare + GitHub Pages + free public market-data APIs. Monthly cost: $0.
