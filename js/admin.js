// admin.html: the owner's back office (Hebrew, RTL). Sign-in with username + password (Supabase Auth; the
// username maps to the admin email in config.js). The email link is only for the first time / forgot password.
// Access is enforced in the database (RLS + public.is_admin()), never by this page. Every status change here
// reaches the customer on WhatsApp by itself (the sway_status webhook > whatsapp-bot?hook=status).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const C = window.SWAY;
const RECOVERY = /type=recovery/.test(location.hash);   // arrived from the "choose a password" email
const REMEMBER = 'sway-adm-remember';
const remember = () => { try { return localStorage.getItem(REMEMBER) !== '0'; } catch { return true; } };
// "stay signed in" decides where the session lives: localStorage survives restarts, sessionStorage ends with the tab
const where = () => (remember() ? localStorage : sessionStorage);
const sb = createClient(C.supabaseUrl, C.supabaseKey, { auth: { storage: {
  getItem: k => sessionStorage.getItem(k) ?? localStorage.getItem(k),
  setItem: (k, v) => { where().setItem(k, v); (where() === localStorage ? sessionStorage : localStorage).removeItem(k); },
  removeItem: k => { localStorage.removeItem(k); sessionStorage.removeItem(k); } } } });

// ---------- helpers ----------
const $ = s => document.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const ils = n => '₪' + Math.round(n || 0).toLocaleString('he-IL');
const intl = p => '972' + String(p).replace(/^0/, '');
const wa = (phone, text = '') => `https://wa.me/${intl(phone)}${text ? '?text=' + encodeURIComponent(text) : ''}`;
const ic = (id, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#a-${id}"/></svg>`;
const base = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
const first = n => String(n || '').trim().split(/\s+/)[0];
const day = t => new Date(t).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
const when = t => new Date(t).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
const hours = t => (Date.now() - Date.parse(t)) / 36e5;
const ago = t => {
  const m = hours(t) * 60;
  if (m < 1) return 'עכשיו';
  if (m < 60) return `לפני ${Math.round(m)} דק׳`;
  if (m < 1440) return `לפני ${Math.round(m / 60)} שע׳`;
  const d = Math.round(m / 1440);
  return d === 1 ? 'אתמול' : `לפני ${d} ימים`;
};
const MARK = '<span class="mark"><img src="assets/brand/logo-ink-160.png" alt=""><span>Sway<i>.</i></span></span>';

const ST = { pending: 'לא אישר בוואטסאפ', new: 'ממתין לתשלום', paid: 'שולם, להכין', ready: 'מוכן לאיסוף', collected: 'נאסף', shipped: 'נשלח', cancelled: 'בוטל' };
const PICK = { ashdod: 'אשדוד', nesziona: 'נס ציונה', courier: 'שליח (ברקוד)' };
const METHOD = { paybox: 'PayBox', bit: 'ביט', transfer: 'העברה', cash: 'מזומן', other: 'אחר' };
const COLOUR = { blue: 'כחול ים', brown: 'חום חול' };
const VIEWS = { today: ['היום', 'today'], orders: ['הזמנות', 'orders'], money: ['כסף', 'money'], marketing: ['שיווק', 'tag'], stock: ['מלאי', 'stock'], people: ['לקוחות', 'people'] };

const blue = o => o.qty_blue || (o.colour === 'blue' ? o.qty : 0);
const brown = o => o.qty_brown || (o.colour === 'brown' ? o.qty : 0);
const items = o => [blue(o) && `${blue(o)} ${COLOUR.blue}`, brown(o) && `${brown(o)} ${COLOUR.brown}`].filter(Boolean).join(' + ');
const sw = o => (blue(o) ? '<i class="sw sw--blue"></i>' : '') + (brown(o) ? '<i class="sw sw--brown"></i>' : '');
const shares = o => [...(o.order_shares || [])].sort((a, b) => a.n - b.n);
const reported = o => o.status === 'new' && o.order_shares.some(s => s.status === 'reported');
const due = o => o.order_shares.filter(s => s.status !== 'confirmed').reduce((a, s) => a + s.amount, 0);
const told$ = o => o.order_shares.filter(s => s.status === 'reported').reduce((a, s) => a + s.amount, 0);   // reported, not confirmed
const paid$ = o => o.order_shares.filter(s => s.status === 'confirmed').reduce((a, s) => a + s.amount, 0);
const payLabel = o => o.people > 1 && reported(o) ? told$(o) : due(o);
const live = o => ['new', 'paid', 'ready'].includes(o.status);
const pill = o => reported(o) ? '<span class="pill pill--reported">דיווח ששילם</span>' : `<span class="pill pill--${o.status}">${ST[o.status]}</span>`;
const ref = (o, s) => `Sway ${o.order_no}${o.people > 1 ? '-' + s.n : ''}`;

// customer texts (no em dash, the bot's voice)
const T = {
  pay: o => `היי ${first(o.name)}, תודה על ההזמנה Sway ${o.order_no}.\nלתשלום: ${ils(due(o) || o.amount)} ב־PayBox או בביט, למספר ${C.bitPhone}.\nבהערה לכתוב: Sway ${o.order_no}`,
  remind: o => `היי ${first(o.name)}, ההזמנה Sway ${o.order_no} עדיין מחכה לתשלום (${ils(due(o))} ב־PayBox או בביט, למספר ${C.bitPhone}). יש שאלה? אני כאן.`,
  ready: o => o.pickup === 'nesziona'
    ? `היי ${first(o.name)}, הערסל מחכה לך בנס ציונה. מתי נוח לך לאסוף?`
    : `היי ${first(o.name)}, הערסל מוכן לאיסוף באשדוד, רחוב המתכת 21 (א׳-ה׳, 08:30-14:30). מתי נוח לך להגיע?`,
  review: o => `היי ${first(o.name)}, מקווים שאתם נהנים מהערסל. נשמח לביקורת קצרה, עם תמונה אם בא לכם: ${base}review.html?o=${o.token}`
};
// "I saw the money" buttons: one per app, so the receipt shows the right payment method
const payBtns = (o, size, short) => ['paybox', 'bit'].map(m =>
  `<button class="btn btn--coral ${size}" data-pay="${o.id}" data-via="${m}">${short ? '' : ic('check', 'ic--sm')}${short ? METHOD[m] : `שולם ב${m === 'bit' ? 'ביט' : '־PayBox'}`}</button>`).join('');
const receipt = (o, s) => `קבלה\nלקוח: ${o.name}\nטלפון: ${o.phone}${o.email ? `\nדוא״ל: ${o.email}` : ''}\nפריט: ערסל Sway, ${items(o)}\nסכום: ${s.amount} ₪\nאמצעי תשלום: ${METHOD[s.method] || 'לא צוין'}\nתאריך: ${new Date(s.confirmed_at || Date.now()).toLocaleDateString('he-IL')}\nאסמכתא: ${ref(o, s)}`;

// ---------- state + data ----------
const S = { orders: [], reviews: [], inv: null, log: [], coupons: null, expenses: [], events: [], settings: {}, notes: {}, resellers: [], rpay: [], rsl: 0, labels: {}, me: '', q: '', mode: 'board', period: 'month', ppl: 'customers', mkt: 'coupons', acct: false, cust: '', palette: false, palq: '', live: false, flash: new Set() };
const must = r => { if (r.error) throw r.error; return r; };

let seq = 0, snap = '';
async function load() {
  const my = ++seq;
  const [o, r, i, l, cp, ex, ev, st, cn, rs, rp] = await Promise.all([
    sb.from('orders_v2').select('*, order_shares(*)').order('created_at', { ascending: false }).limit(1000),
    sb.from('reviews').select('*, orders_v2(order_no)').order('created_at', { ascending: false }).limit(200),
    sb.from('inventory').select('*').order('colour'),
    sb.from('inventory_log').select('*').order('at', { ascending: false }).limit(30),
    sb.from('coupons').select('*').order('created_at', { ascending: false }),
    sb.from('expenses').select('*').order('day', { ascending: false }).limit(500),
    sb.from('order_events').select('*').order('at', { ascending: false }).limit(3000),
    sb.from('settings').select('*'),
    sb.from('customer_notes').select('*'),
    sb.from('resellers').select('*').order('name'),
    sb.from('reseller_payments').select('*').order('day', { ascending: false })
  ]);
  must(o);
  if (my !== seq) return null;                  // a newer load already landed
  const next = JSON.stringify([o.data, r.data, i.data, l.data, cp.data, ex.data, ev.data, st.data, cn.data, rs.data, rp.data]);
  if (next === snap) return null;               // nothing changed: no re-render, no lost taps
  snap = next;
  const before = S.orders;
  S.orders = o.data; S.reviews = r.data || []; S.inv = i.error ? null : i.data; S.log = l.data || [];
  // round-2 tables (sway_v6_admin2.sql); null until that migration runs, and the views say so
  S.coupons = cp.error ? null : cp.data; S.expenses = ex.data || []; S.events = ev.data || [];
  S.settings = Object.fromEntries((st.data || []).map(x => [x.key, x.value]));
  S.notes = Object.fromEntries((cn.data || []).map(x => [x.phone, x]));
  S.resellers = rs.data || []; S.rpay = rp.data || [];
  return before;
}

// toasts for what happened while the page was open (new confirmed orders, "I paid" reports)
function announce(before) {
  if (!before.length) return;
  const old = new Map(before.map(o => [o.id, o]));
  for (const o of S.orders) {
    const p = old.get(o.id);
    if (o.status === 'new' && (!p || p.status === 'pending')) toast(`הזמנה חדשה: Sway ${o.order_no}, ${o.name}`, o.order_no);
    else if (!p && o.reseller_id) toast(`הזמנת משווקת: Sway ${o.order_no}, ${o.name} · ${items(o)}`, o.order_no);
    else if (p && reported(o) && !reported(p)) toast(`Sway ${o.order_no}: ${first(o.name)} דיווח ששילם`, o.order_no);
    else continue;
    S.flash.add(o.id);
  }
}

async function refresh(force) { const before = await load(); if (!before && !force) return; if (before) announce(before); render(force); }

let toastT;
function toast(text, no, bad) {
  const t = $('.toast');
  t.className = 'toast' + (bad ? ' toast--bad' : '');
  t.innerHTML = `<span>${esc(text)}</span>${no ? `<button data-go="#orders/${no}">פתיחה</button>` : ''}`;
  t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, bad ? 8000 : 5000);
}

// ---------- round 2: history, funnel, abandoned orders, coupons, profit ----------
const EXP = { ads: 'פרסום', stock: 'סחורה', packaging: 'אריזה', fees: 'עמלות', other: 'אחר' };
const TAGS = ['VIP', 'חוזר', 'ממליץ', 'בעייתי'];
const EV = { pending: 'נפתחה באתר', new: 'אושרה, ממתינה לתשלום', paid: 'שולם', ready: 'מוכן לאיסוף', collected: 'נאסף', shipped: 'נשלח', cancelled: 'בוטל', dad_ack: 'אבא קיבל', dad_ready: 'אבא: מוכן', dad_done: 'אבא: נמסר' };
const byWhom = w => !w ? '' : w === 'dad' ? 'אבא, בוואטסאפ' : w === 'bot' ? 'הבוט' : w === 'system' ? 'אוטומטי' : userOf(w);
const eventsOf = o => S.events.filter(e => e.order_id === o.id).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
// got past the WhatsApp confirmation at some point (also true for orders cancelled later for not paying)
const confirmedEver = o => !['pending', 'cancelled'].includes(o.status) || o.order_shares.some(s => s.status !== 'waiting')
  || !!o.reminded_at || S.events.some(e => e.order_id === o.id && e.kind === 'new') || o.source === 'whatsapp';
