const { simpleHash } = require('../utils/hash');

/*
 * SECURITY NOTE — DO NOT commit plaintext booth codes to this file.
 *
 * Only the mandatory "Vivace's Gamebooth" is defined here (position b0 in
 * the grid).  The other 11 stamp positions are picked at random on the
 * client from the CCA catalog (models/cca-catalog.js).  The Vivace code
 * comes from BOOTH_CODE_B0 in the environment; see README + .env.example.
 */
function boothCode(id) {
    const envKey = 'BOOTH_CODE_' + id.toUpperCase();
    const code   = process.env[envKey];
    if (!code) {
        console.warn(
            '[booths] Missing ' + envKey + ' — booth "' + id +
            '" will use an unguessable random code and be unusable. ' +
            'Set this env var in .env (local) or Vercel dashboard (prod).'
        );
        return 'MISSING-' + id + '-' + Math.random().toString(36).slice(2, 10);
    }
    return code;
}

const booths = [
    {
        id:        'b0',
        name:      "Vivace's Gamebooth",
        logo:      '/images/vivace-logo.png',
        accent:    'var(--yellow)',
        codeHash:  simpleHash(boothCode('b0')),
        mandatory: true,
    },
];

module.exports = { booths };
