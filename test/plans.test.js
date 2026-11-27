/**
 * Plan gates.
 *
 * The failure this guards against is the obvious one: a "paywall" that hides
 * data in CSS while still shipping it to every browser. The whole workspace
 * arrives in one `/me` response, so a client-side lock is bypassed by opening
 * DevTools — and a student who can see the paid data behind a blur will not
 * trust the rest of the app either.
 *
 * So these checks assert three things:
 *
 *   1. A free account still gets everything it had: every mark, the whole
 *      matrix, its export. Nothing is degraded to sell it back.
 *   2. A gated endpoint refuses on the server, with 402, for a free account —
 *      not merely in the UI.
 *   3. The gated data is absent from the free response entirely, so there is
 *      nothing for a client toggle to reveal.
 *
 * Run: node test/plans.test.js
 */

import assert from 'node:assert/strict';
import { handleApi } from '../server/routes.js';
import { hashPassword } from '../server/util.js';
import { planOf, hasFeature, entitlementsFor, buildPacing, buildDiagnostics } from '../server/entitlements.js';

/* ------------------------------ in-memory store ---------------------------- */

function makeStore() {
  const users = new Map();
  const data = { subjects: new Map(), pastPapers: new Map(), studyLogs: new Map(), sbaTasks: new Map(), errorLogs: new Map(), otherPapers: new Map() };
  const sessions = new Map();
  let seq = 0;
  const id = (p) => `${p}${String(++seq).padStart(20, '0')}`;
  const byUser = (t, u) => [...data[t].values()].filter((d) => d.userId === u);

  const store = {
    async findUserByEmail(email) {
      return [...users.values()].find((u) => u.emailLower === email.toLowerCase()) || null;
    },
    async createUser({ name, email, password }) {
      const user = {
        _id: id('u'), name, email, emailLower: email.toLowerCase(),
        pw: hashPassword(password), recovery: hashPassword('CODE'),
        examDate: '2027-04-06', resultsDate: '2027-07-14',
        dailyGoalMinutes: 120, theme: 'system', plan: 'free', createdAt: new Date()
      };
      users.set(user._id, user);
      await store.seedSubjects(user._id);
      return { user, recoveryCode: 'CODE' };
    },
    async seedSubjects(userId) {
      for (const [code, name] of [['CHIN', 'Chinese Language'], ['ENG', 'English Language'], ['MATH', 'Mathematics'], ['CSD', 'Citizenship & Social Development']]) {
        const sid = id('s');
        data.subjects.set(sid, { _id: sid, userId, code, name, category: 'core', targetLevel: 4, sortOrder: 0, createdAt: new Date() });
      }
    },
    async findUserById(uid) { return users.get(uid) || null; },
    async createSession(userId) {
      const token = id('t');
      sessions.set(token, { userId });
      return { token, id: token };
    },
    async currentUser(headers) {
      const cookie = headers.get('cookie') || '';
      const m = cookie.match(/dse_session=([^;]+)/);
      if (!m) return null;
      const s = sessions.get(m[1]);
      // The real store answers `{ user, session }`; routes read `auth.user`.
      return s ? { user: users.get(s.userId) || null, session: s } : null;
    },
    async destroySession() {},
    async destroyOtherSessions() {},
    async updateUser(uid, patch) { Object.assign(users.get(uid), patch); },
    async setPassword() {},
    async rotateRecovery() { return 'NEW-CODE'; },
    async deleteAccount() {},
    async ownedSubject(userId, sid) {
      const s = data.subjects.get(sid);
      return s && s.userId === userId ? s : null;
    },
    async loadWorkspace(user) {
      const uid = String(user._id);
      return {
        user: { id: uid, name: user.name, email: user.email, examDate: user.examDate, resultsDate: user.resultsDate, dailyGoalMinutes: user.dailyGoalMinutes, theme: user.theme },
        subjects: byUser('subjects', uid).map((s) => ({ id: s._id, code: s.code, name: s.name, category: s.category, targetLevel: s.targetLevel })),
        papers: byUser('pastPapers', uid).map((p) => ({ id: p._id, subjectId: p.subjectId, year: p.year, paper: p.paper, percentage: p.percentage, estimatedLevel: p.estimatedLevel })),
        logs: byUser('studyLogs', uid),
        tasks: byUser('sbaTasks', uid).map((t) => ({ id: t._id, title: t.title, status: t.status, dueDate: t.dueDate })),
        errors: byUser('errorLogs', uid).map((e) => ({ id: e._id, subjectId: e.subjectId, topic: e.topic, errorType: e.errorType })),
        otherPapers: []
      };
    },
    async savePaper(userId, input) {
      const existing = [...data.pastPapers.values()].find(
        (p) => p.userId === userId && p.subjectId === input.subjectId && p.year === input.year && p.paper === input.paper
      );
      const doc = { _id: existing?._id || id('p'), userId, ...input, attemptedAt: new Date() };
      data.pastPapers.set(doc._id, doc);
      return doc;
    },
    async patchPaper() { return false; },
    async deletePaper() { return false; },
    async removePaperCell() { return false; },
    async addLog() {},
    async clearLogsSince() {},
    async addTask() {},
    async patchTask() {},
    async deleteTask() {},
    async addError(userId, input) {
      const doc = { _id: id('e'), userId, ...input };
      data.errorLogs.set(doc._id, doc);
      return doc;
    },
    async deleteError() {},
    async addOtherPaper() {},
    async patchOtherPaper() {},
    async deleteOtherPaper() {},
    async addSubject() {},
    async updateSubject() {},
    async deleteSubject() {},
    __data: data,
    __users: users
  };
  return store;
}

