// Questions Wheel module
// Renders an SVG wheel of question sections. Spins on a button click and
// shows a modal with the picked question's full content.

const WHEEL_SVG_NS = 'http://www.w3.org/2000/svg';
const WHEEL_DEFAULT_COLOR = '#888888';
const WHEEL_PREFS_KEY = 'examiner_wheel_prefs';
const WHEEL_GROUPS_KEY = 'examiner_wheel_groups';
const WHEEL_QUESTION_GROUPS_KEY = 'examiner_wheel_question_groups';

const WHEEL_DEFAULT_PREFS = {
    size: 100,
    textScale: 50,
    spinTimeMs: 4000,
    hubSize: 15,
    showHints: true,
    textOuter: false,
    dynamicRotation: false,
    centered: true,
    timerEnabled: false,
};

let wheelInstance = null;

function loadWheelPrefs() {
    try {
        let p = JSON.parse(localStorage.getItem(WHEEL_PREFS_KEY));
        if (p && typeof p === 'object') {
            return {
                size:            typeof p.size === 'number' ? p.size : WHEEL_DEFAULT_PREFS.size,
                textScale:       typeof p.textScale === 'number' ? p.textScale : WHEEL_DEFAULT_PREFS.textScale,
                spinTimeMs:      typeof p.spinTimeMs === 'number' ? p.spinTimeMs : WHEEL_DEFAULT_PREFS.spinTimeMs,
                hubSize:         typeof p.hubSize === 'number' ? p.hubSize : WHEEL_DEFAULT_PREFS.hubSize,
                showHints:       p.showHints !== false,
                textOuter:       p.textOuter === true,
                dynamicRotation: p.dynamicRotation === true,
                centered:        p.centered !== false,
                timerEnabled:    p.timerEnabled === true,
            };
        }
    } catch {}
    return Object.assign({}, WHEEL_DEFAULT_PREFS);
}

function saveWheelPrefs(prefs) {
    try { localStorage.setItem(WHEEL_PREFS_KEY, JSON.stringify(prefs)); } catch {}
}

// Groups + question→group assignments are stored per DLC name.
function loadWheelGroups(dlcName) {
    try {
        let all = JSON.parse(localStorage.getItem(WHEEL_GROUPS_KEY)) || {};
        let g = all[dlcName];
        return Array.isArray(g) ? g : [];
    } catch { return []; }
}
function saveWheelGroups(dlcName, groups) {
    try {
        let all = JSON.parse(localStorage.getItem(WHEEL_GROUPS_KEY)) || {};
        all[dlcName] = groups;
        localStorage.setItem(WHEEL_GROUPS_KEY, JSON.stringify(all));
    } catch {}
}
function loadQuestionGroups(dlcName) {
    try {
        let all = JSON.parse(localStorage.getItem(WHEEL_QUESTION_GROUPS_KEY)) || {};
        let g = all[dlcName];
        return (g && typeof g === 'object') ? g : {};
    } catch { return {}; }
}
function saveQuestionGroups(dlcName, mapping) {
    try {
        let all = JSON.parse(localStorage.getItem(WHEEL_QUESTION_GROUPS_KEY)) || {};
        all[dlcName] = mapping;
        localStorage.setItem(WHEEL_QUESTION_GROUPS_KEY, JSON.stringify(all));
    } catch {}
}

function startWheel(dlc) {
    document.getElementById('title').hidden = true;
    document.getElementById('examiner').hidden = true;
    document.getElementById('wheelView').hidden = false;
    document.body.style.overflow = 'hidden';

    let nameEl = document.getElementById('wheel-dlc-name');
    if (nameEl) nameEl.innerText = dlc.name || 'Questions Wheel';
    document.title = (dlc.name || 'Questions Wheel') + ' - Examiner v2';

    wheelInstance = new QuestionsWheel(dlc.data, dlc.name || 'Wheel');
    wheelInstance.attach();
}

function toggleWheelConfig(event) {
    if (event) event.stopPropagation();
    let panel = document.getElementById('wheelConfigPanel');
    if (!panel) return;
    let willOpen = panel.hidden;
    // Close sound panels too so they don't stack
    document.querySelectorAll('.sound-panel').forEach(p => p.hidden = true);
    panel.hidden = !willOpen;
}

function easeOutQuint(t) {
    return 1 - Math.pow(1 - t, 5);
}

class QuestionsWheel {
    constructor(questions, dlcName) {
        // Master list (input order). The sidebar always renders this set,
        // sorted by color, so it stays easy to find a question.
        this.questions = questions.slice();
        // Order used to lay sections on the wheel — shuffled independently
        // of the sidebar order.
        this.wheelOrder = questions.slice();
        this.hidden = new Set();
        this.rotation = 0;
        this.spinning = false;
        this.selected = null;
        this.searchQuery = '';
        this.prefs = loadWheelPrefs();
        this.hintRevealed = false;
        this.dlcName = dlcName || 'default';
        this.groups = loadWheelGroups(this.dlcName);
        this.questionGroups = loadQuestionGroups(this.dlcName);
        this.timerInterval = null;
        this.timerStart = 0;
    }

    get active() {
        return this.wheelOrder.filter(q => !this.hidden.has(q.id));
    }

