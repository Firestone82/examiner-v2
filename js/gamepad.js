(function () {
    var BTN = {
        A: 0, B: 1, X: 2, Y: 3,
        LB: 4, RB: 5,
        BACK: 8, START: 9,
        DP_UP: 12, DP_DOWN: 13, DP_LEFT: 14, DP_RIGHT: 15
    };

    var connected = false, padIdx = null, prev = {}, rafId = null, focusedAns = -1;

    function activate(gp) {
        connected = true;
        padIdx = gp.index;
        document.body.classList.add('gamepad-active');
        resetFocus();
        if (!rafId) rafId = requestAnimationFrame(tick);
    }

    function deactivate(idx) {
        if (idx !== padIdx) return;
        connected = false;
        padIdx = null;
        document.body.classList.remove('gamepad-active');
        resetFocus();
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    }

    function pad() { return padIdx !== null ? navigator.getGamepads()[padIdx] : null; }

    function just(gp, b) { return !!(gp.buttons[b] && gp.buttons[b].pressed && !prev[b]); }

    function tick() {
        if (!connected) { rafId = null; return; }
        var gp = pad();
        if (gp) {
            var ns = {};
            for (var i = 0; i < gp.buttons.length; i++) ns[i] = gp.buttons[i].pressed;

            if (just(gp, BTN.DP_DOWN))                                               moveFocus(1);
            if (just(gp, BTN.DP_UP))                                                  moveFocus(-1);
            if (just(gp, BTN.A) || just(gp, BTN.START))                               pressA();
            if (just(gp, BTN.B) || just(gp, BTN.RB) || just(gp, BTN.DP_RIGHT))       pressB();
            if (just(gp, BTN.X))                                                       pressX();
            if (just(gp, BTN.Y) || just(gp, BTN.LB) || just(gp, BTN.DP_LEFT))        pressY();

            prev = ns;
        }
        rafId = requestAnimationFrame(tick);
    }

    function pressA() {
        var correct = document.querySelector('.self-assessment-button-correct');
        if (correct) { correct.click(); return; }
        if (focusedAns >= 0 && typeof select === 'function') {
            select(focusedAns);
        } else {
            clickBtn('checkButton');
        }
    }

    function pressB() {
        var wrong = document.querySelector('.self-assessment-button-wrong');
        if (wrong) { wrong.click(); return; }
        clickBtn('skipButton');
    }

    function pressX() {
        if (focusedAns >= 0 && typeof dismissAnswer === 'function') {
            dismissAnswer(focusedAns);
        } else {
            clickBtn('unmarkButton');
        }
    }

    function pressY() { clickBtn('prevButton'); }

    function clickBtn(id) {
        var el = document.getElementById(id);
        if (el && !el.hidden && !el.disabled) el.click();
    }

    function moveFocus(dir) {
        var ws = document.querySelectorAll('#answersHolder .answer-wrapper');
        if (!ws.length) return;
        var next = focusedAns + dir;
        if (next < -1) next = ws.length - 1;
        if (next >= ws.length) next = -1;
        setFocus(next);
    }

    function setFocus(idx) {
        var ws = document.querySelectorAll('#answersHolder .answer-wrapper');
        for (var i = 0; i < ws.length; i++) {
            ws[i].classList.toggle('gamepad-focused', i === idx);
        }
        focusedAns = idx;
        if (idx >= 0 && ws[idx]) ws[idx].scrollIntoView({ block: 'nearest' });
    }

    function resetFocus() {
        focusedAns = -1;
        var els = document.querySelectorAll('#answersHolder .answer-wrapper.gamepad-focused');
        for (var i = 0; i < els.length; i++) els[i].classList.remove('gamepad-focused');
    }

    window.gamepadResetFocus = resetFocus;

    window.addEventListener('gamepadconnected', function (e) { activate(e.gamepad); });
    window.addEventListener('gamepaddisconnected', function (e) { deactivate(e.gamepad.index); });

    function scanExisting() {
        var pads = navigator.getGamepads ? navigator.getGamepads() : [];
        for (var i = 0; i < pads.length; i++) {
            if (pads[i] && !connected) { activate(pads[i]); break; }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scanExisting);
    } else {
        scanExisting();
    }
})();
