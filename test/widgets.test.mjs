/**
 * The home-screen widget contract.
 *
 * A widget cannot call the API and must never hold the database credentials, so
 * the page pushes a small JSON snapshot across the Android bridge and the shell
 * draws the widgets from that. Three things can silently break:
 *
 *   1. The snapshot stops being pushed, so the widgets freeze at whatever they
 *      last showed — a countdown that never moves.
 *   2. The snapshot carries something it must not: a mark, a level, an email.
 *      Widgets are readable on a locked phone.
 *   3. A widget tap deep-links to an action name the page does not handle, so
 *      "Log a paper" opens the Papers page and does nothing.
 *
 * This test covers all three against the real modules.
 *
 * Run: node test/widgets.test.mjs
 */

import { readFileSync } from 'node:fs';
let JSDOM;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  console.log('skipped: jsdom not installed');
  process.exit(0);
}

let fails = 0;
let count = 0;
const checks = [];
function check(name, fn) {
  checks.push({ name, fn });
}

/* ------------------------------ the harness ------------------------------- */

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
  matches: false, media: q, addEventListener() {}, removeEventListener() {},
  addListener() {}, removeListener() {}
});
globalThis.matchMedia = window.matchMedia;
window.scrollTo = () => {};
window.confirm = () => true;
globalThis.confirm = window.confirm;
globalThis.history = window.history;
globalThis.location = window.location;
globalThis.MouseEvent = window.MouseEvent;
globalThis.KeyboardEvent = window.KeyboardEvent;
globalThis.setInterval = window.setInterval.bind(window);
globalThis.clearInterval = window.clearInterval.bind(window);
globalThis.localStorage = window.localStorage;
globalThis.URLSearchParams = window.URLSearchParams;

/** Every snapshot the bridge was handed, in order. */
const pushed = [];

window.StarShooterAndroid = {
  widgetData(json) {
    pushed.push(JSON.parse(json));
    return true;
  },
  saveFile: () => true,
  setTheme: () => {},
  platform: () => 'android'
};

/* ------------------------------ stub backend ------------------------------ */

const workspace = () => ({
  user: {
    id: 'u1', name: 'Test Student', email: 'student@example.edu.hk',
    examDate: '2027-04-06', resultsDate: '2027-07-14',
    dailyGoalMinutes: 120, theme: 'light'
  },
  subjects: [
    { id: 's1', code: 'CHIN', name: 'Chinese Language', category: 'core', targetLevel: 5 }
  ],
  papers: [],
  logs: [
    // 95 minutes today, so the widget has a figure to show.
    {
      id: 'l1', subjectId: 's1', minutes: 95, mode: 'focus',
      completedAt: new Date().toISOString()
    }
  ],
  tasks: [
    { id: 't1', title: 'SBA draft', status: 'open', dueDate: '2027-01-10' },
    { id: 't2', title: 'Read chapter 4', status: 'done' }
  ],
  errors: [
    { id: 'e1', topic: 'Long division', errorType: 'careless', createdAt: new Date().toISOString() },
    { id: 'e2', topic: 'Trig identities', errorType: 'concept', createdAt: new Date().toISOString() }
  ],
  otherPapers: []
});

globalThis.fetch = async (input, options = {}) => {
  const url = new URL(String(input), 'https://desk.example/');
  if (url.pathname === '/data/cutoffs.json') {
    const body = readFileSync('./public/data/cutoffs.json', 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body, headers: { get: () => null } };
  }
  const path = url.searchParams.get('__p') || '';
  const method = (options.method || 'GET').toUpperCase();
  if (path === 'me' && method === 'GET') return reply(200, workspace());
  if (path === 'logs' && method === 'POST') return reply(201, workspace());
  if (path === 'me' && method === 'PATCH') return reply(200, workspace());
  return reply(200, workspace());
};

function reply(status, payload) {
  return {
    ok: status < 400, status,
    text: async () => JSON.stringify(payload),
    headers: { get: () => null }
  };
}

/* --------------------------------- the run -------------------------------- */

const lib = await import('../public/lib.js');
const app = await import('../public/app.js');
const widgets = await import('../public/widgets.js');
const actions = await import('../public/actions.js');

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = (ms = 450) => new Promise((r) => setTimeout(r, ms));

await app.boot();
await tick();

/* ------------------------------- the checks ------------------------------- */

check('the page pushes a widget snapshot as soon as it has data', async () => {
  await settle();
  if (!pushed.length) throw new Error('nothing reached the bridge — the widgets would be blank forever');
  const last = pushed[pushed.length - 1];
  if (!last.signedIn) throw new Error('the snapshot says signed out while the student is signed in');
  if (!last.v) throw new Error('the snapshot has no version, so the shell cannot tell shapes apart');
});

