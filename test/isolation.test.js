/**
 * Route-level tests for the Atlas/Vercel API, run against an in-memory store.
 * Verifies auth flows, validation and — most importantly — that one student
 * can never read or mutate another student's records.
 *
 * Run: node test/isolation.test.js
 */

import assert from 'node:assert/strict';
import { handleApi } from '../server/routes.js';
import { hashPassword, verifyPassword } from '../server/util.js';

/* ------------------------------ in-memory store ---------------------------- */

function makeStore() {
  const users = new Map();
  const sessions = new Map();
  const data = { subjects: new Map(), pastPapers: new Map(), studyLogs: new Map(), sbaTasks: new Map(), errorLogs: new Map(), otherPapers: new Map() };
  let seq = 0;
  const id = (prefix) => `${prefix}${String(++seq).padStart(20, '0')}`;
  const byUser = (table, userId) => [...data[table].values()].filter((d) => d.userId === userId);
  const findOwned = (table, userId, docId) => {
    const doc = data[table].get(docId);
    return doc && doc.userId === userId ? doc : null;
  };

  return {
    async findUserByEmail(email) {
      return [...users.values()].find((u) => u.emailLower === email.toLowerCase()) || null;
    },
    async createUser({ name, email, password }) {
      const user = {
        _id: id('u'),
        name,
        email,
        emailLower: email.toLowerCase(),
        pw: hashPassword(password),
        recovery: hashPassword('TEST-CODE-1234'),
        examDate: '2027-04-06',
        resultsDate: '2027-07-14',
        dailyGoalMinutes: 120,
        theme: 'system',
        createdAt: new Date()
      };
      users.set(user._id, user);
      await this.seedSubjects(user._id);
      return { user, recoveryCode: 'TEST-CODE-1234' };
    },
    async seedSubjects(userId) {
      for (const [i, code] of ['CHIN', 'ENG', 'MATH', 'CSD'].entries()) {
        const subject = {
          _id: id('s'),
          userId,
          code,
          name: code,
          category: 'core',
          // CSD is graded Attained / Unattained, so it has no level target.
          targetLevel: code === 'CSD' ? null : 4,
          predictedLevel: null,
          attainment: null,
          examDate: null,
          sortOrder: i,
          createdAt: new Date()
        };
        data.subjects.set(subject._id, subject);
      }
    },
    async createSession(userId) {
      const token = `tok-${userId}-${++seq}`;
      sessions.set(token, { userId });
      return { token, secure: true };
    },
    async currentUser(headers) {
      const cookie = headers.get('cookie') || '';
      const token = cookie.replace(/^.*dse_session=([^;]+).*$/, '$1');
      const s = sessions.get(token);
      if (!s) return null;
      const user = users.get(s.userId);
      if (!user) return null;
      return { user, session: { _id: 'sess' } };
    },
    async destroySession(headers) {
      const cookie = headers.get('cookie') || '';
      const token = cookie.replace(/^.*dse_session=([^;]+).*$/, '$1');
      sessions.delete(token);
    },
    async destroyOtherSessions() {},
    async updateUser(userId, patch) {
      const user = users.get(userId);
      Object.assign(user, patch);
      return user;
    },
    async setPassword(userId, password) {
      users.get(userId).pw = hashPassword(password);
    },
    async rotateRecovery() {
      return 'NEW-CODE-5678';
    },
    async deleteAccount(userId) {
      users.delete(userId);
      for (const [token, s] of sessions) if (s.userId === userId) sessions.delete(token);
      for (const table of Object.keys(data)) {
        for (const [k, v] of data[table]) if (v.userId === userId) data[table].delete(k);
      }
    },
    async loadWorkspace(user) {
      const userId = user._id;
      const { pw, recovery, emailLower, _id, ...safeUser } = user;
      void pw;
      void recovery;
      void emailLower;
      const shape = (doc) => {
        const { _id: docId, userId: owner, ...rest } = doc;
        void owner;
        return { id: docId, ...rest };
      };
      return {
        user: { id: _id, ...safeUser },
        subjects: byUser('subjects', userId).map(shape),
        papers: byUser('pastPapers', userId).map(shape),
        logs: byUser('studyLogs', userId).map(shape),
        tasks: byUser('sbaTasks', userId).map(shape),
        errors: byUser('errorLogs', userId).map(shape),
        otherPapers: byUser('otherPapers', userId).map(shape)
      };
    },
    async ownedSubject(userId, subjectId) {
      return findOwned('subjects', userId, subjectId);
    },
    async addSubject(userId, input) {
      const doc = { _id: id('s'), userId, ...input, sortOrder: 9, createdAt: new Date() };
      data.subjects.set(doc._id, doc);
      return doc;
    },
    async patchSubject(userId, subjectId, patch) {
      const doc = findOwned('subjects', userId, subjectId);
      if (doc) Object.assign(doc, patch);
    },
    async removeSubject(userId, subjectId) {
      data.subjects.delete(subjectId);
      for (const table of ['pastPapers', 'otherPapers', 'studyLogs', 'sbaTasks', 'errorLogs']) {
        for (const [k, v] of data[table]) if (v.userId === userId && v.subjectId === subjectId) data[table].delete(k);
      }
    },
    async savePaper(userId, input) {
      const existing = byUser('pastPapers', userId).find(
        (p) => p.subjectId === input.subjectId && p.year === input.year && p.paper === input.paper
      );
      if (existing) Object.assign(existing, input, { attemptedAt: new Date() });
      else {
        const doc = { _id: id('p'), userId, ...input, attemptedAt: new Date() };
        data.pastPapers.set(doc._id, doc);
      }
    },
    async patchPaper(userId, paperId, patch) {
      const doc = findOwned('pastPapers', userId, paperId);
      if (!doc) return false;
      Object.assign(doc, patch);
      return true;
    },
    async removePaper(userId, paperId) {
      // Mirrors the real store: delete the whole cell, so duplicate rows from
      // an older database cannot survive the delete.
      const doc = findOwned('pastPapers', userId, paperId);
      if (!doc) return;
      for (const [key, row] of data.pastPapers) {
        if (
          row.userId === userId &&
          row.subjectId === doc.subjectId &&
          row.year === doc.year &&
          row.paper === doc.paper
        ) {
          data.pastPapers.delete(key);
        }
      }
    },
    /** Test-only: plant a second row for one cell, as an unindexed DB could. */
    seedDuplicatePaper(userId, subjectId, year, paper, docId, score, maxScore) {
      data.pastPapers.set(docId, {
        _id: docId,
        userId,
        subjectId,
        year,
        paper,
        score,
        maxScore,
        percentage: Math.round((score / maxScore) * 1000) / 10,
        estimatedLevel: null,
        attainment: null,
        notes: '',
        attemptedAt: new Date()
      });
    },
    async addLog(userId, input) {
      const doc = { _id: id('l'), userId, ...input };
      data.studyLogs.set(doc._id, doc);
      return doc;
    },
    async clearLogsSince(userId, days) {
      const cutoff = Date.now() - days * 86400000;
      for (const [k, v] of data.studyLogs) {
        if (v.userId === userId && new Date(v.completedAt).getTime() >= cutoff) data.studyLogs.delete(k);
      }
    },
    async addTask(userId, input) {
      const doc = { _id: id('t'), userId, status: 'todo', ...input };
      data.sbaTasks.set(doc._id, doc);
      return doc;
    },
    async patchTask(userId, taskId, patch) {
      const doc = findOwned('sbaTasks', userId, taskId);
      if (!doc) return false;
      Object.assign(doc, patch);
      return true;
    },
    async removeTask(userId, taskId) {
      if (findOwned('sbaTasks', userId, taskId)) data.sbaTasks.delete(taskId);
    },
    async addError(userId, input) {
      const doc = { _id: id('e'), userId, ...input };
      data.errorLogs.set(doc._id, doc);
      return doc;
    },
    async removeError(userId, errorId) {
      if (findOwned('errorLogs', userId, errorId)) data.errorLogs.delete(errorId);
    },
    async addOtherPaper(userId, input) {
      const doc = { _id: id('o'), userId, createdAt: new Date(), ...input };
      data.otherPapers.set(doc._id, doc);
      return doc;
    },
    async ownedOtherPaper(userId, paperId) {
      return findOwned('otherPapers', userId, paperId);
    },
    async patchOtherPaper(userId, paperId, patch) {
      const doc = findOwned('otherPapers', userId, paperId);
      if (!doc) return false;
      Object.assign(doc, patch);
      return true;
    },
    async removeOtherPaper(userId, paperId) {
      if (findOwned('otherPapers', userId, paperId)) data.otherPapers.delete(paperId);
    }
  };
}

