// Questions Wheel module
// Renders an SVG wheel of question sections. Spins on a button click and
// shows a modal with the picked question's full content.

const WHEEL_SVG_NS = 'http://www.w3.org/2000/svg';
const WHEEL_DEFAULT_COLOR = '#888888';
const WHEEL_PREFS_KEY = 'examiner_wheel_prefs';

const WHEEL_DEFAULT_PREFS = {
    size: 100,
    textScale: 100,
    spinTimeMs: 4500,
    showHints: true,
};

let wheelInstance = null;

function loadWheelPrefs() {
    try {
        let p = JSON.parse(localStorage.getItem(WHEEL_PREFS_KEY));
        if (p && typeof p === 'object') {
            return {
                size:       typeof p.size === 'number' ? p.size : WHEEL_DEFAULT_PREFS.size,
                textScale:  typeof p.textScale === 'number' ? p.textScale : WHEEL_DEFAULT_PREFS.textScale,
                spinTimeMs: typeof p.spinTimeMs === 'number' ? p.spinTimeMs : WHEEL_DEFAULT_PREFS.spinTimeMs,
                showHints:  p.showHints !== false,
            };
        }
    } catch {}
    return Object.assign({}, WHEEL_DEFAULT_PREFS);
}

function saveWheelPrefs(prefs) {
    try { localStorage.setItem(WHEEL_PREFS_KEY, JSON.stringify(prefs)); } catch {}
}

