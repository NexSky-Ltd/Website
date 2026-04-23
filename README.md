# NexSky — nexsky.io

Public marketing site + password-protected Members dashboard.

## Structure

| File | Served at | Purpose |
|---|---|---|
| `index.html` | `nexsky.io/` | Public marketing site |
| `members.html` | `nexsky.io/members` | Protected live markets dashboard |
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

One-time setup, three independent steps:

1. **GitHub Pages** — push this repo to GitHub, enable Pages in repo Settings → Pages (source: main branch). The `CNAME` file tells GitHub to serve at `nexsky.io`.
2. **Cloudflare DNS + Proxy** — point `nexsky.io` CNAME to `<username>.github.io` with proxy (orange cloud) enabled.
3. **Cloudflare Worker** — deploy `worker.js` to Workers, set `FRED_KEY` secret, add custom domain `api.nexsky.io`. See `SETUP.md`.
4. **Cloudflare Access** — add policy on path `members` with the allowed email addresses.

Full step-by-step in `SETUP.md`.

## Updating users

Cloudflare dashboard → **Zero Trust → Access → Applications → NexSky Members → Policies → edit Emails list**. Instant.

## Data refresh

Market data cached 10 minutes at the Worker edge. Member tiles refresh on page load.

## Stack

Zero backend to maintain. Cloudflare + GitHub Pages + free public market-data APIs. Monthly cost: $0.
