/* ============================================================
   SBA & tasks: milestones, revision blocks, mock dates
   ============================================================ */

import { esc, icon, state, topbar, fmtDue, fmtDate, subjectById, daysUntil } from '../lib.js';

export function renderTasks() {
  const all = state.data.tasks;
  const open = all.filter((t) => t.status !== 'done');
  const overdue = open.filter((t) => {
    const n = daysUntil(t.dueDate);
    return n !== null && n < 0;
  });
  const nextSeven = open.filter((t) => {
    const n = daysUntil(t.dueDate);
    return n !== null && n >= 0 && n <= 7;
  });
  const done = all.filter((t) => t.status === 'done');

  let list = all;
  if (state.taskFilter === 'open') list = open;
  if (state.taskFilter === 'sba') list = all.filter((t) => t.kind === 'sba');
  if (state.taskFilter === 'done') list = done;

  list = [...list].sort((a, b) => {
    if (a.status === 'done' && b.status !== 'done') return 1;
    if (b.status === 'done' && a.status !== 'done') return -1;
    const da = daysUntil(a.dueDate);
    const db = daysUntil(b.dueDate);
    return (da === null ? 9e9 : da) - (db === null ? 9e9 : db);
  });

  return `
    ${topbar(
      'SBA & tasks',
      'Deadlines · milestones and revision',
      `<button class="btn btn-primary" data-act="new-task">${icon('plus')}<span>New task</span></button>`
    )}

    <div class="stat-row">
      <div class="stat"><div class="k">Open</div><div class="v">${open.length}</div></div>
      <div class="stat"><div class="k">Overdue</div><div class="v" style="${overdue.length ? 'color:var(--warn)' : ''}">${overdue.length}</div></div>
      <div class="stat"><div class="k">Next 7 days</div><div class="v">${nextSeven.length}</div></div>
      <div class="stat"><div class="k">Completed</div><div class="v">${done.length}</div></div>
    </div>

    <div class="grid cols-2">
      <section class="card" style="grid-column:1/-1">
        <div class="card-head" style="align-items:flex-start">
          <div>
            <h2>Checklist</h2>
            <div class="card-note">SBA milestones, mock papers, revision blocks. Tick once, and it stays ticked.</div>
          </div>
          <span class="spacer"></span>
          <div class="filter-row">
            <button class="filter-pill" data-act="task-filter" data-id="open" aria-pressed="${state.taskFilter === 'open'}">Open</button>
            <button class="filter-pill" data-act="task-filter" data-id="sba" aria-pressed="${state.taskFilter === 'sba'}">SBA</button>
            <button class="filter-pill" data-act="task-filter" data-id="done" aria-pressed="${state.taskFilter === 'done'}">Done</button>
            <button class="filter-pill" data-act="task-filter" data-id="all" aria-pressed="${state.taskFilter === 'all'}">All</button>
          </div>
        </div>

        ${
          list.length
            ? `<div class="task-list">
                ${list
                  .map((t) => {
                    const due = fmtDue(t.dueDate);
                    const subject = subjectById(t.subjectId);
                    const checked = t.status === 'done' ? 'true' : t.status === 'doing' ? 'doing' : 'false';
                    return `<div class="task ${t.status === 'done' ? 'done' : ''}">
                      <button class="task-check" data-act="toggle-task" data-id="${t.id}" aria-checked="${checked}"
                        aria-label="Cycle status for ${esc(t.title)}">
                        ${t.status === 'doing' ? icon('clock') : icon('check')}
                      </button>
                      <div class="task-body">
                        <div class="task-title">${esc(t.title)}</div>
                        <div class="task-meta">
                          ${subject ? `<span class="chip chip-ghost">${esc(subject.code || subject.name)}</span>` : ''}
                          <span class="chip">${esc(t.kind)}</span>
                          ${t.weightPct !== null ? `<span class="chip chip-gold">${t.weightPct}%</span>` : ''}
                          <span class="${due.cls}">${due.text}</span>
                          ${t.notes ? `<span class="muted" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.notes)}</span>` : ''}
                        </div>
                      </div>
                      <div class="task-actions">
                        <button class="icon-btn" data-act="edit-task" data-id="${t.id}" aria-label="Edit ${esc(t.title)}">${icon('edit')}</button>
                        <button class="icon-btn" data-act="delete-task" data-id="${t.id}" aria-label="Delete ${esc(t.title)}">${icon('trash')}</button>
                      </div>
                    </div>`;
                  })
                  .join('')}
              </div>`
            : `<div class="empty"><b>Nothing here.</b>${
                state.taskFilter === 'done' ? 'No completed tasks yet.' : 'Add your SBA deadlines and revision blocks.'
              }</div>`
        }
      </section>

      <section class="card">
        <div class="card-head"><h2>This week</h2><span class="spacer"></span><span class="chip">${nextSeven.length}</span></div>
        ${
          nextSeven.length
            ? `<div>${nextSeven
                .slice(0, 6)
                .map((t) => {
                  const due = fmtDue(t.dueDate);
                  return `<div class="session-item">
                    <span class="session-dot ${t.kind === 'sba' ? 'break' : ''}"></span>
                    <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.title)}</span>
                    <span class="when">${due.text}</span>
                  </div>`;
                })
                .join('')}</div>`
            : '<div class="empty"><b>Clear week.</b>Nothing due in the next seven days.</div>'
        }
      </section>

      <section class="card">
        <div class="card-head"><h2>Overdue</h2><span class="spacer"></span><span class="chip chip-warn">${overdue.length}</span></div>
        ${
          overdue.length
            ? `<div>${overdue
                .map((t) => {
                  const due = fmtDue(t.dueDate);
                  return `<div class="session-item">
                    <span class="session-dot" style="background:var(--warn)"></span>
                    <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.title)}</span>
                    <span class="when due-soon">${due.text}</span>
                  </div>`;
                })
                .join('')}</div>`
            : '<div class="empty"><b>Nothing overdue.</b>Keep it that way.</div>'
        }
      </section>
    </div>

    <section class="card" style="margin-top:16px">
      <div class="card-head"><h2>Milestone timeline</h2><span class="spacer"></span><span class="card-note">Next 90 days</span></div>
      <div class="table-wrap">
        <table class="plain">
          <thead><tr><th>Date</th><th>Task</th><th>Subject</th><th>Kind</th><th>Status</th></tr></thead>
          <tbody>
            ${
              all.filter((t) => {
                const n = daysUntil(t.dueDate);
                return n !== null && n >= 0 && n <= 90 && t.status !== 'done';
              }).length
                ? all
                    .filter((t) => {
                      const n = daysUntil(t.dueDate);
                      return n !== null && n >= 0 && n <= 90 && t.status !== 'done';
                    })
                    .map((t) => {
                      const s = subjectById(t.subjectId);
                      return `<tr>
                        <td class="num">${fmtDate(t.dueDate, { day: 'numeric', month: 'short' })}</td>
                        <td>${esc(t.title)}</td>
                        <td>${s ? esc(s.code || s.name) : '<span class="muted">—</span>'}</td>
                        <td><span class="chip">${esc(t.kind)}</span></td>
                        <td>${t.status === 'doing' ? '<span class="chip chip-accent">in progress</span>' : '<span class="muted">to do</span>'}</td>
                      </tr>`;
                    })
                    .join('')
                : '<tr><td colspan="5"><div class="empty"><b>Nothing in the next 90 days.</b>Add SBA submission dates to see them here.</div></td></tr>'
            }
          </tbody>
        </table>
      </div>
    </section>
  `;
}