const abandoned = () => S.orders.filter(o => hours(o.created_at) < 24 * 14 && (o.status === 'pending' || (o.status === 'cancelled' && !confirmedEver(o))));
const unpaidLost = () => S.orders.filter(o => o.status === 'cancelled' && hours(o.created_at) < 24 * 14 && confirmedEver(o) && o.order_shares.every(s => s.status === 'waiting'));
const couponUse = code => S.orders.filter(o => o.coupon === code && !['pending', 'cancelled'].includes(o.status));
const dadPhone = () => S.settings.dad_phone || '';
// resellers: they buy at their own price and pay on account (orders add to the balance, payments take off)
const rsOrders = r => S.orders.filter(o => o.reseller_id === r.id && o.status !== 'cancelled');
const rsPaid = r => S.rpay.filter(p => p.reseller_id === r.id).reduce((a, p) => a + p.amount, 0);
const rsOwed = r => rsOrders(r).reduce((a, o) => a + o.amount, 0) - rsPaid(r);
const rsOff = r => Math.round((1 - r.unit_price / C.price) * 100);
const rsOf = o => o.reseller_id && S.resellers.find(r => r.id === o.reseller_id);
const dadText = o => `הזמנה Sway ${o.order_no} שולמה. להכין:\n${items(o)}\n${o.pickup === 'nesziona' ? 'להביא לנס ציונה (תוך 2-3 ימים)' : 'איסוף מאשדוד, הלקוח יתאם שעה'}\nלקוח: ${o.name}, ${o.phone}`;
T.recover = o => `היי ${first(o.name)}, ראיתי שהתחלת הזמנה של ערסל Sway (${items(o)}) ולא הספקת לאשר אותה. רוצה שאשמור לך אותה? מספיק לענות כאן.`;
T.unpaid = o => `היי ${first(o.name)}, ההזמנה Sway ${o.order_no} בוטלה כי לא הגיע תשלום. אם עדיין בא לך את הערסל, אני יכול לפתוח אותה מחדש.`;

// ---------- the to-do list ----------
function tasks() {
  const out = [];
  const add = (hot, icon, o, title, sub, act) => out.push({ hot, icon, o, title, sub, act });
  const open = o => `<button class="btn btn--line btn--sm" data-open="${o.order_no}">פרטים</button>`;
  for (const o of S.orders) {
    if (reported(o)) add(2, 'money', o, `לבדוק ב־PayBox / ביט: ${ils(payLabel(o))}`, `Sway ${o.order_no} · ${esc(o.name)} · דיווח ${ago(o.order_shares.find(s => s.status === 'reported').reported_at || o.created_at)}`,
      `${payBtns(o, 'btn--sm')}${open(o)}`);
    else if (o.status === 'new' && hours(o.created_at) >= 24) add(0, 'wa', o, 'עוד לא שילם', `Sway ${o.order_no} · ${esc(o.name)} · ${ago(o.created_at)}${o.reminded_at ? ' · הבוט כבר שלח תזכורת' : ''}. מתבטל לבד אחרי 48 שע׳`,
      `<a class="btn btn--wa btn--sm" target="_blank" rel="noopener" href="${wa(o.phone, T.remind(o))}">${ic('wa', 'ic--sm')}תזכורת</a>${open(o)}`);
    if (o.status === 'paid' && o.pickup === 'courier') add(1, 'orders', o, `להכין למשלוח של ${esc(o.name)}`, `Sway ${o.order_no} · ${sw(o)}${items(o)} · ברקוד לשליח`,
      `<button class="btn btn--main btn--sm" data-st="${o.id}:ready">ארוז, מחכה לשליח</button>${open(o)}`);
    else if (o.status === 'paid') add(1, 'orders', o, o.pickup === 'nesziona' ? 'להביא לנס ציונה' : 'להכין לאיסוף באשדוד',
      `Sway ${o.order_no} · ${esc(o.name)} · ${sw(o)}${items(o)}${o.pickup === 'nesziona' ? ' · לתאם עם אבא, 2-3 ימים' : ''}`,
      `<button class="btn btn--main btn--sm" data-st="${o.id}:ready">מוכן לאיסוף</button>${open(o)}`);
    if (o.status === 'ready' && o.pickup === 'courier') add(0, 'pin', o, `מחכה לשליח: ${esc(o.name)}`, `Sway ${o.order_no} · ${items(o)}`,
      `<button class="btn btn--main btn--sm" data-st="${o.id}:collected">השליח לקח</button>`);
    else if (o.status === 'ready') add(0, 'pin', o, `מחכה לאיסוף ב${PICK[o.pickup] || 'נקודת האיסוף'}`, `Sway ${o.order_no} · ${esc(o.name)} · ${esc(o.phone)}`,
      `<a class="btn btn--wa btn--sm" target="_blank" rel="noopener" href="${wa(o.phone, T.ready(o))}">${ic('wa', 'ic--sm')}תיאום</a><button class="btn btn--main btn--sm" data-st="${o.id}:collected">נאסף</button>`);
    if (o.status !== 'cancelled') for (const s of o.order_shares) if (s.status === 'confirmed' && !s.receipt_no)
      add(0, 'receipt', o, `להוציא קבלה ${ils(s.amount)}`, `${ref(o, s)} · ${esc(o.name)} · שולם ${ago(s.confirmed_at || o.created_at)}`, open(o));
  }
  for (const k of stock()) if (k.low) add(1, 'stock', null, `מלאי נמוך: ${COLOUR[k.colour]}`, `נשארו ${k.free} פנויים`, '<a class="btn btn--line btn--sm" href="#stock">למלאי</a>');
  const pend = S.reviews.filter(r => r.status === 'pending').length;
  if (pend) add(0, 'star', null, pend === 1 ? 'ביקורת מחכה לאישור' : `${pend} ביקורות מחכות לאישור`, 'לא מתפרסמות באתר עד שמאשרים', '<a class="btn btn--line btn--sm" href="#people" data-ppl="reviews">לביקורות</a>');
  return out.sort((a, b) => b.hot - a.hot);
}

// ---------- stock ----------
function stock() {
  if (!S.inv) return [];
  const held = { blue: 0, brown: 0 };   // sold but not collected yet
  for (const o of S.orders) if (live(o)) { held.blue += blue(o); held.brown += brown(o); }
  return S.inv.map(k => ({ ...k, held: held[k.colour], free: k.on_hand - held[k.colour], low: k.on_hand - held[k.colour] <= k.low_at }));
}

// ---------- money ----------
const PERIODS = { today: 'היום', week: '7 ימים', month: 'החודש', d30: '30 יום', year: 'השנה', all: 'הכל' };
function since(p) {
  if (p === 'all') return 0;
  const d = new Date(); d.setHours(0, 0, 0, 0);
  if (p === 'week') d.setDate(d.getDate() - 6);
  if (p === 'month') d.setDate(1);
  if (p === 'd30') d.setDate(d.getDate() - 29);
  if (p === 'year') d.setMonth(0, 1);
  return d.getTime();
}
function payments(p) {
  const from = since(p), out = [];
  for (const o of S.orders) for (const s of o.order_shares)
    if (s.status === 'confirmed') { const t = Date.parse(s.confirmed_at || o.created_at); if (t >= from) out.push({ o, s, t }); }
  return out.sort((a, b) => b.t - a.t);
}
function buckets(pays, p) {
  const g = p === 'today' ? 'h' : (p === 'year' || p === 'all') ? 'm' : 'd';
  const d = new Date(since(p) || (pays.length ? Math.min(...pays.map(x => x.t)) : Date.now()));
  if (g === 'm') d.setDate(1);
  d.setHours(0, 0, 0, 0);
  const key = t => { const x = new Date(t); return g === 'h' ? x.toDateString() + x.getHours() : g === 'd' ? x.toDateString() : x.getFullYear() * 12 + x.getMonth(); };
  const sum = new Map();
  for (const x of pays) sum.set(key(x.t), (sum.get(key(x.t)) || 0) + x.s.amount);
  const out = [];
  for (const now = Date.now(); d <= now; g === 'h' ? d.setHours(d.getHours() + 1) : g === 'd' ? d.setDate(d.getDate() + 1) : d.setMonth(d.getMonth() + 1))
    out.push({ v: sum.get(key(d)) || 0, label: g === 'h' ? `${d.getHours()}:00` : g === 'd' ? day(d) : d.toLocaleDateString('he-IL', { month: 'short', year: '2-digit' }) });
  return out;
}

// ---------- views ----------
function top(title, sub = '', search = false) {
  return `<div class="top"><h1>${title}${sub ? `<small>${sub}</small>` : ''}</h1>${search ? `<label class="search">${ic('search')}<span class="sr">חיפוש</span>
    <input id="q" type="search" placeholder="שם, טלפון או מספר הזמנה" value="${esc(S.q)}" autocomplete="off"></label>` : ''}</div>`;
}
const chips = (attr, list, cur) => `<div class="chips" role="group">${list.map(([k, l, n]) =>
  `<button class="chip" data-${attr}="${k}" aria-pressed="${cur === k}">${l}${n != null ? ` <span class="n num">${n}</span>` : ''}</button>`).join('')}</div>`;

function viewToday() {
  const list = tasks();
  const month = payments('month').reduce((a, x) => a + x.s.amount, 0)
    + S.rpay.filter(p => Date.parse(p.day + 'T12:00:00') >= since('month')).reduce((a, p) => a + p.amount, 0);
  const waiting = S.orders.filter(o => o.status === 'new');
  const free = stock().reduce((a, k) => a + k.free, 0);
  const date = new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
  const recent = S.orders.filter(o => o.status !== 'pending').slice(0, 6);
  return top('היום', `${date} · ${list.length ? `${list.length} דברים לעשות` : 'הכל מטופל'}`) +
    `<section class="sec" aria-label="מה לעשות"><div class="queue">${list.length ? list.map(k => `<article class="panel task${k.hot === 2 ? ' task--hot' : ''}">
      <span class="task__ic">${ic(k.icon)}</span><div><h3>${k.title}</h3><p>${k.sub}</p></div><div class="task__do">${k.act}</div></article>`).join('')
      : `<div class="panel all-clear"><svg viewBox="0 0 64 24" aria-hidden="true"><use href="#a-mark"/></svg><div><b>אין כלום לטפל בו עכשיו</b><span>הזמנה חדשה או דיווח תשלום יופיעו כאן לבד.</span></div></div>`}</div></section>
    <section class="sec"><h2>המצב</h2><div class="stats">
      <div class="stat"><span>הכנסות החודש</span><b class="num">${ils(month)}</b><small>לפי תשלומים שאושרו</small></div>
      <div class="stat${waiting.length ? ' stat--warn' : ''}"><span>ממתין לתשלום</span><b class="num">${ils(waiting.reduce((a, o) => a + due(o), 0))}</b><small>${waiting.length} הזמנות</small></div>
      <div class="stat"><span>בטיפול</span><b class="num">${S.orders.filter(o => ['paid', 'ready'].includes(o.status)).length}</b><small>שולמו ועוד לא נאספו</small></div>
      <div class="stat"><span>פנויים במלאי</span><b class="num">${S.inv ? free : '?'}</b><small>${S.inv ? 'אחרי הזמנות פתוחות' : 'עוד לא הוגדר'}</small></div>
    </div></section>
    <section class="sec"><h2>הזמנות אחרונות</h2><div class="panel rows">${recent.map(row).join('') || '<p class="empty">עוד אין הזמנות.</p>'}</div></section>`;
}

