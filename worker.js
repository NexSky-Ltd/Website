// NexSky Markets Worker
// Cloudflare Worker that aggregates market data from multiple free sources
// and returns a single consolidated JSON payload for the members dashboard.
//
// Sources:
//   - Yahoo Finance (equities, sectors, commodities, crypto)
//   - FRED (US yields, US/EU IG/HY OAS spreads)    — requires free API key
//   - DBnomics / ECB (DE sovereign yields)          — no key required
//
// Deployment:
//   1. wrangler deploy (or paste into the Cloudflare dashboard)
//   2. Set secret: wrangler secret put FRED_KEY
//   3. Route: mount at api.nexsky.io/markets OR nexsky.io/api/markets
//
// Cache: results cached for 10 minutes at the Worker edge.

const EQUITIES = [
  { id: "spx",  name: "S&P 500",        yahoo: "%5EGSPC" },
  { id: "ndx",  name: "Nasdaq 100",     yahoo: "%5ENDX" },
  { id: "sx5e", name: "Euro Stoxx 50",  yahoo: "%5ESTOXX50E" },
  { id: "nky",  name: "Nikkei 225",     yahoo: "%5EN225" },
  { id: "hsi",  name: "Hang Seng",      yahoo: "%5EHSI" },
  { id: "em",   name: "MSCI EM",        yahoo: "EEM" },
];

const SECTORS_US = [
  { id: "xlk",  name: "Technology",             yahoo: "XLK" },
  { id: "xlc",  name: "Communications",         yahoo: "XLC" },
  { id: "xlf",  name: "Financials",             yahoo: "XLF" },
  { id: "xlv",  name: "Healthcare",             yahoo: "XLV" },
  { id: "xly",  name: "Consumer Disc.",         yahoo: "XLY" },
  { id: "xlp",  name: "Consumer Staples",       yahoo: "XLP" },
  { id: "xle",  name: "Energy",                 yahoo: "XLE" },
  { id: "xli",  name: "Industrials",            yahoo: "XLI" },
  { id: "xlb",  name: "Materials",              yahoo: "XLB" },
  { id: "xlu",  name: "Utilities",              yahoo: "XLU" },
  { id: "xlre", name: "Real Estate",            yahoo: "XLRE" },
];

const SECTORS_EU = [
  { id: "exv3", name: "Technology",             yahoo: "EXV3.DE" },
  { id: "exh6", name: "Telecommunications",     yahoo: "EXH6.DE" },
  { id: "exv1", name: "Banks",                  yahoo: "EXV1.DE" },
  { id: "exh5", name: "Insurance",              yahoo: "EXH5.DE" },
  { id: "exh4", name: "Healthcare",             yahoo: "EXH4.DE" },
  { id: "exv7", name: "Automobiles",            yahoo: "EXV7.DE" },
  { id: "exh3", name: "Food & Beverage",        yahoo: "EXH3.DE" },
  { id: "exh1", name: "Oil & Gas",              yahoo: "EXH1.DE" },
  { id: "exh9", name: "Industrial Goods",       yahoo: "EXH9.DE" },
  { id: "exv6", name: "Basic Resources",        yahoo: "EXV6.DE" },
  { id: "exv8", name: "Utilities",              yahoo: "EXV8.DE" },
];

const COMMODITIES = [
  { id: "brent",  name: "Brent",   yahoo: "BZ=F" },
  { id: "wti",    name: "WTI",     yahoo: "CL=F" },
  { id: "gold",   name: "Gold",    yahoo: "GC=F" },
  { id: "silver", name: "Silver",  yahoo: "SI=F" },
];

const CRYPTO = [
  { id: "btc", name: "Bitcoin",  yahoo: "BTC-USD" },
  { id: "eth", name: "Ethereum", yahoo: "ETH-USD" },
];

const YIELDS_US = [
  { id: "us3m",  name: "US 3M",  fred: "DGS3MO" },
  { id: "us2y",  name: "US 2Y",  fred: "DGS2" },
  { id: "us10y", name: "US 10Y", fred: "DGS10" },
];

const YIELDS_DE = [
  // ECB Statistical Data Warehouse — AAA euro-area government bond yield curve spot rates
  { id: "de3m",  name: "DE 3M",  dbnomics: "ECB/YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_3M" },
  { id: "de2y",  name: "DE 2Y",  dbnomics: "ECB/YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_2Y" },
  { id: "de10y", name: "DE 10Y", dbnomics: "ECB/YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y" },
];

// OAS spread series from FRED (percent-points; we convert to bps).
const SPREADS_OAS = [
  { id: "usig", name: "US IG", fred: "BAMLC0A0CM" },
  { id: "ushy", name: "US HY", fred: "BAMLH0A0HYM2" },
  { id: "euhy", name: "EU HY", fred: "BAMLHE00EHYIOAS" },
];

