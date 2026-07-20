/* =========================================================================
   app.js — Main glue file: wires event handlers and boots the app.
   Reads state via window.Vivace.State and renders via window.Vivace.UI.
   Handlers called from inline onclick="" in HTML are exposed on window.
   ========================================================================= */

(function () {
    var State = window.Vivace.State;
    var UI    = window.Vivace.UI;

    // ---- Cached refs used inside the code-entry modal ----------------
    var $codeModal    = document.getElementById('codeModal');
    var $mName        = document.getElementById('modalCheckpointName');
    var $mIcon        = document.getElementById('modalIcon');
    var $codeInput    = document.getElementById('codeInput');
    var $codeError    = document.getElementById('modalError');
    var $lastFocused  = null;   // element to restore focus to after a modal closes

    // =====================================================================
    // LOGIN — called from onclick="handleLogin()" in login.ejs
    // =====================================================================
    window.handleLogin = function () {
        var input = document.getElementById('loginInput');
        var errEl = document.getElementById('loginError');
        var raw   = input.value.trim();

        if (!raw) { errEl.textContent = 'Please enter your name.'; return; }

        var name = raw.toLowerCase();
        State.load(name);
        State.setActiveUsername(name);
        // Load (or first-time pick) this user's 11 CCAs and paint the slots.
        // Done here — not at boot — so each user gets their own randomized set.
        initCcaSlots(name);

        UI.el.nameDisplay.textContent = raw;
        UI.hideLogin();
        UI.render();
        UI.announce('Welcome, ' + raw + '. You have ' +
            State.visitedBooths.length + ' of ' + TOTAL_BOOTHS + ' stamps.');
    };

    // =====================================================================
    // SWITCH USER — clears state and re-shows the login overlay
    // =====================================================================
    document.getElementById('switchUserBtn').addEventListener('click', function () {
        State.clearActiveUser();
        document.getElementById('loginInput').value       = '';
        document.getElementById('loginError').textContent = '';
        UI.render();
        UI.showLogin();
    });

    // =====================================================================
    // BOOTH CLICK — opens the code-entry modal for a booth
    // Called from onclick="handleBoothClick(this)" on each booth card.
    // =====================================================================
    window.handleBoothClick = function (card) {
        if (State.visitedBooths.indexOf(card.dataset.id) !== -1) return;
        if (card.classList.contains('locked')) {
            UI.toast('Visit "' + MANDATORY_BOOTH_NAME + '" first to unlock all booths.');
            return;
        }
        $lastFocused           = card;
        State.currentBoothId   = card.dataset.id;
        $mName.textContent     = card.dataset.name;
        $mIcon.innerHTML       = '<img src="' + card.dataset.logo +
                                 '" alt="' + card.dataset.name +
                                 '" class="modal-cca-logo">';
        $codeInput.value       = '';
        $codeError.textContent = '';
        $codeModal.style.display = 'flex';
        UI.lockScroll();
        setTimeout(function () { $codeInput.focus(); }, 80);
    };

    function closeCodeModal() {
        $codeModal.style.display = 'none';
        UI.unlockScroll();
        State.currentBoothId = null;
        if ($lastFocused) { $lastFocused.focus(); $lastFocused = null; }
    }

    // Check the entered code against the booth's stored hash
    function verifyCode() {
        if (!State.currentBoothId) return;
        var code = $codeInput.value.trim();
        if (!code) return;

        if (State.hash(code) === BOOTH_CODES[State.currentBoothId]) {
            var boothCard = document.querySelector(
                '.checkpoint-card[data-id="' + State.currentBoothId + '"]');
            var boothName = boothCard ? boothCard.dataset.name : '';
            State.visitedBooths.push(State.currentBoothId);
            State.save();
            UI.render();
            closeCodeModal();
            UI.announce(boothName + ' stamped! ' + State.visitedBooths.length +
                ' of ' + TOTAL_BOOTHS + ' booths visited.');
            if (State.visitedBooths.length === TOTAL_BOOTHS) {
                setTimeout(UI.showCongrats, 500);
            }
        } else {
            $codeError.textContent = 'Incorrect code — try again!';
            $codeInput.value       = '';
            $codeInput.focus();
            UI.announce('Incorrect code. Please try again.');
        }
    }

    // =====================================================================
    // PRIZE CLICK — called from onclick="handlePrizeClick(1)" etc.
    // =====================================================================
    window.handlePrizeClick = function (prizeId) {
        // Already redeemed → re-open the voucher so the user can re-screenshot.
        if (State.redeemedPrizes.indexOf(prizeId) !== -1) {
            UI.showRedemption(prizeId);
            return;
        }
        var needed = PRIZE_CONFIG[prizeId];
        if (State.visitedBooths.length < needed) {
            UI.toast('You need ' + needed + ' stamps (you have ' +
                State.visitedBooths.length + ').');
            return;
        }
        $lastFocused = document.querySelector(
            '.prize-tile[data-prize="' + prizeId + '"]');
        UI.confirm('Redeem Prize ' + prizeId + '? (' + needed + ' stamps required)',
            function () {
                State.redeemedPrizes.push(prizeId);
                State.save();
                UI.render();
                UI.showRedemption(prizeId);
                UI.announce('Prize ' + prizeId + ' successfully redeemed. Please present this voucher at the VIVACE prize counter.');
            });
    };

    // =====================================================================
    // KEYBOARD SUPPORT — booth cards + modal Escape/Tab handling
    // =====================================================================
    function initKeyboard() {
        // Booth cards act like buttons — Enter or Space activates them
        document.querySelectorAll('.checkpoint-card').forEach(function (card) {
            card.setAttribute('role', 'button');
            card.setAttribute('tabindex', '0');
            card.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    window.handleBoothClick(card);
                }
            });
        });

        // Global Escape — closes whichever modal is currently open
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape') return;
            if ($codeModal.style.display === 'flex')             { closeCodeModal();   return; }
            if (UI.el.confirmModal.style.display  === 'flex')    { UI.closeConfirm();  return; }
            if (UI.el.congratsModal.style.display === 'flex')    { UI.closeCongrats();          }
        });

        // Tab traps — keep focus inside each modal while it's open
        $codeModal.addEventListener('keydown',           function (e) { UI.trapTab($codeModal, e); });
        UI.el.confirmModal.addEventListener('keydown',   function (e) { UI.trapTab(UI.el.confirmModal, e); });
        UI.el.overlay.addEventListener('keydown',        function (e) { UI.trapTab(UI.el.overlay, e); });
    }

    // =====================================================================
    // EVENT WIRING — buttons inside the code-entry modal
    // =====================================================================
    document.getElementById('modalConfirmBtn').addEventListener('click', verifyCode);
    document.getElementById('modalCancelBtn').addEventListener('click',  closeCodeModal);
    $codeModal.addEventListener('click', function (e) {
        if (e.target === $codeModal) closeCodeModal();
    });
    $codeInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') verifyCode();
    });
    document.getElementById('loginInput').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') window.handleLogin();
    });

    // =====================================================================
    // LOGO REFINEMENT — runs once per img after it loads.
    //   · Near-square logos get rounded (border-radius: 50% via .is-square)
    //     so they look like proper stamps.  Non-square logos are left
    //     rectangular so nothing is awkwardly clipped.
    //   · Logos that are mostly white/very light (which would vanish on a
    //     white stamp background) flip the enclosing .stamp-circle to a
    //     dark background via .is-light.
    // Same-origin canvas access is used to sample brightness; if it ever
    // throws (e.g. tainted canvas) we silently skip that logo.
    // =====================================================================
    function refineIcon(img) {
        function apply() {
            if (!img.naturalWidth || !img.naturalHeight) return;

            // Aspect: mark near-square transparent logos so CSS can round them.
            var ratio = img.naturalWidth / img.naturalHeight;
            if (ratio > 0.9 && ratio < 1.1) img.classList.add('is-square');

            try {
                var w = Math.min(img.naturalWidth,  40);
                var h = Math.min(img.naturalHeight, 40);
                var cvs = document.createElement('canvas');
                cvs.width = w; cvs.height = h;
                var ctx = cvs.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                var px = ctx.getImageData(0, 0, w, h).data;

                var bright = 0, opaqueCount = 0, brightPx = 0, totalPx = w * h;
                for (var i = 0; i < px.length; i += 4) {
                    if (px[i + 3] > 128) {
                        var b = (px[i] + px[i + 1] + px[i + 2]) / 3;
                        bright += b;
                        opaqueCount++;
                        if (b > 200) brightPx++;
                    }
                }
                var circle = img.closest && img.closest('.stamp-circle');
                if (!circle) return;

                // Mostly opaque = JPG or PNG-with-baked-bg.
                var mostlyOpaque = (opaqueCount / totalPx) >= 0.95;
                if (mostlyOpaque) {
                    // Near-square (aspect 0.80–1.25) → crop to a circular
                    // thumbnail via .is-opaque.  Corner content loss is minimal
                    // for logos in this range because their content is usually
                    // centered with padding around it.
                    if (ratio >= 0.80 && ratio <= 1.25) {
                        img.classList.add('is-opaque');
                        return;
                    }
                    // Wide or tall opaque logo — cover-cropping would slice
                    // off large portions of the design.  Fall back to matching
                    // the stamp background to the image's edge colour so the
                    // rectangle blends into the circle without losing content.
                    var rs = [], gs = [], bs = [];
                    function sample(idx) {
                        if (px[idx + 3] > 128) {
                            rs.push(px[idx]); gs.push(px[idx + 1]); bs.push(px[idx + 2]);
                        }
                    }
                    for (var x2 = 0; x2 < w; x2++) {
                        sample(x2 * 4);
                        sample(((h - 1) * w + x2) * 4);
                    }
                    for (var y2 = 0; y2 < h; y2++) {
                        sample((y2 * w) * 4);
                        sample((y2 * w + w - 1) * 4);
                    }
                    if (rs.length > 0) {
                        var mean = function (a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s / a.length; };
                        var vari = function (a, m) { var s = 0; for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m); return s / a.length; };
                        var mR = mean(rs), mG = mean(gs), mB = mean(bs);
                        var maxVar = Math.max(vari(rs, mR), vari(gs, mG), vari(bs, mB));
                        if (maxVar < 500) {
                            circle.style.background =
                                'rgb(' + Math.round(mR) + ',' + Math.round(mG) + ',' + Math.round(mB) + ')';
                        }
                    }
                    return;
                }

                // Transparent PNG with mostly-white content → dark backdrop.
                // Two catch cases:
                //   (a) meanBrightness > 220 — dense near-white logos.
                //   (b) sparse designs (opaqueRatio < 0.15) where most visible
                //       pixels are bright (>30%): white-text logos meant for a
                //       dark bg (e.g. SMU Ardiente, SMUX XSeed) that (a) misses
                //       because a small colored accent drags the mean down.
                var opaqueRatio = opaqueCount / totalPx;
                var brightFrac  = opaqueCount ? brightPx / opaqueCount : 0;
                var meanBright  = opaqueCount ? bright / opaqueCount   : 0;
                if (opaqueCount > 0 && (
                        meanBright > 220 ||
                        (opaqueRatio < 0.15 && brightFrac > 0.30)
                    )) {
                    circle.classList.add('is-light');
                }
            } catch (e) { /* CORS-tainted / other — skip refinement */ }
        }

        if (img.complete && img.naturalWidth > 0) apply();
        else img.addEventListener('load', apply);
    }

    // =====================================================================
    // CCA SELECTION — pick 11 random CCAs per user, persist per user.
    // Populates the empty .checkpoint-slot cards and .roadmap-dot stubs
    // rendered by the EJS template, and adds each CCA's codeHash to
    // BOOTH_CODES so the code-entry modal can verify against them.
    //
    // Keyed by username so each account gets its own random 11: switching
    // to a fresh name reshuffles; returning to an existing name restores
    // that name's original picks (matched with their saved stamp progress).
    // =====================================================================
    function pickCcaIds() {
        var ids = CCA_CATALOG.map(function (c) { return c.id; });
        // Fisher–Yates
        for (var i = ids.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = ids[i]; ids[i] = ids[j]; ids[j] = tmp;
        }
        return ids.slice(0, CCA_SLOTS);
    }

    function loadOrPickSelection(username) {
        var picked = State.getCcaSelection(username);
        // Guard against corrupted storage or a stale selection referencing
        // CCAs that are no longer in the catalog (e.g., after event pruning).
        var byId = {};
        CCA_CATALOG.forEach(function (c) { byId[c.id] = true; });
        var valid = Array.isArray(picked) && picked.length === CCA_SLOTS &&
                    picked.every(function (id) { return byId[id]; });
        if (!valid) {
            picked = pickCcaIds();
            State.setCcaSelection(username, picked);
        }
        return picked;
    }

    // Strip anything the previous user left on the CCA slots — hash entries,
    // visited/locked classes, logo classes and inline backgrounds set by
    // refineIcon.  Skips the mandatory b0 card and its roadmap dot.
    function resetCcaSlots() {
        Object.keys(BOOTH_CODES).forEach(function (k) {
            if (k[0] === 'c') delete BOOTH_CODES[k];
        });
        document.querySelectorAll('.checkpoint-slot').forEach(function (card) {
            card.classList.remove('visited', 'locked');
            card.removeAttribute('data-id');
            card.removeAttribute('data-name');
            card.removeAttribute('data-logo');
            card.style.removeProperty('--accent');
            var circle = card.querySelector('.stamp-circle');
            if (circle) {
                circle.classList.remove('is-light');
                circle.style.background = '';
            }
            var img = card.querySelector('.checkpoint-icon');
            if (img) img.classList.remove('is-square', 'is-opaque');
        });
        document.querySelectorAll('.roadmap-dot[data-slot]').forEach(function (dot) {
            dot.removeAttribute('data-id');
            dot.classList.remove('visited');
        });
    }

    function initCcaSlots(username) {
        resetCcaSlots();

        var picked = loadOrPickSelection(username);
        var byId   = {};
        CCA_CATALOG.forEach(function (c) { byId[c.id] = c; });

        picked.forEach(function (ccaId, slotIdx) {
            var cca = byId[ccaId];
            if (!cca) return;

            // Extend BOOTH_CODES so verifyCode() can look this hash up.
            BOOTH_CODES[cca.id] = cca.codeHash;

            // Fill the grid stamp card
            var card = document.querySelector('.checkpoint-slot[data-slot="' + slotIdx + '"]');
            if (card) {
                card.dataset.id   = cca.id;
                card.dataset.name = cca.name;
                card.dataset.logo = cca.logo;
                card.style.setProperty('--accent', cca.accent);
                var img  = card.querySelector('.checkpoint-icon');
                var name = card.querySelector('.checkpoint-name');
                if (img)  { img.src = cca.logo; img.alt = cca.name; }
                if (name) { name.textContent = cca.name; }
            }

            // Fill the roadmap dot
            var dot = document.querySelector('.roadmap-dot[data-slot="' + slotIdx + '"]');
            if (dot) dot.dataset.id = cca.id;
        });

        // Refine every logo — square rounding + light-logo backdrop swap.
        // Covers both the freshly-populated CCA slots and the fixed Vivace card.
        document.querySelectorAll('.checkpoint-icon').forEach(refineIcon);
    }

    // =====================================================================
    // BOOT — either show login or restore the saved user
    // =====================================================================
    (function boot() {
        initKeyboard();

        var saved = State.readUsername();
        if (!saved) {
            // No user yet — leave the empty slot stubs alone; initCcaSlots()
            // runs in handleLogin() once we know whose picks to restore.
            // Overlay is visible by default via CSS — just lock scroll & focus input
            UI.lockScroll();
            setTimeout(function () {
                document.getElementById('loginInput').focus();
            }, 80);
            return;
        }

        State.load(saved);
        initCcaSlots(saved);
        UI.el.nameDisplay.textContent = saved;
        UI.hideLogin();
        UI.render();
    })();
})();