/* --------------------------------- harness -------------------------------- */

const store = makeStore();

function call(path, { method = 'GET', body, cookie, origin = 'https://desk.example' } = {}) {
  const headers = new Headers({ origin });
  if (body) headers.set('content-type', 'application/json');
  if (cookie) headers.set('cookie', `dse_session=${cookie}`);
  const request = new Request(`https://desk.example/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  return handleApi(request, path, store);
}

async function callJson(path, options) {
  const res = await call(path, options);
  const data = await res.json();
  return { status: res.status, data, setCookie: res.headers.get('set-cookie') };
}

const tokenFrom = (setCookie) => setCookie?.match(/dse_session=([^;]+)/)?.[1] || null;

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}\n      ${err.message}`);
    process.exitCode = 1;
  }
}

/* ---------------------------------- tests --------------------------------- */

console.log('\nStarShooter — API isolation tests\n');

let alice;
let bob;
let aliceId;

await test('registration creates a session and seeds four core subjects', async () => {
  const res = await callJson('/auth/register', {
    method: 'POST',
    body: { name: 'Alice Wong', email: 'alice@school.edu.hk', password: 'password123' }
  });
  assert.equal(res.status, 201);
  assert.ok(res.data.recoveryCode, 'recovery code returned once');
  alice = tokenFrom(res.setCookie);
  assert.ok(alice, 'session cookie set');

  const me = await callJson('/me', { cookie: alice });
  assert.equal(me.status, 200);
  aliceId = me.data.user.id;
  assert.equal(me.data.subjects.length, 4);
  assert.deepEqual(me.data.subjects.map((s) => s.code), ['CHIN', 'ENG', 'MATH', 'CSD']);
  assert.equal(me.data.user.email, 'alice@school.edu.hk');
  assert.equal(me.data.user.pw, undefined, 'password hash never leaves the server');
});

