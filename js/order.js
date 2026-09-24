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
  // coupons live in the database (admin page > שיווק); coupon_check says if a code is good and for how much.
  // create_order_v2 applies it again, so the price shown here is only a preview.
  const norm = c => String(c || '').replace(/\s+/g, '').toUpperCase();
  const couponOk = () => !!S.couponInfo;
  async function applyCoupon(code) {
    S.coupon = code; S.couponInfo = null;
    if (norm(code)) S.couponInfo = await api('coupon_check', { p_code: norm(code) }).catch(() => null);
    render();
  }
  function couponRow() {
    const ok = couponOk(), tried = S.coupon && !ok;
    return `<div class="co-coupon"><label for="co-coupon">${t('co.coupon')}</label>
      <span class="co-coupon__row"><input id="co-coupon" dir="ltr" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="20" value="${esc(S.coupon || '')}">
      <button type="button" data-coupon-apply>${t('co.coupon.apply')}</button></span>
      ${ok ? `<p class="co-hint co-coupon__ok">${t('co.coupon.ok', { v: S.couponInfo.kind === 'pct' ? S.couponInfo.value + '%' : money(S.couponInfo.value) })}</p>` : tried ? `<p class="co-err">${t('co.coupon.bad')}</p>` : ''}</div>`;
  }

  function price() {
    const n = qty(), sub = n * C.price;
    // best single discount wins: pairs (2 for ₪850) or group of 3+
    const pair = Math.floor(n / 2) * C.pairDiscount;
    const group = S.group && n >= GD.minQty ? GD.perUnit * n : 0;
    const ci = S.couponInfo, coupon = ci ? (ci.kind === 'pct' ? Math.round(sub * ci.value / 100) : Math.min(ci.value, sub)) : 0;
    const discount = Math.max(pair, group, coupon);
    const discountKey = discount === coupon ? 'co.discount.coupon' : group > pair ? 'co.discount' : 'co.discount.pair';
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
    const rows = ['blue', 'brown'].map(c => `<div class="co-row"><button type="button" class="colour-choice${S[c] ? ' selected' : ''}" data-pick="${c}" aria-pressed="${view() === c}"><span class="fabric-chip fabric-${c}" aria-hidden="true">${icon('check')}</span>${t('col.' + c)}</button>
        ${stepper(`data-cq-${c}`, S[c], t('col.' + c), S[c] > 0 && qty() > 1, qty() < C.maxQty)}</div>`).join('');
    const one = qty() === 1, two = qty() === 2;
    const deal = qty() <= 2 ? `<div class="co-deal" role="group" aria-label="${t('co.deal')}">
        <button type="button" class="co-deal__opt${one ? ' is-on' : ''}" data-qset="1" aria-pressed="${one}"><b>${t('co.one')}</b><span>${money(C.price)}</span></button>
        <button type="button" class="co-deal__opt${two ? ' is-on' : ''}" data-qset="2" aria-pressed="${two}"><b>${t('co.pair')}</b><span>${money(2 * C.price - C.pairDiscount)}</span><small>${t('co.pair.save', { s: money(C.pairDiscount) })}</small></button>
      </div>` : '';
    return `${header()}
      ${deal}
      <p class="co-label">${t('co.pick')}</p>
      ${rows}
      ${two ? `<p class="co-hint">${t('co.pair.mix')}</p>` : ''}
      <div class="co-row"><label for="co-group">${t('co.group')}<span class="co-hint" style="display:block">${t('co.group.desc')} ${t('co.discount.hint')}</span></label>
        <input class="co-toggle" id="co-group" type="checkbox" ${S.group ? 'checked' : ''}></div>
      ${S.group ? `<div class="co-row"><span>${t('co.people')}</span>${stepper('data-people', S.people, t('co.people'), S.people > 2, S.people < C.maxGroup)}</div>
        <p class="co-hint">${t('co.each')}: <b>${money(sp.each)}</b>${sp.first !== sp.each ? ` · ${t('co.you.more')}: <b>${money(sp.first)}</b>` : ''}</p>
        ${tooSmall ? `<p class="co-err">${t('co.err.share')}</p>` : ''}` : ''}
      ${couponRow()}
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
    const on = ['ashdod', 'nesziona'].filter(k => !(C.pickupOff || []).includes(k));
    if (on.length && !on.includes(S.f.pickup)) S.f.pickup = on[0];   // a point switched off on the admin page
    return `<fieldset class="co-pickup"><legend class="co-label">${t('co.pickup')}</legend>
      ${['ashdod', 'nesziona'].filter(k => !(C.pickupOff || []).includes(k)).map(k => `<label class="co-opt"><input type="radio" name="pickup" value="${k}" ${S.f.pickup === k ? 'checked' : ''}>
        <span><b>${t('pk.' + k)}</b><small>${t('pk.' + k + '.note')}</small></span></label>`).join('')}</fieldset>`;
  }

  function step2() {
    const consent = t('co.consent', { terms: '§T', returns: '§R' })
      .replace('§T', `<a href="terms.html" target="_blank">${t('foot.terms')}</a>`)
      .replace('§R', `<a href="returns.html" target="_blank">${t('foot.returns')}</a>`);
    return `${header()}
      <form data-form novalidate>
        ${field('name', 'co.name', 'text', 'autocomplete="name" required minlength="2" maxlength="80"')}
        ${field('phone', 'co.phone', 'tel', 'autocomplete="tel" inputmode="tel" dir="ltr" required')}
        ${field('email', 'co.email', 'email', 'autocomplete="email" inputmode="email" dir="ltr"')}
        <div class="co-row" style="margin-bottom:10px"><label for="co-gift">${t('co.gift')}<span class="co-hint" style="display:block">${t('co.gift.desc')}</span></label>
          <input class="co-toggle" id="co-gift" type="checkbox" ${S.gift ? 'checked' : ''}></div>
        ${S.gift ? `<div class="co-giftbox">${field('gnote', 'co.gnote', 'textarea', 'maxlength="300"')}</div>` : ''}
        ${pickupChoice()}
        ${field('notes', 'co.notes', 'textarea', 'maxlength="500"')}
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
    if (S.active) {
      return `${header('co.offline.title')}<p class="co-no">${t('co.active', { no: esc(S.active) })}</p>
        <a class="save-selection" href="${wa(t('co.wa.active', { no: S.active }))}" target="_blank" rel="noopener">${t('co.active.btn')}${icon('up', 20, true)}</a>`;
    }
    if (S.offline) {
      return `${header('co.offline.title')}<p class="co-no">${t('co.offline')}</p>
        <a class="save-selection" href="${wa(orderText())}" target="_blank" rel="noopener">${t('co.offline.btn')}${icon('up', 20, true)}</a>`;
    }
    const r = S.res;
    const head = `${header('co.done')}<p class="co-no">${t('co.orderno')}: <b>${esc(r.order_no)}</b></p>
      <p class="co-hint co-pickup-done"><b>${t('pk.' + S.f.pickup)}.</b> ${t('pk.' + S.f.pickup + '.after')}</p>`;
    // the order opens only when the customer sends it from their own WhatsApp; the bot then sends the Bit details
    const confirm = `<p class="co-label">${t('co.confirm.title')}</p><p class="co-hint">${t('co.confirm.body')}</p>
      <a class="save-selection" href="${wa(t('co.wa.confirm', { no: r.order_no }))}" target="_blank" rel="noopener">${t('co.confirm.btn')}${icon('up', 20, true)}</a>
      <p class="co-hint">${t('co.confirm.after')}</p>
      <button class="co-back" type="button" data-new-order>${t('co.new')}</button>`;
    if (!S.group) return head + confirm;
    const base = siteBase();
    const rows = r.shares.map(s => {
      const link = `${base}pay.html?s=${s.token}${I18N.lang === 'en' ? '&lang=en' : ''}`;
      const who = s.n === 1 ? t('co.group.you') : t('co.group.friend', { n: s.n });
      const act = s.n === 1
        ? `<a class="btn btn--coral" href="${esc(link)}">${t('co.group.pay')}</a>`
        : `<a class="btn btn--line" href="${wa(t('co.group.msg', { amount: s.amount, link }), '')}" target="_blank" rel="noopener">${t('co.group.send')}</a>${copyBtn(link)}`;
      return `<li><span><b>${who}</b><small>${money(s.amount)} · Sway ${esc(r.order_no)}-${s.n}</small></span><span class="co-actions">${act}</span></li>`;
    }).join('');
    return `${head}${confirm}
      <p class="co-label">${t('co.group.title')}</p><ul class="shares">${rows}</ul>
      <a class="save-selection" href="${base}order.html?o=${r.order_token}${I18N.lang === 'en' ? '&lang=en' : ''}">${t('co.group.track')}${icon('up', 20, true)}</a>`;
  }

  // photo follows the colour last picked (else the majority): a close-up of that fabric
  function view() { return S.view || (S.brown > S.blue ? 'brown' : 'blue'); }
  function render() {
    dlg.dataset.step = S.step;   // site.js: no close on an outside tap once the customer is past step 1
    const photo = `assets/img/${view()}-detail.webp`;
    dlg.innerHTML = `<div class="purchase-layout">
      <button type="button" class="dialog-close" data-x aria-label="${t('close')}">${icon('x', 24)}</button>
      <div class="purchase-photo"><img src="${photo}" alt="" width="900" height="900"></div>
      <div class="purchase-copy">${S.step === 1 ? step1() : S.step === 2 ? step2() : step3()}</div></div>`;
  }

  function readForm(form) {
    const d = Object.fromEntries(new FormData(form));
    Object.keys(d).forEach(k => { d[k] = String(d[k]).trim(); });
    const tel = v => (v || '').replace(/\D/g, '').replace(/^(00)?972/, '0');
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
        p_is_gift: S.gift, p_gift_note: S.gift ? (S.f.gnote || null) : null,
        p_coupon: S.couponInfo ? S.couponInfo.code : null
      });
      S.offline = false; S.active = null;
      try { localStorage.setItem('sway-pending', JSON.stringify({ no: S.res.order_no, token: S.res.order_token, at: Date.now() })); } catch {}
      document.dispatchEvent(new CustomEvent('sway:order', { detail: { value: S.res.amount, qty: qty() } }));
    } catch (e) {
      const act = String(e && e.message).match(/active_order:(\d+)/);   // one active order per phone
      S.active = act ? act[1] : null;
      S.offline = !act;
    }
    S.busy = false; S.step = 3; render();
    dlg.querySelector('#co-title')?.focus();   // screen readers hear the result, not silence
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
      if (d > 0) S.view = c;
      else if (!S[c]) S.view = null;
      render();
      return dlg.querySelector(`[data-cq-${c}="${d}"]:not(:disabled)`)?.focus();
    }
    // tapping a colour name: a single hammock switches colour; with several, it just shows that fabric
    const qs = el.closest('[data-qset]');
    if (qs) {   // one or a pair: a pair doubles the colour already chosen (the customer can split it below)
      const c = view();
      if (qs.dataset.qset === '1') Object.assign(S, { blue: c === 'blue' ? 1 : 0, brown: c === 'brown' ? 1 : 0 });
      else if (qty() < 2) S[c] = 2;
      render(); return dlg.querySelector(`[data-qset="${qs.dataset.qset}"]`)?.focus();
    }
    const pick = el.closest('[data-pick]');
    if (pick) {
      const c = pick.dataset.pick;
      if (qty() === 1) { S.blue = c === 'blue' ? 1 : 0; S.brown = c === 'brown' ? 1 : 0; }
      S.view = c;
      render();
      return dlg.querySelector(`[data-pick="${c}"]`)?.focus();
    }
    const pp = el.closest('[data-people]');
    if (pp) {
      S.people = Math.min(C.maxGroup, Math.max(2, S.people + +pp.dataset.people));
      render();
      return dlg.querySelector(`[data-people="${pp.dataset.people}"]:not(:disabled)`)?.focus();
    }
    if (el.closest('[data-next]')) { S.step = 2; render(); document.dispatchEvent(new Event('sway:details')); return dlg.querySelector('input')?.focus(); }
    if (el.closest('[data-coupon-apply]')) return applyCoupon(dlg.querySelector('#co-coupon').value).then(() => dlg.querySelector('#co-coupon')?.focus());
    if (el.closest('a[href*="wa.me"]') && S.res && S.step === 3) document.dispatchEvent(new CustomEvent('sway:confirm', { detail: { value: S.res.amount } }));
    if (el.closest('[data-new-order]')) { Object.assign(S, { step: 1, res: null, offline: false, active: null }); return render(); }
    if (el.closest('[data-back]')) { S.f = readForm(dlg.querySelector('form')); S.step = 1; return render(); }
    const paid = el.closest('[data-paid]'); if (paid) api('report_share_paid', { p_token: paid.dataset.paid }).catch(() => {});
  });
  dlg.addEventListener('change', e => {
    if (e.target.id === 'co-group') { S.group = e.target.checked; render(); dlg.querySelector('#co-group').focus(); }
    if (e.target.id === 'co-gift') { S.f = readForm(dlg.querySelector('form')); S.gift = e.target.checked; render(); dlg.querySelector('#co-gift').focus(); }
  });
  dlg.addEventListener('input', e => { if (e.target.name === 'pickup') S.f.pickup = e.target.value; });
  dlg.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'co-coupon') { e.preventDefault(); applyCoupon(e.target.value).then(() => dlg.querySelector('#co-coupon')?.focus()); } });
  dlg.addEventListener('submit', e => { e.preventDefault(); submit(e.target); });
  document.addEventListener('langchange', () => { if (dlg.open) render(); });
  document.addEventListener('shopchange', () => { if (dlg.open) render(); });

  const urlCoupon = new URLSearchParams(location.search).get('coupon');
  if (urlCoupon) S.coupon = urlCoupon;
  window.Order = {
    open({ colour = 'blue', group = false, coupon } = {}) {
      if (coupon || (S.coupon && !S.couponInfo)) applyCoupon(coupon || S.coupon);
      // a created order stays on its confirm step until the customer starts a new one (the link must not get lost)
      if (S.step === 3 && !S.res) Object.assign(S, { step: 1, res: null, offline: false, active: null });
      if (!S.res && S.step === 1 && qty() <= 1) { S.blue = colour === 'blue' ? 1 : 0; S.brown = colour === 'brown' ? 1 : 0; S.view = null; }
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
    // no payment card before the organiser confirms on WhatsApp, or after the order is cancelled
    if (d.order_status === 'pending' || d.order_status === 'cancelled') {
      app.innerHTML = `<h1>${t('pay.title')}</h1><p>${t(d.order_status === 'pending' ? 'pay.pending' : 'pay.cancelled')}</p><p style="margin-top:28px"><a href="./">${t('pay.about')}</a></p>`;
      return;
    }
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

  // an order made here but not yet confirmed on WhatsApp: a thin bar on every visit until it is, or the hour is over
  (async () => {
    let p; try { p = JSON.parse(localStorage.getItem('sway-pending') || 'null'); } catch {}
    if (!p || Date.now() - p.at > 3600e3) { try { localStorage.removeItem('sway-pending'); } catch {} return; }
    const d = await api('get_order_v2', { p_token: p.token }).catch(() => null);
    if (!d || d.status !== 'pending') { try { localStorage.removeItem('sway-pending'); } catch {} return; }
    const bar = document.createElement('div');
    bar.className = 'pend-bar'; bar.setAttribute('role', 'status');
    const paint = () => { bar.innerHTML = `<span>${t('pend.bar', { no: p.no })}</span><a href="${wa(t('co.wa.confirm', { no: p.no }))}" target="_blank" rel="noopener">${t('co.confirm.btn')}</a><button type="button" aria-label="${t('close')}">×</button>`;
      bar.querySelector('button').onclick = () => bar.remove(); };
    paint(); document.addEventListener('langchange', paint);
    document.body.appendChild(bar);
  })();

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
