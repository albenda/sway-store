// admin.html: owner-only back office (Hebrew). Sign-in by email link (Supabase Auth);
// row access is enforced in the database by RLS + public.is_admin(), not by this page.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const C = window.SWAY;
const sb = createClient(C.supabaseUrl, C.supabaseKey);
const app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const money = n => '₪' + Number(n).toLocaleString('he-IL');
const intl = p => '972' + String(p).replace(/^0/, '');
const wa = (phone, text) => `https://wa.me/${intl(phone)}?text=${encodeURIComponent(text)}`;
const base = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
const COLOUR = { blue: 'כחול ים', brown: 'חום חול', mixed: 'כחול וחום' };
const items = o => [o.qty_blue ? `${o.qty_blue} × כחול ים` : '', o.qty_brown ? `${o.qty_brown} × חום חול` : ''].filter(Boolean).join(' + ') || `${o.qty} × ${COLOUR[o.colour]}`;
const STATUS = { new: 'חדשה', paid: 'שולמה', ready: 'מוכן לאיסוף', collected: 'נאסף', shipped: 'נשלחה', cancelled: 'בוטלה' };
const PICKUP = { ashdod: 'אשדוד, המתכת 21', nesziona: 'נס ציונה' };
const SHARE = { waiting: 'ממתין', reported: 'דיווח ששילם', confirmed: 'אושר' };
let view = 'orders', filter = 'open', orders = [], reviews = [];

function login(msg = '') {
  app.innerHTML = `<h1>ניהול Sway</h1><p>כניסה עם הדוא״ל שהוגדר כמנהל. נשלח אליו קישור כניסה.</p>
    <form data-login><label class="field"><span>דוא״ל</span><input name="email" type="email" dir="ltr" required autocomplete="email"></label>
    <button class="btn btn--coral" style="width:100%">שליחת קישור כניסה</button></form><p>${msg}</p>`;
}

async function load() {
  const [o, r] = await Promise.all([
    sb.from('orders_v2').select('*, order_shares(*)').order('created_at', { ascending: false }).limit(200),
    sb.from('reviews').select('*, orders_v2(order_no, colour)').order('created_at', { ascending: false }).limit(200)
  ]);
  if (o.error) throw o.error;
  orders = o.data; reviews = r.data || [];
}

function shareRow(o, s) {
  const ref = o.people > 1 ? `Sway ${o.order_no}-${s.n}` : `Sway ${o.order_no}`;
  return `<li><span><b>${o.people > 1 ? (s.n === 1 ? 'מזמין' : 'משתתף ' + s.n) : 'תשלום'}</b>
      <small>${money(s.amount)} · ${ref}${s.method ? ' · ' + s.method : ''}</small></span>
    <span class="co__actions"><span class="badge badge--${s.status}">${SHARE[s.status]}</span>
      ${s.status !== 'confirmed' ? `<select data-method="${s.id}" aria-label="אמצעי תשלום"><option value="bit">ביט</option><option value="paybox">PayBox</option><option value="transfer">העברה</option><option value="cash">מזומן</option></select>
      <button class="btn btn--coral btn--sm" data-confirm="${s.id}" data-order="${o.id}">אישור תשלום</button>` : ''}
      ${s.status === 'confirmed' ? `<button class="copy" data-receipt="${o.id}:${s.id}">לקבלה</button>` : ''}</span></li>`;
}

