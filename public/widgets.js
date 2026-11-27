/**
 * Home-screen widget data.
 *
 * Android can only draw a widget from a handful of numbers it already holds:
 * a widget is not a web page, it cannot call the API and it must not hold the
 * database credentials. So the page — which already has the data — hands the
 * shell a small JSON snapshot, and the shell stores it privately and draws the
 * widgets from that.
 *
 * The consequence worth knowing: a widget is as fresh as the last time the app
 * was open. Every snapshot carries `savedAt`, and the widgets print it, so a
 * stale figure reads as stale instead of looking live.
 *
 * Nothing here runs in a browser: without the Android bridge the file is inert.
 */

import {
  state, countdownParts, minutesOnDay, dayKey, streak, rangeMinutes, fmtMinutes, fmtDate, daysUntil,
  examMoment, effectiveTheme
} from './lib.js';

const bridge = typeof window !== 'undefined' ? window.StarShooterAndroid : undefined;

export const hasWidgets = Boolean(bridge && typeof bridge.widgetData === 'function');

/* ------------------------------- the snapshot ------------------------------ */

function nextTask() {
  const open = (state.data?.tasks || [])
    .filter((t) => t.status !== 'done')
    .sort((a, b) => {
      const da = a.dueDate ? new Date(`${a.dueDate}T00:00:00`) : null;
      const db = b.dueDate ? new Date(`${b.dueDate}T00:00:00`) : null;
      return (da ? da.getTime() : 9e15) - (db ? db.getTime() : 9e15);
    });
  return open[0] || null;
}

/**
 * Everything the four widgets draw, in one object.
 *
 * Deliberately small: no marks, no levels, no email. A widget sits on a lock
 * screen and on the home screen for anyone standing next to the phone to read,
 * so it carries counts and dates, not a student's results. The one exception
 * is the red-ink topic, because a reminder of the mistake you are fixing is the
 * entire point of that widget.
 */
export function snapshot() {
  if (!state.data) {
    return { v: 1, signedIn: false, savedAt: new Date().toISOString() };
  }

  const { user } = state.data;
  const c = countdownParts();
  const today = minutesOnDay(dayKey(new Date()));
  const goal = user.dailyGoalMinutes || 120;
  const task = nextTask();
  const openTasks = state.data.tasks.filter((t) => t.status !== 'done');
  const overdue = openTasks.filter(
    (t) => t.dueDate && new Date(`${t.dueDate}T00:00:00`) < new Date(new Date().setHours(0, 0, 0, 0))
  ).length;

  const errors = state.data.errors || [];

  return {
    v: 1,
    signedIn: true,
    savedAt: new Date().toISOString(),
    name: user.name || '',
    // The theme actually on screen, not the stored preference: "system" is
    // resolved through the device here, because a widget has to paint in the
    // colours the student is looking at, and it cannot consult CSS.
    theme: effectiveTheme(user.theme || 'system'),
    exam: {
      date: user.examDate || '2027-04-06',
      label: fmtDate(user.examDate || '2027-04-06', { day: 'numeric', month: 'short', year: 'numeric' }),
      // Epoch millis, already resolved in HKT by the page. A widget that
      // re-derived 08:30 +08:00 from a bare date string would be a day out for
      // any student whose phone sits in another timezone.
      at: examMoment().getTime(),
      days: c.days,
      hours: c.hours,
      past: c.past
    },
    results: {
      date: user.resultsDate || '2027-07-14',
      label: fmtDate(user.resultsDate || '2027-07-14', { day: 'numeric', month: 'short', year: 'numeric' }),
      at: new Date(`${user.resultsDate || '2027-07-14'}T08:30:00+08:00`).getTime(),
      days: Math.max(0, daysUntil(user.resultsDate || '2027-07-14'))
    },
    focus: {
      today,
      goal,
      todayLabel: fmtMinutes(today),
      goalLabel: fmtMinutes(goal),
      pct: Math.min(100, Math.round((today / goal) * 100)),
      streak: streak(goal),
      week: rangeMinutes(7),
      running: runningFocus()
    },
    tasks: {
      open: openTasks.length,
      overdue,
      next: task
        ? {
            title: String(task.title || '').slice(0, 60),
            due: task.dueDate || '',
            days: task.dueDate ? Math.max(0, daysUntil(task.dueDate)) : null
          }
        : null
    },
    redInk: {
      count: errors.length,
      latest: errors.slice(0, 3).map((e) => ({
        topic: String(e.topic || '').slice(0, 60),
        type: String(e.errorType || '')
      }))
    }
  };
}

/**
 * The running block, read from the timer's own localStorage record so the
 * widget and the dial can never disagree. Only the end time is sent; the shell
 * formats it, because the widget must be able to redraw after midnight without
 * the page.
 */
function runningFocus() {
  try {
    const t = JSON.parse(localStorage.getItem('dse_focus_timer') || 'null');
    if (!t || !t.endsAt) return null;
    return {
      endsAt: t.endsAt,
      mode: t.mode === 'break' ? 'break' : 'focus',
      paused: Boolean(t.paused),
      minutes: Math.round((t.duration || 0) / 60)
    };
  } catch {
    return null;
  }
}

/* --------------------------------- pushing -------------------------------- */

let last = '';
let queued = null;

/**
 * Hand the snapshot to the shell. Called after every render, so logging a
 * paper or finishing a block updates the widgets immediately instead of at the
 * next app launch. Debounced, and skipped when nothing changed — the countdown
 * ticks once a second and must not cross the bridge that often.
 */
export function pushWidgets() {
  if (!hasWidgets) return;
  if (queued) clearTimeout(queued);
  queued = setTimeout(() => {
    queued = null;
    let json;
    try {
      json = JSON.stringify(snapshot());
    } catch {
      return;
    }
    if (json === last) return;
    last = json;
    try {
      bridge.widgetData(json);
    } catch {
      /* an older shell without the method */
    }
  }, 300);
}

/** After sign-out, blank the widgets rather than leave old counts on screen. */
export function clearWidgets() {
  last = '';
  pushWidgets();
}

/**
 * The theme changed. Force a push even if every figure is identical, because
 * the snapshot's `theme` is what the shell paints the cards from — and the
 * dedupe in `pushWidgets` compares the whole JSON, so it would otherwise skip
 * a toggle that changed nothing but the colours.
 */
export function pushWidgetsNow() {
  last = '';
  pushWidgets();
}