function card(o) {
  const late = (o.status === 'new' && hours(o.created_at) >= 20) || (o.status === 'paid' && hours(o.created_at) >= 72);
  const quick = reported(o) ? payBtns(o, 'btn--sm', true)
    : o.status === 'new' ? `<a class="btn btn--wa btn--sm" target="_blank" rel="noopener" href="${wa(o.phone, T.remind(o))}">${ic('wa', 'ic--sm')}תזכורת</a>`
    : o.status === 'paid' ? `<button class="btn btn--main btn--sm" data-st="${o.id}:ready">מוכן לאיסוף</button>`
    : o.status === 'ready' ? `<button class="btn btn--main btn--sm" data-st="${o.id}:collected">נאסף</button>` : '';
  return `<div class="oc${S.flash.has(o.id) ? ' is-flash' : ''}"><button class="oc__hit" data-open="${o.order_no}">
    <span class="oc__top"><span class="oc__no num">Sway ${o.order_no}</span>${reported(o) ? pill(o) : ''}<span class="oc__age${late ? ' is-late' : ''}">${ago(o.created_at)}</span></span>
    <span class="oc__name">${esc(o.name)}${o.reseller_id ? ' <span class="pill">משווקת</span>' : ''}</span>
    <span class="oc__meta"><span>${sw(o)}${items(o)}</span><span class="oc__amt num">${ils(o.amount)}</span>${o.pickup ? `<span>${PICK[o.pickup]}</span>` : ''}${o.source === 'whatsapp' ? '<span>מהבוט</span>' : ''}</span>
    ${o.status === 'paid' ? `<span class="oc__flag"><span class="pill ${o.dad_ack_at ? 'pill--ok' : 'pill--new'}">${o.dad_ack_at ? 'אבא קיבל' : 'אבא עוד לא אישר'}</span></span>` : ''}
    ${o.admin_note ? `<span class="oc__flag"><span class="pill">${esc(o.admin_note.slice(0, 40))}</span></span>` : ''}</button>
    ${quick ? `<div class="oc__act">${quick}</div>` : ''}</div>`;
}
const row = o => `<button class="row" data-open="${o.order_no}"><span class="num"><b>${o.order_no}</b></span>
  <span><b>${esc(o.name)}</b><br><small class="num">${esc(o.phone)}</small></span><span>${sw(o)}${items(o)}</span>
  <span class="num">${ils(o.amount)}</span><span>${pill(o)}</span>${ic('chev', 'ic--sm')}</button>`;

function match(o) {
  const q = S.q.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, '');
  return o.name.toLowerCase().includes(q) || (digits && (String(o.order_no).includes(digits) || o.phone.includes(digits)));
}
function viewOrders() {
  const all = S.orders.filter(match);
  const n = st => S.orders.filter(o => o.status === st).length;
  const mode = S.q.trim() && S.mode === 'board' ? 'all' : S.mode;
  let body;
  if (mode === 'board') {
    const cols = [['new', 'ממתין לתשלום', 'נפתחה בוואטסאפ'], ['paid', 'שולם, להכין', 'להביא לנקודת האיסוף'], ['ready', 'מוכן לאיסוף', 'מחכה ללקוח'], ['collected', 'נאסף', '30 הימים האחרונים']];
    body = `<div class="board">${cols.map(([st, l, sub]) => {
      let list = all.filter(o => o.status === st);
      if (st === 'new') list.sort((a, b) => reported(b) - reported(a));
      if (st === 'collected') list = list.filter(o => hours(o.created_at) < 24 * 30).slice(0, 12);
      return `<section class="col" aria-label="${l}"><header><span class="pill pill--${st}">${l}</span><span class="n num">${list.length}</span></header>
        <div class="col__list">${list.map(card).join('') || `<p class="col__empty">${sub}: אין כרגע</p>`}</div></section>`;
    }).join('')}</div>`;
  } else {
    const list = all.filter(o => mode === 'all' ? true : o.status === mode);
    body = `<div class="panel rows"><div class="row row--head" aria-hidden="true"><span>מס׳</span><span>לקוח</span><span>פריטים</span><span>סכום</span><span>מצב</span><span></span></div>
      ${list.map(row).join('') || `<p class="empty"><b>לא נמצאו הזמנות</b>${S.q ? 'אפשר לחפש לפי שם, טלפון או מספר.' : ''}</p>`}</div>`;
  }
  return top('הזמנות', `${S.orders.filter(live).length} פתוחות`, true) +
    chips('mode', [['board', 'לוח עבודה'], ['all', 'כל ההזמנות', S.orders.length], ['pending', 'לא אישרו בוואטסאפ', n('pending')], ['cancelled', 'בוטלו', n('cancelled')]], mode) +
    `<div class="sec">${body}</div>`;
}

function viewMoney() {
  const pays = payments(S.period);
  const rsRev = S.rpay.filter(p => inPeriod(p.day + 'T12:00:00')).reduce((a, p) => a + p.amount, 0);
  const rev = pays.reduce((a, x) => a + x.s.amount, 0) + rsRev;
  const paidOrders = [...new Set(pays.map(x => x.o))];
  const units = paidOrders.reduce((a, o) => a + blue(o) + brown(o), 0)
    + S.orders.filter(o => o.reseller_id && o.status !== 'cancelled' && inPeriod(o.created_at)).reduce((a, o) => a + o.qty, 0);
  const waiting = S.orders.filter(o => o.status === 'new');
  const bars = buckets(pays, S.period), max = Math.max(1, ...bars.map(b => b.v));
  const col = { blue: paidOrders.reduce((a, o) => a + blue(o), 0), brown: paidOrders.reduce((a, o) => a + brown(o), 0) };
  const src = { site: 0, whatsapp: 0 };
  for (const x of pays) src[x.o.source] = (src[x.o.source] || 0) + x.s.amount;
  const barRow = (label, v, total, show) => `<div class="bar"><span>${label}</span><i><s style="width:${total ? Math.round(v / total * 100) : 0}%"></s></i><b class="num">${show}</b></div>`;
  const noRc = pays.filter(x => !x.s.receipt_no).length;
  return top('כסף', `תשלומים שאושרו · ${PERIODS[S.period]}`) +
    chips('period', Object.entries(PERIODS), S.period) +
    `<section class="sec kpis">
      <div class="panel kpi kpi--main"><span>הכנסות</span><b class="num">${ils(rev)}</b><small>${pays.length} תשלומים${rsRev ? ` · כולל ${ils(rsRev)} ממשווקים` : ''}</small></div>
      <div class="panel kpi"><span>ערסלים שנמכרו</span><b class="num">${units}</b><small>${paidOrders.length} הזמנות</small></div>
      <div class="panel kpi"><span>ממוצע להזמנה</span><b class="num">${ils(paidOrders.length ? rev / paidOrders.length : 0)}</b><small>אחרי הנחות</small></div>
      <div class="panel kpi"><span>ממתין לתשלום</span><b class="num">${ils(waiting.reduce((a, o) => a + due(o), 0))}</b><small>${waiting.length} הזמנות פתוחות</small></div>
    </section>
    ${profitBox(rev, units)}
    ${funnelBox()}
    <section class="sec panel chart" aria-label="הכנסות לאורך זמן"><div class="chart__bars">${bars.map(b =>
      `<div class="${b.v ? '' : 'z'}" style="height:${b.v ? Math.max(4, b.v / max * 100) : 2}%" title="${b.label}: ${ils(b.v)}"></div>`).join('')}</div>
      <div class="chart__x"><span>${bars[0]?.label || ''}</span><span>${bars.at(-1)?.label || ''}</span></div></section>
    <section class="sec split">
      <div class="panel box"><h3>לפי צבע (ערסלים)</h3>${barRow(COLOUR.blue, col.blue, units, col.blue)}${barRow(COLOUR.brown, col.brown, units, col.brown)}</div>
      <div class="panel box"><h3>לפי מקור (₪)</h3>${barRow('אתר', src.site, rev, ils(src.site))}${barRow('בוט וואטסאפ', src.whatsapp, rev, ils(src.whatsapp))}</div>
    </section>
    <section class="sec"><h2>תשלומים <span class="count">${noRc ? `· ${noRc} בלי קבלה` : ''}</span>
      <button class="btn btn--line btn--sm" data-csv style="margin-inline-start:auto">${ic('download', 'ic--sm')}ייצוא לאקסל</button></h2>
      <div class="panel" style="overflow-x:auto"><table class="tbl"><thead><tr><th>תאריך</th><th>הזמנה</th><th>לקוח</th><th>אמצעי</th><th class="r">סכום</th><th>קבלה</th></tr></thead>
      <tbody>${pays.map(x => `<tr><td class="num">${day(x.t)}</td><td><button data-open="${x.o.order_no}">${ref(x.o, x.s)}</button></td><td>${esc(x.o.name)}</td>
        <td>${METHOD[x.s.method] || 'לא צוין'}${x.o.status === 'cancelled' ? ' <span class="pill pill--cancelled">בוטל, להחזיר?</span>' : ''}</td><td class="r num">${ils(x.s.amount)}</td><td>${x.s.receipt_no ? `<span class="num">${esc(x.s.receipt_no)}</span>` : '<span class="pill pill--new">חסרה</span>'}</td></tr>`).join('')
        || '<tr><td colspan="6" class="empty">אין תשלומים בתקופה הזו.</td></tr>'}</tbody></table></div></section>
    ${expensesBox()}`;
}

