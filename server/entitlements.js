/**
 * Plans and entitlements.
 *
 * One rule decided everything here: **a gate is only real if it withholds
 * data.** The whole workspace arrives in a single `GET /me` response, so a lock
 * drawn in CSS is bypassed by anyone who opens DevTools. Therefore:
 *
 *   - Everything a free student can already do stays free, and stays complete.
 *     Their marks, their matrix, their export. Nothing is taken away and made
 *     worse to sell back.
 *   - Paid features are *computed on the server* and simply not computed for a
 *     free plan. There is no payload for a client-side toggle to reveal.
 *
 * A feature that cannot be withheld this way is not gated at all. "What-if"
 * target levels are derived from the published cut-offs, which every student can
 * read directly, so pretending to sell them would be theatre.
 */

/* ------------------------------- the plans -------------------------------- */

export const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    features: []
  },
  pass: {
    id: 'pass',
    name: 'Exam pass',
    // A single warm window rather than a subscription: DSE preparation is a
    // season, and a monthly plan that outlives the exam is a bad deal for a
    // student who will stop opening the app in May.
    features: ['pacing', 'diagnostics', 'import']
  }
};

/**
 * Every gateable feature, with a plain description for the locked card.
 * `why` is written for a student deciding whether to care, not for a marketer.
 */
export const FEATURES = {
  pacing: {
    id: 'pacing',
    name: 'Revision pacing',
    summary: 'A week-by-week plan built backwards from your first paper and your SBA deadlines.',
    detail:
      'Works out how many weeks are left, how many papers that implies, and what to touch this week — adjusted for the subjects you have logged least.'
  },
  diagnostics: {
    id: 'diagnostics',
    name: 'Weak-topic diagnostics',
    summary: 'Which mistake types keep costing you marks, and in which subjects.',
    detail:
      'Groups the red-ink log by kind of error and by subject, so “careless” and “concept gap” stop looking like the same problem. Needs at least a few entries to say anything useful.'
  },
  import: {
    id: 'import',
    name: 'Bulk import',
    summary: 'Load a term of school marks from a CSV instead of typing each paper.',
    detail: 'Useful when you already have marks in a spreadsheet from a mock series or a tutorial centre.'
  }
};

const FEATURE_IDS = Object.keys(FEATURES);

/* ------------------------------- resolution ------------------------------- */

/**
 * The plan a user is on right now.
 *
 * A pass carries `planUntil`. An expired pass falls back to free rather than
 * leaving a student with features they stopped paying for — but the free plan
 * still has every mark, so nothing is lost except the extra views.
 */
export function planOf(user, now = new Date()) {
  if (!user) return 'free';
  const declared = PLANS[user.plan] ? user.plan : 'free';
  if (declared === 'free') return 'free';

  if (user.planUntil) {
    const until = new Date(user.planUntil);
    if (Number.isNaN(until.getTime())) return 'free';
    if (until.getTime() <= now.getTime()) return 'free';
  }
  return declared;
}

/** True when a user's plan includes a feature. */
export function hasFeature(user, feature, now = new Date()) {
  const plan = PLANS[planOf(user, now)];
  return Boolean(plan && plan.features.includes(feature));
}

/**
 * What the client is told about its own plan.
 *
 * Deliberately includes the full feature catalogue, locked ones labelled, so the
 * app can show an honest "what this does" card instead of a bare padlock. It
 * carries no entitlement check the client could flip: flipping it would only
 * change what the UI draws, and the endpoints still refuse.
 */
export function entitlementsFor(user, now = new Date()) {
  const plan = planOf(user, now);
  const active = PLANS[plan];
  return {
    plan,
    name: active.name,
    until: planOf(user, now) === 'free' ? null : user.planUntil || null,
    features: FEATURE_IDS.map((id) => ({
      ...FEATURES[id],
      unlocked: active.features.includes(id)
    })),
    // Export is listed so the promise is visible in the UI, not just in a doc.
    alwaysFree: ['marks', 'matrix', 'export', 'widgets']
  };
}

/** 402 with a body the client can render as a locked card. */
export function lockedResponse(feature) {
  const meta = FEATURES[feature] || { name: 'This feature' };
  return {
    error: `${meta.name} is part of the exam pass.`,
    locked: true,
    feature
  };
}

/* -------------------------------- pacing ---------------------------------- */

/**
 * A week-by-week revision plan.
 *
 * Deliberately arithmetic rather than clever: a student can check it by hand,
 * which matters more for a high-stakes plan than an opaque score would. It
 * divides the weeks left by the papers not yet attempted, then names this
 * week's subjects — the ones with the most untouched papers.
 */
