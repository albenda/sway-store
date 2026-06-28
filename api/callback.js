// Sway store — PayPlus server-to-server callback.
// PayPlus POSTs transaction results here after payment.
// v1: acknowledge receipt. To harden, verify the 'hash' header with your
// PAYPLUS_SECRET_KEY over the raw body, then record the paid order / notify yourself.
export default async function handler(req, res) {
  // Example hardening (uncomment + adapt when ready):
  // const crypto = await import('crypto');
  // const raw = JSON.stringify(req.body);
  // const expected = crypto.createHmac('sha256', process.env.PAYPLUS_SECRET_KEY).update(raw).digest('base64');
  // if (req.headers['hash'] !== expected) return res.status(401).json({ ok:false });
  res.status(200).json({ received: true });
}