const store = makeStore();

function call(path, { method = 'GET', body, cookie } = {}) {
  const headers = new Headers({ origin: 'https://desk.example' });
  if (body) headers.set('content-type', 'application/json');
  if (cookie) headers.set('cookie', `dse_session=${cookie}`);
  const req = new Request(`https://desk.example/api${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined
  });
  return handleApi(req, path, store);
}
const callJson = async (path, opts) => {
  const res = await call(path, opts);
  return { status: res.status, data: await res.json() };
};

async function register(email) {
  const { status, data, setCookie } = await (async () => {
    const res = await call('/auth/register', {
      method: 'POST', body: { name: 'Test', email, password: 'password123' }
    });
    return { status: res.status, data: await res.json(), setCookie: res.headers.get('set-cookie') };
  })();
  assert.equal(status, 201);
  const cookie = setCookie.match(/dse_session=([^;]+)/)[1];
  return { cookie, data };
}

/* ---------------------------------- checks --------------------------------- */

let fails = 0;
let count = 0;
const checks = [];
const check = (name, fn) => checks.push({ name, fn });

check('a new account is on the free plan', async () => {
  const { cookie } = await register('free@school.edu.hk');
  const me = await callJson('/me', { cookie });
  assert.equal(me.status, 200);
  assert.equal(me.data.plan.plan, 'free');
  assert.equal(me.data.plan.name, 'Free');
  const pacing = me.data.plan.features.find((f) => f.id === 'pacing');
  assert.equal(pacing.unlocked, false, 'pacing must be locked on free');
});

check('the free desk still holds every mark and the whole matrix', async () => {
  const { cookie } = await register('marks@school.edu.hk');
  const me = await callJson('/me', { cookie });
  const chin = me.data.subjects.find((s) => s.code === 'CHIN');
  await call('/papers', {
    method: 'POST', cookie,
    body: { subjectId: chin.id, year: 2019, paper: 'P1', score: 70, maxScore: 100 }
  });
  const after = await callJson('/me', { cookie });
  const logged = after.data.papers.find((p) => p.year === 2019 && p.paper === 'P1');
  assert.ok(logged, 'a free account must be able to log a paper');
  assert.equal(after.data.papers.length, 1);
  // 15 years of History is not a paid feature — the matrix ships whole.
  assert.ok(after.data.subjects.length >= 4);
});

check('an old paper outside the five-year window is still loggable for free', async () => {
  // This is the gate I refused to build: the matrix is public data, so capping
  // it would only send students to DSE00 for free.
  const { cookie } = await register('old@school.edu.hk');
  const me = await callJson('/me', { cookie });
  const chin = me.data.subjects.find((s) => s.code === 'CHIN');
  const res = await call('/papers', {
    method: 'POST', cookie,
    body: { subjectId: chin.id, year: 2012, paper: 'P1', score: 51, maxScore: 100 }
  });
  assert.equal(res.status, 201);
});

check('export is not gated', async () => {
  const { cookie } = await register('exp@school.edu.hk');
  const res = await call('/me', { cookie });
  assert.equal(res.status, 200, 'the export reads /me, so /me must stay open');
  const me = await res.json();
  assert.ok(me.papers && me.logs && me.subjects, 'the export payload must be complete');
  // The plan says so out loud, so the promise is visible in the UI.
  assert.ok(me.plan.alwaysFree.includes('export'));
  assert.ok(me.plan.alwaysFree.includes('marks'));
});

check('a gated endpoint refuses a free account on the server', async () => {
  const { cookie } = await register('gate@school.edu.hk');
  for (const path of ['/pacing', '/diagnostics']) {
    const res = await call(path, { cookie });
    assert.equal(res.status, 402, `${path} must refuse with 402, got ${res.status}`);
    const body = await res.json();
    assert.equal(body.locked, true);
    assert.ok(body.feature, 'the refusal must name the feature');
  }
});

check('the free response contains no pacing or diagnostic data', async () => {
  // The point of server-side gating: there is nothing for a DevTools toggle to
  // reveal. If these keys ever appear on a free account, the gate is theatre.
  const { cookie } = await register('empty@school.edu.hk');
  const me = await callJson('/me', { cookie });
  assert.equal(me.data.pacing, undefined, 'pacing leaked into the free workspace');
  assert.equal(me.data.diagnostics, undefined, 'diagnostics leaked into the free workspace');
  assert.equal(me.data.gates, undefined, 'a gates payload leaked');
});

check('bulk import refuses a free account', async () => {
  const { cookie } = await register('imp@school.edu.hk');
  const me = await callJson('/me', { cookie });
  const chin = me.data.subjects.find((s) => s.code === 'CHIN');
  const res = await call('/import', {
    method: 'POST', cookie,
    body: { rows: [{ subjectId: chin.id, year: 2024, paper: 'P1', score: 60, maxScore: 100 }] }
  });
  assert.equal(res.status, 402);
  const after = await callJson('/me', { cookie });
  assert.equal(after.data.papers.length, 0, 'a refused import must write nothing');
});

/* ---- the same user, once their plan includes the feature ------------------ */

check('a pass unlocks the gated endpoints', async () => {
  const { cookie } = await register('pass@school.edu.hk');
  const me = await callJson('/me', { cookie });
  const uid = me.data.user.id;
  store.__users.get(uid).plan = 'pass';
  store.__users.get(uid).planUntil = new Date(Date.now() + 86400000 * 90).toISOString();

  const pacing = await callJson('/pacing', { cookie });
  assert.equal(pacing.status, 200);
  assert.ok(Number.isFinite(pacing.data.weeksLeft));
  assert.ok(Array.isArray(pacing.data.thisWeek));

  const diag = await callJson('/diagnostics', { cookie });
  assert.equal(diag.status, 200);
  assert.equal(diag.data.enough, false, 'no entries yet, so it must refuse to draw a pattern');

  const refresh = await callJson('/me', { cookie });
  assert.equal(refresh.data.plan.plan, 'pass');
  assert.equal(refresh.data.plan.features.find((f) => f.id === 'pacing').unlocked, true);
});

check('an expired pass falls back to free, keeping every mark', async () => {
  const { cookie } = await register('expired@school.edu.hk');
  const me = await callJson('/me', { cookie });
  const uid = me.data.user.id;
  const chin = me.data.subjects.find((s) => s.code === 'CHIN');
  await call('/papers', { method: 'POST', cookie, body: { subjectId: chin.id, year: 2020, paper: 'P1', score: 65, maxScore: 100 } });

  store.__users.get(uid).plan = 'pass';
  store.__users.get(uid).planUntil = new Date(Date.now() - 86400000).toISOString();

  const after = await callJson('/me', { cookie });
  assert.equal(after.data.plan.plan, 'free', 'an expired pass must not linger');
  assert.equal(after.data.papers.length, 1, 'the marks logged during the pass must survive expiry');

  const pacing = await call('/pacing', { cookie });
  assert.equal(pacing.status, 402);
});

check('a pass with no end date does not silently expire', () => {
  assert.equal(planOf({ plan: 'pass' }), 'pass');
  assert.equal(hasFeature({ plan: 'pass' }, 'pacing'), true);
});

check('an unknown plan string is treated as free, not as everything', () => {
  assert.equal(planOf({ plan: 'enterprise' }), 'free');
  assert.equal(hasFeature({ plan: 'enterprise' }, 'import'), false);
  // And a corrupt expiry must not fail open.
  assert.equal(planOf({ plan: 'pass', planUntil: 'not-a-date' }), 'free');
});

/* ---- import goes through the same validation as a manual save ------------ */

check('a pass can import, and bad rows are reported not silently dropped', async () => {
  const { cookie } = await register('bulk@school.edu.hk');
  const me = await callJson('/me', { cookie });
  const uid = me.data.user.id;
  store.__users.get(uid).plan = 'pass';
  const byCode = Object.fromEntries(me.data.subjects.map((s) => [s.code, s.id]));

  const res = await callJson('/import', {
    method: 'POST', cookie,
    body: {
      rows: [
        { subjectId: byCode.CHIN, year: 2023, paper: 'P1', score: 58, maxScore: 100 },
        { subjectId: byCode.CHIN, year: 2023, paper: 'P2', score: 64, maxScore: 100 },
        // Chinese has no Paper 3 from 2024 — the import must refuse it, exactly
        // as the manual form does.
        { subjectId: byCode.CHIN, year: 2024, paper: 'P3', score: 70, maxScore: 100 }
      ]
    }
  });
  assert.equal(res.status, 201);
  assert.equal(res.data.imported, 2);
  assert.equal(res.data.skipped.length, 1);
  assert.match(res.data.skipped[0].reason, /Paper 3|P3/i);
  assert.equal(res.data.skipped[0].row, 3, 'the skipped row must name its position');
});

check('import bounds: an empty batch and an oversized one are refused', async () => {
  const { cookie } = await register('bounds@school.edu.hk');
  const me = await callJson('/me', { cookie });
  store.__users.get(me.data.user.id).plan = 'pass';
  const empty = await call('/import', { method: 'POST', cookie, body: { rows: [] } });
  assert.equal(empty.status, 400);
  const huge = await call('/import', {
    method: 'POST', cookie,
    body: { rows: Array.from({ length: 501 }, () => ({})) }
  });
  assert.equal(huge.status, 400);
  const notArray = await call('/import', { method: 'POST', cookie, body: { rows: 'nope' } });
  assert.equal(notArray.status, 400);
});

/* ---- the computations themselves ---------------------------------------- */

check('the pacing plan divides the weeks by the untouched papers', () => {
  const subjects = [{ id: 's1', code: 'MATH', name: 'Mathematics' }];
  const plan = buildPacing({
    user: { examDate: '2027-04-06' },
    subjects,
    papers: [],
    tasks: [],
    now: new Date('2027-01-06T09:00:00+08:00')
  });
  // 90 days is 13 weeks.
  assert.equal(plan.daysLeft, 90);
  assert.equal(plan.weeksLeft, 13);
  // MATH has P1 and P2 over 15 sittings: 30 untouched.
  assert.equal(plan.totalUntouched, 30);
  assert.equal(plan.thisWeek[0].untouched, 30);
  assert.ok(plan.note.length > 0, 'the plan must say it is a pace, not a promise');
});

check('the pacing plan counts a logged paper as done', () => {
  const subjects = [{ id: 's1', code: 'MATH', name: 'Mathematics' }];
  const plan = buildPacing({
    user: { examDate: '2027-04-06' },
    subjects,
    papers: [{ subjectId: 's1', year: 2025, paper: 'P1', percentage: 80 }],
    tasks: [],
    now: new Date('2027-01-06T09:00:00+08:00')
  });
  assert.equal(plan.totalUntouched, 29, 'one attempted cell must reduce the count by one');
});

check('diagnostics refuse to read a pattern from fewer than four entries', () => {
  const subjects = [{ id: 's1', name: 'Mathematics' }];
  const three = buildDiagnostics({
    subjects,
    errors: [
      { errorType: 'careless', subjectId: 's1' }, { errorType: 'careless', subjectId: 's1' }, { errorType: 'concept', subjectId: 's1' }
    ]
  });
  assert.equal(three.enough, false);
  assert.equal(three.topKind, null, 'it must not name a weak spot from three entries');
  assert.match(three.note, /1 more/);

  const four = buildDiagnostics({
    subjects,
    errors: [
      { errorType: 'careless', subjectId: 's1' }, { errorType: 'careless', subjectId: 's1' },
      { errorType: 'careless', subjectId: 's1' }, { errorType: 'concept', subjectId: 's1' }
    ]
  });
  assert.equal(four.enough, true);
  assert.equal(four.topKind.kind, 'careless');
  assert.equal(four.bySubject[0].name, 'Mathematics');
});

check('the entitlement payload carries no check a client could flip', () => {
  const given = entitlementsFor({ plan: 'free' });
  // It names what is locked, which is presentation. There is no field like
  // `canWrite: true` for a client to set — the endpoints decide.
  const json = JSON.stringify(given);
  assert.ok(!/bypass|override|isAdmin/i.test(json));
  assert.equal(given.plan, 'free');
  assert.ok(given.features.every((f) => f.unlocked === false));
});

/* ---------------------------------- run ----------------------------------- */

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

console.log(fails ? `\n${fails} of ${count} checks failed` : `\n${count} plan checks passed`);
process.exit(fails ? 1 : 0);
