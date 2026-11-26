import {
  text, validEmail, validPassword, level, numOrNull, dateOrNull, percentageOf, catalogEntry,
  LIMITS, sessionCookie, clearCookie, verifyPassword as verifyHash
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

  const body =
    ['POST', 'PATCH', 'PUT'].includes(method) ? await request.json().catch(() => null) : null;
  if (['POST', 'PATCH', 'PUT'].includes(method) && (!body || typeof body !== 'object')) {
    return fail('Malformed request body.', 400);
  }

  try {
<<<<<<< HEAD
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

=======
>>>>>>> main
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

      await store.addSubject(userId, {
        code: entry ? String(body.code).toUpperCase() : text(body.code, 12).toUpperCase(),
        name,
        category,
        targetLevel: level(body.targetLevel) ?? 4,
        predictedLevel: level(body.predictedLevel),
        examDate: dateOrNull(body.examDate)
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

      const patch = {};
      if (body.name !== undefined) {
        const name = text(body.name, 60);
        if (!name) return fail('Name cannot be empty.');
        patch.name = name;
      }
      if (body.targetLevel !== undefined) patch.targetLevel = level(body.targetLevel) ?? 4;
      if (body.predictedLevel !== undefined) patch.predictedLevel = level(body.predictedLevel);
      if (body.examDate !== undefined) patch.examDate = dateOrNull(body.examDate);
      if (body.sortOrder !== undefined) patch.sortOrder = Math.round(Number(body.sortOrder) || 0);
      if (!Object.keys(patch).length) return fail('Nothing to update.');

      await store.patchSubject(userId, subjectMatch[1], patch);
      return json(await store.loadWorkspace(auth.user));
    }

    /* ----------------------------- past papers ----------------------------- */

    if (path === '/papers' && method === 'POST') {
      if (!(await store.ownedSubject(userId, text(body.subjectId, 40)))) {
        return fail('Pick one of your own subjects.', 403);
      }
      const year = Math.round(Number(body.year));
      if (!(year >= 2012 && year <= 2035)) return fail('Year must be between 2012 and 2035.');
      const paper = text(body.paper, 40);
      if (!paper) return fail('Choose a paper.');

      const score = numOrNull(body.score);
      const maxScore = numOrNull(body.maxScore);
      if (score !== null && score < 0) return fail('Scores cannot be negative.');
      if (maxScore !== null && maxScore <= 0) return fail('Total marks must be greater than zero.');

      await store.savePaper(userId, {
        subjectId: text(body.subjectId, 40),
        year,
        paper,
        score,
        maxScore,
        percentage: percentageOf(score, maxScore, body.percentage),
        estimatedLevel: level(body.estimatedLevel),
        notes: text(body.notes, LIMITS.text)
      });
      return json(await store.loadWorkspace(auth.user), 201);
    }

    const paperMatch = path.match(/^\/papers\/([\w-]+)$/);
    if (paperMatch && method === 'PATCH') {
      const score = numOrNull(body.score);
      const maxScore = numOrNull(body.maxScore);
      const ok = await store.patchPaper(userId, paperMatch[1], {
        score,
        maxScore,
        percentage: percentageOf(score, maxScore, body.percentage),
        estimatedLevel: level(body.estimatedLevel),
        notes: text(body.notes, LIMITS.text)
      });
      if (!ok) return fail('Paper log not found.', 404);
      return json(await store.loadWorkspace(auth.user));
    }

    if (paperMatch && method === 'DELETE') {
      await store.removePaper(userId, paperMatch[1]);
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
