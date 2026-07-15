/* controllers/bingoController.js
   Business logic for the stamp card page.  Reads the booth + prize models,
   pre-computes helpful lookups, and renders views/index.ejs. */

const { booths } = require("../models/booths");
const { prizes } = require("../models/prizes");

// GET /  →  render the full stamp card
exports.getStampCard = (req, res) => {
    // { b0: hash, b1: hash, ... } — passed to the browser as safe hashes
    const boothCodes = {};
    booths.forEach(b => { boothCodes[b.id] = b.codeHash; });

    // { "1": 3, "2": 6, "3": 9 } — prize id → stamps needed
    const prizeConfig = {};
    prizes.forEach(p => { prizeConfig[p.id] = p.stampsRequired; });

    // Which booth must be visited first (fallback to first booth if none flagged)
    const mandatoryBooth = booths.find(b => b.mandatory) || booths[0];

    res.render("index", {
        pageTitle:          "VIVACE 2026 — Stamp Card",
        eventName:          "VIVACE",
        eventYear:          "2026",
        tagline:            "Tap booths · Collect stamps · Win prizes",
        subhead:            "★ SMU CCA FAIR 2026 ★",
        booths,
        prizes,
        totalBooths:        booths.length,
        boothCodes,
        prizeConfig,
        mandatoryBoothId:   mandatoryBooth.id,
        mandatoryBoothName: mandatoryBooth.name,
    });
};
