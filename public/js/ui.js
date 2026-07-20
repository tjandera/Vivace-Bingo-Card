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

    // ---- Cached stamp/prize NodeLists ---------------------------------
    // Populated by rebindStamps() after app.js finishes hydrating CCA
    // slots; re-populated whenever the user switches accounts (slot DOM
    // node identity stays the same but data-id changes, so the NodeList
    // itself is still valid — we just refresh for symmetry / future-proof).
    var _cards      = [];
    var _dots       = [];
    var _prizeTiles = {};

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

    // ---- REDEMPTION VOUCHER --------------------------------------------
    // Reads prize label + image from the tile's own DOM so no server-side
    // data has to be duplicated into JS.  Called from handlePrizeClick().
    var $redeem       = document.getElementById('redeemModal');
    var $redeemClose  = document.getElementById('redeemCloseBtn');

    function pad2(n) { return n < 10 ? '0' + n : String(n); }

    function formatIssued(d) {
        // e.g. "15 Jul 2026 · 20:14"
        var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear() +
               ' · ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    }

    function makeVoucherRef(prizeId, name) {
        // Short deterministic-ish reference so the printed voucher looks official.
        var base = (name || 'GUEST').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'VVCE';
        var rand = Math.floor(Math.random() * 9000 + 1000);
        return 'VVC-P' + prizeId + '-' + base + '-' + rand;
    }

    function showRedemption(prizeId) {
        if ($redeem == null) return;
        var tile = document.querySelector('.prize-tile[data-prize="' + prizeId + '"]');
        if (!tile) return;

        var img       = tile.querySelector('.prize-image img');
        var labelEl   = tile.querySelector('.prize-label');
        var prizeLbl  = labelEl ? labelEl.textContent : ('Prize ' + prizeId);
        var prizeSrc  = img ? img.getAttribute('src') : '';

        document.getElementById('voucherName').textContent   = State.currentUsername || '—';
        document.getElementById('voucherStamps').textContent = State.visitedBooths.length + ' / ' + TOTAL_BOOTHS;
        document.getElementById('voucherIssued').textContent = formatIssued(new Date());
        document.getElementById('voucherPrizeLabel').textContent = prizeLbl;
        document.getElementById('voucherRef').textContent    = makeVoucherRef(prizeId, State.currentUsername);

        var $voucherImg = document.getElementById('voucherPrizeImage');
        if (prizeSrc) {
            $voucherImg.src = prizeSrc;
            $voucherImg.alt = prizeLbl;
            $voucherImg.style.display = 'block';
        } else {
            $voucherImg.style.display = 'none';
        }

        $redeem.style.display = 'flex';
        lockScroll();
        setTimeout(function () { $redeemClose.focus(); }, 60);
    }

    function closeRedemption() {
        $redeem.style.display = 'none';
        unlockScroll();
    }

    if ($redeemClose) $redeemClose.addEventListener('click', closeRedemption);
    if ($redeem) {
        $redeem.addEventListener('click', function (e) {
            if (e.target === $redeem) closeRedemption();
        });
        $redeem.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { closeRedemption(); return; }
            trapTab($redeem, e);
        });
    }

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
    // Iterates the NodeLists cached by rebindStamps() so we don't re-query
    // the DOM on every state change (login, stamp, redeem, switch).
    function render() {
        var visited      = State.visitedBooths;
        var redeemed     = State.redeemedPrizes;
        var mandatoryOK  = visited.indexOf(MANDATORY_BOOTH_ID) !== -1;

        // --- Booth cards ---
        for (var ci = 0; ci < _cards.length; ci++) {
            var card      = _cards[ci];
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
        }

        // --- Progress roadmap ---
        var n = visited.length;
        $fill.style.width = (n / TOTAL_BOOTHS * 100) + '%';
        $count.textContent = n;
        for (var di = 0; di < _dots.length; di++) {
            var dot = _dots[di];
            dot.classList.toggle('visited', visited.indexOf(dot.dataset.id) !== -1);
        }
        if ($bar) {
            $bar.setAttribute('aria-valuenow',  n);
            $bar.setAttribute('aria-valuetext', n + ' of ' + TOTAL_BOOTHS + ' booths visited');
        }

        // --- Prize tiles ---
        var keys = Object.keys(PRIZE_CONFIG);
        for (var pi = 0; pi < keys.length; pi++) {
            var key = keys[pi];
            var el  = _prizeTiles[key];
            if (!el) continue;
            var pid        = Number(key);
            var isRedeemed = redeemed.indexOf(pid) !== -1;
            var available  = n >= PRIZE_CONFIG[key] && !isRedeemed;
            el.classList.toggle('available', available);
            el.classList.toggle('redeemed',  isRedeemed);
            el.style.cursor = isRedeemed ? 'default' : available ? 'pointer' : 'not-allowed';
            el.setAttribute('aria-disabled', (isRedeemed || !available) ? 'true' : 'false');
            el.setAttribute('aria-label',
                'Prize ' + key + ' (' + PRIZE_CONFIG[key] + ' stamps)' +
                (isRedeemed ? ' — redeemed' : available ? ' — available to claim' : ' — locked'));
        }

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

    // ---- STAMP / DOT / PRIZE CACHE REBIND -----------------------------
    // Called by app.js after it hydrates the CCA slots so render() can
    // iterate a cached NodeList instead of re-querying the DOM on every
    // state change.  Also called once at load for the initial paint.
    function rebindStamps() {
        _cards      = document.querySelectorAll('.checkpoint-card');
        _dots       = document.querySelectorAll('.roadmap-dot');
        _prizeTiles = {};
        var keys = Object.keys(PRIZE_CONFIG);
        for (var i = 0; i < keys.length; i++) {
            _prizeTiles[keys[i]] =
                document.querySelector('.prize-tile[data-prize="' + keys[i] + '"]');
        }
    }

    // Initial bind — captures the fixed b0 card + empty slot stubs so
    // early renders (e.g. during login) still work before CCAs hydrate.
    rebindStamps();

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
        rebindStamps: rebindStamps,
        showCongrats: showCongrats,
        closeCongrats: closeCongrats,
        showRedemption: showRedemption,
        closeRedemption: closeRedemption,
        // Element refs other modules occasionally need
        el: {
            overlay:      $overlay,
            confirmModal: $confirm,
            congratsModal: $congrats,
            nameDisplay:  $nameDisp,
        },
    };
})();
