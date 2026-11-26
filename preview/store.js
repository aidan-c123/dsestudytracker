/**
 * Preview-only in-memory store.
 *
 * The real app talks to MongoDB Atlas through api/index.js on Vercel. This
 * module exists so the browser preview in this chat can exercise the same
 * routes without a database or outbound network. Data lives in the Worker
 * isolate and resets when the preview restarts.
 *
 * It is NOT used in production: Vercel never loads preview/.
 */

import { hashPassword } from '../server/util.js';

const data = {
  users: new Map(),
  sessions: new Map(),
  subjects: new Map(),
  pastPapers: new Map(),
  studyLogs: new Map(),
  sbaTasks: new Map(),
  errorLogs: new Map()
};

let seq = 0;
const id = (prefix) => `${prefix}${String(++seq).padStart(6, '0')}`;
const byUser = (table, userId) => [...data[table].values()].filter((doc) => doc.userId === userId);
const findOwned = (table, userId, docId) => {
  const doc = data[table].get(docId);
  return doc && doc.userId === userId ? doc : null;
};

const CORE = [
  { code: 'CHIN', name: '中國語文' },
  { code: 'ENG', name: 'English Language' },
  { code: 'MATH', name: 'Mathematics' },
  { code: 'CSD', name: '公民與社會發展' }
];

const seedSubject = (userId, code, name, i) => {
  const doc = {
    _id: id('s'),
    userId,
    code,
    name,
    category: 'core',
    targetLevel: 4,
    predictedLevel: null,
    examDate: null,
    sortOrder: i,
    createdAt: new Date()
  };
  data.subjects.set(doc._id, doc);
  return doc;
};

const store = {
  async findUserByEmail(email) {
    return [...data.users.values()].find((u) => u.emailLower === email.toLowerCase()) || null;
  },

  async createUser({ name, email, password }) {
    const recoveryCode = `PREVIEW-${id('c').toUpperCase()}`;
    const user = {
      _id: id('u'),
      name,
      email,
      emailLower: email.toLowerCase(),
      pw: hashPassword(password),
      recovery: hashPassword(recoveryCode),
      examDate: '2027-04-06',
      resultsDate: '2027-07-14',
      dailyGoalMinutes: 120,
      theme: 'system',
      createdAt: new Date()
    };
    data.users.set(user._id, user);
    CORE.forEach((c, i) => seedSubject(user._id, c.code, c.name, i));
    return { user, recoveryCode };
  },

  async createSession(userId) {
    const token = `${userId}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
    data.sessions.set(token, { userId, expiresAt: new Date(Date.now() + 30 * 86400000) });
    return { token, secure: true };
  },

  async currentUser(headers) {
    const raw = headers.get('cookie') || '';
    const match = raw.match(/dse_session=([^;]+)/);
    if (!match) return null;
    const session = data.sessions.get(decodeURIComponent(match[1]));
    if (!session) return null;
    const user = data.users.get(session.userId);
    if (!user) return null;
    return { user, session: { _id: 'preview-session' } };
  },

  async destroySession(headers) {
    const raw = headers.get('cookie') || '';
    const match = raw.match(/dse_session=([^;]+)/);
    if (match) data.sessions.delete(decodeURIComponent(match[1]));
  },

  async destroyOtherSessions() {},

  async updateUser(userId, patch) {
    const user = data.users.get(userId);
    Object.assign(user, patch);
    return user;
  },

  async setPassword(userId, password) {
    data.users.get(userId).pw = hashPassword(password);
  },

  async rotateRecovery() {
    const next = `PREVIEW-${id('c').toUpperCase()}`;
    const user = [...data.users.values()].find((u) => u.recovery);
    if (user) user.recovery = hashPassword(next);
    return next;
  },

  async deleteAccount(userId) {
    data.users.delete(userId);
    for (const [token, session] of data.sessions) if (session.userId === userId) data.sessions.delete(token);
    for (const table of ['subjects', 'pastPapers', 'studyLogs', 'sbaTasks', 'errorLogs']) {
      for (const [key, doc] of data[table]) if (doc.userId === userId) data[table].delete(key);
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
    const sorted = (table, key = 'createdAt') =>
      byUser(table, userId).sort((a, b) => String(a[key] || '').localeCompare(String(b[key] || '')));

    return {
      user: { id: _id, ...safeUser },
      subjects: byUser('subjects', userId)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map(shape),
      papers: sorted('pastPapers').map(shape),
      logs: sorted('studyLogs').map(shape),
      tasks: sorted('sbaTasks').map(shape),
      errors: sorted('errorLogs').map(shape)
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
    for (const table of ['pastPapers', 'studyLogs', 'sbaTasks', 'errorLogs']) {
      for (const [key, doc] of data[table]) {
        if (doc.userId === userId && doc.subjectId === subjectId) data[table].delete(key);
      }
    }
  },

  async savePaper(userId, input) {
    const existing = byUser('pastPapers', userId).find(
      (p) => p.subjectId === input.subjectId && p.year === input.year && p.paper === input.paper
    );
    if (existing) {
      Object.assign(existing, input, { attemptedAt: new Date() });
      return;
    }
    const doc = { _id: id('p'), userId, ...input, attemptedAt: new Date() };
    data.pastPapers.set(doc._id, doc);
  },

  async patchPaper(userId, paperId, patch) {
    const doc = findOwned('pastPapers', userId, paperId);
    if (!doc) return false;
    Object.assign(doc, patch);
    return true;
  },

  async removePaper(userId, paperId) {
    if (findOwned('pastPapers', userId, paperId)) data.pastPapers.delete(paperId);
  },

  async addLog(userId, input) {
    const doc = { _id: id('l'), userId, ...input };
    data.studyLogs.set(doc._id, doc);
    return doc;
  },

  async clearLogsSince(userId, days) {
    const cutoff = Date.now() - days * 86400000;
    for (const [key, doc] of data.studyLogs) {
      if (doc.userId === userId && new Date(doc.completedAt).getTime() >= cutoff) data.studyLogs.delete(key);
    }
  },

  async addTask(userId, input) {
    const doc = { _id: id('t'), userId, status: 'todo', createdAt: new Date(), ...input };
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
    const doc = { _id: id('e'), userId, createdAt: new Date(), ...input };
    data.errorLogs.set(doc._id, doc);
    return doc;
  },

  async removeError(userId, errorId) {
    if (findOwned('errorLogs', userId, errorId)) data.errorLogs.delete(errorId);
  }
};

export default store;
