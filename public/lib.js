/* ============================================================
   Shared: icons, formatting, data selectors, API, theme, modal
   ============================================================ */

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

import { cutoffBands, cutoffBandsForYear, paperBands } from './cutoffs.js';

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const ICONS = {
  desk: '<path d="M3 10.6 12 3.4l9 7.2"/><path d="M5.3 9.4V20.6h13.4V9.4"/><path d="M9.6 20.6v-5.4h4.8v5.4"/>',
  papers: '<rect x="3.4" y="3.4" width="17.2" height="17.2" rx="2.4"/><path d="M3.4 9.2h17.2M9.2 9.2v11.4"/>',
  focus: '<circle cx="12" cy="13" r="8"/><path d="M12 9.4V13l2.6 1.7M9.4 2.6h5.2"/>',
  tasks: '<rect x="3.6" y="3.6" width="16.8" height="16.8" rx="3"/><path d="M8 12.2l2.6 2.6L16.4 8.8"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M4.5 12.5l5 5L19.5 7"/>',
  trash: '<path d="M4 7h16M9.5 7V4.6h5V7M6.4 7l1 13.4h9.2l1-13.4"/>',
  logout: '<path d="M15 8V5.6a1.6 1.6 0 0 0-1.6-1.6H5.6A1.6 1.6 0 0 0 4 5.6v12.8A1.6 1.6 0 0 0 5.6 20h7.8A1.6 1.6 0 0 0 15 18.4V16"/><path d="M10 12h11M18 8.6 21.4 12 18 15.4"/>',
  play: '<path d="M7 4.8 19 12 7 19.2z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  reset: '<path d="M4 10a8 8 0 1 1 2.4 7.6"/><path d="M4 4.6V10h5.4"/>',
  edit: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z"/>',
  arrow: '<path d="M5 12h13M13 6.6 18.4 12 13 17.4"/>',
  clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.4V12l3.2 2"/>',
  flame: '<path d="M12 3s5 4.2 5 9a5 5 0 0 1-10 0c0-2 1-3.4 1-3.4S9 11 10.4 11c1.5 0 1.4-2.2 1.4-2.2S12 6 12 3z"/>',
  moon: '<path d="M20 14.4A8.4 8.4 0 0 1 9.6 4a8.4 8.4 0 1 0 10.4 10.4z"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>',
  book: '<path d="M4 5.4A2.4 2.4 0 0 1 6.4 3H20v15.6H6.4A2.4 2.4 0 0 0 4 21z"/><path d="M4 18.6V5.4"/><path d="M8 7.6h8M8 11.2h5"/>',
  layers: '<path d="M12 3.2 3.6 7.6 12 12l8.4-4.4z"/><path d="m3.6 12.6 8.4 4.4 8.4-4.4"/><path d="m3.6 17.2 8.4 4.4 8.4-4.4"/>',
  pen: '<path d="M15.6 4.4a2.1 2.1 0 0 1 3 3L8.4 17.6 4.8 18.8l1.2-3.6z"/><path d="M14.2 5.8l3 3"/>'
};

