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
  // Mirrors the server: each row goes through the same rules as a manual save,
  // bad rows are skipped and reported, and the batch still returns the desk.
  if (path === 'import' && method === 'POST') {
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    if (!rows.length) return [400, { error: 'That file had no rows.' }];
    if (rows.length > 500) return [400, { error: 'Import at most 500 rows at a time.' }];
    const skipped = [];
    let imported = 0;
    rows.forEach((r, i) => {
      const subject = db.subjects.find((s) => s.id === r.subjectId);
      if (!subject) {
        skipped.push({ row: i + 1, reason: 'Pick one of your own subjects.' });
        return;
      }
      if (subject.code === 'CHIN' && Number(r.year) >= 2024 && r.paper === 'P3') {
        skipped.push({ row: i + 1, reason: 'Chinese has no P3 from 2024 onwards.' });
        return;
      }
      db.papers.push({ id: `p${++seq}`, ...r, attemptedAt: new Date().toISOString() });
      imported += 1;
    });
    return [imported ? 201 : 400, { imported, skipped, ...workspace() }];
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
/* Checks run immediately, in file order, because the flows in this file
   interleave clicks with assertions. A check may return a promise; those are
   collected and awaited before the summary. The earlier version called fn()
   and ignored the returned promise, so an asynchronous check printed "ok"
   before its assertions had run — a real failure could hide behind a tick. */
const pending = [];
const check = (label, fn) => {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      pending.push(
        result.then(
          () => console.log(`  ok  ${label}`),
          (err) => {
            failed++;
            console.error(`FAIL  ${label}\n      ${err.message}`);
          }
        )
      );
    } else {
      console.log(`  ok  ${label}`);
    }
  } catch (err) {
    failed++;
    console.error(`FAIL  ${label}\n      ${err.message}`);
  }
};

const settle = () => Promise.all(pending);

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

/* The dialog opens before a subject is chosen, so the bands must be recomputed
   when the choice changes. They used to be read once, at open, which meant every
   new subject started on the generic 85/75/65 fallback instead of its own
   published boundaries. */
const bandValue = (level) => Number(modal().querySelector(`[data-band="${level}"]`).value);
check('choosing a subject fills in its own published boundaries', () => {
  $('#sj-code').value = 'BIOL';
  $('#sj-code').dispatchEvent(new window.Event('change', { bubbles: true }));
  const top = bandValue(7);
  if (top === lib.DEFAULT_BANDS[7]) {
    throw new Error(`Biology still shows the generic ${top}% instead of its cut-offs`);
  }
  // Biology's five-year 5** sits near 79%.
  if (top < 74 || top > 84) throw new Error(`Biology 5** looks wrong: ${top}%`);
});

check('switching subject changes the bands to that subject’s', () => {
  const bio = bandValue(7);
  $('#sj-code').value = 'CHEM';
  $('#sj-code').dispatchEvent(new window.Event('change', { bubbles: true }));
  const chem = bandValue(7);
  if (chem === bio) throw new Error(`Chemistry and Biology both show ${chem}%`);
  // Chemistry's 5** sits near 92%.
  if (chem < 88) throw new Error(`Chemistry 5** should be around 92%, got ${chem}%`);
  $('#sj-code').value = 'BIOL';
  $('#sj-code').dispatchEvent(new window.Event('change', { bubbles: true }));
});

// Fill and submit the dialog exactly as a student would.
$('#sj-target').value = '6';
modal().querySelector('#subject-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await tick();
await tick();

check('an untouched band set is not saved, so the cut-offs keep winning', () => {
  const saved = db.subjects.find((s) => s.code === 'BIOL');
  if (!saved) throw new Error('subject was not saved');
  if (saved.gradeBands) {
    throw new Error(`untouched bands were stored as ${JSON.stringify(saved.gradeBands)}, ` +
      'which overrides the published boundaries for good');
  }
  // And the app therefore still grades Biology on its real cut-offs.
  const bands = lib.bandsFor({ code: 'BIOL' });
  if (bands[7] === lib.DEFAULT_BANDS[7]) throw new Error('Biology fell back to the generic bands');
});

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
  // The box reports published figures only, so there is nothing here to adjust:
  // owning bands changes the grade a paper gets, never what the exam required.
  if (note.querySelector('.cut-adjust')) {
    throw new Error('the strip offers to adjust figures it can no longer change');
  }
});

/* A student's own bands change how a paper is graded, but must never rewrite the
   published figures in this box. */
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

