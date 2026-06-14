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
    document.querySelectorAll('.checkpoint-card').forEach(card => {
        card.classList.toggle('visited', visitedBooths.includes(card.dataset.id));
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
    currentBoothId   = card.dataset.id;
    $mName.innerText = card.dataset.name;
    $mIcon.innerText = card.dataset.icon || '🎪';
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
    } else {
        $error.innerText = '❌ Incorrect code — try again!';
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