export function icon(name, attrs = '') {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${attrs}>${ICONS[name] || ''}</svg>`;
}

/* ------------------------------- formatting ------------------------------- */

export const LEVEL_LABELS = { 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '5*', 7: '5**' };
export const lvlLabel = (n) => (n ? LEVEL_LABELS[n] || String(n) : '—');
export const lvlChip = (n) => `<span class="lvl lvl-${n || 0}">${lvlLabel(n)}</span>`;

/* --------------------------------- CSD ----------------------------------- */
/**
 * CSD was first examined in 2024 and HKEAA reports it only as
 * "Attained" / "Unattained". No levels, one paper, and no SBA.
 */
export const CSD_CODE = 'CSD';
export const CSD_FIRST_YEAR = 2024;
export const ATTAINMENT_LABELS = { attained: 'Attained', unattained: 'Not attained' };
export const usesAttainment = (subject) => String(subject?.code || '').toUpperCase() === CSD_CODE;
export const attainmentLabel = (value) => ATTAINMENT_LABELS[value] || '—';
export const attainmentChip = (value) =>
  value
    ? `<span class="attain ${value}">${attainmentLabel(value)}</span>`
    : '<span class="attain">—</span>';

/** Years a subject was actually examined, newest first. */
export const yearsFor = (subject) => {
  const first = usesAttainment(subject) ? CSD_FIRST_YEAR : 2012;
  const out = [];
  for (let y = 2026; y >= first; y--) out.push(y);
  return out;
};

/* ----------------------------- other papers ------------------------------ */

/**
 * Papers that are not DSE past papers. They stay out of the matrix so it
 * remains an honest record of real past papers, but they count towards the
 * average, because they are still evidence of where a student is.
 */
/* Kinds of paper that are not DSE past papers.
 *
 * The stored key is what matters: it is written into the database and must not
 * change, or every record already filed under it would start reading as
 * something else. The label beside it is only what the student sees, so the
 * wording can be improved without touching saved data. `tutorial` is new, and
 * older records simply never carry it. */
export const OTHER_SOURCES = {
  school: "My school's mock",
  'other-school': "Other schools' mock",
  tutorial: 'Tutorial centre / publisher mock',
  textbook: 'Textbook or exercise',
  practice: 'HKEAA practice paper',
  'other-board': 'Other exam board',
  other: 'Other'
};

export const otherSourceLabel = (key) => OTHER_SOURCES[key] || 'Other';

export const otherPapersOf = (subjectId) =>
  (state.data.otherPapers || []).filter((p) => p.subjectId === subjectId);

export const SUBJECT_CODES = {
  // From 2024 Chinese has only P1 (Reading, 40%) and P2 (Writing, 45%) plus
  // SBA. Papers 3 and 4 were abolished in the 2024 core-subject reform, so
  // they are no longer offered for new attempts.
  CHIN: ['P1', 'P2'],
  ENG: ['P1', 'P2', 'P3', 'P4'],
  MATH: ['P1', 'P2'],
  M1: ['P1'],
  M2: ['P1'],
  CSD: ['P1']
};
export const papersFor = (subject) => SUBJECT_CODES[subject?.code] || ['P1', 'P2'];

const PAPER_ORDER = ['P1', 'P2', 'P3', 'P4', 'P5', 'SBA'];
const paperRank = (paper) => {
  const i = PAPER_ORDER.indexOf(paper);
  return i === -1 ? PAPER_ORDER.length : i;
};

/**
 * Columns for the matrix: the papers a subject has today, plus any paper the
 * student already logged. That keeps pre-2024 Chinese Paper 3 records visible
 * after the reform, without offering Paper 3 for new attempts.
 */
export function matrixPapersFor(subject, logs = []) {
  const logged = logs.map((l) => l.paper).filter(Boolean);
  const all = [...new Set([...papersFor(subject), ...logged])];
  return all.sort((a, b) => paperRank(a) - paperRank(b));
}

/**
 * Papers actually sat in a given year. Chinese lost Paper 3 (Listening &
 * Integrated Skills) and Paper 4 (Speaking) from 2024, so an old sitting can
 * still be logged truthfully while a new one cannot claim a Paper 3.
 */
export function papersForYear(subject, year) {
  const code = String(subject?.code || '').toUpperCase();
  const y = Number(year);
  if (code === 'CHIN' && Number.isFinite(y) && y < 2024) return ['P1', 'P2', 'P3', 'P4'];
  return papersFor(subject);
}

export const YEARS = Array.from({ length: 15 }, (_, i) => 2026 - i);

export const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
export const dayKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
export const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
export const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  const target = startOfDay(new Date(`${dateStr.slice(0, 10)}T00:00:00`));
  return Math.round((target - startOfDay()) / 86400000);
};
export const fmtDate = (dateStr, opts = { day: 'numeric', month: 'short' }) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr.length <= 10 ? `${dateStr}T00:00:00` : dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', opts);
};
export const fmtDue = (dateStr) => {
  const n = daysUntil(dateStr);
  if (n === null) return { text: 'No date', cls: '' };
  if (n < 0) return { text: `${Math.abs(n)}d overdue`, cls: 'due-soon' };
  if (n === 0) return { text: 'Due today', cls: 'due-soon' };
  if (n === 1) return { text: 'Due tomorrow', cls: 'due-soon' };
  if (n <= 7) return { text: `${n} days left`, cls: 'due-soon' };
  return { text: `${fmtDate(dateStr)} · ${n}d`, cls: '' };
};
export const fmtMinutes = (m) => {
  const mins = Math.round(m || 0);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
};

/**
 * Minutes between two Date values, rounded to the nearest minute.
 * Returns null when either end is missing or the range runs backwards, so the
 * caller can say what is wrong instead of saving a negative session.
 */
export function minutesBetween(start, end) {
  const a = start instanceof Date ? start.getTime() : new Date(start).getTime();
  const b = end instanceof Date ? end.getTime() : new Date(end).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const diff = Math.round((b - a) / 60000);
  return diff > 0 ? diff : null;
}
export const pct = (n) => (Number.isFinite(n) ? `${Math.round(n)}%` : '—');
export const initials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || 'D';

/* ------------------------------- grade bands ------------------------------ */

/**
 * A neutral fallback for the few subjects the DSE00 tables do not cover.
 *
 * This is not an editable setting any more. A DSE paper's grade is decided by
 * the published boundaries for its subject and sitting, so the only role this
 * set plays is to keep a subject with no published rows usable at all. Where a
 * published figure exists it always wins.
 */
export const DEFAULT_BANDS = { 2: 35, 3: 45, 4: 55, 5: 65, 6: 75, 7: 85 };
export const BAND_LEVELS = [2, 3, 4, 5, 6, 7];

/** One-line HKEAA level descriptors, paraphrased for quick reading. */
export const LEVEL_DESCRIPTORS = {
  1: 'Just starting: recalls fragments, needs the question restated.',
  2: 'Basic: handles straightforward questions, shaky on unfamiliar material.',
  3: 'Solid: understands the core course, works through routine problems.',
  4: 'Strong: applies ideas to new contexts and explains reasoning clearly.',
  5: 'Very strong: accurate, well organised, selective use of evidence.',
  6: 'Excellent: consistently precise, notices what the examiner rewards.',
  7: 'Top band: full control of the paper, including the hardest discriminators.'
};

const bandCache = new Map();

/**
 * Bands are resolved from the published DSE figures for that subject, then the
 * neutral starting point. A student's own bands are no longer part of this:
 * the grade a DSE paper gets has to be the grade the DSE would have given, or
 * the prediction is just the student's opinion reflected back at them.
 *
 * Any `gradeBands` still stored on an old record is ignored on purpose. Those
 * rows were saved by an earlier version, and honouring them would keep grading
 * a paper against numbers that never came from the exam.
 */
export function bandsFor(subject) {
  const key = subject?.code || '';
  if (bandCache.has(key)) return bandCache.get(key);

  const resolved = { ...DEFAULT_BANDS };
  // The DSE00 tables describe the *latest* sitting, which is not necessarily
  // the sitting a paper belongs to. Older papers must keep the generic bands,
  // or a 2013 script would be graded against 2026 boundaries.
  const real = subject?.code ? cutoffBands(subject.code) : null;
  if (real) Object.assign(resolved, real);

  // Keep the bands monotonic even if the source's rounding collides.
  let previous = 0;
  for (const level of [2, 3, 4, 5, 6, 7]) {
    resolved[level] = Math.max(resolved[level], previous + 1);
    previous = resolved[level];
  }
  bandCache.set(key, resolved);
  return resolved;
}

/**
 * Bands for one particular sitting. Cached cut-offs are per-subject (a mean of
 * the last five years), so a year the student actually sat is worth reading
 * against its own boundaries when the source has them.
 */
export function bandsForYear(subject, year) {
  const numeric = Number(year);
  const historic = subject?.code ? cutoffBandsForYear(subject.code, numeric) : null;
  return historic ? { ...DEFAULT_BANDS, ...historic } : bandsFor(subject);
}

/**
 * Bands for one paper of one subject.
 *
 * Chinese and English publish a boundary per paper, and those numbers differ
 * a lot: a Chinese Paper 1 5** sits near 62% while Paper 2 sits near 70%.
 * Grading a Paper 1 script against the whole-subject blend overstates it, so
 * the paper's own boundaries win wherever the source publishes them. Subjects
 * without per-paper rows fall back to their subject-wide bands unchanged.
 */
export function bandsForPaper(subject, paper, year = null) {
  const code = subject?.code;
  if (!code || !paper) return bandsForYear(subject, year);
  const own = paperBands(code, paper);
  if (!own) return bandsForYear(subject, year);
  const resolved = { ...DEFAULT_BANDS, ...own };
  let previous = 0;
  for (const level of [2, 3, 4, 5, 6, 7]) {
    resolved[level] = Math.max(resolved[level], previous + 1);
    previous = resolved[level];
  }
  return resolved;
}

/**
 * Where a subject's bands came from, so the UI can say so instead of implying
 * every number is official. There is no "tuned" answer any more: bands are
 * always the published figures or the neutral fallback.
 */
export function bandsOrigin(subject, paper = null) {
  if (paper && subject?.code && paperBands(subject.code, paper)) return 'cutoff';
  if (subject?.code && cutoffBands(subject.code)) return 'cutoff';
  return 'default';
}

/** Cut-offs arrive after first paint, so drop cached bands when they land. */
export function resetBandCache() {
  bandCache.clear();
}

/**
 * Highest level a percentage reaches, against a set of bands handed in.
 *
 * Separate from `levelFromPercentage`, which looks the bands up itself, because
 * the log dialog grades an attempt against the boundaries for its own sitting.
 */
export function levelFromBands(p, bands) {
  if (!Number.isFinite(p) || !bands) return null;
  for (const lvl of [7, 6, 5, 4, 3, 2]) {
    if (Number.isFinite(bands[lvl]) && p >= bands[lvl]) return lvl;
  }
  return 1;
}

/** Highest level whose band the percentage reaches; 1 below the Level 2 band. */
export const levelFromPercentage = (p, subject = null) => {
  if (!Number.isFinite(p)) return null;
  return levelFromBands(p, bandsFor(subject));
};

/** Rough distance to the next band, for the "how close am I" hint. */
export function nextBand(p, subject = null) {
  if (!Number.isFinite(p)) return null;
  const level = levelFromPercentage(p, subject);
  if (level >= 7) return null;
  const bands = bandsFor(subject);
  const next = level + 1;
  return { level: next, need: Math.max(0, Math.ceil(bands[next] - p)) };
}

export const toLocalInput = (date = new Date()) => {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/* ---------------------------------- state --------------------------------- */

export const state = {
  data: null,
  view: 'desk',
  paperSubjectId: null,
  taskFilter: 'open',
  errorSubject: 'all',
  timerPresetMinutes: 25,
  timerSubject: null,
  // Derived views, computed on the server from the student's own records. Null
  // until loaded, which the Desk draws as a short "loading" note.
  pacing: null,
  diagnostics: null
};

/** Overlay containers live in index.html; create them if a page omits them. */
export function host(id) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    document.body.appendChild(el);
  }
  return el;
}

export const hooks = { renderView() {}, renderApp() {}, syncNav() {}, afterAuth() {} };

/* ----------------------------------- api ---------------------------------- */

export async function api(path, { method = 'GET', body } = {}) {
  // Single endpoint: the route travels in `__p` because plain Vercel `api/`
  // folders don't support bracket catch-all routes.
  const route = String(path || '/').replace(/^\/+/, '') || 'health';
  const res = await fetch(`/api?__p=${encodeURIComponent(route)}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!res.ok) {
    const error = new Error(data.error || `Request failed (${res.status}).`);
    error.status = res.status;
    throw error;
  }
  return data;
}

