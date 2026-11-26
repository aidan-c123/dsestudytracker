/* ============================================================
   Papers: attempt matrix, logged attempts, red-ink error log
   ============================================================ */

import {
  esc, icon, state, topbar, pct, lvlChip, lvlLabel, papersFor, matrixPapersFor, yearsFor, YEARS, subjectById,
  papersOf, otherPapersOf, subjectPrediction, subjectAttainment, subjectPct, subjectDsePct, fmtDate,
  usesAttainment, attainmentChip, attainmentLabel, CSD_FIRST_YEAR, OTHER_SOURCES, otherSourceLabel,
  levelFromPercentage, nextBand, bandsFor, bandsOrigin
} from '../lib.js';
import { recentBoundaries, recentPaperBoundaries, CUTOFF_SOURCE } from '../cutoffs.js';

/**
 * The four boundaries a candidate is actually working toward, in order.
 *
 * Highest first, so the grade a student is chasing sits at the left edge and
 * the list reads the way a result slip does: 5** down to 4. The marks
 * therefore fall left to right, which is why nothing here assumes an
 * ascending list.
 */
const GOAL_GRADES = ['5**', '5*', '5', '4'];

/**
 * Short names for the papers the source publishes separately, so the strip can
 * say which paper a boundary belongs to. A bare "P1" is not much help on a
 * screen that already uses P1 as a matrix column heading.
 */
const PAPER_TITLE = {
  'P1': 'Reading',
  'P2': 'Writing',
  'P3': 'Listening & Integrated Skills',
  'P4': 'Speaking'
};

/**
 * One line of boundaries per paper, for the two subjects whose papers the
 * source publishes separately.
 *
 * This is why Chinese used to look wrong. Its papers are marked out of
 * different totals and carry genuinely different boundaries — a 5** on Paper 1
 * sits near 62%, Paper 2 near 70% — so a single subject-wide blend cannot be
 * right for either, and grading a Paper 1 script against it reads far too
 * harshly. When the source has a row for the paper, show the paper's own
 * numbers.
 *
 * Returns '' for subjects with no per-paper rows, so the caller can fall back
 * to the single subject-wide strip.
 */
function paperRows(subject) {
  const code = subject?.code;
  if (!code) return '';
  const bands = subject?.gradeBands;
  if (bands && typeof bands === 'object' && Object.keys(bands).length) return '';

  const papers = matrixPapersFor(subject).filter((p) => p !== 'SBA');
  const rows = [];
  for (const paper of papers) {
    const recent = recentPaperBoundaries(code, paper);
    if (!recent) continue;
    const cells = GOAL_GRADES.filter((g) => Number.isFinite(recent.mean[g]))
      .map(
        (grade) => `<li class="cut-item${grade.startsWith('5*') ? ' is-star' : ''}">
          <span class="cut-lvl">${grade}</span>
          <span class="cut-pct">${Math.round(recent.mean[grade])}<i>%</i></span>
        </li>`
      )
      .join('');
    if (!cells) continue;
    const name = PAPER_TITLE[paper] ? ` <span class="muted">${esc(PAPER_TITLE[paper])}</span>` : '';
    const span =
      recent.from && recent.to
        ? ` <span class="muted">${esc(recent.from)}–${esc(recent.to)}</span>`
        : '';
    rows.push(`<div class="cut-sub">
      <div class="cut-subhead"><b>${esc(paper)}</b>${name}${span}</div>
      <ol class="cut-list">${cells}</ol>
    </div>`);
  }
  if (!rows.length) return '';

  return `<div class="cut-note">
    <div class="cut-head">
      <b>Grade boundaries</b>
      <span class="muted">per paper · mean of the last five sittings</span>
    </div>
    ${rows.join('')}
    <div class="cut-foot">
      From <a href="${CUTOFF_SOURCE.url}" target="_blank" rel="noopener noreferrer">${esc(CUTOFF_SOURCE.name)}</a>,
      as a share of each paper's own full marks. ${esc(code)} marks its papers separately, so each
      paper is graded on its own boundaries. A boundary is the last mark that earned the
      grade — not a promise about yours.
    </div>
  </div>`;
}

