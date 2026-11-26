/* ============================================================
   Cut-offs: real grade boundaries, taken from DSE00's tables
   ============================================================

   DSE00 publishes the raw mark at which each grade started, per sitting, for
   the core subjects and most electives (https://www.dse00.com/p/core-cutoff.html).
   That is far better evidence than a guess, so the app converts those raw
   marks into percentages of that year's full marks and uses them as the
   starting grade bands.

   Three things keep this honest:

     - the numbers are fetched, not invented, and shipped beside the app in
       `public/data/cutoffs.json`, with the source and date recorded there;
     - a percentage is the mean of the last three sittings, because one paper's
       boundary can swing several marks either way;
     - a student's own tuning always wins. These are defaults, not a ruling.

   CSD has no levels at all, so it never appears here.
   ============================================================ */

/** Level → grade row name used by the source tables. */
const GRADE_KEY = { 7: '5**', 6: '5*', 5: '5', 4: '4', 3: '3', 2: '2' };

export const CUTOFF_SOURCE = {
  name: 'DSE00 cut-off tables',
  url: 'https://www.dse00.com/p/core-cutoff.html'
};

/** Populated once the JSON arrives; lookups before that return null. */
let table = null;
let loading = null;

const isBrowser = typeof document !== 'undefined' && typeof fetch === 'function';

/**
 * Fetch the cut-off table once. Safe to call from several places: the request
 * is shared. A failure is remembered as "unavailable" rather than retried on
 * every render, and the app falls back to the built-in bands.
 */
export function loadCutoffs() {
  if (table) return Promise.resolve(table);
  if (!isBrowser) return Promise.resolve(null);
  if (loading) return loading;

  loading = fetch('/data/cutoffs.json', { cache: 'force-cache' })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      table = data?.subjects ? normalise(data) : null;
      if (table) {
        // Let any rendered view respray its bands without a full reload.
        window.dispatchEvent(new CustomEvent('cutoffs:ready'));
      }
      return table;
    })
    .catch(() => {
      table = null;
      return null;
    })
    .finally(() => {
      loading = null;
    });

  return loading;
}

/**
 * The percentages in the data file are keyed two ways depending on when the
 * file was generated: by grade name ("5**") in the current generator, or by
 * level number ("7") in the file that shipped. Reading the wrong one fails
 * silently — `Number(undefined)` is NaN, so every boundary is dropped and the
 * app falls back to its generic 35/45/55/65/75/85 bands. That made Chinese
 * 70% grade as a 5 instead of a 5**. Normalising once on load means either
 * shape grades correctly, and the next regeneration cannot quietly break it.
 */
function normalisePercent(percent) {
  if (!percent || typeof percent !== 'object') return null;
  const out = {};
  let found = false;
  for (const [level, grade] of Object.entries(GRADE_KEY)) {
    const raw = Number(percent[grade] ?? percent[level]);
    if (Number.isFinite(raw) && raw > 0 && raw < 100) {
      out[grade] = raw;
      found = true;
    }
  }
  return found ? out : null;
}

function normalise(data) {
  const subjects = data.subjects || {};
  for (const record of Object.values(subjects)) {
    if (!record || typeof record !== 'object') continue;
    const top = normalisePercent(record.percent);
    if (top) record.percent = top;
    if (record.byYear) {
      for (const row of Object.values(record.byYear)) {
        const pct = normalisePercent(row?.percent);
        if (pct) row.percent = pct;
      }
    }
    if (record.papers) {
      for (const paper of Object.values(record.papers)) {
        const pct = normalisePercent(paper?.percent);
        if (pct) paper.percent = pct;
      }
    }
  }
  return data;
}

export const cutoffsLoaded = () => Boolean(table);

/** The raw record for a subject code, or null. */
export function cutoffFor(code) {
  if (!table || !code) return null;
  return table.subjects[String(code).toUpperCase()] || null;
}

/** Per-paper cut-offs where the source publishes them (English, Chinese). */
export function paperCutoffFor(code, paper) {
  const subject = cutoffFor(code);
  if (!subject?.papers) return null;
  return subject.papers[String(paper || '').toUpperCase()] || null;
}

