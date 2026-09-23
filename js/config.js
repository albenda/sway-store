// Store settings. Prices here are for display only - the database (create_order) is the price authority.
window.SWAY = {
  price: 450,
  anchor: 700,               // real previous price (owner sold at ₪700)
  whatsapp: '972526849887',  // orders + confirmations (payments stay on bitPhone)
  bitPhone: '055-2555269',
  payboxLink: '',            // permanent PayBox group link; empty = hide PayBox
  supabaseUrl: 'https://fawifuxyaltvkfkmsuko.supabase.co',
  supabaseKey: 'sb_publishable_fJMqMfcKPaJlxurR6xFohA_2E6NdZpA', // publishable, client-safe
  // shipping by zone (display). null fee = exact price agreed on WhatsApp before payment.
  // North/south wait for courier quotes (pickup: Ashdod). Authority: shipping_zones table.
  shipping: {
    center: { fee: 0, days: '3-5' },
    north: { fee: null, days: '3-5' },
    south: { fee: null, days: '3-5' },
    eilat: { fee: 39, days: '4-7' }
  },
  groupDiscount: { perUnit: 20, minQty: 3 },
  pairDiscount: 50,          // per 2 hammocks: a pair costs ₪850
  ga4: '',     // Google Analytics 4 measurement ID, e.g. 'G-XXXXXXX' (empty = off)
  pixel: '',   // Meta Pixel ID (empty = off)
  maxQty: 10,
  maxGroup: 8,
  minShare: 20
};
