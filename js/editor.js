let dlcData = {
    filetype: 'examiner-dlc',
    version: '1.3',
    name: 'New DLC',
    poolsize: 5,
    data: []
};

let nextId = 1;
let expandedIds = new Set();
let allExpanded = false;

// ── Escape helpers ────────────────────────────────────────────────

function escHtml(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function escAttr(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;');
}

// ── File I/O ──────────────────────────────────────────────────────

function readSingleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => loadDlcForEditing(ev.target.result, file.name);
    reader.readAsText(file);
}

function loadDlcForEditing(contents, filename) {
    let parsed;
    try {
        parsed = JSON.parse(contents);
    } catch (e) {
        alert('Could not parse DLC file:\n' + e.message);
        return;
    }

    if (!parsed || parsed.filetype !== 'examiner-dlc') {
        alert('Invalid DLC file (missing or wrong filetype).');
        return;
    }

    if (!Array.isArray(parsed.data)) parsed.data = [];
    if (!parsed.version) parsed.version = '1.3';
    if (!parsed.poolsize || parsed.poolsize < 1) parsed.poolsize = 5;
    if (!parsed.name) parsed.name = filename ? filename.replace(/\.dlc$/i, '') : 'New DLC';

    let maxId = 0;
    parsed.data.forEach((q, i) => {
        if (!q.id) q.id = i + 1;
        if (q.id > maxId) maxId = q.id;
        if (!q.question) q.question = { type: 'text', content: '' };
        if (!q.answers) q.answers = [];
    });

    dlcData = parsed;
    nextId = maxId + 1;
    expandedIds.clear();
    openEditor();
}

function createNewDlc() {
    dlcData = {
        filetype: 'examiner-dlc',
        version: '1.3',
        name: 'New DLC',
        poolsize: 5,
        data: []
    };
    nextId = 1;
    expandedIds.clear();
    openEditor();
}

// ── Navigation ─────────────────────────────────────────────────────

function openEditor() {
    document.getElementById('editorTitle').hidden = true;
    document.getElementById('editorScreen').hidden = false;
    document.getElementById('dlc-name-input').value = dlcData.name;
    document.getElementById('dlc-poolsize-input').value = dlcData.poolsize;
    allExpanded = false;
    document.getElementById('toggleAllBtn').textContent = 'Expand All';
    renderAllQuestions();
}

function goBackToTitle() {
    if (dlcData.data.length > 0) {
        if (!confirm('Go back? Unsaved changes will be lost.')) return;
    }
    document.getElementById('editorScreen').hidden = true;
    document.getElementById('editorTitle').hidden = false;
    document.getElementById('file-input').value = '';
}

// ── Rendering ─────────────────────────────────────────────────────

function renderAllQuestions() {
    const container = document.getElementById('questionsList');

    if (dlcData.data.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No questions yet. Add your first question!</p></div>';
        return;
    }

    container.innerHTML = '';
    dlcData.data.forEach((q, index) => {
        container.appendChild(createQuestionCard(q, index));
    });

    UIkit.update();
}

function createQuestionCard(question, index) {
    const card = document.createElement('div');
    card.className = 'question-card' + (expandedIds.has(question.id) ? ' expanded' : '');
    card.id = 'q-card-' + question.id;

    const typeLabel = question.type === 'self-assessment' ? 'Self Assessment' : 'Multiple Choice';
    const typeCls   = question.type === 'self-assessment' ? 'badge-self' : 'badge-multi';
    const preview   = getPreview(question);
    const isFirst   = index === 0;
    const isLast    = index === dlcData.data.length - 1;

    card.innerHTML = `
        <div class="card-header" onclick="toggleCard(${question.id})">
            <div class="card-header-left">
                <span class="q-number">Q${index + 1}</span>
                <span class="type-badge ${typeCls}">${typeLabel}</span>
                <span class="q-preview">${escHtml(preview)}</span>
            </div>
            <div class="card-header-actions" onclick="event.stopPropagation()">
                <button class="btn-icon uk-button uk-button-default" title="Move Up"
                    ${isFirst ? 'disabled' : ''} onclick="moveQuestion(${question.id}, -1)">
                    <span uk-icon="chevron-up"></span>
                </button>
                <button class="btn-icon uk-button uk-button-default" title="Move Down"
                    ${isLast ? 'disabled' : ''} onclick="moveQuestion(${question.id}, 1)">
                    <span uk-icon="chevron-down"></span>
                </button>
                <button class="btn-icon uk-button uk-button-danger" title="Delete Question"
                    onclick="deleteQuestion(${question.id})">
                    <span uk-icon="trash"></span>
                </button>
            </div>
        </div>
        <div class="card-body">
            ${buildQuestionForm(question)}
        </div>
    `;

    return card;
}

