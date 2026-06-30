// NexSky members — shared library helpers (hub, research, article)
async function loadLibrary() {
  // Cache-bust so a newly published library.json is never masked by an edge/CDN cache.
  const r = await fetch('/members/library.json?t=' + Date.now(), { cache: 'no-cache' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
function typeLabel(t) {
  return ({ cio: 'CIO House View', briefing: 'Daily Briefing', research: 'Research', opportunities: 'Opportunities' })[t] || t;
}
function fmtDate(d) {
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch (e) { return d; }
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function cardHTML(it) {
  if (it.type === 'opportunities') return oppCardHTML(it);
  const url = it.url || ('/members/article.html?slug=' + encodeURIComponent(it.slug));
  const cta = it.format === 'pdf' ? 'Open PDF &rarr;' : 'Read &rarr;';
  return `<a class="lib-card" href="${url}">
    <div class="lib-top"><span class="lib-tag">${esc(typeLabel(it.type))}</span><span class="lib-date">${esc(fmtDate(it.date))}</span></div>
    <div class="lib-title">${esc(it.title)}</div>
    <div class="lib-summary">${esc(it.summary)}</div>
    <span class="lib-cta">${cta}</span></a>`;
}
// Shared mailto for opportunity enquiries (used by the card and the detail page).
function oppMailto(it) {
  const subject = encodeURIComponent('Enquiry: ' + (it.title || 'NexSky opportunity'));
  const body = encodeURIComponent('I am a NexSky member and would like to learn more about the ' + (it.title || '') + ' opportunity.');
  return 'mailto:contact@nexsky.io?subject=' + subject + '&body=' + body;
}
// Standard layout for all Opportunity cards: top-line description and a PDF teaser
// download. The whole card links through to a detail page (article.html) that
// carries the full summary and the single "Reach out" contact action.
function oppCardHTML(it) {
  const detail = '/members/article.html?slug=' + encodeURIComponent(it.slug);
  const pdf = it.pdfUrl || (it.format === 'pdf' ? it.url : '');
  const dl = pdf
    ? `<a class="lib-btn primary" href="${esc(pdf)}" target="_blank" rel="noopener">Download teaser (PDF)</a>`
    : '';
  return `<div class="lib-card opp-card">
    <a class="opp-stretch" href="${detail}" aria-label="${esc(it.title)}"></a>
    <div class="lib-top"><span class="lib-tag">${esc(typeLabel(it.type))}</span><span class="lib-date">${esc(fmtDate(it.date))}</span></div>
    <div class="lib-title">${esc(it.title)}</div>
    <div class="lib-summary">${esc(it.summary)}</div>
    <div class="lib-actions">${dl}</div>
  </div>`;
}
async function renderGrid(containerId, opts) {
  opts = opts || {};
  const el = document.getElementById(containerId);
  if (!el) return;
  try {
    let items = await loadLibrary();
    items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    if (opts.type && opts.type !== 'all') items = items.filter(i => i.type === opts.type);
    if (opts.limit) items = items.slice(0, opts.limit);
    el.innerHTML = items.length ? items.map(cardHTML).join('') : '<div class="lib-empty">Nothing here yet.</div>';
  } catch (e) {
    el.innerHTML = '<div class="lib-empty">Library unavailable right now.</div>';
  }
}

// Mobile nav: inject a hamburger toggle so the section menu is reachable on small screens.
document.addEventListener('DOMContentLoaded', function () {
  var nav = document.querySelector('.nav');
  var center = document.querySelector('.nav-center');
  if (!nav || !center || nav.querySelector('.nav-toggle')) return;
  var logout = nav.querySelector('.nav-logout');
  if (logout) {
    var dl = document.createElement('a');
    dl.href = logout.getAttribute('href');
    dl.textContent = 'Sign out';
    dl.className = 'nav-center-logout';
    center.appendChild(dl);
  }
  var btn = document.createElement('button');
  btn.className = 'nav-toggle';
  btn.setAttribute('aria-label', 'Menu');
  btn.innerHTML = '<span></span><span></span><span></span>';
  nav.appendChild(btn);
  btn.addEventListener('click', function () { center.classList.toggle('open'); });
  center.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () { center.classList.remove('open'); });
  });
});

// ===== Persistent market ticker (fed by api.nexsky.io/markets) =====
// Real data refreshes every 5s (worker-cached ~10min). Between refreshes a tiny
// cosmetic flutter walks each value ±~0.05% so the strip "ticks" like a live feed;
// the "Indicative · delayed" tag makes clear it is not a real-time quote.
var TICK = null;
document.addEventListener('DOMContentLoaded', function () {
  if (document.querySelector('.mkt-ticker')) return;
  var nav = document.querySelector('.nav');
  if (!nav) return;
  var bar = document.createElement('div');
  bar.className = 'mkt-ticker';
  bar.innerHTML = '<div class="mkt-track" id="mktTrack"></div><div class="mkt-flag">Indicative &middot; delayed</div>';
  nav.insertAdjacentElement('afterend', bar);
  renderTicker();
  setInterval(renderTicker, 5000);
  setInterval(flutterTicker, 1000);
});
function tkFmt(v, dec) { return v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
function tkDecimals(it, cat) {
  if (cat === 'fx') return it.id === 'eurusd' ? 4 : 2;
  if (it.id === 'em') return 2;
  return Math.abs(it.level) >= 1000 ? 0 : 2;
}
function tkLevel(v, it, cat) {
  if (cat === 'usYields' || cat === 'deYields') return v.toFixed(2) + '%';
  if (cat === 'fx') return it.id === 'eurusd' ? v.toFixed(4) : v.toFixed(2);
  if (it.id === 'em') return v.toFixed(1);
  return v.toLocaleString('en-US', { maximumFractionDigits: v > 1000 ? 0 : 2 });
}
function tkVals(p, f) {
  var it = p.it, cat = p.cat, r1 = (it.returns || {})['1d'];
  var level = it.level * (1 + (f || 0));
  var lvl = tkLevel(level, it, cat);
  if (typeof r1 !== 'number') return { lvl: lvl, chg: '—', cls: 'muted' };
  var prev = it.level / (1 + r1), absC = level - prev, pct = prev ? absC / prev : 0, up = absC >= 0, dec = tkDecimals(it, cat);
  var chg = (absC >= 0 ? '+' : '-') + tkFmt(Math.abs(absC), dec) + ' (' + (up ? '+' : '-') + Math.abs(pct * 100).toFixed(2) + '%)';
  return { lvl: lvl, chg: chg, cls: up ? 'up' : 'dn' };
}
function tkCell(p, i) {
  var v = tkVals(p, TICK ? TICK.f[i] : 0);
  return '<div class="mk-item" data-i="' + i + '"><div class="mk-name">' + esc(p.it.name) + '</div><div class="mk-lvl">' + v.lvl + '</div><div class="mk-chg ' + v.cls + '">' + v.chg + '</div></div>';
}
function paintTicker() {
  var track = document.getElementById('mktTrack');
  if (!track || !TICK) return;
  var html = TICK.pick.map(function (p, i) { return tkCell(p, i); }).join('');
  track.innerHTML = '<div class="mkt-seq">' + html + '</div><div class="mkt-seq" aria-hidden="true">' + html + '</div>';
}
function tkSession(tz, oH, oM, cH, cM) {
  var p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  var wd = p.find(function (x) { return x.type === 'weekday'; }).value;
  if (wd === 'Sat' || wd === 'Sun') return false;
  var t = (+p.find(function (x) { return x.type === 'hour'; }).value) * 60 + (+p.find(function (x) { return x.type === 'minute'; }).value);
  return t >= oH * 60 + oM && t <= cH * 60 + cM;
}
function tkFxOpen() {
  var d = new Date(), day = d.getUTCDay(), h = d.getUTCHours();
  if (day === 6) return false;            // Saturday: closed
  if (day === 0 && h < 21) return false;  // Sunday before ~21:00 UTC: closed
  if (day === 5 && h >= 21) return false;  // Friday after ~21:00 UTC: closed
  return true;
}
function tkOpen(p) {
  var id = p.it.id, cat = p.cat;
  if (cat === 'crypto') return true;                 // 24/7
  if (cat === 'fx' || cat === 'commods') return tkFxOpen();
  if (cat === 'equities') {
    if (id === 'sx5e') return tkSession('Europe/Berlin', 9, 0, 17, 30);
    if (id === 'nky') return tkSession('Asia/Tokyo', 9, 0, 15, 0);
    if (id === 'hsi') return tkSession('Asia/Hong_Kong', 9, 30, 16, 0);
    return tkSession('America/New_York', 9, 30, 16, 0);  // spx, ndx, em
  }
  return false;
}
function flutterTicker() {
  if (!TICK) return;
  TICK.pick.forEach(function (p, i) {
    var r1 = (p.it.returns || {})['1d'];
    if (typeof r1 !== 'number') return;
    TICK.f[i] = tkOpen(p) ? (TICK.f[i] * 0.85 + (Math.random() * 2 - 1) * 0.00035) : 0;
    var v = tkVals(p, TICK.f[i]);
    document.querySelectorAll('#mktTrack .mk-item[data-i="' + i + '"]').forEach(function (el) {
      var a = el.querySelector('.mk-lvl'); if (a) a.textContent = v.lvl;
      var b = el.querySelector('.mk-chg'); if (b) { b.className = 'mk-chg ' + v.cls; b.textContent = v.chg; }
    });
  });
}
async function renderTicker() {
  var track = document.getElementById('mktTrack');
  if (!track) return;
  try {
    var d = await (await fetch('https://api.nexsky.io/markets', { cache: 'no-cache' })).json();
    var m = d.macro || {};
    var order = [
      ['equities', ['spx', 'ndx', 'sx5e', 'nky', 'hsi', 'em']],
      ['fx', ['eurusd', 'dxy']],
      ['commods', ['gold', 'brent']],
      ['crypto', ['btc', 'eth']],
      ['usYields', ['us10y']],
      ['deYields', ['de10y']]
    ];
    var pick = [];
    order.forEach(function (o) { (m[o[0]] || []).forEach(function (it) { if (o[1].indexOf(it.id) >= 0) pick.push({ cat: o[0], it: it }); }); });
    var keepF = (TICK && TICK.f && TICK.f.length === pick.length) ? TICK.f : pick.map(function () { return 0; });
    TICK = { pick: pick, f: keepF };
    paintTicker();
  } catch (e) {
    if (!TICK) track.innerHTML = '<div class="mkt-seq"><span class="mk-item" style="opacity:.55">Live market data unavailable</span></div>';
  }
}
