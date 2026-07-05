// Sway scroll journey - ONE canvas, ONE pin, ONE master timeline.
// Fallback ladder: image sequence -> scrub video -> static posters.
// Page usable at every tier; reduced-motion and no-JS get the full static page.
import { preloadPhaseA, preloadPhaseB } from './preloader.js';
import { createFilm } from './sequencer.js';

const html = document.documentElement;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
// ?coarse=1 forces the touch code path for desktop debugging of iOS behavior
const isCoarse = matchMedia('(pointer: coarse)').matches
  || new URLSearchParams(location.search).has('coarse');
const isMobile = matchMedia('(max-width: 820px)').matches;
const isFine = matchMedia('(pointer: fine)').matches;

// ---- STORYBOARD V2 master film map (desktop px; mobile x0.676) --------------
// hero (static poster, open hammock) ->
// DISASSEMBLY a5..a1 each played in REVERSE, 15px/frame, match cuts ->
// BAG TRAVEL 600px: 2-still dissolve balcony bag -> beach bag ->
// REASSEMBLY b1..b5 forward, 15px/frame ->
// ORBIT o1 -> o2 forward, 30px/frame, 150px dissolve at their boundary ->
// settle 600px -> outro (price reveal, unchanged).
// Full map when every 80-frame segment exists: dis 0-6000 | bag 6000-6600 |
// build 6600-12600 | o1 12600-15000 | o2 14850-17250 | settle 17250-17850.
//
// Frame counts are DATA, not constants: assets/seq/manifest.json is written
// by the media pipeline as { "a1": { "frames": 80, "avif": true }, ... }.
// Key = dir under assets/seq/. "<id>a" = avif twin dir, "<id>m" = mobile webp
// dir (own manifest entry, own frame count). Segments missing from the
// manifest are skipped and the timeline collapses gracefully. No manifest at
// all (or an empty one) -> the OLD 3-chapter journey (d1-d3 / s1-s3) runs
// exactly as before.
const V2 = {
  dis: ['a5', 'a4', 'a3', 'a2', 'a1'], // disassembly: reverse playback
  build: ['b1', 'b2', 'b3', 'b4', 'b5'], // reassembly: forward
  orbit: ['o1', 'o2'], // beach orbit -> desert night orbit
};
const BAG_STILLS = ['assets/still_bag_balcony.webp', 'assets/still_bag_beach.webp'];

const M = isMobile ? 0.676 : 1; // one scale for every px value in the plan
// touch: scrub reports the EXACT finger target; smoothing happens in the render
// layer (rAF lerp below) - one scrub number can never fix both flick and creep
const SCRUB = isCoarse ? true : 0.7;

// decode budget: 48 desktop / 20 mobile; iPads ask for the desktop site, so
// cap by pointer too (iOS jetsam is real)
const CAP = isMobile ? 20 : (isCoarse ? 24 : 48);

// mini-CTA from the very first scroll (works in every tier, incl. posters)
addEventListener('scroll', () => {
  document.body.classList.toggle('scrolled', scrollY > 1);
}, { passive: true });

const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
const pad3 = (n) => String(n).padStart(3, '0');
let mixEase = (t) => t; // replaced with power1.inOut once gsap is up

// ---- old 3-chapter series (fallback when there is no manifest) --------------
// mobile: paid-for native portrait 720x1280 x60. desktop: 1600x900 x80 under
// seq/d1-3 (webp) with optional AVIF variants under d1a-3a probed at runtime.
async function resolveSeries() {
  if (isMobile) {
    // iOS 16+ decodes AVIF: probe the mobile avif twins, drop to webp silently
    try {
      const r = await fetch('assets/seq/s1a/f_001.avif');
      if (r.ok) {
        await createImageBitmap(await r.blob());
        return { dirs: ['s1a', 's2a', 's3a'], ext: 'avif', frames: 60 };
      }
    } catch (e) { /* webp it is */ }
    return { dirs: ['s1', 's2', 's3'], ext: 'webp', frames: 60 };
  }
  try {
    const r = await fetch('assets/seq/d1a/f_001.avif');
    if (r.ok) {
      await createImageBitmap(await r.blob()); // decodability probe, not just 200
      return { dirs: ['d1a', 'd2a', 'd3a'], ext: 'avif', frames: 80 };
    }
  } catch (e) { /* no avif yet: fall through silently */ }
  try {
    const r = await fetch('assets/seq/d1/f_001.webp');
    if (r.ok) return { dirs: ['d1', 'd2', 'd3'], ext: 'webp', frames: 80 };
  } catch (e) { /* fall through */ }
  // ponytail: desktop 2K set still extracting - portrait set as interim
  return { dirs: ['s1', 's2', 's3'], ext: 'webp', frames: 60 };
}

