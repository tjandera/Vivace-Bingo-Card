/* bingo.js — client-side stamp card logic
 * Globals injected by server (views/index.ejs):
 *   BOOTH_CODES  — { b1: hash, b2: hash, ... }
 *   TOTAL_BOOTHS — total number of booths
 *   PRIZE_CONFIG — { "1": 3, "2": 6, "3": 9 }
 *
 * Progress is stored in localStorage, keyed by username.
 * Each user on the same device gets their own isolated card.
 */

// Must match utils/hash.js on the server
function simpleHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h) + str.charCodeAt(i);
        h |= 0;
    }
    return h.toString();
}

const USERNAME_KEY = 'vivace_username';

function visitedKey(u)  { return `vivace_${u}_visited`; }
function redeemedKey(u) { return `vivace_${u}_redeemed`; }

let currentUsername = null;
let visitedBooths   = [];
let redeemedPrizes  = [];

const $fill     = document.getElementById('progressFill');
const $count    = document.getElementById('progressCount');
const $nameDisp = document.getElementById('nameDisplay');
const modal     = document.getElementById('codeModal');
const $mName    = document.getElementById('modalCheckpointName');
const $mIcon    = document.getElementById('modalIcon');
const $input    = document.getElementById('codeInput');
const $error    = document.getElementById('modalError');
const overlay   = document.getElementById('loginOverlay');

let currentBoothId = null;

// ===== STORAGE =====
function loadState(username) {
    try {
        const v = JSON.parse(localStorage.getItem(visitedKey(username)))  || [];
        const r = JSON.parse(localStorage.getItem(redeemedKey(username))) || [];
        return { visitedBooths: v, redeemedPrizes: r };
    } catch (e) {
        return { visitedBooths: [], redeemedPrizes: [] };
    }
}

function saveState() {
    localStorage.setItem(visitedKey(currentUsername),  JSON.stringify(visitedBooths));
    localStorage.setItem(redeemedKey(currentUsername), JSON.stringify(redeemedPrizes));
}

// ===== UI =====
function updateUI() {
    const mandatoryDone = visitedBooths.includes(MANDATORY_BOOTH_ID);
    document.querySelectorAll('.checkpoint-card').forEach(card => {
        const id        = card.dataset.id;
        const isVisited = visitedBooths.includes(id);
        const isMand    = card.dataset.mandatory === 'true';
        const isLocked  = !isVisited && !isMand && !mandatoryDone;
        card.classList.toggle('visited', isVisited);
        card.classList.toggle('locked',  isLocked);
    });
    const n = visitedBooths.length;
    $fill.style.width = (n / TOTAL_BOOTHS * 100) + '%';
    $count.innerText  = n;
    Object.keys(PRIZE_CONFIG).forEach(key => {
        const el = document.querySelector(`.prize-circle[data-prize="${key}"]`);
        if (!el) return;
        const pid      = Number(key);
        const redeemed  = redeemedPrizes.includes(pid);
        const available = n >= PRIZE_CONFIG[key] && !redeemed;
        el.classList.toggle('available', available);
        el.classList.toggle('redeemed',  redeemed);
        el.style.cursor = redeemed ? 'default' : available ? 'pointer' : 'not-allowed';
    });
}

function showLogin() { overlay.style.display = 'flex'; }
function hideLogin() { overlay.style.display = 'none'; }

// ===== CONFETTI =====
function launchConfetti() {
    const canvas = document.getElementById('confettiCanvas');
    const ctx    = canvas.getContext('2d');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.display  = 'block';
    canvas.style.opacity  = '1';
    canvas.style.transition = '';

    const colors = ['#FF6B6B', '#FFD735', '#4ECDC4', '#45B7D1', '#FF69B4', '#A78BFA', '#FFA500', '#34D399'];
    const pieces = Array.from({ length: 160 }, () => ({
        x:     Math.random() * canvas.width,
        y:     Math.random() * canvas.height - canvas.height,
        w:     Math.random() * 12 + 5,
        h:     Math.random() * 6 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        speed: Math.random() * 3 + 2,
        angle: Math.random() * Math.PI * 2,
        spin:  (Math.random() - 0.5) * 0.18,
        drift: (Math.random() - 0.5) * 1.5,
    }));

    const end = Date.now() + 4000;
    let raf;

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        pieces.forEach(p => {
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
            setTimeout(() => { canvas.style.display = 'none'; }, 1000);
        }
    }
    draw();
}

