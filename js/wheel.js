// Questions Wheel module
// Renders an SVG wheel of question sections. Spins on a button click and
// shows a modal with the picked question's full content.

const WHEEL_SVG_NS = 'http://www.w3.org/2000/svg';
const WHEEL_DEFAULT_COLOR = '#888888';
const WHEEL_PREFS_KEY = 'examiner_wheel_prefs';
// Per-DLC wheel state (hidden questions, section order, collapsed groups).
// Mirrors the prompter's session persistence so a reload restores the wheel.
const WHEEL_STATE_KEY = 'examiner_wheel_state';

function loadWheelState(name) {
    if (!name) return null;
    try {
        return (JSON.parse(localStorage.getItem(WHEEL_STATE_KEY)) || {})[name] || null;
    } catch { return null; }
}

function saveWheelState(name, state) {
    if (!name) return;
    let all = {};
    try { all = JSON.parse(localStorage.getItem(WHEEL_STATE_KEY)) || {}; } catch {}
    all[name] = state;
    try { localStorage.setItem(WHEEL_STATE_KEY, JSON.stringify(all)); } catch {}
}

function clearWheelState(name) {
    if (!name) return;
    let all = {};
    try { all = JSON.parse(localStorage.getItem(WHEEL_STATE_KEY)) || {}; } catch {}
    if (name in all) {
        delete all[name];
        try { localStorage.setItem(WHEEL_STATE_KEY, JSON.stringify(all)); } catch {}
    }
}

// Per-DLC member roster (who is answering). Kept separate from the wheel
// state so the roster survives a wheel reset — the people in the room don't
// change just because the questions were reshuffled.
const WHEEL_MEMBERS_KEY = 'examiner_wheel_members';

function loadWheelMembers(name) {
    if (!name) return [];
    try {
        let list = (JSON.parse(localStorage.getItem(WHEEL_MEMBERS_KEY)) || {})[name];
        return Array.isArray(list)
            ? list
                .filter(m => m && typeof m.id === 'string' && typeof m.name === 'string')
                .map(m => ({ id: m.id, name: m.name, disabled: m.disabled === true }))
            : [];
    } catch { return []; }
}

function saveWheelMembers(name, members) {
    if (!name) return;
    let all = {};
    try { all = JSON.parse(localStorage.getItem(WHEEL_MEMBERS_KEY)) || {}; } catch {}
    all[name] = members;
    try { localStorage.setItem(WHEEL_MEMBERS_KEY, JSON.stringify(all)); } catch {}
}

// True only when the saved state reflects real progress — i.e. the user hid a
// question or shuffled the order. Group collapse state is just a view
// preference (and may be set automatically for large DLCs), so it does not
// count; a wheel that was merely opened is not "meaningful" and should not
// trigger the continue/reset prompt.
function isMeaningfulWheelState(saved, questions) {
    if (!saved) return false;
    if (Array.isArray(saved.hidden) && saved.hidden.length > 0) return true;
    if (saved.answered && typeof saved.answered === 'object'
        && Object.keys(saved.answered).some(qid => Array.isArray(saved.answered[qid]) && saved.answered[qid].length > 0)) {
        return true;
    }
    if (Array.isArray(saved.order) && Array.isArray(questions)) {
        let orig = questions.map(q => q.id);
        if (saved.order.length !== orig.length) return true;
        for (let i = 0; i < orig.length; i++) {
            if (saved.order[i] !== orig[i]) return true;
        }
    }
    return false;
}

// Leaving the wheel discards its saved state (after confirmation) and returns
// to the start screen. A plain browser refresh keeps the state instead.
function leaveWheel() {
    showConfirmscreen('wheelView',
        'Are you sure you want to leave?<br>The wheel will reset.',
        function () {
            clearWheelState(typeof currentDlcName === 'string' ? currentDlcName : null);
            window.location.reload();
        });
}

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
    membersEnabled: false,
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
                membersEnabled:  p.membersEnabled === true,
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
    document.body.style.overflow = 'hidden';

    let nameEl = document.getElementById('wheel-dlc-name');
    if (nameEl) nameEl.innerText = dlc.name || 'Questions Wheel';
    document.title = (dlc.name || 'Questions Wheel') + ' - Examiner v2';

    wheelInstance = new QuestionsWheel(dlc.data, dlc.groups);
    wheelInstance.attach();
}

function toggleWheelConfig(event) {
    if (event) event.stopPropagation();
    let panel = document.getElementById('wheelConfigPanel');
    if (!panel) return;
    let willOpen = panel.hidden;
    // Close sound and members panels too so they don't stack
    document.querySelectorAll('.sound-panel').forEach(p => p.hidden = true);
    let members = document.getElementById('wheelMembersManagePanel');
    if (members) members.hidden = true;
    panel.hidden = !willOpen;
}

function toggleWheelMembersPanel(event) {
    if (event) event.stopPropagation();
    let panel = document.getElementById('wheelMembersManagePanel');
    if (!panel) return;
    let willOpen = panel.hidden;
    // Close sound and config panels so only one is open at a time.
    document.querySelectorAll('.sound-panel').forEach(p => p.hidden = true);
    let cfg = document.getElementById('wheelConfigPanel');
    if (cfg) cfg.hidden = true;
    panel.hidden = !willOpen;
    if (willOpen && wheelInstance) {
        wheelInstance.renderMembersConfig();
        let input = document.getElementById('wheelMemberInput');
        if (input) input.focus();
    }
}

function easeOutQuint(t) {
    return 1 - Math.pow(1 - t, 5);
}