function getPreview(question) {
    if (!question.question) return '(empty)';
    const text = question.question.content || question.question.src || '';
    return text.length > 72 ? text.slice(0, 69) + '...' : text || '(empty)';
}

function buildQuestionForm(question) {
    const qType       = question.type || 'question-with-answers';
    const contentType = question.question ? question.question.type    : 'text';
    const content     = question.question ? (question.question.content || question.question.src || '') : '';
    const answers     = question.answers || [];

    const answersHtml = answers.length > 0
        ? answers.map((a, i) => buildAnswerRow(question.id, a, i, qType)).join('')
        : '<div class="no-answers">No answers yet</div>';

    const contentField = contentType === 'image'
        ? `<input type="text" class="uk-input form-control" placeholder="https://..."
               value="${escAttr(content)}" oninput="updateQuestionContent(${question.id}, this.value)">`
        : `<textarea class="uk-textarea form-control" rows="3" placeholder="Enter question text..."
               oninput="updateQuestionContent(${question.id}, this.value)">${escHtml(content)}</textarea>`;

    return `
        <div class="form-section">
            <div class="form-row">
                <label class="form-label">Question type</label>
                <select class="uk-select form-control"
                    onchange="updateQuestionType(${question.id}, this.value)">
                    <option value="question-with-answers"
                        ${qType === 'question-with-answers' ? 'selected' : ''}>Multiple Choice</option>
                    <option value="self-assessment"
                        ${qType === 'self-assessment' ? 'selected' : ''}>Self Assessment</option>
                </select>
            </div>
            <div class="form-row">
                <label class="form-label">Format</label>
                <select class="uk-select form-control"
                    onchange="updateQuestionContentType(${question.id}, this.value)">
                    <option value="text"  ${contentType === 'text'  ? 'selected' : ''}>Text</option>
                    <option value="image" ${contentType === 'image' ? 'selected' : ''}>Image URL</option>
                </select>
            </div>
            <div class="form-row">
                <label class="form-label">${contentType === 'image' ? 'Image URL' : 'Question'}</label>
                ${contentField}
            </div>
        </div>
        <div class="answers-section">
            <div class="answers-header">
                <span class="answers-title">Answers</span>
                <button class="uk-button uk-button-primary btn-sm"
                    onclick="addAnswer(${question.id})">+ Add Answer</button>
            </div>
            <div class="answers-list" id="answers-${question.id}">
                ${answersHtml}
            </div>
        </div>
    `;
}

