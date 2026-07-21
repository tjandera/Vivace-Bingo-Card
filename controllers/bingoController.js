/* controllers/bingoController.js
   Business logic for the stamp card page + the two anti-cheat API
   endpoints (verify-code, redeem).  Pre-computes boot data and renders
   views/index.ejs. */

const { booths }  = require("../models/booths");
const { prizes }  = require("../models/prizes");
const { catalog } = require("../models/cca-catalog");
const { sign, verify, decodeVoucher } = require("../utils/token");

// One-per-process asset version.  Appended as ?v=… to /js and /css URLs so
// deploys/restarts invalidate the browser cache instead of serving stale JS
// for up to 1 h (see server.js maxAge).
const ASSET_VERSION = Date.now().toString(36);

// -----------------------------------------------------------------------
// Code lookup — the plaintext codes never leave the server.  Given a
// booth id like "b0" or a CCA id like "c34", return the expected code
// from the environment (or undefined if not set).
// -----------------------------------------------------------------------
function expectedCodeFor(id) {
    if (typeof id !== "string") return undefined;
    if (id === "b0") return process.env.BOOTH_CODE_B0;
    const m = id.match(/^c(\d+)$/);
    if (!m) return undefined;
    const n = Number(m[1]);
    if (n < 1 || n > 86) return undefined;
    return process.env["CCA_CODE_" + n];
}

// -----------------------------------------------------------------------
// In-memory sliding-window rate limiter.  Keyed by IP.  Not distributed —
// fine for a single-region Vercel deploy at CCA-fair scale (~1000 users).
// If we scale to multi-region later, swap in Vercel KV.
// -----------------------------------------------------------------------
const rateBuckets = new Map();

function rateLimit(ip, key, limit, windowMs) {
    const now = Date.now();
    const bucketKey = key + "|" + ip;
    const stamps = (rateBuckets.get(bucketKey) || []).filter(t => now - t < windowMs);
    if (stamps.length >= limit) {
        rateBuckets.set(bucketKey, stamps);
        return false;
    }
    stamps.push(now);
    rateBuckets.set(bucketKey, stamps);
    // Opportunistic cleanup to keep the map from growing unbounded.
    if (rateBuckets.size > 5000) {
        for (const [k, arr] of rateBuckets) {
            const kept = arr.filter(t => now - t < windowMs);
            if (kept.length === 0) rateBuckets.delete(k);
            else rateBuckets.set(k, kept);
        }
    }
    return true;
}

function clientIp(req) {
    // Vercel injects x-forwarded-for; fall back to req.ip for local dev.
    const xf = req.headers["x-forwarded-for"];
    if (typeof xf === "string" && xf.length) return xf.split(",")[0].trim();
    return req.ip || "unknown";
}

// -----------------------------------------------------------------------
// GET /api/catalog  →  full CCA catalog as JSON (used by /test-logos.html)
// -----------------------------------------------------------------------
exports.getCatalog = (_req, res) => {
    res.json(catalog.map(c => ({
        id:     c.id,
        name:   c.name,
        logo:   c.logo,
        accent: c.accent,
    })));
};

// -----------------------------------------------------------------------
// GET /  →  render the full stamp card
// -----------------------------------------------------------------------
exports.getStampCard = (req, res) => {
    // Client-facing CCA catalog — no codeHash, no boothCodes.  Server-side
    // verification means the plaintext codes and their hashes never need to
    // leave the server, closing the offline brute-force exploit.
    const ccaCatalog = catalog.map(c => ({
        id:     c.id,
        name:   c.name,
        logo:   c.logo,
        accent: c.accent,
    }));

    const prizeConfig = {};
    prizes.forEach(p => { prizeConfig[p.id] = p.stampsRequired; });

    const mandatoryBooth = booths.find(b => b.mandatory) || booths[0];

    // Grid is 3×4 = 12 slots.  Vivace occupies slot 1; the other 11 come
    // from the CCA catalog.  Prize thresholds (4/8/12) key off totalBooths.
    const CCA_SLOTS   = 11;
    const totalBooths = booths.length + CCA_SLOTS;

    // The HTML is identical for every visitor — per-user state lives in
    // localStorage and gets applied client-side.  Let Vercel's edge cache
    // absorb the CCA-fair peak instead of cold-starting the function each
    // hit.  stale-while-revalidate keeps things snappy across the 60 s
    // boundary.
    res.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");

    res.render("index", {
        pageTitle:          "VIVACE 2026 — Stamp Card",
        eventName:          "VIVACE",
        eventYear:          "2026",
        tagline:            "Tap booths · Collect stamps · Win prizes",
        subhead:            "★ SMU CCA FAIR 2026 ★",
        booths,
        prizes,
        totalBooths,
        ccaSlots:           CCA_SLOTS,
        ccaCatalog,
        prizeConfig,
        mandatoryBoothId:   mandatoryBooth.id,
        mandatoryBoothName: mandatoryBooth.name,
        assetVersion:       ASSET_VERSION,
    });
};