await test('duplicate email is rejected', async () => {
  const res = await callJson('/auth/register', {
    method: 'POST',
    body: { name: 'Impostor', email: 'ALICE@school.edu.hk', password: 'password123' }
  });
  assert.equal(res.status, 409);
});

await test('wrong password is rejected without leaking which field was wrong', async () => {
  const res = await callJson('/auth/login', {
    method: 'POST',
    body: { email: 'alice@school.edu.hk', password: 'wrongpassword' }
  });
  assert.equal(res.status, 401);
  assert.match(res.data.error, /Email or password/);
});

await test('unauthenticated requests cannot read the workspace', async () => {
  const res = await callJson('/me');
  assert.equal(res.status, 401);
});

await test('cross-origin state changes are blocked', async () => {
  const res = await callJson('/logs', {
    method: 'POST',
    body: { minutes: 25 },
    cookie: alice,
    origin: 'https://evil.example'
  });
  assert.equal(res.status, 403);
});

await test('paper logging upserts the same cell instead of duplicating it', async () => {
  const me = await callJson('/me', { cookie: alice });
  const mathId = me.data.subjects.find((s) => s.code === 'MATH').id;

  const first = await callJson('/papers', {
    method: 'POST',
    cookie: alice,
    body: { subjectId: mathId, year: 2024, paper: 'P1', score: 76, maxScore: 100, estimatedLevel: 5 }
  });
  assert.equal(first.status, 201);
  assert.equal(first.data.papers.length, 1);
  assert.equal(first.data.papers[0].percentage, 76);

  const second = await callJson('/papers', {
    method: 'POST',
    cookie: alice,
    body: { subjectId: mathId, year: 2024, paper: 'P1', score: 90, maxScore: 100, estimatedLevel: 6 }
  });
  assert.equal(second.data.papers.length, 1, 'still one row for that cell');
  assert.equal(second.data.papers[0].percentage, 90);
  assert.equal(second.data.papers[0].estimatedLevel, 6);
});

