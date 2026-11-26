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

/* Levels 3 and 2 used to fall back to the generic 45/35 for every subject,
   because the five-sitting mean only kept grades 4 and up. */
await test('levels 3 and 2 are real published figures, not the generic fallback', () => {
  for (const code of ['CHIN', 'ENG', 'MATH', 'CHEM', 'BIOL']) {
    const bands = lib.bandsFor({ code });
    assert.notEqual(bands[3], lib.DEFAULT_BANDS[3], `${code} Level 3 is still the generic 55`);
    assert.notEqual(bands[2], lib.DEFAULT_BANDS[2], `${code} Level 2 is still the generic 35`);
  }
  // Spot-check two subjects whose real figures are far from the fallback.
  assert.equal(lib.bandsFor({ code: 'CHEM' })[3], 47, 'Chemistry Level 3 is 46.7');
  assert.equal(lib.bandsFor({ code: 'CHEM' })[2], 29, 'Chemistry Level 2 is 29.4');
  assert.equal(lib.bandsFor({ code: 'MATH' })[3], 52, 'Maths Level 3 is 52.3');
});

/* The strip promised "the past five years" but the stored per-paper summary was
   a three-year mean, so it read 2024–2026. */
await test('the reported span really is the last five sittings', () => {
  const recent = cutoffs.recentBoundaries('CHIN');
  assert.equal(recent.count, 5, `subject mean covers ${recent.count} sittings`);
  assert.equal(recent.to - recent.from, 4, `subject span is ${recent.from}–${recent.to}`);

  for (const paper of ['P1', 'P2']) {
    const rows = cutoffs.recentPaperBoundaries('CHIN', paper);
    assert.ok(rows, `Chinese ${paper} has boundaries`);
    assert.equal(rows.count, 5, `${paper} mean covers ${rows.count} sittings`);
    assert.equal(rows.to - rows.from, 4, `${paper} span is ${rows.from}–${rows.to}`);
  }
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

await test('a stored band set does not override the published figures', () => {
  // Bands were editable in an earlier version. Any set still on a record must
  // be ignored, or the app would grade against numbers the exam never published.
  // Chemistry is used because its published figures are far from the values
  // stored here — Chinese would be a poor test, its real 5** is itself 70.
  const mine = { 2: 20, 3: 30, 4: 40, 5: 50, 6: 60, 7: 70 };
  const bands = lib.bandsFor({ code: 'CHEM', gradeBands: mine });
  assert.notEqual(bands[7], 70, 'the stored 5** was used');
  assert.notEqual(bands[2], 20, 'the stored Level 2 was used');
  assert.ok(bands[7] > 88, `Chemistry 5** should be its published figure, got ${bands[7]}`);
  assert.ok(bands[2] > 25, `Chemistry Level 2 should be its published figure, got ${bands[2]}`);
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
