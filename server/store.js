import { ObjectId } from 'mongodb';
import { createHash } from 'node:crypto';
import {
  randomToken, randomRecoveryCode, hashPassword,
  SESSION_COOKIE, SESSION_SECONDS, readCookie, CORE_CODES, CSD_CODE, SUBJECT_CATALOG,
  englishName
} from './util.js';
import { getDb } from './db.js';

/* --------------------------------- helpers -------------------------------- */

/** Every document id we expose is an ObjectId string, so one bad id can't throw. */
export function oid(value) {
  if (value instanceof ObjectId) return value;
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) return null;
  return new ObjectId(value);
}

/** Strip Mongo internals before anything leaves the server. */
function shape(doc) {
  if (!doc) return null;
  const { _id, userId, pw, recovery, ...rest } = doc;
  return { id: String(_id), ...rest };
}

function publicUser(doc) {
  if (!doc) return null;
  const { _id, pw, recovery, emailLower, ...rest } = doc;
  // `planUntil` is an internal expiry; the client is told the resolved plan and
  // its end date through `entitlementsFor`, so a raw timestamp is not needed.
  const { planUntil, ...visible } = rest;
  void planUntil;
  return { id: String(_id), ...visible };
}

const iso = (d) => (d instanceof Date ? d.toISOString() : d || null);

/* ---------------------------------- users --------------------------------- */

export async function createUser({ name, email, password }) {
  const db = await getDb();
  const now = new Date();
  const pw = await hashPassword(password);
  const recoveryCode = randomRecoveryCode();
  const recovery = await hashPassword(recoveryCode.toUpperCase());

  const doc = {
    _id: new ObjectId(),
    name,
    email,
    emailLower: email.toLowerCase(),
    pw,
    recovery,
    examDate: '2027-04-06',
    resultsDate: '2027-07-14',
    dailyGoalMinutes: 120,
    theme: 'system',
    // Every account starts free, with the complete desk. A paid plan only ever
    // adds the gated views; nothing a free student can already do is withheld.
    plan: 'free',
    createdAt: now
  };

  await db.collection('users').insertOne(doc);
  await seedSubjects(String(doc._id));
  return { user: doc, recoveryCode };
}

export async function seedSubjects(userId) {
  const db = await getDb();
  const now = new Date();
  const docs = CORE_CODES.map((code, i) => ({
    _id: new ObjectId(),
    userId,
    code,
    name: SUBJECT_CATALOG[code].name,
    category: 'core',
    // CSD is reported as Attained / Unattained, so it has no level target.
    targetLevel: code === CSD_CODE ? null : 4,
    predictedLevel: null,
    attainment: null,
    examDate: null,
    sortOrder: i,
    createdAt: now
  }));
  await db.collection('subjects').insertMany(docs);
}

export async function findUserByEmail(email) {
  const db = await getDb();
  return db.collection('users').findOne({ emailLower: email.toLowerCase() });
}

export async function findUserById(id) {
  const db = await getDb();
  const _id = oid(id);
  if (!_id) return null;
  return db.collection('users').findOne({ _id });
}

/* -------------------------------- sessions -------------------------------- */

export async function createSession(userId, secure) {
  const db = await getDb();
  const token = randomToken();
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const now = new Date();
  await db.collection('sessions').insertOne({
    _id: new ObjectId(),
    userId,
    tokenHash,
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_SECONDS * 1000)
  });
  return { token, secure };
}