/**
 * Recent grade boundaries, as one horizontal line of figures.
 *
 * The source publishes a boundary per sitting, and a single year can move
 * several marks either way for reasons that have nothing to do with the
 * candidate. So the figure shown is the mean of the last five sittings,
 * taken as a percentage of that sitting's own full marks, which is the only
 * way to compare years with different paper lengths.
 *
 * The four figures run 5** on the left down to 4 on the right, which is the
 * order a result slip uses. A student chasing a starred grade does not need the
 * Level 2 boundary restated on a page they visit every week, and four numbers
 * fit on one phone line where six do not.
 */
function cutoffNote(subject) {
  if (!subject || usesAttainment(subject)) return '';
  const perPaper = paperRows(subject);
  if (perPaper) return perPaper;

  const rows = boundaryRows(subject);
  if (!rows) return '';

  const cells = GOAL_GRADES.filter((grade) => Number.isFinite(rows.values[grade]))
    .map(
      (grade) => `<li class="cut-item${grade.startsWith('5*') ? ' is-star' : ''}">
        <span class="cut-lvl">${grade}</span>
        <span class="cut-pct">${Math.round(rows.values[grade])}<i>%</i></span>
      </li>`
    )
    .join('');
  if (!cells) return '';

  const origin =
    rows.source === 'dse00'
      ? `<span class="muted">mean of ${rows.from}–${rows.to} · ${esc(subject.code)}</span>`
      : rows.source === 'yours'
        ? `<span class="muted">your own bands · ${esc(subject.code)}</span>`
        : `<span class="muted">starting point · ${esc(subject.code)}</span>`;

  const foot =
    rows.source === 'dse00'
      ? `From <a href="${CUTOFF_SOURCE.url}" target="_blank" rel="noopener noreferrer">${esc(CUTOFF_SOURCE.name)}</a>,
         as a share of each year's full marks. A boundary is the last mark that earned the grade —
         not a promise about yours.`
      : rows.source === 'yours'
        ? `The boundaries you set for this subject. Adjust them whenever a marked paper tells you more.`
        : `No published DSE boundaries reach this subject, so these are neutral starting points. Adjust them once you have marked papers.`;

  const adjust =
    rows.source === 'dse00'
      ? ''
      : `<button class="cut-adjust" data-act="edit-subject" data-id="${esc(subject.id)}" type="button">Adjust</button>`;

  return `<div class="cut-note">
    <div class="cut-head">
      <b>Grade boundaries</b>
      ${origin}
      ${adjust}
    </div>
    <ol class="cut-list">${cells}</ol>
    <div class="cut-foot">${foot}</div>
  </div>`;
}

/**
 * The four numbers under the matrix, for any subject that has levels.
 *
 * Every subject gets a row, so the strip does not appear and vanish as the
 * student switches tabs. What changes is the provenance, which the heading
 * states plainly:
 *
 *   dse00   — published boundaries, averaged over the last five sittings;
 *   yours   — the student's own bands, which always win over the published ones;
 *   default — neutral starting points, used only where the source publishes
 *             nothing for a subject, so the strip never claims authority it
 *             does not have.
 *
 * The values come from the same `bandsFor` the grader uses, so a figure on
 * screen can never disagree with the level given to a paper.
 */
function boundaryRows(subject) {
  const recent = recentBoundaries(subject.code);
  const origin = bandsOrigin(subject);
  if (recent && origin === 'cutoff') {
    return { source: 'dse00', values: recent.mean, from: recent.from, to: recent.to };
  }
  const bands = bandsFor(subject);
  const values = { 4: bands[4], 5: bands[5], '5*': bands[6], '5**': bands[7] };
  const usable = Object.values(values).some((v) => Number.isFinite(v) && v > 0);
  if (!usable) return null;
  return { source: origin === 'tuned' ? 'yours' : 'default', values };
}