await test('a second student sees an empty, separate workspace', async () => {
  const res = await callJson('/auth/register', {
    method: 'POST',
    body: { name: 'Bob Lee', email: 'bob@school.edu.hk', password: 'password456' }
  });
  bob = tokenFrom(res.setCookie);
  const me = await callJson('/me', { cookie: bob });
  assert.equal(me.data.papers.length, 0, 'no papers leak across accounts');
  assert.equal(me.data.subjects.length, 4);
});

await test('student B cannot log a paper against student A\'s subject', async () => {
  const aliceMe = await callJson('/me', { cookie: alice });
  const aliceMath = aliceMe.data.subjects.find((s) => s.code === 'MATH').id;

  const res = await callJson('/papers', {
    method: 'POST',
    cookie: bob,
    body: { subjectId: aliceMath, year: 2023, paper: 'P1', score: 50, maxScore: 100 }
  });
  assert.equal(res.status, 403);
});

await test('student B cannot edit or delete student A\'s paper log', async () => {
  const aliceMe = await callJson('/me', { cookie: alice });
  const paperId = aliceMe.data.papers[0].id;

  const patch = await callJson(`/papers/${paperId}`, {
    method: 'PATCH',
    cookie: bob,
    body: { score: 5, maxScore: 100 }
  });
  assert.equal(patch.status, 404, 'edit is scoped to the owner');

  const del = await callJson(`/papers/${paperId}`, { method: 'DELETE', cookie: bob });
  assert.equal(del.status, 200);
  const stillThere = await callJson('/me', { cookie: alice });
  assert.equal(stillThere.data.papers.length, 1, 'record survived the foreign delete');
});

await test('a foreign task id cannot be patched or deleted', async () => {
  const task = await callJson('/tasks', {
    method: 'POST',
    cookie: alice,
    body: { title: 'Chemistry SBA draft', kind: 'sba', dueDate: '2027-01-15' }
  });
  const taskId = task.data.tasks[0].id;

  const patch = await callJson(`/tasks/${taskId}`, {
    method: 'PATCH',
    cookie: bob,
    body: { status: 'done' }
  });
  assert.equal(patch.status, 404);

  await callJson(`/tasks/${taskId}`, { method: 'DELETE', cookie: bob });
  const aliceMe = await callJson('/me', { cookie: alice });
  assert.equal(aliceMe.data.tasks.length, 1);
  assert.equal(aliceMe.data.tasks[0].status, 'todo');
});

await test('study sessions are logged against the caller only', async () => {
  const log = await callJson('/logs', {
    method: 'POST',
    cookie: alice,
    body: { minutes: 25, label: 'Trig drill' }
  });
  assert.equal(log.status, 201);
  assert.equal(log.data.logs.length, 1);

  const bobMe = await callJson('/me', { cookie: bob });
  assert.equal(bobMe.data.logs.length, 0);
});

await test('session length and score bounds are validated', async () => {
  const badMinutes = await callJson('/logs', { method: 'POST', cookie: alice, body: { minutes: 0 } });
  assert.equal(badMinutes.status, 400);

  const me = await callJson('/me', { cookie: alice });
  const engId = me.data.subjects.find((s) => s.code === 'ENG').id;
  const badYear = await callJson('/papers', {
    method: 'POST',
    cookie: alice,
    body: { subjectId: engId, year: 1999, paper: 'P1' }
  });
  assert.equal(badYear.status, 400);
});

await test('recovery code rotates the password and returns a fresh code', async () => {
  const res = await callJson('/auth/recover', {
    method: 'POST',
    body: { email: 'bob@school.edu.hk', recoveryCode: 'TEST-CODE-1234', password: 'newpassword99' }
  });
  assert.equal(res.status, 200);
  assert.equal(res.data.recoveryCode, 'NEW-CODE-5678');

  const login = await callJson('/auth/login', {
    method: 'POST',
    body: { email: 'bob@school.edu.hk', password: 'newpassword99' }
  });
  assert.equal(login.status, 200);
});

await test('a wrong recovery code is refused', async () => {
  const res = await callJson('/auth/recover', {
    method: 'POST',
    body: { email: 'alice@school.edu.hk', recoveryCode: 'WRONG-CODE', password: 'whatever12' }
  });
  assert.equal(res.status, 401);
});

