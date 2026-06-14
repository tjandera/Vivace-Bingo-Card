const { simpleHash } = require('../utils/hash');

const booths = [
    { id: 'b1', name: 'SMU Badminton',      icon: '🏸', accent: 'var(--red)',    codeHash: simpleHash('1121') },
    { id: 'b2', name: 'SMU Truly Malaysia', icon: '🇲🇾', accent: 'var(--blue)',   codeHash: simpleHash('1963') },
    { id: 'b3', name: 'SMUX Skating',       icon: '🛼', accent: 'var(--cyan)',   codeHash: simpleHash('0345') },
    { id: 'b4', name: 'SMUSAIC',            icon: '📷', accent: 'var(--purple)', codeHash: simpleHash('4000') },
    { id: 'b5', name: 'EYE Investment',     icon: '📈', accent: 'var(--green)',  codeHash: simpleHash('8080') },
    { id: 'b6', name: 'SMU Civil Defence',  icon: '🚑', accent: 'var(--orange)', codeHash: simpleHash('1777') },
    { id: 'b7', name: 'Wine Appreciation',  icon: '🍷', accent: 'var(--pink)',   codeHash: simpleHash('1945') },
    { id: 'b8', name: 'TBC',               icon: '❓', accent: 'var(--yellow)', codeHash: simpleHash('0000') },
    { id: 'b9', name: 'TBC',               icon: '❓', accent: 'var(--mint)',   codeHash: simpleHash('0000') },
];

module.exports = { booths };
