const { simpleHash } = require('../utils/hash');

/*
 * SECURITY NOTE — DO NOT commit plaintext booth codes to this file.
 *
 * The codes are read from environment variables at boot time and only
 * their hashes are ever sent to the browser.  Set the values below in:
 *   · Local dev:    a .env file at repo root (see .env.example)
 *   · Vercel:       Project Settings → Environment Variables
 *
 * If an env var is missing, that booth is assigned an unguessable random
 * code and a loud warning is printed to the server log so you notice.
 * This prevents accidentally deploying with empty/blank codes.
 *
 * To change which booth must be visited first, move `mandatory: true`
 * to a different booth.
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
        // Random per-boot so nobody can enter anything to unlock it.
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
    {
        id:       'b1',
        name:     'SMU Cru',
        logo:     '/images/smu-cru.png',
        accent:   'var(--orange)',
        codeHash: simpleHash(boothCode('b1')),
    },
    {
        id:       'b2',
        name:     'SMU Dragon Boat',
        logo:     '/images/smu-dragon-boat.png',
        accent:   'var(--blue)',
        codeHash: simpleHash(boothCode('b2')),
    },
    {
        id:       'b3',
        name:     'SMU Economics Intelligence Club',
        logo:     '/images/smu-eic.png',
        accent:   'var(--green)',
        codeHash: simpleHash(boothCode('b3')),
    },
    {
        id:       'b4',
        name:     'SMU Handball',
        logo:     '/images/smu-handball.png',
        accent:   'var(--red)',
        codeHash: simpleHash(boothCode('b4')),
    },
    {
        id:       'b5',
        name:     'SMU ICON',
        logo:     '/images/smu-icon.png',
        accent:   'var(--cyan)',
        codeHash: simpleHash(boothCode('b5')),
    },
    {
        id:       'b6',
        name:     'SMU OMS',
        logo:     '/images/smu-oms.png',
        accent:   'var(--purple)',
        codeHash: simpleHash(boothCode('b6')),
    },
    {
        id:       'b7',
        name:     'SMU Softball',
        logo:     '/images/smu-softball.png',
        accent:   'var(--yellow)',
        codeHash: simpleHash(boothCode('b7')),
    },
    {
        id:       'b8',
        name:     'SMU Stageit',
        logo:     '/images/smu-stageit.png',
        accent:   'var(--pink)',
        codeHash: simpleHash(boothCode('b8')),
    },
    {
        id:       'b9',
        name:     'SMU Sustainable Investment Club',
        logo:     '/images/smu-sic.png',
        accent:   'var(--mint)',
        codeHash: simpleHash(boothCode('b9')),
    },
    {
        id:       'b10',
        name:     'Booth 10',
        logo:     '/images/vivace-logo.png',
        accent:   'var(--orange)',
        codeHash: simpleHash(boothCode('b10')),
    },
    {
        id:       'b11',
        name:     'Booth 11',
        logo:     '/images/vivace-logo.png',
        accent:   'var(--blue)',
        codeHash: simpleHash(boothCode('b11')),
    },
];

module.exports = { booths };
