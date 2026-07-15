/* =========================================================================
   ui.js — All DOM rendering and reusable UI helpers.
   Handles: scroll lock, screen-reader announcer, toast, confirm dialog,
            focus trap, updateUI (booth/prize/progress redraw), login overlay,
            confetti, and congrats modal.
   Exposed as window.Vivace.UI.  Depends on window.Vivace.State (state.js).
   ========================================================================= */

(function () {
    window.Vivace = window.Vivace || {};
    var State = window.Vivace.State;   // shortcut

    // ---- Cached DOM references (grabbed once at load) ------------------
    var $fill        = document.getElementById('progressFill');
    var $bar         = document.getElementById('progressBar');
    var $count       = document.getElementById('progressCount');
    var $nameDisp    = document.getElementById('nameDisplay');
    var $overlay     = document.getElementById('loginOverlay');
    var $confirm     = document.getElementById('confirmModal');
    var $congrats    = document.getElementById('congratsModal');
    var $liveRegion  = document.getElementById('liveAnnounce');

    // ---- SCROLL LOCK ---------------------------------------------------
    // When a modal opens, prevent the page beneath from scrolling.
    // iOS Safari needs position:fixed + preserved scroll position or the
    // page bounces / jumps to the top.
    function lockScroll() {
        var scrollY = window.scrollY || window.pageYOffset;
        document.documentElement.style.setProperty('--scroll-y', '-' + scrollY + 'px');
        document.body.classList.add('modal-open');
    }

    function unlockScroll() {
        var scrollY = document.body.style.top
            || document.documentElement.style.getPropertyValue('--scroll-y')
            || '0';
        document.body.classList.remove('modal-open');
        document.documentElement.style.removeProperty('--scroll-y');
        window.scrollTo(0, -parseInt(scrollY, 10) || 0);
    }

    // ---- SCREEN READER ANNOUNCER --------------------------------------
    // Writes to a hidden aria-live region so screen readers speak the message.
    function announce(message) {
        $liveRegion.textContent = '';
        // Brief timeout lets readers pick up the cleared → re-set transition.
        setTimeout(function () { $liveRegion.textContent = message; }, 60);
    }

    // ---- TOAST ---------------------------------------------------------
    function toast(message, duration) {
        duration = duration || 3000;
        var el = document.getElementById('toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(el._timer);
        el._timer = setTimeout(function () { el.classList.remove('show'); }, duration);
        announce(message);
    }

    // ---- FOCUS TRAP ----------------------------------------------------
    // Keeps Tab / Shift+Tab cycling inside the given container while a
    // modal is open (WCAG 2.4.3 focus order).
    function trapTab(container, e) {
        if (e.key !== 'Tab') return;
        var focusable = container.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), [tabindex="0"]:not([disabled])'
        );
        if (!focusable.length) return;
        var first = focusable[0];
        var last  = focusable[focusable.length - 1];
        if (e.shiftKey) {
            if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
            if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
        }
    }

    // ---- CONFIRM MODAL -------------------------------------------------
    // Custom replacement for window.confirm() so we control the look.
    var _confirmCallback = null;

    function confirm(message, onOk) {
        _confirmCallback = onOk;
        document.getElementById('confirmText').textContent = message;
        $confirm.style.display = 'flex';
        lockScroll();
        setTimeout(function () { document.getElementById('confirmOkBtn').focus(); }, 60);
    }

    function closeConfirm() {
        $confirm.style.display = 'none';
        unlockScroll();
        _confirmCallback = null;
    }

    document.getElementById('confirmOkBtn').addEventListener('click', function () {
        var cb = _confirmCallback;
        closeConfirm();
        if (cb) cb();
    });
    document.getElementById('confirmCancelBtn').addEventListener('click', closeConfirm);
    $confirm.addEventListener('click', function (e) {
        if (e.target === $confirm) closeConfirm();
    });

    // ---- LOGIN OVERLAY -------------------------------------------------
    function showLogin() {
        $overlay.style.display = 'flex';
        lockScroll();
        setTimeout(function () { document.getElementById('loginInput').focus(); }, 80);
    }

    function hideLogin() {
        $overlay.style.display = 'none';
        unlockScroll();
    }

    // ---- MAIN RENDER LOOP ---------------------------------------------
    // Reads State and pushes it into the DOM.  Called after every action.
    function render() {
        var visited      = State.visitedBooths;
        var redeemed     = State.redeemedPrizes;
        var mandatoryOK  = visited.indexOf(MANDATORY_BOOTH_ID) !== -1;

        // --- Booth cards ---
        document.querySelectorAll('.checkpoint-card').forEach(function (card) {
            var id        = card.dataset.id;
            var name      = card.dataset.name;
            var isVisited = visited.indexOf(id) !== -1;
            var isMand    = card.dataset.mandatory === 'true';
            var isLocked  = !isVisited && !isMand && !mandatoryOK;

            card.classList.toggle('visited', isVisited);
            card.classList.toggle('locked',  isLocked);

            if (isVisited) {
                card.setAttribute('aria-label',   name + ' — stamped');
                card.setAttribute('aria-pressed', 'true');
                card.setAttribute('tabindex',     '-1');
                card.removeAttribute('aria-disabled');
            } else if (isLocked) {
                card.setAttribute('aria-label',    name + ' — locked, visit ' + MANDATORY_BOOTH_NAME + ' first');
                card.setAttribute('aria-pressed',  'false');
                card.setAttribute('aria-disabled', 'true');
                card.setAttribute('tabindex',      '0');
            } else {
                card.setAttribute('aria-label',   'Visit ' + name);
                card.setAttribute('aria-pressed', 'false');
                card.setAttribute('tabindex',     '0');
                card.removeAttribute('aria-disabled');
            }
        });

        // --- Progress bar ---
        var n = visited.length;
        $fill.style.width = (n / TOTAL_BOOTHS * 100) + '%';
        $count.textContent = n;
        if ($bar) {
            $bar.setAttribute('aria-valuenow',  n);
            $bar.setAttribute('aria-valuetext', n + ' of ' + TOTAL_BOOTHS + ' booths visited');
        }

        // --- Prize circles ---
        Object.keys(PRIZE_CONFIG).forEach(function (key) {
            var el = document.querySelector('.prize-circle[data-prize="' + key + '"]');
            if (!el) return;
            var pid       = Number(key);
            var isRedeemed = redeemed.indexOf(pid) !== -1;
            var available  = n >= PRIZE_CONFIG[key] && !isRedeemed;
            el.classList.toggle('available', available);
            el.classList.toggle('redeemed',  isRedeemed);
            el.style.cursor = isRedeemed ? 'default' : available ? 'pointer' : 'not-allowed';
            el.setAttribute('aria-disabled', (isRedeemed || !available) ? 'true' : 'false');
            el.setAttribute('aria-label',
                'Prize ' + key + ' (' + PRIZE_CONFIG[key] + ' stamps)' +
                (isRedeemed ? ' — redeemed' : available ? ' — available to claim' : ' — locked'));
        });

        // --- Name display ---
        if (State.currentUsername) {
            // Preserve original casing if we can (localStorage may have lowercase)
            $nameDisp.textContent = $nameDisp.textContent === '—'
                ? State.currentUsername
                : $nameDisp.textContent;
        }
    }

    // ---- CONFETTI ------------------------------------------------------
    function launchConfetti() {
        var canvas = document.getElementById('confettiCanvas');
        var ctx    = canvas.getContext('2d');
        canvas.width  = window.innerWidth  || document.documentElement.clientWidth;
        canvas.height = window.innerHeight || document.documentElement.clientHeight;
        canvas.style.display    = 'block';
        canvas.style.opacity    = '1';
        canvas.style.transition = '';

        var colors = ['#FF6B6B','#FFD735','#4ECDC4','#45B7D1','#FF69B4','#A78BFA','#FFA500','#34D399'];
        var pieces = [];
        for (var i = 0; i < 160; i++) {
            pieces.push({
                x:     Math.random() * canvas.width,
                y:     Math.random() * canvas.height - canvas.height,
                w:     Math.random() * 12 + 5,
                h:     Math.random() * 6 + 3,
                color: colors[Math.floor(Math.random() * colors.length)],
                speed: Math.random() * 3 + 2,
                angle: Math.random() * Math.PI * 2,
                spin:  (Math.random() - 0.5) * 0.18,
                drift: (Math.random() - 0.5) * 1.5,
            });
        }

        var endAt = Date.now() + 4000;
        var raf;
        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            pieces.forEach(function (p) {
                p.y += p.speed;
                p.x += p.drift;
                p.angle += p.spin;
                if (p.y > canvas.height) { p.y = -10; p.x = Math.random() * canvas.width; }
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.angle);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                ctx.restore();
            });
            if (Date.now() < endAt) {
                raf = requestAnimationFrame(draw);
            } else {
                cancelAnimationFrame(raf);
                canvas.style.transition = 'opacity 1s';
                canvas.style.opacity    = '0';
                setTimeout(function () { canvas.style.display = 'none'; }, 1000);
            }
        }
        draw();
    }

    // ---- CONGRATS MODAL ------------------------------------------------
    function showCongrats() {
        launchConfetti();
        $congrats.style.display = 'flex';
        lockScroll();
        setTimeout(function () { document.getElementById('congratsCloseBtn').focus(); }, 100);
        announce('Congratulations! You have visited all ' + TOTAL_BOOTHS + ' booths!');
    }

    function closeCongrats() {
        $congrats.style.display = 'none';
        unlockScroll();
    }

    document.getElementById('congratsCloseBtn').addEventListener('click', closeCongrats);
    $congrats.addEventListener('click', function (e) {
        if (e.target === $congrats) closeCongrats();
    });

    // ---- Public API ---------------------------------------------------
    window.Vivace.UI = {
        lockScroll:   lockScroll,
        unlockScroll: unlockScroll,
        announce:     announce,
        toast:        toast,
        trapTab:      trapTab,
        confirm:      confirm,
        closeConfirm: closeConfirm,
        showLogin:    showLogin,
        hideLogin:    hideLogin,
        render:       render,
        showCongrats: showCongrats,
        closeCongrats: closeCongrats,
        // Element refs other modules occasionally need
        el: {
            overlay:      $overlay,
            confirmModal: $confirm,
            congratsModal: $congrats,
            nameDisplay:  $nameDisp,
        },
    };
})();