await test('password hashing verifies the right password only', async () => {
  const record = hashPassword('password123');
  assert.equal(verifyPassword('password123', record), true);
  assert.equal(verifyPassword('password124', record), false);
});

await test('CSD is graded Attained / Not attained, not on levels', async () => {
  const me = await callJson('/me', { cookie: alice });
  const csd = me.data.subjects.find((s) => s.code === 'CSD');
  assert.ok(csd, 'CSD is seeded as a core subject');
  assert.equal(csd.targetLevel, null, 'CSD has no level target');

  const res = await callJson('/papers', {
    method: 'POST',
    cookie: alice,
    body: { subjectId: csd.id, year: 2024, paper: 'P1', attainment: 'attained' }
  });
  assert.equal(res.status, 201);
  const paper = res.data.papers.find((p) => p.subjectId === csd.id);
  assert.equal(paper.attainment, 'attained');
  assert.equal(paper.estimatedLevel, null, 'a CSD log never carries a level');
});

await test('CSD rejects a level, a second paper, and pre-2024 years', async () => {
  const me = await callJson('/me', { cookie: alice });
  const csd = me.data.subjects.find((s) => s.code === 'CSD');

  // A level sent for CSD is dropped rather than stored.
  const levelled = await callJson('/papers', {
    method: 'POST',
    cookie: alice,
    body: { subjectId: csd.id, year: 2025, paper: 'P1', attainment: 'attained', estimatedLevel: 5 }
  });
  const stored = levelled.data.papers.find((p) => p.subjectId === csd.id && p.year === 2025);
  assert.equal(stored.estimatedLevel, null, 'level ignored for CSD');

  // CSD has a single paper.
  const secondPaper = await callJson('/papers', {
    method: 'POST',
    cookie: alice,
    body: { subjectId: csd.id, year: 2025, paper: 'P2' }
  });
  assert.equal(secondPaper.status, 400);
  assert.match(secondPaper.data.error, /single paper|Year/i);

  // CSD was first examined in 2024.
  const tooEarly = await callJson('/papers', {
    method: 'POST',
    cookie: alice,
    body: { subjectId: csd.id, year: 2023, paper: 'P1' }
  });
  assert.equal(tooEarly.status, 400);
  assert.match(tooEarly.data.error, /2024/);

  // A levelled subject still gets its 2012 floor.
  const eng = me.data.subjects.find((s) => s.code === 'ENG');
  const oldEng = await callJson('/papers', {
    method: 'POST',
    cookie: alice,
    body: { subjectId: eng.id, year: 2011, paper: 'P1' }
  });
  assert.equal(oldEng.status, 400);
});

await test('CSD attainment must be a real value', async () => {
  const me = await callJson('/me', { cookie: alice });
  const csd = me.data.subjects.find((s) => s.code === 'CSD');
  const res = await callJson('/papers', {
    method: 'POST',
    cookie: alice,
    body: { subjectId: csd.id, year: 2026, paper: 'P1', attainment: 'maybe' }
  });
  assert.equal(res.status, 400);
  assert.match(res.data.error, /Attained/i);
});

await test('a levelled paper never stores attainment', async () => {
  const me = await callJson('/me', { cookie: alice });
  const math = me.data.subjects.find((s) => s.code === 'MATH');
  const res = await callJson('/papers', {
    method: 'POST',
    cookie: alice,
    body: { subjectId: math.id, year: 2022, paper: 'P1', score: 70, maxScore: 100, attainment: 'attained' }
  });
  const paper = res.data.papers.find((p) => p.subjectId === math.id && p.year === 2022);
  assert.equal(paper.attainment, null, 'attainment is CSD-only');
});

await test('CSD school prediction is stored instead of a target level', async () => {
  const me = await callJson('/me', { cookie: alice });
  const csd = me.data.subjects.find((s) => s.code === 'CSD');
  const res = await callJson(`/subjects/${csd.id}`, {
    method: 'PATCH',
    cookie: alice,
    body: { targetLevel: 5, predictedLevel: 5, attainment: 'attained' }
  });
  assert.equal(res.status, 200);
  const updated = res.data.subjects.find((s) => s.id === csd.id);
  assert.equal(updated.attainment, 'attained');
  assert.equal(updated.targetLevel, null, 'CSD never keeps a level target');
  assert.equal(updated.predictedLevel, null);
});