export async function refresh(data) {
  state.data = data?.user ? data : await api('/me');
  if (!state.data.subjects.some((s) => s.id === state.paperSubjectId)) {
    state.paperSubjectId = state.data.subjects[0]?.id || null;
  }
  hooks.renderView();
  hooks.syncNav();
}

/* -------------------------------- selectors ------------------------------- */

export const subjectById = (id) => state.data.subjects.find((s) => s.id === id) || null;
export const papersOf = (subjectId) => state.data.papers.filter((p) => p.subjectId === subjectId);
export const focusLogs = () => state.data.logs.filter((l) => l.mode === 'focus');

/**
 * Every marked attempt for a subject: DSE past papers plus mocks, textbooks
 * and practice papers. The matrix shows only the first kind, but predictions
 * and averages use both.
 */
export const evidenceOf = (subjectId) => [
  ...papersOf(subjectId),
  ...otherPapersOf(subjectId)
];

export function subjectPrediction(subject) {
  if (subject.predictedLevel) return { level: subject.predictedLevel, source: 'school' };
  // Most recent first: a mock from this month says more than a 2019 paper.
  const evidence = evidenceOf(subject.id)
    .slice()
    .sort((a, b) => recency(b) - recency(a));
  const withLevel = evidence.filter((p) => p.estimatedLevel);
  if (withLevel.length) {
    const recent = withLevel.slice(0, 4);
    return { level: Math.round(recent.reduce((a, p) => a + p.estimatedLevel, 0) / recent.length), source: 'papers' };
  }
  const withPct = evidence.filter((p) => Number.isFinite(p.percentage));
  if (!withPct.length) return { level: null, source: 'none' };
  const average = withPct.reduce((a, p) => a + p.percentage, 0) / withPct.length;
  return { level: levelFromPercentage(average, subject), source: 'pct', percentage: average };
}

