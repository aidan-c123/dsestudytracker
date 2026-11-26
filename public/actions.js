/* ============================================================
   Actions: one delegated handler plus per-view form bindings
   ============================================================ */

import {
  $, $$, esc, icon, state, api, refresh, hooks, toast, openModal, closeModal,
  applyTheme, submitting, errorText, subjectById, subjectPrediction, papersOf, papersFor,
  levelFromPercentage, lvlLabel, lvlChip, fmtDate, toLocalInput, daysUntil
} from './lib.js';
import {
  startTimer, pauseTimer, resumeTimer, stopTimer, timerState, paintTimer, BREAK_MINUTES
} from './timer.js';

/* --------------------------------- subjects -------------------------------- */

const CATALOG = [
  { code: 'CHIN', name: '中國語文', category: 'core' },
  { code: 'ENG', name: 'English Language', category: 'core' },
  { code: 'MATH', name: 'Mathematics', category: 'core' },
  { code: 'CSD', name: '公民與社會發展', category: 'core' },
  { code: 'M1', name: 'M1 — Calculus & Statistics', category: 'extended' },
  { code: 'M2', name: 'M2 — Algebra & Calculus', category: 'extended' },
  { code: 'BIOL', name: 'Biology', category: 'elective' },
  { code: 'CHEM', name: 'Chemistry', category: 'elective' },
  { code: 'PHYS', name: 'Physics', category: 'elective' },
  { code: 'ECON', name: 'Economics', category: 'elective' },
  { code: 'GEOG', name: 'Geography', category: 'elective' },
  { code: 'HIST', name: 'History', category: 'elective' },
  { code: 'CHIST', name: '中國歷史', category: 'elective' },
  { code: 'BAFS', name: 'BAFS', category: 'elective' },
  { code: 'ICT', name: 'ICT', category: 'elective' },
  { code: 'CLIT', name: '中國文學', category: 'elective' },
  { code: 'LIT', name: 'Literature in English', category: 'elective' },
  { code: 'THS', name: '旅遊與款待', category: 'elective' },
  { code: 'HMSC', name: '健康管理與社會關懷', category: 'elective' },
  { code: 'DAT', name: '設計與應用科技', category: 'elective' },
  { code: 'VA', name: 'Visual Arts', category: 'elective' },
  { code: 'MUS', name: 'Music', category: 'elective' },
  { code: 'PE', name: 'Physical Education', category: 'elective' },
  { code: 'ERS', name: '倫理與宗教', category: 'elective' }
];

/* ------------------------------- delegated UI ------------------------------ */