check('the snapshot carries the countdown as an instant, not a bare date', async () => {
  const last = pushed[pushed.length - 1];
  const at = last.exam?.at;
  if (!Number.isFinite(at)) throw new Error('exam.at is not a number — the widget cannot count down on its own');
  // 6 April 2027 08:30 HKT.
  const want = Date.parse('2027-04-06T08:30:00+08:00');
  if (at !== want) throw new Error(`exam.at is ${new Date(at).toISOString()}, expected ${new Date(want).toISOString()}`);
});

check('the focus figure matches what the desk would show', async () => {
  const last = pushed[pushed.length - 1];
  const today = lib.minutesOnDay(lib.dayKey(new Date()));
  if (last.focus.today !== today) {
    throw new Error(`widget says ${last.focus.today} minutes, desk says ${today}`);
  }
  if (last.focus.goal !== 120) throw new Error(`goal is ${last.focus.goal}, expected 120`);
  if (typeof last.focus.pct !== 'number') throw new Error('no percentage');
});

check('the task and red-ink counts are right', async () => {
  const last = pushed[pushed.length - 1];
  if (last.tasks.open !== 1) throw new Error(`open tasks: ${last.tasks.open}, expected 1 (done ones must not count)`);
  if (last.tasks.next?.title !== 'SBA draft') throw new Error(`next task: ${last.tasks.next?.title}`);
  if (last.redInk.count !== 2) throw new Error(`red-ink count: ${last.redInk.count}`);
  if (last.redInk.latest.length !== 2) throw new Error('red-ink topics are missing');
  if (last.redInk.latest[0].topic !== 'Long division') throw new Error('the newest entry is not first');
});

check('a running focus block reaches the widget', async () => {
  // The widget shows the remaining time instead of a start button when a block
  // is running, and it worked that out from `endsAt` — so that figure has to be
  // in the snapshot, and it has to be in the future.
  const t = await import('../public/timer.js');
  t.startTimer({ minutes: 40, mode: 'focus', subjectId: 's1' });
  const w = await import('../public/widgets.js');
  const snap = w.snapshot();
  if (!snap.focus.running) throw new Error('no running block in the snapshot');
  if (snap.focus.running.minutes !== 40) throw new Error(`wrong minutes: ${snap.focus.running.minutes}`);
  if (!(snap.focus.running.endsAt > Date.now())) throw new Error('endsAt is not in the future');
  t.stopTimer({ silent: true });
});

check('the snapshot holds no marks, levels or email', async () => {
  // A widget is readable on a locked phone. Counts and dates are fine; a
  // student's grades and address are not.
  const last = pushed[pushed.length - 1];
  const json = JSON.stringify(last).toLowerCase();
  for (const forbidden of ['estimatedlevel', 'targetlevel', '@', 'password', 'attemptedat', 'percentage']) {
    if (json.includes(forbidden)) {
      throw new Error(`the snapshot leaks "${forbidden}": ${json.slice(0, 300)}`);
    }
  }
});

/* ---- the theme must reach the widgets ----------------------------------- */

check('the snapshot carries the theme the app is actually painting', async () => {
  // The widgets cannot read CSS, so the card colours depend on this string.
  // It must be the resolved theme, never the literal "system".
  const w = await import('../public/widgets.js');
  const snap = w.snapshot();
  if (!['light', 'dark'].includes(snap.theme)) {
    throw new Error(`snapshot theme is "${snap.theme}", expected light or dark`);
  }
});

check('a dark app theme reaches the snapshot', async () => {
  const lib = await import('../public/lib.js');
  const w = await import('../public/widgets.js');
  lib.state.data.user.theme = 'dark';
  lib.applyTheme('dark');
  const snap = w.snapshot();
  if (snap.theme !== 'dark') throw new Error(`theme is "${snap.theme}", expected dark`);
  lib.state.data.user.theme = 'light';
  lib.applyTheme('light');
});

check('"system" is resolved, not passed through to the widgets', async () => {
  const lib = await import('../public/lib.js');
  const w = await import('../public/widgets.js');
  lib.state.data.user.theme = 'system';
  const snap = w.snapshot();
  if (snap.theme === 'system') throw new Error('the literal "system" reached the widgets');
  if (!['light', 'dark'].includes(snap.theme)) throw new Error(`unresolved theme: ${snap.theme}`);
  lib.state.data.user.theme = 'light';
  lib.applyTheme('light');
});

check('a theme change forces a push even when the figures are unchanged', async () => {
  // The dedupe compares the whole JSON, so without a forced push a toggle that
  // changed nothing but the colours would never reach the shell.
  const w = await import('../public/widgets.js');
  const before = pushed.length;
  w.pushWidgetsNow();
  await new Promise((r) => setTimeout(r, 400));
  if (pushed.length <= before) throw new Error('no push happened after the theme change');
});

/* ---- a widget tap must reach the action it named ------------------------- */

check('a widget action opens the paper dialog', async () => {
  const handled = actions.runWidgetAction('log-paper');
  if (!handled) throw new Error('log-paper is not handled');
  await tick();
  const heading = document.querySelector('#modal-root .modal-head h2')?.textContent || '';
  if (!/paper/i.test(heading)) throw new Error(`opened "${heading}" instead of the paper dialog`);
  lib.closeModal();
});

