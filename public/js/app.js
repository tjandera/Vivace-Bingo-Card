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

    // Check the entered code by asking the server (POST /api/verify-code).
    // The plaintext codes never leave .env on the server, so an attacker
    // with DevTools cannot enumerate them from the client bundle.
    // On success we cache the plaintext locally — it gets re-submitted
    // when the user redeems a prize so the server can re-verify.
    var _verifyInFlight = false;
    function verifyCode() {
        if (_verifyInFlight) return;
        if (!State.currentBoothId) return;
        var code    = $codeInput.value.trim();
        if (!code) return;
        var boothId = State.currentBoothId;

        _verifyInFlight = true;
        $codeError.textContent = 'Checking…';

        fetch('/api/verify-code', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ boothId: boothId, code: code }),
        })
        .then(function (r) {
            if (r.status === 429) {
                return r.json().then(function () {
                    throw new Error('rate_limit');
                });
            }
            return r.json();
        })
        .then(function (data) {
            _verifyInFlight = false;
            if (data && data.ok) {
                // Guard against double-stamps if the modal is spammed
                if (State.visitedBooths.indexOf(boothId) === -1) {
                    State.visitedBooths.push(boothId);
                }
                State.setCode(boothId, code);
                State.save();

                var boothCard = document.querySelector(
                    '.checkpoint-card[data-id="' + boothId + '"]');
                var boothName = boothCard ? boothCard.dataset.name : '';

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
        })
        .catch(function (err) {
            _verifyInFlight = false;
            if (err && err.message === 'rate_limit') {
                $codeError.textContent = 'Too many attempts — slow down and try again in a minute.';
            } else {
                $codeError.textContent = 'No connection — check your signal and try again.';
            }
            $codeInput.focus();
        });
    }

    // =====================================================================
    // PRIZE CLICK — called from onclick="handlePrizeClick(1)" etc.
    // =====================================================================
    // Cache the server-signed voucher for each redeemed prize so the user
    // can re-open it without hitting the server again.  Keyed by prizeId.
    var _voucherCache = {};

    function voucherIsFresh(v) {
        if (!v || !v.exp) return true;   // no exp field → treat as fresh (legacy)
        return Date.parse(v.exp) > Date.now();
    }

    window.handlePrizeClick = function (prizeId) {
        // Already redeemed → re-open the cached voucher, or re-issue a
        // fresh one if the cached voucher has expired.
        if (State.redeemedPrizes.indexOf(prizeId) !== -1) {
            var cached = _voucherCache[prizeId];
            if (cached && voucherIsFresh(cached)) {
                UI.showRedemption(cached);
            } else {
                // Expired or missing → re-POST /api/redeem to mint a new
                // short-lived voucher.  Uses the same stored codes; server
                // re-verifies them, so this is safe.
                redeemOnServer(prizeId);
            }
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
                // Two-step: acknowledge intent (confirm), then require the
                // user to press Redeem Now in front of staff at the counter.
                // This is what prevents screenshot-based sharing beyond the
                // 15-min TTL — the button press is witnessed live.
                UI.showAtBooth(function () { redeemOnServer(prizeId); });
            });
    };

    // Wire up the "Refresh voucher" button inside the redemption modal.
    // It re-uses handlePrizeClick, which sees the prize is redeemed but
    // notices the cached voucher is stale → re-POSTs and shows the new one.
    document.addEventListener('DOMContentLoaded', function () {
        var $refresh = document.getElementById('voucherRefreshBtn');
        if (!$refresh) return;
        $refresh.addEventListener('click', function () {
            // Find whichever prize's voucher is currently on screen
            var refText = document.getElementById('voucherRef').textContent || '';
            var m = refText.match(/VVC-P(\d+)-/);
            if (m) window.handlePrizeClick(Number(m[1]));
        });
    });

    // POST every stored plaintext code to /api/redeem.  Server re-verifies
    // against .env and only signs a voucher if every code matches.  This is
    // the anti-cheat gate — an attacker who tampered visitedBooths in
    // DevTools has no valid codes to submit, so redemption fails.
    var _redeemInFlight = false;
    function redeemOnServer(prizeId) {
        if (_redeemInFlight) return;
        _redeemInFlight = true;

        fetch('/api/redeem', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
                prizeId:  prizeId,
                username: State.currentUsername || '',
                codes:    State.enteredCodes || {},
            }),
        })
        .then(function (r) { return r.json().then(function (d) { d._status = r.status; return d; }); })
        .then(function (data) {
            _redeemInFlight = false;
            if (data._status === 200 && data.ok && data.voucher) {
                if (State.redeemedPrizes.indexOf(prizeId) === -1) {
                    State.redeemedPrizes.push(prizeId);
                }
                State.save();
                _voucherCache[prizeId] = data.voucher;
                UI.render();
                UI.showRedemption(data.voucher);
                UI.announce('Prize ' + prizeId + ' successfully redeemed. ' +
                    'Please present this voucher at the VIVACE prize counter.');
                return;
            }
            if (data._status === 403 && data.error === 'bad_code') {
                UI.toast("Some stamps couldn't be verified — please re-collect the codes from those booths.", 5000);
                return;
            }
            if (data._status === 403 && data.error === 'not_enough_stamps') {
                UI.toast('You do not have enough stamps for this prize.');
                return;
            }
            if (data._status === 403 && data.error === 'missing_start_here') {
                UI.toast('Visit "' + MANDATORY_BOOTH_NAME + '" first — its code must be part of every redemption.', 5000);
                return;
            }
            if (data._status === 429) {
                UI.toast('Too many redemption attempts — try again in a minute.');
                return;
            }
            UI.toast('Could not redeem — please try again.');
        })
        .catch(function () {
            _redeemInFlight = false;
            UI.toast('Offline — reconnect and try again.', 5000);
        });
    }

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
            var atBooth = document.getElementById('atBoothModal');
            if ($codeModal.style.display === 'flex')             { closeCodeModal();   return; }
            if (atBooth && atBooth.style.display === 'flex')     { UI.closeAtBooth();  return; }
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

    // Given the pixel buffer of a logo, predict whether cover-cropping it
    // into the circular stamp will clip visible content.  For each pixel,
    // work out (a) whether it survives the object-fit: cover center-crop
    // and (b) whether it survives the circular mask, then count "lost"
    // pixels that differ from the background (real content).
    //
    // Threshold `lostContent <= 10` is tuned for a 160×160 buffer.  Confirmed
    // catches: EYE Investment ('INVESTMENT' bottom text), Smart City ('Smart'
    // left edge), Uni-Y ('UNIVERSITY-YMCA' bottom text), Ivory Keys ('SMU
    // IVORY KEYS' bottom text), Chamber Choir ('cho…' right cut), Mentoring
    // /Dhamma Circle (Sanskrit tags), Fencing ('SMU FENCING EST 2005'
    // bottom).  Preserves centered-content logos (Purple, Kendo, Cru,
    // Netball, Trekking, …) as opaque-crop.
    function edgesAreCleanFromBuffer(px, W, H) {
        function bAt(x, y) { var i = (y*W + x)*4; return (px[i]+px[i+1]+px[i+2])/3; }
        var corners = [bAt(0,0), bAt(W-1,0), bAt(0,H-1), bAt(W-1,H-1)].sort(function(a,b){return a-b;});
        var bg = (corners[1] + corners[2]) / 2;
        var CONTENT_DELTA = 40;

        // Largest centered square that fits in the source (== what cover-crop
        // retains for a square target).  For landscape: horizontal margins;
        // for portrait: vertical margins.  The circle then inscribes that.
        var short = Math.min(W, H);
        var cropX0 = Math.floor((W - short) / 2);
        var cropY0 = Math.floor((H - short) / 2);
        var cx = cropX0 + short / 2;
        var cy = cropY0 + short / 2;
        var r  = short / 2;
        var r2 = r * r;

        var lostContent = 0;
        for (var y = 0; y < H; y++) {
            for (var x = 0; x < W; x++) {
                var i = (y*W + x) * 4;
                var b = (px[i] + px[i+1] + px[i+2]) / 3;
                if (Math.abs(b - bg) <= CONTENT_DELTA) continue;
                if (x < cropX0 || x >= cropX0 + short ||
                    y < cropY0 || y >= cropY0 + short) { lostContent++; continue; }
                var dx = x - cx, dy = y - cy;
                if (dx*dx + dy*dy > r2) lostContent++;
            }
        }
        return lostContent <= 10;
    }

    function refineIcon(img) {
        function apply() {
            if (!img.naturalWidth || !img.naturalHeight) return;

            // Aspect: mark near-square transparent logos so CSS can round them.
            var ratio = img.naturalWidth / img.naturalHeight;
            if (ratio > 0.9 && ratio < 1.1) img.classList.add('is-square');

            try {
                // Only opaque logos in the near-square aspect range are
                // candidates for the cover-crop edge check; those need the
                // 160×160 buffer to keep edgesAreCleanFromBuffer accurate.
                // For everything else the cheap 40×40 sample is enough.
                var needsEdgeCheck = ratio >= 0.80 && ratio <= 1.25;
                var W = needsEdgeCheck ? Math.min(img.naturalWidth,  160)
                                       : Math.min(img.naturalWidth,   40);
                var H = needsEdgeCheck ? Math.min(img.naturalHeight, 160)
                                       : Math.min(img.naturalHeight,  40);
                var cvs = document.createElement('canvas');
                cvs.width = W; cvs.height = H;
                var ctx = cvs.getContext('2d');
                ctx.drawImage(img, 0, 0, W, H);
                var px = ctx.getImageData(0, 0, W, H).data;

                var bright = 0, opaqueCount = 0, brightPx = 0, totalPx = W * H;
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
                    // Near-square opaque → cover-crop to a circular thumbnail
                    // unless the edge simulation says content would be clipped
                    // (EYE Investment, Uni-Y, Ivory Keys, Fencing, …).  Reuses
                    // the same pixel buffer we already drew for brightness.
                    if (needsEdgeCheck && edgesAreCleanFromBuffer(px, W, H)) {
                        img.classList.add('is-opaque');
                        return;
                    }
                    // Wide/tall or edge-heavy opaque logo — fall back to
                    // matching the stamp background to the image's edge colour
                    // so the rectangle blends into the circle without losing
                    // content.
                    var rs = [], gs = [], bs = [];
                    function sample(idx) {
                        if (px[idx + 3] > 128) {
                            rs.push(px[idx]); gs.push(px[idx + 1]); bs.push(px[idx + 2]);
                        }
                    }
                    for (var x2 = 0; x2 < W; x2++) {
                        sample(x2 * 4);
                        sample(((H - 1) * W + x2) * 4);
                    }
                    for (var y2 = 0; y2 < H; y2++) {
                        sample((y2 * W) * 4);
                        sample((y2 * W + W - 1) * 4);
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
    // rendered by the EJS template.  Code verification is server-side now,
    // so we no longer need to seed BOOTH_CODES with per-CCA hashes.
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

    // Strip anything the previous user left on the CCA slots — visited/locked
    // classes, logo classes and inline backgrounds set by refineIcon.  Skips
    // the mandatory b0 card and its roadmap dot.
    function resetCcaSlots() {
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

        // Refresh UI's cached stamp NodeLists.  The slot elements themselves
        // are stable, so the initial bind at ui.js load still works — but
        // this keeps things robust if we ever start recreating slot nodes.
        UI.rebindStamps();
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