/** Sortable timestamp for either kind of paper. */
const recency = (paper) => {
  const raw = paper.takenOn || paper.attemptedAt;
  const t = raw ? new Date(`${String(raw).slice(0, 10)}T00:00:00`).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
};

/**
 * CSD has no levels, so attainment is predicted separately: the most recent
 * marked attempt carries the call, falling back to the school's judgement.
 */
export function subjectAttainment(subject) {
  const marked = evidenceOf(subject.id)
    .filter((p) => p.attainment === 'attained' || p.attainment === 'unattained')
    .sort((a, b) => recency(b) - recency(a));
  if (marked.length) return { value: marked[0].attainment, source: 'papers' };
  if (subject.attainment) return { value: subject.attainment, source: 'school' };
  const avg = subjectPct(subject.id);
  if (avg === null) return { value: null, source: 'none' };
  // Attainment is a pass mark; a bare average is only a hint, not a prediction.
  return { value: avg >= 50 ? 'attained' : 'unattained', source: 'pct' };
}

export function subjectPct(subjectId) {
  const list = evidenceOf(subjectId).filter((p) => Number.isFinite(p.percentage));
  if (!list.length) return null;
  return Math.round((list.reduce((a, p) => a + p.percentage, 0) / list.length) * 10) / 10;
}

