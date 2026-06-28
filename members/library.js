// NexSky members — shared library helpers (hub, research, article)
async function loadLibrary() {
  const r = await fetch('/members/library.json', { cache: 'no-cache' });
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
  const url = it.url || ('/members/article.html?slug=' + encodeURIComponent(it.slug));
  const cta = it.format === 'pdf' ? 'Open PDF &rarr;' : 'Read &rarr;';
  return `<a class="lib-card" href="${url}">
    <div class="lib-top"><span class="lib-tag">${esc(typeLabel(it.type))}</span><span class="lib-date">${esc(fmtDate(it.date))}</span></div>
    <div class="lib-title">${esc(it.title)}</div>
    <div class="lib-summary">${esc(it.summary)}</div>
    <span class="lib-cta">${cta}</span></a>`;
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
