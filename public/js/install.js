/* =========================================================================
   install.js — "Install as an App" feature.
   iOS: shows an Add-to-Home-Screen instructions modal (Safari has no native prompt).
   Android: uses the native beforeinstallprompt when available, falls back to
            step-by-step instructions in the same modal.
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
    var isAndroid       = /Android/.test(ua);

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
    var stepsIOS    = document.getElementById('installStepsIOS');
    var stepsAndroid= document.getElementById('installStepsAndroid');
    var subtitle    = document.getElementById('installSubtitle');
    if (!modal || !closeBtn) return;

    // Pick the correct instruction list for this platform
    if (isAndroid) {
        if (stepsIOS)     stepsIOS.style.display     = 'none';
        if (stepsAndroid) stepsAndroid.style.display = '';
        if (subtitle)     subtitle.textContent       = 'Install Vivace as an app on your Android phone so you can open your stamp card in one tap.';
    } else {
        // iOS is the default view; still ensure Android list is hidden.
        if (stepsAndroid) stepsAndroid.style.display = 'none';
        if (stepsIOS)     stepsIOS.style.display     = '';
        if (subtitle && isIOS) subtitle.textContent  = 'Install Vivace as an app on your iPhone so you can open your stamp card in one tap.';
    }

    // ---- Native Android install prompt (Chrome / Edge / Samsung) -----
    // Chromium browsers fire beforeinstallprompt when the site is installable.
    // We stash the event and use it when the user clicks any install trigger.
    var deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        deferredPrompt = e;
    });

    // Once installed, hide install buttons
    window.addEventListener('appinstalled', function () {
        deferredPrompt = null;
        document.body.classList.add('pwa-installed');
    });

    // ---- Open / close modal ------------------------------------------
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

    // ---- Handle a click on any install trigger -----------------------
    function handleInstallClick(btn) {
        // Android + native prompt available → fire it directly, skip the modal.
        if (deferredPrompt && deferredPrompt.prompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then(function () {
                // Whether accepted or dismissed, the event can only be used once.
                deferredPrompt = null;
            });
            return;
        }
        // Otherwise show the instructions modal (iOS, or Android without prompt).
        open(btn);
    }

    // ---- Wire every [data-install-trigger] button --------------------
    document.querySelectorAll('[data-install-trigger]').forEach(function (btn) {
        btn.addEventListener('click', function () { handleInstallClick(btn); });
    });

    closeBtn.addEventListener('click', close);
    modal.addEventListener('click', function (e) {
        if (e.target === modal) close();
    });
    modal.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { close(); return; }
        UI.trapTab(modal, e);
    });

    // ---- First-time gentle nudge for iOS + Android visitors ----------
    // Waits until user is past the login screen so it doesn't stack over it.
    if ((isIOS || isAndroid) && !localStorage.getItem(AUTO_SHOWN_KEY)) {
        setTimeout(function () {
            var overlay = document.getElementById('loginOverlay');
            if (overlay && overlay.style.display === 'none') {
                // On Android with a native prompt ready, fire it directly.
                if (deferredPrompt && deferredPrompt.prompt) {
                    handleInstallClick(null);
                } else {
                    open(null);
                }
                localStorage.setItem(AUTO_SHOWN_KEY, '1');
            }
        }, 5000);
    }
})();
