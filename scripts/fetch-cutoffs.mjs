#!/usr/bin/env node
/* ============================================================
   Refresh the DSE cut-off table
   ============================================================

   Where the numbers come from
   ---------------------------
   DSE00 publishes the raw mark at which each grade started, for each sitting:

       https://www.dse00.com/p/core-cutoff.html

   That page is a thin viewer over a JSON API, which is where this script
   reads from. Using the API (rather than scraping the rendered page) means
   the numbers are exactly the published ones, not a re-reading of them.

   When to run it
   --------------
   Once a year, after the HKEAA releases the next sitting's boundaries
   (usually in the autumn following the exam). In 2027, run:

       npm run cutoffs

   Then commit `public/data/cutoffs.json`. The app picks it up on the next
   deploy; nothing else needs editing.

   What it writes
   --------------
   For every subject: the latest sitting's full marks and raw cut-off per
   grade (5** 5* 5 4 3 2), the same for every earlier year, and a mean
   percentage over the last three sittings, which is what the app uses as its
   default grade bands. A percentage is computed per year against that year's
   own full marks, because the scale changes between sittings (Chinese moved
   from a ~500-mark paper to ~667, and Physics from ~200 to ~500).

   Anything that fails a sanity check is skipped rather than written, so a
   bad year cannot quietly wreck a subject's bands.
   ============================================================ */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'public', 'data', 'cutoffs.json');

const API = 'https://api-v2.dse00.com/cutoff/category';
const SOURCE_URL = 'https://www.dse00.com/p/core-cutoff.html';

/** dse00's subject title → our code and the English name the app shows. */
const SUBJECTS = {
  '中國語文': { code: 'CHIN', name: 'Chinese Language', category: 'core' },
  English: { code: 'ENG', name: 'English Language', category: 'core' },
  '數學': { code: 'MATH', name: 'Mathematics', category: 'core' },
  'Physics物理': { code: 'PHYS', name: 'Physics', category: 'elective' },
  'Chemistry 化學': { code: 'CHEM', name: 'Chemistry', category: 'elective' },
  'Biology 生物': { code: 'BIOL', name: 'Biology', category: 'elective' },
  '經濟 Econ': { code: 'ECON', name: 'Economics', category: 'elective' },
  'BAFS (Accounting,2018)': {
    code: 'BAFS',
    name: 'Business, Accounting & Financial Studies',
    category: 'elective'
  },
  '中國歷史': { code: 'CHIST', name: 'Chinese History', category: 'elective' },
  '世界歷史 History': { code: 'HIST', name: 'History', category: 'elective' },
  '中國文學': { code: 'CLIT', name: 'Chinese Literature', category: 'elective' },
  '地理 Geography': { code: 'GEOG', name: 'Geography', category: 'elective' },
  '資訊與通訊科技 ICT': {
    code: 'ICT',
    name: 'Information & Communication Technology',
    category: 'elective'
  }
};

/** Categories to fetch, and the extra endpoints that hold per-paper detail. */
const CATEGORIES = ['core', 'english', 'sci', 'business', 'lithis', 'geoict'];
const PAPER_SOURCES = [
  { code: 'ENG', slug: 'english' },
  { code: 'CHIN', slug: 'chincutoff' }
];

const GRADES = ['5**', '5*', '5', '4', '3', '2'];
/** Which row of the seven-value array belongs to which grade. */
const ROW = { '5**': 1, '5*': 2, 5: 3, 4: 4, 3: 5, 2: 6 };

const fetchJson = async (url) => {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
};

/**
 * A row is usable when it has seven numbers, a positive full mark, and grades
 * that strictly descend. That rejects the source's occasional zero-filled or
 * partially published years.
 */
function isValidRow(values) {
  if (!Array.isArray(values) || values.length !== 7) return false;
  if (values.some((v) => v === null || v === undefined)) return false;
  const n = values.map(Number);
  if (!n.every(Number.isFinite)) return false;
  if (!(n[0] > 0) || n.some((v) => v < 0)) return false;
  for (let i = 1; i < 6; i += 1) {
    if (!(n[i] > n[i + 1])) return false;
  }
  return true;
}

/**
 * Turn one subject's `{ year: [full, 5**, 5*, 5, 4, 3, 2] }` map into the shape
 * the app reads. Percentages are computed per year, then averaged over the
 * most recent sittings so a single unlucky paper does not become the default.
 *
 * Five sittings is the default because that is the stretch shown on the Papers
 * tab. Keeping history for every subject is what lets the strip say "mean of
 * 2022–2026" rather than quoting whatever the shipped file happened to store.
 */
function summarise(entry, { keepHistory = true, recentCount = 5 } = {}) {
  const perYear = {};
  for (const [year, values] of Object.entries(entry.cutoff || {})) {
    const y = Number(year);
    if (!Number.isInteger(y) || !isValidRow(values)) continue;
    const n = values.map(Number);
    const full = n[0];
    perYear[y] = {
      fullMarks: Math.round(full),
      cutoff: Object.fromEntries(GRADES.map((g) => [g, Math.round(n[ROW[g]])])),
      percent: Object.fromEntries(
        GRADES.map((g) => [g, Math.round((n[ROW[g]] / full) * 1000) / 10])
      )
    };
  }

  const years = Object.keys(perYear).map(Number).sort((a, b) => a - b);
  if (!years.length) return null;

  const latest = years[years.length - 1];
  const recent = years.slice(-recentCount);
  const percent = {};
  for (const g of GRADES) {
    const mean = recent.reduce((sum, y) => sum + perYear[y].percent[g], 0) / recent.length;
    percent[g] = Math.round(mean * 10) / 10;
  }

  const out = {
    latestYear: latest,
    recentFrom: recent[0],
    recentTo: recent[recent.length - 1],
    fullMarks: perYear[latest].fullMarks,
    cutoff: perYear[latest].cutoff,
    percent
  };
  if (keepHistory) {
    out.byYear = Object.fromEntries(years.map((y) => [String(y), perYear[y]]));
  }
  return out;
}

