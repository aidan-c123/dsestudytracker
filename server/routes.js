import {
  text, validEmail, validPassword, level, numOrNull, dateOrNull, percentageOf, catalogEntry,
  LIMITS, sessionCookie, clearCookie, verifyPassword as verifyHash,
  attainment, usesAttainment, CSD_CODE, CSD_FIRST_YEAR, otherSource, paperRetired, gradeBands
} from './util.js';

/* --------------------------------- responses ------------------------------ */

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
  });

const fail = (message, status = 400) => json({ error: message }, status);

/* ---------------------------------- router -------------------------------- */

export async function handleApi(request, path, injectedStore) {
  // Loaded lazily so the route logic can be tested without the Mongo driver.
  const store = injectedStore || (await import('./store.js'));
  const method = request.method.toUpperCase();
  const secure = true; // Vercel terminates TLS; cookies are always Secure in production.
  const headers = request.headers;

  if (!['GET', 'HEAD'].includes(method)) {
    const origin = headers.get('origin');
    if (origin) {
      let expectedHost = headers.get('x-forwarded-host') || headers.get('host');
      if (!expectedHost) {
        try {
          expectedHost = new URL(request.url).host;
        } catch {
          expectedHost = null;
        }
      }
      try {
        if (new URL(origin).host !== expectedHost) return fail('Cross-origin request blocked.', 403);
      } catch {
        return fail('Bad origin.', 403);
      }
    }
    if (method !== 'DELETE') {
      const type = headers.get('content-type') || '';
      if (!type.includes('application/json')) return fail('Expected a JSON body.', 415);
    }
  }

  // A DELETE carries no body by convention, but the app sends the cell so a
  // stale row id still deletes the right cell. Read it when it is there.
  const body =
    method === 'DELETE'
      ? await request.json().catch(() => null)
      : ['POST', 'PATCH', 'PUT'].includes(method)
        ? await request.json().catch(() => null)
        : null;
  if (['POST', 'PATCH', 'PUT'].includes(method) && (!body || typeof body !== 'object')) {
    return fail('Malformed request body.', 400);
  }

  try {
    /* -------------------------------- health ------------------------------- */

    if (path === '/health' && method === 'GET') {
      // Deliberately does not touch the database, so it isolates "is the
      // function deployed?" from "is Atlas reachable?".
      return json({
        ok: true,
        function: 'running',
        database: process.env.MONGODB_URI ? 'configured' : 'missing MONGODB_URI',
        time: new Date().toISOString()
      });
    }

    /* ------------------------------- public -------------------------------- */

    if (path === '/auth/register' && method === 'POST') {
      const email = validEmail(body.email);
      if (!email) return fail('Enter a valid email address.');
      if (!validPassword(body.password)) return fail('Password must be at least 8 characters.');
      const name = text(body.name, 60);
      if (!name) return fail('Tell us your name.');

      const existing = await store.findUserByEmail(email);
      if (existing) return fail('An account with that email already exists.', 409);

      const { user, recoveryCode } = await store.createUser({ name, email, password: body.password });
      const session = await store.createSession(String(user._id), secure);
      return json({ ok: true, recoveryCode }, 201, {
        'set-cookie': sessionCookie(session.token, secure)
      });
    }

    if (path === '/auth/login' && method === 'POST') {
      const email = validEmail(body.email);
      const password = typeof body.password === 'string' ? body.password : '';
      if (!email || !password) return fail('Enter your email and password.');
      const user = await store.findUserByEmail(email);
      const ok = user ? verifyHash(password, user.pw) : false;
      if (!ok) return fail('Email or password is incorrect.', 401);
      const session = await store.createSession(String(user._id), secure);
      return json({ ok: true }, 200, { 'set-cookie': sessionCookie(session.token, secure) });
    }

    if (path === '/auth/recover' && method === 'POST') {
      const email = validEmail(body.email);
      const code = text(body.recoveryCode, 32).toUpperCase();
      if (!email || !code) return fail('Enter your email and recovery code.');
      if (!validPassword(body.password)) return fail('New password must be at least 8 characters.');

      const user = await store.findUserByEmail(email);
      if (!user || !verifyHash(code, user.recovery)) {
        return fail('That recovery code does not match this account.', 401);
      }
      await store.setPassword(String(user._id), body.password);
      const rotated = await store.rotateRecovery(String(user._id));
      await store.destroyOtherSessions(String(user._id));
      const session = await store.createSession(String(user._id), secure);
      return json({ ok: true, recoveryCode: rotated }, 200, {
        'set-cookie': sessionCookie(session.token, secure)
      });
    }

    if (path === '/auth/logout' && method === 'POST') {
      await store.destroySession(headers);
      return json({ ok: true }, 200, { 'set-cookie': clearCookie(secure) });
    }

    /* ------------------------------- authed -------------------------------- */

    const auth = await store.currentUser(headers);
    if (!auth) return fail('Not signed in.', 401);
    const userId = String(auth.user._id);

    if (path === '/me' && method === 'GET') {
      return json(await store.loadWorkspace(auth.user));
    }

    if (path === '/me' && method === 'PATCH') {
      const patch = {};
      if (body.name !== undefined) {
        const name = text(body.name, 60);
        if (!name) return fail('Name cannot be empty.');
        patch.name = name;
      }
      if (body.examDate !== undefined) {
        const d = dateOrNull(body.examDate);
        if (!d) return fail('Exam date must be a valid date.');
        patch.examDate = d;
      }
      if (body.resultsDate !== undefined) {
        const d = dateOrNull(body.resultsDate);
        if (!d) return fail('Results date must be a valid date.');
        patch.resultsDate = d;
      }
      if (body.dailyGoalMinutes !== undefined) {
        const n = Number(body.dailyGoalMinutes);
        if (!Number.isFinite(n)) return fail('Daily goal must be a number.');
        patch.dailyGoalMinutes = Math.min(720, Math.max(10, Math.round(n)));
      }
      if (body.theme !== undefined) {
        if (!['system', 'light', 'dark'].includes(body.theme)) return fail('Unknown theme.');
        patch.theme = body.theme;
      }
      if (!Object.keys(patch).length) return fail('Nothing to update.');
      const updated = await store.updateUser(userId, patch);
      return json(await store.loadWorkspace(updated));
    }

    if (path === '/password' && method === 'POST') {
      if (!validPassword(body.newPassword)) return fail('New password must be at least 8 characters.');
      if (!verifyHash(String(body.currentPassword || ''), auth.user.pw)) {
        return fail('Current password is incorrect.', 401);
      }
      await store.setPassword(userId, body.newPassword);
      await store.destroyOtherSessions(userId, auth.session._id);
      return json({ ok: true });
    }

    if (path === '/account' && method === 'DELETE') {
      await store.deleteAccount(userId);
      return json({ ok: true }, 200, { 'set-cookie': clearCookie(secure) });
    }

    /* ------------------------------ subjects ------------------------------- */

    if (path === '/subjects' && method === 'POST') {
      const entry = catalogEntry(body.code);
      const name = entry ? entry.name : text(body.name, 60);
      if (!name) return fail('Give the subject a name.');
      const category = ['core', 'elective', 'extended'].includes(body.category)
        ? body.category
        : entry?.category || 'elective';
      const code = entry ? String(body.code).toUpperCase() : text(body.code, 12).toUpperCase();
      const csd = usesAttainment({ code });
      const marked = attainment(body.attainment);
      if (body.attainment !== undefined && body.attainment !== null && body.attainment !== '' && !marked) {
        return fail('Choose Attained or Not attained.');
      }
      const bands = gradeBands(body.gradeBands);
      if (body.gradeBands != null && !bands) {
        return fail('Grade bands must be percentages from 1 to 99, climbing with each level.');
      }

      await store.addSubject(userId, {
        code,
        name,
        category,
        targetLevel: csd ? null : level(body.targetLevel) ?? 4,
        predictedLevel: csd ? null : level(body.predictedLevel),
        attainment: csd ? marked : null,
        examDate: dateOrNull(body.examDate),
        gradeBands: csd ? null : bands
      });
      return json(await store.loadWorkspace(auth.user), 201);
    }

    const subjectMatch = path.match(/^\/subjects\/([\w-]+)$/);
    if (subjectMatch && (method === 'PATCH' || method === 'DELETE')) {
      const owned = await store.ownedSubject(userId, subjectMatch[1]);
      if (!owned) return fail('Subject not found.', 404);

      if (method === 'DELETE') {
        await store.removeSubject(userId, subjectMatch[1]);
        return json(await store.loadWorkspace(auth.user));
      }

      const csd = usesAttainment(owned);
      const patch = {};
      if (body.name !== undefined) {
        const name = text(body.name, 60);
        if (!name) return fail('Name cannot be empty.');
        patch.name = name;
      }
      if (body.targetLevel !== undefined) patch.targetLevel = csd ? null : level(body.targetLevel) ?? 4;
      if (body.predictedLevel !== undefined) patch.predictedLevel = csd ? null : level(body.predictedLevel);
      if (body.attainment !== undefined) {
        const marked = attainment(body.attainment);
        if (body.attainment !== null && body.attainment !== '' && !marked) {
          return fail('Choose Attained or Not attained.');
        }
        patch.attainment = marked;
      }
      if (body.examDate !== undefined) patch.examDate = dateOrNull(body.examDate);
      if (body.gradeBands !== undefined) {
        const bands = gradeBands(body.gradeBands);
        if (body.gradeBands !== null && !bands) {
          return fail('Grade bands must be percentages from 1 to 99, climbing with each level.');
        }
        patch.gradeBands = csd ? null : bands;
      }
      if (body.sortOrder !== undefined) patch.sortOrder = Math.round(Number(body.sortOrder) || 0);
      if (!Object.keys(patch).length) return fail('Nothing to update.');

      await store.patchSubject(userId, subjectMatch[1], patch);
      return json(await store.loadWorkspace(auth.user));
    }

    /* ----------------------------- past papers ----------------------------- */

    /**
     * Shared validation for logging a past paper, used by POST and by the
     * recovery path of PATCH. Returns `{ error, status }` or `{ input }`.
     */
    const validateAttempt = async (body) => {
      const subject = await store.ownedSubject(userId, text(body.subjectId, 40));
      if (!subject) return { error: 'Pick one of your own subjects.', status: 403 };

      // CSD is graded Attained / Unattained and was first examined in 2024.
      const csd = usesAttainment(subject);
      const earliest = csd ? CSD_FIRST_YEAR : 2012;
      const year = Math.round(Number(body.year));
      if (!(year >= earliest && year <= 2035)) {
        return { error: `Year must be between ${earliest} and 2035 for this subject.` };
      }
      const paper = text(body.paper, 40);
      if (!paper) return { error: 'Choose a paper.' };
      if (csd && paper !== 'P1') return { error: 'CSD has a single paper: Paper 1.' };
      if (!csd && paperRetired(subject.code, year, paper)) {
        return {
          error: `Chinese has no ${paper} from 2024 onwards — Papers 3 and 4 were abolished in the 2024 reform. Use the year you sat it, or log it as an Other paper.`
        };
      }

      const score = numOrNull(body.score);
      const maxScore = numOrNull(body.maxScore);
      if (score !== null && score < 0) return { error: 'Scores cannot be negative.' };
      if (maxScore !== null && maxScore <= 0) return { error: 'Total marks must be greater than zero.' };

      const marked = attainment(body.attainment);
      if (body.attainment !== undefined && body.attainment !== null && body.attainment !== '' && !marked) {
        return { error: 'Choose Attained or Not attained.' };
      }

      // An attempt must carry something to grade it. Blank rows used to be
      // written here, which left a matrix cell looking "logged" with no score
      // and made deletion look like it had only stored a null.
      const pctValue = percentageOf(score, maxScore, body.percentage);
      const levelValue = csd ? null : level(body.estimatedLevel);
      const attainmentValue = csd ? marked : null;
      if (pctValue === null && levelValue === null && attainmentValue === null) {
        return { error: 'Add a score or a grade before saving this attempt.' };
      }

      return {
        input: {
          subjectId: text(body.subjectId, 40),
          year,
          paper,
          score,
          maxScore,
          percentage: pctValue,
          // Levels never apply to CSD, attainment never applies to a levelled subject.
          estimatedLevel: levelValue,
          attainment: attainmentValue,
          notes: text(body.notes, LIMITS.text)
        }
      };
    };

    if (path === '/papers' && method === 'POST') {
      const checked = await validateAttempt(body);
      if (checked.error) return fail(checked.error, checked.status || 400);
      await store.savePaper(userId, checked.input);
      return json(await store.loadWorkspace(auth.user), 201);
    }

    const paperMatch = path.match(/^\/papers\/([\w-]+)$/);
    if (paperMatch && method === 'PATCH') {
      const ok = await store.patchPaper(userId, paperMatch[1], {
        score: numOrNull(body.score),
        maxScore: numOrNull(body.maxScore),
        percentage: percentageOf(numOrNull(body.score), numOrNull(body.maxScore), body.percentage),
        estimatedLevel: level(body.estimatedLevel),
        attainment: attainment(body.attainment),
        notes: text(body.notes, LIMITS.text)
      });

      if (ok) return json(await store.loadWorkspace(auth.user));

      // The id can be stale: the row was replaced by the matrix upsert, removed
      // in another tab, or the database was rebuilt. The dialog always sends
      // the cell it is editing, so write that cell instead of losing the save.
      // A foreign id still fails, because its subject is not owned by the caller.
      const checked = await validateAttempt(body);
      if (checked.error) return fail('Paper log not found.', 404);
      await store.savePaper(userId, checked.input);
      return json(await store.loadWorkspace(auth.user));
    }

    if (paperMatch && method === 'DELETE') {
      // Send the cell as well as the id. The stored id can be stale — the
      // matrix upserts a cell, which can replace the row the browser last saw —
      // and deleting nothing used to answer "ok" while the grade stayed on
      // screen. If the id is unknown, remove by cell; if that also finds
      // nothing, say so instead of pretending it worked.
      const cell = {
        subjectId: text(body?.subjectId, 40),
        year: body?.year === undefined ? null : Number(body.year),
        paper: text(body?.paper, 20)
      };
      let removed = await store.removePaper(userId, paperMatch[1]);
      if (!removed && cell.subjectId && Number.isFinite(cell.year) && cell.paper) {
        const owned = await store.ownedSubject(userId, cell.subjectId);
        if (owned) removed = await store.removePaperCell(userId, cell);
      }
      if (!removed) return fail('That attempt is already gone. Reload to refresh the page.', 404);
      return json(await store.loadWorkspace(auth.user));
    }

    /* --------------------------- other papers ------------------------------
     * Your school's mock, other schools' papers, tutorial centre and publisher
     * mocks, textbook questions and practice papers. Kept out of the DSE matrix
     * so the matrix stays a truthful record of actual past papers, but still
     * counted in the average and prediction.
     */

    if (path === '/other-papers' && method === 'POST') {
      const subject = await store.ownedSubject(userId, text(body.subjectId, 40));
      if (!subject) return fail('Pick one of your own subjects.', 403);

      const title = text(body.title, 120);
      if (!title) return fail('Give the paper a name.');

      const takenOn = dateOrNull(body.takenOn);
      if (!takenOn) return fail('Pick the date you sat it.');

      const score = numOrNull(body.score);
      const maxScore = numOrNull(body.maxScore);
      if (score !== null && score < 0) return fail('Scores cannot be negative.');
      if (maxScore !== null && maxScore <= 0) return fail('Total marks must be greater than zero.');

      const csd = usesAttainment(subject);
      const marked = attainment(body.attainment);
      if (!csd && body.attainment !== undefined && body.attainment !== null && body.attainment !== '' && !marked) {
        return fail('Choose Attained or Not attained.');
      }

      await store.addOtherPaper(userId, {
        subjectId: text(body.subjectId, 40),
        title,
        source: otherSource(body.source),
        takenOn,
        score,
        maxScore,
        percentage: percentageOf(score, maxScore, body.percentage),
        estimatedLevel: csd ? null : level(body.estimatedLevel),
        attainment: csd ? marked : null,
        notes: text(body.notes, LIMITS.text)
      });
      return json(await store.loadWorkspace(auth.user), 201);
    }

    const otherMatch = path.match(/^\/other-papers\/([\w-]+)$/);
    if (otherMatch && (method === 'PATCH' || method === 'DELETE')) {
      const owned = await store.ownedOtherPaper(userId, otherMatch[1]);
      if (!owned) return fail('Paper not found.', 404);

      if (method === 'DELETE') {
        await store.removeOtherPaper(userId, otherMatch[1]);
        return json(await store.loadWorkspace(auth.user));
      }

      const patch = {};
      if (body.title !== undefined) {
        const title = text(body.title, 120);
        if (!title) return fail('Title cannot be empty.');
        patch.title = title;
      }
      if (body.source !== undefined) patch.source = otherSource(body.source);
      if (body.takenOn !== undefined) {
        const takenOn = dateOrNull(body.takenOn);
        if (!takenOn) return fail('Pick the date you sat it.');
        patch.takenOn = takenOn;
      }
      if (body.score !== undefined) {
        const score = numOrNull(body.score);
        if (score !== null && score < 0) return fail('Scores cannot be negative.');
        patch.score = score;
      }
      if (body.maxScore !== undefined) {
        const maxScore = numOrNull(body.maxScore);
        if (maxScore !== null && maxScore <= 0) return fail('Total marks must be greater than zero.');
        patch.maxScore = maxScore;
      }
      if (body.notes !== undefined) patch.notes = text(body.notes, LIMITS.text);
      if (body.estimatedLevel !== undefined) {
        patch.estimatedLevel = usesAttainment(owned) ? null : level(body.estimatedLevel);
      }
      if (body.attainment !== undefined) {
        const marked = attainment(body.attainment);
        if (body.attainment !== null && body.attainment !== '' && !marked) {
          return fail('Choose Attained or Not attained.');
        }
        patch.attainment = usesAttainment(owned) ? marked : null;
      }
      if (body.score !== undefined || body.maxScore !== undefined || body.percentage !== undefined) {
        const score = body.score !== undefined ? patch.score : owned.score;
        const maxScore = body.maxScore !== undefined ? patch.maxScore : owned.maxScore;
        patch.percentage = percentageOf(score, maxScore, body.percentage);
      }
      if (!Object.keys(patch).length) return fail('Nothing to update.');

      await store.patchOtherPaper(userId, otherMatch[1], patch);
      return json(await store.loadWorkspace(auth.user));
    }

    /* ------------------------------ study logs ----------------------------- */

    if (path === '/logs' && method === 'POST') {
      const minutes = Math.round(Number(body.minutes));
      if (!(minutes >= 1 && minutes <= 1440)) return fail('Session length must be 1–1440 minutes.');
      const subjectId = text(body.subjectId, 40) || null;
      if (subjectId && !(await store.ownedSubject(userId, subjectId))) {
        return fail('Pick one of your own subjects.', 403);
      }
      const completedAt = body.completedAt ? new Date(body.completedAt) : new Date();
      if (Number.isNaN(completedAt.getTime())) return fail('That timestamp is not valid.');

      await store.addLog(userId, {
        subjectId,
        label: text(body.label, 80),
        minutes,
        mode: body.mode === 'break' ? 'break' : 'focus',
        completedAt
      });
      return json(await store.loadWorkspace(auth.user), 201);
    }

    if (path === '/logs' && method === 'DELETE') {
      const days = Math.min(365, Math.max(0, Number(body.days ?? 1)));
      await store.clearLogsSince(userId, days);
      return json(await store.loadWorkspace(auth.user));
    }

    /* ------------------------------- sba tasks ----------------------------- */

    if (path === '/tasks' && method === 'POST') {
      const title = text(body.title, 140);
      if (!title) return fail('Give the task a title.');
      const subjectId = text(body.subjectId, 40) || null;
      if (subjectId && !(await store.ownedSubject(userId, subjectId))) {
        return fail('Pick one of your own subjects.', 403);
      }
      const weight = numOrNull(body.weightPct);
      await store.addTask(userId, {
        subjectId,
        title,
        kind: ['sba', 'revision', 'mock', 'other'].includes(body.kind) ? body.kind : 'sba',
        dueDate: dateOrNull(body.dueDate),
        weightPct: weight === null ? null : Math.min(100, Math.max(0, weight)),
        notes: text(body.notes, LIMITS.text)
      });
      return json(await store.loadWorkspace(auth.user), 201);
    }

    const taskMatch = path.match(/^\/tasks\/([\w-]+)$/);
    if (taskMatch && method === 'PATCH') {
      const patch = {};
      if (body.status !== undefined) {
        if (!['todo', 'doing', 'done'].includes(body.status)) return fail('Unknown status.');
        patch.status = body.status;
      }
      if (body.title !== undefined) {
        const title = text(body.title, 140);
        if (!title) return fail('Title cannot be empty.');
        patch.title = title;
      }
      if (body.dueDate !== undefined) patch.dueDate = dateOrNull(body.dueDate);
      if (body.weightPct !== undefined) patch.weightPct = numOrNull(body.weightPct);
      if (body.notes !== undefined) patch.notes = text(body.notes, LIMITS.text);
      if (!Object.keys(patch).length) return fail('Nothing to update.');

      const ok = await store.patchTask(userId, taskMatch[1], patch);
      if (!ok) return fail('Task not found.', 404);
      return json(await store.loadWorkspace(auth.user));
    }

    if (taskMatch && method === 'DELETE') {
      await store.removeTask(userId, taskMatch[1]);
      return json(await store.loadWorkspace(auth.user));
    }

    /* ------------------------------ error logs ----------------------------- */

    if (path === '/errors' && method === 'POST') {
      const topic = text(body.topic, 120);
      if (!topic) return fail('Describe the topic or question.');
      const subjectId = text(body.subjectId, 40) || null;
      if (subjectId && !(await store.ownedSubject(userId, subjectId))) {
        return fail('Pick one of your own subjects.', 403);
      }
      await store.addError(userId, {
        subjectId,
        topic,
        questionRef: text(body.questionRef, 80),
        errorType: ['concept', 'careless', 'time', 'misread', 'technique'].includes(body.errorType)
          ? body.errorType
          : 'concept',
        note: text(body.note, LIMITS.text)
      });
      return json(await store.loadWorkspace(auth.user), 201);
    }

    const errorMatch = path.match(/^\/errors\/([\w-]+)$/);
    if (errorMatch && method === 'DELETE') {
      await store.removeError(userId, errorMatch[1]);
      return json(await store.loadWorkspace(auth.user));
    }

    return fail('Not found.', 404);
  } catch (error) {
    console.error('api_error', path, error?.message);
    if (String(error?.message || '').includes('MONGODB_URI')) {
      return fail('The database is not configured yet. Add MONGODB_URI in your host settings.', 503);
    }
    if (error?.code === 11000) return fail('That record already exists.', 409);
    return fail('Something went wrong on the server. Please try again.', 500);
  }
}
