// Anonymous visit statistics for the admin page (supabase: public.track, sway_v11_insights.sql).
// No cookies, no IP, nothing personal: a random id lives in sessionStorage for this visit only.
// Other scripts report with SwayTrack.push(kind, detail); clicks and scrolling are picked up here.
(() => {
  const C = window.SWAY || {};
  if (!C.supabaseUrl || /^(localhost|127\.)/.test(location.hostname) || document.body.dataset.page === 'admin') return;
  const ss = (k, v) => { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch { return null; } };
  const q = new URLSearchParams(location.search);

  let sid = ss('sway-sid');
  if (!sid) { sid = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => (b % 36).toString(36)).join(''); ss('sway-sid', sid); }
  // where the visit came from, fixed at its first page: ?src= (our tracked links) > utm_source > the referring site
  let src = ss('sway-src');
  if (src === null) {
    const ref = document.referrer && new URL(document.referrer).hostname;
    const known = { instagram: /instagram/, facebook: /facebook|fb\.com/, google: /google\./, whatsapp: /whatsapp|wa\.me/, tiktok: /tiktok/, youtube: /youtube|youtu\.be/ };
    src = q.get('src') || q.get('utm_source') || (ref && ref !== location.hostname ? (Object.keys(known).find(k => known[k].test(ref)) || ref.replace(/^www\./, '')) : '');
    ss('sway-src', src);
  }
  const page = (location.pathname.split('/').pop() || 'index').replace(/\.html$/, '') || 'index';
  const dev = matchMedia('(pointer: coarse)').matches ? 'm' : 'd';

  let queue = [], timer = 0;
  function flush() {
    if (!queue.length) return;
    const body = JSON.stringify({ p_sid: sid, p_src: src || null, p_dev: dev, p_lang: document.documentElement.lang === 'en' ? 'en' : 'he', p_events: queue });
    queue = [];
    fetch(`${C.supabaseUrl}/rest/v1/rpc/track`, { method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json', apikey: C.supabaseKey, Authorization: `Bearer ${C.supabaseKey}` }, body }).catch(() => {});
  }
  const once = new Set();
  function push(k, d, unique) {
    if (unique && once.has(k + d)) return;
    once.add(k + d);
    queue.push({ k, p: page, d: d == null ? undefined : String(d).slice(0, 60) });
    clearTimeout(timer); timer = setTimeout(flush, 4000);
  }
  addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
  addEventListener('pagehide', flush);
  window.SwayTrack = { push };

  push('view');
  let ab = null; try { ab = sessionStorage.getItem('sway-ab'); } catch {}
  if (ab) push('ab', 'cta:' + ab, true);   // the order-button test (i18n.js); results per visit
  // something broke in the browser: counted, and the bot warns the owner when it repeats (at most 3 per visit)
  let errs = 0;
  const err = m => { if (errs++ < 3) { push('err', String(m || 'error').slice(0, 55)); flush(); } };
  addEventListener('error', e => err(e.message));
  addEventListener('unhandledrejection', e => err(e.reason && e.reason.message));
  window.SwayTrack.err = err;
  // the checkout and the order (order.js dispatches these)
  document.addEventListener('sway:checkout', () => push('checkout', null, true));
  document.addEventListener('sway:details', () => push('details', null, true));
  document.addEventListener('sway:order', e => push('order', e.detail?.no));
  document.addEventListener('sway:confirm', () => push('confirm', null, true));

  document.addEventListener('click', e => {
    const el = e.target.closest('a,button,summary,input');
    if (!el) return;
    if (el.matches('[data-pick]')) push('colour', el.dataset.pick);
    else if (el.matches('[data-order][data-colour]')) push('colour', el.dataset.colour);
    else if (el.matches('[data-ar-open]')) push('ar', null, true);
    else if (el.matches('a[href*="wa.me"]') && !el.closest('dialog')) push('wa', page, true);
    else if (el.matches('#faq summary')) push('faq', el.textContent.trim(), true);
  });
  document.addEventListener('change', e => {
    if (e.target.name === 'story-colour') push('colour', e.target.value);
  });
  document.addEventListener('input', e => { if (e.target.closest('[data-fit]')) push('fit', null, true); });

  // how far down the page people get (once per mark)
  const marks = [25, 50, 75, 100];
  addEventListener('scroll', () => {
    const h = document.documentElement.scrollHeight - innerHeight;
    const pct = h > 0 ? scrollY / h * 100 : 100;
    for (const m of marks) if (pct >= m - 2) push('scroll', m, true);
  }, { passive: true });
})();
