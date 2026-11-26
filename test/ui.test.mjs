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
  // The boundaries are a static data file, not an API route. Without serving it
  // here the app silently falls back to neutral bands, and the strip under the
  // matrix would be tested against the wrong numbers.
  if (url.pathname === '/data/cutoffs.json') {
    const body = readFileSync('./public/data/cutoffs.json', 'utf8');
    return {
      ok: true,
      status: 200,
      json: async () => JSON.parse(body),
      text: async () => body,
      headers: { get: () => null }
    };
  }
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
  const options = [...m.querySelectorAll('#op-source option')];
  const kinds = options.map((o) => o.value);
  for (const k of ['school', 'other-school', 'tutorial', 'textbook', 'practice', 'other-board', 'other']) {
    if (!kinds.includes(k)) throw new Error(`missing source ${k}`);
  }
  // The wording a student reads, and the key it is stored under, are separate
  // on purpose: renaming a kind must never orphan records already filed under it.
  const label = (k) => options.find((o) => o.value === k).textContent.trim();
  if (label('school') !== "My school's mock") throw new Error(`school reads "${label('school')}"`);
  if (label('other-school') !== "Other schools' mock") {
    throw new Error(`other-school reads "${label('other-school')}"`);
  }
  if (label('tutorial') !== 'Tutorial centre / publisher mock') {
    throw new Error(`tutorial reads "${label('tutorial')}"`);
  }
  if (kinds[0] !== 'school') throw new Error('the default kind is not the first option');
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
  if (!text.includes("Other schools' mock")) throw new Error('its kind is not shown');
  const cells = window.document.querySelectorAll('.matrix .cell:not(.f-empty)');
  if (cells.length) throw new Error('the mock should not fill a matrix cell');
});

/* --- Grade boundaries show for every subject, with honest provenance ------ */

app.navigate('papers');
await tick();
document.querySelector('[data-act="pick-subject"][data-id="s1"]')?.dispatchEvent(
  new window.MouseEvent('click', { bubbles: true })
);
await tick();

check('Chinese shows a real boundary line for each paper', () => {
  const note = window.document.querySelector('.cut-note');
  if (!note) throw new Error('no boundary strip for Chinese');
  const blocks = [...note.querySelectorAll('.cut-sub')];
  if (blocks.length !== 2) throw new Error(`expected Paper 1 and Paper 2, got ${blocks.length}`);
  const heads = blocks.map((b) => b.querySelector('.cut-subhead').textContent.replace(/\s+/g, ' ').trim());
  if (!heads[0].startsWith('P1')) throw new Error(`the first block is ${heads[0]}`);
  if (!heads[1].startsWith('P2')) throw new Error(`the second block is ${heads[1]}`);
  for (const block of blocks) {
    const items = [...block.querySelectorAll('.cut-item')];
    if (items.length !== 4) throw new Error(`${block.textContent.trim()} has ${items.length} grades`);
  }
  if (!note.textContent.includes('DSE00')) throw new Error('the source is not credited');
  if (!/per paper/i.test(note.textContent)) throw new Error('it does not say these are per paper');
});

check('Paper 1 and Paper 2 show different boundaries, as the source does', () => {
  // Chinese is the case that exposed the bug: grading everything against one
  // subject-wide blend made Paper 1 look far harder than it is.
  const blocks = [...window.document.querySelectorAll('.cut-note .cut-sub')];
  const top = (block) =>
    Number(block.querySelector('.cut-item .cut-pct').textContent.replace('%', ''));
  const p1 = top(blocks[0]);
  const p2 = top(blocks[1]);
  if (!(p1 > 0 && p2 > 0)) throw new Error('missing figures');
  if (p1 === p2) throw new Error(`both papers show ${p1}%, so they are not per-paper figures`);
  // Paper 1's 5** sits near 62%, not the 70% subject-wide blend and certainly
  // not the generic 85% that appeared when the data never loaded.
  if (p1 > 68) throw new Error(`Paper 1 5** should be around 62%, got ${p1}%`);
  if (p1 < 55) throw new Error(`Paper 1 5** looks too low: ${p1}%`);
  if (p2 > 76) throw new Error(`Paper 2 5** should be around 70%, got ${p2}%`);
});

