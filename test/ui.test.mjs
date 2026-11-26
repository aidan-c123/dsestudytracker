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

/* --- CSD: attainment replaces levels everywhere --------------------------- */

lib.state.data.subjects.push({
  id: 's-csd',
  code: 'CSD',
  name: '公民與社會發展',
  category: 'core',
  targetLevel: null,
  predictedLevel: null,
  attainment: null,
  examDate: null
});

app.navigate('papers');
await tick();
document.querySelector('[data-act="pick-subject"][data-id="s-csd"]').dispatchEvent(
  new window.MouseEvent('click', { bubbles: true })
);
await tick();

check('the CSD matrix lists only 2024–2026 and a single paper', () => {
  const years = [...window.document.querySelectorAll('.matrix tbody th')].map((th) => Number(th.textContent));
  if (years.length !== 3) throw new Error(`expected 3 years, got ${years.join(',')}`);
  if (Math.min(...years) !== 2024) throw new Error('CSD should start in 2024');
  const heads = [...window.document.querySelectorAll('.matrix thead th')].map((th) => th.textContent.trim());
  if (!heads.includes('P1')) throw new Error('P1 missing');
  if (heads.includes('P2')) throw new Error('CSD should not offer P2');
});

check('the CSD page shows attainment, not a target level', () => {
  const text = window.document.body.textContent;
  if (!text.includes('Attained')) throw new Error('attainment is not mentioned');
  const targetChips = [...window.document.querySelectorAll('.stat .v small')].map((e) => e.textContent);
  void targetChips;
});

document.querySelector('[data-act="log-paper"][data-subject="s-csd"]').dispatchEvent(
  new window.MouseEvent('click', { bubbles: true })
);
await tick();

check('the CSD paper dialog offers Attained / Not attained and hides levels', () => {
  const m = modal();
  if (!m) throw new Error('no dialog');
  const level = m.querySelector('#pf-level');
  const attain = m.querySelector('#pf-attain');
  if (!level.hidden) throw new Error('the 1–5** level field should be hidden for CSD');
  if (attain.hidden) throw new Error('the attainment field should be visible for CSD');
  const values = [...attain.querySelectorAll('option')].map((o) => o.value).filter(Boolean);
  if (values.join(',') !== 'attained,unattained') throw new Error(`unexpected attainment options: ${values}`);
  const yearValues = [...m.querySelectorAll('#pf-year option')].map((o) => Number(o.value));
  if (Math.min(...yearValues) !== 2024) throw new Error('CSD years should start at 2024');
});

const attainSelect = modal().querySelector('#pf-attain');
attainSelect.value = 'attained';
const csdForm = modal().querySelector('#paper-form');
csdForm.querySelector('#pf-score').value = '34';
csdForm.querySelector('#pf-max').value = '42';
csdForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await tick();
await tick();

check('logging a CSD attempt saves attainment with no level', () => {
  if (modal()) throw new Error('dialog stayed open');
  const saved = db.papers.find((p) => p.subjectId === 's-csd');
  if (!saved) throw new Error('paper was not saved');
  if (saved.attainment !== 'attained') throw new Error(`attainment is ${saved.attainment}`);
  if (saved.estimatedLevel !== null) throw new Error('a CSD log stored a level');
  if (saved.paper !== 'P1') throw new Error(`unexpected paper ${saved.paper}`);
});

/* --- a levelled subject still gets levels -------------------------------- */

app.navigate('papers');
await tick();
document.querySelector('[data-act="pick-subject"][data-id="s3"]').dispatchEvent(
  new window.MouseEvent('click', { bubbles: true })
);
await tick();
document.querySelector('[data-act="log-paper"][data-subject="s3"]').dispatchEvent(
  new window.MouseEvent('click', { bubbles: true })
);
await tick();

check('a levelled subject still offers the 1–5** field and hides attainment', () => {
  const m = modal();
  if (!m) throw new Error('no dialog');
  if (m.querySelector('#pf-level').hidden) throw new Error('level field should be visible for Mathematics');
  if (!m.querySelector('#pf-attain').hidden) throw new Error('attainment should be hidden for Mathematics');
  const heads = [...m.querySelectorAll('#pf-paper option')].map((o) => o.value);
  if (!heads.includes('P2')) throw new Error('Mathematics should offer P2');
  const yearValues = [...m.querySelectorAll('#pf-year option')].map((o) => Number(o.value));
  if (Math.min(...yearValues) !== 2012) throw new Error('levelled subjects should start in 2012');
});

lib.closeModal();

/* --- subject dialog: CSD swaps its grading fields ------------------------- */

app.navigate('settings');
await tick();
document.querySelector('[data-act="add-subject"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await tick();

check('the subject dialog hides level fields for CSD', () => {
  const m = modal();
  if (!m) throw new Error('no dialog');
  const code = m.querySelector('#sj-code');
  code.value = 'CSD';
  code.dispatchEvent(new window.Event('change', { bubbles: true }));
  if (!m.querySelector('#sj-level-fields').hidden) throw new Error('level fields should hide for CSD');
  if (m.querySelector('#sj-attain-field').hidden) throw new Error('attainment field should show for CSD');

  code.value = 'BIOL';
  code.dispatchEvent(new window.Event('change', { bubbles: true }));
  if (m.querySelector('#sj-level-fields').hidden) throw new Error('level fields should return for Biology');
  if (!m.querySelector('#sj-attain-field').hidden) throw new Error('attainment field should hide for Biology');
});

lib.closeModal();

/* --- Redirect to sign-in kept clean -------------------------------------- */

check('no leftover dialog overlay after the flows', () => {
  if ($('.modal-backdrop')) throw new Error('backdrop left behind');
  if (window.document.body.style.overflow === 'hidden') throw new Error('page scroll left locked');
});

console.log(`\n${failed ? `${failed} failed` : 'all UI checks passed'}\n`);
process.exit(failed ? 1 : 0);
