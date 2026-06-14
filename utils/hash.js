// Matches the client-side hash in public/js/bingo.js — never change one without the other.
// Used to store booth codes as hashes so plain codes are never sent to the browser.
function simpleHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h) + str.charCodeAt(i);
        h |= 0;
    }
    return h.toString();
}

module.exports = { simpleHash };