export function buildPacing({ user, subjects, papers, tasks, now = new Date() }) {
  const examAt = new Date(`${user.examDate || '2027-04-06'}T08:30:00+08:00`);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const msLeft = examAt - startOfToday;
  const daysLeft = Math.max(0, Math.floor(msLeft / 86400000));
  const weeksLeft = Math.max(1, Math.ceil(daysLeft / 7));

  const attempted = new Set(papers.map((p) => `${p.subjectId}|${p.year}|${p.paper}`));

  // How many past papers each subject still has untouched, and how many weeks
  // that leaves per paper. Capped at the matrix's own 15-year window.
  const untouched = subjects.map((s) => {
    const cols = papersFor(s.code);
    const years = yearsFor(s);
    let total = 0;
    for (const y of years) {
      for (const p of cols) {
        if (!attempted.has(`${s.id}|${y}|${p}`)) total += 1;
      }
    }
    return { subject: s, untouched: total, perPaper: total ? weeksLeft / total : 0 };
  });

  // The subjects to touch this week: most untouched papers first, then the
  // ones with the least evidence, so a plan cannot fixate on one subject.
  const ranked = [...untouched].sort((a, b) => b.untouched - a.untouched);
  const thisWeek = ranked.slice(0, Math.min(3, ranked.length)).map((r) => ({
    subjectId: r.subject.id,
    name: r.subject.name,
    untouched: r.untouched,
    // One paper a week is a pace a student can actually keep alongside school.
    papersThisWeek: Math.min(2, Math.max(1, Math.ceil(r.untouched / weeksLeft)))
  }));

  const upcomingTasks = tasks
    .filter((t) => t.status !== 'done' && t.dueDate)
    .filter((t) => new Date(`${t.dueDate}T00:00:00`) >= startOfToday)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    .slice(0, 5)
    .map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate,
      days: Math.max(0, Math.floor((new Date(`${t.dueDate}T00:00:00`) - startOfToday) / 86400000))
    }));

  return {
    examDate: user.examDate || '2027-04-06',
    daysLeft,
    weeksLeft,
    totalUntouched: untouched.reduce((a, s) => a + s.untouched, 0),
    thisWeek,
    subjects: untouched.map((u) => ({
      subjectId: u.subject.id,
      name: u.subject.name,
      untouched: u.untouched,
      papersPerWeek: u.untouched ? Math.round(u.perPaper * 10) / 10 : 0
    })),
    tasks: upcomingTasks,
    // Said out loud so the plan is not mistaken for a guarantee.
    note: 'A pace, not a promise. Weeks assume one sitting of each paper and no revision of the ones you have done.'
  };
}

/* ------------------------------- diagnostics ------------------------------ */

const ERROR_KINDS = ['concept', 'careless', 'time', 'misread', 'technique'];

/**
 * What the red-ink log is telling a student.
 *
 * Only counts and shares — no interpretation beyond "this kind is most of your
 * log". Deliberately refuses to speak from a tiny sample, because a confident
 * diagnosis drawn from two entries would be worse than silence.
 */
export function buildDiagnostics({ subjects, errors }) {
  const byKind = ERROR_KINDS.map((kind) => ({
    kind,
    count: errors.filter((e) => e.errorType === kind).length
  })).sort((a, b) => b.count - a.count);

  const bySubject = subjects
    .map((s) => ({
      subjectId: s.id,
      name: s.name,
      count: errors.filter((e) => e.subjectId === s.id).length
    }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);

  const total = errors.length;
  const enough = total >= 4;

  return {
    total,
    // Stated explicitly so the UI can show "not enough yet" rather than a chart
    // built from a handful of entries.
    enough,
    byKind: byKind.filter((k) => k.count > 0),
    bySubject,
    topKind: enough && byKind[0].count ? byKind[0] : null,
    note: enough
      ? 'Grouped from your red-ink log. The count is what you wrote down, not every mark you lost.'
      : `Add ${4 - total} more ${total === 3 ? 'entry' : 'entries'} before a pattern is worth reading.`
  };
}

/* --------------------------------- helpers -------------------------------- */

// Kept local so this module has no import cycle with the paper rules.
const SUBJECT_PAPERS = {
  CHIN: ['P1', 'P2'],
  ENG: ['P1', 'P2', 'P3', 'P4'],
  MATH: ['P1', 'P2'],
  M1: ['P1'],
  M2: ['P1'],
  CSD: ['P1']
};
const papersFor = (code) => SUBJECT_PAPERS[code] || ['P1', 'P2'];

/** The 15 sittings the matrix shows, newest first. */
const yearsFor = (subject) => {
  const latest = 2026;
  const first = subject?.code === 'CSD' ? 2024 : 2012;
  const out = [];
  for (let y = latest; y >= first; y--) out.push(y);
  return out;
};
