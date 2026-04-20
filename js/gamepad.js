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

            // D-pad up/down → navigate between answers
            if (just(gp, BTN.DP_DOWN)) moveFocus(1);
            if (just(gp, BTN.DP_UP))   moveFocus(-1);

            // D-pad left/right → previous / next question
            if (just(gp, BTN.DP_LEFT)  || just(gp, BTN.LB)) pressLeft();
            if (just(gp, BTN.DP_RIGHT) || just(gp, BTN.RB)) pressRight();

            // Y / Start → confirm (check answers / show answer / continue)
            if (just(gp, BTN.Y) || just(gp, BTN.START)) pressY();

            // A → select answer / self-assessment show or mark correct
            if (just(gp, BTN.A)) pressA();

            // X → dismiss focused answer / unmark
            if (just(gp, BTN.X)) pressX();

            // B → self-assessment mark incorrect
            if (just(gp, BTN.B)) pressB();

            prev = ns;
        }
        rafId = requestAnimationFrame(tick);
    }

    // Y: check/confirm/continue — always clicks checkButton
    function pressY() {
        clickBtn('checkButton');
    }

    // A: select focused answer (q-with-a) / show answer or mark correct (self-assessment)
    //    after answers are checked: move to next question
    function pressA() {
        var correct = document.querySelector('.self-assessment-button-correct');
        if (correct) { correct.click(); return; }

        var skip = document.getElementById('skipButton');
        if (skip && skip.hidden) {
            clickBtn('checkButton');
            return;
        }

        var wrappers = document.querySelectorAll('#answersHolder .answer-wrapper');
        if (!wrappers.length) {
            // Self-assessment before answer is shown — A shows the answer
            clickBtn('checkButton');
            return;
        }

        if (focusedAns >= 0 && typeof select === 'function') {
            select(focusedAns);
        }
    }

    // B: self-assessment mark incorrect / after answers checked: move to next question
    function pressB() {
        var wrong = document.querySelector('.self-assessment-button-wrong');
        if (wrong) { wrong.click(); return; }

        var skip = document.getElementById('skipButton');
        if (skip && skip.hidden) {
            clickBtn('checkButton');
        }
    }

    // X: dismiss focused answer / unmark
    function pressX() {
        if (focusedAns >= 0 && typeof dismissAnswer === 'function') {
            dismissAnswer(focusedAns);
        } else {
            clickBtn('unmarkButton');
        }
    }

    function pressLeft()  { clickBtn('prevButton'); }
    function pressRight() { clickBtn('skipButton'); }

    function clickBtn(id) {
        var el = document.getElementById(id);
        if (el && !el.hidden && !el.disabled) el.click();
    }

    function moveFocus(dir) {
        var ws = document.querySelectorAll('#answersHolder .answer-wrapper');
        if (!ws.length) return;
        var next = focusedAns + dir;
        if (next < -1) next = -1;
        if (next >= ws.length) next = ws.length - 1;
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
