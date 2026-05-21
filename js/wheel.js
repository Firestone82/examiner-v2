// Questions Wheel module
// Renders an SVG wheel of question sections. Spins on a button click and
// shows a modal with the picked question's full content.

const WHEEL_SVG_NS = 'http://www.w3.org/2000/svg';
const WHEEL_SPIN_DURATION_MS = 4500;
const WHEEL_DEFAULT_COLOR = '#888888';
const WHEEL_PREFS_KEY = 'examiner_wheel_prefs';

let wheelInstance = null;

function loadWheelPrefs() {
    try {
        let p = JSON.parse(localStorage.getItem(WHEEL_PREFS_KEY));
        if (p && typeof p === 'object') {
            return {
                size: typeof p.size === 'number' ? p.size : 100,
                showHints: p.showHints !== false,
            };
        }
    } catch {}
    return { size: 100, showHints: true };
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
    }

    get active() {
        return this.questions.filter(q => !this.hidden.has(q.id));
    }

    attach() {
        this.applySize();
        this.applyHintsButton();

        let spinBtn = document.getElementById('spinButton');
        spinBtn.onclick = () => this.spin();
        let hub = document.getElementById('wheelHub');
        if (hub) hub.onclick = () => this.spin();

        document.getElementById('wheelModalClose').onclick = () => this.closeModal();
        document.getElementById('wheelModalHide').onclick = () => this.hideSelected();

        let modal = document.getElementById('wheelModal');
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.closeModal();
        });

        let resetBtn = document.getElementById('wheelResetBtn');
        if (resetBtn) resetBtn.onclick = () => this.resetHidden();

        let sizeSlider = document.getElementById('wheelSizeSlider');
        if (sizeSlider) {
            sizeSlider.value = this.prefs.size;
            sizeSlider.oninput = (e) => {
                this.prefs.size = parseInt(e.target.value, 10);
                this.applySize();
                saveWheelPrefs(this.prefs);
            };
        }

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

        let hintsBtn = document.getElementById('wheelHintsBtn');
        if (hintsBtn) {
            hintsBtn.onclick = () => {
                this.prefs.showHints = !this.prefs.showHints;
                this.applyHintsButton();
                saveWheelPrefs(this.prefs);
                // Re-apply to currently open modal, if any
                if (!document.getElementById('wheelModal').hidden && this.selected) {
                    this.applyHintsToModal();
                }
            };
        }

        this.render();
    }

    applySize() {
        let view = document.getElementById('wheelView');
        if (view) view.style.setProperty('--wheel-scale', (this.prefs.size / 100).toString());
        let valEl = document.getElementById('wheelSizeValue');
        if (valEl) valEl.textContent = this.prefs.size + '%';
    }

    applyHintsButton() {
        let btn = document.getElementById('wheelHintsBtn');
        if (!btn) return;
        btn.textContent = 'Hints: ' + (this.prefs.showHints ? 'ON' : 'OFF');
        btn.classList.toggle('off', !this.prefs.showHints);
    }

    applyHintsToModal() {
        let header = document.querySelector('#wheelModalBody .wheel-modal-answers-header');
        let list = document.querySelector('#wheelModalBody .wheel-modal-answers');
        if (header) header.classList.toggle('hidden', !this.prefs.showHints);
        if (list) list.classList.toggle('hidden', !this.prefs.showHints);
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
        let maxChars = step >= 60 ? 18 : step >= 30 ? 14 : step >= 18 ? 10 : 8;
        let shown = title.length > maxChars ? title.substring(0, maxChars - 1) + '…' : title;

        let textRadius = radius * 0.62;
        let pos = polarToCartesian(cx, cy, textRadius, midAngle);

        let txt = document.createElementNS(WHEEL_SVG_NS, 'text');
        txt.setAttribute('x', pos.x);
        txt.setAttribute('y', pos.y);
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('dominant-baseline', 'middle');
        txt.setAttribute('fill', '#ffffff');
        txt.setAttribute('font-weight', 'bold');
        let fontSize = Math.max(11, Math.min(20, step * 0.5));
        txt.setAttribute('font-size', fontSize);
        txt.setAttribute('paint-order', 'stroke');
        txt.setAttribute('stroke', 'rgba(0,0,0,0.55)');
        txt.setAttribute('stroke-width', '2');
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
    }

    resetHidden() {
        if (this.spinning) return;
        this.hidden.clear();
        this.resetSpinner();
        this.render();
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
        let duration = WHEEL_SPIN_DURATION_MS;
        let lastTickSection = 0;

        // The pointer is at top (-90 in svg coords). Each time a section
        // crosses the pointer, play a tick. A section crossing corresponds
        // to the wheel having rotated by an additional `step` degrees.
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
                row.textContent = typeof a === 'string' ? a : (a && a.content) || '';
                list.appendChild(row);
            });
            body.appendChild(list);

            this.applyHintsToModal();
        }

        modal.hidden = false;
    }

    closeModal() {
        document.getElementById('wheelModal').hidden = true;
        this.selected = null;
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