// ---- film plan --------------------------------------------------------------
// The whole film as data. clips: { idx, s (series index), x0, x1 (px), f0, f1
// (frame ends; f0>f1 = reverse), fade (px of alpha ramp over the overlap with
// the previous clip; 0 = match cut) }. texts/tints are px windows.
function layersAt(plan, px) {
  const cs = plan.clips;
  const L = [];
  for (const c of cs) {
    if (px < c.x0 || px >= c.x1) continue;
    // frame motion can be narrower than the layer's life:
    // `lead` holds f0 while the clip fades IN (matched-frame dissolve),
    // `xm` ends motion early so the clip holds f1 while fading OUT under
    // the next clip. Both default to the old full-range behavior.
    const m0 = c.x0 + (c.lead || 0);
    const m1 = c.xm || c.x1;
    const t = Math.min(1, Math.max(0, (px - m0) / (m1 - m0)));
    L.push({
      s: c.s,
      f: c.f0 + (c.f1 - c.f0) * t,
      d: c.f1 >= c.f0 ? 1 : -1,
      a: L.length && c.fade ? mixEase(Math.min(1, (px - c.x0) / c.fade)) : 1,
      c,
    });
  }
  if (!L.length) { // before the first clip / holding the last frame in settle
    const c = px < cs[0].x0 ? cs[0] : cs[cs.length - 1];
    L.push({ s: c.s, f: px < cs[0].x0 ? c.f0 : c.f1, d: 1, a: 1, c });
  }
  return L;
}

function buildPlanV2(r) {
  const plan = { series: [], clips: [], texts: [], tints: [] };
  let x = 0;
  const add = (urls) => plan.series.push(urls) - 1;
  const push = (s, frames, len, rev, overlap = 0) => {
    const x0 = x - overlap;
    plan.clips.push({
      idx: plan.clips.length, s, x0, x1: x0 + len,
      f0: rev ? frames - 1 : 0, f1: rev ? 0 : frames - 1, fade: overlap,
    });
    x = x0 + len;
  };
  const segUrls = (g) =>
    Array.from({ length: g.frames }, (_, i) => `assets/seq/${g.dir}/f_${pad3(i + 1)}.${g.ext}`);

  const dis0 = x;
  for (const g of r.dis) push(add(segUrls(g)), g.frames, g.frames * 15 * M, true);
  const dis1 = x;

  const bag0 = x;
  if (r.bag) {
    const BAG = 600 * M; // fixed bag stays, world dissolves balcony -> beach
    push(add([BAG_STILLS[0]]), 1, BAG, false);
    push(add([BAG_STILLS[1]]), 1, BAG, false, BAG); // full-window 2-still dissolve
  }
  const bag1 = x;

  const b0 = x;
  for (const g of r.build) push(add(segUrls(g)), g.frames, g.frames * 15 * M, false);
  const b1 = x;

  const orb = []; // px starts of o1/o2
  r.orbit.forEach((g, i) => {
    push(add(segUrls(g)), g.frames, g.frames * 30 * M, false, i ? 150 * M : 0);
    orb.push(plan.clips[plan.clips.length - 1].x0);
  });
  plan.settleAt = x;
  plan.total = x + 600 * M;
  plan.prepx = 0; // the journey IS the top of the page - no approach pre-roll

  // text beats collapse with their footage; windows clamped inside their block
  const text = (beat, enter, exit) => {
    if (exit - enter >= 300 * M) plan.texts.push({ beat, enter: Math.max(0, enter), exit });
  };
  if (dis1 > dis0) text('pack', dis0 + 300 * M, Math.min(dis0 + 1500 * M, dis1 - 500 * M));
  if (bag1 > bag0) text('travel', bag0 - 100 * M, bag0 + (bag1 - bag0) * 0.75);
  if (b1 > b0) text('build', b0 + 300 * M, Math.min(b0 + 1500 * M, b1 - 200 * M));
  if (orb[0] !== undefined) {
    text('beach', orb[0] + 300 * M,
      Math.min(orb[0] + 1500 * M, (orb[1] !== undefined ? orb[1] : plan.settleAt) - 100 * M));
  }
  if (orb[1] !== undefined) {
    text('desert', orb[1] + 300 * M, Math.min(orb[1] + 1500 * M, plan.settleAt - 100 * M));
  }

  // the world grades itself: balcony teal -> beach coral -> desert night
  if (bag1 > bag0) {
    plan.tints.push({ at: bag0, px: bag1 - bag0, from: ['#1d6f66', 0.12], to: ['#ec5b3b', 0.05] });
  } else if (b1 > b0) {
    plan.tints.push({ at: Math.max(0, b0 - 250 * M), px: 500 * M, from: ['#1d6f66', 0.12], to: ['#ec5b3b', 0.05] });
  }
  if (orb[1] !== undefined) {
    plan.tints.push({ at: Math.max(0, orb[1] - 350 * M), px: 500 * M, from: ['#ec5b3b', 0.05], to: ['#0b1b19', 0.12] });
  }
  return plan;
}

