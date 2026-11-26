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
      table = data?.subjects ? data : null;
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
  const bands = {};
  let ok = false;
  for (const level of [2, 3, 4, 5, 6, 7]) {
    const raw = Number(subject.percent[GRADE_KEY[level]]);
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