function startWheel(dlc) {
    document.getElementById('title').hidden = true;
    document.getElementById('examiner').hidden = true;
    document.getElementById('wheelView').hidden = false;

    let nameEl = document.getElementById('wheel-dlc-name');
    if (nameEl) nameEl.innerText = dlc.name || 'Questions Wheel';
    document.title = (dlc.name || 'Questions Wheel') + ' - Examiner v2';

    wheelInstance = new QuestionsWheel(dlc.data);
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
    constructor(questions) {
        this.questions = questions.slice();
        this.hidden = new Set();
        this.rotation = 0;
        this.spinning = false;
        this.selected = null;
        this.searchQuery = '';
        this.prefs = loadWheelPrefs();
        this.hintRevealed = false;
    }

    get active() {
        return this.questions.filter(q => !this.hidden.has(q.id));
    }

    attach() {
        this.applySize();
        this.applyTextScale();

        let spinBtn = document.getElementById('spinButton');
        spinBtn.onclick = () => this.spin();
        let hub = document.getElementById('wheelHub');
        if (hub) hub.onclick = () => this.spin();

        document.getElementById('wheelModalClose').onclick = () => this.closeModal();
        document.getElementById('wheelModalHide').onclick = () => this.hideSelected();
        document.getElementById('wheelModalShowHint').onclick = () => this.toggleHintReveal();

        let modal = document.getElementById('wheelModal');
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.closeModal();
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
            shuffleBtn.onclick = () => this.shuffleQuestions();
        }

        this.render();
    }

    shuffleQuestions() {
        if (this.spinning) return;
        shuffle(this.questions);
        this.resetSpinner();
        this.render();
        playSound('wheel-shuffle');
    }

    applySize() {
        let view = document.getElementById('wheelView');
        if (view) view.style.setProperty('--wheel-scale', (this.prefs.size / 100).toString());
    }

    applyTextScale() {
        // text scale is read directly by renderWheel via this.prefs.textScale
    }

    updateSizeLabel() {
        let el = document.getElementById('wheelSizeValue');
        if (el) el.textContent = this.prefs.size + '%';
    }

    updateTextLabel() {
        let el = document.getElementById('wheelTextSizeValue');
        if (el) el.textContent = this.prefs.textScale + '%';
    }

    updateSpinTimeLabel() {
        let el = document.getElementById('wheelSpinTimeValue');
        if (el) el.textContent = (this.prefs.spinTimeMs / 1000).toFixed(2).replace(/\.?0+$/, '') + 's';
    }

    render() {
        this.renderWheel();
        this.renderSidebar();
        this.updateSpinButton();
    }

    updateSpinButton() {
        let btn = document.getElementById('spinButton');
        let n = this.active.length;
        btn.disabled = this.spinning || n === 0;
        if (n === 0) {
            btn.innerText = 'No questions to spin';
        } else if (this.spinning) {
            btn.innerText = 'Spinning…';
        } else {
            btn.innerText = 'SPIN THE WHEEL';
        }
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
        // More text fits when sectors are wider and/or text is smaller
        let baseMax = step >= 60 ? 30 : step >= 36 ? 24 : step >= 24 ? 18 : step >= 18 ? 14 : step >= 12 ? 10 : 8;
        let maxChars = Math.max(4, Math.round(baseMax / textScale));
        let shown = title.length > maxChars ? title.substring(0, maxChars - 1) + '…' : title;

        let textRadius = radius * 0.66;
        let pos = polarToCartesian(cx, cy, textRadius, midAngle);

        let txt = document.createElementNS(WHEEL_SVG_NS, 'text');
        txt.setAttribute('x', pos.x);
        txt.setAttribute('y', pos.y);
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('dominant-baseline', 'middle');
        txt.setAttribute('fill', '#ffffff');
        txt.setAttribute('font-weight', 'bold');
        let baseFontSize = Math.max(12, Math.min(24, step * 0.55));
        let fontSize = baseFontSize * textScale;
        txt.setAttribute('font-size', fontSize);
        txt.setAttribute('paint-order', 'stroke');
        txt.setAttribute('stroke', 'rgba(0,0,0,0.55)');
        txt.setAttribute('stroke-width', Math.max(1.2, 2 * textScale));
        txt.setAttribute('stroke-linejoin', 'round');
        let rotation = midAngle;
        if (midAngle > 90 || midAngle < -90) {
            rotation = midAngle + 180;
        }
        txt.setAttribute('transform', 'rotate(' + rotation + ' ' + pos.x + ' ' + pos.y + ')');
        txt.style.pointerEvents = 'none';
        txt.textContent = shown;
        svg.appendChild(txt);
    }

    renderSidebar() {
        let list = document.getElementById('wheelQuestionList');
        list.innerHTML = '';
        let q = this.searchQuery;
        this.questions.forEach(question => {
            let title = (question.question && question.question.title) || ('Question #' + question.id);
            if (q && !title.toLowerCase().includes(q)) return;

            let isHidden = this.hidden.has(question.id);
            let item = document.createElement('div');
            item.className = 'wheel-question-item' + (isHidden ? ' off' : '');
            item.onclick = () => this.toggleQuestion(question.id);

            let dot = document.createElement('span');
            dot.className = 'wheel-question-color';
            dot.style.background = this.colorFor(question);

            let titleEl = document.createElement('span');
            titleEl.className = 'wheel-question-title';
            titleEl.textContent = title;

            let toggle = document.createElement('span');
            toggle.className = 'wheel-question-toggle';
            toggle.textContent = isHidden ? '✕' : '✓';

            item.appendChild(dot);
            item.appendChild(titleEl);
            item.appendChild(toggle);
            list.appendChild(item);
        });
    }

    toggleQuestion(id) {
        if (this.spinning) return;
        if (this.hidden.has(id)) {
            this.hidden.delete(id);
        } else {
            this.hidden.add(id);
        }
        this.resetSpinner();
        this.render();
        playSound('wheel-toggle');
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
        let qType = question.type;
        let qContent = question.question && question.question.content;
        if (qType === 'image') {
            let img = document.createElement('img');
            img.src = qContent || '';
            img.alt = titleEl.textContent;
            contentEl.appendChild(img);
        } else {
            contentEl.textContent = qContent || '';
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
    }

    closeModal() {
        document.getElementById('wheelModal').hidden = true;
        this.selected = null;
        this.hintRevealed = false;
    }

    hideSelected() {
        if (!this.selected) {
            this.closeModal();
            return;
        }
        this.hidden.add(this.selected.id);
        this.closeModal();
        this.resetSpinner();
        this.render();
    }
}

function polarToCartesian(cx, cy, r, angleDeg) {
    let a = angleDeg * Math.PI / 180;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}