// the OLD 3-chapter journey expressed in the same plan shape
function buildPlanOld(S) {
  const F = S.frames - 1;
  const u = (k) =>
    Array.from({ length: S.frames }, (_, i) => `assets/seq/${S.dirs[k]}/f_${pad3(i + 1)}.${S.ext}`);
  // ONE continuous take: each clip CONTINUES the camera arc from the exact
  // frame the previous one ended on (match-cut chain). The 60px fade sits on
  // pixel-matched compositions - it softens residue, it is not a "transition".
  return {
    series: [u(0), u(1), u(2)],
    clips: [
      { idx: 0, s: 0, x0: 0, x1: 2400 * M, f0: 0, f1: F, fade: 0 },
      { idx: 1, s: 1, x0: 2340 * M, x1: 4740 * M, xm: 4560 * M, f0: 0, f1: F, fade: 60 * M },
      // day-beach -> night-desert: matched-frame STATIC dissolve. The beach
      // holds its final frame (xm) and the desert holds its first (lead) for
      // the whole 180px fade - the product stays pixel-frozen while only the
      // environment melts. Motion resumes when the fade completes.
      { idx: 2, s: 2, x0: 4560 * M, x1: 7080 * M, lead: 180 * M, f0: 0, f1: F, fade: 180 * M },
    ],
    // balcony chapter rides on the hero copy alone (owner deleted its old line)
    texts: [
      { beat: 'beach', enter: 3000 * M, exit: 4100 * M },
      { beat: 'desert', enter: 5400 * M, exit: 6500 * M },
    ],
    tints: [
      { at: 2200 * M, px: 400 * M, from: ['#1d6f66', 0.12], to: ['#ec5b3b', 0.05] },
      { at: 4550 * M, px: 400 * M, from: ['#ec5b3b', 0.05], to: ['#0b1b19', 0.12] },
    ],
    settleAt: 7080 * M,
    total: 7680 * M,
    prepx: 0, // journey starts at page top - no approach pre-roll
  };
}

// manifest -> resolved segments -> v2 plan; null = no v2 content, run old map
async function resolveV2() {
  let man = null;
  try {
    const r = await fetch('assets/seq/manifest.json');
    if (r.ok) man = await r.json();
  } catch (e) { /* no manifest / bad JSON: old journey */ }
  if (!man || typeof man !== 'object') return null;

  const ids = [...V2.dis, ...V2.build, ...V2.orbit];
  let avifOk = false;
  if (!isMobile) {
    const probe = ids.find((id) => man[id] && man[id].avif);
    if (probe) {
      try {
        const r = await fetch(`assets/seq/${probe}a/f_001.avif`);
        if (r.ok) { await createImageBitmap(await r.blob()); avifOk = true; }
      } catch (e) { /* webp it is */ }
    }
  }
  const seg = (id) => {
    if (isMobile) {
      const m = man[id + 'm'];
      return m && m.frames ? { dir: id + 'm', ext: 'webp', frames: m.frames } : null;
    }
    const m = man[id];
    if (!m || !m.frames) return null;
    return m.avif && avifOk
      ? { dir: id + 'a', ext: 'avif', frames: m.frames }
      : { dir: id, ext: 'webp', frames: m.frames };
  };
  const r = {
    dis: V2.dis.map(seg).filter(Boolean),
    build: V2.build.map(seg).filter(Boolean),
    orbit: V2.orbit.map(seg).filter(Boolean),
    bag: false,
  };
  if (!r.dis.length && !r.build.length && !r.orbit.length) return null;
  try {
    const [a, b] = await Promise.all(BAG_STILLS.map((s) => fetch(s)));
    r.bag = a.ok && b.ok; // both stills or no bag beat
  } catch (e) { /* skip the beat */ }
  return buildPlanV2(r);
}

