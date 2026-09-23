// Checkout (dialog on index.html) + the friend pay page (pay.html) + order tracker (order.html).
// No card clearing: payment is Bit / PayBox, confirmed by hand. The database is the price authority;
// if it is unreachable the order falls back to a prefilled WhatsApp message so no sale is lost.
(() => {
  const C = window.SWAY;
  const t = (k, v) => I18N.t(k, v);
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const money = n => '₪' + Number(n).toLocaleString('he-IL');
  const wa = (text, to = C.whatsapp) => `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
  const icon = (id, n = 16, flip = false) => `<svg class="i${flip ? ' i-flip' : ''}" width="${n}" height="${n}"><use href="#i-${id}"/></svg>`;
  const siteBase = () => location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');

  async function api(fn, body) {
    const r = await fetch(`${C.supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: C.supabaseKey, Authorization: `Bearer ${C.supabaseKey}` },
      body: JSON.stringify(body)
    });
    const d = await r.json().catch(() => null);
    if (!r.ok || !d) throw new Error((d && d.message) || 'api');
    return d;
  }

  function split(total, people) {
    const each = Math.floor(total / people);
    return { each, first: total - each * (people - 1) };
  }

  function copyBtn(text) {
    return `<button class="copy" type="button" data-copy="${esc(text)}">${t('co.copy')}</button>`;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-copy]');
    if (!b) return;
    navigator.clipboard.writeText(b.dataset.copy).then(() => {
      b.textContent = t('co.copied');
      setTimeout(() => { b.textContent = t('co.copy'); }, 1500);
    });
  });

  // Bit / PayBox card for one payment
  function payCard(amount, ref) {
    return `<div class="paycard">
      <p class="co-label">${t('co.pay.amount')}</p>
      <p class="paycard__amount">${money(amount)}</p>
      <div class="paycard__line"><span>${t('co.pay.bit')} <b>${esc(C.bitPhone)}</b></span>${copyBtn(C.bitPhone.replace(/\D/g, ''))}</div>
      <div class="paycard__line"><span>${t('co.pay.note')} <b>${esc(ref)}</b></span>${copyBtn(ref)}</div>
      ${C.payboxLink ? `<div class="paycard__line"><a class="btn btn--line btn--sm" href="${esc(C.payboxLink)}" target="_blank" rel="noopener">${t('co.pay.paybox')}</a></div>` : ''}
    </div>`;
  }

  /* ================= checkout dialog ================= */
  const dlg = document.getElementById('order-dialog');
  const S = { step: 1, blue: 1, brown: 0, group: false, people: 3, gift: document.body.dataset.lp === 'gift', f: { pickup: 'ashdod' }, res: null, offline: false, busy: false };
  const qty = () => S.blue + S.brown;
  const GD = C.groupDiscount;

  // display maths only; create_order_v2 recomputes everything server-side
  function price() {
    const n = qty(), sub = n * C.price;
    // best single discount wins: pairs (2 for ₪850) or group of 3+
    const pair = Math.floor(n / 2) * C.pairDiscount;
    const group = S.group && n >= GD.minQty ? GD.perUnit * n : 0;
    const discount = Math.max(pair, group);
    const discountKey = group > pair ? 'co.discount' : 'co.discount.pair';
    return { n, sub, discount, discountKey, total: sub - discount };   // self pickup: no delivery fee
  }

  // same header as the Higgsfield purchase dialog: label, serif title, product line, then the three steps
  function header(title = S.step === 1 ? 'co.title' : 'co.title2') {
    const steps = ['co.step1', 'co.step2', 'co.step3'].map((k, i) =>
      `<li class="${S.step === i + 1 ? 'is-on' : ''}">${t(k)}</li>`).join('');
    return `<p class="small-label">${t('co.kicker')}</p><h2 id="co-title">${t(title)}</h2>
      ${S.step === 1 ? `<p class="purchase-product">${t('co.product')} <b>${money(C.price)}</b> <s>${money(C.anchor)}</s></p>` : ''}
      <ol class="co-steps">${steps}</ol>`;
  }

  function summary(pr) {
    return `<div class="co-sum" data-sum>
        <div><span>${pr.n} × ${t('sticky.name')}</span><span><bdi><s>${money(pr.n * C.anchor)}</s></bdi> <bdi>${money(pr.sub)}</bdi></span></div>
        ${pr.discount ? `<div class="co-disc"><span>${t(pr.discountKey)}</span><span>−${money(pr.discount)}</span></div>` : ''}
        <div><span>${t('co.pickup.row')}</span><span>${t('co.free')}</span></div>
        <div class="is-total"><span>${t('co.total')}</span><span>${money(pr.total)}</span></div>
      </div>`;
  }

  function step1() {
    const pr = price();
    const sp = split(pr.sub - pr.discount, S.people);
    const tooSmall = S.group && sp.each < C.minShare;
    const stepper = (attr, val, lab, canDec, canInc) => `<div class="quantity-control" role="group" aria-label="${lab}">
        <button type="button" ${attr}="-1" aria-label="${t('co.dec')} ${lab}" ${canDec ? '' : 'disabled'}>${icon('minus', 15)}</button>
        <output aria-live="polite">${val}</output>
        <button type="button" ${attr}="1" aria-label="${t('co.inc')} ${lab}" ${canInc ? '' : 'disabled'}>${icon('plus', 15)}</button></div>`;
    const rows = ['blue', 'brown'].map(c => `<div class="co-row"><span class="colour-choice${S[c] ? ' selected' : ''}"><span class="fabric-chip fabric-${c}" aria-hidden="true">${icon('check')}</span>${t('col.' + c)}</span>
        ${stepper(`data-cq-${c}`, S[c], t('col.' + c), S[c] > 0 && qty() > 1, qty() < C.maxQty)}</div>`).join('');
    return `${header()}
      <p class="co-label">${t('co.pick')}</p>
      ${rows}
      ${qty() === 1 ? `<p class="co-hint">${t('co.pair.hint')}</p>` : ''}
      <div class="co-row"><label for="co-group">${t('co.group')}<span class="co-hint" style="display:block">${t('co.group.desc')} ${t('co.discount.hint')}</span></label>
        <input class="co-toggle" id="co-group" type="checkbox" ${S.group ? 'checked' : ''}></div>
      ${S.group ? `<div class="co-row"><span>${t('co.people')}</span>${stepper('data-people', S.people, t('co.people'), S.people > 2, S.people < C.maxGroup)}</div>
        <p class="co-hint">${t('co.each')}: <b>${money(sp.each)}</b>${sp.first !== sp.each ? ` · ${t('co.you.more')}: <b>${money(sp.first)}</b>` : ''}</p>
        ${tooSmall ? `<p class="co-err">${t('co.err.share')}</p>` : ''}` : ''}
      ${summary(pr)}
      <button class="save-selection" type="button" data-next ${tooSmall ? 'disabled' : ''}>${t('co.next')}${icon('next', 20, true)}</button>
      <p class="purchase-disclaimer">${t('co.disclaimer')}</p>`;
  }

  function field(name, label, type = 'text', extra = '', hint = '') {
    const v = S.f[name] || '';
    const tag = type === 'textarea'
      ? `<textarea name="${name}" ${extra}>${esc(v)}</textarea>`
      : `<input name="${name}" type="${type}" value="${esc(v)}" ${extra}>`;
    return `<label class="field" data-field="${name}"><span>${t(label)}</span>${hint ? `<small>${hint}</small>` : ''}${tag}<p class="co-err" data-err="${name}"></p></label>`;
  }

  // Ashdod (by appointment) or Nes Ziona (the owner's father brings it over: 2-3 days)
  function pickupChoice() {
    return `<fieldset class="co-pickup"><legend class="co-label">${t('co.pickup')}</legend>
      ${['ashdod', 'nesziona'].map(k => `<label class="co-opt"><input type="radio" name="pickup" value="${k}" ${S.f.pickup === k ? 'checked' : ''}>
        <span><b>${t('pk.' + k)}</b><small>${t('pk.' + k + '.note')}</small></span></label>`).join('')}</fieldset>`;
  }

  function step2() {
    const consent = t('co.consent', { terms: '§T', returns: '§R' })
      .replace('§T', `<a href="terms.html" target="_blank">${t('foot.terms')}</a>`)
      .replace('§R', `<a href="returns.html" target="_blank">${t('foot.returns')}</a>`);
    return `${header()}
      <form data-form novalidate>
        ${field('name', 'co.name', 'text', 'autocomplete="name" required')}
        ${field('phone', 'co.phone', 'tel', 'autocomplete="tel" inputmode="tel" dir="ltr" required')}
        ${field('email', 'co.email', 'email', 'autocomplete="email" inputmode="email" dir="ltr"')}
        <div class="co-row" style="margin-bottom:10px"><label for="co-gift">${t('co.gift')}<span class="co-hint" style="display:block">${t('co.gift.desc')}</span></label>
          <input class="co-toggle" id="co-gift" type="checkbox" ${S.gift ? 'checked' : ''}></div>
        ${S.gift ? `<div class="co-giftbox">${field('gnote', 'co.gnote', 'textarea', 'maxlength="300"')}</div>` : ''}
        ${pickupChoice()}
        ${field('notes', 'co.notes', 'textarea')}
        <p class="co-consent">${consent}</p>
        ${summary(price())}
        <div class="co-actions"><button class="co-back" type="button" data-back>${t('co.back')}</button>
          <button class="save-selection" type="submit" ${S.busy ? 'disabled' : ''}>${S.busy ? t('co.sending') : t('co.submit')}${icon('next', 20, true)}</button></div>
      </form>`;
  }

  function orderText() {
    const colour = [S.blue ? `${S.blue} ${t('col.blue')}` : '', S.brown ? `${S.brown} ${t('col.brown')}` : ''].filter(Boolean).join(' + ');
    let s = t('co.wa.order', { colour, qty: qty(), name: S.f.name, phone: S.f.phone, pickup: t('pk.' + S.f.pickup) });
    if (S.group) s += `\n${t('co.group')}: ${S.people}`;
    if (S.gift) s += `\n${t('co.gift')}${S.f.gnote ? `: ${S.f.gnote}` : ''}`;
    if (S.f.notes) s += `\n${S.f.notes}`;
    return s;
  }

  function step3() {
    if (S.offline) {
      return `${header('co.offline.title')}<p class="co-no">${t('co.offline')}</p>
        <a class="save-selection" href="${wa(orderText())}" target="_blank" rel="noopener">${t('co.offline.btn')}${icon('up', 20, true)}</a>`;
    }
    const r = S.res;
    const head = `${header('co.done')}<p class="co-no">${t('co.orderno')}: <b>${esc(r.order_no)}</b></p>
      <p class="co-hint co-pickup-done"><b>${t('pk.' + S.f.pickup)}.</b> ${t('pk.' + S.f.pickup + '.after')}</p>`;
    if (!S.group) {
      const ref = `Sway ${r.order_no}`;
      return `${head}<p class="co-label">${t('co.pay.title')}</p>${payCard(r.amount, ref)}
        <a class="save-selection" data-paid="${esc(r.shares[0].token)}" href="${wa(t('co.wa.paid', { amount: r.amount, ref }))}" target="_blank" rel="noopener">${t('co.pay.paid')}${icon('up', 20, true)}</a>`;
    }
    const base = siteBase();
    const rows = r.shares.map(s => {
      const link = `${base}pay.html?s=${s.token}${I18N.lang === 'en' ? '&lang=en' : ''}`;
      const who = s.n === 1 ? t('co.group.you') : t('co.group.friend', { n: s.n });
      const act = s.n === 1
        ? `<a class="btn btn--coral" href="${esc(link)}">${t('co.group.pay')}</a>`
        : `<a class="btn btn--line" href="${wa(t('co.group.msg', { amount: s.amount, link }), '')}" target="_blank" rel="noopener">${t('co.group.send')}</a>${copyBtn(link)}`;
      return `<li><span><b>${who}</b><small>${money(s.amount)} · Sway ${esc(r.order_no)}-${s.n}</small></span><span class="co-actions">${act}</span></li>`;
    }).join('');
    return `${head}
      <p class="co-label">${t('co.group.title')}</p><ul class="shares">${rows}</ul>
      <a class="save-selection" href="${base}order.html?o=${r.order_token}${I18N.lang === 'en' ? '&lang=en' : ''}">${t('co.group.track')}${icon('up', 20, true)}</a>`;
  }

  // photo follows the colour: the same patio shot, blue or brown
  function render() {
    const photo = S.brown > S.blue ? 'assets/img/brown-garden-same.webp' : 'assets/img/blue-garden.webp';
    dlg.innerHTML = `<div class="purchase-layout">
      <button type="button" class="dialog-close" data-x aria-label="${t('close')}">${icon('x', 24)}</button>
      <div class="purchase-photo"><img src="${photo}" alt="" width="900" height="900"></div>
      <div class="purchase-copy">${S.step === 1 ? step1() : S.step === 2 ? step2() : step3()}</div></div>`;
  }

  function readForm(form) {
    const d = Object.fromEntries(new FormData(form));
    Object.keys(d).forEach(k => { d[k] = String(d[k]).trim(); });
    const tel = v => (v || '').replace(/\D/g, '').replace(/^972/, '0');
    d.phone = tel(d.phone);
    return d;
  }

  function validate(form) {
    const d = readForm(form);
    const errs = {
      name: d.name.length < 2 && 'co.err.name',
      phone: !/^05\d{8}$/.test(d.phone) && 'co.err.phone',
      email: d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email) && 'co.err.email',
    };
    d.pickup = d.pickup === 'nesziona' ? 'nesziona' : 'ashdod';
    S.f = d;
    let first = null;
    Object.entries(errs).forEach(([k, e]) => {
      const f = form.querySelector(`[data-field="${k}"]`);
      if (!f) return;
      const input = f.querySelector('input,textarea');
      f.classList.toggle('has-err', !!e);
      f.querySelector('[data-err]').textContent = e ? t(e) : '';
      input.setAttribute('aria-invalid', String(!!e));
      if (e && !first) first = input;
    });
    if (first) first.focus();
    return !first;
  }

  async function submit(form) {
    if (S.busy || !validate(form)) return;
    S.busy = true; render();
    try {
      S.res = await api('create_order_v2', {
        p_blue: S.blue, p_brown: S.brown, p_name: S.f.name, p_phone: S.f.phone,
        p_city: null, p_address: null, p_pickup: S.f.pickup, p_notes: S.f.notes || null,
        p_people: S.group ? S.people : null, p_lang: I18N.lang, p_email: S.f.email || null,
        p_is_gift: S.gift, p_gift_note: S.gift ? (S.f.gnote || null) : null
      });
      S.offline = false;
      document.dispatchEvent(new CustomEvent('sway:order', { detail: { value: S.res.amount, qty: qty() } }));
    } catch (e) {
      S.offline = true;
    }
    S.busy = false; S.step = 3; render();
  }

  if (dlg) {
  dlg.addEventListener('click', e => {
    const el = e.target;
    if (el.closest('[data-x]')) return dlg.close();
    const cq = el.closest('[data-cq-blue],[data-cq-brown]');
    if (cq) {
      const c = cq.hasAttribute('data-cq-blue') ? 'blue' : 'brown';
      const d = +(cq.dataset.cqBlue || cq.dataset.cqBrown);
      if (S[c] + d >= 0 && qty() + d >= 1 && qty() + d <= C.maxQty) S[c] += d;
      render();
      return dlg.querySelector(`[data-cq-${c}="${d}"]:not(:disabled)`)?.focus();
    }
    const pp = el.closest('[data-people]');
    if (pp) {
      S.people = Math.min(C.maxGroup, Math.max(2, S.people + +pp.dataset.people));
      render();
      return dlg.querySelector(`[data-people="${pp.dataset.people}"]:not(:disabled)`)?.focus();
    }
    if (el.closest('[data-next]')) { S.step = 2; render(); document.dispatchEvent(new Event('sway:details')); return dlg.querySelector('input')?.focus(); }
    if (el.closest('[data-back]')) { S.f = readForm(dlg.querySelector('form')); S.step = 1; return render(); }
    const paid = el.closest('[data-paid]'); if (paid) api('report_share_paid', { p_token: paid.dataset.paid }).catch(() => {});
  });
  dlg.addEventListener('change', e => {
    if (e.target.id === 'co-group') { S.group = e.target.checked; render(); dlg.querySelector('#co-group').focus(); }
    if (e.target.id === 'co-gift') { S.f = readForm(dlg.querySelector('form')); S.gift = e.target.checked; render(); dlg.querySelector('#co-gift').focus(); }
  });
  dlg.addEventListener('input', e => { if (e.target.name === 'pickup') S.f.pickup = e.target.value; });
  dlg.addEventListener('submit', e => { e.preventDefault(); submit(e.target); });
  document.addEventListener('langchange', () => { if (dlg.open) render(); });

  window.Order = {
    open({ colour = 'blue', group = false } = {}) {
      if (S.step === 3) Object.assign(S, { step: 1, res: null, offline: false });
      if (!S.res && S.step === 1 && qty() <= 1) { S.blue = colour === 'blue' ? 1 : 0; S.brown = colour === 'brown' ? 1 : 0; }
      S.group = group || S.group;
      render();
      dlg.showModal();
      // land on the title, not the close button (screen readers hear where they are)
      const h = dlg.querySelector('#co-title'); h.tabIndex = -1; h.focus();
      document.dispatchEvent(new Event('sway:checkout'));
    }
  };
  }

  /* ================= pay.html (one friend's share) ================= */
  async function payPage(app) {
    const token = new URLSearchParams(location.search).get('s');
    app.innerHTML = `<p>${t('pay.loading')}</p>`;
    let d;
    try { d = await api('get_share_v2', { p_token: token }); } catch (e) { app.innerHTML = `<h1>${t('pay.title')}</h1><p>${t('pay.notfound')}</p>`; return; }
    const ref = `Sway ${d.order_no}-${d.n}`;
    const pct = Math.round(100 * d.paid_count / d.people);
    const state = d.status === 'confirmed' ? `<p><span class="badge badge--confirmed">${t('pay.confirmed')}</span></p>`
      : d.status === 'reported' ? `<p><span class="badge badge--reported">${t('pay.reported')}</span></p>` : '';
    app.innerHTML = `<p class="kicker">${t('pay.title')}</p><h1>${t('pay.hello')}</h1>
      <p>${esc(d.qty)} × ${t('sticky.name')} · ${t('col.' + d.colour)}${d.pickup ? ` · ${t('co.pickup.row')}: ${t('pk.' + d.pickup)}` : ''}</p>
      <div class="progress"><i style="width:${pct}%"></i></div><p>${t('pay.progress', { paid: d.paid_count, n: d.people })}</p>
      <h2>${t('pay.share')}</h2>${state}
      ${d.status === 'confirmed' ? '' : payCard(d.amount, ref)}
      ${d.status === 'waiting' ? `<a class="btn btn--coral" style="width:100%" data-mark href="${wa(t('co.wa.paid', { amount: d.amount, ref }))}" target="_blank" rel="noopener">${t('co.pay.paid')}</a>` : ''}
      <p style="margin-top:28px"><a href="./">${t('pay.about')}</a></p>`;
    app.querySelector('[data-mark]')?.addEventListener('click', () => {
      api('report_share_paid', { p_token: token }).then(() => payPage(app)).catch(() => {});
    });
  }

  /* ================= order.html (organiser's tracker) ================= */
  async function orderPage(app) {
    const token = new URLSearchParams(location.search).get('o');
    app.innerHTML = `<p>${t('pay.loading')}</p>`;
    let d;
    try { d = await api('get_order_v2', { p_token: token }); } catch (e) { app.innerHTML = `<h1>${t('ord.title')}</h1><p>${t('pay.notfound')}</p>`; return; }
    const base = siteBase();
    const paid = d.shares.filter(s => s.status === 'confirmed').length;
    const rows = d.shares.map(s => {
      const link = `${base}pay.html?s=${s.token}`;
      const who = s.n === 1 ? t('co.group.you') : t('co.group.friend', { n: s.n });
      return `<li><span><b>${who}</b><small>${money(s.amount)} · Sway ${esc(d.order_no)}-${s.n}</small></span>
        <span class="co-actions"><span class="badge badge--${s.status}">${t('ord.status.' + s.status)}</span>${s.status === 'waiting' && s.n !== 1 ? `<a class="copy" href="${wa(t('ord.remind.msg', { amount: s.amount, link }), '')}" target="_blank" rel="noopener">${t('ord.remind')}</a>${copyBtn(link)}` : ''}</span></li>`;
    }).join('');
    app.innerHTML = `<p class="kicker">${t('ord.title')}</p><h1>Sway ${esc(d.order_no)}</h1>
      <p>${esc(d.qty)} × ${t('sticky.name')} · ${t('col.' + d.colour)} · ${money(d.amount)}${d.pickup ? ` · ${t('pk.' + d.pickup)}` : ''}</p>
      <div class="progress"><i style="width:${Math.round(100 * paid / d.people)}%"></i></div>
      <p>${paid === d.people ? t('ord.all') : t('pay.progress', { paid, n: d.people })}</p>
      <ul class="shares">${rows}</ul>`;
  }

  const page = document.body.dataset.page;
  if (page) {
    I18N.init();
    document.querySelectorAll('[data-lang-toggle]').forEach(b => b.addEventListener('click', () => I18N.set(I18N.lang === 'he' ? 'en' : 'he')));
    const app = document.getElementById('app');
    const run = () => (page === 'pay' ? payPage(app) : orderPage(app));
    document.addEventListener('langchange', run);
    run();
  }
})();
