(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const phone = matchMedia('(hover: none) and (pointer: coarse), (max-width: 860px)').matches;
  const state = window.SWAY_STATE = { colour: 'blue' };
  const IMG = { blue: 'assets/img/blue-garden.webp', brown: 'assets/img/brown-garden-same.webp' };
  const DETAIL = { blue: 'assets/img/blue-detail.webp', brown: 'assets/img/brown-detail.webp' };

  I18N.init();
  $$('[data-lang-toggle]').forEach(b => b.addEventListener('click', () => I18N.set(I18N.lang === 'he' ? 'en' : 'he')));

  /* ---------- film: 600dvh of scroll scrubs the match-cut, linearly, eased like the original ---------- */
  const film = $('.sway-film');
  const video = $('.film-video');
  let target = 0, cur = 0, ready = false;
  // after load: the poster + fonts paint first, then the film downloads
  const whenLoaded = f => (document.readyState === 'complete' ? f() : addEventListener('load', f, { once: true }));
  if (film && !reduced) whenLoaded(() => {
    // whole file as a blob: seeking a blob never stalls on network range requests
    // 720p fills a phone's 16:9 band at retina density; big/retina screens get 1080p
    fetch(!phone && innerWidth * devicePixelRatio > 1400 ? 'assets/film/film-1920.mp4' : 'assets/film/film-1280.mp4')
      .then(r => { if (!r.ok) throw 0; return r.blob(); })
      .then(b => {
        video.preload = 'auto';
        video.src = URL.createObjectURL(b);
        video.addEventListener('loadedmetadata', () => { ready = true; }, { once: true });
        video.addEventListener('seeked', () => film.setAttribute('data-painted', ''), { once: true });
        video.load();
        // iOS only paints seeks after the element has played once
        video.play().then(() => video.pause()).catch(() => {});
      }).catch(() => {});
  });

  // phone backdrop: the page blue above the 16:9 band (text lives there, as in the original), and
  // the frame's own floor colour extended below it, so the scene runs to the bottom of the screen
  const stage = $('.film-stage');
  const band = matchMedia('(max-width: 860px)').matches && stage;
  const smp = band && document.createElement('canvas');
  const sctx = smp && Object.assign(smp, { width: 16, height: 9 }).getContext('2d', { willReadFrequently: true });
  let ambQueued = false;
  // row average, pulled k of the way toward the brand ink so ivory text stays readable on it
  const rowAvg = (d, y0, y1, k) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = 0; x < 16; x++) { const i = (y * 16 + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    const mix = (v, ink) => Math.round(v / n * (1 - k) + ink * k);
    return `rgb(${mix(r, 16)},${mix(g, 47)},${mix(b, 60)})`;
  };
  const paintAmbient = src => {
    if (!sctx || ambQueued) return;
    ambQueued = true;
    requestAnimationFrame(() => {
      ambQueued = false;
      try {
        sctx.drawImage(src, 0, 0, 16, 9);
        const d = sctx.getImageData(0, 0, 16, 9).data;
        const H = stage.clientHeight, r = src.getBoundingClientRect(), s0 = stage.getBoundingClientRect().top;
        const a = ((r.top - s0) / H * 100).toFixed(1), b = ((r.bottom - s0) / H * 100).toFixed(1);
        stage.style.background = `linear-gradient(var(--sway-blue) ${a}%, ${rowAvg(d, 7, 9, 0.3)} ${b}%)`;
      } catch (e) {}
    });
  };
  if (sctx) {
    const poster = $('.film-poster');
    if (poster.complete) paintAmbient(poster); else poster.addEventListener('load', () => paintAmbient(poster), { once: true });
    video.addEventListener('seeked', () => paintAmbient(video));
  }

  const panels = $$('.chapter-panel');
  function tick() {
    if (film) {
      const span = film.offsetHeight - innerHeight;
      target = Math.min(1, Math.max(0, -film.getBoundingClientRect().top / span));
      if (ready && !video.seeking) {
        cur += (target - cur) * 0.2;
        const t = Math.min(0.999, cur) * (video.duration || 1);
        if (Math.abs(video.currentTime - t) > (phone ? 0.02 : 0.008)) video.currentTime = t;
      }
    }
    // each panel drifts from +26px to -12px while it crosses the viewport
    if (!reduced) panels.forEach(p => {
      const r = p.getBoundingClientRect();
      if (r.bottom < -100 || r.top > innerHeight + 100) return;
      const k = Math.min(1, Math.max(0, (innerHeight - r.top) / (innerHeight + r.height)));
      p.style.transform = `translateY(${(26 - 38 * k).toFixed(1)}px)`;
    });
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  /* ---------- chapter rail + floating buy bar ---------- */
  const rail = $('[data-rail]');
  const links = $$('a', rail);
  const chapterIO = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    const n = +e.target.dataset.chapter;
    links.forEach((a, i) => {
      a.classList.toggle('is-active', i === n);
      if (i === n) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current');
    });
  }), { rootMargin: '-35% 0px -45% 0px', threshold: 0 });
  $$('[data-chapter]').forEach(el => chapterIO.observe(el));

  const bar = $('[data-buybar]');
  const barBtn = $('button', bar);
  let inJourney = true, footerOn = false;
  const syncBars = () => {
    rail.classList.toggle('rail-hidden', !inJourney);
    const on = !inJourney && !footerOn && !$('dialog[open]');
    bar.classList.toggle('is-on', on);
    barBtn.tabIndex = on ? 0 : -1;
  };
  new IntersectionObserver(([e]) => { inJourney = e.isIntersecting; syncBars(); }).observe($('.journey'));
  new IntersectionObserver(([e]) => { footerOn = e.isIntersecting; syncBars(); }, { threshold: 0.1 }).observe($('.sway-footer'));
  $$('dialog').forEach(d => d.addEventListener('close', syncBars));
  document.addEventListener('sway:checkout', syncBars);

  /* ---------- facts marquee: three identical tracks, pausable ---------- */
  const mq = $('[data-marquee]');
  const mqWin = $('.facts-window', mq);
  const mqBtn = $('[data-marquee-pause]', mq);
  function drawMarquee() {
    const first = $('.facts-track', mqWin);
    $$('.facts-track', mqWin).slice(1).forEach(t => t.remove());
    for (let i = 0; i < 2; i++) {
      const c = first.cloneNode(true);
      c.setAttribute('aria-hidden', 'true');
      $$('[data-i18n]', c).forEach(el => el.removeAttribute('data-i18n'));
      mqWin.appendChild(c);
    }
    const paused = mq.classList.contains('is-paused');
    mqBtn.textContent = I18N.t(paused ? 'mq.play' : 'mq.pause');
    mqBtn.setAttribute('aria-label', I18N.t(paused ? 'mq.play.label' : 'mq.pause.label'));
    mqBtn.setAttribute('aria-pressed', String(paused));
  }
  mqBtn.addEventListener('click', () => { mq.classList.toggle('is-paused'); drawMarquee(); });
  document.addEventListener('langchange', drawMarquee);
  drawMarquee();

  /* ---------- colours: the same patio photo, blue or brown ---------- */
  const variant = $('[data-variant]'), detail = $('[data-detail]'), buy = $('[data-variant-buy]');
  function setColour(c) {
    state.colour = c;
    variant.src = IMG[c];
    variant.alt = I18N.t(`col.${c}.alt`);
    detail.src = DETAIL[c];
    $$('input[name="story-colour"]').forEach(i => { i.checked = i.value === c; i.closest('.colour-choice').classList.toggle('selected', i.value === c); });
    buy.setAttribute('aria-label', I18N.t('col.buy', { c: I18N.t('col.' + c) }));
    buy.dataset.colour = c;
    document.dispatchEvent(new CustomEvent('colourchange', { detail: c }));
  }
  $$('input[name="story-colour"]').forEach(i => i.addEventListener('change', () => setColour(i.value)));
  document.addEventListener('langchange', () => setColour(state.colour));
  setColour('blue');
  // warm the brown photo once the page is idle, so switching is instant
  addEventListener('load', () => setTimeout(() => { new Image().src = IMG.brown; }, 1500));

  /* ---------- order buttons ---------- */
  $$('[data-order]').forEach(b => b.addEventListener('click', () => {
    window.Order.open({ colour: b.dataset.colour || state.colour, group: b.dataset.order === 'group' });
  }));

  /* ---------- approved customer reviews ---------- */
  fetch(`${SWAY.supabaseUrl}/rest/v1/rpc/get_reviews`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SWAY.supabaseKey }, body: '{}'
  }).then(r => (r.ok ? r.json() : [])).then(list => {
    if (!Array.isArray(list) || !list.length) return;
    const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const photo = p => `${SWAY.supabaseUrl}/storage/v1/object/public/reviews/${p}`;
    const render = () => {
      $('[data-reviews]').innerHTML = list.map(r => `<figure class="review">
        ${r.photo ? `<img src="${photo(r.photo)}" alt="" loading="lazy">` : ''}
        <p class="review__stars" aria-label="${r.rating}/5">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</p>
        <blockquote>${esc(r.body)}</blockquote>
        <figcaption>${esc(r.name)} · ${I18N.t('col.' + r.colour)}</figcaption></figure>`).join('');
    };
    render();
    document.addEventListener('langchange', render);
    $('#reviews').hidden = false;
  }).catch(() => {});

  /* ---------- season line, evening mode (dusk blue after sunset in Israel) ---------- */
  const today = new Date().toISOString().slice(0, 10);
  $$('[data-season]').forEach(el => {
    const [from, to] = el.dataset.season.split(':');
    el.hidden = !(today >= from && today < to);
  });
  fetch('https://api.open-meteo.com/v1/forecast?latitude=32.08&longitude=34.78&daily=sunrise,sunset&timezone=Asia%2FJerusalem&forecast_days=1')
    .then(r => r.json()).then(d => {
      // API times are Israel wall-clock without offset: convert with the offset it reports
      const at = x => new Date(Date.parse(x + ':00Z') - d.utc_offset_seconds * 1000);
      const now = new Date();
      document.documentElement.classList.toggle('evening', now > at(d.daily.sunset[0]) || now < at(d.daily.sunrise[0]));
    }).catch(() => {});

  /* ---------- will it fit? (top view, cm) ---------- */
  const FRAME = [300, 118], NEED = [330, 150];
  const fitForm = $('[data-fit]'), fitOut = $('[data-fit-result]'), plan = $('[data-fit-plan]'), fitBox = $('#fit');
  function fit() {
    const a = +fitForm.len.value, b = +fitForm.wid.value;
    if (!(a > 0 && b > 0)) { fitOut.textContent = ''; fitBox.dataset.state = ''; return drawPlan(400, 240, false); }
    const L = Math.max(a, b), W = Math.min(a, b);   // the hammock can turn to the long side
    const shortL = Math.max(0, FRAME[0] - L), shortW = Math.max(0, FRAME[1] - W);
    let s, msg;
    if (L >= NEED[0] && W >= NEED[1]) { s = 'ok'; msg = I18N.t('fit.ok', { l: L - NEED[0], w: W - NEED[1] }); }
    else if (!shortL && !shortW) { s = 'tight'; msg = I18N.t('fit.tight'); }
    else { s = 'no'; msg = I18N.t(shortL && shortW ? 'fit.no' : shortL ? 'fit.no.len' : 'fit.no.wid', { l: shortL, w: shortW }); }
    fitBox.dataset.state = s;
    fitOut.textContent = msg;
    drawPlan(L, W, true);
  }
  function drawPlan(L, W, filled) {
    // scale the larger of (space, need) into the 400x240 drawing area
    const s = Math.min(400 / Math.max(L, NEED[0]), 240 / Math.max(W, NEED[1]));
    const put = (el, w, h) => {
      el.setAttribute('width', w * s); el.setAttribute('height', h * s);
      el.setAttribute('x', 210 - w * s / 2); el.setAttribute('y', 130 - h * s / 2);
    };
    put($('.fit-space', plan), L, W);
    put($('.fit-need', plan), NEED[0], NEED[1]);
    put($('.fit-frame', plan), FRAME[0], FRAME[1]);
    plan.classList.toggle('is-empty', !filled);
  }
  fitForm.addEventListener('input', fit);
  document.addEventListener('langchange', fit);
  fit();

  /* ---------- AR: true size, fixed scale, red floor frame ---------- */
  const arDialog = $('#ar-dialog');
  const arStage = $('[data-ar-stage]');
  function loadScript(src, module) {
    return new Promise((res, rej) => {
      if ($(`script[src="${src}"]`)) return res();
      const s = document.createElement('script');
      s.src = src; if (module) s.type = 'module';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  const arSrc = () => `assets/3d/sway-${state.colour}-ar.glb?v=3`;  // bump when the models change
  document.addEventListener('colourchange', () => { const mv = $('model-viewer', arStage); if (mv) mv.src = arSrc(); });
  $$('[data-ar-open]').forEach(b => b.addEventListener('click', () => {
    if (!arStage.firstChild) {
      loadScript('https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js', true);
      const mv = document.createElement('model-viewer');
      Object.entries({
        src: arSrc(), alt: 'Sway',
        ar: '', 'ar-modes': 'webxr scene-viewer quick-look', 'ar-scale': 'fixed',
        'camera-controls': '', 'auto-rotate': '', 'shadow-intensity': '1', 'touch-action': 'pan-y'
      }).forEach(([k, v]) => mv.setAttribute(k, v));
      const place = document.createElement('button');
      place.slot = 'ar-button'; place.className = 'btn ar-place'; place.type = 'button';
      place.dataset.i18n = 'ar.place'; place.textContent = I18N.t('ar.place');
      mv.appendChild(place);
      arStage.appendChild(mv);
    }
    arDialog.showModal();
  }));
  $$('dialog [data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  $$('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

  // desktop: QR code that opens this page on the phone, straight at the AR section
  if (matchMedia('(pointer: fine)').matches) {
    const box = $('[data-ar-qr]');
    loadScript('https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js').then(() => {
      const qr = window.qrcode(0, 'M');
      qr.addData(location.href.split('#')[0].split('?')[0] + '#ar');
      qr.make();
      $('[data-qr]', box).innerHTML = qr.createSvgTag({ scalable: true, margin: 0 });
      box.hidden = false;
    }).catch(() => {});
  }
})();