const inPeriod = t => Date.parse(t) >= since(S.period);
function profitBox(rev, units) {
  const exp = S.expenses.filter(x => inPeriod(x.day + 'T12:00:00')).reduce((a, x) => a + x.amount, 0);
  const uc = +S.settings.unit_cost || 0, cogs = uc * units, profit = rev - exp - cogs;
  return `<section class="sec panel box profit"><h3>רווח · ${PERIODS[S.period]}</h3>
    <div class="pl"><span>הכנסות</span><b class="num">${ils(rev)}</b></div>
    <div class="pl"><span>הוצאות</span><b class="num" dir="ltr">−${ils(exp)}</b></div>
    <div class="pl"><span>עלות הערסלים${uc ? ` (${units} × ${ils(uc)})` : ''}</span><b class="num" dir="ltr">${uc ? '−' + ils(cogs) : '<button class="linkish" data-acct>להגדיר עלות ליחידה</button>'}</b></div>
    <div class="pl pl--total"><span>רווח</span><b class="num" dir="ltr">${ils(profit)}</b></div></section>`;
}
function funnelBox() {
  const os = S.orders.filter(o => inPeriod(o.created_at));
  const steps = [['התחילו הזמנה', os.length], ['אישרו בוואטסאפ', os.filter(confirmedEver).length],
    ['שילמו', os.filter(o => o.order_shares.some(s => s.status === 'confirmed')).length], ['אספו', os.filter(o => ['collected', 'shipped'].includes(o.status)).length]];
  const top0 = steps[0][1] || 1;
  return `<section class="sec panel box"><h3>משפך · ${PERIODS[S.period]}</h3>${steps.map(([l, n], i) =>
    `<div class="bar"><span>${l}</span><i><s style="width:${Math.round(n / top0 * 100)}%"></s></i><b class="num">${n}${i ? ` <small>(${steps[i - 1][1] ? Math.round(n / steps[i - 1][1] * 100) : 0}%)</small>` : ''}</b></div>`).join('')}</section>`;
}
function expensesBox() {
  const list = S.expenses.filter(x => inPeriod(x.day + 'T12:00:00'));
  return `<section class="sec"><h2>הוצאות <span class="count">${ils(list.reduce((a, x) => a + x.amount, 0))}</span></h2>
    <form class="panel box cform" data-expense>
      <label class="field"><span>תאריך</span><input name="day" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label>
      <label class="field"><span>סוג</span><select name="category">${Object.entries(EXP).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <label class="field"><span>סכום (₪)</span><input name="amount" type="number" inputmode="numeric" min="1" required></label>
      <label class="field"><span>הערה</span><input name="note" maxlength="200" placeholder="למשל: קמפיין מטא, שבוע 1"></label>
      <button class="btn btn--main">הוספה</button></form>
    <div class="panel" style="overflow-x:auto"><table class="tbl"><tbody>${list.map(x => `<tr><td class="num">${day(x.day + 'T12:00:00')}</td><td>${EXP[x.category]}</td>
      <td>${esc(x.note || '')}</td><td class="r num">${ils(x.amount)}</td><td class="acts"><button class="btn btn--ghost btn--sm" data-xdel="${x.id}">מחיקה</button></td></tr>`).join('')
      || '<tr><td class="empty">אין הוצאות בתקופה הזו.</td></tr>'}</tbody></table></div></section>`;
}

function viewMarketing() {
  if (!S.coupons) return top('שיווק') + `<div class="panel empty"><b>הכלים האלה עוד לא מחוברים</b>צריך להריץ פעם אחת את עדכון המסד (sway_v6_admin2.sql).</div>`;
  const ab = abandoned(), lost = unpaidLost();
  let body;
  if (S.mkt === 'coupons') {
    body = `<form class="panel box cform" data-coupon-new><h3>קופון חדש</h3>
        <label class="field"><span>קוד</span><input name="code" required maxlength="20" autocapitalize="characters" spellcheck="false" dir="ltr" placeholder="SUMMER10"></label>
        <label class="field"><span>סוג</span><select name="kind"><option value="pct">אחוז הנחה</option><option value="amount">שקלים הנחה</option></select></label>
        <label class="field"><span>כמה</span><input name="value" type="number" inputmode="numeric" min="1" max="1000" required placeholder="10"></label>
        <label class="field"><span>עד תאריך (לא חובה)</span><input name="ends" type="date"></label>
        <label class="field"><span>מקסימום שימושים (לא חובה)</span><input name="max" type="number" inputmode="numeric" min="1" placeholder="בלי הגבלה"></label>
        <label class="field"><span>הערה (לא חובה)</span><input name="note" maxlength="200" placeholder="למשל: קמפיין אינסטגרם"></label>
        <button class="btn btn--main">יצירת קופון</button></form>
      <div class="panel sec" style="overflow-x:auto"><table class="tbl"><thead><tr><th>קוד</th><th>הנחה</th><th>תוקף</th><th class="r">שימושים</th><th class="r">הכנסות</th><th>מצב</th><th></th></tr></thead><tbody>
      ${S.coupons.map(c => { const u = couponUse(c.code), over = c.ends_at && Date.parse(c.ends_at) < Date.now();
        return `<tr><td><b dir="ltr">${esc(c.code)}</b>${c.note ? `<br><small>${esc(c.note)}</small>` : ''}</td>
          <td class="num">${c.kind === 'pct' ? c.value + '%' : ils(c.value)}</td><td class="num">${c.ends_at ? 'עד ' + day(Date.parse(c.ends_at) - 1) : 'ללא'}</td>
          <td class="r num">${u.length}${c.max_uses ? ' / ' + c.max_uses : ''}</td><td class="r num">${ils(u.reduce((a, o) => a + o.amount, 0))}</td>
          <td>${over ? '<span class="pill">פג</span>' : c.active ? '<span class="pill pill--ok">פעיל</span>' : '<span class="pill pill--cancelled">מושהה</span>'}</td>
          <td class="acts"><button class="btn btn--line btn--sm" data-clink="${esc(c.code)}">קישור</button>
            <button class="btn btn--line btn--sm" data-ctoggle="${esc(c.code)}">${c.active ? 'השהיה' : 'הפעלה'}</button>
            ${u.length ? '' : `<button class="btn btn--bad btn--sm" data-cdel="${esc(c.code)}">מחיקה</button>`}</td></tr>`; }).join('')
      || '<tr><td colspan="7" class="empty">עוד אין קופונים.</td></tr>'}</tbody></table></div>`;
  } else {
    const rowR = (o, kind) => `<div class="cust"><span><b>${esc(o.name)}</b><small class="num">${esc(o.phone)}</small></span>
      <span>${sw(o)}${items(o)} · <span class="num">${ils(o.amount)}</span></span><span>${ago(o.created_at)}</span>
      <span class="cust__do"><a class="btn btn--wa btn--sm" target="_blank" rel="noopener" href="${wa(o.phone, kind === 'ab' ? T.recover(o) : T.unpaid(o))}">${ic('wa', 'ic--sm')}הודעה</a>
        <button class="btn btn--line btn--sm" data-revive="${o.id}">להחזיר</button><button class="btn btn--ghost btn--sm" data-open="${o.order_no}">פרטים</button></span></div>`;
    body = `<section class="sec"><h2>התחילו הזמנה ולא אישרו <span class="count">${ab.length}</span></h2>
        <div class="panel">${ab.map(o => rowR(o, 'ab')).join('') || '<p class="empty">אין כרגע. מי שממלא הזמנה באתר ולא מאשר בוואטסאפ יופיע כאן.</p>'}</div></section>
      <section class="sec"><h2>אישרו ולא שילמו (בוטלו) <span class="count">${lost.length}</span></h2>
        <div class="panel">${lost.map(o => rowR(o, 'lost')).join('') || '<p class="empty">אין כרגע.</p>'}</div></section>
      <p class="hint">״להחזיר״ פותח את ההזמנה מחדש כממתינה לתשלום, כשהלקוח אומר שהוא עדיין רוצה.</p>`;
  }
  return top('שיווק', 'קופונים והזמנות שאפשר להציל') +
    chips('mkt', [['coupons', 'קופונים', S.coupons.filter(c => c.active).length], ['recover', 'להציל הזמנות', ab.length + lost.length]], S.mkt) + `<div class="sec">${body}</div>`;
}

function viewStock() {
  if (!S.inv) return top('מלאי') + `<div class="panel empty"><b>המלאי עוד לא מחובר</b>צריך להריץ פעם אחת את עדכון מסד הנתונים (sway_v4_admin.sql).</div>`;
  const ks = stock();
  return top('מלאי', 'יורד לבד כשמסמנים הזמנה כ״נאסף״') +
    `<section class="sec stock">${ks.map(k => `<article class="panel sk${k.low ? ' sk--low' : ''}">
      <div class="sk__h"><i class="sw sw--${k.colour}"></i>${COLOUR[k.colour]}${k.low ? '<span class="pill pill--cancelled" style="margin-inline-start:auto">נמוך</span>' : ''}</div>
      <div class="sk__big"><b class="num">${k.free}</b><span>פנויים למכירה</span></div>
      <div class="sk__row"><span>במחסן</span><b class="num">${k.on_hand}</b></div>
      <div class="sk__row"><span>שמורים להזמנות פתוחות</span><b class="num">${k.held}</b></div>
      <div class="sk__row"><span>התראה מתחת ל־</span><b class="num">${k.low_at}</b></div>
      <form class="adj" data-count="${k.colour}"><label class="sr" for="n-${k.colour}">כמה יש במחסן</label>
        <input id="n-${k.colour}" name="n" type="number" inputmode="numeric" min="0" max="9999" required placeholder="${k.on_hand}">
        <input class="input" name="reason" maxlength="200" placeholder="סיבה (ספירה, משלוח חדש...)" aria-label="סיבה">
        <button class="btn btn--main">עדכון</button></form></article>`).join('')}</section>
    <section class="sec"><h2>יומן מלאי</h2><div class="panel" style="overflow-x:auto"><table class="tbl"><thead><tr><th>מתי</th><th>צבע</th><th class="r">שינוי</th><th class="r">אחרי</th><th>סיבה</th></tr></thead>
      <tbody>${S.log.map(l => `<tr><td class="num">${when(l.at)}</td><td><i class="sw sw--${l.colour}"></i>${COLOUR[l.colour]}</td>
        <td class="r num"><bdi dir="ltr">${l.delta > 0 ? '+' : ''}${l.delta}</bdi></td><td class="r num">${l.on_hand}</td><td>${esc(l.reason || '')}${l.order_no ? ` · <button data-open="${l.order_no}">Sway ${l.order_no}</button>` : ''}</td></tr>`).join('')
        || '<tr><td colspan="5" class="empty">עוד אין תנועות. מתחילים בספירה: כמה ערסלים יש מכל צבע?</td></tr>'}</tbody></table></div></section>`;
}

