// One canvas, N frame series (film segments + single stills), filmic alpha
// dissolve. Compressed blobs stay in preloader; decoded ImageBitmaps live in
// ONE global LRU (Map insertion order = recency), evicted with bitmap.close().
// During a dissolve the wanted-set is the union of ALL active layers' windows,
// so neither side thrashes. Layers arrive resolved from the film plan in
// main.js: this file knows nothing about the story, only frames and alpha.
import { getBlob, ensure } from './preloader.js';

const DPR = Math.min(window.devicePixelRatio || 1, 2);
const AHEAD = 10, BEHIND = 4; // decode window, oriented by travel direction

export function createFilm(canvas, series, cap) {
  const ctx = canvas.getContext('2d');
  const cache = new Map(); // url -> ImageBitmap | Promise<ImageBitmap>
  let srcW = 0, srcH = 0;
  let lastKey = '';
  let lastLayers = null;
  let drew = false;
  let pollTimer = 0; // blob-not-streamed-yet retry (user outran phase B)
  let firstDraw = null;

  function resize() {
    // backing store: element size * DPR. No source clamp - a portrait screen
    // cover-cropping a landscape source needs the full element resolution,
    // and the old clamp (900px tall) blurred every retina phone.
    const w = Math.round(canvas.clientWidth * DPR);
    const h = Math.round(canvas.clientHeight * DPR);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }
  window.addEventListener('resize', () => {
    resize();
    // setting width/height wipes the backing store - repaint the current state
    if (lastLayers) { lastKey = ''; render(lastLayers); }
  });
  resize();

  function touch(key) {
    const v = cache.get(key);
    if (v !== undefined) { cache.delete(key); cache.set(key, v); }
    return v;
  }

  function decode(s, i) {
    const key = series[s][i];
    const hit = touch(key);
    if (hit !== undefined) return hit;
    const blob = getBlob(key);
    if (!blob) { ensure(key); return null; } // user outran phase B: fetch it now
    const p = createImageBitmap(blob).then((bmp) => {
      if (cache.get(key) === p) cache.set(key, bmp);
      else bmp.close(); // evicted while decoding
      return bmp;
    });
    // failed decode (corrupt body): drop it so the next pass retries
    p.catch(() => { if (cache.get(key) === p) cache.delete(key); });
    cache.set(key, p);
    return p;
  }

  function evict(want) {
    for (const key of [...cache.keys()]) {
      if (cache.size <= cap) break;
      if (want.has(key)) continue;
      const v = cache.get(key);
      cache.delete(key);
      if (v instanceof ImageBitmap) v.close();
      else v.then((bmp) => bmp.close()).catch(() => {});
    }
  }

  function drawCover(bmp, alpha, tf) {
    if (bmp.width !== srcW || bmp.height !== srcH) {
      srcW = bmp.width; srcH = bmp.height;
      resize(); // only when source size changes: no layout read per frame
    }
    const cw = canvas.width, ch = canvas.height;
    const s0 = Math.max(cw / bmp.width, ch / bmp.height);
    ctx.globalAlpha = alpha;
    if (!tf || (tf.sc === 1 && !tf.dx && !tf.dy)) {
      const dw = bmp.width * s0, dh = bmp.height * s0;
      ctx.drawImage(bmp, (cw - dw) / 2, (ch - dh) / 2, dw, dh); // source-over only
    } else {
      // seam lock: extra zoom about the product anchor + canvas-space nudge,
      // so an incoming clip's hammock lands exactly on the outgoing one's
      const s = s0 * tf.sc;
      const dw0 = bmp.width * s0, dh0 = bmp.height * s0;
      const dw = bmp.width * s, dh = bmp.height * s;
      const ax = tf.ax ?? 0.5, ay = tf.ay ?? 0.5;
      const anchorX = (cw - dw0) / 2 + ax * dw0 + tf.dx * cw;
      const anchorY = (ch - dh0) / 2 + ay * dh0 + tf.dy * ch;
      ctx.drawImage(bmp, anchorX - ax * dw, anchorY - ay * dh, dw, dh);
    }
    ctx.globalAlpha = 1;
  }

  // layers: [{ s, f, a, d }] - series index, float frame, alpha (already
  // eased by the plan), travel direction (+1 forward / -1 reverse playback)
  function render(layers) {
    lastLayers = layers;
    const ls = layers.map((l) => ({
      s: l.s,
      i: Math.max(0, Math.min(series[l.s].length - 1, Math.round(l.f))),
      a: l.a,
      d: l.d || 1,
      tf: l.tf || null,
    }));
    const key = ls.map((l) =>
      `${l.s}:${l.i}:${l.a.toFixed(2)}:${l.tf ? l.tf.sc.toFixed(3) + ':' + l.tf.dx.toFixed(3) + ':' + l.tf.dy.toFixed(3) : ''}`).join('|');
    if (key === lastKey) return;

    // decode window per active layer, oriented by playback direction;
    // the union protects every dissolve side from eviction
    const want = new Set();
    for (const l of ls) {
      const hi = Math.min(series[l.s].length - 1, l.i + (l.d < 0 ? BEHIND : AHEAD));
      const lo = Math.max(0, l.i - (l.d < 0 ? AHEAD : BEHIND));
      for (let k = l.i; k <= hi; k++) { want.add(series[l.s][k]); decode(l.s, k); }
      for (let k = l.i - 1; k >= lo; k--) { want.add(series[l.s][k]); decode(l.s, k); }
    }
    evict(want);

    const ready = ls.map((l) => {
      const v = cache.get(series[l.s][l.i]);
      return v instanceof ImageBitmap ? v : null;
    });

    // repaint from the LATEST layers when a pending decode lands (never compare
    // object identity: every sink() call passes fresh layer objects)
    const retryWhenDecoded = (l) => {
      const v = cache.get(series[l.s][l.i]);
      if (v && !(v instanceof ImageBitmap)) {
        v.then(() => { lastKey = ''; if (lastLayers) render(lastLayers); }).catch(() => {});
      } else if (v === undefined && !pollTimer) {
        // no blob yet - poll until the stream catches up, or the canvas
        // sticks on a stale frame after a fast scroll
        pollTimer = setTimeout(() => {
          pollTimer = 0;
          lastKey = '';
          if (lastLayers) render(lastLayers);
        }, 200);
      }
    };

    if (!ready[0]) { retryWhenDecoded(ls[0]); return; } // base not warm yet
    drawCover(ready[0], 1, ls[0].tf);
    let complete = true;
    for (let j = 1; j < ls.length; j++) {
      if (ready[j]) drawCover(ready[j], ls[j].a, ls[j].tf);
      else { complete = false; retryWhenDecoded(ls[j]); } // incoming lands -> dissolve repaints
    }
    // an incomplete draw must NOT satisfy the skip-check, or the dissolve
    // stays base-only forever once the key stops changing
    lastKey = complete ? key : '';
    if (!drew) { drew = true; if (firstDraw) firstDraw(); }
  }

  // decode a clip's entry frames before its beat starts
  // (fromEnd = the clip plays in reverse, so its entry frames are the last ones)
  function prewarm(s, count, fromEnd) {
    const n = series[s].length;
    for (let k = 0; k < Math.min(count, n); k++) decode(s, fromEnd ? n - 1 - k : k);
  }

  return { render, prewarm, set onFirstDraw(fn) { firstDraw = fn; } };
}
