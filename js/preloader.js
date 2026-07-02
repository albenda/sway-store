// Fetch frames as compressed Blobs (never decode-all: iOS jetsam).
// Phase A = scene 1 only, awaited with a HARD timeout (dead network guard;
// slowness is handled by the loader's 3s soft exit, not here).
// Phase B = rest, background.
// Every single fetch carries its own timeout + retry: one silently hung
// connection must never kill a stream worker (it froze the whole film once).

const blobs = new Map(); // url -> Blob
const pending = new Set(); // urls being fetched right now (dedupes ensure())

export function getBlob(url) { return blobs.get(url); }

async function fetchOne(url, signal, tries = 2) {
  if (blobs.has(url)) return;
  for (let attempt = 0; ; attempt++) {
    const ac = new AbortController();
    const onOuter = () => ac.abort();
    if (signal) signal.addEventListener('abort', onOuter, { once: true });
    const timer = setTimeout(() => ac.abort(), 15000); // hung-connection guard
    try {
      const res = await fetch(url, { signal: ac.signal });
      if (!res.ok) throw new Error(`frame ${url} -> ${res.status}`);
      blobs.set(url, await res.blob());
      return;
    } catch (e) {
      if ((signal && signal.aborted) || attempt >= tries) throw e;
      await new Promise((ok) => setTimeout(ok, 300 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onOuter);
    }
  }
}

// on-demand single frame (sequencer calls this when the user outruns phase B);
// fire-and-forget - the sequencer's render poll picks the blob up when it lands
export function ensure(url) {
  if (blobs.has(url) || pending.has(url)) return;
  pending.add(url);
  fetchOne(url)
    .catch(() => {})
    .finally(() => pending.delete(url));
}

async function fetchAll(urls, concurrency, signal, onProgress) {
  const queue = [...new Set(urls)];
  const total = queue.length;
  let loaded = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const url = queue.shift();
      try {
        await fetchOne(url, signal);
      } catch (e) {
        if (signal && signal.aborted) throw e;
        console.warn('frame dropped after retries:', url);
      }
      if (onProgress) onProgress(++loaded, total); // REAL progress, never a fake timer
    }
  });
  await Promise.all(workers);
}

// Rejects after timeoutMs -> caller drops down the fallback ladder.
// On hard timeout (or any frame failing) the in-flight fetches are ABORTED so
// the fallback video is not competing with a dead tier for bandwidth.
export function preloadPhaseA(urls, { concurrency = 6, timeoutMs = 20000, onProgress } = {}) {
  const ac = new AbortController();
  let timer;
  return Promise.race([
    fetchAll(urls, concurrency, ac.signal, onProgress),
    new Promise((_, rej) => {
      timer = setTimeout(() => rej(new Error('phase A timeout')), timeoutMs);
    }),
  ]).catch((e) => { ac.abort(); throw e; })
    .finally(() => clearTimeout(timer));
}

// Fire-and-forget background stream; failures here never break the page.
export function preloadPhaseB(urls, { concurrency = 4 } = {}) {
  fetchAll(urls, concurrency).catch((e) => console.warn('phase B stream:', e));
}
