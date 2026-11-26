/**
 * End-to-end UI test: boots the real app (app.js → views → actions) with a
 * stubbed `/api` backend, then clicks the real buttons in the real pages.
 *
 * Covers the regression where #modal-root / #toast-root were missing from
 * index.html, so every dialog threw on a null element, plus the round trip of
 * adding a subject and a task through to a re-render.
 *
 * Needs jsdom, which is not a project dependency:  npm i -D jsdom
 * Run: node test/ui.test.mjs
 */

import { readFileSync } from 'node:fs';

let JSDOM;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  console.log('skipped: jsdom not installed (npm i -D jsdom to run this test)');
  process.exit(0);
}

/* ------------------------------ browser globals ---------------------------- */

const dom = new JSDOM(readFileSync('./public/index.html', 'utf8'), {
  url: 'https://desk.example/',
  pretendToBeVisual: true
});
const { window } = dom;

globalThis.window = window;
globalThis.document = window.document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Element = window.Element;
globalThis.Node = window.Node;
globalThis.Event = window.Event;
globalThis.CustomEvent = window.CustomEvent;
globalThis.getComputedStyle = window.getComputedStyle;
window.matchMedia = (q) => ({
  matches: false,
  media: q,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {}
});
globalThis.matchMedia = window.matchMedia;
window.scrollTo = () => {};
window.confirm = () => true;
globalThis.history = window.history;
globalThis.location = window.location;
globalThis.MouseEvent = window.MouseEvent;
globalThis.KeyboardEvent = window.KeyboardEvent;
globalThis.XMLHttpRequest = window.XMLHttpRequest;
globalThis.setInterval = window.setInterval.bind(window);
globalThis.clearInterval = window.clearInterval.bind(window);

/* ------------------------------- stub backend ------------------------------ */

const core = (id, code, name) => ({
  id,
  code,
  name,
  category: 'core',
  targetLevel: 4,
  predictedLevel: null,
  examDate: null,
  sortOrder: 0
});

const db = {
  user: {
    id: 'u1',
    name: 'Test Student',
    email: 't@school.edu.hk',
    theme: 'system',
    examDate: '2027-04-06',
    resultsDate: '2027-07-14',
    dailyGoalMinutes: 120
  },
  subjects: [
    core('s1', 'CHIN', '中國語文'),
    core('s2', 'ENG', 'English Language'),
    core('s3', 'MATH', 'Mathematics'),
    core('s4', 'CSD', '公民與社會發展')
  ],
  papers: [],
  logs: [],
  tasks: [],
  errors: []
};

const workspace = () => JSON.parse(JSON.stringify(db));
let seq = 0;

function serve(path, method, body) {
  if (path === 'me' && method === 'GET') return [200, workspace()];
  if (path === 'me' && method === 'PATCH') {
    Object.assign(db.user, body);
    return [200, workspace()];
  }
  if (path === 'subjects' && method === 'POST') {
    db.subjects.push({
      id: `s${++seq}`,
      code: body.code || 'OTHER',
      name: body.name || body.code || 'Subject',
      category: body.category || 'elective',
      targetLevel: body.targetLevel || 4,
      predictedLevel: body.predictedLevel ?? null,
      examDate: body.examDate ?? null,
      sortOrder: 9
    });
    return [201, workspace()];
  }
  if (path === 'tasks' && method === 'POST') {
    db.tasks.push({
      id: `t${++seq}`,
      status: 'todo',
      title: body.title,
      kind: body.kind || 'sba',
      subjectId: body.subjectId ?? null,
      dueDate: body.dueDate ?? null,
      weightPct: body.weightPct ?? null,
      notes: body.notes || ''
    });
    return [201, workspace()];
  }
  if (path === 'papers' && method === 'POST') {
    db.papers.push({ id: `p${++seq}`, ...body, attemptedAt: new Date().toISOString() });
    return [201, workspace()];
  }
  if (path === 'logs' && method === 'POST') {
    db.logs.push({ id: `l${++seq}`, ...body });
    return [201, workspace()];
  }
  return [404, { error: `no stub for ${method} ${path}` }];
}

globalThis.fetch = async (input, options = {}) => {
  const url = new URL(String(input), 'https://desk.example/');
  const path = url.searchParams.get('__p') || '';
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(options.body) : null;
  const [status, payload] = serve(path, method, body);
  return {
    ok: status < 400,
    status,
    text: async () => JSON.stringify(payload),
    headers: { get: () => null }
  };
};

/* ---------------------------------- run ---------------------------------- */

const lib = await import('../public/lib.js');
const app = await import('../public/app.js');

let failed = 0;
const check = (label, fn) => {
  try {
    fn();
    console.log(`  ok  ${label}`);
  } catch (err) {
    failed++;
    console.error(`FAIL  ${label}\n      ${err.message}`);
  }
};