// ---- word-level split (RTL-safe: DOM order = reading order) -----------------
function splitWords(el) {
  const words = el.textContent.trim().split(/\s+/);
  el.textContent = '';
  return words.map((w, i) => {
    const mask = document.createElement('span');
    mask.className = 'w';
    const inner = document.createElement('span');
    inner.className = 'wi';
    inner.textContent = w;
    mask.appendChild(inner);
    el.appendChild(mask);
    if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
    return inner;
  });
}

// ---- boot -------------------------------------------------------------------
// CDN globals missing (blocked jsdelivr, offline) -> same complete static
// page as no-JS; Lenis is only required on fine pointers
const cdnOk = window.gsap && window.ScrollTrigger && window.CustomEase && (isCoarse || window.Lenis);
if (reducedMotion || !cdnOk) {
  html.classList.remove('js');
} else {
  init().catch((e) => {
    console.warn('init failed, dropping to static page:', e);
    html.classList.remove('js');
  });
}

async function init() {
  // scrollRestoration set to 'manual' in the inline head script (pre-GSAP);
  // belt-and-braces: force top before any pin math
  scrollTo(0, 0);

  gsap.registerPlugin(ScrollTrigger, CustomEase);
  CustomEase.create('sway', '0.65,0.05,0,1'); // the one ease
  mixEase = gsap.parseEase('power1.inOut'); // dissolve ramp (spec: blends only)

  if (isCoarse) {
    // keeps iOS pins solid; momentum lightly clamped - glides must feel native
    // (the render lerp below already stops the FILM from teleporting, so the
    // scroll itself can travel; over-clamping here reads as "the page sticks")
    ScrollTrigger.normalizeScroll({
      type: 'touch,wheel,pointer',
      momentum: (self) => Math.min(2.5, Math.abs(self.velocityY) / 800),
    });
  } else {
    const lenis = new Lenis({ autoRaf: false });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  // -- split all copy up front (the loader overlay covers this work) --
  const heroInners = [
    ...splitWords(document.querySelector('.hero__text h1')),
    ...splitWords(document.querySelector('.hero__sub')),
  ];
  gsap.set(heroInners, { y: 28, opacity: 0 });
  gsap.set('.hero__text .wordmark', { y: 18, opacity: 0 });
  const chapters = [...document.querySelectorAll('.chapter')].map((el) => {
    const kicker = el.querySelector('.kicker'); // optional per beat
    return {
      el,
      inners: [...(kicker ? splitWords(kicker) : []), ...splitWords(el.querySelector('h2'))],
    };
  });

  // -- journey state shared by canvas + video tiers --
  const st = { px: 0 }; // the ONE scrub driver: current px on the film map
  const drag = { off: 0, s: 0 };
  const warmed = new Set();
  const video = document.querySelector('.scrub-video');
  let film = null;
  let renderMode = 'canvas'; // 'canvas' | 'video' | 'posters'
  let lastProgress = 0;
  let journeyST = null;

  // touch render smoothing: the finger owns st.px exactly (scrub:true); the
  // FILM chases it here - frame-rate-independent damping, capped chase speed.
  // Fixes both failure modes at once: a flick can't teleport the film (MAXV),
  // and slow creep still glides (the lerp keeps easing between scroll events).
  const shown = { px: 0 };
  const filmPx = () => (isCoarse ? shown.px : st.px);

  function sink() {
    if (renderMode === 'video') {
      if (video.duration) video.currentTime = lastProgress * video.duration;
      return;
    }
    if (renderMode !== 'canvas' || !film) return;
    const px = filmPx();
    const L = layersAt(plan, px);
    // pre-warm the next clip's entry frames at 70% of the current one
    const base = L[0].c;
    const nxt = plan.clips[base.idx + 1];
    if (nxt && !warmed.has(nxt.idx) && px - base.x0 >= 0.7 * (base.x1 - base.x0)) {
      warmed.add(nxt.idx);
      film.prewarm(nxt.s, 16, nxt.f0 > nxt.f1);
    }
    if (drag.off) for (const l of L) { if (l.s === drag.s) l.f += drag.off; }
    film.render(L);
  }

  if (isCoarse) {
    const MAXV = 2600 * M; // px/s chase cap in plan-px; keeps up with freer glides
    gsap.ticker.add((_t, dtMs) => {
      if (renderMode !== 'canvas') return;
      const dt = Math.min(0.05, dtMs / 1000); // clamp: background-tab jumps
      let diff = st.px - shown.px;
      if (!diff) return;
      let step = diff * (1 - Math.exp(-8 * dt)); // k = 8/s, fps-independent
      const cap = MAXV * dt;
      if (Math.abs(step) > cap) step = Math.sign(step) * cap;
      shown.px = Math.abs(diff) < 0.25 ? st.px : shown.px + step;
      sink();
    });
  }

  // -- film plan first, so the px map is concrete when the timeline builds --
  let plan = null;
  if ('createImageBitmap' in window) plan = await resolveV2();
  if (!plan) plan = buildPlanOld(await resolveSeries()); // also the video tier's px map
  window.__swayPlan = plan; // debug handle (map is data now; inspectable)

  if ('createImageBitmap' in window) {
    film = createFilm(document.querySelector('.journey__canvas'), plan.series, CAP);
    film.onFirstDraw = () =>
      gsap.to('.journey__canvas', { opacity: 1, duration: 0.45, ease: 'sway' });
  }

  // ScrollTriggers in document order: journey pin, outro pin, assembly pin
  buildJourneyTimeline();
  buildOutro();
  setupAssemblyScrub();

  // -- preload + fallback ladder --
  // phase A = the first clip, streamed entry-frames-first (reverse clips too);
  // phase B = the rest of the film in play order
  let phaseA = null;
  let counterUpdate = () => {};
  if (film) {
    const c0 = plan.clips[0];
    const ordered = (c) => {
      const u = plan.series[c.s];
      return c.f0 > c.f1 ? [...u].reverse() : u;
    };
    const seen = new Set([c0.s]);
    const bUrls = [];
    for (const c of plan.clips.slice(1)) {
      if (seen.has(c.s)) continue;
      seen.add(c.s);
      bUrls.push(...ordered(c));
    }
    // gate = scene 1 + the first beat of scene 2: a sprint-scroller lands on
    // loaded frames at the first seam instead of outrunning the stream
    const gateUrls = [...ordered(c0), ...bUrls.slice(0, 16)];
    phaseA = preloadPhaseA(gateUrls, { onProgress: (l, t) => counterUpdate(l, t) });
    phaseA
      .then(() => { sink(); preloadPhaseB(bUrls.slice(16), { concurrency: 6 }); })
      .catch((e) => { console.warn('sequence tier failed:', e); dropToVideo(); });
  } else {
    dropToVideo(); // iOS <= 14: no createImageBitmap
  }

  await runLoader(
    Promise.all([phaseA || Promise.resolve(), document.fonts.ready]).catch(() => {}),
  );
  setupScrollHint();
  setupDrag();
  setupMagneticCta();

  // ---- tier 2: scrub <video>, driven by the SAME master timeline -----------
  async function dropToVideo() {
    if (renderMode !== 'canvas') return;
    renderMode = 'video';
    try {
      // full buffer via Blob -> objectURL: streaming mp4 seeks are choppy on iOS
      const res = await fetch('assets/video/scrub.mp4');
      if (!res.ok) throw new Error(`scrub.mp4 -> ${res.status}`);
      video.src = URL.createObjectURL(await res.blob());
      await new Promise((ok, bad) => {
        video.onloadedmetadata = ok;
        video.onerror = bad;
      });
      html.classList.add('tier-video');
      video.style.opacity = journeyST && journeyST.isActive ? 1 : 0;
      sink();
    } catch (e) {
      console.warn('video tier failed, dropping to posters:', e);
      postersTier();
    }
  }

  // ---- tier 3: static posters ----------------------------------------------
  function postersTier() {
    renderMode = 'posters';
    ScrollTrigger.getAll().forEach((s) => s.kill(true));
    document.body.classList.remove('at-outro');
    // timelines left split words / outro items hidden - the static page needs them back
    gsap.set(['.wi', '.chapter', '.settle-line', '.outro__was', '.outro__price',
      '.outro__cta', '.outro__group'], { clearProps: 'all' });
    html.classList.add('tier-posters');
  }

  // ---- master timeline: 1 unit = 1 px of scroll -----------------------------
  function buildJourneyTimeline() {
    const PREPX = plan.prepx; // entry pre-roll: footage moving as the pin arrives
    const at = (v) => Math.max(0, v - PREPX); // plan px -> timeline position

    gsap.fromTo(st, { px: 0 }, {
      px: PREPX, ease: 'none', immediateRender: false, onUpdate: sink,
      scrollTrigger: {
        trigger: '.journey', start: 'top bottom', end: 'top top',
        scrub: SCRUB, invalidateOnRefresh: true,
      },
    });

    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: '.journey', start: 'top top', end: `+=${Math.round(plan.total - PREPX)}`,
        pin: true, scrub: SCRUB, anticipatePin: 1, invalidateOnRefresh: true,
        onToggle: (self) => {
          if (renderMode === 'video') video.style.opacity = self.isActive ? 1 : 0;
        },
      },
    });
    journeyST = tl.scrollTrigger;
    // render on TIMELINE ticks, not scroll events: the scrub tween keeps easing
    // ~0.7s after the last scroll event, and those settle frames must draw too
    let dragHintFired = false;
    tl.eventCallback('onUpdate', () => {
      lastProgress = tl.progress();
      // the drag hint waits for the film - never on top of the hero copy
      if (!dragHintFired && renderMode === 'canvas' && st.px > 400 * M) {
        dragHintFired = true;
        showDragHint();
      }
      sink();
    });

    // the whole film is ONE linear px tween; clips/dissolves/reverse playback
    // are resolved per-tick by layersAt() from the plan (data, not tweens)
    tl.fromTo(st, { px: PREPX },
      { px: plan.total, duration: plan.total - PREPX, immediateRender: false }, 0);

    for (const t of plan.tints) {
      tl.fromTo('.fx--tint', { backgroundColor: t.from[0], opacity: t.from[1] },
        { backgroundColor: t.to[0], opacity: t.to[1], duration: t.px, ease: 'power1.inOut', immediateRender: false }, at(t.at));
    }

    // hero copy floats on frame 0 and dissolves with the first scroll - the
    // opening is INSIDE the film, so there is no section seam to cross
    tl.fromTo('.hero__text', { opacity: 1, y: 0 },
      { opacity: 0, y: -28, duration: 220 * M, ease: 'sway', immediateRender: false }, 0);

    // text: mask reveal y+opacity only, stagger from 'start' (reading order),
    // always fully out before the next dissolve window opens.
    // every block starts hidden; only beats present in the plan animate
    chapters.forEach((c) => {
      gsap.set(c.el, { opacity: 0 });
      gsap.set(c.inners, { y: 28, opacity: 0 });
    });
    for (const t of plan.texts) {
      const c = chapters.find((ch) => ch.el.dataset.beat === t.beat);
      if (!c) continue;
      tl.fromTo(c.el, { opacity: 0 },
        { opacity: 1, duration: 150 * M, ease: 'sway', immediateRender: false }, at(t.enter))
        .fromTo(c.inners, { y: 28, opacity: 0 },
          { y: 0, opacity: 1, duration: 300 * M, ease: 'sway', immediateRender: false,
            stagger: { amount: 100 * M, from: 'start' } }, at(t.enter))
        // slow drift across the hold - the block breathes with the scroll,
        // never sits frozen between enter and exit
        .fromTo(c.el, { y: 0 },
          { y: -14, duration: t.exit - t.enter, immediateRender: false }, at(t.enter))
        .fromTo(c.inners, { y: 0, opacity: 1 },
          { y: -28, opacity: 0, duration: 240 * M, ease: 'sway', immediateRender: false,
            stagger: { amount: 60 * M, from: 'start' } }, at(t.exit))
        .fromTo(c.el, { opacity: 1 },
          { opacity: 0, duration: 150 * M, ease: 'sway', immediateRender: false }, at(t.exit + 150 * M));
    }

    // settle: last frame held, closing line fades in on the still, then unpin
    tl.fromTo('.settle-line', { y: 14, opacity: 0 },
      { y: 0, opacity: 1, duration: 400 * M, ease: 'sway', immediateRender: false }, at(plan.settleAt));
  }

  // ---- outro: plays ONCE on enter (a purchase moment never renders half-way) --
  function buildOutro() {
    const brand = splitWords(document.querySelector('.outro__brand'));
    gsap.set(brand, { y: 28, opacity: 0 });
    gsap.set('.outro__was', { opacity: 0 });
    gsap.set('.outro__price', { yPercent: 110 });
    gsap.set('.outro__cta', { scale: 0.9, opacity: 0 });
    gsap.set('.outro__group', { opacity: 0 });

    const otl = gsap.timeline({ paused: true, defaults: { ease: 'sway' } });
    otl.to(brand, { y: 0, opacity: 1, duration: 0.9, stagger: { amount: 0.35, from: 'start' } })
      .to('.outro__was', { opacity: 1, duration: 0.45 }, '-=0.45') // quiet anchor, no strikethrough theater
      .to('.outro__price', { yPercent: 0, duration: 0.9 }, '-=0.35') // THE event: ₪450 masks in
      .to('.outro__cta', { scale: 1, opacity: 1, duration: 0.45, ease: 'back.out(1.4)' }, '-=0.3') // the ONE overshoot
      .to('.outro__group', { opacity: 1, duration: 0.45 }, '-=0.15');

    ScrollTrigger.create({
      // longer hold + faster reveal: a sprint-scroller still sees the price
      // land before the pin releases (this is the purchase moment)
      trigger: '.outro', start: 'top top', end: '+=950',
      pin: true, anticipatePin: 1, invalidateOnRefresh: true,
      onEnter: () => { document.body.classList.add('at-outro'); otl.timeScale(1.25).play(); },
      onLeaveBack: () => { document.body.classList.remove('at-outro'); otl.reverse(); },
    });
  }

  // ---- mobile: assembly stepper becomes a pinned scroll chapter ---------------
  // touch scrolling steps 1->5 while the section holds, then releases to specs;
  // desktop keeps the auto-advancing stepper (inline script skips coarse)
  function setupAssemblyScrub() {
    if (!isCoarse) return;
    const sec = document.getElementById('assembly');
    if (!sec) return;
    sec.classList.add('asm-pinned');
    const imgs = sec.querySelectorAll('.asm__img');
    const steps = sec.querySelectorAll('.asm__step');
    const bar = sec.querySelector('.asm__bar i');
    const N = imgs.length;
    let cur = 0;
    const show = (n) => {
      if (n === cur) return;
      cur = n;
      imgs.forEach((im, k) => im.classList.toggle('on', k === n));
      steps.forEach((s, k) => s.classList.toggle('is-on', k === n));
    };
    ScrollTrigger.create({
      trigger: sec,
      start: 'top top',
      end: () => '+=' + N * Math.round(innerHeight * 0.34),
      pin: true,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onUpdate: (st) => {
        if (bar) bar.style.transform = `scaleX(${st.progress})`;
        show(Math.min(N - 1, Math.floor(st.progress * N)));
      },
    });
  }

  // ---- loader: real progress, shown only when the wait is real ---------------
  async function runLoader(gate) {
    const t0 = performance.now();
    const cnt = document.querySelector('.loader__count');
    const pct = { v: 0 };
    counterUpdate = (loaded, total) => {
      gsap.to(pct, {
        v: Math.round(100 * loaded / total), duration: 0.45, ease: 'sway',
        snap: { v: 1 }, overwrite: true,
        onUpdate: () => { cnt.textContent = `${pct.v}%`; },
      });
    };
    let shown = false;
    const showTimer = setTimeout(() => {
      shown = true;
      gsap.to('.loader__mark', { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.9, ease: 'sway' });
      gsap.to(cnt, { opacity: 1, duration: 0.45, ease: 'sway' });
    }, 400);

    // 3s soft cap: exit to the hero poster and KEEP streaming; the canvas
    // hydrates in place when scene 1 lands (progressive, not a demotion)
    await Promise.race([gate, wait(3000)]);
    clearTimeout(showTimer);
    if (shown) {
      const held = performance.now() - t0;
      if (held < 1600) await wait(1600 - held); // 400ms show delay + 1.2s min display
    }

    // exit reveals a finished page: frame 0 (poster) is already painted behind
    gsap.timeline({ defaults: { ease: 'sway' } })
      .to(['.loader__mark', '.loader__count'], { opacity: 0, duration: 0.45 })
      .to('.loader', { yPercent: -100, duration: 0.9 }, '-=0.1')
      .set('.loader', { display: 'none' })
      .fromTo('.journey__stage', { scale: 1.04 }, { scale: 1, duration: 1.35, clearProps: 'scale' }, '-=0.95')
      .to('.hero__text .wordmark', { y: 0, opacity: 1, duration: 0.9 }, '-=1.25')
      .to(heroInners, { y: 0, opacity: 1, duration: 0.9, stagger: { amount: 0.35, from: 'start' } }, '-=1.1');
  }

  // ---- hairline scroll hint: appears when idle, dies on first scroll ---------
  function setupScrollHint() {
    const hint = document.querySelector('.scroll-hint');
    setTimeout(() => { if (scrollY < 2) hint.classList.add('on'); }, 1500);
    addEventListener('scroll', () => hint.classList.remove('on'), { once: true, passive: true });
  }

  // ---- hidden gesture: drag to rotate the hammock ----------------------------
  function showDragHint() {
    if (!localStorage.getItem('swayDragHint')) {
      document.querySelector('.drag-hint').classList.add('on');
    }
  }
  function dismissDragHint() {
    if (localStorage.getItem('swayDragHint')) return;
    localStorage.setItem('swayDragHint', '1');
    document.querySelector('.drag-hint').classList.remove('on');
  }
  function setupDrag() {
    const canvas = document.querySelector('.journey__canvas');
    let d = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (renderMode !== 'canvas' || !film) return;
      gsap.killTweensOf(drag);
      // touch engages only on horizontal intent; fine pointers immediately
      d = { px: e.clientX, x0: e.clientX, y0: e.clientY, engaged: e.pointerType !== 'touch' };
      drag.s = layersAt(plan, filmPx())[0].s; // scrub the clip under the pointer
      if (d.engaged) canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!d) return;
      if (!d.engaged) {
        const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
        if (Math.hypot(dx, dy) < 10) return;
        if (Math.abs(dx) <= Math.abs(dy)) { d = null; return; } // vertical: native scroll
        d.engaged = true;
        canvas.setPointerCapture(e.pointerId);
      }
      // RTL: sign flipped so dragging right rotates right
      drag.off -= (e.clientX - d.px) * 0.15;
      d.px = e.clientX;
      dismissDragHint();
      sink();
    });
    const release = () => {
      if (!d) return;
      d = null;
      gsap.to(drag, { off: 0, duration: 0.9, ease: 'sway', onUpdate: sink });
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
  }

  // ---- magnetic CTA (pointer-fine only), pull capped at 6px ------------------
  function setupMagneticCta() {
    if (!isFine) return;
    const cta = document.querySelector('.outro__cta');
    const xTo = gsap.quickTo(cta, 'x', { duration: 0.45, ease: 'sway' });
    const yTo = gsap.quickTo(cta, 'y', { duration: 0.45, ease: 'sway' });
    cta.addEventListener('mousemove', (e) => {
      const r = cta.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const dist = Math.hypot(dx, dy) || 1;
      const pull = Math.min(6, dist);
      xTo(dx / dist * pull);
      yTo(dy / dist * pull);
    });
    cta.addEventListener('mouseleave', () => { xTo(0); yTo(0); });
  }
}