// -----------------------------------------------------------------------
// POST /api/verify-code  →  { ok: true } or { ok: false }
// Body: { boothId: "b0"|"c<n>", code: "ABC123" }
// -----------------------------------------------------------------------
exports.verifyCode = (req, res) => {
    const ip = clientIp(req);
    if (!rateLimit(ip, "verify", 30, 60_000)) {
        return res.status(429).json({ ok: false, error: "rate_limit" });
    }
    const { boothId, code } = req.body || {};
    if (typeof boothId !== "string" || typeof code !== "string" || !code) {
        return res.status(400).json({ ok: false, error: "bad_request" });
    }
    const expected = expectedCodeFor(boothId);
    if (!expected) {
        // Unknown booth id or missing env var — treat as wrong code, don't
        // leak which of the two it was.
        return res.json({ ok: false });
    }
    if (code.trim() === expected) {
        return res.json({ ok: true, boothId });
    }
    return res.json({ ok: false });
};

// -----------------------------------------------------------------------
// POST /api/redeem  →  { ok: true, voucher: {…} } or 4xx
// Body: { prizeId: 1|2|3, username, codes: { boothId: code, … } }
// Verifies every submitted code against .env.  Any mismatch → 403 with the
// first failing boothId.  All good → signed voucher.
// -----------------------------------------------------------------------
exports.redeem = (req, res) => {
    const ip = clientIp(req);
    if (!rateLimit(ip, "redeem", 5, 60_000)) {
        return res.status(429).json({ ok: false, error: "rate_limit" });
    }

    const { prizeId, username, codes } = req.body || {};
    if (!Number.isInteger(prizeId) || !prizes.find(p => p.id === prizeId)) {
        return res.status(400).json({ ok: false, error: "bad_prize" });
    }
    if (typeof username !== "string" || !username || username.length > 60) {
        return res.status(400).json({ ok: false, error: "bad_username" });
    }
    if (!codes || typeof codes !== "object" || Array.isArray(codes)) {
        return res.status(400).json({ ok: false, error: "bad_codes" });
    }

    const boothIds = Object.keys(codes);
    if (boothIds.length > 12) {
        return res.status(400).json({ ok: false, error: "too_many_codes" });
    }

    const prize = prizes.find(p => p.id === prizeId);
    if (boothIds.length < prize.stampsRequired) {
        return res.status(403).json({ ok: false, error: "not_enough_stamps" });
    }

    // The mandatory START HERE booth must always be in the submitted set.
    const mandatoryId = (booths.find(b => b.mandatory) || booths[0]).id;
    if (!boothIds.includes(mandatoryId)) {
        return res.status(403).json({ ok: false, error: "missing_start_here" });
    }

    // Verify every code.  Reject on the first mismatch.
    for (const id of boothIds) {
        const submitted = codes[id];
        const expected  = expectedCodeFor(id);
        if (typeof submitted !== "string" || !expected || submitted.trim() !== expected) {
            return res.status(403).json({ ok: false, error: "bad_code", failedBooth: id });
        }
    }

    // All good — sign a short-lived voucher.  `exp` is inside the HMAC so
    // an attacker can't extend it on the client.  Booth staff visually
    // check the countdown on the user's screen; if the countdown reads
    // 00:00 or the user's page shows "expired", refuse the redemption and
    // ask them to tap Refresh.  TTL is env-tunable — default 15 min.
    const ttlMin = Number(process.env.VIVACE_VOUCHER_TTL_MIN) || 15;
    const now    = new Date();
    const payload = {
        prizeId,
        username:   username.trim().slice(0, 60),
        issuedAt:   now.toISOString(),
        exp:        new Date(now.getTime() + ttlMin * 60_000).toISOString(),
        stampCount: boothIds.length,
    };
    const sig = sign(payload);
    return res.json({ ok: true, voucher: { ...payload, sig } });
};

// -----------------------------------------------------------------------
// GET /v?t=<base64url voucher>  →  staff-facing verification page.
// Closes the two DevTools bypasses (fake voucher via UI.showRedemption,
// intercepted /api/redeem response).  An attacker can display anything
// on the user's phone, but the /v page only shows GREEN VALID when the
// HMAC signature checks out against VIVACE_VOUCHER_SECRET.
//
// Staff briefing: "Only accept prizes when this page shows a GREEN
// VALID banner AND the browser address bar reads vivace-bingo-card.
// vercel.app.  Anything else — refuse."
// -----------------------------------------------------------------------
function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({
        "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;",
    }[ch]));
}