check('a tuned subject does not rewrite the DSE figures in the strip', () => {
  const note = document.querySelector('.cut-note');
  if (!note) throw new Error('no strip');
  if (note.textContent.includes('your own bands')) {
    throw new Error('the strip still claims to show the student’s own bands');
  }
  const values = [...note.querySelectorAll('.cut-pct')].map((el) =>
    Number(el.textContent.replace('%', ''))
  );
  if (values.join(',') === '68,58,48,38') {
    throw new Error('the student’s bands moved the published figures');
  }
  if (!values.length) throw new Error('the strip lost its figures');
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

/* Subjects added before the dialog was fixed saved the generic set as though it
   had been chosen, which then overrode the published boundaries for good. */
check('a leftover copy of the generic bands does not override the cut-offs', () => {
  const stale = { code: 'CHEM', gradeBands: { ...lib.DEFAULT_BANDS } };
  if (lib.bandsOrigin(stale) !== 'cutoff') {
    throw new Error(`leftover defaults still count as tuned (${lib.bandsOrigin(stale)})`);
  }
  const bands = lib.bandsFor(stale);
  if (bands[7] === lib.DEFAULT_BANDS[7]) throw new Error('Chemistry kept the generic 85%');
  if (bands[7] < 88) throw new Error(`Chemistry 5** should be around 92%, got ${bands[7]}%`);
});

check('bands saved by an earlier version are ignored, not honoured', () => {
  // Bands used to be editable, and a few records still carry a saved set.
  // Honouring them would keep grading against numbers the exam never published.
  const stale = { code: 'CHEM', gradeBands: { 2: 36, 3: 46, 4: 56, 5: 66, 6: 76, 7: 86 } };
  if (lib.bandsOrigin(stale) !== 'cutoff') throw new Error('a stored band set still counts as a source');
  if (lib.bandsFor(stale)[7] === 86) throw new Error('the stored 5** was used instead of the published figure');
  if (lib.bandsFor(stale)[7] < 88) throw new Error(`Chemistry 5** should be around 92%, got ${lib.bandsFor(stale)[7]}%`);
});

check('per-paper figures win over anything stored on the subject', () => {
  const stale = { code: 'CHIN', gradeBands: { 2: 20, 3: 30, 4: 40, 5: 50, 6: 60, 7: 70 } };
  const bands = lib.bandsForPaper(stale, 'P1', 2026);
  if (bands[7] === 70) throw new Error('the stored 70% overrode the published Paper 1 figure');
  // Chinese Paper 1's 5** sits near 64%, well below the subject-wide blend.
  if (bands[7] < 60 || bands[7] > 68) throw new Error(`Chinese P1 5** looks wrong: ${bands[7]}%`);
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

/* Bands are published figures now, so this panel is a readout rather than an
   editor. It must still list the grades highest first, matching the strip. */
check('the band panel lists grades highest first and cannot be typed over', () => {
  app.navigate('papers');
  return tick().then(() => {
    document.querySelector('[data-act="edit-subject"][data-id="s1"]')?.dispatchEvent(
      new window.MouseEvent('click', { bubbles: true })
    );
    return tick().then(() => {
      const m = modal();
      if (!m) throw new Error('the subject dialog did not open');
      const labels = [...m.querySelectorAll('.band-lvl')].map((el) => el.textContent.trim());
      if (labels.join(',') !== '5**,5*,5,4,3,2') {
        throw new Error(`the panel reads ${labels.join(',')}`);
      }
      // A DSE paper is graded by the exam's boundaries, so there is nothing to
      // edit: any input here would let a student redefine the grading.
      const inputs = m.querySelectorAll('#sj-bands input');
      if (inputs.length) throw new Error(`${inputs.length} band inputs are still editable`);
      const values = [...m.querySelectorAll('.band-fixed')];
      if (values.length !== 6) throw new Error(`expected 6 published values, got ${values.length}`);
      if (values.some((el) => !/^\d+$/.test(el.textContent.trim()))) {
        throw new Error(`a band cell is empty: ${values.map((v) => v.textContent).join(',')}`);
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

/* --- Focus timer --------------------------------------------------------- */

app.navigate('focus');
await tick();

check('the Focus timer no longer offers paper presets', () => {
  if ($('#preset-search')) throw new Error('the paper preset search box is still there');
  if ($('#preset-list')) throw new Error('the paper preset list is still there');
  if ($$('.preset-paper').length) throw new Error('paper preset buttons are still rendered');
  if (document.querySelector('[data-act="paper-preset"]')) {
    throw new Error('a paper-preset action is still wired up');
  }
});

check('the ordinary length presets still load the dial', () => {
  const btn = [...$$('.presets .preset')].find((b) => b.dataset.preset === '50');
  if (!btn) throw new Error('the 50 minute preset is gone');
  btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const dial = $('[data-timer-time]');
  if (dial.textContent !== '50:00') throw new Error(`dial shows ${dial.textContent}, expected 50:00`);
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

check('stored bands cannot change the level a paper is given', () => {
  // Bands used to be editable, so a record could carry a set meant to soften or
  // sharpen its own grading. That is exactly what must not happen now: the
  // grade has to come from the exam's published boundaries.
  const easy = { code: 'MATH', gradeBands: { 2: 20, 3: 30, 4: 40, 5: 50, 6: 60, 7: 70 } };
  const published = lib.bandsFor({ code: 'MATH' });
  const withStored = lib.bandsFor(easy);
  if (JSON.stringify(published) !== JSON.stringify(withStored)) {
    throw new Error(`a stored band set changed the bands: ${JSON.stringify(withStored)}`);
  }
  if (lib.levelFromPercentage(75, easy) !== lib.levelFromPercentage(75, { code: 'MATH' })) {
    throw new Error('a stored band set changed the predicted level');
  }
  // Maths 5** sits above 90, so 75% cannot be a 5** however the record is set.
  if (lib.levelFromPercentage(75, easy) === 7) throw new Error('75% was graded as 5** in Maths');
  if (lib.levelFromPercentage(10, easy) !== 1) throw new Error('below every band is Level 1');
});

check('every subject’s bands ascend, since nothing can invert them now', () => {
  // The published figures are the only source, so this catches a bad data file
  // rather than a bad edit.
  for (const code of ['CHIN', 'ENG', 'MATH', 'CHEM', 'BIOL', 'GEOG', 'ICT']) {
    const bands = lib.bandsFor({ code });
    const order = [2, 3, 4, 5, 6, 7].map((l) => bands[l]);
    if (order.some((v, i) => i && v <= order[i - 1])) {
      throw new Error(`${code} bands are not monotonic: ${order.join(',')}`);
    }
  }
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

/* --- Re-opening a logged cell must offer Delete --------------------------- */

/* The matrix draws one button per cell, logged or not, and both fire
   "log-paper". The handler has to notice that a record already exists for
   that cell and open it for editing; otherwise a student sees a blank form
   for a paper they have already logged, with no way to remove it. */
check('tapping a logged cell opens the attempt with a Delete button', () => {
  lib.closeModal();
  app.navigate('papers');
  // The matrix shows one subject at a time; select Chinese before looking for
  // a cell, or the tap lands on whichever tab happens to be open.
  const tab = window.document.querySelector('[data-act="pick-subject"][data-id="s1"]');
  if (!tab) throw new Error('the Chinese subject tab is not on the page');
  tab.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  return tick()
    .then(() => {
      const cell = window.document.querySelector(
        '.matrix [data-act="log-paper"][data-subject="s1"][data-year="2025"][data-paper="P2"]'
      );
      if (!cell) throw new Error('the 2025 P2 cell is not on the page');
      cell.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      return tick();
    })
    .then(() => {
      const form = modal()?.querySelector('#paper-form');
      if (!form) throw new Error('the log dialog did not open');
      modal().querySelector('#pf-score').value = '61';
      modal().querySelector('#pf-max').value = '100';
      form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
      return tick().then(tick);
    })
    .then(() => {
      const logged = db.papers.find(
        (p) => p.subjectId === 's1' && Number(p.year) === 2025 && p.paper === 'P2'
      );
      if (!logged) throw new Error('the attempt was never saved');

      // Now tap the same cell again, which is what the student did.
      app.navigate('papers');
      return tick();
    })
    .then(() => {
      const again = window.document.querySelector(
        '.matrix [data-act="log-paper"][data-subject="s1"][data-year="2025"][data-paper="P2"]'
      );
      if (!again) throw new Error('the cell vanished after logging');
      again.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      return tick();
    })
    .then(() => {
      const m = modal();
      if (!m) throw new Error('the cell no longer opens a dialog');
      const heading = m.querySelector('.modal-head h2')?.textContent.trim();
      if (heading !== 'Edit attempt') {
        throw new Error(`a logged cell opened "${heading}" instead of Edit attempt`);
      }
      const del = m.querySelector('[data-delete]');
      if (!del) throw new Error('there is no Delete button — the attempt cannot be removed');
      if (!/delete/i.test(del.textContent)) throw new Error('the control does not say Delete');

      // And it must actually delete, not just close.
      const before = db.papers.length;
      del.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      return tick()
        .then(tick)
        .then(() => {
          if (db.papers.length !== before - 1) throw new Error('the attempt was not removed');
          if (
            db.papers.some(
              (p) => p.subjectId === 's1' && Number(p.year) === 2025 && p.paper === 'P2'
            )
          ) {
            throw new Error('the row survived the delete');
          }
        });
    });
});

await settle();

/* ------------------------------ derived views ----------------------------- */

app.navigate('desk');
await tick();

check('every account gets pacing and diagnostics, with nothing locked', () => {
  if ($$('.locked-card').length) throw new Error('a locked card is still on the desk');
  const text = $('#view').textContent;
  if (!text.includes('Revision pacing')) throw new Error('the pacing card is missing');
  if (!text.includes('Weak topics')) throw new Error('the diagnostics card is missing');
});

check('Settings offers the CSV import to everyone', () => {
  app.navigate('settings');
  const text = $('#view').textContent;
  if (!text.includes('Import marks')) throw new Error('no import card in Settings');
  if (!$('#import-csv')) throw new Error('the CSV box is missing');
  if (!text.includes('Download my data')) throw new Error('export disappeared from Settings');
  // The paywall is gone; no plan or pass wording should survive on the page.
  if (/exam pass|your plan|unlocked|not on sale/i.test(text)) {
    throw new Error('paywall wording is still in Settings');
  }
});

check('the derived views are requested for every account', async () => {
  const asked = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (input, opts) => {
    asked.push(new URL(String(input), 'https://desk.example/').searchParams.get('__p') || '');
    return real(input, opts);
  };
  await app.loadInsights();
  globalThis.fetch = real;
  if (!asked.includes('pacing')) throw new Error('pacing was not requested');
  if (!asked.includes('diagnostics')) throw new Error('diagnostics was not requested');
});

check('a pacing plan and a mistake breakdown both render', async () => {
  db.papers = [
    { id: 'p9', subjectId: 's3', year: 2025, paper: 'P1', percentage: 72, estimatedLevel: 4 }
  ];
  db.errors = [
    { id: 'e1', subjectId: 's3', topic: 'Algebra', errorType: 'careless' },
    { id: 'e2', subjectId: 's3', topic: 'Algebra', errorType: 'careless' },
    { id: 'e3', subjectId: 's3', topic: 'Trig', errorType: 'careless' },
    { id: 'e4', subjectId: 's3', topic: 'Trig', errorType: 'concept' }
  ];

  // The endpoints are separate, so the stub answers them the way the server
  // does — computed from the student's records.
  const real = globalThis.fetch;
  globalThis.fetch = async (input, opts) => {
    const url = new URL(String(input), 'https://desk.example/');
    const p = url.searchParams.get('__p');
    if (p === 'pacing') {
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({
          daysLeft: 90, weeksLeft: 13, totalUntouched: 29,
          thisWeek: [{ subjectId: 's3', name: 'Mathematics', untouched: 29, papersThisWeek: 2 }],
          subjects: [], tasks: [], note: 'A pace, not a promise.'
        }),
        headers: { get: () => null }
      };
    }
    if (p === 'diagnostics') {
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({
          total: 4, enough: true,
          byKind: [{ kind: 'careless', count: 3 }, { kind: 'concept', count: 1 }],
          bySubject: [{ subjectId: 's3', name: 'Mathematics', count: 4 }],
          topKind: { kind: 'careless', count: 3 }, note: 'Grouped from your red-ink log.'
        }),
        headers: { get: () => null }
      };
    }
    return real(input, opts);
  };
  await app.loadInsights();
  globalThis.fetch = real;

  app.navigate('desk');
  const text = $('#view').textContent;
  if (!text.includes('13 weeks left')) throw new Error('the pacing card did not render its weeks');
  if (!/careless/i.test(text)) throw new Error('the diagnostics kinds did not render');
});

check('diagnostics still refuse to name a pattern from a thin log', () => {
  const thin = {
    total: 3, enough: false,
    byKind: [{ kind: 'careless', count: 3 }], bySubject: [],
    topKind: null, note: 'Add 1 more entry before a pattern is worth reading.'
  };
  lib.state.diagnostics = thin;
  app.navigate('desk');
  const text = $('#view').textContent;
  if (!/not enough yet/i.test(text)) throw new Error('a three-entry log drew a confident chart');
});

check('import writes through the same validation as a manual save', async () => {
  app.navigate('settings');
  const box = $('#import-csv');
  if (!box) throw new Error('the CSV box is missing');
  box.value = 'MATH,2024,P2,63,100';
  const before = db.papers.length;
  $('#modal-root').innerHTML = '';
  await lib.api('/import', {
    method: 'POST',
    body: { rows: [{ subjectId: 's3', year: 2024, paper: 'P2', score: 63, maxScore: 100 }] }
  });
  if (db.papers.length !== before + 1) throw new Error('the imported row was not saved');
});

await settle();

console.log(`\n${failed ? `${failed} failed` : 'all UI checks passed'}\n`);
process.exit(failed ? 1 : 0);