// EU IG — FRED has no public Euro IG OAS series, so we use the dominant
// euro IG corporate bond ETF (iShares Core € Corp Bond UCITS, IEAC.L on LSE)
// as a price-return proxy. Directionally tracks EU IG credit; not a true spread.
const SPREADS_PROXY = [
  { id: "euig", name: "EU IG", yahoo: "IEAC.L", note: "IEAC ETF proxy" },
];

// ─────────────────────────────────────────────────────────────────────────────
// WORKER ENTRYPOINT
// ─────────────────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    if (url.pathname !== "/markets" && url.pathname !== "/api/markets") {
      return json({ error: "Not found" }, 404, request);
    }

    // Edge cache (10 min)
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), { method: "GET" });
    const cached = await cache.match(cacheKey);
    if (cached) {
      const resp = new Response(cached.body, cached);
      Object.entries(cors).forEach(([k, v]) => resp.headers.set(k, v));
      return resp;
    }

    const data = await buildMarketData(env.FRED_KEY);
    const response = new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=600, s-maxage=600",
        ...cors,
      },
    });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  },
};

async function buildMarketData(fredKey) {
  const [equities, sectorsUs, sectorsEu, commods, crypto, usYields, deYields, spreadsOas, spreadsProxy] = await Promise.all([
    fetchYahooBatch(EQUITIES),
    fetchYahooBatch(SECTORS_US),
    fetchYahooBatch(SECTORS_EU),
    fetchYahooBatch(COMMODITIES),
    fetchYahooBatch(CRYPTO),
    fredKey ? fetchFredBatch(YIELDS_US, fredKey, "yield") : [],
    fetchDbnomicsEcbYields(YIELDS_DE),
    fredKey ? fetchFredBatch(SPREADS_OAS, fredKey, "spread") : [],
    fetchYahooBatch(SPREADS_PROXY),
  ]);

  // Merge spreads in the canonical US IG / US HY / EU IG / EU HY display order
  const byId = Object.fromEntries([...spreadsOas, ...spreadsProxy].map(r => [r.id, r]));
  const spreads = ["usig", "ushy", "euig", "euhy"].map(id => byId[id]).filter(Boolean);
  // Attach the proxy note to the EU IG row
  const euigProxy = SPREADS_PROXY.find(s => s.id === "euig");
  const euig = spreads.find(s => s.id === "euig");
  if (euig && euigProxy && !euig.error) euig.note = euigProxy.note;

  return {
    asOf: new Date().toISOString(),
    macro: {
      equities,
      usYields,
      deYields,
      spreads,
      crypto,
      commods,
    },
    sectors: {
      us: sectorsUs,
      eu: sectorsEu,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// YAHOO FINANCE
// ─────────────────────────────────────────────────────────────────────────────

async function fetchYahooBatch(items) {
  return Promise.all(items.map(fetchOneYahoo));
}

async function fetchOneYahoo(item) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${item.yahoo}?interval=1d&range=5y`;
    const r = await fetch(url, {
      cf: { cacheTtl: 600 },
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NexSkyDesk/1.0)",
        "Accept": "application/json",
      },
    });
    if (!r.ok) return { id: item.id, name: item.name, error: `yahoo ${r.status}` };
    const j = await r.json();
    const res = j.chart && j.chart.result && j.chart.result[0];
    if (!res) return { id: item.id, name: item.name, error: "no data" };
    const ts = res.timestamp || [];
    const closes = (res.indicators && res.indicators.quote && res.indicators.quote[0] && res.indicators.quote[0].close) || [];
    const meta = res.meta || {};
    return computePriceReturns(item, ts, closes, meta);
  } catch (e) {
    return { id: item.id, name: item.name, error: `yahoo-ex: ${String(e).slice(0, 60)}` };
  }
}

function computePriceReturns(item, ts, closes, meta) {
  const pts = [];
  for (let i = 0; i < ts.length; i++) {
    if (closes[i] != null && isFinite(closes[i])) pts.push({ t: ts[i] * 1000, c: closes[i] });
  }
  if (pts.length < 2) return { id: item.id, name: item.name, error: "insufficient" };
  const last = pts[pts.length - 1];
  const level = (meta.regularMarketPrice != null && isFinite(meta.regularMarketPrice)) ? meta.regularMarketPrice : last.c;

  const d = new Date(last.t);
  const yearEndPrior = Date.UTC(d.getUTCFullYear() - 1, 11, 31, 23, 59, 59);
  const monthEndPrior = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0, 23, 59, 59);

  const onOrBefore = ms => {
    let v = null;
    for (const p of pts) { if (p.t <= ms) v = p.c; else break; }
    return v;
  };
  const nAgo = n => pts.length > n ? pts[pts.length - 1 - n].c : null;
  const ret = base => (base != null && base !== 0) ? level / base - 1 : null;

  return {
    id: item.id,
    name: item.name,
    symbol: item.yahoo.replace("%5E", "^"),
    level: roundTo(level, 4),
    currency: meta.currency || "",
    type: "price",
    returns: {
      "1d":  ret(nAgo(1)),
      "1w":  ret(nAgo(5)),
      "1m":  ret(nAgo(21)),
      "ytd": ret(onOrBefore(yearEndPrior)),
      "1y":  ret(nAgo(252)),
      "3y":  ret(nAgo(252 * 3)),
      "5y":  ret(nAgo(252 * 5)),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FRED
// ─────────────────────────────────────────────────────────────────────────────

async function fetchFredBatch(items, key, type) {
  return Promise.all(items.map(i => fetchOneFred(i, key, type)));
}

async function fetchOneFred(item, key, type) {
  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${item.fred}&api_key=${key}&file_type=json&sort_order=desc&limit=1500`;
    const r = await fetch(url, { cf: { cacheTtl: 600 } });
    if (!r.ok) return { id: item.id, name: item.name, error: `fred ${r.status}` };
    const j = await r.json();
    const raw = j.observations || [];
    const obs = [];
    for (const o of raw) {
      if (o.value === "." || o.value == null) continue;
      const v = parseFloat(o.value);
      if (!isFinite(v)) continue;
      obs.push({ t: new Date(o.date + "T00:00:00Z").getTime(), v });
    }
    obs.reverse();  // ascending by date
    return computeYieldSpreadChanges(item, obs, type);
  } catch (e) {
    return { id: item.id, name: item.name, error: `fred-ex: ${String(e).slice(0, 60)}` };
  }
}

function computeYieldSpreadChanges(item, obs, type) {
  if (obs.length < 2) return { id: item.id, name: item.name, error: "insufficient" };
  const last = obs[obs.length - 1];
  const level = last.v;

  const d = new Date(last.t);
  const yearEndPrior = Date.UTC(d.getUTCFullYear() - 1, 11, 31, 23, 59, 59);

  const onOrBefore = ms => {
    let v = null;
    for (const o of obs) { if (o.t <= ms) v = o.v; else break; }
    return v;
  };
  const nAgo = n => obs.length > n ? obs[obs.length - 1 - n].v : null;

  // FRED returns yields and OAS in percentage points (e.g. 4.29 for 4.29%).
  // For heatmap colouring we want bps change. 1 pp = 100 bps.
  const bpsChange = base => (base != null) ? Math.round((level - base) * 100) : null;

  return {
    id: item.id,
    name: item.name,
    series: item.fred,
    level: roundTo(level, 3),
    unit: type === "yield" ? "%" : "bps",
    type,  // "yield" or "spread"
    changes_bps: {
      "1d":  bpsChange(nAgo(1)),
      "1w":  bpsChange(nAgo(5)),
      "1m":  bpsChange(nAgo(21)),
      "ytd": bpsChange(onOrBefore(yearEndPrior)),
      "1y":  bpsChange(nAgo(252)),
      "3y":  bpsChange(nAgo(252 * 3)),
      "5y":  bpsChange(nAgo(252 * 5)),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DBNOMICS / ECB YIELD CURVE
// ─────────────────────────────────────────────────────────────────────────────

async function fetchDbnomicsEcbYields(items) {
  return Promise.all(items.map(fetchOneDbnomics));
}

async function fetchOneDbnomics(item) {
  try {
    const url = `https://api.db.nomics.world/v22/series/${item.dbnomics}?observations=1`;
    const r = await fetch(url, { cf: { cacheTtl: 600 } });
    if (!r.ok) return { id: item.id, name: item.name, error: `dbnomics ${r.status}` };
    const j = await r.json();
    const s = j.series && j.series.docs && j.series.docs[0];
    if (!s || !s.period || !s.value) return { id: item.id, name: item.name, error: "no series" };
    const obs = [];
    for (let i = 0; i < s.period.length; i++) {
      const v = s.value[i];
      if (v == null || v === "NA") continue;
      const n = typeof v === "number" ? v : parseFloat(v);
      if (!isFinite(n)) continue;
      obs.push({ t: new Date(s.period[i] + "T00:00:00Z").getTime(), v: n });
    }
    // DBnomics returns ascending; no reversal needed
    return computeYieldSpreadChanges(item, obs, "yield");
  } catch (e) {
    return { id: item.id, name: item.name, error: `dbnomics-ex: ${String(e).slice(0, 60)}` };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function roundTo(x, d) { const p = Math.pow(10, d); return Math.round(x * p) / p; }

// Allow the site origin and its www variant. Add more if you host on preview domains.
const ALLOWED_ORIGINS = new Set([
  "https://nexsky.io",
  "https://www.nexsky.io",
]);

function corsHeaders(request) {
  const origin = request && request.headers.get("Origin");
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://nexsky.io";
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

function json(body, status = 200, request = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(request) },
  });
}