/** Average across DSE past papers only, so the matrix's own number stays pure. */
export function subjectDsePct(subjectId) {
  const list = papersOf(subjectId).filter((p) => Number.isFinite(p.percentage));
  if (!list.length) return null;
  return Math.round((list.reduce((a, p) => a + p.percentage, 0) / list.length) * 10) / 10;
}

export const minutesOnDay = (key) =>
  focusLogs().filter((l) => dayKey(l.completedAt) === key).reduce((a, l) => a + l.minutes, 0);

export function dailySeries(days = 14) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(new Date(), -i);
    const key = dayKey(d);
    out.push({
      key,
      label: d.toLocaleDateString('en-GB', { weekday: 'narrow' }),
      full: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      minutes: minutesOnDay(key)
    });
  }
  return out;
}

export function rangeMinutes(days) {
  const cutoff = addDays(new Date(), -(days - 1));
  cutoff.setHours(0, 0, 0, 0);
  return focusLogs().filter((l) => new Date(l.completedAt) >= cutoff).reduce((a, l) => a + l.minutes, 0);
}

export function distribution(days = 7) {
  const cutoff = addDays(new Date(), -(days - 1));
  cutoff.setHours(0, 0, 0, 0);
  const totals = new Map();
  for (const log of focusLogs()) {
    if (new Date(log.completedAt) < cutoff) continue;
    const key = log.subjectId || 'none';
    totals.set(key, (totals.get(key) || 0) + log.minutes);
  }
  const rows = [...totals.entries()]
    .map(([id, minutes]) => ({
      id,
      minutes,
      subject: id === 'none' ? { name: 'Untagged' } : subjectById(id) || { name: 'Removed subject' }
    }))
    .sort((a, b) => b.minutes - a.minutes);
  return { rows, total: rows.reduce((a, r) => a + r.minutes, 0) };
}

export function streak(goal) {
  const perDay = new Map();
  for (const log of focusLogs()) {
    const key = dayKey(log.completedAt);
    perDay.set(key, (perDay.get(key) || 0) + log.minutes);
  }
  let count = 0;
  let cursor = new Date();
  if ((perDay.get(dayKey(cursor)) || 0) < goal) cursor = addDays(cursor, -1);
  while ((perDay.get(dayKey(cursor)) || 0) >= goal) {
    count++;
    cursor = addDays(cursor, -1);
    if (count > 400) break;
  }
  return count;
}

/* -------------------------------- countdown ------------------------------- */

export function examMoment() {
  const date = state.data?.user.examDate || '2027-04-06';
  return new Date(`${date}T08:30:00+08:00`);
}

export function countdownParts() {
  const diff = examMoment() - Date.now();
  const c = Math.max(0, diff);
  return {
    past: diff <= 0,
    days: Math.floor(c / 86400000),
    hours: Math.floor((c % 86400000) / 3600000),
    minutes: Math.floor((c % 3600000) / 60000),
    seconds: Math.floor((c % 60000) / 1000)
  };
}