// ===== CONGRATS =====
function showCongrats() {
    launchConfetti();
    const m = document.getElementById('congratsModal');
    m.style.display = 'flex';
}

document.getElementById('congratsCloseBtn').addEventListener('click', () => {
    document.getElementById('congratsModal').style.display = 'none';
});
document.getElementById('congratsModal').addEventListener('click', e => {
    if (e.target === document.getElementById('congratsModal'))
        document.getElementById('congratsModal').style.display = 'none';
});

// ===== LOGIN =====
window.handleLogin = function () {
    const input    = document.getElementById('loginInput');
    const errEl    = document.getElementById('loginError');
    const raw      = input.value.trim();

    if (!raw) { errEl.innerText = 'Please enter your name.'; return; }

    // Lowercase so "Alex" and "alex" map to the same card
    currentUsername     = raw.toLowerCase();
    const state         = loadState(currentUsername);
    visitedBooths       = state.visitedBooths;
    redeemedPrizes      = state.redeemedPrizes;

    localStorage.setItem(USERNAME_KEY, currentUsername);
    $nameDisp.innerText = raw; // show original casing in UI
    hideLogin();
    updateUI();
};

// ===== SWITCH USER =====
document.getElementById('switchUserBtn').addEventListener('click', () => {
    localStorage.removeItem(USERNAME_KEY);
    currentUsername = null;
    visitedBooths   = [];
    redeemedPrizes  = [];
    document.getElementById('loginInput').value     = '';
    document.getElementById('loginError').innerText = '';
    updateUI();
    showLogin();
});

// ===== BOOTH INTERACTION =====
window.handleBoothClick = function (card) {
    if (visitedBooths.includes(card.dataset.id)) return;
    if (card.classList.contains('locked')) {
        alert(`Visit "${MANDATORY_BOOTH_NAME}" first to unlock the rest of the booths.`);
        return;
    }
    currentBoothId   = card.dataset.id;
    $mName.innerText = card.dataset.name;
    $mIcon.innerHTML = `<img src="${card.dataset.logo}" alt="${card.dataset.name}" class="modal-cca-logo">`;
    $input.value     = '';
    $error.innerText = '';
    modal.style.display = 'flex';
    setTimeout(() => $input.focus(), 80);
};

function closeModal() {
    modal.style.display = 'none';
    currentBoothId = null;
}

function verifyCode() {
    if (!currentBoothId) return;
    const code = $input.value.trim();
    if (!code) return;

    if (simpleHash(code) === BOOTH_CODES[currentBoothId]) {
        visitedBooths.push(currentBoothId);
        saveState();
        updateUI();
        closeModal();
        if (visitedBooths.length === TOTAL_BOOTHS) {
            setTimeout(showCongrats, 500);
        }
    } else {
        $error.innerText = 'Incorrect code — try again!';
        $input.value     = '';
        $input.focus();
    }
}

// ===== PRIZE REDEMPTION =====
window.handlePrizeClick = function (p) {
    if (redeemedPrizes.includes(p)) { alert('Already redeemed!'); return; }
    const needed = PRIZE_CONFIG[p];
    if (visitedBooths.length < needed) {
        alert(`You need ${needed} stamps (you have ${visitedBooths.length}).`);
        return;
    }
    if (!confirm(`Redeem Prize ${p}? (${needed} stamps required)`)) return;
    redeemedPrizes.push(p);
    saveState();
    updateUI();
    alert('🎉 Prize redeemed! Head to the prize counter.');
};

// ===== EVENTS =====
document.getElementById('modalConfirmBtn').addEventListener('click', verifyCode);
document.getElementById('modalCancelBtn').addEventListener('click',  closeModal);
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
$input.addEventListener('keypress', e => { if (e.key === 'Enter') verifyCode(); });
document.getElementById('loginInput').addEventListener('keypress', e => { if (e.key === 'Enter') handleLogin(); });

// ===== AUTO-LOGIN =====
// If the user has visited before, restore their session immediately
(function init() {
    const saved = localStorage.getItem(USERNAME_KEY);
    if (!saved) return; // overlay stays visible, user fills in form

    currentUsername     = saved;
    const state         = loadState(saved);
    visitedBooths       = state.visitedBooths;
    redeemedPrizes      = state.redeemedPrizes;
    $nameDisp.innerText = saved;
    hideLogin();
    updateUI();
})();