function customers() {
  const by = new Map();
  for (const o of S.orders) {
    if (o.status === 'pending' || o.reseller_id) continue;
    const c = by.get(o.phone) || { phone: o.phone, name: o.name, orders: 0, paid: 0, last: o.created_at };
    if (o.status !== 'cancelled') c.orders++;
    c.paid += o.order_shares.filter(s => s.status === 'confirmed').reduce((a, s) => a + s.amount, 0);
    by.set(o.phone, c);   // orders are newest first, so name + last come from the latest order
  }
  return [...by.values()];
}
function viewPeople() {
  const pend = S.reviews.filter(r => r.status === 'pending').length;
  let body;
  if (S.ppl === 'resellers') {
    body = `<form class="panel box cform" data-rs-new><h3>משווק חדש</h3>
        <label class="field"><span>שם</span><input name="name" required maxlength="80"></label>
        <label class="field"><span>טלפון</span><input name="phone" required inputmode="tel" dir="ltr" placeholder="05XXXXXXXX"></label>
        <label class="field"><span>מחיר ליחידה (₪)</span><input name="price" type="number" inputmode="numeric" min="1" max="450" required placeholder="360"></label>
        <button class="btn btn--main">הוספה</button></form>
      <div class="panel sec">${S.resellers.map(r => { const ow = rsOwed(r), open = rsOrders(r).filter(live).length;
        return `<div class="cust"><span><b>${esc(r.name)}</b>${r.active ? '' : ' <span class="pill pill--cancelled">לא פעיל</span>'}<small class="num">${esc(r.phone)}</small></span>
          <span><span class="num">${ils(r.unit_price)}</span> ליחידה · ${rsOff(r)}% הנחה</span>
          <span>${open ? `${open} פתוחות · ` : ''}${ow > 0 ? `<b class="num" style="color:var(--coral-ink)">חייבת ${ils(ow)}</b>` : ow < 0 ? `זכות ${ils(-ow)}` : 'אין חוב'}</span>
          <span class="cust__do"><button class="btn btn--line btn--sm" data-rsl="${r.id}">כרטיס</button></span></div>`; }).join('')
      || '<p class="empty"><b>עוד אין משווקים</b></p>'}</div>
      <p class="hint">משווק ששולח לבוט תמונת ברקוד עם צבע וכמות פותח הזמנה, ואבא מקבל אותה להכנה. שאר ההודעות שלו מגיעות אליך.</p>`;
  } else if (S.ppl === 'reviews') {
    body = `<div class="panel">${S.reviews.map(r => {
      const img = r.photo_path ? `${C.supabaseUrl}/storage/v1/object/public/reviews/${r.photo_path}` : '';
      return `<article class="rev">${img ? `<img src="${esc(img)}" alt="תמונה מהלקוח" loading="lazy">` : '<span></span>'}<div>
        <span class="stars" aria-label="${r.rating} מתוך 5">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
        <span class="pill pill--${r.status === 'approved' ? 'ok' : r.status === 'pending' ? 'new' : 'cancelled'}">${{ pending: 'ממתינה', approved: 'באתר', hidden: 'מוסתרת' }[r.status]}</span>
        <p>“${esc(r.body)}”<br><small>${esc(r.display_name)} · Sway ${r.orders_v2?.order_no ?? ''}</small></p>
        <div class="rev__do">${r.status !== 'approved' ? `<button class="btn btn--main btn--sm" data-rev="${r.id}:approved">אישור ופרסום</button>` : ''}
          ${r.status !== 'hidden' ? `<button class="btn btn--line btn--sm" data-rev="${r.id}:hidden">הסתרה</button>` : ''}</div></div></article>`;
    }).join('') || '<p class="empty"><b>עוד אין ביקורות</b>אחרי איסוף, כפתור ״בקשת ביקורת״ בהזמנה שולח ללקוח קישור.</p>'}</div>`;
  } else {
    const q = S.q.trim().toLowerCase(), digits = q.replace(/\D/g, '');
    const list = customers().filter(c => !q || c.name.toLowerCase().includes(q) || (digits && c.phone.includes(digits)));
    body = `<div class="panel">${list.map(c => `<div class="cust"><span><b>${esc(c.name)}</b>${(S.notes[c.phone]?.tags || []).map(t => ` <span class="pill">${esc(t)}</span>`).join('')}<small class="num">${esc(c.phone)}</small></span>
      <span>${c.orders} ${c.orders === 1 ? 'הזמנה' : 'הזמנות'}${c.paid ? ` · שילם <span class="num">${ils(c.paid)}</span>` : ''}</span><span class="num">${day(c.last)}</span>
      <span class="cust__do"><a class="btn btn--wa btn--sm btn--icon" target="_blank" rel="noopener" href="${wa(c.phone)}" aria-label="וואטסאפ ל${esc(c.name)}">${ic('wa', 'ic--sm')}</a>
        <a class="btn btn--line btn--sm btn--icon" href="tel:${esc(c.phone)}" aria-label="שיחה ל${esc(c.name)}">${ic('phone', 'ic--sm')}</a>
        <button class="btn btn--line btn--sm" data-cust="${esc(c.phone)}">כרטיס</button></span></div>`).join('')
      || '<p class="empty"><b>לא נמצאו לקוחות</b></p>'}</div>`;
  }
  return top('לקוחות', `${customers().length} לקוחות`, S.ppl !== 'reviews') +
    chips('ppl', [['customers', 'לקוחות'], ['resellers', 'משווקים', S.resellers.length || null], ['reviews', 'ביקורות', pend || null]], S.ppl) + `<div class="sec">${body}</div>`;
}

