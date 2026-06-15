const { booths } = require('../models/booths');
const { prizes } = require('../models/prizes');

exports.getStampCard = (req, res) => {
    const boothCodes = {};
    booths.forEach(b => { boothCodes[b.id] = b.codeHash; });

    const prizeConfig = {};
    prizes.forEach(p => { prizeConfig[p.id] = p.stampsRequired; });

    const mandatoryBooth   = booths.find(b => b.mandatory) || booths[0];
    const mandatoryBoothId = mandatoryBooth.id;

    res.render('index', {
        pageTitle:   'VIVACE 2026 — Stamp Card',
        eventName:   'VIVACE',
        eventYear:   '2026',
        tagline:     'Tap booths · Collect stamps · Win prizes',
        subhead:     '★ SMU CCA FAIR 2026 ★',
        booths,
        prizes,
        totalBooths: booths.length,
        boothCodes,
        prizeConfig,
        mandatoryBoothId,
        mandatoryBoothName: mandatoryBooth.name,
    });
};
