/*
 * models/cca-catalog.js — server-side CCA catalog.
 *
 * 86 CCAs sourced offline from the interest-form spreadsheet.  Their names
 * and logo paths live in cca-catalog-data.js (auto-generated, safe to
 * commit).  Codes come from CCA_CODE_1..CCA_CODE_86 env vars at boot; only
 * the resulting hashes are ever shipped to the browser.
 *
 * Each request ships the full catalog to the client, which picks 11 IDs at
 * random on first visit and stores them in localStorage.  The other 75
 * CCAs are never rendered into the DOM, so their logo files are never
 * fetched by the browser — that's how the "load only 11 logos" property
 * is achieved without needing per-user server sessions.
 */
const { ccas: catalogData } = require('./cca-catalog-data');
const { simpleHash }        = require('../utils/hash');

// Cyclic palette so any random 11 CCAs have visible variety in accent rings.
const ACCENTS = [
    'var(--yellow)', 'var(--orange)', 'var(--blue)',  'var(--green)',
    'var(--red)',    'var(--cyan)',   'var(--purple)','var(--pink)',
    'var(--mint)',
];

function ccaCode(id) {
    const key = 'CCA_CODE_' + id;
    const code = process.env[key];
    if (!code) {
        console.warn('[cca-catalog] Missing ' + key + ' — CCA ' + id +
            ' will use an unguessable random code and be unusable. ' +
            'Set this env var in .env (local) or Vercel (prod).');
        return 'MISSING-CCA-' + id + '-' + Math.random().toString(36).slice(2, 10);
    }
    return code;
}

const catalog = catalogData.map(c => ({
    // Client-facing id: "c1", "c2", … — distinct from the mandatory "b0"
    id:       'c' + c.id,
    name:     c.name,
    cluster:  c.cluster,
    logo:     c.logo,
    accent:   ACCENTS[(c.id - 1) % ACCENTS.length],
    codeHash: simpleHash(ccaCode(c.id)),
}));

module.exports = { catalog };