function orderCard(o) {
  const shares = [...o.order_shares].sort((a, b) => a.n - b.n);
  const to = o.is_gift ? `${esc(o.recipient_name)} · <a href="tel:${esc(o.recipient_phone)}">${esc(o.recipient_phone)}</a>` : '';
  const trackLink = `${base}order.html?o=${o.token}`;
  const payMsg = `היי ${o.name}, תודה על ההזמנה! הסכום לתשלום: ${money(o.amount)}.\nבביט למספר ${C.bitPhone}${C.payboxLink ? `, או ב־PayBox: ${C.payboxLink}` : ''}.\nבהערה כתבו: Sway ${o.order_no}`;
  const shipMsg = `היי ${o.name}, הערסל שלך יצא לדרך! נעדכן כשיגיע.`;
  const readyMsg = o.pickup === 'nesziona'
    ? `היי ${o.name}, הערסל שלך מחכה בנס ציונה. מתי נוח לך לאסוף?`
    : `היי ${o.name}, הערסל שלך מוכן! מתי נוח לך לאסוף מאשדוד, רחוב המתכת 21?`;
  const revMsg = `היי ${o.name}, מקווים שאתם נהנים מהערסל. נשמח לביקורת קצרה, עם תמונה אם בא לכם: ${base}review.html?o=${o.token}`;
  return `<article class="adm-card" data-status="${o.status}">
    <header><h2>Sway ${o.order_no}</h2><span class="badge badge--${['paid', 'ready', 'collected', 'shipped'].includes(o.status) ? 'confirmed' : o.status === 'new' ? 'reported' : ''}">${STATUS[o.status]}</span>
      <time>${new Date(o.created_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}</time></header>
    <p><b>${items(o)}</b> · ${money(o.amount)}${o.discount ? ` (הנחה ${money(o.discount)})` : ''}${o.pickup ? '' : ` · משלוח: ${o.shipping_fee == null ? '<b class="adm-warn">לתאם</b>' : money(o.shipping_fee)}`}${o.source === 'whatsapp' ? ' · מהבוט' : ''}${o.people > 1 ? ` · קנייה חברית ל־${o.people}` : ''}</p>
    <p>${esc(o.name)} · <a href="tel:${esc(o.phone)}">${esc(o.phone)}</a>${o.email ? ` · ${esc(o.email)}` : ''}<br>${o.pickup ? `איסוף: <b>${PICKUP[o.pickup]}</b>${o.pickup === 'nesziona' && ['new', 'paid'].includes(o.status) ? ' <b class="adm-warn">(לתאם עם אבא, 2-3 ימים)</b>' : ''}` : `${esc(o.address)}, ${esc(o.city)}`}</p>
    ${o.is_gift ? `<p class="adm-gift">מתנה ל: ${to}${o.gift_note ? `<br>פתק: “${esc(o.gift_note)}”` : ''}</p>` : ''}
    ${o.notes ? `<p class="adm-note">${esc(o.notes)}</p>` : ''}
    ${o.shipping_fee == null && o.status === 'new' ? `<form class="adm-fee" data-fee="${o.id}"><label class="field"><span>דמי משלוח שסוכמו (₪)</span><input name="fee" type="number" min="0" max="500" inputmode="numeric" required></label><button class="btn btn--line btn--sm">עדכון הסכום</button></form>` : ''}
    <ul class="shares">${shares.map(s => shareRow(o, s)).join('')}</ul>
    <div class="adm-actions">
      <a class="btn btn--line btn--sm" target="_blank" rel="noopener" href="${wa(o.phone, payMsg)}">פרטי תשלום בוואטסאפ</a>
      ${o.status === 'paid' && o.pickup ? `<button class="btn btn--coral btn--sm" data-ready="${o.id}">מוכן לאיסוף</button>` : ''}
      ${o.status === 'ready' ? `<a class="btn btn--line btn--sm" target="_blank" rel="noopener" href="${wa(o.phone, readyMsg)}">הודעת איסוף</a>
        <button class="btn btn--coral btn--sm" data-collected="${o.id}">נאסף</button>` : ''}
      ${o.status === 'collected' ? `<a class="btn btn--line btn--sm" target="_blank" rel="noopener" href="${wa(o.phone, revMsg)}">בקשת ביקורת</a>` : ''}
      ${o.status === 'paid' && !o.pickup ? `<button class="btn btn--coral btn--sm" data-ship="${o.id}">סימון נשלח</button>` : ''}
      ${o.status === 'shipped' ? `<a class="btn btn--line btn--sm" target="_blank" rel="noopener" href="${wa(o.phone, shipMsg)}">הודעת משלוח</a>
        <a class="btn btn--line btn--sm" target="_blank" rel="noopener" href="${wa(o.phone, revMsg)}">בקשת ביקורת</a>` : ''}
      ${o.people > 1 ? `<a class="btn btn--line btn--sm" target="_blank" rel="noopener" href="${trackLink}">עמוד המעקב</a>` : ''}
      ${o.status === 'new' ? `<button class="co__back" data-cancel="${o.id}">ביטול הזמנה</button>` : ''}
    </div></article>`;
}

function reviewCard(r) {
  const img = r.photo_path ? `${C.supabaseUrl}/storage/v1/object/public/reviews/${r.photo_path}` : '';
  return `<article class="adm-card" data-status="${r.status}"><header><h2>${'★'.repeat(r.rating)}</h2>
      <span class="badge badge--${r.status === 'approved' ? 'confirmed' : r.status === 'pending' ? 'reported' : ''}">${{ pending: 'ממתינה', approved: 'מאושרת', hidden: 'מוסתרת' }[r.status]}</span>
      <time>Sway ${r.orders_v2?.order_no ?? ''}</time></header>
    ${img ? `<img src="${img}" alt="" style="max-width:220px;border-radius:12px">` : ''}
    <p>“${esc(r.body)}”<br><small>${esc(r.display_name)}</small></p>
    <div class="adm-actions">${r.status !== 'approved' ? `<button class="btn btn--coral btn--sm" data-rev="${r.id}:approved">אישור ופרסום</button>` : ''}
      ${r.status !== 'hidden' ? `<button class="btn btn--line btn--sm" data-rev="${r.id}:hidden">הסתרה</button>` : ''}</div></article>`;
}