class QuestionsWheel {
    constructor(questions, groups) {
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
        // Groups come from the DLC itself, not from user settings. A
        // question may reference a group by its id (short) or its name.
        this.groups = Array.isArray(groups)
            ? groups.filter(g => g && typeof g.name === 'string')
            : [];
        this.questionGroups = {};
        this.questions.forEach(q => {
            let g = q && q.question && q.question.group;
            if ((typeof g === 'string' && g) || typeof g === 'number') {
                this.questionGroups[q.id] = g;
            }
        });
        this.collapsedGroups = new Set();
        this.timerInterval = null;
        this.timerStart = 0;

        // Member roster (persists per DLC) and per-question answered tracking
        // (part of the resettable wheel state). rolledMemberId is transient —
        // it just highlights the last "Roll" result in the open modal.
        this.members = loadWheelMembers(this.stateName);
        this.answered = {};
        this.rolledMemberId = null;
        this.rolling = false;
        this._rollTimer = null;

        let hadSavedState = !!loadWheelState(this.stateName);
        this.restoreState();
        // On a fresh open of a large grouped DLC, collapse the named group
        // sections (the Ungrouped section stays expanded) so the list stays
        // manageable.
        if (!hadSavedState && this.questions.length > 15) {
            this.collapseAllSections();
        }
    }

    // Collapses every named group section, leaving the Ungrouped section
    // expanded. No-op for DLCs that don't use groups, since there are no
    // group sections to collapse.
    collapseAllSections() {
        let useGroups = this.groups.length > 0
            && this.questions.some(q => this.findGroup(this.questionGroups[q.id]));
        if (!useGroups) return;
        this.groups.forEach(g => this.collapsedGroups.add(g.name));
    }

    get active() {
        return this.wheelOrder.filter(q => !this.hidden.has(q.id));
    }

    // Name used to key persisted state (hidden/order) — same name the rest of
    // the app uses for sessions, recent files and scores.
    get stateName() {
        return (typeof currentDlcName === 'string' && currentDlcName) ? currentDlcName : null;
    }

    restoreState() {
        let saved = loadWheelState(this.stateName);
        if (!saved) return;
        if (Array.isArray(saved.hidden)) this.hidden = new Set(saved.hidden);
        if (Array.isArray(saved.collapsed)) this.collapsedGroups = new Set(saved.collapsed);
        if (saved.answered && typeof saved.answered === 'object') {
            // Keep only known members so a removed member can't linger.
            let valid = new Set(this.members.map(m => m.id));
            let restored = {};
            Object.keys(saved.answered).forEach(qid => {
                let ids = saved.answered[qid];
                if (Array.isArray(ids)) {
                    let kept = ids.filter(id => valid.has(id));
                    if (kept.length) restored[qid] = kept;
                }
            });
            this.answered = restored;
        }
        if (Array.isArray(saved.order)) {
            let byId = {};
            this.questions.forEach(q => { byId[q.id] = q; });
            let seen = new Set();
            let restored = [];
            saved.order.forEach(id => {
                if (byId[id] && !seen.has(id)) { restored.push(byId[id]); seen.add(id); }
            });
            // Append any questions added since the state was saved.
            this.questions.forEach(q => { if (!seen.has(q.id)) restored.push(q); });
            if (restored.length) this.wheelOrder = restored;
        }
    }