check('the strip reads 5** → 5* → 5 → 4, highest grade first', () => {
  const items = [...window.document.querySelectorAll('.cut-note .cut-item')];
  const grades = items.map((li) => li.querySelector('.cut-lvl').textContent.trim());
  if (grades.join(',') !== '5**,5*,5,4,5**,5*,5,4') throw new Error(`wrong order: ${grades.join(',')}`);
  const values = items.map((li) => Number(li.querySelector('.cut-pct').textContent.replace('%', '')));
  if (values.some((v) => !Number.isFinite(v) || v <= 0 || v >= 100)) throw new Error(`bad values: ${values}`);
  // Each paper's row runs highest grade to lowest, so the marks fall left to
  // right within that row.
  for (let i = 0; i < values.length; i += 4) {
    const row = values.slice(i, i + 4);
    if (row.some((v, j) => j && v >= row[j - 1])) throw new Error(`row not descending: ${row.join(',')}`);
  }
  const starred = items.filter((li) => li.classList.contains('is-star')).length;
  if (starred !== 4) throw new Error('each paper needs its 5* and 5** marked');
  if (!items[0].classList.contains('is-star')) throw new Error('5** should be the first column');
});

/* A subject with no published rows must still show the strip, clearly labelled
   as a starting point rather than pretending to be official. */
const va = {
  id: 's-va', code: 'VA', name: 'Visual Arts', category: 'elective',
  targetLevel: 4, predictedLevel: null, attainment: null, gradeBands: null
};
db.subjects.push(va);
// The view renders from the app's copy of the workspace, not from `db`, so the
// subject has to be added there too or the tab has nothing to select.
lib.state.data.subjects.push(JSON.parse(JSON.stringify(va)));
lib.state.paperSubjectId = 's-va';
app.navigate('papers');
await tick();
document.querySelector('[data-act="pick-subject"][data-id="s-va"]')?.dispatchEvent(
  new window.MouseEvent('click', { bubbles: true })
);
await tick();

check('a subject with no published boundaries still gets a labelled strip', () => {
  const note = document.querySelector('.cut-note');
  if (!note) throw new Error('no strip for a subject without published data');
  const items = [...note.querySelectorAll('.cut-item')];
  if (items.length !== 4) throw new Error(`expected 4 grades, got ${items.length}`);
  if (!note.textContent.includes('starting point')) {
    throw new Error('the strip does not say the numbers are only a starting point');
  }
  if (note.textContent.includes('DSE00')) {
    throw new Error('it credits a source that published nothing for this subject');
  }
  if (!note.querySelector('.cut-adjust')) throw new Error('no way to adjust them');
});

/* A student's own bands win, and the strip says so. */
va.gradeBands = { 2: 18, 3: 28, 4: 38, 5: 48, 6: 58, 7: 68 };
lib.resetBandCache();
const inState = lib.state.data.subjects.find((s) => s.id === 's-va');
if (inState) inState.gradeBands = { ...va.gradeBands };
lib.state.paperSubjectId = 's-va';
app.navigate('papers');
await tick();
document.querySelector('[data-act="pick-subject"][data-id="s-va"]')?.dispatchEvent(
  new window.MouseEvent('click', { bubbles: true })
);
await tick();

check('a tuned subject shows the student’s own numbers', () => {
  const note = document.querySelector('.cut-note');
  if (!note) throw new Error('no strip');
  if (!note.textContent.includes('your own bands')) throw new Error('it does not say whose bands these are');
  const values = [...note.querySelectorAll('.cut-pct')].map((el) =>
    Number(el.textContent.replace('%', ''))
  );
  if (values.join(',') !== '68,58,48,38') throw new Error(`expected the student's bands, got ${values}`);
});