await test('other papers are logged apart from the DSE matrix', async () => {
  const me = await callJson('/me', { cookie: alice });
  const chem = me.data.subjects.find((s) => s.code === 'CHEM') || me.data.subjects.find((s) => s.code === 'MATH');

  const res = await callJson('/other-papers', {
    method: 'POST',
    cookie: alice,
    body: {
      subjectId: chem.id,
      title: 'St Paul\'s mock 2026',
      source: 'other-school',
      takenOn: '2026-01-12',
      score: 63,
      maxScore: 90,
      estimatedLevel: 5,
      notes: 'Section B timing'
    }
  });
  assert.equal(res.status, 201);
  const saved = res.data.otherPapers[0];
  assert.equal(saved.title, "St Paul's mock 2026");
  assert.equal(saved.source, 'other-school');
  assert.equal(saved.percentage, 70);
  assert.equal(saved.estimatedLevel, 5);
  assert.equal(res.data.papers.length, me.data.papers.length, 'the DSE matrix is untouched');
});

await test('other papers validate their name, date and score', async () => {
  const me = await callJson('/me', { cookie: alice });
  const subj = me.data.subjects[0];

  const noTitle = await callJson('/other-papers', {
    method: 'POST', cookie: alice, body: { subjectId: subj.id, takenOn: '2026-02-01' }
  });
  assert.equal(noTitle.status, 400);

  const noDate = await callJson('/other-papers', {
    method: 'POST', cookie: alice, body: { subjectId: subj.id, title: 'Mock' }
  });
  assert.equal(noDate.status, 400);

  const badScore = await callJson('/other-papers', {
    method: 'POST', cookie: alice, body: { subjectId: subj.id, title: 'Mock', takenOn: '2026-02-01', maxScore: 0 }
  });
  assert.equal(badScore.status, 400);
});

await test('another student cannot read, edit or delete your other papers', async () => {
  const aliceMe = await callJson('/me', { cookie: alice });
  const id = aliceMe.data.otherPapers[0].id;

  const bobMe = await callJson('/me', { cookie: bob });
  assert.equal(bobMe.data.otherPapers.length, 0, 'nothing leaks across accounts');

  const patch = await callJson(`/other-papers/${id}`, {
    method: 'PATCH', cookie: bob, body: { title: 'Hijacked' }
  });
  assert.equal(patch.status, 404);

  await callJson(`/other-papers/${id}`, { method: 'DELETE', cookie: bob });
  const still = await callJson('/me', { cookie: alice });
  assert.equal(still.data.otherPapers.length, 1, 'record survived the foreign delete');
});

await test('a foreign subject cannot be used for another paper', async () => {
  const aliceMe = await callJson('/me', { cookie: alice });
  const aliceSubj = aliceMe.data.subjects[0].id;
  const res = await callJson('/other-papers', {
    method: 'POST',
    cookie: bob,
    body: { subjectId: aliceSubj, title: 'Sneaky mock', takenOn: '2026-03-01' }
  });
  assert.equal(res.status, 403);
});

await test('other papers for CSD use attainment, not levels', async () => {
  const me = await callJson('/me', { cookie: alice });
  const csd = me.data.subjects.find((s) => s.code === 'CSD');
  const res = await callJson('/other-papers', {
    method: 'POST',
    cookie: alice,
    body: { subjectId: csd.id, title: 'CSD school mock', takenOn: '2026-02-20', attainment: 'attained', estimatedLevel: 4 }
  });
  assert.equal(res.status, 201);
  const saved = res.data.otherPapers.find((o) => o.title === 'CSD school mock');
  assert.equal(saved.attainment, 'attained');
  assert.equal(saved.estimatedLevel, null, 'CSD never stores a level');
});