/** "Paper 1  Reading" / "卷一閱讀" → P1…P4. */
function paperKey(title) {
  const t = String(title).toLowerCase();
  const numeric = t.match(/paper\s*([1-5])/);
  if (numeric) return `P${numeric[1]}`;
  const chinese = String(title).match(/卷\s*([一二三四五])/);
  if (chinese) return `P${'一二三四五'.indexOf(chinese[1]) + 1}`;
  return null;
}

async function main() {
  const subjects = {};
  const skipped = [];

  for (const category of CATEGORIES) {
    let entries;
    try {
      entries = await fetchJson(`${API}/${category}`);
    } catch (err) {
      skipped.push(`${category}: ${err.message}`);
      continue;
    }
    if (!Array.isArray(entries)) continue;

    for (const entry of entries) {
      const meta = SUBJECTS[entry.title];
      if (!meta) {
        // The English category also lists individual papers; they are handled
        // below, so they are not a problem here.
        if (!paperKey(entry.title)) skipped.push(`${entry.title} (no catalogue entry)`);
        continue;
      }
      const summary = summarise(entry);
      if (!summary) {
        skipped.push(`${entry.title} (no usable rows)`);
        continue;
      }
      subjects[meta.code] = { code: meta.code, name: meta.name, category: meta.category, ...summary };
    }
  }

  // M1 / M2 live on their own endpoint.
  try {
    for (const entry of await fetchJson(`${API}/m1m2detail`)) {
      const code = String(entry.title).trim().toUpperCase(); // "M1" | "M2"
      if (code !== 'M1' && code !== 'M2') continue;
      const summary = summarise(entry);
      if (!summary) continue;
      subjects[code] = { code, name: code, category: 'extended', ...summary };
    }
  } catch (err) {
    skipped.push(`m1m2detail: ${err.message}`);
  }

  // Per-paper boundaries for the subjects the source publishes them for.
  for (const { code, slug } of PAPER_SOURCES) {
    if (!subjects[code]) continue;
    let entries;
    try {
      entries = await fetchJson(`${API}/${slug}`);
    } catch (err) {
      skipped.push(`${slug}: ${err.message}`);
      continue;
    }
    const papers = {};
    for (const entry of entries) {
      const key = paperKey(entry.title);
      if (!key) continue;
      // Keep each paper's own history. Without it the strip can only say
      // "last three years" from the pre-averaged figures, and the mean shown
      // would not match the five-sitting mean used everywhere else.
      const summary = summarise(entry);
      // A paper that stopped being examined years ago is not a useful default.
      if (!summary || summary.latestYear < 2020) continue;
      papers[key] = { ...summary, title: entry.title };
    }
    if (Object.keys(papers).length) subjects[code].papers = papers;
  }

  // Keep a stable, readable order: cores, extension, then electives.
  const ORDER = [
    'CHIN', 'ENG', 'MATH', 'CSD', 'M1', 'M2',
    'BIOL', 'CHEM', 'PHYS', 'ECON', 'GEOG', 'HIST', 'CHIST', 'BAFS', 'ICT', 'CLIT'
  ];
  const ordered = {};
  for (const code of ORDER) if (subjects[code]) ordered[code] = subjects[code];
  for (const code of Object.keys(subjects)) if (!ordered[code]) ordered[code] = subjects[code];

  const latestYear = Math.max(
    ...Object.values(ordered).map((s) => s.latestYear || 0)
  );

  const payload = {
    source: {
      name: 'DSE00 cut-off tables',
      url: SOURCE_URL,
      api: `${API}/{category}`,
      note:
        'Raw-mark cut-offs per grade for each sitting, taken from DSE00. ' +
        'Percentages are the mean of the last five sittings, computed per year ' +
        "against that year's own full marks."
    },
    updated: new Date().toISOString().slice(0, 10),
    latestYear,
    grades: GRADES,
    subjects: ordered
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(payload, null, 1) + '\n', 'utf8');

  console.log(`\nWrote ${OUT}`);
  console.log(`Latest sitting covered: ${latestYear}\n`);
  for (const [code, s] of Object.entries(ordered)) {
    const pct = GRADES.map((g) => `${g} ${String(s.percent[g]).padStart(5)}`).join('  ');
    const papers = s.papers ? `  papers: ${Object.keys(s.papers).join(' ')}` : '';
    console.log(`  ${code.padEnd(6)} ${pct}${papers}`);
  }
  if (skipped.length) {
    console.log(`\nSkipped (${skipped.length}):`);
    for (const line of skipped) console.log(`  - ${line}`);
  }
  console.log('\nCommit public/data/cutoffs.json, then redeploy.');
}

main().catch((err) => {
  console.error('\nCould not refresh the cut-offs:', err.message);
  console.error('The previous file was left untouched.');
  process.exitCode = 1;
});
