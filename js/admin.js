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
const PICK = { ashdod: 'אשדוד', nesziona: 'נס ציונה' };
const METHOD = { paybox: 'PayBox', bit: 'ביט', transfer: 'העברה', cash: 'מזומן', other: 'אחר' };
const COLOUR = { blue: 'כחול ים', brown: 'חום חול' };
const VIEWS = { today: ['היום', 'today'], orders: ['הזמנות', 'orders'], money: ['כסף', 'money'], stock: ['מלאי', 'stock'], people: ['לקוחות', 'people'] };

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
const S = { orders: [], reviews: [], inv: null, log: [], me: '', q: '', mode: 'board', period: 'month', ppl: 'customers', acct: false, live: false, flash: new Set() };
const must = r => { if (r.error) throw r.error; return r; };

let seq = 0, snap = '';
async function load() {
  const my = ++seq;
  const [o, r, i, l] = await Promise.all([
    sb.from('orders_v2').select('*, order_shares(*)').order('created_at', { ascending: false }).limit(1000),
    sb.from('reviews').select('*, orders_v2(order_no)').order('created_at', { ascending: false }).limit(200),
    sb.from('inventory').select('*').order('colour'),
    sb.from('inventory_log').select('*').order('at', { ascending: false }).limit(30)
  ]);
  must(o);
  if (my !== seq) return null;                  // a newer load already landed
  const next = JSON.stringify([o.data, r.data, i.data, l.data]);
  if (next === snap) return null;               // nothing changed: no re-render, no lost taps
  snap = next;
  const before = S.orders;
  S.orders = o.data; S.reviews = r.data || []; S.inv = i.error ? null : i.data; S.log = l.data || [];
  return before;
}