function render() {
  const pend = reviews.filter(r => r.status === 'pending').length;
  const list = view === 'orders'
    ? orders.filter(o => filter === 'all' || (filter === 'open' ? ['new', 'paid', 'ready'].includes(o.status) : o.status === filter)).map(orderCard).join('') || '<p>אין הזמנות כאן.</p>'
    : reviews.map(reviewCard).join('') || '<p>אין עדיין ביקורות.</p>';
  app.innerHTML = `<h1>ניהול Sway</h1>
    <nav class="adm-tabs"><button data-view="orders" aria-pressed="${view === 'orders'}">הזמנות</button><button data-view="reviews" aria-pressed="${view === 'reviews'}">ביקורות${pend ? ` (${pend})` : ''}</button><button class="co__back" data-logout>יציאה</button></nav>
    ${view === 'orders' ? `<nav class="adm-tabs adm-tabs--sub">${[['open', 'פתוחות'], ['new', 'חדשות'], ['paid', 'שולמו'], ['ready', 'מוכנים לאיסוף'], ['collected', 'נאספו'], ['all', 'הכל']].map(([k, l]) => `<button data-filter="${k}" aria-pressed="${filter === k}">${l}</button>`).join('')}</nav>` : ''}
    <div class="adm-list">${list}</div>`;
}

async function refresh() { await load(); render(); }

app.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  if (f.matches('[data-login]')) {
    const { error } = await sb.auth.signInWithOtp({ email: f.email.value.trim(), options: { emailRedirectTo: location.href.split('#')[0] } });
    return login(error ? 'שגיאה: ' + esc(error.message) : 'נשלח קישור כניסה לדוא״ל. אפשר לסגור את הלשונית הזו.');
  }
  if (f.matches('[data-fee]')) {
    const o = orders.find(x => x.id === +f.dataset.fee), fee = +f.fee.value;
    const amount = o.qty * o.unit_price - o.discount + fee;
    const first = o.order_shares.find(s => s.n === 1);
    await sb.from('orders_v2').update({ shipping_fee: fee, amount }).eq('id', o.id);
    await sb.from('order_shares').update({ amount: first.amount + fee }).eq('id', first.id);
    return refresh();
  }
});

app.addEventListener('click', async e => {
  const b = e.target.closest('button,[data-view]'); if (!b) return;
  if (b.dataset.view) { view = b.dataset.view; return render(); }
  if (b.dataset.filter) { filter = b.dataset.filter; return render(); }
  if ('logout' in b.dataset) { await sb.auth.signOut(); return login(); }
  if (b.dataset.confirm) {
    const method = app.querySelector(`[data-method="${b.dataset.confirm}"]`).value;
    await sb.from('order_shares').update({ status: 'confirmed', method, confirmed_at: new Date().toISOString() }).eq('id', b.dataset.confirm);
    const o = orders.find(x => x.id === +b.dataset.order);
    const left = o.order_shares.filter(s => s.status !== 'confirmed' && s.id !== +b.dataset.confirm).length;
    if (!left) await sb.from('orders_v2').update({ status: 'paid' }).eq('id', o.id);
    return refresh();
  }
  if (b.dataset.ready) { await sb.from('orders_v2').update({ status: 'ready' }).eq('id', b.dataset.ready); return refresh(); }
  if (b.dataset.collected) { await sb.from('orders_v2').update({ status: 'collected' }).eq('id', b.dataset.collected); return refresh(); }
  if (b.dataset.ship) { await sb.from('orders_v2').update({ status: 'shipped', shipped_at: new Date().toISOString() }).eq('id', b.dataset.ship); return refresh(); }
  if (b.dataset.cancel && confirm('לבטל את ההזמנה?')) { await sb.from('orders_v2').update({ status: 'cancelled' }).eq('id', b.dataset.cancel); return refresh(); }
  if (b.dataset.rev) { const [id, status] = b.dataset.rev.split(':'); await sb.from('reviews').update({ status }).eq('id', id); return refresh(); }
  if (b.dataset.receipt) {
    // manual receipt for now (Yesh Invoice API needs a paid plan): copy the details, open Yesh Invoice
    const [oid, sid] = b.dataset.receipt.split(':').map(Number);
    const o = orders.find(x => x.id === oid), s = o.order_shares.find(x => x.id === sid);
    const txt = `קבלה\nלקוח: ${o.name}\nטלפון: ${o.phone}${o.email ? `\nדוא״ל: ${o.email}` : ''}\nפריט: ערסל Sway, ${items(o)}\nסכום: ${s.amount} ₪\nאמצעי תשלום: ${s.method || 'ביט'}\nתאריך: ${new Date(s.confirmed_at || Date.now()).toLocaleDateString('he-IL')}\nאסמכתא: Sway ${o.order_no}${o.people > 1 ? '-' + s.n : ''}`;
    await navigator.clipboard.writeText(txt).catch(() => {});
    b.textContent = 'הועתק';
    window.open('https://user.yeshinvoice.co.il/', '_blank', 'noopener');
  }
});

sb.auth.onAuthStateChange(async (_evt, session) => {
  if (!session) return login();
  const { data: ok } = await sb.rpc('is_admin');
  if (!ok) { app.innerHTML = '<h1>ניהול Sway</h1><p>לדוא״ל הזה אין הרשאת ניהול.</p><button class="co__back" data-logout>יציאה</button>'; return; }
  try { await refresh(); } catch (err) { app.innerHTML = `<h1>ניהול Sway</h1><p>שגיאה בטעינה: ${esc(err.message)}</p>`; }
});
