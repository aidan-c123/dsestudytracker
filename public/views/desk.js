/* ============================================================
   Desk: countdown, today's goal, target vs predicted, next deadlines
   ============================================================ */

import {
  esc, icon, state, topbar, countdownParts, examMoment, fmtDate, fmtMinutes, pct, lvlChip,
  lvlLabel, subjectPrediction, subjectPct, minutesOnDay, dayKey, dailySeries, distribution,
  streak, rangeMinutes, fmtDue, subjectById, usesAttainment, subjectAttainment,
  attainmentChip, attainmentLabel
} from '../lib.js';

export function renderDesk() {
  const { user } = state.data;
  const c = countdownParts();
  const today = minutesOnDay(dayKey(new Date()));
  const goal = user.dailyGoalMinutes || 120;
  const pctToday = Math.min(100, Math.round((today / goal) * 100));
  const series = dailySeries(14);
  const dist = distribution(7);
  const streakDays = streak(goal);
  const weekMinutes = rangeMinutes(7);

  const openTasks = state.data.tasks
    .filter((t) => t.status !== 'done')
    .sort((a, b) => {
      const da = a.dueDate ? new Date(`${a.dueDate}T00:00:00`) : null;
      const db = b.dueDate ? new Date(`${b.dueDate}T00:00:00`) : null;
      return (da ? da.getTime() : 9e15) - (db ? db.getTime() : 9e15);
    });

  // Both kinds of paper, newest first, so a recent mock is not buried under
  // older DSE attempts.
  const recentPapers = [
    ...state.data.papers.map((p) => ({
      ...p,
      kindLabel: `${p.year} ${p.paper}`,
      sortKey: String(p.attemptedAt || '').slice(0, 10),
      isOther: false
    })),
    ...(state.data.otherPapers || []).map((p) => ({
      ...p,
      kindLabel: p.title,
      sortKey: String(p.takenOn || ''),
      isOther: true
    }))
  ]
    .sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0))
    .slice(0, 5);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = (user.name || '').trim().split(/\s+/)[0] || 'candidate';

  const circumference = 2 * Math.PI * 50;

  return `
    ${topbar(
      `${greeting}, ${firstName}.`,
      `Desk · ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}`,
      `<button class="btn btn-quiet" data-act="toggle-theme" data-theme-icon title="Switch between light and dark">${icon('moon')}<span>Theme</span></button>
       <button class="btn btn-primary" data-act="log-paper">${icon('plus')}<span>Log a paper</span></button>`
    )}

    <div class="hero">
      <section class="card count-card">
        <div class="eyebrow">HKDSE ${examMoment().getFullYear()} · written papers</div>
        <div class="count-days"><span data-count-days>${c.past ? 0 : c.days}</span><small>days</small></div>
        <div class="count-clock" role="timer" aria-label="Time until the first written paper">
          <div class="count-cell"><b data-count-h>--</b><span>hrs</span></div>
          <div class="count-cell"><b data-count-m>--</b><span>min</span></div>
          <div class="count-cell"><b data-count-s>--</b><span>sec</span></div>
        </div>
        <div class="count-meta">
          <span>First paper <b>${fmtDate(user.examDate, { day: 'numeric', month: 'short', year: 'numeric' })}</b>, 8:30am</span>
          <span>Results <b>${fmtDate(user.resultsDate, { day: 'numeric', month: 'short', year: 'numeric' })}</b></span>
        </div>
        <p class="card-note" data-count-sub style="margin-top:10px"></p>
      </section>

      <section class="card goal-card">
        <div class="row" style="justify-content:space-between;align-items:flex-start">
          <div>
            <div class="eyebrow">Today</div>
            <h2 style="margin-top:2px">Focus goal</h2>
          </div>
          <span class="chip chip-gold">${icon('flame', 'style="width:12px;height:12px"')} ${streakDays} day streak</span>
        </div>
        <div class="ring-wrap" style="margin-top:16px">
          <div class="ring-center">
            <svg class="ring" viewBox="0 0 120 120" aria-hidden="true">
              <circle class="track" cx="60" cy="60" r="50"></circle>
              <circle class="meter" cx="60" cy="60" r="50"
                stroke-dasharray="${circumference.toFixed(2)}"
                stroke-dashoffset="${(circumference * (1 - pctToday / 100)).toFixed(2)}"></circle>
            </svg>
            <div class="ring-label"><b>${pctToday}%</b><span>of goal</span></div>
          </div>
          <div class="goal-figures">
            <div class="big">${fmtMinutes(today)} <span>/ ${fmtMinutes(goal)}</span></div>
            <p class="card-note">${
              today >= goal
                ? 'Goal met. Stop while you still like the subject.'
                : `${fmtMinutes(Math.max(0, goal - today))} left to hit today's target.`
            }</p>
            <p class="card-note">${fmtMinutes(weekMinutes)} this week</p>
          </div>
        </div>
        <div class="streak" aria-label="Focus minutes over the last 14 days">
          ${series
            .map((d) => {
              const cls = d.minutes >= goal ? 'hit' : d.minutes > 0 ? 'partial' : '';
              const isToday = d.key === dayKey(new Date());
              return `<div class="streak-day ${cls} ${isToday ? 'today' : ''}" title="${d.full}: ${fmtMinutes(d.minutes)}"></div>`;
            })
            .join('')}
        </div>
        <div class="streak-legend"><span>14 days ago</span><span>today</span></div>
      </section>
    </div>

    <div class="grid cols-2" style="margin-top:16px">
      <section class="card">
        <div class="card-head">
          <h2>Target vs. predicted</h2>
          <span class="spacer"></span>
          <a class="btn btn-ghost btn-sm" href="#/papers">Papers ${icon('arrow')}</a>
        </div>
        <p class="card-note" style="margin:-6px 0 12px">Predicted is built from your logged paper levels until you set a school estimate. CSD shows Attained / Not attained instead.</p>
        <div class="ledger">
          ${
            state.data.subjects.length
              ? state.data.subjects
                  .map((s) => {
                    const csd = usesAttainment(s);
                    const pred = subjectPrediction(s);
                    const attain = subjectAttainment(s);
                    const p = subjectPct(s.id);
                    // CSD has no 1–7 scale, so it gets a two-state bar rather than a level bar.
                    if (csd) {
                      return `
                    <div class="ledger-row">
                      <div class="subj-name">
                        <span class="code">${esc(s.code || '—')}</span>
                        <b>${esc(s.name)}</b>
                      </div>
                      <div class="level-pair">
                        ${attain.value ? attainmentChip(attain.value) : '<span class="attain">—</span>'}
                        <span class="target-sep">predicted</span>
                      </div>
                      <div class="level-pair" style="justify-self:end">${
                        p === null ? '<span class="muted">no papers</span>' : `<span class="tabular">${pct(p)}</span>`
                      }</div>
                      <div class="ledger-bar" title="CSD is pass / fail: Attained or Not attained">
                        <i class="${attain.value === 'attained' ? '' : 'is-empty'}" style="width:${attain.value === 'attained' ? '100%' : attain.value === 'unattained' ? '18%' : '0'}%"></i>
                      </div>
                    </div>`;
                    }
                    return `
                    <div class="ledger-row">
                      <div class="subj-name">
                        <span class="code">${esc(s.code || '—')}</span>
                        <b>${esc(s.name)}</b>
                      </div>
                      <div class="level-pair">
                        ${pred.level ? lvlChip(pred.level) : '<span class="lvl">—</span>'}
                        <span class="arrow">→</span>
                        <span class="target-sep">target</span>
                        ${lvlChip(s.targetLevel)}
                      </div>
                      <div class="level-pair" style="justify-self:end">${
                        p === null ? '<span class="muted">no papers</span>' : `<span class="tabular">${pct(p)}</span>`
                      }</div>
                      <div class="ledger-bar" title="Target level ${lvlLabel(s.targetLevel)}">
                        <i style="width:${pred.level ? Math.min(100, (pred.level / 7) * 100) : 0}%"></i>
                        <span class="target-tick" style="left:calc(${((s.targetLevel || 4) / 7) * 100}% - 1px)"></span>
                      </div>
                    </div>`;
                  })
                  .join('')
              : '<div class="empty"><b>No subjects yet.</b>Add your electives to start tracking.</div>'
          }
        </div>
        <p class="card-note" style="margin-top:12px">The tick is your target. The fill is the evidence you have so far.</p>
      </section>

      <div class="stack">
        <section class="card">
          <div class="card-head">
            <h2>Next deadlines</h2>
            <span class="spacer"></span>
            <button class="btn btn-ghost btn-sm" data-act="new-task">${icon('plus')} Add</button>
          </div>
          ${
            openTasks.length
              ? `<div class="task-list">
                  ${openTasks
                    .slice(0, 4)
                    .map((t) => {
                      const due = fmtDue(t.dueDate);
                      const subject = subjectById(t.subjectId);
                      return `
                      <div class="task ${t.status === 'doing' ? 'doing' : ''}">
                        <button class="task-check" data-act="toggle-task" data-id="${t.id}"
                          aria-checked="${t.status === 'doing' ? 'doing' : 'false'}"
                          aria-label="Mark ${esc(t.title)} as in progress">${icon(t.status === 'doing' ? 'clock' : 'check')}</button>
                        <div class="task-body">
                          <div class="task-title">${esc(t.title)}</div>
                          <div class="task-meta">
                            ${subject ? `<span class="chip chip-ghost">${esc(subject.code || subject.name)}</span>` : ''}
                            <span class="${due.cls}">${due.text}</span>
                            ${t.kind === 'sba' ? '<span class="chip chip-gold">SBA</span>' : ''}
                          </div>
                        </div>
                      </div>`;
                    })
                    .join('')}
                </div>`
              : '<div class="empty"><b>Nothing due.</b>Add SBA milestones, mock dates or revision blocks.</div>'
          }
        </section>

        <section class="card">
          <div class="card-head">
            <h2>Focus split · 7 days</h2>
            <span class="spacer"></span>
            <span class="chip">${fmtMinutes(dist.total)}</span>
          </div>
          ${
            dist.total
              ? `<div class="dist">
                  ${dist.rows
                    .slice(0, 5)
                    .map(
                      (r) => `
                    <div class="dist-row">
                      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.subject.name)}</span>
                      <div class="dist-track"><div class="dist-fill" style="width:${Math.round(
                        (r.minutes / dist.total) * 100
                      )}%"></div></div>
                      <span class="mins">${fmtMinutes(r.minutes)}</span>
                    </div>`
                    )
                    .join('')}
                </div>`
              : '<div class="empty"><b>No focus blocks yet.</b>Start the timer and it will log itself.</div>'
          }
        </section>
      </div>
    </div>

    <div class="grid cols-2" style="margin-top:16px">
      <section class="card">
        <div class="card-head">
          <h2>Recent paper attempts</h2>
          <span class="spacer"></span>
          <a class="btn btn-ghost btn-sm" href="#/papers">Open matrix ${icon('arrow')}</a>
        </div>
        ${
          recentPapers.length
            ? `<div class="table-wrap"><table class="plain">
                <thead><tr><th>Subject</th><th>Paper</th><th>Score</th><th>Grade</th></tr></thead>
                <tbody>
                  ${recentPapers
                    .map((p) => {
                      const s = subjectById(p.subjectId);
                      return `<tr>
                        <td><b>${esc(s?.code || '—')}</b> <span class="muted">${esc(s?.name || '')}</span></td>
                        <td class="num">${esc(p.kindLabel)}${p.isOther ? ' <span class="chip chip-ghost">other</span>' : ''}</td>
                        <td class="num">${Number.isFinite(p.percentage) ? pct(p.percentage) : '—'}</td>
                        <td>${usesAttainment(s) ? attainmentChip(p.attainment) : lvlChip(p.estimatedLevel)}</td>
                      </tr>`;
                    })
                    .join('')}
                </tbody>
              </table></div>`
            : '<div class="empty"><b>No papers logged.</b>Tap a cell in the paper matrix to record your first attempt.</div>'
        }
      </section>

      <section class="card">
        <div class="card-head">
          <h2>Red-ink log</h2>
          <span class="spacer"></span>
          <span class="chip">${state.data.errors.length} entries</span>
        </div>
        <p class="card-note" style="margin:-6px 0 12px">Mistakes written down, not mistakes you meant to review.</p>
        ${
          state.data.errors.length
            ? `<div>${state.data.errors
                .slice(0, 4)
                .map(
                  (e) => `
                <div class="session-item">
                  <span class="session-dot ${e.errorType === 'careless' ? 'break' : ''}"></span>
                  <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.topic)}</span>
                  <span class="when">${esc(e.errorType)}</span>
                </div>`
                )
                .join('')}</div>
              <a class="btn btn-ghost btn-sm" href="#/papers" style="margin-top:8px">Review all ${icon('arrow')}</a>`
            : '<div class="empty"><b>Nothing logged.</b>Record the questions you got wrong — the pattern matters more than the score.</div>'
        }
      </section>
    </div>

    <div class="grid cols-2" style="margin-top:16px">
      ${pacingCard(state.pacing)}
      ${diagnosticsCard(state.diagnostics)}
    </div>
  `;
}

/**
 * The pacing plan, once the server has sent one.
 *
 * `state.pacing` is only populated for a plan that includes it, so this card
 * renders from data the client could not have computed alone.
 */
function pacingCard(pacing) {
  if (!pacing) {
    return `<section class="card"><div class="card-head"><h2>Revision pacing</h2></div>
      <div class="empty"><b>Loading your plan…</b>The weeks are worked out on the server.</div></section>`;
  }
  const weeks = pacing.thisWeek || [];
  return `
    <section class="card">
      <div class="card-head">
        <h2>Revision pacing</h2>
        <span class="spacer"></span>
        <span class="chip">${pacing.weeksLeft} weeks left</span>
      </div>
      <p class="card-note" style="margin:-6px 0 12px">Built backwards from your first paper. ${pacing.totalUntouched} papers still untouched.</p>
      ${
        weeks.length
          ? `<div>${weeks
              .map(
                (w) => `<div class="session-item">
                  <span class="session-dot"></span>
                  <span style="min-width:0;flex:1">${esc(w.name)}</span>
                  <span class="when">${w.papersThisWeek}/wk</span>
                  <span class="muted" style="font-size:.74rem">${w.untouched} left</span>
                </div>`
              )
              .join('')}</div>`
          : '<div class="empty"><b>Every paper attempted.</b>Time to revisit the weakest ones.</div>'
      }
      ${pacing.tasks?.length
        ? `<div class="card-note" style="margin-top:10px">Next deadline: <b>${esc(pacing.tasks[0].title)}</b> in ${pacing.tasks[0].days} days.</div>`
        : ''}
      <div class="card-note" style="margin-top:8px">${esc(pacing.note || '')}</div>
    </section>`;
}

/**
 * Mistake diagnostics. Refuses to draw a pattern from too few entries — a
 * confident diagnosis from two lines would be worse than saying nothing.
 */
function diagnosticsCard(diag) {
  if (!diag) {
    return `<section class="card"><div class="card-head"><h2>Weak topics</h2></div>
      <div class="empty"><b>Loading…</b>Grouped from your red-ink log.</div></section>`;
  }
  const kinds = diag.byKind || [];
  const max = Math.max(1, ...kinds.map((k) => k.count));
  return `
    <section class="card">
      <div class="card-head">
        <h2>Weak topics</h2>
        <span class="spacer"></span>
        <span class="chip">${diag.total} entries</span>
      </div>
      ${
        diag.enough && kinds.length
          ? `<div>${kinds
              .map(
                (k) => `<div class="diag-row">
                  <span class="diag-label">${esc(k.kind)}</span>
                  <span class="diag-bar"><i style="width:${Math.round((k.count / max) * 100)}%"></i></span>
                  <span class="diag-count">${k.count}</span>
                </div>`
              )
              .join('')}</div>
              ${diag.bySubject?.length
                ? `<div class="card-note" style="margin-top:10px">Most in <b>${esc(diag.bySubject[0].name)}</b> (${diag.bySubject[0].count}).</div>`
                : ''}`
          : `<div class="empty"><b>Not enough yet.</b>${esc(diag.note || '')}</div>`
      }
      <div class="card-note" style="margin-top:8px">${esc(diag.note || '')}</div>
    </section>`;
}
