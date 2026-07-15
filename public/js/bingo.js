/* bingo.js — client-side stamp card logic
 * Globals injected by server (views/index.ejs):
 *   BOOTH_CODES        — { b0: hash, b1: hash, ... }
 *   TOTAL_BOOTHS       — total number of booths
 *   PRIZE_CONFIG       — { "1": 3, "2": 6, "3": 9 }
 *   MANDATORY_BOOTH_ID — id of the mandatory booth
 *   MANDATORY_BOOTH_NAME — name of the mandatory booth
 *
 * Progress is stored in localStorage, keyed by username.
 * Each user on the same device gets their own isolated card.
 */

// Must match utils/hash.js on the server
function simpleHash(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) {
        h = ((h << 5) - h) + str.charCodeAt(i);
        h |= 0;
    }
    return h.toString();
}

var USERNAME_KEY = 'vivace_username';
function visitedKey(u)  { return 'vivace_' + u + '_visited'; }
function redeemedKey(u) { return 'vivace_' + u + '_redeemed'; }

var currentUsername = null;
var visitedBooths   = [];
var redeemedPrizes  = [];
var currentBoothId  = null;
var lastFocused     = null;  // element to restore focus to after modal closes

var $fill     = document.getElementById('progressFill');
var $bar      = document.getElementById('progressBar');
var $count    = document.getElementById('progressCount');
var $nameDisp = document.getElementById('nameDisplay');
var modal     = document.getElementById('codeModal');
var $mName    = document.getElementById('modalCheckpointName');
var $mIcon    = document.getElementById('modalIcon');
var $input    = document.getElementById('codeInput');
var $error    = document.getElementById('modalError');
var overlay   = document.getElementById('loginOverlay');
var confirmModal = document.getElementById('confirmModal');

// ===== SCROLL LOCK =====
// Saves page scroll position before locking, restores after.
// Fixes iOS Safari bounce-scroll bleed-through on modals.
function lockScroll() {
    var scrollY = window.scrollY || window.pageYOffset;
    document.documentElement.style.setProperty('--scroll-y', '-' + scrollY + 'px');
    document.body.classList.add('modal-open');
}

function unlockScroll() {
    var scrollY = document.body.style.top || document.documentElement.style.getPropertyValue('--scroll-y') || '0';
    document.body.classList.remove('modal-open');
    document.documentElement.style.removeProperty('--scroll-y');
    window.scrollTo(0, -parseInt(scrollY, 10) || 0);
}

// ===== SCREEN READER ANNOUNCER =====
function announce(message) {
    var el = document.getElementById('liveAnnounce');
    el.textContent = '';
    // Brief timeout lets screen readers pick up the cleared + re-set text
    setTimeout(function() { el.textContent = message; }, 60);
}

// ===== TOAST =====
function showToast(message, duration) {
    duration = duration || 3000;
    var toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function() { toast.classList.remove('show'); }, duration);
    announce(message);
}

// ===== CUSTOM CONFIRM MODAL =====
var confirmCallback = null;

function showConfirm(message, onOk) {
    confirmCallback = onOk;
    document.getElementById('confirmText').textContent = message;
    confirmModal.style.display = 'flex';
    lockScroll();
    setTimeout(function() { document.getElementById('confirmOkBtn').focus(); }, 60);
}

function closeConfirm() {
    confirmModal.style.display = 'none';
    unlockScroll();
    confirmCallback = null;
    if (lastFocused) { lastFocused.focus(); lastFocused = null; }
}

document.getElementById('confirmOkBtn').addEventListener('click', function() {
    var cb = confirmCallback;
    closeConfirm();
    if (cb) cb();
});
document.getElementById('confirmCancelBtn').addEventListener('click', closeConfirm);
confirmModal.addEventListener('click', function(e) { if (e.target === confirmModal) closeConfirm(); });

// ===== STORAGE =====
function loadState(username) {
    try {
        var v = JSON.parse(localStorage.getItem(visitedKey(username)))  || [];
        var r = JSON.parse(localStorage.getItem(redeemedKey(username))) || [];
        return { visitedBooths: v, redeemedPrizes: r };
    } catch (e) {
        return { visitedBooths: [], redeemedPrizes: [] };
    }
}

function saveState() {
    localStorage.setItem(visitedKey(currentUsername),  JSON.stringify(visitedBooths));
    localStorage.setItem(redeemedKey(currentUsername), JSON.stringify(redeemedPrizes));
}

