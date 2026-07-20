/* controllers/bingoController.js
   Business logic for the stamp card page + the two anti-cheat API
   endpoints (verify-code, redeem).  Pre-computes boot data and renders
   views/index.ejs. */

const { booths }  = require("../models/booths");
const { prizes }  = require("../models/prizes");
const { catalog } = require("../models/cca-catalog");
const { sign }    = require("../utils/token");

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
