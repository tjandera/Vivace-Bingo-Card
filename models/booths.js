const { simpleHash } = require('../utils/hash');

const booths = [
    {
        id:       'b1',
        name:     'SMU Cru',
        logo:     '/images/smu-cru.png',
        accent:   'var(--orange)',
        codeHash: simpleHash('grace'),
    },
    {
        id:       'b2',
        name:     'SMU Dragon Boat',
        logo:     '/images/smu-dragon-boat.png',
        accent:   'var(--blue)',
        codeHash: simpleHash('paddle'),
    },
    {
        id:       'b3',
        name:     'SMU Economics Intelligence Club',
        logo:     '/images/smu-eic.png',
        accent:   'var(--green)',
        codeHash: simpleHash('alpha'),
    },
    {
        id:       'b4',
        name:     'SMU Handball',
        logo:     '/images/smu-handball.png',
        accent:   'var(--red)',
        codeHash: simpleHash('spike'),
    },
    {
        id:       'b5',
        name:     'SMU ICON',
        logo:     '/images/smu-icon.png',
        accent:   'var(--cyan)',
        codeHash: simpleHash('connect'),
    },
    {
        id:       'b6',
        name:     'SMU OMS',
        logo:     '/images/smu-oms.png',
        accent:   'var(--purple)',
        codeHash: simpleHash('tempo'),
    },
    {
        id:       'b7',
        name:     'SMU Softball',
        logo:     '/images/smu-softball.png',
        accent:   'var(--yellow)',
        codeHash: simpleHash('diamond'),
    },
    {
        id:       'b8',
        name:     'SMU Stageit',
        logo:     '/images/smu-stageit.png',
        accent:   'var(--pink)',
        codeHash: simpleHash('curtain'),
    },
    {
        id:       'b9',
        name:     'SMU Sustainable Investment Club',
        logo:     '/images/smu-sic.png',
        accent:   'var(--mint)',
        codeHash: simpleHash('impact'),
    },
];

module.exports = { booths };
