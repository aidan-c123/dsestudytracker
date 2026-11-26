/**
 * Cut-off and grading check.
 *
 * The regression this exists for: `public/data/cutoffs.json` shipped one
 * shape and the app read another. The file keyed percentages by level number
 * ("7": 70.1) while the reader asked for grade names ("5**"). Every lookup
 * returned NaN, all boundaries were dropped, and the app fell back to its
 * generic 35/45/55/65/75/85 bands — so 70% in Chinese graded as a 5 when the
 * real 2024 boundary put it at 5**.
 *
 * Runs against the shipped data file, not a fixture, so a regenerated file
 * that changes shape is caught here rather than by a student.
 *
 * Run: node test/cutoffs.test.mjs
 */

import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

/* ------------------------------ browser shims ----------------------------- */

const data = JSON.parse(readFileSync('./public/data/cutoffs.json', 'utf8'));

globalThis.window = {
  dispatchEvent() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
};
globalThis.document = {};
globalThis.CustomEvent = class {};
globalThis.fetch = async () => ({ ok: true, json: async () => JSON.parse(JSON.stringify(data)) });

const cutoffs = await import('../public/cutoffs.js');
const lib = await import('../public/lib.js');

await cutoffs.loadCutoffs();
lib.resetBandCache();

/* --------------------------------- checks --------------------------------- */

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push(['ok', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
  }
}

await test('every percentage in the shipped file is keyed by grade name', () => {
  const allowed = new Set(['2', '3', '4', '5', '5*', '5**']);
  const seen = [];
  const walk = (percent, where) => {
    for (const key of Object.keys(percent || {})) {
      assert.ok(allowed.has(key), `${where} has a non-grade key "${key}"`);
      seen.push(key);
    }
  };
  for (const [code, record] of Object.entries(data.subjects)) {
    walk(record.percent, `${code}.percent`);
    for (const [year, row] of Object.entries(record.byYear || {})) {
      walk(row.percent, `${code}.byYear.${year}`);
    }
    for (const [paper, p] of Object.entries(record.papers || {})) {
      walk(p.percent, `${code}.papers.${paper}`);
    }
  }
  assert.ok(seen.length > 100, 'the file actually contains boundaries');
});

await test('Chinese 70% grades as 5**, as the real boundaries say', () => {
  const bands = lib.bandsForYear({ code: 'CHIN' }, 2024);
  assert.equal(lib.levelFromPercentage(70, { code: 'CHIN' }) >= 6, true);
  assert.equal(bands[6], 68, '2024 five-star boundary is 68%');
  assert.equal(bands[7], 70, '2024 5** boundary is 70%');
  assert.equal(lib.levelFromPercentage(70, { code: 'CHIN' }), 7);
});

await test('a 5* mark lands on 5*, not 5', () => {
  // 2024 Chinese: Level 5 starts at 62.2, 5* at 67.6, 5** at 69.9.
  assert.equal(lib.levelFromPercentage(65, { code: 'CHIN' }), 5);
  assert.equal(lib.levelFromPercentage(68, { code: 'CHIN' }), 6);
  assert.equal(lib.levelFromPercentage(71, { code: 'CHIN' }), 7);
});

await test('the five-year list covers 4 through 5** and climbs with the grade', () => {
  const recent = cutoffs.recentBoundaries('CHIN');
  assert.ok(recent, 'Chinese has enough sittings');
  // The data is stored in grade order; only the on-screen list is reversed.
  const grades = ['4', '5', '5*', '5**'];
  for (const g of grades) assert.ok(Number.isFinite(recent.mean[g]), `5** row missing ${g}`);
  for (let i = 1; i < grades.length; i += 1) {
    assert.ok(recent.mean[grades[i]] > recent.mean[grades[i - 1]], 'boundaries climb with the grade');
  }
  assert.equal(cutoffs.recentBoundaries('CSD'), null, 'CSD has no levels, so no boundaries');
});

await test('bands come from the data, not the generic fallback', () => {
  for (const code of ['CHIN', 'ENG', 'MATH']) {
    const bands = lib.bandsFor({ code });
    const generic = lib.DEFAULT_BANDS;
    const same = [2, 3, 4, 5, 6, 7].every((lvl) => bands[lvl] === generic[lvl]);
    assert.equal(same, false, `${code} still uses the generic bands`);
  }
});

await test('an unexamined subject still has usable bands', () => {
  const bands = lib.bandsFor({ code: 'NOPE' });
  for (const lvl of [2, 3, 4, 5, 6, 7]) {
    assert.ok(Number.isFinite(bands[lvl]), `Level ${lvl} has a boundary`);
  }
});

await test('a student’s own bands still win over the published ones', () => {
  const mine = { 2: 20, 3: 30, 4: 40, 5: 50, 6: 60, 7: 70 };
  const bands = lib.bandsFor({ code: 'CHIN', gradeBands: mine });
  assert.equal(bands[7], 70);
  assert.equal(bands[2], 20);
});

/* --------------------------------- output --------------------------------- */

let failed = 0;
for (const [status, name, message] of results) {
  if (status === 'ok') {
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name}\n      ${message}\n`);
  }
}
console.log(
  failed ? `${results.length - failed} checks passed — with failures` : `${results.length} checks passed`
);
process.exit(failed ? 1 : 0);