    persistState() {
        if (!this.stateName) return;
        saveWheelState(this.stateName, {
            hidden: Array.from(this.hidden),
            order: this.wheelOrder.map(q => q.id),
            collapsed: Array.from(this.collapsedGroups),
            answered: this.answered,
        });
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

        let scoringSwitch = document.getElementById('wheelScoringSwitch');
        let scoringRow = document.getElementById('wheelScoringRow');
        let updateScoringSwitch = () => scoringSwitch && scoringSwitch.classList.toggle('on', isScoringEnabled());
        updateScoringSwitch();
        if (scoringRow) {
            scoringRow.onclick = (e) => {
                e.preventDefault();
                setScoringEnabled(!isScoringEnabled());
                updateScoringSwitch();
                this.renderSidebar();
                if (!document.getElementById('wheelModal').hidden) this.refreshModalScore();
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
                if (this.isMobile()) return;
                this.prefs.centered = !this.prefs.centered;
                updateCenteredSwitch();
                saveWheelPrefs(this.prefs);
                this.applyCentered();
            };
        }
        let applyCenteredAvailability = () => {
            let mobile = this.isMobile();
            if (centeredRow) {
                centeredRow.style.opacity = mobile ? '0.38' : '';
                centeredRow.style.pointerEvents = mobile ? 'none' : '';
                centeredRow.title = mobile ? 'Not available on small screens' : '';
            }
            this.applyCentered();
        };
        applyCenteredAvailability();
        window.addEventListener('resize', applyCenteredAvailability);

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

        let membersSwitch = document.getElementById('wheelMembersSwitch');
        let membersRow = document.getElementById('wheelMembersRow');
        let updateMembersSwitch = () => membersSwitch && membersSwitch.classList.toggle('on', this.prefs.membersEnabled);
        updateMembersSwitch();
        this.applyMembersFeatureVisibility();
        if (membersRow) {
            membersRow.onclick = (e) => {
                e.preventDefault();
                this.prefs.membersEnabled = !this.prefs.membersEnabled;
                updateMembersSwitch();
                saveWheelPrefs(this.prefs);
                this.applyMembersFeatureVisibility();
                this.renderSidebar();
                // Reflect the change in an open modal right away.
                if (!document.getElementById('wheelModal').hidden) {
                    this.applyMembersButton();
                    if (!this.prefs.membersEnabled) this.closeMembersPanel();
                }
            };
        }

        let memberInput = document.getElementById('wheelMemberInput');
        let memberAddBtn = document.getElementById('wheelMemberAddBtn');
        let commitMember = () => {
            if (!memberInput) return;
            if (this.addMember(memberInput.value)) {
                memberInput.value = '';
            }
            memberInput.focus();
        };
        if (memberAddBtn) memberAddBtn.onclick = commitMember;
        if (memberInput) {
            memberInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); commitMember(); }
            });
            // Typing inside the panel shouldn't bubble to the spacebar-spin
            // handler or the outside-click closer.
            memberInput.addEventListener('keydown', e => e.stopPropagation());
        }
        this.renderMembersConfig();

        let showPendingBtn = document.getElementById('wheelMembersShowPendingBtn');
        if (showPendingBtn) showPendingBtn.onclick = () => {
            let panel = document.getElementById('wheelMembersManagePanel');
            if (panel) panel.hidden = true;
            showConfirmscreen('wheelView',
                'Show every question an enabled member still hasn\'t answered?<br>This changes which questions appear on the wheel.',
                () => {
                    document.getElementById('wheelView').hidden = false;
                    this.showQuestionsWithPending();
                });
        };
        let hideAnsweredBtn = document.getElementById('wheelMembersHideAnsweredBtn');
        if (hideAnsweredBtn) hideAnsweredBtn.onclick = () => {
            let panel = document.getElementById('wheelMembersManagePanel');
            if (panel) panel.hidden = true;
            showConfirmscreen('wheelView',
                'Hide every question all enabled members have already answered?<br>This changes which questions appear on the wheel.',
                () => {
                    document.getElementById('wheelView').hidden = false;
                    this.hideFullyAnsweredQuestions();
                });
        };

        let rollBtn = document.getElementById('wheelMembersRollBtn');
        if (rollBtn) rollBtn.onclick = () => this.rollMember();

        let rollCloseBtn = document.getElementById('memberRollClose');
        if (rollCloseBtn) rollCloseBtn.onclick = () => this.closeMemberRoll();
        let rollAgainBtn = document.getElementById('memberRollAgain');
        if (rollAgainBtn) {
            rollAgainBtn.onclick = () => {
                if (this.rolling || !this.selected) return;
                let pool = this.unansweredMembers(this.selected.id);
                if (pool.length < 2) { this.closeMemberRoll(); return; }
                this._rollPool = pool;
                this.renderMemberRollWheel(pool);
                this.spinMemberRoll();
            };
        }

        let membersBtn = document.getElementById('wheelModalMembersBtn');
        if (membersBtn) membersBtn.onclick = () => this.toggleMembersPanel();

        let exportBtn = document.getElementById('wheelExportRatingsBtn');
        if (exportBtn) {
            exportBtn.onclick = () => this.exportRatings();
        }

        let eraseBtn = document.getElementById('wheelEraseRatingsBtn');
        if (eraseBtn) {
            eraseBtn.onclick = () => {
                let panel = document.getElementById('wheelConfigPanel');
                if (panel) panel.hidden = true;
                showConfirmscreen('wheelView',
                    'Erase all star ratings for<br><em>' + (currentDlcName || 'this DLC') + '</em>?<br>This cannot be undone.',
                    () => {
                        clearAllScoresForDlc();
                        document.getElementById('wheelView').hidden = false;
                        this.renderSidebar();
                        if (!document.getElementById('wheelModal').hidden) this.refreshModalScore();
                        playSound('deselect');
                    });
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

        // Same close-on-outside-click behaviour for the members roster panel.
        let membersPanel = document.getElementById('wheelMembersManagePanel');
        let membersPanelBtn = document.getElementById('wheelMembersButton');
        if (membersPanel) membersPanel.addEventListener('click', (e) => e.stopPropagation());
        document.addEventListener('click', (e) => {
            if (!membersPanel || membersPanel.hidden) return;
            if (membersPanelBtn && membersPanelBtn.contains(e.target)) return;
            if (membersPanel.contains(e.target)) return;
            membersPanel.hidden = true;
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
            showAllBtn.onclick = () => this.toggleAllQuestions();
        }

        this.render();
    }

    // Exports the user's star ratings for the current DLC as a CSV, with one
    // row per rated question and its group, ordered by group then title.
    exportRatings() {
        let scores = getAllScores()[currentDlcName] || {};
        let rated = this.questions.filter(q => (scores[q.id] || 0) > 0);
        if (rated.length === 0) {
            alert('No star ratings to export yet.');
            return;
        }

        let titleOf = q => (q.question && q.question.title) || ('Question #' + q.id);
        let groupNameOf = q => {
            let g = this.findGroup(this.questionGroups[q.id]);
            return g ? g.name : 'Ungrouped';
        };

        let groupOrder = {};
        this.groups.forEach((g, i) => { groupOrder[g.name] = i; });
        let orderIndex = name => (name in groupOrder ? groupOrder[name] : this.groups.length);

        let sorted = rated.slice().sort((a, b) => {
            let ga = groupNameOf(a), gb = groupNameOf(b);
            let oa = orderIndex(ga), ob = orderIndex(gb);
            if (oa !== ob) return oa - ob;
            if (ga !== gb) return ga.localeCompare(gb);
            return titleOf(a).localeCompare(titleOf(b));
        });

        let cell = v => String(v === undefined || v === null ? '' : v).replace(/[\r\n\t]+/g, ' ');
        let headers = ['Group', 'ID', 'Question', 'Rating'];
        let alignRight = [false, true, false, true];
        let rows = sorted.map(q => [groupNameOf(q), q.id, titleOf(q), scores[q.id]].map(cell));

        let widths = headers.map((h, i) =>
            Math.max(h.length, ...rows.map(r => r[i].length)));
        let pad = (c, i) => alignRight[i] ? c.padStart(widths[i]) : c.padEnd(widths[i]);
        let sep = '+' + widths.map(w => '-'.repeat(w + 2)).join('+') + '+';
        let fmtRow = cells => '| ' + cells.map(pad).join(' | ') + ' |';

        let lines = [sep, fmtRow(headers), sep];
        rows.forEach(r => lines.push(fmtRow(r)));
        lines.push(sep);

        let heading = 'Star ratings — ' + (currentDlcName || 'this DLC') +
            '  (' + rows.length + ' rated)';
        let table = heading + '\n\n' + lines.join('\n') + '\n';

        let base = (typeof currentDlcName === 'string' && currentDlcName ? currentDlcName : 'examiner')
            .replace(/\.[^.]+$/, '').replace(/[^\w\-]+/g, '_') || 'examiner';
        this.downloadFile(base + '-ratings.txt', table, 'text/plain;charset=utf-8');
        playSound('select');
    }

    downloadFile(filename, content, mime) {
        let blob = new Blob([content], { type: mime });
        let url = URL.createObjectURL(blob);
        let a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // ── Members ───────────────────────────────────────────────────────────────

    // The roster-editing button (next to the gear) only exists while the
    // members feature is on; turning it off also closes its panel.
    applyMembersFeatureVisibility() {
        let btn = document.getElementById('wheelMembersButton');
        if (btn) btn.hidden = !this.prefs.membersEnabled;
        if (!this.prefs.membersEnabled) {
            let panel = document.getElementById('wheelMembersManagePanel');
            if (panel) panel.hidden = true;
        }
    }

    addMember(name) {
        name = (name || '').trim();
        if (!name) return false;
        // Case-insensitive duplicate guard so the roster stays unambiguous.
        if (this.members.some(m => m.name.toLowerCase() === name.toLowerCase())) {
            return false;
        }
        let id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        this.members.push({ id, name, disabled: false });
        saveWheelMembers(this.stateName, this.members);
        this.renderMembersConfig();
        this.renderMembersPanel();
        this.renderSidebar();
        playSound('select');
        return true;
    }

    removeMember(id) {
        let idx = this.members.findIndex(m => m.id === id);
        if (idx < 0) return;
        this.members.splice(idx, 1);
        saveWheelMembers(this.stateName, this.members);
        // Drop the removed member from every question's answered list.
        Object.keys(this.answered).forEach(qid => {
            this.answered[qid] = this.answered[qid].filter(mid => mid !== id);
            if (this.answered[qid].length === 0) delete this.answered[qid];
        });
        if (this.rolledMemberId === id) this.rolledMemberId = null;
        this.persistState();
        this.renderMembersConfig();
        this.renderMembersPanel();
        this.renderSidebar();
        playSound('deselect');
    }

    // Renames a member in place. Returns false (and changes nothing) when the
    // name is empty or already taken by another member.
    renameMember(id, name) {
        name = (name || '').trim();
        if (!name) return false;
        let m = this.members.find(x => x.id === id);
        if (!m) return false;
        if (this.members.some(x => x.id !== id && x.name.toLowerCase() === name.toLowerCase())) {
            return false;
        }
        if (m.name === name) return true;
        m.name = name;
        saveWheelMembers(this.stateName, this.members);
        this.renderMembersConfig();
        this.renderMembersPanel();
        this.renderSidebar();
        return true;
    }

    // Temporarily takes a member out of the rotation (or puts them back).
    // Disabled members are skipped by the roll and don't count toward
    // completion — disabling the last pending member can complete a question.
    setMemberDisabled(id, disabled) {
        let m = this.members.find(x => x.id === id);
        if (!m || m.disabled === disabled) return;
        m.disabled = disabled;
        saveWheelMembers(this.stateName, this.members);
        if (disabled && this.rolledMemberId === id) this.rolledMemberId = null;
        playSound(disabled ? 'deselect' : 'select');
        this.renderMembersConfig();
        if (!this.maybeCompleteSelected()) {
            this.persistState();
            this.renderMembersPanel();
            this.renderSidebar();
        }
    }

    renderMembersConfig() {
        let list = document.getElementById('wheelMembersConfigList');
        if (!list) return;
        list.innerHTML = '';
        if (this.members.length === 0) {
            let empty = document.createElement('div');
            empty.className = 'wheel-members-config-empty';
            empty.textContent = 'No members yet.';
            list.appendChild(empty);
            return;
        }
        this.members.forEach(m => {
            let row = document.createElement('div');
            row.className = 'wheel-member-config-row' + (m.disabled ? ' disabled' : '');

            let nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.className = 'wheel-member-config-name-input';
            nameInput.value = m.name;
            nameInput.maxLength = 40;
            nameInput.title = 'Rename member';
            // Keep typing local — don't trigger spacebar-spin or panel close.
            nameInput.addEventListener('keydown', e => e.stopPropagation());
            let commit = () => { if (!this.renameMember(m.id, nameInput.value)) nameInput.value = m.name; };
            nameInput.addEventListener('blur', commit);
            nameInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); nameInput.blur(); }
                else if (e.key === 'Escape') { nameInput.value = m.name; nameInput.blur(); }
            });

            let toggle = document.createElement('span');
            toggle.className = 'sound-switch wheel-member-enable-switch' + (m.disabled ? '' : ' on');
            toggle.title = m.disabled ? 'Disabled — click to enable' : 'Enabled — click to disable';
            toggle.onclick = () => this.setMemberDisabled(m.id, !m.disabled);

            let count = document.createElement('span');
            count.className = 'wheel-member-count';
            count.textContent = '(' + this.answeredCountForMember(m.id) + ')';
            count.title = 'Questions answered';

            let del = document.createElement('button');
            del.type = 'button';
            del.className = 'wheel-member-config-remove';
            del.title = 'Remove member';
            del.textContent = '✕';
            del.onclick = () => this.removeMember(m.id);

            row.appendChild(nameInput);
            row.appendChild(count);
            row.appendChild(toggle);
            row.appendChild(del);
            list.appendChild(row);
        });
    }

    answeredIds(qid) {
        return this.answered[qid] || [];
    }

    isAnswered(qid, memberId) {
        return this.answeredIds(qid).indexOf(memberId) >= 0;
    }

    // Total number of questions this member has marked answered (across the
    // whole DLC).
    answeredCountForMember(memberId) {
        let n = 0;
        for (let qid in this.answered) {
            if (this.answered[qid].indexOf(memberId) >= 0) n++;
        }
        return n;
    }

    // Members currently in the rotation (disabled ones are sat out).
    activeMembers() {
        return this.members.filter(m => !m.disabled);
    }

    // Bulk visibility helpers driven by member-answered state.
    // Un-hide every question that still has at least one enabled member who
    // hasn't answered it.
    showQuestionsWithPending() {
        if (this.spinning) return;
        if (this.activeMembers().length === 0) return;
        let changed = false;
        this.questions.forEach(q => {
            if (this.hidden.has(q.id) && !this.allAnswered(q.id)) {
                this.hidden.delete(q.id);
                changed = true;
            }
        });
        if (changed) this.resetSpinner();
        this.render();
        playSound(changed ? 'select' : 'deselect');
    }

    // Hide every question that all enabled members have already answered.
    hideFullyAnsweredQuestions() {
        if (this.spinning) return;
        if (this.activeMembers().length === 0) return;
        let changed = false;
        this.questions.forEach(q => {
            if (!this.hidden.has(q.id) && this.allAnswered(q.id)) {
                this.hidden.add(q.id);
                changed = true;
            }
        });
        if (changed) this.resetSpinner();
        this.render();
        playSound(changed ? 'deselect' : 'select');
    }

    unansweredMembers(qid) {
        let done = new Set(this.answeredIds(qid));
        return this.activeMembers().filter(m => !done.has(m.id));
    }

    // A question is complete only when there's at least one active member and
    // none of them are still pending.
    allAnswered(qid) {
        return this.activeMembers().length > 0 && this.unansweredMembers(qid).length === 0;
    }

    toggleAnswered(memberId) {
        if (!this.selected || this.rolling) return;
        let member = this.members.find(m => m.id === memberId);
        if (!member || member.disabled) return;
        let qid = this.selected.id;
        let list = this.answered[qid] ? this.answered[qid].slice() : [];
        let pos = list.indexOf(memberId);
        let wasAnswered = pos >= 0;
        if (wasAnswered) list.splice(pos, 1);
        else list.push(memberId);
        if (list.length) this.answered[qid] = list;
        else delete this.answered[qid];
        if (this.rolledMemberId === memberId && !wasAnswered) this.rolledMemberId = null;

        if (this.maybeCompleteSelected()) return;
        playSound(wasAnswered ? 'deselect' : 'select');
        this.persistState();
        this.renderMembersPanel();
        this.renderSidebar();
    }

    // When every active member has answered the open question, mark it hidden
    // on the wheel but keep the modal open (the user closes it themselves).
    // Returns true when it handled completion.
    maybeCompleteSelected() {
        if (!this.selected || !this.allAnswered(this.selected.id)) return false;
        let qid = this.selected.id;
        if (!this.hidden.has(qid)) {
            this.hidden.add(qid);
            this.resetSpinner();
        }
        playSound('navigate');
        this.render();
        this.renderMembersPanel();
        return true;
    }

    rollMember() {
        if (!this.selected || this.rolling) return;
        let resultEl = document.getElementById('wheelMembersRollResult');
        let pool = this.unansweredMembers(this.selected.id);
        if (pool.length === 0) {
            this.rolledMemberId = null;
            if (resultEl) {
                resultEl.hidden = false;
                resultEl.textContent = this.members.length === 0
                    ? 'No members to roll.'
                    : 'Everyone has answered.';
            }
            this.renderMembersPanel();
            playSound('deselect');
            return;
        }

        // One candidate — nothing to spin, land immediately.
        if (pool.length === 1) {
            this.landRolledMember(pool[0]);
            playSound('wheel-land');
            return;
        }

        this.openMemberRoll(pool);
    }

    // Records the roll result on the side panel (and highlights the member).
    landRolledMember(member) {
        this.rolledMemberId = member.id;
        let resultEl = document.getElementById('wheelMembersRollResult');
        if (resultEl) { resultEl.hidden = false; resultEl.textContent = '🎲 ' + member.name; }
        this.renderMembersPanel();
    }

    // Opens the spinning member wheel over the question modal and spins it.
    openMemberRoll(pool) {
        let overlay = document.getElementById('memberRollOverlay');
        if (!overlay) { this.landRolledMember(pool[Math.floor(Math.random() * pool.length)]); return; }
        this._rollPool = pool;
        this._memberRollRotation = 0;
        let spinner = document.getElementById('memberRollSpinner');
        if (spinner) { spinner.style.transition = 'none'; spinner.style.transform = 'rotate(0deg)'; }
        let resultEl = document.getElementById('memberRollResult');
        if (resultEl) { resultEl.hidden = true; resultEl.textContent = ''; }
        let againBtn = document.getElementById('memberRollAgain');
        if (againBtn) againBtn.hidden = true;
        this.renderMemberRollWheel(pool);
        overlay.hidden = false;
        requestAnimationFrame(() => this.spinMemberRoll());
    }

    closeMemberRoll() {
        this.cancelRoll();
        playSound('next');
        this.renderMembersPanel();
    }

    cancelRoll() {
        if (this._rollTimer) { clearTimeout(this._rollTimer); this._rollTimer = null; }
        this.rolling = false;
        let overlay = document.getElementById('memberRollOverlay');
        if (overlay) overlay.hidden = true;
    }

    renderMemberRollWheel(pool) {
        let svg = document.getElementById('memberRollSvg');
        if (!svg) return;
        while (svg.firstChild) svg.removeChild(svg.firstChild);
        let cx = 200, cy = 200, radius = 192;
        let n = pool.length;
        let palette = ['#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa',
                       '#00897b', '#fdd835', '#6d4c41', '#d81b60', '#3949ab'];
        let step = 360 / n;
        for (let i = 0; i < n; i++) {
            let startAngle = i * step - 90;
            let endAngle = startAngle + step;
            let sector = document.createElementNS(WHEEL_SVG_NS, 'path');
            sector.setAttribute('d', this.makeSectorPath(cx, cy, radius, startAngle, endAngle));
            sector.setAttribute('fill', palette[i % palette.length]);
            sector.setAttribute('stroke', '#1a1a1a');
            sector.setAttribute('stroke-width', '2');
            svg.appendChild(sector);
            this.appendMemberLabel(svg, pool[i].name, cx, cy, radius, startAngle + step / 2, step);
        }
    }

    appendMemberLabel(svg, text, cx, cy, radius, midAngle, step) {
        let innerR = radius * 0.2, outerR = radius - 14;
        let textRadius = (innerR + outerR) / 2;
        let pos = polarToCartesian(cx, cy, textRadius, midAngle);
        let angularLimit = textRadius * (step * Math.PI / 180) * 0.8;
        let fontSize = Math.max(9, Math.min(angularLimit, 20));
        let txt = document.createElementNS(WHEEL_SVG_NS, 'text');
        txt.setAttribute('x', pos.x);
        txt.setAttribute('y', pos.y);
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('dominant-baseline', 'middle');
        txt.setAttribute('fill', '#ffffff');
        txt.setAttribute('font-weight', 'bold');
        txt.setAttribute('font-size', fontSize);
        txt.setAttribute('paint-order', 'stroke');
        txt.setAttribute('stroke', 'rgba(0,0,0,0.55)');
        txt.setAttribute('stroke-width', Math.max(1, fontSize * 0.1));
        txt.setAttribute('stroke-linejoin', 'round');
        txt.setAttribute('transform', 'rotate(' + (midAngle + 180) + ' ' + pos.x + ' ' + pos.y + ')');
        txt.style.pointerEvents = 'none';
        txt.textContent = text;
        svg.appendChild(txt);

        let availLen = outerR - innerR;
        try {
            if (txt.getBBox().width > availLen) {
                let lo = 0, hi = text.length - 1, best = 0;
                while (lo <= hi) {
                    let mid = (lo + hi) >> 1;
                    txt.textContent = text.substring(0, mid) + '…';
                    if (txt.getBBox().width <= availLen) { best = mid; lo = mid + 1; }
                    else hi = mid - 1;
                }
                txt.textContent = best === 0 ? '…' : text.substring(0, best) + '…';
            }
        } catch (e) {}
    }

    spinMemberRoll() {
        if (this.rolling) return;
        let overlay = document.getElementById('memberRollOverlay');
        let spinner = document.getElementById('memberRollSpinner');
        let pool = this._rollPool || [];
        let n = pool.length;
        if (!overlay || !spinner || n === 0) return;

        this.rolling = true;
        this.renderMembersPanel();
        let resultEl = document.getElementById('memberRollResult');
        let againBtn = document.getElementById('memberRollAgain');
        if (resultEl) resultEl.hidden = true;
        if (againBtn) againBtn.hidden = true;

        let step = 360 / n;
        let pickedIdx = Math.floor(Math.random() * n);
        let picked = pool[pickedIdx];
        let midAngle = pickedIdx * step - 90 + step / 2;
        let randomOffset = (Math.random() - 0.5) * step * 0.6;
        let targetMod = -90 - midAngle + randomOffset;
        let normalize = (a) => ((a % 360) + 360) % 360;
        let delta = normalize(targetMod) - normalize(this._memberRollRotation || 0);
        if (delta < 0) delta += 360;
        let totalDelta = delta + 360 * 5;
        let startRotation = this._memberRollRotation || 0;
        this._memberRollRotation = startRotation + totalDelta;

        spinner.style.transition = 'none';
        let startTime = performance.now();
        let duration = Math.min(this.prefs.spinTimeMs, 3000);
        let lastTick = 0;
        let animate = (now) => {
            if (overlay.hidden) { this.rolling = false; return; }
            let t = Math.min(1, (now - startTime) / duration);
            let rot = startRotation + totalDelta * easeOutQuint(t);
            spinner.style.transform = 'rotate(' + rot + 'deg)';
            let passed = Math.floor((rot - startRotation) / step);
            while (lastTick < passed) { lastTick++; playSound('wheel-tick', 0.5); }
            if (t < 1) {
                requestAnimationFrame(animate);
            } else {
                this.rolling = false;
                playSound('wheel-land');
                this.landRolledMember(picked);
                if (resultEl) { resultEl.hidden = false; resultEl.textContent = '🎲 ' + picked.name; }
                if (againBtn) againBtn.hidden = false;
            }
        };
        requestAnimationFrame(animate);
    }

    applyMembersButton() {
        let btn = document.getElementById('wheelModalMembersBtn');
        if (btn) btn.hidden = !this.prefs.membersEnabled;
    }

    toggleMembersPanel() {
        let panel = document.getElementById('wheelMembersPanel');
        if (!panel) return;
        if (panel.hidden) {
            this.renderMembersPanel();
            panel.hidden = false;
            playSound('navigate');
        } else {
            this.closeMembersPanel();
        }
    }

    closeMembersPanel() {
        let panel = document.getElementById('wheelMembersPanel');
        if (panel) panel.hidden = true;
    }

    renderMembersPanel() {
        let list = document.getElementById('wheelMembersPanelList');
        let empty = document.getElementById('wheelMembersPanelEmpty');
        let rollBtn = document.getElementById('wheelMembersRollBtn');
        if (!list) return;
        list.innerHTML = '';
        let qid = this.selected ? this.selected.id : null;

        if (this.members.length === 0) {
            if (empty) empty.hidden = false;
            if (rollBtn) rollBtn.disabled = true;
            return;
        }
        if (empty) empty.hidden = true;

        let pending = qid != null ? this.unansweredMembers(qid).length : this.activeMembers().length;
        if (rollBtn) rollBtn.disabled = pending === 0 || this.rolling;

        this.members.forEach(m => {
            let disabled = m.disabled;
            let answered = !disabled && qid != null && this.isAnswered(qid, m.id);
            let row = document.createElement('div');
            row.className = 'wheel-member-row'
                + (disabled ? ' disabled' : '')
                + (answered ? ' answered' : '')
                + (m.id === this.rolledMemberId ? ' rolled' : '');
            if (!disabled) row.onclick = () => this.toggleAnswered(m.id);

            let check = document.createElement('span');
            check.className = 'wheel-member-check';
            check.textContent = answered ? '✓' : '';

            let name = document.createElement('span');
            name.className = 'wheel-member-name';
            name.textContent = m.name;

            row.appendChild(check);
            row.appendChild(name);

            if (disabled) {
                let tag = document.createElement('span');
                tag.className = 'wheel-member-disabled-tag';
                tag.textContent = 'disabled';
                row.appendChild(tag);
            } else if (m.id === this.rolledMemberId && !answered) {
                let tag = document.createElement('span');
                tag.className = 'wheel-member-rolled-tag';
                tag.textContent = '🎲';
                row.appendChild(tag);
            }
            list.appendChild(row);
        });
    }

    shuffleWheel() {
        if (this.spinning) return;
        shuffle(this.wheelOrder);
        this.resetSpinner();
        this.renderWheel();
        this.updateSpinButton();
        this.persistState();
        playSound('wheel-shuffle');
    }

    toggleAllQuestions() {
        if (this.spinning) return;
        if (this.questions.length === 0) return;
        let anyVisible = this.questions.some(q => !this.hidden.has(q.id));
        if (anyVisible) {
            this.questions.forEach(q => this.hidden.add(q.id));
        } else {
            this.hidden.clear();
        }
        this.resetSpinner();
        this.render();
        playSound(anyVisible ? 'deselect' : 'select');
    }

    updateShowAllBtn() {
        let btn = document.getElementById('wheelShowAllBtn');
        if (!btn) return;
        let anyVisible = this.questions.some(q => !this.hidden.has(q.id));
        btn.textContent = anyVisible ? '⦸' : '⟳';
        btn.title = anyVisible ? 'Hide all questions' : 'Show all questions';
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

    isMobile() {
        return window.innerWidth <= 600;
    }

    applyCentered() {
        let view = document.getElementById('wheelView');
        if (view) view.classList.toggle('wheel-centered', !this.isMobile() && this.prefs.centered);
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
        this.updateShowAllBtn();
        this.persistState();
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

    findGroup(ref) {
        if (ref === undefined || ref === null || ref === '') return null;
        return this.groups.find(g => g.id === ref || g.name === ref) || null;
    }

    colorFor(q) {
        if (q && this.questionGroups) {
            let ref = this.questionGroups[q.id];
            let grp = this.findGroup(ref);
            if (grp && typeof grp.color === 'string') return grp.color;
            // A raw hex color in the "group" field means "no group, just
            // this color" — the sidebar will bucket it as ungrouped.
            if (typeof ref === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(ref)) return ref;
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
        this.persistState();
        let list = document.getElementById('wheelQuestionList');
        list.innerHTML = '';
        let q = this.searchQuery;

        let matchesQuery = (question) => {
            if (!q) return true;
            let title = (question.question && question.question.title) || ('Question #' + question.id);
            return title.toLowerCase().includes(q);
        };

        let useGroups = this.groups.length > 0
            && this.questions.some(qq => this.findGroup(this.questionGroups[qq.id]));

        if (useGroups) {
            // Buckets are keyed by group name (guaranteed unique-ish) so we
            // can iterate this.groups in declared order while still matching
            // questions that referenced their group by id.
            let buckets = {};
            this.groups.forEach(g => { buckets[g.name] = []; });
            let ungrouped = [];

            this.questions.forEach(question => {
                if (!matchesQuery(question)) return;
                let group = this.findGroup(this.questionGroups[question.id]);
                if (group) buckets[group.name].push(question);
                else ungrouped.push(question);
            });

            let makeHeader = (key, name, color, items, sortFn) => {
                let allHidden = items.every(q => this.hidden.has(q.id));
                let collapsed = this.collapsedGroups.has(key);
                let header = document.createElement('div');
                header.className = 'wheel-group-header' + (collapsed ? ' collapsed' : '');
                header.style.borderLeftColor = color;

                let collapseBtn = document.createElement('button');
                collapseBtn.className = 'wheel-group-collapse-btn';
                collapseBtn.innerHTML = collapsed
                    ? '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M4 2 L8 6 L4 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
                    : '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2 4 L6 8 L10 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
                collapseBtn.title = collapsed ? 'Expand group' : 'Collapse group';

                let label = document.createElement('span');
                label.className = 'wheel-group-header-label';
                label.textContent = name;

                let toggleCollapse = (e) => {
                    e.stopPropagation();
                    if (collapsed) this.collapsedGroups.delete(key);
                    else this.collapsedGroups.add(key);
                    this.renderSidebar();
                    playSound(collapsed ? 'select' : 'deselect');
                };
                collapseBtn.onclick = toggleCollapse;
                label.onclick = toggleCollapse;
                header.style.cursor = 'pointer';

                header.appendChild(collapseBtn);
                header.appendChild(label);

                let toggleBtn = document.createElement('button');
                toggleBtn.className = 'wheel-group-toggle-btn';
                toggleBtn.innerHTML = allHidden
                    ? '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M1.5 8 C3.5 4, 6 2.5, 8 2.5 C10 2.5, 12.5 4, 14.5 8 C12.5 12, 10 13.5, 8 13.5 C6 13.5, 3.5 12, 1.5 8 Z" fill="none" stroke="currentColor" stroke-width="1.3"/><line x1="2" y1="2" x2="14" y2="14" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>'
                    : '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M1.5 8 C3.5 4, 6 2.5, 8 2.5 C10 2.5, 12.5 4, 14.5 8 C12.5 12, 10 13.5, 8 13.5 C6 13.5, 3.5 12, 1.5 8 Z" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8" r="2.2" fill="currentColor"/></svg>';
                toggleBtn.title = allHidden ? 'Show group' : 'Hide group';
                toggleBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (allHidden) items.forEach(q => this.hidden.delete(q.id));
                    else items.forEach(q => this.hidden.add(q.id));
                    this.resetSpinner();
                    this.render();
                    playSound(allHidden ? 'select' : 'deselect');
                };

                let shownCount = items.reduce((n, q) => n + (this.hidden.has(q.id) ? 0 : 1), 0);
                let count = document.createElement('span');
                count.className = 'wheel-group-count';
                count.textContent = shownCount + '/' + items.length;
                count.title = shownCount + ' shown, ' + (items.length - shownCount) + ' hidden';
                header.appendChild(count);

                header.appendChild(toggleBtn);
                list.appendChild(header);

                if (!collapsed) {
                    items.sort(sortFn);
                    items.forEach(question => list.appendChild(this.makeSidebarItem(question)));
                }
            };

            this.groups.forEach(g => {
                let items = buckets[g.name];
                if (!items || items.length === 0) return;
                makeHeader(g.name, g.name, g.color, items, (a, b) => (a.id ?? 0) - (b.id ?? 0));
            });

            if (ungrouped.length > 0) {
                makeHeader('__ungrouped__', 'Ungrouped', '#555', ungrouped, (a, b) => {
                    let ha = hexToHue(this.colorFor(a));
                    let hb = hexToHue(this.colorFor(b));
                    if (ha !== hb) return ha - hb;
                    return (a.id ?? 0) - (b.id ?? 0);
                });
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

        let titleEl = document.createElement('span');
        titleEl.className = 'wheel-question-title';
        titleEl.textContent = title;

        let openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'wheel-question-open';
        openBtn.title = 'Open question';
        openBtn.innerHTML = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><path d='M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z'/><circle cx='12' cy='12' r='3'/></svg>";
        openBtn.onclick = (e) => {
            e.stopPropagation();
            if (this.spinning) return;
            playSound('select');
            this.showQuestionModal(question);
        };

        let toggle = document.createElement('span');
        toggle.className = 'wheel-question-toggle';
        toggle.textContent = isHidden ? '✕' : '✓';

        item.appendChild(dot);
        item.appendChild(titleEl);

        if (isScoringEnabled()) {
            let score = getQuestionScore(question.id);
            if (score > 0) {
                let badge = document.createElement('span');
                badge.className = 'wheel-question-score';
                badge.textContent = '★' + score;
                badge.title = score + ' / 5';
                item.appendChild(badge);
            }
        }

        if (this.prefs.membersEnabled) {
            let active = this.activeMembers();
            if (active.length > 0) {
                let answeredCount = active.reduce((n, m) => n + (this.isAnswered(question.id, m.id) ? 1 : 0), 0);
                let badge = document.createElement('span');
                badge.className = 'wheel-member-progress'
                    + (answeredCount >= active.length ? ' complete' : '');
                badge.textContent = answeredCount + '/' + active.length;
                badge.title = answeredCount + ' of ' + active.length + ' active members answered';
                item.appendChild(badge);
            }
        }

        item.appendChild(openBtn);
        item.appendChild(toggle);

        // Hover tooltip shows the long question text (the title in the row
        // is already the short label). Image-only questions get no tooltip
        // since there's no text to render.
        let qData = question.question;
        if (qData && qData.type === 'text' && typeof qData.content === 'string' && qData.content.trim()) {
            setupTooltip(item, qData.content);
        }

        return item;
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
        // One tick per section passed. Scale volume by per-section speed: at
        // the start (fast) most ticks are quiet so it doesn't machine-gun,
        // by the time the wheel is crawling each section gets a full tick.
        let lastTickSection = 0;
        let lastTickTime = startTime;

        let animate = (now) => {
            let elapsed = now - startTime;
            let t = Math.min(1, elapsed / duration);
            let eased = easeOutQuint(t);
            let currentRot = startRotation + totalDelta * eased;
            spinner.style.transform = 'rotate(' + currentRot + 'deg)';

            let passed = Math.floor((currentRot - startRotation) / step);
            while (lastTickSection < passed) {
                lastTickSection++;
                let dt = now - lastTickTime;
                lastTickTime = now;
                // dt < ~30ms feels like a buzz; ramp volume from 0.15 at
                // 20ms+ between ticks up to 1.0 at 100ms+.
                let vol = Math.max(0.15, Math.min(1, (dt - 20) / 80));
                playSound('wheel-tick', vol);
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
        this.cancelRoll();
        this.rolledMemberId = null;

        let modal = document.getElementById('wheelModal');
        let body = document.getElementById('wheelModalBody');
        let colorBar = document.getElementById('wheelModalColorBar');
        body.innerHTML = '';
        colorBar.style.background = this.colorFor(question);

        let titleEl = document.createElement('div');
        titleEl.className = 'wheel-modal-title';
        let baseTitle = (question.question && question.question.title) || ('Question #' + question.id);
        let group = this.findGroup(this.questionGroups[question.id]);
        titleEl.textContent = group ? (group.name + ' • ' + baseTitle) : baseTitle;
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
                    + '<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/PrismJS/prism@1/themes/prism.min.css"/>'
                    + '<style>'
                    + '.markdown-body{font-size:0.78rem!important}'
                    + '.markdown-body p{font-size:0.78rem!important;font-weight:normal!important;margin:0.15rem 0}'
                    + '.markdown-body ul,.markdown-body ol,.markdown-body li{font-size:0.78rem!important}'
                    + '.markdown-body h1,.markdown-body h2,.markdown-body h3{font-size:0.9rem!important}'
                    + '.markdown-body code{font-size:0.72rem!important}'
                    + 'p{font-size:0.78rem!important;font-weight:normal!important}'
                    + '</style>';
                mdEl.appendChild(tpl);
                row.appendChild(mdEl);
                list.appendChild(row);
            });
            body.appendChild(list);
        }

        this.applyHintsButton();
        this.refreshModalScore();

        let rollResult = document.getElementById('wheelMembersRollResult');
        if (rollResult) { rollResult.hidden = true; rollResult.textContent = ''; }
        this.applyMembersButton();
        // With the feature on, the roster is shown by default in the question
        // view; otherwise the panel stays closed.
        let membersPanel = document.getElementById('wheelMembersPanel');
        if (membersPanel) membersPanel.hidden = !this.prefs.membersEnabled;
        this.renderMembersPanel();

        modal.hidden = false;
        this.startTimer();
    }

    // Adds (or removes) the 1-5 star self-rating row in the open modal,
    // reflecting the current feature toggle. Rating changes refresh the
    // sidebar so its score badge stays in sync.
    refreshModalScore() {
        let body = document.getElementById('wheelModalBody');
        if (!body) return;
        let existing = body.querySelector('.wheel-modal-score');
        if (existing) existing.remove();
        if (!isScoringEnabled() || !this.selected) return;
        let wrap = document.createElement('div');
        wrap.className = 'score-row wheel-modal-score';
        populateScoreWidget(wrap, this.selected.id, () => this.renderSidebar());
        body.appendChild(wrap);
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
        this.cancelRoll();
        this.closeMembersPanel();
        this.selected = null;
        this.hintRevealed = false;
        this.rolledMemberId = null;
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
            // Completed: drop the saved state so a fresh load starts with the
            // full wheel rather than an empty one.
            clearWheelState(this.stateName);
            playSound('finish');
            document.getElementById('wheelView').hidden = true;
            document.body.style.overflow = '';
            showEndscreen('Congratulations!', 'You have answered all questions!');
            // Restart in wheel mode means "go back to the wheel with every
            // question visible again" — no full reload.
            let restartBtn = document.getElementById('restartButton');
            if (restartBtn) {
                restartBtn.onclick = () => {
                    document.getElementById('endScreen').hidden = true;
                    this.hidden.clear();
                    document.getElementById('wheelView').hidden = false;
                    document.body.style.overflow = 'hidden';
                    this.resetSpinner();
                    this.render();
                };
            }
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