/**
 * Grade bands as percentages, for the bands the app actually asks about
 * (Level 2…5**). Returns null when there is no data for that subject, so the
 * caller can fall back instead of inventing numbers.
 */
export function cutoffBands(code) {
  const subject = cutoffFor(code);
  if (!subject?.percent) return null;
  // Prefer the five-sitting mean, so the boundaries on screen are the same
  // numbers used to grade a paper. Falling back to the shipped three-sitting
  // mean keeps working for a subject with very few published years.
  const recent = recentBoundaries(code);
  const source = recent?.mean || subject.percent;
  const bands = {};
  let ok = false;
  for (const level of [2, 3, 4, 5, 6, 7]) {
    const raw = Number(source[GRADE_KEY[level]]);
    if (Number.isFinite(raw) && raw > 0 && raw < 100) {
      bands[level] = Math.round(raw);
      ok = true;
    }
  }
  if (!ok) return null;
  // Bands must climb; rounding can collide two neighbours.
  let previous = 0;
  for (const level of [2, 3, 4, 5, 6, 7]) {
    if (bands[level] === undefined) continue;
    bands[level] = Math.max(bands[level], previous + 1);
    previous = bands[level];
  }
  return bands;
}

/** "Chinese, P1: 5** from 63%, Level 4 from 50%" style summary for a paper. */
export function cutoffSummary(code, paper = null) {
  const record = paper ? paperCutoffFor(code, paper) : cutoffFor(code);
  if (!record) return null;
  return {
    fullMarks: record.fullMarks,
    cutoff: record.cutoff,
    percent: record.percent,
    latestYear: record.latestYear,
    recentFrom: record.recentFrom,
    recentTo: record.recentTo
  };
}

/**
 * The last five sittings as one set of boundaries, for the plain list shown on
 * the Papers tab. One year's cut-off can move several marks for reasons that
 * have nothing to do with the candidate (a harder paper, a different option
 * mix), so five years is the steadiest honest summary the source supports.
 *
 * Only the grades from 4 up are kept: those are the ones a candidate is
 * working toward, and a student chasing 5** does not need Level 2 restated.
 * Returns null when fewer than two sittings exist, because an average of one
 * year is just that year wearing a longer label.
 */
export function recentBoundaries(code, { years = 5 } = {}) {
  const subject = cutoffFor(code);
  const all = subject?.byYear;
  if (!all) return null;

  const sittings = Object.keys(all)
    .filter((y) => all[y]?.percent)
    .sort()
    .slice(-years);
  if (sittings.length < 2) return null;

  const mean = {};
  for (const grade of ['4', '5', '5*', '5**']) {
    const values = sittings
      .map((y) => Number(all[y].percent[grade]))
      .filter((v) => Number.isFinite(v) && v > 0 && v < 100);
    if (values.length) {
      mean[grade] = Math.round((values.reduce((a, v) => a + v, 0) / values.length) * 10) / 10;
    }
  }
  if (!Object.keys(mean).length) return null;

  return { mean, from: sittings[0], to: sittings[sittings.length - 1], count: sittings.length };
}

/**
 * Grade bands for one specific sitting, when the source published them. A 2014
 * script was marked against 2014 boundaries, so using a 2024–26 mean for it
 * would overstate the grade. Returns null when there is no data for that year,
 * so the caller falls back to the averaged bands.
 */
export function cutoffBandsForYear(code, year) {
  const subject = cutoffFor(code);
  const y = Number(year);
  if (!subject || !Number.isFinite(y)) return null;
  const row = subject.byYear?.[String(y)];
  if (!row?.percent) return null;
  const bands = {};
  let ok = false;
  for (const level of [2, 3, 4, 5, 6, 7]) {
    const raw = Number(row.percent[GRADE_KEY[level]]);
    if (Number.isFinite(raw) && raw > 0 && raw < 100) {
      bands[level] = Math.round(raw);
      ok = true;
    }
  }
  if (!ok) return null;
  let previous = 0;
  for (const level of [2, 3, 4, 5, 6, 7]) {
    if (bands[level] === undefined) continue;
    bands[level] = Math.max(bands[level], previous + 1);
    previous = bands[level];
  }
  return bands;
}