    attach() {
        this.applySize();
        this.applyTextScale();
        this.applyHubSize();
        this.applyCentered();
        this.applyTimerVisibility();

        let hub = document.getElementById('wheelHub');
        if (hub) hub.onclick = () => this.spin();

        document.getElementById('wheelModalClose').onclick = () => {
            playSound('next');
            this.closeModal();
        };
        document.getElementById('wheelModalHide').onclick = () => {
            playSound('navigate');
            this.hideSelected();
        };
        document.getElementById('wheelModalShowHint').onclick = () => {
            // 'show' is played by toggleHintReveal when actually revealing
            this.toggleHintReveal();
        };

        // Spacebar triggers spin when the modal is not open
        document.addEventListener('keydown', (e) => {
            if (e.code !== 'Space') return;
            if (!document.getElementById('wheelModal').hidden) return;
            e.preventDefault();
            this.spin();
        });

        // ── Config panel ─────────────────────────────────────────────────────
        let sizeSlider = document.getElementById('wheelSizeSlider');
        if (sizeSlider) {
            sizeSlider.value = this.prefs.size;
            this.updateSizeLabel();
            sizeSlider.oninput = (e) => {
                this.prefs.size = parseInt(e.target.value, 10);
                this.applySize();
                this.updateSizeLabel();
                saveWheelPrefs(this.prefs);
            };
        }

        let textSlider = document.getElementById('wheelTextSizeSlider');
        if (textSlider) {
            textSlider.value = this.prefs.textScale;
            this.updateTextLabel();
            textSlider.oninput = (e) => {
                this.prefs.textScale = parseInt(e.target.value, 10);
                this.applyTextScale();
                this.updateTextLabel();
                this.renderWheel();
                saveWheelPrefs(this.prefs);
            };
        }

        let spinSlider = document.getElementById('wheelSpinTimeSlider');
        if (spinSlider) {
            spinSlider.value = this.prefs.spinTimeMs;
            this.updateSpinTimeLabel();
            spinSlider.oninput = (e) => {
                this.prefs.spinTimeMs = parseInt(e.target.value, 10);
                this.updateSpinTimeLabel();
                saveWheelPrefs(this.prefs);
            };
        }

        let hubSlider = document.getElementById('wheelHubSizeSlider');
        if (hubSlider) {
            hubSlider.value = this.prefs.hubSize;
            this.updateHubSizeLabel();
            hubSlider.oninput = (e) => {
                this.prefs.hubSize = parseInt(e.target.value, 10);
                this.applyHubSize();
                this.updateHubSizeLabel();
                this.renderWheel();
                saveWheelPrefs(this.prefs);
            };
        }

        // ── Editable value inputs ─────────────────────────────────────────────
        // Helper: wire a text input so the user can type a value directly.
        // parse(str) → raw number (in the displayed unit), apply(clamped) runs
        // the side-effects, refresh() re-renders the current stored value.
        let bindValueInput = (inputId, sliderEl, min, max, step, parse, apply, refresh) => {
            let inp = document.getElementById(inputId);
            if (!inp) return;
            inp.addEventListener('focus', () => inp.select());
            let commit = () => {
                let v = parse(inp.value);
                if (!isNaN(v) && isFinite(v)) {
                    v = Math.max(min, Math.min(max, Math.round(v / step) * step));
                    if (sliderEl) sliderEl.value = v;
                    apply(v);
                }
                refresh();
            };
            inp.addEventListener('blur', commit);
            inp.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); commit(); inp.blur(); }
                else if (e.key === 'Escape') { refresh(); inp.blur(); }
            });
        };

        bindValueInput('wheelSizeValue', sizeSlider, 60, 200, 5,
            s => parseInt(s, 10),
            v => { this.prefs.size = v; this.applySize(); saveWheelPrefs(this.prefs); },
            () => this.updateSizeLabel()
        );
        bindValueInput('wheelTextSizeValue', textSlider, 20, 400, 5,
            s => parseInt(s, 10),
            v => { this.prefs.textScale = v; this.applyTextScale(); this.renderWheel(); saveWheelPrefs(this.prefs); },
            () => this.updateTextLabel()
        );
        bindValueInput('wheelSpinTimeValue', spinSlider, 1000, 10000, 250,
            s => Math.round(parseFloat(s) * 1000),
            v => { this.prefs.spinTimeMs = v; saveWheelPrefs(this.prefs); },
            () => this.updateSpinTimeLabel()
        );
        bindValueInput('wheelHubSizeValue', hubSlider, 8, 40, 1,
            s => parseInt(s, 10),
            v => { this.prefs.hubSize = v; this.applyHubSize(); this.renderWheel(); saveWheelPrefs(this.prefs); },
            () => this.updateHubSizeLabel()
        );

        let hintsSwitch = document.getElementById('wheelHintsSwitch');
        let hintsRow = document.getElementById('wheelHintsRow');
        let updateSwitch = () => hintsSwitch.classList.toggle('on', this.prefs.showHints);
        updateSwitch();
        if (hintsRow) {
            hintsRow.onclick = (e) => {
                e.preventDefault();
                this.prefs.showHints = !this.prefs.showHints;
                updateSwitch();
                saveWheelPrefs(this.prefs);
                // Re-apply to currently open modal, if any
                if (!document.getElementById('wheelModal').hidden && this.selected) {
                    this.applyHintsButton();
                }
            };
        }

        let outerSwitch = document.getElementById('wheelTextOuterSwitch');
        let outerRow = document.getElementById('wheelTextOuterRow');
        let updateOuterSwitch = () => outerSwitch && outerSwitch.classList.toggle('on', this.prefs.textOuter);
        updateOuterSwitch();
        if (outerRow) {
            outerRow.onclick = (e) => {
                e.preventDefault();
                this.prefs.textOuter = !this.prefs.textOuter;
                updateOuterSwitch();
                saveWheelPrefs(this.prefs);
                this.renderWheel();
            };
        }

        let dynSwitch = document.getElementById('wheelDynamicRotationSwitch');
        let dynRow = document.getElementById('wheelDynamicRotationRow');
        let updateDynSwitch = () => dynSwitch && dynSwitch.classList.toggle('on', this.prefs.dynamicRotation);
        updateDynSwitch();
        if (dynRow) {
            dynRow.onclick = (e) => {
                e.preventDefault();
                this.prefs.dynamicRotation = !this.prefs.dynamicRotation;
                updateDynSwitch();
                saveWheelPrefs(this.prefs);
                this.renderWheel();
            };
        }

        let centeredSwitch = document.getElementById('wheelCenteredSwitch');
        let centeredRow = document.getElementById('wheelCenteredRow');
        let updateCenteredSwitch = () => centeredSwitch && centeredSwitch.classList.toggle('on', this.prefs.centered);
        updateCenteredSwitch();
        if (centeredRow) {
            centeredRow.onclick = (e) => {
                e.preventDefault();
                this.prefs.centered = !this.prefs.centered;
                updateCenteredSwitch();
                saveWheelPrefs(this.prefs);
                this.applyCentered();
            };
        }

        let timerSwitch = document.getElementById('wheelTimerSwitch');
        let timerRow = document.getElementById('wheelTimerRow');
        let updateTimerSwitch = () => timerSwitch && timerSwitch.classList.toggle('on', this.prefs.timerEnabled);
        updateTimerSwitch();
        if (timerRow) {
            timerRow.onclick = (e) => {
                e.preventDefault();
                this.prefs.timerEnabled = !this.prefs.timerEnabled;
                updateTimerSwitch();
                saveWheelPrefs(this.prefs);
                this.applyTimerVisibility();
                // If a question is open, the timer should start counting
                // right away when newly enabled, and stop when disabled.
                if (!this.prefs.timerEnabled) this.stopTimer();
                else if (this.selected) this.startTimer();
            };
        }

        let groupsBtn = document.getElementById('wheelGroupsManageBtn');
        if (groupsBtn) {
            groupsBtn.onclick = (e) => {
                e.stopPropagation();
                this.openGroupsManager();
            };
        }

        let groupsClose = document.getElementById('wheelGroupsModalClose');
        if (groupsClose) {
            groupsClose.onclick = () => { document.getElementById('wheelGroupsModal').hidden = true; };
        }
        let groupsAdd = document.getElementById('wheelGroupsAddBtn');
        if (groupsAdd) {
            groupsAdd.onclick = () => this.addGroup();
        }
        let groupsModal = document.getElementById('wheelGroupsModal');
        if (groupsModal) {
            groupsModal.addEventListener('click', (e) => {
                if (e.target === groupsModal) groupsModal.hidden = true;
            });
        }

        // Close config panel on outside click
        let configPanel = document.getElementById('wheelConfigPanel');
        let configBtn = document.getElementById('wheelConfigButton');
        if (configPanel) configPanel.addEventListener('click', (e) => e.stopPropagation());
        document.addEventListener('click', (e) => {
            if (!configPanel || configPanel.hidden) return;
            if (configBtn && configBtn.contains(e.target)) return;
            if (configPanel.contains(e.target)) return;
            configPanel.hidden = true;
        });

        // ── Sidebar controls ─────────────────────────────────────────────────
        let searchBtn = document.getElementById('wheelSearchBtn');
        let searchBar = document.getElementById('wheelSearchBar');
        let searchInput = document.getElementById('wheelQuestionSearch');
        if (searchBtn) {
            searchBtn.onclick = () => {
                searchBar.hidden = !searchBar.hidden;
                if (!searchBar.hidden) {
                    searchInput.focus();
                } else {
                    searchInput.value = '';
                    this.searchQuery = '';
                    this.renderSidebar();
                }
            };
        }
        if (searchInput) {
            searchInput.oninput = (e) => {
                this.searchQuery = e.target.value.trim().toLowerCase();
                this.renderSidebar();
            };
        }

        let shuffleBtn = document.getElementById('wheelShuffleBtn');
        if (shuffleBtn) {
            shuffleBtn.onclick = () => this.shuffleWheel();
        }

        let showAllBtn = document.getElementById('wheelShowAllBtn');
        if (showAllBtn) {
            showAllBtn.onclick = () => this.showAllQuestions();
        }

        this.render();
    }

    shuffleWheel() {
        if (this.spinning) return;
        shuffle(this.wheelOrder);
        this.resetSpinner();
        this.renderWheel();
        this.updateSpinButton();
        playSound('wheel-shuffle');
    }

    showAllQuestions() {
        if (this.spinning) return;
        if (this.hidden.size === 0) return;
        this.hidden.clear();
        this.resetSpinner();
        this.render();
        playSound('select');
    }

    applySize() {
        let view = document.getElementById('wheelView');
        if (view) view.style.setProperty('--wheel-scale', (this.prefs.size / 100).toString());
    }

    applyTextScale() {
        // text scale is read directly by renderWheel via this.prefs.textScale
    }

    applyHubSize() {
        let view = document.getElementById('wheelView');
        if (view) view.style.setProperty('--wheel-hub-size', this.prefs.hubSize + '%');
    }

    applyCentered() {
        let view = document.getElementById('wheelView');
        if (view) view.classList.toggle('wheel-centered', this.prefs.centered);
    }

    applyTimerVisibility() {
        let sec = document.getElementById('wheelTimeSection');
        let timer = document.getElementById('wheelTimer');
        let on = this.prefs.timerEnabled;
        if (sec) sec.hidden = !on;
        if (timer) timer.hidden = !on;
    }

    startTimer() {
        if (!this.prefs.timerEnabled) return;
        if (this.timerInterval) return;
        this.timerStart = Date.now();
        let render = () => {
            let el = document.getElementById('wheelTimer');
            if (!el) return;
            let ms = Date.now() - this.timerStart;
            let s = Math.floor(ms / 1000);
            let m = Math.floor(s / 60);
            let h = Math.floor(m / 60);
            el.innerText = (h > 0 ? String(h).padStart(2, '0') + ' : ' : '')
                + String(m % 60).padStart(2, '0') + ' : '
                + String(s % 60).padStart(2, '0');
        };
        render();
        this.timerInterval = setInterval(render, 500);
    }

    stopTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = null;
        let el = document.getElementById('wheelTimer');
        if (el) el.innerText = '00 : 00';
    }

    updateHubSizeLabel() {
        let el = document.getElementById('wheelHubSizeValue');
        if (el && document.activeElement !== el) el.value = this.prefs.hubSize + '%';
    }

    updateSizeLabel() {
        let el = document.getElementById('wheelSizeValue');
        if (el && document.activeElement !== el) el.value = this.prefs.size + '%';
    }

    updateTextLabel() {
        let el = document.getElementById('wheelTextSizeValue');
        if (el && document.activeElement !== el) el.value = this.prefs.textScale + '%';
    }

    updateSpinTimeLabel() {
        let el = document.getElementById('wheelSpinTimeValue');
        if (el && document.activeElement !== el) el.value = (this.prefs.spinTimeMs / 1000).toFixed(2).replace(/\.?0+$/, '') + 's';
    }

    render() {
        this.renderWheel();
        this.renderSidebar();
        this.updateSpinButton();
    }

    updateSpinButton() {
        let hub = document.getElementById('wheelHub');
        if (!hub) return;
        let n = this.active.length;
        let disabled = this.spinning || n === 0;
        hub.style.opacity = disabled ? '0.45' : '';
        hub.style.cursor = disabled ? 'not-allowed' : '';
        hub.textContent = this.spinning ? '…' : 'SPIN';
    }

    renderWheel() {
        let svg = document.getElementById('wheelSvg');
        let size = 600;
        let cx = size / 2;
        let cy = size / 2;
        let radius = size / 2 - 8;
        let active = this.active;
        let n = active.length;

        while (svg.firstChild) svg.removeChild(svg.firstChild);

        if (n === 0) {
            let msg = document.createElementNS(WHEEL_SVG_NS, 'text');
            msg.setAttribute('x', cx);
            msg.setAttribute('y', cy);
            msg.setAttribute('text-anchor', 'middle');
            msg.setAttribute('dominant-baseline', 'middle');
            msg.setAttribute('fill', '#555');
            msg.setAttribute('font-size', '26');
            msg.textContent = 'No questions';
            svg.appendChild(msg);
            return;
        }

        if (n === 1) {
            let circ = document.createElementNS(WHEEL_SVG_NS, 'circle');
            circ.setAttribute('cx', cx);
            circ.setAttribute('cy', cy);
            circ.setAttribute('r', radius);
            circ.setAttribute('fill', this.colorFor(active[0]));
            circ.setAttribute('stroke', '#1a1a1a');
            circ.setAttribute('stroke-width', '3');
            svg.appendChild(circ);
            this.appendSectorText(svg, active[0], cx, cy, radius, -90, 360);
            return;
        }

        let step = 360 / n;
        for (let i = 0; i < n; i++) {
            let startAngle = i * step - 90;
            let endAngle = startAngle + step;
            let path = this.makeSectorPath(cx, cy, radius, startAngle, endAngle);
            let sector = document.createElementNS(WHEEL_SVG_NS, 'path');
            sector.setAttribute('d', path);
            sector.setAttribute('fill', this.colorFor(active[i]));
            sector.setAttribute('stroke', '#1a1a1a');
            sector.setAttribute('stroke-width', '2');
            svg.appendChild(sector);

            let midAngle = startAngle + step / 2;
            this.appendSectorText(svg, active[i], cx, cy, radius, midAngle, step);
        }
    }

    colorFor(q) {
        if (q && this.questionGroups && this.questionGroups[q.id]) {
            let grp = this.groups.find(g => g.name === this.questionGroups[q.id]);
            if (grp && typeof grp.color === 'string') return grp.color;
        }
        let c = q && q.question && q.question.color;
        if (typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c)) return c;
        return WHEEL_DEFAULT_COLOR;
    }

    makeSectorPath(cx, cy, r, startAngle, endAngle) {
        let start = polarToCartesian(cx, cy, r, startAngle);
        let end = polarToCartesian(cx, cy, r, endAngle);
        let largeArc = (endAngle - startAngle) > 180 ? 1 : 0;
        return [
            'M', cx, cy,
            'L', start.x, start.y,
            'A', r, r, 0, largeArc, 1, end.x, end.y,
            'Z'
        ].join(' ');
    }

    appendSectorText(svg, q, cx, cy, radius, midAngle, step) {
        let title = (q.question && q.question.title) || ('Question #' + q.id);
        let textScale = this.prefs.textScale / 100;
        let textOuter = this.prefs.textOuter;
        let dynamic = this.prefs.dynamicRotation;

        // Hub radius in svg coords. The hub div is sized as a percentage of
        // the wheel diameter (= 2 * cx); its radius is half of that.
        let hubRadius = (this.prefs.hubSize / 100) * cx;
        // Real padding so labels don't kiss the hub or the rim.
        let pad = cx * 0.05;
        let innerR = hubRadius + pad;
        let outerR = radius - pad;
        if (outerR < innerR + 10) outerR = innerR + 10; // degenerate safety
        let availLen = outerR - innerR;

        // Flip decision.
        // Auto-rotate OFF: always flip so every label consistently reads
        // outer → inner in the sector's local frame (no conditional on angle).
        // Auto-rotate ON: flip based on absolute screen-space angle so labels
        // stay upright after a spin.
        let flipped;
        if (dynamic) {
            let effAngle = midAngle + (this.rotation || 0);
            effAngle = ((effAngle + 180) % 360 + 360) % 360 - 180;
            flipped = effAngle > 90 || effAngle < -90;
        } else {
            flipped = true;
        }

        // Position: centered (midpoint of the radial range) or anchored at
        // the outer rim with the text extending inward.
        let textRadius = textOuter ? outerR : (innerR + outerR) / 2;
        let pos = polarToCartesian(cx, cy, textRadius, midAngle);

        // Maximum readable font height for this sector — the text is laid out
        // radially, so its "height" after rotation is bounded by the angular
        // width of the sector at textRadius. The 0.78 factor leaves a tiny gap
        // between neighbouring labels. Use midpoint for the constraint even
        // when outer-aligned, since long labels extend inward into the narrower
        // part of the sector.
        let angularLimit = ((innerR + outerR) / 2) * (step * Math.PI / 180) * 0.78;
        let baseFontSize = Math.min(angularLimit, 22);
        let fontSize = Math.max(6, baseFontSize * textScale);

        // text-anchor: when centered we use 'middle'. When outer-aligned the
        // text should always extend from the rim toward the centre — which
        // direction "inward" is in the text's local frame depends on flip.
        let anchor;
        if (textOuter) anchor = flipped ? 'start' : 'end';
        else anchor = 'middle';

        let txt = document.createElementNS(WHEEL_SVG_NS, 'text');
        txt.setAttribute('x', pos.x);
        txt.setAttribute('y', pos.y);
        txt.setAttribute('text-anchor', anchor);
        txt.setAttribute('dominant-baseline', 'middle');
        txt.setAttribute('fill', '#ffffff');
        txt.setAttribute('font-weight', 'bold');
        txt.setAttribute('font-size', fontSize);
        txt.setAttribute('paint-order', 'stroke');
        txt.setAttribute('stroke', 'rgba(0,0,0,0.55)');
        txt.setAttribute('stroke-width', Math.max(1, fontSize * 0.1));
        txt.setAttribute('stroke-linejoin', 'round');

        let rotation = midAngle + (flipped ? 180 : 0);
        txt.setAttribute('transform', 'rotate(' + rotation + ' ' + pos.x + ' ' + pos.y + ')');
        txt.style.pointerEvents = 'none';
        txt.textContent = title;
        svg.appendChild(txt);

        // Truncate to whatever naturally fits the radial space and add "…".
        // No glyph squeezing or letter-spacing changes — text renders at its
        // natural width and gets shorter when it doesn't fit.
        try {
            if (txt.getBBox().width > availLen) {
                let lo = 0, hi = title.length - 1, best = 0;
                while (lo <= hi) {
                    let mid = (lo + hi) >> 1;
                    txt.textContent = title.substring(0, mid) + '…';
                    if (txt.getBBox().width <= availLen) {
                        best = mid;
                        lo = mid + 1;
                    } else {
                        hi = mid - 1;
                    }
                }
                txt.textContent = best === 0 ? '…' : title.substring(0, best) + '…';
            }
        } catch (e) {}
    }

    renderSidebar() {
        let list = document.getElementById('wheelQuestionList');
        list.innerHTML = '';
        let q = this.searchQuery;

        let matchesQuery = (question) => {
            if (!q) return true;
            let title = (question.question && question.question.title) || ('Question #' + question.id);
            return title.toLowerCase().includes(q);
        };

        let useGroups = this.groups.length > 0
            && this.questions.some(qq => this.questionGroups[qq.id]);

        if (useGroups) {
            let buckets = {};
            this.groups.forEach(g => { buckets[g.name] = []; });
            let ungrouped = [];

            this.questions.forEach(question => {
                if (!matchesQuery(question)) return;
                let gname = this.questionGroups[question.id];
                if (gname && buckets[gname]) buckets[gname].push(question);
                else ungrouped.push(question);
            });

            this.groups.forEach(g => {
                let items = buckets[g.name];
                if (!items || items.length === 0) return;
                let header = document.createElement('div');
                header.className = 'wheel-group-header';
                header.style.borderLeftColor = g.color;
                header.textContent = g.name;
                list.appendChild(header);
                items.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
                items.forEach(question => list.appendChild(this.makeSidebarItem(question)));
            });

            if (ungrouped.length > 0) {
                let header = document.createElement('div');
                header.className = 'wheel-group-header';
                header.style.borderLeftColor = '#555';
                header.textContent = 'Ungrouped';
                list.appendChild(header);
                ungrouped.sort((a, b) => {
                    let ha = hexToHue(this.colorFor(a));
                    let hb = hexToHue(this.colorFor(b));
                    if (ha !== hb) return ha - hb;
                    return (a.id ?? 0) - (b.id ?? 0);
                });
                ungrouped.forEach(question => list.appendChild(this.makeSidebarItem(question)));
            }
            return;
        }

        // Default: sort by hue so same-color questions are next to each
        // other, then by id for stability within a color group.
        let sorted = this.questions.slice().sort((a, b) => {
            let ha = hexToHue(this.colorFor(a));
            let hb = hexToHue(this.colorFor(b));
            if (ha !== hb) return ha - hb;
            return (a.id ?? 0) - (b.id ?? 0);
        });

        sorted.forEach(question => {
            if (!matchesQuery(question)) return;
            list.appendChild(this.makeSidebarItem(question));
        });
    }

    makeSidebarItem(question) {
        let title = (question.question && question.question.title) || ('Question #' + question.id);
        let isHidden = this.hidden.has(question.id);
        let item = document.createElement('div');
        item.className = 'wheel-question-item' + (isHidden ? ' off' : '');
        item.onclick = () => this.toggleQuestion(question.id);

        let dot = document.createElement('span');
        dot.className = 'wheel-question-color';
        dot.style.background = this.colorFor(question);
        dot.title = 'Click to assign a group';
        dot.onclick = (e) => {
            e.stopPropagation();
            this.showGroupPicker(question, dot);
        };

        let titleEl = document.createElement('span');
        titleEl.className = 'wheel-question-title';
        titleEl.textContent = title;

        let toggle = document.createElement('span');
        toggle.className = 'wheel-question-toggle';
        toggle.textContent = isHidden ? '✕' : '✓';

        item.appendChild(dot);
        item.appendChild(titleEl);
        item.appendChild(toggle);

        // Full-title tooltip on hover, matching prompter-mode behaviour.
        setupTooltip(item, title);

        return item;
    }

    showGroupPicker(question, anchor) {
        let existing = document.getElementById('wheelGroupPicker');
        if (existing) existing.remove();

        let pop = document.createElement('div');
        pop.id = 'wheelGroupPicker';
        pop.className = 'wheel-group-picker';

        let makeItem = (label, color, selected, onPick) => {
            let row = document.createElement('div');
            row.className = 'wheel-group-picker-item' + (selected ? ' selected' : '');
            if (color) {
                let d = document.createElement('span');
                d.className = 'wheel-question-color';
                d.style.background = color;
                row.appendChild(d);
            }
            let lbl = document.createElement('span');
            lbl.textContent = label;
            row.appendChild(lbl);
            row.onclick = (e) => {
                e.stopPropagation();
                onPick();
                pop.remove();
            };
            return row;
        };

        let current = this.questionGroups[question.id];
        pop.appendChild(makeItem('— None —', null, !current, () => {
            delete this.questionGroups[question.id];
            saveQuestionGroups(this.dlcName, this.questionGroups);
            this.render();
        }));

        this.groups.forEach(g => {
            pop.appendChild(makeItem(g.name, g.color, current === g.name, () => {
                this.questionGroups[question.id] = g.name;
                saveQuestionGroups(this.dlcName, this.questionGroups);
                this.render();
            }));
        });

        let divider = document.createElement('div');
        divider.className = 'wheel-group-picker-divider';
        pop.appendChild(divider);

        let manage = document.createElement('div');
        manage.className = 'wheel-group-picker-item wheel-group-picker-manage';
        manage.textContent = 'Manage groups…';
        manage.onclick = (e) => {
            e.stopPropagation();
            pop.remove();
            this.openGroupsManager();
        };
        pop.appendChild(manage);

        document.body.appendChild(pop);
        let rect = anchor.getBoundingClientRect();
        pop.style.left = rect.left + 'px';
        pop.style.top = (rect.bottom + 4) + 'px';
        let pr = pop.getBoundingClientRect();
        if (pr.right > window.innerWidth) {
            pop.style.left = (window.innerWidth - pr.width - 8) + 'px';
        }
        if (pr.bottom > window.innerHeight) {
            pop.style.top = (rect.top - pr.height - 4) + 'px';
        }

        let onDocClick = (e) => {
            if (!pop.contains(e.target)) {
                pop.remove();
                document.removeEventListener('click', onDocClick, true);
            }
        };
        setTimeout(() => document.addEventListener('click', onDocClick, true), 0);
    }

    openGroupsManager() {
        let modal = document.getElementById('wheelGroupsModal');
        if (!modal) return;
        modal.hidden = false;
        this.renderGroupsManager();
    }

    addGroup() {
        // Pick a default color that hasn't been used yet, falling back to a
        // bright palette pick.
        let palette = ['#e53935','#1e88e5','#43a047','#fb8c00','#8e24aa','#00897b','#f4511e','#3949ab'];
        let used = new Set(this.groups.map(g => g.color));
        let color = palette.find(c => !used.has(c)) || palette[this.groups.length % palette.length];
        let name = 'Group ' + (this.groups.length + 1);
        this.groups.push({ name, color });
        saveWheelGroups(this.dlcName, this.groups);
        this.renderGroupsManager();
        this.render();
    }

    renderGroupsManager() {
        let body = document.getElementById('wheelGroupsManagerBody');
        if (!body) return;
        body.innerHTML = '';

        if (this.groups.length === 0) {
            let empty = document.createElement('div');
            empty.className = 'wheel-groups-empty';
            empty.textContent = 'No groups yet. Click "+ Add group" to create one.';
            body.appendChild(empty);
            return;
        }

        this.groups.forEach((g, idx) => {
            let row = document.createElement('div');
            row.className = 'wheel-groups-row';

            let colorInput = document.createElement('input');
            colorInput.type = 'color';
            colorInput.value = g.color;
            colorInput.className = 'wheel-groups-color';
            colorInput.oninput = () => {
                this.groups[idx].color = colorInput.value;
                saveWheelGroups(this.dlcName, this.groups);
                this.render();
            };

            let nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.value = g.name;
            nameInput.className = 'wheel-groups-name';
            nameInput.placeholder = 'Group name';
            let commitName = () => {
                let newName = nameInput.value.trim();
                if (!newName || newName === this.groups[idx].name) {
                    nameInput.value = this.groups[idx].name;
                    return;
                }
                // Disallow duplicate names — they identify a group.
                if (this.groups.some((gg, i) => i !== idx && gg.name === newName)) {
                    nameInput.value = this.groups[idx].name;
                    return;
                }
                let oldName = this.groups[idx].name;
                Object.keys(this.questionGroups).forEach(k => {
                    if (this.questionGroups[k] === oldName) this.questionGroups[k] = newName;
                });
                this.groups[idx].name = newName;
                saveWheelGroups(this.dlcName, this.groups);
                saveQuestionGroups(this.dlcName, this.questionGroups);
                this.render();
            };
            nameInput.onchange = commitName;
            nameInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); commitName(); nameInput.blur(); }
            });

            let del = document.createElement('button');
            del.className = 'wheel-groups-delete';
            del.textContent = '✕';
            del.title = 'Delete group';
            del.onclick = () => {
                let oldName = this.groups[idx].name;
                this.groups.splice(idx, 1);
                Object.keys(this.questionGroups).forEach(k => {
                    if (this.questionGroups[k] === oldName) delete this.questionGroups[k];
                });
                saveWheelGroups(this.dlcName, this.groups);
                saveQuestionGroups(this.dlcName, this.questionGroups);
                this.renderGroupsManager();
                this.render();
            };

            row.appendChild(colorInput);
            row.appendChild(nameInput);
            row.appendChild(del);
            body.appendChild(row);
        });
    }

    toggleQuestion(id) {
        if (this.spinning) return;
        let wasHidden = this.hidden.has(id);
        if (wasHidden) {
            this.hidden.delete(id);
        } else {
            this.hidden.add(id);
        }
        this.resetSpinner();
        this.render();
        // Show = select, hide = deselect — reuse prompter UI sounds.
        playSound(wasHidden ? 'select' : 'deselect');
    }

    resetSpinner() {
        this.rotation = 0;
        let spinner = document.getElementById('wheelSpinner');
        spinner.style.transition = 'none';
        spinner.style.transform = 'rotate(0deg)';
        void spinner.offsetWidth;
    }

    spin() {
        if (this.spinning) return;
        let active = this.active;
        if (active.length === 0) return;

        this.spinning = true;
        this.updateSpinButton();

        let n = active.length;
        let step = 360 / n;
        let pickedIdx = Math.floor(Math.random() * n);
        let picked = active[pickedIdx];

        let midAngle = pickedIdx * step - 90 + step / 2;
        let randomOffset = (Math.random() - 0.5) * step * 0.7;
        let targetMod = -90 - midAngle + randomOffset;
        let normalize = (a) => ((a % 360) + 360) % 360;
        let currentMod = normalize(this.rotation);
        let targetNorm = normalize(targetMod);
        let delta = targetNorm - currentMod;
        if (delta < 0) delta += 360;
        let fullSpins = 5;
        let totalDelta = delta + 360 * fullSpins;
        let startRotation = this.rotation;
        let endRotation = startRotation + totalDelta;
        this.rotation = endRotation;

        let spinner = document.getElementById('wheelSpinner');
        spinner.style.transition = 'none';

        let startTime = performance.now();
        let duration = this.prefs.spinTimeMs;
        let lastTickSection = 0;

        let animate = (now) => {
            let elapsed = now - startTime;
            let t = Math.min(1, elapsed / duration);
            let eased = easeOutQuint(t);
            let currentRot = startRotation + totalDelta * eased;
            spinner.style.transform = 'rotate(' + currentRot + 'deg)';

            let passed = Math.floor((currentRot - startRotation) / step);
            while (lastTickSection < passed) {
                lastTickSection++;
                playSound('wheel-tick');
            }

            if (t < 1) {
                requestAnimationFrame(animate);
            } else {
                this.spinning = false;
                this.updateSpinButton();
                playSound('wheel-land');
                if (this.prefs.dynamicRotation) this.renderWheel();
                this.showQuestionModal(picked);
            }
        };
        requestAnimationFrame(animate);
    }

    showQuestionModal(question) {
        this.selected = question;
        this.hintRevealed = false;

        let modal = document.getElementById('wheelModal');
        let body = document.getElementById('wheelModalBody');
        let colorBar = document.getElementById('wheelModalColorBar');
        body.innerHTML = '';
        colorBar.style.background = this.colorFor(question);

        let titleEl = document.createElement('div');
        titleEl.className = 'wheel-modal-title';
        titleEl.textContent = (question.question && question.question.title) || ('Question #' + question.id);
        body.appendChild(titleEl);

        let contentEl = document.createElement('div');
        contentEl.className = 'wheel-modal-content';
        let qContentType = (question.question && question.question.type) || 'text';
        let qContent = (question.question && question.question.content) || '';
        if (qContentType === 'image') {
            let img = document.createElement('img');
            img.src = qContent;
            img.alt = titleEl.textContent;
            contentEl.appendChild(img);
        } else {
            contentEl.textContent = qContent;
        }
        body.appendChild(contentEl);

        if (Array.isArray(question.answers) && question.answers.length > 0) {
            let hintsHeader = document.createElement('div');
            hintsHeader.className = 'wheel-modal-answers-header';
            hintsHeader.textContent = 'Hints';
            body.appendChild(hintsHeader);

            let list = document.createElement('div');
            list.className = 'wheel-modal-answers';
            question.answers.forEach(a => {
                let row = document.createElement('div');
                row.className = 'wheel-modal-answer';
                let content = typeof a === 'string' ? a : (a && a.content) || '';
                let mdEl = document.createElement('zero-md');
                mdEl.setAttribute('src', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
                let tpl = document.createElement('template');
                tpl.innerHTML = '<link rel="stylesheet" href="css/md.css?v=6">'
                    + '<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/PrismJS/prism@1/themes/prism.min.css"/>';
                mdEl.appendChild(tpl);
                row.appendChild(mdEl);
                list.appendChild(row);
            });
            body.appendChild(list);
        }

        this.applyHintsButton();
        modal.hidden = false;
        this.startTimer();
    }

    applyHintsButton() {
        // Hints are hidden by default and only revealed on demand.
        // The "Show hint" button is only visible if hints are enabled in
        // prefs and the current question has any.
        let hasHints = this.selected
            && Array.isArray(this.selected.answers)
            && this.selected.answers.length > 0;

        let btn = document.getElementById('wheelModalShowHint');
        let header = document.querySelector('#wheelModalBody .wheel-modal-answers-header');
        let list = document.querySelector('#wheelModalBody .wheel-modal-answers');

        let canShow = hasHints && this.prefs.showHints;
        btn.hidden = !canShow;
        if (!canShow) {
            // Hide hint elements entirely
            if (header) header.style.display = 'none';
            if (list) list.style.display = 'none';
            return;
        }

        if (this.hintRevealed) {
            btn.textContent = 'Hide hint';
            if (header) header.style.display = '';
            if (list) list.style.display = '';
        } else {
            btn.textContent = 'Show hint';
            if (header) header.style.display = 'none';
            if (list) list.style.display = 'none';
        }
    }

    toggleHintReveal() {
        if (!this.prefs.showHints) return;
        this.hintRevealed = !this.hintRevealed;
        this.applyHintsButton();
        if (this.hintRevealed) playSound('show');
    }

    closeModal() {
        document.getElementById('wheelModal').hidden = true;
        this.selected = null;
        this.hintRevealed = false;
        this.stopTimer();
    }

    hideSelected() {
        if (!this.selected) {
            this.closeModal();
            return;
        }
        this.hidden.add(this.selected.id);
        let isLast = this.active.length === 0;
        this.closeModal();
        this.resetSpinner();
        if (isLast) {
            playSound('finish');
            document.getElementById('wheelView').hidden = true;
            document.body.style.overflow = '';
            showEndscreen('Congratulations!', 'You have answered all questions!');
            return;
        }
        this.render();
    }
}

function polarToCartesian(cx, cy, r, angleDeg) {
    let a = angleDeg * Math.PI / 180;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function hexToHue(hex) {
    if (typeof hex !== 'string') return 0;
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    if (c.length === 4) c = c.slice(0,3).split('').map(x => x + x).join('');
    if (c.length === 8) c = c.slice(0, 6);
    if (c.length !== 6) return 0;
    let r = parseInt(c.slice(0,2), 16) / 255;
    let g = parseInt(c.slice(2,4), 16) / 255;
    let b = parseInt(c.slice(4,6), 16) / 255;
    let max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max === min) return -1; // grayscale → keep first
    let h;
    if (max === r) h = ((g - b) / (max - min)) % 6;
    else if (max === g) h = (b - r) / (max - min) + 2;
    else h = (r - g) / (max - min) + 4;
    h *= 60;
    if (h < 0) h += 360;
    return h;
}