// ---------- drawers ----------
function orderDrawer(o) {
  const idx = { new: 0, paid: 1, ready: 2, collected: 3 }[o.status] ?? -1;
  const steps = ['ממתין לתשלום', 'שולם', 'מוכן', 'נאסף'];
  const main = o.status === 'new' ? payBtns(o, '')
    : o.status === 'paid' ? `<button class="btn btn--main" data-st="${o.id}:ready">מוכן לאיסוף</button>`
    : o.status === 'ready' ? `<button class="btn btn--main" data-st="${o.id}:collected">נאסף</button>` : '';
  const shareBox = shares(o).map(s => `<div class="share"><span><b>${o.people > 1 ? (s.n === 1 ? 'המזמין' : 'משתתף ' + s.n) : 'תשלום'} · <span class="num">${ils(s.amount)}</span></b>
      <small>${ref(o, s)}${s.method ? ' · ' + METHOD[s.method] : ''}${s.confirmed_at ? ' · ' + when(s.confirmed_at) : s.reported_at ? ' · דיווח ' + when(s.reported_at) : ''}</small></span>
      <span class="pill pill--${s.status === 'confirmed' ? 'ok' : s.status === 'reported' ? 'reported' : 'new'}">${{ waiting: 'ממתין', reported: 'דיווח ששילם', confirmed: 'אושר' }[s.status]}</span>
      <div class="share__do">${s.status !== 'confirmed' && live(o) ? `<select data-method="${s.id}" aria-label="אמצעי תשלום">${Object.entries(METHOD).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
        <button class="btn btn--line btn--sm" data-share="${s.id}" data-order="${o.id}">אישור התשלום הזה</button>` : ''}
        ${s.status === 'confirmed' ? `<form class="rc" data-rc="${s.id}"><input name="rc" value="${esc(s.receipt_no || '')}" placeholder="מס׳ קבלה" aria-label="מספר קבלה" inputmode="numeric" maxlength="40">
          <button class="btn btn--line btn--sm">שמירה</button></form>
          <button class="btn btn--ghost btn--sm" data-yesh="${o.id}:${s.id}">${ic('copy', 'ic--sm')}העתקה ליש חשבונית</button>` : ''}</div></div>`).join('');
  return `<div class="scrim" data-close></div><aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="dh">
    <header class="drawer__head"><h2 id="dh" class="num" tabindex="-1">Sway ${o.order_no}</h2>${pill(o)}<button class="btn btn--ghost btn--icon" data-close aria-label="סגירה">${ic('x')}</button></header>
    <div class="drawer__body">
      ${idx >= 0 ? `<div><div class="steps">${steps.map((_, i) => `<span class="${i < idx ? 'on' : i === idx ? 'now' : ''}"></span>`).join('')}</div>
        <div class="steps-l">${steps.map(s => `<span>${s}</span>`).join('')}</div></div>` : ''}
      <dl class="panel kv"><dt>לקוח</dt><dd>${esc(o.name)}</dd>
        <dt>טלפון</dt><dd><a class="num" href="tel:${esc(o.phone)}">${esc(o.phone)}</a></dd>
        ${o.email ? `<dt>דוא״ל</dt><dd>${esc(o.email)}</dd>` : ''}
        <dt>פריטים</dt><dd>${sw(o)}${items(o)}</dd>
        <dt>סכום</dt><dd class="num">${ils(o.amount)}${o.discount ? ` <small>(הנחה ${ils(o.discount)}${o.coupon ? `, קוד ${esc(o.coupon)}` : ''})</small>` : ''}</dd>
        <dt>איסוף</dt><dd>${o.pickup ? PICK[o.pickup] + (o.pickup === 'nesziona' && ['new', 'paid'].includes(o.status) ? ' · לתאם עם אבא' : '') : esc(`${o.address || ''}, ${o.city || ''}`)}</dd>
        <dt>נפתחה</dt><dd>${when(o.created_at)} · ${o.source === 'whatsapp' ? 'בוט וואטסאפ' : 'אתר'}${o.people > 1 ? ` · קנייה משותפת ל־${o.people}` : ''}</dd></dl>
      ${o.is_gift ? `<div class="note">מתנה ל${esc(o.recipient_name)} · <a class="num" href="tel:${esc(o.recipient_phone)}">${esc(o.recipient_phone)}</a>${o.gift_note ? `<br>פתק: “${esc(o.gift_note)}”` : ''}</div>` : ''}
      ${o.notes ? `<div class="note">הערת הלקוח: ${esc(o.notes)}</div>` : ''}
      ${o.reseller_id ? `<section class="panel box"><h3>משווקת</h3><p>משולם דרך החשבון של ${esc(o.name)}: ${o.qty} × ${ils(o.unit_price)}. ${rsOf(o) ? `היתרה שלה: ${ils(rsOwed(rsOf(o)))}.` : ''}</p>
        ${o.label_path ? (S.labels[o.label_path] ? `<a class="btn btn--line btn--sm" target="_blank" rel="noopener" href="${esc(S.labels[o.label_path])}">${ic('receipt', 'ic--sm')}הברקוד להדפסה</a>` : '<p class="hint">טוען את הברקוד…</p>') : '<p class="hint">אין תמונת ברקוד שמורה.</p>'}</section>`
        : `<section class="panel box"><h3>תשלום</h3>${shareBox}</section>`}
      <section class="panel box"><h3>הודעה ללקוח</h3><div class="tmpl">
        ${o.status === 'new' ? `<a class="btn btn--wa btn--sm" target="_blank" rel="noopener" href="${wa(o.phone, T.pay(o))}">${ic('wa', 'ic--sm')}פרטי תשלום</a>
          <a class="btn btn--wa btn--sm" target="_blank" rel="noopener" href="${wa(o.phone, T.remind(o))}">${ic('wa', 'ic--sm')}תזכורת</a>` : ''}
        ${['paid', 'ready'].includes(o.status) ? `<a class="btn btn--wa btn--sm" target="_blank" rel="noopener" href="${wa(o.phone, T.ready(o))}">${ic('wa', 'ic--sm')}תיאום איסוף</a>` : ''}
        ${o.status === 'collected' ? `<a class="btn btn--wa btn--sm" target="_blank" rel="noopener" href="${wa(o.phone, T.review(o))}">${ic('wa', 'ic--sm')}בקשת ביקורת</a>` : ''}
        <a class="btn btn--line btn--sm" target="_blank" rel="noopener" href="${wa(o.phone)}">${ic('wa', 'ic--sm')}צ׳אט ריק</a>
        ${o.people > 1 ? `<a class="btn btn--line btn--sm" target="_blank" rel="noopener" href="${base}order.html?o=${o.token}">עמוד המעקב</a>` : ''}</div></section>
      ${['paid', 'ready'].includes(o.status) && dadPhone() ? `<section class="panel box"><h3>אבא</h3><p class="hint">הבוט שולח לאבא הודעה לבד כשמסמנים ״שולם״. אם צריך שוב:</p>
        <a class="btn btn--wa btn--sm" target="_blank" rel="noopener" href="${wa(dadPhone(), dadText(o))}">${ic('wa', 'ic--sm')}לשלוח לאבא</a></section>` : ''}
      ${eventsOf(o).length ? `<section class="panel box"><h3>היסטוריה</h3><ol class="tl">${eventsOf(o).map(e =>
        `<li><b>${e.kind === 'new' && o.source === 'whatsapp' && e === eventsOf(o)[0] ? 'נפתחה בבוט' : EV[e.kind] || esc(e.kind)}</b><span>${when(e.at)}${byWhom(e.by_whom) ? ' · ' + esc(byWhom(e.by_whom)) : ''}</span></li>`).join('')}</ol></section>` : ''}
      <form class="panel box" data-note="${o.id}"><h3><label for="an">הערה פנימית (רק אתה רואה)</label></h3>
        <div class="field" style="margin:0"><textarea id="an" name="note" maxlength="1000" placeholder="למשל: יאסוף ביום שלישי, אבא מביא">${esc(o.admin_note || '')}</textarea></div>
        <button class="btn btn--line btn--sm" style="margin-top:8px">שמירת הערה</button></form>
    </div>
    <footer class="drawer__foot">${main}${['pending', 'new', 'paid', 'ready'].includes(o.status) ? `<button class="btn btn--bad" data-st="${o.id}:cancelled">ביטול הזמנה</button>` : ''}</footer></aside>`;
}

const acctDrawer = () => `<div class="scrim" data-close></div><aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="dh">
  <header class="drawer__head"><h2 id="dh" tabindex="-1">החשבון שלי</h2><button class="btn btn--ghost btn--icon" data-close aria-label="סגירה">${ic('x')}</button></header>
  <div class="drawer__body"><dl class="panel kv"><dt>שם משתמש</dt><dd>${esc(userOf(S.me))}</dd><dt>דוא״ל</dt><dd>${esc(S.me)}</dd></dl>
    <form class="panel box" data-settings><h3>הגדרות</h3>
      <label class="field"><span>עלות ערסל ליחידה (₪), לחישוב רווח</span><input name="unit_cost" type="number" inputmode="numeric" min="0" value="${esc(S.settings.unit_cost || '')}"></label>
      <label class="field"><span>הטלפון של אבא (מקבל הודעה על כל תשלום)</span><input name="dad_phone" inputmode="tel" dir="ltr" pattern="05[0-9]{8}" value="${esc(S.settings.dad_phone || '')}"></label>
      <button class="btn btn--main">שמירה</button></form>
    <form class="panel box" data-pw><h3>החלפת סיסמה</h3>${pwFields()}<button class="btn btn--main">שמירת סיסמה</button><p class="msg" role="status"></p></form></div>
  <footer class="drawer__foot"><button class="btn btn--bad" data-logout>יציאה</button></footer></aside>`;

function custDrawer(phone) {
  const os = S.orders.filter(o => o.phone === phone), c = customers().find(x => x.phone === phone) || { name: os[0]?.name || phone, paid: 0 };
  const n = S.notes[phone] || { note: '', tags: [] };
  return `<div class="scrim" data-close></div><aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="dh">
    <header class="drawer__head"><h2 id="dh" tabindex="-1">${esc(c.name)}</h2><button class="btn btn--ghost btn--icon" data-close aria-label="סגירה">${ic('x')}</button></header>
    <div class="drawer__body">
      <dl class="panel kv"><dt>טלפון</dt><dd><a class="num" href="tel:${esc(phone)}">${esc(phone)}</a></dd><dt>שילם בסך הכל</dt><dd class="num">${ils(c.paid)}</dd><dt>הזמנות</dt><dd>${os.length}</dd></dl>
      <div class="tmpl"><a class="btn btn--wa btn--sm" target="_blank" rel="noopener" href="${wa(phone)}">${ic('wa', 'ic--sm')}וואטסאפ</a><a class="btn btn--line btn--sm" href="tel:${esc(phone)}">${ic('phone', 'ic--sm')}שיחה</a></div>
      <form class="panel box" data-cnote="${esc(phone)}"><h3>תגיות</h3><div class="tagset">${TAGS.map(t => `<label class="chip"><input type="checkbox" name="tags" value="${t}"${n.tags.includes(t) ? ' checked' : ''}>${t}</label>`).join('')}</div>
        <h3 style="margin-top:14px"><label for="cn">הערה על הלקוח</label></h3><div class="field" style="margin:0"><textarea id="cn" name="note" maxlength="1000">${esc(n.note || '')}</textarea></div>
        <button class="btn btn--line btn--sm" style="margin-top:8px">שמירה</button></form>
      <section class="panel rows">${os.map(row).join('')}</section>
    </div></aside>`;
}

function rslDrawer(id) {
  const r = S.resellers.find(x => x.id === id); if (!r) return '';
  const os = S.orders.filter(o => o.reseller_id === r.id), pays = S.rpay.filter(p => p.reseller_id === r.id);
  const units = rsOrders(r).reduce((a, o) => a + o.qty, 0), ow = rsOwed(r);
  return `<div class="scrim" data-close></div><aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="dh">
    <header class="drawer__head"><h2 id="dh" tabindex="-1">${esc(r.name)}</h2><button class="btn btn--ghost btn--icon" data-close aria-label="סגירה">${ic('x')}</button></header>
    <div class="drawer__body">
      <dl class="panel kv"><dt>טלפון</dt><dd><a class="num" href="tel:${esc(r.phone)}">${esc(r.phone)}</a></dd>
        <dt>מחיר ליחידה</dt><dd class="num">${ils(r.unit_price)} <small>(${rsOff(r)}% הנחה מ־${ils(C.price)})</small></dd>
        <dt>ערסלים עד היום</dt><dd class="num">${units}</dd><dt>שילמה</dt><dd class="num">${ils(rsPaid(r))}</dd>
        <dt>יתרה</dt><dd class="num" style="color:${ow > 0 ? 'var(--coral-ink)' : 'var(--ok)'}">${ow > 0 ? 'חייבת ' + ils(ow) : ow < 0 ? 'זכות ' + ils(-ow) : 'אין חוב'}</dd></dl>
      <form class="panel box cform" data-rs-pay="${r.id}"><h3>רישום תשלום</h3>
        <label class="field"><span>סכום (₪)</span><input name="amount" type="number" inputmode="numeric" min="1" required value="${ow > 0 ? ow : ''}"></label>
        <label class="field"><span>תאריך</span><input name="day" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label>
        <label class="field"><span>אמצעי</span><select name="method"><option value="transfer">העברה בנקאית</option><option value="bit">ביט</option><option value="paybox">PayBox</option><option value="cash">מזומן</option></select></label>
        <label class="field"><span>מס׳ חשבונית (לא חובה)</span><input name="receipt" maxlength="40" inputmode="numeric"></label>
        <button class="btn btn--main">רישום</button></form>
      ${pays.length ? `<section class="panel"><table class="tbl"><tbody>${pays.map(p => `<tr><td class="num">${day(p.day + 'T12:00:00')}</td><td>${METHOD[p.method] || 'העברה'}</td>
        <td>${p.receipt_no ? 'חשבונית ' + esc(p.receipt_no) : ''}</td><td class="r num">${ils(p.amount)}</td><td class="acts"><button class="btn btn--ghost btn--sm" data-rpdel="${p.id}">מחיקה</button></td></tr>`).join('')}</tbody></table></section>` : ''}
      <form class="panel box cform" data-rs-edit="${r.id}"><h3>פרטים</h3>
        <label class="field"><span>מחיר ליחידה (₪)</span><input name="price" type="number" inputmode="numeric" min="1" max="450" value="${r.unit_price}" required></label>
        <label class="field"><span>הערה</span><input name="note" maxlength="500" value="${esc(r.note || '')}"></label>
        <label class="check"><input type="checkbox" name="active"${r.active ? ' checked' : ''}>פעיל (הבוט מזהה אותו)</label>
        <button class="btn btn--line">שמירה</button></form>
      <section class="panel rows">${os.map(row).join('') || '<p class="empty">עוד אין הזמנות.</p>'}</section>
    </div></aside>`;
}

// quick search from anywhere (Ctrl/⌘ K): views, orders, customers
function paletteBox() {
  const q = S.palq.trim().toLowerCase(), d = q.replace(/\D/g, '');
  const views = Object.entries(VIEWS).filter(([, [l]]) => !q || l.includes(q)).map(([k, [l, i]]) => ({ href: '#' + k, label: l, icon: i, sub: 'מסך' }));
  const os = q ? S.orders.filter(o => o.name.toLowerCase().includes(q) || (d && (String(o.order_no).includes(d) || o.phone.includes(d)))).slice(0, 8)
    .map(o => ({ href: `#orders/${o.order_no}`, label: `Sway ${o.order_no} · ${o.name}`, icon: 'orders', sub: ST[o.status] })) : [];
  S.palHits = [...os, ...views];
  return `<div class="scrim" data-pclose></div><div class="palette" role="dialog" aria-modal="true" aria-label="חיפוש מהיר">
    <label class="search">${ic('search')}<span class="sr">חיפוש</span><input id="pal" placeholder="מספר הזמנה, שם, טלפון או מסך" value="${esc(S.palq)}" autocomplete="off"></label>
    <ul>${S.palHits.map((h, i) => `<li><a href="${h.href}" data-pgo${i === 0 ? ' class="on"' : ''}>${ic(h.icon, 'ic--sm')}<span>${esc(h.label)}</span><small>${esc(h.sub)}</small></a></li>`).join('') || '<li class="empty">לא נמצא</li>'}</ul></div>`;
}

// ---------- render ----------
function route() { const [v, x] = location.hash.slice(1).split('/'); return { v: VIEWS[v] ? v : 'today', x }; }

function render(force) {
  if (!S.me) return;
  const a = document.activeElement;
  // a live update must not wipe what the owner is typing; it shows on the next render
  if (!force && a && app.contains(a) && a.matches('textarea, input:not(#q), select')) return;
  const { v, x } = route();
  const o = x && S.orders.find(k => k.order_no === +x);
  const scroll = $('.drawer__body')?.scrollTop;
  const focusId = a?.id, caret = a?.selectionStart;
  const key = S.palette ? 'pal' : o ? 'o' + o.order_no : S.rsl ? 'r' + S.rsl : S.cust ? 'c' + S.cust : S.acct ? 'acct' : '';
  const n = { today: tasks().length, people: S.reviews.filter(r => r.status === 'pending').length, marketing: S.coupons ? abandoned().filter(x => hours(x.created_at) < 48).length : 0 };
  const links = Object.entries(VIEWS).map(([k, [l, i]]) => `<a href="#${k}"${k === v ? ' aria-current="page"' : ''}>${ic(i)}<span>${l}</span>${n[k] ? `<span class="dot num">${n[k]}</span>` : ''}</a>`).join('');
  const liveTag = `<span class="live${S.live ? ' is-on' : ''}">${S.live ? 'מתעדכן לבד' : 'מתעדכן כל דקה'}</span>`;
  app.innerHTML = `<div class="shell">
    <aside class="rail">${MARK}<nav class="nav" aria-label="ניווט ראשי">${links}</nav>
      <button class="btn btn--line btn--sm kbtn" data-palette>${ic('search', 'ic--sm')}חיפוש מהיר <kbd>⌘K</kbd></button>
      <div class="rail__foot">${liveTag}<button class="linkish" data-acct>${esc(userOf(S.me))} · החשבון</button></div></aside>
    <main class="main"><div class="mtop">${MARK}${liveTag}<button class="btn btn--ghost btn--icon" data-palette aria-label="חיפוש מהיר">${ic('search')}</button><button class="btn btn--ghost btn--icon" data-acct aria-label="החשבון שלי">${ic('user')}</button></div>
      ${{ today: viewToday, orders: viewOrders, money: viewMoney, marketing: viewMarketing, stock: viewStock, people: viewPeople }[v]()}</main>
    <nav class="tabbar" aria-label="ניווט ראשי">${links}</nav></div>
    ${S.palette ? paletteBox() : o ? orderDrawer(o) : S.rsl ? rslDrawer(S.rsl) : S.cust ? custDrawer(S.cust) : S.acct ? acctDrawer() : ''}`;
  document.documentElement.classList.toggle('lock', !!key);
  if (scroll) $('.drawer__body').scrollTop = scroll;
  if (key && key === S.drawer) app.querySelectorAll('.drawer, .scrim').forEach(el => el.classList.add('still'));
  $('.shell').inert = !!key;
  if (focusId && document.getElementById(focusId)) { const el = document.getElementById(focusId); el.focus(); if (caret != null) try { el.setSelectionRange(caret, caret); } catch {} }
  else if (key === 'pal') $('#pal')?.focus();
  else if (key && key !== S.drawer) $('#dh')?.focus();
  S.drawer = key;
  S.flash.clear();
  // the barcode image of a reseller order: a short-lived signed link from the private bucket
  if (o?.label_path && !S.labels[o.label_path]) sb.storage.from('labels').createSignedUrl(o.label_path, 3600)
    .then(({ data }) => { if (data?.signedUrl) { S.labels[o.label_path] = data.signedUrl; render(true); } });
}

// ---------- sign-in ----------
const emailOf = u => { u = u.trim().toLowerCase(); return (C.adminUsers || {})[u] || (u.includes('@') ? u : ''); };
const userOf = e => Object.entries(C.adminUsers || {}).find(([, m]) => m === e)?.[0] || e;
const pwFields = () => `<label class="field"><span>סיסמה חדשה</span><span class="pw"><input name="pw" type="password" minlength="8" required autocomplete="new-password" dir="ltr"><button type="button" data-peek>הצגה</button></span></label>
  <label class="field"><span>שוב, לאימות</span><input name="pw2" type="password" minlength="8" required autocomplete="new-password" dir="ltr"></label>`;

function gate(mode = 'login', msg = '', ok = false) {
  S.me = ''; document.documentElement.classList.remove('lock');
  const note = `<p class="msg ${ok ? 'msg--ok' : 'msg--bad'}" role="status">${esc(msg)}</p>`;
  const forms = {
    login: `<h1>כניסה לניהול</h1><p>ההזמנות, הכסף והמלאי של Sway.</p>
      <form data-login novalidate><label class="field"><span>שם משתמש</span><input name="user" autocomplete="username" autocapitalize="none" spellcheck="false" required dir="ltr"></label>
      <label class="field"><span>סיסמה</span><span class="pw"><input name="pw" type="password" autocomplete="current-password" required dir="ltr"><button type="button" data-peek>הצגה</button></span></label>
      <label class="check"><input type="checkbox" name="keep"${remember() ? ' checked' : ''}>להישאר מחובר במכשיר הזה</label>
      <button class="btn btn--main btn--block">כניסה</button>${note}</form>
      <button class="linkish" data-gate="link">פעם ראשונה, או ששכחתי סיסמה</button>`,
    link: `<h1>בחירת סיסמה</h1><p>נשלח קישור לדוא״ל של המשתמש. פותחים אותו, ובוחרים סיסמה.</p>
      <form data-link><label class="field"><span>שם משתמש</span><input name="user" autocomplete="username" autocapitalize="none" spellcheck="false" required dir="ltr"></label>
      <button class="btn btn--main btn--block">שליחת קישור</button>${note}</form><button class="linkish" data-gate="login">חזרה לכניסה</button>`,
    setpw: `<h1>סיסמה חדשה</h1><p>לפחות 8 תווים. מעכשיו נכנסים עם שם משתמש וסיסמה.</p>
      <form data-setpw>${pwFields()}<button class="btn btn--main btn--block">שמירה וכניסה</button>${note}</form>`
  };
  app.innerHTML = `<div class="gate"><div class="gate__box">${MARK}${forms[mode]}</div></div>`;
  app.querySelector('input')?.focus();
}
const AUTH_ERR = e => /invalid login/i.test(e.message) ? 'שם משתמש או סיסמה לא נכונים.'
  : /rate|too many|security purposes/i.test(e.message) ? 'יותר מדי ניסיונות. לנסות שוב בעוד כמה דקות.'
  : /same|different from the old/i.test(e.message) ? 'זו הסיסמה הקיימת. לבחור אחרת.'
  : /weak|at least/i.test(e.message) ? 'הסיסמה חלשה מדי. לפחות 8 תווים, עדיף עם מספרים.' : 'שגיאה: ' + e.message;
const mask = e => e.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + '•'.repeat(Math.min(b.length, 6)) + c);
const pwCheck = f => f.pw.value.length < 8 ? 'לפחות 8 תווים.' : f.pw.value !== f.pw2.value ? 'הסיסמאות לא זהות.' : '';