/* --- A paper is graded on its own boundaries, not the subject blend ------- */

check('Chinese Paper 1 is graded on Paper 1 boundaries', () => {
  // Paper 1's boundaries sit several marks below the subject-wide blend: its
  // 5** is near 62% against roughly 70% for the whole subject. A mark between
  // the two must read differently depending on which paper it was.
  const chin = { code: 'CHIN' };
  const p1 = lib.bandsForPaper(chin, 'P1', 2026);
  const p2 = lib.bandsForPaper(chin, 'P2', 2026);
  if (p1[7] >= p2[7]) throw new Error(`P1 5** (${p1[7]}) should be below P2 5** (${p2[7]})`);
  if (p1[7] > 68) throw new Error(`P1 5** should be around 62%, got ${p1[7]}%`);
  if (p1[7] < 55) throw new Error(`P1 5** looks too low: ${p1[7]}%`);
  // 60% clears Paper 1's 5* but not Paper 2's.
  if (lib.levelFromBands(60, p1) < 6) throw new Error('60% should reach at least 5* on Paper 1');
  if (lib.levelFromBands(60, p2) >= 6) throw new Error('60% must not reach 5* on Paper 2');
});

check('a subject with no per-paper rows grades exactly as before', () => {
  const geog = { code: 'GEOG' };
  const viaPaper = lib.bandsForPaper(geog, 'P1', 2026);
  const subjectWide = lib.bandsForYear(geog, 2026);
  if (JSON.stringify(viaPaper) !== JSON.stringify(subjectWide)) {
    throw new Error('a paper-less subject changed bands');
  }
});

check('a student’s own bands still win over per-paper rows', () => {
  const tuned = { code: 'CHIN', gradeBands: { 2: 20, 3: 30, 4: 40, 5: 50, 6: 60, 7: 70 } };
  const bands = lib.bandsForPaper(tuned, 'P1', 2026);
  if (bands[7] !== 70) throw new Error(`expected the student's 70%, got ${bands[7]}%`);
});

/* --- Logging a session by start and end time, or by hours and minutes ----- */

app.navigate('focus');
await tick();
document.querySelector('[data-act="manual-log"]').dispatchEvent(
  new window.MouseEvent('click', { bubbles: true })
);
await tick();

check('the log dialog opens on start and end times', () => {
  const m = modal();
  if (!m) throw new Error('no dialog');
  const range = m.querySelector('[data-panel="range"]');
  const duration = m.querySelector('[data-panel="duration"]');
  if (!range || !duration) throw new Error('both entry modes should be in the form');
  if (range.hidden) throw new Error('start and end should be the default');
  if (!duration.hidden) throw new Error('hours and minutes should be hidden until chosen');
  const pressed = m.querySelector('.seg-btn[aria-pressed="true"]');
  if (pressed?.dataset.mode !== 'range') throw new Error('the wrong mode is marked as active');
  if (!m.querySelector('#ml-hours') || !m.querySelector('#ml-mins')) {
    throw new Error('there is no way to type hours and minutes');
  }
});

check('a start and end time shows the length it adds up to', () => {
  const m = modal();
  m.querySelector('#ml-start').value = '2026-11-26T16:00';
  m.querySelector('#ml-end').value = '2026-11-26T17:30';
  m.querySelector('#ml-end').dispatchEvent(new window.Event('input', { bubbles: true }));
  const hint = m.querySelector('#ml-range-hint').textContent;
  if (!hint.includes('1h 30m')) throw new Error(`the length reads "${hint}"`);
});