function relativeAge(iso) {
    const diffMs = Date.now() - new Date(iso).getTime();
    const abs = Math.abs(diffMs);
    const mins = Math.round(abs / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + " min " + (diffMs < 0 ? "from now" : "ago");
    const hrs = Math.round(mins / 60);
    return hrs + " h " + (diffMs < 0 ? "from now" : "ago");
}

function renderVerifyPage(state, voucher, message) {
    // state: 'valid' | 'expired' | 'invalid' | 'malformed'
    const palette = {
        valid:     { bg: "#15803d", accent: "#bbf7d0", tag: "VALID",     icon: "&check;" },
        expired:   { bg: "#b45309", accent: "#fed7aa", tag: "EXPIRED",   icon: "!" },
        invalid:   { bg: "#b91c1c", accent: "#fecaca", tag: "INVALID",   tagPrefix: "&times; ", icon: "&times;" },
        malformed: { bg: "#b91c1c", accent: "#fecaca", tag: "MALFORMED", icon: "&times;" },
    }[state] || { bg: "#404040", accent: "#e5e5e5", tag: "UNKNOWN", icon: "?" };

    const noStore = "public, max-age=0, must-revalidate";
    const prize   = voucher && prizes.find(p => p.id === voucher.prizeId);
    const details = voucher ? `
        <div class="row"><span>Prize</span><b>${escapeHtml(prize ? prize.label : "Prize " + voucher.prizeId)}</b></div>
        <div class="row"><span>User</span><b>${escapeHtml(voucher.username || "—")}</b></div>
        <div class="row"><span>Issued</span><b>${escapeHtml(relativeAge(voucher.issuedAt))}</b></div>
        <div class="row"><span>Stamps</span><b>${escapeHtml(String(voucher.stampCount || "—"))}</b></div>
        <div class="row"><span>Sig</span><b class="mono">${escapeHtml(String(voucher.sig || "").slice(0,16))}…</b></div>
    ` : "";

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Voucher verification — VIVACE 2026</title>
<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html,body { height: 100%; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: ${palette.bg}; color: #fff; display: flex; flex-direction: column; }
    .banner { flex: 0 0 auto; padding: 40px 24px 32px; text-align: center; }
    .icon   { font-size: 96px; line-height: 1; margin-bottom: 8px; }
    .tag    { font-size: 44px; font-weight: 900; letter-spacing: .05em; text-transform: uppercase; }
    .msg    { margin-top: 12px; font-size: 16px; opacity: .95; }
    .card   { flex: 1 1 auto; background: #fff; color: #111; padding: 24px 20px; border-radius: 24px 24px 0 0; margin-top: 8px; }
    .card h2 { font-size: 14px; color: #555; letter-spacing: .1em; text-transform: uppercase; margin-bottom: 12px; }
    .row    { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #eee; font-size: 15px; }
    .row:last-child { border-bottom: none; }
    .row span { color: #666; }
    .row b { color: #111; text-align: right; }
    .mono   { font-family: "SFMono-Regular", Menlo, Consolas, monospace; font-size: 12px; }
    .brief  { margin-top: 20px; padding: 14px 16px; background: ${palette.accent}; color: #111; border-radius: 12px; font-size: 13px; line-height: 1.5; }
    .brief b { color: ${palette.bg}; }
    .footer { text-align: center; font-size: 11px; color: #999; margin-top: 24px; padding-bottom: 20px; }
</style>
</head>
<body>
    <div class="banner">
        <div class="icon">${palette.icon}</div>
        <div class="tag">${palette.tag}</div>
        <div class="msg">${escapeHtml(message || "")}</div>
    </div>
    <div class="card">
        ${voucher ? `<h2>Voucher details</h2>${details}` : ""}
        <div class="brief">
            ${state === "valid"
                ? `<b>Hand over the prize.</b> Cross the user's name off the paper list for this prize so it can't be redeemed twice.`
                : `<b>Do not hand over the prize.</b> Ask the user to tap Prize again in the app to retry.`}
        </div>
        <div class="footer">VIVACE 2026 · vivace-bingo-card.vercel.app/v · staff-only</div>
    </div>
</body>
</html>`;
}

exports.verifyVoucher = (req, res) => {
    res.set("Cache-Control", "public, max-age=0, must-revalidate");
    res.set("X-Robots-Tag", "noindex");
    const token = req.query.t;
    if (!token || typeof token !== "string") {
        return res.status(400).send(renderVerifyPage("malformed", null,
            "No token supplied.  Ask the user to reopen the voucher and try again."));
    }
    const voucher = decodeVoucher(token);
    if (!voucher || typeof voucher !== "object" || !voucher.sig) {
        return res.status(400).send(renderVerifyPage("malformed", null,
            "Token could not be read.  This is not a valid voucher."));
    }
    const { sig, ...payload } = voucher;
    if (!verify(payload, sig)) {
        // Log so we can spot forgery attempts in Vercel logs.
        console.warn("[verify] forged voucher: username=" + JSON.stringify(payload.username) +
                     " prizeId=" + payload.prizeId + " ip=" + clientIp(req));
        return res.status(200).send(renderVerifyPage("invalid", null,
            "This voucher's signature does not match.  It may have been forged or tampered with in the browser.  Refuse the prize."));
    }
    if (voucher.exp && new Date(voucher.exp).getTime() < Date.now()) {
        return res.status(200).send(renderVerifyPage("expired", voucher,
            "This voucher has expired.  Ask the user to tap the Refresh button in their app."));
    }
    return res.status(200).send(renderVerifyPage("valid", voucher,
        "Signature checks out.  Voucher was issued by the server."));
};