let recovering = RECOVERY;
async function enter(session) {
  if (recovering) return gate('setpw');
  if (S.me === session.user.email) return;
  app.innerHTML = `<div class="gate"><div class="gate__box">${MARK}<div class="sk-line"></div><div class="sk-line" style="width:70%"></div></div></div>`;
  const { data: ok, error } = await sb.rpc('is_admin');
  if (error) { app.innerHTML = `<div class="gate"><div class="gate__box">${MARK}<h1>אין חיבור</h1><p>${esc(error.message)}</p><button class="btn btn--main" onclick="location.reload()">לנסות שוב</button></div></div>`; return; }
  if (!ok) { await sb.auth.signOut({ scope: 'local' }); return gate('login', 'למשתמש הזה אין הרשאת ניהול.'); }
  S.me = session.user.email;
  if (/access_token/.test(location.hash)) history.replaceState(null, '', location.pathname + '#today');
  try { await refresh(true); startLive(); } catch (err) { app.innerHTML = `<div class="gate"><div class="gate__box">${MARK}<h1>לא הצלחתי לטעון</h1><p>${esc(err.message)}</p><button class="btn btn--main" onclick="location.reload()">לנסות שוב</button></div></div>`; }
}

let chan, poll, soonT;
function startLive() {
  const soon = () => { clearTimeout(soonT); soonT = setTimeout(() => refresh().catch(() => {}), 400); };
  chan?.unsubscribe();
  chan = sb.channel('sway-admin');
  for (const table of ['orders_v2', 'order_shares', 'inventory']) chan.on('postgres_changes', { event: '*', schema: 'public', table }, soon);
  chan.subscribe(st => { const on = st === 'SUBSCRIBED'; if (on !== S.live) { S.live = on; render(); } });
  clearInterval(poll);
  poll = setInterval(() => document.visibilityState === 'visible' && refresh().catch(() => {}), 60000);
}
document.addEventListener('visibilitychange', () => { if (S.me && document.visibilityState === 'visible') refresh().catch(() => {}); });

sb.auth.onAuthStateChange((evt, session) => {
  // supabase-js: never await other auth calls inside this callback, hence the setTimeout
  if (evt === 'PASSWORD_RECOVERY') { recovering = true; return setTimeout(() => gate('setpw')); }
  if (!session) { chan?.unsubscribe(); clearInterval(poll); return setTimeout(() => gate()); }
  if (evt === 'INITIAL_SESSION' || evt === 'SIGNED_IN') setTimeout(() => enter(session));
});

// ---------- actions ----------
const WHY = m => /bad_transition:(\w+)>(\w+)/.test(m) ? `אי אפשר לעבור מ"${ST[RegExp.$1]}" ל"${ST[RegExp.$2]}".`
  : /changed/.test(m) ? 'ההזמנה השתנתה בינתיים (אולי מהוואטסאפ). רעננתי, לבדוק שוב.' : m;
async function act(btn, fn, okMsg) {
  if (btn) { btn.classList.add('is-busy'); btn.disabled = true; }
  try { await fn(); }
  catch (e) { if (btn) { btn.classList.remove('is-busy'); btn.disabled = false; } toast('לא הצליח: ' + WHY(e.message || String(e)), null, true); return refresh(true).catch(() => {}); }
  if (okMsg) toast(okMsg);
  await refresh(true).catch(() => toast('נשמר, אבל הרענון נכשל. לרענן את הדף.', null, true));
}
const byId = id => S.orders.find(o => o.id === +id);
// only if the order is still in the state this page shows (the bot or a sweep may have moved it)
const setStatus = async (o, status) => {
  const { data } = must(await sb.from('orders_v2').update({ status }).eq('id', o.id).eq('status', o.status).select('id'));
  if (!data.length) throw new Error('changed');
};
const DONE = { paid: 'סומן כשולם', ready: 'מוכן לאיסוף', collected: 'נאסף', cancelled: 'בוטל' };
const told = st => st === 'cancelled' ? '' : '. הלקוח מקבל עדכון בוואטסאפ';

// confirm the money; the database turns the order 'paid' once no share is left (sway_v5 sway_shares_paid).
// A group order confirms only the shares that reported paying.
async function payAll(o, method = 'paybox') {
  let q = sb.from('order_shares').update({ status: 'confirmed', method, confirmed_at: new Date().toISOString() }).eq('order_id', o.id);
  q = o.people > 1 && reported(o) ? q.eq('status', 'reported') : q.neq('status', 'confirmed');
  const { data } = must(await q.select('id'));
  if (!data.length) throw new Error('changed');
}