function buildAnswerRow(questionId, answer, index, questionType) {
    const type      = answer.type || 'text';
    const content   = answer.content || answer.src || '';
    const isCorrect = answer.correct === true;
    const showCorrect = questionType === 'question-with-answers';

    const typeOptions = ['text', 'image', 'text-md'].map(t =>
        `<option value="${t}" ${type === t ? 'selected' : ''}>${t === 'text-md' ? 'Markdown' : t.charAt(0).toUpperCase() + t.slice(1)}</option>`
    ).join('');

    const correctToggle = showCorrect ? `
        <label class="correct-toggle" title="Mark as correct answer">
            <input type="checkbox" ${isCorrect ? 'checked' : ''}
                onchange="updateAnswerCorrect(${questionId}, ${index}, this.checked)">
            <span>Correct</span>
        </label>` : '';

    const contentInput = type === 'image'
        ? `<input type="text" class="uk-input" placeholder="Image URL..."
               value="${escAttr(content)}" oninput="updateAnswerContent(${questionId}, ${index}, this.value)">`
        : `<textarea class="uk-textarea" rows="${type === 'text-md' ? 4 : 2}"
               placeholder="${type === 'text-md' ? 'Markdown content...' : 'Answer text...'}"
               oninput="updateAnswerContent(${questionId}, ${index}, this.value)">${escHtml(content)}</textarea>`;

    return `
        <div class="answer-row" id="ans-row-${questionId}-${index}">
            <div class="answer-controls">
                <select class="uk-select ans-select"
                    onchange="updateAnswerType(${questionId}, ${index}, this.value)">${typeOptions}</select>
                ${correctToggle}
                <button class="uk-button uk-button-danger btn-icon btn-sm"
                    title="Delete Answer" onclick="deleteAnswer(${questionId}, ${index})">
                    <span uk-icon="trash"></span>
                </button>
            </div>
            <div class="answer-content">
                ${contentInput}
            </div>
        </div>
    `;
}

// ── Card collapse ──────────────────────────────────────────────────

function toggleCard(id) {
    const card = document.getElementById('q-card-' + id);
    if (!card) return;
    if (card.classList.contains('expanded')) {
        card.classList.remove('expanded');
        expandedIds.delete(id);
    } else {
        card.classList.add('expanded');
        expandedIds.add(id);
        UIkit.update(card);
    }
}

function toggleAllCards() {
    allExpanded = !allExpanded;
    document.getElementById('toggleAllBtn').textContent = allExpanded ? 'Collapse All' : 'Expand All';
    dlcData.data.forEach(q => {
        const card = document.getElementById('q-card-' + q.id);
        if (!card) return;
        if (allExpanded) {
            card.classList.add('expanded');
            expandedIds.add(q.id);
        } else {
            card.classList.remove('expanded');
            expandedIds.delete(q.id);
        }
    });
    if (allExpanded) UIkit.update();
}

// ── Question CRUD ─────────────────────────────────────────────────

