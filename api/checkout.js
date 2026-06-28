// Sway store — checkout via Yesh Invoice / morning (Green Invoice).
// Creates a hosted payment form that CLEARS the card AND issues a legal
// invoice/receipt automatically, then redirects the customer to pay.
//
// Env vars (set in Vercel; get them from the API & WEBHOOK module → manage API keys):
//   GREENINVOICE_KEY_ID, GREENINVOICE_KEY_SECRET
//   GREENINVOICE_BASE (optional) — prod: https://api.greeninvoice.co.il/api/v1
//                                  sandbox: https://sandbox.d.greeninvoice.co.il/api/v1
//
// Docs: https://www.greeninvoice.co.il/api-docs/  (morning by Green Invoice)

const UNIT_PRICE = 450; // ₪ per hammock (server-side source of truth)
const COLORS = { blue: "כחול", brown: "חום" };

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  const { GREENINVOICE_KEY_ID, GREENINVOICE_KEY_SECRET } = process.env;
  if (!GREENINVOICE_KEY_ID || !GREENINVOICE_KEY_SECRET) {
    res.status(500).json({ error: "Yesh Invoice API keys missing. Set them in Vercel." });
    return;
  }
  const base = process.env.GREENINVOICE_BASE || "https://api.greeninvoice.co.il/api/v1";

  // input (never trust client for price)
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const color = COLORS[body?.color] ? body.color : "blue";
  let qty = parseInt(body?.qty, 10);
  if (!Number.isFinite(qty) || qty < 1) qty = 1;
  if (qty > 10) qty = 10;
  const amount = UNIT_PRICE * qty;
  const origin = `https://${req.headers.host}`;

  try {
    // 1) get JWT token from API key id + secret
    const tokenRes = await fetch(`${base}/account/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: GREENINVOICE_KEY_ID, secret: GREENINVOICE_KEY_SECRET }),
    });
    const tokenData = await tokenRes.json();
    const token = tokenData?.token;
    if (!token) { res.status(502).json({ error: "Auth failed", details: tokenData }); return; }

    // 2) create a payment form (clears card + issues invoice/receipt)
    const formRes = await fetch(`${base}/payments/form`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        description: `הזמנת ערסל Sway (${COLORS[color]}) × ${qty}`,
        type: 320,              // חשבונית מס/קבלה (tax invoice + receipt) on success
        lang: "he",
        currency: "ILS",
        vatType: 0,
        amount,
        maxPayments: 1,
        group: 100,
        income: [{
          description: `ערסל Sway · צבע ${COLORS[color]}`,
          quantity: qty,
          price: UNIT_PRICE,
          currency: "ILS",
          vatType: 0,
        }],
        remarks: `צבע: ${COLORS[color]}`,
        successUrl: `${origin}/success.html`,
        failureUrl: `${origin}/cancel.html`,
        notifyUrl: `${origin}/api/callback`,
      }),
    });
    const formData = await formRes.json();
    const url = formData?.url;
    if (!url) { res.status(502).json({ error: "No payment URL returned", details: formData }); return; }
    res.status(200).json({ url });
  } catch (e) {
    res.status(502).json({ error: "Yesh Invoice request failed", message: String(e) });
  }
}