/**
 * What the current grade bands call the student's evidence. Recomputed every
 * time it is asked for, so after saving bands the answer is never stale.
 * Returns null when there is nothing to average yet.
 */
export function subjectStanding(subject) {
  if (!subject) return null;
  if (usesAttainment(subject)) {
    const attr = subjectAttainment(subject);
    return { kind: 'attainment', value: attr.value, source: attr.source, average: subjectPct(subject.id) };
  }
  const average = subjectPct(subject.id);
  if (average === null) return null;
  const level = levelFromPercentage(average, subject);
  const next = nextBand(average, subject);
  return {
    kind: 'level',
    average,
    level,
    next: next && next.level <= 7 ? next : null
  };
}

/** A one-line summary used in toasts and at the top of the subject dialog. */
export function standingLine(subject, standing = subjectStanding(subject)) {
  if (!standing) {
    return 'No marked papers yet — log one and the predicted grade will appear here.';
  }
  if (standing.kind === 'attainment') {
    return standing.value
      ? `Your evidence predicts ${attainmentLabel(standing.value)}.`
      : 'No Attained / Not attained evidence yet.';
  }
  const gap = standing.next
    ? ` · ${standing.next.need} more percentage points reaches ${lvlLabel(standing.next.level)}, using the boundaries above.`
    : ' · already at the top boundary.';
  return `Your average is ${pct(standing.average)} → predicted ${lvlLabel(standing.level)}${gap}`;
}

