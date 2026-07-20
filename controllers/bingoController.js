/* controllers/bingoController.js
   Business logic for the stamp card page.  Pre-computes boot data and
   renders views/index.ejs. */

const { booths }  = require("../models/booths");
const { prizes }  = require("../models/prizes");
const { catalog } = require("../models/cca-catalog");

// One-per-process asset version.  Appended as ?v=… to /js and /css URLs so
// deploys/restarts invalidate the browser cache instead of serving stale JS
// for up to 1 h (see server.js maxAge).
const ASSET_VERSION = Date.now().toString(36);

// GET /api/catalog  →  full CCA catalog as JSON (used by /test-logos.html)
exports.getCatalog = (_req, res) => {
    res.json(catalog.map(c => ({
        id:     c.id,
        name:   c.name,
        logo:   c.logo,
        accent: c.accent,
    })));
};

// GET /  →  render the full stamp card
exports.getStampCard = (req, res) => {
    // Boot codes for the fixed mandatory booth (Vivace's Gamebooth = b0).
    // Codes for the 86 CCAs live in ccaCatalog and are looked up per user
    // after the client picks its random 11.
    const boothCodes = {};
    booths.forEach(b => { boothCodes[b.id] = b.codeHash; });

    // Client-facing CCA catalog — every CCA's id, name, logo, accent, hash.
    // The client picks 11 random IDs on first visit and stores them in
    // localStorage.  The other 75 CCAs are never rendered into the DOM,
    // so their logo files are never requested from the network.
    const ccaCatalog = catalog.map(c => ({
        id:       c.id,
        name:     c.name,
        logo:     c.logo,
        accent:   c.accent,
        codeHash: c.codeHash,
    }));

    const prizeConfig = {};
    prizes.forEach(p => { prizeConfig[p.id] = p.stampsRequired; });

    const mandatoryBooth = booths.find(b => b.mandatory) || booths[0];

    // Grid is 3×4 = 12 slots.  Vivace occupies slot 1; the other 11 come
    // from the CCA catalog.  Prize thresholds (4/8/12) key off totalBooths.
    const CCA_SLOTS   = 11;
    const totalBooths = booths.length + CCA_SLOTS;

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
        boothCodes,
        prizeConfig,
        mandatoryBoothId:   mandatoryBooth.id,
        mandatoryBoothName: mandatoryBooth.name,
        assetVersion:       ASSET_VERSION,
    });
};
