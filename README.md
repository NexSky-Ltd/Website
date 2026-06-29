# NexSky — nexsky.io

Public marketing site + password-protected members portal (live markets, CIO house view, research, briefings, opportunities), served from GitHub Pages behind Cloudflare.

## Repository structure

| Path | Served at | Purpose |
|---|---|---|
| `index.html` | `nexsky.io/` | Public marketing site (hero, pillars, principles, fees, team, contact). Carries the analytics + consent banner. |
| `christophe-schaillee.jpg` | `/christophe-schaillee.jpg` | Founder headshot (Team section). |
| `members.html` | `nexsky.io/members.html` | **Live Market** desk (TradingView heatmap, charts, calendar). Gated. |
| `members/index.html` | `/members/` | **Members hub** — landing with cards to each section. Gated. |
| `members/cio.html` | `/members/cio.html` | **CIO House View** — scorecard + peer table, reads `allocation.json`. Gated. |
| `members/research.html` | `/members/research.html` | **Library** — filterable grid (CIO / Daily Briefing / Opportunities / Research), reads `library.json`. Gated. |
| `members/article.html` | `/members/article.html?slug=…` | Branded reader for a single note (fragment injected). Gated. |
| `members/portal.css` | — | Shared styles for all `members/` pages. |
| `members/library.js` | — | Shared helpers: library grid render, date/escape utils, mobile-nav toggle. |
| `members/library.json` | — | Index of all published notes (slug, type, date, title, summary, format, url). |
| `members/allocation.json` | — | CIO data: `scorecard` (19 asset-class rows) + `peerComparison` (NexSky vs 7 houses). |
| `members/content/*.html` | — | Note bodies (HTML fragments for reader notes; full pages for briefings). |
| `CNAME` | — | Custom domain for GitHub Pages. |
| `SETUP.md` | — | Original deployment walkthrough. |

> Branch note: the live/default branch is **`main`**. `master` is a redirect alias from an old rename — read URLs resolve through it, but **writes must target `main`**.

## Workers (deployed separately, not served from this repo)

| Worker | Source | Role |
|---|---|---|
| `nexsky-publish` | `07_Website/Website Assets/worker-publish.js` (paste into dashboard) | **Commit engine.** Writes content + data to this repo via the GitHub Contents API. Endpoints below. |
| `nexsky-briefing` | `NexSky/nexsky-briefing-worker/` (TypeScript, `wrangler deploy`) | Daily morning briefing (drafts 07:30 CET weekdays, you send manually). On send, archives the briefing to the members area. |
| `nexsky-markets` | `worker.js` in this repo | Aggregates free market data for the Live Market desk (`api.nexsky.io/markets`). |

### `nexsky-publish` endpoints (POST, header `x-publish-key`)

- `POST /test` — writes a test file (pipeline check).
- `POST /publish` — `{type, format, title, date, slug, summary, bodyHtml}` → writes `members/content/<slug>.html` and prepends to `library.json`. `format:"reader"` = fragment in the article shell; `format:"page"` = standalone HTML (used by briefings).
- `POST /unpublish` — `{slug}` → removes the entry from `library.json` and deletes its content file.
- `POST /file` — `{path, content, message}` → overwrites a data file under `members/` (e.g. `allocation.json`). Used by the monthly CIO tasks.

Worker config: vars `GH_OWNER=NexSky-Ltd`, `GH_REPO=Website`, `GH_BRANCH=main`; secrets `GH_TOKEN` (classic PAT, `repo` scope) and `PUBLISH_KEY` (shared secret). The briefing worker holds the same `PUBLISH_KEY` plus `PUBLISH_URL`.

## Analytics & privacy (in `index.html`)

- **Cloudflare Web Analytics** — cookieless beacon before `</body>`.
- **Google Analytics 4** (`G-LFRBN1ZES3`) — Consent Mode, defaulted to denied; a slim consent banner enables it on Accept (choice in `localStorage` key `nexsky-consent`).
- **Google Search Console** — verified via the `google-site-verification` meta tag in `<head>`.

## Access control

The members area is gated by **Cloudflare Access** on the `/members` path (covers `/members/…` and `/members.html`). Manage allowed emails: Cloudflare → Zero Trust → Access → Applications → NexSky Members → Policies.

## Deploying

- **Site content:** edit files, upload to the repo (GitHub → Add file → Upload files → commit). GitHub Pages + Cloudflare serve within ~1–2 min (hard-refresh; CSS/JS caches aggressively).
- **`nexsky-publish`:** paste `worker-publish.js` into the worker (dashboard → Edit code → Deploy).
- **`nexsky-briefing`:** from `NexSky/nexsky-briefing-worker/`, run `npm install` then `npx wrangler deploy`.
- **Publishing notes** (CIO / research / opportunities) is normally done via the publish worker, not manual upload — see the operations one-pager.

## Automation

- **Daily briefing** — `nexsky-briefing` cron `30 5 * * 1-5`; drafts to `lex@nexsky.io`, you click send, it auto-archives to the members area.
- **Monthly (15th)** — scheduled task `cio-bank-refresh` updates the peer table in `allocation.json` from the banks' latest published views.
- **Monthly (1st)** — scheduled task `cio-house-view-monthly` drafts the new house view for review, then publishes on approval.

## Stack & cost

GitHub Pages + Cloudflare (proxy, Access, Workers) + free public market-data APIs. No server to maintain.