export function renderPapers() {
  if (!state.data.subjects.length) {
    return `${topbar('Past papers', 'Papers')}
      <div class="empty"><b>Add a subject first.</b>You need at least one subject before logging papers.</div>
      <button class="btn btn-primary" data-act="add-subject" style="margin-top:14px">${icon('plus')} Add a subject</button>`;
  }

  let subject = subjectById(state.paperSubjectId) || state.data.subjects[0];
  state.paperSubjectId = subject.id;

  const csd = usesAttainment(subject);
  const years = yearsFor(subject);
  const logs = papersOf(subject.id);
  const otherLogs = otherPapersOf(subject.id);
  // Columns keep any paper already logged, so a pre-2024 Chinese Paper 3 stays
  // visible even though the reform retired it.
  const papers = matrixPapersFor(subject, logs);
  // One cell can briefly hold more than one row on an older database. Show the
  // most recent, so the matrix always reflects the last thing saved.
  const byCell = new Map();
  for (const log of logs) {
    const key = `${log.year}-${log.paper}`;
    const seen = byCell.get(key);
    if (!seen || String(log.attemptedAt || '') >= String(seen.attemptedAt || '')) byCell.set(key, log);
  }
  const dseAvg = subjectDsePct(subject.id);
  const avg = subjectPct(subject.id);
  const best = logs.reduce((a, p) => Math.max(a, p.estimatedLevel || 0), 0);
  const pred = subjectPrediction(subject);
  const attainPred = subjectAttainment(subject);
  const standing = subjectStanding(subject);
  const completion = Math.round((logs.length / (years.length * papers.length)) * 100);

  const errors = state.data.errors.filter(
    (e) => state.errorSubject === 'all' || e.subjectId === state.errorSubject
  );

  // One row per cell, newest row first. Duplicates can exist on an older
  // database, so the list must not show the same cell twice.
  const newestPerCell = (rows) => {
    const map = new Map();
    for (const row of rows) {
      const key = `${row.year}-${row.paper}`;
      const seen = map.get(key);
      if (!seen || String(row.attemptedAt || '') >= String(seen.attemptedAt || '')) map.set(key, row);
    }
    return [...map.values()].sort(
      (a, b) => b.year - a.year || String(a.paper).localeCompare(String(b.paper))
    );
  };
  const recentLogs = newestPerCell(logs).slice(0, 12);

  return `
    ${topbar(
      'Past paper matrix',
      `Papers · ${years[years.length - 1]}–${years[0]}`,
      `<button class="btn btn-quiet" data-act="add-subject" aria-label="Add a subject" title="Add a subject">${icon('plus')}<span>Subject</span></button>
       <button class="btn btn-quiet" data-act="other-paper" data-subject="${subject.id}" aria-label="Log a paper that is not a DSE past paper" title="Other paper">${icon('layers')}<span>Other paper</span></button>
       <button class="btn btn-primary" data-act="log-paper" data-subject="${subject.id}" aria-label="Log a paper attempt" title="Log attempt">${icon('pen')}<span>Log attempt</span></button>`
    )}

    <div class="stat-row stat-row-5">
      <div class="stat"><div class="k">DSE papers logged</div><div class="v">${logs.length} <small>/ ${years.length * papers.length}</small></div></div>
      <div class="stat"><div class="k">Matrix filled</div><div class="v">${completion}%</div></div>
      <div class="stat"><div class="k">Other papers</div><div class="v">${otherLogs.length}</div></div>
      <div class="stat"><div class="k">Average <small>${otherLogs.length ? 'all papers' : 'DSE'}</small></div><div class="v">${avg === null ? '—' : pct(avg)}</div></div>
      <div class="stat"><div class="k">${csd ? 'Attainment' : 'Predicted'}</div><div class="v">${
        csd
          ? attainPred.value
            ? attainmentLabel(attainPred.value)
            : '—'
          : `${pred.level ? lvlLabel(pred.level) : '—'} <small>→ ${lvlLabel(subject.targetLevel)}</small>`
      }</div></div>
    </div>

    <section class="card">
      <div class="card-head" style="align-items:flex-start">
        <div>
          <h2>${esc(subject.name)}${subject.code ? ` <span class="muted" style="font-size:.8rem">${esc(subject.code)}</span>` : ''}</h2>
          <div class="card-note">Tap a cell to log or edit that paper. ${
            csd
              ? 'CSD is reported as Attained / Not attained, first sat in 2024.'
              : `Best level so far: ${best ? lvlLabel(best) : '—'}.`
          }</div>
        </div>
        <span class="spacer"></span>
        <button class="btn btn-ghost btn-sm" data-act="edit-subject" data-id="${subject.id}">${icon('edit')} ${csd ? 'Attainment' : 'Target'}</button>
      </div>

      ${
        // Where the grade boundaries came from, what they mean in marks, and
        // what they currently call this student's evidence. The last part is
        // recomputed on every render, so saving new bands updates it at once.
        cutoffNote(subject)
      }
      ${
        standing
          ? `<div class="standing${standing.kind === 'level' && standing.level >= 6 ? ' is-high' : ''}">
              <span class="standing-label">Predicted from your marks</span>
              <span class="standing-value">${
                standing.kind === 'attainment'
                  ? attainmentLabel(standing.value)
                  : lvlLabel(standing.level)
              }</span>
              <span class="standing-note">${esc(
                standing.kind === 'attainment'
                  ? standing.value
                    ? 'Based on your latest marked paper.'
                    : 'No Attained / Not attained evidence yet.'
                  : `Average ${pct(standing.average)}${
                      standing.next
                        ? ` · ${standing.next.need} points to ${lvlLabel(standing.next.level)}`
                        : ' · at the top boundary'
                    }`
              )}</span>
            </div>`
          : ''
      }

      <div class="subject-tabs" role="group" aria-label="Choose subject">
        ${state.data.subjects
          .map(
            (s) => `<button class="subject-tab" data-act="pick-subject" data-id="${s.id}" aria-pressed="${s.id === subject.id}"
              title="${esc(s.name)}">${esc(s.code || s.name)}</button>`
          )
          .join('')}
      </div>

      <div class="matrix-scroll" style="margin-top:12px">
        <table class="matrix">
          <thead>
            <tr>
              <th scope="col">Year</th>
              ${papers.map((p) => `<th scope="col">${p}</th>`).join('')}
              <th scope="col" title="Average across papers">Avg</th>
            </tr>
          </thead>
          <tbody>
            ${years.map((year) => {
              const row = papers.map((p) => byCell.get(`${year}-${p}`)).filter(Boolean);
              const withPct = row.filter((r) => Number.isFinite(r.percentage));
              const rowAvg = withPct.length
                ? withPct.reduce((a, r) => a + r.percentage, 0) / withPct.length
                : null;
              return `<tr>
                <th scope="row">${year}</th>
                ${papers
                  .map((paper) => {
                    const log = byCell.get(`${year}-${paper}`);
                    if (!log) {
                      return `<td><button class="cell f-empty" data-act="log-paper" data-subject="${subject.id}"
                        data-year="${year}" data-paper="${paper}"
                        aria-label="Log ${esc(subject.name)} ${year} ${paper}">·</button></td>`;
                    }
                    const p = log.percentage;
                    const fill = !Number.isFinite(p) ? '' : p >= 80 ? 'f-d' : p >= 65 ? 'f-c' : p >= 50 ? 'f-b' : 'f-a';
                    // CSD cells show attainment; levelled subjects show the level.
                    const label = csd
                      ? log.attainment
                        ? log.attainment === 'attained'
                          ? 'A'
                          : 'NA'
                        : Number.isFinite(p)
                          ? String(Math.round(p))
                          : '•'
                      : log.estimatedLevel
                        ? lvlLabel(log.estimatedLevel)
                        : Number.isFinite(p)
                          ? String(Math.round(p))
                          : '•';
                    const gradeText = csd
                      ? log.attainment
                        ? attainmentLabel(log.attainment)
                        : 'attainment not set'
                      : `level ${lvlLabel(log.estimatedLevel)}`;
                    return `<td><button class="cell ${fill}" data-act="log-paper" data-subject="${subject.id}"
                      data-year="${year}" data-paper="${paper}"
                      aria-label="${year} ${paper}, ${Number.isFinite(p) ? pct(p) : 'no percentage'}, ${gradeText}"
                      title="${year} ${paper}: ${Number.isFinite(p) ? pct(p) : 'no %'} · ${gradeText}">${label}</button></td>`;
                  })
                  .join('')}
                <td class="muted tabular" style="padding:0 6px">${rowAvg === null ? '—' : `${Math.round(rowAvg)}`}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>

      <div class="matrix-legend">
        <span><i class="swatch sw-none"></i> not attempted</span>
        <span><i class="swatch sw-a"></i> under 50%</span>
        <span><i class="swatch sw-b"></i> 50–64%</span>
        <span><i class="swatch sw-c"></i> 65–79%</span>
        <span><i class="swatch sw-d"></i> 80%+</span>
        <span class="muted">${
          csd ? 'Cell shows A (attained) or NA (not attained), otherwise percentage.' : 'Cell shows DSE level when set, otherwise percentage.'
        }</span>
      </div>
    </section>

    <section class="card" style="margin-top:16px">
      <div class="card-head">
        <div>
          <h2>Other papers</h2>
          <div class="card-note">Your school's mocks, other schools' papers, tutorial centre and publisher mocks, textbooks and practice papers. They count towards the average, but stay out of the DSE matrix.</div>
        </div>
        <span class="spacer"></span>
        <button class="btn btn-quiet btn-sm" data-act="other-paper" data-subject="${subject.id}">${icon('plus')} Add paper</button>
      </div>
      ${
        otherLogs.length
          ? `<div class="table-wrap"><table class="plain">
              <thead><tr><th>Paper</th><th>Kind</th><th>Sat</th><th>Score</th><th>%</th><th>${csd ? 'Result' : 'Level'}</th><th></th></tr></thead>
              <tbody>
                ${[...otherLogs]
                  .sort((a, b) => String(b.takenOn).localeCompare(String(a.takenOn)))
                  .map(
                    (p) => `<tr>
                      <td><b>${esc(p.title)}</b>${p.notes ? `<div class="card-note" style="margin-top:2px">${esc(p.notes)}</div>` : ''}</td>
                      <td><span class="chip">${esc(otherSourceLabel(p.source))}</span></td>
                      <td class="num">${fmtDate(p.takenOn)}</td>
                      <td class="num">${p.score !== null && p.maxScore ? `${p.score}/${p.maxScore}` : '—'}</td>
                      <td class="num">${Number.isFinite(p.percentage) ? pct(p.percentage) : '—'}</td>
                      <td>${csd ? attainmentChip(p.attainment) : lvlChip(p.estimatedLevel)}</td>
                      <td style="text-align:right;white-space:nowrap">
                        <button class="icon-btn" data-act="edit-other-paper" data-id="${p.id}" aria-label="Edit ${esc(p.title)}">${icon('edit')}</button>
                        <button class="icon-btn" data-act="delete-other-paper" data-id="${p.id}" aria-label="Delete ${esc(p.title)}">${icon('trash')}</button>
                      </td>
                    </tr>`
                  )
                  .join('')}
              </tbody>
            </table></div>`
          : `<div class="empty"><b>No other papers yet.</b>Your school's mock is often the best evidence you have before March — log one and it feeds your prediction.</div>`
      }
      ${
        otherLogs.length
          ? `<p class="card-note" style="margin-top:10px">DSE past papers average ${dseAvg === null ? '—' : pct(dseAvg)}; everything together averages ${avg === null ? '—' : pct(avg)}.</p>`
          : ''
      }
    </section>

    <div class="grid cols-2" style="margin-top:16px">
      <section class="card">
        <div class="card-head">
          <h2>Logged attempts</h2>
          <span class="spacer"></span>
          <span class="chip">${logs.length}</span>
        </div>
        ${
          logs.length
            ? `<div class="table-wrap"><table class="plain">
                <thead><tr><th>Paper</th><th>Score</th><th>%</th><th>${csd ? 'Result' : 'Level'}</th><th></th></tr></thead>
                <tbody>
                  ${recentLogs
                    .map(
                      (p) => `<tr>
                        <td><b>${esc(p.year)}</b> ${esc(p.paper)}</td>
                        <td class="num">${p.score !== null && p.maxScore ? `${p.score}/${p.maxScore}` : '—'}</td>
                        <td class="num">${Number.isFinite(p.percentage) ? pct(p.percentage) : '—'}</td>
                        <td>${csd ? attainmentChip(p.attainment) : lvlChip(p.estimatedLevel)}</td>
                        <td style="text-align:right;white-space:nowrap">
                          <button class="icon-btn" data-act="edit-paper" data-id="${p.id}" aria-label="Edit ${p.year} ${p.paper}">${icon('edit')}</button>
                          <button class="icon-btn" data-act="delete-cell" data-subject="${subject.id}"
                            data-year="${p.year}" data-paper="${p.paper}"
                            aria-label="Delete ${p.year} ${p.paper}">${icon('trash')}</button>
                        </td>
                      </tr>`
                    )
                    .join('')}
                </tbody>
              </table></div>`
            : `<div class="empty"><b>Nothing logged yet.</b>Tap a matrix cell above, and the ${
                csd ? 'attainment you set' : 'level you set'
              } will feed the prediction.</div>`
        }
      </section>

      <section class="card">
        <div class="card-head">
          <h2>Red-ink log</h2>
          <span class="spacer"></span>
          <button class="btn btn-ghost btn-sm" data-act="new-error">${icon('plus')} Add</button>
        </div>
        <div class="filter-row" style="margin:-4px 0 12px">
          <button class="filter-pill" data-act="error-filter" data-id="all" aria-pressed="${state.errorSubject === 'all'}">All</button>
          ${state.data.subjects
            .map(
              (s) => `<button class="filter-pill" data-act="error-filter" data-id="${s.id}"
                aria-pressed="${state.errorSubject === s.id}">${esc(s.code || s.name)}</button>`
            )
            .join('')}
        </div>
        ${
          errors.length
            ? `<div>
                ${errors
                  .slice(0, 7)
                  .map((e) => {
                    const s = subjectById(e.subjectId);
                    return `<div class="session-item" style="align-items:flex-start">
                      <span class="session-dot ${e.errorType === 'careless' ? 'break' : ''}" style="margin-top:6px"></span>
                      <div style="min-width:0;flex:1">
                        <div style="font-size:.85rem;font-weight:500">${esc(e.topic)}</div>
                        <div class="task-meta">
                          ${s ? `<span class="chip chip-ghost">${esc(s.code || s.name)}</span>` : ''}
                          <span class="chip">${esc(e.errorType)}</span>
                          ${e.questionRef ? `<span class="muted">${esc(e.questionRef)}</span>` : ''}
                        </div>
                      </div>
                      <button class="icon-btn" data-act="delete-error" data-id="${e.id}" aria-label="Delete entry">${icon('trash')}</button>
                    </div>`;
                  })
                  .join('')}
              </div>`
            : '<div class="empty"><b>No mistakes recorded.</b>Add the topics that keep catching you out.</div>'
        }
      </section>
    </div>

    <section class="card" style="margin-top:16px">
      <div class="card-head">
        <h2>Subjects &amp; targets</h2>
        <span class="spacer"></span>
        <button class="btn btn-quiet btn-sm" data-act="add-subject">${icon('plus')} Add subject</button>
      </div>
      <div class="table-wrap">
        <table class="plain">
          <thead><tr><th>Subject</th><th>Type</th><th>Predicted</th><th>Target</th><th>Papers</th><th>Avg</th><th></th></tr></thead>
          <tbody>
            ${state.data.subjects
              .map((s) => {
                const isCsd = usesAttainment(s);
                const p = subjectPrediction(s);
                const at = subjectAttainment(s);
                return `<tr>
                  <td><b>${esc(s.name)}</b> <span class="muted">${esc(s.code || '')}</span></td>
                  <td><span class="chip">${esc(s.category)}</span></td>
                  <td>${
                    isCsd
                      ? at.value
                        ? attainmentChip(at.value)
                        : '<span class="muted">—</span>'
                      : p.level
                        ? lvlChip(p.level)
                        : '<span class="muted">—</span>'
                  }</td>
                  <td>${isCsd ? '<span class="muted">attainment only</span>' : lvlChip(s.targetLevel)}</td>
                  <td class="num">${papersOf(s.id).length}</td>
                  <td class="num">${subjectPct(s.id) === null ? '—' : pct(subjectPct(s.id))}</td>
                  <td style="text-align:right;white-space:nowrap">
                    <button class="icon-btn" data-act="edit-subject" data-id="${s.id}" aria-label="Edit ${esc(s.name)}">${icon('edit')}</button>
                    <button class="icon-btn" data-act="delete-subject" data-id="${s.id}" aria-label="Delete ${esc(s.name)}">${icon('trash')}</button>
                  </td>
                </tr>`;
              })
              .join('')}
          </tbody>
        </table>
      </div>
      <p class="card-note" style="margin-top:10px">Last attempt logged ${fmtDate(state.data.papers[0]?.attemptedAt || null, { day: 'numeric', month: 'long' })}. CSD is graded Attained / Not attained; its first DSE paper was ${CSD_FIRST_YEAR}.</p>
    </section>
  `;
}