app.addEventListener('click', async e => {
  if (e.target.closest('[data-pgo]')) { S.palette = false; return; }   // the link's hash change renders
  const b = e.target.closest('button, a[data-ppl], [data-close], [data-pclose]');
  if (!b) return;
  const d = b.dataset;
  if (d.peek != null) { const i = b.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password'; b.textContent = i.type === 'password' ? 'הצגה' : 'הסתרה'; return; }
  if (d.gate) return gate(d.gate);
  if (d.open) { location.hash = `#${route().v}/${d.open}`; return; }
  if (d.close != null) { S.cust = ''; S.rsl = 0; return closeDrawer(); }
  if (d.acct != null) { S.acct = true; S.cust = ''; return render(true); }
  if (d.cust) { S.cust = d.cust; return render(true); }
  if (d.rsl) { S.rsl = +d.rsl; return render(true); }
  if (d.rpdel) { if (!confirm('למחוק את התשלום?')) return; return act(b, async () => must(await sb.from('reseller_payments').delete().eq('id', d.rpdel)), 'התשלום נמחק'); }
  if (d.palette != null) { S.palette = true; S.palq = ''; return render(true); }
  if (d.pclose != null) { S.palette = false; return render(true); }
  if (d.mkt) { S.mkt = d.mkt; return render(true); }
  if (d.clink) {
    const url = `${base}?coupon=${encodeURIComponent(d.clink)}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    return toast('הקישור הועתק: מי שנכנס דרכו מקבל את ההנחה אוטומטית');
  }
  if (d.ctoggle) { const c = S.coupons.find(x => x.code === d.ctoggle); return act(b, async () => must(await sb.from('coupons').update({ active: !c.active }).eq('code', c.code)), c.active ? 'הקופון הושהה' : 'הקופון פעיל'); }
  if (d.cdel) { if (!confirm(`למחוק את הקופון ${d.cdel}?`)) return; return act(b, async () => must(await sb.from('coupons').delete().eq('code', d.cdel)), 'הקופון נמחק'); }
  if (d.xdel) { if (!confirm('למחוק את ההוצאה?')) return; return act(b, async () => must(await sb.from('expenses').delete().eq('id', d.xdel)), 'ההוצאה נמחקה'); }
  if (d.revive) { const o = byId(d.revive); return act(b, () => setStatus(o, 'new'), `Sway ${o.order_no} חזרה, ממתינה לתשלום`); }
  if (d.logout != null) { S.acct = false; await sb.auth.signOut({ scope: 'local' }); return; }
  if (d.mode) { S.mode = d.mode; return render(true); }
  if (d.period) { S.period = d.period; return render(true); }
  if (d.ppl) { S.ppl = d.ppl; if (b.tagName === 'BUTTON') render(true); return; }
  if (d.find) { S.q = d.find; S.mode = 'all'; location.hash = '#orders'; return; }
  if (d.pay) {
    const o = byId(d.pay), part = o.people > 1 && o.order_shares.some(s => s.status === 'waiting');
    return act(b, () => payAll(o, d.via), part ? `אושר ${ils(payLabel(o))} ב־Sway ${o.order_no}. מחכים לשאר המשתתפים` : `Sway ${o.order_no} ${DONE.paid}${told('paid')}`);
  }
  if (d.st) {
    const [id, st] = d.st.split(':'), o = byId(id);
    if (st === 'cancelled' && !confirm(`לבטל את Sway ${o.order_no} של ${o.name}?${paid$(o) ? `\nכבר שולם ${ils(paid$(o))}: צריך להחזיר ללקוח.` : ''}\nהלקוח יקבל הודעה בוואטסאפ.`)) return;
    return act(b, () => setStatus(o, st), `Sway ${o.order_no} ${DONE[st]}${told(st)}`);
  }
  if (d.share) {
    const o = byId(d.order), method = app.querySelector(`[data-method="${d.share}"]`).value;
    return act(b, async () => {
      const { data } = must(await sb.from('order_shares').update({ status: 'confirmed', method, confirmed_at: new Date().toISOString() }).eq('id', d.share).neq('status', 'confirmed').select('id'));
      if (!data.length) throw new Error('changed');
    }, 'התשלום אושר');
  }
  if (d.yesh) {
    const [oid, sid] = d.yesh.split(':'), o = byId(oid), s = o.order_shares.find(x => x.id === +sid);
    window.open('https://user.yeshinvoice.co.il/', '_blank', 'noopener');   // first, while the tap still counts (Safari popups)
    await navigator.clipboard.writeText(receipt(o, s)).catch(() => {});
    return toast('פרטי הקבלה הועתקו. אחרי שמפיקים, לרשום כאן את מספר הקבלה.');
  }
  if (d.rev) { const [id, status] = d.rev.split(':'); return act(b, async () => must(await sb.from('reviews').update({ status }).eq('id', id)), status === 'approved' ? 'הביקורת באתר' : 'הביקורת הוסתרה'); }
  if (d.csv != null) {
    const rows = [['תאריך', 'הזמנה', 'לקוח', 'טלפון', 'אמצעי', 'סכום', 'קבלה'],
      ...payments(S.period).map(x => [new Date(x.t).toLocaleDateString('he-IL'), ref(x.o, x.s), x.o.name, x.o.phone, METHOD[x.s.method] || 'לא צוין', x.s.amount, x.s.receipt_no || ''])];
    const cell = c => { c = String(c); if (/^[=+\-@\t\r]/.test(c)) c = "'" + c; return `"${c.replace(/"/g, '""')}"`; };   // no Excel formulas
    const csv = '\ufeff' + rows.map(r => r.map(cell).join(',')).join('\n');
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `sway-payments-${S.period}.csv` });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
});
document.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) { location.hash = g.dataset.go; $('.toast').hidden = true; } });

app.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, d = f.dataset, btn = f.querySelector('button:not([type=button])');
  const say = (m, ok) => { const p = f.querySelector('.msg'); p.textContent = m; p.className = 'msg ' + (ok ? 'msg--ok' : 'msg--bad'); };
  if (d.login != null) {
    const email = emailOf(f.user.value);
    if (!email || !f.pw.value) return say('למלא שם משתמש וסיסמה.');
    try { localStorage.setItem(REMEMBER, f.keep.checked ? '1' : '0'); } catch {}
    btn.classList.add('is-busy');
    const { error } = await sb.auth.signInWithPassword({ email, password: f.pw.value });
    btn.classList.remove('is-busy');
    if (error) say(AUTH_ERR(error));
    return;
  }
  if (d.link != null) {
    const email = emailOf(f.user.value);
    if (!email) return say('שם המשתמש לא מוכר.');
    btn.classList.add('is-busy');
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: base + 'admin.html' });
    btn.classList.remove('is-busy');
    return error ? say(AUTH_ERR(error)) : say(`נשלח קישור ל־${mask(email)}. לפתוח אותו כאן, במכשיר הזה.`, true);
  }
  if (d.setpw != null || d.pw != null) {
    const bad = pwCheck(f);
    if (bad) return say(bad);
    btn.classList.add('is-busy');
    const { data, error } = await sb.auth.updateUser({ password: f.pw.value });
    btn.classList.remove('is-busy');
    if (error) return say(AUTH_ERR(error));
    if (d.pw != null) { f.reset(); return say('הסיסמה עודכנה.', true); }
    recovering = false;
    history.replaceState(null, '', location.pathname + '#today');
    return enter({ user: data.user });
  }
  if (d.note) return act(btn, async () => must(await sb.from('orders_v2').update({ admin_note: f.note.value.trim() || null }).eq('id', d.note)), 'ההערה נשמרה');
  if (d.couponNew != null) {
    const code = f.code.value.replace(/\s+/g, '').toUpperCase(), value = +f.value.value, kind = f.kind.value;
    if (!/^[A-Z0-9\u0590-\u05FF]{3,20}$/.test(code)) return toast('קוד: 3-20 אותיות או ספרות, בלי רווחים', null, true);
    if (kind === 'pct' && value > 50) return toast('עד 50% הנחה', null, true);
    return act(btn, async () => must(await sb.from('coupons').insert({ code, kind, value, ends_at: f.ends.value ? f.ends.value + 'T23:59:59+03:00' : null,
      max_uses: +f.max.value || null, note: f.note.value.trim() || null })), `הקופון ${code} נוצר`);
  }
  if (d.rsNew != null) {
    const phone = f.phone.value.replace(/\D/g, '').replace(/^972/, '0');
    if (!/^05\d{8}$/.test(phone)) return toast('טלפון בפורמט 05XXXXXXXX', null, true);
    return act(btn, async () => must(await sb.from('resellers').insert({ name: f.name.value.trim(), phone, unit_price: +f.price.value })), 'המשווק נוסף');
  }
  if (d.rsPay) return act(btn, async () => must(await sb.from('reseller_payments').insert({ reseller_id: +d.rsPay, amount: +f.amount.value, day: f.day.value,
    method: f.method.value, receipt_no: f.receipt.value.trim() || null })), 'התשלום נרשם');
  if (d.rsEdit) return act(btn, async () => must(await sb.from('resellers').update({ unit_price: +f.price.value, note: f.note.value.trim() || null, active: f.active.checked }).eq('id', d.rsEdit)), 'נשמר');
  if (d.expense != null) return act(btn, async () => must(await sb.from('expenses').insert({ day: f.day.value, category: f.category.value, amount: +f.amount.value, note: f.note.value.trim() || null })), 'ההוצאה נוספה');
  if (d.settings != null) {
    const dp = f.dad_phone.value.replace(/\D/g, '').replace(/^972/, '0');
    if (dp && !/^05\d{8}$/.test(dp)) return toast('טלפון בפורמט 05XXXXXXXX', null, true);
    return act(btn, async () => must(await sb.from('settings').upsert([{ key: 'unit_cost', value: f.unit_cost.value || null }, { key: 'dad_phone', value: dp || null }])), 'ההגדרות נשמרו');
  }
  if (d.cnote) return act(btn, async () => must(await sb.from('customer_notes').upsert({ phone: d.cnote, note: f.note.value.trim() || null,
    tags: [...f.querySelectorAll('[name=tags]:checked')].map(x => x.value), updated_at: new Date().toISOString() })), 'נשמר');
  if (d.rc) return act(btn, async () => must(await sb.from('order_shares').update({ receipt_no: f.rc.value.trim() || null }).eq('id', d.rc)), 'מספר הקבלה נשמר');
  if (d.count) {
    const k = S.inv.find(x => x.colour === d.count), n = Math.round(+f.n.value);
    if (!(n >= 0)) return;
    return act(btn, async () => must(await sb.rpc('set_stock', { p_colour: k.colour, p_on_hand: n, p_reason: f.reason.value.trim() || null })),
      `${COLOUR[k.colour]}: ${n} במחסן`);
  }
});

app.addEventListener('input', e => {
  if (e.target.id === 'pal') { S.palq = e.target.value; return render(true); }
  if (e.target.id !== 'q') return;
  S.q = e.target.value;
  const pos = e.target.selectionStart;
  render(true);
  const q = $('#q'); q.focus(); q.setSelectionRange(pos, pos);
});
window.addEventListener('hashchange', () => render(true));
// closing replaces the history entry (Back must not reopen it) and returns focus to the order that opened it
function closeDrawer() {
  const { v, x } = route();
  S.acct = false;
  history.replaceState(null, '', '#' + v);
  render(true);
  app.querySelector(`[data-open="${x}"]`)?.focus();
}
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && S.me) { e.preventDefault(); S.palette = !S.palette; S.palq = ''; return render(true); }
  if (S.palette && e.key === 'Enter' && S.palHits?.[0]) { e.preventDefault(); S.palette = false; location.hash = S.palHits[0].href; return; }
  if (e.key === 'Escape' && S.palette) { S.palette = false; return render(true); }
  if (e.key === 'Escape' && (route().x || S.acct || S.cust || S.rsl)) { S.cust = ''; S.rsl = 0; closeDrawer(); }
});
