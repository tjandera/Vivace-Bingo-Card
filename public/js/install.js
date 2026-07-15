/* =========================================================================
   install.js — "Install as an App" feature.
   Shows a modal with iOS Safari Add-to-Home-Screen instructions.
   Wired to any element carrying [data-install-trigger].
   Depends on window.Vivace.UI (ui.js) for lockScroll / trapTab.
   ========================================================================= */

(function () {
    var UI = window.Vivace.UI;

    // Only show the first-time auto-nudge once per browser
    var AUTO_SHOWN_KEY = 'vivace_install_auto_shown';

    // ---- Platform detection -------------------------------------------
    // iPadOS 13+ lies and reports as MacIntel — the only reliable tell is
    // touch support (regular Macs don't have touch screens).
    var ua              = navigator.userAgent || '';
    var isIOSDevice     = /iPhone|iPad|iPod/.test(ua);
    var isIPadOS13Plus  = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
    var isIOS           = isIOSDevice || isIPadOS13Plus;

    // Already installed to home screen?  Hide install buttons entirely.
    var isStandalone =
        (('standalone' in navigator) && navigator.standalone) ||
        (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);

    if (isStandalone) {
        document.body.classList.add('pwa-installed');
        return;
    }

    // ---- Grab modal + triggers ---------------------------------------
    var modal       = document.getElementById('installModal');
    var closeBtn    = document.getElementById('installCloseBtn');
    var androidNote = document.getElementById('installNoteAndroid');
    if (!modal || !closeBtn) return;

    // Show the "Android coming soon" note on non-iOS visitors
    if (!isIOS && androidNote) androidNote.style.display = 'flex';

    // ---- Open / close --------------------------------------------------
    var focusReturn = null;

    function open(trigger) {
        focusReturn = trigger || document.activeElement;
        modal.style.display = 'flex';
        UI.lockScroll();
        setTimeout(function () { closeBtn.focus(); }, 60);
    }

    function close() {
        modal.style.display = 'none';
        UI.unlockScroll();
        if (focusReturn && focusReturn.focus) focusReturn.focus();
        focusReturn = null;
    }

    // ---- Wire every [data-install-trigger] button --------------------
    document.querySelectorAll('[data-install-trigger]').forEach(function (btn) {
        btn.addEventListener('click', function () { open(btn); });
    });

    closeBtn.addEventListener('click', close);
    modal.addEventListener('click', function (e) {
        if (e.target === modal) close();
    });
    modal.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { close(); return; }
        UI.trapTab(modal, e);
    });

    // ---- First-time gentle nudge for iOS Safari visitors -------------
    // Waits until user is past the login screen so it doesn't stack over it.
    if (isIOS && !localStorage.getItem(AUTO_SHOWN_KEY)) {
        setTimeout(function () {
            var overlay = document.getElementById('loginOverlay');
            if (overlay && overlay.style.display === 'none') {
                open(null);
                localStorage.setItem(AUTO_SHOWN_KEY, '1');
            }
        }, 5000);
    }
})();
