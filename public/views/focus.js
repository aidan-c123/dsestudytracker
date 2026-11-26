/* ============================================================
   Focus: timer, 14-day bars, subject split, recent sessions
   ============================================================ */

import {
  esc, icon, state, topbar, fmtMinutes, distribution, dailySeries, minutesOnDay, dayKey,
  subjectById, fmtDate, rangeMinutes
} from '../lib.js';
import { PRESETS, BREAK_MINUTES, timerState } from '../timer.js';

export function renderFocus() {
  const t = timerState();
  const goal = state.data.user.dailyGoalMinutes || 120;
  const series = dailySeries(14);
  const maxMinutes = Math.max(goal, ...series.map((d) => d.minutes), 30);
  const dist = distribution(7);
  const today = minutesOnDay(dayKey(new Date()));
  const week = rangeMinutes(7);
  const recent = state.data.logs.slice(0, 8);
  const circumference = 2 * Math.PI * 92;

  const subjectOptions = state.data.subjects
    .map(
      (s) => `<option value="${s.id}" ${t.subjectId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`
    )
    .join('');

  return `
    ${topbar(
      'Focus timer',
      'Focus · Pomodoro & custom blocks',
      `<button class="btn btn-quiet" data-act="manual-log">${icon('plus')}<span>Log manually</span></button>`
    )}

    <div class="hero">
      <section class="card timer-card">
        <div class="row" style="justify-content:space-between">
          <div>
            <div class="eyebrow">Session</div>
            <h2 style="margin-top:2px">${t.mode === 'break' ? 'Break' : 'Deep work'}</h2>
          </div>
          <div class="field" style="max-width:220px;width:100%">
            <label class="field-label" for="timer-subject">Tag a subject</label>
            <select id="timer-subject" data-timer-subject data-act="timer-subject" ${t.running ? 'disabled' : ''}>
              <option value="">No subject</option>
              ${subjectOptions}
            </select>
          </div>
        </div>

        <div class="dial">
          <svg viewBox="0 0 200 200" data-dial aria-hidden="true">
            <circle class="track" cx="100" cy="100" r="92"></circle>
            <circle class="meter" cx="100" cy="100" r="92" stroke-dasharray="${circumference.toFixed(2)}"
              stroke-dashoffset="${(circumference * (1 - t.progress)).toFixed(2)}"></circle>
          </svg>
          <div class="dial-inner">
            <div class="dial-time" data-timer-time>25:00</div>
            <div class="dial-phase" data-timer-phase>Ready</div>
          </div>
        </div>

        <div class="presets" role="group" aria-label="Preset lengths">
          ${PRESETS.map(
            (p) => `<button class="preset" data-act="preset" data-preset="${p.minutes}" aria-pressed="false">${p.label} min</button>`
          ).join('')}
          <button class="preset" data-act="break" data-minutes="${BREAK_MINUTES}">${BREAK_MINUTES} min break</button>
          <button class="preset" data-act="custom-minutes">Custom…</button>
        </div>

        <div class="timer-actions">
          <button class="btn btn-primary btn-lg" data-act="timer-start" data-timer-start>
            ${icon('play')} Start focus
          </button>
          <button class="btn btn-quiet btn-lg" data-act="timer-pause" data-timer-pause hidden>
            ${icon('pause')} Pause
          </button>
          <button class="btn btn-primary btn-lg" data-act="timer-resume" data-timer-resume hidden>
            ${icon('play')} Resume
          </button>
          <button class="btn btn-quiet btn-lg" data-act="timer-finish" data-timer-finish hidden>
            ${icon('check')} Finish &amp; log
          </button>
          <button class="btn btn-danger btn-lg" data-act="timer-stop" data-timer-stop hidden>
            ${icon('reset')} Clear
          </button>
        </div>

        <p class="card-note" style="text-align:center">
          Completed focus blocks are written to your account automatically. Only focus time counts toward the goal.
        </p>
      </section>

      <div class="stack">
        <section class="card">
          <div class="card-head">
            <h2>Last 14 days</h2>
            <span class="spacer"></span>
            <span class="chip">${fmtMinutes(week)} this week</span>
          </div>
          <div class="bars" role="img" aria-label="Daily focus minutes for the last 14 days">
            ${series
              .map((d) => {
                const height = Math.round((d.minutes / maxMinutes) * 100);
                const cls = d.minutes >= goal ? '' : 'low';
                const isToday = d.key === dayKey(new Date());
                return `<div class="bar-col ${isToday ? 'today' : ''}">
                  <div class="bar-track" title="${d.full}: ${fmtMinutes(d.minutes)}">
                    <div class="bar-fill ${cls}" style="height:${Math.max(d.minutes ? 4 : 0, height)}%"></div>
                  </div>
                  <div class="bar-label">${d.label}</div>
                </div>`;
              })
              .join('')}
          </div>
          <div class="row" style="justify-content:space-between;margin-top:10px">
            <span class="card-note">Goal ${fmtMinutes(goal)} per day</span>
            <span class="card-note">Today ${fmtMinutes(today)}</span>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <h2>Where the time went</h2>
            <span class="spacer"></span>
            <span class="chip">${fmtMinutes(dist.total)}</span>
          </div>
          ${
            dist.total
              ? `<div class="dist">
                  ${dist.rows
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
              : '<div class="empty"><b>No focus time in 7 days.</b>Start a 25-minute block above.</div>'
          }
        </section>
      </div>
    </div>

    <section class="card" style="margin-top:16px">
      <div class="card-head">
        <h2>Recent sessions</h2>
        <span class="spacer"></span>
        <button class="btn btn-ghost btn-sm" data-act="manual-log">${icon('plus')} Add past session</button>
      </div>
      ${
        recent.length
          ? `<div>
              ${recent
                .map((l) => {
                  const s = subjectById(l.subjectId);
                  return `<div class="session-item">
                    <span class="session-dot ${l.mode === 'break' ? 'break' : ''}"></span>
                    <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                      ${esc(s?.name || 'Untagged')}${l.label ? ` <span class="muted">· ${esc(l.label)}</span>` : ''}
                    </span>
                    <span class="when">${fmtMinutes(l.minutes)} · ${fmtDate(l.completedAt, {
                      day: 'numeric',
                      month: 'short'
                    })}</span>
                  </div>`;
                })
                .join('')}
            </div>`
          : '<div class="empty"><b>No sessions yet.</b>Your first completed block will appear here.</div>'
      }
    </section>
  `;
}
