/* =========================================================================
   state.js — Pure data layer. No DOM access here.
   Handles: user name, visited booths, redeemed prizes, localStorage I/O,
            and the client-side hash that matches utils/hash.js on the server.
   Exposed as window.Vivace.State so other modules can read/write it.
   ========================================================================= */

(function () {
    // Namespace shared across all client modules
    window.Vivace = window.Vivace || {};

    // ---- localStorage keys ---------------------------------------------
    // We namespace everything under `vivace_` so we don't collide with other
    // apps that might be sharing localStorage on the same origin.
    var USERNAME_KEY = 'vivace_username';
    function visitedKey(u)  { return 'vivace_' + u + '_visited'; }
    function redeemedKey(u) { return 'vivace_' + u + '_redeemed'; }

    // ---- Client-side hash ----------------------------------------------
    // Must produce the SAME output as utils/hash.js on the server.
    // Booth codes are shipped to the browser as hashes so plain codes
    // are never visible in the page source.
    function hash(str) {
        var h = 0;
        for (var i = 0; i < str.length; i++) {
            h = ((h << 5) - h) + str.charCodeAt(i);
            h |= 0;
        }
        return h.toString();
    }

    // ---- The public state object --------------------------------------
    var State = {
        USERNAME_KEY:    USERNAME_KEY,

        currentUsername: null,
        visitedBooths:   [],   // array of booth IDs like "b0", "b1", …
        redeemedPrizes:  [],   // array of numeric prize IDs
        currentBoothId:  null, // booth currently open in the code-entry modal

        hash: hash,

        // Read the saved username without loading it as active
        readUsername: function () {
            return localStorage.getItem(USERNAME_KEY);
        },

        // Load a user's saved progress into memory
        load: function (username) {
            try {
                var v = JSON.parse(localStorage.getItem(visitedKey(username)))  || [];
                var r = JSON.parse(localStorage.getItem(redeemedKey(username))) || [];
                this.currentUsername = username;
                this.visitedBooths   = v;
                this.redeemedPrizes  = r;
            } catch (e) {
                this.currentUsername = username;
                this.visitedBooths   = [];
                this.redeemedPrizes  = [];
            }
        },

        // Persist current progress back to localStorage
        save: function () {
            if (!this.currentUsername) return;
            localStorage.setItem(visitedKey(this.currentUsername),  JSON.stringify(this.visitedBooths));
            localStorage.setItem(redeemedKey(this.currentUsername), JSON.stringify(this.redeemedPrizes));
        },

        // Remember this username as the active one across page reloads
        setActiveUsername: function (username) {
            localStorage.setItem(USERNAME_KEY, username);
        },

        // Wipe active-user pointer + in-memory state (called by "Switch user")
        clearActiveUser: function () {
            localStorage.removeItem(USERNAME_KEY);
            this.currentUsername = null;
            this.visitedBooths   = [];
            this.redeemedPrizes  = [];
        },
    };

    window.Vivace.State = State;
})();
