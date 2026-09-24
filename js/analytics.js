// Google Analytics 4 + Meta Pixel, loaded ONLY after the visitor agrees.
// Nothing shows or loads until the IDs are set in js/config.js (SWAY.ga4, SWAY.pixel).
(() => {
  const C = window.SWAY || {};
  if (!C.ga4 && !C.pixel) return;
  try { if (localStorage.getItem('sway-me') === '1' || /[?&]me=1/.test(location.search)) return; } catch (e) {}   // the owner's own visits
  const t = k => (typeof I18N !== 'undefined' ? I18N.t(k) : k);
  let choice = null;
  try { choice = localStorage.getItem('sway-consent'); } catch (e) {}

  function load() {
    if (C.ga4) {
      const s = document.createElement('script');
      s.async = true; s.src = `https://www.googletagmanager.com/gtag/js?id=${C.ga4}`;
      document.head.appendChild(s);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { dataLayer.push(arguments); };
      gtag('js', new Date()); gtag('config', C.ga4, { anonymize_ip: true });
    }
    if (C.pixel) {
      !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      fbq('init', C.pixel); fbq('track', 'PageView');
    }
    const ev = (ga, fb, params) => { if (window.gtag) gtag('event', ga, params); if (window.fbq) fbq('track', fb, params); };
    document.addEventListener('sway:checkout', () => ev('begin_checkout', 'InitiateCheckout', { currency: 'ILS', value: C.price }));
    document.addEventListener('sway:details', () => ev('add_shipping_info', 'AddPaymentInfo', { currency: 'ILS' }));
    // an order is only real after the WhatsApp confirmation: the form is a lead, tapping "confirm" is the purchase signal
    document.addEventListener('sway:order', e => ev('generate_lead', 'Lead', { currency: 'ILS', value: e.detail.value }));
    document.addEventListener('sway:confirm', e => ev('purchase', 'Purchase', { currency: 'ILS', value: e.detail.value }));
  }

  if (choice === 'yes') return load();
  if (choice === 'no') return;
  const bar = document.createElement('div');
  bar.className = 'consent'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', t('consent.label'));
  const draw = () => {
    bar.innerHTML = `<p>${t('consent.text')} <a href="terms.html">${t('foot.terms')}</a></p>
      <div><button class="btn btn--sm btn--coral" data-yes>${t('consent.yes')}</button><button class="btn btn--sm btn--line" data-no>${t('consent.no')}</button></div>`;
  };
  draw();
  document.addEventListener('langchange', draw);
  bar.addEventListener('click', e => {
    const yes = e.target.closest('[data-yes]'), no = e.target.closest('[data-no]');
    if (!yes && !no) return;
    try { localStorage.setItem('sway-consent', yes ? 'yes' : 'no'); } catch (x) {}
    bar.remove();
    if (yes) load();
  });
  document.body.appendChild(bar);
})();
