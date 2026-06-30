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
document.addEventListener('DOMContentLoaded', function () {
  if (document.querySelector('.mkt-ticker')) return;
  var nav = document.querySelector('.nav');
  if (!nav) return;
  var bar = document.createElement('div');
  bar.className = 'mkt-ticker';
  bar.innerHTML = '<div class="mkt-track" id="mktTrack"></div>';
  nav.insertAdjacentElement('afterend', bar);
  renderTicker();
  setInterval(renderTicker, 5000);
});
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
    order.forEach(function (o) {
      (m[o[0]] || []).forEach(function (it) { if (o[1].indexOf(it.id) >= 0) pick.push({ cat: o[0], it: it }); });
    });
    function lvl(it, cat) {
      var v = it.level;
      if (cat === 'usYields' || cat === 'deYields') return v.toFixed(2) + '%';
      if (cat === 'fx') return it.id === 'eurusd' ? v.toFixed(4) : v.toFixed(2);
      if (it.id === 'em') return v.toFixed(1);
      return v.toLocaleString('en-US', { maximumFractionDigits: v > 1000 ? 0 : 2 });
    }
    function fmtNum(v, dec) { return v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
    function decimalsFor(it, cat) {
      if (cat === 'fx') return it.id === 'eurusd' ? 4 : 2;
      if (it.id === 'em') return 2;
      return Math.abs(it.level) >= 1000 ? 0 : 2;
    }
    function cell(p) {
      var it = p.it, cat = p.cat, r1 = (it.returns || {})['1d'];
      var line3 = '<div class="mk-chg muted">—</div>';
      if (typeof r1 === 'number') {
        var up = r1 >= 0, dec = decimalsFor(it, cat);
        var abs = it.level * r1 / (1 + r1);
        var absStr = (abs >= 0 ? '+' : '-') + fmtNum(Math.abs(abs), dec);
        var pctStr = (up ? '+' : '-') + Math.abs(r1 * 100).toFixed(2) + '%';
        line3 = '<div class="mk-chg ' + (up ? 'up' : 'dn') + '">' + absStr + ' (' + pctStr + ')</div>';
      }
      return '<div class="mk-item"><div class="mk-name">' + esc(it.name) + '</div><div class="mk-lvl">' + lvl(it, cat) + '</div>' + line3 + '</div>';
    }
    var html = pick.map(cell).join('');
    track.innerHTML = '<div class="mkt-seq">' + html + '</div><div class="mkt-seq" aria-hidden="true">' + html + '</div>';
  } catch (e) {
    track.innerHTML = '<div class="mkt-seq"><span class="mk-item" style="opacity:.55">Live market data unavailable</span></div>';
  }
}