// toasts for what happened while the page was open (new confirmed orders, "I paid" reports)
function announce(before) {
  if (!before.length) return;
  const old = new Map(before.map(o => [o.id, o]));
  for (const o of S.orders) {
    const p = old.get(o.id);
    if (o.status === 'new' && (!p || p.status === 'pending')) toast(`הזמנה חדשה: Sway ${o.order_no}, ${o.name}`, o.order_no);
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
    if (o.status === 'paid') add(1, 'orders', o, o.pickup === 'nesziona' ? 'להביא לנס ציונה' : 'להכין לאיסוף באשדוד',
      `Sway ${o.order_no} · ${esc(o.name)} · ${sw(o)}${items(o)}${o.pickup === 'nesziona' ? ' · לתאם עם אבא, 2-3 ימים' : ''}`,
      `<button class="btn btn--main btn--sm" data-st="${o.id}:ready">מוכן לאיסוף</button>${open(o)}`);
    if (o.status === 'ready') add(0, 'pin', o, `מחכה לאיסוף ב${PICK[o.pickup] || 'נקודת האיסוף'}`, `Sway ${o.order_no} · ${esc(o.name)} · ${esc(o.phone)}`,
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
  const month = payments('month').reduce((a, x) => a + x.s.amount, 0);
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
    <span class="oc__name">${esc(o.name)}</span>
    <span class="oc__meta"><span>${sw(o)}${items(o)}</span><span class="oc__amt num">${ils(o.amount)}</span>${o.pickup ? `<span>${PICK[o.pickup]}</span>` : ''}${o.source === 'whatsapp' ? '<span>מהבוט</span>' : ''}</span>
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
  const rev = pays.reduce((a, x) => a + x.s.amount, 0);
  const paidOrders = [...new Set(pays.map(x => x.o))];
  const units = paidOrders.reduce((a, o) => a + blue(o) + brown(o), 0);
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
      <div class="panel kpi kpi--main"><span>הכנסות</span><b class="num">${ils(rev)}</b><small>${pays.length} תשלומים</small></div>
      <div class="panel kpi"><span>ערסלים שנמכרו</span><b class="num">${units}</b><small>${paidOrders.length} הזמנות</small></div>
      <div class="panel kpi"><span>ממוצע להזמנה</span><b class="num">${ils(paidOrders.length ? rev / paidOrders.length : 0)}</b><small>אחרי הנחות</small></div>
      <div class="panel kpi"><span>ממתין לתשלום</span><b class="num">${ils(waiting.reduce((a, o) => a + due(o), 0))}</b><small>${waiting.length} הזמנות פתוחות</small></div>
    </section>
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
        || '<tr><td colspan="6" class="empty">אין תשלומים בתקופה הזו.</td></tr>'}</tbody></table></div></section>`;
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
    if (o.status === 'pending') continue;
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
  if (S.ppl === 'reviews') {
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
    body = `<div class="panel">${list.map(c => `<div class="cust"><span><b>${esc(c.name)}</b><small class="num">${esc(c.phone)}</small></span>
      <span>${c.orders} ${c.orders === 1 ? 'הזמנה' : 'הזמנות'}${c.paid ? ` · שילם <span class="num">${ils(c.paid)}</span>` : ''}</span><span class="num">${day(c.last)}</span>
      <span class="cust__do"><a class="btn btn--wa btn--sm btn--icon" target="_blank" rel="noopener" href="${wa(c.phone)}" aria-label="וואטסאפ ל${esc(c.name)}">${ic('wa', 'ic--sm')}</a>
        <a class="btn btn--line btn--sm btn--icon" href="tel:${esc(c.phone)}" aria-label="שיחה ל${esc(c.name)}">${ic('phone', 'ic--sm')}</a>
        <button class="btn btn--line btn--sm" data-find="${esc(c.phone)}">הזמנות</button></span></div>`).join('')
      || '<p class="empty"><b>לא נמצאו לקוחות</b></p>'}</div>`;
  }
  return top('לקוחות', `${customers().length} לקוחות`, S.ppl !== 'reviews') +
    chips('ppl', [['customers', 'לקוחות'], ['reviews', 'ביקורות', pend || null]], S.ppl) + `<div class="sec">${body}</div>`;
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
        <dt>סכום</dt><dd class="num">${ils(o.amount)}${o.discount ? ` <small>(הנחה ${ils(o.discount)})</small>` : ''}</dd>
        <dt>איסוף</dt><dd>${o.pickup ? PICK[o.pickup] + (o.pickup === 'nesziona' && ['new', 'paid'].includes(o.status) ? ' · לתאם עם אבא' : '') : esc(`${o.address || ''}, ${o.city || ''}`)}</dd>
        <dt>נפתחה</dt><dd>${when(o.created_at)} · ${o.source === 'whatsapp' ? 'בוט וואטסאפ' : 'אתר'}${o.people > 1 ? ` · קנייה משותפת ל־${o.people}` : ''}</dd></dl>
      ${o.is_gift ? `<div class="note">מתנה ל${esc(o.recipient_name)} · <a class="num" href="tel:${esc(o.recipient_phone)}">${esc(o.recipient_phone)}</a>${o.gift_note ? `<br>פתק: “${esc(o.gift_note)}”` : ''}</div>` : ''}
      ${o.notes ? `<div class="note">הערת הלקוח: ${esc(o.notes)}</div>` : ''}
      <section class="panel box"><h3>תשלום</h3>${shareBox}</section>
      <section class="panel box"><h3>הודעה ללקוח</h3><div class="tmpl">
        ${o.status === 'new' ? `<a class="btn btn--wa btn--sm" target="_blank" rel="noopener" href="${wa(o.phone, T.pay(o))}">${ic('wa', 'ic--sm')}פרטי תשלום</a>
          <a class="btn btn--wa btn--sm" target="_blank" rel="noopener" href="${wa(o.phone, T.remind(o))}">${ic('wa', 'ic--sm')}תזכורת</a>` : ''}
        ${['paid', 'ready'].includes(o.status) ? `<a class="btn btn--wa btn--sm" target="_blank" rel="noopener" href="${wa(o.phone, T.ready(o))}">${ic('wa', 'ic--sm')}תיאום איסוף</a>` : ''}
        ${o.status === 'collected' ? `<a class="btn btn--wa btn--sm" target="_blank" rel="noopener" href="${wa(o.phone, T.review(o))}">${ic('wa', 'ic--sm')}בקשת ביקורת</a>` : ''}
        <a class="btn btn--line btn--sm" target="_blank" rel="noopener" href="${wa(o.phone)}">${ic('wa', 'ic--sm')}צ׳אט ריק</a>
        ${o.people > 1 ? `<a class="btn btn--line btn--sm" target="_blank" rel="noopener" href="${base}order.html?o=${o.token}">עמוד המעקב</a>` : ''}</div></section>
      <form class="panel box" data-note="${o.id}"><h3><label for="an">הערה פנימית (רק אתה רואה)</label></h3>
        <div class="field" style="margin:0"><textarea id="an" name="note" maxlength="1000" placeholder="למשל: יאסוף ביום שלישי, אבא מביא">${esc(o.admin_note || '')}</textarea></div>
        <button class="btn btn--line btn--sm" style="margin-top:8px">שמירת הערה</button></form>
    </div>
    <footer class="drawer__foot">${main}${['pending', 'new', 'paid', 'ready'].includes(o.status) ? `<button class="btn btn--bad" data-st="${o.id}:cancelled">ביטול הזמנה</button>` : ''}</footer></aside>`;
}

const acctDrawer = () => `<div class="scrim" data-close></div><aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="dh">
  <header class="drawer__head"><h2 id="dh" tabindex="-1">החשבון שלי</h2><button class="btn btn--ghost btn--icon" data-close aria-label="סגירה">${ic('x')}</button></header>
  <div class="drawer__body"><dl class="panel kv"><dt>שם משתמש</dt><dd>${esc(userOf(S.me))}</dd><dt>דוא״ל</dt><dd>${esc(S.me)}</dd></dl>
    <form class="panel box" data-pw><h3>החלפת סיסמה</h3>${pwFields()}<button class="btn btn--main">שמירת סיסמה</button><p class="msg" role="status"></p></form></div>
  <footer class="drawer__foot"><button class="btn btn--bad" data-logout>יציאה</button></footer></aside>`;

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
  const key = o ? 'o' + o.order_no : S.acct ? 'acct' : '';
  const n = { today: tasks().length, people: S.reviews.filter(r => r.status === 'pending').length };
  const links = Object.entries(VIEWS).map(([k, [l, i]]) => `<a href="#${k}"${k === v ? ' aria-current="page"' : ''}>${ic(i)}<span>${l}</span>${n[k] ? `<span class="dot num">${n[k]}</span>` : ''}</a>`).join('');
  const liveTag = `<span class="live${S.live ? ' is-on' : ''}">${S.live ? 'מתעדכן לבד' : 'מתעדכן כל דקה'}</span>`;
  app.innerHTML = `<div class="shell">
    <aside class="rail">${MARK}<nav class="nav" aria-label="ניווט ראשי">${links}</nav>
      <div class="rail__foot">${liveTag}<button class="linkish" data-acct>${esc(userOf(S.me))} · החשבון</button></div></aside>
    <main class="main"><div class="mtop">${MARK}${liveTag}<button class="btn btn--ghost btn--icon" data-acct aria-label="החשבון שלי">${ic('user')}</button></div>
      ${{ today: viewToday, orders: viewOrders, money: viewMoney, stock: viewStock, people: viewPeople }[v]()}</main>
    <nav class="tabbar" aria-label="ניווט ראשי">${links}</nav></div>
    ${o ? orderDrawer(o) : S.acct ? acctDrawer() : ''}`;
  document.documentElement.classList.toggle('lock', !!(o || S.acct));
  if (scroll) $('.drawer__body').scrollTop = scroll;
  if (key && key === S.drawer) app.querySelectorAll('.drawer, .scrim').forEach(el => el.classList.add('still'));
  $('.shell').inert = !!key;
  if (focusId && document.getElementById(focusId)) { const el = document.getElementById(focusId); el.focus(); if (caret != null) try { el.setSelectionRange(caret, caret); } catch {} }
  else if (key && key !== S.drawer) $('#dh')?.focus();
  S.drawer = key;
  S.flash.clear();
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
  const b = e.target.closest('button, a[data-ppl], [data-close]');
  if (!b) return;
  const d = b.dataset;
  if (d.peek != null) { const i = b.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password'; b.textContent = i.type === 'password' ? 'הצגה' : 'הסתרה'; return; }
  if (d.gate) return gate(d.gate);
  if (d.open) { location.hash = `#${route().v}/${d.open}`; return; }
  if (d.close != null) return closeDrawer();
  if (d.acct != null) { S.acct = true; return render(true); }
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
  if (d.rc) return act(btn, async () => must(await sb.from('order_shares').update({ receipt_no: f.rc.value.trim() || null }).eq('id', d.rc)), 'מספר הקבלה נשמר');
  if (d.count) {
    const k = S.inv.find(x => x.colour === d.count), n = Math.round(+f.n.value);
    if (!(n >= 0)) return;
    return act(btn, async () => must(await sb.rpc('set_stock', { p_colour: k.colour, p_on_hand: n, p_reason: f.reason.value.trim() || null })),
      `${COLOUR[k.colour]}: ${n} במחסן`);
  }
});

app.addEventListener('input', e => {
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
document.addEventListener('keydown', e => { if (e.key === 'Escape' && (route().x || S.acct)) closeDrawer(); });