await test('deleting a subject removes its other papers too', async () => {
  const me = await callJson('/me', { cookie: alice });
  const csd = me.data.subjects.find((s) => s.code === 'CSD');
  await callJson(`/subjects/${csd.id}`, { method: 'DELETE', cookie: alice });
  const after = await callJson('/me', { cookie: alice });
  assert.equal(after.data.otherPapers.filter((o) => o.subjectId === csd.id).length, 0);
});

await test('Chinese has no Paper 3 from 2024, but old sittings still do', async () => {
  const me = await callJson('/me', { cookie: alice });
  const chin = me.data.subjects.find((s) => s.code === 'CHIN');

  const newP3 = await callJson('/papers', {
    method: 'POST', cookie: alice, body: { subjectId: chin.id, year: 2025, paper: 'P3' }
  });
  assert.equal(newP3.status, 400, 'P3 was abolished from 2024');
  assert.match(newP3.data.error, /Paper 3|2024/i);

  const oldP3 = await callJson('/papers', {
    method: 'POST', cookie: alice, body: { subjectId: chin.id, year: 2019, paper: 'P3', score: 70, maxScore: 100 }
  });
  assert.equal(oldP3.status, 201, 'a 2019 sitting did have Paper 3');

  const newP2 = await callJson('/papers', {
    method: 'POST', cookie: alice, body: { subjectId: chin.id, year: 2025, paper: 'P2', score: 68, maxScore: 100 }
  });
  assert.equal(newP2.status, 201, 'P1 and P2 remain');
});

await test('the Paper 3 rule is Chinese-only', async () => {
  const me = await callJson('/me', { cookie: alice });
  const eng = me.data.subjects.find((s) => s.code === 'ENG');
  const res = await callJson('/papers', {
    method: 'POST', cookie: alice, body: { subjectId: eng.id, year: 2025, paper: 'P3', score: 60, maxScore: 100 }
  });
  assert.equal(res.status, 201, 'English still has Paper 3');
});

await test('grade bands save, stay per-subject, and are validated', async () => {
  const me = await callJson('/me', { cookie: alice });
  const math = me.data.subjects.find((s) => s.code === 'MATH');
  const eng = me.data.subjects.find((s) => s.code === 'ENG');

  const saved = await callJson(`/subjects/${math.id}`, {
    method: 'PATCH',
    cookie: alice,
    body: { gradeBands: { 2: 30, 3: 40, 4: 52, 5: 63, 6: 75, 7: 86 } }
  });
  assert.equal(saved.status, 200, 'bands should save');
  const savedMath = saved.data.subjects.find((s) => s.id === math.id);
  assert.equal(savedMath.gradeBands['7'], 86);
  assert.equal(savedMath.gradeBands['2'], 30);

  const untouched = saved.data.subjects.find((s) => s.id === eng.id);
  assert.equal(untouched.gradeBands ?? null, null, 'bands must not leak across subjects');

  const inverted = await callJson(`/subjects/${math.id}`, {
    method: 'PATCH',
    cookie: alice,
    body: { gradeBands: { 2: 60, 3: 40 } }
  });
  assert.equal(inverted.status, 400, 'bands that go backwards must be rejected');

  const outOfRange = await callJson(`/subjects/${math.id}`, {
    method: 'PATCH',
    cookie: alice,
    body: { gradeBands: { 4: 140 } }
  });
  assert.equal(outOfRange.status, 400, 'a band above 99% is not a percentage');

  const cleared = await callJson(`/subjects/${math.id}`, {
    method: 'PATCH',
    cookie: alice,
    body: { gradeBands: null }
  });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.data.subjects.find((s) => s.id === math.id).gradeBands, null, 'null clears back to defaults');
});

await test('CSD cannot carry grade bands', async () => {
  // Earlier tests delete the seeded CSD subject, so make a fresh one and prove
  // the rule directly instead of relying on suite order.
  const added = await callJson('/subjects', {
    method: 'POST',
    cookie: alice,
    body: { code: 'CSD', category: 'core' }
  });
  assert.equal(added.status, 201, 'CSD should be addable');
  const csd = added.data.subjects.find((s) => s.code === 'CSD');
  assert.ok(csd, 'CSD subject missing after add');

  const res = await callJson(`/subjects/${csd.id}`, {
    method: 'PATCH',
    cookie: alice,
    body: { gradeBands: { 2: 30, 3: 40, 4: 50, 5: 60, 6: 70, 7: 80 } }
  });
  assert.equal(res.status, 200);
  assert.equal(res.data.subjects.find((s) => s.id === csd.id).gradeBands, null, 'CSD has attainment, not levels');
});

