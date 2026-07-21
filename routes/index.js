/* routes/index.js
   Maps URLs to controller functions.  Add new routes here as the app grows. */

const express         = require("express");
const router          = express.Router();
const bingoController = require("../controllers/bingoController");

// GET /  → render the stamp card page
router.get("/", bingoController.getStampCard);

// GET /api/catalog  → JSON of all CCAs (id, name, logo, accent) — used by
// /test-logos.html for visual inspection.  Dev-only: block in production
// so random visitors can't scrape the CCA list.  Codes/hashes are never
// included even in dev.
router.get("/api/catalog", (req, res, next) => {
    if (process.env.NODE_ENV === "production") return res.status(404).type("text").send("404 · Not Found");
    return bingoController.getCatalog(req, res, next);
});

// POST /api/verify-code  → single-code check.  Body: { boothId, code }.
// Rate-limited by IP.  See controllers/bingoController.js for details.
router.post("/api/verify-code", bingoController.verifyCode);

// POST /api/redeem  → prize redemption.  Body: { prizeId, username, codes }.
// Server verifies each plaintext code against .env and returns an HMAC-
// signed voucher.  This is the anti-cheat gate — client-side localStorage
// tampering can display fake stamps but cannot forge a voucher.
router.post("/api/redeem", bingoController.redeem);

// GET /v?t=<base64url voucher>  → staff-facing verification page.
// Renders green/red HTML confirming the voucher's HMAC signature is
// genuine, so fake vouchers produced via DevTools console fail the check.
router.get("/v", bingoController.verifyVoucher);

module.exports = router;
