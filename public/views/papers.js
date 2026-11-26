/* ============================================================
   Papers: attempt matrix, logged attempts, red-ink error log
   ============================================================ */

import {
  esc, icon, state, topbar, pct, lvlChip, lvlLabel, papersFor, YEARS, subjectById,
  papersOf, subjectPrediction, subjectPct, fmtDate
} from '../lib.js';

export function renderPapers() {
  if (!state.data.subjects.length) {
    return `${topbar('Past papers', 'Papers')}
      <div class="empty"><b>Add a subject first.</b>You need at least one subject before logging papers.</div>
      <button class="btn btn-primary" data-act="add-subject" style="margin-top:14px">${icon('plus')} Add a subject</button>`;
  }

  let subject = subjectById(state.paperSubjectId) || state.data.subjects[0];
  state.paperSubjectId = subject.id;

  const papers = papersFor(subject);
  const logs = papersOf(subject.id);
  const byCell = new Map(logs.map((p) => [`${p.year}-${p.paper}`, p]));
  const avg = subjectPct(subject.id);
  const best = logs.reduce((a, p) => Math.max(a, p.estimatedLevel || 0), 0);
  const pred = subjectPrediction(subject);
  const completion = Math.round((logs.length / (YEARS.length * papers.length)) * 100);

  const errors = state.data.errors.filter((e) => state.errorSubject === 'all' || e.subjectId === state.errorSubject);

  return `
    ${topbar(
      'Past paper matrix',
      'Papers · 2012–2026',
      `<button class="btn btn-quiet" data-act="add-subject">${icon('plus')}<span>Subject</span></button>
       <button class="btn btn-primary" data-act="log-paper" data-subject="${subject.id}">${icon('plus')}<span>Log attempt</span></button>`
    )}

    <div class="stat-row">
      <div class="stat"><div class="k">Attempts logged</div><div class="v">${logs.length} <small>/ ${YEARS.length * papers.length}</small></div></div>
      <div class="stat"><div class="k">Matrix filled</div><div class="v">${completion}%</div></div>
      <div class="stat"><div class="k">Average</div><div class="v">${avg === null ? '—' : pct(avg)}</div></div>
      <div class="stat"><div class="k">Predicted</div><div class="v">${pred.level ? lvlLabel(pred.level) : '—'} <small>→ ${lvlLabel(subject.targetLevel)}</small></div></div>
    </div>

    <section class="card">
      <div class="card-head" style="align-items:flex-start">
        <div>
          <h2>${esc(subject.name)}${subject.code ? ` <span class="muted" style="font-size:.8rem">${esc(subject.code)}</span>` : ''}</h2>
          <div class="card-note">Tap a cell to log or edit that paper. Best level so far: ${best ? lvlLabel(best) : '—'}.</div>
        </div>
        <span class="spacer"></span>
        <button class="btn btn-ghost btn-sm" data-act="edit-subject" data-id="${subject.id}">${icon('edit')} Target</button>
      </div>

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
            ${YEARS.map((year) => {
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
                    const label = log.estimatedLevel ? lvlLabel(log.estimatedLevel) : Number.isFinite(p) ? String(Math.round(p)) : '•';
                    return `<td><button class="cell ${fill}" data-act="log-paper" data-subject="${subject.id}"
                      data-year="${year}" data-paper="${paper}"
                      aria-label="${year} ${paper}, ${Number.isFinite(p) ? pct(p) : 'no percentage'}, level ${lvlLabel(log.estimatedLevel)}"
                      title="${year} ${paper}: ${Number.isFinite(p) ? pct(p) : 'no %'} · Level ${lvlLabel(log.estimatedLevel)}">${label}</button></td>`;
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
        <span class="muted">Cell shows DSE level when set, otherwise percentage.</span>
      </div>
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
                <thead><tr><th>Paper</th><th>Score</th><th>%</th><th>Level</th><th></th></tr></thead>
                <tbody>
                  ${[...logs]
                    .sort((a, b) => b.year - a.year || a.paper.localeCompare(b.paper))
                    .slice(0, 12)
                    .map(
                      (p) => `<tr>
                        <td><b>${esc(p.year)}</b> ${esc(p.paper)}</td>
                        <td class="num">${p.score !== null && p.maxScore ? `${p.score}/${p.maxScore}` : '—'}</td>
                        <td class="num">${Number.isFinite(p.percentage) ? pct(p.percentage) : '—'}</td>
                        <td>${lvlChip(p.estimatedLevel)}</td>
                        <td style="text-align:right;white-space:nowrap">
                          <button class="icon-btn" data-act="edit-paper" data-id="${p.id}" aria-label="Edit ${p.year} ${p.paper}">${icon('edit')}</button>
                          <button class="icon-btn" data-act="delete-paper" data-id="${p.id}" aria-label="Delete ${p.year} ${p.paper}">${icon('trash')}</button>
                        </td>
                      </tr>`
                    )
                    .join('')}
                </tbody>
              </table></div>`
            : '<div class="empty"><b>Nothing logged yet.</b>Tap a matrix cell above, and the level you set will feed the prediction.</div>'
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
                const p = subjectPrediction(s);
                return `<tr>
                  <td><b>${esc(s.name)}</b> <span class="muted">${esc(s.code || '')}</span></td>
                  <td><span class="chip">${esc(s.category)}</span></td>
                  <td>${p.level ? lvlChip(p.level) : '<span class="muted">—</span>'}</td>
                  <td>${lvlChip(s.targetLevel)}</td>
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
      <p class="card-note" style="margin-top:10px">Last attempt logged ${fmtDate(state.data.papers[0]?.attemptedAt || null, { day: 'numeric', month: 'long' })}.</p>
    </section>
  `;
}