// ===== UI UPDATE =====
function updateUI() {
    var mandatoryDone = visitedBooths.indexOf(MANDATORY_BOOTH_ID) !== -1;

    document.querySelectorAll('.checkpoint-card').forEach(function(card) {
        var id        = card.dataset.id;
        var name      = card.dataset.name;
        var isVisited = visitedBooths.indexOf(id) !== -1;
        var isMand    = card.dataset.mandatory === 'true';
        var isLocked  = !isVisited && !isMand && !mandatoryDone;

        card.classList.toggle('visited', isVisited);
        card.classList.toggle('locked',  isLocked);

        // ARIA state
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

    var n = visitedBooths.length;
    $fill.style.width = (n / TOTAL_BOOTHS * 100) + '%';
    $count.textContent = n;
    if ($bar) {
        $bar.setAttribute('aria-valuenow', n);
        $bar.setAttribute('aria-valuetext', n + ' of ' + TOTAL_BOOTHS + ' booths visited');
    }

    Object.keys(PRIZE_CONFIG).forEach(function(key) {
        var el = document.querySelector('.prize-circle[data-prize="' + key + '"]');
        if (!el) return;
        var pid      = Number(key);
        var redeemed  = redeemedPrizes.indexOf(pid) !== -1;
        var available = n >= PRIZE_CONFIG[key] && !redeemed;
        el.classList.toggle('available', available);
        el.classList.toggle('redeemed',  redeemed);
        el.style.cursor = redeemed ? 'default' : available ? 'pointer' : 'not-allowed';
        el.setAttribute('aria-disabled', (redeemed || !available) ? 'true' : 'false');
        el.setAttribute('aria-label',
            'Prize ' + key + ' (' + PRIZE_CONFIG[key] + ' stamps)' +
            (redeemed ? ' — redeemed' : available ? ' — available to claim' : ' — locked'));
    });
}

// ===== LOGIN OVERLAY =====
function showLogin() {
    overlay.style.display = 'flex';
    lockScroll();
    setTimeout(function() { document.getElementById('loginInput').focus(); }, 80);
}

function hideLogin() {
    overlay.style.display = 'none';
    unlockScroll();
}

// ===== CONFETTI =====
function launchConfetti() {
    var canvas = document.getElementById('confettiCanvas');
    var ctx    = canvas.getContext('2d');
    canvas.width  = window.innerWidth  || document.documentElement.clientWidth;
    canvas.height = window.innerHeight || document.documentElement.clientHeight;
    canvas.style.display  = 'block';
    canvas.style.opacity  = '1';
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

    var end = Date.now() + 4000;
    var raf;

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        pieces.forEach(function(p) {
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

        if (Date.now() < end) {
            raf = requestAnimationFrame(draw);
        } else {
            cancelAnimationFrame(raf);
            canvas.style.transition = 'opacity 1s';
            canvas.style.opacity    = '0';
            setTimeout(function() { canvas.style.display = 'none'; }, 1000);
        }
    }
    draw();
}

// ===== CONGRATS =====
function showCongrats() {
    launchConfetti();
    var m = document.getElementById('congratsModal');
    m.style.display = 'flex';
    lockScroll();
    setTimeout(function() { document.getElementById('congratsCloseBtn').focus(); }, 100);
    announce('Congratulations! You have visited all ' + TOTAL_BOOTHS + ' booths!');
}

document.getElementById('congratsCloseBtn').addEventListener('click', function() {
    document.getElementById('congratsModal').style.display = 'none';
    unlockScroll();
});
document.getElementById('congratsModal').addEventListener('click', function(e) {
    if (e.target === document.getElementById('congratsModal')) {
        document.getElementById('congratsModal').style.display = 'none';
        unlockScroll();
    }
});

// ===== LOGIN =====
window.handleLogin = function() {
    var input = document.getElementById('loginInput');
    var errEl = document.getElementById('loginError');
    var raw   = input.value.trim();

    if (!raw) { errEl.textContent = 'Please enter your name.'; return; }

    currentUsername       = raw.toLowerCase();
    var state             = loadState(currentUsername);
    visitedBooths         = state.visitedBooths;
    redeemedPrizes        = state.redeemedPrizes;

    localStorage.setItem(USERNAME_KEY, currentUsername);
    $nameDisp.textContent = raw;
    hideLogin();
    updateUI();
    announce('Welcome, ' + raw + '. You have ' + visitedBooths.length + ' of ' + TOTAL_BOOTHS + ' stamps.');
};

// ===== SWITCH USER =====
document.getElementById('switchUserBtn').addEventListener('click', function() {
    localStorage.removeItem(USERNAME_KEY);
    currentUsername = null;
    visitedBooths   = [];
    redeemedPrizes  = [];
    document.getElementById('loginInput').value       = '';
    document.getElementById('loginError').textContent = '';
    updateUI();
    showLogin();
});

// ===== BOOTH INTERACTION =====
window.handleBoothClick = function(card) {
    if (visitedBooths.indexOf(card.dataset.id) !== -1) return;
    if (card.classList.contains('locked')) {
        showToast('Visit "' + MANDATORY_BOOTH_NAME + '" first to unlock all booths.');
        return;
    }
    lastFocused        = card;
    currentBoothId     = card.dataset.id;
    $mName.textContent = card.dataset.name;
    $mIcon.innerHTML   = '<img src="' + card.dataset.logo + '" alt="' + card.dataset.name + '" class="modal-cca-logo">';
    $input.value       = '';
    $error.textContent = '';
    modal.style.display = 'flex';
    lockScroll();
    setTimeout(function() { $input.focus(); }, 80);
};

function closeModal() {
    modal.style.display = 'none';
    unlockScroll();
    currentBoothId = null;
    if (lastFocused) { lastFocused.focus(); lastFocused = null; }
}

function verifyCode() {
    if (!currentBoothId) return;
    var code = $input.value.trim();
    if (!code) return;

    if (simpleHash(code) === BOOTH_CODES[currentBoothId]) {
        var boothCard = document.querySelector('.checkpoint-card[data-id="' + currentBoothId + '"]');
        var boothName = boothCard ? boothCard.dataset.name : '';
        visitedBooths.push(currentBoothId);
        saveState();
        updateUI();
        closeModal();
        announce(boothName + ' stamped! ' + visitedBooths.length + ' of ' + TOTAL_BOOTHS + ' booths visited.');
        if (visitedBooths.length === TOTAL_BOOTHS) {
            setTimeout(showCongrats, 500);
        }
    } else {
        $error.textContent = 'Incorrect code — try again!';
        $input.value       = '';
        $input.focus();
        announce('Incorrect code. Please try again.');
    }
}

// ===== PRIZE REDEMPTION =====
window.handlePrizeClick = function(p) {
    if (redeemedPrizes.indexOf(p) !== -1) { showToast('Already redeemed!'); return; }
    var needed = PRIZE_CONFIG[p];
    if (visitedBooths.length < needed) {
        showToast('You need ' + needed + ' stamps (you have ' + visitedBooths.length + ').');
        return;
    }
    lastFocused = document.querySelector('.prize-circle[data-prize="' + p + '"]');
    showConfirm('Redeem Prize ' + p + '? (' + needed + ' stamps required)', function() {
        redeemedPrizes.push(p);
        saveState();
        updateUI();
        showToast('🎉 Prize redeemed! Head to the prize counter.');
        announce('Prize ' + p + ' successfully redeemed!');
    });
};

// ===== FOCUS TRAP HELPER =====
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

// ===== KEYBOARD SUPPORT =====
function initKeyboard() {
    // Make booth cards keyboard-accessible
    document.querySelectorAll('.checkpoint-card').forEach(function(card) {
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                window.handleBoothClick(card);
            }
        });
    });

    // Escape closes any open modal
    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape') return;
        if (modal.style.display === 'flex')          { closeModal(); return; }
        if (confirmModal.style.display === 'flex')   { closeConfirm(); return; }
        var cg = document.getElementById('congratsModal');
        if (cg.style.display === 'flex')             { cg.style.display = 'none'; unlockScroll(); }
    });

    // Tab traps inside modals
    modal.addEventListener('keydown', function(e) { trapTab(modal, e); });
    confirmModal.addEventListener('keydown', function(e) { trapTab(confirmModal, e); });
    overlay.addEventListener('keydown', function(e) { trapTab(overlay, e); });
}

// ===== EVENTS =====
document.getElementById('modalConfirmBtn').addEventListener('click', verifyCode);
document.getElementById('modalCancelBtn').addEventListener('click', closeModal);
modal.addEventListener('click', function(e) { if (e.target === modal) closeModal(); });
$input.addEventListener('keypress', function(e) { if (e.key === 'Enter') verifyCode(); });
document.getElementById('loginInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') window.handleLogin();
});

// ===== INIT =====
(function init() {
    initKeyboard();

    var saved = localStorage.getItem(USERNAME_KEY);
    if (!saved) {
        // Overlay is already visible via CSS; just lock scroll and focus the input
        lockScroll();
        setTimeout(function() { document.getElementById('loginInput').focus(); }, 80);
        return;
    }

    currentUsername       = saved;
    var state             = loadState(saved);
    visitedBooths         = state.visitedBooths;
    redeemedPrizes        = state.redeemedPrizes;
    $nameDisp.textContent = saved;
    hideLogin();
    updateUI();
})();