await test('saving an attempt with a stale id writes the cell instead of failing', async () => {
  const me = await callJson('/me', { cookie: alice });
  const eng = me.data.subjects.find((s) => s.code === 'ENG');

  // The id the browser holds is no longer in the collection.
  const stale = await callJson('/papers/0123456789abcdef01234567', {
    method: 'PATCH',
    cookie: alice,
    body: { subjectId: eng.id, year: 2022, paper: 'P2', score: 71, maxScore: 100 }
  });
  assert.equal(stale.status, 200, 'a stale id must not lose the attempt');

  const after = await callJson('/me', { cookie: alice });
  const saved = after.data.papers.find((p) => p.subjectId === eng.id && p.year === 2022 && p.paper === 'P2');
  assert.ok(saved, 'the attempt should exist under its real cell');
  assert.equal(saved.score, 71);

  // And saving the same cell again updates rather than duplicating.
  const again = await callJson(`/papers/${saved.id}`, {
    method: 'PATCH',
    cookie: alice,
    body: { subjectId: eng.id, year: 2022, paper: 'P2', score: 80, maxScore: 100 }
  });
  assert.equal(again.status, 200);
  const recount = await callJson('/me', { cookie: alice });
  const same = recount.data.papers.filter((p) => p.subjectId === eng.id && p.year === 2022 && p.paper === 'P2');
  assert.equal(same.length, 1, 'one cell, one row');
  assert.equal(same[0].score, 80);
});

await test('a stale id still cannot be used to write into someone else’s subject', async () => {
  const aliceMe = await callJson('/me', { cookie: alice });
  const aliceMath = aliceMe.data.subjects.find((s) => s.code === 'MATH');
  const res = await callJson('/papers/0123456789abcdef01234567', {
    method: 'PATCH',
    cookie: bob,
    body: { subjectId: aliceMath.id, year: 2022, paper: 'P1', score: 99, maxScore: 100 }
  });
  assert.equal(res.status, 404, 'the recovery path must not bypass ownership');
});

await test('deleting a cell removes duplicate rows for that cell', async () => {
  const me = await callJson('/me', { cookie: alice });
  const phys = me.data.subjects.find((s) => s.code === 'PHYS') || me.data.subjects.find((s) => s.code === 'MATH');

  // Reproduce a database written before the unique index existed: two rows for
  // one matrix cell. The store allows the duplicate so this test is meaningful;
  // on Atlas ensureIndexes() cleans these up.
  await callJson('/papers', {
    method: 'POST',
    cookie: alice,
    body: { subjectId: phys.id, year: 2020, paper: 'P1', score: 40, maxScore: 100 }
  });
  const staleId = `dup${Date.now()}`;
  store.seedDuplicatePaper(aliceId, phys.id, 2020, 'P1', staleId, 40, 100);

  const before = await callJson('/me', { cookie: alice });
  const rows = before.data.papers.filter((p) => p.subjectId === phys.id && p.year === 2020 && p.paper === 'P1');
  assert.equal(rows.length, 2, 'the duplicate should be reproduced');

  // Delete using one of the two ids: the whole cell must go.
  const del = await callJson(`/papers/${rows[0].id}`, { method: 'DELETE', cookie: alice });
  assert.equal(del.status, 200);

  const after = await callJson('/me', { cookie: alice });
  const left = after.data.papers.filter((p) => p.subjectId === phys.id && p.year === 2020 && p.paper === 'P1');
  assert.equal(left.length, 0, `the score survived because ${left.length} row(s) remained`);
});

await test('deleting an account removes its records', async () => {
  await callJson('/account', { method: 'DELETE', cookie: alice });
  const after = await callJson('/me', { cookie: alice });
  assert.equal(after.status, 401);
  const bobMe = await callJson('/me', { cookie: bob });
  assert.equal(bobMe.status, 200, 'the other student is unaffected');
});

console.log(`\n${passed} checks passed${process.exitCode ? ' — with failures' : ''}\n`);
