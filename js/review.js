// review.html?o=<order token>: the customer rates, writes, optionally adds a photo.
// Photo is resized in the browser and uploaded to the "reviews" bucket under the order token
// (storage policy only accepts real tokens); the review is saved pending the owner's approval.
(() => {
  const C = window.SWAY, t = k => I18N.t(k);
  const token = new URLSearchParams(location.search).get('o') || '';
  const app = document.getElementById('app');
  const headers = { apikey: C.supabaseKey, Authorization: `Bearer ${C.supabaseKey}` };

  function shrink(file) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(b => (b ? res(b) : rej(new Error('blob'))), 'image/jpeg', 0.85);
        URL.revokeObjectURL(img.src);
      };
      img.onerror = rej;
      img.src = URL.createObjectURL(file);
    });
  }

  function render() {
    const stars = [5, 4, 3, 2, 1].map(n =>
      `<input type="radio" name="rating" id="r${n}" value="${n}"><label for="r${n}" aria-label="${n}">★</label>`).join('');
    app.innerHTML = `<p class="kicker">Sway</p><h1>${t('rev.page')}</h1><p>${t('rev.intro')}</p>
      <form data-rev novalidate>
        <fieldset class="stars"><legend class="field" style="margin:0 0 6px"><span>${t('rev.rating')}</span></legend>${stars}</fieldset>
        <label class="field"><span>${t('rev.body')}</span><textarea name="body" maxlength="800" required></textarea></label>
        <label class="field"><span>${t('rev.name')}</span><input name="name" maxlength="40" required></label>
        <label class="field"><span>${t('rev.photo')}</span><input name="photo" type="file" accept="image/*"></label>
        <label class="check"><input type="checkbox" name="ok" required><span>${t('rev.consent')}</span></label>
        <p class="co-err" data-err></p>
        <button class="btn btn--coral" type="submit" style="width:100%">${t('rev.send')}</button>
      </form>`;
  }

  app.addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, btn = f.querySelector('button[type=submit]'), err = f.querySelector('[data-err]');
    const rating = +(f.rating.value || 0), body = f.body.value.trim(), name = f.name.value.trim();
    if (!rating || body.length < 5 || name.length < 2 || !f.ok.checked) { err.textContent = t('rev.err.fields'); return; }
    btn.disabled = true; btn.textContent = t('rev.sending'); err.textContent = '';
    try {
      let photo = null;
      if (f.photo.files[0]) {
        const blob = await shrink(f.photo.files[0]);
        const path = `${token}/${crypto.randomUUID()}.jpg`;
        const up = await fetch(`${C.supabaseUrl}/storage/v1/object/reviews/${path}`, {
          method: 'POST', headers: { ...headers, 'Content-Type': 'image/jpeg' }, body: blob
        });
        if (!up.ok) throw new Error('upload');
        photo = path;
      }
      const r = await fetch(`${C.supabaseUrl}/rest/v1/rpc/submit_review`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_token: token, p_rating: rating, p_body: body, p_name: name, p_photo: photo, p_lang: I18N.lang })
      });
      if (!r.ok) throw new Error('rpc');
      app.innerHTML = `<p class="kicker">Sway</p><h1>${t('rev.page')}</h1><p>${t('rev.thanks')}</p><p><a class="btn btn--coral" href="./">Sway</a></p>`;
    } catch (x) {
      err.textContent = t('rev.err'); btn.disabled = false; btn.textContent = t('rev.send');
    }
  });

  I18N.init();
  document.querySelector('[data-lang-toggle]').addEventListener('click', () => I18N.set(I18N.lang === 'he' ? 'en' : 'he'));
  document.addEventListener('langchange', render);
  render();
})();