const $ = (sel) => window.document.querySelector(sel);
const $$ = (sel) => [...window.document.querySelectorAll(sel)];
const modal = () => $('#modal-root .modal');
const tick = () => new Promise((r) => setTimeout(r, 0));

const events = [];
window.document.addEventListener('click', (e) => {
  const el = e.target.closest?.('[data-act]');
  if (!el) return;
  // Replays the document-level delegation installed by app.js bindGlobal().
  events.push(el.dataset.act);
});

console.log('\nDesk No. 4 — end-to-end UI test\n');

await app.boot();
await tick();

check('the desk renders after boot', () => {
  if (!$('.shell')) throw new Error('shell not rendered');
  if (!$('#view')) throw new Error('view host missing');
  if (!window.document.body.textContent.includes('Test Student')) throw new Error('user name not shown');
});

check('dialogs are reachable: the overlay hosts exist in the page', () => {
  if (!$('#modal-root')) throw new Error('#modal-root missing from index.html');
  if (!$('#toast-root')) throw new Error('#toast-root missing from index.html');
});

/* --- Add a subject, through the real Papers view button ------------------- */

app.navigate('papers');
await tick();

const addSubjectBtn = $('[data-act="add-subject"]');
check('the Papers page renders an Add a subject button', () => {
  if (!addSubjectBtn) throw new Error('no [data-act="add-subject"] in the Papers view');
});

addSubjectBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await tick();

check('clicking Add a subject opens the dialog', () => {
  const m = modal();
  if (!m) throw new Error('no dialog appeared');
  if (!m.textContent.includes('Add a subject')) throw new Error('unexpected dialog title');
  if (!m.querySelector('#subject-form')) throw new Error('subject form missing');
});

check('the subject picker lists electives, not the cores already added', () => {
  const codes = [...modal().querySelectorAll('#sj-code option')].map((o) => o.value);
  if (!codes.includes('BIOL')) throw new Error('Biology missing from the catalogue');
  if (codes.includes('MATH')) throw new Error('already-added Mathematics should not be offered');
});

// Fill and submit the dialog exactly as a student would.
$('#sj-code').value = 'BIOL';
$('#sj-code').dispatchEvent(new window.Event('change', { bubbles: true }));
$('#sj-target').value = '6';
modal().querySelector('#subject-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await tick();
await tick();

check('submitting the dialog saves the subject and closes', () => {
  if (modal()) throw new Error('dialog stayed open');
  if (!db.subjects.some((s) => s.code === 'BIOL')) throw new Error('subject was not saved to the backend');
  // The Papers page lists subjects by code in its tab strip.
  if (!window.document.body.textContent.includes('BIOL')) throw new Error('new subject not re-rendered in the page');
});

check('a confirmation toast appeared', () => {
  const toasts = $$('#toast-root .toast');
  if (!toasts.length) throw new Error('no toast in #toast-root');
  if (!toasts.some((t) => /Subject added/i.test(t.textContent))) {
    throw new Error(`unexpected toast text: ${toasts.map((t) => t.textContent).join(' | ')}`);
  }
});

/* --- New task, through the real Tasks view button ------------------------ */

app.navigate('tasks');
await tick();

const newTaskBtn = $('[data-act="new-task"]');
check('the Tasks page renders a New task button', () => {
  if (!newTaskBtn) throw new Error('no [data-act="new-task"] in the Tasks view');
});

newTaskBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await tick();

check('clicking New task opens the dialog', () => {
  const m = modal();
  if (!m) throw new Error('no dialog appeared');
  if (!m.querySelector('#task-form')) throw new Error('task form missing');
});

check('the task dialog offers all five subjects', () => {
  const ids = [...modal().querySelectorAll('#tk-subject option')].map((o) => o.value).filter(Boolean);
  if (ids.length !== 5) throw new Error(`expected 5 subjects, got ${ids.length}`);
});

$('#tk-title').value = 'Chemistry SBA — practical report draft';
$('#tk-due').value = '2027-01-15';
modal().querySelector('#task-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await tick();
await tick();

check('submitting the task saves it and closes the dialog', () => {
  if (modal()) throw new Error('dialog stayed open');
  if (!db.tasks.some((t) => /practical report/.test(t.title))) throw new Error('task not saved');
  if (!window.document.body.textContent.includes('practical report')) throw new Error('task not re-rendered');
});

/* --- Redirect to sign-in kept clean -------------------------------------- */

check('no leftover dialog overlay after the flows', () => {
  if ($('.modal-backdrop')) throw new Error('backdrop left behind');
  if (window.document.body.style.overflow === 'hidden') throw new Error('page scroll left locked');
});

console.log(`\n${failed ? `${failed} failed` : 'all UI checks passed'}\n`);
process.exit(failed ? 1 : 0);