/* ---------------------------------- theme --------------------------------- */

const media = window.matchMedia('(prefers-color-scheme: dark)');

/** The theme actually on screen, resolving "system" through the device. */
export function effectiveTheme(theme = 'system') {
  // Guarded because server-side imports and tests may not have a matchMedia.
  if (theme !== 'system') return theme;
  return media && media.matches ? 'dark' : 'light';
}

export function applyTheme(theme = 'system') {
  const effective = effectiveTheme(theme);
  const root = document.documentElement;
  // Add the transition attribute only for the swap itself, so scrolling and
  // typing are never slowed down by a global colour transition.
  if (root.dataset.theme) {
    root.dataset.themeSwapping = '';
    window.setTimeout(() => delete root.dataset.themeSwapping, 200);
  }
  root.dataset.theme = effective;
  let meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = effective === 'dark' ? '#0d1210' : '#f8f6f1';
  // Remember the last painted theme so the next load can paint it before the
  // CSS runs, instead of flashing light first.
  try {
    localStorage.setItem('starshooter-theme', effective);
  } catch {
    /* private mode: the attribute above is enough */
  }
  // The toggle button shows what you will get, not what you are in.
  document.querySelectorAll('[data-theme-icon]').forEach((el) => {
    el.innerHTML = icon(effective === 'dark' ? 'sun' : 'moon');
  });
  // The Android shell paints its own system bars, so it needs to be told.
  window.dispatchEvent(new CustomEvent('starshooter:theme', { detail: effective }));
}

/** Flip between light and dark without a round-trip or a page rebuild. */
export function toggleTheme() {
  const next = effectiveTheme(state.data?.user?.theme || 'system') === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  if (state.data?.user) state.data.user.theme = next;
  return next;
}

media.addEventListener('change', () => {
  if ((state.data?.user?.theme || 'system') === 'system') applyTheme('system');
});

/* ---------------------------------- toast --------------------------------- */

export function toast(message, kind = '') {
  const layer = host('toast-root');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `<span class="grow">${esc(message)}</span>`;
  layer.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

/* ---------------------------------- modal --------------------------------- */

let modalCleanup = null;

export function openModal({ title, subtitle = '', body, wide = false, footer = '', onMount }) {
  closeModal();
  const layer = host('modal-root');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head">
        <div>
          <h2>${esc(title)}</h2>
          ${subtitle ? `<div class="card-note">${esc(subtitle)}</div>` : ''}
        </div>
        <button class="icon-btn" data-close type="button" aria-label="Close dialog">${icon('close')}</button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;
  layer.appendChild(backdrop);
  document.body.style.overflow = 'hidden';
  // Toasts normally sit at the bottom, which is where a phone sheet keeps its
  // action row. While a dialog is open they move to the top so a confirmation
  // cannot cover the buttons the student needs next.
  document.documentElement.dataset.modalOpen = 'yes';

  const onKey = (e) => {
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Tab') {
      const focusables = $$('button, input, select, textarea, a[href]', backdrop).filter(
        (el) => !el.disabled && el.offsetParent !== null
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) closeModal();
  });
  backdrop.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeModal();
  });
  modalCleanup = () => document.removeEventListener('keydown', onKey);
  if (onMount) onMount(backdrop);
  setTimeout(() => $('input:not([type=hidden]), select, textarea, button[type="submit"]', backdrop)?.focus(), 30);
}

export function closeModal() {
  const layer = document.getElementById('modal-root');
  if (!layer) return;
  layer.innerHTML = '';
  document.body.style.overflow = '';
  delete document.documentElement.dataset.modalOpen;
  if (modalCleanup) modalCleanup();
  modalCleanup = null;
}

/* ---------------------------------- layout -------------------------------- */

export function topbar(title, subtitle, actions = '') {
  return `
    <header class="topbar">
      <div>
        <div class="eyebrow">${esc(subtitle)}</div>
        <h1>${esc(title)}</h1>
      </div>
      <span class="spacer"></span>
      <div class="topbar-actions">${actions}</div>
    </header>`;
}

/* -------------------------------- submitting ------------------------------- */

export function submitting(button, label) {
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = label;
  return () => {
    button.disabled = false;
    button.innerHTML = original;
  };
}

export function errorText(err) {
  return err?.message || 'Something went wrong.';
}
