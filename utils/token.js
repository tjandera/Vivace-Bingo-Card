/* utils/token.js
   HMAC-SHA256 sign & verify helpers for prize vouchers.

   A voucher is a plain object like:
     { prizeId, username, issuedAt, stampCount }
   We sign it by JSON-stringifying (with sorted keys for determinism) and
   HMAC-ing with process.env.VIVACE_VOUCHER_SECRET.  The returned voucher
   includes the signature so booth staff (or a future scanner) can verify
   it wasn't forged. */

const crypto = require("crypto");

function requireSecret() {
    const s = process.env.VIVACE_VOUCHER_SECRET;
    if (!s || s.length < 32) {
        throw new Error(
            "VIVACE_VOUCHER_SECRET missing or too short (need ≥32 chars). " +
            "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
        );
    }
    return s;
}

// Deterministic JSON: sort keys so the same payload always produces the
// same string (and thus the same signature) regardless of insertion order.
function canonical(payload) {
    const keys = Object.keys(payload).sort();
    const obj  = {};
    for (const k of keys) obj[k] = payload[k];
    return JSON.stringify(obj);
}

function sign(payload) {
    const mac = crypto.createHmac("sha256", requireSecret());
    mac.update(canonical(payload));
    return mac.digest("hex");
}

function verify(payload, sig) {
    const expected = sign(payload);
    // Constant-time compare to avoid timing side-channels.
    const a = Buffer.from(sig,      "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

// Base64url encode/decode a voucher object (payload + sig) for use as a
// URL query param — safe for staff to open in their phone browser.
function encodeVoucher(voucher) {
    return Buffer.from(JSON.stringify(voucher)).toString("base64url");
}
function decodeVoucher(token) {
    if (typeof token !== "string" || token.length === 0 || token.length > 2048) return null;
    try {
        return JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
    } catch (e) { return null; }
}

module.exports = { sign, verify, requireSecret, encodeVoucher, decodeVoucher };
