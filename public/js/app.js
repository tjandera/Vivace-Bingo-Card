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

        State.load(raw.toLowerCase());
        State.setActiveUsername(raw.toLowerCase());

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
        if (State.redeemedPrizes.indexOf(prizeId) !== -1) {
            UI.toast('Already redeemed!'); return;
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
                UI.toast('Prize redeemed! Head to the prize counter.');
                UI.announce('Prize ' + prizeId + ' successfully redeemed!');
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
    // BOOT — either show login or restore the saved user
    // =====================================================================
    (function boot() {
        initKeyboard();

        var saved = State.readUsername();
        if (!saved) {
            // Overlay is visible by default via CSS — just lock scroll & focus input
            UI.lockScroll();
            setTimeout(function () {
                document.getElementById('loginInput').focus();
            }, 80);
            return;
        }

        State.load(saved);
        UI.el.nameDisplay.textContent = saved;
        UI.hideLogin();
        UI.render();
    })();
})();