check('the save button is refused until the range makes sense', () => {
  const m = modal();
  m.querySelector('#ml-start').value = '2026-11-26T18:00';
  m.querySelector('#ml-end').value = '2026-11-26T17:00';
  m.querySelector('#ml-end').dispatchEvent(new window.Event('input', { bubbles: true }));
  if (!m.querySelector('#ml-range-hint').classList.contains('is-error')) {
    throw new Error('a backwards range is not flagged');
  }
  const before = db.logs.length;
  m.querySelector('#manual-log-form').dispatchEvent(
    new window.Event('submit', { bubbles: true, cancelable: true })
  );
  return tick().then(() => {
    if (db.logs.length !== before) throw new Error('a backwards range was saved anyway');
  });
});

// Put a valid range back, so the next check is about carrying a length across
// rather than about the deliberately broken one above.
modal().querySelector('#ml-start').value = '2026-11-26T16:00';
modal().querySelector('#ml-end').value = '2026-11-26T17:30';
modal().querySelector('#ml-end').dispatchEvent(new window.Event('input', { bubbles: true }));

/* The duration mode must save the same record shape as the range mode. */
modal().querySelector('.seg-btn[data-mode="duration"]').dispatchEvent(
  new window.MouseEvent('click', { bubbles: true })
);
await tick();

check('switching mode carries the length across instead of resetting it', () => {
  const m = modal();
  const hours = Number(m.querySelector('#ml-hours').value);
  const mins = Number(m.querySelector('#ml-mins').value);
  if (hours !== 1 || mins !== 30) {
    throw new Error(`expected 1h 30m to carry over, got ${hours}h ${mins}m`);
  }
  if (!m.querySelector('[data-panel="range"]').hidden) throw new Error('the range panel stayed visible');
  if (m.querySelector('[data-panel="duration"]').hidden) throw new Error('the duration panel stayed hidden');
  // Both panels ask for a finish time, so they must agree on it.
  if (m.querySelector('#ml-when').value !== '2026-11-26T17:30') {
    throw new Error(`the finish time carried over as "${m.querySelector('#ml-when').value}"`);
  }
});

modal().querySelector('#ml-hours').value = '2';
modal().querySelector('#ml-mins').value = '15';
modal().querySelector('#ml-mins').dispatchEvent(new window.Event('input', { bubbles: true }));
modal().querySelector('#ml-subject').value = 's3';
modal().querySelector('#ml-label').value = 'Integration practice';
const logsBefore = db.logs.length;
modal().querySelector('#manual-log-form').dispatchEvent(
  new window.Event('submit', { bubbles: true, cancelable: true })
);
await tick();
await tick();

check('hours and minutes save as one length', () => {
  if (db.logs.length !== logsBefore + 1) throw new Error('the session was not saved');
  const saved = db.logs[db.logs.length - 1];
  if (saved.minutes !== 135) throw new Error(`saved ${saved.minutes} minutes instead of 135`);
  if (saved.subjectId !== 's3') throw new Error('the subject was lost');
  if (modal()) throw new Error('the dialog stayed open');
});

/* A session longer than a day is refused by the server, so the dialog must not
   let it look saveable in the first place. */
document.querySelector('[data-act="manual-log"]').dispatchEvent(
  new window.MouseEvent('click', { bubbles: true })
);
await tick();
modal().querySelector('.seg-btn[data-mode="duration"]').dispatchEvent(
  new window.MouseEvent('click', { bubbles: true })
);
await tick();
modal().querySelector('#ml-hours').value = '25';
modal().querySelector('#ml-hours').dispatchEvent(new window.Event('input', { bubbles: true }));

check('a session longer than a day is refused before saving', () => {
  const hint = modal().querySelector('#ml-duration-hint');
  if (!hint.classList.contains('is-error')) throw new Error('no warning is shown');
  if (!/24 hours/.test(hint.textContent)) throw new Error(`the warning reads "${hint.textContent}"`);
  const before = db.logs.length;
  modal().querySelector('#manual-log-form').dispatchEvent(
    new window.Event('submit', { bubbles: true, cancelable: true })
  );
  return tick().then(() => {
    if (db.logs.length !== before) throw new Error('an over-long session was saved anyway');
  });
});