const HANDLERS = {
  'toggle-theme': async () => {
    const order = ['system', 'light', 'dark'];
    const current = state.data.user.theme || 'system';
    const next = order[(order.indexOf(current) + 1) % order.length];
    applyTheme(next);
    const data = await api('/me', { method: 'PATCH', body: { theme: next } });
    await refresh(data);
    toast(`Theme: ${next}.`);
  },

  'quick-log': () => openPaperModal(),

  'pick-subject': (el) => {
    state.paperSubjectId = el.dataset.id;
    hooks.renderView();
  },

  'log-paper': (el) => {
    openPaperModal({
      subjectId: el.dataset.subject,
      year: el.dataset.year,
      paper: el.dataset.paper
    });
  },

  'edit-paper': (el) => {
    const paper = state.data.papers.find((p) => p.id === el.dataset.id);
    if (paper) openPaperModal({ paper });
  },

  'delete-paper': async (el) => {
    if (!confirm('Delete this paper attempt?')) return;
    const data = await api(`/papers/${el.dataset.id}`, { method: 'DELETE' });
    await refresh(data);
    toast('Attempt removed.');
  },

  'new-error': () => openErrorModal(),
  'delete-error': async (el) => {
    const data = await api(`/errors/${el.dataset.id}`, { method: 'DELETE' });
    await refresh(data);
    toast('Entry removed.');
  },
  'error-filter': (el) => {
    state.errorSubject = el.dataset.id;
    hooks.renderView();
  },

  'new-task': () => openTaskModal(),
  'edit-task': (el) => {
    const task = state.data.tasks.find((t) => t.id === el.dataset.id);
    if (task) openTaskModal(task);
  },
  'delete-task': async (el) => {
    if (!confirm('Delete this task?')) return;
    const data = await api(`/tasks/${el.dataset.id}`, { method: 'DELETE' });
    await refresh(data);
    toast('Task deleted.');
  },
  'toggle-task': async (el) => {
    const task = state.data.tasks.find((t) => t.id === el.dataset.id);
    if (!task) return;
    const next = task.status === 'todo' ? 'doing' : task.status === 'doing' ? 'done' : 'todo';
    const data = await api(`/tasks/${task.id}`, { method: 'PATCH', body: { status: next } });
    await refresh(data);
    if (next === 'done') toast('Ticked. That one is off your desk.');
  },
  'task-filter': (el) => {
    state.taskFilter = el.dataset.id;
    hooks.renderView();
  },

  'add-subject': () => openSubjectModal(),
  'edit-subject': (el) => {
    const subject = subjectById(el.dataset.id);
    if (subject) openSubjectModal(subject);
  },
  'delete-subject': (el) => {
    const subject = subjectById(el.dataset.id);
    if (!subject) return;
    openModal({
      title: `Delete ${subject.name}?`,
      subtitle: 'This also removes its papers, focus sessions and tasks.',
      body: `<p class="card-note">There is no undo. If you only want to stop tracking it, set a new target instead.</p>`,
      footer: `
        <button class="btn btn-quiet" data-close type="button">Keep it</button>
        <button class="btn btn-danger" data-confirm type="button">Delete ${esc(subject.name)}</button>`,
      onMount: (dialog) => {
        dialog.querySelector('[data-confirm]').addEventListener('click', async () => {
          try {
            const data = await api(`/subjects/${subject.id}`, { method: 'DELETE' });
            closeModal();
            await refresh(data);
            toast('Subject and its records deleted.');
          } catch (err) {
            toast(errorText(err), 'error');
          }
        });
      }
    });
  },

  'timer-subject': (el) => {
    const t = timerState();
    if (t.running) return;
    state.timerSubject = el.value;
  },
  'preset': (el) => {
    const minutes = Number(el.dataset.preset);
    state.timerPresetMinutes = minutes;
    const t = timerState();
    if (t.running) {
      startFocus(minutes);
      return;
    }
    paintTimer();
  },
  'break': () => {
    startTimer({ minutes: BREAK_MINUTES, mode: 'break' });
  },
  'custom-minutes': () => {
    openModal({
      title: 'Custom focus block',
      subtitle: 'Anything from 5 to 180 minutes.',
      body: `<div class="field">
          <label for="custom-mins">Minutes</label>
          <input id="custom-mins" type="number" min="5" max="180" step="5" value="45" />
        </div>`,
      footer: `<button class="btn btn-quiet" data-close type="button">Cancel</button>
        <button class="btn btn-primary" data-start type="button">${icon('play')} Start</button>`,
      onMount: (dialog) => {
        dialog.querySelector('[data-start]').addEventListener('click', () => {
          const mins = Math.min(180, Math.max(5, Number(dialog.querySelector('#custom-mins').value) || 45));
          closeModal();
          startFocus(mins);
        });
      }
    });
  },
  'timer-start': () => startFocus(state.timerPresetMinutes || 25),
  'timer-pause': () => pauseTimer(),
  'timer-resume': () => resumeTimer(),
  'timer-stop': () => stopTimer(),
  'timer-finish': async () => {
    const t = timerState();
    if (!t.running) return;
    const minutes = Math.max(1, Math.round((t.duration - t.remaining) / 60));
    if (!confirm(`Log ${minutes} minutes now and stop the timer?`)) return;
    await logManual({ minutes, subjectId: t.subjectId, label: t.label || 'Early finish' });
    stopTimer({ silent: true });
  },

  'manual-log': () => openManualLogModal(),

  'theme': async (el) => {
    const theme = el.dataset.theme;
    applyTheme(theme);
    const data = await api('/me', { method: 'PATCH', body: { theme } });
    await refresh(data);
  },

  'export-data': () => {
    const payload = JSON.stringify(state.data, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `desk-no-4-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Export downloaded.');
  },

  'delete-account': () => {
    openModal({
      title: 'Delete your account?',
      subtitle: 'Every subject, paper, session and task goes with it.',
      body: `<p class="card-note">This cannot be undone. Export your data first if you might want it later.</p>`,
      footer: `<button class="btn btn-quiet" data-close type="button">Keep my account</button>
        <button class="btn btn-danger" data-confirm type="button">Delete everything</button>`,
      onMount: (dialog) => {
        dialog.querySelector('[data-confirm]').addEventListener('click', async () => {
          try {
            await api('/account', { method: 'DELETE' });
            closeModal();
            state.data = null;
            location.hash = '#/';
            location.reload();
          } catch (err) {
            toast(errorText(err), 'error');
          }
        });
      }
    });
  }
};

export function bindActions(event, el) {
  const handler = HANDLERS[el.dataset.act];
  if (!handler) return;
  if (el.tagName === 'SELECT') return;
  event.preventDefault();
  Promise.resolve(handler(el, event)).catch((err) => toast(errorText(err), 'error'));
}

/* ------------------------------ focus helpers ------------------------------ */

function startFocus(minutes) {
  const select = $('#timer-subject');
  const subjectId = select?.value || state.timerSubject || null;
  startTimer({ minutes, mode: 'focus', subjectId });
}

async function logManual({ minutes, subjectId = null, label = '', completedAt }) {
  const data = await api('/logs', {
    method: 'POST',
    body: {
      minutes,
      subjectId: subjectId || null,
      label,
      mode: 'focus',
      completedAt: completedAt || new Date().toISOString()
    }
  });
  await refresh(data);
}

function openManualLogModal() {
  const subjects = state.data.subjects;
  const when = toLocalInput();
  openModal({
    title: 'Log a study session',
    subtitle: "For work you did off the timer.",
    body: `
      <form id="manual-log-form" class="form-grid">
        <div class="field">
          <label for="ml-subject">Subject</label>
          <select id="ml-subject">
            <option value="">No subject</option>
            ${subjects.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-grid two">
          <div class="field">
            <label for="ml-minutes">Minutes</label>
            <input id="ml-minutes" type="number" min="1" max="1440" step="5" value="45" required />
          </div>
          <div class="field">
            <label for="ml-when">Finished at</label>
            <input id="ml-when" type="datetime-local" value="${when}" required />
          </div>
        </div>
        <div class="field">
          <label for="ml-label">What did you work on?</label>
          <input id="ml-label" maxlength="80" placeholder="Trig identities drill" />
        </div>
      </form>`,
    footer: `<button class="btn btn-quiet" data-close type="button">Cancel</button>
      <button class="btn btn-primary" type="submit" form="manual-log-form">Save session</button>`,
    onMount: (dialog) => {
      dialog.querySelector('#manual-log-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = dialog.querySelector('button[type="submit"]');
        const restore = submitting(btn, 'Saving…');
        try {
          await logManual({
            minutes: Number(dialog.querySelector('#ml-minutes').value),
            subjectId: dialog.querySelector('#ml-subject').value,
            label: dialog.querySelector('#ml-label').value,
            completedAt: new Date(dialog.querySelector('#ml-when').value).toISOString()
          });
          closeModal();
          toast('Session saved.');
        } catch (err) {
          restore();
          toast(errorText(err), 'error');
        }
      });
    }
  });
}

/* ------------------------------- paper modal ------------------------------- */

function openPaperModal({ subjectId, year, paper, paper: paperRecord } = {}) {
  const subjects = state.data.subjects;
  if (!subjects.length) {
    toast('Add a subject first.', 'error');
    return;
  }
  const existing = paperRecord || null;
  const initialSubject = existing?.subjectId || subjectId || state.paperSubjectId || subjects[0].id;
  const initialYear = existing?.year || Number(year) || 2024;
  const initialPaper = existing?.paper || paper || 'P1';
  const years = Array.from({ length: 15 }, (_, i) => 2026 - i);
  const list = papersFor(subjectById(initialSubject));

  openModal({
    title: existing ? 'Edit attempt' : 'Log a paper attempt',
    subtitle: existing ? `${paperRecord.year} ${paperRecord.paper}` : 'One cell per paper. Logging the same cell again updates it.',
    wide: true,
    body: `
      <form id="paper-form" class="form-grid">
        <div class="form-grid two">
          <div class="field">
            <label for="pf-subject">Subject</label>
            <select id="pf-subject">
              ${subjects
                .map((s) => `<option value="${s.id}" ${s.id === initialSubject ? 'selected' : ''}>${esc(s.name)}</option>`)
                .join('')}
            </select>
          </div>
          <div class="field">
            <label for="pf-paper">Paper</label>
            <select id="pf-paper">
              ${['P1', 'P2', 'P3', 'P4', 'SBA']
                .map((p) => `<option value="${p}" ${p === initialPaper ? 'selected' : ''}>${p}</option>`)
                .join('')}
            </select>
          </div>
        </div>
        <div class="form-grid two">
          <div class="field">
            <label for="pf-year">Year</label>
            <select id="pf-year">
              ${years.map((y) => `<option value="${y}" ${y === initialYear ? 'selected' : ''}>${y}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="pf-level">Estimated DSE level</label>
            <select id="pf-level">
              <option value="">Not set</option>
              ${[7, 6, 5, 4, 3, 2, 1]
                .map((l) => `<option value="${l}" ${existing?.estimatedLevel === l ? 'selected' : ''}>${lvlLabel(l)}</option>`)
                .join('')}
            </select>
          </div>
        </div>
        <div class="form-grid two">
          <div class="field">
            <label for="pf-score">Raw score</label>
            <input id="pf-score" type="number" min="0" step="0.5" value="${existing?.score ?? ''}" placeholder="72" />
          </div>
          <div class="field">
            <label for="pf-max">Out of</label>
            <input id="pf-max" type="number" min="0" step="0.5" value="${existing?.maxScore ?? ''}" placeholder="100" />
          </div>
        </div>
        <div class="field">
          <label for="pf-pct">Percentage <span class="muted">(auto from score, or type it)</span></label>
          <input id="pf-pct" type="number" min="0" max="100" step="0.1" value="${existing?.percentage ?? ''}" placeholder="72" />
          <span class="hint" id="pf-hint">Leave blank if you only want to note the level. ${list.length ? `Typical papers for this subject: ${list.join(', ')}.` : ''}</span>
        </div>
        <div class="field">
          <label for="pf-notes">Notes</label>
          <textarea id="pf-notes" maxlength="2000" placeholder="Section B ran long; Q9(b) lost marks on units.">${esc(existing?.notes || '')}</textarea>
        </div>
      </form>`,
    footer: `
      ${existing ? `<button class="btn btn-danger grow" data-delete type="button">${icon('trash')} Delete</button>` : ''}
      <button class="btn btn-quiet" data-close type="button">Cancel</button>
      <button class="btn btn-primary" type="submit" form="paper-form">${existing ? 'Save changes' : 'Log attempt'}</button>`,
    onMount: (dialog) => {
      const score = dialog.querySelector('#pf-score');
      const max = dialog.querySelector('#pf-max');
      const pctField = dialog.querySelector('#pf-pct');
      let pctTouched = Boolean(existing?.percentage);

      const recalc = () => {
        if (pctTouched) return;
        const s = Number(score.value);
        const m = Number(max.value);
        if (score.value !== '' && m > 0) pctField.value = Math.round((s / m) * 1000) / 10;
      };
      score.addEventListener('input', recalc);
      max.addEventListener('input', recalc);
      pctField.addEventListener('input', () => {
        pctTouched = true;
        const p = Number(pctField.value);
        const levelField = dialog.querySelector('#pf-level');
        if (!levelField.value && Number.isFinite(p) && pctField.value !== '') {
          const guess = levelFromPercentage(p);
          levelField.value = String(guess);
        }
      });

      dialog.querySelector('#pf-paper').addEventListener('change', (e) => {
        const p = e.target.value;
        if (p === 'SBA') dialog.querySelector('#pf-year').value = String(new Date().getFullYear());
      });

      if (existing) {
        dialog.querySelector('[data-delete]').addEventListener('click', async () => {
          if (!confirm('Delete this attempt?')) return;
          try {
            const data = await api(`/papers/${existing.id}`, { method: 'DELETE' });
            closeModal();
            await refresh(data);
            toast('Attempt removed.');
          } catch (err) {
            toast(errorText(err), 'error');
          }
        });
      }

      dialog.querySelector('#paper-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = dialog.querySelector('button[form="paper-form"]');
        const restore = submitting(btn, 'Saving…');
        const body = {
          subjectId: dialog.querySelector('#pf-subject').value,
          paper: dialog.querySelector('#pf-paper').value,
          year: Number(dialog.querySelector('#pf-year').value),
          score: dialog.querySelector('#pf-score').value === '' ? null : Number(dialog.querySelector('#pf-score').value),
          maxScore: dialog.querySelector('#pf-max').value === '' ? null : Number(dialog.querySelector('#pf-max').value),
          percentage: dialog.querySelector('#pf-pct').value === '' ? null : Number(dialog.querySelector('#pf-pct').value),
          estimatedLevel: dialog.querySelector('#pf-level').value ? Number(dialog.querySelector('#pf-level').value) : null,
          notes: dialog.querySelector('#pf-notes').value
        };
        try {
          const data = existing
            ? await api(`/papers/${existing.id}`, { method: 'PATCH', body })
            : await api('/papers', { method: 'POST', body });
          closeModal();
          state.paperSubjectId = body.subjectId;
          await refresh(data);
          toast(existing ? 'Attempt updated.' : 'Attempt logged.');
        } catch (err) {
          restore();
          toast(errorText(err), 'error');
        }
      });
    }
  });
}

/* ------------------------------- error modal ------------------------------- */

function openErrorModal() {
  const subjects = state.data.subjects;
  openModal({
    title: 'Add to the red-ink log',
    subtitle: 'The question type that keeps costing you marks.',
    body: `
      <form id="error-form" class="form-grid">
        <div class="form-grid two">
          <div class="field">
            <label for="er-subject">Subject</label>
            <select id="er-subject">
              <option value="">No subject</option>
              ${subjects.map((s) => `<option value="${s.id}" ${s.id === state.paperSubjectId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="er-type">Kind of mistake</label>
            <select id="er-type">
              <option value="concept">Concept not solid</option>
              <option value="careless">Careless</option>
              <option value="time">Ran out of time</option>
              <option value="misread">Misread the question</option>
              <option value="technique">Wrong technique</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label for="er-topic">Topic or question</label>
          <input id="er-topic" maxlength="120" placeholder="Log laws — combining bases" required />
        </div>
        <div class="field">
          <label for="er-ref">Reference <span class="muted">(optional)</span></label>
          <input id="er-ref" maxlength="80" placeholder="2023 P1 Q8" />
        </div>
        <div class="field">
          <label for="er-note">What went wrong</label>
          <textarea id="er-note" maxlength="2000" placeholder="Forgot to apply the power rule before subtracting."></textarea>
        </div>
      </form>`,
    footer: `<button class="btn btn-quiet" data-close type="button">Cancel</button>
      <button class="btn btn-primary" type="submit" form="error-form">Add entry</button>`,
    onMount: (dialog) => {
      dialog.querySelector('#error-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = dialog.querySelector('button[form="error-form"]');
        const restore = submitting(btn, 'Saving…');
        try {
          const data = await api('/errors', {
            method: 'POST',
            body: {
              subjectId: dialog.querySelector('#er-subject').value || null,
              topic: dialog.querySelector('#er-topic').value,
              questionRef: dialog.querySelector('#er-ref').value,
              errorType: dialog.querySelector('#er-type').value,
              note: dialog.querySelector('#er-note').value
            }
          });
          closeModal();
          await refresh(data);
          toast('Added to the red-ink log.');
        } catch (err) {
          restore();
          toast(errorText(err), 'error');
        }
      });
    }
  });
}

/* -------------------------------- task modal ------------------------------- */

function openTaskModal(task = null) {
  const subjects = state.data.subjects;
  const today = new Date();
  const defaultDate = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  openModal({
    title: task ? 'Edit task' : 'New task',
    subtitle: 'SBA submission, mock paper, or a revision block.',
    body: `
      <form id="task-form" class="form-grid">
        <div class="field">
          <label for="tk-title">Title</label>
          <input id="tk-title" maxlength="140" value="${esc(task?.title || '')}" placeholder="Chemistry SBA — practical report draft" required />
        </div>
        <div class="form-grid two">
          <div class="field">
            <label for="tk-kind">Type</label>
            <select id="tk-kind">
              ${['sba', 'revision', 'mock', 'other']
                .map((k) => `<option value="${k}" ${task?.kind === k ? 'selected' : ''}>${k}</option>`)
                .join('')}
            </select>
          </div>
          <div class="field">
            <label for="tk-subject">Subject</label>
            <select id="tk-subject">
              <option value="">No subject</option>
              ${subjects
                .map((s) => `<option value="${s.id}" ${task?.subjectId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`)
                .join('')}
            </select>
          </div>
        </div>
        <div class="form-grid two">
          <div class="field">
            <label for="tk-due">Due date</label>
            <input id="tk-due" type="date" value="${task?.dueDate || defaultDate}" />
          </div>
          <div class="field">
            <label for="tk-weight">Weight in SBA <span class="muted">(%)</span></label>
            <input id="tk-weight" type="number" min="0" max="100" step="1" value="${task?.weightPct ?? ''}" placeholder="10" />
          </div>
        </div>
        <div class="field">
          <label for="tk-notes">Notes</label>
          <textarea id="tk-notes" maxlength="2000" placeholder="Hand in to Mr Chan; include error analysis.">${esc(task?.notes || '')}</textarea>
        </div>
      </form>`,
    footer: `<button class="btn btn-quiet" data-close type="button">Cancel</button>
      <button class="btn btn-primary" type="submit" form="task-form">${task ? 'Save changes' : 'Add task'}</button>`,
    onMount: (dialog) => {
      dialog.querySelector('#task-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = dialog.querySelector('button[form="task-form"]');
        const restore = submitting(btn, 'Saving…');
        const body = {
          title: dialog.querySelector('#tk-title').value,
          kind: dialog.querySelector('#tk-kind').value,
          subjectId: dialog.querySelector('#tk-subject').value || null,
          dueDate: dialog.querySelector('#tk-due').value || null,
          weightPct: dialog.querySelector('#tk-weight').value === '' ? null : Number(dialog.querySelector('#tk-weight').value),
          notes: dialog.querySelector('#tk-notes').value
        };
        try {
          const data = task
            ? await api(`/tasks/${task.id}`, { method: 'PATCH', body })
            : await api('/tasks', { method: 'POST', body });
          closeModal();
          await refresh(data);
          toast(task ? 'Task updated.' : 'Task added.');
        } catch (err) {
          restore();
          toast(errorText(err), 'error');
        }
      });
    }
  });
}

/* ------------------------------- subject modal ----------------------------- */

function openSubjectModal(subject = null) {
  const existingCodes = new Set(state.data.subjects.map((s) => s.code));
  const options = CATALOG.filter((c) => !existingCodes.has(c.code) || subject?.code === c.code);
  openModal({
    title: subject ? `Edit ${subject.name}` : 'Add a subject',
    subtitle: subject ? 'Targets feed the ledger and the paper matrix.' : 'Electives, M1 or M2.',
    body: `
      <form id="subject-form" class="form-grid">
        ${
          subject
            ? `<div class="field"><label>Subject</label><input value="${esc(subject.name)}" disabled /></div>`
            : `<div class="field">
                <label for="sj-code">Subject</label>
                <select id="sj-code">
                  ${options.map((c) => `<option value="${c.code}">${esc(c.name)}</option>`).join('')}
                  <option value="OTHER">Other (type a name)</option>
                </select>
              </div>
              <div class="field" id="sj-custom-wrap" hidden>
                <label for="sj-custom">Subject name</label>
                <input id="sj-custom" maxlength="60" placeholder="e.g. Japanese" />
              </div>`
        }
        <div class="form-grid two">
          <div class="field">
            <label for="sj-target">Target level</label>
            <select id="sj-target">
              ${[7, 6, 5, 4, 3, 2, 1]
                .map((l) => `<option value="${l}" ${(subject?.targetLevel || 4) === l ? 'selected' : ''}>${lvlLabel(l)}</option>`)
                .join('')}
            </select>
          </div>
          <div class="field">
            <label for="sj-predicted">School predicted <span class="muted">(optional)</span></label>
            <select id="sj-predicted">
              <option value="">Use paper evidence</option>
              ${[7, 6, 5, 4, 3, 2, 1]
                .map((l) => `<option value="${l}" ${subject?.predictedLevel === l ? 'selected' : ''}>${lvlLabel(l)}</option>`)
                .join('')}
            </select>
          </div>
        </div>
        <div class="field">
          <label for="sj-exam">Exam date <span class="muted">(optional — for per-subject countdown)</span></label>
          <input id="sj-exam" type="date" value="${subject?.examDate || ''}" />
        </div>
      </form>`,
    footer: `<button class="btn btn-quiet" data-close type="button">Cancel</button>
      <button class="btn btn-primary" type="submit" form="subject-form">${subject ? 'Save' : 'Add subject'}</button>`,
    onMount: (dialog) => {
      const codeSelect = dialog.querySelector('#sj-code');
      if (codeSelect) {
        codeSelect.addEventListener('change', () => {
          const wrap = dialog.querySelector('#sj-custom-wrap');
          wrap.hidden = codeSelect.value !== 'OTHER';
        });
      }
      dialog.querySelector('#subject-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = dialog.querySelector('button[form="subject-form"]');
        const restore = submitting(btn, 'Saving…');
        try {
          let body;
          if (subject) {
            body = {
              name: dialog.querySelector('#sj-target') ? undefined : undefined,
              targetLevel: Number(dialog.querySelector('#sj-target').value),
              predictedLevel: dialog.querySelector('#sj-predicted').value
                ? Number(dialog.querySelector('#sj-predicted').value)
                : null,
              examDate: dialog.querySelector('#sj-exam').value || null
            };
            const data = await api(`/subjects/${subject.id}`, { method: 'PATCH', body });
            closeModal();
            await refresh(data);
            toast('Subject updated.');
          } else {
            const code = dialog.querySelector('#sj-code').value;
            const custom = dialog.querySelector('#sj-custom')?.value || '';
            if (code === 'OTHER' && !custom.trim()) {
              restore();
              toast('Type a name for the custom subject.', 'error');
              return;
            }
            body = {
              code: code === 'OTHER' ? '' : code,
              name: code === 'OTHER' ? custom : undefined,
              category: code === 'OTHER' ? 'elective' : undefined,
              targetLevel: Number(dialog.querySelector('#sj-target').value),
              predictedLevel: dialog.querySelector('#sj-predicted').value
                ? Number(dialog.querySelector('#sj-predicted').value)
                : null,
              examDate: dialog.querySelector('#sj-exam').value || null
            };
            const data = await api('/subjects', { method: 'POST', body });
            closeModal();
            await refresh(data);
            toast('Subject added.');
          }
        } catch (err) {
          restore();
          toast(errorText(err), 'error');
        }
      });
    }
  });
}

/* ------------------------------- view bindings ----------------------------- */

export function bindViewExtras(host) {
  const timerSelect = host.querySelector('[data-timer-subject]');
  if (timerSelect) {
    timerSelect.addEventListener('change', () => {
      state.timerSubject = timerSelect.value;
    });
  }

  const examForm = host.querySelector('#exam-form');
  if (examForm) {
    examForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = examForm.querySelector('button[type="submit"]');
      const restore = submitting(btn, 'Saving…');
      const errEl = host.querySelector('#exam-error');
      errEl.hidden = true;
      try {
        const data = await api('/me', {
          method: 'PATCH',
          body: {
            name: examForm.querySelector('#set-name').value,
            examDate: examForm.querySelector('#set-exam').value,
            resultsDate: examForm.querySelector('#set-results').value,
            dailyGoalMinutes: Number(examForm.querySelector('#set-goal').value)
          }
        });
        await refresh(data);
        toast('Exam plan saved.');
      } catch (err) {
        restore();
        errEl.hidden = false;
        errEl.textContent = errorText(err);
      }
    });
  }

  const passwordForm = host.querySelector('#password-form');
  if (passwordForm) {
    passwordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = passwordForm.querySelector('button[type="submit"]');
      const restore = submitting(btn, 'Updating…');
      const errEl = host.querySelector('#password-error');
      errEl.hidden = true;
      try {
        await api('/password', {
          method: 'POST',
          body: {
            currentPassword: passwordForm.querySelector('#pw-current').value,
            newPassword: passwordForm.querySelector('#pw-new').value
          }
        });
        passwordForm.reset();
        restore();
        toast('Password updated. Other devices were signed out.');
      } catch (err) {
        restore();
        errEl.hidden = false;
        errEl.textContent = errorText(err);
      }
    });
  }
}

void icon;
void daysUntil;
void papersOf;
void subjectPrediction;