function addQuestion() {
    const newQ = {
        id: nextId++,
        type: 'question-with-answers',
        question: { type: 'text', content: '' },
        answers: []
    };
    dlcData.data.push(newQ);
    expandedIds.add(newQ.id);
    renderAllQuestions();
    setTimeout(() => {
        const card = document.getElementById('q-card-' + newQ.id);
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
}

function deleteQuestion(id) {
    if (!confirm('Delete this question?')) return;
    dlcData.data = dlcData.data.filter(q => q.id !== id);
    expandedIds.delete(id);
    renderAllQuestions();
}

function moveQuestion(id, dir) {
    const idx = dlcData.data.findIndex(q => q.id === id);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= dlcData.data.length) return;
    [dlcData.data[idx], dlcData.data[newIdx]] = [dlcData.data[newIdx], dlcData.data[idx]];
    renderAllQuestions();
}

function updateQuestionType(id, newType) {
    const q = dlcData.data.find(q => q.id === id);
    if (!q) return;
    q.type = newType;

    if (newType === 'self-assessment') {
        q.answers.forEach(a => delete a.correct);
    } else {
        q.answers.forEach(a => { if (a.correct === undefined) a.correct = false; });
    }

    refreshAnswersList(id, q);
    updateTypeBadge(id, newType);
}

function updateQuestionContentType(id, newContentType) {
    const q = dlcData.data.find(q => q.id === id);
    if (!q) return;
    const oldContent = q.question ? (q.question.content || q.question.src || '') : '';
    if (!q.question) q.question = {};
    q.question.type = newContentType;

    if (newContentType === 'image') {
        delete q.question.content;
        q.question.src = oldContent;
    } else {
        delete q.question.src;
        q.question.content = oldContent;
    }

    const card = document.getElementById('q-card-' + id);
    if (card) {
        card.querySelector('.card-body').innerHTML = buildQuestionForm(q);
        UIkit.update(card);
    }
}

function updateQuestionContent(id, value) {
    const q = dlcData.data.find(q => q.id === id);
    if (!q || !q.question) return;
    if (q.question.type === 'image') q.question.src = value;
    else q.question.content = value;

    const card = document.getElementById('q-card-' + id);
    if (card) {
        const preview = card.querySelector('.q-preview');
        if (preview) {
            preview.textContent = value.length > 72 ? value.slice(0, 69) + '...' : value || '(empty)';
        }
    }
}

function updateTypeBadge(id, type) {
    const card = document.getElementById('q-card-' + id);
    if (!card) return;
    const badge = card.querySelector('.type-badge');
    if (!badge) return;
    badge.textContent = type === 'self-assessment' ? 'Self Assessment' : 'Multiple Choice';
    badge.className = `type-badge ${type === 'self-assessment' ? 'badge-self' : 'badge-multi'}`;
}

// ── Answer CRUD ───────────────────────────────────────────────────

function addAnswer(questionId) {
    const q = dlcData.data.find(q => q.id === questionId);
    if (!q) return;
    if (!q.answers) q.answers = [];
    const ans = { type: 'text', content: '' };
    if (q.type === 'question-with-answers') ans.correct = false;
    q.answers.push(ans);
    refreshAnswersList(questionId, q);
}

function deleteAnswer(questionId, index) {
    const q = dlcData.data.find(q => q.id === questionId);
    if (!q || !q.answers) return;
    q.answers.splice(index, 1);
    refreshAnswersList(questionId, q);
}

function updateAnswerType(questionId, index, newType) {
    const q = dlcData.data.find(q => q.id === questionId);
    if (!q || !q.answers[index]) return;
    const ans = q.answers[index];
    const oldContent = ans.content || ans.src || '';
    ans.type = newType;
    if (newType === 'image') {
        delete ans.content;
        ans.src = oldContent;
    } else {
        delete ans.src;
        ans.content = oldContent;
    }
    refreshAnswersList(questionId, q);
}

function updateAnswerContent(questionId, index, value) {
    const q = dlcData.data.find(q => q.id === questionId);
    if (!q || !q.answers[index]) return;
    const ans = q.answers[index];
    if (ans.type === 'image') ans.src = value;
    else ans.content = value;
}

function updateAnswerCorrect(questionId, index, checked) {
    const q = dlcData.data.find(q => q.id === questionId);
    if (!q || !q.answers[index]) return;
    q.answers[index].correct = checked;
}

function refreshAnswersList(questionId, question) {
    const container = document.getElementById('answers-' + questionId);
    if (!container) return;
    const answers = question.answers || [];
    container.innerHTML = answers.length > 0
        ? answers.map((a, i) => buildAnswerRow(questionId, a, i, question.type)).join('')
        : '<div class="no-answers">No answers yet</div>';
    UIkit.update(container);
}

// ── Export ─────────────────────────────────────────────────────────

function exportDlc() {
    dlcData.name     = document.getElementById('dlc-name-input').value || 'DLC';
    dlcData.poolsize = parseInt(document.getElementById('dlc-poolsize-input').value) || 5;

    const json = JSON.stringify(dlcData, null, 4);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = (dlcData.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'dlc') + '.dlc';
    a.click();
    URL.revokeObjectURL(url);
}

// ── Drag and Drop ──────────────────────────────────────────────────

let dragCount = 0;

document.addEventListener('dragenter', () => {
    if (document.getElementById('editorTitle').hidden) return;
    dragCount++;
    document.getElementById('upload-zone').classList.add('drag-over');
});

document.addEventListener('dragleave', () => {
    if (document.getElementById('editorTitle').hidden) return;
    if (--dragCount <= 0) {
        dragCount = 0;
        document.getElementById('upload-zone').classList.remove('drag-over');
    }
});

document.addEventListener('dragover', e => e.preventDefault());

document.addEventListener('drop', e => {
    e.preventDefault();
    dragCount = 0;
    document.getElementById('upload-zone').classList.remove('drag-over');
    if (document.getElementById('editorTitle').hidden) return;
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => loadDlcForEditing(ev.target.result, file.name);
    reader.readAsText(file);
});

document.getElementById('file-input').addEventListener('change', readSingleFile);