export async function currentUser(headers) {
  const token = readCookie(headers, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const db = await getDb();
  const session = await db.collection('sessions').findOne({ tokenHash });
  if (!session) return null;
  if (new Date(session.expiresAt) < new Date()) {
    await db.collection('sessions').deleteOne({ _id: session._id });
    return null;
  }
  const user = await db.collection('users').findOne({ _id: oid(session.userId) });
  if (!user) return null;
  return { user, session };
}

export async function destroySession(headers) {
  const token = readCookie(headers, SESSION_COOKIE);
  if (!token) return;
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const db = await getDb();
  await db.collection('sessions').deleteOne({ tokenHash });
}

export async function destroyOtherSessions(userId, keepSessionId) {
  const db = await getDb();
  await db.collection('sessions').deleteMany({
    userId,
    ...(keepSessionId ? { _id: { $ne: oid(keepSessionId) } } : {})
  });
}

export async function updateUser(userId, patch) {
  const db = await getDb();
  await db.collection('users').updateOne({ _id: oid(userId) }, { $set: patch });
  return findUserById(userId);
}

export async function setPassword(userId, password) {
  const db = await getDb();
  const pw = await hashPassword(password);
  await db.collection('users').updateOne({ _id: oid(userId) }, { $set: { pw } });
}

export async function rotateRecovery(userId) {
  const db = await getDb();
  const code = randomRecoveryCode();
  const recovery = await hashPassword(code.toUpperCase());
  await db.collection('users').updateOne({ _id: oid(userId) }, { $set: { recovery } });
  return code;
}

export async function deleteAccount(userId) {
  const db = await getDb();
  for (const name of ['pastPapers', 'otherPapers', 'studyLogs', 'sbaTasks', 'errorLogs', 'subjects', 'sessions']) {
    await db.collection(name).deleteMany({ userId });
  }
  await db.collection('users').deleteOne({ _id: oid(userId) });
}

/* -------------------------------- workspace ------------------------------- */

export async function loadWorkspace(user) {
  const db = await getDb();
  const userId = String(user._id);

  const [subjects, papers, logs, tasks, errors, otherPapers] = await Promise.all([
    db.collection('subjects').find({ userId }).sort({ sortOrder: 1, createdAt: 1 }).toArray(),
    db.collection('pastPapers').find({ userId }).sort({ year: -1, paper: 1 }).toArray(),
    db.collection('studyLogs').find({ userId }).sort({ completedAt: -1 }).limit(3000).toArray(),
    db.collection('sbaTasks').find({ userId }).sort({ dueDate: 1, createdAt: 1 }).toArray(),
    db.collection('errorLogs').find({ userId }).sort({ createdAt: -1 }).limit(500).toArray(),
    db.collection('otherPapers').find({ userId }).sort({ takenOn: -1 }).limit(1000).toArray()
  ]);

  return {
    user: publicUser(user),
    subjects: subjects.map((s) => {
      const { createdAt, ...rest } = shape(s);
      void createdAt;
      // Older accounts were seeded with Chinese subject names; present the
      // English catalogue name instead of rewriting the user's own choice.
      const name = rest.code ? englishName(rest.code, rest.name) : rest.name;
      return { ...rest, name };
    }),
    papers: papers.map((p) => {
      const s = shape(p);
      return { ...s, attemptedAt: iso(p.attemptedAt) };
    }),
    logs: logs.map((l) => ({
      ...shape(l),
      startedAt: iso(l.startedAt),
      completedAt: iso(l.completedAt)
    })),
    tasks: tasks.map((t) => ({ ...shape(t), createdAt: iso(t.createdAt) })),
    errors: errors.map((e) => ({ ...shape(e), createdAt: iso(e.createdAt) })),
    otherPapers: otherPapers.map((o) => ({
      ...shape(o),
      takenOn: o.takenOn || null,
      createdAt: iso(o.createdAt)
    }))
  };
}

/* --------------------------------- subjects ------------------------------- */

export async function ownedSubject(userId, subjectId) {
  const db = await getDb();
  const _id = oid(subjectId);
  if (!_id) return null;
  return db.collection('subjects').findOne({ _id, userId });
}

export async function addSubject(userId, { code, name, category, targetLevel, predictedLevel, attainment, examDate, gradeBands }) {
  const db = await getDb();
  const last = await db
    .collection('subjects')
    .find({ userId })
    .sort({ sortOrder: -1 })
    .limit(1)
    .next();
  const doc = {
    _id: new ObjectId(),
    userId,
    code: code || '',
    name,
    category,
    targetLevel: targetLevel ?? null,
    predictedLevel: predictedLevel ?? null,
    attainment: attainment ?? null,
    examDate: examDate ?? null,
    gradeBands: gradeBands ?? null,
    sortOrder: (last?.sortOrder ?? 0) + 1,
    createdAt: new Date()
  };
  await db.collection('subjects').insertOne(doc);
  return doc;
}

export async function patchSubject(userId, subjectId, patch) {
  const db = await getDb();
  await db
    .collection('subjects')
    .updateOne({ _id: oid(subjectId), userId }, { $set: patch });
}

export async function removeSubject(userId, subjectId) {
  const db = await getDb();
  const _id = oid(subjectId);
  if (!_id) return;
  await Promise.all([
    db.collection('pastPapers').deleteMany({ userId, subjectId }),
    db.collection('otherPapers').deleteMany({ userId, subjectId }),
    db.collection('studyLogs').deleteMany({ userId, subjectId }),
    db.collection('sbaTasks').deleteMany({ userId, subjectId }),
    db.collection('errorLogs').deleteMany({ userId, subjectId }),
    db.collection('subjects').deleteOne({ _id, userId })
  ]);
}

/* ------------------------------- past papers ------------------------------ */

export async function savePaper(userId, input) {
  const db = await getDb();
  const filter = {
    userId,
    subjectId: input.subjectId,
    year: input.year,
    paper: input.paper
  };
  const update = {
    $set: {
      score: input.score,
      maxScore: input.maxScore,
      percentage: input.percentage,
      estimatedLevel: input.estimatedLevel ?? null,
      attainment: input.attainment ?? null,
      notes: input.notes,
      attemptedAt: new Date()
    },
    $setOnInsert: { _id: new ObjectId(), createdAt: new Date() }
  };
  await db.collection('pastPapers').updateOne(filter, update, { upsert: true }).catch(async (err) => {
    // Two tabs can save the same cell at once; the unique index rejects the loser.
    if (err?.code === 11000) {
      await db.collection('pastPapers').updateOne(filter, { $set: update.$set });
      return;
    }
    throw err;
  });
}

export async function patchPaper(userId, paperId, patch) {
  const db = await getDb();
  const _id = oid(paperId);
  if (!_id) return false;
  const result = await db
    .collection('pastPapers')
    .updateOne({ _id, userId }, { $set: { ...patch, attemptedAt: new Date() } });
  return result.matchedCount === 1;
}

export async function removePaper(userId, paperId) {
  const db = await getDb();
  const _id = oid(paperId);
  if (!_id) return 0;
  // Delete the whole cell, not just the row the browser knew about. Older
  // databases can hold duplicate rows for one cell (created before the unique
  // index existed), and deleting one would leave the score on screen.
  const doc = await db.collection('pastPapers').findOne({ _id, userId });
  if (!doc) return 0;
  return removePaperCell(userId, {
    subjectId: doc.subjectId,
    year: doc.year,
    paper: doc.paper
  });
}

/**
 * Delete a whole matrix cell. Used both by the normal delete and as the
 * fallback when a browser sends an id that no longer exists (the row was
 * replaced by an upsert), which is how a "deleted" score used to survive.
 */
export async function removePaperCell(userId, { subjectId, year, paper }) {
  if (!subjectId || !Number.isFinite(Number(year)) || !paper) return 0;
  const db = await getDb();
  const result = await db.collection('pastPapers').deleteMany({
    userId,
    subjectId,
    year: Number(year),
    paper
  });
  return result.deletedCount || 0;
}

/* ------------------------------ other papers ------------------------------
 * Mocks, textbook papers and practice papers. Stored apart from pastPapers so
 * the DSE matrix stays an honest record of real past papers.
 */

export async function addOtherPaper(userId, input) {
  const db = await getDb();
  const doc = { _id: new ObjectId(), userId, ...input, createdAt: new Date() };
  await db.collection('otherPapers').insertOne(doc);
  return doc;
}

export async function ownedOtherPaper(userId, paperId) {
  const db = await getDb();
  const _id = oid(paperId);
  if (!_id) return null;
  return db.collection('otherPapers').findOne({ _id, userId });
}

export async function patchOtherPaper(userId, paperId, patch) {
  const db = await getDb();
  const _id = oid(paperId);
  if (!_id) return false;
  const result = await db.collection('otherPapers').updateOne({ _id, userId }, { $set: patch });
  return result.matchedCount === 1;
}

export async function removeOtherPaper(userId, paperId) {
  const db = await getDb();
  const _id = oid(paperId);
  if (!_id) return;
  await db.collection('otherPapers').deleteOne({ _id, userId });
}

/* -------------------------------- study logs ------------------------------ */

export async function addLog(userId, { subjectId, label, minutes, mode, completedAt }) {
  const db = await getDb();
  const end = completedAt instanceof Date ? completedAt : new Date(completedAt);
  const doc = {
    _id: new ObjectId(),
    userId,
    subjectId: subjectId || null,
    label,
    minutes,
    mode,
    startedAt: new Date(end.getTime() - minutes * 60000),
    completedAt: end
  };
  await db.collection('studyLogs').insertOne(doc);
  return doc;
}

export async function clearLogsSince(userId, days) {
  const db = await getDb();
  const cutoff = new Date(Date.now() - days * 86400000);
  await db.collection('studyLogs').deleteMany({ userId, completedAt: { $gte: cutoff } });
}

/* -------------------------------- sba tasks ------------------------------- */

export async function addTask(userId, input) {
  const db = await getDb();
  const doc = {
    _id: new ObjectId(),
    userId,
    subjectId: input.subjectId || null,
    title: input.title,
    kind: input.kind,
    dueDate: input.dueDate || null,
    status: 'todo',
    weightPct: input.weightPct ?? null,
    notes: input.notes || '',
    createdAt: new Date()
  };
  await db.collection('sbaTasks').insertOne(doc);
  return doc;
}

export async function patchTask(userId, taskId, patch) {
  const db = await getDb();
  const _id = oid(taskId);
  if (!_id) return false;
  const result = await db.collection('sbaTasks').updateOne({ _id, userId }, { $set: patch });
  return result.matchedCount === 1;
}

export async function removeTask(userId, taskId) {
  const db = await getDb();
  const _id = oid(taskId);
  if (!_id) return;
  await db.collection('sbaTasks').deleteOne({ _id, userId });
}

/* -------------------------------- error logs ------------------------------ */

export async function addError(userId, input) {
  const db = await getDb();
  const doc = {
    _id: new ObjectId(),
    userId,
    subjectId: input.subjectId || null,
    topic: input.topic,
    questionRef: input.questionRef || '',
    errorType: input.errorType,
    note: input.note || '',
    createdAt: new Date()
  };
  await db.collection('errorLogs').insertOne(doc);
  return doc;
}

export async function removeError(userId, errorId) {
  const db = await getDb();
  const _id = oid(errorId);
  if (!_id) return;
  await db.collection('errorLogs').deleteOne({ _id, userId });
}

export { shape, publicUser };