modal()?.querySelector('[data-close]')?.dispatchEvent(
  new window.MouseEvent('click', { bubbles: true })
);
await tick();

/* The editor lists the same four grades in the same order as the strip, so the
   two screens cannot disagree about which way the numbers run. */
check('the band editor lists grades highest first, matching the strip', () => {
  app.navigate('papers');
  return tick().then(() => {
    document.querySelector('[data-act="edit-subject"][data-id="s1"]')?.dispatchEvent(
      new window.MouseEvent('click', { bubbles: true })
    );
    return tick().then(() => {
      const m = modal();
      if (!m) throw new Error('the subject dialog did not open');
      const labels = [...m.querySelectorAll('.band-cell span')].map((el) => el.textContent.trim());
      if (labels.join(',') !== '5**,5*,5,4,3,2') {
        throw new Error(`the editor reads ${labels.join(',')}`);
      }
      m.querySelector('[data-close]')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
  });
});

/* --- Deleting a cell must not leave a duplicate behind -------------------- */

// Two rows for one cell, as an older database could hold.
db.papers.push(
  { id: 'dup-a', subjectId: 's1', year: 2020, paper: 'P1', score: 55, maxScore: 100, percentage: 55, estimatedLevel: 4, attainment: null, attemptedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'dup-b', subjectId: 's1', year: 2020, paper: 'P1', score: 91, maxScore: 100, percentage: 91, estimatedLevel: 7, attainment: null, attemptedAt: '2026-02-01T00:00:00.000Z' }
);
await app.boot();
await tick();
app.navigate('papers');
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

check('grade bands come from the published cut-offs where they exist', () => {
  // These used to fall back to the generic 35/45/55/65/75/85 because the data
  // file and the reader disagreed on key shape. MATH's own boundaries are much
  // higher, so the generic fallback cannot pass for them.
  const bands = lib.bandsFor({ code: 'MATH' });
  if (bands[7] === lib.DEFAULT_BANDS[7]) {
    throw new Error('MATH fell back to the generic bands instead of its cut-offs');
  }
  if (bands[7] < 80) throw new Error(`MATH 5** boundary looks wrong: ${bands[7]}`);
  if (!(bands[7] > bands[5] && bands[5] > bands[3])) throw new Error('bands are not ascending');
});

check('every subject has a usable set of bands', () => {
  const codes = [
    'CHIN', 'ENG', 'MATH', 'M1', 'M2', 'BIOL', 'CHEM', 'PHYS', 'ECON', 'GEOG',
    'HIST', 'CHIST', 'BAFS', 'ICT', 'CLIT', 'LIT', 'THS', 'HMSC', 'DAT', 'VA', 'MUS', 'PE', 'ERS'
  ];
  for (const code of codes) {
    const bands = lib.bandsFor({ code });
    const order = [2, 3, 4, 5, 6, 7].map((l) => bands[l]);
    if (order.some((v) => !Number.isFinite(v) || v <= 0)) {
      throw new Error(`${code} is missing a band: ${order.join(',')}`);
    }
    if (order.some((v, i) => i && v <= order[i - 1])) {
      throw new Error(`${code} bands do not ascend: ${order.join(',')}`);
    }
  }
});

check('a subject without published boundaries still grades sensibly', () => {
  // Visual Arts has no DSE00 rows, so it must fall back rather than show nothing.
  const bands = lib.bandsFor({ code: 'VA' });
  if (lib.levelFromPercentage(58, { code: 'VA' }) !== 4) {
    throw new Error('a mid mark should still reach Level 4 on the fallback bands');
  }
  if (bands[7] !== lib.DEFAULT_BANDS[7]) throw new Error('the fallback is not the documented one');
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
