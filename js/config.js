// Store settings. Prices here are for display only - the database (create_order) is the price authority.
window.SWAY = {
  price: 450,
  anchor: 700,               // real previous price (owner sold at ₪700)
  whatsapp: '972526849887',  // orders + confirmations (payments stay on bitPhone)
  bitPhone: '055-2555269',   // the same number takes PayBox and Bit (PayBox first: no fee on receiving)
  payboxLink: '',            // permanent PayBox group link; empty = hide PayBox
  // private Supabase: organization "Sway", project "sway" (not the Cynect work account)
  supabaseUrl: 'https://flrgoetjaeabbesrmodx.supabase.co',
  supabaseKey: 'sb_publishable_JcSDZWOYYAasddb5LtLdAw_r7VZmaIu', // publishable, client-safe
  // self pickup only for now (Ashdod, HaMatechet 21 / Nes Ziona, 2-3 days). Home delivery returns later:
  // js/cities.js + tools/shipping_seed.py + shipping_zones are kept for that.
  groupDiscount: { perUnit: 20, minQty: 3 },
  pairDiscount: 50,          // per 2 hammocks: a pair costs ₪850
  ga4: '',     // Google Analytics 4 measurement ID, e.g. 'G-XXXXXXX' (empty = off)
  pixel: '1125181910079924', // Meta Pixel ID (empty = off)
  adminUsers: { alon: 'alonabd23@gmail.com' },  // admin.html username > sign-in email (access is still is_admin() in the DB)
  maxQty: 10,
  maxGroup: 8,
  minShare: 20
};