check('every action a widget names is one the page handles', async () => {
  // These are the exact strings used by the Java providers' deep links. A typo
  // on either side is a tap that opens the app and does nothing.
  const names = ['log-paper', 'new-error', 'new-task', 'focus', 'manual-log'];
  for (const name of names) {
    lib.closeModal();
    const handled = actions.runWidgetAction(name, { min: '25' });
    if (!handled) throw new Error(`the widget names "${name}" but nothing handles it`);
  }
  lib.closeModal();
});

check('an unknown action is refused, not silently swallowed', () => {
  if (actions.runWidgetAction('make-me-a-sandwich')) {
    throw new Error('an unknown action reported success');
  }
});

check('a deep link runs the action and then clears itself', async () => {
  lib.closeModal();
  const { navigate } = app;
  navigate('papers');
  await tick();
  // This is exactly what a widget's hash looks like.
  window.location.hash = '#/papers?act=new-error';
  window.dispatchEvent(new window.Event('hashchange'));
  await tick();
  await tick();
  const heading = document.querySelector('#modal-root .modal-head h2')?.textContent || '';
  if (!/red-ink/i.test(heading)) throw new Error(`deep link opened "${heading}"`);
  if (window.location.hash.includes('act=')) {
    throw new Error(`the action was left in the URL (${window.location.hash}) — a reload would repeat it`);
  }
  lib.closeModal();
});

check('a plain page load runs nothing', async () => {
  lib.closeModal();
  window.location.hash = '#/tasks';
  window.dispatchEvent(new window.Event('hashchange'));
  await tick();
  if (document.querySelector('#modal-root .modal')) {
    throw new Error('a plain navigation opened a dialog');
  }
});

/* ---- the Java side must agree with the JS side --------------------------- */

check('the Java bridge is the method the page calls', () => {
  const src = readFileSync('./android/java/hk/starshooter/app/MainActivity.java', 'utf8');
  if (!/@JavascriptInterface[\s\S]{0,200}boolean widgetData\(/.test(src)) {
    throw new Error('MainActivity has no widgetData bridge method, so the snapshot would go nowhere');
  }
});

check('the shell registers all four widget providers', () => {
  const manifest = readFileSync('./android/AndroidManifest.xml', 'utf8');
  for (const name of ['CountdownWidget', 'QuickLogWidget', 'FocusWidget', 'RedInkWidget']) {
    if (!manifest.includes(`.${name}`)) throw new Error(`${name} is not in the manifest, so it cannot be added`);
  }
});

check('every widget info file points at a layout that exists', () => {
  for (const name of ['countdown', 'quicklog', 'focus', 'redink']) {
    const info = readFileSync(`./android/res/xml/widget_${name}_info.xml`, 'utf8');
    const layout = info.match(/initialLayout="@layout\/([\w]+)"/)?.[1];
    if (!layout) throw new Error(`widget_${name}_info.xml names no layout`);
    readFileSync(`./android/res/layout/${layout}.xml`, 'utf8');
  }
});

check('a widget prints when it was last synced', () => {
  const src = readFileSync('./android/java/hk/starshooter/app/WidgetUi.java', 'utf8');
  if (!/updatedLabel/.test(src)) throw new Error('no freshness label helper');
  // And every provider must use it, or one widget would look live while stale.
  for (const name of ['CountdownWidget', 'QuickLogWidget', 'FocusWidget', 'RedInkWidget']) {
    const provider = readFileSync(`./android/java/hk/starshooter/app/${name}.java`, 'utf8');
    if (!provider.includes('updatedLabel')) {
      throw new Error(`${name} does not stamp its figures with a time`);
    }
  }
});

check('the widget snapshot never crosses the bridge with credentials', () => {
  const src = readFileSync('./public/widgets.js', 'utf8');
  // The file must only read from state.data, never from a connection string.
  if (/mongodb\+srv|MONGODB_URI/i.test(src)) {
    throw new Error('widgets.js references the database credentials');
  }
});

/* Runs last: signing out clears state.data, and every check above needs it. */
check('signing out blanks the widgets instead of leaving old counts', async () => {
  const { signOut } = await import('../public/auth.js');
  const before = pushed.length;
  await signOut();
  await settle();
  const last = pushed[pushed.length - 1];
  if (pushed.length === before) throw new Error('sign-out pushed nothing');
  if (last.signedIn) throw new Error('the widgets still claim a signed-in student after sign-out');
});

/* -------------------------------- the tally ------------------------------- */

for (const { name, fn } of checks) {
  count += 1;
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (e) {
    fails += 1;
    console.log(`FAIL  ${name}\n      ${e.message}`);
  }
}

console.log(
  fails ? `\n${fails} of ${count} checks failed` : `\n${count} widget checks passed`
);
process.exit(fails ? 1 : 0);
