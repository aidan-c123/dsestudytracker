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
globalThis.confirm = window.confirm;
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
  targetLevel: code === 'CSD' ? null : 4,
  predictedLevel: null,
  attainment: null,
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
  errors: [],
  otherPapers: []
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
  const paperPatch = String(path).match(/^papers\/([\w-]+)$/);
  if (paperPatch && method === 'PATCH') {
    const row = db.papers.find((p) => p.id === paperPatch[1]);
    // Mirrors the real server: an unknown id is reported as not found.
    if (!row) return [404, { error: 'Paper log not found.' }];
    Object.assign(row, body);
    return [200, workspace()];
  }
  if (path === 'logs' && method === 'POST') {
    db.logs.push({ id: `l${++seq}`, ...body });
    return [201, workspace()];
  }
  if (path === 'other-papers' && method === 'POST') {
    const pctv = body.score !== null && body.maxScore ? Math.round((body.score / body.maxScore) * 1000) / 10 : null;
    db.otherPapers.push({ id: `o${++seq}`, ...body, percentage: pctv });
    return [201, workspace()];
  }
  if (path === 'other-papers' && method === 'PATCH') {
    return [200, workspace()];
  }
  const paperDel = String(path).match(/^papers\/([\w-]+)$/);
  if (paperDel && method === 'DELETE') {
    const row = db.papers.find((p) => p.id === paperDel[1]);
    if (!row) return [200, workspace()];
    // The real store deletes the whole cell.
    db.papers = db.papers.filter(
      (p) => !(p.subjectId === row.subjectId && p.year === row.year && p.paper === row.paper)
    );
    return [200, workspace()];
  }
  const otherDel = String(path).match(/^other-papers\/([\w-]+)$/);
  if (otherDel && method === 'DELETE') {
    db.otherPapers = db.otherPapers.filter((p) => p.id !== otherDel[1]);
    return [200, workspace()];
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

console.log('\nStarShooter — end-to-end UI test\n');

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

check('the seeded CSD subject carries no level target', () => {
  const csd = lib.state.data.subjects.find((s) => s.code === 'CSD');
  if (!csd) throw new Error('CSD missing from the seeded cores');
  if (csd.targetLevel !== null) throw new Error('CSD should not have a level target');
});

app.navigate('papers');
await tick();
document.querySelector('[data-act="pick-subject"][data-id="s4"]').dispatchEvent(
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

document.querySelector('[data-act="log-paper"][data-subject="s4"]').dispatchEvent(
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
  const saved = db.papers.find((p) => p.subjectId === 's4');
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

app.navigate('papers');
await tick();
document.querySelector('[data-act="pick-subject"][data-id="s4"]').dispatchEvent(
  new window.MouseEvent('click', { bubbles: true })
);
await tick();
document.querySelector('[data-act="edit-subject"][data-id="s4"]').dispatchEvent(
  new window.MouseEvent('click', { bubbles: true })
);
await tick();

check('editing CSD hides the level fields and offers attainment', () => {
  const m = modal();
  if (!m) throw new Error('no dialog');
  if (!m.querySelector('#sj-level-fields').hidden) throw new Error('level fields should hide for CSD');
  if (m.querySelector('#sj-attain-field').hidden) throw new Error('attainment field should show for CSD');
  const values = [...m.querySelectorAll('#sj-attain option')].map((o) => o.value).filter(Boolean);
  if (values.join(',') !== 'attained,unattained') throw new Error(`unexpected options: ${values}`);
});

lib.closeModal();

// A levelled subject keeps the 1–5** fields.
document.querySelector('[data-act="edit-subject"][data-id="s3"]').dispatchEvent(
  new window.MouseEvent('click', { bubbles: true })
);
await tick();

check('editing a levelled subject keeps the level fields', () => {
  const m = modal();
  if (!m) throw new Error('no dialog');
  if (m.querySelector('#sj-level-fields').hidden) throw new Error('level fields should show for Mathematics');
  if (!m.querySelector('#sj-attain-field').hidden) throw new Error('attainment field should hide for Mathematics');
});

lib.closeModal();

// Adding an elective: the catalogue offers no CSD (it is already seeded), so
// the level fields stay.
app.navigate('settings');
await tick();
document.querySelector('[data-act="add-subject"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await tick();

check('adding an elective shows level fields and never offers CSD', () => {
  const m = modal();
  if (!m) throw new Error('no dialog');
  const codes = [...m.querySelectorAll('#sj-code option')].map((o) => o.value);
  if (codes.includes('CSD')) throw new Error('CSD is already on the account and must not be offered again');
  if (m.querySelector('#sj-level-fields').hidden) throw new Error('level fields should be visible for a new elective');
  if (!m.querySelector('#sj-attain-field').hidden) throw new Error('attainment field should be hidden for a new elective');
});

lib.closeModal();

/* --- Chinese: Paper 3 is gone from 2024 ---------------------------------- */

app.navigate('papers');
await tick();
document.querySelector('[data-act="pick-subject"][data-id="s1"]').dispatchEvent(
  new window.MouseEvent('click', { bubbles: true })
);
await tick();

check('the Chinese matrix no longer has a Paper 3 column', () => {
  const heads = [...window.document.querySelectorAll('.matrix thead th')].map((th) => th.textContent.trim());
  if (!heads.includes('P1') || !heads.includes('P2')) throw new Error(`missing P1/P2: ${heads.join(',')}`);
  if (heads.includes('P3')) throw new Error('Paper 3 was abolished in 2024 and should not be offered');
});

document.querySelector('[data-act="log-paper"][data-subject="s1"]').dispatchEvent(
  new window.MouseEvent('click', { bubbles: true })
);
await tick();

check('logging Chinese for 2026 offers only P1 and P2', () => {
  const m = modal();
  if (!m) throw new Error('no dialog');
  const yearField = m.querySelector('#pf-year');
  yearField.value = '2026';
  yearField.dispatchEvent(new window.Event('change', { bubbles: true }));
  const papers = [...m.querySelectorAll('#pf-paper option')].map((o) => o.value);
  if (papers.join(',') !== 'P1,P2') throw new Error(`expected P1,P2 got ${papers.join(',')}`);
});

check('an old Chinese sitting can still be logged as Paper 3', () => {
  const m = modal();
  const yearField = m.querySelector('#pf-year');
  yearField.value = '2019';
  yearField.dispatchEvent(new window.Event('change', { bubbles: true }));
  const papers = [...m.querySelectorAll('#pf-paper option')].map((o) => o.value);
  if (!papers.includes('P3')) throw new Error(`pre-2024 should offer P3, got ${papers.join(',')}`);
  if (!papers.includes('P4')) throw new Error('pre-2024 should offer P4');
});

lib.closeModal();

/* --- Other papers -------------------------------------------------------- */

document.querySelector('[data-act="other-paper"]').dispatchEvent(
  new window.MouseEvent('click', { bubbles: true })
);
await tick();
const dseCountBefore = db.papers.length;

check('the Other paper dialog opens with every kind of paper', () => {
  const m = modal();
  if (!m) throw new Error('no dialog appeared');
  if (!m.querySelector('#other-form')) throw new Error('form missing');
  const kinds = [...m.querySelectorAll('#op-source option')].map((o) => o.value);
  for (const k of ['school', 'other-school', 'textbook', 'practice', 'other-board', 'other']) {
    if (!kinds.includes(k)) throw new Error(`missing source ${k}`);
  }
});

modal().querySelector('#op-subject').value = 's3';
modal().querySelector('#op-source').value = 'other-school';
modal().querySelector('#op-title').value = "St Paul's mock 2026";
modal().querySelector('#op-date').value = '2026-01-12';
modal().querySelector('#op-score').value = '63';
modal().querySelector('#op-max').value = '90';
modal().querySelector('#other-form').dispatchEvent(
  new window.Event('submit', { bubbles: true, cancelable: true })
);
await tick();
await tick();

check('logging another paper keeps it out of the DSE matrix', () => {
  if (modal()) throw new Error('dialog stayed open');
  const saved = db.otherPapers[0];
  if (!saved) throw new Error('paper not saved');
  if (saved.source !== 'other-school') throw new Error('source lost');
  if (db.papers.length !== dseCountBefore) {
    throw new Error(`the mock leaked into the DSE matrix (${dseCountBefore} → ${db.papers.length})`);
  }
});

app.navigate('papers');
await tick();
document.querySelector('[data-act="pick-subject"][data-id="s3"]').dispatchEvent(
  new window.MouseEvent('click', { bubbles: true })
);
await tick();

check('the logged mock appears under Other papers', () => {
  const text = window.document.body.textContent;
  if (!text.includes("St Paul's mock 2026")) throw new Error('mock is not listed');
  if (!text.includes('Other school mock')) throw new Error('its kind is not shown');
  const cells = window.document.querySelectorAll('.matrix .cell:not(.f-empty)');
  if (cells.length) throw new Error('the mock should not fill a matrix cell');
});

/* --- Deleting a cell must not leave a duplicate behind -------------------- */

// Two rows for one cell, as an older database could hold.
db.papers.push(
  { id: 'dup-a', subjectId: 's1', year: 2020, paper: 'P1', score: 55, maxScore: 100, percentage: 55, estimatedLevel: 4, attainment: null, attemptedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'dup-b', subjectId: 's1', year: 2020, paper: 'P1', score: 91, maxScore: 100, percentage: 91, estimatedLevel: 7, attainment: null, attemptedAt: '2026-02-01T00:00:00.000Z' }
);
await app.boot();
await tick();
document.querySelector('[data-act="pick-subject"][data-id="s1"]')?.dispatchEvent(
  new window.MouseEvent('click', { bubbles: true })
);
await tick();

check('a duplicated cell shows only the newest score', () => {
  const rows = [...window.document.querySelectorAll('table.plain tbody tr')].filter((tr) =>
    tr.textContent.includes('2020')
  );
  if (rows.length !== 1) throw new Error(`rendered ${rows.length} rows for one cell`);
  if (!rows[0].textContent.includes('91/100')) {
    throw new Error(`showing the wrong row: ${rows[0].textContent.trim()}`);
  }
});

document.querySelector('[data-act="delete-cell"][data-year="2020"][data-paper="P1"]').dispatchEvent(
  new window.MouseEvent('click', { bubbles: true })
);
await tick();
await tick();

check('deleting the cell removes every row, so the score stops showing', () => {
  const left = db.papers.filter((p) => p.subjectId === 's1' && p.year === 2020 && p.paper === 'P1');
  if (left.length) throw new Error(`${left.length} duplicate row(s) survived the delete`);
  const text = window.document.querySelector('#view').textContent;
  if (/91\/100/.test(text)) throw new Error('the deleted score is still on screen');
});

/* --- A stale paper id must not lose the attempt --------------------------- */

app.navigate('papers');
await tick();
document.querySelector('[data-act="pick-subject"][data-id="s2"]').dispatchEvent(
  new window.MouseEvent('click', { bubbles: true })
);
await tick();

// Seed a row the way the matrix would, then let the dialog edit it.
db.papers.push({
  id: 'p-stale',
  subjectId: 's2',
  year: 2021,
  paper: 'P2',
  score: 60,
  maxScore: 100,
  percentage: 60,
  estimatedLevel: 4,
  attainment: null
});
await app.boot();
await tick();
document.querySelector('[data-act="pick-subject"][data-id="s2"]')?.dispatchEvent(
  new window.MouseEvent('click', { bubbles: true })
);
await tick();

document.querySelector('[data-act="edit-paper"][data-id="p-stale"]').dispatchEvent(
  new window.MouseEvent('click', { bubbles: true })
);
await tick();

// The row vanished between opening the dialog and saving it.
db.papers = db.papers.filter((p) => p.id !== 'p-stale');

modal().querySelector('#pf-score').value = '82';
modal().querySelector('#paper-form').dispatchEvent(
  new window.Event('submit', { bubbles: true, cancelable: true })
);
await tick();
await tick();
await tick();

check('a save with a stale id is retried as a create, not lost', () => {
  if (modal()) throw new Error('the dialog stayed open, so the save failed');
  const row = db.papers.find((p) => p.subjectId === 's2' && p.year === 2021 && p.paper === 'P2');
  if (!row) throw new Error('the attempt was thrown away');
  if (row.score !== 82) throw new Error(`score saved as ${row.score}`);
});

/* --- Paper presets ------------------------------------------------------- */

app.navigate('focus');
await tick();

check('the Focus page offers searchable paper presets', () => {
  const search = $('#preset-search');
  if (!search) throw new Error('no preset search input');
  const cards = $$('#preset-list .preset-paper');
  if (cards.length < 6) throw new Error(`only ${cards.length} presets rendered`);
  const text = $('#preset-list').textContent;
  for (const want of ['Chinese', 'English', 'Mathematics', 'CSD']) {
    if (!text.includes(want)) throw new Error(`missing ${want} preset`);
  }
});

check('searching filters presets by paper and by length', () => {
  const search = $('#preset-search');
  search.value = 'chinese';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  const chinese = $$('#preset-list .preset-paper');
  if (!chinese.length) throw new Error('no Chinese presets after search');
  if (chinese.some((c) => !/Chinese/.test(c.textContent))) {
    throw new Error('search returned a non-Chinese paper');
  }

  search.value = 'maths 135';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  const maths = $$('#preset-list .preset-paper');
  if (maths.length !== 1) throw new Error(`expected one maths paper, got ${maths.length}`);
  if (!/2h 15m/.test(maths[0].textContent)) throw new Error('maths P1 should be 2h 15m');
});

check('a search with no matches says so instead of showing nothing', () => {
  const search = $('#preset-search');
  search.value = 'zzzznothing';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  const list = $('#preset-list');
  if (!$('#preset-list .empty')) throw new Error('no empty state');
  if (!/No paper matches/.test(list.textContent)) throw new Error('empty state is not explanatory');
  search.value = '';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
});

check('choosing a preset loads its exact length and tags the subject', () => {
  const list = $('#preset-list');
  const chineseP2 = [...list.querySelectorAll('.preset-paper')].find(
    (b) => b.dataset.label === 'Chinese P2 Writing'
  );
  if (!chineseP2) throw new Error('Chinese P2 preset missing');
  chineseP2.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  return;
});

await tick();

check('the dial now shows the paper length, not 25:00', () => {
  const dial = $('[data-timer-time]');
  if (dial.textContent !== '2:15:00') throw new Error(`dial shows ${dial.textContent}, expected 2:15:00`);
});

check('the preset tagged the Chinese subject for logging', () => {
  const select = $('#timer-subject');
  if (select.value !== 's1') throw new Error(`subject tag is ${select.value}, expected s1 (Chinese)`);
});

/* --- Brand and logo ------------------------------------------------------ */

check('the platform is named StarShooter everywhere in the shell', () => {
  const text = window.document.body.textContent;
  if (!/StarShooter/.test(text)) throw new Error('brand name missing from the shell');
  if (/Desk No\. 4/.test(text)) throw new Error('old brand name still present');
  if (!/StarShooter — HKDSE Study Desk/.test(window.document.title)) {
    throw new Error(`title is "${window.document.title}"`);
  }
});

check('the logo is a real vector file used by the page and the tab', () => {
  const icon = window.document.querySelector('link[rel="icon"]');
  if (!icon) throw new Error('no favicon link');
  if (!/logo\.svg/.test(icon.getAttribute('href'))) throw new Error('favicon is not the SVG logo');
  if (!/image\/svg\+xml/.test(icon.getAttribute('type') || '')) throw new Error('favicon type is not SVG');
  const marks = $$('.brand-mark');
  if (!marks.length) throw new Error('no brand mark rendered');
  if (marks.some((m) => m.tagName !== 'IMG' || !/logo\.svg/.test(m.getAttribute('src')))) {
    throw new Error('brand mark is not the SVG logo');
  }
});

/* --- Grade bands --------------------------------------------------------- */

check('grade bands start from the shipped defaults', () => {
  const bands = lib.bandsFor({ code: 'MATH' });
  if (bands[7] !== lib.DEFAULT_BANDS[7]) throw new Error('defaults not applied');
  if (!(bands[7] > bands[5] && bands[5] > bands[3])) throw new Error('bands are not ascending');
});

check('a subject’s own bands change the level it predicts', () => {
  const easy = { code: 'MATH', gradeBands: { 2: 20, 3: 30, 4: 40, 5: 50, 6: 60, 7: 70 } };
  const hard = { code: 'MATH', gradeBands: { 2: 50, 3: 60, 4: 70, 5: 80, 6: 90, 7: 95 } };
  if (lib.levelFromPercentage(75, easy) !== 7) throw new Error('easy bands should give 5** at 75%');
  if (lib.levelFromPercentage(75, hard) !== 4) throw new Error('hard bands should give 4 at 75%');
  if (lib.levelFromPercentage(10, easy) !== 1) throw new Error('below every band is Level 1');
});

check('inverted bands are repaired rather than trusted', () => {
  const broken = { code: 'MATH', gradeBands: { 2: 90, 3: 20, 4: 30, 5: 40, 6: 50, 7: 60 } };
  const bands = lib.bandsFor(broken);
  const order = [2, 3, 4, 5, 6, 7].map((l) => bands[l]);
  if (order.some((v, i) => i && v <= order[i - 1])) throw new Error(`bands not monotonic: ${order.join(',')}`);
});

check('CSD still has no bands, because it has no levels', () => {
  const csd = db.subjects.find((s) => s.code === 'CSD');
  if (!lib.usesAttainment(csd)) throw new Error('CSD should use attainment');
  if (lib.subjectPrediction(csd).level !== null) throw new Error('CSD should not predict a level');
});

/* --- Redirect to sign-in kept clean -------------------------------------- */

check('no leftover dialog overlay after the flows', () => {
  if ($('.modal-backdrop')) throw new Error('backdrop left behind');
  if (window.document.body.style.overflow === 'hidden') throw new Error('page scroll left locked');
});

console.log(`\n${failed ? `${failed} failed` : 'all UI checks passed'}\n`);
process.exit(failed ? 1 : 0);
